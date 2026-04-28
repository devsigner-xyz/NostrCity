import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NostrProfile } from '../../nostr/types';
import type { EasterEggId } from '../../ts/ui/easter_eggs';
import type { EasterEggBuildingSlot, MapBridge, MapBuildingSlot } from '../map-bridge';
import { useI18n } from '@/i18n/useI18n';
import { buildDiscoveredEasterEggEntries, buildPresenceLayerEntries, isPointWithinViewport } from '../domain/presence-layer-model';
import { getEasterEggEntry } from '../easter-eggs/catalog';
import { MapPinIcon, StarIcon } from 'lucide-react';

interface MapPresenceLayerProps {
    mapBridge: MapBridge | null;
    occupancyByBuildingIndex: Record<number, string>;
    discoveredEasterEggIds: EasterEggId[];
    profiles: Record<string, NostrProfile>;
    ownerPubkey?: string;
    ownerProfile?: NostrProfile;
    ownerBuildingIndex?: number;
    occupiedLabelsZoomLevel: number;
    alwaysVisiblePubkeys?: string[];
    specialMarkersEnabled?: boolean;
}

const EMPTY_ALWAYS_VISIBLE_PUBKEYS: string[] = [];

function areBuildingSlotsEqual(left: MapBuildingSlot[], right: MapBuildingSlot[]): boolean {
    if (left.length !== right.length) {
        return false;
    }

    for (let index = 0; index < left.length; index += 1) {
        const leftBuilding = left[index];
        const rightBuilding = right[index];
        if (!leftBuilding || !rightBuilding) {
            return false;
        }

        if (
            leftBuilding.index !== rightBuilding.index
            || leftBuilding.centroid.x !== rightBuilding.centroid.x
            || leftBuilding.centroid.y !== rightBuilding.centroid.y
        ) {
            return false;
        }
    }

    return true;
}

function areEasterEggBuildingSlotsEqual(left: EasterEggBuildingSlot[], right: EasterEggBuildingSlot[]): boolean {
    if (left.length !== right.length) {
        return false;
    }

    for (let index = 0; index < left.length; index += 1) {
        const leftSlot = left[index];
        const rightSlot = right[index];
        if (!leftSlot || !rightSlot) {
            return false;
        }

        if (leftSlot.index !== rightSlot.index || leftSlot.easterEggId !== rightSlot.easterEggId) {
            return false;
        }
    }

    return true;
}

export function MapPresenceLayer({
    mapBridge,
    occupancyByBuildingIndex,
    discoveredEasterEggIds,
    profiles,
    ownerPubkey,
    ownerBuildingIndex,
    occupiedLabelsZoomLevel,
    alwaysVisiblePubkeys = EMPTY_ALWAYS_VISIBLE_PUBKEYS,
    specialMarkersEnabled = true,
}: MapPresenceLayerProps) {
    const { t } = useI18n();
    const VIEWPORT_MARGIN_PX = 42;
    const [buildings, setBuildings] = useState<MapBuildingSlot[]>([]);
    const [easterEggBuildings, setEasterEggBuildings] = useState<EasterEggBuildingSlot[]>([]);
    const [viewState, setViewState] = useState({
        zoom: 0,
        insetLeft: 0,
    });
    const pendingFrameRef = useRef<number | null>(null);
    const occupantRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const easterEggRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const ownerRef = useRef<HTMLDivElement | null>(null);

    const buildingsByIndex = useMemo(() => {
        const byIndex: Record<number, MapBuildingSlot> = {};
        for (const building of buildings) {
            byIndex[building.index] = building;
        }
        return byIndex;
    }, [buildings]);

    const ownerBuilding = ownerBuildingIndex === undefined ? undefined : buildingsByIndex[ownerBuildingIndex];
    const ownerPosition = ownerBuilding
        ? mapBridge?.worldToScreen(ownerBuilding.centroid) ?? null
        : null;

    const occupiedEntries = useMemo(() => buildPresenceLayerEntries({
        occupancyByBuildingIndex,
        profiles,
        buildingsByIndex,
        zoom: viewState.zoom,
        occupiedLabelsZoomLevel,
        alwaysVisiblePubkeys,
    }), [
        alwaysVisiblePubkeys,
        buildingsByIndex,
        occupancyByBuildingIndex,
        occupiedLabelsZoomLevel,
        profiles,
        viewState.zoom,
    ]);

    const discoveredEasterEggEntries = useMemo(() => buildDiscoveredEasterEggEntries({
        discoveredIds: discoveredEasterEggIds,
        easterEggBuildings,
        buildingsByIndex,
    }), [buildingsByIndex, discoveredEasterEggIds, easterEggBuildings]);

    const updateTagPositions = useCallback((): void => {
        if (!mapBridge) {
            return;
        }

        const insetLeft = mapBridge.getViewportInsetLeft();
        const viewportWidth = Math.max(0, window.innerWidth - insetLeft);
        const viewportHeight = Math.max(0, window.innerHeight);

        for (const entry of occupiedEntries) {
            const node = occupantRefs.current[entry.key];
            if (!node) {
                continue;
            }

            const screenPoint = mapBridge.worldToScreen(entry.centroid);
            node.style.left = `${screenPoint.x + insetLeft}px`;
            node.style.top = `${screenPoint.y}px`;
            node.style.display = isPointWithinViewport({
                point: screenPoint,
                viewportWidth,
                viewportHeight,
                marginPx: VIEWPORT_MARGIN_PX,
            }) ? '' : 'none';
        }

        for (const entry of discoveredEasterEggEntries) {
            const node = easterEggRefs.current[entry.key];
            if (!node) {
                continue;
            }

            const screenPoint = mapBridge.worldToScreen(entry.centroid);
            node.style.left = `${screenPoint.x + insetLeft}px`;
            node.style.top = `${screenPoint.y}px`;
            node.style.display = isPointWithinViewport({
                point: screenPoint,
                viewportWidth,
                viewportHeight,
                marginPx: VIEWPORT_MARGIN_PX,
            }) ? '' : 'none';
        }

        if (!ownerRef.current) {
            return;
        }

        if (!ownerBuilding || !ownerPubkey) {
            ownerRef.current.style.display = 'none';
            return;
        }

        const ownerScreenPoint = mapBridge.worldToScreen(ownerBuilding.centroid);
        ownerRef.current.style.left = `${ownerScreenPoint.x + insetLeft}px`;
        ownerRef.current.style.top = `${ownerScreenPoint.y}px`;
        ownerRef.current.style.display = '';
    }, [discoveredEasterEggEntries, mapBridge, occupiedEntries, ownerBuilding, ownerPubkey]);

    useEffect(() => {
        if (!mapBridge) {
            setBuildings([]);
            setEasterEggBuildings([]);
            setViewState({
                zoom: 0,
                insetLeft: 0,
            });
            return;
        }

        const refreshBuildings = (): void => {
            setBuildings((current) => {
                const next = mapBridge.listBuildings();
                return areBuildingSlotsEqual(current, next) ? current : next;
            });
            setEasterEggBuildings((current) => {
                const next = mapBridge.listEasterEggBuildings?.() ?? [];
                return areEasterEggBuildingSlotsEqual(current, next) ? current : next;
            });
        };

        const refreshView = (): void => {
            const zoom = mapBridge.getZoom();
            const insetLeft = mapBridge.getViewportInsetLeft();
            setViewState((current) => {
                if (current.zoom === zoom && current.insetLeft === insetLeft) {
                    return current;
                }
                return { zoom, insetLeft };
            });
        };

        const scheduleViewRefresh = (): void => {
            if (pendingFrameRef.current !== null) {
                return;
            }

            pendingFrameRef.current = window.requestAnimationFrame(() => {
                pendingFrameRef.current = null;
                refreshView();
                updateTagPositions();
            });
        };

        refreshBuildings();
        refreshView();
        scheduleViewRefresh();

        const offMapGenerated = mapBridge.onMapGenerated(() => {
            refreshBuildings();
            scheduleViewRefresh();
        });
        const offViewChanged = mapBridge.onViewChanged(scheduleViewRefresh);

        return () => {
            if (pendingFrameRef.current !== null) {
                window.cancelAnimationFrame(pendingFrameRef.current);
                pendingFrameRef.current = null;
            }
            offMapGenerated();
            offViewChanged();
        };
    }, [mapBridge, updateTagPositions]);

    useEffect(() => {
        const validKeys = new Set(occupiedEntries.map((entry) => entry.key));
        for (const key of Object.keys(occupantRefs.current)) {
            if (!validKeys.has(key)) {
                delete occupantRefs.current[key];
            }
        }
    }, [occupiedEntries]);

    useEffect(() => {
        const validKeys = new Set(discoveredEasterEggEntries.map((entry) => entry.key));
        for (const key of Object.keys(easterEggRefs.current)) {
            if (!validKeys.has(key)) {
                delete easterEggRefs.current[key];
            }
        }
    }, [discoveredEasterEggEntries]);

    useEffect(() => {
        if (!mapBridge) {
            return;
        }

        const frame = window.requestAnimationFrame(() => {
            updateTagPositions();
        });

        return () => {
            window.cancelAnimationFrame(frame);
        };
    }, [mapBridge, updateTagPositions]);

    if (!mapBridge) {
        return null;
    }

    return (
        <div
            className="nostr-map-presence-layer"
            aria-hidden="true"
            style={{
                clipPath: `inset(0 0 0 ${viewState.insetLeft}px)`,
            }}
        >
            {occupiedEntries.map((entry) => {
                const initialPosition = mapBridge.worldToScreen(entry.centroid);

                return (
                    <div
                        key={entry.key}
                        ref={(node) => {
                            occupantRefs.current[entry.key] = node;
                        }}
                        className={`nostr-map-occupant-tag${entry.displayName ? '' : ' nostr-map-occupant-tag-no-name'}`}
                        style={{
                            left: `${initialPosition.x + viewState.insetLeft}px`,
                            top: `${initialPosition.y}px`,
                        }}
                    >
                        {entry.picture ? (
                            <img className="nostr-map-occupant-avatar" src={entry.picture} alt="" />
                        ) : (
                            <span className="nostr-map-occupant-avatar nostr-map-occupant-avatar-fallback">
                                {entry.initials}
                            </span>
                        )}

                        {entry.displayName ? (
                            <span className="nostr-map-occupant-name">{entry.displayName}</span>
                        ) : null}
                    </div>
                );
            })}

            {specialMarkersEnabled ? discoveredEasterEggEntries.map((entry) => {
                const initialPosition = mapBridge.worldToScreen(entry.centroid);
                const easterEggTitle = getEasterEggEntry(entry.easterEggId).title;

                return (
                    <div
                        key={entry.key}
                        ref={(node) => {
                            easterEggRefs.current[entry.key] = node;
                        }}
                        className="nostr-map-icon-marker nostr-map-easter-egg-marker"
                        title={t('mapPresence.discoveredEasterEgg', { title: easterEggTitle })}
                        style={{
                            left: `${initialPosition.x + viewState.insetLeft}px`,
                            top: `${initialPosition.y}px`,
                        }}
                    >
                        <StarIcon />
                    </div>
                );
            }) : null}

            {ownerPosition && ownerPubkey ? (
                <div
                    ref={ownerRef}
                    className="nostr-map-icon-marker nostr-map-owner-marker"
                    style={{
                        left: `${ownerPosition.x + viewState.insetLeft}px`,
                        top: `${ownerPosition.y}px`,
                    }}
                >
                    <MapPinIcon />
                </div>
            ) : null}
        </div>
    );
}
