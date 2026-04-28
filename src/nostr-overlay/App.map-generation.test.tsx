import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AUTH_SESSION_STORAGE_KEY } from '../nostr/auth/secure-storage';
import { __resetFollowsCacheForTests } from '../nostr/follows';
import { App } from './App';
import type { NostrOverlayServices } from './hooks/useNostrOverlay';
import type { MapBridge } from './map-bridge';
import { createNostrOverlayQueryClient } from './query/query-client';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
    queryClient: QueryClient;
}

interface MapBridgeStub {
    bridge: MapBridge;
}

function createMapBridgeStub(buildingsCount = 12): MapBridgeStub {
    const bridge = {
        ensureGenerated: vi.fn().mockResolvedValue(undefined),
        regenerateMap: vi.fn().mockResolvedValue(undefined),
        listBuildings: vi.fn().mockReturnValue(
            Array.from({ length: buildingsCount }, (_, index) => ({
                index,
                centroid: { x: index * 10, y: index * 8 },
            }))
        ),
        listEasterEggBuildings: vi.fn().mockReturnValue([]),
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
        setZoom: vi.fn(),
        worldToScreen: vi.fn().mockImplementation((point: { x: number; y: number }) => point),
        getViewportInsetLeft: vi.fn().mockReturnValue(0),
        onMapGenerated: vi.fn().mockReturnValue(() => {}),
        onOccupiedBuildingClick: vi.fn().mockReturnValue(() => {}),
        onOccupiedBuildingContextMenu: vi.fn().mockReturnValue(() => {}),
        onEasterEggBuildingClick: vi.fn().mockReturnValue(() => {}),
        onViewChanged: vi.fn().mockReturnValue(() => {}),
    } as unknown as MapBridge;

    return { bridge };
}

function createOverlayServices(ownerPubkey: string, follows: string[]): NostrOverlayServices {
    return {
        createClient: () => ({
            connect: async () => {},
            fetchLatestReplaceableEvent: async () => null,
            fetchEvents: async () => [],
        }),
        fetchFollowsByPubkeyFn: vi.fn().mockResolvedValue({
            ownerPubkey,
            follows,
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
    };
}

async function renderApp(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const queryClient = createNostrOverlayQueryClient();

    await act(async () => {
        root.render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter initialEntries={['/login']}>
                    {element}
                </MemoryRouter>
            </QueryClientProvider>
        );
    });

    return { container, root, queryClient };
}

async function waitFor(condition: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        if (condition()) {
            return;
        }

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
    }

    throw new Error('Condition was not met in time');
}

describe('App map generation sizing', () => {
    const mounted: RenderResult[] = [];

    beforeEach(() => {
        window.localStorage.clear();
        __resetFollowsCacheForTests();
    });

    afterEach(async () => {
        while (mounted.length > 0) {
            const rendered = mounted.pop();
            if (!rendered) {
                continue;
            }

            await act(async () => {
                rendered.root.unmount();
            });
            rendered.container.remove();
            rendered.queryClient.clear();
        }
    });

    test('authenticated load regenerates the map with targetBuildings and does not call ensureGenerated', async () => {
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
            <App mapBridge={bridge} services={createOverlayServices(ownerPubkey, ['a'.repeat(64)])} />
        );
        mounted.push(rendered);

        await waitFor(() => (bridge.regenerateMap as any).mock.calls.length > 0);

        expect(bridge.regenerateMap).toHaveBeenCalledWith({ targetBuildings: 600 });
        expect(bridge.ensureGenerated).not.toHaveBeenCalled();
    });

    test('manual regenerate uses the current follows-derived targetBuildings', async () => {
        const ownerPubkey = 'f'.repeat(64);
        window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
            method: 'npub',
            pubkey: ownerPubkey,
            readonly: true,
            locked: false,
            createdAt: Date.now(),
        }));

        const follows = Array.from({ length: 50 }, (_, index) => `${index}`.padStart(64, 'f').slice(-64));
        const { bridge } = createMapBridgeStub();
        const rendered = await renderApp(
            <App mapBridge={bridge} services={createOverlayServices(ownerPubkey, follows)} />
        );
        mounted.push(rendered);

        await waitFor(() => (bridge.regenerateMap as any).mock.calls.length > 0);
        (bridge.regenerateMap as any).mockClear();

        await waitFor(() => rendered.container.querySelector('.nostr-map-zoom-controls button[aria-label="Regenerar mapa"]') !== null);
        const regenerateButton = rendered.container.querySelector('.nostr-map-zoom-controls button[aria-label="Regenerar mapa"]') as HTMLButtonElement | null;
        expect(regenerateButton).not.toBeNull();

        await act(async () => {
            regenerateButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        await waitFor(() => (bridge.regenerateMap as any).mock.calls.length > 0);
        expect(bridge.regenerateMap).toHaveBeenCalledWith({ targetBuildings: 600 });
    });
});
