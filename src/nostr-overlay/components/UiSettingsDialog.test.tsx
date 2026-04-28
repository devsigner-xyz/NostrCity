import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { getDefaultUiSettings } from '../../nostr/ui-settings';
import type { MapBridge } from '../map-bridge';
import { UiSettingsDialog } from './UiSettingsDialog';

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

function createMapBridgeStub(): MapBridge {
    return {
        ensureGenerated: vi.fn().mockResolvedValue(undefined),
        regenerateMap: vi.fn().mockResolvedValue(undefined),
        listBuildings: vi.fn().mockReturnValue([]),
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
        worldToScreen: vi.fn().mockImplementation((point) => point),
        getViewportInsetLeft: vi.fn().mockReturnValue(0),
        onMapGenerated: vi.fn().mockReturnValue(() => {}),
        onOccupiedBuildingClick: vi.fn().mockReturnValue(() => {}),
        onOccupiedBuildingContextMenu: vi.fn().mockReturnValue(() => {}),
        onViewChanged: vi.fn().mockReturnValue(() => {}),
    };
}

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted = [];
});

describe('UiSettingsDialog', () => {
    test('uses a wider constrained scrollable dialog surface', async () => {
        const rendered = await renderElement(
            <UiSettingsDialog
                open
                uiSettings={getDefaultUiSettings()}
                onPersistUiSettings={vi.fn()}
                onOpenChange={vi.fn()}
            />
        );
        mounted.push(rendered);

        const content = document.body.querySelector('[data-slot="dialog-content"]') as HTMLElement | null;
        expect(content).not.toBeNull();
        expect(content?.className).toContain('nostr-settings-dialog');
        expect(content?.className).toContain('nostr-settings-dialog-ui');
        expect(content?.className).not.toContain('max-w-xl');
    });

    test('uses an unblurred overlay so the map remains visible behind it', async () => {
        const rendered = await renderElement(
            <UiSettingsDialog
                open
                uiSettings={getDefaultUiSettings()}
                onPersistUiSettings={vi.fn()}
                onOpenChange={vi.fn()}
            />
        );
        mounted.push(rendered);

        const overlay = document.body.querySelector('[data-slot="dialog-overlay"]') as HTMLElement | null;
        expect(overlay?.className).toContain('nostr-settings-dialog-overlay-clear');
    });

    test('shows the map preset selector from the map bridge', async () => {
        const rendered = await renderElement(
            <UiSettingsDialog
                open
                uiSettings={getDefaultUiSettings()}
                onPersistUiSettings={vi.fn()}
                onOpenChange={vi.fn()}
                mapBridge={createMapBridgeStub()}
            />
        );
        mounted.push(rendered);

        const content = document.body.querySelector('[data-slot="dialog-content"]') as HTMLElement | null;
        expect(content?.textContent || '').toContain('Preset del mapa');
        expect(content?.textContent || '').toContain('Nostr City Light');
    });
});
