import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { AuthSessionState } from '../../nostr/auth/session';
import { OverlaySidebarLayer } from './OverlaySidebarLayer';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

const OWNER_PUBKEY = 'f'.repeat(64);
const ALICE_PUBKEY = 'a'.repeat(64);
const BOB_PUBKEY = 'b'.repeat(64);

const authSession: AuthSessionState = {
    method: 'nip07',
    pubkey: OWNER_PUBKEY,
    readonly: false,
    locked: false,
    createdAt: 1,
    capabilities: {
        canSign: true,
        canEncrypt: true,
        encryptionSchemes: ['nip44'],
    },
};

function createDefaultProps(overrides: Partial<ComponentProps<typeof OverlaySidebarLayer>> = {}): ComponentProps<typeof OverlaySidebarLayer> {
    return {
        showLoginGate: false,
        open: true,
        onOpenChange: vi.fn(),
        resolvedTheme: 'dark',
        authSession,
        ownerPubkey: OWNER_PUBKEY,
        ownerProfile: { pubkey: OWNER_PUBKEY, displayName: 'Owner' },
        canWrite: true,
        canAccessDirectMessages: true,
        canAccessSocialNotifications: true,
        canAccessFollowingFeed: true,
        chatHasUnread: false,
        notificationsHasUnread: false,
        followingFeedHasUnread: false,
        onOpenMap: vi.fn(),
        onOpenCityStats: vi.fn(),
        onOpenChat: vi.fn(),
        onOpenGroups: vi.fn(),
        onOpenRelays: vi.fn(),
        onOpenNotifications: vi.fn(),
        onOpenFollowingFeed: vi.fn(),
        onOpenArticles: vi.fn(),
        onOpenGlobalSearch: vi.fn(),
        onOpenWallet: vi.fn(),
        onOpenPublish: vi.fn(),
        onOpenSettings: vi.fn(),
        isUiSettingsOpen: false,
        onLogout: vi.fn(),
        onCopyOwnerNpub: vi.fn(),
        onLocateOwner: vi.fn(),
        onViewOwnerDetails: vi.fn(),
        missionsDiscoveredCount: 2,
        missionsTotal: 5,
        relaysConnectedCount: 3,
        relaysTotal: 5,
        onOpenMissions: vi.fn(),
        mobileAppBarTitle: 'Nostr City',
        mobileAppBarShowBack: false,
        onMobileAppBarBack: vi.fn(),
        follows: [ALICE_PUBKEY],
        profiles: {
            [ALICE_PUBKEY]: { pubkey: ALICE_PUBKEY, displayName: 'Alice' },
        },
        mutedPubkeys: [],
        mutedProfiles: {},
        followers: [BOB_PUBKEY],
        followerProfiles: {
            [BOB_PUBKEY]: { pubkey: BOB_PUBKEY, displayName: 'Bob' },
        },
        followersLoading: false,
        selectedPubkey: ALICE_PUBKEY,
        onSelectFollowing: vi.fn(),
        onLocateFollowing: vi.fn(),
        onMessagePerson: vi.fn(),
        onFollowPerson: vi.fn(),
        onToggleMutePerson: vi.fn(),
        onViewPersonDetails: vi.fn(),
        zapAmounts: [21, 128],
        onZapPerson: vi.fn(),
        onConfigureZapAmounts: vi.fn(),
        verificationByPubkey: {},
        ...overrides,
    };
}

async function renderLayer(props: ComponentProps<typeof OverlaySidebarLayer>): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(
            <MemoryRouter>
                <OverlaySidebarLayer {...props} />
            </MemoryRouter>
        );
    });

    return { container, root };
}

function setMobileViewport(): void {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
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

function setDesktopViewport(): void {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: !query.includes('max-width'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }));
}

async function waitFor(condition: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        if (condition()) {
            return;
        }

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
    }

    throw new Error('Condition was not met in time');
}

async function clickButton(container: ParentNode, selector: string): Promise<void> {
    const button = container.querySelector(selector) as HTMLButtonElement | null;
    expect(button).not.toBeNull();

    await act(async () => {
        button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

async function openDropdownTrigger(button: HTMLButtonElement): Promise<void> {
    await act(async () => {
        button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
    setDesktopViewport();
    window.localStorage.clear();
    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted = [];
    document.body.replaceChildren();
});

describe('OverlaySidebarLayer', () => {
    test('renders nothing behind the login gate', async () => {
        const rendered = await renderLayer(createDefaultProps({ showLoginGate: true }));
        mounted.push(rendered);

        expect(rendered.container.textContent).toBe('');
        expect(rendered.container.querySelector('[data-slot="sidebar"]')).toBeNull();
    });

    test('renders panel actions and embedded social sidebar entries when authenticated', async () => {
        const rendered = await renderLayer(createDefaultProps());
        mounted.push(rendered);

        expect(rendered.container.querySelector('button[aria-label="Abrir mapa"]')).not.toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Abrir chats"]')).not.toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Abrir buscador global de usuarios"]')).not.toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Abrir lista de seguidos"]')).not.toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Abrir lista de seguidores"]')).not.toBeNull();
        expect(rendered.container.textContent || '').toContain('Owner');
    });

    test('passes mobile app bar title and back action into the sidebar', async () => {
        setMobileViewport();
        const onMobileAppBarBack = vi.fn();
        const rendered = await renderLayer(createDefaultProps({
            mobileAppBarTitle: 'Agora',
            mobileAppBarShowBack: true,
            onMobileAppBarBack,
        }));
        mounted.push(rendered);

        const appBar = rendered.container.querySelector('[data-testid="mobile-overlay-app-bar"]');
        const backButton = rendered.container.querySelector('button[aria-label="Volver"]') as HTMLButtonElement | null;

        expect(appBar).not.toBeNull();
        expect(appBar?.textContent || '').toContain('Agora');
        expect(backButton).not.toBeNull();

        await act(async () => {
            backButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onMobileAppBarBack).toHaveBeenCalledTimes(1);
    });

    test('routes sidebar action controls to callbacks', async () => {
        const onOpenMap = vi.fn();
        const onOpenCityStats = vi.fn();
        const onOpenChat = vi.fn();
        const onOpenRelays = vi.fn();
        const onOpenArticles = vi.fn();
        const onOpenGlobalSearch = vi.fn();
        const onOpenWallet = vi.fn();
        const onOpenSettings = vi.fn();
        const onLogout = vi.fn();
        const rendered = await renderLayer(createDefaultProps({
            onOpenMap,
            onOpenCityStats,
            onOpenChat,
            onOpenRelays,
            onOpenArticles,
            onOpenGlobalSearch,
            onOpenWallet,
            onOpenSettings,
            onLogout,
        }));
        mounted.push(rendered);

        await clickButton(rendered.container, 'button[aria-label="Abrir mapa"]');
        await clickButton(rendered.container, 'button[aria-label="Abrir estadísticas de la ciudad"]');
        await clickButton(rendered.container, 'button[aria-label="Abrir chats"]');
        await clickButton(rendered.container, 'button[aria-label="Abrir relays"]');
        await clickButton(rendered.container, 'button[aria-label="Abrir artículos"]');
        await clickButton(rendered.container, 'button[aria-label="Abrir buscador global de usuarios"]');
        await clickButton(rendered.container, 'button[aria-label="Abrir wallet"]');
        await clickButton(rendered.container, 'button[aria-label="Abrir ajustes"]');
        await clickButton(rendered.container, 'button[aria-label="Abrir ajustes de interfaz"]');
        const userMenuButton = rendered.container.querySelector('button[aria-label="Abrir menú de usuario"]') as HTMLButtonElement;
        expect(userMenuButton).toBeDefined();
        await openDropdownTrigger(userMenuButton);
        await waitFor(() => Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).some((item) =>
            (item.textContent || '').trim() === 'Cerrar sesión'
        ));
        const logoutAction = Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Cerrar sesión'
        ) as HTMLElement;
        expect(logoutAction).toBeDefined();
        await act(async () => {
            logoutAction.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onOpenMap).toHaveBeenCalledTimes(1);
        expect(onOpenCityStats).toHaveBeenCalledTimes(1);
        expect(onOpenChat).toHaveBeenCalledTimes(1);
        expect(onOpenRelays).toHaveBeenCalledTimes(1);
        expect(onOpenArticles).toHaveBeenCalledTimes(1);
        expect(onOpenGlobalSearch).toHaveBeenCalledTimes(1);
        expect(onOpenWallet).toHaveBeenCalledTimes(1);
        expect(onOpenSettings).toHaveBeenCalledWith('ui');
        expect(onLogout).toHaveBeenCalledTimes(1);
    });

    test('opens following and followers dialogs from embedded social sidebar', async () => {
        const rendered = await renderLayer(createDefaultProps());
        mounted.push(rendered);

        await clickButton(rendered.container, 'button[aria-label="Abrir lista de seguidos"]');
        await waitFor(() => (document.body.textContent || '').includes('Alice'));
        expect(document.body.textContent || '').toContain('Seguidos');

        await act(async () => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });

        await clickButton(rendered.container, 'button[aria-label="Abrir lista de seguidores"]');
        await waitFor(() => (document.body.textContent || '').includes('Bob'));
        expect(document.body.textContent || '').toContain('Seguidores');
    });
});
