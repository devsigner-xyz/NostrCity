import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { BrowserRouter, MemoryRouter, useLocation, useNavigate } from 'react-router';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { createLocalKeyStorage } from '../nostr/auth/local-key-storage';
import { LocalKeyAuthProvider } from '../nostr/auth/providers/local-key-provider';
import { createAuthSession } from '../nostr/auth/session';
import { AUTH_SESSION_STORAGE_KEY } from '../nostr/auth/secure-storage';
import { loadRelaySettings, RELAY_SETTINGS_STORAGE_KEY, saveRelaySettings } from '../nostr/relay-settings';
import { WALLET_SETTINGS_STORAGE_KEY } from '../nostr/wallet-settings';
import { UI_SETTINGS_STORAGE_KEY } from '../nostr/ui-settings';
import { EASTER_EGG_PROGRESS_STORAGE_KEY } from '../nostr/easter-egg-progress';
import { getBootstrapRelays } from '../nostr/relay-policy';
import { __resetFollowsCacheForTests } from '../nostr/follows';
import { encodeHexToNpub } from '../nostr/npub';
import * as ndkClientModule from '../nostr/ndk-client';
import * as writeGatewayModule from '../nostr/write-gateway';
import * as runtimeDmServiceModule from '../nostr/dm-runtime-service';
import * as dmApiServiceModule from '../nostr-api/dm-api-service';
import { SITE_THEME_CHANGE_EVENT } from '../site/theme-preference';

const { createFireworksMock } = vi.hoisted(() => ({
    createFireworksMock: vi.fn(),
}));

vi.mock('@tsparticles/fireworks', () => ({
    fireworks: {
        create: createFireworksMock,
    },
}));

import { App } from './App';
import type { NostrOverlayServices } from './hooks/useNostrOverlay';
import type { MapBridge } from './map-bridge';
import type { NostrClient, NostrProfile } from '../nostr/types';
import type { SocialNotificationEvent, SocialNotificationsService } from '../nostr/social-notifications-service';
import type { SocialFeedService } from '../nostr/social-feed-service';
import { createNostrOverlayQueryClient } from './query/query-client';
import { nostrOverlayQueryKeys } from './query/keys';
import { buildSocialLastReadStorageKey } from './query/read-state';
import { buildFollowingFeedLastReadStorageKey } from './query/following-feed-read-state';
import { buildRelayDetailPath } from './settings/relay-detail-routing';
import type { OverlaySessionAuthService } from './controllers/use-overlay-session-controller';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
    queryClient: QueryClient;
}

interface RenderOptions {
    initialEntries?: Array<string | { pathname: string; search?: string; state?: unknown }>;
}

interface MapBridgeStub {
    bridge: MapBridge;
    triggerOccupiedBuildingClick: (payload: { buildingIndex: number; pubkey: string }) => void;
    triggerOccupiedBuildingContextMenu: (payload: { buildingIndex: number; pubkey: string; clientX: number; clientY: number }) => void;
    triggerEasterEggBuildingClick: (payload: { buildingIndex: number; easterEggId: 'bitcoin_whitepaper' | 'crypto_anarchist_manifesto' | 'cyberspace_independence' }) => void;
}

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (error?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return {
        promise,
        resolve,
        reject,
    };
}

const SAMPLE_AUTH_PUBKEY = '7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e';

function createNip07ExtensionMock(pubkey = SAMPLE_AUTH_PUBKEY) {
    return {
        getPublicKey: vi.fn(async () => pubkey),
        signEvent: vi.fn(async (event: any) => ({
            ...event,
            pubkey,
            id: typeof event?.id === 'string' && event.id.length > 0 ? event.id : 'f'.repeat(64),
            sig: 'e'.repeat(128),
        })),
        nip04: {
            encrypt: vi.fn(async (_targetPubkey: string, plaintext: string) => plaintext),
            decrypt: vi.fn(async (_targetPubkey: string, ciphertext: string) => ciphertext),
        },
        nip44: {
            encrypt: vi.fn(async (_targetPubkey: string, plaintext: string) => plaintext),
            decrypt: vi.fn(async (_targetPubkey: string, ciphertext: string) => ciphertext),
        },
    };
}

async function loginWithNip07(container: HTMLDivElement): Promise<void> {
    await waitFor(() => container.querySelector('[data-slot="select-trigger"]') !== null);
    const methodSelectTrigger = container.querySelector('[data-slot="select-trigger"]') as HTMLButtonElement;
    expect(methodSelectTrigger).toBeDefined();

    await act(async () => {
        methodSelectTrigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
        methodSelectTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    });

    const nip07Option = Array.from(document.body.querySelectorAll('[data-slot="select-item"]')).find((item) =>
        (item.textContent || '').trim() === 'Extensión (NIP-07)'
    ) as HTMLElement;
    expect(nip07Option).toBeDefined();

    await act(async () => {
        nip07Option.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
        nip07Option.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    });

    const continueButton = Array.from(container.querySelectorAll('button')).find((button) =>
        (button.textContent || '').includes('Continuar con extensión')
    ) as HTMLButtonElement;
    expect(continueButton).toBeDefined();

    await act(async () => {
        continueButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

function createMapBridgeStub(buildingsCount = 0): MapBridgeStub {
    const occupiedBuildingClickListeners: Array<(payload: { buildingIndex: number; pubkey: string }) => void> = [];
    const occupiedBuildingContextMenuListeners: Array<
        (payload: { buildingIndex: number; pubkey: string; clientX: number; clientY: number }) => void
    > = [];
    const easterEggBuildingClickListeners: Array<
        (payload: { buildingIndex: number; easterEggId: 'bitcoin_whitepaper' | 'crypto_anarchist_manifesto' | 'cyberspace_independence' }) => void
    > = [];
    const bridge = {
        ensureGenerated: vi.fn().mockResolvedValue(undefined),
        regenerateMap: vi.fn().mockResolvedValue(undefined),
        listBuildings: vi.fn().mockReturnValue(
            Array.from({ length: buildingsCount }, (_, index) => ({
                index,
                centroid: {
                    x: (index + 1) * 10,
                    y: (index + 1) * 8,
                },
            }))
        ),
        applyOccupancy: vi.fn(),
        setVerifiedBuildingIndexes: vi.fn(),
        setViewportInsetLeft: vi.fn(),
        setZoom: vi.fn(),
        setDialogBuildingHighlight: vi.fn(),
        setStreetLabelsEnabled: vi.fn(),
        setStreetLabelsZoomLevel: vi.fn(),
        setStreetLabelUsernames: vi.fn(),
        setTrafficParticlesCount: vi.fn(),
        setTrafficParticlesSpeed: vi.fn(),
        setColourScheme: vi.fn(),
        getColourScheme: vi.fn().mockReturnValue('Nostr City Light'),
        listColourSchemes: vi.fn().mockReturnValue(['Nostr City Light', 'Nostr City Dark']),
        mountSettingsPanel: vi.fn(),
        focusBuilding: vi.fn(),
        listEasterEggBuildings: vi.fn().mockReturnValue([]),
        getParkCount: vi.fn().mockReturnValue(0),
        getZoom: vi.fn().mockReturnValue(1),
        worldToScreen: vi.fn().mockImplementation((point: { x: number; y: number }) => point),
        getViewportInsetLeft: vi.fn().mockReturnValue(0),
        onMapGenerated: vi.fn().mockReturnValue(() => {}),
        onOccupiedBuildingClick: vi.fn().mockImplementation((listener: (payload: { buildingIndex: number; pubkey: string }) => void) => {
            occupiedBuildingClickListeners.push(listener);
            return () => {
                const index = occupiedBuildingClickListeners.indexOf(listener);
                if (index >= 0) {
                    occupiedBuildingClickListeners.splice(index, 1);
                }
            };
        }),
        onOccupiedBuildingContextMenu: vi.fn().mockImplementation((listener: (payload: { buildingIndex: number; pubkey: string; clientX: number; clientY: number }) => void) => {
            occupiedBuildingContextMenuListeners.push(listener);
            return () => {
                const index = occupiedBuildingContextMenuListeners.indexOf(listener);
                if (index >= 0) {
                    occupiedBuildingContextMenuListeners.splice(index, 1);
                }
            };
        }),
        onEasterEggBuildingClick: vi.fn().mockImplementation((listener: (payload: { buildingIndex: number; easterEggId: 'bitcoin_whitepaper' | 'crypto_anarchist_manifesto' | 'cyberspace_independence' }) => void) => {
            easterEggBuildingClickListeners.push(listener);
            return () => {
                const index = easterEggBuildingClickListeners.indexOf(listener);
                if (index >= 0) {
                    easterEggBuildingClickListeners.splice(index, 1);
                }
            };
        }),
        onViewChanged: vi.fn().mockReturnValue(() => {}),
    } as unknown as MapBridge;

    return {
        bridge,
        triggerOccupiedBuildingClick: (payload: { buildingIndex: number; pubkey: string }) => {
            occupiedBuildingClickListeners.forEach((listener) => listener(payload));
        },
        triggerOccupiedBuildingContextMenu: (payload: { buildingIndex: number; pubkey: string; clientX: number; clientY: number }) => {
            occupiedBuildingContextMenuListeners.forEach((listener) => listener(payload));
        },
        triggerEasterEggBuildingClick: (payload: { buildingIndex: number; easterEggId: 'bitcoin_whitepaper' | 'crypto_anarchist_manifesto' | 'cyberspace_independence' }) => {
            easterEggBuildingClickListeners.forEach((listener) => listener(payload));
        },
    };
}

function createSocialNotificationsServiceMock() {
    let listener: ((event: SocialNotificationEvent) => void) | null = null;
    const service: SocialNotificationsService = {
        subscribeSocial: vi.fn((_input, onEvent) => {
            listener = onEvent;
            return () => {
                listener = null;
            };
        }),
        loadInitialSocial: vi.fn(async () => ({ items: [], hasMore: false, nextSince: null })),
    };

    return {
        service,
        emit(event: SocialNotificationEvent) {
            listener?.(event);
        },
    };
}

function createSocialFeedServiceMock() {
    const service: SocialFeedService = {
        loadFollowingFeed: vi.fn(async () => ({ items: [], hasMore: false })),
        loadArticlesFeed: vi.fn(async () => ({ items: [], hasMore: false })),
        loadArticleById: vi.fn(async () => null),
        loadHashtagFeed: vi.fn(async () => ({ items: [], hasMore: false })),
        loadThread: vi.fn(async () => ({ root: null, replies: [], hasMore: false })),
        loadEngagement: vi.fn(async () => ({})),
        loadViewerReactions: vi.fn(async () => ({})),
        loadViewerZaps: vi.fn(async () => ({})),
        loadViewerReplies: vi.fn(async () => ({})),
    };

    return {
        service,
    };
}

function createFeedNote(id: string, pubkey: string, createdAt: number, content: string) {
    return {
        id,
        pubkey,
        createdAt,
        content,
        kind: 'note' as const,
        rawEvent: {
            id,
            pubkey,
            kind: 1,
            created_at: createdAt,
            tags: [],
            content,
        },
    };
}

function createBasicOverlayServices(ownerPubkey: string = 'f'.repeat(64), overrides: Partial<NostrOverlayServices> = {}): NostrOverlayServices {
    return {
        createClient: () => ({
            connect: async () => {},
            fetchLatestReplaceableEvent: async () => null,
            fetchEvents: async () => [],
        }),
        fetchFollowsByPubkeyFn: async () => ({
            ownerPubkey,
            follows: [],
            relayHints: [],
        }),
        fetchProfilesFn: async () => ({
            [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
        }),
        fetchFollowersBestEffortFn: async () => ({
            followers: [],
            scannedBatches: 1,
            complete: true,
        }),
        ...overrides,
    };
}

function persistGroupRelaySettings(ownerPubkey: string, groups: string[] = ['wss://relay.example']): void {
    const state = loadRelaySettings({ ownerPubkey });
    saveRelaySettings({
        ...state,
        byType: {
            ...state.byType,
            groups,
        },
    }, { ownerPubkey });
}

function QueryProviderProbe() {
    useQueryClient();
    return <span data-testid="query-provider-probe">query provider ready</span>;
}

function LocationProbe() {
    const location = useLocation();
    return <span data-testid="location-probe">{`${location.pathname}${location.search}`}</span>;
}

function HistoryBackProbe() {
    const navigate = useNavigate();
    return <button type="button" data-testid="history-back-probe" onClick={() => navigate(-1)}>history back</button>;
}

function BrowserHistoryBackProbe() {
    return <button type="button" data-testid="browser-history-back-probe" onClick={() => window.history.back()}>browser back</button>;
}

async function renderApp(element: ReactElement, options: RenderOptions = {}): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const queryClient = createNostrOverlayQueryClient();

    await act(async () => {
        root.render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter initialEntries={options.initialEntries ?? ['/']}>
                    {element}
                </MemoryRouter>
            </QueryClientProvider>
        );
    });

    return { container, root, queryClient };
}

async function renderBrowserApp(element: ReactElement, basename?: string): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const queryClient = createNostrOverlayQueryClient();

    await act(async () => {
        root.render(
            <QueryClientProvider client={queryClient}>
                <BrowserRouter {...(basename ? { basename } : {})}>
                    {element}
                </BrowserRouter>
            </QueryClientProvider>
        );
    });

    return { container, root, queryClient };
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

function persistDmCapableSession(ownerPubkey = SAMPLE_AUTH_PUBKEY): string {
    window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
        method: 'nip07',
        pubkey: ownerPubkey,
        readonly: false,
        locked: false,
        createdAt: Date.now(),
        capabilities: {
            canSign: true,
            canEncrypt: true,
            encryptionSchemes: ['nip44'],
        },
    }));

    return ownerPubkey;
}

async function renderAuthenticatedMobileApp(pathname: string, services?: Partial<NostrOverlayServices>): Promise<RenderResult> {
    setMobileViewport();
    const ownerPubkey = persistDmCapableSession();
    const { bridge } = createMapBridgeStub();

    return renderApp(
        <>
            <App mapBridge={bridge} services={createBasicOverlayServices(ownerPubkey, services)} />
            <LocationProbe />
        </>,
        { initialEntries: [pathname] }
    );
}

function getLocationText(container: HTMLDivElement): string {
    return container.querySelector('[data-testid="location-probe"]')?.textContent || '';
}

function createThreadResult(rootEventId: string, content = 'root note') {
    return {
        root: {
            id: rootEventId,
            pubkey: 'a'.repeat(64),
            createdAt: 100,
            eventKind: 1,
            content,
            rawEvent: {
                id: rootEventId,
                pubkey: 'a'.repeat(64),
                kind: 1,
                created_at: 100,
                tags: [],
                content,
            },
        },
        replies: [],
        hasMore: false,
    };
}

async function waitFor(condition: () => boolean): Promise<void> {
    for (let i = 0; i < 40; i++) {
        if (condition()) {
            return;
        }
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });
    }
    throw new Error('Condition was not met in time');
}

async function fillTextarea(textarea: HTMLTextAreaElement, value: string, selectionStart = value.length): Promise<void> {
    await act(async () => {
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        valueSetter?.call(textarea, value);
        textarea.setSelectionRange(selectionStart, selectionStart);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

async function waitForMentionSuggestions(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 320));
    });
}

async function chooseMentionSuggestion(label: string): Promise<void> {
    await waitFor(() => Boolean(document.body.querySelector(`button[aria-label="Mencionar a ${label}"]`)));
    const suggestion = document.body.querySelector(`button[aria-label="Mencionar a ${label}"]`) as HTMLButtonElement;
    expect(suggestion).toBeDefined();

    await act(async () => {
        suggestion.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        suggestion.click();
    });
}

async function openDropdownTrigger(button: HTMLButtonElement): Promise<void> {
    await act(async () => {
        button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

async function clickMenuItemByLabel(label: string): Promise<void> {
    const item = document.body.querySelector(`[aria-label="${label}"]`);
    await act(async () => {
        item?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
        item?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

async function openGroupActions(container: HTMLElement, groupName: string): Promise<void> {
    const trigger = container.querySelector(`button[aria-label="Abrir acciones de ${groupName}"]`) as HTMLButtonElement;
    await openDropdownTrigger(trigger);
}

async function openSettingsContextMenu(container: HTMLDivElement): Promise<void> {
    const inlineSettingsButton = container.querySelector('button[aria-label="Alternar ajustes"]') as HTMLButtonElement | null;
    const inlineOptionsVisible = (container.textContent || '').includes('Ajustes avanzados');
    if (inlineSettingsButton && !inlineOptionsVisible) {
        await act(async () => {
            inlineSettingsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await waitFor(() => (container.textContent || '').includes('Ajustes avanzados'));
        return;
    }

    if (inlineOptionsVisible) {
        return;
    }

    const settingsButton = container.querySelector('button[aria-label="Abrir ajustes"]') as HTMLButtonElement;
    expect(settingsButton).toBeDefined();

    await openDropdownTrigger(settingsButton);

    await waitFor(() => (document.body.textContent || '').includes('Ajustes avanzados'));
}

async function selectSettingsContextAction(container: HTMLDivElement, label: string): Promise<void> {
    await openSettingsContextMenu(container);

    const inlineAction = Array.from(container.querySelectorAll('button, a')).find((item) =>
        (item.textContent || '').trim() === label
    ) as HTMLElement | undefined;

    const action = inlineAction ?? Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).find((item) =>
        (item.textContent || '').trim() === label
    ) as HTMLElement;
    expect(action).toBeDefined();

    await act(async () => {
        action.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

function getUiSettingsDialog(): HTMLElement | null {
    return Array.from(document.body.querySelectorAll('[data-slot="dialog-content"]')).find((node) =>
        (node.textContent || '').includes('Etiquetas de calles') || (node.textContent || '').includes('Street labels')
    ) as HTMLElement | null;
}

async function selectUserMenuAction(container: HTMLDivElement, label: string): Promise<void> {
    const userMenuButton = container.querySelector('button[aria-label="Abrir menú de usuario"]') as HTMLButtonElement;
    expect(userMenuButton).toBeDefined();

    await openDropdownTrigger(userMenuButton);

    await waitFor(() => Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).some((item) =>
        (item.textContent || '').trim() === label
    ));

    const action = Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).find((item) =>
        (item.textContent || '').trim() === label
    ) as HTMLElement;
    expect(action).toBeDefined();

    await act(async () => {
        action.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

function getActiveProfileDialog(): HTMLElement | null {
    return document.body.querySelector('[data-slot="dialog-content"][aria-label="Perfil del ocupante"]') as HTMLElement | null;
}

async function selectActiveProfileDialogTab(label: string): Promise<void> {
    await waitFor(() => getActiveProfileDialog() !== null);
    const dialog = getActiveProfileDialog() as HTMLElement;

    const tab = Array.from(dialog.querySelectorAll('[data-slot="tabs-trigger"]')).find((node) =>
        (node.textContent || '').trim() === label
        || (node.textContent || '').trim().startsWith(`${label} (`)
    ) as HTMLElement;
    expect(tab).toBeDefined();

    await act(async () => {
        tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
        tab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

let mounted: RenderResult[] = [];
let createNdkDmTransportClientSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

    if (!Element.prototype.scrollIntoView) {
        Element.prototype.scrollIntoView = () => {};
    }

    const htmlElementPrototype = HTMLElement.prototype as HTMLElement & {
        hasPointerCapture?: (pointerId: number) => boolean;
        setPointerCapture?: (pointerId: number) => void;
        releasePointerCapture?: (pointerId: number) => void;
    };

    if (!htmlElementPrototype.hasPointerCapture) {
        htmlElementPrototype.hasPointerCapture = () => false;
    }

    if (!htmlElementPrototype.setPointerCapture) {
        htmlElementPrototype.setPointerCapture = () => {};
    }

    if (!htmlElementPrototype.releasePointerCapture) {
        htmlElementPrototype.releasePointerCapture = () => {};
    }
});

beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    window.localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    __resetFollowsCacheForTests();
    createFireworksMock.mockReset();
    createFireworksMock.mockResolvedValue({ stop: vi.fn() });
    (window as unknown as { nostr?: unknown }).nostr = createNip07ExtensionMock();
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    });
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes('/v1/publish/forward')) {
            return new Response(JSON.stringify({
                ackedRelays: ['wss://relay.one'],
                failedRelays: [],
                timeoutRelays: [],
            }), {
                status: 200,
                headers: {
                    'content-type': 'application/json',
                },
            });
        }

        return new Response(JSON.stringify([]), {
            status: 200,
            headers: {
                'content-type': 'application/json',
            },
        });
    }));
    createNdkDmTransportClientSpy = vi.spyOn(ndkClientModule, 'createNdkDmTransportClient').mockReturnValue({
        publishToRelays: vi.fn(async () => ({
            ackedRelays: [],
            failedRelays: [],
            timeoutRelays: [],
        })),
        subscribe: vi.fn(() => ({
            unsubscribe() {
                return;
            },
        })),
        fetchBackfill: vi.fn(async () => []),
    } as any);
});

afterEach(async () => {
    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted = [];
    delete (window as unknown as { nostr?: unknown }).nostr;
    vi.restoreAllMocks();
    createNdkDmTransportClientSpy = null;
});

describe('Nostr overlay App', () => {
    test('provides query provider in app render helper', async () => {
        const rendered = await renderApp(<QueryProviderProbe />);
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('query provider ready');
    });

    test('shows login dialog overlay with full-width map behind before session starts', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('input[name="npub"]') !== null);

        const loginScreen = rendered.container.querySelector('[data-testid="login-gate-screen"]');
        const npubInput = rendered.container.querySelector('input[name="npub"]');
        const content = rendered.container.textContent || '';

        expect(loginScreen).not.toBeNull();
        expect(loginScreen?.classList.contains('nostr-login-screen')).toBe(true);
        expect(loginScreen?.classList.contains('nostr-login-screen-dialog')).toBe(true);
        expect(npubInput).not.toBeNull();
        expect(content).not.toContain('Accede o explora');
        expect(content).toContain('npub (solo lectura)');
        expect(content).toContain('Método de acceso');
        expect(content).toContain('Acceder');
        expect(content).not.toContain('Cargar seguidos');
        expect(rendered.container.querySelector('.nostr-panel-toolbar')).toBeNull();
        expect(rendered.container.querySelector('[data-testid="mobile-overlay-app-bar"]')).toBeNull();
        expect((bridge.setViewportInsetLeft as any).mock.calls.at(-1)?.[0]).toBe(0);
    });

    test('renders auth flow copy in english when ui language is set to en', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'en' }));

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('input[name="npub"]') !== null);

        const content = rendered.container.textContent || '';
        expect(content).toContain('Access method');
        expect(content).toContain('npub (read-only)');
        expect(content).toContain('Create account');
        expect(content).not.toContain('Método de acceso');
    });

    test('renders the scoped create-account selector copy and footer inside the auth flow', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('input[name="npub"]') !== null);

        const createAccountButton = Array.from(rendered.container.querySelectorAll('button')).find(
            (button) => (button.textContent || '').includes('Crear cuenta')
        ) as HTMLButtonElement | undefined;
        expect(createAccountButton).toBeDefined();

        await act(async () => {
            createAccountButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        const content = rendered.container.textContent || '';
        const footer = rendered.container.querySelector('[data-testid="auth-flow-footer"]');
        const footerButtons = Array.from(footer?.querySelectorAll('button') ?? []);

        expect(content).toContain('Usar app o extensión');
        expect(content).toContain('Conecta una extensión o un signer externo.');
        expect(content).toContain('Crear una cuenta local');
        expect(content).toContain('Crea una cuenta nueva en este dispositivo.');
        expect(footerButtons).toHaveLength(1);
        expect(footerButtons[0]?.textContent || '').toContain('Volver');
    });

    test('renders updated external and local auth-flow copy with stable auth test ids', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('input[name="npub"]') !== null);

        const openSelectorButton = Array.from(rendered.container.querySelectorAll('button')).find(
            (button) => (button.textContent || '').includes('Crear cuenta')
        ) as HTMLButtonElement | undefined;
        expect(openSelectorButton).toBeDefined();

        await act(async () => {
            openSelectorButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        const externalButton = Array.from(rendered.container.querySelectorAll('button')).find(
            (button) => (button.textContent || '').includes('Usar app o extensión')
        ) as HTMLButtonElement | undefined;
        expect(externalButton).toBeDefined();

        await act(async () => {
            externalButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        let content = rendered.container.textContent || '';

        expect(content).toContain('Usar app o extensión');
        expect(content).toContain('Elige cómo conectar una cuenta que ya controlas.');
        expect(rendered.container.querySelector('[data-testid="create-account-external-form"]')).not.toBeNull();

        const backButton = Array.from(rendered.container.querySelectorAll('button')).find(
            (button) => (button.textContent || '').trim() === 'Volver'
        ) as HTMLButtonElement | undefined;
        expect(backButton).toBeDefined();

        await act(async () => {
            backButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        const localButton = Array.from(rendered.container.querySelectorAll('button')).find(
            (button) => (button.textContent || '').includes('Crear una cuenta local')
        ) as HTMLButtonElement | undefined;
        expect(localButton).toBeDefined();

        await act(async () => {
            localButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        content = rendered.container.textContent || '';

        expect(content).toContain('Crear cuenta local');
        expect(content).toContain('Genera una cuenta nueva y guarda tu clave antes de continuar.');
        expect(rendered.container.querySelector('[data-testid="create-account-step-intro"]')).toBeNull();
        expect(rendered.container.querySelector('[data-testid="create-account-step-backup"]')).not.toBeNull();
    });

    test('restores persisted session and leaves /login for / after initial load', async () => {
        const ownerPubkey = 'f'.repeat(64);
        window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
            method: 'npub',
            pubkey: ownerPubkey,
            readonly: true,
            locked: false,
            createdAt: Date.now(),
        }));

        const { bridge } = createMapBridgeStub(6);
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={createBasicOverlayServices(ownerPubkey, {
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                })}
            />,
            { initialEntries: ['/login'] }
        );
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') === null);
        expect(rendered.container.querySelector('[data-testid="login-gate-screen"]')).toBeNull();
        expect(rendered.container.querySelector('.nostr-panel-toolbar')).not.toBeNull();
    });

    test('uses injected NIP-46 auth service as a writable non-persisted session', async () => {
        const ownerPubkey = 'e'.repeat(64);
        const nip46Session = createAuthSession({
            method: 'nip46',
            pubkey: ownerPubkey,
            locked: false,
            createdAt: Date.now(),
            capabilities: {
                canSign: true,
                canEncrypt: true,
                encryptionSchemes: ['nip44'],
            },
        });
        const authService: OverlaySessionAuthService = {
            getSession: () => nip46Session,
            getActiveProvider: () => ({
                method: 'nip46',
                supports: nip46Session.capabilities,
                resolveSession: vi.fn(),
                signEvent: vi.fn(),
                encrypt: vi.fn(),
                decrypt: vi.fn(),
                lock: vi.fn(),
            }),
            getSavedLocalAccount: async () => undefined,
            restoreSession: async () => nip46Session,
            startSession: async () => nip46Session,
            logout: async () => {},
        };

        const rendered = await renderApp(
            <App
                mapBridge={createMapBridgeStub(4).bridge}
                services={createBasicOverlayServices(ownerPubkey, { authService })}
            />,
            { initialEntries: ['/login'] }
        );
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') === null);

        expect(rendered.container.querySelector('[data-slot="sidebar-footer"] button[aria-label="Abrir publicar"]')).not.toBeNull();
        expect(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
    });

    test('shows nostrconnect timeout state when NIP-46 session start times out', async () => {
        const authService: OverlaySessionAuthService = {
            getSession: () => undefined,
            getActiveProvider: () => undefined,
            getSavedLocalAccount: async () => undefined,
            restoreSession: async () => undefined,
            startSession: async () => {
                throw new Error('NIP-46 pairing timed out');
            },
            logout: async () => {},
        };

        const rendered = await renderApp(
            <App
                mapBridge={createMapBridgeStub(4).bridge}
                services={createBasicOverlayServices('f'.repeat(64), { authService })}
            />,
            { initialEntries: ['/login'] }
        );
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') !== null);
        const methodSelectTrigger = rendered.container.querySelector('[data-testid="login-method-trigger"]') as HTMLButtonElement;
        await act(async () => {
            methodSelectTrigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
            methodSelectTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });
        const nip46Option = Array.from(document.body.querySelectorAll('[data-slot="select-item"]')).find((option) => (option.textContent || '').includes('Búnker')) as HTMLElement;
        await act(async () => {
            nip46Option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        const generateButton = Array.from(rendered.container.querySelectorAll('button')).find((button) => (button.textContent || '').includes('Generar QR nostrconnect://')) as HTMLButtonElement;
        await act(async () => {
            generateButton.click();
        });

        const pairButton = Array.from(rendered.container.querySelectorAll('button')).find((button) => (button.textContent || '').includes('Esperar conexión')) as HTMLButtonElement;
        await act(async () => {
            pairButton.click();
        });

        expect(rendered.container.textContent || '').toContain('La solicitud de emparejamiento caducó');
        expect(rendered.container.textContent || '').not.toContain('No se pudo conectar el signer remoto');
    });

    test('renders the mobile app bar on the map route without a back button', async () => {
        const rendered = await renderAuthenticatedMobileApp('/');
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') === null);
        await waitFor(() => rendered.container.querySelector('[data-testid="mobile-overlay-app-bar"]') !== null);

        const appBar = rendered.container.querySelector('[data-testid="mobile-overlay-app-bar"]');

        expect(appBar?.textContent || '').toContain('Nostr City');
        expect(appBar?.querySelector('button[aria-label="Abrir navegación"]')).not.toBeNull();
        expect(appBar?.querySelector('button[aria-label="Volver"]')).toBeNull();
        expect(getLocationText(rendered.container)).toBe('/');
    });

    test('uses the mobile bottom bar after navigating from map to Agora', async () => {
        const rendered = await renderAuthenticatedMobileApp('/');
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('[data-testid="mobile-overlay-app-bar"]') !== null);

        await waitFor(() => rendered.container.querySelector('[data-testid="mobile-bottom-navigation"]') !== null);
        const agoraButton = rendered.container.querySelector('[data-testid="mobile-bottom-navigation"] button[aria-label="Abrir Ágora"]') as HTMLButtonElement;
        await act(async () => {
            agoraButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => getLocationText(rendered.container) === '/agora');
        expect(rendered.container.querySelector('button[aria-label="Volver"]')).toBeNull();
        expect(rendered.container.querySelector('[data-testid="mobile-bottom-navigation"] button[aria-label="Abrir Ágora"]')?.getAttribute('aria-current')).toBe('page');
    });

    test('treats a direct Agora entry as a top-level mobile route', async () => {
        const rendered = await renderAuthenticatedMobileApp('/agora');
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('[data-testid="mobile-bottom-navigation"]') !== null);
        expect(rendered.container.querySelector('button[aria-label="Volver"]')).toBeNull();
        expect(getLocationText(rendered.container)).toBe('/agora');
    });

    test('uses explicit mobile back navigation for article detail and relay detail routes', async () => {
        const rendered = await renderAuthenticatedMobileApp(`/agora/articles/${'a'.repeat(64)}`);
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('button[aria-label="Volver"]') !== null);
        let backButton = rendered.container.querySelector('button[aria-label="Volver"]') as HTMLButtonElement;

        await act(async () => {
            backButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => getLocationText(rendered.container) === '/agora/articles');

        await act(async () => {
            rendered.root.unmount();
        });
        rendered.container.remove();
        mounted = mounted.filter((entry) => entry !== rendered);

        const relayDetailRendered = await renderAuthenticatedMobileApp(buildRelayDetailPath({
            relayUrl: 'wss://relay.example',
            source: 'configured',
            relayType: 'nip65Both',
        }));
        mounted.push(relayDetailRendered);
        await waitFor(() => relayDetailRendered.container.querySelector('button[aria-label="Volver"]') !== null);
        backButton = relayDetailRendered.container.querySelector('button[aria-label="Volver"]') as HTMLButtonElement;
        await act(async () => {
            backButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => getLocationText(relayDetailRendered.container) === '/relays');
    });

    test('uses mobile back to return an active chat conversation to the chat list', async () => {
        const peerPubkey = 'a'.repeat(64);
        const rendered = await renderAuthenticatedMobileApp(`/chats?peer=${peerPubkey}`);
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('button[aria-label="Volver"]') !== null);
        const backButton = rendered.container.querySelector('button[aria-label="Volver"]') as HTMLButtonElement;

        await act(async () => {
            backButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => getLocationText(rendered.container) === '/chats');
    });

    test('uses the active chat participant as the mobile app bar title', async () => {
        const peerPubkey = 'a'.repeat(64);
        const rendered = await renderAuthenticatedMobileApp(`/chats?peer=${peerPubkey}`, {
            directMessagesService: {
                subscribeInbox: vi.fn(() => () => {}),
                loadInitialConversations: vi.fn(async () => [{
                    id: 'chat-inbox-1',
                    clientMessageId: 'chat-inbox-1',
                    conversationId: peerPubkey,
                    peerPubkey,
                    direction: 'incoming' as const,
                    createdAt: 1700000100,
                    plaintext: 'hola alice',
                    deliveryState: 'sent' as const,
                }]),
                loadConversationMessages: vi.fn(async () => [{
                    id: 'chat-thread-1',
                    clientMessageId: 'chat-thread-1',
                    conversationId: peerPubkey,
                    peerPubkey,
                    direction: 'incoming' as const,
                    createdAt: 1700000101,
                    plaintext: 'hola alice',
                    deliveryState: 'sent' as const,
                }]),
                sendDm: vi.fn(),
            },
            fetchProfilesFn: vi.fn().mockResolvedValue({
                [SAMPLE_AUTH_PUBKEY]: { pubkey: SAMPLE_AUTH_PUBKEY, displayName: 'Owner' },
                [peerPubkey]: { pubkey: peerPubkey, displayName: 'Alice' },
            }),
        });
        mounted.push(rendered);

        await waitFor(() => (rendered.container.textContent || '').includes('hola alice'));

        const appBarTitle = rendered.container.querySelector('[data-testid="mobile-overlay-app-bar"] .nostr-mobile-app-bar-title');
        expect(appBarTitle?.textContent).toBe('Alice');
    });

    test('loads a direct Agora note detail route as the active thread', async () => {
        const noteId = 'd'.repeat(64);
        const ownerPubkey = persistDmCapableSession();
        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadThread as ReturnType<typeof vi.fn>).mockResolvedValue(createThreadResult(noteId));
        const { bridge } = createMapBridgeStub();

        const rendered = await renderApp(
            <>
                <App mapBridge={bridge} services={createBasicOverlayServices(ownerPubkey, { socialFeedService: socialFeed.service })} />
                <LocationProbe />
            </>,
            { initialEntries: [`/agora/notes/${noteId}`] }
        );
        mounted.push(rendered);

        await waitFor(() => (socialFeed.service.loadThread as ReturnType<typeof vi.fn>).mock.calls.length >= 1);

        expect((socialFeed.service.loadThread as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({ rootEventId: noteId });
        expect(getLocationText(rendered.container)).toBe(`/agora/notes/${noteId}`);
    });

    test('navigates to the canonical Agora note detail route when opening a feed note', async () => {
        const noteId = 'note-route-1';
        const ownerPubkey = persistDmCapableSession();
        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mockResolvedValue({
            items: [createFeedNote(noteId, 'a'.repeat(64), 100, 'feed note route')],
            hasMore: false,
        });
        (socialFeed.service.loadThread as ReturnType<typeof vi.fn>).mockResolvedValue(createThreadResult(noteId, 'feed note route'));
        const { bridge } = createMapBridgeStub();

        const rendered = await renderApp(
            <>
                <App
                    mapBridge={bridge}
                    services={createBasicOverlayServices(ownerPubkey, {
                        socialFeedService: socialFeed.service,
                        fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                            ownerPubkey,
                            follows: ['a'.repeat(64)],
                            relayHints: [],
                        }),
                    })}
                />
                <LocationProbe />
            </>,
            { initialEntries: ['/agora'] }
        );
        mounted.push(rendered);

        await waitFor(() => Boolean(rendered.container.querySelector('button[aria-label="Responder (0)"]')));
        const openThreadButton = rendered.container.querySelector('button[aria-label="Responder (0)"]') as HTMLButtonElement;

        await act(async () => {
            openThreadButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => getLocationText(rendered.container) === `/agora/notes/${noteId}`);
    });

    test('returns from Agora note detail to Agora with focus state', async () => {
        const noteId = 'focus-note-1';
        const ownerPubkey = persistDmCapableSession();
        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadThread as ReturnType<typeof vi.fn>).mockResolvedValue(createThreadResult(noteId));
        const { bridge } = createMapBridgeStub();

        const rendered = await renderApp(
            <>
                <App mapBridge={bridge} services={createBasicOverlayServices(ownerPubkey, { socialFeedService: socialFeed.service })} />
                <LocationProbe />
            </>,
            { initialEntries: [{ pathname: `/agora/notes/${noteId}`, state: { returnTo: '/agora', returnFocusEventId: noteId } }] }
        );
        mounted.push(rendered);

        await waitFor(() => Boolean(rendered.container.querySelector('.nostr-following-feed-back')));
        const backButton = rendered.container.querySelector('.nostr-following-feed-back') as HTMLButtonElement;

        await act(async () => {
            backButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => getLocationText(rendered.container) === '/agora');
    });

    test('replaces note detail history entry when returning to Agora', async () => {
        const noteId = 'focus-note-history';
        const ownerPubkey = persistDmCapableSession();
        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mockResolvedValue({
            items: [createFeedNote(noteId, 'a'.repeat(64), 100, 'feed note history')],
            hasMore: false,
        });
        (socialFeed.service.loadThread as ReturnType<typeof vi.fn>).mockResolvedValue(createThreadResult(noteId, 'feed note history'));
        const { bridge } = createMapBridgeStub();

        const rendered = await renderApp(
            <>
                <App
                    mapBridge={bridge}
                    services={createBasicOverlayServices(ownerPubkey, {
                        socialFeedService: socialFeed.service,
                        fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                            ownerPubkey,
                            follows: ['a'.repeat(64)],
                            relayHints: [],
                        }),
                    })}
                />
                <LocationProbe />
                <HistoryBackProbe />
            </>,
            { initialEntries: ['/agora'] }
        );
        mounted.push(rendered);

        await waitFor(() => Boolean(rendered.container.querySelector('button[aria-label="Responder (0)"]')));
        const openThreadButton = rendered.container.querySelector('button[aria-label="Responder (0)"]') as HTMLButtonElement;

        await act(async () => {
            openThreadButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => getLocationText(rendered.container) === `/agora/notes/${noteId}`);
        await waitFor(() => Boolean(rendered.container.querySelector('.nostr-following-feed-back')));
        const backButton = rendered.container.querySelector('.nostr-following-feed-back') as HTMLButtonElement;

        await act(async () => {
            backButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => getLocationText(rendered.container) === '/agora');

        const historyBackButton = rendered.container.querySelector('[data-testid="history-back-probe"]') as HTMLButtonElement;
        await act(async () => {
            historyBackButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(getLocationText(rendered.container)).not.toBe(`/agora/notes/${noteId}`);
    });

    test('does not reopen note detail from browser history after desktop return to Agora', async () => {
        window.history.replaceState(null, '', '/app/');
        window.history.pushState(null, '', '/app/agora');
        const noteId = 'focus-note-browser-history';
        const ownerPubkey = persistDmCapableSession();
        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mockResolvedValue({
            items: [createFeedNote(noteId, 'a'.repeat(64), 100, 'feed note browser history')],
            hasMore: false,
        });
        (socialFeed.service.loadThread as ReturnType<typeof vi.fn>).mockResolvedValue(createThreadResult(noteId, 'feed note browser history'));
        const { bridge } = createMapBridgeStub();

        const rendered = await renderBrowserApp(
            <>
                <App
                    mapBridge={bridge}
                    services={createBasicOverlayServices(ownerPubkey, {
                        socialFeedService: socialFeed.service,
                        fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                            ownerPubkey,
                            follows: ['a'.repeat(64)],
                            relayHints: [],
                        }),
                    })}
                />
                <LocationProbe />
                <BrowserHistoryBackProbe />
            </>,
            '/app',
        );
        mounted.push(rendered);

        await waitFor(() => Boolean(rendered.container.querySelector('button[aria-label="Responder (0)"]')));
        const openThreadButton = rendered.container.querySelector('button[aria-label="Responder (0)"]') as HTMLButtonElement;

        await act(async () => {
            openThreadButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => getLocationText(rendered.container) === `/agora/notes/${noteId}`);
        await waitFor(() => Boolean(rendered.container.querySelector('.nostr-following-feed-back')));
        const backButton = rendered.container.querySelector('.nostr-following-feed-back') as HTMLButtonElement;

        await act(async () => {
            backButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => getLocationText(rendered.container) === '/agora');

        const browserHistoryBackButton = rendered.container.querySelector('[data-testid="browser-history-back-probe"]') as HTMLButtonElement;
        await act(async () => {
            browserHistoryBackButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        expect(getLocationText(rendered.container)).not.toBe(`/agora/notes/${noteId}`);
    });

    test('returns from filtered Agora note detail to the filtered Agora route', async () => {
        const noteId = 'focus-note-filtered';
        const ownerPubkey = persistDmCapableSession();
        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadThread as ReturnType<typeof vi.fn>).mockResolvedValue(createThreadResult(noteId));
        const { bridge } = createMapBridgeStub();

        const rendered = await renderApp(
            <>
                <App mapBridge={bridge} services={createBasicOverlayServices(ownerPubkey, { socialFeedService: socialFeed.service })} />
                <LocationProbe />
            </>,
            { initialEntries: [{ pathname: `/agora/notes/${noteId}`, state: { returnTo: '/agora?tag=nostr', returnFocusEventId: noteId } }] }
        );
        mounted.push(rendered);

        await waitFor(() => Boolean(rendered.container.querySelector('.nostr-following-feed-back')));
        const backButton = rendered.container.querySelector('.nostr-following-feed-back') as HTMLButtonElement;

        await act(async () => {
            backButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => getLocationText(rendered.container) === '/agora?tag=nostr');
    });

    test('returns to notifications after opening a notification note detail', async () => {
        const noteId = 'b'.repeat(64);
        const actorPubkey = 'a'.repeat(64);
        const ownerPubkey = persistDmCapableSession();
        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadThread as ReturnType<typeof vi.fn>).mockResolvedValue(createThreadResult(noteId));
        const notifications = createSocialNotificationsServiceMock();
        (notifications.service.loadInitialSocial as ReturnType<typeof vi.fn>).mockResolvedValue({
            items: [{
                id: 'mention-1',
                pubkey: actorPubkey,
                kind: 1,
                created_at: 100,
                tags: [['p', ownerPubkey], ['e', noteId]],
                content: 'mentioned you',
            }],
            hasMore: false,
            nextSince: null,
        });
        const { bridge } = createMapBridgeStub();

        const rendered = await renderApp(
            <>
                <App
                    mapBridge={bridge}
                    services={createBasicOverlayServices(ownerPubkey, {
                        socialFeedService: socialFeed.service,
                        socialNotificationsService: notifications.service,
                        fetchProfilesFn: vi.fn().mockResolvedValue({
                            [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                            [actorPubkey]: { pubkey: actorPubkey, displayName: 'Alice' },
                        }),
                    })}
                />
                <LocationProbe />
            </>,
            { initialEntries: ['/notifications'] }
        );
        mounted.push(rendered);

        await waitFor(() => Boolean(rendered.container.querySelector('[data-slot="notification-target-note"]')));
        const noteButton = rendered.container.querySelector('[data-slot="notification-target-note"]') as HTMLButtonElement;

        await act(async () => {
            noteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => getLocationText(rendered.container) === `/agora/notes/${noteId}`);
        await waitFor(() => Boolean(rendered.container.querySelector('.nostr-following-feed-back')));
        const backButton = rendered.container.querySelector('.nostr-following-feed-back') as HTMLButtonElement;

        await act(async () => {
            backButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => getLocationText(rendered.container) === '/notifications');
    });

    test('uses mobile app bar back to close note detail with the same return behavior', async () => {
        const noteId = 'mobile-note-1';
        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadThread as ReturnType<typeof vi.fn>).mockResolvedValue(createThreadResult(noteId));

        const rendered = await renderAuthenticatedMobileApp(`/agora/notes/${noteId}`, { socialFeedService: socialFeed.service });
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('button[aria-label="Volver"]') !== null);
        const backButton = rendered.container.querySelector('button[aria-label="Volver"]') as HTMLButtonElement;

        await act(async () => {
            backButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => getLocationText(rendered.container) === '/agora');
    });

    test('does not reopen note detail from mobile app history after returning to Agora', async () => {
        setMobileViewport();
        const noteId = 'mobile-note-history-loop';
        const ownerPubkey = persistDmCapableSession();
        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mockResolvedValue({
            items: [createFeedNote(noteId, 'a'.repeat(64), 100, 'feed note mobile history')],
            hasMore: false,
        });
        (socialFeed.service.loadThread as ReturnType<typeof vi.fn>).mockResolvedValue(createThreadResult(noteId, 'feed note mobile history'));
        const { bridge } = createMapBridgeStub();

        const rendered = await renderApp(
            <>
                <App
                    mapBridge={bridge}
                    services={createBasicOverlayServices(ownerPubkey, {
                        socialFeedService: socialFeed.service,
                        fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                            ownerPubkey,
                            follows: ['a'.repeat(64)],
                            relayHints: [],
                        }),
                    })}
                />
                <LocationProbe />
            </>,
            { initialEntries: ['/agora'] }
        );
        mounted.push(rendered);

        await waitFor(() => Boolean(rendered.container.querySelector('button[aria-label="Responder (0)"]')));
        const openThreadButton = rendered.container.querySelector('button[aria-label="Responder (0)"]') as HTMLButtonElement;

        await act(async () => {
            openThreadButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => getLocationText(rendered.container) === `/agora/notes/${noteId}`);
        await waitFor(() => rendered.container.querySelector('button[aria-label="Volver"]') !== null);
        const closeNoteButton = rendered.container.querySelector('button[aria-label="Volver"]') as HTMLButtonElement;

        await act(async () => {
            closeNoteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => getLocationText(rendered.container) === '/agora');
        expect(rendered.container.querySelector('button[aria-label="Volver"]')).toBeNull();
        expect(rendered.container.querySelector('[data-testid="mobile-bottom-navigation"]')).not.toBeNull();
    });

    test('closes global user search back to a filtered Agora route', async () => {
        const rendered = await renderAuthenticatedMobileApp('/agora?tag=nostr');
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('button[aria-label="Abrir navegación"]') !== null);
        const menuButton = rendered.container.querySelector('button[aria-label="Abrir navegación"]') as HTMLButtonElement;
        await act(async () => {
            menuButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => document.body.querySelector('button[aria-label="Abrir buscador global de usuarios"]') !== null);
        const searchButton = document.body.querySelector('button[aria-label="Abrir buscador global de usuarios"]') as HTMLButtonElement;
        await act(async () => {
            searchButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await waitFor(() => getLocationText(rendered.container) === '/user-search');

        const backButton = rendered.container.querySelector('button[aria-label="Volver"]') as HTMLButtonElement;
        await act(async () => {
            backButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => getLocationText(rendered.container) === '/agora?tag=nostr');
    });

    test('closes global user search back to notifications', async () => {
        const rendered = await renderAuthenticatedMobileApp('/notifications');
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('button[aria-label="Abrir navegación"]') !== null);
        const menuButton = rendered.container.querySelector('button[aria-label="Abrir navegación"]') as HTMLButtonElement;
        await act(async () => {
            menuButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => document.body.querySelector('button[aria-label="Abrir buscador global de usuarios"]') !== null);
        const searchButton = document.body.querySelector('button[aria-label="Abrir buscador global de usuarios"]') as HTMLButtonElement;
        await act(async () => {
            searchButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await waitFor(() => getLocationText(rendered.container) === '/user-search');

        const backButton = rendered.container.querySelector('button[aria-label="Volver"]') as HTMLButtonElement;
        await act(async () => {
            backButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => getLocationText(rendered.container) === '/notifications');
    });

    test('uses mobile app bar back from user search to the stored return route', async () => {
        setMobileViewport();
        const rendered = await renderApp(
            <>
                <App mapBridge={createMapBridgeStub().bridge} services={createBasicOverlayServices(persistDmCapableSession())} />
                <LocationProbe />
            </>,
            { initialEntries: [{ pathname: '/user-search', state: { returnTo: '/notifications' } }] }
        );
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('button[aria-label="Volver"]') !== null);
        const backButton = rendered.container.querySelector('button[aria-label="Volver"]') as HTMLButtonElement;

        await act(async () => {
            backButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => getLocationText(rendered.container) === '/notifications');
    });

    test('keeps the restoration state visible while a restored session is still loading', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followsDeferred = createDeferred<{ ownerPubkey: string; follows: string[]; relayHints: string[] }>();
        window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
            method: 'npub',
            pubkey: ownerPubkey,
            readonly: true,
            locked: false,
            createdAt: Date.now(),
        }));

        const { bridge } = createMapBridgeStub(4);
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockImplementation(async () => followsDeferred.promise),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />,
            { initialEntries: ['/login'] }
        );
        mounted.push(rendered);

        await waitFor(() => (rendered.container.textContent || '').includes('Recuperando sesión'));
        expect(rendered.container.textContent || '').not.toContain('Método de acceso');
        expect(rendered.container.querySelector('input[name="npub"]')).toBeNull();
        expect(rendered.container.textContent || '').toContain('Conectando a relays...');

        await act(async () => {
            followsDeferred.resolve({
                ownerPubkey,
                follows: [],
                relayHints: [],
            });
        });

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') === null);
    });

    test('shows the login form once restoration resolves without a persisted session', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App mapBridge={bridge} services={createBasicOverlayServices()} />,
            { initialEntries: ['/login'] }
        );
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') !== null);
        expect(rendered.container.textContent || '').toContain('Método de acceso');
        expect(rendered.container.textContent || '').not.toContain('Recuperando sesión');
    });

    test('returns to the login form when a restored session fails to load', async () => {
        const ownerPubkey = 'f'.repeat(64);
        window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
            method: 'npub',
            pubkey: ownerPubkey,
            readonly: true,
            locked: false,
            createdAt: Date.now(),
        }));

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockRejectedValue(new Error('restore failed')),
                    fetchProfilesFn: vi.fn().mockResolvedValue({}),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />,
            { initialEntries: ['/login'] }
        );
        mounted.push(rendered);

        await waitFor(() => (rendered.container.textContent || '').includes('Método de acceso'));
        expect(rendered.container.textContent || '').not.toContain('Recuperando sesión');
        expect(rendered.container.querySelector('input[name="npub"]')).not.toBeNull();
    });

    test('redirects direct internal routes to /login when session is missing', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App mapBridge={bridge} services={createBasicOverlayServices()} />,
            { initialEntries: ['/city-stats'] }
        );
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') !== null);
        const content = rendered.container.textContent || '';

        expect(content).toContain('Método de acceso');
        expect(content).not.toContain('Estadísticas de la ciudad');
    });

    test('does not render redundant profile identity block in information tab', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge } = createMapBridgeStub(1);
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={createBasicOverlayServices(ownerPubkey, {
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: {
                            pubkey: ownerPubkey,
                            displayName: 'Owner',
                            picture: 'https://example.com/avatar.png',
                        },
                        [followedPubkey]: { pubkey: followedPubkey, displayName: 'Alice' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                })}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
        expect(rendered.container.textContent || '').not.toContain('Accede o explora');
        expect(rendered.container.textContent || '').not.toContain('Modo solo lectura. Cambia a extensión o búnker para habilitar acciones de escritura.');
        expect(rendered.container.textContent || '').toContain('Solo lectura');

        expect(rendered.container.querySelector('.nostr-profile-avatar')).toBeNull();
        expect(rendered.container.querySelector('.nostr-profile-name')).toBeNull();
    });

    test('renders city stats button in sidebar and regenerate button on map controls', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={createBasicOverlayServices(ownerPubkey, {
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                })}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') === null);

        const toolbarButtons = Array.from(rendered.container.querySelectorAll('.nostr-panel-toolbar button')) as HTMLButtonElement[];
        expect(toolbarButtons.length).toBeGreaterThanOrEqual(4);
        expect(toolbarButtons[0]?.getAttribute('aria-label')).toBe('Abrir mapa');
        expect(toolbarButtons.some((button) => button.getAttribute('aria-label') === 'Abrir estadísticas de la ciudad')).toBe(true);
        expect(toolbarButtons.some((button) => button.getAttribute('aria-label') === 'Abrir descubre')).toBe(true);
        expect(toolbarButtons.some((button) => button.getAttribute('aria-label') === 'Regenerar mapa')).toBe(false);
        expect(rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir chats"]')).not.toBeNull();

        const statsButton = rendered.container.querySelector('button[aria-label="Abrir estadísticas de la ciudad"]') as HTMLButtonElement;
        const optionsButton = rendered.container.querySelector('button[aria-label="Opciones del mapa"]') as HTMLButtonElement;

        expect(statsButton).toBeDefined();
        expect(optionsButton).toBeDefined();
        const settingsButton = rendered.container.querySelector('button[aria-label="Abrir ajustes"]') as HTMLButtonElement;
        expect(settingsButton.getAttribute('title')).toBe('Ajustes');

        await waitFor(() => (bridge.regenerateMap as any).mock.calls.length > 0);
        (bridge.regenerateMap as any).mockClear();

        await openDropdownTrigger(optionsButton);
        const regenerateItem = Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Regenerar mapa'
        ) as HTMLElement;
        expect(regenerateItem).toBeDefined();

        await act(async () => {
            regenerateItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (bridge.regenerateMap as any).mock.calls.length > 0);
        expect(bridge.regenerateMap).toHaveBeenCalledTimes(1);

        await act(async () => {
            statsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.container.textContent || '').toContain('Estadísticas de la ciudad');
    });

    test('renders global user search button in panel and compact toolbar', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={createBasicOverlayServices(ownerPubkey, {
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                })}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const panelSearchButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir buscador global de usuarios"]');
        expect(panelSearchButton).not.toBeNull();

        const hidePanelButton = rendered.container.querySelector('button[aria-label="Ocultar panel"]') as HTMLButtonElement;
        await act(async () => {
            hidePanelButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const compactSearchButton = rendered.container.querySelector('.nostr-compact-toolbar button[aria-label="Abrir buscador global de usuarios"]');
        expect(compactSearchButton).not.toBeNull();
    });

    test('opens global user search dialog from toolbar', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={createBasicOverlayServices(ownerPubkey, {
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                })}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const searchButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir buscador global de usuarios"]') as HTMLButtonElement;
        expect(searchButton).toBeDefined();

        await act(async () => {
            searchButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.container.textContent || '').toContain('Buscar usuarios globalmente');
    });

    test('renders following feed button in panel and compact toolbar when session is active', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const panelFeedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Ágora"]');
        expect(panelFeedButton).not.toBeNull();

        const hidePanelButton = rendered.container.querySelector('button[aria-label="Ocultar panel"]') as HTMLButtonElement;
        await act(async () => {
            hidePanelButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const compactFeedButton = rendered.container.querySelector('.nostr-compact-toolbar button[aria-label="Abrir Ágora"]');
        expect(compactFeedButton).not.toBeNull();
    });

    test('opens following feed dialog from toolbar and requests first page', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadFollowingFeed as any).mockResolvedValue({
            items: [
                {
                    id: 'note-1',
                    pubkey: 'a'.repeat(64),
                    createdAt: 100,
                    content: 'hola feed',
                    kind: 'note',
                    rawEvent: {
                        id: 'note-1',
                        pubkey: 'a'.repeat(64),
                        kind: 1,
                        created_at: 100,
                        tags: [],
                        content: 'hola feed',
                    },
                },
            ],
            hasMore: false,
        });

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: ['a'.repeat(64)],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Ágora"]') as HTMLButtonElement;
        expect(feedButton).toBeDefined();

        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Agora'));
        await waitFor(() => (rendered.container.textContent || '').includes('hola feed'));
        expect(socialFeed.service.loadFollowingFeed).toHaveBeenCalled();
        expect((socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({ limit: 10 });
    });

    test('loads more feed and thread pages through query controller pagination', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                items: [
                    {
                        id: 'note-1',
                        pubkey: 'a'.repeat(64),
                        createdAt: 100,
                        content: 'page-1',
                        kind: 'note',
                        rawEvent: {
                            id: 'note-1',
                            pubkey: 'a'.repeat(64),
                            kind: 1,
                            created_at: 100,
                            tags: [],
                            content: 'page-1',
                        },
                    },
                ],
                hasMore: true,
                nextUntil: 90,
            })
            .mockResolvedValueOnce({
                items: [
                    {
                        id: 'note-2',
                        pubkey: 'b'.repeat(64),
                        createdAt: 90,
                        content: 'page-2',
                        kind: 'note',
                        rawEvent: {
                            id: 'note-2',
                            pubkey: 'b'.repeat(64),
                            kind: 1,
                            created_at: 90,
                            tags: [],
                            content: 'page-2',
                        },
                    },
                ],
                hasMore: false,
                nextUntil: undefined,
            });
        (socialFeed.service.loadThread as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                root: {
                    id: 'note-1',
                    pubkey: 'a'.repeat(64),
                    createdAt: 100,
                    eventKind: 1,
                    content: 'root',
                    rawEvent: {
                        id: 'note-1',
                        pubkey: 'a'.repeat(64),
                        kind: 1,
                        created_at: 100,
                        tags: [],
                        content: 'root',
                    },
                },
                replies: [
                    {
                        id: 'reply-1',
                        pubkey: 'b'.repeat(64),
                        createdAt: 95,
                        eventKind: 1,
                        content: 'reply-1',
                        targetEventId: 'note-1',
                        rawEvent: {
                            id: 'reply-1',
                            pubkey: 'b'.repeat(64),
                            kind: 1,
                            created_at: 95,
                            tags: [['e', 'note-1', '', 'reply']],
                            content: 'reply-1',
                        },
                    },
                ],
                hasMore: true,
                nextUntil: 70,
            })
            .mockResolvedValueOnce({
                root: null,
                replies: [
                    {
                        id: 'reply-2',
                        pubkey: 'c'.repeat(64),
                        createdAt: 70,
                        eventKind: 1,
                        content: 'reply-2',
                        targetEventId: 'note-1',
                        rawEvent: {
                            id: 'reply-2',
                            pubkey: 'c'.repeat(64),
                            kind: 1,
                            created_at: 70,
                            tags: [['e', 'note-1', '', 'reply']],
                            content: 'reply-2',
                        },
                    },
                ],
                hasMore: false,
                nextUntil: undefined,
            });

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Ágora"]') as HTMLButtonElement;
        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mock.calls.length >= 1);

        const feedList = rendered.container.querySelector('[data-testid="following-feed-list"]') as HTMLDivElement | null;
        expect(feedList).not.toBeNull();
        expect(Array.from(rendered.container.querySelectorAll('button')).some((button) =>
            (button.textContent || '').includes('Cargar más')
        )).toBe(false);

        Object.defineProperty(feedList, 'scrollHeight', { configurable: true, value: 500 });
        Object.defineProperty(feedList, 'clientHeight', { configurable: true, value: 300 });
        Object.defineProperty(feedList, 'scrollTop', { configurable: true, value: 130 });
        await act(async () => {
            feedList?.dispatchEvent(new Event('scroll', { bubbles: true }));
        });

        await waitFor(() => (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mock.calls.length >= 2);

        const feedCalls = (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mock.calls;
        expect(feedCalls[0]?.[0]).toMatchObject({ limit: 10 });
        expect(feedCalls[0]?.[0]).not.toHaveProperty('until');
        expect(feedCalls[1]?.[0]).toMatchObject({ limit: 10, until: 90 });

        await waitFor(() => Boolean(rendered.container.querySelector('button[aria-label="Responder (0)"]')));
        const openThreadButton = rendered.container.querySelector('button[aria-label="Responder (0)"]') as HTMLButtonElement;
        await act(async () => {
            openThreadButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (socialFeed.service.loadThread as ReturnType<typeof vi.fn>).mock.calls.length >= 1);
        await waitFor(() => (rendered.container.textContent || '').includes('reply-1'));
        const threadList = rendered.container.querySelector('[data-testid="following-feed-thread-list"]') as HTMLDivElement | null;
        expect(threadList).not.toBeNull();
        expect(Array.from(rendered.container.querySelectorAll('button')).some((button) =>
            (button.textContent || '').includes('Cargar más respuestas')
        )).toBe(false);

        Object.defineProperty(threadList, 'scrollHeight', { configurable: true, value: 500 });
        Object.defineProperty(threadList, 'clientHeight', { configurable: true, value: 300 });
        Object.defineProperty(threadList, 'scrollTop', { configurable: true, value: 130 });

        await act(async () => {
            threadList?.dispatchEvent(new Event('scroll', { bubbles: true }));
        });

        await waitFor(() => (socialFeed.service.loadThread as ReturnType<typeof vi.fn>).mock.calls.length >= 2);
        const threadCalls = (socialFeed.service.loadThread as ReturnType<typeof vi.fn>).mock.calls;
        expect(threadCalls[0]?.[0]).toMatchObject({ rootEventId: 'note-1' });
        expect(threadCalls[0]?.[0]).not.toHaveProperty('until');
        expect(threadCalls[1]?.[0]).toMatchObject({ rootEventId: 'note-1', until: 70 });
    });

    test('buffers new agora items found by polling and applies them only after CTA click', { timeout: 15_000 }, async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        const intervalCallbacks: Array<() => void> = [];
        const setIntervalSpy = vi.spyOn(window, 'setInterval').mockImplementation(((handler: TimerHandler) => {
            if (typeof handler === 'function') {
                intervalCallbacks.push(handler as () => void);
            }
            return 1 as unknown as number;
        }) as typeof window.setInterval);
        const clearIntervalSpy = vi.spyOn(window, 'clearInterval').mockImplementation(() => undefined);
        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                items: [
                    createFeedNote('note-2', followedPubkey, 102, 'nota visible 2'),
                    createFeedNote('note-1', followedPubkey, 101, 'nota visible 1'),
                ],
                hasMore: false,
            })
            .mockResolvedValueOnce({
                items: [
                    createFeedNote('note-3', followedPubkey, 103, 'nota nueva'),
                    createFeedNote('note-2', followedPubkey, 102, 'nota visible 2'),
                    createFeedNote('note-1', followedPubkey, 101, 'nota visible 1'),
                ],
                hasMore: false,
            });

        try {
            const { bridge } = createMapBridgeStub();
            const rendered = await renderApp(
                <App
                    mapBridge={bridge}
                    services={{
                        createClient: () => ({
                            connect: async () => {},
                            fetchLatestReplaceableEvent: async () => null,
                            fetchEvents: async () => [],
                        }),
                        fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                            ownerPubkey,
                            follows: [followedPubkey],
                            relayHints: [],
                        }),
                        fetchProfilesFn: vi.fn().mockResolvedValue({
                            [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        }),
                        fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                            followers: [],
                            scannedBatches: 1,
                            complete: true,
                        }),
                        socialFeedService: socialFeed.service,
                    }}
                />,
                { initialEntries: ['/'] }
            );
            mounted.push(rendered);

            await loginWithNip07(rendered.container);
            await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

            const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Ágora"]') as HTMLButtonElement;
            expect(feedButton).toBeDefined();

            await act(async () => {
                feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });

            await waitFor(() => (rendered.container.textContent || '').includes('nota visible 2'));
            expect(rendered.container.textContent || '').not.toContain('nota nueva');
            expect(intervalCallbacks.length).toBeGreaterThan(0);

            await act(async () => {
                for (const callback of intervalCallbacks) {
                    await callback();
                }
            });

            await waitFor(() => (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mock.calls.length >= 2);
            await waitFor(() => (rendered.container.textContent || '').includes('Ver 1 nota nueva'));

            const applyButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
                (button.textContent || '').includes('Ver 1 nota nueva')
            ) as HTMLButtonElement;
            expect(applyButton).toBeDefined();

            await act(async () => {
                applyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });

            await waitFor(() => (rendered.container.textContent || '').includes('nota nueva'));
            expect(rendered.container.textContent || '').not.toContain('Ver 1 nota nueva');
        } finally {
            setIntervalSpy.mockRestore();
            clearIntervalSpy.mockRestore();
        }
    });

    test('applying buffered agora updates resets the historical pagination cursor to the latest first page', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        const intervalCallbacks: Array<() => void> = [];
        const setIntervalSpy = vi.spyOn(window, 'setInterval').mockImplementation(((handler: TimerHandler) => {
            if (typeof handler === 'function') {
                intervalCallbacks.push(handler as () => void);
            }
            return 1 as unknown as number;
        }) as typeof window.setInterval);
        const clearIntervalSpy = vi.spyOn(window, 'clearInterval').mockImplementation(() => undefined);

        const initialItems = Array.from({ length: 10 }, (_, index) =>
            createFeedNote(`old-${index + 1}`, followedPubkey, 110 - index, `nota vieja ${index + 1}`)
        );
        const refreshedItems = Array.from({ length: 10 }, (_, index) =>
            createFeedNote(`new-${index + 1}`, followedPubkey, 210 - index, `nota nueva ${index + 1}`)
        );

        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                items: initialItems,
                hasMore: true,
                nextUntil: 100,
            })
            .mockResolvedValueOnce({
                items: refreshedItems,
                hasMore: true,
                nextUntil: 200,
            })
            .mockResolvedValueOnce({
                items: [createFeedNote('older-after-refresh', followedPubkey, 199, 'pagina siguiente tras refresh')],
                hasMore: false,
                nextUntil: undefined,
            });

        try {
            const { bridge } = createMapBridgeStub();
            const rendered = await renderApp(
                <App
                    mapBridge={bridge}
                    services={{
                        createClient: () => ({
                            connect: async () => {},
                            fetchLatestReplaceableEvent: async () => null,
                            fetchEvents: async () => [],
                        }),
                        fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                            ownerPubkey,
                            follows: [followedPubkey],
                            relayHints: [],
                        }),
                        fetchProfilesFn: vi.fn().mockResolvedValue({
                            [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        }),
                        fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                            followers: [],
                            scannedBatches: 1,
                            complete: true,
                        }),
                        socialFeedService: socialFeed.service,
                    }}
                />,
                { initialEntries: ['/'] }
            );
            mounted.push(rendered);

            await loginWithNip07(rendered.container);
            await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

            const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Ágora"]') as HTMLButtonElement;
            expect(feedButton).toBeDefined();

            await act(async () => {
                feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });

            await waitFor(() => (rendered.container.textContent || '').includes('nota vieja 1'));
            expect(intervalCallbacks.length).toBeGreaterThan(0);

            await act(async () => {
                for (const callback of intervalCallbacks) {
                    await callback();
                }
            });

            await waitFor(() => (rendered.container.textContent || '').includes('Ver 10 notas nuevas'));

            const applyButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
                (button.textContent || '').includes('Ver 10 notas nuevas')
            ) as HTMLButtonElement;
            expect(applyButton).toBeDefined();

            await act(async () => {
                applyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });

            await waitFor(() => (rendered.container.textContent || '').includes('nota nueva 1'));

            const feedList = rendered.container.querySelector('[data-testid="following-feed-list"]') as HTMLDivElement | null;
            expect(feedList).not.toBeNull();

            Object.defineProperty(feedList, 'scrollHeight', { configurable: true, value: 500 });
            Object.defineProperty(feedList, 'clientHeight', { configurable: true, value: 300 });
            Object.defineProperty(feedList, 'scrollTop', { configurable: true, value: 130 });

            await act(async () => {
                feedList?.dispatchEvent(new Event('scroll', { bubbles: true }));
            });

            await waitFor(() => (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mock.calls.length >= 3);

            const feedCalls = (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mock.calls;
            expect(feedCalls[2]?.[0]).toMatchObject({ limit: 10, until: 200 });
        } finally {
            setIntervalSpy.mockRestore();
            clearIntervalSpy.mockRestore();
        }
    });

    test('manual agora refresh reloads first page and applies newly found items immediately', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                items: [
                    createFeedNote('note-2', followedPubkey, 102, 'nota visible 2'),
                    createFeedNote('note-1', followedPubkey, 101, 'nota visible 1'),
                ],
                hasMore: false,
            })
            .mockResolvedValueOnce({
                items: [
                    createFeedNote('note-3', followedPubkey, 103, 'nota refrescada'),
                    createFeedNote('note-2', followedPubkey, 102, 'nota visible 2'),
                    createFeedNote('note-1', followedPubkey, 101, 'nota visible 1'),
                ],
                hasMore: false,
            });

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />,
            { initialEntries: ['/'] }
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Ágora"]') as HTMLButtonElement;
        expect(feedButton).toBeDefined();

        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('nota visible 2'));
        expect(rendered.container.textContent || '').not.toContain('nota refrescada');

        const refreshButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'Actualizar'
        ) as HTMLButtonElement;
        expect(refreshButton).toBeDefined();

        await act(async () => {
            refreshButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mock.calls.length >= 2);
        await waitFor(() => (rendered.container.textContent || '').includes('nota refrescada'));
    });

    test('manual agora refresh shows loading state on refresh button while request is in flight', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        const deferredRefresh = createDeferred<{ items: ReturnType<typeof createFeedNote>[]; hasMore: boolean }>();
        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                items: [createFeedNote('note-1', followedPubkey, 101, 'nota visible 1')],
                hasMore: false,
            })
            .mockImplementationOnce(async () => deferredRefresh.promise);

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />,
            { initialEntries: ['/'] }
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Ágora"]') as HTMLButtonElement;
        expect(feedButton).toBeDefined();

        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('nota visible 1'));

        const refreshButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'Actualizar'
        ) as HTMLButtonElement;
        expect(refreshButton).toBeDefined();

        await act(async () => {
            refreshButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Actualizando'));
        const loadingRefreshButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Actualizando')
        ) as HTMLButtonElement;
        expect(loadingRefreshButton).toBeDefined();
        expect(loadingRefreshButton.disabled).toBe(true);
        expect(loadingRefreshButton.querySelector('svg[aria-label="Loading"]')).not.toBeNull();

        deferredRefresh.resolve({
            items: [
                createFeedNote('note-2', followedPubkey, 102, 'nota refrescada'),
                createFeedNote('note-1', followedPubkey, 101, 'nota visible 1'),
            ],
            hasMore: false,
        });

        await waitFor(() => (rendered.container.textContent || '').includes('nota refrescada'));
        await waitFor(() => (rendered.container.textContent || '').includes('Actualizar'));
    });

    test('shows a feed error when manual agora refresh fails', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                items: [createFeedNote('note-1', followedPubkey, 101, 'nota visible 1')],
                hasMore: false,
            })
            .mockRejectedValueOnce(new Error('fallo refresh manual'));

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />,
            { initialEntries: ['/'] }
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Ágora"]') as HTMLButtonElement;
        expect(feedButton).toBeDefined();

        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('nota visible 1'));

        const refreshButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'Actualizar'
        ) as HTMLButtonElement;
        expect(refreshButton).toBeDefined();

        await act(async () => {
            refreshButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('No se pudo actualizar el Agora. Intenta de nuevo.'));
    });

    test('surfaces polling refresh failures safely and clears the error after a later successful poll', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        const intervalCallbacks: Array<() => void> = [];
        const setIntervalSpy = vi.spyOn(window, 'setInterval').mockImplementation(((handler: TimerHandler) => {
            if (typeof handler === 'function') {
                intervalCallbacks.push(handler as () => void);
            }
            return 1 as unknown as number;
        }) as typeof window.setInterval);
        const clearIntervalSpy = vi.spyOn(window, 'clearInterval').mockImplementation(() => undefined);

        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                items: [createFeedNote('note-1', followedPubkey, 101, 'nota visible 1')],
                hasMore: false,
            })
            .mockRejectedValueOnce(new Error('fallo polling'))
            .mockResolvedValueOnce({
                items: [
                    createFeedNote('note-2', followedPubkey, 102, 'nota recuperada'),
                    createFeedNote('note-1', followedPubkey, 101, 'nota visible 1'),
                ],
                hasMore: false,
            });

        try {
            const { bridge } = createMapBridgeStub();
            const rendered = await renderApp(
                <App
                    mapBridge={bridge}
                    services={{
                        createClient: () => ({
                            connect: async () => {},
                            fetchLatestReplaceableEvent: async () => null,
                            fetchEvents: async () => [],
                        }),
                        fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                            ownerPubkey,
                            follows: [followedPubkey],
                            relayHints: [],
                        }),
                        fetchProfilesFn: vi.fn().mockResolvedValue({
                            [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        }),
                        fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                            followers: [],
                            scannedBatches: 1,
                            complete: true,
                        }),
                        socialFeedService: socialFeed.service,
                    }}
                />,
                { initialEntries: ['/'] }
            );
            mounted.push(rendered);

            await loginWithNip07(rendered.container);
            await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

            const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Ágora"]') as HTMLButtonElement;
            expect(feedButton).toBeDefined();

            await act(async () => {
                feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });

            await waitFor(() => (rendered.container.textContent || '').includes('nota visible 1'));
            expect(intervalCallbacks.length).toBeGreaterThan(0);

            await act(async () => {
                for (const callback of intervalCallbacks) {
                    await callback();
                }
            });

            await waitFor(() => (rendered.container.textContent || '').includes('No se pudo actualizar el Agora. Intenta de nuevo.'));
            expect(rendered.container.textContent || '').not.toContain('nota recuperada');

            await act(async () => {
                for (const callback of intervalCallbacks) {
                    await callback();
                }
            });

        await waitFor(() => (rendered.container.textContent || '').includes('Ver 1 nota nueva'));
            expect(rendered.container.textContent || '').not.toContain('No se pudo actualizar el Agora. Intenta de nuevo.');
        } finally {
            setIntervalSpy.mockRestore();
            clearIntervalSpy.mockRestore();
        }
    });

    test('applies optimistic reaction and repost counters and rolls back on mutation failure', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const eventId = '1'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mockResolvedValue({
            items: [
                {
                    id: eventId,
                    pubkey: 'a'.repeat(64),
                    createdAt: 100,
                    content: 'optimistic target',
                    kind: 'note',
                    rawEvent: {
                        id: eventId,
                        pubkey: 'a'.repeat(64),
                        kind: 1,
                        created_at: 100,
                        tags: [],
                        content: 'optimistic target',
                    },
                },
            ],
            hasMore: false,
        });
        (socialFeed.service.loadEngagement as ReturnType<typeof vi.fn>).mockResolvedValue({
            [eventId]: {
                replies: 0,
                reposts: 2,
                reactions: 3,
                zaps: 0,
                zapSats: 0,
            },
        });

        const reactionFailure = createDeferred<never>();
        const repostFailure = createDeferred<never>();
        const publishEvent = vi.fn(async (event: { kind: number }) => {
            if (event.kind === 7) {
                return reactionFailure.promise;
            }

            if (event.kind === 6) {
                return repostFailure.promise;
            }

            if (event.kind === 5) {
                return {
                    id: 'd'.repeat(64),
                    pubkey: ownerPubkey,
                    kind: 5,
                    created_at: 200,
                    tags: [],
                    content: '',
                };
            }

            return {
                id: 'x'.repeat(64),
                pubkey: ownerPubkey,
                kind: event.kind,
                created_at: 200,
                tags: [],
                content: '',
            };
        });
        vi.spyOn(writeGatewayModule, 'createWriteGateway').mockReturnValue({
            publishEvent,
            publishTextNote: vi.fn(async (content: string) => ({
                id: 'y'.repeat(64),
                pubkey: ownerPubkey,
                kind: 1,
                created_at: 200,
                tags: [],
                content,
            })),
            encryptDm: vi.fn(async (_pubkey: string, plaintext: string) => plaintext),
            decryptDm: vi.fn(async (_pubkey: string, ciphertext: string) => ciphertext),
        } as any);

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: ['a'.repeat(64)],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Ágora"]') as HTMLButtonElement;
        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => rendered.container.querySelector('.nostr-following-feed-surface') !== null);
        await waitFor(() => Boolean(rendered.container.querySelector('button[aria-label="Reaccionar (3)"]')));

        const repostButton = rendered.container.querySelector('button[aria-label="Repostear (2)"]') as HTMLButtonElement;
        await act(async () => {
            repostButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            repostButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const repostItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Repost'
        ) as HTMLElement;

        await act(async () => {
            repostItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => Boolean(rendered.container.querySelector('button[aria-label="Repostear (3)"]')));
        expect((rendered.container.querySelector('button[aria-label="Repostear (3)"]') as HTMLButtonElement).disabled).toBe(true);
        await act(async () => {
            repostFailure.reject(new Error('repost-failed'));
        });
        await waitFor(() => Boolean(rendered.container.querySelector('button[aria-label="Repostear (2)"]')));
        await waitFor(() => (rendered.container.textContent || '').includes('repost-failed'));

        const reactionButton = rendered.container.querySelector('button[aria-label="Reaccionar (3)"]') as HTMLButtonElement;

        await act(async () => {
            reactionButton.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
            reactionButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).some((item) =>
            item.getAttribute('aria-label') === 'Reaccionar con 🔥'
        ));
        const fireReactionItem = Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).find((item) =>
            item.getAttribute('aria-label') === 'Reaccionar con 🔥'
        ) as HTMLElement;

        await act(async () => {
            fireReactionItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => publishEvent.mock.calls.some(([event]) => event.kind === 7 && (event as { content?: string }).content === '🔥'));

        await act(async () => {
            reactionFailure.reject(new Error('reaction-failed'));
        });
        await waitFor(() => (rendered.container.textContent || '').includes('reaction-failed'));

        expect(publishEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: 7 }));
        expect(publishEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: 6 }));
    });

    test('loads an existing emoji reaction and removes it with a deletion event', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const eventId = '2'.repeat(64);
        const reactionEventId = '7'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mockResolvedValue({
            items: [createFeedNote(eventId, 'a'.repeat(64), 100, 'already reacted')],
            hasMore: false,
        });
        (socialFeed.service.loadEngagement as ReturnType<typeof vi.fn>).mockResolvedValue({
            [eventId]: {
                replies: 0,
                reposts: 0,
                reactions: 4,
                zaps: 0,
                zapSats: 0,
            },
        });
        (socialFeed.service.loadViewerReactions as ReturnType<typeof vi.fn>).mockResolvedValue({
            [eventId]: {
                eventId,
                reactionEventId,
                emoji: '👏',
                createdAt: 120,
            },
        });
        const publishEvent = vi.fn(async (event: { kind: number; tags: string[][]; content: string; created_at: number }) => ({
            id: 'd'.repeat(64),
            pubkey: ownerPubkey,
            ...event,
        }));
        vi.spyOn(writeGatewayModule, 'createWriteGateway').mockReturnValue({
            publishEvent,
            publishTextNote: vi.fn(),
            encryptDm: vi.fn(async (_pubkey: string, plaintext: string) => plaintext),
            decryptDm: vi.fn(async (_pubkey: string, ciphertext: string) => ciphertext),
        } as any);

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: ['a'.repeat(64)],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Ágora"]') as HTMLButtonElement;
        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => Array.from(rendered.container.querySelectorAll('button')).some((button) =>
            button.getAttribute('aria-label') === 'Quitar reacción 👏 (4)'
        ));
        const reactionButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            button.getAttribute('aria-label') === 'Quitar reacción 👏 (4)'
        ) as HTMLButtonElement;

        await act(async () => {
            reactionButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => publishEvent.mock.calls.some(([event]) => event.kind === 5));
        expect(publishEvent).toHaveBeenCalledWith(expect.objectContaining({
            kind: 5,
            tags: [['e', reactionEventId], ['k', '7']],
        }));
    });

    test('inserts optimistic reply and reconciles to published reply', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mockResolvedValue({
            items: [
                {
                    id: 'note-1',
                    pubkey: 'a'.repeat(64),
                    createdAt: 100,
                    content: 'root note',
                    kind: 'note',
                    rawEvent: {
                        id: 'note-1',
                        pubkey: 'a'.repeat(64),
                        kind: 1,
                        created_at: 100,
                        tags: [],
                        content: 'root note',
                    },
                },
            ],
            hasMore: false,
        });
        (socialFeed.service.loadThread as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({
                root: {
                    id: 'note-1',
                    pubkey: 'a'.repeat(64),
                    createdAt: 100,
                    eventKind: 1,
                    content: 'root note',
                    rawEvent: {
                        id: 'note-1',
                        pubkey: 'a'.repeat(64),
                        kind: 1,
                        created_at: 100,
                        tags: [],
                        content: 'root note',
                    },
                },
                replies: [],
                hasMore: false,
            })
            .mockResolvedValue({
                root: {
                    id: 'note-1',
                    pubkey: 'a'.repeat(64),
                    createdAt: 100,
                    eventKind: 1,
                    content: 'root note',
                    rawEvent: {
                        id: 'note-1',
                        pubkey: 'a'.repeat(64),
                        kind: 1,
                        created_at: 100,
                        tags: [],
                        content: 'root note',
                    },
                },
                replies: [
                    {
                        id: 'reply-final',
                        pubkey: ownerPubkey,
                        createdAt: 220,
                        eventKind: 1,
                        content: 'respuesta final',
                        targetEventId: 'note-1',
                        rawEvent: {
                            id: 'reply-final',
                            pubkey: ownerPubkey,
                            kind: 1,
                            created_at: 220,
                            tags: [['e', 'note-1', '', 'root'], ['e', 'note-1', '', 'reply']],
                            content: 'respuesta final',
                        },
                    },
                ],
                hasMore: false,
            });

        const mentionPubkey = 'b'.repeat(64);
        const publishReplyDeferred = createDeferred<{
            id: string;
            pubkey: string;
            kind: number;
            created_at: number;
            tags: string[][];
            content: string;
            sig: string;
        }>();
        const publishTextNote = vi.fn(async (_content: string, tags?: string[][]) => {
            if (tags && tags.length > 0) {
                return publishReplyDeferred.promise;
            }

            return {
                id: 'z'.repeat(64),
                pubkey: ownerPubkey,
                kind: 1,
                created_at: 200,
                tags: [],
                content: _content,
                sig: '1'.repeat(128),
            };
        });

        vi.spyOn(writeGatewayModule, 'createWriteGateway').mockReturnValue({
            publishEvent: vi.fn(async () => ({
                id: 'w'.repeat(64),
                pubkey: ownerPubkey,
                kind: 7,
                created_at: 200,
                tags: [],
                content: '+',
            })),
            publishTextNote,
            encryptDm: vi.fn(async (_pubkey: string, plaintext: string) => plaintext),
            decryptDm: vi.fn(async (_pubkey: string, ciphertext: string) => ciphertext),
        } as any);

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: ['a'.repeat(64)],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    searchUsersFn: vi.fn(async () => ({
                        pubkeys: [mentionPubkey],
                        profiles: {
                            [mentionPubkey]: { pubkey: mentionPubkey, displayName: 'Bruno' },
                        },
                    })),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Ágora"]') as HTMLButtonElement;
        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => Boolean(rendered.container.querySelector('button[aria-label="Responder (0)"]')));
        const openThreadButton = rendered.container.querySelector('button[aria-label="Responder (0)"]') as HTMLButtonElement;
        await act(async () => {
            openThreadButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => document.body.querySelector('.nostr-following-feed-reply-box textarea') !== null);
        const replyTextarea = document.body.querySelector('.nostr-following-feed-reply-box textarea') as HTMLTextAreaElement | null;
        expect(replyTextarea).not.toBeNull();

        await fillTextarea(replyTextarea as HTMLTextAreaElement, 'respuesta optimista @br');
        await waitForMentionSuggestions();
        await chooseMentionSuggestion('Bruno');

        const sendReplyButton = Array.from(rendered.container.querySelectorAll('.nostr-following-feed-reply-box button')).find((button) =>
            (button.textContent || '').includes('Responder')
        ) as HTMLButtonElement;
        await waitFor(() => !sendReplyButton.disabled);

        await act(async () => {
            sendReplyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('respuesta optimista'));

        await act(async () => {
            publishReplyDeferred.resolve({
                id: 'reply-final',
                pubkey: ownerPubkey,
                kind: 1,
                created_at: 220,
                tags: [['e', 'note-1', '', 'root'], ['e', 'note-1', '', 'reply']],
                content: 'respuesta final',
                sig: '2'.repeat(128),
            });
        });

        await waitFor(() => (rendered.container.textContent || '').includes('respuesta final'));
        expect(rendered.container.textContent || '').not.toContain('respuesta optimista');

        const [replyContent, replyTags] = publishTextNote.mock.calls[0] as [string, string[][]];
        expect(replyContent).toContain('respuesta optimista');
        expect(replyContent).toContain('nostr:nprofile1');
        expect(replyTags).toEqual(expect.arrayContaining([
            ['e', 'note-1', '', 'root'],
            ['e', 'note-1', '', 'reply'],
            ['p', mentionPubkey],
        ]));
    });

    test('feed route hash entry keeps overlay renderable', async () => {
        const previousHash = window.location.hash;
        window.location.hash = '#/agora';

        try {
            const { bridge } = createMapBridgeStub();
            const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
            mounted.push(rendered);

            await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') !== null);
            expect(rendered.container.textContent || '').toContain('Método de acceso');
        } finally {
            window.location.hash = previousHash;
        }
    });

    test('following feed route opens from toolbar and renders routed surface', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: ['a'.repeat(64)],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Ágora"]') as HTMLButtonElement;
        expect(feedButton).toBeDefined();

        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Agora'));
        expect(rendered.container.textContent || '').not.toContain('Volver al mapa');
    });

    test('following feed route highlights active sidebar item and does not show legacy back button', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Ágora"]') as HTMLButtonElement;
        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Agora'));

        expect(rendered.container.textContent || '').not.toContain('Volver al mapa');
        expect(rendered.container.querySelector('button[aria-label="Abrir mapa"]')).not.toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Abrir Ágora"][data-active="true"]')).not.toBeNull();
    });

    test('following feed route returns back to map view from sidebar map action', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Ágora"]') as HTMLButtonElement;
        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Agora'));
        const closeButton = rendered.container.querySelector('button[aria-label="Abrir mapa"]') as HTMLButtonElement;
        expect(closeButton).toBeDefined();

        await act(async () => {
            closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => rendered.container.querySelector('.nostr-following-feed-surface') === null);
    });

    test('agora route loads first page when entering /agora directly', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: ['a'.repeat(64)],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />,
            { initialEntries: ['/agora'] }
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
        await waitFor(() => (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mock.calls.length > 0);
        expect((socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({ limit: 10 });
    });

    test('agora route with tag param loads hashtag feed and shows active filter', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: ['a'.repeat(64)],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />,
            { initialEntries: ['/agora?tag=%23NostrCity'] }
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
        expect((socialFeed.service.loadHashtagFeed as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
        expect(rendered.container.textContent || '').not.toContain('Filtrando por #nostrcity');
    });

    test('clears active hashtag filter and goes back to following timeline query', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mockResolvedValue({
            items: [
                {
                    id: 'note-hash-clear-1',
                    pubkey: 'a'.repeat(64),
                    createdAt: 100,
                    content: 'hola #NostrCity',
                    kind: 'note',
                    rawEvent: {
                        id: 'note-hash-clear-1',
                        pubkey: 'a'.repeat(64),
                        kind: 1,
                        created_at: 100,
                        tags: [['t', 'nostrcity']],
                        content: 'hola #NostrCity',
                    },
                },
            ],
            hasMore: false,
        });
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: ['a'.repeat(64)],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />,
            { initialEntries: ['/'] }
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Ágora"]') as HTMLButtonElement;
        expect(feedButton).toBeDefined();

        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => rendered.container.querySelector('button[aria-label="Filtrar por hashtag nostrcity"]') !== null);

        const hashtagButton = rendered.container.querySelector('button[aria-label="Filtrar por hashtag nostrcity"]') as HTMLButtonElement;
        expect(hashtagButton).toBeDefined();

        await act(async () => {
            hashtagButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (socialFeed.service.loadHashtagFeed as ReturnType<typeof vi.fn>).mock.calls.length > 0);

        const clearFilterButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'Quitar filtro'
        ) as HTMLButtonElement;
        expect(clearFilterButton).toBeDefined();

        await act(async () => {
            clearFilterButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mock.calls.length > 0);
        expect(rendered.container.textContent || '').toContain('Cronología en tiempo real de personas a las que sigues');
    });

    test('clicking a hashtag in agora activates hashtag route loading', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mockResolvedValue({
            items: [
                {
                    id: 'note-hash-1',
                    pubkey: 'a'.repeat(64),
                    createdAt: 100,
                    content: 'hola #NostrCity',
                    kind: 'note',
                    rawEvent: {
                        id: 'note-hash-1',
                        pubkey: 'a'.repeat(64),
                        kind: 1,
                        created_at: 100,
                        tags: [['t', 'nostrcity']],
                        content: 'hola #NostrCity',
                    },
                },
            ],
            hasMore: false,
        });

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: ['a'.repeat(64)],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />,
            { initialEntries: ['/'] }
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Ágora"]') as HTMLButtonElement;
        expect(feedButton).toBeDefined();

        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mock.calls.length > 0);
        await waitFor(() => rendered.container.querySelector('button[aria-label="Filtrar por hashtag nostrcity"]') !== null);

        const hashtagButton = rendered.container.querySelector('button[aria-label="Filtrar por hashtag nostrcity"]') as HTMLButtonElement;
        expect(hashtagButton).toBeDefined();

        await act(async () => {
            hashtagButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (socialFeed.service.loadHashtagFeed as ReturnType<typeof vi.fn>).mock.calls.length > 0);
        expect((socialFeed.service.loadHashtagFeed as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
            hashtag: 'nostrcity',
        });
        expect(rendered.container.textContent || '').toContain('Filtrando por #nostrcity');
    });

    test('resolves nostr nprofile mentions to names and chains profile dialogs from feed and dialog posts', async () => {
        const ownerPubkey = SAMPLE_AUTH_PUBKEY;
        const followedPubkey = 'a'.repeat(64);
        const firstMentionPubkey = 'b'.repeat(64);
        const secondMentionPubkey = 'c'.repeat(64);
        const firstMentionNprofile = nip19.nprofileEncode({ pubkey: firstMentionPubkey });
        const secondMentionNprofile = nip19.nprofileEncode({ pubkey: secondMentionPubkey });
        const socialFeed = createSocialFeedServiceMock();
        const { bridge } = createMapBridgeStub();

        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mockResolvedValue({
            items: [
                {
                    id: 'note-mention-feed-1',
                    pubkey: followedPubkey,
                    createdAt: 100,
                    content: `hola nostr:${firstMentionNprofile}`,
                    kind: 'note',
                    rawEvent: {
                        id: 'note-mention-feed-1',
                        pubkey: followedPubkey,
                        kind: 1,
                        created_at: 100,
                        tags: [],
                        content: `hola nostr:${firstMentionNprofile}`,
                    },
                },
            ],
            hasMore: false,
        });

        const fetchLatestPostsByPubkeyFn = vi.fn().mockImplementation(async ({ pubkey }: { pubkey: string }) => {
            if (pubkey === firstMentionPubkey) {
                return {
                    posts: [
                        {
                            id: 'post-mention-chain-1',
                            pubkey,
                            createdAt: 1_710_000_000,
                            content: `cadena nostr:${secondMentionNprofile}`,
                        },
                    ],
                    hasMore: false,
                };
            }

            return {
                posts: [],
                hasMore: false,
            };
        });

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, NostrProfile> = {};

                        for (const pubkey of pubkeys) {
                            if (pubkey === ownerPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner' };
                            }
                            if (pubkey === followedPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Alice' };
                            }
                            if (pubkey === firstMentionPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Bruno Mention' };
                            }
                            if (pubkey === secondMentionPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Carla Mention' };
                            }
                        }

                        return profiles;
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    fetchLatestPostsByPubkeyFn,
                    socialFeedService: socialFeed.service,
                }}
            />,
            { initialEntries: ['/'] }
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Ágora"]') as HTMLButtonElement;
        expect(feedButton).toBeDefined();

        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => rendered.container.querySelector('button[aria-label="Abrir perfil de Bruno Mention"]') !== null);

        const feedMentionButton = rendered.container.querySelector('button[aria-label="Abrir perfil de Bruno Mention"]') as HTMLButtonElement;
        expect(feedMentionButton).toBeDefined();

        await act(async () => {
            feedMentionButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Bruno Mention'));
        expect(rendered.container.querySelector('.nostr-following-feed-surface')).not.toBeNull();

        await selectActiveProfileDialogTab('Feed');
        await waitFor(() => document.body.querySelector('button[aria-label="Abrir perfil de Carla Mention"]') !== null);

        const dialogMentionButton = document.body.querySelector('button[aria-label="Abrir perfil de Carla Mention"]') as HTMLButtonElement;
        expect(dialogMentionButton).toBeDefined();

        await act(async () => {
            dialogMentionButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Carla Mention'));
    });

    test('chats route renders chats page when entering /chats directly', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />,
            { initialEntries: ['/chats'] }
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
        await waitFor(() => (rendered.container.textContent || '').includes('Chats'));
    });

    test('groups route renders for readonly npub sessions without signing actions enabled', async () => {
        const ownerPubkey = 'f'.repeat(64);
        window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
            method: 'npub',
            pubkey: ownerPubkey,
            readonly: true,
            locked: false,
            createdAt: Date.now(),
            capabilities: {
                canSign: false,
                canEncrypt: false,
                encryptionSchemes: [],
            },
        }));
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <>
                <App mapBridge={bridge} services={createBasicOverlayServices(ownerPubkey)} />
                <LocationProbe />
            </>,
            { initialEntries: ['/groups'] }
        );
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') === null);
        await waitFor(() => (rendered.container.textContent || '').includes('Grupos'));

        expect(getLocationText(rendered.container)).toBe('/groups');
        expect(rendered.container.querySelector('button[aria-label="Abrir grupos"]')).not.toBeNull();
        expect(rendered.container.textContent || '').toContain('Elige relays de grupos');
    });

    test('groups route loads saved groups and selected group detail when entering /groups', async () => {
        const ownerPubkey = persistDmCapableSession();
        persistGroupRelaySettings(ownerPubkey);
        const loadGroups = vi.fn(async () => ([{ relay: 'wss://relay.example', id: 'maps' }]));
        const loadGroup = vi.fn(async () => ({
            group: { relay: 'wss://relay.example', id: 'maps', key: "wss://relay.example/'maps", external: "relay.example'maps" },
            metadata: { id: 'maps', name: 'Map Makers', about: 'Coordinate city maps together.', private: false, restricted: false, hidden: false, closed: false },
            metadataVerified: true,
            admins: undefined,
            members: { id: 'maps', pubkeys: ['a'.repeat(64), 'b'.repeat(64)] },
            roles: undefined,
            timeline: [],
        }));
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <>
                <App
                    mapBridge={bridge}
                    services={createBasicOverlayServices(ownerPubkey, {
                        groupsService: {
                            loadGroups,
                            loadGroup,
                            publishMessage: vi.fn(),
                            requestJoin: vi.fn(),
                            requestLeave: vi.fn(),
                            savePublicGroups: vi.fn(),
                        },
                    })}
                />
                <LocationProbe />
            </>,
            { initialEntries: ['/groups'] }
        );
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') === null);
        await waitFor(() => (rendered.container.textContent || '').includes('Map Makers'));

        expect(getLocationText(rendered.container)).toBe('/groups');
        expect(loadGroups).toHaveBeenCalledWith({ ownerPubkey });
        expect(loadGroup).toHaveBeenCalledWith({ group: { relay: 'wss://relay.example', id: 'maps' } });
        expect(rendered.container.textContent || '').toContain('Coordinate city maps together.');
        expect(rendered.container.textContent || '').toContain('2 miembros');
    });

    test('groups route selects group from relay and group query parameters', async () => {
        const ownerPubkey = persistDmCapableSession();
        persistGroupRelaySettings(ownerPubkey);
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={createBasicOverlayServices(ownerPubkey, {
                    groupsService: {
                        loadGroups: vi.fn(async () => ([
                            { relay: 'wss://relay.example', id: 'maps' },
                            { relay: 'wss://relay.example', id: 'parks' },
                        ])),
                        loadGroup: vi.fn(async ({ group }) => {
                            const input = group as { relay: string; id: string };
                            const names: Record<string, string> = {
                                maps: 'Map Makers',
                                parks: 'Park Planners',
                            };
                            return {
                                group: { relay: input.relay, id: input.id, key: `${input.relay}'${input.id}`, external: `relay.example'${input.id}` },
                                metadata: { id: input.id, name: names[input.id] ?? input.id, about: input.id === 'parks' ? 'Plan park districts.' : 'Coordinate city maps together.', private: false, restricted: false, hidden: false, closed: false },
                                metadataVerified: true,
                                admins: undefined,
                                members: undefined,
                                roles: undefined,
                                timeline: [],
                            };
                        }),
                        publishMessage: vi.fn(),
                        requestJoin: vi.fn(),
                        requestLeave: vi.fn(),
                        savePublicGroups: vi.fn(),
                    },
                })}
            />,
            { initialEntries: ['/groups?relay=wss%3A%2F%2Frelay.example&group=parks'] }
        );
        mounted.push(rendered);

        await waitFor(() => (rendered.container.textContent || '').includes('Park Planners'));

        expect(rendered.container.textContent || '').toContain('Plan park districts.');
    });

    test('groups route gates publish and save through signing state', async () => {
        const ownerPubkey = persistDmCapableSession();
        persistGroupRelaySettings(ownerPubkey);
        const publishMessage = vi.fn(async () => undefined);
        const savePublicGroups = vi.fn(async () => undefined);
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={createBasicOverlayServices(ownerPubkey, {
                    groupsService: {
                        loadGroups: vi.fn(async () => ([{ relay: 'wss://relay.example', id: 'maps' }])),
                        loadGroup: vi.fn(async () => ({
                            group: { relay: 'wss://relay.example', id: 'maps', key: "wss://relay.example/'maps", external: "relay.example'maps" },
                            metadata: { id: 'maps', name: 'Map Makers', about: 'Coordinate city maps together.', private: false, restricted: false, hidden: false, closed: false },
                            metadataVerified: true,
                            admins: undefined,
                            members: undefined,
                            roles: undefined,
                            timeline: [],
                        })),
                        publishMessage,
                        requestJoin: vi.fn(),
                        requestLeave: vi.fn(),
                        savePublicGroups,
                    },
                })}
            />,
            { initialEntries: ['/groups'] }
        );
        mounted.push(rendered);

        await waitFor(() => (rendered.container.textContent || '').includes('Map Makers'));
        const textarea = rendered.container.querySelector('textarea[aria-label="Mensaje para Map Makers"]') as HTMLTextAreaElement;
        expect(textarea.disabled).toBe(false);
        await fillTextarea(textarea, 'Hello group');

        const publishButton = rendered.container.querySelector('button[aria-label="Publicar mensaje en Map Makers"]') as HTMLButtonElement;
        await act(async () => {
            publishButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await openGroupActions(rendered.container, 'Map Makers');
        await clickMenuItemByLabel('Guardar Map Makers');

        expect(publishMessage).toHaveBeenCalledWith({
            group: { relay: 'wss://relay.example', id: 'maps' },
            content: 'Hello group',
            recentTimeline: [],
        });
        expect(savePublicGroups).toHaveBeenCalledWith({ groups: [{ relay: 'wss://relay.example', id: 'maps' }] });
    });

    test('groups route explicitly syncs saved groups with configured group relay tags', async () => {
        const ownerPubkey = persistDmCapableSession();
        persistGroupRelaySettings(ownerPubkey, ['wss://relay.example', 'wss://groups.0xchat.com/']);
        const savePublicGroups = vi.fn(async () => undefined);
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={createBasicOverlayServices(ownerPubkey, {
                    groupsService: {
                        loadGroups: vi.fn(async () => ([{ relay: 'wss://relay.example', id: 'maps' }])),
                        loadGroup: vi.fn(async () => ({
                            group: { relay: 'wss://relay.example', id: 'maps', key: "wss://relay.example/'maps", external: "relay.example'maps" },
                            metadata: { id: 'maps', name: 'Map Makers', about: 'Coordinate city maps together.', private: false, restricted: false, hidden: false, closed: false },
                            metadataVerified: true,
                            admins: undefined,
                            members: undefined,
                            roles: undefined,
                            timeline: [],
                        })),
                        publishMessage: vi.fn(),
                        requestJoin: vi.fn(),
                        requestLeave: vi.fn(),
                        savePublicGroups,
                    },
                })}
            />,
            { initialEntries: ['/groups'] }
        );
        mounted.push(rendered);

        await waitFor(() => (rendered.container.textContent || '').includes('Map Makers'));
        expect(rendered.container.textContent || '').not.toContain('Los relays y grupos sincronizados son datos públicos de Nostr.');
        const syncButton = rendered.container.querySelector('button[aria-label="Sincronizar relays públicos"]') as HTMLButtonElement;
        await act(async () => {
            syncButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(savePublicGroups).toHaveBeenCalledWith({
            groups: [{ relay: 'wss://relay.example', id: 'maps' }],
            relays: ['wss://relay.example', 'wss://groups.0xchat.com'],
            publishRelays: ['wss://relay.example', 'wss://groups.0xchat.com'],
        });
    });

    test('groups route preserves saved groups without saving unrelated discovered groups', async () => {
        const ownerPubkey = persistDmCapableSession();
        persistGroupRelaySettings(ownerPubkey);
        const savePublicGroups = vi.fn(async () => undefined);
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={createBasicOverlayServices(ownerPubkey, {
                    groupsService: {
                        loadGroups: vi.fn(async () => ({
                            saved: [{ relay: 'wss://relay.example', id: 'maps' }],
                            discovered: [
                                { relay: 'wss://relay.example/', id: 'parks' },
                                { relay: 'wss://relay.example', id: 'artists' },
                            ],
                        } as never)),
                        loadGroup: vi.fn(async ({ group }) => {
                            const input = group as { relay: string; id: string };
                            const names: Record<string, string> = {
                                artists: 'Artist Guild',
                                maps: 'Map Makers',
                                parks: 'Park Planners',
                            };
                            return {
                                group: { relay: input.relay.replace(/\/$/, ''), id: input.id, key: `${input.relay.replace(/\/$/, '')}'${input.id}`, external: `relay.example'${input.id}` },
                                metadata: { id: input.id, name: names[input.id] ?? input.id, about: 'Coordinate city maps together.', private: false, restricted: false, hidden: false, closed: false },
                                metadataVerified: true,
                                admins: undefined,
                                members: undefined,
                                roles: undefined,
                                timeline: [],
                            };
                        }),
                        publishMessage: vi.fn(),
                        requestJoin: vi.fn(),
                        requestLeave: vi.fn(),
                        savePublicGroups,
                    },
                })}
            />,
            { initialEntries: ['/groups'] }
        );
        mounted.push(rendered);

        await waitFor(() => (rendered.container.textContent || '').includes('Map Makers'));
        const othersTab = rendered.container.querySelector('button[role="tab"][aria-controls="groups-others-panel"]') as HTMLButtonElement;
        await act(async () => {
            othersTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await waitFor(() => (rendered.container.textContent || '').includes('Park Planners'));
        const parksButton = Array.from(rendered.container.querySelectorAll('button')).find((button) => (button.textContent || '').includes('Park Planners')) as HTMLButtonElement;
        await act(async () => {
            parksButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await openGroupActions(rendered.container, 'Park Planners');
        await clickMenuItemByLabel('Guardar Park Planners');

        expect(savePublicGroups).toHaveBeenCalledWith({
            groups: [
                { relay: 'wss://relay.example', id: 'maps' },
                { relay: 'wss://relay.example/', id: 'parks' },
            ],
        });
    });

    test('groups route dedupes when saving an already saved group', async () => {
        const ownerPubkey = persistDmCapableSession();
        persistGroupRelaySettings(ownerPubkey);
        const savePublicGroups = vi.fn(async () => undefined);
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={createBasicOverlayServices(ownerPubkey, {
                    groupsService: {
                        loadGroups: vi.fn(async () => ({
                            saved: [{ relay: 'wss://relay.example', id: 'maps' }],
                            discovered: [{ relay: 'wss://relay.example', id: 'parks' }],
                        } as never)),
                        loadGroup: vi.fn(async ({ group }) => {
                            const input = group as { relay: string; id: string };
                            return {
                                group: { relay: input.relay, id: input.id, key: `${input.relay}'${input.id}`, external: `relay.example'${input.id}` },
                                metadata: { id: input.id, name: input.id === 'maps' ? 'Map Makers' : 'Park Planners', about: 'Coordinate city maps together.', private: false, restricted: false, hidden: false, closed: false },
                                metadataVerified: true,
                                admins: undefined,
                                members: undefined,
                                roles: undefined,
                                timeline: [],
                            };
                        }),
                        publishMessage: vi.fn(),
                        requestJoin: vi.fn(),
                        requestLeave: vi.fn(),
                        savePublicGroups,
                    },
                })}
            />,
            { initialEntries: ['/groups'] }
        );
        mounted.push(rendered);

        await waitFor(() => (rendered.container.textContent || '').includes('Map Makers'));
        await openGroupActions(rendered.container, 'Map Makers');
        await clickMenuItemByLabel('Guardar Map Makers');

        expect(savePublicGroups).toHaveBeenCalledWith({
            groups: [{ relay: 'wss://relay.example', id: 'maps' }],
        });
    });

    test('groups route accumulates sequential discovered group saves before reload', async () => {
        const ownerPubkey = persistDmCapableSession();
        persistGroupRelaySettings(ownerPubkey);
        const savePublicGroups = vi.fn(async () => undefined);
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={createBasicOverlayServices(ownerPubkey, {
                    groupsService: {
                        loadGroups: vi.fn(async () => ({
                            saved: [{ relay: 'wss://relay.example', id: 'maps' }],
                            discovered: [
                                { relay: 'wss://relay.example', id: 'parks' },
                                { relay: 'wss://relay.example', id: 'artists' },
                            ],
                        } as never)),
                        loadGroup: vi.fn(async ({ group }) => {
                            const input = group as { relay: string; id: string };
                            const names: Record<string, string> = {
                                artists: 'Artist Guild',
                                maps: 'Map Makers',
                                parks: 'Park Planners',
                            };
                            return {
                                group: { relay: input.relay, id: input.id, key: `${input.relay}'${input.id}`, external: `relay.example'${input.id}` },
                                metadata: { id: input.id, name: names[input.id] ?? input.id, about: 'Coordinate city maps together.', private: false, restricted: false, hidden: false, closed: false },
                                metadataVerified: true,
                                admins: undefined,
                                members: undefined,
                                roles: undefined,
                                timeline: [],
                            };
                        }),
                        publishMessage: vi.fn(),
                        requestJoin: vi.fn(),
                        requestLeave: vi.fn(),
                        savePublicGroups,
                    },
                })}
            />,
            { initialEntries: ['/groups'] }
        );
        mounted.push(rendered);

        await waitFor(() => (rendered.container.textContent || '').includes('Map Makers'));
        const othersTab = rendered.container.querySelector('button[role="tab"][aria-controls="groups-others-panel"]') as HTMLButtonElement;
        await act(async () => {
            othersTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await waitFor(() => (rendered.container.textContent || '').includes('Artist Guild'));
        const parksButton = Array.from(rendered.container.querySelectorAll('button')).find((button) => (button.textContent || '').includes('Park Planners')) as HTMLButtonElement;
        await act(async () => {
            parksButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await openGroupActions(rendered.container, 'Park Planners');
        await clickMenuItemByLabel('Guardar Park Planners');

        const artistsButton = Array.from(rendered.container.querySelectorAll('button')).find((button) => (button.textContent || '').includes('Artist Guild')) as HTMLButtonElement;
        await act(async () => {
            artistsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await openGroupActions(rendered.container, 'Artist Guild');
        await clickMenuItemByLabel('Guardar Artist Guild');

        expect(savePublicGroups).toHaveBeenNthCalledWith(1, {
            groups: [
                { relay: 'wss://relay.example', id: 'maps' },
                { relay: 'wss://relay.example', id: 'parks' },
            ],
        });
        expect(savePublicGroups).toHaveBeenNthCalledWith(2, {
            groups: [
                { relay: 'wss://relay.example', id: 'maps' },
                { relay: 'wss://relay.example', id: 'parks' },
                { relay: 'wss://relay.example', id: 'artists' },
            ],
        });
    });

    test('groups route gates join and leave through signing state', async () => {
        const ownerPubkey = persistDmCapableSession();
        persistGroupRelaySettings(ownerPubkey);
        const requestJoin = vi.fn(async () => undefined);
        const requestLeave = vi.fn(async () => undefined);
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={createBasicOverlayServices(ownerPubkey, {
                    groupsService: {
                        loadGroups: vi.fn(async () => ([{ relay: 'wss://relay.example', id: 'maps' }])),
                        loadGroup: vi.fn(async () => ({
                            group: { relay: 'wss://relay.example', id: 'maps', key: "wss://relay.example/'maps", external: "relay.example'maps" },
                            metadata: { id: 'maps', name: 'Map Makers', about: 'Coordinate city maps together.', private: false, restricted: false, hidden: false, closed: false },
                            metadataVerified: true,
                            admins: undefined,
                            members: undefined,
                            roles: undefined,
                            timeline: [],
                        })),
                        publishMessage: vi.fn(),
                        requestJoin,
                        requestLeave,
                        savePublicGroups: vi.fn(),
                    },
                })}
            />,
            { initialEntries: ['/groups'] }
        );
        mounted.push(rendered);

        await waitFor(() => (rendered.container.textContent || '').includes('Map Makers'));
        await openGroupActions(rendered.container, 'Map Makers');
        await clickMenuItemByLabel('Unirse a Map Makers');
        await openGroupActions(rendered.container, 'Map Makers');
        await clickMenuItemByLabel('Salir de Map Makers');

        expect(requestJoin).toHaveBeenCalledWith({ group: { relay: 'wss://relay.example', id: 'maps' } });
        expect(requestLeave).toHaveBeenCalledWith({ group: { relay: 'wss://relay.example', id: 'maps' } });
    });

    test('groups route join with invite code remembers locally without saving public groups', async () => {
        const ownerPubkey = persistDmCapableSession();
        persistGroupRelaySettings(ownerPubkey);
        const requestJoin = vi.fn(async () => undefined);
        const savePublicGroups = vi.fn(async () => undefined);
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={createBasicOverlayServices(ownerPubkey, {
                    groupsService: {
                        loadGroups: vi.fn(async () => ({ saved: [], remembered: [], discovered: [{ relay: 'wss://relay.example', id: 'parks' }] } as never)),
                        loadGroup: vi.fn(async () => ({
                            group: { relay: 'wss://relay.example', id: 'parks', key: "wss://relay.example'parks", external: "relay.example'parks" },
                            metadata: { id: 'parks', name: 'Park Planners', about: 'Plan park districts.', private: false, restricted: false, hidden: false, closed: false },
                            metadataVerified: true,
                            admins: undefined,
                            members: undefined,
                            roles: undefined,
                            timeline: [],
                        })),
                        publishMessage: vi.fn(),
                        requestJoin,
                        requestLeave: vi.fn(),
                        savePublicGroups,
                    },
                })}
            />,
            { initialEntries: ['/groups?relay=wss%3A%2F%2Frelay.example&group=parks&code=invite-code'] }
        );
        mounted.push(rendered);

        await waitFor(() => (rendered.container.textContent || '').includes('Park Planners'));
        await openGroupActions(rendered.container, 'Park Planners');
        await clickMenuItemByLabel('Unirse a Park Planners');

        expect(requestJoin).toHaveBeenCalledWith({ group: { relay: 'wss://relay.example', id: 'parks' }, code: 'invite-code' });
        expect(savePublicGroups).not.toHaveBeenCalled();
        expect(window.localStorage.getItem(`nostr.overlay.groups.remembered.v1:user:${ownerPubkey}`)).toContain("parks");
        expect(window.localStorage.getItem(`nostr.overlay.groups.remembered.v1:user:${ownerPubkey}`)).not.toContain('invite-code');
    });

    test('groups route does not call write actions for readonly sessions', async () => {
        const ownerPubkey = 'f'.repeat(64);
        persistGroupRelaySettings(ownerPubkey);
        window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
            method: 'npub',
            pubkey: ownerPubkey,
            readonly: true,
            locked: false,
            createdAt: Date.now(),
            capabilities: {
                canSign: false,
                canEncrypt: false,
                encryptionSchemes: [],
            },
        }));
        const publishMessage = vi.fn(async () => undefined);
        const savePublicGroups = vi.fn(async () => undefined);
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={createBasicOverlayServices(ownerPubkey, {
                    groupsService: {
                        loadGroups: vi.fn(async () => ([{ relay: 'wss://relay.example', id: 'maps' }])),
                        loadGroup: vi.fn(async () => ({
                            group: { relay: 'wss://relay.example', id: 'maps', key: "wss://relay.example/'maps", external: "relay.example'maps" },
                            metadata: { id: 'maps', name: 'Map Makers', about: 'Coordinate city maps together.', private: false, restricted: false, hidden: false, closed: false },
                            metadataVerified: true,
                            admins: undefined,
                            members: undefined,
                            roles: undefined,
                            timeline: [],
                        })),
                        publishMessage,
                        requestJoin: vi.fn(),
                        requestLeave: vi.fn(),
                        savePublicGroups,
                    },
                })}
            />,
            { initialEntries: ['/groups'] }
        );
        mounted.push(rendered);

        await waitFor(() => (rendered.container.textContent || '').includes('Map Makers'));
        const publishButton = rendered.container.querySelector('button[aria-label="Publicar mensaje en Map Makers"]') as HTMLButtonElement;
        const syncButton = rendered.container.querySelector('button[aria-label="Sincronizar relays públicos"]') as HTMLButtonElement;

        expect(publishButton.disabled).toBe(true);
        expect(syncButton.disabled).toBe(true);
        await openGroupActions(rendered.container, 'Map Makers');
        expect(document.body.querySelector('[aria-label="Guardar Map Makers"]')?.getAttribute('aria-disabled')).toBe('true');
        expect(document.body.querySelector('[aria-label="Unirse a Map Makers"]')?.getAttribute('aria-disabled')).toBe('true');
        expect(document.body.querySelector('[aria-label="Salir de Map Makers"]')?.getAttribute('aria-disabled')).toBe('true');
        await act(async () => {
            publishButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            syncButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await clickMenuItemByLabel('Guardar Map Makers');
        await clickMenuItemByLabel('Unirse a Map Makers');
        await clickMenuItemByLabel('Salir de Map Makers');

        expect(publishMessage).not.toHaveBeenCalled();
        expect(savePublicGroups).not.toHaveBeenCalled();
        expect(document.body.textContent || '').toContain('Unirse al grupo');
        expect(document.body.textContent || '').toContain('Salir del grupo');
    });

    test('groups route passes deterministic created_at desc and id asc timeline to publish', async () => {
        const ownerPubkey = persistDmCapableSession();
        persistGroupRelaySettings(ownerPubkey);
        const publishMessage = vi.fn(async () => undefined);
        const olderA = { id: 'a'.repeat(64), pubkey: '1'.repeat(64), kind: 9, created_at: 99, tags: [['h', 'maps']], content: 'older' };
        const newerB = { id: 'b'.repeat(64), pubkey: '2'.repeat(64), kind: 9, created_at: 100, tags: [['h', 'maps']], content: 'newer b' };
        const newerA = { id: 'a'.repeat(63) + 'b', pubkey: '3'.repeat(64), kind: 9, created_at: 100, tags: [['h', 'maps']], content: 'newer a' };
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={createBasicOverlayServices(ownerPubkey, {
                    groupsService: {
                        loadGroups: vi.fn(async () => ([{ relay: 'wss://relay.example', id: 'maps' }])),
                        loadGroup: vi.fn(async () => ({
                            group: { relay: 'wss://relay.example', id: 'maps', key: "wss://relay.example/'maps", external: "relay.example'maps" },
                            metadata: { id: 'maps', name: 'Map Makers', about: 'Coordinate city maps together.', private: false, restricted: false, hidden: false, closed: false },
                            metadataVerified: true,
                            admins: undefined,
                            members: undefined,
                            roles: undefined,
                            timeline: [olderA, newerB, newerA],
                        })),
                        publishMessage,
                        requestJoin: vi.fn(),
                        requestLeave: vi.fn(),
                        savePublicGroups: vi.fn(),
                    },
                })}
            />,
            { initialEntries: ['/groups'] }
        );
        mounted.push(rendered);

        await waitFor(() => (rendered.container.textContent || '').includes('Map Makers'));
        const textarea = rendered.container.querySelector('textarea[aria-label="Mensaje para Map Makers"]') as HTMLTextAreaElement;
        await fillTextarea(textarea, 'Sorted timeline');
        const publishButton = rendered.container.querySelector('button[aria-label="Publicar mensaje en Map Makers"]') as HTMLButtonElement;
        await act(async () => {
            publishButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(publishMessage).toHaveBeenCalledWith({
            group: { relay: 'wss://relay.example', id: 'maps' },
            content: 'Sorted timeline',
            recentTimeline: [newerA, newerB, olderA],
        });
    });

    test('wallet entry is available in the authenticated shell', async () => {
        const ownerPubkey = 'f'.repeat(64);
        window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
            method: 'nip07',
            pubkey: ownerPubkey,
            readonly: false,
            locked: false,
            createdAt: Date.now(),
        }));
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />,
            { initialEntries: ['/wallet'] }
        );
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') === null);
        const walletButton = rendered.container.querySelector('button[aria-label="Abrir wallet"]') as HTMLButtonElement;
        expect(walletButton).toBeDefined();
    });

    test('restores a remembered WebLN wallet after reload', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const enable = vi.fn(async () => {});
        window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
            method: 'nip07',
            pubkey: ownerPubkey,
            readonly: false,
            locked: false,
            createdAt: Date.now(),
        }));
        Object.assign(window, {
            webln: {
                enable,
                sendPayment: vi.fn(async () => ({ preimage: 'abc' })),
                makeInvoice: vi.fn(async () => ({ paymentRequest: 'lnbc1invoice', expiresAt: 200 })),
            },
        });

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />,
            { initialEntries: ['/wallet'] }
        );
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') === null);
        await waitFor(() => rendered.container.querySelector('[data-testid="wallet-page"]') !== null);

        const connectWebLnButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Conectar con WebLN')
        ) as HTMLButtonElement;
        expect(connectWebLnButton).toBeDefined();

        await act(async () => {
            connectWebLnButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Conectada por WebLN'));
        expect(enable).toHaveBeenCalledTimes(1);

        await act(async () => {
            rendered.root.unmount();
        });
        rendered.container.remove();
        mounted = mounted.filter((entry) => entry !== rendered);

        const reloaded = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />,
            { initialEntries: ['/wallet'] }
        );
        mounted.push(reloaded);

        await waitFor(() => reloaded.container.querySelector('[data-testid="login-gate-screen"]') === null);
        await waitFor(() => (reloaded.container.textContent || '').includes('Conectada por WebLN'));
        expect(enable).toHaveBeenCalledTimes(2);
    });

    test('keeps donation payment controls hidden for readonly npub sessions with a remembered WebLN wallet', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const strhodlerPubkey = nip19.decode('npub1dd3k7ku95jhpyh9y7pgx9qrh2ykvtfl5lnncqzzt2gyhgw0a04ysm4paad').data as string;
        const enable = vi.fn(async () => {});
        window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
            method: 'npub',
            pubkey: ownerPubkey,
            readonly: true,
            locked: false,
            createdAt: Date.now(),
        }));
        window.localStorage.setItem(`${WALLET_SETTINGS_STORAGE_KEY}:user:${ownerPubkey}`, JSON.stringify({
            activeConnection: {
                method: 'webln',
                capabilities: {
                    payInvoice: true,
                    makeInvoice: false,
                    notifications: false,
                },
                restoreState: 'connected',
            },
        }));
        Object.assign(window, {
            webln: {
                enable,
                sendPayment: vi.fn(async () => ({ preimage: 'abc' })),
                makeInvoice: vi.fn(async () => ({ paymentRequest: 'lnbc1invoice', expiresAt: 200 })),
            },
        });

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [strhodlerPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [strhodlerPubkey]: { pubkey: strhodlerPubkey, displayName: 'strhodler', lud16: 'strhodler@getalby.com' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />,
            { initialEntries: ['/settings/about'] }
        );
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('[data-testid="lightning-donation-banner"]') !== null);
        await waitFor(() => enable.mock.calls.length >= 1);

        expect(rendered.container.querySelector('[data-testid="lightning-donation-qr"]')).not.toBeNull();
        expect(rendered.container.querySelector('[data-testid="lightning-donation-amount"]')).toBeNull();
        expect(rendered.container.querySelector('[data-testid="lightning-donation-submit"]')).toBeNull();
    });

    test('marks WebLN wallet as reconnect-required when refresh revalidation fails', async () => {
        const ownerPubkey = 'f'.repeat(64);
        window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
            method: 'nip07',
            pubkey: ownerPubkey,
            readonly: false,
            locked: false,
            createdAt: Date.now(),
        }));
        Object.assign(window, {
            webln: {
                enable: vi.fn(async () => {}),
                sendPayment: vi.fn(async () => ({ preimage: 'abc' })),
                makeInvoice: vi.fn(async () => ({ paymentRequest: 'lnbc1invoice', expiresAt: 200 })),
            },
        });

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />,
            { initialEntries: ['/wallet'] }
        );
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') === null);
        await waitFor(() => rendered.container.querySelector('[data-testid="wallet-page"]') !== null);

        const connectWebLnButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Conectar con WebLN')
        ) as HTMLButtonElement;

        await act(async () => {
            connectWebLnButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Conectada por WebLN'));

        const failingEnable = vi.fn(async () => {
            throw new Error('denied');
        });
        Object.assign(window, {
            webln: {
                enable: failingEnable,
                sendPayment: vi.fn(async () => ({ preimage: 'abc' })),
                makeInvoice: vi.fn(async () => ({ paymentRequest: 'lnbc1invoice', expiresAt: 200 })),
            },
        });

        const refreshButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Refrescar')
        ) as HTMLButtonElement;

        await act(async () => {
            refreshButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Reconecta WebLN'));
        expect(failingEnable).toHaveBeenCalledTimes(1);
    });

    test('keeps remembered WebLN wallet pending reconnection when silent restore fails', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const enable = vi.fn(async () => {});
        window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
            method: 'nip07',
            pubkey: ownerPubkey,
            readonly: false,
            locked: false,
            createdAt: Date.now(),
        }));
        Object.assign(window, {
            webln: {
                enable,
                sendPayment: vi.fn(async () => ({ preimage: 'abc' })),
                makeInvoice: vi.fn(async () => ({ paymentRequest: 'lnbc1invoice', expiresAt: 200 })),
            },
        });

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />,
            { initialEntries: ['/wallet'] }
        );

        await waitFor(() => rendered.container.querySelector('[data-testid="wallet-page"]') !== null);
        const connectWebLnButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Conectar con WebLN')
        ) as HTMLButtonElement;

        await act(async () => {
            connectWebLnButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Conectada por WebLN'));

        await act(async () => {
            rendered.root.unmount();
        });
        rendered.container.remove();

        Object.assign(window, {
            webln: {
                enable: vi.fn(async () => {
                    throw new Error('denied');
                }),
                sendPayment: vi.fn(async () => ({ preimage: 'abc' })),
                makeInvoice: vi.fn(async () => ({ paymentRequest: 'lnbc1invoice', expiresAt: 200 })),
            },
        });

        const reloaded = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />,
            { initialEntries: ['/wallet'] }
        );
        mounted.push(reloaded);

        await waitFor(() => reloaded.container.querySelector('[data-testid="login-gate-screen"]') === null);
        await waitFor(() => (reloaded.container.textContent || '').includes('Reconecta WebLN'));
        expect(reloaded.container.textContent || '').not.toContain('Conectada por WebLN');
    });

    test('keeps remembered WebLN wallet pending reconnection when provider is missing after reload', async () => {
        const ownerPubkey = 'f'.repeat(64);
        window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
            method: 'nip07',
            pubkey: ownerPubkey,
            readonly: false,
            locked: false,
            createdAt: Date.now(),
        }));
        Object.assign(window, {
            webln: {
                enable: vi.fn(async () => {}),
                sendPayment: vi.fn(async () => ({ preimage: 'abc' })),
                makeInvoice: vi.fn(async () => ({ paymentRequest: 'lnbc1invoice', expiresAt: 200 })),
            },
        });

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />,
            { initialEntries: ['/wallet'] }
        );

        await waitFor(() => rendered.container.querySelector('[data-testid="wallet-page"]') !== null);
        const connectWebLnButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Conectar con WebLN')
        ) as HTMLButtonElement;

        await act(async () => {
            connectWebLnButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Conectada por WebLN'));

        await act(async () => {
            rendered.root.unmount();
        });
        rendered.container.remove();
        delete (window as Window & { webln?: unknown }).webln;

        const reloaded = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />,
            { initialEntries: ['/wallet'] }
        );
        mounted.push(reloaded);

        await waitFor(() => reloaded.container.querySelector('[data-testid="login-gate-screen"]') === null);
        await waitFor(() => (reloaded.container.textContent || '').includes('Reconecta WebLN'));
        expect(reloaded.container.textContent || '').not.toContain('Conectada por WebLN');
    });

    test('connects NWC wallet from a validated info event', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const walletServiceSecret = generateSecretKey();
        const walletServicePubkey = getPublicKey(walletServiceSecret);
        const infoEvent = finalizeEvent({
            kind: 13194,
            created_at: 100,
            tags: [['encryption', 'nip44_v2 nip04']],
            content: 'pay_invoice make_invoice',
        }, walletServiceSecret);
        window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
            method: 'nip07',
            pubkey: ownerPubkey,
            readonly: false,
            locked: false,
            createdAt: Date.now(),
        }));
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => infoEvent,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />,
            { initialEntries: ['/wallet'] }
        );
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('[data-testid="wallet-page"]') !== null);

        const nwcInput = rendered.container.querySelector('input[aria-label="URI NWC"]') as HTMLInputElement;
        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            // TEST_VECTOR_DO_NOT_USE: fake NWC URI used to exercise wallet connect UI.
            valueSetter?.call(nwcInput, `nostr+walletconnect://${walletServicePubkey}?relay=wss://relay.one.example&secret=${'b'.repeat(64)}`);
            nwcInput.dispatchEvent(new Event('input', { bubbles: true }));
            nwcInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        const connectNwcButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Conectar con NWC')
        ) as HTMLButtonElement;

        await act(async () => {
            connectNwcButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Conectada por NWC'));
    });

    test('uses lastReadAt semantics for agora unread state and clears on open', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const storageKey = buildFollowingFeedLastReadStorageKey(ownerPubkey, 'v1');
        window.localStorage.setItem(storageKey, JSON.stringify({ lastReadAt: 1_700_000_005 }));

        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mockResolvedValue({
            items: [
                {
                    id: 'note-new',
                    pubkey: followedPubkey,
                    createdAt: 1_700_000_006,
                    content: 'nueva nota',
                    kind: 'note',
                    rawEvent: {
                        id: 'note-new',
                        pubkey: followedPubkey,
                        kind: 1,
                        created_at: 1_700_000_006,
                        tags: [],
                        content: 'nueva nota',
                    },
                },
            ],
            hasMore: false,
            nextUntil: undefined,
        });

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
        await waitFor(() => (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mock.calls.length > 0);
        await waitFor(() => rendered.container.querySelector('.nostr-panel-toolbar .nostr-following-feed-unread-dot') !== null);

        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Ágora"]') as HTMLButtonElement;
        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => rendered.container.querySelector('.nostr-panel-toolbar .nostr-following-feed-unread-dot') === null);
        const storedPayload = JSON.parse(window.localStorage.getItem(storageKey) || '{}') as { lastReadAt?: number };
        expect(typeof storedPayload.lastReadAt).toBe('number');
        expect((storedPayload.lastReadAt || 0) >= 1_700_000_006).toBe(true);
    });

    test('does not mark agora as unread when feed items are older than lastReadAt', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const storageKey = buildFollowingFeedLastReadStorageKey(ownerPubkey, 'v1');
        window.localStorage.setItem(storageKey, JSON.stringify({ lastReadAt: 1_700_000_005 }));

        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mockResolvedValue({
            items: [
                {
                    id: 'note-old',
                    pubkey: followedPubkey,
                    createdAt: 1_700_000_004,
                    content: 'nota vieja',
                    kind: 'note',
                    rawEvent: {
                        id: 'note-old',
                        pubkey: followedPubkey,
                        kind: 1,
                        created_at: 1_700_000_004,
                        tags: [],
                        content: 'nota vieja',
                    },
                },
            ],
            hasMore: true,
            nextUntil: 1_700_000_003,
        });

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
        await waitFor(() => (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mock.calls.length > 0);

        await act(async () => {
            await Promise.resolve();
        });
        expect(rendered.container.querySelector('.nostr-panel-toolbar .nostr-following-feed-unread-dot')).toBeNull();
    });

    test('renders chat button in panel and compact toolbar and opens chat dialog in list view', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialNotificationsServiceMock();
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialNotificationsService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const panelChatButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir chats"]') as HTMLButtonElement;
        expect(panelChatButton).toBeDefined();
        const panelNotificationsButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir notificaciones"]');
        expect(panelNotificationsButton).not.toBeNull();

        await act(async () => {
            panelChatButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.container.textContent || '').toContain('Chats');
        expect(rendered.container.textContent || '').toContain('No hay conversaciones todavía');

        const hidePanelButton = rendered.container.querySelector('button[aria-label="Ocultar panel"]') as HTMLButtonElement;
        await act(async () => {
            hidePanelButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const compactChatButton = rendered.container.querySelector('.nostr-compact-toolbar button[aria-label="Abrir chats"]') as HTMLButtonElement;
        expect(compactChatButton).toBeDefined();
        const compactNotificationsButton = rendered.container.querySelector('.nostr-compact-toolbar button[aria-label="Abrir notificaciones"]');
        expect(compactNotificationsButton).not.toBeNull();
    });

    test('orders main sidebar actions and places publish before the user menu', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        const socialNotifications = createSocialNotificationsServiceMock();
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                    socialNotificationsService: socialNotifications.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const requiredOrder = [
            'Abrir mapa',
            'Abrir Ágora',
            'Abrir chats',
            'Abrir grupos',
            'Abrir relays',
            'Abrir notificaciones',
            'Abrir buscador global de usuarios',
            'Abrir estadísticas de la ciudad',
            'Abrir descubre',
            'Abrir ajustes',
        ];

        const panelButtons = Array.from(rendered.container.querySelectorAll('.nostr-panel-toolbar > [data-slot="sidebar-menu-item"] button')) as HTMLButtonElement[];
        const panelLabels = panelButtons.map((button) => button.getAttribute('aria-label') || '');
        const orderedVisibleLabels = panelLabels.filter((label) => requiredOrder.includes(label));

        expect(orderedVisibleLabels).toEqual(requiredOrder);
        expect(panelLabels).not.toContain('Abrir publicar');
        expect(panelLabels).not.toContain('Regenerar mapa');

        const toolbar = rendered.container.querySelector('.nostr-panel-toolbar') as HTMLElement;
        const publishButton = rendered.container.querySelector('[data-slot="sidebar-footer"] button[aria-label="Abrir publicar"]') as HTMLButtonElement | null;
        const userMenuButton = rendered.container.querySelector('[data-slot="sidebar-footer"] button[aria-label="Abrir menú de usuario"]') as HTMLButtonElement | null;

        expect(publishButton).not.toBeNull();
        expect(userMenuButton).not.toBeNull();
        expect(toolbar.compareDocumentPosition(publishButton as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
        expect((publishButton as HTMLButtonElement).compareDocumentPosition(userMenuButton as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    test('opens global publish dialog from the sidebar', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const rendered = await renderApp(
            <App
                mapBridge={createMapBridgeStub().bridge}
                services={createBasicOverlayServices(ownerPubkey)}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const publishButton = rendered.container.querySelector('[data-slot="sidebar-footer"] button[aria-label="Abrir publicar"]') as HTMLButtonElement | null;
        expect(publishButton).not.toBeNull();

        await act(async () => {
            publishButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Publicar'));
        expect(document.body.querySelector('textarea[aria-label="Redactar nota"]')).not.toBeNull();
    });

    test('publishes from the global compose dialog and shows success toast', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const mentionPubkey = 'a'.repeat(64);
        const socialPublisher = {
            publishEvent: vi.fn(async () => ({
                id: 'a'.repeat(64),
                pubkey: ownerPubkey,
                kind: 1,
                created_at: 200,
                tags: [],
                content: '',
                sig: 'b'.repeat(128),
            })),
            publishTextNote: vi.fn(async (content: string, tags: string[][] = []) => ({
                id: 'c'.repeat(64),
                pubkey: ownerPubkey,
                kind: 1,
                created_at: 200,
                tags,
                content,
                sig: 'd'.repeat(128),
            })),
        };
        const rendered = await renderApp(
            <App
                mapBridge={createMapBridgeStub().bridge}
                services={createBasicOverlayServices(ownerPubkey, {
                    socialPublisher,
                    searchUsersFn: vi.fn(async () => ({
                        pubkeys: [mentionPubkey],
                        profiles: {
                            [mentionPubkey]: { pubkey: mentionPubkey, displayName: 'Alice' },
                        },
                    })),
                })}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const publishButton = rendered.container.querySelector('[data-slot="sidebar-footer"] button[aria-label="Abrir publicar"]') as HTMLButtonElement;
        await act(async () => {
            publishButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const textarea = document.body.querySelector('textarea[aria-label="Redactar nota"]') as HTMLTextAreaElement;
        await fillTextarea(textarea, 'hola @al');
        await waitForMentionSuggestions();
        await chooseMentionSuggestion('Alice');

        const submitButton = document.body.querySelector('[data-slot="dialog-footer"] button:last-of-type') as HTMLButtonElement;

        await act(async () => {
            submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => socialPublisher.publishTextNote.mock.calls.length > 0);
        const [publishedContent, publishedTags] = socialPublisher.publishTextNote.mock.calls[0] as [string, string[][]];
        expect(publishedContent).toContain('hola ');
        expect(publishedContent).toContain('nostr:nprofile1');
        expect(publishedTags).toEqual([['p', mentionPubkey]]);
        await waitFor(() => (document.body.textContent || '').includes('Publicación enviada'));
    });

    test('opens quote dialog from repost menu and publishes quote content with nevent reference', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const targetPubkey = 'a'.repeat(64);
        const mentionPubkey = targetPubkey;
        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mockResolvedValue({
            items: [
                {
                    id: '1'.repeat(64),
                    pubkey: targetPubkey,
                    createdAt: 100,
                    content: 'nota original',
                    kind: 'note',
                    rawEvent: {
                        id: '1'.repeat(64),
                        pubkey: targetPubkey,
                        kind: 1,
                        created_at: 100,
                        tags: [],
                        content: 'nota original',
                    },
                },
            ],
            hasMore: false,
        });
        const socialPublisher = {
            publishEvent: vi.fn(async () => ({
                id: 'a'.repeat(64),
                pubkey: ownerPubkey,
                kind: 1,
                created_at: 200,
                tags: [],
                content: '',
                sig: 'b'.repeat(128),
            })),
            publishTextNote: vi.fn(async (content: string, tags: string[][] = []) => ({
                id: 'c'.repeat(64),
                pubkey: ownerPubkey,
                kind: 1,
                created_at: 200,
                tags,
                content,
                sig: 'd'.repeat(128),
            })),
        };
        const rendered = await renderApp(
            <App
                mapBridge={createMapBridgeStub().bridge}
                services={createBasicOverlayServices(ownerPubkey, {
                    socialFeedService: socialFeed.service,
                    socialPublisher,
                    fetchFollowsByPubkeyFn: async () => ({
                        ownerPubkey,
                        follows: [targetPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: async () => ({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [targetPubkey]: { pubkey: targetPubkey, displayName: 'Alice' },
                    }),
                    searchUsersFn: vi.fn(async () => ({
                        pubkeys: [mentionPubkey],
                        profiles: {
                            [mentionPubkey]: { pubkey: mentionPubkey, displayName: 'Alice' },
                        },
                    })),
                })}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const agoraButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Ágora"]') as HTMLButtonElement;
        await act(async () => {
            agoraButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('nota original'));
        const repostButton = rendered.container.querySelector('button[aria-label="Repostear (0)"]') as HTMLButtonElement;
        await act(async () => {
            repostButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            repostButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const quoteItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Cita'
        ) as HTMLElement;
        await act(async () => {
            quoteItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => Boolean(document.body.querySelector('[data-slot="dialog-content"]')));
        await waitFor(() => (document.body.textContent || '').includes('nota original'));
        const textarea = document.body.querySelector('textarea[aria-label="Redactar nota"]') as HTMLTextAreaElement;
        await fillTextarea(textarea, 'mi comentario @al');
        await waitForMentionSuggestions();
        await chooseMentionSuggestion('Alice');

        const submitButton = document.body.querySelector('[data-slot="dialog-footer"] button:last-of-type') as HTMLButtonElement;
        await act(async () => {
            submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => socialPublisher.publishTextNote.mock.calls.length > 0);
        const [quoteContent, quoteTags] = socialPublisher.publishTextNote.mock.calls[0] as [string, string[][]];
        expect(quoteContent).toContain('mi comentario');
        expect(quoteContent).toContain('nostr:nprofile1');
        expect(quoteContent).toContain('nostr:nevent1');
        expect(quoteTags).toEqual(expect.arrayContaining([
            ['q', '1'.repeat(64)],
            ['p', targetPubkey],
        ]));
        expect(quoteTags.filter((tag) => tag[0] === 'p' && tag[1] === targetPubkey)).toHaveLength(1);
        await waitFor(() => (document.body.textContent || '').includes('Cita publicada'));
    });

    test('hides chat entry points when session is not dm-capable', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') !== null);
        expect(rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir chats"]')).toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Ocultar panel"]')).toBeNull();
    });

    test('shows unread dot and opens notifications dialog with pending snapshot', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialNotificationsServiceMock();
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialNotificationsService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        socialFeed.emit({
            id: 'notif-1',
            pubkey: 'a'.repeat(64),
            kind: 7,
            created_at: 1_700_000_001,
            tags: [['p', ownerPubkey], ['e', 'b'.repeat(64)]],
            content: '+',
        });

        await waitFor(() => rendered.container.querySelector('.nostr-panel-toolbar .nostr-notifications-unread-dot') !== null);

        const button = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir notificaciones"]') as HTMLButtonElement;
        expect(button).toBeDefined();

        await act(async () => {
            button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.container.textContent || '').toContain('Notificaciones');
        expect(rendered.container.textContent || '').toContain('reaccionó con + a tu nota');
        expect(rendered.container.querySelector('.nostr-panel-toolbar .nostr-notifications-unread-dot')).toBeNull();
    });

    test('does not start social notifications for readonly npub sessions', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialNotifications = createSocialNotificationsServiceMock();
        const fetchFollowsByNpubFn = vi.fn().mockResolvedValue({
            ownerPubkey,
            follows: [],
            relayHints: [],
        });
        const fetchProfilesFn = vi.fn().mockResolvedValue({
            [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
        });
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn,
                    fetchProfilesFn,
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialNotificationsService: socialNotifications.service,
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, encodeHexToNpub(ownerPubkey));
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => fetchFollowsByNpubFn.mock.calls.length > 0 && fetchProfilesFn.mock.calls.length > 0);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(socialNotifications.service.loadInitialSocial).not.toHaveBeenCalled();
        expect(socialNotifications.service.subscribeSocial).not.toHaveBeenCalled();
    });

    test('uses lastReadAt semantics for realtime notifications unread state', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const storageKey = buildSocialLastReadStorageKey(ownerPubkey, 'v1');
        window.localStorage.setItem(storageKey, JSON.stringify({ lastReadAt: 1_700_000_005 }));
        const socialFeed = createSocialNotificationsServiceMock();
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialNotificationsService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        socialFeed.emit({
            id: 'notif-old',
            pubkey: 'a'.repeat(64),
            kind: 7,
            created_at: 1_700_000_004,
            tags: [['p', ownerPubkey], ['e', 'b'.repeat(64)]],
            content: '+',
        });

        await act(async () => {
            await Promise.resolve();
        });
        expect(rendered.container.querySelector('.nostr-panel-toolbar .nostr-notifications-unread-dot')).toBeNull();

        socialFeed.emit({
            id: 'notif-new',
            pubkey: 'a'.repeat(64),
            kind: 7,
            created_at: 1_700_000_006,
            tags: [['p', ownerPubkey], ['e', 'b'.repeat(64)]],
            content: '+',
        });

        await waitFor(() => rendered.container.querySelector('.nostr-panel-toolbar .nostr-notifications-unread-dot') !== null);
    });

    test('loads DM dialog data through dm api service without runtime read fallback', async () => {
        const ownerPubkey = SAMPLE_AUTH_PUBKEY;
        const peerPubkey = 'a'.repeat(64);
        const runtimeReadService = {
            subscribeInbox: vi.fn(() => () => {}),
            loadInitialConversations: vi.fn(async () => [{
                id: 'runtime-fallback-inbox',
                clientMessageId: 'runtime-fallback-inbox',
                conversationId: peerPubkey,
                peerPubkey,
                direction: 'incoming' as const,
                createdAt: 1,
                plaintext: 'runtime fallback inbox',
                deliveryState: 'sent' as const,
            }]),
            loadConversationMessages: vi.fn(async () => [{
                id: 'runtime-fallback-thread',
                clientMessageId: 'runtime-fallback-thread',
                conversationId: peerPubkey,
                peerPubkey,
                direction: 'incoming' as const,
                createdAt: 2,
                plaintext: 'runtime fallback thread',
                deliveryState: 'sent' as const,
            }]),
            sendDm: vi.fn(async () => ({
                id: 'runtime-send',
                clientMessageId: 'runtime-send',
                conversationId: peerPubkey,
                peerPubkey,
                direction: 'outgoing' as const,
                createdAt: 3,
                plaintext: 'runtime send',
                deliveryState: 'sent' as const,
                publishResult: {
                    ackedRelays: [],
                    failedRelays: [],
                    timeoutRelays: [],
                },
                attempts: 1,
            })),
        };
        const apiReadService = {
            subscribeInbox: vi.fn(() => () => {}),
            loadInitialConversations: vi.fn(async () => [{
                id: 'api-inbox-1',
                clientMessageId: 'api-inbox-1',
                conversationId: peerPubkey,
                peerPubkey,
                direction: 'incoming' as const,
                createdAt: 1700000100,
                plaintext: 'hola api dm',
                deliveryState: 'sent' as const,
            }]),
            loadConversationMessages: vi.fn(async () => [{
                id: 'api-thread-1',
                clientMessageId: 'api-thread-1',
                conversationId: peerPubkey,
                peerPubkey,
                direction: 'incoming' as const,
                createdAt: 1700000101,
                plaintext: 'hola api dm',
                deliveryState: 'sent' as const,
            }]),
            sendDm: vi.fn(async () => ({
                id: 'api-send',
                clientMessageId: 'api-send',
                conversationId: peerPubkey,
                peerPubkey,
                direction: 'outgoing' as const,
                createdAt: 1700000102,
                plaintext: 'api send',
                deliveryState: 'sent' as const,
                publishResult: {
                    ackedRelays: [],
                    failedRelays: [],
                    timeoutRelays: [],
                },
                attempts: 1,
            })),
        };

        const createRuntimeServiceSpy = vi.spyOn(runtimeDmServiceModule, 'createRuntimeDirectMessagesService').mockReturnValue(runtimeReadService as any);
        const createDmApiServiceSpy = vi.spyOn(dmApiServiceModule, 'createDmApiService').mockReturnValue(apiReadService as any);
        createNdkDmTransportClientSpy!.mockImplementation(() => ({
            publishToRelays: vi.fn(async () => ({
                ackedRelays: ['wss://relay.one'],
                failedRelays: [],
                timeoutRelays: [],
            })),
            subscribe: vi.fn(() => ({
                unsubscribe() {
                    return;
                },
            })),
            fetchBackfill: vi.fn(async () => []),
        } as any));
        vi.spyOn(writeGatewayModule, 'createWriteGateway').mockReturnValue({
            publishEvent: vi.fn(async () => {
                throw new Error('not-used');
            }),
            encryptDm: vi.fn(async (_pubkey: string, plaintext: string) => plaintext),
            decryptDm: vi.fn(async (_pubkey: string, ciphertext: string) => ciphertext),
        } as any);

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    directMessagesService: apiReadService,
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [peerPubkey]: { pubkey: peerPubkey, displayName: 'Alice' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const chatButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir chats"]') as HTMLButtonElement;
        await act(async () => {
            chatButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Chats'));
        await waitFor(() => !(rendered.container.textContent || '').includes('No hay conversaciones todavía'));

        expect(rendered.container.textContent || '').toContain('hola api dm');
        expect(createRuntimeServiceSpy).not.toHaveBeenCalled();
        expect(createDmApiServiceSpy).not.toHaveBeenCalled();
        expect(apiReadService.subscribeInbox).toHaveBeenCalled();
        expect(apiReadService.loadInitialConversations).toHaveBeenCalled();
        expect(runtimeReadService.subscribeInbox).not.toHaveBeenCalled();
        expect(runtimeReadService.loadInitialConversations).not.toHaveBeenCalled();
        expect(runtimeReadService.loadConversationMessages).not.toHaveBeenCalled();

    });

    test('runtime DM factory wires subscribe/send against dm-service', async () => {
        const ownerPubkey = 'a'.repeat(64);
        const peerPubkey = 'b'.repeat(64);
        const subscribeInbox = vi.fn((_input, onMessage) => {
            onMessage({
                id: 'incoming-1',
                clientMessageId: '',
                conversationId: ownerPubkey,
                peerPubkey: ownerPubkey,
                direction: 'incoming' as const,
                createdAt: 100,
                plaintext: 'runtime incoming',
                deliveryState: 'sent' as const,
            });
            return () => {};
        });
        const sendDm = vi.fn(async () => ({
            id: 'outgoing-1',
            clientMessageId: 'client-1',
            conversationId: peerPubkey,
            peerPubkey,
            direction: 'outgoing' as const,
            createdAt: 120,
            plaintext: 'hola runtime',
            deliveryState: 'sent' as const,
            publishResult: {
                ackedRelays: ['wss://relay.one'],
                failedRelays: [],
                timeoutRelays: [],
            },
            attempts: 1,
        }));
        const createDmService = vi.fn(() => ({
            subscribeInbox,
            sendDm,
        }));
        const createTransport = vi.fn(() => ({
            publishToRelays: vi.fn(async () => ({ ackedRelays: [], failedRelays: [], timeoutRelays: [] })),
            subscribe: vi.fn(() => ({ unsubscribe: () => {} })),
            fetchBackfill: vi.fn(async () => []),
        }));

        const { createRuntimeDirectMessagesService } = await import('../nostr/dm-runtime-service');
        const service = createRuntimeDirectMessagesService({
            writeGateway: {
                publishEvent: vi.fn(),
                encryptDm: vi.fn(async (_pubkey: string, plaintext: string) => plaintext),
                decryptDm: vi.fn(async (_pubkey: string, ciphertext: string) => ciphertext),
            },
            createDmService,
            createTransport,
            resolveRelays: () => ['wss://relay.one'],
        });

        const onMessage = vi.fn();
        const stop = service.subscribeInbox({ ownerPubkey }, onMessage);
        const sent = await service.sendDm?.({
            ownerPubkey,
            peerPubkey,
            plaintext: 'hola runtime',
            clientMessageId: 'client-1',
        });

        expect(createDmService).toHaveBeenCalled();
        expect(createTransport).toHaveBeenCalled();
        expect(subscribeInbox).toHaveBeenCalledWith(
            { ownerPubkey },
            expect.any(Function)
        );
        expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({
            id: 'incoming-1',
            conversationId: ownerPubkey,
        }));
        expect(sendDm).toHaveBeenCalledWith(expect.objectContaining({
            ownerPubkey,
            peerPubkey,
            plaintext: 'hola runtime',
            clientMessageId: 'client-1',
            targetRelays: ['wss://relay.one'],
        }));
        expect(sent).toMatchObject({
            id: 'outgoing-1',
            conversationId: peerPubkey,
            plaintext: 'hola runtime',
        });

        if (typeof stop === 'function') {
            stop();
        }
    });

    test('opens chat dialog and shows existing conversations from dm api backfill', async () => {
        const ownerPubkey = SAMPLE_AUTH_PUBKEY;
        const peerPubkey = 'a'.repeat(64);
        const runtimeReadService = {
            subscribeInbox: vi.fn(() => () => {}),
            loadInitialConversations: vi.fn(async () => []),
            loadConversationMessages: vi.fn(async () => []),
            sendDm: vi.fn(async () => ({
                id: 'runtime-send',
                clientMessageId: 'runtime-send',
                conversationId: peerPubkey,
                peerPubkey,
                direction: 'outgoing' as const,
                createdAt: 1700000301,
                plaintext: 'runtime send',
                deliveryState: 'sent' as const,
                publishResult: {
                    ackedRelays: [],
                    failedRelays: [],
                    timeoutRelays: [],
                },
                attempts: 1,
            })),
        };
        const apiReadService = {
            subscribeInbox: vi.fn(() => () => {}),
            loadInitialConversations: vi.fn(async () => [{
                id: 'api-historical-1',
                clientMessageId: 'api-historical-1',
                conversationId: peerPubkey,
                peerPubkey,
                direction: 'incoming' as const,
                createdAt: 1700000300,
                plaintext: 'historial visible',
                deliveryState: 'sent' as const,
            }]),
            loadConversationMessages: vi.fn(async () => []),
            sendDm: vi.fn(async () => ({
                id: 'api-send',
                clientMessageId: 'api-send',
                conversationId: peerPubkey,
                peerPubkey,
                direction: 'outgoing' as const,
                createdAt: 1700000302,
                plaintext: 'api send',
                deliveryState: 'sent' as const,
                publishResult: {
                    ackedRelays: [],
                    failedRelays: [],
                    timeoutRelays: [],
                },
                attempts: 1,
            })),
        };
        const createRuntimeServiceSpy = vi
            .spyOn(runtimeDmServiceModule, 'createRuntimeDirectMessagesService')
            .mockReturnValue(runtimeReadService as any);
        const createDmApiServiceSpy = vi
            .spyOn(dmApiServiceModule, 'createDmApiService')
            .mockReturnValue(apiReadService as any);

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={createBasicOverlayServices(ownerPubkey, {
                    directMessagesService: apiReadService,
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [peerPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [peerPubkey]: { pubkey: peerPubkey, displayName: 'Alice' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                })}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const panelChatButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir chats"]') as HTMLButtonElement;
        await act(async () => {
            panelChatButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Chats'));
        await waitFor(() => (rendered.container.textContent || '').includes('Alice'));
        expect(rendered.container.textContent || '').toContain('historial visible');

        expect(createRuntimeServiceSpy).not.toHaveBeenCalled();
        expect(createDmApiServiceSpy).not.toHaveBeenCalled();
        expect(apiReadService.subscribeInbox).toHaveBeenCalled();
        expect(apiReadService.loadInitialConversations).toHaveBeenCalled();
        expect(runtimeReadService.subscribeInbox).not.toHaveBeenCalled();
        expect(runtimeReadService.loadInitialConversations).not.toHaveBeenCalled();
        expect(runtimeReadService.loadConversationMessages).not.toHaveBeenCalled();
    });

    test('does not initialize runtime dm transport while loading chat reads from bff', async () => {
        const ownerPubkey = SAMPLE_AUTH_PUBKEY;
        const hintedRelay = 'wss://relay.hinted.example';
        const createRuntimeServiceSpy = vi.spyOn(runtimeDmServiceModule, 'createRuntimeDirectMessagesService');
        const createDmApiServiceSpy = vi.spyOn(dmApiServiceModule, 'createDmApiService').mockReturnValue({
            subscribeInbox: vi.fn(() => () => {}),
            loadInitialConversations: vi.fn(async () => []),
            loadConversationMessages: vi.fn(async () => []),
            sendDm: vi.fn(async () => ({
                id: 'api-send',
                clientMessageId: 'api-send',
                conversationId: 'a'.repeat(64),
                peerPubkey: 'a'.repeat(64),
                direction: 'outgoing',
                createdAt: 1700000401,
                plaintext: 'api send',
                deliveryState: 'sent',
                publishResult: {
                    ackedRelays: [],
                    failedRelays: [],
                    timeoutRelays: [],
                },
                attempts: 1,
            })),
        } as any);

        createNdkDmTransportClientSpy!.mockReturnValue({
            publishToRelays: vi.fn(async () => ({
                ackedRelays: [],
                failedRelays: [],
                timeoutRelays: [],
            })),
            subscribe: vi.fn(() => ({
                unsubscribe() {
                    return;
                },
            })),
            fetchBackfill: vi.fn(async () => []),
        } as any);

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={createBasicOverlayServices(ownerPubkey, {
                    directMessagesService: {
                        subscribeInbox: vi.fn(() => () => {}),
                        loadInitialConversations: vi.fn(async () => []),
                        loadConversationMessages: vi.fn(async () => []),
                        sendDm: vi.fn(async () => ({
                            id: 'api-send',
                            clientMessageId: 'api-send',
                            conversationId: 'a'.repeat(64),
                            peerPubkey: 'a'.repeat(64),
                            direction: 'outgoing' as const,
                            createdAt: 1700000401,
                            plaintext: 'api send',
                            deliveryState: 'sent' as const,
                            publishResult: {
                                ackedRelays: [],
                                failedRelays: [],
                                timeoutRelays: [],
                            },
                            attempts: 1,
                        })),
                    },
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async (_pubkey: string, kind: number) => {
                            if (kind === 10002) {
                                return {
                                    id: '1'.repeat(64),
                                    pubkey: ownerPubkey,
                                    kind: 10002,
                                    created_at: 1700000400,
                                    tags: [['r', hintedRelay]],
                                    content: '',
                                    sig: '2'.repeat(128),
                                } as any;
                            }

                            return null;
                        },
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                })}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const panelChatButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir chats"]') as HTMLButtonElement;
        await act(async () => {
            panelChatButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Chats'));

        expect(createDmApiServiceSpy).not.toHaveBeenCalled();
        expect(createRuntimeServiceSpy).not.toHaveBeenCalled();
        expect(createNdkDmTransportClientSpy).not.toHaveBeenCalled();
    });

    test('caps runtime dm relay fanout to avoid oversized target relay lists', async () => {
        const ownerPubkey = SAMPLE_AUTH_PUBKEY;
        const followedPubkey = 'a'.repeat(64);
        const { bridge, triggerOccupiedBuildingContextMenu } = createMapBridgeStub();
        let latestDirectMessageRelays: { inbox: string[]; outbox: string[] } = { inbox: [], outbox: [] };
        const sendDm = vi.fn(async () => ({
            id: 'outgoing-capped',
            clientMessageId: 'outgoing-capped',
            conversationId: followedPubkey,
            peerPubkey: followedPubkey,
            direction: 'outgoing' as const,
            createdAt: 1700001501,
            plaintext: 'mensaje capped',
            deliveryState: 'sent' as const,
            publishResult: {
                ackedRelays: ['wss://relay.ack.example'],
                failedRelays: [],
                timeoutRelays: [],
            },
            attempts: 1,
        }));
        const transportCreations: Array<{
            relays: string[];
            publishToRelays: ReturnType<typeof vi.fn>;
        }> = [];

        window.localStorage.setItem(
            RELAY_SETTINGS_STORAGE_KEY,
            JSON.stringify({
                relays: Array.from({ length: 12 }, (_, index) => `wss://relay.config-${index}.example`),
                byType: {
                    nip65Both: Array.from({ length: 6 }, (_, index) => `wss://relay.both-${index}.example`),
                    nip65Read: Array.from({ length: 6 }, (_, index) => `wss://relay.read-${index}.example`),
                    nip65Write: Array.from({ length: 6 }, (_, index) => `wss://relay.write-${index}.example`),
                    dmInbox: Array.from({ length: 6 }, (_, index) => `wss://relay.inbox-${index}.example`),
                    search: [],
                },
            })
        );

        createNdkDmTransportClientSpy!.mockImplementation((relays: string[] = []) => {
            const publishToRelays = vi.fn(async () => ({
                ackedRelays: ['wss://relay.ack.example'],
                failedRelays: [],
                timeoutRelays: [],
            }));
            transportCreations.push({
                relays,
                publishToRelays,
            });

            return {
                publishToRelays,
                subscribe: vi.fn(() => ({
                    unsubscribe() {
                        return;
                    },
                })),
                fetchBackfill: vi.fn(async () => []),
            } as any;
        });

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={createBasicOverlayServices(ownerPubkey, {
                    directMessagesService: {
                        subscribeInbox: vi.fn(() => () => {}),
                        loadInitialConversations: vi.fn(async () => []),
                        loadConversationMessages: vi.fn(async () => []),
                        sendDm,
                    },
                    setDirectMessageRelays: (relays) => {
                        latestDirectMessageRelays = relays;
                    },
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async (_pubkey: string, kind: number) => {
                            if (kind === 10002) {
                                return {
                                    id: 'relay-list-owner',
                                    pubkey: ownerPubkey,
                                    kind: 10002,
                                    created_at: 1700001500,
                                    tags: [
                                        ...Array.from({ length: 6 }, (_, index) => ['r', `wss://relay.owner-both-${index}.example`] as string[]),
                                        ...Array.from({ length: 6 }, (_, index) => ['r', `wss://relay.owner-write-${index}.example`, 'write'] as string[]),
                                    ],
                                    content: '',
                                    sig: '4'.repeat(128),
                                } as any;
                            }

                            if (kind === 10050) {
                                return {
                                    id: 'relay-dm-owner',
                                    pubkey: ownerPubkey,
                                    kind: 10050,
                                    created_at: 1700001600,
                                    tags: Array.from({ length: 6 }, (_, index) => ['relay', `wss://relay.owner-dm-${index}.example`]),
                                    content: '',
                                    sig: '5'.repeat(128),
                                } as any;
                            }

                            return null;
                        },
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: Array.from({ length: 6 }, (_, index) => `wss://relay.hint-${index}.example`),
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [followedPubkey]: { pubkey: followedPubkey, displayName: 'Alice', lud16: 'alice@getalby.com' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                })}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await act(async () => {
            triggerOccupiedBuildingContextMenu({
                buildingIndex: 2,
                pubkey: followedPubkey,
                clientX: 320,
                clientY: 240,
            });
        });

        await waitFor(() => (document.body.textContent || '').includes('Enviar mensaje'));

        const dmItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((node) =>
            (node.textContent || '').includes('Enviar mensaje')
        ) as HTMLElement;

        await act(async () => {
            dmItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Chats'));

        const composer = rendered.container.querySelector('.nostr-chat-composer-input') as HTMLTextAreaElement;
        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
            valueSetter?.call(composer, 'mensaje capped');
            composer.dispatchEvent(new Event('input', { bubbles: true }));
            composer.dispatchEvent(new Event('change', { bubbles: true }));
        });

        const sendButton = rendered.container.querySelector('.nostr-chat-send') as HTMLButtonElement;
        await act(async () => {
            sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => sendDm.mock.calls.length > 0);

        expect(latestDirectMessageRelays.inbox.length).toBeLessThanOrEqual(8);
        expect(latestDirectMessageRelays.outbox.length).toBeLessThanOrEqual(8);
        expect(transportCreations).toHaveLength(0);
    });

    test('updates chat list when dm api bootstrap resolves after dialog is already open', async () => {
        const ownerPubkey = SAMPLE_AUTH_PUBKEY;
        const peerPubkey = 'a'.repeat(64);
        let resolveApiBackfill: ((items: any[]) => void) | null = null;
        const apiBackfillPromise = new Promise<any[]>((resolve) => {
            resolveApiBackfill = resolve;
        });
        const runtimeReadService = {
            subscribeInbox: vi.fn(() => () => {}),
            loadInitialConversations: vi.fn(async () => []),
            loadConversationMessages: vi.fn(async () => []),
            sendDm: vi.fn(async () => ({
                id: 'runtime-send',
                clientMessageId: 'runtime-send',
                conversationId: peerPubkey,
                peerPubkey,
                direction: 'outgoing' as const,
                createdAt: 1700000601,
                plaintext: 'runtime send',
                deliveryState: 'sent' as const,
                publishResult: {
                    ackedRelays: [],
                    failedRelays: [],
                    timeoutRelays: [],
                },
                attempts: 1,
            })),
        };
        const apiReadService = {
            subscribeInbox: vi.fn(() => () => {}),
            loadInitialConversations: vi.fn(async () => apiBackfillPromise),
            loadConversationMessages: vi.fn(async () => []),
            sendDm: vi.fn(async () => ({
                id: 'api-send',
                clientMessageId: 'api-send',
                conversationId: peerPubkey,
                peerPubkey,
                direction: 'outgoing' as const,
                createdAt: 1700000602,
                plaintext: 'api send',
                deliveryState: 'sent' as const,
                publishResult: {
                    ackedRelays: [],
                    failedRelays: [],
                    timeoutRelays: [],
                },
                attempts: 1,
            })),
        };
        const createRuntimeServiceSpy = vi
            .spyOn(runtimeDmServiceModule, 'createRuntimeDirectMessagesService')
            .mockReturnValue(runtimeReadService as any);
        const createDmApiServiceSpy = vi
            .spyOn(dmApiServiceModule, 'createDmApiService')
            .mockReturnValue(apiReadService as any);

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={createBasicOverlayServices(ownerPubkey, {
                    directMessagesService: apiReadService,
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [peerPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [peerPubkey]: { pubkey: peerPubkey, displayName: 'Alice' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                })}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const panelChatButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir chats"]') as HTMLButtonElement;
        await act(async () => {
            panelChatButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => apiReadService.loadInitialConversations.mock.calls.length > 0);

        await waitFor(() => (rendered.container.textContent || '').includes('Cargando conversaciones'));

        await act(async () => {
            resolveApiBackfill?.([
                {
                    id: 'api-historical-late',
                    clientMessageId: 'api-historical-late',
                    conversationId: peerPubkey,
                    peerPubkey,
                    direction: 'incoming',
                    createdAt: 1700000600,
                    plaintext: 'historial tardio',
                    deliveryState: 'sent',
                },
            ]);
        });

        await waitFor(() => (rendered.container.textContent || '').includes('historial tardio'));

        expect(createRuntimeServiceSpy).not.toHaveBeenCalled();
        expect(createDmApiServiceSpy).not.toHaveBeenCalled();
        expect(runtimeReadService.loadInitialConversations).not.toHaveBeenCalled();
        expect(runtimeReadService.subscribeInbox).not.toHaveBeenCalled();
    });

    test('renders map zoom controls with current zoom level', async () => {
        const { bridge } = createMapBridgeStub();
        (bridge.getZoom as any).mockReturnValue(2.5);
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const content = rendered.container.textContent || '';
        expect(content).toContain('2.50x');
    });

    test('applies zoom controls in +1 and -1 steps', async () => {
        const { bridge } = createMapBridgeStub();
        (bridge.getZoom as any).mockReturnValue(4);
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const zoomInButton = rendered.container.querySelector('button[aria-label="Acercar mapa"]') as HTMLButtonElement;
        const zoomOutButton = rendered.container.querySelector('button[aria-label="Alejar mapa"]') as HTMLButtonElement;
        expect(zoomInButton).toBeDefined();
        expect(zoomOutButton).toBeDefined();

        await act(async () => {
            zoomInButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await act(async () => {
            zoomOutButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect((bridge.setZoom as any).mock.calls[0][0]).toBe(5);
        expect((bridge.setZoom as any).mock.calls[1][0]).toBe(4);
    });

    test('renders zoom out button before zoom in button', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const zoomGroup = rendered.container.querySelector('.nostr-map-zoom-controls .nostr-map-zoom-group');
        expect(zoomGroup).toBeDefined();
        expect(zoomGroup?.getAttribute('role')).toBe('group');

        const zoomButtons = Array.from(rendered.container.querySelectorAll('.nostr-map-zoom-controls .nostr-map-zoom-button')) as HTMLButtonElement[];
        expect(zoomButtons.length).toBe(2);
        expect(zoomButtons[0]?.getAttribute('aria-label')).toBe('Alejar mapa');
        expect(zoomButtons[1]?.getAttribute('aria-label')).toBe('Acercar mapa');
        expect(zoomButtons[0]?.className.includes('nostr-map-zoom-button-left')).toBe(true);
        expect(zoomButtons[1]?.className.includes('nostr-map-zoom-button-right')).toBe(true);

        expect(rendered.container.querySelector('.nostr-map-zoom-controls .nostr-map-regenerate-button')).toBeNull();
    });

    test('renders floating map options menu with car, street and special marker toggles', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const optionsButton = rendered.container.querySelector('button[aria-label="Opciones del mapa"]') as HTMLButtonElement;
        expect(optionsButton).toBeDefined();
        await openDropdownTrigger(optionsButton);

        const optionLabels = Array.from(document.body.querySelectorAll('[role="menuitemcheckbox"]')).map((item) => item.textContent?.trim());
        expect(optionLabels).toEqual(['Coches', 'Etiquetas de calles', 'Iconos especiales']);
        expect(Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).some((item) => item.textContent?.trim() === 'Regenerar mapa')).toBe(true);
    });

    test('toggles special markers from floating controls and persists preference', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const optionsButton = rendered.container.querySelector('button[aria-label="Opciones del mapa"]') as HTMLButtonElement;
        expect(optionsButton).toBeDefined();
        await openDropdownTrigger(optionsButton);
        const getSpecialMarkersItem = () => Array.from(document.body.querySelectorAll('[role="menuitemcheckbox"]')).find((item) =>
            item.textContent?.trim() === 'Iconos especiales'
        ) as HTMLElement;

        await act(async () => {
            getSpecialMarkersItem().dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const firstSaved = JSON.parse(window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY) || '{}');
        expect(firstSaved.specialMarkersEnabled).toBe(false);
        await waitFor(() => (document.body.textContent || '').includes('Iconos especiales desactivados'));

        await openDropdownTrigger(optionsButton);

        await act(async () => {
            getSpecialMarkersItem().dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const secondSaved = JSON.parse(window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY) || '{}');
        expect(secondSaved.specialMarkersEnabled).toBe(true);
        await waitFor(() => (document.body.textContent || '').includes('Iconos especiales activados'));
    });

    test('toggles street labels from floating controls', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const optionsButton = rendered.container.querySelector('button[aria-label="Opciones del mapa"]') as HTMLButtonElement;
        expect(optionsButton).toBeDefined();
        await openDropdownTrigger(optionsButton);
        const getStreetLabelsItem = () => Array.from(document.body.querySelectorAll('[role="menuitemcheckbox"]')).find((item) =>
            item.textContent?.trim() === 'Etiquetas de calles'
        ) as HTMLElement;

        await act(async () => {
            getStreetLabelsItem().dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => {
            const calls = (bridge.setStreetLabelsEnabled as any).mock.calls;
            return calls.length > 1;
        });

        expect((bridge.setStreetLabelsEnabled as any).mock.calls.at(-1)?.[0]).toBe(false);

        await openDropdownTrigger(optionsButton);

        await act(async () => {
            getStreetLabelsItem().dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => {
            const calls = (bridge.setStreetLabelsEnabled as any).mock.calls;
            return calls.length > 2;
        });

        expect((bridge.setStreetLabelsEnabled as any).mock.calls.at(-1)?.[0]).toBe(true);
        await waitFor(() => (document.body.textContent || '').includes('Etiquetas de calles activadas'));
        const saved = JSON.parse(window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY) || '{}');
        expect(saved.streetLabelsZoomLevel).toBe(2);
        expect((bridge.setStreetLabelsZoomLevel as any).mock.calls.at(-1)?.[0]).toBe(2);
    });

    test('uses street label zoom default 2 on mount when no setting is stored', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await waitFor(() => (bridge.setStreetLabelsZoomLevel as any).mock.calls.length > 0);

        expect((bridge.setStreetLabelsZoomLevel as any).mock.calls.at(-1)?.[0]).toBe(2);
    });

    test('toggles cars from floating controls restoring previous count', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({
            occupiedLabelsZoomLevel: 8,
            streetLabelsEnabled: true,
            streetLabelsZoomLevel: 10,
            trafficParticlesCount: 18,
            trafficParticlesSpeed: 1,
        }));

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const optionsButton = rendered.container.querySelector('button[aria-label="Opciones del mapa"]') as HTMLButtonElement;
        expect(optionsButton).toBeDefined();
        await openDropdownTrigger(optionsButton);
        const getCarsItem = () => Array.from(document.body.querySelectorAll('[role="menuitemcheckbox"]')).find((item) =>
            item.textContent?.trim() === 'Coches'
        ) as HTMLElement;

        await act(async () => {
            getCarsItem().dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => {
            const calls = (bridge.setTrafficParticlesCount as any).mock.calls;
            return calls.some((call: unknown[]) => call[0] === 0);
        });

        expect((bridge.setTrafficParticlesCount as any).mock.calls.at(-1)?.[0]).toBe(0);
        await waitFor(() => (document.body.textContent || '').includes('Coches desactivados'));

        await openDropdownTrigger(optionsButton);

        await act(async () => {
            getCarsItem().dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => {
            const calls = (bridge.setTrafficParticlesCount as any).mock.calls;
            return calls.some((call: unknown[]) => call[0] === 18);
        });

        expect((bridge.setTrafficParticlesCount as any).mock.calls.at(-1)?.[0]).toBe(18);
        await waitFor(() => (document.body.textContent || '').includes('Coches activados'));
    });

    test('shows owner profile actions menu and runs locate/copy actions', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const clipboardWriteText = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, {
            clipboard: {
                writeText: clipboardWriteText,
            },
        });

        const { bridge } = createMapBridgeStub(1);
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [followedPubkey]: { pubkey: followedPubkey, displayName: 'Alice' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const actionsButton = rendered.container.querySelector('button[aria-label="Abrir menú de usuario"]') as HTMLButtonElement;
        expect(actionsButton).toBeDefined();
        const userMenuSection = actionsButton.closest('[data-slot="sidebar-menu"]') as HTMLElement;
        expect(userMenuSection).toBeDefined();
        expect(userMenuSection.className).toContain('border-t');

        await openDropdownTrigger(actionsButton);

        await waitFor(() => Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).some((node) =>
            (node.textContent || '').trim() === 'Copiar npub'
        ));

        expect(document.body.querySelector('[data-slot="dropdown-menu-label"]')).toBeNull();

        const copyItem = Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).find((node) =>
            (node.textContent || '').trim() === 'Copiar npub'
        ) as HTMLElement;
        const locateItem = Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).find((node) =>
            (node.textContent || '').trim() === 'Ubicar en el mapa'
        ) as HTMLElement;
        const messageItem = Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).find((node) =>
            (node.textContent || '').trim() === 'Enviar mensaje'
        );

        expect(copyItem).toBeDefined();
        expect(locateItem).toBeDefined();
        expect(messageItem).toBeUndefined();

        await act(async () => {
            copyItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(clipboardWriteText).toHaveBeenCalledTimes(1);
        expect((clipboardWriteText.mock.calls[0]?.[0] as string | undefined)?.startsWith('npub1')).toBe(true);
        await waitFor(() => (rendered.container.textContent || '').includes('npub copiada'));

        await openDropdownTrigger(actionsButton);

        await waitFor(() => Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).some((node) =>
            (node.textContent || '').trim() === 'Ubicar en el mapa'
        ));

        const locateItemAgain = Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).find((node) =>
            (node.textContent || '').trim() === 'Ubicar en el mapa'
        ) as HTMLElement;

        await act(async () => {
            locateItemAgain.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect((bridge.focusBuilding as any).mock.calls.some((call: unknown[]) => call[0] === 0)).toBe(true);
    });

    test('shows locate/copy actions for following rows and returns to map route when locating', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const clipboardWriteText = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, {
            clipboard: {
                writeText: clipboardWriteText,
            },
        });

        const { bridge } = createMapBridgeStub(6);
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, NostrProfile> = {};
                        for (const pubkey of pubkeys) {
                            if (pubkey === ownerPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner' };
                            }
                            if (pubkey === followedPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Alice', lud16: 'alice@getalby.com' };
                            }
                        }
                        return profiles;
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />,
            {
                initialEntries: ['/'],
            }
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Ágora"]') as HTMLButtonElement;
        expect(feedButton).toBeDefined();

        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => rendered.container.querySelector('.nostr-following-feed-surface') !== null);

        const followingItem = rendered.container.querySelector('button[aria-label="Abrir lista de seguidos"]') as HTMLButtonElement;
        expect(followingItem).toBeDefined();

        await act(async () => {
            followingItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Alice'));

        const actionsButton = document.body.querySelector('button[aria-label="Abrir acciones para Alice"]') as HTMLButtonElement;
        expect(actionsButton).toBeDefined();

        await act(async () => {
            actionsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).some((node) =>
            (node.textContent || '').trim() === 'Ubicar en el mapa'
        ));

        const zapSubTrigger = Array.from(document.body.querySelectorAll('[data-slot="context-menu-sub-trigger"]')).find((node) =>
            (node.textContent || '').trim() === 'Zap'
        ) as HTMLElement;
        expect(zapSubTrigger).toBeDefined();

        const copyFollowingItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((node) =>
            (node.textContent || '').trim() === 'Copiar npub'
        ) as HTMLElement;
        expect(copyFollowingItem).toBeDefined();

        await act(async () => {
            copyFollowingItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(clipboardWriteText).toHaveBeenCalledTimes(1);
        expect((clipboardWriteText.mock.calls[0]?.[0] as string | undefined)?.startsWith('npub1')).toBe(true);

        await act(async () => {
            actionsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).some((node) =>
            (node.textContent || '').trim() === 'Ubicar en el mapa'
        ));

        const locateFollowingItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((node) =>
            (node.textContent || '').trim() === 'Ubicar en el mapa'
        ) as HTMLElement;
        expect(locateFollowingItem).toBeDefined();

        const focusCallsBeforeLocate = (bridge.focusBuilding as any).mock.calls.length;
        await act(async () => {
            locateFollowingItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect((bridge.focusBuilding as any).mock.calls.length).toBeGreaterThan(focusCallsBeforeLocate);
        await waitFor(() => rendered.container.querySelector('.nostr-following-feed-surface') === null);
        expect(rendered.container.querySelector('[aria-label="Controles de zoom"]')).not.toBeNull();
    });

    test('allows following from followers tab and updates row state to following', async () => {
        const ownerPubkey = SAMPLE_AUTH_PUBKEY;
        const followedPubkey = 'a'.repeat(64);
        const followerPubkey = 'b'.repeat(64);
        const publishContactList = vi.fn(async () => ({
            id: '1'.repeat(64),
            pubkey: ownerPubkey,
            kind: 3,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['p', followedPubkey], ['p', followerPubkey]],
            content: '',
            sig: '2'.repeat(128),
        }));

        vi.spyOn(writeGatewayModule, 'createWriteGateway').mockReturnValue({
            publishEvent: vi.fn(async (event: any) => ({
                ...event,
                id: '3'.repeat(64),
                pubkey: ownerPubkey,
                sig: '4'.repeat(128),
            })),
            publishContactList,
            encryptDm: vi.fn(async (_pubkey: string, plaintext: string) => plaintext),
            decryptDm: vi.fn(async (_pubkey: string, ciphertext: string) => ciphertext),
        } as any);

        const { bridge } = createMapBridgeStub(8);
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [followedPubkey]: { pubkey: followedPubkey, displayName: 'Alice' },
                        [followerPubkey]: { pubkey: followerPubkey, displayName: 'Bob' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [followerPubkey],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const followersItem = rendered.container.querySelector('button[aria-label="Abrir lista de seguidores"]') as HTMLButtonElement;
        expect(followersItem).toBeDefined();

        await act(async () => {
            followersItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Bob'));

        const followBobButton = document.body.querySelector('button[aria-label="Seguir a Bob"]') as HTMLButtonElement;
        expect(followBobButton).toBeDefined();
        expect(followBobButton.disabled).toBe(false);

        await act(async () => {
            followBobButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(publishContactList).toHaveBeenCalledTimes(1);
        expect(publishContactList).toHaveBeenCalledWith([followedPubkey, followerPubkey]);

        await waitFor(() => {
            const followingButton = document.body.querySelector('button[aria-label="Dejar de seguir a Bob"]') as HTMLButtonElement | null;
            return Boolean(followingButton && !followingButton.disabled);
        });
    });

    test('allows unfollowing from following tab and updates row state to follow', async () => {
        const ownerPubkey = SAMPLE_AUTH_PUBKEY;
        const followedPubkey = 'a'.repeat(64);
        const publishContactList = vi.fn(async () => ({
            id: '1'.repeat(64),
            pubkey: ownerPubkey,
            kind: 3,
            created_at: Math.floor(Date.now() / 1000),
            tags: [],
            content: '',
            sig: '2'.repeat(128),
        }));

        vi.spyOn(writeGatewayModule, 'createWriteGateway').mockReturnValue({
            publishEvent: vi.fn(async (event: any) => ({
                ...event,
                id: '3'.repeat(64),
                pubkey: ownerPubkey,
                sig: '4'.repeat(128),
            })),
            publishContactList,
            encryptDm: vi.fn(async (_pubkey: string, plaintext: string) => plaintext),
            decryptDm: vi.fn(async (_pubkey: string, ciphertext: string) => ciphertext),
        } as any);

        const { bridge } = createMapBridgeStub(8);
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [followedPubkey]: { pubkey: followedPubkey, displayName: 'Alice' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const followingItem = rendered.container.querySelector('button[aria-label="Abrir lista de seguidos"]') as HTMLButtonElement;
        expect(followingItem).toBeDefined();

        await act(async () => {
            followingItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Alice'));

        expect(document.body.querySelector('button[aria-label="Dejar de seguir a Alice"]')).toBeNull();

        const actionsButton = document.body.querySelector('button[aria-label="Abrir acciones para Alice"]') as HTMLButtonElement;
        expect(actionsButton).toBeDefined();

        await act(async () => {
            actionsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).some((node) =>
            (node.textContent || '').trim() === 'Dejar de seguir a Alice'
        ));
        const unfollowAliceItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((node) =>
            (node.textContent || '').trim() === 'Dejar de seguir a Alice'
        ) as HTMLElement;

        await act(async () => {
            unfollowAliceItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(publishContactList).toHaveBeenCalledTimes(1);
        expect(publishContactList).toHaveBeenCalledWith([]);

        await waitFor(() => {
            const text = document.body.textContent || '';
            return text.includes('No hay cuentas seguidas todavía.') && !text.includes('Alice');
        });
    });

    test('navigates to map route when selecting a followed user from relays view', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const personPubkey = 'a'.repeat(64);

        const { bridge } = createMapBridgeStub(6);
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [personPubkey],
                        relayHints: [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [personPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [personPubkey]: { pubkey: personPubkey, displayName: 'Alice' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [personPubkey],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />,
            {
                initialEntries: ['/'],
            }
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const relaysButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir relays"]') as HTMLButtonElement;
        expect(relaysButton).toBeDefined();

        await act(async () => {
            relaysButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => rendered.container.querySelector('[aria-label="Relays"]') !== null);

        const followingItem = rendered.container.querySelector('button[aria-label="Abrir lista de seguidos"]') as HTMLButtonElement;
        expect(followingItem).toBeDefined();

        await act(async () => {
            followingItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Alice'));

        const followedButton = Array.from(document.body.querySelectorAll('button[aria-pressed]')).find((button) =>
            (button.textContent || '').includes('Alice')
        ) as HTMLButtonElement;
        expect(followedButton).toBeDefined();

        await act(async () => {
            followedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => rendered.container.querySelector('[aria-label="Relays"]') === null);
        expect(rendered.container.querySelector('[aria-label="Controles de zoom"]')).not.toBeNull();
    });

    test('shows map loader stage messages while processing npub', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);

        const followsDeferred = createDeferred<{ ownerPubkey: string; follows: string[]; relayHints: string[] }>();
        const profilesDeferred = createDeferred<Record<string, { pubkey: string; displayName: string }>>();
        const mapDeferred = createDeferred<void>();

        const { bridge } = createMapBridgeStub(6);
        (bridge.regenerateMap as any).mockImplementation(() => mapDeferred.promise);

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockImplementation(async () => followsDeferred.promise),
                    fetchProfilesFn: vi.fn().mockImplementation(async () => profilesDeferred.promise),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        expect(rendered.container.querySelector('[data-testid="login-gate-screen"]')).not.toBeNull();
        await waitFor(() => (rendered.container.textContent || '').includes('Conectando a relays'));

        await act(async () => {
            followsDeferred.resolve({
                ownerPubkey,
                follows: [followedPubkey],
                relayHints: [],
            });
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Obteniendo datos'));

        await act(async () => {
            profilesDeferred.resolve({
                [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                [followedPubkey]: { pubkey: followedPubkey, displayName: 'Alice' },
            });
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Construyendo mapa'));

        await act(async () => {
            mapDeferred.resolve();
        });
    });

    test('applies occupancy progressively after city is generated', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const follows = Array.from({ length: 8 }, (_, index) => `${(index + 1).toString(16).repeat(64)}`);
        const { bridge } = createMapBridgeStub(20);

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows,
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue(
                        Object.fromEntries([
                            [ownerPubkey, { pubkey: ownerPubkey, displayName: 'Owner' }],
                            ...follows.map((pubkey, index) => [pubkey, { pubkey, displayName: `User-${index}` }]),
                        ])
                    ),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (bridge.applyOccupancy as any).mock.calls.length > 1);

        const firstCall = (bridge.applyOccupancy as any).mock.calls[0][0];
        expect(firstCall.byBuildingIndex).toEqual({});
    });

    test('loads profile and followers in tabs after npub submit', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const followerPubkey = 'b'.repeat(64);
        const { bridge } = createMapBridgeStub();

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: ['wss://relay.example'],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, NostrProfile> = {};
                        for (const pubkey of pubkeys) {
                            if (pubkey === ownerPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner' };
                                continue;
                            }

                            if (pubkey === followedPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Alice' };
                                continue;
                            }

                            if (pubkey === followerPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Bob' };
                            }
                        }

                        return profiles;
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockImplementation(async ({ onBatch }: { onBatch?: (batch: { newFollowers: string[]; totalFollowers: number; done: boolean }) => Promise<void> | void }) => {
                        await onBatch?.({
                            newFollowers: [followerPubkey],
                            totalFollowers: 1,
                            done: false,
                        });

                        return {
                            followers: [followerPubkey],
                            scannedBatches: 1,
                            complete: true,
                        };
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
        expect(rendered.container.querySelector('button[aria-label="Abrir lista de seguidos"]')?.closest('[data-slot="sidebar-menu-item"]')?.textContent || '').toContain('1');
        expect(rendered.container.querySelector('button[aria-label="Abrir lista de seguidores"]')?.closest('[data-slot="sidebar-menu-item"]')?.textContent || '').toContain('1');

        const followersItem = rendered.container.querySelector('button[aria-label="Abrir lista de seguidores"]') as HTMLButtonElement;
        expect(followersItem).toBeDefined();

        await act(async () => {
            followersItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Bob'));
    });

    test('shows progressive followers loading status after npub submit', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        let resolveFollowers: (() => void) | undefined;

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: ['wss://relay.example'],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            if (pubkey === ownerPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner' };
                                continue;
                            }

                            if (pubkey === followedPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Alice' };
                            }
                        }

                        return profiles;
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockImplementation(async () => {
                        return new Promise((resolve) => {
                            resolveFollowers = () => resolve({
                                followers: [],
                                scannedBatches: 1,
                                complete: true,
                            });
                        });
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') !== null);
        expect(rendered.container.textContent || '').toContain('Cargando');

        await act(async () => {
            resolveFollowers?.();
        });

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') === null);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
    });

    test('shows Solo lectura badge inside user menu item in expanded sidebar', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge } = createMapBridgeStub(1);

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [followedPubkey]: { pubkey: followedPubkey, displayName: 'Alice' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Solo lectura'));
        const userMenuButton = rendered.container.querySelector('button[aria-label="Abrir menú de usuario"]') as HTMLButtonElement;
        expect(userMenuButton).toBeDefined();
        expect(userMenuButton.textContent || '').toContain('Solo lectura');

        const topStatusBadge = rendered.container.querySelector('.nostr-panel-toolbar-status [data-slot="badge"]');
        expect(topStatusBadge).toBeNull();

    });

    test('opens occupant dialog and focuses building after occupied building click event', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge, triggerOccupiedBuildingClick } = createMapBridgeStub();

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            if (pubkey === ownerPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner' };
                            }
                            if (pubkey === followedPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Alice' };
                            }
                        }
                        return profiles;
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await act(async () => {
            triggerOccupiedBuildingClick({
                buildingIndex: 4,
                pubkey: followedPubkey,
            });
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Alice'));
        expect((bridge.focusBuilding as any).mock.calls[0][0]).toBe(4);
        await waitFor(() => {
            const highlightCalls = (bridge.setDialogBuildingHighlight as any).mock.calls;
            return highlightCalls.length > 0 && highlightCalls[highlightCalls.length - 1][0] === 4;
        });

        const occupantDialog = document.body.querySelector('[data-slot="dialog-content"][aria-label="Perfil del ocupante"]') as HTMLElement;
        expect(occupantDialog).toBeDefined();
        expect(occupantDialog.style.width).toBe('');
        expect(occupantDialog.style.maxWidth).toBe('');

        const closeButton = rendered.container.querySelector('button[aria-label="Cerrar perfil"]') as HTMLButtonElement;
        expect(closeButton).toBeDefined();

        await act(async () => {
            closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => {
            const latestCalls = (bridge.setDialogBuildingHighlight as any).mock.calls;
            return latestCalls.length > 0 && latestCalls[latestCalls.length - 1][0] === undefined;
        });
    });

    test('opens right-click context menu with zap submenu and can open details/settings actions', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const clipboardWriteText = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, {
            clipboard: {
                writeText: clipboardWriteText,
            },
        });

        const { bridge, triggerOccupiedBuildingContextMenu } = createMapBridgeStub();

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            if (pubkey === ownerPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner' };
                            }
                            if (pubkey === followedPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Alice' };
                            }
                        }

                        return profiles;
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await act(async () => {
            triggerOccupiedBuildingContextMenu({
                buildingIndex: 2,
                pubkey: followedPubkey,
                clientX: 320,
                clientY: 240,
            });
        });

        await waitFor(() => (document.body.textContent || '').includes('Copiar npub'));
        expect(document.body.textContent || '').not.toContain('Enviar mensaje');
        expect(document.body.textContent || '').toContain('Ver detalles');
        expect(document.body.textContent || '').not.toContain('Zap');
        expect(document.body.textContent || '').not.toContain('21 sats');
        expect(document.body.textContent || '').not.toContain('128 sats');
        expect(document.body.textContent || '').not.toContain('256 sats');
        expect(document.body.textContent || '').not.toContain('Configurar cantidades');

        const copyItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((node) =>
            (node.textContent || '').includes('Copiar npub')
        ) as HTMLElement;
        expect(copyItem).toBeDefined();

        await act(async () => {
            copyItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(clipboardWriteText).toHaveBeenCalledTimes(1);
        expect((clipboardWriteText.mock.calls[0]?.[0] as string | undefined)?.startsWith('npub1')).toBe(true);

        await act(async () => {
            triggerOccupiedBuildingContextMenu({
                buildingIndex: 2,
                pubkey: followedPubkey,
                clientX: 320,
                clientY: 240,
            });
        });

        await waitFor(() => Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).some((node) =>
            (node.textContent || '').includes('Ver detalles')
        ));

        const detailsItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((node) =>
            (node.textContent || '').includes('Ver detalles')
        ) as HTMLElement;

        await act(async () => {
            detailsItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => getActiveProfileDialog() !== null);

        expect(document.body.textContent || '').not.toContain('Configurar cantidades');
    });

    test('redirects zap actions to wallet when no wallet is connected', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge, triggerOccupiedBuildingContextMenu } = createMapBridgeStub();

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [followedPubkey]: { pubkey: followedPubkey, displayName: 'Alice', lud16: 'alice@getalby.com' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
        await act(async () => {
            triggerOccupiedBuildingContextMenu({
                buildingIndex: 2,
                pubkey: followedPubkey,
                clientX: 320,
                clientY: 240,
            });
        });

        await waitFor(() => Array.from(document.body.querySelectorAll('[data-slot="context-menu-sub-trigger"]')).some((node) =>
            (node.textContent || '').trim() === 'Zap'
        ));
        const zapSubmenuTrigger = Array.from(document.body.querySelectorAll('[data-slot="context-menu-sub-trigger"]')).find((node) =>
            (node.textContent || '').trim() === 'Zap'
        ) as HTMLElement;

        await act(async () => {
            zapSubmenuTrigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            zapSubmenuTrigger.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
            zapSubmenuTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('21 sats'));
        const zapAmountItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((node) =>
            (node.textContent || '').trim() === '21 sats'
        ) as HTMLElement;

        await act(async () => {
            zapAmountItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => rendered.container.querySelector('[data-testid="wallet-page"]') !== null);
    });

    test('auto-resumes an interrupted zap after connecting WebLN', async () => {
        const ownerPubkey = SAMPLE_AUTH_PUBKEY;
        const followedPubkey = 'a'.repeat(64);
        const sendPayment = vi.fn(async () => ({ preimage: 'abc' }));
        vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
            const url = String(input);
            if (url.includes('getalby.com/.well-known/lnurlp/alice')) {
                return {
                    ok: true,
                    json: async () => ({
                        callback: 'https://wallet.example/cb',
                        allowsNostr: true,
                        nostrPubkey: 'b'.repeat(64),
                        minSendable: 1_000,
                        maxSendable: 1_000_000,
                    }),
                };
            }

            if (url.includes('wallet.example/cb')) {
                return {
                    ok: true,
                    json: async () => ({ pr: 'lnbc1invoice' }),
                };
            }

            return {
                ok: true,
                json: async () => [],
            };
        }));
        Object.assign(window, {
            webln: {
                enable: vi.fn(async () => {}),
                sendPayment,
                makeInvoice: vi.fn(async () => ({ paymentRequest: 'lnbc1invoice', expiresAt: 200 })),
            },
        });

        const { bridge, triggerOccupiedBuildingContextMenu } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [followedPubkey]: { pubkey: followedPubkey, displayName: 'Alice', lud16: 'alice@getalby.com' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await act(async () => {
            triggerOccupiedBuildingContextMenu({
                buildingIndex: 2,
                pubkey: followedPubkey,
                clientX: 320,
                clientY: 240,
            });
        });

        await waitFor(() => (document.body.textContent || '').includes('Zap'));
        const zapSubmenuTrigger = Array.from(document.body.querySelectorAll('[data-slot="context-menu-sub-trigger"]')).find((node) =>
            (node.textContent || '').trim() === 'Zap'
        ) as HTMLElement;

        await act(async () => {
            zapSubmenuTrigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            zapSubmenuTrigger.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
            zapSubmenuTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('21 sats'));
        const zapAmountItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((node) =>
            (node.textContent || '').trim() === '21 sats'
        ) as HTMLElement;

        await act(async () => {
            zapAmountItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => rendered.container.querySelector('[data-testid="wallet-page"]') !== null);
        const connectWebLnButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Conectar con WebLN')
        ) as HTMLButtonElement;

        await act(async () => {
            connectWebLnButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => sendPayment.mock.calls.some((call) => (call as unknown[])[0] === 'lnbc1invoice'));
        await waitFor(() => rendered.container.querySelector('[data-testid="wallet-page"]') === null);
    });

    test('pays a profile zap through WebLN when a wallet is connected', async () => {
        const ownerPubkey = SAMPLE_AUTH_PUBKEY;
        const followedPubkey = 'a'.repeat(64);
        const sendPayment = vi.fn(async () => ({ preimage: 'abc' }));
        vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
            const url = String(input);
            if (url.includes('getalby.com/.well-known/lnurlp/alice')) {
                return {
                    ok: true,
                    json: async () => ({
                        callback: 'https://wallet.example/cb',
                        allowsNostr: true,
                        nostrPubkey: 'b'.repeat(64),
                        minSendable: 1_000,
                        maxSendable: 1_000_000,
                    }),
                };
            }

            if (url.includes('wallet.example/cb')) {
                return {
                    ok: true,
                    json: async () => ({ pr: 'lnbc1invoice' }),
                };
            }

            return {
                ok: true,
                json: async () => [],
            };
        }));
        Object.assign(window, {
            webln: {
                enable: vi.fn(async () => {}),
                sendPayment,
                makeInvoice: vi.fn(async () => ({ paymentRequest: 'lnbc1invoice', expiresAt: 200 })),
            },
        });

        const { bridge, triggerOccupiedBuildingContextMenu } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [followedPubkey]: { pubkey: followedPubkey, displayName: 'Alice', lud16: 'alice@getalby.com' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const walletButton = rendered.container.querySelector('button[aria-label="Abrir wallet"]') as HTMLButtonElement;
        await act(async () => {
            walletButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => rendered.container.querySelector('[data-testid="wallet-page"]') !== null);
        const connectWebLnButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Conectar con WebLN')
        ) as HTMLButtonElement;

        await act(async () => {
            connectWebLnButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Conectada por WebLN'));

        const mapButton = rendered.container.querySelector('button[aria-label="Abrir mapa"]') as HTMLButtonElement;
        await act(async () => {
            mapButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await act(async () => {
            triggerOccupiedBuildingContextMenu({
                buildingIndex: 2,
                pubkey: followedPubkey,
                clientX: 320,
                clientY: 240,
            });
        });

        await waitFor(() => (document.body.textContent || '').includes('Zap'));
        const zapSubmenuTrigger = Array.from(document.body.querySelectorAll('[data-slot="context-menu-sub-trigger"]')).find((node) =>
            (node.textContent || '').trim() === 'Zap'
        ) as HTMLElement;

        await act(async () => {
            zapSubmenuTrigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            zapSubmenuTrigger.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
            zapSubmenuTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('21 sats'));
        const zapAmountItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((node) =>
            (node.textContent || '').trim() === '21 sats'
        ) as HTMLElement;

        await act(async () => {
            zapAmountItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some((call) =>
            String(call[0]).includes('getalby.com/.well-known/lnurlp/alice')
        ));
        await waitFor(() => sendPayment.mock.calls.some((call) => (call as unknown[])[0] === 'lnbc1invoice'));
    });

    test('pays a note zap through WebLN, signs it as an event zap, and reflects sats on the note', async () => {
        const ownerPubkey = SAMPLE_AUTH_PUBKEY;
        const followedPubkey = 'a'.repeat(64);
        const noteId = '1'.repeat(64);
        const sendPayment = vi.fn(async () => ({ preimage: 'abc' }));
        const publishEvent = vi.fn(async (event: { kind: number; tags: string[][]; content: string; created_at: number }) => ({
            ...event,
            id: 'e'.repeat(64),
            pubkey: ownerPubkey,
            sig: 'c'.repeat(128),
        }));
        vi.spyOn(writeGatewayModule, 'createWriteGateway').mockReturnValue({
            publishEvent,
            publishTextNote: vi.fn(async (content: string) => ({
                id: 'f'.repeat(64),
                pubkey: ownerPubkey,
                kind: 1,
                created_at: 200,
                tags: [],
                content,
            })),
            encryptDm: vi.fn(async (_pubkey: string, plaintext: string) => plaintext),
            decryptDm: vi.fn(async (_pubkey: string, ciphertext: string) => ciphertext),
        } as any);
        vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
            const url = String(input);
            if (url.includes('/v1/publish/forward')) {
                return new Response(JSON.stringify({
                    ackedRelays: ['wss://relay.one'],
                    failedRelays: [],
                    timeoutRelays: [],
                }), {
                    status: 200,
                    headers: {
                        'content-type': 'application/json',
                    },
                });
            }

            if (url.includes('getalby.com/.well-known/lnurlp/alice')) {
                return {
                    ok: true,
                    json: async () => ({
                        callback: 'https://wallet.example/cb',
                        allowsNostr: true,
                        nostrPubkey: 'b'.repeat(64),
                        minSendable: 1_000,
                        maxSendable: 1_000_000,
                    }),
                };
            }

            if (url.includes('wallet.example/cb')) {
                return {
                    ok: true,
                    json: async () => ({ pr: 'lnbc1invoice' }),
                };
            }

            return new Response(JSON.stringify([]), {
                status: 200,
                headers: {
                    'content-type': 'application/json',
                },
            });
        }));
        Object.assign(window, {
            webln: {
                enable: vi.fn(async () => {}),
                sendPayment,
                makeInvoice: vi.fn(async () => ({ paymentRequest: 'lnbc1invoice', expiresAt: 200 })),
            },
        });

        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mockResolvedValue({
            items: [
                {
                    id: noteId,
                    pubkey: followedPubkey,
                    createdAt: 100,
                    content: 'note with zap target',
                    kind: 'note',
                    rawEvent: {
                        id: noteId,
                        pubkey: followedPubkey,
                        kind: 1,
                        created_at: 100,
                        tags: [],
                        content: 'note with zap target',
                    },
                },
            ],
            hasMore: false,
        });
        (socialFeed.service.loadEngagement as ReturnType<typeof vi.fn>).mockResolvedValue({
            [noteId]: {
                replies: 0,
                reposts: 0,
                reactions: 0,
                zaps: 0,
                zapSats: 0,
            },
        });

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [followedPubkey]: { pubkey: followedPubkey, displayName: 'Alice', lud16: 'alice@getalby.com' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    socialFeedService: socialFeed.service,
                }}
            />,
            { initialEntries: ['/agora'] }
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const walletButton = rendered.container.querySelector('button[aria-label="Abrir wallet"]') as HTMLButtonElement;
        await act(async () => {
            walletButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => rendered.container.querySelector('[data-testid="wallet-page"]') !== null);
        const connectWebLnButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Conectar con WebLN')
        ) as HTMLButtonElement;

        await act(async () => {
            connectWebLnButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Conectada por WebLN'));

        const agoraButton = rendered.container.querySelector('button[aria-label="Abrir Ágora"][data-active="true"]') as HTMLButtonElement
            ?? rendered.container.querySelector('button[aria-label="Abrir Ágora"]') as HTMLButtonElement;
        await act(async () => {
            agoraButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => rendered.container.querySelector('button[aria-label="Sats recibidos: 0"]') !== null);
        const zapButton = rendered.container.querySelector('button[aria-label="Sats recibidos: 0"]') as HTMLButtonElement;

        await act(async () => {
            zapButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            zapButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('21 sats'));
        const zap21 = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === '21 sats'
        ) as HTMLElement;

        await act(async () => {
            zap21.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => sendPayment.mock.calls.some((call) => (call as unknown[])[0] === 'lnbc1invoice'));
        expect(publishEvent).toHaveBeenCalledWith(expect.objectContaining({
            kind: 9734,
            tags: expect.arrayContaining([
                ['p', followedPubkey],
                ['e', noteId],
                ['k', '1'],
                ['amount', '21000'],
            ]),
        }));
        await waitFor(() => rendered.container.querySelector('button[aria-label="Sats recibidos: 21"]') !== null);
    });

    test('opens chat detail directly from context menu and focuses composer', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge, triggerOccupiedBuildingContextMenu } = createMapBridgeStub();

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [followedPubkey]: { pubkey: followedPubkey, displayName: 'Alice' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    directMessagesService: {
                        subscribeInbox: () => () => {},
                        sendDm: vi.fn(async (input) => ({
                            id: `msg:${input.clientMessageId}`,
                            clientMessageId: input.clientMessageId,
                            conversationId: input.peerPubkey,
                            peerPubkey: input.peerPubkey,
                            direction: 'outgoing' as const,
                            createdAt: 100,
                            plaintext: input.plaintext,
                            deliveryState: 'sent' as const,
                        })),
                    },
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await act(async () => {
            triggerOccupiedBuildingContextMenu({
                buildingIndex: 2,
                pubkey: followedPubkey,
                clientX: 320,
                clientY: 240,
            });
        });

        await waitFor(() => (document.body.textContent || '').includes('Enviar mensaje'));

        const dmItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((node) =>
            (node.textContent || '').includes('Enviar mensaje')
        ) as HTMLElement;

        await act(async () => {
            dmItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Chats'));
        await waitFor(() => (rendered.container.textContent || '').includes('Alice'));

        const composer = rendered.container.querySelector('.nostr-chat-composer-input') as HTMLTextAreaElement;
        expect(composer).toBeDefined();
        expect(document.activeElement).toBe(composer);
    });

    test('shows pending message immediately while send is still in-flight', async () => {
        const ownerPubkey = SAMPLE_AUTH_PUBKEY;
        const followedPubkey = 'a'.repeat(64);
        const { bridge, triggerOccupiedBuildingContextMenu } = createMapBridgeStub();
        const sendDeferred = createDeferred<any>();
        let sendInput: {
            ownerPubkey: string;
            peerPubkey: string;
            plaintext: string;
            clientMessageId: string;
        } | null = null;

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [followedPubkey]: { pubkey: followedPubkey, displayName: 'Alice' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    directMessagesService: {
                        subscribeInbox: () => () => {},
                        sendDm: vi.fn(async (input) => {
                            sendInput = input;
                            return sendDeferred.promise;
                        }),
                    },
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await act(async () => {
            triggerOccupiedBuildingContextMenu({
                buildingIndex: 2,
                pubkey: followedPubkey,
                clientX: 320,
                clientY: 240,
            });
        });

        await waitFor(() => (document.body.textContent || '').includes('Enviar mensaje'));
        const dmItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((node) =>
            (node.textContent || '').includes('Enviar mensaje')
        ) as HTMLElement;

        await act(async () => {
            dmItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Chats'));

        const composer = rendered.container.querySelector('.nostr-chat-composer-input') as HTMLTextAreaElement;
        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
            valueSetter?.call(composer, 'primer mensaje');
            composer.dispatchEvent(new Event('input', { bubbles: true }));
            composer.dispatchEvent(new Event('change', { bubbles: true }));
        });

        const sendButton = rendered.container.querySelector('.nostr-chat-send') as HTMLButtonElement;
        await act(async () => {
            sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('primer mensaje'));
        expect(rendered.container.textContent || '').toContain('Enviando...');

        expect(sendInput).not.toBeNull();
        sendDeferred.resolve({
            id: 'sent-1',
            clientMessageId: sendInput!.clientMessageId,
            conversationId: followedPubkey,
            peerPubkey: followedPubkey,
            direction: 'outgoing' as const,
            createdAt: 1700001300,
            plaintext: sendInput!.plaintext,
            deliveryState: 'sent' as const,
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Enviado'));
    });

    test('hides enviar mensaje action in context menu when session is not dm-capable', async () => {
        const { bridge, triggerOccupiedBuildingContextMenu } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') !== null);

        await act(async () => {
            triggerOccupiedBuildingContextMenu({
                buildingIndex: 1,
                pubkey: 'a'.repeat(64),
                clientX: 300,
                clientY: 220,
            });
        });

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(document.body.textContent || '').not.toContain('Copiar npub');
        expect(document.body.textContent || '').not.toContain('Enviar mensaje');
    });

    test('closes chat dialog after logout from a dm-capable session', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge, triggerOccupiedBuildingContextMenu } = createMapBridgeStub();

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [followedPubkey]: { pubkey: followedPubkey, displayName: 'Alice' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                    directMessagesService: {
                        subscribeInbox: () => () => {},
                    },
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await act(async () => {
            triggerOccupiedBuildingContextMenu({
                buildingIndex: 2,
                pubkey: followedPubkey,
                clientX: 320,
                clientY: 240,
            });
        });

        await waitFor(() => (document.body.textContent || '').includes('Enviar mensaje'));
        const dmItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((node) =>
            (node.textContent || '').includes('Enviar mensaje')
        ) as HTMLElement;

        await act(async () => {
            dmItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Chats'));

        await selectUserMenuAction(rendered.container, 'Cerrar sesión');
        await waitFor(() => !(rendered.container.textContent || '').includes('Chats'));
        expect(rendered.container.querySelector('.nostr-chats-page')).toBeNull();
    });

    test('opens easter egg dialog with embedded pdf actions', async () => {
        const { bridge, triggerEasterEggBuildingClick } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        expect(rendered.container.textContent || '').not.toContain('Bitcoin: A Peer-to-Peer Electronic Cash System');

        await act(async () => {
            triggerEasterEggBuildingClick({
                buildingIndex: 7,
                easterEggId: 'bitcoin_whitepaper',
            });
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Bitcoin: A Peer-to-Peer Electronic Cash System'));

        const pdfFrame = rendered.container.querySelector('iframe.nostr-easter-egg-pdf') as HTMLIFrameElement;
        expect(pdfFrame).toBeDefined();
        expect(pdfFrame.getAttribute('src')).toBe('/easter-eggs/bitcoin.pdf');

        const links = Array.from(rendered.container.querySelectorAll('.nostr-easter-egg-action')) as HTMLAnchorElement[];
        expect(links.some((link) => (link.textContent || '').includes('Descargar PDF'))).toBe(true);
        expect(links.some((link) => (link.textContent || '').includes('Abrir / Ampliar'))).toBe(true);
    });

    test('starts easter egg fireworks only on first discovery', async () => {
        const { bridge, triggerEasterEggBuildingClick } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await act(async () => {
            triggerEasterEggBuildingClick({
                buildingIndex: 7,
                easterEggId: 'bitcoin_whitepaper',
            });
        });

        await waitFor(() => createFireworksMock.mock.calls.length === 1);
        expect(rendered.container.textContent || '').toContain('Bitcoin: A Peer-to-Peer Electronic Cash System');

        await act(async () => {
            triggerEasterEggBuildingClick({
                buildingIndex: 7,
                easterEggId: 'bitcoin_whitepaper',
            });
            await Promise.resolve();
        });

        expect(createFireworksMock).toHaveBeenCalledTimes(1);
        expect(rendered.container.textContent || '').toContain('Bitcoin: A Peer-to-Peer Electronic Cash System');
    });

    test('opens easter egg dialog for text content', async () => {
        const { bridge, triggerEasterEggBuildingClick } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await act(async () => {
            triggerEasterEggBuildingClick({
                buildingIndex: 3,
                easterEggId: 'cyberspace_independence',
            });
        });

        await waitFor(() => (rendered.container.textContent || '').includes('A Declaration of the Independence of Cyberspace'));
        expect(rendered.container.textContent || '').toContain('Governments of the Industrial World');
    });

    test('persists discovered easter eggs and shows persistent marker on map', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const { bridge, triggerEasterEggBuildingClick } = createMapBridgeStub(8);
        (bridge as any).listEasterEggBuildings.mockReturnValue([
            {
                index: 7,
                easterEggId: 'crypto_anarchist_manifesto',
            },
        ]);

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await act(async () => {
            triggerEasterEggBuildingClick({
                buildingIndex: 7,
                easterEggId: 'crypto_anarchist_manifesto',
            });
        });

        await waitFor(() => (rendered.container.textContent || '').includes('The Crypto Anarchist Manifesto'));

        const progressRaw = window.localStorage.getItem(`nostr.overlay.easter-eggs.v1:user:${ownerPubkey}`);
        expect(progressRaw).toBeTruthy();
        expect(JSON.parse(progressRaw || '{}')).toEqual({
            discoveredIds: ['crypto_anarchist_manifesto'],
        });

        const marker = rendered.container.querySelector('.nostr-map-easter-egg-marker') as HTMLElement;
        expect(marker).toBeDefined();
    });

    test('opens settings dialog, mounts map settings from advanced section and shows shortcuts screen', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const settingsButton = rendered.container.querySelector('button[aria-label="Abrir ajustes"]') as HTMLButtonElement;
        expect(settingsButton).toBeDefined();
        expect(settingsButton.getAttribute('title')).toBe('Ajustes');

        const mountedOnOpen = (bridge.mountSettingsPanel as any).mock.calls.some((call: [unknown]) => call[0] instanceof HTMLElement);
        expect(mountedOnOpen).toBe(false);

        await selectSettingsContextAction(rendered.container, 'Ajustes avanzados');

        await waitFor(() => {
            const calls = (bridge.mountSettingsPanel as any).mock.calls;
            return calls.length > 0 && calls[calls.length - 1][0] instanceof HTMLElement;
        });

        await selectSettingsContextAction(rendered.container, 'Atajos');

        expect(rendered.container.textContent || '').toContain('Mantener pulsada la barra espaciadora y arrastrar');
        expect(rendered.container.textContent || '').toContain('Mantener pulsado el wheel del ratón y mover el ratón');
    });

    test('shows settings dropdown inside sidebar and opens routed settings pages', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const settingsToggleButton = rendered.container.querySelector('button[aria-label="Abrir ajustes"]') as HTMLButtonElement;
        expect(settingsToggleButton).toBeDefined();

        await act(async () => {
            settingsToggleButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Ajustes avanzados'));

        const uiButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'Interfaz'
        ) as HTMLButtonElement;
        expect(uiButton).toBeDefined();

        await act(async () => {
            uiButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => getUiSettingsDialog() !== null);
        expect(rendered.container.querySelector('button[aria-label="Abrir ajustes de interfaz"][data-active="true"]')).not.toBeNull();
    });

    test('applies dark theme class after changing theme from interface dialog', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await selectSettingsContextAction(rendered.container, 'Interfaz');
        await waitFor(() => getUiSettingsDialog() !== null);

        const darkButton = Array.from(document.body.querySelectorAll('[data-testid="settings-ui-theme-row"] [data-slot="toggle-group-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Oscuro'
        ) as HTMLButtonElement | undefined;
        expect(darkButton).toBeDefined();

        await act(async () => {
            darkButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => document.documentElement.classList.contains('dark'));
        await waitFor(() => (bridge.setColourScheme as any).mock.calls.some((call: [string]) => call[0] === 'Nostr City Dark'));
        const storedUiSettings = JSON.parse(window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY) || '{}') as { theme?: string };
        expect(storedUiSettings.theme).toBe('dark');
    });

    test('applies theme changes saved by the landing or docs selector while app is open', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'es', theme: 'dark' }));

        await act(async () => {
            window.dispatchEvent(new CustomEvent(SITE_THEME_CHANGE_EVENT, { detail: 'dark' }));
        });

        await waitFor(() => document.documentElement.classList.contains('dark'));
        await waitFor(() => (bridge.setColourScheme as any).mock.calls.some((call: [string]) => call[0] === 'Nostr City Dark'));
    });

    test('switches overlay copy live when changing language from interface settings', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const settingsToggleButton = rendered.container.querySelector('button[aria-label="Abrir ajustes"]') as HTMLButtonElement;
        expect(settingsToggleButton).toBeDefined();

        await act(async () => {
            settingsToggleButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Interfaz'));

        const uiButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'Interfaz'
        ) as HTMLButtonElement;
        expect(uiButton).toBeDefined();

        await act(async () => {
            uiButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => getUiSettingsDialog() !== null);

        const languageTrigger = document.body.querySelector('[data-testid="settings-ui-language-row"] [data-slot="select-trigger"]') as HTMLButtonElement;
        expect(languageTrigger).toBeDefined();

        await act(async () => {
            languageTrigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
            languageTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        await waitFor(() => Array.from(document.body.querySelectorAll('[data-slot="select-item"]')).some((item) =>
            (item.textContent || '').trim() === 'English'
        ));

        const englishOption = Array.from(document.body.querySelectorAll('[data-slot="select-item"]')).find((item) =>
            (item.textContent || '').trim() === 'English'
        ) as HTMLElement;
        expect(englishOption).toBeDefined();

        await act(async () => {
            englishOption.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
            englishOption.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Language'));
        expect(document.body.textContent || '').toContain('Occupied labels zoom');
        expect(rendered.container.querySelector('button[aria-label="Open settings"]')).not.toBeNull();
    });

    test('applies traffic settings on mount and after UI slider updates', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({
            occupiedLabelsZoomLevel: 8,
            streetLabelsEnabled: true,
            streetLabelsZoomLevel: 10,
            trafficParticlesCount: 20,
            trafficParticlesSpeed: 1.4,
        }));

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await waitFor(() => {
            const countCalls = (bridge.setTrafficParticlesCount as any).mock.calls;
            const speedCalls = (bridge.setTrafficParticlesSpeed as any).mock.calls;
            return countCalls.length > 0 && speedCalls.length > 0;
        });

        expect((bridge.setTrafficParticlesCount as any)).toHaveBeenCalledWith(20);
        expect((bridge.setTrafficParticlesSpeed as any)).toHaveBeenCalledWith(1.4);

        await selectSettingsContextAction(rendered.container, 'Interfaz');

        await waitFor(() => getUiSettingsDialog() !== null);

        const trafficCountThumb = document.body.querySelector('[aria-label="Coches en ciudad"] [data-slot="slider-thumb"]') as HTMLElement;
        const trafficSpeedThumb = document.body.querySelector('[aria-label="Velocidad de coches"] [data-slot="slider-thumb"]') as HTMLElement;
        expect(trafficCountThumb).toBeDefined();
        expect(trafficSpeedThumb).toBeDefined();

        await act(async () => {
            trafficCountThumb.focus();
            trafficCountThumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        });

        await act(async () => {
            trafficSpeedThumb.focus();
            trafficSpeedThumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        });

        const lastTrafficCount = (bridge.setTrafficParticlesCount as any).mock.calls.at(-1)?.[0] as number;
        const lastTrafficSpeed = (bridge.setTrafficParticlesSpeed as any).mock.calls.at(-1)?.[0] as number;
        expect(lastTrafficCount).toBeGreaterThan(20);
        expect(lastTrafficSpeed).toBeGreaterThan(1.4);
    });

    test('persists agora feed layout from header toggle and reflects it in interface settings', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const socialFeed = createSocialFeedServiceMock();
        (socialFeed.service.loadFollowingFeed as ReturnType<typeof vi.fn>).mockResolvedValue({
            items: [createFeedNote('layout-note-1', 'a'.repeat(64), 100, 'hola agora')],
            hasMore: false,
        });
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    ...createBasicOverlayServices(ownerPubkey),
                    socialFeedService: socialFeed.service,
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const feedButton = rendered.container.querySelector('.nostr-panel-toolbar button[aria-label="Abrir Ágora"]') as HTMLButtonElement;
        expect(feedButton).toBeDefined();

        await act(async () => {
            feedButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Agora'));
        await waitFor(() => Array.from(rendered.container.querySelectorAll('[data-slot="toggle-group-item"]')).some((item) =>
            (item.textContent || '').trim() === 'Masonry'
        ));

        const masonryButton = Array.from(rendered.container.querySelectorAll('[data-slot="toggle-group-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Masonry'
        ) as HTMLButtonElement | undefined;
        expect(masonryButton).toBeDefined();

        await act(async () => {
            masonryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const storedUiSettings = JSON.parse(window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY) || '{}') as { agoraFeedLayout?: string };
        expect(storedUiSettings.agoraFeedLayout).toBe('masonry');

        await selectSettingsContextAction(rendered.container, 'Interfaz');
        await waitFor(() => getUiSettingsDialog() !== null);

        const settingsMasonryButton = Array.from(document.body.querySelectorAll('[data-slot="toggle-group-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Masonry'
        ) as HTMLButtonElement | undefined;
        expect(settingsMasonryButton).toBeDefined();
        expect(settingsMasonryButton?.getAttribute('data-state')).toBe('on');

        const settingsListButton = Array.from(document.body.querySelectorAll('[data-slot="toggle-group-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Lista'
        ) as HTMLButtonElement | undefined;
        expect(settingsListButton).toBeDefined();

        await act(async () => {
            settingsListButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const updatedUiSettings = JSON.parse(window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY) || '{}') as { agoraFeedLayout?: string };
        expect(updatedUiSettings.agoraFeedLayout).toBe('list');
    });

    test('can collapse panel to compact icon row and restore it', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        expect((bridge.setViewportInsetLeft as any).mock.calls.some((call: unknown[]) => call[0] === 300)).toBe(true);

        const hidePanelButton = rendered.container.querySelector('button[aria-label="Ocultar panel"]') as HTMLButtonElement;
        expect(hidePanelButton).toBeDefined();
        expect(hidePanelButton.getAttribute('title')).toBe('Ocultar panel');

        await act(async () => {
            hidePanelButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.container.querySelector('[data-slot="sidebar"][data-state="collapsed"]')).not.toBeNull();
        const showPanelButton = rendered.container.querySelector('button[aria-label="Mostrar panel"]') as HTMLButtonElement;
        expect(showPanelButton).toBeDefined();
        expect(showPanelButton.getAttribute('title')).toBe('Mostrar panel');
        expect(rendered.container.querySelector('button[aria-label="Abrir ajustes"]')).not.toBeNull();
        const compactButtons = Array.from(rendered.container.querySelectorAll('.nostr-compact-toolbar button')) as HTMLButtonElement[];
        const compactLabels = compactButtons.map((button) => button.getAttribute('aria-label') || '');
        expect(compactLabels).toContain('Abrir mapa');
        expect(compactLabels).toContain('Abrir relays');
        expect(compactLabels).toContain('Abrir buscador global de usuarios');
        expect(compactLabels).toContain('Abrir estadísticas de la ciudad');
        expect(compactLabels).toContain('Abrir descubre');
        expect(compactLabels).toContain('Abrir ajustes');
        expect(rendered.container.textContent || '').not.toContain('Sigues (');
        expect(rendered.container.textContent || '').not.toContain('Seguidores (');
        expect((bridge.setViewportInsetLeft as any).mock.calls[(bridge.setViewportInsetLeft as any).mock.calls.length - 1][0]).toBe(56);

        await act(async () => {
            showPanelButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.container.querySelector('button[aria-label="Abrir lista de seguidos"]')).not.toBeNull();
        expect((bridge.setViewportInsetLeft as any).mock.calls[(bridge.setViewportInsetLeft as any).mock.calls.length - 1][0]).toBe(300);
    });

    test('renders shadcn sidebar structure with rail', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        expect(rendered.container.querySelector('[data-slot="sidebar"]')).not.toBeNull();
        expect(rendered.container.querySelector('[data-slot="sidebar-header"]')).not.toBeNull();
        expect(rendered.container.querySelector('[data-slot="sidebar-rail"]')).not.toBeNull();
        expect(rendered.container.textContent || '').toContain('Nostr City');
        expect(rendered.container.querySelector('[data-slot="sidebar-header"] [data-slot="sidebar-trigger"]')).not.toBeNull();
        expect(rendered.container.querySelector('.nostr-panel-toolbar [data-slot="sidebar-trigger"]')).toBeNull();
    });

    test('renders social list items before action menu in expanded sidebar', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const followingItem = rendered.container.querySelector('button[aria-label="Abrir lista de seguidos"]') as HTMLButtonElement;
        const followersItem = rendered.container.querySelector('button[aria-label="Abrir lista de seguidores"]') as HTMLButtonElement;
        const cityStatsButton = rendered.container.querySelector('button[aria-label="Abrir estadísticas de la ciudad"]') as HTMLButtonElement | null;

        expect(followingItem).toBeDefined();
        expect(followersItem).toBeDefined();
        expect(cityStatsButton).not.toBeNull();
        expect(followingItem.closest('[data-slot="sidebar-menu-item"]')?.textContent || '').toContain('0');
        expect(followersItem.closest('[data-slot="sidebar-menu-item"]')?.textContent || '').toContain('0');
        expect(rendered.container.textContent || '').not.toContain('No hay cuentas seguidas todavía.');
        expect(rendered.container.textContent || '').not.toContain('No se encontraron seguidores aún.');
        expect(followingItem.compareDocumentPosition(followersItem) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
        expect(followingItem.compareDocumentPosition(cityStatsButton as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
        expect(followersItem.compareDocumentPosition(cityStatsButton as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    test('shows descubre menu item with counter and opens dialog', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const discoverButton = rendered.container.querySelector('button[aria-label="Abrir descubre"]') as HTMLButtonElement;
        expect(discoverButton).toBeDefined();
        expect(rendered.container.textContent || '').toContain('0/3');

        await act(async () => {
            discoverButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => document.body.querySelector('[aria-label="Descubre easter eggs"]') !== null);
    });

    test('hides social tabs when sidebar is collapsed', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        expect(rendered.container.querySelector('button[aria-label="Abrir lista de seguidos"]')).not.toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Abrir lista de seguidores"]')).not.toBeNull();

        const hidePanelButton = rendered.container.querySelector('button[aria-label="Ocultar panel"]') as HTMLButtonElement;
        expect(hidePanelButton).toBeDefined();

        await act(async () => {
            hidePanelButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.container.querySelector('button[aria-label="Abrir lista de seguidos"]')).toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Abrir lista de seguidores"]')).toBeNull();
    });

    test('filters following tab by name or npub and can clear search', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const alicePubkey = 'a'.repeat(64);
        const bobPubkey = 'b'.repeat(64);
        const { bridge } = createMapBridgeStub();

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [alicePubkey, bobPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            if (pubkey === ownerPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner' };
                            }
                            if (pubkey === alicePubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Alice' };
                            }
                            if (pubkey === bobPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Bob' };
                            }
                        }
                        return profiles;
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        const followingItem = rendered.container.querySelector('button[aria-label="Abrir lista de seguidos"]') as HTMLButtonElement;
        expect(followingItem).toBeDefined();

        await act(async () => {
            followingItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Alice'));

        const searchInput = document.body.querySelector('input[aria-label="Buscar en seguidos"]') as HTMLInputElement;
        expect(searchInput).toBeDefined();
        const bobNpub = encodeHexToNpub(bobPubkey);

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(searchInput, bobNpub);
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        expect(document.body.textContent || '').toContain('Bob');
        expect(document.body.textContent || '').not.toContain('Alice');

        const clearButton = document.body.querySelector('button[aria-label="Limpiar búsqueda"]') as HTMLButtonElement;
        expect(clearButton).toBeDefined();

        await act(async () => {
            clearButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Alice'));
    });

    test('applies verified building overlay indexes when toggle is enabled', async () => {
        window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({
            occupiedLabelsZoomLevel: 8,
            streetLabelsEnabled: true,
            verifiedBuildingsOverlayEnabled: true,
            streetLabelsZoomLevel: 10,
            trafficParticlesCount: 12,
            trafficParticlesSpeed: 1,
        }));

        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge } = createMapBridgeStub(12);

        const originalFetch = globalThis.fetch;
        const fetchMock = vi.fn().mockImplementation(async (_input: string | URL, init?: RequestInit) => {
            const requestBody = typeof init?.body === 'string' ? JSON.parse(init.body) as {
                checks?: Array<{ pubkey: string; nip05: string }>;
            } : { checks: [] };
            const checks = requestBody.checks ?? [];

            return new Response(JSON.stringify({
                results: checks.map((check) => ({
                    pubkey: check.pubkey,
                    nip05: check.nip05,
                    status: check.pubkey === followedPubkey ? 'verified' : 'mismatch',
                    identifier: check.nip05,
                    displayIdentifier: check.nip05,
                    resolvedPubkey: check.pubkey === followedPubkey ? check.pubkey : undefined,
                    checkedAt: 1_719_001_000,
                })),
            }), {
                status: 200,
                headers: {
                    'content-type': 'application/json',
                },
            });
        });
        (globalThis as any).fetch = fetchMock;

        try {
            const rendered = await renderApp(
                <App
                    mapBridge={bridge}
                    services={{
                        createClient: () => ({
                            connect: async () => {},
                            fetchLatestReplaceableEvent: async () => null,
                            fetchEvents: async () => [],
                        }),
                        fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                            ownerPubkey,
                            follows: [followedPubkey],
                            relayHints: [],
                        }),
                        fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                            const profiles: Record<string, { pubkey: string; displayName: string; nip05?: string }> = {};
                            for (const pubkey of pubkeys) {
                                if (pubkey === ownerPubkey) {
                                    profiles[pubkey] = { pubkey, displayName: 'Owner' };
                                }
                                if (pubkey === followedPubkey) {
                                    profiles[pubkey] = { pubkey, displayName: 'Alice', nip05: '_@verified.example' };
                                }
                            }
                            return profiles;
                        }),
                    }}
                />
            );
            mounted.push(rendered);

            const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
            const form = rendered.container.querySelector('form');

            await act(async () => {
                const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
                npubInput.dispatchEvent(new Event('input', { bubbles: true }));
                npubInput.dispatchEvent(new Event('change', { bubbles: true }));
            });

            await act(async () => {
                form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            });

            await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
            await waitFor(() => {
                const calls = (bridge.setVerifiedBuildingIndexes as any).mock.calls as number[][];
                return calls.some((call) => Array.isArray(call[0]) && call[0].length > 0);
            });

            expect(fetchMock).toHaveBeenCalled();
        } finally {
            (globalThis as any).fetch = originalFetch;
        }
    });

    test('shows verified nip05 identifiers in following list without rendering owner profile tab', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge, triggerOccupiedBuildingClick } = createMapBridgeStub(6);

        const originalFetch = globalThis.fetch;
        const fetchMock = vi.fn().mockImplementation(async (_input: string | URL, init?: RequestInit) => {
            const requestBody = typeof init?.body === 'string' ? JSON.parse(init.body) as {
                checks?: Array<{ pubkey: string; nip05: string }>;
            } : { checks: [] };
            const checks = requestBody.checks ?? [];

            return new Response(JSON.stringify({
                results: checks.map((check) => ({
                    pubkey: check.pubkey,
                    nip05: check.nip05,
                    status: check.pubkey === ownerPubkey || check.pubkey === followedPubkey ? 'verified' : 'mismatch',
                    identifier: check.nip05,
                    displayIdentifier: check.nip05,
                    resolvedPubkey:
                        check.pubkey === ownerPubkey || check.pubkey === followedPubkey
                            ? check.pubkey
                            : undefined,
                    checkedAt: 1_719_001_200,
                })),
            }), {
                status: 200,
                headers: {
                    'content-type': 'application/json',
                },
            });
        });
        (globalThis as any).fetch = fetchMock;

        try {
            const rendered = await renderApp(
                <App
                    mapBridge={bridge}
                    services={{
                        createClient: () => ({
                            connect: async () => {},
                            fetchLatestReplaceableEvent: async () => null,
                            fetchEvents: async () => [],
                        }),
                        fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                            ownerPubkey,
                            follows: [followedPubkey],
                            relayHints: [],
                        }),
                        fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                            const profiles: Record<string, { pubkey: string; displayName: string; nip05?: string }> = {};
                            for (const pubkey of pubkeys) {
                                if (pubkey === ownerPubkey) {
                                    profiles[pubkey] = { pubkey, displayName: 'Owner', nip05: 'owner@owner.test' };
                                }
                                if (pubkey === followedPubkey) {
                                    profiles[pubkey] = { pubkey, displayName: 'Alice', nip05: 'alice@alice.test' };
                                }
                            }
                            return profiles;
                        }),
                    }}
                />
            );
            mounted.push(rendered);

            const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
            const form = rendered.container.querySelector('form');

            await act(async () => {
                const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
                npubInput.dispatchEvent(new Event('input', { bubbles: true }));
                npubInput.dispatchEvent(new Event('change', { bubbles: true }));
            });

            await act(async () => {
                form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            });

            await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
            expect(rendered.container.textContent || '').not.toContain('owner@owner.test');
            expect(rendered.container.querySelector('[aria-label="NIP-05 verificado por DNS: owner@owner.test"]')).toBeNull();

            const followingItem = rendered.container.querySelector('button[aria-label="Abrir lista de seguidos"]') as HTMLButtonElement;
            expect(followingItem).toBeDefined();

            await act(async () => {
                followingItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });

            await waitFor(() => Boolean(document.body.querySelector('[aria-label="NIP-05 verificado por DNS: alice@alice.test"]')));
            expect(rendered.container.textContent || '').not.toContain('alice@alice.test');

            await act(async () => {
                triggerOccupiedBuildingClick({
                    buildingIndex: 1,
                    pubkey: followedPubkey,
                });
            });

            await waitFor(() => (document.body.textContent || '').includes('alice@alice.test'));
            const dialogBadge = document.body.querySelector('[aria-label="NIP-05 verificado por DNS: alice@alice.test"]') as HTMLElement;
            expect(dialogBadge).toBeDefined();
            expect(dialogBadge.getAttribute('title')).toBe('NIP-05 verificado por DNS: alice@alice.test');
        } finally {
            (globalThis as any).fetch = originalFetch;
        }
    });

    test('loads active profile stats and latest posts when occupant dialog opens', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge, triggerOccupiedBuildingClick } = createMapBridgeStub();

        const fetchLatestPostsByPubkeyFn = vi.fn().mockResolvedValue({
            posts: [
                {
                    id: 'post-1',
                    pubkey: followedPubkey,
                    createdAt: 1710000000,
                    content: 'Hola mundo',
                },
            ],
            nextUntil: 1709999999,
            hasMore: true,
        });
        const fetchProfileStatsFn = vi.fn().mockResolvedValue({
            followsCount: 12,
            followersCount: 34,
        });

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            if (pubkey === ownerPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner' };
                            }
                            if (pubkey === followedPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Alice' };
                            }
                        }
                        return profiles;
                    }),
                    fetchLatestPostsByPubkeyFn,
                    fetchProfileStatsFn,
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await act(async () => {
            triggerOccupiedBuildingClick({
                buildingIndex: 4,
                pubkey: followedPubkey,
            });
        });

        await selectActiveProfileDialogTab('Feed');
        await waitFor(() => (rendered.container.textContent || '').includes('Hola mundo'));
        expect(rendered.container.textContent || '').toContain('Feed');
        expect(fetchLatestPostsByPubkeyFn).toHaveBeenCalledWith(expect.objectContaining({ pubkey: followedPubkey }));
        expect(fetchProfileStatsFn).toHaveBeenCalledWith(expect.objectContaining({ pubkey: followedPubkey }));
    });

    test('reuses active profile query cache when reopening the same occupant', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge, triggerOccupiedBuildingClick } = createMapBridgeStub();

        const fetchLatestPostsByPubkeyFn = vi.fn().mockResolvedValue({
            posts: [
                {
                    id: 'post-cache-1',
                    pubkey: followedPubkey,
                    createdAt: 1710000000,
                    content: 'Cache profile post',
                },
            ],
            nextUntil: 1709999999,
            hasMore: true,
        });
        const fetchProfileStatsFn = vi.fn().mockResolvedValue({
            followsCount: 12,
            followersCount: 34,
        });

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            if (pubkey === ownerPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner' };
                            }
                            if (pubkey === followedPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Alice' };
                            }
                        }
                        return profiles;
                    }),
                    fetchLatestPostsByPubkeyFn,
                    fetchProfileStatsFn,
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await act(async () => {
            triggerOccupiedBuildingClick({
                buildingIndex: 4,
                pubkey: followedPubkey,
            });
        });

        await selectActiveProfileDialogTab('Feed');
        await waitFor(() => (rendered.container.textContent || '').includes('Cache profile post'));

        const closeButton = rendered.container.querySelector('button[aria-label="Cerrar perfil"]') as HTMLButtonElement;
        expect(closeButton).toBeDefined();
        await act(async () => {
            closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => rendered.container.querySelector('button[aria-label="Cerrar perfil"]') === null);

        await act(async () => {
            triggerOccupiedBuildingClick({
                buildingIndex: 4,
                pubkey: followedPubkey,
            });
        });

        await selectActiveProfileDialogTab('Feed');
        await waitFor(() => (rendered.container.textContent || '').includes('Cache profile post'));

        expect(fetchLatestPostsByPubkeyFn).toHaveBeenCalledTimes(1);
        expect(fetchProfileStatsFn).toHaveBeenCalledTimes(1);
    });

    test('loads more active profile posts on demand', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge, triggerOccupiedBuildingClick } = createMapBridgeStub();

        const fetchLatestPostsByPubkeyFn = vi
            .fn()
            .mockResolvedValueOnce({
                posts: [
                    {
                        id: 'post-1',
                        pubkey: followedPubkey,
                        createdAt: 1710000000,
                        content: 'Primer lote',
                    },
                ],
                nextUntil: 1709999999,
                hasMore: true,
            })
            .mockResolvedValueOnce({
                posts: [
                    {
                        id: 'post-2',
                        pubkey: followedPubkey,
                        createdAt: 1709999000,
                        content: 'Segundo lote',
                    },
                ],
                nextUntil: 1709998999,
                hasMore: false,
            });

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            if (pubkey === ownerPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner' };
                            }
                            if (pubkey === followedPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Alice' };
                            }
                        }
                        return profiles;
                    }),
                    fetchLatestPostsByPubkeyFn,
                    fetchProfileStatsFn: vi.fn().mockResolvedValue({ followsCount: 1, followersCount: 1 }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await act(async () => {
            triggerOccupiedBuildingClick({
                buildingIndex: 4,
                pubkey: followedPubkey,
            });
        });

        await selectActiveProfileDialogTab('Feed');
        await waitFor(() => (rendered.container.textContent || '').includes('Primer lote'));

        const loadMoreButton = Array.from(rendered.container.querySelectorAll('button')).find(button =>
            (button.textContent || '').includes('Cargar más')
        ) as HTMLButtonElement;
        expect(loadMoreButton).toBeDefined();

        await act(async () => {
            loadMoreButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Segundo lote'));
        expect(fetchLatestPostsByPubkeyFn).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                pubkey: followedPubkey,
                until: 1709999999,
            })
        );
    });

    test('uses configured relay settings when creating nostr clients', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        window.localStorage.setItem(
            RELAY_SETTINGS_STORAGE_KEY,
            JSON.stringify({
                relays: ['wss://relay.one', 'wss://relay.two'],
                byType: {
                    nip65Both: ['wss://relay.one', 'wss://relay.two'],
                    nip65Read: [],
                    nip65Write: [],
                    dmInbox: [],
                    search: [],
                },
            })
        );

        const clientStub: NostrClient = {
            connect: async () => {},
            fetchLatestReplaceableEvent: async () => null,
            fetchEvents: async () => [],
        };
        const createClient = vi.fn().mockReturnValue(clientStub);

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient,
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            if (pubkey === ownerPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner' };
                            }
                            if (pubkey === followedPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Alice' };
                            }
                        }
                        return profiles;
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
        expect(createClient).toHaveBeenCalled();
        expect(createClient.mock.calls[0]?.[0]).toEqual(['wss://relay.one', 'wss://relay.two']);
    });

    test('falls back to bootstrap relays when configured graph relays fail', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        window.localStorage.setItem(
            RELAY_SETTINGS_STORAGE_KEY,
            JSON.stringify({
                relays: ['wss://relay.one'],
                byType: {
                    nip65Both: ['wss://relay.one'],
                    nip65Read: [],
                    nip65Write: [],
                    dmInbox: [],
                    search: [],
                },
            })
        );

        const clientStub: NostrClient = {
            connect: async () => {},
            fetchLatestReplaceableEvent: async () => null,
            fetchEvents: async () => [],
        };
        const createClient = vi.fn().mockReturnValue(clientStub);
        const fetchFollowsByNpubFn = vi
            .fn()
            .mockRejectedValueOnce(new Error('configured relay failed'))
            .mockResolvedValueOnce({
                ownerPubkey,
                follows: [followedPubkey],
                relayHints: [],
            });

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient,
                    fetchFollowsByNpubFn,
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            if (pubkey === ownerPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner' };
                            }
                            if (pubkey === followedPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Alice' };
                            }
                        }
                        return profiles;
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        expect(fetchFollowsByNpubFn).toHaveBeenCalledTimes(2);
        expect(createClient.mock.calls[0]?.[0]).toEqual(['wss://relay.one']);
        expect(createClient.mock.calls[1]?.[0]).toEqual(getBootstrapRelays());
    });

    test('keeps profile posts visible when stats request fails', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge, triggerOccupiedBuildingClick } = createMapBridgeStub();

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            if (pubkey === ownerPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner' };
                            }
                            if (pubkey === followedPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Alice' };
                            }
                        }
                        return profiles;
                    }),
                    fetchLatestPostsByPubkeyFn: vi.fn().mockResolvedValue({
                        posts: [{ id: 'post-a', pubkey: followedPubkey, createdAt: 1710000000, content: 'post disponible' }],
                        nextUntil: 1709999999,
                        hasMore: false,
                    }),
                    fetchProfileStatsFn: vi.fn().mockRejectedValue(new Error('stats failed')),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await act(async () => {
            triggerOccupiedBuildingClick({ buildingIndex: 4, pubkey: followedPubkey });
        });

        await selectActiveProfileDialogTab('Feed');
        await waitFor(() => (rendered.container.textContent || '').includes('post disponible'));
    });

    test('passes scoped read relays to graph API for followers, posts, and profile stats', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const loadFollows = vi
            .fn()
            .mockResolvedValueOnce({
                ownerPubkey,
                follows: [followedPubkey],
                relayHints: ['wss://relay.hint.example'],
            })
            .mockResolvedValueOnce({
                ownerPubkey: followedPubkey,
                follows: [],
                relayHints: [],
            });
        const loadFollowers = vi
            .fn()
            .mockResolvedValueOnce({ followers: [], complete: true })
            .mockResolvedValueOnce({ followers: [], complete: true });
        const loadPosts = vi.fn().mockResolvedValue({ posts: [], hasMore: false, nextUntil: undefined });
        const loadProfileStats = vi.fn().mockResolvedValue({ followsCount: 0, followersCount: 0 });
        const { bridge, triggerOccupiedBuildingClick } = createMapBridgeStub();

        saveRelaySettings({
            relays: ['wss://relay.configured.example', 'wss://relay.readonly.example'],
            byType: {
                nip65Both: ['wss://relay.configured.example'],
                nip65Read: ['wss://relay.readonly.example'],
                nip65Write: [],
                dmInbox: [],
                search: [],
                groups: [],
            },
        });

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async (_pubkey: string, kind: number) => {
                            if (kind === 10002) {
                                return {
                                    id: 'relay-list',
                                    pubkey: ownerPubkey,
                                    kind: 10002,
                                    created_at: 123,
                                    tags: [['r', 'wss://relay.suggested.example']],
                                    content: '',
                                };
                            }

                            return null;
                        },
                        fetchEvents: async () => [],
                    }),
                    graphApiService: {
                        loadFollows,
                        loadFollowers,
                        loadPosts,
                        loadProfileStats,
                    },
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            if (pubkey === ownerPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner' };
                            }
                            if (pubkey === followedPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Alice' };
                            }
                        }
                        return profiles;
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
        expect(loadFollows).toHaveBeenCalledWith(expect.objectContaining({
            scopedReadRelays: expect.arrayContaining([
                'wss://relay.configured.example',
                'wss://relay.readonly.example',
            ]),
        }));
        expect(loadFollowers).toHaveBeenCalledWith(expect.objectContaining({
            scopedReadRelays: expect.arrayContaining([
                'wss://relay.configured.example',
                'wss://relay.readonly.example',
                'wss://relay.hint.example',
                'wss://relay.suggested.example',
            ]),
        }));

        await act(async () => {
            triggerOccupiedBuildingClick({ buildingIndex: 4, pubkey: followedPubkey });
        });

        await waitFor(() => loadPosts.mock.calls.length > 0);
        await waitFor(() => loadProfileStats.mock.calls.length > 0);
        await waitFor(() => loadFollows.mock.calls.length === 2);
        await waitFor(() => loadFollowers.mock.calls.length === 2);

        await selectActiveProfileDialogTab('Feed');
        await selectActiveProfileDialogTab('Seguidores');

        expect(loadPosts).toHaveBeenCalledWith(expect.objectContaining({
            scopedReadRelays: expect.arrayContaining([
                'wss://relay.configured.example',
                'wss://relay.readonly.example',
                'wss://relay.hint.example',
                'wss://relay.suggested.example',
            ]),
        }));
        expect(loadProfileStats).toHaveBeenCalledWith(expect.objectContaining({
            scopedReadRelays: expect.arrayContaining([
                'wss://relay.configured.example',
                'wss://relay.readonly.example',
                'wss://relay.hint.example',
                'wss://relay.suggested.example',
            ]),
        }));
        expect(loadFollowers).toHaveBeenLastCalledWith(expect.objectContaining({
            scopedReadRelays: expect.arrayContaining([
                'wss://relay.configured.example',
                'wss://relay.readonly.example',
                'wss://relay.hint.example',
                'wss://relay.suggested.example',
            ]),
        }));
    });

    test('shows who the active profile follows and who follows them', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const followA = 'b'.repeat(64);
        const followB = 'c'.repeat(64);
        const followerA = 'd'.repeat(64);
        const followerB = 'e'.repeat(64);
        const { bridge, triggerOccupiedBuildingClick } = createMapBridgeStub();

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async (pubkey: string) => {
                            if (pubkey === followedPubkey) {
                                return {
                                    id: 'kind3',
                                    pubkey,
                                    kind: 3,
                                    created_at: 111,
                                    tags: [['p', followA], ['p', followB]],
                                    content: '',
                                };
                            }
                            return null;
                        },
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            profiles[pubkey] = { pubkey, displayName: `User-${pubkey.slice(0, 4)}` };
                        }
                        return profiles;
                    }),
                    fetchLatestPostsByPubkeyFn: vi.fn().mockResolvedValue({
                        posts: [],
                        hasMore: false,
                    }),
                    fetchProfileStatsFn: vi.fn().mockResolvedValue({
                        followsCount: 2,
                        followersCount: 2,
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [followerA, followerB],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') === null);

        await act(async () => {
            triggerOccupiedBuildingClick({ buildingIndex: 4, pubkey: followedPubkey });
        });

        await selectActiveProfileDialogTab('Siguiendo');
        await waitFor(() => (rendered.container.textContent || '').includes(`User-${followA.slice(0, 4)}`));
        await selectActiveProfileDialogTab('Seguidores');
        await waitFor(() => (rendered.container.textContent || '').includes(`User-${followerA.slice(0, 4)}`));
    });

    test('keeps active profile following visible when followers request times out', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const followA = 'b'.repeat(64);
        const followB = 'c'.repeat(64);
        const loadFollows = vi
            .fn()
            .mockResolvedValueOnce({
                ownerPubkey,
                follows: [followedPubkey],
                relayHints: [],
            })
            .mockResolvedValueOnce({
                ownerPubkey: followedPubkey,
                follows: [followA, followB],
                relayHints: [],
            });
        const loadFollowers = vi
            .fn()
            .mockResolvedValueOnce({ followers: [], complete: true })
            .mockRejectedValueOnce(new Error('Request timed out after 10000ms'));
        const { bridge, triggerOccupiedBuildingClick } = createMapBridgeStub();

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    graphApiService: {
                        loadFollows,
                        loadFollowers,
                        loadPosts: vi.fn().mockResolvedValue({ posts: [], hasMore: false }),
                        loadProfileStats: vi.fn().mockResolvedValue({ followsCount: 2, followersCount: 0 }),
                    },
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            if (pubkey === ownerPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner' };
                            }
                            if (pubkey === followedPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Alice' };
                            }
                            if (pubkey === followA) {
                                profiles[pubkey] = { pubkey, displayName: 'Bob' };
                            }
                            if (pubkey === followB) {
                                profiles[pubkey] = { pubkey, displayName: 'Carol' };
                            }
                        }
                        return profiles;
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') === null);

        await act(async () => {
            triggerOccupiedBuildingClick({ buildingIndex: 4, pubkey: followedPubkey });
        });

        await selectActiveProfileDialogTab('Siguiendo');
        await waitFor(() => (rendered.container.textContent || '').includes('Bob'));

        const activePanel = rendered.container.querySelector('[data-slot="tabs-content"][data-state="active"]') as HTMLElement;
        expect(activePanel.textContent || '').toContain('Bob');
        expect(activePanel.textContent || '').toContain('Carol');
        expect(activePanel.textContent || '').not.toContain('No se pudo cargar la red social');
        expect(activePanel.textContent || '').not.toContain('Reintentar');
    });

    test('sending message from active profile network menu closes profile dialog before opening chat', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const followerA = 'd'.repeat(64);
        const { bridge, triggerOccupiedBuildingClick } = createMapBridgeStub();

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async (pubkey: string) => {
                            if (pubkey === followedPubkey) {
                                return {
                                    id: 'kind3',
                                    pubkey,
                                    kind: 3,
                                    created_at: 111,
                                    tags: [],
                                    content: '',
                                };
                            }
                            return null;
                        },
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            profiles[pubkey] = { pubkey, displayName: `User-${pubkey.slice(0, 4)}` };
                        }
                        return profiles;
                    }),
                    fetchLatestPostsByPubkeyFn: vi.fn().mockResolvedValue({ posts: [], hasMore: false }),
                    fetchProfileStatsFn: vi.fn().mockResolvedValue({ followsCount: 0, followersCount: 1 }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [followerA],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') === null);

        await act(async () => {
            triggerOccupiedBuildingClick({ buildingIndex: 4, pubkey: followedPubkey });
        });

        await selectActiveProfileDialogTab('Seguidores');
        await waitFor(() => (rendered.container.textContent || '').includes(`User-${followerA.slice(0, 4)}`));

        const actionsButton = document.body.querySelector(`button[aria-label="Abrir acciones para User-${followerA.slice(0, 4)}"]`) as HTMLButtonElement;
        await act(async () => {
            actionsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Enviar mensaje'));
        const messageItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((node) =>
            (node.textContent || '').includes('Enviar mensaje')
        ) as HTMLElement;

        await act(async () => {
            messageItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Chats'));
        expect(document.body.querySelector('button[aria-label="Cerrar perfil"]')).toBeNull();
    });

    test('imports active profile relay suggestions into local relay settings', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge, triggerOccupiedBuildingClick } = createMapBridgeStub();

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async (pubkey: string, kind: number) => {
                            if (pubkey !== followedPubkey) {
                                return null;
                            }

                            if (kind === 10002) {
                                return {
                                    id: 'relay-list-active-profile',
                                    pubkey,
                                    kind: 10002,
                                    created_at: 321,
                                    tags: [
                                        ['r', 'wss://relay.profile.example'],
                                        ['r', 'wss://relay.readonly.example', 'read'],
                                    ],
                                    content: '',
                                };
                            }

                            if (kind === 10050) {
                                return {
                                    id: 'relay-list-dm-active-profile',
                                    pubkey,
                                    kind: 10050,
                                    created_at: 322,
                                    tags: [['relay', 'wss://relay.dm.example']],
                                    content: '',
                                };
                            }

                            return null;
                        },
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            profiles[pubkey] = { pubkey, displayName: `User-${pubkey.slice(0, 4)}` };
                        }
                        return profiles;
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('User-ffff'));

        await act(async () => {
            triggerOccupiedBuildingClick({ buildingIndex: 4, pubkey: followedPubkey });
        });

        await selectActiveProfileDialogTab('Información');
        await waitFor(() => (rendered.container.textContent || '').includes('relay.profile.example'));

        const addAllButton = rendered.container.querySelector('button[aria-label="Añadir todos los relays declarados"]') as HTMLButtonElement;
        expect(addAllButton).toBeDefined();

        await act(async () => {
            addAllButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const stored = loadRelaySettings({ ownerPubkey });
        expect(stored.byType.nip65Both).toContain('wss://relay.profile.example');
        expect(stored.byType.nip65Read).toContain('wss://relay.profile.example');
        expect(stored.byType.nip65Read).toContain('wss://relay.readonly.example');
        expect(stored.byType.nip65Write).toContain('wss://relay.profile.example');
        expect(stored.byType.dmInbox).toContain('wss://relay.dm.example');
    });

    test('loads active profile relay suggestions from fallback discovery relays', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const bootstrapRelay = getBootstrapRelays()[0] ?? 'wss://relay.damus.io';
        window.localStorage.setItem(
            RELAY_SETTINGS_STORAGE_KEY,
            JSON.stringify({
                relays: ['wss://relay.configured-only.example'],
                byType: {
                    nip65Both: ['wss://relay.configured-only.example'],
                    nip65Read: [],
                    nip65Write: [],
                    dmInbox: [],
                    search: [],
                },
            })
        );
        const { bridge, triggerOccupiedBuildingClick } = createMapBridgeStub();
        const createClient = vi.fn((relays?: string[]): NostrClient => ({
            connect: async () => {},
            fetchLatestReplaceableEvent: async (pubkey: string, kind: number) => {
                const relaySet = relays ?? [];
                const isFallbackClient = relaySet.includes(bootstrapRelay);
                if (!isFallbackClient || pubkey !== followedPubkey || kind !== 10002) {
                    return null;
                }

                return {
                    id: 'relay-list-active-profile-fallback',
                    pubkey,
                    kind: 10002,
                    created_at: 321,
                    tags: [['r', 'wss://relay.profile-fallback.example']],
                    content: '',
                };
            },
            fetchEvents: async () => [],
        }));

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient,
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            profiles[pubkey] = { pubkey, displayName: `User-${pubkey.slice(0, 4)}` };
                        }
                        return profiles;
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('User-ffff'));

        await act(async () => {
            triggerOccupiedBuildingClick({ buildingIndex: 4, pubkey: followedPubkey });
        });

        await selectActiveProfileDialogTab('Información');
        await waitFor(() => (rendered.container.textContent || '').includes('relay.profile-fallback.example'));
    });

    test('keeps active profile NIP-65 relays when DM relay metadata fails', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge, triggerOccupiedBuildingClick } = createMapBridgeStub();

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async (pubkey: string, kind: number) => {
                            if (pubkey !== followedPubkey) {
                                return null;
                            }

                            if (kind === 10002) {
                                return {
                                    id: 'relay-list-active-profile-partial',
                                    pubkey,
                                    kind: 10002,
                                    created_at: 321,
                                    tags: [['r', 'wss://relay.profile.example']],
                                    content: '',
                                };
                            }

                            if (kind === 10050) {
                                throw new Error('dm relay failed');
                            }

                            return null;
                        },
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            profiles[pubkey] = { pubkey, displayName: `User-${pubkey.slice(0, 4)}` };
                        }
                        return profiles;
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('User-ffff'));

        await act(async () => {
            triggerOccupiedBuildingClick({ buildingIndex: 4, pubkey: followedPubkey });
        });

        await selectActiveProfileDialogTab('Información');
        await waitFor(() => (rendered.container.textContent || '').includes('relay.profile.example'));
        expect(rendered.container.textContent || '').not.toContain('Sin relays declarados');
    });

    test('shows NIP-65 suggested relays in settings', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge } = createMapBridgeStub();

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async (_pubkey: string, kind: number) => {
                            if (kind === 10002) {
                                return {
                                    id: 'relay-list',
                                    pubkey: ownerPubkey,
                                    kind: 10002,
                                    created_at: 123,
                                    tags: [['r', 'wss://relay.suggested.example']],
                                    content: '',
                                };
                            }

                            return null;
                        },
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            profiles[pubkey] = { pubkey, displayName: `User-${pubkey.slice(0, 4)}` };
                        }
                        return profiles;
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('User-ffff'));

        const relaysButton = rendered.container.querySelector('button[aria-label="Abrir relays"]') as HTMLButtonElement;
        expect(relaysButton).toBeDefined();

        await act(async () => {
            relaysButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('relay.suggested.example'));
    });

    test('hides already-added relays from suggested list', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        window.localStorage.setItem(
            RELAY_SETTINGS_STORAGE_KEY,
            JSON.stringify({
                relays: ['wss://relay.suggested.example'],
                byType: {
                    nip65Both: ['wss://relay.suggested.example'],
                    nip65Read: ['wss://relay.suggested.example'],
                    nip65Write: ['wss://relay.suggested.example'],
                    dmInbox: [],
                    search: [],
                },
            })
        );

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async (_pubkey: string, kind: number) => {
                            if (kind === 10002) {
                                return {
                                    id: 'relay-list',
                                    pubkey: ownerPubkey,
                                    kind: 10002,
                                    created_at: 123,
                                    tags: [['r', 'wss://relay.suggested.example']],
                                    content: '',
                                };
                            }

                            return null;
                        },
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            profiles[pubkey] = { pubkey, displayName: `User-${pubkey.slice(0, 4)}` };
                        }
                        return profiles;
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('User-ffff'));

        const relaysButton = rendered.container.querySelector('button[aria-label="Abrir relays"]') as HTMLButtonElement;
        expect(relaysButton).toBeDefined();

        await act(async () => {
            relaysButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() =>
            !rendered.container.querySelector('button[aria-label="Abrir acciones sugeridas para wss://relay.suggested.example (NIP-65 read+write)"]')
        );

    });

    test('shows extension prompt close errors as sonner toast instead of inline sidebar error', async () => {
        (window as any).nostr = {
            getPublicKey: vi.fn().mockRejectedValue(new Error('Prompt was closed')),
            signEvent: vi.fn(),
        };

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        const methodSelectTrigger = rendered.container.querySelector('[data-slot="select-trigger"]') as HTMLButtonElement;
        expect(methodSelectTrigger).toBeDefined();

        await act(async () => {
            methodSelectTrigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
            methodSelectTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        const extensionMethodOption = Array.from(document.body.querySelectorAll('[data-slot="select-item"]')).find((item) =>
            (item.textContent || '').includes('Extensión (NIP-07)')
        ) as HTMLElement;
        expect(extensionMethodOption).toBeDefined();

        await act(async () => {
            extensionMethodOption.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
            extensionMethodOption.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        const continueButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Continuar con extensión')
        ) as HTMLButtonElement;
        expect(continueButton).toBeDefined();

        await act(async () => {
            continueButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (document.body.textContent || '').includes('Prompt was closed'));
        expect(rendered.container.querySelector('.nostr-error')).toBeNull();

        delete (window as any).nostr;
    });

    test('creates a local account from the login gate, signs bootstrap events, and scopes relay settings to the owner', async () => {
        const { bridge } = createMapBridgeStub();
        const signEventSpy = vi.spyOn(LocalKeyAuthProvider.prototype, 'signEvent');
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={createBasicOverlayServices('f'.repeat(64), {
                    fetchFollowsByPubkeyFn: vi.fn().mockImplementation(async (pubkey: string) => ({
                        ownerPubkey: pubkey,
                        follows: [],
                        relayHints: [],
                    })),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            profiles[pubkey] = { pubkey, displayName: `User-${pubkey.slice(0, 4)}` };
                        }
                        return profiles;
                    }),
                })}
            />,
        );
        mounted.push(rendered);

        const clickButton = async (label: string) => {
            const button = Array.from(rendered.container.querySelectorAll('button')).find((candidate) =>
                (candidate.textContent || '').includes(label)
            ) as HTMLButtonElement | undefined;
            expect(button).toBeDefined();
            await act(async () => {
                button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            });
        };

        const fillControl = async (selector: string, value: string) => {
            const input = rendered.container.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
            expect(input).toBeDefined();
            await act(async () => {
                const valueSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
                valueSetter?.call(input, value);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            });
        };

        await clickButton('Crear cuenta');
        await clickButton('Crear una cuenta local');
        await clickButton('Continuar');

        const backupCheckbox = rendered.container.querySelector('input[name="confirm-backup"]') as HTMLInputElement;
        expect(backupCheckbox).toBeDefined();
        await act(async () => {
            backupCheckbox.click();
        });

        await clickButton('Continuar');
        await fillControl('input[name="profile-name"]', 'Pablo');
        await fillControl('textarea[name="profile-about"]', 'Mapa y Nostr');
        await clickButton('Continuar');
        await clickButton('Crear cuenta ahora');

        await waitFor(() => signEventSpy.mock.calls.length >= 3);

        const signedKinds = signEventSpy.mock.calls.map((call) => call[0]?.kind);
        expect(signedKinds).toContain(0);
        expect(signedKinds).toContain(10002);
        expect(signedKinds).toContain(10050);

        const storedSessionRaw = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
        expect(storedSessionRaw).not.toBeNull();
        const storedSession = JSON.parse(storedSessionRaw ?? '{}') as { pubkey: string };
        const savedRelaySettings = loadRelaySettings({ ownerPubkey: storedSession.pubkey });
        expect(savedRelaySettings.byType.nip65Both).toContain('wss://relay.damus.io');
        expect(savedRelaySettings.byType.dmInbox).toContain('wss://relay.snort.social');
    });

    test('shows the unlock gate when restoring a passphrase-protected local account', async () => {
        const secretKey = generateSecretKey();
        const pubkey = getPublicKey(secretKey);
        const localKeyStorage = createLocalKeyStorage({
            storage: window.localStorage,
            deviceKeyStore: {
                async get() {
                    return undefined;
                },
                async getOrCreate() {
                    throw new Error('not needed');
                },
                async delete() {
                    return;
                },
            },
        });
        await localKeyStorage.save({ pubkey, secretKey, passphrase: 'local-passphrase' });
        window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
            method: 'local',
            pubkey,
            readonly: false,
            locked: false,
            createdAt: 123,
        }));

        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={createBasicOverlayServices(pubkey, {
                    fetchFollowsByPubkeyFn: vi.fn().mockImplementation(async () => ({
                        ownerPubkey: pubkey,
                        follows: [],
                        relayHints: [],
                    })),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [pubkey]: { pubkey, displayName: `User-${pubkey.slice(0, 4)}` },
                    }),
                })}
            />,
        );
        mounted.push(rendered);

        await waitFor(() => Boolean(rendered.container.querySelector('input[name="unlock-passphrase"]')));
        expect(rendered.container.querySelector('[data-testid="login-gate-screen"]')).not.toBeNull();
    });

    test('keeps the login gate available without logout when owner graph fails to load', async () => {
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    graphApiService: {
                        loadFollows: vi.fn().mockRejectedValue(new Error('Missing or invalid Nostr auth proof')),
                        loadFollowers: vi.fn().mockResolvedValue({ followers: [], complete: true }),
                        loadPosts: vi.fn().mockResolvedValue({ posts: [], hasMore: false, nextUntil: undefined }),
                        loadProfileStats: vi.fn().mockResolvedValue({ followsCount: 0, followersCount: 0 }),
                    },
                }}
            />,
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => rendered.container.querySelector('input[name="npub"]') !== null);
        expect(rendered.container.textContent || '').not.toContain('Cerrar sesion');
    });

    test('clears logout session cache for active profile agora dm notifications before next account login', async () => {
        const ownerPubkeyA = 'f'.repeat(64);
        const ownerPubkeyB = 'e'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const npubA = encodeHexToNpub(ownerPubkeyA);
        const npubB = encodeHexToNpub(ownerPubkeyB);
        const { bridge } = createMapBridgeStub(1);
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockImplementation(async (npub: string) => {
                        if (npub === npubA) {
                            return {
                                ownerPubkey: ownerPubkeyA,
                                follows: [followedPubkey],
                                relayHints: [],
                            };
                        }

                        return {
                            ownerPubkey: ownerPubkeyB,
                            follows: [followedPubkey],
                            relayHints: [],
                        };
                    }),
                    fetchProfilesFn: vi.fn().mockImplementation(async (pubkeys: string[]) => {
                        const profiles: Record<string, { pubkey: string; displayName: string }> = {};
                        for (const pubkey of pubkeys) {
                            if (pubkey === ownerPubkeyA) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner-A' };
                            }
                            if (pubkey === ownerPubkeyB) {
                                profiles[pubkey] = { pubkey, displayName: 'Owner-B' };
                            }
                            if (pubkey === followedPubkey) {
                                profiles[pubkey] = { pubkey, displayName: 'Alice' };
                            }
                        }

                        return profiles;
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const submitNpub = async (npub: string): Promise<void> => {
            const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
            const form = rendered.container.querySelector('form');

            await act(async () => {
                const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                valueSetter?.call(npubInput, npub);
                npubInput.dispatchEvent(new Event('input', { bubbles: true }));
                npubInput.dispatchEvent(new Event('change', { bubbles: true }));
            });

            await act(async () => {
                form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            });
        };

        await submitNpub(npubA);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner-A'));

        const followingFeedKey = nostrOverlayQueryKeys.followingFeed({
            ownerPubkey: ownerPubkeyA,
            follows: [followedPubkey],
            pageSize: 20,
        });
        const notificationsKey = nostrOverlayQueryKeys.notifications({
            ownerPubkey: ownerPubkeyA,
            limit: 200,
        });
        const directMessagesKey = nostrOverlayQueryKeys.directMessagesList({ ownerPubkey: ownerPubkeyA });
        const activeProfilePostsKey = ['nostr-overlay', 'social', 'active-profile', 'posts', {
            pubkey: followedPubkey,
            pageSize: 10,
        }] as const;

        rendered.queryClient.setQueryData(followingFeedKey, {
            pages: [{
                items: [{
                    id: 'feed-a',
                    pubkey: followedPubkey,
                    createdAt: 1_700_000_001,
                    content: 'feed-a',
                    kind: 'note',
                    rawEvent: {
                        id: 'feed-a',
                        pubkey: followedPubkey,
                        kind: 1,
                        created_at: 1_700_000_001,
                        tags: [],
                        content: 'feed-a',
                    },
                }],
                hasMore: false,
            }],
            pageParams: [undefined],
        });
        rendered.queryClient.setQueryData(notificationsKey, [{
            id: 'notif-a',
            kind: 1,
            actorPubkey: followedPubkey,
            createdAt: 1_700_000_002,
            content: 'notif-a',
            targetEventId: 'feed-a',
            targetPubkey: ownerPubkeyA,
            rawEvent: {
                id: 'notif-a',
                pubkey: followedPubkey,
                kind: 1,
                created_at: 1_700_000_002,
                tags: [['p', ownerPubkeyA], ['e', 'feed-a']],
                content: 'notif-a',
            },
        }]);
        rendered.queryClient.setQueryData(directMessagesKey, [{
            id: 'dm-a',
            conversationId: followedPubkey,
            peerPubkey: followedPubkey,
            direction: 'incoming',
            createdAt: 1_700_000_003,
            plaintext: 'dm-a',
            deliveryState: 'sent',
        }]);
        rendered.queryClient.setQueryData(activeProfilePostsKey, {
            pages: [{ posts: [{ id: 'profile-a' }], hasMore: false }],
            pageParams: [undefined],
        });

        expect(rendered.queryClient.getQueryData(followingFeedKey)).toBeDefined();
        expect(rendered.queryClient.getQueryData(notificationsKey)).toBeDefined();
        expect(rendered.queryClient.getQueryData(directMessagesKey)).toBeDefined();
        expect(rendered.queryClient.getQueryData(activeProfilePostsKey)).toBeDefined();

        await selectUserMenuAction(rendered.container, 'Cerrar sesión');
        await waitFor(() => (rendered.container.textContent || '').includes('Método de acceso'));

        expect(rendered.queryClient.getQueryData(followingFeedKey)).toBeUndefined();
        expect(rendered.queryClient.getQueryData(notificationsKey)).toBeUndefined();
        expect(rendered.queryClient.getQueryData(directMessagesKey)).toBeUndefined();
        expect(rendered.queryClient.getQueryData(activeProfilePostsKey)).toBeUndefined();

        await submitNpub(npubB);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner-B'));

        expect(rendered.queryClient.getQueryData(followingFeedKey)).toBeUndefined();
        expect(rendered.queryClient.getQueryData(notificationsKey)).toBeUndefined();
        expect(rendered.queryClient.getQueryData(directMessagesKey)).toBeUndefined();
        expect(rendered.queryClient.getQueryData(activeProfilePostsKey)).toBeUndefined();
    });

    test('resets discover progress in memory on logout while keeping user-scoped persistence', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const { bridge, triggerEasterEggBuildingClick } = createMapBridgeStub(1);
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
        expect(rendered.container.textContent || '').toContain('0/3');

        await act(async () => {
            triggerEasterEggBuildingClick({
                buildingIndex: 3,
                easterEggId: 'crypto_anarchist_manifesto',
            });
        });

        await waitFor(() => (rendered.container.textContent || '').includes('1/3'));

        await selectUserMenuAction(rendered.container, 'Cerrar sesión');
        await waitFor(() => (rendered.container.textContent || '').includes('Método de acceso'));

        expect(rendered.container.textContent || '').not.toContain('1/3');
        const storedProgressRaw = window.localStorage.getItem(`${EASTER_EGG_PROGRESS_STORAGE_KEY}:user:${ownerPubkey}`);
        expect(storedProgressRaw).not.toBeNull();
        expect(JSON.parse(storedProgressRaw as string)).toMatchObject({
            discoveredIds: ['crypto_anarchist_manifesto'],
        });
    });

    test('restores discover progress when switching back to original account', async () => {
        const ownerPubkeyA = 'f'.repeat(64);
        const ownerPubkeyB = 'e'.repeat(64);
        const npubA = encodeHexToNpub(ownerPubkeyA);
        const npubB = encodeHexToNpub(ownerPubkeyB);
        const { bridge, triggerEasterEggBuildingClick } = createMapBridgeStub(1);
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockImplementation(async (npub: string) => {
                        if (npub === npubA) {
                            return {
                                ownerPubkey: ownerPubkeyA,
                                follows: [],
                                relayHints: [],
                            };
                        }

                        return {
                            ownerPubkey: ownerPubkeyB,
                            follows: [],
                            relayHints: [],
                        };
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkeyA]: { pubkey: ownerPubkeyA, displayName: 'Owner-A' },
                        [ownerPubkeyB]: { pubkey: ownerPubkeyB, displayName: 'Owner-B' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const submitNpub = async (npub: string): Promise<void> => {
            const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
            const form = rendered.container.querySelector('form');

            await act(async () => {
                const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                valueSetter?.call(npubInput, npub);
                npubInput.dispatchEvent(new Event('input', { bubbles: true }));
                npubInput.dispatchEvent(new Event('change', { bubbles: true }));
            });

            await act(async () => {
                form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            });
        };

        await submitNpub(npubA);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner-A'));
        expect(rendered.container.textContent || '').toContain('0/3');

        await act(async () => {
            triggerEasterEggBuildingClick({
                buildingIndex: 3,
                easterEggId: 'crypto_anarchist_manifesto',
            });
        });

        await waitFor(() => (rendered.container.textContent || '').includes('1/3'));

        await selectUserMenuAction(rendered.container, 'Cerrar sesión');
        await waitFor(() => (rendered.container.textContent || '').includes('Método de acceso'));

        await submitNpub(npubB);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner-B'));
        expect(rendered.container.textContent || '').toContain('0/3');

        await selectUserMenuAction(rendered.container, 'Cerrar sesión');
        await waitFor(() => (rendered.container.textContent || '').includes('Método de acceso'));

        await submitNpub(npubA);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner-A'));
        expect(rendered.container.textContent || '').toContain('1/3');
    });

    test('hides logout from settings menu and keeps logout in user menu', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const followedPubkey = 'a'.repeat(64);
        const { bridge } = createMapBridgeStub(1);
        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={{
                    createClient: () => ({
                        connect: async () => {},
                        fetchLatestReplaceableEvent: async () => null,
                        fetchEvents: async () => [],
                    }),
                    fetchFollowsByNpubFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [followedPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [followedPubkey]: { pubkey: followedPubkey, displayName: 'Alice' },
                    }),
                    fetchFollowersBestEffortFn: vi.fn().mockResolvedValue({
                        followers: [],
                        scannedBatches: 1,
                        complete: true,
                    }),
                }}
            />
        );
        mounted.push(rendered);

        const npubInput = rendered.container.querySelector('input[name="npub"]') as HTMLInputElement;
        const form = rendered.container.querySelector('form');

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(npubInput, 'npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw');
            npubInput.dispatchEvent(new Event('input', { bubbles: true }));
            npubInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await act(async () => {
            form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });

        await waitFor(() => rendered.container.querySelector('button[aria-label="Abrir lista de seguidos"]') !== null);

        await openSettingsContextMenu(rendered.container);

        const settingsLogoutAction = Array.from(rendered.container.querySelectorAll('button, a')).find((item) =>
            (item.textContent || '').trim() === 'Cerrar sesión'
        ) ?? Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).find((item) =>
            (item.textContent || '').trim() === 'Cerrar sesión'
        );
        expect(settingsLogoutAction).toBeUndefined();

        await selectUserMenuAction(rendered.container, 'Cerrar sesión');

        await waitFor(() => (rendered.container.textContent || '').includes('Método de acceso'));

        const content = rendered.container.textContent || '';
        expect(content).not.toContain('Sigues (');
        expect(content).not.toContain('Seguidores (');
        expect(rendered.container.querySelector('[data-testid="login-gate-screen"]')).not.toBeNull();
    });
});
