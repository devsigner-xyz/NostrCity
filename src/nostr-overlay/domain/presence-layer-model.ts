import type { NostrProfile } from '../../nostr/types';
import type { EasterEggBuildingSlot, MapBuildingSlot, WorldPoint } from '../map-bridge';
import type { EasterEggId } from '../../ts/ui/easter_eggs';

export interface PresenceLayerEntry {
    key: string;
    pubkey: string;
    index: number;
    centroid: WorldPoint;
    displayName?: string;
    initials: string;
    picture?: string;
}

export interface BuildPresenceLayerEntriesInput {
    occupancyByBuildingIndex: Record<number, string>;
    profiles: Record<string, NostrProfile>;
    buildingsByIndex: Record<number, MapBuildingSlot>;
    zoom: number;
    occupiedLabelsZoomLevel: number;
    alwaysVisiblePubkeys: string[];
}

export interface DiscoveredEasterEggEntry {
    key: string;
    easterEggId: EasterEggId;
    index: number;
    centroid: WorldPoint;
}

export interface BuildDiscoveredEasterEggEntriesInput {
    discoveredIds: EasterEggId[];
    easterEggBuildings: EasterEggBuildingSlot[];
    buildingsByIndex: Record<number, MapBuildingSlot>;
}

function sanitizeLabel(value: string | undefined): string | undefined {
    if (!value) {
        return undefined;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
}

function resolveDisplayName(profile?: NostrProfile): string | undefined {
    return sanitizeLabel(profile?.displayName) ?? sanitizeLabel(profile?.name);
}

function resolveName(pubkey: string, profile?: NostrProfile): string {
    return resolveDisplayName(profile) ?? `${pubkey.slice(0, 10)}...${pubkey.slice(-6)}`;
}

function resolveInitials(pubkey: string, profile?: NostrProfile): string {
    return resolveName(pubkey, profile).slice(0, 2).toUpperCase();
}

export function buildPresenceLayerEntries(input: BuildPresenceLayerEntriesInput): PresenceLayerEntry[] {
    const showOccupiedLabels = input.zoom >= input.occupiedLabelsZoomLevel;
    const alwaysVisiblePubkeys = new Set(input.alwaysVisiblePubkeys);
    const entries: PresenceLayerEntry[] = [];

    const occupancyEntries = Object.entries(input.occupancyByBuildingIndex)
        .map(([indexKey, pubkey]) => ({
            index: Number(indexKey),
            pubkey,
        }))
        .filter((entry) => Number.isInteger(entry.index) && entry.index >= 0)
        .sort((left, right) => left.index - right.index);

    for (const occupancyEntry of occupancyEntries) {
        if (!showOccupiedLabels && !alwaysVisiblePubkeys.has(occupancyEntry.pubkey)) {
            continue;
        }

        const building = input.buildingsByIndex[occupancyEntry.index];
        if (!building) {
            continue;
        }

        const profile = input.profiles[occupancyEntry.pubkey];
        const displayName = resolveDisplayName(profile);
        const picture = profile?.picture;
        entries.push({
            key: `${occupancyEntry.pubkey}-${occupancyEntry.index}`,
            pubkey: occupancyEntry.pubkey,
            index: occupancyEntry.index,
            centroid: building.centroid,
            ...(displayName !== undefined ? { displayName } : {}),
            initials: resolveInitials(occupancyEntry.pubkey, profile),
            ...(picture !== undefined ? { picture } : {}),
        });
    }

    return entries;
}

export function isPointWithinViewport(input: {
    point: WorldPoint;
    viewportWidth: number;
    viewportHeight: number;
    marginPx?: number;
}): boolean {
    const margin = Math.max(0, input.marginPx ?? 0);

    return input.point.x >= -margin
        && input.point.y >= -margin
        && input.point.x <= (input.viewportWidth + margin)
        && input.point.y <= (input.viewportHeight + margin);
}

export function buildDiscoveredEasterEggEntries(input: BuildDiscoveredEasterEggEntriesInput): DiscoveredEasterEggEntry[] {
    const discoveredIds = new Set(input.discoveredIds);
    return input.easterEggBuildings
        .filter((entry) => discoveredIds.has(entry.easterEggId))
        .map((entry) => {
            const building = input.buildingsByIndex[entry.index];
            if (!building) {
                return null;
            }

            return {
                key: `easter-egg-${entry.easterEggId}-${entry.index}`,
                easterEggId: entry.easterEggId,
                index: entry.index,
                centroid: building.centroid,
            };
        })
        .filter((entry): entry is DiscoveredEasterEggEntry => entry !== null);
}
