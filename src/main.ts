import * as log from 'loglevel';
import * as dat from 'dat.gui';
import './html/style.css';
import TensorFieldGUI from './ts/ui/tensor_field_gui';
import {NoiseParams} from './ts/impl/tensor_field';
import MainGUI from './ts/ui/main_gui';
import {DefaultCanvasWrapper} from './ts/ui/canvas_wrapper';
import Util from './ts/util';
import DragController from './ts/ui/drag_controller';
import DomainController from './ts/ui/domain_controller';
import Style from './ts/ui/style';
import {ColourScheme, DefaultStyle, RoughStyle} from './ts/ui/style';
import ColourSchemes from './colour_schemes';
import Vector from './ts/vector';
import { applyMapFirstStartup, shouldShowTensorField } from './ts/ui/startup_mode';
import { shouldRegenerateMapOnViewportInsetChange } from './ts/ui/viewport_inset';
import { SVG } from '@svgdotjs/svg.js';
import type ModelGenerator from './ts/model_generator';
import { saveAs } from 'file-saver';
import type { MapGenerationOptions } from './map-generation-options';
import type { GenerationBounds } from './ts/ui/map_generation_context';
import { mountNostrOverlay } from './nostr-overlay/bootstrap';
import { createLatestRequestRunner } from './ts/ui/map_generation_request_guard';
import { createMiddlePanState, stopMiddlePanState, type MiddlePanState, updateMiddlePanState } from './ts/ui/middle_pan_drag';
import { calculatePinchZoom, hasMovedBeyondTouchTapThreshold, midpointBetweenTouchPoints, TOUCH_LONG_PRESS_DELAY_MS } from './ts/ui/touch_map_interactions';
import { runMapGeneration } from './ts/ui/map_generation_runner';
import { calculateGeneratedMapCoverView } from './ts/ui/map_view_fit';
import { createViewChangeScheduler } from './ts/ui/view_change_scheduler';
import type { EasterEggId } from './ts/ui/easter_eggs';

interface OccupiedBuildingClickPayload {
    buildingIndex: number;
    pubkey: string;
}

interface OccupiedBuildingContextMenuPayload {
    buildingIndex: number;
    pubkey: string;
    clientX: number;
    clientY: number;
}

interface EasterEggBuildingClickPayload {
    buildingIndex: number;
    easterEggId: EasterEggId;
}

class Main {
    private readonly STARTING_WIDTH = 1440;  // Initially zooms in if width > STARTING_WIDTH
    private readonly STARTUP_TARGET_BUILDINGS = 64;

    // UI
    private gui: dat.GUI = new dat.GUI({width: 300});
    private tensorFolder: dat.GUI;
    private roadsFolder: dat.GUI;
    private styleFolder: dat.GUI;
    private optionsFolder: dat.GUI;
    private downloadsFolder: dat.GUI;

    private domainController = DomainController.getInstance();
    private dragController = new DragController(this.gui);
    private tensorField: TensorFieldGUI;
    private mainGui: MainGUI;  // In charge of glueing everything together

    // Options
    private imageScale = 3;  // Multiplier for res of downloaded image
    public highDPI = false;  // Increases resolution for hiDPI displays

    // Style options
    private canvas: HTMLCanvasElement;
    private tensorCanvas: DefaultCanvasWrapper;
    private _style!: Style;
    private colourScheme: string = "Nostr City Light";  // See colour_schemes.json
    private zoomBuildings: boolean = false;  // Show buildings only when zoomed in?
    private buildingModels: boolean = false;  // Draw pseudo-3D buildings?
    private showFrame: boolean = false;
    private spacePanHeld = false;
    private middlePanHeld = false;
    private middlePanState: MiddlePanState = stopMiddlePanState();
    private leftMouseDown = false;
    private leftDragDetected = false;
    private leftMouseDownPosition: Vector | null = null;

    // Force redraw of roads when switching from tensor vis to map vis
    private previousFrameDrawTensor = true;

    // 3D camera position
    private cameraX = 0;
    private cameraY = 0;

    private modelGenerator: ModelGenerator | undefined;
    private mapGeneratedListeners: Array<() => void> = [];
    private occupiedBuildingClickListeners: Array<(payload: OccupiedBuildingClickPayload) => void> = [];
    private occupiedBuildingContextMenuListeners: Array<(payload: OccupiedBuildingContextMenuPayload) => void> = [];
    private easterEggBuildingClickListeners: Array<(payload: EasterEggBuildingClickPayload) => void> = [];
    private viewChangedListeners: Array<() => void> = [];
    private viewChangeScheduler = createViewChangeScheduler(() => this.notifyViewChanged());
    private viewportInsetLeft = 0;
    private lastFrameTime = performance.now();
    private readonly runLatestGeneration: (options?: MapGenerationOptions) => Promise<void>;

    constructor() {
        // GUI Setup
        const zoomController = this.gui.add(this.domainController, 'zoom');
        this.domainController.setZoomUpdate(() => zoomController.updateDisplay());
        this.gui.add(this, 'generate');

        this.tensorFolder = this.gui.addFolder('Tensor Field');
        this.roadsFolder = this.gui.addFolder('Map');
        this.styleFolder = this.gui.addFolder('Style');
        this.optionsFolder = this.gui.addFolder('Options');
        this.downloadsFolder = this.gui.addFolder('Download');

        // Canvas setup
        this.canvas = document.getElementById(Util.CANVAS_ID) as HTMLCanvasElement;
        this.tensorCanvas = new DefaultCanvasWrapper(this.canvas);
        this.bindPanModeControls();
        
        // Make sure we're not too zoomed out for large resolutions
        const screenWidth = this.domainController.screenDimensions.x;
        if (screenWidth > this.STARTING_WIDTH) {
            this.domainController.zoom = screenWidth / this.STARTING_WIDTH;
        }

        // Style setup
        const guiBindings = this as unknown as Record<string, unknown>;

        this.styleFolder.add(guiBindings, 'zoomBuildings').onChange((val: boolean) => {
            // Force redraw
            this.previousFrameDrawTensor = true;
            this._style.zoomBuildings = val;
        });

        this.styleFolder.add(guiBindings, 'buildingModels').onChange((val: boolean) => {
            // Force redraw
            this.previousFrameDrawTensor = true;
            this._style.showBuildingModels = val;
        });
        
        this.styleFolder.add(guiBindings, 'showFrame').onChange((val: boolean) => {
            this.previousFrameDrawTensor = true;
            this._style.showFrame = val;
        });

        this.styleFolder.add(this.domainController, 'orthographic');
        this.styleFolder.add(guiBindings, 'cameraX', -15, 15).step(1).onChange(() => this.setCameraDirection());
        this.styleFolder.add(guiBindings, 'cameraY', -15, 15).step(1).onChange(() => this.setCameraDirection());


        const noiseParamsPlaceholder: NoiseParams = {  // Placeholder values for park + water noise
            globalNoise: false,
            noiseSizePark: 20,
            noiseAnglePark: 90,
            noiseSizeGlobal: 30,
            noiseAngleGlobal: 20
        };

        this.tensorField = new TensorFieldGUI(this.tensorFolder, this.dragController, true, noiseParamsPlaceholder);
        this.mainGui = new MainGUI(this.roadsFolder, this.tensorField, () => this.tensorFolder.close());
        this.bindOccupiedBuildingClick();
        this.bindTouchMapInteractions();

        this.optionsFolder.add(this.tensorField, 'drawCentre');
        this.optionsFolder.add(this, 'highDPI').onChange((high: boolean) => this.changeCanvasScale(high));
        
        this.downloadsFolder.add(guiBindings, 'imageScale', 1, 5).step(1);
        this.downloadsFolder.add({"PNG": () => this.downloadPng()}, 'PNG');  // This allows custom naming of button
        this.downloadsFolder.add({"SVG": () => this.downloadSVG()}, 'SVG');
        this.downloadsFolder.add({"STL": () => this.downloadSTL()}, 'STL');
        this.downloadsFolder.add({"Heightmap": () => this.downloadHeightmap()}, 'Heightmap');

        this.changeColourScheme(this.colourScheme);
        this.mountSettingsPanel(null);
        this.tensorField.setRecommended();
        this.runLatestGeneration = createLatestRequestRunner(async (options?: MapGenerationOptions) => {
            const viewCenter = this.domainController.origin.add(this.domainController.worldDimensions.divideScalar(2));
            await runMapGeneration({
                viewCenter,
                screenDimensions: this.domainController.screenDimensions,
                ...(options?.targetBuildings === undefined ? {} : { targetBuildings: options.targetBuildings }),
                tensorField: this.tensorField,
                mainGui: this.mainGui,
                onAttemptBoundsResolved: (bounds) => this.fitGenerationBoundsToViewport(bounds),
            });
            this.fitGeneratedMapToViewport();
            this.notifyMapGenerated();
        });
        window.addEventListener('beforeunload', () => {
            this.viewChangeScheduler.dispose();
        });
        requestAnimationFrame(() => this.update());
        void applyMapFirstStartup({
            closeTensorFolder: () => this.tensorFolder.close(),
            generateMap: (options) => this.generateMap(options),
            initialGenerationOptions: { targetBuildings: this.STARTUP_TARGET_BUILDINGS },
        });
    }

    /**
     * Generate an entire map with no control over the process
     */
    generate(): void {
        void this.generateMap();
    }

    async generateMap(options?: MapGenerationOptions): Promise<void> {
        await this.runLatestGeneration(options);
    }

    private fitGeneratedMapToViewport(): void {
        const view = calculateGeneratedMapCoverView({
            screenDimensions: this.domainController.screenDimensions,
            footprints: this.getBuildingFootprintsWorld(),
            centroids: this.getBuildingCentroidsWorld(),
        });
        if (!view) {
            return;
        }

        this.domainController.zoom = view.zoom;
        this.domainController.centerOnWorldPoint(view.center);
    }

    private fitGenerationBoundsToViewport(bounds: GenerationBounds): void {
        const origin = bounds.origin;
        const dimensions = bounds.worldDimensions;
        const view = calculateGeneratedMapCoverView({
            screenDimensions: this.domainController.screenDimensions,
            footprints: [[
                origin,
                new Vector(origin.x + dimensions.x, origin.y),
                origin.clone().add(dimensions),
                new Vector(origin.x, origin.y + dimensions.y),
            ]],
            centroids: [],
        });
        if (!view) {
            return;
        }

        this.domainController.zoom = view.zoom;
        this.domainController.centerOnWorldPoint(view.center);
    }

    async ensureGenerated(): Promise<void> {
        if (this.mainGui.roadsEmpty()) {
            await this.generateMap();
        }
    }

    roadsEmpty(): boolean {
        return this.mainGui.roadsEmpty();
    }

    getBuildingCentroidsWorld(): Vector[] {
        return this.mainGui.getBuildingCentroidsWorld();
    }

    getBuildingFootprintsWorld(): Vector[][] {
        return this.mainGui.getBuildingFootprintsWorld();
    }

    getEasterEggBuildings(): Array<{ index: number; easterEggId: EasterEggId }> {
        return this.mainGui.getEasterEggBuildings();
    }

    setOccupancyByBuildingIndex(byBuildingIndex: Record<number, string>): void {
        this.mainGui.setOccupancyByBuildingIndex(byBuildingIndex);
    }

    setVerifiedBuildingIndexes(indexes: number[]): void {
        this.mainGui.setVerifiedBuildingIndexes(indexes);
    }

    setSelectedBuildingIndex(index?: number): void {
        this.mainGui.setSelectedBuildingIndex(index);
    }

    setStreetLabelsEnabled(enabled: boolean): void {
        this.mainGui.setStreetLabelsEnabled(enabled);
    }

    setStreetLabelsZoomLevel(level: number): void {
        this.mainGui.setStreetLabelsZoomLevel(level);
    }

    setStreetLabelUsernames(usernames: string[]): void {
        this.mainGui.setStreetLabelUsernames(usernames);
    }

    setTrafficParticlesCount(count: number): void {
        this.mainGui.setTrafficParticlesCount(count);
    }

    setTrafficParticlesSpeed(speed: number): void {
        this.mainGui.setTrafficParticlesSpeed(speed);
    }

    setViewportInsetLeft(inset: number): void {
        const insetPx = Math.max(0, Math.min(window.innerWidth, inset));
        if (this.viewportInsetLeft === insetPx) {
            return;
        }

        this.viewportInsetLeft = insetPx;
        document.documentElement.style.setProperty('--nostr-map-inset-left', `${insetPx}px`);
        this.domainController.setViewportInsetLeft(insetPx);
        this.changeCanvasScale(this.highDPI);

        if (shouldRegenerateMapOnViewportInsetChange({
            tensorFieldVisible: this.showTensorField(),
            roadsEmpty: this.mainGui.roadsEmpty(),
        })) {
            void this.generateMap();
        }
    }

    setDialogHighlightedBuildingIndex(index?: number): void {
        this.mainGui.setDialogHighlightedBuildingIndex(index);
    }

    mountSettingsPanel(container: HTMLElement | null): void {
        const panel = this.gui.domElement as HTMLElement;
        panel.classList.add('nostr-map-settings-panel');

        if (container) {
            if (panel.parentElement !== container) {
                container.appendChild(panel);
            }
            panel.style.display = 'block';
            return;
        }

        panel.style.display = 'none';
        if (panel.parentElement !== document.body) {
            document.body.appendChild(panel);
        }
    }

    focusBuilding(index: number): boolean {
        return this.mainGui.focusBuilding(index);
    }

    setColourScheme(scheme: string): void {
        this.changeColourScheme(scheme);
    }

    getColourScheme(): string {
        return this.colourScheme;
    }

    getColourSchemes(): string[] {
        return Object.keys(ColourSchemes);
    }

    getParkCount(): number {
        return this.mainGui.getParkCount();
    }

    getZoom(): number {
        return this.domainController.zoom;
    }

    setZoom(zoom: number): void {
        this.domainController.zoom = zoom;
    }

    worldToScreen(point: { x: number; y: number }): Vector {
        return this.domainController.worldToScreen(new Vector(point.x, point.y));
    }

    getViewportInsetLeft(): number {
        return this.viewportInsetLeft;
    }

    subscribeMapGenerated(listener: () => void): () => void {
        this.mapGeneratedListeners.push(listener);
        return (): void => {
            const index = this.mapGeneratedListeners.indexOf(listener);
            if (index >= 0) {
                this.mapGeneratedListeners.splice(index, 1);
            }
        };
    }

    subscribeOccupiedBuildingClick(listener: (payload: OccupiedBuildingClickPayload) => void): () => void {
        this.occupiedBuildingClickListeners.push(listener);
        return (): void => {
            const index = this.occupiedBuildingClickListeners.indexOf(listener);
            if (index >= 0) {
                this.occupiedBuildingClickListeners.splice(index, 1);
            }
        };
    }

    subscribeOccupiedBuildingContextMenu(listener: (payload: OccupiedBuildingContextMenuPayload) => void): () => void {
        this.occupiedBuildingContextMenuListeners.push(listener);
        return (): void => {
            const index = this.occupiedBuildingContextMenuListeners.indexOf(listener);
            if (index >= 0) {
                this.occupiedBuildingContextMenuListeners.splice(index, 1);
            }
        };
    }

    subscribeEasterEggBuildingClick(listener: (payload: EasterEggBuildingClickPayload) => void): () => void {
        this.easterEggBuildingClickListeners.push(listener);
        return (): void => {
            const index = this.easterEggBuildingClickListeners.indexOf(listener);
            if (index >= 0) {
                this.easterEggBuildingClickListeners.splice(index, 1);
            }
        };
    }

    subscribeViewChanged(listener: () => void): () => void {
        this.viewChangedListeners.push(listener);
        return (): void => {
            const index = this.viewChangedListeners.indexOf(listener);
            if (index >= 0) {
                this.viewChangedListeners.splice(index, 1);
            }
        };
    }

    /**
     * @param {string} scheme Matches a scheme name in colour_schemes.json
     */
    changeColourScheme(scheme: string): void {
        const colourScheme = (ColourSchemes as Record<string, ColourScheme | undefined>)[scheme];
        if (!colourScheme) {
            log.warn(`Unknown colour scheme: ${scheme}`);
            return;
        }

        this.colourScheme = scheme;
        this.zoomBuildings = Boolean(colourScheme.zoomBuildings);
        this.buildingModels = Boolean(colourScheme.buildingModels);
        Util.updateGui(this.styleFolder);
        if (scheme.startsWith("Drawn")) {
            this._style = new RoughStyle(this.canvas, this.dragController, Object.assign({}, colourScheme));
        } else {
            this._style = new DefaultStyle(this.canvas, this.dragController, Object.assign({}, colourScheme), scheme.startsWith("Heightmap"));
        }
        this._style.showFrame = this.showFrame;
        this.changeCanvasScale(this.highDPI);
    }

    /**
     * Scale up canvas resolution for hiDPI displays
     */
    changeCanvasScale(high: boolean): void {
        const value = high ? 2 : 1;
        this._style.canvasScale = value;
        this.tensorCanvas.canvasScale = value;
    }

    /**
     * Change camera position for pseudo3D buildings
     */
    setCameraDirection(): void {
        this.domainController.cameraDirection = new Vector(this.cameraX / 10, this.cameraY / 10);
    }

    downloadSTL(): void {
        // All in screen space
        const extendScreenX = this.domainController.screenDimensions.x * ((Util.DRAW_INFLATE_AMOUNT - 1) / 2);
        const extendScreenY = this.domainController.screenDimensions.y * ((Util.DRAW_INFLATE_AMOUNT - 1) / 2);
        const ground: Vector[] = [
            new Vector(-extendScreenX, -extendScreenY),
            new Vector(-extendScreenX, this.domainController.screenDimensions.y + extendScreenY),
            new Vector(this.domainController.screenDimensions.x + extendScreenX, this.domainController.screenDimensions.y + extendScreenY),
            new Vector(this.domainController.screenDimensions.x + extendScreenX, -extendScreenY),
        ];

        this.mainGui.getBlocks().then(async (blocks) => {
            const { default: ModelGenerator } = await import('./ts/model_generator');
            this.modelGenerator = new ModelGenerator(ground,
                this.mainGui.seaPolygon,
                this.mainGui.coastlinePolygon,
                this.mainGui.riverPolygon,
                this.mainGui.mainRoadPolygons,
                this.mainGui.majorRoadPolygons,
                this.mainGui.minorRoadPolygons,
                this.mainGui.buildingModels,
                blocks,
            );

            this.modelGenerator.getSTL().then(blob => this.downloadFile('model.zip', blob));
        });
    }

    private downloadFile(filename: string, file: Blob | string): void {
        saveAs(file, filename);
    }

    /**
     * Downloads image of map
     * Draws onto hidden canvas at requested resolution
     */
    downloadPng(): void {
        const c = document.getElementById(Util.IMG_CANVAS_ID) as HTMLCanvasElement;

        // Draw
        if (this.showTensorField()) {
            this.tensorField.draw(new DefaultCanvasWrapper(c, this.imageScale, false));
        } else {            
            const imgCanvas = this._style.createCanvasWrapper(c, this.imageScale, false);
            this.mainGui.draw(this._style, true, imgCanvas);
        }

        const link = document.createElement('a');
        link.download = 'map.png';
        link.href = c.toDataURL();
        link.click();
    }

    /**
     * Same as downloadPng but uses Heightmap style
     */
    downloadHeightmap(): void {
        const oldColourScheme = this.colourScheme;
        this.changeColourScheme("Heightmap");
        this.downloadPng();
        this.changeColourScheme(oldColourScheme);
    }

    /**
     * Downloads svg of map
     * Draws onto hidden svg at requested resolution
     */
    downloadSVG(): void {
        const c = document.getElementById(Util.IMG_CANVAS_ID) as HTMLCanvasElement;
        const svgElement = document.getElementById(Util.SVG_ID);
        if (!(svgElement instanceof SVGElement)) {
            return;
        }

        if (this.showTensorField()) {
            const imgCanvas = new DefaultCanvasWrapper(c, 1, false);
            imgCanvas.createSVG(svgElement);
            this.tensorField.draw(imgCanvas);
        } else {
            const imgCanvas = this._style.createCanvasWrapper(c, 1, false);
            imgCanvas.createSVG(svgElement);
            this.mainGui.draw(this._style, true, imgCanvas);
        }

        const serializer = new XMLSerializer();
        let source = serializer.serializeToString(svgElement);
        //add name spaces.
        if(!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)){
            source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
        }
        if(!source.match(/^<svg[^>]+"http\:\/\/www\.w3\.org\/1999\/xlink"/)){
            source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
        }

        //add xml declaration
        source = '<?xml version="1.0" standalone="no"?>\r\n' + source;

        //convert svg source to URI data scheme.
        const url = "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(source);

        const link = document.createElement('a');
        link.download = 'map.svg';
        link.href = url;
        link.click();

        // Clear SVG
        const element = SVG(svgElement);
        element.clear();
    }

    private showTensorField(): boolean {
        return shouldShowTensorField(this.tensorFolder.closed);
    }

    private bindPanModeControls(): void {
        window.addEventListener('keydown', (event: KeyboardEvent): void => {
            if (event.code !== 'Space' || this.isEditableTarget(event.target)) {
                return;
            }

            this.spacePanHeld = true;
            this.updatePanMode();
            event.preventDefault();
        });

        window.addEventListener('keyup', (event: KeyboardEvent): void => {
            if (event.code !== 'Space') {
                return;
            }

            this.spacePanHeld = false;
            this.updatePanMode();
        });

        this.canvas.addEventListener('mousedown', (event: MouseEvent): void => {
            if (event.button !== 1) {
                return;
            }

            this.middlePanHeld = true;
            this.middlePanState = createMiddlePanState(new Vector(event.clientX, event.clientY));
            this.updatePanMode();
            event.preventDefault();
        });

        window.addEventListener('mousemove', (event: MouseEvent): void => {
            if (!this.middlePanHeld || this.showTensorField()) {
                return;
            }

            const result = updateMiddlePanState(this.middlePanState, new Vector(event.clientX, event.clientY));
            this.middlePanState = result.state;

            if (!result.deltaScreen) {
                return;
            }

            this.domainController.zoomToWorld(result.deltaScreen);
            this.domainController.pan(result.deltaScreen);
            event.preventDefault();
        });

        window.addEventListener('mouseup', (event: MouseEvent): void => {
            if (event.button !== 1) {
                return;
            }

            this.middlePanHeld = false;
            this.middlePanState = stopMiddlePanState();
            this.updatePanMode();
        });

        this.canvas.addEventListener('auxclick', (event: MouseEvent): void => {
            if (event.button === 1) {
                event.preventDefault();
            }
        });

        window.addEventListener('blur', (): void => {
            this.spacePanHeld = false;
            this.middlePanHeld = false;
            this.middlePanState = stopMiddlePanState();
            this.updatePanMode();
        });
    }

    private bindOccupiedBuildingClick(): void {
        this.canvas.addEventListener('mousedown', (event: MouseEvent): void => {
            if (event.button !== 0) {
                return;
            }

            this.leftMouseDown = true;
            this.leftDragDetected = false;
            this.leftMouseDownPosition = new Vector(event.clientX, event.clientY);
        });

        this.canvas.addEventListener('mousemove', (event: MouseEvent): void => {
            if (!this.leftMouseDown || !this.leftMouseDownPosition) {
                if (this.showTensorField() || this.isPanModeActive()) {
                    this.mainGui.setHoveredBuildingIndex(undefined);
                    return;
                }

                const hoverWorldPoint = this.domainController.screenToWorld(new Vector(event.clientX, event.clientY));
                const hoverHit = this.mainGui.getOccupiedBuildingAtWorldPoint(hoverWorldPoint);
                this.mainGui.setHoveredBuildingIndex(hoverHit?.index);
                return;
            }

            const dx = event.clientX - this.leftMouseDownPosition.x;
            const dy = event.clientY - this.leftMouseDownPosition.y;
            if ((dx * dx) + (dy * dy) > 9) {
                this.leftDragDetected = true;
            }

            if (this.showTensorField() || this.isPanModeActive()) {
                this.mainGui.setHoveredBuildingIndex(undefined);
                return;
            }

            const hoverWorldPoint = this.domainController.screenToWorld(new Vector(event.clientX, event.clientY));
            const hoverHit = this.mainGui.getOccupiedBuildingAtWorldPoint(hoverWorldPoint);
            this.mainGui.setHoveredBuildingIndex(hoverHit?.index);
        });

        this.canvas.addEventListener('mouseleave', (): void => {
            this.mainGui.setHoveredBuildingIndex(undefined);
        });

        window.addEventListener('mouseup', (event: MouseEvent): void => {
            if (event.button !== 0) {
                return;
            }

            this.leftMouseDown = false;
            this.leftMouseDownPosition = null;
        });

        this.canvas.addEventListener('click', (event: MouseEvent): void => {
            if (event.button !== 0 || this.showTensorField() || this.isPanModeActive() || this.leftDragDetected) {
                this.leftDragDetected = false;
                return;
            }

            const worldPoint = this.domainController.screenToWorld(new Vector(event.clientX, event.clientY));
            const hit = this.mainGui.getOccupiedBuildingAtWorldPoint(worldPoint);
            if (hit) {
                this.notifyOccupiedBuildingClick({
                    buildingIndex: hit.index,
                    pubkey: hit.pubkey,
                });
                return;
            }

            const easterEggHit = this.mainGui.getEasterEggBuildingAtWorldPoint(worldPoint);
            if (!easterEggHit) {
                return;
            }

            this.notifyEasterEggBuildingClick({
                buildingIndex: easterEggHit.index,
                easterEggId: easterEggHit.easterEggId,
            });
        });

        this.canvas.addEventListener('contextmenu', (event: MouseEvent): void => {
            if (this.showTensorField() || this.isPanModeActive()) {
                return;
            }

            const worldPoint = this.domainController.screenToWorld(new Vector(event.clientX, event.clientY));
            const hit = this.mainGui.getOccupiedBuildingAtWorldPoint(worldPoint);
            if (!hit) {
                return;
            }

            event.preventDefault();
            this.notifyOccupiedBuildingContextMenu({
                buildingIndex: hit.index,
                pubkey: hit.pubkey,
                clientX: event.clientX,
                clientY: event.clientY,
            });
        });
    }

    private bindTouchMapInteractions(): void {
        let touchStartPoint: Vector | null = null;
        let lastTouchPoint: Vector | null = null;
        let touchMoved = false;
        let longPressFired = false;
        let longPressTimer: number | null = null;
        let pinchStartDistance = 0;
        let pinchStartZoom = 1;
        let pinchLastMidpoint: Vector | null = null;

        const pointFromTouch = (touch: Touch): Vector => new Vector(touch.clientX, touch.clientY);
        const clearLongPressTimer = (): void => {
            if (longPressTimer !== null) {
                window.clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        };
        const resetTouchState = (): void => {
            clearLongPressTimer();
            touchStartPoint = null;
            lastTouchPoint = null;
            touchMoved = false;
            longPressFired = false;
            pinchStartDistance = 0;
            pinchStartZoom = 1;
            pinchLastMidpoint = null;
        };
        const notifyTouchClick = (screenPoint: Vector): void => {
            if (this.showTensorField() || this.isPanModeActive()) {
                return;
            }

            const worldPoint = this.domainController.screenToWorld(screenPoint.clone());
            const hit = this.mainGui.getOccupiedBuildingAtWorldPoint(worldPoint);
            if (hit) {
                this.notifyOccupiedBuildingClick({
                    buildingIndex: hit.index,
                    pubkey: hit.pubkey,
                });
                return;
            }

            const easterEggHit = this.mainGui.getEasterEggBuildingAtWorldPoint(worldPoint);
            if (!easterEggHit) {
                return;
            }

            this.notifyEasterEggBuildingClick({
                buildingIndex: easterEggHit.index,
                easterEggId: easterEggHit.easterEggId,
            });
        };
        const notifyTouchContextMenu = (screenPoint: Vector): boolean => {
            if (this.showTensorField() || this.isPanModeActive()) {
                return false;
            }

            const worldPoint = this.domainController.screenToWorld(screenPoint.clone());
            const hit = this.mainGui.getOccupiedBuildingAtWorldPoint(worldPoint);
            if (!hit) {
                return false;
            }

            this.notifyOccupiedBuildingContextMenu({
                buildingIndex: hit.index,
                pubkey: hit.pubkey,
                clientX: screenPoint.x,
                clientY: screenPoint.y,
            });
            return true;
        };

        this.canvas.addEventListener('touchstart', (event: TouchEvent): void => {
            if (this.showTensorField()) {
                return;
            }

            if (event.touches.length === 1) {
                const touch = event.touches[0];
                if (!touch) {
                    return;
                }

                const point = pointFromTouch(touch);
                touchStartPoint = point;
                lastTouchPoint = point;
                touchMoved = false;
                longPressFired = false;
                pinchLastMidpoint = null;
                clearLongPressTimer();
                longPressTimer = window.setTimeout(() => {
                    if (!touchStartPoint || touchMoved) {
                        return;
                    }

                    longPressFired = notifyTouchContextMenu(touchStartPoint);
                }, TOUCH_LONG_PRESS_DELAY_MS);
                event.preventDefault();
                return;
            }

            if (event.touches.length >= 2) {
                const firstTouch = event.touches[0];
                const secondTouch = event.touches[1];
                if (!firstTouch || !secondTouch) {
                    return;
                }

                clearLongPressTimer();
                touchMoved = true;
                const firstPoint = pointFromTouch(firstTouch);
                const secondPoint = pointFromTouch(secondTouch);
                pinchStartDistance = firstPoint.distanceTo(secondPoint);
                pinchStartZoom = this.domainController.zoom;
                pinchLastMidpoint = midpointBetweenTouchPoints(firstPoint, secondPoint);
                event.preventDefault();
            }
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (event: TouchEvent): void => {
            if (this.showTensorField()) {
                return;
            }

            if (event.touches.length >= 2) {
                const firstTouch = event.touches[0];
                const secondTouch = event.touches[1];
                if (!firstTouch || !secondTouch) {
                    return;
                }

                clearLongPressTimer();
                touchMoved = true;
                const firstPoint = pointFromTouch(firstTouch);
                const secondPoint = pointFromTouch(secondTouch);
                const midpoint = midpointBetweenTouchPoints(firstPoint, secondPoint);
                const currentDistance = firstPoint.distanceTo(secondPoint);
                const targetZoom = calculatePinchZoom({
                    startDistance: pinchStartDistance,
                    currentDistance,
                    startZoom: pinchStartZoom,
                });

                this.domainController.setZoomAroundScreenPoint(targetZoom, midpoint);
                if (pinchLastMidpoint) {
                    const deltaScreen = new Vector(midpoint.x - pinchLastMidpoint.x, midpoint.y - pinchLastMidpoint.y);
                    this.domainController.zoomToWorld(deltaScreen);
                    this.domainController.pan(deltaScreen);
                }
                pinchLastMidpoint = midpoint;
                event.preventDefault();
                return;
            }

            const touch = event.touches[0];
            if (!touch || !touchStartPoint || !lastTouchPoint || pinchLastMidpoint) {
                return;
            }

            const point = pointFromTouch(touch);
            if (hasMovedBeyondTouchTapThreshold(touchStartPoint, point)) {
                touchMoved = true;
                clearLongPressTimer();
            }

            if (touchMoved) {
                const deltaScreen = new Vector(point.x - lastTouchPoint.x, point.y - lastTouchPoint.y);
                this.domainController.zoomToWorld(deltaScreen);
                this.domainController.pan(deltaScreen);
                event.preventDefault();
            }

            lastTouchPoint = point;
        }, { passive: false });

        this.canvas.addEventListener('touchend', (event: TouchEvent): void => {
            clearLongPressTimer();
            if (event.touches.length === 1) {
                const touch = event.touches[0];
                if (touch) {
                    const point = pointFromTouch(touch);
                    touchStartPoint = point;
                    lastTouchPoint = point;
                    touchMoved = true;
                    longPressFired = true;
                    pinchLastMidpoint = null;
                    pinchStartDistance = 0;
                    pinchStartZoom = this.domainController.zoom;
                }
                return;
            }

            if (event.touches.length > 0) {
                return;
            }

            if (touchStartPoint && lastTouchPoint && !touchMoved && !longPressFired) {
                notifyTouchClick(lastTouchPoint);
                event.preventDefault();
            }

            resetTouchState();
        }, { passive: false });

        this.canvas.addEventListener('touchcancel', resetTouchState);
        window.addEventListener('blur', resetTouchState);
    }

    private updatePanMode(): void {
        this.dragController.setPanModeEnabled(this.spacePanHeld || this.middlePanHeld);
    }

    private isPanModeActive(): boolean {
        return this.spacePanHeld || this.middlePanHeld;
    }

    private isEditableTarget(target: EventTarget | null): boolean {
        if (!(target instanceof HTMLElement)) {
            return false;
        }

        if (target.isContentEditable) {
            return true;
        }

        const tagName = target.tagName.toLowerCase();
        return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
    }

    draw(): void {
        if (this.showTensorField()) {
            this.previousFrameDrawTensor = true;
            this.dragController.setDragDisabled(false);
            this.tensorField.draw(this.tensorCanvas);
        } else {
            // Disable field drag and drop
            this.dragController.setDragDisabled(true);
            
            if (this.previousFrameDrawTensor === true) {
                this.previousFrameDrawTensor = false;

                // Force redraw if switching from tensor field
                this.mainGui.draw(this._style, true);
            } else {
                this.mainGui.draw(this._style);
            }
        }
    }

    update(): void {
        const now = performance.now();
        const deltaSeconds = Math.max(0, Math.min(0.1, (now - this.lastFrameTime) / 1000));
        this.lastFrameTime = now;

        if (this.modelGenerator) {
            let continueUpdate = true;
            const start = performance.now();
            while (continueUpdate && performance.now() - start < 100) {
                continueUpdate = this.modelGenerator.update();
            }
        }

        if (this.domainController.moved) {
            this.viewChangeScheduler.schedule();
        }

        this._style.update();
        this.mainGui.update(deltaSeconds);
        this.draw();
        requestAnimationFrame(this.update.bind(this));
    }

    private notifyMapGenerated(): void {
        for (const listener of this.mapGeneratedListeners) {
            listener();
        }
    }

    private notifyOccupiedBuildingClick(payload: OccupiedBuildingClickPayload): void {
        for (const listener of this.occupiedBuildingClickListeners) {
            listener(payload);
        }
    }

    private notifyOccupiedBuildingContextMenu(payload: OccupiedBuildingContextMenuPayload): void {
        for (const listener of this.occupiedBuildingContextMenuListeners) {
            listener(payload);
        }
    }

    private notifyEasterEggBuildingClick(payload: EasterEggBuildingClickPayload): void {
        for (const listener of this.easterEggBuildingClickListeners) {
            listener(payload);
        }
    }

    private notifyViewChanged(): void {
        for (const listener of this.viewChangedListeners) {
            listener();
        }
    }
}

type WindowWithLog = Window & {
    log?: typeof log;
};

// Add log to window so we can use log.setlevel from the console
const mapWindow = window as WindowWithLog;
mapWindow.log = log;
window.addEventListener('load', (): void => {
    const main = new Main();
    window.mapGeneratorMain = main;
    mountNostrOverlay();
});
