import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { ChatsPage, type ChatConversationSummary, type ChatDetailMessage } from './ChatsPage';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderElement(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(element);
    });

    return { container, root };
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    URL.createObjectURL = vi.fn(() => 'blob:chat-preview');
    URL.revokeObjectURL = vi.fn();
});

afterEach(async () => {
    window.localStorage.clear();
    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted = [];
});

function buildConversation(overrides: Partial<ChatConversationSummary> = {}): ChatConversationSummary {
    return {
        id: 'peer-1',
        peerPubkey: 'a'.repeat(64),
        title: 'Alice',
        lastMessagePreview: 'Hola',
        lastMessageAt: 100,
        hasUnread: false,
        ...overrides,
    };
}

function buildMessage(overrides: Partial<ChatDetailMessage> = {}): ChatDetailMessage {
    return {
        id: 'm-1',
        direction: 'incoming',
        plaintext: 'hola',
        createdAt: 100,
        deliveryState: 'sent',
        ...overrides,
    };
}

function setViewportWidth(width: number): void {
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: width,
    });

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('max-width') ? width <= 767 : width >= 768,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }));
}

describe('ChatsPage', () => {
    test('query surface exposes data-chat-source marker', async () => {
        const rendered = await renderElement(
            <ChatsPage
                hasUnreadGlobal={false}
                conversations={[buildConversation()]}
                messages={[buildMessage()]}
                activeConversationId="peer-1"
                onOpenConversation={() => {}}
                onSendMessage={async () => {}}
            />
        );
        mounted.push(rendered);

        const querySurface = rendered.container.querySelector('[data-chat-source="query"]');
        expect(querySurface).not.toBeNull();
    });

    test('renders shared unread indicator and empty state', async () => {
        const rendered = await renderElement(
            <ChatsPage
                hasUnreadGlobal
                conversations={[]}
                messages={[]}
                activeConversationId={null}
                onOpenConversation={() => {}}
                onSendMessage={async () => {}}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('[data-slot="overlay-page-header"]')).not.toBeNull();
        expect(rendered.container.querySelector('.nostr-chat-unread-dot')).not.toBeNull();
        expect(rendered.container.querySelector('[data-slot="overlay-unread-indicator"]')).not.toBeNull();
        expect(rendered.container.textContent || '').toContain('Sin conversaciones');
        expect(rendered.container.querySelector('.nostr-chat-empty-state')).not.toBeNull();
    });

    test('shows full-page shadcn empty loading state while bootstrapping conversations', async () => {
        const rendered = await renderElement(
            <ChatsPage
                hasUnreadGlobal={false}
                isLoadingConversations
                conversations={[]}
                messages={[]}
                activeConversationId={null}
                onOpenConversation={() => {}}
                onSendMessage={async () => {}}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Cargando conversaciones');

        const loadingEmpty = rendered.container.querySelector('.nostr-chats-loading-empty[data-slot="empty"]') as HTMLElement;
        expect(loadingEmpty).toBeDefined();

        const spinner = loadingEmpty.querySelector('[aria-label="Loading"]');
        expect(spinner).not.toBeNull();

        expect(rendered.container.querySelector('.nostr-chat-layout')).toBeNull();
        expect(rendered.container.querySelector('.nostr-chat-list-panel')).toBeNull();
        expect(rendered.container.querySelector('.nostr-chat-detail-panel')).toBeNull();
    });

    test('supports list/detail navigation', async () => {
        const onOpenConversation = vi.fn();

        const rendered = await renderElement(
            <ChatsPage
                hasUnreadGlobal={false}
                conversations={[buildConversation()]}
                messages={[buildMessage()]}
                activeConversationId={null}
                onOpenConversation={onOpenConversation}
                onSendMessage={async () => {}}
            />
        );
        mounted.push(rendered);

        const conversationButton = rendered.container.querySelector('button[data-chat-conversation="peer-1"]') as HTMLButtonElement;
        expect(conversationButton).toBeDefined();

        await act(async () => {
            conversationButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onOpenConversation).toHaveBeenCalledWith('peer-1');
    });

    test('renders avatar and latest message preview in list rows without contextual menu', async () => {
        const rendered = await renderElement(
            <ChatsPage
                hasUnreadGlobal={false}
                conversations={[
                    buildConversation({
                        profile: {
                            pubkey: 'a'.repeat(64),
                            displayName: 'Alice',
                            picture: 'https://example.com/alice.png',
                        },
                    }),
                ]}
                messages={[buildMessage()]}
                activeConversationId={null}
                onOpenConversation={() => {}}
                onSendMessage={async () => {}}
            />
        );
        mounted.push(rendered);

        const rowButton = rendered.container.querySelector('button[data-chat-conversation="peer-1"]') as HTMLButtonElement;
        expect(rowButton).not.toBeNull();

        const avatarFallback = rowButton.querySelector('[data-slot="avatar-fallback"]') as HTMLElement;
        const avatar = rowButton.querySelector('[data-slot="avatar"]') as HTMLElement;
        const preview = rowButton.querySelector('.nostr-chat-conversation-preview') as HTMLElement;
        const list = rendered.container.querySelector('.nostr-chat-conversation-list') as HTMLElement;
        const item = rendered.container.querySelector('.nostr-chat-conversation-item') as HTMLElement;
        expect(avatarFallback).not.toBeNull();
        expect(avatar.getAttribute('data-size')).toBe('lg');
        expect(avatarFallback.textContent || '').toContain('AL');
        expect(rendered.container.textContent || '').toContain('Hola');
        expect(rendered.container.querySelector('button[aria-label="Abrir acciones para Alice"]')).toBeNull();
        expect(preview.classList.contains('truncate')).toBe(true);
        expect(list.classList.contains('content-start')).toBe(true);
        expect(list.classList.contains('min-w-0')).toBe(true);
        expect(item.classList.contains('w-full')).toBe(true);
        expect(item.classList.contains('min-w-0')).toBe(true);
    });

    test('renders verified badge inside large avatar for verified conversations', async () => {
        const rendered = await renderElement(
            <ChatsPage
                hasUnreadGlobal={false}
                conversations={[
                    buildConversation({
                        profile: {
                            pubkey: 'a'.repeat(64),
                            displayName: 'Alice',
                            nip05: '_@example.com',
                        },
                        verification: {
                            status: 'verified',
                            identifier: '_@example.com',
                            displayIdentifier: 'example.com',
                            checkedAt: Date.now(),
                        },
                    }),
                ]}
                messages={[buildMessage()]}
                activeConversationId={null}
                onOpenConversation={() => {}}
                onSendMessage={async () => {}}
            />
        );
        mounted.push(rendered);

        const rowButton = rendered.container.querySelector('button[data-chat-conversation="peer-1"]') as HTMLButtonElement;
        const avatar = rowButton.querySelector('[data-slot="avatar"]') as HTMLElement;
        expect(avatar).toBeDefined();
        expect(avatar.getAttribute('data-size')).toBe('lg');

        const verifiedBadge = rowButton.querySelector('[data-slot="avatar-badge"][aria-label="NIP-05 verificado por DNS: example.com"]') as HTMLElement;
        expect(verifiedBadge).toBeDefined();
        expect(verifiedBadge.className).toContain('bg-green-600');
        expect(verifiedBadge.querySelector('.lucide-circle-check')).toBeDefined();
        expect(rowButton.querySelector('.nostr-nip05-status-icon')).toBeNull();
    });

    test('shows warning avatar badge for non-verified nip05 conversations', async () => {
        const rendered = await renderElement(
            <ChatsPage
                hasUnreadGlobal={false}
                conversations={[
                    buildConversation({
                        profile: {
                            pubkey: 'a'.repeat(64),
                            displayName: 'Alice',
                            nip05: '_@example.com',
                        },
                    }),
                ]}
                messages={[buildMessage()]}
                activeConversationId={null}
                onOpenConversation={() => {}}
                onSendMessage={async () => {}}
            />
        );
        mounted.push(rendered);

        const rowButton = rendered.container.querySelector('button[data-chat-conversation="peer-1"]') as HTMLButtonElement;
        expect(rowButton.querySelector('.nostr-nip05-status-icon')).toBeNull();
        const warningBadge = rowButton.querySelector('[data-slot="avatar-badge"][aria-label="NIP-05 pendiente de verificación DNS: example.com"]') as HTMLElement;
        expect(warningBadge).toBeDefined();
        expect(warningBadge.querySelector('.lucide-triangle-alert')).toBeDefined();
    });

    test('shows undecryptable placeholder in detail view', async () => {
        const rendered = await renderElement(
            <ChatsPage
                hasUnreadGlobal={false}
                conversations={[buildConversation()]}
                messages={[buildMessage({ isUndecryptable: true, plaintext: '' })]}
                activeConversationId="peer-1"
                onOpenConversation={() => {}}
                onSendMessage={async () => {}}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('No se pudo desencriptar este mensaje');
    });

    test('renders routed page container for wide chat layout', async () => {
        setViewportWidth(1024);

        const rendered = await renderElement(
            <ChatsPage
                hasUnreadGlobal={false}
                conversations={[buildConversation()]}
                messages={[buildMessage()]}
                activeConversationId="peer-1"
                onOpenConversation={() => {}}
                onSendMessage={async () => {}}
            />
        );
        mounted.push(rendered);

        const pageContent = rendered.container.querySelector('.nostr-chats-page');
        const layout = rendered.container.querySelector('.nostr-chat-layout');
        const listPanel = rendered.container.querySelector('.nostr-chat-list-panel[data-slot="card"]');
        const detailPanel = rendered.container.querySelector('.nostr-chat-detail-panel[data-slot="card"]');
        expect(pageContent).not.toBeNull();
        expect(listPanel).not.toBeNull();
        expect(detailPanel).not.toBeNull();
        expect(layout?.className).toContain('nostr-chat-layout');
        expect(pageContent?.className).toContain('h-full');
        expect(listPanel?.className).toContain('h-full');
        expect(listPanel?.className).toContain('shadow-none');
        expect(detailPanel?.className).toContain('h-full');
        expect(detailPanel?.className).toContain('shadow-none');
        expect(rendered.container.querySelector('[data-slot="dialog-content"]')).toBeNull();
    });

    test('renders only the conversation list on mobile before a chat is selected', async () => {
        setViewportWidth(390);

        const rendered = await renderElement(
            <ChatsPage
                hasUnreadGlobal={false}
                conversations={[buildConversation()]}
                messages={[]}
                activeConversationId={null}
                onOpenConversation={() => {}}
                onSendMessage={async () => {}}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('.nostr-chat-list-panel')).not.toBeNull();
        expect(rendered.container.querySelector('.nostr-chat-detail-panel')).toBeNull();
        expect(rendered.container.querySelector('.nostr-chat-empty-state')).toBeNull();
        expect(rendered.container.querySelector('.nostr-chat-layout')?.className).toContain('nostr-chat-layout-mobile-list');
    });

    test('renders only the active conversation as a dedicated mobile page', async () => {
        setViewportWidth(390);

        const rendered = await renderElement(
            <ChatsPage
                hasUnreadGlobal={false}
                conversations={[buildConversation()]}
                messages={[buildMessage()]}
                activeConversationId="peer-1"
                onOpenConversation={() => {}}
                onSendMessage={async () => {}}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('.nostr-chat-list-panel')).toBeNull();
        expect(rendered.container.querySelector('.nostr-chat-detail-panel')).not.toBeNull();
        expect(rendered.container.querySelector('.nostr-chat-detail-title')).toBeNull();
        expect(rendered.container.querySelector('.nostr-chat-layout')?.className).toContain('nostr-chat-layout-mobile-detail');
        expect(rendered.container.textContent || '').toContain('Alice');
        expect(rendered.container.textContent || '').toContain('hola');
        expect(rendered.container.querySelector('[data-slot="dialog-content"]')).toBeNull();
    });

    test('renders compact messages with sender labels, timestamps, and outgoing delivery states', async () => {
        const expectedIncomingTimestamp = new Intl.DateTimeFormat('es-ES', {
            dateStyle: 'short',
            timeStyle: 'short',
        }).format(new Date(100 * 1000));
        const expectedOutgoingTimestamp = new Intl.DateTimeFormat('es-ES', {
            dateStyle: 'short',
            timeStyle: 'short',
        }).format(new Date(120 * 1000));

        const rendered = await renderElement(
            <ChatsPage
                hasUnreadGlobal={false}
                conversations={[buildConversation()]}
                messages={[
                    buildMessage({ id: 'm-incoming', direction: 'incoming', deliveryState: 'sent', plaintext: 'hola', createdAt: 100 }),
                    buildMessage({ id: 'm-pending', direction: 'outgoing', deliveryState: 'pending', plaintext: 'uno', createdAt: 120 }),
                    buildMessage({ id: 'm-sent', direction: 'outgoing', deliveryState: 'sent', plaintext: 'dos' }),
                    buildMessage({ id: 'm-failed', direction: 'outgoing', deliveryState: 'failed', plaintext: 'tres' }),
                ]}
                activeConversationId="peer-1"
                onOpenConversation={() => {}}
                onSendMessage={async () => {}}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').not.toContain('Volver');
        expect(rendered.container.textContent || '').toContain('Alice');
        expect(rendered.container.textContent || '').toContain('Yo');
        expect(rendered.container.textContent || '').toContain(expectedIncomingTimestamp);
        expect(rendered.container.textContent || '').toContain(expectedOutgoingTimestamp);
        expect(rendered.container.textContent || '').toContain('Enviando...');
        expect(rendered.container.textContent || '').toContain('Enviado');
        expect(rendered.container.textContent || '').toContain('Error de entrega');
    });

    test('uploads a selected image before sending a chat message', async () => {
        const onUploadImage = vi.fn(async (_file: File) => ({
            url: 'https://cdn.example/chat.png',
            tags: [['imeta', 'url https://cdn.example/chat.png', 'm image/png']],
        }));
        const onSendMessage = vi.fn(async (_plaintext: string) => {});
        const rendered = await renderElement(
            <ChatsPage
                hasUnreadGlobal={false}
                conversations={[buildConversation()]}
                messages={[]}
                activeConversationId="peer-1"
                onOpenConversation={() => {}}
                onSendMessage={onSendMessage}
                {...({ onUploadImage } as { onUploadImage: typeof onUploadImage })}
            />
        );
        mounted.push(rendered);

        const input = rendered.container.querySelector('input[type="file"]') as HTMLInputElement | null;
        expect(input?.getAttribute('accept')).toBe('image/jpeg,image/png,image/webp,image/avif');

        const image = new File([PNG_BYTES], 'chat.png', { type: 'image/png' });
        await act(async () => {
            Object.defineProperty(input, 'files', {
                configurable: true,
                value: [image],
            });
            input?.dispatchEvent(new Event('change', { bubbles: true }));
        });

        expect(rendered.container.querySelector('img[src="blob:chat-preview"]')).not.toBeNull();

        const textarea = rendered.container.querySelector('textarea') as HTMLTextAreaElement;
        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
            valueSetter?.call(textarea, 'Look');
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            rendered.container.querySelector('button.nostr-chat-send')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onUploadImage).toHaveBeenCalledWith(image);
        expect(onSendMessage).toHaveBeenCalledWith('Look\nhttps://cdn.example/chat.png');
    });

    test('renders english chat copy when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement(
            <ChatsPage
                hasUnreadGlobal
                conversations={[buildConversation({ lastMessagePreview: '' })]}
                messages={[]}
                activeConversationId="peer-1"
                onOpenConversation={() => {}}
                onSendMessage={async () => {}}
            />
        );
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).toContain('Chats');
        expect(text).toContain('There are unread chats');
        expect(text).toContain('No messages');
        expect(text).toContain('Send');
        const textarea = rendered.container.querySelector('textarea') as HTMLTextAreaElement | null;
        expect(textarea?.getAttribute('placeholder')).toBe('Write a message...');
    });

    test('renders english outgoing delivery state when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderElement(
            <ChatsPage
                hasUnreadGlobal={false}
                conversations={[buildConversation()]}
                messages={[buildMessage({ direction: 'outgoing', deliveryState: 'failed', plaintext: 'hello' })]}
                activeConversationId="peer-1"
                onOpenConversation={() => {}}
                onSendMessage={async () => {}}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Failed to deliver');
        expect(rendered.container.textContent || '').toContain('Me');
    });
});
