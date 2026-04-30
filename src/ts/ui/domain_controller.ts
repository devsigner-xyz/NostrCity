import Vector from '../vector';
import Util from '../util';

/**
 * Singleton
 * Controls panning and zooming
 */
export default class DomainController {
    private static instance: DomainController;

    private readonly ZOOM_SPEED = 0.92;
    private readonly MIN_ZOOM = 0.3;
    private readonly MAX_ZOOM = 20;
    private readonly WHEEL_STEP_BASE = 53;
    private readonly MIN_WHEEL_STEPS = 0.35;
    private readonly MAX_WHEEL_STEPS = 3;
    private readonly SCROLL_DELAY = 100;

    // Location of screen origin in world space
    private _origin: Vector = Vector.zeroVector();
    
    // Screen-space width and height
    private _screenDimensions = Vector.zeroVector();

    // Ratio of screen pixels to world pixels
    private _zoom: number = 1;
    private zoomCallback: () => void = () => {};
    private lastScrolltime = -this.SCROLL_DELAY;
    private refreshedAfterScroll = false;

    private _cameraDirection = Vector.zeroVector();
    private _orthographic = false;
    private viewAnimationFrame: number | null = null;
    private viewportInsetLeft = 0;

    // Set after pan or zoom
    public moved = false;


    private constructor() {
        this.setScreenDimensions();

        window.addEventListener('resize', (): void => this.setScreenDimensions());

        window.addEventListener('wheel', (e: WheelEvent): void => {
            if (!(e.target instanceof HTMLElement) || e.target.id !== Util.CANVAS_ID) {
                return;
            }

            this.lastScrolltime = Date.now();
            this.refreshedAfterScroll = false;
            const delta: number = e.deltaY;

            if (!Number.isFinite(delta) || delta === 0) {
                return;
            }

            const deltaMagnitude = Math.abs(delta);
            const wheelSteps = Math.max(
                this.MIN_WHEEL_STEPS,
                Math.min(this.MAX_WHEEL_STEPS, deltaMagnitude / this.WHEEL_STEP_BASE),
            );
            const zoomFactor = Math.pow(this.ZOOM_SPEED, wheelSteps);

            if (delta > 0) {
                this.zoom = this._zoom * zoomFactor;
            } else {
                this.zoom = this._zoom / zoomFactor;
            }
        });

    }

    /**
     * Used to stop drawing buildings while scrolling for certain styles
     * to keep the framerate up
     */
    get isScrolling(): boolean {
        return Date.now() - this.lastScrolltime < this.SCROLL_DELAY;
    }

    private setScreenDimensions(): void {
        this.moved = true;
        const inset = Math.max(0, Math.min(window.innerWidth, this.viewportInsetLeft));
        this._screenDimensions.setX(Math.max(1, window.innerWidth - inset));
        this._screenDimensions.setY(window.innerHeight);
    }

    setViewportInsetLeft(inset: number): void {
        this.viewportInsetLeft = Math.max(0, inset);
        this.setScreenDimensions();
    }

    public static getInstance(): DomainController {
        if (!DomainController.instance) {
            DomainController.instance = new DomainController();
        }
        return DomainController.instance;
    }

    /**
     * @param {Vector} delta in world space
     */
    pan(delta: Vector) {
        this.moved = true;
        this._origin.sub(delta);
    }

    /**
     * Screen origin in world space
     */
    get origin(): Vector {
        return this._origin.clone();
    }

    get zoom(): number {
        return this._zoom;
    }

    get screenDimensions(): Vector {
        return this._screenDimensions.clone();
    }

    /**
     * @return {Vector} world-space w/h visible on screen
     */
    get worldDimensions(): Vector {
        return this.screenDimensions.divideScalar(this._zoom);
    }

    set screenDimensions(v: Vector) {
        this.moved = true;
        this._screenDimensions.copy(v);
    }

    set zoom(z: number) {
        this.stopViewAnimation();
        if (z >= this.MIN_ZOOM && z <= this.MAX_ZOOM) {
            this.moved = true;
            const oldWorldSpaceMidpoint = this.origin.add(this.worldDimensions.divideScalar(2));
            this._zoom = z;
            const newWorldSpaceMidpoint = this.origin.add(this.worldDimensions.divideScalar(2));
            this.pan(newWorldSpaceMidpoint.sub(oldWorldSpaceMidpoint));
            this.zoomCallback();
        }
    }

    setZoomAroundScreenPoint(zoom: number, screenPoint: Vector): void {
        if (!Number.isFinite(zoom)) {
            return;
        }

        this.stopViewAnimation();
        const targetZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, zoom));
        const worldBeforeZoom = this.screenToWorld(screenPoint.clone());
        this._zoom = targetZoom;
        const worldAfterZoom = this.screenToWorld(screenPoint.clone());
        this._origin.add(worldBeforeZoom.sub(worldAfterZoom));
        this.moved = true;
        this.zoomCallback();
    }

    centerOnWorldPoint(point: Vector): void {
        this.stopViewAnimation();
        const halfWorld = this.worldDimensions.divideScalar(2);
        this._origin = point.clone().sub(halfWorld);
        this.moved = true;
    }

    animateToWorldPoint(point: Vector, options?: { zoom?: number; durationMs?: number }): void {
        this.stopViewAnimation();

        const targetZoom = Math.min(this.MAX_ZOOM, Math.max(this.MIN_ZOOM, options?.zoom ?? this._zoom));
        const durationMs = Math.max(0, options?.durationMs ?? 650);

        const startCenter = this.origin.add(this.worldDimensions.divideScalar(2));
        const startZoom = this._zoom;
        const targetCenter = point.clone();

        if (durationMs === 0) {
            this.applyViewState(targetCenter, targetZoom);
            return;
        }

        let startTime: number | null = null;

        const step = (timestamp: number): void => {
            if (startTime === null) {
                startTime = timestamp;
            }

            const elapsed = timestamp - startTime;
            const progress = Math.min(1, elapsed / durationMs);
            const eased = this.easeInOutCubic(progress);

            const nextCenter = new Vector(
                startCenter.x + (targetCenter.x - startCenter.x) * eased,
                startCenter.y + (targetCenter.y - startCenter.y) * eased,
            );
            const nextZoom = startZoom + (targetZoom - startZoom) * eased;

            this.applyViewState(nextCenter, nextZoom);

            if (progress < 1) {
                this.viewAnimationFrame = requestAnimationFrame(step);
            } else {
                this.viewAnimationFrame = null;
            }
        };

        this.viewAnimationFrame = requestAnimationFrame(step);
    }

    onScreen(v: Vector): boolean {
        const screenSpace = this.worldToScreen(v.clone());
        return screenSpace.x >= 0 && screenSpace.y >= 0
            && screenSpace.x <= this.screenDimensions.x && screenSpace.y <= this.screenDimensions.y;
    }

    set orthographic(v: boolean) {
        this._orthographic = v;
        this.moved = true;
    }

    get orthographic(): boolean {
        return this._orthographic;
    }

    set cameraDirection(v: Vector) {
        this._cameraDirection = v;
        // Screen update
        this.moved = true;
    }

    get cameraDirection(): Vector {
        return this._cameraDirection.clone();
    }

    getCameraPosition(): Vector {
        const centre = new Vector(this._screenDimensions.x / 2, this._screenDimensions.y / 2);
        if (this._orthographic) {
            return centre.add(centre.clone().multiply(this._cameraDirection).multiplyScalar(100));
        }
        return centre.add(centre.clone().multiply(this._cameraDirection));
        // this.screenDimensions.divideScalar(2);
    }

    setZoomUpdate(callback: () => void): void {
        this.zoomCallback = callback;
    }

    private stopViewAnimation(): void {
        if (this.viewAnimationFrame !== null) {
            cancelAnimationFrame(this.viewAnimationFrame);
            this.viewAnimationFrame = null;
        }
    }

    private applyViewState(center: Vector, zoom: number): void {
        this._zoom = zoom;
        const halfWorld = this.screenDimensions.divideScalar(2 * this._zoom);
        this._origin = center.clone().sub(halfWorld);
        this.moved = true;
        this.zoomCallback();
    }

    private easeInOutCubic(t: number): number {
        if (t < 0.5) {
            return 4 * t * t * t;
        }

        return 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    /**
     * Edits vector
     */
    zoomToWorld(v: Vector): Vector {
        return v.divideScalar(this._zoom);
    }

    /**
     * Edits vector
     */
    zoomToScreen(v: Vector): Vector {
        return v.multiplyScalar(this._zoom);
    }

    /**
     * Edits vector
     */
    screenToWorld(v: Vector): Vector {
        const inset = Math.max(0, Math.min(window.innerWidth, this.viewportInsetLeft));
        const localScreen = v.clone().sub(new Vector(inset, 0));
        return this.zoomToWorld(localScreen).add(this._origin);
    }

    /**
     * Edits vector
     */
    worldToScreen(v: Vector): Vector {
        return this.zoomToScreen(v.sub(this._origin));
    }
}
