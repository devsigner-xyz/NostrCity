import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import type { MapBridge } from './map-bridge';
import { assignPubkeysToBuildings } from '../nostr/domain/assignment';
import * as ndkClientModule from '../nostr/ndk-client';
import { createNostrOverlayQueryClient } from './query/query-client';

const WAIT_TIMEOUT_MS = 6_000;
const WAIT_INTERVAL_MS = 20;

function createMapBridgeStub(buildingsCount: number): { bridge: MapBridge; triggerMapGenerated: () => void } {
    const listeners: Array<() => void> = [];

    const bridge: MapBridge = {
        ensureGenerated: vi.fn().mockResolvedValue(undefined),
        regenerateMap: vi.fn().mockResolvedValue(undefined),
        listBuildings: vi.fn().mockReturnValue(
            Array.from({ length: buildingsCount }, (_, index) => ({
                index,
                centroid: { x: index * 10, y: index * 10 },
            }))
        ),
        applyOccupancy: vi.fn(),
        setVerifiedBuildingIndexes: vi.fn(),
        setViewportInsetLeft: vi.fn(),
        setDialogBuildingHighlight: vi.fn(),
        setStreetLabelsEnabled: vi.fn(),
        setStreetLabelsZoomLevel: vi.fn(),
        setStreetLabelUsernames: vi.fn(),
        setTrafficParticlesCount: vi.fn(),
        setTrafficParticlesSpeed: vi.fn(),
        mountSettingsPanel: vi.fn(),
        focusBuilding: vi.fn(),
        getParkCount: vi.fn().mockReturnValue(0),
        getZoom: vi.fn().mockReturnValue(1),
        worldToScreen: vi.fn().mockImplementation((point: { x: number; y: number }) => point),
        getViewportInsetLeft: vi.fn().mockReturnValue(0),
        onMapGenerated: vi.fn().mockImplementation((listener: () => void) => {
            listeners.push(listener);
            return () => {
                const idx = listeners.indexOf(listener);
                if (idx >= 0) {
                    listeners.splice(idx, 1);
                }
            };
        }),
        onOccupiedBuildingClick: vi.fn().mockReturnValue(() => {}),
        onOccupiedBuildingContextMenu: vi.fn().mockReturnValue(() => {}),
        onViewChanged: vi.fn().mockReturnValue(() => {}),
    };

    return {
        bridge,
        triggerMapGenerated: () => {
            listeners.forEach(listener => listener());
        },
    };
}

async function flush(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
    });
}

async function waitFor(condition: () => boolean, timeoutMs = WAIT_TIMEOUT_MS): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        if (condition()) {
            return;
        }

        if (vi.isFakeTimers()) {
            await vi.advanceTimersByTimeAsync(WAIT_INTERVAL_MS);
        } else {
            await new Promise(resolve => setTimeout(resolve, WAIT_INTERVAL_MS));
        }
    }

    throw new Error(`Condition was not met in ${timeoutMs}ms`);
}

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderApp(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const queryClient = createNostrOverlayQueryClient();

    await act(async () => {
        root.render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>{element}</MemoryRouter>
            </QueryClientProvider>
        );
    });

    return { container, root };
}

let mounted: RenderResult[] = [];
beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(ndkClientModule, 'createNdkDmTransportClient').mockReturnValue({
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

async function clickMapOptionsRegenerate(container: HTMLDivElement): Promise<void> {
    await waitFor(() => container.querySelector('button[aria-label="Opciones del mapa"]') !== null);
    const optionsButton = container.querySelector('button[aria-label="Opciones del mapa"]') as HTMLButtonElement;

    await act(async () => {
        optionsButton.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
        optionsButton.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    });

    await waitFor(() => Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).some((item) =>
        (item.textContent || '').trim() === 'Regenerar mapa'
    ));
    const regenerateItem = Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).find((item) =>
        (item.textContent || '').trim() === 'Regenerar mapa'
    ) as HTMLElement;

    await act(async () => {
        regenerateItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

afterEach(async () => {
    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted = [];
    vi.restoreAllMocks();
});

describe('Nostr overlay selection map interaction', () => {
    test('selecting a person focuses and highlights assigned building', { timeout: 15_000 }, async () => {
        const ownerPubkey = 'f'.repeat(64);
        const pubkeyA = 'a'.repeat(64);
        const pubkeyB = 'b'.repeat(64);
        const { bridge, triggerMapGenerated } = createMapBridgeStub(3);

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
                        follows: [pubkeyA, pubkeyB],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [pubkeyA]: { pubkey: pubkeyA, displayName: 'Alice' },
                        [pubkeyB]: { pubkey: pubkeyB, displayName: 'Bob' },
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
        await flush();

        const followingTab = rendered.container.querySelector('button[aria-label="Abrir lista de seguidos"]');
        expect(followingTab).toBeDefined();

        await act(async () => {
            followingTab?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            followingTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Alice'));

        const aliceButton = Array.from(rendered.container.querySelectorAll('button')).find(button =>
            (button.textContent || '').includes('Alice')
        );
        expect(aliceButton).toBeDefined();

        await act(async () => {
            aliceButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const assignment = assignPubkeysToBuildings({
            pubkeys: [pubkeyA, pubkeyB],
            buildingsCount: 3,
            seed: ownerPubkey,
        });
        const assignedIndex = assignment.pubkeyToBuildingIndex[pubkeyA];

        expect((bridge.focusBuilding as any).mock.calls[0][0]).toBe(assignedIndex);

        const calls = (bridge.applyOccupancy as any).mock.calls;
        const lastCall = calls[calls.length - 1][0];
        expect(lastCall.selectedBuildingIndex).toBe(assignedIndex);

        await act(async () => {
            triggerMapGenerated();
        });
        const callsAfterRegeneration = (bridge.applyOccupancy as any).mock.calls;
        const lastRegenerationCall = callsAfterRegeneration[callsAfterRegeneration.length - 1][0];
        expect(lastRegenerationCall.byBuildingIndex).toBeDefined();
        expect(Object.keys(lastRegenerationCall.byBuildingIndex).length).toBeGreaterThan(0);
    });

    test('manual map regeneration does not refocus the last selected building', { timeout: 15_000 }, async () => {
        const ownerPubkey = 'f'.repeat(64);
        const pubkeyA = 'a'.repeat(64);
        const pubkeyB = 'b'.repeat(64);
        const { bridge } = createMapBridgeStub(3);

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
                        follows: [pubkeyA, pubkeyB],
                        relayHints: [],
                    }),
                    fetchProfilesFn: vi.fn().mockResolvedValue({
                        [pubkeyA]: { pubkey: pubkeyA, displayName: 'Alice' },
                        [pubkeyB]: { pubkey: pubkeyB, displayName: 'Bob' },
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
        await flush();

        const followingTab = rendered.container.querySelector('button[aria-label="Abrir lista de seguidos"]');
        expect(followingTab).toBeDefined();

        await act(async () => {
            followingTab?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            followingTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (rendered.container.textContent || '').includes('Alice'));

        const aliceButton = Array.from(rendered.container.querySelectorAll('button')).find(button =>
            (button.textContent || '').includes('Alice')
        );
        expect(aliceButton).toBeDefined();

        await act(async () => {
            aliceButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(bridge.focusBuilding).toHaveBeenCalledTimes(1);
        (bridge.focusBuilding as any).mockClear();
        (bridge.regenerateMap as any).mockClear();

        await clickMapOptionsRegenerate(rendered.container);

        await waitFor(() => (bridge.regenerateMap as any).mock.calls.length === 1);
        expect(bridge.focusBuilding).not.toHaveBeenCalled();
    });
});
