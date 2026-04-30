import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { UI_SETTINGS_STORAGE_KEY } from '../../nostr/ui-settings';
import { OverlaySidebar } from './OverlaySidebar';
import type { AuthSessionState } from '../../nostr/auth/session';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
    onOpenMap: ReturnType<typeof vi.fn>;
    onOpenChat: ReturnType<typeof vi.fn>;
    onOpenNotifications: ReturnType<typeof vi.fn>;
    onOpenPublish: ReturnType<typeof vi.fn>;
    onOpenWallet: ReturnType<typeof vi.fn>;
    onOpenProfileEditor: ReturnType<typeof vi.fn>;
    onMobileAppBarBack: ReturnType<typeof vi.fn<() => void>>;
}

async function renderSidebar({
    pathname = '/',
    open = true,
    resolvedTheme = 'dark',
    authSessionOverrides = {},
    canWrite = true,
    canAccessDirectMessages = true,
    canAccessSocialNotifications = true,
    canAccessFollowingFeed = true,
    mobileAppBarTitle = 'Nostr City',
    mobileAppBarShowBack = pathname !== '/',
    onMobileAppBarBack = vi.fn<() => void>(),
}: {
    pathname?: string;
    open?: boolean;
    resolvedTheme?: 'light' | 'dark';
    authSessionOverrides?: Partial<AuthSessionState>;
    canWrite?: boolean;
    canAccessDirectMessages?: boolean;
    canAccessSocialNotifications?: boolean;
    canAccessFollowingFeed?: boolean;
    mobileAppBarTitle?: string;
    mobileAppBarShowBack?: boolean;
    onMobileAppBarBack?: ReturnType<typeof vi.fn<() => void>>;
} = {}): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const authSession: AuthSessionState = {
        method: 'nip07',
        pubkey: 'f'.repeat(64),
        readonly: false,
        locked: false,
        createdAt: 1,
        capabilities: {
            canSign: true,
            canEncrypt: true,
            encryptionSchemes: ['nip44'],
        },
        ...authSessionOverrides,
    };
    const onOpenChat = vi.fn();
    const onOpenNotifications = vi.fn();
    const onOpenPublish = vi.fn();
    const onOpenWallet = vi.fn();
    const onOpenProfileEditor = vi.fn();
    const onOpenMap = vi.fn();

    await act(async () => {
        root.render(
            <MemoryRouter initialEntries={[pathname]}>
                <OverlaySidebar
                    open={open}
                    onOpenChange={vi.fn()}
                    resolvedTheme={resolvedTheme}
                    authSession={authSession}
                    ownerPubkey={'f'.repeat(64)}
                    ownerProfile={{ pubkey: 'f'.repeat(64), displayName: 'Nostr City', picture: 'https://example.com/avatar.png' }}
                    canWrite={canWrite}
                    canAccessDirectMessages={canAccessDirectMessages}
                    canAccessSocialNotifications={canAccessSocialNotifications}
                    canAccessFollowingFeed={canAccessFollowingFeed}
                    chatHasUnread
                    notificationsHasUnread
                    followingFeedHasUnread
                    onOpenMap={onOpenMap}
                    onOpenCityStats={vi.fn()}
                    onOpenChat={onOpenChat}
                    onOpenRelays={vi.fn()}
                    onOpenNotifications={onOpenNotifications}
                    onOpenFollowingFeed={vi.fn()}
                    onOpenArticles={vi.fn()}
                    onOpenGlobalSearch={vi.fn()}
                    onOpenWallet={onOpenWallet}
                    onOpenPublish={onOpenPublish}
                    onOpenSettings={vi.fn()}
                    isUiSettingsOpen={false}
                    onLogout={vi.fn()}
                    onCopyOwnerNpub={vi.fn()}
                    onLocateOwner={vi.fn()}
                    onViewOwnerDetails={vi.fn()}
                    onOpenProfileEditor={onOpenProfileEditor}
                    missionsDiscoveredCount={2}
                    missionsTotal={5}
                    relaysConnectedCount={3}
                    relaysTotal={5}
                    onOpenMissions={vi.fn()}
                    mobileAppBarTitle={mobileAppBarTitle}
                    mobileAppBarShowBack={mobileAppBarShowBack}
                    onMobileAppBarBack={onMobileAppBarBack}
                >
                    <div>Social content</div>
                </OverlaySidebar>
            </MemoryRouter>
        );
    });

    return { container, root, onOpenMap, onOpenChat, onOpenNotifications, onOpenPublish, onOpenWallet, onOpenProfileEditor, onMobileAppBarBack };
}

function setMobileViewport(): void {
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 390,
    });
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('max-width'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }));
}

async function openUserMenu(container: ParentNode): Promise<void> {
    const userMenuButton = container.querySelector('button[aria-label="Abrir menú de usuario"]') as HTMLButtonElement;
    expect(userMenuButton).toBeDefined();

    await act(async () => {
        userMenuButton.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
        userMenuButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

function readOverlayStyles(): string {
    return readFileSync(join(process.cwd(), 'src', 'nostr-overlay', 'styles.css'), 'utf8');
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

    if (!Element.prototype.scrollIntoView) {
        Element.prototype.scrollIntoView = () => {};
    }
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

describe('OverlaySidebar', () => {
    test('adds shared utility toolbar density on top of the legacy toolbar hook', async () => {
        const rendered = await renderSidebar({ pathname: '/' });
        mounted.push(rendered);

        const mapButton = Array.from(rendered.container.querySelectorAll('button')).find((button) => (button.textContent || '').includes('Mapa'));
        const toolbar = mapButton?.closest('[data-slot="sidebar-menu"]');

        expect(toolbar).not.toBeNull();
        expect(toolbar?.classList.contains('nostr-panel-toolbar')).toBe(true);
        expect(toolbar?.classList.contains('gap-1.5')).toBe(true);
    });

    test('renders unread indicators through the shared unread slot marker', async () => {
        const rendered = await renderSidebar({ pathname: '/' });
        mounted.push(rendered);

        const agoraButton = rendered.container.querySelector('button[aria-label="Abrir Ágora"]');
        const chatButton = rendered.container.querySelector('button[aria-label="Abrir chats"]');
        const notificationsButton = rendered.container.querySelector('button[aria-label="Abrir notificaciones"]');

        expect(agoraButton?.querySelector('[data-slot="overlay-unread-indicator"]')).not.toBeNull();
        expect(chatButton?.querySelector('[data-slot="overlay-unread-indicator"]')).not.toBeNull();
        expect(notificationsButton?.querySelector('[data-slot="overlay-unread-indicator"]')).not.toBeNull();
        expect(agoraButton?.getAttribute('aria-description')).toContain('sin leer');
        expect(chatButton?.getAttribute('aria-description')).toContain('sin leer');
        expect(notificationsButton?.getAttribute('aria-description')).toContain('sin leer');
    });

    test('keeps readonly state inside the shared badge primitive in the user menu', async () => {
        const rendered = await renderSidebar({ pathname: '/' });
        mounted.push(rendered);

        const readonlyBadge = Array.from(rendered.container.querySelectorAll('[data-slot="badge"]')).find((badge) =>
            (badge.textContent || '').includes('Solo lectura')
        );

        expect(readonlyBadge).not.toBeNull();
    });

    test('renders wallet top-level entry above settings', async () => {
        const rendered = await renderSidebar({ pathname: '/wallet' });
        mounted.push(rendered);

        const panelButtons = Array.from(rendered.container.querySelectorAll('.nostr-panel-toolbar > [data-slot="sidebar-menu-item"] button'));
        const labels = panelButtons.map((button) => (button.textContent || '').trim()).filter(Boolean);
        const walletIndex = labels.indexOf('Wallet');
        const settingsIndex = labels.indexOf('Ajustes');

        expect(walletIndex).toBeGreaterThanOrEqual(0);
        expect(settingsIndex).toBeGreaterThan(walletIndex);
    });

    test('renders articles immediately below Agora as a separate top-level entry', async () => {
        const rendered = await renderSidebar({ pathname: '/agora/articles' });
        mounted.push(rendered);

        const panelButtons = Array.from(rendered.container.querySelectorAll('.nostr-panel-toolbar > [data-slot="sidebar-menu-item"] button'));
        const labels = panelButtons.map((button) => button.getAttribute('aria-label') || '').filter(Boolean);

        expect(labels.slice(0, 4)).toEqual(['Abrir mapa', 'Abrir Ágora', 'Abrir artículos', 'Abrir publicar']);
        expect(rendered.container.querySelector('button[aria-label="Abrir artículos"]')).not.toBeNull();
    });

    test('renders english top-level labels when ui language is en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const rendered = await renderSidebar({ pathname: '/agora' });
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).toContain('Agora');
        expect(text).toContain('Chats');
        expect(text).toContain('Relays');
        expect(text).toContain('Visualize nostr');
    });

    test('opens the localized profile editor action from the user menu', async () => {
        const rendered = await renderSidebar({ pathname: '/' });
        mounted.push(rendered);

        await openUserMenu(rendered.container);
        const editProfileAction = Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Editar perfil'
        ) as HTMLElement;

        expect(editProfileAction).toBeDefined();

        await act(async () => {
            editProfileAction.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.onOpenProfileEditor).toHaveBeenCalledTimes(1);
    });

    test('keeps signing-required sidebar actions visible but disabled in readonly mode', async () => {
        const rendered = await renderSidebar({
            pathname: '/',
            authSessionOverrides: {
                method: 'npub',
                readonly: true,
                capabilities: {
                    canSign: false,
                    canEncrypt: false,
                    encryptionSchemes: [],
                },
            },
            canWrite: false,
            canAccessDirectMessages: false,
            canAccessSocialNotifications: false,
        });
        mounted.push(rendered);

        const readonlyReason = 'Estás en modo lectura, accede con firma.';
        const publishButton = rendered.container.querySelector('button[aria-label="Abrir publicar"]') as HTMLButtonElement | null;
        const chatButton = rendered.container.querySelector('button[aria-label="Abrir chats"]') as HTMLButtonElement | null;
        const notificationsButton = rendered.container.querySelector('button[aria-label="Abrir notificaciones"]') as HTMLButtonElement | null;
        const walletButton = rendered.container.querySelector('button[aria-label="Abrir Wallet"]') as HTMLButtonElement | null;

        expect(publishButton).not.toBeNull();
        expect(chatButton).not.toBeNull();
        expect(notificationsButton).not.toBeNull();
        expect(walletButton).not.toBeNull();
        expect(publishButton?.disabled).toBe(true);
        expect(chatButton?.disabled).toBe(true);
        expect(notificationsButton?.disabled).toBe(true);
        expect(walletButton?.disabled).toBe(true);
        expect(publishButton?.title).toBe(readonlyReason);
        expect(chatButton?.title).toBe(readonlyReason);
        expect(notificationsButton?.title).toBe(readonlyReason);
        expect(walletButton?.title).toBe(readonlyReason);

        await act(async () => {
            publishButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            chatButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            notificationsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            walletButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.onOpenPublish).not.toHaveBeenCalled();
        expect(rendered.onOpenChat).not.toHaveBeenCalled();
        expect(rendered.onOpenNotifications).not.toHaveBeenCalled();
        expect(rendered.onOpenWallet).not.toHaveBeenCalled();
    });

    test('disables edit profile from the user menu in readonly mode', async () => {
        const rendered = await renderSidebar({
            pathname: '/',
            authSessionOverrides: {
                method: 'npub',
                readonly: true,
                capabilities: {
                    canSign: false,
                    canEncrypt: false,
                    encryptionSchemes: [],
                },
            },
            canWrite: false,
        });
        mounted.push(rendered);

        await openUserMenu(rendered.container);
        const editProfileAction = Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Editar perfil'
        ) as HTMLElement;

        expect(editProfileAction).toBeDefined();
        expect(editProfileAction.getAttribute('aria-disabled')).toBe('true');
        expect(editProfileAction.getAttribute('title')).toBe('Estás en modo lectura, accede con firma.');

        await act(async () => {
            editProfileAction.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.onOpenProfileEditor).not.toHaveBeenCalled();
    });

    test('uses the resolved theme logo in the platform header avatar', async () => {
        const rendered = await renderSidebar({ resolvedTheme: 'light' });
        mounted.push(rendered);

        const platformAvatar = rendered.container.querySelector('[data-testid="sidebar-platform-avatar"]');
        const platformLogo = platformAvatar?.querySelector('[data-slot="avatar-image"]') as HTMLImageElement | null;

        expect(platformLogo).not.toBeNull();
        expect(platformLogo?.getAttribute('src')).toBe('/icon-light-48x48.png');
        expect(platformLogo?.getAttribute('alt')).toBe('Logo de Nostr City');
        expect(platformAvatar?.querySelector('[data-slot="avatar-fallback"]')).toBeNull();
    });

    test('keeps the header trigger out of the compact sidebar rail', async () => {
        const rendered = await renderSidebar({ open: false });
        mounted.push(rendered);

        const collapsedSidebar = rendered.container.querySelector('[data-slot="sidebar"][data-state="collapsed"]');

        expect(collapsedSidebar).not.toBeNull();
        expect(collapsedSidebar?.querySelector('[data-slot="sidebar-header"] [data-slot="sidebar-trigger"]')).toBeNull();
        expect(collapsedSidebar?.querySelector('[data-slot="sidebar-rail"]')).not.toBeNull();
    });

    test('opens mobile sidebar content from the map app bar menu', async () => {
        setMobileViewport();
        const rendered = await renderSidebar({ open: false });
        mounted.push(rendered);

        const appBar = rendered.container.querySelector('[data-testid="mobile-overlay-app-bar"]');
        const mobileTrigger = appBar?.querySelector('button[aria-label="Abrir navegación"]') as HTMLButtonElement | null;

        expect(appBar).not.toBeNull();
        expect(appBar?.textContent || '').toContain('Nostr City');
        expect(mobileTrigger).not.toBeNull();
        expect(rendered.container.querySelector('.nostr-mobile-sidebar-trigger')).toBeNull();
        expect(document.body.textContent || '').not.toContain('Social content');

        await act(async () => {
            mobileTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(document.body.textContent || '').toContain('Social content');
        expect(document.body.textContent || '').toContain('Navegación de Nostr City');
    });

    test('styles the mobile app bar instead of the legacy bottom-left trigger', async () => {
        setMobileViewport();
        const rendered = await renderSidebar({ open: false });
        mounted.push(rendered);

        const appBar = rendered.container.querySelector('[data-testid="mobile-overlay-app-bar"]');
        const styles = readOverlayStyles();

        expect(appBar).not.toBeNull();
        expect(appBar?.classList.contains('nostr-mobile-app-bar')).toBe(true);
        expect(rendered.container.querySelector('.nostr-mobile-sidebar-trigger')).toBeNull();
        expect(styles).toMatch(/\.nostr-mobile-app-bar\s*\{[^}]*position:\s*fixed;[^}]*top:\s*0;/s);
        expect(styles).toMatch(/\.nostr-mobile-app-bar\s*\{[^}]*env\(safe-area-inset-top\)/s);
        expect(styles).toMatch(/@media \(max-width: 767px\)[\s\S]*?\.nostr-mobile-app-bar,[\s\S]*?pointer-events:\s*auto;/);
        expect(styles).not.toMatch(/\.nostr-mobile-sidebar-trigger\s*\{[^}]*position:\s*fixed;[^}]*bottom:/s);
        expect(styles).toMatch(/\.nostr-mobile-app-bar-title\s*\{[^}]*font-size:\s*1rem;/s);
        expect(styles).toMatch(/\.nostr-mobile-app-bar-button\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s);
    });

    test('renders an internal-route back button and calls the provided callback', async () => {
        setMobileViewport();
        const rendered = await renderSidebar({
            pathname: '/agora',
            open: false,
            mobileAppBarTitle: 'Agora',
            mobileAppBarShowBack: true,
        });
        mounted.push(rendered);

        const backButton = rendered.container.querySelector('button[aria-label="Volver"]') as HTMLButtonElement | null;

        expect(backButton).not.toBeNull();
        expect(rendered.container.textContent || '').toContain('Agora');

        await act(async () => {
            backButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.onMobileAppBarBack).toHaveBeenCalledTimes(1);
    });

    test('closes the mobile sidebar after selecting a navigation action', async () => {
        setMobileViewport();
        const rendered = await renderSidebar({ open: false });
        mounted.push(rendered);

        const mobileTrigger = rendered.container.querySelector('button[aria-label="Abrir navegación"]') as HTMLButtonElement | null;
        await act(async () => {
            mobileTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const mapButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
            button.getAttribute('aria-label') === 'Abrir mapa'
        ) as HTMLButtonElement | undefined;
        expect(mapButton).toBeDefined();

        await act(async () => {
            mapButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.onOpenMap).toHaveBeenCalledTimes(1);
        expect(document.body.textContent || '').not.toContain('Social content');
    });

    test('closes the mobile sidebar when a user menu action opens a dialog', async () => {
        setMobileViewport();
        const rendered = await renderSidebar({ open: false });
        mounted.push(rendered);

        const mobileTrigger = rendered.container.querySelector('button[aria-label="Abrir navegación"]') as HTMLButtonElement | null;
        await act(async () => {
            mobileTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await openUserMenu(document.body);
        const editProfileAction = Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Editar perfil'
        ) as HTMLElement;
        expect(editProfileAction).toBeDefined();

        await act(async () => {
            editProfileAction.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.onOpenProfileEditor).toHaveBeenCalledTimes(1);
        expect(document.body.textContent || '').not.toContain('Social content');
    });
});
