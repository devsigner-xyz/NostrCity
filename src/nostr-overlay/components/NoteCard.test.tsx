import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { nip19 } from 'nostr-tools';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { LONG_FORM_ARTICLE_KIND } from '../../nostr/articles';
import { shortId, withoutNoteActions, type NoteCardModel } from './note-card-model';
import { NoteCard } from './NoteCard';

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
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

const defaultNoteFixture: NoteCardModel = {
    id: 'note-1',
    pubkey: 'a'.repeat(64),
    createdAt: 100,
    content: 'hola',
    tags: [],
    variant: 'default',
    showCopyId: true,
    nestingLevel: 0,
    actions: {
        canWrite: true,
        isReactionActive: false,
        isRepostActive: false,
        isZapActive: false,
        isReplyActive: false,
        isReactionPending: false,
        isRepostPending: false,
        replies: 1,
        reactions: 3,
        reposts: 2,
        zapSats: 210,
        zapAmounts: [21, 128, 256],
        onReply: () => {},
        onViewDetail: () => {},
        onToggleReaction: async () => true,
        onRepost: async () => true,
        onQuote: () => {},
        onZap: async () => {},
    },
};

const deepNestedFixture: NoteCardModel = {
    id: 'abcde123000000000000000000000000000000000000000000000000fff999',
    pubkey: 'b'.repeat(64),
    createdAt: 99,
    content: 'x'.repeat(150),
    tags: [],
    variant: 'nested',
    showCopyId: true,
    nestingLevel: 2,
};

async function renderNoteCard(note: NoteCardModel = defaultNoteFixture) {
    const onCopyNoteId = vi.fn();
    const rendered = await renderElement(
        <NoteCard
            note={note}
            profilesByPubkey={{
                [defaultNoteFixture.pubkey]: {
                    pubkey: defaultNoteFixture.pubkey,
                    displayName: 'Alice',
                    lud16: 'alice@getalby.com',
                },
            }}
            onCopyNoteId={onCopyNoteId}
            onSelectEventReference={() => {}}
        />,
    );
    mounted.push(rendered);
    return { container: rendered.container, onCopyNoteId };
}

function createNestedNote(input: Partial<NoteCardModel> & { id: string }): NoteCardModel {
    const note: NoteCardModel = {
        id: input.id,
        pubkey: input.pubkey ?? 'c'.repeat(64),
        createdAt: input.createdAt ?? 200,
        content: input.content ?? `contenido ${input.id}`,
        tags: input.tags ?? [],
        variant: input.variant ?? 'nested',
        showCopyId: input.showCopyId ?? true,
        nestingLevel: input.nestingLevel ?? 1,
    };

    if (input.kindLabel !== undefined) {
        note.kindLabel = input.kindLabel;
    }
    if (input.actions !== undefined) {
        note.actions = input.actions;
    }
    if (input.embedded !== undefined) {
        note.embedded = input.embedded;
    }
    if (input.referencedNotes !== undefined) {
        note.referencedNotes = input.referencedNotes;
    }

    return note;
}

describe('NoteCard', () => {
    async function renderDefault() {
        return await renderNoteCard(defaultNoteFixture);
    }

    async function renderDeep() {
        return await renderNoteCard(deepNestedFixture);
    }

    test('renders author header with published date below the author name and actions via button group', async () => {
        const { container } = await renderDefault();
        const headerDescription = container.querySelector('[data-slot="item-description"]');
        const card = container.querySelector('[data-slot="card"]');

        expect(container.querySelector('article')).not.toBeNull();
        expect(card?.className).toContain('border');
        expect(card?.className).toContain('border-border/70');
        expect(headerDescription?.querySelector('time[datetime]')).not.toBeNull();
        expect(container.querySelector('[data-slot="item-actions"]')).toBeNull();
        expect(container.textContent || '').not.toContain(shortId(defaultNoteFixture.id));
        expect(container.querySelector('[data-slot="item-title"]')?.textContent || '').toContain('Alice');
        expect(container.querySelector('button[aria-label="Responder (1)"]')).not.toBeNull();
        expect(container.querySelector('button[aria-label="Reaccionar (3)"]')).not.toBeNull();
        expect(container.querySelector('button[aria-label="Repostear (2)"]')).not.toBeNull();
        expect(container.querySelector('button[aria-label="Sats recibidos: 210"]')).not.toBeNull();
        expect(container.querySelector('button[aria-label="Abrir acciones para la nota note-1"]')).not.toBeNull();
        expect(container.querySelector('button[aria-label="Copiar identificador de nota note-1"]')).toBeNull();
    });

    test('opens emoji selector before reacting and sends selected emoji', async () => {
        const onToggleReaction = vi.fn(async () => true);
        const onSelectReactionEmoji = vi.fn(async () => true);
        const { container } = await renderNoteCard({
            ...defaultNoteFixture,
            actions: {
                ...defaultNoteFixture.actions!,
                onToggleReaction,
                onSelectReactionEmoji,
            } as any,
        });

        const reactionButton = container.querySelector('button[aria-label="Reaccionar (3)"]') as HTMLButtonElement;
        expect(reactionButton).not.toBeNull();

        await act(async () => {
            reactionButton.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
            reactionButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const fireReaction = Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).find((item) =>
            item.getAttribute('aria-label') === 'Reaccionar con 🔥'
        ) as HTMLElement;
        expect(fireReaction).toBeDefined();

        await act(async () => {
            fireReaction.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onSelectReactionEmoji).toHaveBeenCalledWith('🔥');
        expect(onToggleReaction).not.toHaveBeenCalled();
    });

    test('shows active reaction emoji and removes reaction directly on click', async () => {
        const onToggleReaction = vi.fn(async () => true);
        const { container } = await renderNoteCard({
            ...defaultNoteFixture,
            actions: {
                ...defaultNoteFixture.actions!,
                isReactionActive: true,
                reactionEmoji: '👏',
                onToggleReaction,
                onSelectReactionEmoji: vi.fn(async () => true),
            } as any,
        });

        const reactionButton = Array.from(container.querySelectorAll('button')).find((button) =>
            button.getAttribute('aria-label') === 'Quitar reacción 👏 (3)'
        ) as HTMLButtonElement | undefined;
        expect(reactionButton).toBeDefined();
        expect(reactionButton?.textContent || '').toContain('👏');
        expect(reactionButton?.getAttribute('data-variant')).toBe('ghost');

        await act(async () => {
            reactionButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onToggleReaction).toHaveBeenCalledTimes(1);
        expect(document.body.querySelector('[data-slot="dropdown-menu-item"]')).toBeNull();
    });

    test('disables write actions when rendering as read-only npub session', async () => {
        const { container } = await renderNoteCard({
            ...defaultNoteFixture,
            actions: {
                ...defaultNoteFixture.actions!,
                canWrite: false,
            },
        });

        const reactionButton = container.querySelector('button[aria-label="Reaccionar (3)"]') as HTMLButtonElement | null;
        const repostButton = container.querySelector('button[aria-label="Repostear (2)"]') as HTMLButtonElement | null;
        const zapButton = container.querySelector('button[aria-label="Sats recibidos: 210"]') as HTMLButtonElement | null;

        expect(reactionButton?.disabled).toBe(true);
        expect(repostButton?.disabled).toBe(true);
        expect(zapButton?.disabled).toBe(true);
    });

    test('shows active zap with lightning emoji without default button background', async () => {
        const { container } = await renderNoteCard({
            ...defaultNoteFixture,
            actions: {
                ...defaultNoteFixture.actions!,
                isZapActive: true,
            },
        });

        const zapButton = container.querySelector('button[aria-label="Sats recibidos: 210"]') as HTMLButtonElement | null;
        expect(zapButton).not.toBeNull();
        expect(zapButton?.textContent || '').toContain('⚡');
        expect(zapButton?.getAttribute('data-variant')).toBe('ghost');
    });

    test('shows active reply with comment emoji without default button background', async () => {
        const { container } = await renderNoteCard({
            ...defaultNoteFixture,
            actions: {
                ...defaultNoteFixture.actions!,
                isReplyActive: true,
            },
        });

        const replyButton = container.querySelector('button[aria-label="Responder (1)"]') as HTMLButtonElement | null;
        expect(replyButton).not.toBeNull();
        expect(replyButton?.textContent || '').toContain('💬');
        expect(replyButton?.getAttribute('data-variant')).toBe('ghost');
    });

    test('renders long-form article notes with the article preview path', async () => {
        const { container } = await renderNoteCard({
            ...withoutNoteActions(defaultNoteFixture),
            id: 'article-note',
            kindNumber: LONG_FORM_ARTICLE_KIND,
            tags: [['title', 'Article title'], ['summary', 'Article summary']],
            content: '# Article markdown body',
        });

        expect(container.textContent).toContain('Article title');
        expect(container.textContent).toContain('Article summary');
        expect(container.textContent).not.toContain('# Article markdown body');
    });

    test('continues rendering short notes through rich plaintext content', async () => {
        const { container } = await renderNoteCard({
            ...withoutNoteActions(defaultNoteFixture),
            kindNumber: 1,
            content: '# literal heading',
        });

        expect(container.querySelector('h1')).toBeNull();
        expect(container.textContent).toContain('# literal heading');
    });

    test('opens note detail on card click when view detail is available', async () => {
        const onViewDetail = vi.fn();
        const { container } = await renderNoteCard({
            ...defaultNoteFixture,
            actions: {
                ...defaultNoteFixture.actions!,
                onViewDetail,
            },
        });

        const article = container.querySelector('article') as HTMLElement;
        await act(async () => {
            article.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onViewDetail).toHaveBeenCalledTimes(1);
    });

    test('opens note detail on card click when provided by actions', async () => {
        const onViewDetail = vi.fn();
        const { container } = await renderNoteCard({
            ...defaultNoteFixture,
            actions: {
                ...defaultNoteFixture.actions!,
                onViewDetail,
            },
        });

        const article = container.querySelector('article') as HTMLElement;
        await act(async () => {
            article.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onViewDetail).toHaveBeenCalledTimes(1);
    });

    test('opens zap submenu with amounts and configure action from note action row', async () => {
        const onZap = vi.fn(async () => {});
        const onConfigureZapAmounts = vi.fn();
        const { container } = await renderNoteCard({
            ...defaultNoteFixture,
            actions: {
                ...defaultNoteFixture.actions!,
                onZap,
                onConfigureZapAmounts,
            },
        });

        const zapButton = container.querySelector('button[aria-label="Sats recibidos: 210"]') as HTMLButtonElement | null;
        expect(zapButton).not.toBeNull();

        await act(async () => {
            zapButton?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            zapButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const zap21 = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === '21 sats'
        ) as HTMLElement;
        const configureItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Configurar cantidades'
        ) as HTMLElement;

        expect(zap21).toBeDefined();
        expect(configureItem).toBeDefined();

        await act(async () => {
            zap21.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onZap).toHaveBeenCalledWith(21);

        await act(async () => {
            zapButton?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            zapButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const configureRefreshed = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Configurar cantidades'
        ) as HTMLElement;

        await act(async () => {
            configureRefreshed.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onConfigureZapAmounts).toHaveBeenCalledTimes(1);
    });

    test('renders note action menus in english when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const onZap = vi.fn(async () => {});
        const onConfigureZapAmounts = vi.fn();
        const onViewDetail = vi.fn();
        const { container } = await renderNoteCard({
            ...defaultNoteFixture,
            actions: {
                ...defaultNoteFixture.actions!,
                onZap,
                onConfigureZapAmounts,
                onViewDetail,
            },
        });

        const menuButton = container.querySelector('button[aria-label="Open actions for note note-1"]') as HTMLButtonElement;
        expect(menuButton).not.toBeNull();

        await act(async () => {
            menuButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            menuButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).some((item) =>
            (item.textContent || '').trim() === 'Copy event ID'
        )).toBe(true);
        expect(Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).some((item) =>
            (item.textContent || '').trim() === 'View detail'
        )).toBe(true);
    });

    test('opens repost submenu with repost and cita actions', async () => {
        const { container } = await renderDefault();

        const repostButton = container.querySelector('button[aria-label="Repostear (2)"]') as HTMLButtonElement | null;
        expect(repostButton).not.toBeNull();

        await act(async () => {
            repostButton?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            repostButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const repostItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Repost'
        );
        const quoteItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Cita'
        );

        expect(repostItem).toBeDefined();
        expect(quoteItem).toBeDefined();
    });

    test('does not render a duplicated quoted note when embedded and nevent target match', async () => {
        const referencedEventId = '9'.repeat(64);
        const referencedAuthorPubkey = '8'.repeat(64);
        const nevent = nip19.neventEncode({ id: referencedEventId, author: referencedAuthorPubkey });
        const quotedContent = 'nota citada sin duplicar';

        const rendered = await renderElement(
            <NoteCard
                note={{
                    ...defaultNoteFixture,
                    id: 'quote-1',
                    content: `mira esto nostr:${nevent}`,
                    embedded: createNestedNote({
                        id: referencedEventId,
                        pubkey: referencedAuthorPubkey,
                        content: quotedContent,
                    }),
                }}
                profilesByPubkey={{
                    [defaultNoteFixture.pubkey]: {
                        pubkey: defaultNoteFixture.pubkey,
                        displayName: 'Alice',
                        lud16: 'alice@getalby.com',
                    },
                    [referencedAuthorPubkey]: {
                        pubkey: referencedAuthorPubkey,
                        displayName: 'Quoted Author',
                    },
                }}
                eventReferencesById={{
                    [referencedEventId]: {
                        id: referencedEventId,
                        pubkey: referencedAuthorPubkey,
                        kind: 1,
                        created_at: 1700001000,
                        tags: [],
                        content: quotedContent,
                    },
                }}
                onCopyNoteId={vi.fn()}
                onSelectEventReference={() => {}}
            />,
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('mira esto');
        expect((rendered.container.textContent || '').match(new RegExp(quotedContent, 'g'))).toHaveLength(1);
    });

    test('removes nested action handlers from preview notes recursively', () => {
        const preview = withoutNoteActions({
            ...defaultNoteFixture,
            embedded: createNestedNote({
                id: 'embedded-1',
                ...(defaultNoteFixture.actions ? { actions: defaultNoteFixture.actions } : {}),
            }),
            referencedNotes: [
                createNestedNote({
                    id: 'reference-1',
                    ...(defaultNoteFixture.actions ? { actions: defaultNoteFixture.actions } : {}),
                }),
            ],
        });

        expect(preview.actions).toBeUndefined();
        expect(preview.embedded?.actions).toBeUndefined();
        expect(preview.referencedNotes?.[0]?.actions).toBeUndefined();
    });

    test('disables only zap action when author profile has no lightning metadata', async () => {
        const rendered = await renderElement(
            <NoteCard
                note={{
                    ...defaultNoteFixture,
                    actions: {
                        ...defaultNoteFixture.actions!,
                    },
                }}
                profilesByPubkey={{
                    [defaultNoteFixture.pubkey]: {
                        pubkey: defaultNoteFixture.pubkey,
                        displayName: 'Alice',
                    },
                }}
                onCopyNoteId={vi.fn()}
                onSelectEventReference={() => {}}
            />,
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('button[aria-label="Responder (1)"]')).not.toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Reaccionar (3)"]')).not.toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Repostear (2)"]')).not.toBeNull();
        expect((rendered.container.querySelector('button[aria-label="Sats recibidos: 210"]') as HTMLButtonElement | null)?.disabled).toBe(true);
    });

    test('nested depth >= 2 renders compact fallback with open reference button', async () => {
        const { container } = await renderDeep();

        expect(container.textContent || '').toContain('Nota referenciada');
        expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
        expect(container.querySelector('button[aria-label="Abrir nota referenciada abcde123000000000000000000000000000000000000000000000000fff999"]')).not.toBeNull();
        expect(container.textContent || '').toContain('abcde123...fff999');
        expect((container.textContent || '').includes('...')).toBe(true);
    });

    test('renders deterministic nested quota with embedded + 3 references', async () => {
        const note: NoteCardModel = {
            ...defaultNoteFixture,
            id: 'parent-with-embedded-and-refs',
            content: 'top-level',
            embedded: createNestedNote({ id: 'embedded-1', content: 'embedded visible' }),
            referencedNotes: [
                createNestedNote({ id: 'ref-1', content: 'reference visible 1' }),
                createNestedNote({ id: 'ref-2', content: 'reference visible 2' }),
                createNestedNote({ id: 'ref-3', content: 'reference hidden 3' }),
            ],
        };

        const { container } = await renderNoteCard(note);
        const text = container.textContent || '';

        expect(text).toContain('embedded visible');
        expect(text).toContain('reference visible 1');
        expect(text).toContain('reference visible 2');
        expect(text).toContain('+1 referencias adicionales');
        expect(text).not.toContain('reference hidden 3');
    });

    test('renders deterministic nested quota with 3 references and no embedded note', async () => {
        const note: NoteCardModel = {
            ...defaultNoteFixture,
            id: 'parent-with-refs-only',
            content: 'top-level',
            referencedNotes: [
                createNestedNote({ id: 'ref-only-1', content: 'reference only visible 1' }),
                createNestedNote({ id: 'ref-only-2', content: 'reference only visible 2' }),
                createNestedNote({ id: 'ref-only-3', content: 'reference only hidden 3' }),
            ],
        };

        const { container } = await renderNoteCard(note);
        const text = container.textContent || '';

        expect(text).toContain('reference only visible 1');
        expect(text).toContain('reference only visible 2');
        expect(text).toContain('+1 referencias adicionales');
        expect(text).not.toContain('reference only hidden 3');
    });

    test('depth >= 2 compact fallback consumes nested quota and keeps accessible CTA', async () => {
        const deepReferencedNote = createNestedNote({
            id: 'abcdef12aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00123456',
            content: 'y'.repeat(160),
            nestingLevel: 2,
        });
        const note: NoteCardModel = {
            ...defaultNoteFixture,
            id: 'parent-with-deep-reference',
            referencedNotes: [
                deepReferencedNote,
                createNestedNote({ id: 'ref-after-deep-1', content: 'after deep visible 1' }),
                createNestedNote({ id: 'ref-after-deep-2', content: 'after deep hidden 2' }),
            ],
        };

        const { container } = await renderNoteCard(note);
        const text = container.textContent || '';

        expect(text).toContain('Nota referenciada');
        expect(container.querySelector(`button[aria-label="Abrir nota referenciada ${deepReferencedNote.id}"]`)).not.toBeNull();
        expect(text).toContain('+1 referencias adicionales');
        expect(text).toContain('after deep visible 1');
        expect(text).not.toContain('after deep hidden 2');
    });

    test('depth >= 2 compact fallback hides open button when onSelectEventReference is undefined', async () => {
        const note: NoteCardModel = {
            ...deepNestedFixture,
            id: 'abcdef12aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00aa00123456',
            content: 'z'.repeat(200),
        };
        const onCopyNoteId = vi.fn();
        const rendered = await renderElement(
            <NoteCard
                note={note}
                profilesByPubkey={{}}
                onCopyNoteId={onCopyNoteId}
            />,
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector(`button[aria-label="Abrir nota referenciada ${note.id}"]`)).toBeNull();
    });

    test('depth >= 2 compact fallback does not show no-content placeholder for empty referenced notes', async () => {
        const note: NoteCardModel = {
            ...deepNestedFixture,
            id: 'empty-deep-reference',
            content: '   ',
        };

        const { container } = await renderNoteCard(note);

        expect(container.textContent || '').toContain('Nota referenciada');
        expect(container.textContent || '').not.toContain('(sin contenido)');
    });

    test('does not render empty fallback when note only has video media', async () => {
        const { container } = await renderNoteCard({
            ...defaultNoteFixture,
            id: 'media-only-note',
            content: 'https://example.com/demo-video.mp4',
        });

        expect(container.textContent || '').not.toContain('(sin contenido)');
        expect(container.querySelector('video.nostr-rich-media-video')).not.toBeNull();
    });

    test('wraps text and media in a stacked rich content container', async () => {
        const { container } = await renderNoteCard({
            ...defaultNoteFixture,
            id: 'text-and-media-note',
            content: 'hola https://example.com/demo-video.mp4',
        });

        const stack = container.querySelector('.nostr-rich-content-stack') as HTMLDivElement | null;
        expect(stack).not.toBeNull();
        expect(stack?.querySelector('p.nostr-rich-content-text')).not.toBeNull();
        expect(stack?.querySelector('.nostr-rich-media-grid')).not.toBeNull();
    });

    test('uses compact note header spacing with only horizontal padding', async () => {
        const { container } = await renderDefault();

        const cardHeader = container.querySelector('[data-slot="card-header"]') as HTMLDivElement | null;
        const headerItem = cardHeader?.querySelector('[data-slot="item"]') as HTMLDivElement | null;

        expect(cardHeader?.className).toContain('px-4');
        expect(cardHeader?.className).toContain('py-0');
        expect(headerItem?.className).toContain('px-0');
        expect(headerItem?.className).toContain('py-0');
    });

    test('copy id button triggers callback', async () => {
        const { container, onCopyNoteId } = await renderDefault();
        const menuButton = container.querySelector('button[aria-label="Abrir acciones para la nota note-1"]') as HTMLButtonElement;

        await act(async () => {
            menuButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            menuButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const copyItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Copiar ID de evento'
        ) as HTMLElement;

        await act(async () => {
            copyItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onCopyNoteId).toHaveBeenCalledWith('note-1');
    });

    test('note action menu exposes view detail action when available', async () => {
        const onViewDetail = vi.fn();
        const { container } = await renderNoteCard({
            ...defaultNoteFixture,
            actions: {
                ...defaultNoteFixture.actions!,
                onViewDetail,
            },
        });
        const menuButton = container.querySelector('button[aria-label="Abrir acciones para la nota note-1"]') as HTMLButtonElement;

        await act(async () => {
            menuButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            menuButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const detailItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Ver detalle'
        ) as HTMLElement;

        await act(async () => {
            detailItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onViewDetail).toHaveBeenCalledTimes(1);
    });

    test('note menu exposes view detail action when available', async () => {
        const onViewDetail = vi.fn();
        const { container } = await renderNoteCard({
            ...defaultNoteFixture,
            actions: {
                ...defaultNoteFixture.actions!,
                onViewDetail,
            },
        });
        const menuButton = container.querySelector('button[aria-label="Abrir acciones para la nota note-1"]') as HTMLButtonElement;

        await act(async () => {
            menuButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            menuButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const detailItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Ver detalle'
        ) as HTMLElement;

        await act(async () => {
            detailItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onViewDetail).toHaveBeenCalledTimes(1);
    });
});
