import { afterEach, describe, expect, it } from 'vitest';
import { installBrowserZoomLock } from './browser_zoom_lock';

let cleanup: (() => void) | undefined;

function touchMoveEvent(touchCount: number): Event {
    const event = new Event('touchmove', { cancelable: true });

    Object.defineProperty(event, 'touches', {
        value: Array.from({ length: touchCount }, () => ({})),
    });

    return event;
}

afterEach(() => {
    cleanup?.();
    cleanup = undefined;
});

describe('browser zoom lock', () => {
    it('prevents browser zoom gestures without blocking single-touch movement', () => {
        cleanup = installBrowserZoomLock(window);

        const singleTouchMove = touchMoveEvent(1);
        window.dispatchEvent(singleTouchMove);
        expect(singleTouchMove.defaultPrevented).toBe(false);

        const pinchMove = touchMoveEvent(2);
        window.dispatchEvent(pinchMove);
        expect(pinchMove.defaultPrevented).toBe(true);

        const safariGesture = new Event('gesturestart', { cancelable: true });
        window.dispatchEvent(safariGesture);
        expect(safariGesture.defaultPrevented).toBe(true);
    });

    it('removes browser zoom gesture handlers on cleanup', () => {
        cleanup = installBrowserZoomLock(window);
        cleanup();
        cleanup = undefined;

        const pinchMove = touchMoveEvent(2);
        window.dispatchEvent(pinchMove);

        expect(pinchMove.defaultPrevented).toBe(false);
    });
});
