import type { EasterEggId } from '../ts/ui/easter_eggs';
import type { MapGenerationOptions } from '../map-generation-options';

export interface WorldPoint {
    x: number;
    y: number;
}

export interface MapBuildingSlot {
    index: number;
    centroid: WorldPoint;
}

export interface OccupiedBuildingContextPayload {
    buildingIndex: number;
    pubkey: string;
    clientX: number;
    clientY: number;
}

export interface EasterEggBuildingClickPayload {
    buildingIndex: number;
    easterEggId: EasterEggId;
}

export interface EasterEggBuildingSlot {
    index: number;
    easterEggId: EasterEggId;
}

export interface MapMainApi {
    generateMap(options?: MapGenerationOptions): Promise<void> | void;
    roadsEmpty(): boolean;
    getBuildingCentroidsWorld(): WorldPoint[];
    getEasterEggBuildings?(): EasterEggBuildingSlot[];
    setOccupancyByBuildingIndex(byBuildingIndex: Record<number, string>): void;
    setVerifiedBuildingIndexes?(indexes: number[]): void;
    setViewportInsetLeft(inset: number): void;
    setSelectedBuildingIndex(index?: number): void;
    setDialogHighlightedBuildingIndex(index?: number): void;
    setStreetLabelsEnabled?(enabled: boolean): void;
    setStreetLabelsZoomLevel?(level: number): void;
    setStreetLabelUsernames?(usernames: string[]): void;
    setTrafficParticlesCount?(count: number): void;
    setTrafficParticlesSpeed?(speed: number): void;
    setColourScheme?(scheme: string): void;
    getColourScheme?(): string;
    getColourSchemes?(): string[];
    mountSettingsPanel(container: HTMLElement | null): void;
    focusBuilding(index: number): boolean | void;
    getParkCount(): number;
    getZoom(): number;
    setZoom?(zoom: number): void;
    worldToScreen(point: WorldPoint): WorldPoint;
    getViewportInsetLeft(): number;
    subscribeMapGenerated?(listener: () => void): (() => void) | void;
    subscribeOccupiedBuildingClick?(listener: (payload: { buildingIndex: number; pubkey: string }) => void): (() => void) | void;
    subscribeOccupiedBuildingContextMenu?(listener: (payload: OccupiedBuildingContextPayload) => void): (() => void) | void;
    subscribeEasterEggBuildingClick?(listener: (payload: EasterEggBuildingClickPayload) => void): (() => void) | void;
    subscribeViewChanged?(listener: () => void): (() => void) | void;
}

export interface MapBridge {
    ensureGenerated(): Promise<void>;
    regenerateMap(options?: MapGenerationOptions): Promise<void>;
    listBuildings(): MapBuildingSlot[];
    listEasterEggBuildings?(): EasterEggBuildingSlot[];
    applyOccupancy(input: { byBuildingIndex: Record<number, string>; selectedBuildingIndex?: number }): void;
    setViewportInsetLeft(inset: number): void;
    setVerifiedBuildingIndexes(indexes: number[]): void;
    setDialogBuildingHighlight(index?: number): void;
    setStreetLabelsEnabled(enabled: boolean): void;
    setStreetLabelsZoomLevel(level: number): void;
    setStreetLabelUsernames(usernames: string[]): void;
    setTrafficParticlesCount(count: number): void;
    setTrafficParticlesSpeed(speed: number): void;
    setColourScheme?(scheme: string): void;
    getColourScheme?(): string | undefined;
    listColourSchemes?(): string[];
    mountSettingsPanel(container: HTMLElement | null): void;
    focusBuilding(index: number): void;
    getParkCount(): number;
    getZoom(): number;
    setZoom?(zoom: number): void;
    worldToScreen(point: WorldPoint): WorldPoint;
    getViewportInsetLeft(): number;
    onMapGenerated(listener: () => void): () => void;
    onOccupiedBuildingClick(listener: (payload: { buildingIndex: number; pubkey: string }) => void): () => void;
    onOccupiedBuildingContextMenu(listener: (payload: OccupiedBuildingContextPayload) => void): () => void;
    onEasterEggBuildingClick?(listener: (payload: EasterEggBuildingClickPayload) => void): () => void;
    onViewChanged(listener: () => void): () => void;
}

export function createMapBridge(mainApi: MapMainApi): MapBridge {
    return {
        async ensureGenerated(): Promise<void> {
            if (mainApi.roadsEmpty()) {
                await Promise.resolve(mainApi.generateMap(undefined));
            }
        },

        async regenerateMap(options?: MapGenerationOptions): Promise<void> {
            await Promise.resolve(mainApi.generateMap(options));
        },

        listBuildings(): MapBuildingSlot[] {
            return mainApi.getBuildingCentroidsWorld().map((centroid, index) => ({
                index,
                centroid: {
                    x: centroid.x,
                    y: centroid.y,
                },
            }));
        },

        listEasterEggBuildings(): EasterEggBuildingSlot[] {
            const slots = mainApi.getEasterEggBuildings?.() ?? [];
            return slots
                .filter((slot) => Number.isInteger(slot.index) && slot.index >= 0)
                .sort((left, right) => left.index - right.index)
                .map((slot) => ({
                    index: slot.index,
                    easterEggId: slot.easterEggId,
                }));
        },

        applyOccupancy(input: { byBuildingIndex: Record<number, string>; selectedBuildingIndex?: number }): void {
            mainApi.setOccupancyByBuildingIndex(input.byBuildingIndex);
            mainApi.setSelectedBuildingIndex(input.selectedBuildingIndex);
        },

        setViewportInsetLeft(inset: number): void {
            mainApi.setViewportInsetLeft(inset);
        },

        setVerifiedBuildingIndexes(indexes: number[]): void {
            mainApi.setVerifiedBuildingIndexes?.(indexes);
        },

        setDialogBuildingHighlight(index?: number): void {
            mainApi.setDialogHighlightedBuildingIndex(index);
        },

        setStreetLabelsEnabled(enabled: boolean): void {
            mainApi.setStreetLabelsEnabled?.(enabled);
        },

        setStreetLabelsZoomLevel(level: number): void {
            mainApi.setStreetLabelsZoomLevel?.(level);
        },

        setStreetLabelUsernames(usernames: string[]): void {
            mainApi.setStreetLabelUsernames?.(usernames);
        },

        setTrafficParticlesCount(count: number): void {
            mainApi.setTrafficParticlesCount?.(count);
        },

        setTrafficParticlesSpeed(speed: number): void {
            mainApi.setTrafficParticlesSpeed?.(speed);
        },

        setColourScheme(scheme: string): void {
            mainApi.setColourScheme?.(scheme);
        },

        getColourScheme(): string | undefined {
            return mainApi.getColourScheme?.();
        },

        listColourSchemes(): string[] {
            return mainApi.getColourSchemes?.() ?? [];
        },

        mountSettingsPanel(container: HTMLElement | null): void {
            mainApi.mountSettingsPanel(container);
        },

        focusBuilding(index: number): void {
            mainApi.focusBuilding(index);
        },

        getParkCount(): number {
            return mainApi.getParkCount();
        },

        getZoom(): number {
            return mainApi.getZoom();
        },

        setZoom(zoom: number): void {
            mainApi.setZoom?.(zoom);
        },

        worldToScreen(point: WorldPoint): WorldPoint {
            return mainApi.worldToScreen(point);
        },

        getViewportInsetLeft(): number {
            return mainApi.getViewportInsetLeft();
        },

        onMapGenerated(listener: () => void): () => void {
            if (!mainApi.subscribeMapGenerated) {
                return () => {};
            }

            const maybeUnsubscribe = mainApi.subscribeMapGenerated(listener);
            if (typeof maybeUnsubscribe === 'function') {
                return maybeUnsubscribe;
            }

            return () => {};
        },

        onOccupiedBuildingClick(listener: (payload: { buildingIndex: number; pubkey: string }) => void): () => void {
            if (!mainApi.subscribeOccupiedBuildingClick) {
                return () => {};
            }

            const maybeUnsubscribe = mainApi.subscribeOccupiedBuildingClick(listener);
            if (typeof maybeUnsubscribe === 'function') {
                return maybeUnsubscribe;
            }

            return () => {};
        },

        onOccupiedBuildingContextMenu(listener: (payload: OccupiedBuildingContextPayload) => void): () => void {
            if (!mainApi.subscribeOccupiedBuildingContextMenu) {
                return () => {};
            }

            const maybeUnsubscribe = mainApi.subscribeOccupiedBuildingContextMenu(listener);
            if (typeof maybeUnsubscribe === 'function') {
                return maybeUnsubscribe;
            }

            return () => {};
        },

        onEasterEggBuildingClick(listener: (payload: EasterEggBuildingClickPayload) => void): () => void {
            if (!mainApi.subscribeEasterEggBuildingClick) {
                return () => {};
            }

            const maybeUnsubscribe = mainApi.subscribeEasterEggBuildingClick(listener);
            if (typeof maybeUnsubscribe === 'function') {
                return maybeUnsubscribe;
            }

            return () => {};
        },

        onViewChanged(listener: () => void): () => void {
            if (!mainApi.subscribeViewChanged) {
                return () => {};
            }

            const maybeUnsubscribe = mainApi.subscribeViewChanged(listener);
            if (typeof maybeUnsubscribe === 'function') {
                return maybeUnsubscribe;
            }

            return () => {};
        },
    };
}

declare global {
    interface Window {
        mapGeneratorMain?: MapMainApi;
    }
}

export function createWindowMapBridge(win: Window = window): MapBridge | null {
    if (!win.mapGeneratorMain) {
        return null;
    }

    return createMapBridge(win.mapGeneratorMain);
}
