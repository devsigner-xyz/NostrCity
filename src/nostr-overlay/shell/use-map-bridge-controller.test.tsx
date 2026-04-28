import { type ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { MapBridge } from '../map-bridge';
import { useMapBridgeController } from './use-map-bridge-controller';

interface RenderResult {
    root: Root;
    container: HTMLDivElement;
}

function createMapBridgeStub(): MapBridge {
    return {
        ensureGenerated: vi.fn().mockResolvedValue(undefined),
        regenerateMap: vi.fn().mockResolvedValue(undefined),
        listBuildings: vi.fn().mockReturnValue([]),
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
    };
}

async function render(element: ReactNode): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(element);
    });

    return { root, container };
}

async function rerender(root: Root, element: ReactNode): Promise<void> {
    await act(async () => {
        root.render(element);
    });
}

async function unmount(rendered: RenderResult): Promise<void> {
    await act(async () => {
        rendered.root.unmount();
    });
    rendered.container.remove();
}

function ControllerHarness(props: Parameters<typeof useMapBridgeController>[0] & {
    onReady?: (controller: ReturnType<typeof useMapBridgeController>) => void;
}) {
    const controller = useMapBridgeController(props);
    props.onReady?.(controller);
    return null;
}

describe('useMapBridgeController', () => {
    const mounted: RenderResult[] = [];

    beforeAll(() => {
        (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    });

    afterEach(async () => {
        while (mounted.length > 0) {
            const rendered = mounted.pop();
            if (rendered) {
                await unmount(rendered);
            }
        }
    });

    test('applies generated map display targets to the bridge and resets viewport inset on cleanup', async () => {
        const bridge = createMapBridgeStub();
        const rendered = await render(
            <ControllerHarness
                mapBridge={bridge}
                viewportInsetLeft={380}
                showLoginGate={false}
                streetLabelsEnabled={true}
                streetLabelsZoomLevel={3}
                streetLabelUsernames={['alice', 'bob']}
                trafficParticlesCount={12}
                trafficParticlesSpeed={1.25}
                verifiedBuildingIndexes={[2, 5]}
            />
        );
        mounted.push(rendered);

        expect(bridge.setViewportInsetLeft).toHaveBeenLastCalledWith(380);
        expect(bridge.setStreetLabelsEnabled).toHaveBeenLastCalledWith(true);
        expect(bridge.setStreetLabelsZoomLevel).toHaveBeenLastCalledWith(3);
        expect(bridge.setStreetLabelUsernames).toHaveBeenLastCalledWith(['alice', 'bob']);
        expect(bridge.setTrafficParticlesCount).toHaveBeenLastCalledWith(12);
        expect(bridge.setTrafficParticlesSpeed).toHaveBeenLastCalledWith(1.25);
        expect(bridge.setVerifiedBuildingIndexes).toHaveBeenLastCalledWith([2, 5]);

        await rerender(
            rendered.root,
            <ControllerHarness
                mapBridge={bridge}
                viewportInsetLeft={380}
                showLoginGate={false}
                streetLabelsEnabled={true}
                streetLabelsZoomLevel={3}
                streetLabelUsernames={['carol']}
                trafficParticlesCount={18}
                trafficParticlesSpeed={1.5}
                verifiedBuildingIndexes={[8]}
            />
        );

        expect(bridge.setStreetLabelUsernames).toHaveBeenLastCalledWith(['carol']);
        expect(bridge.setTrafficParticlesCount).toHaveBeenLastCalledWith(18);
        expect(bridge.setTrafficParticlesSpeed).toHaveBeenLastCalledWith(1.5);
        expect(bridge.setVerifiedBuildingIndexes).toHaveBeenLastCalledWith([8]);

        await unmount(mounted.pop()!);

        expect(bridge.setViewportInsetLeft).toHaveBeenLastCalledWith(0);
    });

    test('focuses a requested building through the bridge', async () => {
        const bridge = createMapBridgeStub();
        let controller: ReturnType<typeof useMapBridgeController> | undefined;
        const rendered = await render(
            <ControllerHarness
                mapBridge={bridge}
                viewportInsetLeft={0}
                showLoginGate={false}
                streetLabelsEnabled={false}
                streetLabelsZoomLevel={2}
                streetLabelUsernames={[]}
                trafficParticlesCount={0}
                trafficParticlesSpeed={1}
                verifiedBuildingIndexes={[]}
                onReady={(nextController) => {
                    controller = nextController;
                }}
            />
        );
        mounted.push(rendered);

        controller?.focusBuilding(7);

        expect(bridge.focusBuilding).toHaveBeenCalledWith(7);
    });

    test('focus action uses the latest map bridge after rerender', async () => {
        const firstBridge = createMapBridgeStub();
        const secondBridge = createMapBridgeStub();
        let controller: ReturnType<typeof useMapBridgeController> | undefined;
        const baseProps = {
            viewportInsetLeft: 0,
            showLoginGate: false,
            streetLabelsEnabled: false,
            streetLabelsZoomLevel: 2,
            streetLabelUsernames: [],
            trafficParticlesCount: 0,
            trafficParticlesSpeed: 1,
            verifiedBuildingIndexes: [],
            onReady: (nextController: ReturnType<typeof useMapBridgeController>) => {
                controller = nextController;
            },
        };
        const rendered = await render(
            <ControllerHarness {...baseProps} mapBridge={firstBridge} />
        );
        mounted.push(rendered);

        controller?.focusBuilding(3);
        expect(firstBridge.focusBuilding).toHaveBeenLastCalledWith(3);

        await rerender(rendered.root, <ControllerHarness {...baseProps} mapBridge={secondBridge} />);

        controller?.focusBuilding(9);
        expect(secondBridge.focusBuilding).toHaveBeenLastCalledWith(9);
        expect(firstBridge.focusBuilding).not.toHaveBeenCalledWith(9);
    });

    test('ignores focus requests when there is no map bridge', async () => {
        const bridge = createMapBridgeStub();
        let controller: ReturnType<typeof useMapBridgeController> | undefined;
        const rendered = await render(
            <ControllerHarness
                mapBridge={null}
                viewportInsetLeft={0}
                showLoginGate={false}
                streetLabelsEnabled={false}
                streetLabelsZoomLevel={2}
                streetLabelUsernames={[]}
                trafficParticlesCount={0}
                trafficParticlesSpeed={1}
                verifiedBuildingIndexes={[]}
                onReady={(nextController) => {
                    controller = nextController;
                }}
            />
        );
        mounted.push(rendered);

        controller?.focusBuilding(3);
        expect(bridge.focusBuilding).not.toHaveBeenCalled();
    });
});
