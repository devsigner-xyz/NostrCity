import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router';
import { RELAY_SETTINGS_STORAGE_KEY } from '../../../nostr/relay-settings';
import { createNostrOverlayQueryClient } from '../../query/query-client';
import type { MapBridge } from '../../map-bridge';
import { RelayDetailRoute } from '../RelayDetailRoute';
import { RelaysRoute } from '../RelaysRoute';
import { SettingsPage, type SettingsPageProps } from '../SettingsPage';
import { SettingsAboutRoute } from './SettingsAboutRoute';
import { SettingsAdvancedRoute } from './SettingsAdvancedRoute';
import { SettingsShortcutsRoute } from './SettingsShortcutsRoute';
import { SettingsZapsRoute } from './SettingsZapsRoute';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
    queryClient: ReturnType<typeof createNostrOverlayQueryClient>;
    bridge: MapBridge;
}

function createBridgeStub(): MapBridge {
    return {
        ensureGenerated: vi.fn().mockResolvedValue(undefined),
        regenerateMap: vi.fn().mockResolvedValue(undefined),
        listBuildings: vi.fn().mockReturnValue([]),
        applyOccupancy: vi.fn(),
        setVerifiedBuildingIndexes: vi.fn(),
        setViewportInsetLeft: vi.fn(),
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
        getParkCount: vi.fn().mockReturnValue(0),
        onMapGenerated: vi.fn().mockReturnValue(() => {}),
        onOccupiedBuildingClick: vi.fn().mockReturnValue(() => {}),
        onOccupiedBuildingContextMenu: vi.fn().mockReturnValue(() => {}),
        getZoom: vi.fn().mockReturnValue(1),
        worldToScreen: vi.fn().mockImplementation((point: { x: number; y: number }) => point),
        getViewportInsetLeft: vi.fn().mockReturnValue(0),
        onViewChanged: vi.fn().mockReturnValue(() => {}),
    };
}

function buildSettingsRoutes(props: SettingsPageProps): ReactElement {
    const relaysRouteProps = {
        ...(props.ownerPubkey === undefined ? {} : { ownerPubkey: props.ownerPubkey }),
        ...(props.suggestedRelays === undefined ? {} : { suggestedRelays: props.suggestedRelays }),
        ...(props.suggestedRelaysByType === undefined ? {} : { suggestedRelaysByType: props.suggestedRelaysByType }),
        ...(props.relayConnectionProbe === undefined ? {} : { relayConnectionProbe: props.relayConnectionProbe }),
        ...(props.relayConnectionRefreshIntervalMs === undefined
            ? {}
            : { relayConnectionRefreshIntervalMs: props.relayConnectionRefreshIntervalMs }),
    };

    return (
        <Routes>
            <Route path="/settings" element={<SettingsPage {...props} />}>
                <Route index element={<Navigate to="zaps" replace />} />
                <Route path="shortcuts" element={<SettingsShortcutsRoute />} />
                <Route path="zaps" element={<SettingsZapsRoute />} />
                <Route path="about" element={<SettingsAboutRoute />} />
                <Route path="advanced" element={<SettingsAdvancedRoute />} />
                <Route path="*" element={<Navigate to="zaps" replace />} />
            </Route>
            <Route path="/relays" element={<RelaysRoute
                {...relaysRouteProps}
            />}
            />
            <Route path="/relays/detail" element={<RelayDetailRoute
                {...relaysRouteProps}
            />}
            />
            <Route path="/settings/relays" element={<Navigate to="/relays" replace />} />
            <Route path="/settings/relays/detail" element={<Navigate to="/relays/detail" replace />} />
        </Routes>
    );
}

async function renderSettingsRoute(pathname: string, overrides: Partial<SettingsPageProps> = {}): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const queryClient = createNostrOverlayQueryClient();
    const bridge = overrides.mapBridge ?? createBridgeStub();
    const props: SettingsPageProps = {
        mapBridge: bridge,
        onClose: () => {},
        ...overrides,
    };

    await act(async () => {
        root.render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter initialEntries={[pathname]}>
                    {buildSettingsRoutes(props)}
                </MemoryRouter>
            </QueryClientProvider>
        );
    });

    return { container, root, queryClient, bridge };
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    window.localStorage.clear();
    const defaultFetchMock = vi.fn(async () => new Response('unavailable', { status: 503 }));
    vi.stubGlobal('fetch', defaultFetchMock);
    (window as any).fetch = defaultFetchMock;
});

afterEach(() => {
    vi.unstubAllGlobals();

    for (const entry of mounted) {
        entry.root.unmount();
        entry.queryClient.cancelQueries();
        entry.queryClient.clear();
        (entry.queryClient as { destroy?: () => void }).destroy?.();
        entry.container.remove();
    }
    mounted = [];
});

describe('Overlay settings routes', () => {
    test('redirects settings index route to zaps', async () => {
        const rendered = await renderSettingsRoute('/settings');
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Define cantidades rapidas para enviar zaps.');
    });

    test('mounts and unmounts advanced settings host on route lifecycle', async () => {
        const bridge = createBridgeStub();
        const rendered = await renderSettingsRoute('/settings/advanced', { mapBridge: bridge });

        const mountedCalls = (bridge.mountSettingsPanel as any).mock.calls;
        expect(mountedCalls.some((call: [unknown]) => call[0] instanceof HTMLElement)).toBe(true);

        rendered.root.unmount();
        const unmountCalls = (bridge.mountSettingsPanel as any).mock.calls;
        expect(unmountCalls.some((call: [unknown]) => call[0] === null)).toBe(true);

        rendered.queryClient.cancelQueries();
        rendered.queryClient.clear();
        (rendered.queryClient as { destroy?: () => void }).destroy?.();
        rendered.container.remove();
    });

    test('supports relay detail deep-link and back navigation', async () => {
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

        const rendered = await renderSettingsRoute('/relays/detail?url=wss%3A%2F%2Frelay.one&source=configured&type=nip65Both');
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Detalles del relay');
        expect(rendered.container.textContent || '').toContain('wss://relay.one');

        const backButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'Volver'
        ) as HTMLButtonElement;
        expect(backButton).toBeDefined();

        await act(async () => {
            backButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(rendered.container.textContent || '').toContain('Relays configurados');
    });

    test('redirects invalid relay detail query params back to relays', async () => {
        const rendered = await renderSettingsRoute('/relays/detail?foo=bar');
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Relays configurados');
    });
});
