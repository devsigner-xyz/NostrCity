import Vector from '../vector';

export const TOUCH_TAP_MOVE_THRESHOLD_PX = 9;
export const TOUCH_LONG_PRESS_DELAY_MS = 550;

export function hasMovedBeyondTouchTapThreshold(startPoint: Vector, currentPoint: Vector): boolean {
    return startPoint.distanceToSquared(currentPoint) > TOUCH_TAP_MOVE_THRESHOLD_PX * TOUCH_TAP_MOVE_THRESHOLD_PX;
}

export function calculatePinchZoom({
    startDistance,
    currentDistance,
    startZoom,
}: {
    startDistance: number;
    currentDistance: number;
    startZoom: number;
}): number {
    if (!Number.isFinite(startDistance) || !Number.isFinite(currentDistance) || startDistance <= 0 || currentDistance <= 0) {
        return startZoom;
    }

    return startZoom * (currentDistance / startDistance);
}

export function midpointBetweenTouchPoints(first: Vector, second: Vector): Vector {
    return new Vector((first.x + second.x) / 2, (first.y + second.y) / 2);
}
