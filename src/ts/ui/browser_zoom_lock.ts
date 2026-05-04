export function installBrowserZoomLock(target: Window = window): () => void {
    const listenerOptions: AddEventListenerOptions = { passive: false };
    const preventBrowserZoom = (event: Event): void => {
        event.preventDefault();
    };
    const preventMultiTouchZoom = (event: TouchEvent): void => {
        if (event.touches.length > 1) {
            event.preventDefault();
        }
    };

    target.addEventListener('gesturestart', preventBrowserZoom, listenerOptions);
    target.addEventListener('gesturechange', preventBrowserZoom, listenerOptions);
    target.addEventListener('gestureend', preventBrowserZoom, listenerOptions);
    target.addEventListener('touchstart', preventMultiTouchZoom, listenerOptions);
    target.addEventListener('touchmove', preventMultiTouchZoom, listenerOptions);

    return (): void => {
        target.removeEventListener('gesturestart', preventBrowserZoom, listenerOptions);
        target.removeEventListener('gesturechange', preventBrowserZoom, listenerOptions);
        target.removeEventListener('gestureend', preventBrowserZoom, listenerOptions);
        target.removeEventListener('touchstart', preventMultiTouchZoom, listenerOptions);
        target.removeEventListener('touchmove', preventMultiTouchZoom, listenerOptions);
    };
}
