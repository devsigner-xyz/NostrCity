import { act, useEffect, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AUTH_SESSION_STORAGE_KEY } from '../nostr/auth/secure-storage';
import { loadWalletActivity } from '../nostr/wallet-activity';

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
import { createNostrOverlayQueryClient } from './query/query-client';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
    queryClient: QueryClient;
}

interface RenderOptions {
    initialEntries?: string[];
}

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error?: unknown) => void;
}

type OccupiedBuildingClickPayload = { buildingIndex: number; pubkey: string };
type OccupiedBuildingContextMenuPayload = OccupiedBuildingClickPayload & { clientX: number; clientY: number };
type EasterEggBuildingPayload = {
    buildingIndex: number;
    easterEggId: 'bitcoin_whitepaper' | 'crypto_anarchist_manifesto' | 'cyberspace_independence';
};
type SpecialBuildingPayload = { buildingIndex: number; specialBuildingId: 'agora' };

type AppLocation = ReturnType<typeof useLocation>;

interface MapBridgeStub {
    bridge: MapBridge;
    triggerOccupiedBuildingClick: (payload: OccupiedBuildingClickPayload) => void;
    triggerOccupiedBuildingContextMenu: (payload: OccupiedBuildingContextMenuPayload) => void;
    triggerEasterEggBuildingClick: (payload: EasterEggBuildingPayload) => void;
    triggerSpecialBuildingClick: (payload: SpecialBuildingPayload) => void;
}

interface Nip07UnsignedEvent {
    id?: string;
    [key: string]: unknown;
}

const SAMPLE_AUTH_PUBKEY = '7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e';

function LocationProbe({ onLocation }: { onLocation: (location: AppLocation) => void }): null {
    const location = useLocation();

    useEffect(() => {
        onLocation(location);
    }, [location, onLocation]);

    return null;
}

function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
    return new Response(JSON.stringify(payload), {
        status: init.status ?? 200,
        headers: {
            'content-type': 'application/json',
            ...init.headers,
        },
    });
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

function createNip07ExtensionMock(pubkey = SAMPLE_AUTH_PUBKEY) {
    return {
        getPublicKey: vi.fn(async () => pubkey),
        signEvent: vi.fn(async (event: Nip07UnsignedEvent) => ({
            ...event,
            pubkey,
            id: typeof event.id === 'string' && event.id.length > 0 ? event.id : 'f'.repeat(64),
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

function requireElement<T extends Element>(element: T | null, message: string): T {
    if (!element) {
        throw new Error(message);
    }

    return element;
}

async function loginWithNip07(container: HTMLDivElement): Promise<void> {
    await waitFor(() => container.querySelector('[data-slot="select-trigger"]') !== null);
    const methodSelectTrigger = requireElement(
        container.querySelector('[data-slot="select-trigger"]'),
        'Expected login method select trigger to be rendered'
    );

    await act(async () => {
        methodSelectTrigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
        methodSelectTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    });

    const nip07Option = Array.from(document.body.querySelectorAll('[data-slot="select-item"]')).find((item) =>
        (item.textContent || '').trim() === 'Extension (NIP-07)'
    );
    if (!nip07Option) {
        throw new Error('Expected NIP-07 login option to be rendered');
    }

    await act(async () => {
        nip07Option.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
        nip07Option.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    });

    const continueButton = Array.from(container.querySelectorAll('button')).find((button) =>
        (button.textContent || '').includes('Continuar con extension')
    );
    if (!continueButton) {
        throw new Error('Expected NIP-07 continue button to be rendered');
    }

    await act(async () => {
        continueButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

function createMapBridgeStub(buildingsCount = 0): MapBridgeStub {
    const occupiedBuildingClickListeners: Array<(payload: OccupiedBuildingClickPayload) => void> = [];
    const occupiedBuildingContextMenuListeners: Array<(payload: OccupiedBuildingContextMenuPayload) => void> = [];
    const easterEggBuildingClickListeners: Array<(payload: EasterEggBuildingPayload) => void> = [];
    const specialBuildingClickListeners: Array<(payload: SpecialBuildingPayload) => void> = [];
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
        mountSettingsPanel: vi.fn(),
        focusBuilding: vi.fn(),
        listEasterEggBuildings: vi.fn().mockReturnValue([]),
        listSpecialBuildings: vi.fn().mockReturnValue([]),
        getParkCount: vi.fn().mockReturnValue(0),
        getZoom: vi.fn().mockReturnValue(1),
        worldToScreen: vi.fn().mockImplementation((point: { x: number; y: number }) => point),
        getViewportInsetLeft: vi.fn().mockReturnValue(0),
        onMapGenerated: vi.fn().mockReturnValue(() => {}),
        onOccupiedBuildingClick: vi.fn().mockImplementation((listener: (payload: OccupiedBuildingClickPayload) => void) => {
            occupiedBuildingClickListeners.push(listener);
            return () => {
                const index = occupiedBuildingClickListeners.indexOf(listener);
                if (index >= 0) {
                    occupiedBuildingClickListeners.splice(index, 1);
                }
            };
        }),
        onOccupiedBuildingContextMenu: vi.fn().mockImplementation((listener: (payload: OccupiedBuildingContextMenuPayload) => void) => {
            occupiedBuildingContextMenuListeners.push(listener);
            return () => {
                const index = occupiedBuildingContextMenuListeners.indexOf(listener);
                if (index >= 0) {
                    occupiedBuildingContextMenuListeners.splice(index, 1);
                }
            };
        }),
        onEasterEggBuildingClick: vi.fn().mockImplementation((listener: (payload: EasterEggBuildingPayload) => void) => {
            easterEggBuildingClickListeners.push(listener);
            return () => {
                const index = easterEggBuildingClickListeners.indexOf(listener);
                if (index >= 0) {
                    easterEggBuildingClickListeners.splice(index, 1);
                }
            };
        }),
        onSpecialBuildingClick: vi.fn().mockImplementation((listener: (payload: SpecialBuildingPayload) => void) => {
            specialBuildingClickListeners.push(listener);
            return () => {
                const index = specialBuildingClickListeners.indexOf(listener);
                if (index >= 0) {
                    specialBuildingClickListeners.splice(index, 1);
                }
            };
        }),
        onViewChanged: vi.fn().mockReturnValue(() => {}),
    } as unknown as MapBridge;

    return {
        bridge,
        triggerOccupiedBuildingClick: (payload: OccupiedBuildingClickPayload) => {
            occupiedBuildingClickListeners.forEach((listener) => listener(payload));
        },
        triggerOccupiedBuildingContextMenu: (payload: OccupiedBuildingContextMenuPayload) => {
            occupiedBuildingContextMenuListeners.forEach((listener) => listener(payload));
        },
        triggerEasterEggBuildingClick: (payload: EasterEggBuildingPayload) => {
            easterEggBuildingClickListeners.forEach((listener) => listener(payload));
        },
        triggerSpecialBuildingClick: (payload: SpecialBuildingPayload) => {
            specialBuildingClickListeners.forEach((listener) => listener(payload));
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

function createZapFetchMock(options: { invoiceOk?: boolean } = {}) {
    const { invoiceOk = true } = options;

    return vi.fn(async (input: string | URL | Request) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.includes('getalby.com/.well-known/lnurlp/alice') || url.includes('getalby.com/.well-known/lnurlp/bob')) {
            return jsonResponse({
                callback: 'https://wallet.example/cb',
                allowsNostr: true,
                nostrPubkey: 'b'.repeat(64),
                minSendable: 1_000,
                maxSendable: 1_000_000,
            });
        }

        if (url.includes('wallet.example/cb')) {
            const callbackUrl = new URL(url);
            const amount = callbackUrl.searchParams.get('amount');
            const nostr = callbackUrl.searchParams.get('nostr');
            const lnurl = callbackUrl.searchParams.get('lnurl');
            if (!amount || !nostr || !lnurl) {
                throw new Error(`Zap callback missing required params: ${url}`);
            }

            const zapRequest = JSON.parse(nostr) as { kind?: unknown; tags?: unknown };
            if (zapRequest.kind !== 9734 || !Array.isArray(zapRequest.tags)) {
                throw new Error(`Zap callback nostr param is not a NIP-57 zap request: ${url}`);
            }
            const hasTag = (name: string) => zapRequest.tags instanceof Array && zapRequest.tags.some((tag) => (
                Array.isArray(tag) && tag[0] === name && typeof tag[1] === 'string' && tag[1].length > 0
            ));
            for (const tagName of ['p', 'amount', 'relays', 'lnurl']) {
                if (!hasTag(tagName)) {
                    throw new Error(`Zap request missing ${tagName} tag: ${url}`);
                }
            }

            if (!invoiceOk) {
                return jsonResponse({ reason: 'invoice unavailable' }, { status: 500 });
            }

            return jsonResponse({ pr: 'lnbc1invoice' });
        }

        throw new Error(`Unexpected fetch: ${url}`);
    });
}

async function connectWebLnWalletFromShell(container: HTMLDivElement): Promise<void> {
    const walletButton = requireElement(
        container.querySelector('button[aria-label="Abrir wallet"]'),
        'Expected wallet button to be rendered'
    );

    await act(async () => {
        walletButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await waitFor(() => container.querySelector('[data-testid="wallet-page"]') !== null);
    const connectWebLnButton = Array.from(container.querySelectorAll('button')).find((button) =>
        (button.textContent || '').includes('Conectar con WebLN')
    );
    if (!connectWebLnButton) {
        throw new Error('Expected connect WebLN button to be rendered');
    }

    await act(async () => {
        connectWebLnButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await waitFor(() => (container.textContent || '').includes('Conectada por WebLN'));
}

async function openProfileZapFromContextMenu({
    triggerOccupiedBuildingContextMenu,
    pubkey,
    amount,
}: {
    triggerOccupiedBuildingContextMenu: MapBridgeStub['triggerOccupiedBuildingContextMenu'];
    pubkey: string;
    amount: number;
}): Promise<void> {
    await act(async () => {
        triggerOccupiedBuildingContextMenu({
            buildingIndex: 2,
            pubkey,
            clientX: 320,
            clientY: 240,
        });
    });

    await waitFor(() => (document.body.textContent || '').includes('Zap'));
    const zapSubmenuTrigger = Array.from(document.body.querySelectorAll('[data-slot="context-menu-sub-trigger"]')).find((node) =>
        (node.textContent || '').trim() === 'Zap'
    );
    if (!zapSubmenuTrigger) {
        throw new Error('Expected zap submenu trigger to be rendered');
    }

    await act(async () => {
        zapSubmenuTrigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        zapSubmenuTrigger.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
        zapSubmenuTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await waitFor(() => (document.body.textContent || '').includes(`${amount} sats`));
    const zapAmountItem = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((node) =>
        (node.textContent || '').trim() === `${amount} sats`
    );
    if (!zapAmountItem) {
        throw new Error(`Expected ${amount} sats zap item to be rendered`);
    }

    await act(async () => {
        zapAmountItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
    window.localStorage.clear();
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
    vi.stubGlobal('fetch', createZapFetchMock());
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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('Nostr overlay App focused safety-net harness', () => {
    test('renders the login gate through the focused safety-net harness', async () => {
        const { bridge } = createMapBridgeStub();

        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') !== null);

        const loginScreen = rendered.container.querySelector('[data-testid="login-gate-screen"]');
        const npubInput = rendered.container.querySelector('input[name="npub"]');

        expect(loginScreen).not.toBeNull();
        expect(npubInput).not.toBeNull();
        expect(rendered.container.textContent || '').toContain('Metodo de acceso');
    });

    test('hides map controls while the login gate is visible', async () => {
        const { bridge } = createMapBridgeStub();

        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);

        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') !== null);

        expect(rendered.container.querySelector('.nostr-map-zoom-controls')).toBeNull();
        expect(rendered.container.querySelector('.nostr-map-display-controls')).toBeNull();
    });

    test('does not open occupied-building context menu while the login gate is visible', async () => {
        const buildingIndex = 3;
        const pubkey = 'a'.repeat(64);
        const clientX = 360;
        const clientY = 280;
        const { bridge, triggerOccupiedBuildingContextMenu } = createMapBridgeStub(4);

        const rendered = await renderApp(<App mapBridge={bridge} services={createBasicOverlayServices()} />);
        mounted.push(rendered);
        await waitFor(() => rendered.container.querySelector('[data-testid="login-gate-screen"]') !== null);
        await waitFor(() => vi.mocked(bridge.onOccupiedBuildingContextMenu).mock.calls.length > 0);
        expect(bridge.onOccupiedBuildingContextMenu).toHaveBeenCalledTimes(1);

        await act(async () => {
            triggerOccupiedBuildingContextMenu({ buildingIndex, pubkey, clientX, clientY });
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        const bodyText = document.body.textContent || '';
        expect(document.body.querySelector('.nostr-context-anchor')).toBeNull();
        expect(bodyText).not.toContain('Copiar npub');
        expect(bodyText).not.toContain('Ver detalles');
        expect(bodyText).not.toContain('Zap');
    });

    test('redirects legacy settings relay detail route to relay detail while preserving search params', async () => {
        const ownerPubkey = 'f'.repeat(64);
        const locations: AppLocation[] = [];
        window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
            method: 'npub',
            pubkey: ownerPubkey,
            readonly: true,
            locked: false,
            createdAt: Date.now(),
        }));
        const { bridge } = createMapBridgeStub();

        const rendered = await renderApp(
            <>
                <App mapBridge={bridge} services={createBasicOverlayServices(ownerPubkey)} />
                <LocationProbe onLocation={(location) => locations.push(location)} />
            </>,
            { initialEntries: ['/settings/relays/detail?relay=wss%3A%2F%2Frelay.example'] }
        );
        mounted.push(rendered);

        await waitFor(() => {
            const location = locations[locations.length - 1];
            return location?.pathname === '/relays/detail' && location.search === '?relay=wss%3A%2F%2Frelay.example';
        });
        await waitFor(() => (rendered.container.textContent || '').includes('wss://relay.example'));
        const finalLocation = locations[locations.length - 1];

        expect(finalLocation).toMatchObject({
            pathname: '/relays/detail',
            search: '?relay=wss%3A%2F%2Frelay.example',
        });
        expect(finalLocation?.pathname).not.toBe('/relays');
        expect(rendered.container.textContent || '').toContain('wss://relay.example');
    });

    test('keeps both wallet activity rows when two WebLN zaps start before either payment resolves', async () => {
        const ownerPubkey = SAMPLE_AUTH_PUBKEY;
        const alicePubkey = 'a'.repeat(64);
        const bobPubkey = 'b'.repeat(64);
        const firstPayment = createDeferred<{ preimage: string }>();
        const secondPayment = createDeferred<{ preimage: string }>();
        const sendPayment = vi.fn()
            .mockReturnValueOnce(firstPayment.promise)
            .mockReturnValueOnce(secondPayment.promise);
        Object.assign(window, {
            webln: {
                enable: vi.fn(async () => {}),
                sendPayment,
                makeInvoice: vi.fn(async () => ({ paymentRequest: 'lnbc1invoice', expiresAt: 200 })),
            },
        });
        const { bridge, triggerOccupiedBuildingContextMenu } = createMapBridgeStub(2);

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={createBasicOverlayServices(ownerPubkey, {
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [alicePubkey, bobPubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [alicePubkey]: { pubkey: alicePubkey, displayName: 'Alice', lud16: 'alice@getalby.com' },
                        [bobPubkey]: { pubkey: bobPubkey, displayName: 'Bob', lud16: 'bob@getalby.com' },
                    }),
                })}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
        await connectWebLnWalletFromShell(rendered.container);
        const mapButton = requireElement(
            rendered.container.querySelector('button[aria-label="Abrir mapa"]'),
            'Expected map button to be rendered'
        );
        await act(async () => {
            mapButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await openProfileZapFromContextMenu({
            triggerOccupiedBuildingContextMenu,
            pubkey: alicePubkey,
            amount: 21,
        });
        await waitFor(() => sendPayment.mock.calls.length === 1);
        await openProfileZapFromContextMenu({
            triggerOccupiedBuildingContextMenu,
            pubkey: bobPubkey,
            amount: 21,
        });
        await waitFor(() => sendPayment.mock.calls.length === 2);

        const zapRows = loadWalletActivity({ ownerPubkey }).items.filter((item) => item.actionType === 'zap-payment');
        expect(zapRows).toHaveLength(2);
        expect(zapRows.map((row) => row.targetId).sort()).toEqual([alicePubkey, bobPubkey].sort());

        await act(async () => {
            firstPayment.resolve({ preimage: 'first' });
            secondPayment.resolve({ preimage: 'second' });
            await Promise.all([firstPayment.promise, secondPayment.promise]);
        });
    });

    test('marks wallet activity failed when zap invoice cannot be requested', async () => {
        const ownerPubkey = SAMPLE_AUTH_PUBKEY;
        const alicePubkey = 'a'.repeat(64);
        const sendPayment = vi.fn(async () => ({ preimage: 'paid' }));
        vi.stubGlobal('fetch', createZapFetchMock({ invoiceOk: false }));
        Object.assign(window, {
            webln: {
                enable: vi.fn(async () => {}),
                sendPayment,
                makeInvoice: vi.fn(async () => ({ paymentRequest: 'lnbc1invoice', expiresAt: 200 })),
            },
        });
        const { bridge, triggerOccupiedBuildingContextMenu } = createMapBridgeStub(1);

        const rendered = await renderApp(
            <App
                mapBridge={bridge}
                services={createBasicOverlayServices(ownerPubkey, {
                    fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                        ownerPubkey,
                        follows: [alicePubkey],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                        [alicePubkey]: { pubkey: alicePubkey, displayName: 'Alice', lud16: 'alice@getalby.com' },
                    }),
                })}
            />
        );
        mounted.push(rendered);

        await loginWithNip07(rendered.container);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));
        await connectWebLnWalletFromShell(rendered.container);
        const mapButton = requireElement(
            rendered.container.querySelector('button[aria-label="Abrir mapa"]'),
            'Expected map button to be rendered'
        );
        await act(async () => {
            mapButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await openProfileZapFromContextMenu({
            triggerOccupiedBuildingContextMenu,
            pubkey: alicePubkey,
            amount: 21,
        });
        await waitFor(() => {
            const activity = loadWalletActivity({ ownerPubkey }).items[0];
            return activity?.status === 'failed' && typeof activity.errorMessage === 'string' && activity.errorMessage.length > 0;
        });
        const activity = loadWalletActivity({ ownerPubkey }).items[0];

        expect(activity?.status).toBe('failed');
        expect(activity?.errorMessage).toBeTruthy();
        expect(sendPayment).not.toHaveBeenCalled();

        const walletButton = requireElement(
            rendered.container.querySelector('button[aria-label="Abrir wallet"]'),
            'Expected wallet button to be rendered'
        );
        await act(async () => {
            walletButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await waitFor(() => rendered.container.querySelector('[data-testid="wallet-page"]') !== null);

        const failedActivityRow = Array.from(rendered.container.querySelectorAll('li')).find((row) => {
            const rowText = row.textContent || '';
            return rowText.includes('21 sats');
        });
        expect(failedActivityRow).not.toBeUndefined();
        const failedBadge = failedActivityRow?.querySelector('[data-slot="badge"]');
        expect(failedBadge?.textContent).toBe('Fallido');
    });

    test('keeps the user on wallet when an auto-resumed WebLN payment fails', async () => {
        const ownerPubkey = SAMPLE_AUTH_PUBKEY;
        const alicePubkey = 'a'.repeat(64);
        const locations: AppLocation[] = [];
        window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
            method: 'nip07',
            pubkey: ownerPubkey,
            readonly: false,
            locked: false,
            createdAt: Date.now(),
        }));
        const { bridge, triggerOccupiedBuildingContextMenu } = createMapBridgeStub(1);

        const rendered = await renderApp(
            <>
                <App
                    mapBridge={bridge}
                    services={createBasicOverlayServices(ownerPubkey, {
                        fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                            ownerPubkey,
                            follows: [alicePubkey],
                            relayHints: [],
                        }),
                        fetchProfilesFn: vi.fn().mockResolvedValue({
                            [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                            [alicePubkey]: { pubkey: alicePubkey, displayName: 'Alice', lud16: 'alice@getalby.com' },
                        }),
                    })}
                />
                <LocationProbe onLocation={(location) => locations.push(location)} />
            </>,
            { initialEntries: ['/map'] }
        );
        mounted.push(rendered);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await openProfileZapFromContextMenu({
            triggerOccupiedBuildingContextMenu,
            pubkey: alicePubkey,
            amount: 21,
        });
        await waitFor(() => {
            const location = locations[locations.length - 1];
            return location?.pathname === '/wallet' && rendered.container.querySelector('[data-testid="wallet-page"]') !== null;
        });

        const sendPayment = vi.fn(async () => {
            throw new Error('payment failed');
        });
        Object.assign(window, {
            webln: {
                enable: vi.fn(async () => {}),
                sendPayment,
                makeInvoice: vi.fn(async () => ({ paymentRequest: 'lnbc1invoice', expiresAt: 200 })),
            },
        });

        await connectWebLnWalletFromShell(rendered.container);
        await waitFor(() => sendPayment.mock.calls.length === 1);
        await waitFor(() => {
            const activity = loadWalletActivity({ ownerPubkey }).items[0];
            return activity?.status === 'failed' && rendered.container.querySelector('[data-testid="wallet-page"]') !== null;
        });

        const activity = loadWalletActivity({ ownerPubkey }).items[0];
        const failedActivityRow = Array.from(rendered.container.querySelectorAll('li')).find((row) => {
            const rowText = row.textContent || '';
            return rowText.includes('21 sats');
        });
        const failedBadge = failedActivityRow?.querySelector('[data-slot="badge"]');

        expect(sendPayment).toHaveBeenCalledWith('lnbc1invoice');
        expect(activity?.status).toBe('failed');
        expect(failedActivityRow).not.toBeUndefined();
        expect(failedBadge?.textContent).toBe('Fallido');

        await act(async () => {
            await Promise.resolve();
        });

        const finalLocation = locations[locations.length - 1];
        expect(finalLocation?.pathname).toBe('/wallet');
        expect(rendered.container.querySelector('[data-testid="wallet-page"]')).not.toBeNull();
    });

    test('sends one payment while an auto-resumed zap is pending across rerenders', async () => {
        const ownerPubkey = SAMPLE_AUTH_PUBKEY;
        const alicePubkey = 'a'.repeat(64);
        const originPath = '/estadisticas';
        const originSearch = '?from=safety-net';
        const originRoute = `${originPath}${originSearch}`;
        const locations: AppLocation[] = [];
        const pendingPayment = createDeferred<{ preimage: string }>();
        const sendPayment = vi.fn(() => pendingPayment.promise);
        const { bridge, triggerOccupiedBuildingContextMenu } = createMapBridgeStub(1);
        const appTree = (
            <>
                <App
                    mapBridge={bridge}
                    services={createBasicOverlayServices(ownerPubkey, {
                        fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
                            ownerPubkey,
                            follows: [alicePubkey],
                            relayHints: [],
                        }),
                        fetchProfilesFn: vi.fn().mockResolvedValue({
                            [ownerPubkey]: { pubkey: ownerPubkey, displayName: 'Owner' },
                            [alicePubkey]: { pubkey: alicePubkey, displayName: 'Alice', lud16: 'alice@getalby.com' },
                        }),
                    })}
                />
                <LocationProbe onLocation={(location) => locations.push(location)} />
            </>
        );
        window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
            method: 'nip07',
            pubkey: ownerPubkey,
            readonly: false,
            locked: false,
            createdAt: Date.now(),
        }));

        const rendered = await renderApp(appTree, { initialEntries: [originRoute] });
        mounted.push(rendered);
        await waitFor(() => (rendered.container.textContent || '').includes('Owner'));

        await openProfileZapFromContextMenu({
            triggerOccupiedBuildingContextMenu,
            pubkey: alicePubkey,
            amount: 21,
        });
        await waitFor(() => {
            const location = locations[locations.length - 1];
            return location?.pathname === '/wallet' && rendered.container.querySelector('[data-testid="wallet-page"]') !== null;
        });
        expect(locations[locations.length - 1]).toMatchObject({ pathname: '/wallet' });
        expect(rendered.container.querySelector('[data-testid="wallet-page"]')).not.toBeNull();

        Object.assign(window, {
            webln: {
                enable: vi.fn(async () => {}),
                sendPayment,
                makeInvoice: vi.fn(async () => ({ paymentRequest: 'lnbc1invoice', expiresAt: 200 })),
            },
        });

        await connectWebLnWalletFromShell(rendered.container);
        await waitFor(() => sendPayment.mock.calls.length === 1);

        await act(async () => {
            rendered.root.render(
                <QueryClientProvider client={rendered.queryClient}>
                    <MemoryRouter initialEntries={[originRoute]}>
                        {appTree}
                    </MemoryRouter>
                </QueryClientProvider>
            );
            await Promise.resolve();
        });
        await waitFor(() => locations[locations.length - 1]?.pathname === '/wallet');

        expect(locations[locations.length - 1]).toMatchObject({ pathname: '/wallet' });
        expect(rendered.container.querySelector('[data-testid="wallet-page"]')).not.toBeNull();
        expect(sendPayment).toHaveBeenCalledTimes(1);

        await act(async () => {
            pendingPayment.resolve({ preimage: 'paid' });
            await pendingPayment.promise;
        });
        await waitFor(() => {
            const location = locations[locations.length - 1];
            return location?.pathname === originPath && location.search === originSearch;
        });

        expect(sendPayment).toHaveBeenCalledWith('lnbc1invoice');
        expect(locations[locations.length - 1]).toMatchObject({
            pathname: originPath,
            search: originSearch,
        });
        expect(sendPayment).toHaveBeenCalledTimes(1);
    });
});
