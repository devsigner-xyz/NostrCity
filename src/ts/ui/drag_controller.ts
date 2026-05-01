import interact from 'interactjs';
import Util from '../util';
import Vector from '../vector';
import DomainController from './domain_controller';

interface Draggable {
    getCentre: (() => Vector);
    startListener: (() => void);
    moveListener: ((v: Vector) => void);
}

/**
* Register multiple centre points
* Closest one to mouse click will be selected to drag
* Up to caller to actually move their centre point via callback
*/
export default class DragController {
    // How close to drag handle pointer needs to be
    private readonly MIN_DRAG_DISTANCE = 50;

    private draggables: Draggable[] = [];
    private currentlyDragging: Draggable | null = null;  // Tensor field
    private _isDragging = false;
    private disabled: boolean = false;
    private panModeEnabled: boolean = false;
    private domainController = DomainController.getInstance();

    constructor(private gui: dat.GUI) {
        interact(`#${Util.CANVAS_ID}`).draggable({
            onstart: this.dragStart.bind(this),
            onmove: this.dragMove.bind(this),
            onend: this.dragEnd.bind(this),
            cursorChecker: this.getCursor.bind(this),
        });

        this.updateCanvasCursor();
    }

    setDragDisabled(disable: boolean): void {
        if (this.disabled === disable) {
            return;
        }

        this.disabled = disable;
        this.updateCanvasCursor();
    }

    setPanModeEnabled(enabled: boolean): void {
        if (this.panModeEnabled === enabled) {
            return;
        }

        this.panModeEnabled = enabled;
        this.updateCanvasCursor();
    }

    /**
     * Change cursor style
     */
    getCursor(_action: unknown, _interactable: unknown, _element: unknown, interacting: boolean): string {
        if (this.disabled && !this.panModeEnabled) {
            return 'pointer';
        }

        if (interacting) return 'grabbing';
        return 'grab';
    }

    dragStart(event: unknown): void {
        if (this.disabled && !this.panModeEnabled) {
            this._isDragging = false;
            this.currentlyDragging = null;
            this.updateCanvasCursor();
            return;
        }

        const eventData = this.getDragStartEvent(event);
        if (!eventData) {
            return;
        }

        this._isDragging = true;
        // Transform screen space to world space
        const origin = this.domainController.screenToWorld(new Vector(eventData.x0, eventData.y0));
        
        let closestDistance = Infinity;
        this.draggables.forEach(draggable => {
            const d = draggable.getCentre().distanceTo(origin);
            if (d < closestDistance) {
                closestDistance = d;
                this.currentlyDragging = draggable;
            }
        });

        // Zoom screen size to world size for consistent drag distance while zoomed in
        const scaledDragDistance = this.MIN_DRAG_DISTANCE / this.domainController.zoom;

        if (closestDistance > scaledDragDistance) {
            this.currentlyDragging = null;
        } else {
            if (this.currentlyDragging) {
                this.currentlyDragging.startListener();
            }
        }

        this.updateCanvasCursor();


    }

    dragMove(event: unknown): void {
        const eventData = this.getDragMoveEvent(event);
        if (!eventData) {
            return;
        }

        const delta = new Vector(eventData.deltaX, eventData.deltaY);
        this.domainController.zoomToWorld(delta);

        if (!this.disabled && this.currentlyDragging !== null) {
            // Drag field
            this.currentlyDragging.moveListener(delta);
        } else if (!this.disabled || this.panModeEnabled) {
            // Move map
            this.domainController.pan(delta);
        }
    }

    dragEnd(): void {
        const wasDragging = this._isDragging;
        this._isDragging = false;
        if (wasDragging) {
            this.domainController.pan(Vector.zeroVector());  // Triggers canvas update
        }
        this.currentlyDragging = null;
        Util.updateGui(this.gui);
        this.updateCanvasCursor();
    }

    get isDragging(): boolean {
        return this._isDragging;
    }

    /**
     * @param {(() => Vector)} Gets centre point
     * @param {((v: Vector) => void)} Called on move with delta vector
     * @param {(() => void)} Called on start
     * @returns {(() => void)} Function to deregister callback
     */
    register(getCentre: (() => Vector),
             onMove: ((v: Vector) => void),
             onStart: (() => void),
             ): (() => void) {
        const draggable: Draggable = {
            getCentre: getCentre,
            moveListener: onMove,
            startListener: onStart,
        };

        this.draggables.push(draggable);
        return ((): void => {
            const index = this.draggables.indexOf(draggable);
            if (index >= 0) {
                this.draggables.splice(index, 1);
            }
        }).bind(this);
    }

    private updateCanvasCursor(): void {
        const canvas = document.getElementById(Util.CANVAS_ID);
        if (!canvas) {
            return;
        }

        if (this.disabled && !this.panModeEnabled) {
            canvas.style.cursor = 'pointer';
            return;
        }

        canvas.style.cursor = this._isDragging ? 'grabbing' : 'grab';
    }

    private getDragStartEvent(event: unknown): { x0: number; y0: number } | null {
        if (!event || typeof event !== 'object') {
            return null;
        }

        const data = event as Partial<{ x0: number; y0: number }>;
        const x0 = data.x0;
        const y0 = data.y0;
        if (typeof x0 !== 'number' || typeof y0 !== 'number' || !Number.isFinite(x0) || !Number.isFinite(y0)) {
            return null;
        }

        return {
            x0,
            y0,
        };
    }

    private getDragMoveEvent(event: unknown): { deltaX: number; deltaY: number } | null {
        if (!event || typeof event !== 'object') {
            return null;
        }

        const data = event as Partial<{ delta: { x: number; y: number }; dx: number; dy: number }>;
        if (data.delta && Number.isFinite(data.delta.x) && Number.isFinite(data.delta.y)) {
            return {
                deltaX: data.delta.x,
                deltaY: data.delta.y,
            };
        }

        if (Number.isFinite(data.dx) && Number.isFinite(data.dy)) {
            return {
                deltaX: data.dx as number,
                deltaY: data.dy as number,
            };
        }

        return null;
    }
}
