import { describe, expect, test } from 'vitest';
import Vector from '../vector';
import {
    calculatePinchZoom,
    hasMovedBeyondTouchTapThreshold,
    midpointBetweenTouchPoints,
} from './touch_map_interactions';

describe('touch map interactions', () => {
    test('treats small finger drift as a tap', () => {
        expect(hasMovedBeyondTouchTapThreshold(new Vector(20, 20), new Vector(22, 22))).toBe(false);
    });

    test('treats larger finger movement as map pan', () => {
        expect(hasMovedBeyondTouchTapThreshold(new Vector(20, 20), new Vector(36, 20))).toBe(true);
    });

    test('calculates pinch zoom from distance ratio', () => {
        expect(calculatePinchZoom({ startDistance: 100, currentDistance: 150, startZoom: 2 })).toBe(3);
    });

    test('keeps invalid pinch distances at the starting zoom', () => {
        expect(calculatePinchZoom({ startDistance: 0, currentDistance: 150, startZoom: 2 })).toBe(2);
    });

    test('returns the midpoint between two touch points', () => {
        const midpoint = midpointBetweenTouchPoints(new Vector(10, 20), new Vector(30, 40));

        expect(midpoint.x).toBe(20);
        expect(midpoint.y).toBe(30);
    });
});
