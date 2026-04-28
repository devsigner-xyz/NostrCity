import { describe, expect, test } from 'vitest';
import { buildDiscoveredEasterEggEntries, buildPresenceLayerEntries, isPointWithinViewport } from './presence-layer-model';

const ALICE = 'a'.repeat(64);
const BOB = 'b'.repeat(64);

describe('buildPresenceLayerEntries', () => {
    test('below zoom threshold keeps only always-visible pubkeys', () => {
        const entries = buildPresenceLayerEntries({
            occupancyByBuildingIndex: { 0: ALICE, 1: BOB },
            profiles: {
                [ALICE]: { pubkey: ALICE, displayName: 'Alice' },
                [BOB]: { pubkey: BOB, displayName: 'Bob' },
            },
            buildingsByIndex: {
                0: { index: 0, centroid: { x: 100, y: 90 } },
                1: { index: 1, centroid: { x: 260, y: 130 } },
            },
            zoom: 5,
            occupiedLabelsZoomLevel: 10,
            alwaysVisiblePubkeys: [ALICE],
        });

        expect(entries).toHaveLength(1);
        expect(entries[0]?.pubkey).toBe(ALICE);
    });

    test('at zoom threshold keeps all occupied entries with valid buildings', () => {
        const entries = buildPresenceLayerEntries({
            occupancyByBuildingIndex: { 0: ALICE, 1: BOB, 2: 'c'.repeat(64) },
            profiles: {
                [ALICE]: { pubkey: ALICE, displayName: 'Alice' },
                [BOB]: { pubkey: BOB, displayName: 'Bob' },
            },
            buildingsByIndex: {
                0: { index: 0, centroid: { x: 100, y: 90 } },
                1: { index: 1, centroid: { x: 260, y: 130 } },
            },
            zoom: 10,
            occupiedLabelsZoomLevel: 10,
            alwaysVisiblePubkeys: [],
        });

        expect(entries).toHaveLength(2);
        expect(entries.map((entry) => entry.pubkey)).toEqual([ALICE, BOB]);
    });
});

describe('isPointWithinViewport', () => {
    test('includes points inside viewport plus margin', () => {
        const visible = isPointWithinViewport({
            point: { x: -20, y: 310 },
            viewportWidth: 800,
            viewportHeight: 600,
            marginPx: 24,
        });

        expect(visible).toBe(true);
    });

    test('excludes points outside viewport plus margin', () => {
        const visible = isPointWithinViewport({
            point: { x: -40, y: 310 },
            viewportWidth: 800,
            viewportHeight: 600,
            marginPx: 24,
        });

        expect(visible).toBe(false);
    });
});

describe('buildDiscoveredEasterEggEntries', () => {
    test('returns only currently-assigned discovered easter eggs with valid buildings', () => {
        const entries = buildDiscoveredEasterEggEntries({
            discoveredIds: ['bitcoin_whitepaper', 'cyberspace_independence'],
            easterEggBuildings: [
                { index: 1, easterEggId: 'bitcoin_whitepaper' },
                { index: 8, easterEggId: 'crypto_anarchist_manifesto' },
                { index: 9, easterEggId: 'cyberspace_independence' },
            ],
            buildingsByIndex: {
                1: { index: 1, centroid: { x: 120, y: 80 } },
            },
        });

        expect(entries).toEqual([
            {
                key: 'easter-egg-bitcoin_whitepaper-1',
                easterEggId: 'bitcoin_whitepaper',
                index: 1,
                centroid: { x: 120, y: 80 },
            },
        ]);
    });
});
