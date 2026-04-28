import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { MapBridge, OccupiedBuildingContextPayload } from '../map-bridge';
import { OverlayMapInteractionLayer } from './OverlayMapInteractionLayer';

interface RenderResult {
    root: Root;
    container: HTMLDivElement;
}

interface MapBridgeStub {
    bridge: MapBridge;
    triggerOccupiedBuildingContextMenu: (payload: OccupiedBuildingContextPayload) => void;
}

const FOLLOWED_PUBKEY = 'a'.repeat(64);

function createMapBridgeStub(): MapBridgeStub {
    const occupiedContextMenuListeners: Array<(payload: OccupiedBuildingContextPayload) => void> = [];

    const bridge: MapBridge = {
        ensureGenerated: vi.fn().mockResolvedValue(undefined),
        regenerateMap: vi.fn().mockResolvedValue(undefined),
        listBuildings: vi.fn().mockReturnValue([]),
        listEasterEggBuildings: vi.fn().mockReturnValue([]),
        applyOccupancy: vi.fn(),
        setViewportInsetLeft: vi.fn(),
        setVerifiedBuildingIndexes: vi.fn(),
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
        getZoom: vi.fn().mockReturnValue(1),
        setZoom: vi.fn(),
        worldToScreen: vi.fn().mockImplementation((point) => point),
        getViewportInsetLeft: vi.fn().mockReturnValue(0),
        onMapGenerated: vi.fn().mockReturnValue(() => {}),
        onOccupiedBuildingClick: vi.fn().mockReturnValue(() => {}),
        onOccupiedBuildingContextMenu: vi.fn().mockImplementation((listener: (payload: OccupiedBuildingContextPayload) => void) => {
            occupiedContextMenuListeners.push(listener);
            return () => {
                const index = occupiedContextMenuListeners.indexOf(listener);
                if (index >= 0) {
                    occupiedContextMenuListeners.splice(index, 1);
                }
            };
        }),
        onEasterEggBuildingClick: vi.fn().mockReturnValue(() => {}),
        onViewChanged: vi.fn().mockReturnValue(() => {}),
    };

    return {
        bridge,
        triggerOccupiedBuildingContextMenu: (payload) => {
            occupiedContextMenuListeners.forEach((listener) => listener(payload));
        },
    };
}

function createDefaultProps(overrides: Partial<ComponentProps<typeof OverlayMapInteractionLayer>> = {}): ComponentProps<typeof OverlayMapInteractionLayer> {
    const { bridge } = createMapBridgeStub();

    return {
        mapBridge: bridge,
        isMapRoute: true,
        showLoginGate: false,
        viewportInsetLeft: 320,
        resolvedOverlayTheme: 'light',
        mapLoaderText: null,
        language: 'es',
        streetLabelsEnabled: true,
        streetLabelsZoomLevel: 2,
        streetLabelUsernames: [],
        trafficParticlesCount: 12,
        trafficParticlesSpeed: 1,
        verifiedBuildingIndexes: [],
        specialMarkersEnabled: true,
        profiles: {},
        followerProfiles: {},
        canWrite: false,
        canAccessDirectMessages: false,
        zapAmounts: [21, 128, 256],
        onRegenerateMap: vi.fn(),
        onThemeChange: vi.fn(),
        onCarsEnabledChange: vi.fn(),
        onStreetLabelsEnabledChange: vi.fn(),
        onSpecialMarkersEnabledChange: vi.fn(),
        onCopyNpub: vi.fn(),
        onOpenDirectMessage: vi.fn(),
        onOpenProfile: vi.fn(),
        onRequestZapPayment: vi.fn().mockResolvedValue(undefined),
        onConfigureZapAmounts: vi.fn(),
        ...overrides,
    };
}

async function renderLayer(props: ComponentProps<typeof OverlayMapInteractionLayer>): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(<OverlayMapInteractionLayer {...props} />);
    });

    return { root, container };
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

async function openMapContextMenu(stub: MapBridgeStub, pubkey = FOLLOWED_PUBKEY): Promise<void> {
    await act(async () => {
        stub.triggerOccupiedBuildingContextMenu({
            buildingIndex: 2,
            pubkey,
            clientX: 320,
            clientY: 240,
        });
    });

    await waitFor(() => (document.body.textContent || '').includes('Copiar npub'));
}

async function openZapSubmenu(): Promise<void> {
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
}

async function clickContextMenuItem(label: string): Promise<void> {
    await waitFor(() => Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).some((node) =>
        (node.textContent || '').trim() === label
    ));

    const item = Array.from(document.body.querySelectorAll('[data-slot="context-menu-item"]')).find((node) =>
        (node.textContent || '').trim() === label
    ) as HTMLElement;

    await act(async () => {
        item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

describe('OverlayMapInteractionLayer', () => {
    const mounted: RenderResult[] = [];

    beforeAll(() => {
        (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    });

    afterEach(async () => {
        while (mounted.length > 0) {
            const rendered = mounted.pop();
            if (rendered) {
                await act(async () => {
                    rendered.root.unmount();
                });
                rendered.container.remove();
            }
        }
        document.body.replaceChildren();
        window.localStorage.clear();
    });

    test('renders map controls only on the authenticated map route', async () => {
        const rendered = await renderLayer(createDefaultProps());
        mounted.push(rendered);

        expect(rendered.container.querySelector('.nostr-map-zoom-controls')).not.toBeNull();
        expect(rendered.container.querySelector('.nostr-map-display-controls')).not.toBeNull();
    });

    test('hides map controls away from the map route', async () => {
        const rendered = await renderLayer(createDefaultProps({ isMapRoute: false }));
        mounted.push(rendered);

        expect(rendered.container.querySelector('.nostr-map-zoom-controls')).toBeNull();
        expect(rendered.container.querySelector('.nostr-map-display-controls')).toBeNull();
    });

    test('hides map controls while the login gate is visible', async () => {
        const rendered = await renderLayer(createDefaultProps({ showLoginGate: true }));
        mounted.push(rendered);

        expect(rendered.container.querySelector('.nostr-map-zoom-controls')).toBeNull();
        expect(rendered.container.querySelector('.nostr-map-display-controls')).toBeNull();
    });

    test('applies map bridge display settings and resets viewport inset on cleanup', async () => {
        const stub = createMapBridgeStub();
        const rendered = await renderLayer(createDefaultProps({
            mapBridge: stub.bridge,
            viewportInsetLeft: 320,
            streetLabelUsernames: ['alice', 'bob'],
            verifiedBuildingIndexes: [2, 5],
        }));
        mounted.push(rendered);

        expect(stub.bridge.setViewportInsetLeft).toHaveBeenLastCalledWith(320);
        expect(stub.bridge.setStreetLabelsEnabled).toHaveBeenLastCalledWith(true);
        expect(stub.bridge.setStreetLabelsZoomLevel).toHaveBeenLastCalledWith(2);
        expect(stub.bridge.setStreetLabelUsernames).toHaveBeenLastCalledWith(['alice', 'bob']);
        expect(stub.bridge.setTrafficParticlesCount).toHaveBeenLastCalledWith(12);
        expect(stub.bridge.setTrafficParticlesSpeed).toHaveBeenLastCalledWith(1);
        expect(stub.bridge.setVerifiedBuildingIndexes).toHaveBeenLastCalledWith([2, 5]);
        expect(stub.bridge.setColourScheme).toHaveBeenLastCalledWith('Nostr City Light');

        await act(async () => {
            rendered.root.unmount();
        });
        rendered.container.remove();
        mounted.pop();

        expect(stub.bridge.setViewportInsetLeft).toHaveBeenLastCalledWith(0);
    });

    test('renders loader status only outside the login gate', async () => {
        const rendered = await renderLayer(createDefaultProps({ mapLoaderText: 'Construyendo mapa...' }));
        mounted.push(rendered);

        const status = rendered.container.querySelector('[role="status"]');
        expect(status).not.toBeNull();
        expect(status?.getAttribute('aria-live')).toBe('polite');
        expect(status?.textContent || '').toContain('Construyendo mapa...');
    });

    test('does not render loader without loader text or while the login gate is visible', async () => {
        const withoutText = await renderLayer(createDefaultProps({ mapLoaderText: null }));
        mounted.push(withoutText);
        expect(withoutText.container.querySelector('[role="status"]')).toBeNull();

        const withLoginGate = await renderLayer(createDefaultProps({ mapLoaderText: 'Construyendo mapa...', showLoginGate: true }));
        mounted.push(withLoginGate);
        expect(withLoginGate.container.querySelector('[role="status"]')).toBeNull();
    });

    test('opens occupied-building context menu and runs copy/detail actions', async () => {
        const stub = createMapBridgeStub();
        const onCopyNpub = vi.fn();
        const onOpenProfile = vi.fn();
        const rendered = await renderLayer(createDefaultProps({
            mapBridge: stub.bridge,
            profiles: {
                [FOLLOWED_PUBKEY]: { pubkey: FOLLOWED_PUBKEY, displayName: 'Alice' },
            },
            onCopyNpub,
            onOpenProfile,
        }));
        mounted.push(rendered);

        await openMapContextMenu(stub);
        expect(document.body.textContent || '').toContain('Ver detalles');

        await clickContextMenuItem('Copiar npub');
        expect(onCopyNpub).toHaveBeenCalledTimes(1);
        expect(onCopyNpub.mock.calls[0]?.[0]).toMatch(/^npub1/);

        await openMapContextMenu(stub);
        await clickContextMenuItem('Ver detalles');
        expect(onOpenProfile).toHaveBeenCalledWith(FOLLOWED_PUBKEY, 2);
    });

    test('ignores occupied-building context menu while the login gate is visible', async () => {
        const stub = createMapBridgeStub();
        const rendered = await renderLayer(createDefaultProps({ mapBridge: stub.bridge, showLoginGate: true }));
        mounted.push(rendered);

        await act(async () => {
            stub.triggerOccupiedBuildingContextMenu({
                buildingIndex: 2,
                pubkey: FOLLOWED_PUBKEY,
                clientX: 320,
                clientY: 240,
            });
        });

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(document.body.querySelector('.nostr-context-anchor')).toBeNull();
        expect(document.body.textContent || '').not.toContain('Copiar npub');
    });

    test('shows direct message context action only when direct messages are available', async () => {
        const unavailableStub = createMapBridgeStub();
        const unavailable = await renderLayer(createDefaultProps({ mapBridge: unavailableStub.bridge }));
        mounted.push(unavailable);

        await openMapContextMenu(unavailableStub);
        expect(document.body.textContent || '').not.toContain('Enviar mensaje');

        const availableStub = createMapBridgeStub();
        const onOpenDirectMessage = vi.fn();
        const available = await renderLayer(createDefaultProps({
            mapBridge: availableStub.bridge,
            canAccessDirectMessages: true,
            onOpenDirectMessage,
        }));
        mounted.push(available);

        await openMapContextMenu(availableStub);
        await clickContextMenuItem('Enviar mensaje');
        expect(onOpenDirectMessage).toHaveBeenCalledWith(FOLLOWED_PUBKEY);
    });

    test('shows zap submenu only for writable zap-capable profiles', async () => {
        const stub = createMapBridgeStub();
        const rendered = await renderLayer(createDefaultProps({
            mapBridge: stub.bridge,
            canWrite: true,
            profiles: {
                [FOLLOWED_PUBKEY]: { pubkey: FOLLOWED_PUBKEY, displayName: 'Alice', lud16: 'alice@example.com' },
            },
            zapAmounts: [21, 128],
        }));
        mounted.push(rendered);

        await openMapContextMenu(stub);
        await openZapSubmenu();

        await waitFor(() => (document.body.textContent || '').includes('21 sats'));
        expect(document.body.textContent || '').toContain('128 sats');
    });

    test('runs zap payment and configure actions from the zap submenu', async () => {
        const stub = createMapBridgeStub();
        const onRequestZapPayment = vi.fn().mockResolvedValue(undefined);
        const onConfigureZapAmounts = vi.fn();
        const rendered = await renderLayer(createDefaultProps({
            mapBridge: stub.bridge,
            canWrite: true,
            profiles: {
                [FOLLOWED_PUBKEY]: { pubkey: FOLLOWED_PUBKEY, displayName: 'Alice', lud16: 'alice@example.com' },
            },
            zapAmounts: [21],
            onRequestZapPayment,
            onConfigureZapAmounts,
        }));
        mounted.push(rendered);

        await openMapContextMenu(stub);
        await openZapSubmenu();
        await clickContextMenuItem('21 sats');

        expect(onRequestZapPayment).toHaveBeenCalledWith({ targetPubkey: FOLLOWED_PUBKEY, amount: 21 });

        await openMapContextMenu(stub);
        await openZapSubmenu();
        await clickContextMenuItem('Configurar cantidades');

        expect(onConfigureZapAmounts).toHaveBeenCalledTimes(1);
    });

    test('hides zap submenu without write access or zap endpoint', async () => {
        const noWriteStub = createMapBridgeStub();
        const noWrite = await renderLayer(createDefaultProps({
            mapBridge: noWriteStub.bridge,
            canWrite: false,
            profiles: {
                [FOLLOWED_PUBKEY]: { pubkey: FOLLOWED_PUBKEY, displayName: 'Alice', lud16: 'alice@example.com' },
            },
        }));
        mounted.push(noWrite);

        await openMapContextMenu(noWriteStub);
        expect(document.body.textContent || '').not.toContain('Zap');

        const noEndpointStub = createMapBridgeStub();
        const noEndpoint = await renderLayer(createDefaultProps({
            mapBridge: noEndpointStub.bridge,
            canWrite: true,
            profiles: {
                [FOLLOWED_PUBKEY]: { pubkey: FOLLOWED_PUBKEY, displayName: 'Alice' },
            },
        }));
        mounted.push(noEndpoint);

        await openMapContextMenu(noEndpointStub);
        expect(document.body.textContent || '').not.toContain('Zap');
    });

});
