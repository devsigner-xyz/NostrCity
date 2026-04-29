import * as log from 'loglevel';
import CanvasWrapper from './canvas_wrapper';
import {DefaultCanvasWrapper, RoughCanvasWrapper} from './canvas_wrapper';
import Util from '../util';
import DragController from './drag_controller';
import DomainController from './domain_controller';
import Vector from '../vector';
import {BuildingModel} from './buildings';
import type { StreetLabel } from './street_labels';

interface ResolvedColourScheme {
    bgColour: string;
    bgColourIn: string;
    buildingColour: string;
    buildingSideColour: string;
    buildingStroke: string;
    seaColour: string;
    grassColour: string;
    minorRoadColour: string;
    minorRoadOutline: string;
    majorRoadColour: string;
    majorRoadOutline: string;
    mainRoadColour: string;
    mainRoadOutline: string;
    outlineSize: number;
    minorWidth: number;
    majorWidth: number;
    mainWidth: number;
    zoomBuildings: boolean;
    buildingModels: boolean;
    frameColour: string;
    frameTextColour: string;
    occupiedBuildingColour: string | undefined;
    occupiedBuildingStroke: string | undefined;
    hoveredBuildingColour: string | undefined;
    hoveredBuildingStroke: string | undefined;
    streetLabelColour: string | undefined;
    waterLabelColour: string | undefined;
    parkLabelColour: string | undefined;
}

export interface ColourScheme {
    bgColour: string;
    bgColourIn?: string;
    buildingColour?: string;
    buildingSideColour?: string;
    buildingStroke?: string;
    seaColour: string;
    grassColour?: string;
    minorRoadColour: string;
    minorRoadOutline?: string;
    majorRoadColour?: string;
    majorRoadOutline?: string;
    mainRoadColour?: string;
    mainRoadOutline?: string;
    outlineSize?: number;
    minorWidth?: number;
    majorWidth?: number;
    mainWidth?: number;
    zoomBuildings?: boolean;
    buildingModels?: boolean;
    frameColour?: string;
    frameTextColour?: string;
    occupiedBuildingColour?: string | undefined;
    occupiedBuildingStroke?: string | undefined;
    hoveredBuildingColour?: string | undefined;
    hoveredBuildingStroke?: string | undefined;
    streetLabelColour?: string | undefined;
    waterLabelColour?: string | undefined;
    parkLabelColour?: string | undefined;
}

export type BuildingRenderState = 'empty' | 'occupied' | 'verified' | 'hovered' | 'selected' | 'easter_egg_debug';

export interface BuildingRenderColours {
    fill: string;
    stroke: string;
}

export interface MapLabelColours {
    street: string;
    water: string;
    park: string;
}

export interface TrafficParticleRenderState {
    center: Vector;
    radiusPx: number;
    haloPx: number;
    alpha: number;
}

function parseRgbTriplet(colour: string): [number, number, number] | null {
    const parsed = Util.parseCSSColor(colour);
    if (!parsed || parsed.length < 3) {
        return null;
    }

    const [r, g, b] = parsed;
    if (r === undefined || g === undefined || b === undefined) {
        return null;
    }

    return [r, g, b];
}

function blendRgb(
    from: [number, number, number],
    to: [number, number, number],
    amount: number,
): [number, number, number] {
    const t = Math.max(0, Math.min(1, amount));
    return [
        Math.round(from[0] + (to[0] - from[0]) * t),
        Math.round(from[1] + (to[1] - from[1]) * t),
        Math.round(from[2] + (to[2] - from[2]) * t),
    ];
}

function rgbTripletToString(rgb: [number, number, number]): string {
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

function resolveEasterEggDebugStroke(colourScheme: ColourScheme, animationTimeMs: number): string {
    const emptyStroke = colourScheme.buildingStroke || colourScheme.bgColour;
    const occupiedStroke = colourScheme.occupiedBuildingStroke || 'rgb(228,202,120)';

    const emptyRgb = parseRgbTriplet(emptyStroke);
    const occupiedRgb = parseRgbTriplet(occupiedStroke);
    if (!emptyRgb || !occupiedRgb) {
        return emptyStroke;
    }

    const oscillation = (Math.sin(animationTimeMs / 1100) + 1) / 2;
    const blendAmount = 0.16 + oscillation * 0.28;
    return rgbTripletToString(blendRgb(emptyRgb, occupiedRgb, blendAmount));
}

function resolveEasterEggDebugFill(colourScheme: ColourScheme, animationTimeMs: number): string {
    const emptyFill = colourScheme.buildingColour || colourScheme.bgColour;
    const occupiedFill = colourScheme.occupiedBuildingColour || 'rgb(247,240,206)';

    const emptyRgb = parseRgbTriplet(emptyFill);
    const occupiedRgb = parseRgbTriplet(occupiedFill);
    if (!emptyRgb || !occupiedRgb) {
        return emptyFill;
    }

    const oscillation = (Math.sin(animationTimeMs / 1100) + 1) / 2;
    const blendAmount = 0.1 + oscillation * 0.26;
    return rgbTripletToString(blendRgb(emptyRgb, occupiedRgb, blendAmount));
}

function resolveColourScheme(colourScheme: ColourScheme): ResolvedColourScheme {
    const bgColour = colourScheme.bgColour;
    const seaColour = colourScheme.seaColour;
    const minorRoadColour = colourScheme.minorRoadColour;
    const bgColourIn = colourScheme.bgColourIn ?? bgColour;
    const buildingColour = colourScheme.buildingColour ?? bgColour;
    const buildingStroke = colourScheme.buildingStroke ?? bgColour;
    const grassColour = colourScheme.grassColour ?? bgColour;
    const minorRoadOutline = colourScheme.minorRoadOutline ?? minorRoadColour;
    const majorRoadColour = colourScheme.majorRoadColour ?? minorRoadColour;
    const majorRoadOutline = colourScheme.majorRoadOutline ?? minorRoadOutline;
    const mainRoadColour = colourScheme.mainRoadColour ?? majorRoadColour;
    const mainRoadOutline = colourScheme.mainRoadOutline ?? majorRoadOutline;
    const outlineSize = colourScheme.outlineSize ?? 1;
    const zoomBuildings = colourScheme.zoomBuildings ?? false;
    const buildingModels = colourScheme.buildingModels ?? false;
    const minorWidth = colourScheme.minorWidth ?? 2;
    const majorWidth = colourScheme.majorWidth ?? 4;
    const mainWidth = colourScheme.mainWidth ?? 5;
    const frameColour = colourScheme.frameColour ?? bgColour;
    const frameTextColour = colourScheme.frameTextColour ?? minorRoadOutline;

    let buildingSideColour = colourScheme.buildingSideColour;
    if (!buildingSideColour) {
        const parsedTriplet = parseRgbTriplet(buildingColour);
        if (parsedTriplet) {
            const [r, g, b] = parsedTriplet;
            buildingSideColour = `rgb(${Math.max(0, r - 40)},${Math.max(0, g - 40)},${Math.max(0, b - 40)})`;
        } else {
            buildingSideColour = buildingColour;
        }
    }

    return {
        bgColour,
        bgColourIn,
        buildingColour,
        buildingSideColour,
        buildingStroke,
        seaColour,
        grassColour,
        minorRoadColour,
        minorRoadOutline,
        majorRoadColour,
        majorRoadOutline,
        mainRoadColour,
        mainRoadOutline,
        outlineSize,
        minorWidth,
        majorWidth,
        mainWidth,
        zoomBuildings,
        buildingModels,
        frameColour,
        frameTextColour,
        occupiedBuildingColour: colourScheme.occupiedBuildingColour,
        occupiedBuildingStroke: colourScheme.occupiedBuildingStroke,
        hoveredBuildingColour: colourScheme.hoveredBuildingColour,
        hoveredBuildingStroke: colourScheme.hoveredBuildingStroke,
        streetLabelColour: colourScheme.streetLabelColour,
        waterLabelColour: colourScheme.waterLabelColour,
        parkLabelColour: colourScheme.parkLabelColour,
    };
}

export function resolveMapLabelColours(colourScheme: ColourScheme): MapLabelColours {
    return {
        street: colourScheme.streetLabelColour || 'rgb(72,72,72)',
        water: colourScheme.waterLabelColour || 'rgb(67, 120, 207)',
        park: colourScheme.parkLabelColour || 'rgb(59, 139, 74)',
    };
}

export function resolveBuildingRenderColours(
    state: BuildingRenderState,
    colourScheme: ColourScheme,
    animationTimeMs: number = performance.now(),
): BuildingRenderColours {
    if (state === 'selected') {
        return {
            fill: 'rgb(255,214,118)',
            stroke: 'rgb(233,166,52)',
        };
    }

    if (state === 'hovered') {
        return {
            fill: colourScheme.hoveredBuildingColour || 'rgb(255,151,66)',
            stroke: colourScheme.hoveredBuildingStroke || 'rgb(229,94,24)',
        };
    }

    if (state === 'occupied') {
        return {
            fill: colourScheme.occupiedBuildingColour || 'rgb(247,240,206)',
            stroke: colourScheme.occupiedBuildingStroke || 'rgb(228,202,120)',
        };
    }

    if (state === 'verified') {
        return {
            fill: 'rgb(210,244,220)',
            stroke: 'rgb(77,156,94)',
        };
    }

    if (state === 'easter_egg_debug') {
        return {
            fill: resolveEasterEggDebugFill(colourScheme, animationTimeMs),
            stroke: resolveEasterEggDebugStroke(colourScheme, animationTimeMs),
        };
    }

    return {
        fill: colourScheme.buildingColour || colourScheme.bgColour,
        stroke: colourScheme.buildingStroke || colourScheme.bgColour,
    };
}

/**
 * Controls how screen-space data is drawn
 */
export default abstract class Style {
    protected canvas!: CanvasWrapper;
    protected domainController: DomainController = DomainController.getInstance();
    protected colourScheme: ResolvedColourScheme;
    public abstract createCanvasWrapper(c: HTMLCanvasElement, scale: number, resizeToWindow: boolean): CanvasWrapper;
    public abstract draw(canvas?: CanvasWrapper): void;

    public update(): void {}

    // Polygons
    public seaPolygon: Vector[] = [];
    public lots: Vector[][] = [];
    public buildingModels: BuildingModel[] = [];
    public buildingRenderStates: BuildingRenderState[] = [];
    public parks: Vector[][] = [];

    // Polylines
    public coastline: Vector[] = [];
    public river: Vector[] = [];
    public secondaryRiver: Vector[] = [];
    public minorRoads: Vector[][] = [];
    public majorRoads: Vector[][] = [];
    public mainRoads: Vector[][] = [];
    public coastlineRoads: Vector[][] = [];
    public trafficParticles: TrafficParticleRenderState[] = [];
    public streetLabels: StreetLabel[] = [];
    public showFrame = false;

    constructor(protected dragController: DragController, colourScheme: ColourScheme) {
        if (!colourScheme.bgColour) log.error("ColourScheme Error - bgColour not defined");
        if (!colourScheme.seaColour) log.error("ColourScheme Error - seaColour not defined");
        if (!colourScheme.minorRoadColour) log.error("ColourScheme Error - minorRoadColour not defined");
        this.colourScheme = resolveColourScheme(colourScheme);
    }

    public set zoomBuildings(b: boolean) {
        this.colourScheme.zoomBuildings = b;
    }

    public set showBuildingModels(b: boolean) {
        this.colourScheme.buildingModels = b;
    }

    public get showBuildingModels(): boolean {
        return this.colourScheme.buildingModels;
    }

    public getMapLabelColours(): MapLabelColours {
        return resolveMapLabelColours(this.colourScheme);
    }

    public set canvasScale(scale: number) {
        this.canvas.canvasScale = scale;
    }

    public get needsUpdate(): boolean {
        return this.canvas.needsUpdate;
    }

    public set needsUpdate(n: boolean) {
        this.canvas.needsUpdate = n;
    }
}

export class DefaultStyle extends Style {
    constructor(c: HTMLCanvasElement, dragController: DragController, colourScheme: ColourScheme, private heightmap=false) {
        super(dragController, colourScheme);
        this.canvas = this.createCanvasWrapper(c, 1, true);
    }

    public createCanvasWrapper(c: HTMLCanvasElement, scale=1, resizeToWindow=true): CanvasWrapper {
        return new DefaultCanvasWrapper(c, scale, resizeToWindow);
    }

    public draw(canvas=this.canvas as DefaultCanvasWrapper): void {
        let bgColour;
        if (this.colourScheme.zoomBuildings) {
            bgColour = this.domainController.zoom >= 2 ? this.colourScheme.bgColourIn : this.colourScheme.bgColour;
        } else {
            bgColour = this.colourScheme.bgColour;
        }
        

        canvas.setFillStyle(bgColour);
        canvas.clearCanvas();

        // Sea
        canvas.setFillStyle(this.colourScheme.seaColour);
        canvas.setStrokeStyle(this.colourScheme.seaColour);
        canvas.setLineWidth(0.1);
        canvas.drawPolygon(this.seaPolygon);

        // Coastline
        canvas.setStrokeStyle(bgColour);
        canvas.setLineWidth(30 * this.domainController.zoom);
        canvas.drawPolyline(this.coastline);

        // Parks
        canvas.setLineWidth(1);
        canvas.setFillStyle(this.colourScheme.grassColour);
        for (const p of this.parks) canvas.drawPolygon(p);

        // River
        canvas.setFillStyle(this.colourScheme.seaColour);
        canvas.setStrokeStyle(this.colourScheme.seaColour);
        canvas.setLineWidth(1);
        canvas.drawPolygon(this.river);

        // Road outline
        canvas.setStrokeStyle(this.colourScheme.minorRoadOutline);
        canvas.setLineWidth(this.colourScheme.outlineSize + this.colourScheme.minorWidth * this.domainController.zoom);
        for (const s of this.minorRoads) canvas.drawPolyline(s);

        canvas.setStrokeStyle(this.colourScheme.majorRoadOutline);
        canvas.setLineWidth(this.colourScheme.outlineSize + this.colourScheme.majorWidth * this.domainController.zoom);
        for (const s of this.majorRoads) canvas.drawPolyline(s);
        canvas.drawPolyline(this.secondaryRiver);

        canvas.setStrokeStyle(this.colourScheme.mainRoadOutline);
        canvas.setLineWidth(this.colourScheme.outlineSize + this.colourScheme.mainWidth * this.domainController.zoom);
        for (const s of this.mainRoads) canvas.drawPolyline(s);
        for (const s of this.coastlineRoads) canvas.drawPolyline(s);

        // Road inline
        canvas.setStrokeStyle(this.colourScheme.minorRoadColour);
        canvas.setLineWidth(this.colourScheme.minorWidth * this.domainController.zoom);
        for (const s of this.minorRoads) canvas.drawPolyline(s);

        canvas.setStrokeStyle(this.colourScheme.majorRoadColour);
        canvas.setLineWidth(this.colourScheme.majorWidth * this.domainController.zoom);
        for (const s of this.majorRoads) canvas.drawPolyline(s);
        canvas.drawPolyline(this.secondaryRiver);

        canvas.setStrokeStyle(this.colourScheme.mainRoadColour);
        canvas.setLineWidth(this.colourScheme.mainWidth * this.domainController.zoom);
        for (const s of this.mainRoads) canvas.drawPolyline(s);
        for (const s of this.coastlineRoads) canvas.drawPolyline(s);

        if (this.trafficParticles.length > 0) {
            for (const particle of this.trafficParticles) {
                const haloAlpha = Math.max(0, Math.min(1, particle.alpha));
                canvas.setFillStyle(`rgba(0, 0, 0, ${haloAlpha})`);
                canvas.drawCircle(particle.center, particle.haloPx * this.domainController.zoom);
                canvas.setFillStyle('rgba(0, 0, 0, 0.82)');
                canvas.drawCircle(particle.center, particle.radiusPx * this.domainController.zoom);
            }
        }

        if (this.streetLabels.length > 0) {
            const baseFontPx = Math.max(9, Math.min(14, 8 + this.domainController.zoom * 0.65));
            for (const label of this.streetLabels) {
                canvas.setFillStyle(label.color || 'rgb(72,72,72)');
                const fontPx = baseFontPx * (label.fontScale || 1);
                canvas.drawRotatedText(label.text, label.anchor, label.angleRad, fontPx);
            }
        }


        canvas.setLineWidth(1);

        if (this.heightmap) {
            for (const b of this.buildingModels) {
                // Colour based on height

                const parsedRgb = Util.parseCSSColor(this.colourScheme.bgColour).map(v => Math.min(255, v + (b.height * 3.5)));
                canvas.setFillStyle(`rgb(${parsedRgb[0]},${parsedRgb[1]},${parsedRgb[2]})`);
                canvas.setStrokeStyle(`rgb(${parsedRgb[0]},${parsedRgb[1]},${parsedRgb[2]})`);
                canvas.drawPolygon(b.lotScreen);
            }
        } else {
            // Buildings
            const hasHighlightedBuildings = this.buildingRenderStates.some((renderState) => renderState !== 'empty');
            if (!this.colourScheme.zoomBuildings || this.domainController.zoom >= 2 || hasHighlightedBuildings) {
                const animationTimeMs = performance.now();
                for (let i = 0; i < this.lots.length; i++) {
                    const lot = this.lots[i];
                    if (!lot) {
                        continue;
                    }
                    const state = this.buildingRenderStates[i] || 'empty';
                    const colours = resolveBuildingRenderColours(state, this.colourScheme, animationTimeMs);
                    canvas.setFillStyle(colours.fill);
                    canvas.setStrokeStyle(colours.stroke);
                    canvas.drawPolygon(lot);
                }
            }

            // Pseudo-3D
            if (this.colourScheme.buildingModels && (!this.colourScheme.zoomBuildings || this.domainController.zoom >= 2.5)) {
                // This is a cheap approximation that often creates visual artefacts
                // Draws building sides, then rooves instead of properly clipping polygons etc.
                const animationTimeMs = performance.now();
                for (let i = 0; i < this.buildingModels.length; i++) {
                    const b = this.buildingModels[i];
                    if (!b) {
                        continue;
                    }
                    const stateIndex = Number.isInteger(b.lotIndex) ? b.lotIndex : i;
                    const state = this.buildingRenderStates[stateIndex] || 'empty';
                    const colours = resolveBuildingRenderColours(state, this.colourScheme, animationTimeMs);
                    const sideColour = state === 'empty' ? this.colourScheme.buildingSideColour : colours.fill;

                    canvas.setFillStyle(sideColour);
                    canvas.setStrokeStyle(sideColour);
                    for (const s of b.sides) {
                        canvas.drawPolygon(s);
                    }

                    canvas.setFillStyle(colours.fill);
                    canvas.setStrokeStyle(colours.stroke);
                    canvas.drawPolygon(b.roof);
                }
            }
        }

        if (this.showFrame) {
            canvas.setFillStyle(this.colourScheme.frameColour);
            canvas.setStrokeStyle(this.colourScheme.frameColour);
            canvas.drawFrame(30, 30, 30, 30);

            // canvas.setFillStyle(this.colourScheme.frameTextColour);
            // canvas.drawCityName();
        }
    }
}

export class RoughStyle extends Style {
    private dragging = false;

    constructor(c: HTMLCanvasElement, dragController: DragController, colourScheme: ColourScheme) {
        super(dragController, colourScheme);
        this.canvas = this.createCanvasWrapper(c, 1, true);
    }

    public createCanvasWrapper(c: HTMLCanvasElement, scale=1, resizeToWindow=true): CanvasWrapper {
        return new RoughCanvasWrapper(c, scale, resizeToWindow);
    }

    public update() {
        const dragging = this.dragController.isDragging || this.domainController.isScrolling;
        if (!dragging && this.dragging) this.canvas.needsUpdate = true;
        this.dragging = dragging;
    }

    public draw(canvas=this.canvas as RoughCanvasWrapper): void {
        canvas.setOptions({
            fill: this.colourScheme.bgColour,
            roughness: 1,
            bowing: 1,
            fillStyle: 'solid',
            stroke: "none",
        });

        canvas.clearCanvas();

        // Sea
        canvas.setOptions({
            roughness: 0,
            fillWeight: 1,
            fill: this.colourScheme.seaColour,
            fillStyle: 'solid',
            stroke: "none",
            strokeWidth: 1,
        });

        canvas.drawPolygon(this.seaPolygon);

        canvas.setOptions({
            stroke: this.colourScheme.bgColour,
            strokeWidth: 30,
        });
        canvas.drawPolyline(this.coastline);

        canvas.setOptions({
            roughness: 0,
            fillWeight: 1,
            fill: this.colourScheme.seaColour,
            fillStyle: 'solid',
            stroke: "none",
            strokeWidth: 1,
        });

        canvas.drawPolygon(this.river);

        // Parks
        canvas.setOptions({
            fill: this.colourScheme.grassColour,
        });
        this.parks.forEach(p => canvas.drawPolygon(p));

        // Roads
        canvas.setOptions({
            stroke: this.colourScheme.minorRoadColour,
            strokeWidth: 1,
            fill: 'none',
        });

        this.minorRoads.forEach(s => canvas.drawPolyline(s));

        canvas.setOptions({
            strokeWidth: 2,
            stroke: this.colourScheme.majorRoadColour,
        });

        this.majorRoads.forEach(s => canvas.drawPolyline(s));
        canvas.drawPolyline(this.secondaryRiver);

        canvas.setOptions({
            strokeWidth: 3,
            stroke: this.colourScheme.mainRoadColour,
        });

        this.mainRoads.forEach(s => canvas.drawPolyline(s));
        this.coastlineRoads.forEach(s => canvas.drawPolyline(s));

        if (this.trafficParticles.length > 0) {
            canvas.setOptions({
                stroke: 'none',
                fill: 'rgba(0, 0, 0, 0.82)',
            });
            this.trafficParticles.forEach((particle) => canvas.drawSquare(particle.center, particle.radiusPx));
        }

        // Buildings
        if (!this.dragging) {
            // Lots
            if (!this.colourScheme.zoomBuildings || this.domainController.zoom >= 2) {
                const animationTimeMs = performance.now();
                for (let i = 0; i < this.lots.length; i++) {
                    const lot = this.lots[i];
                    if (!lot) {
                        continue;
                    }
                    const state = this.buildingRenderStates[i] || 'empty';
                    const colours = resolveBuildingRenderColours(state, this.colourScheme, animationTimeMs);
                    canvas.setOptions({
                        roughness: 1.2,
                        stroke: colours.stroke,
                        strokeWidth: 1,
                        fill: colours.fill,
                    });
                    canvas.drawPolygon(lot);
                }
            }

            // Pseudo-3D
            if (this.colourScheme.buildingModels && (!this.colourScheme.zoomBuildings || this.domainController.zoom >= 2.5)) {
                // Pseudo-3D
                canvas.setOptions({
                    roughness: 1.2,
                    stroke: this.colourScheme.buildingStroke,
                    strokeWidth: 1,
                    fill: this.colourScheme.buildingSideColour,
                });

                // TODO this can be hugely improved
                const allSidesDistances: Array<[number, Vector[]]> = [];
                const camera = this.domainController.getCameraPosition();
                for (const b of this.buildingModels) {
                    for (const s of b.sides) {
                        const start = s[0];
                        const end = s[1];
                        if (!start || !end) {
                            continue;
                        }
                        const averagePoint = start.clone().add(end).divideScalar(2);
                        allSidesDistances.push([averagePoint.distanceToSquared(camera), s]);
                    }
                }
                allSidesDistances.sort((a, b) => b[0] - a[0]);
                for (const [, side] of allSidesDistances) canvas.drawPolygon(side);

                canvas.setOptions({
                    roughness: 1.2,
                    stroke: this.colourScheme.buildingStroke,
                    strokeWidth: 1,
                    fill: this.colourScheme.buildingColour,
                });

                for (const b of this.buildingModels) canvas.drawPolygon(b.roof);
            }
        }
    }
}
