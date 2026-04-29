import { describe, expect, test, vi } from 'vitest';
import DomainController from './domain_controller';
import Vector from '../vector';
import { DefaultStyle, resolveBuildingRenderColours, resolveMapLabelColours, type ColourScheme } from './style';
import type { BuildingModel } from './buildings';

const baseScheme: ColourScheme = {
    bgColour: 'rgb(255,255,255)',
    seaColour: 'rgb(0,0,255)',
    minorRoadColour: 'rgb(100,100,100)',
    buildingColour: 'rgb(240,240,240)',
    buildingStroke: 'rgb(200,200,200)',
};

describe('resolveBuildingRenderColours', () => {
    test('returns default scheme colors for empty buildings', () => {
        const colours = resolveBuildingRenderColours('empty', baseScheme);
        expect(colours).toEqual({
            fill: 'rgb(240,240,240)',
            stroke: 'rgb(200,200,200)',
        });
    });

    test('returns occupied colors for occupied buildings', () => {
        const colours = resolveBuildingRenderColours('occupied', baseScheme);
        expect(colours).toEqual({
            fill: 'rgb(247,240,206)',
            stroke: 'rgb(228,202,120)',
        });
    });

    test('returns verified colors for verified buildings', () => {
        const colours = resolveBuildingRenderColours('verified', baseScheme);
        expect(colours).toEqual({
            fill: 'rgb(210,244,220)',
            stroke: 'rgb(77,156,94)',
        });
    });

    test('renders easter egg debug buildings with animated fill and occupied-like border', () => {
        const coloursAtStart = resolveBuildingRenderColours('easter_egg_debug' as any, baseScheme, 0);
        const coloursLater = resolveBuildingRenderColours('easter_egg_debug' as any, baseScheme, 550);

        expect(coloursAtStart.fill).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
        expect(coloursAtStart.fill).not.toBe('rgb(240,240,240)');
        expect(coloursAtStart.stroke).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
        expect(coloursAtStart.stroke).not.toBe('rgb(200,200,200)');
        expect(coloursAtStart.stroke).not.toBe('rgb(228,202,120)');
        expect(coloursLater.fill).not.toBe(coloursAtStart.fill);
        expect(coloursLater.stroke).not.toBe(coloursAtStart.stroke);
    });

    test('renders easter egg debug buildings with dark scheme occupied colors', () => {
        const darkScheme: ColourScheme = {
            ...baseScheme,
            buildingColour: '#10164A',
            buildingStroke: '#8E35FF',
            occupiedBuildingColour: '#35D7FF',
            occupiedBuildingStroke: '#8E35FF',
        };

        expect(resolveBuildingRenderColours('easter_egg_debug', darkScheme, 0)).toEqual({
            fill: 'rgb(25,66,116)',
            stroke: 'rgb(142,53,255)',
        });
    });

    test('returns selected colors for selected buildings', () => {
        const colours = resolveBuildingRenderColours('selected', baseScheme);
        expect(colours).toEqual({
            fill: 'rgb(255,214,118)',
            stroke: 'rgb(233,166,52)',
        });
    });

    test('returns vivid hover colors for hovered occupied buildings', () => {
        const colours = resolveBuildingRenderColours('hovered' as any, baseScheme);
        expect(colours).toEqual({
            fill: 'rgb(255,151,66)',
            stroke: 'rgb(229,94,24)',
        });
    });

    test('uses colour scheme overrides for occupied and hovered buildings', () => {
        const darkScheme: ColourScheme = {
            ...baseScheme,
            occupiedBuildingColour: '#35D7FF',
            occupiedBuildingStroke: '#8EEAFF',
            hoveredBuildingColour: '#D33CFF',
            hoveredBuildingStroke: '#F6F8FF',
        };

        expect(resolveBuildingRenderColours('occupied', darkScheme)).toEqual({
            fill: '#35D7FF',
            stroke: '#8EEAFF',
        });
        expect(resolveBuildingRenderColours('hovered', darkScheme)).toEqual({
            fill: '#D33CFF',
            stroke: '#F6F8FF',
        });
    });
});

describe('resolveMapLabelColours', () => {
    test('uses light label defaults when scheme has no overrides', () => {
        expect(resolveMapLabelColours(baseScheme)).toEqual({
            street: 'rgb(72,72,72)',
            water: 'rgb(67, 120, 207)',
            park: 'rgb(59, 139, 74)',
        });
    });

    test('uses colour scheme label overrides for dark presets', () => {
        const darkScheme: ColourScheme = {
            ...baseScheme,
            streetLabelColour: '#030511',
            waterLabelColour: '#8EEAFF',
            parkLabelColour: '#FF8AF3',
        };

        expect(resolveMapLabelColours(darkScheme)).toEqual({
            street: '#030511',
            water: '#8EEAFF',
            park: '#FF8AF3',
        });
    });
});

describe('DefaultStyle occupied/selected rendering with building models', () => {
    test('renders occupied lots even below zoom threshold when occupancy exists', () => {
        const drawCalls: Array<{ fill: string; stroke: string; polygon: Vector[] }> = [];
        const fakeCanvas = {
            needsUpdate: false,
            canvasScale: 1,
            currentFill: '',
            currentStroke: '',
            setFillStyle(colour: string) {
                this.currentFill = colour;
            },
            setStrokeStyle(colour: string) {
                this.currentStroke = colour;
            },
            setLineWidth() {},
            clearCanvas() {},
            drawPolyline() {},
            drawFrame() {},
            drawPolygon(polygon: Vector[]) {
                drawCalls.push({
                    fill: this.currentFill,
                    stroke: this.currentStroke,
                    polygon,
                });
            },
        };

        class TestStyle extends DefaultStyle {
            public createCanvasWrapper() {
                return fakeCanvas as any;
            }
        }

        const scheme: ColourScheme = {
            ...baseScheme,
            zoomBuildings: true,
            buildingModels: false,
        };

        const style = new TestStyle({} as HTMLCanvasElement, {} as any, { ...scheme });
        const lot = [new Vector(0, 0), new Vector(2, 0), new Vector(2, 2), new Vector(0, 2)];

        style.lots = [lot];
        style.buildingRenderStates = ['occupied'];

        const domainController = DomainController.getInstance();
        domainController.zoom = 1;

        style.draw();

        const lotDraw = drawCalls.find((call) => call.polygon === lot);
        expect(lotDraw).toBeDefined();
        expect(lotDraw).toMatchObject({
            fill: 'rgb(247,240,206)',
            stroke: 'rgb(228,202,120)',
        });
    });

    test('keeps selected roof highlighted when 3D building models are enabled', () => {
        const drawCalls: Array<{ fill: string; stroke: string; polygon: Vector[] }> = [];
        const fakeCanvas = {
            needsUpdate: false,
            canvasScale: 1,
            currentFill: '',
            currentStroke: '',
            setFillStyle(colour: string) {
                this.currentFill = colour;
            },
            setStrokeStyle(colour: string) {
                this.currentStroke = colour;
            },
            setLineWidth() {},
            clearCanvas() {},
            drawPolyline() {},
            drawFrame() {},
            drawPolygon(polygon: Vector[]) {
                drawCalls.push({
                    fill: this.currentFill,
                    stroke: this.currentStroke,
                    polygon,
                });
            },
        };

        class TestStyle extends DefaultStyle {
            public createCanvasWrapper() {
                return fakeCanvas as any;
            }
        }

        const scheme: ColourScheme = {
            ...baseScheme,
            zoomBuildings: true,
            buildingModels: true,
        };

        const style = new TestStyle({} as HTMLCanvasElement, {} as any, { ...scheme });
        const lot = [new Vector(0, 0), new Vector(2, 0), new Vector(2, 2), new Vector(0, 2)];
        const roof = [new Vector(0.5, 0.5), new Vector(2.5, 0.5), new Vector(2.5, 2.5), new Vector(0.5, 2.5)];

        const buildingModel: BuildingModel = {
            lotIndex: 0,
            height: 10,
            lotWorld: [],
            lotScreen: lot,
            roof,
            sides: [],
        };

        style.lots = [lot];
        style.buildingModels = [buildingModel];
        style.buildingRenderStates = ['selected'];

        const domainController = DomainController.getInstance();
        domainController.zoom = 3;

        style.draw();

        const roofDraw = drawCalls.find((call) => call.polygon === roof);
        expect(roofDraw).toBeDefined();
        expect(roofDraw).toMatchObject({
            fill: 'rgb(255,214,118)',
            stroke: 'rgb(233,166,52)',
        });
    });

    test('maps selected state to the correct building even when model order differs', () => {
        const drawCalls: Array<{ fill: string; stroke: string; polygon: Vector[] }> = [];
        const fakeCanvas = {
            needsUpdate: false,
            canvasScale: 1,
            currentFill: '',
            currentStroke: '',
            setFillStyle(colour: string) {
                this.currentFill = colour;
            },
            setStrokeStyle(colour: string) {
                this.currentStroke = colour;
            },
            setLineWidth() {},
            clearCanvas() {},
            drawPolyline() {},
            drawFrame() {},
            drawPolygon(polygon: Vector[]) {
                drawCalls.push({
                    fill: this.currentFill,
                    stroke: this.currentStroke,
                    polygon,
                });
            },
        };

        class TestStyle extends DefaultStyle {
            public createCanvasWrapper() {
                return fakeCanvas as any;
            }
        }

        const scheme: ColourScheme = {
            ...baseScheme,
            zoomBuildings: true,
            buildingModels: true,
        };

        const style = new TestStyle({} as HTMLCanvasElement, {} as any, { ...scheme });
        const lotA = [new Vector(0, 0), new Vector(2, 0), new Vector(2, 2), new Vector(0, 2)];
        const roofA = [new Vector(0.5, 0.5), new Vector(2.5, 0.5), new Vector(2.5, 2.5), new Vector(0.5, 2.5)];
        const lotB = [new Vector(10, 10), new Vector(12, 10), new Vector(12, 12), new Vector(10, 12)];
        const roofB = [new Vector(10.5, 10.5), new Vector(12.5, 10.5), new Vector(12.5, 12.5), new Vector(10.5, 12.5)];

        const modelA: BuildingModel = {
            lotIndex: 0,
            height: 20,
            lotWorld: [],
            lotScreen: lotA,
            roof: roofA,
            sides: [],
        };

        const modelB: BuildingModel = {
            lotIndex: 1,
            height: 10,
            lotWorld: [],
            lotScreen: lotB,
            roof: roofB,
            sides: [],
        };

        style.lots = [lotA, lotB];
        style.buildingRenderStates = ['selected', 'empty'];
        style.buildingModels = [modelB, modelA];

        const domainController = DomainController.getInstance();
        domainController.zoom = 3;

        style.draw();

        const roofADraw = drawCalls.find((call) => call.polygon === roofA);
        expect(roofADraw).toBeDefined();
        expect(roofADraw).toMatchObject({
            fill: 'rgb(255,214,118)',
            stroke: 'rgb(233,166,52)',
        });
    });

    test('draws traffic particle halos in DefaultStyle when particles exist', () => {
        const drawCircle = vi.fn();
        const setFillStyle = vi.fn();
        const fakeCanvas = {
            needsUpdate: false,
            canvasScale: 1,
            setFillStyle,
            setStrokeStyle() {},
            setLineWidth() {},
            clearCanvas() {},
            drawPolyline() {},
            drawFrame() {},
            drawPolygon() {},
            drawCircle,
            drawRotatedText() {},
        };

        class TestStyle extends DefaultStyle {
            public createCanvasWrapper() {
                return fakeCanvas as any;
            }
        }

        const style = new TestStyle({} as HTMLCanvasElement, {} as any, { ...baseScheme }) as any;
        style.trafficParticles = [
            {
                center: new Vector(10, 10),
                radiusPx: 1.5,
                haloPx: 5,
                alpha: 0.16,
            },
        ];

        const domainController = DomainController.getInstance();
        domainController.zoom = 1;

        style.draw();

        expect(drawCircle).toHaveBeenCalledTimes(2);
        expect(setFillStyle).toHaveBeenCalledWith('rgba(0, 0, 0, 0.16)');
        expect(setFillStyle).toHaveBeenCalledWith('rgba(0, 0, 0, 0.82)');
    });

    test('draws styled map labels with per-label color and font scale', () => {
        const drawRotatedText = vi.fn();
        const setFillStyle = vi.fn();
        const fakeCanvas = {
            needsUpdate: false,
            canvasScale: 1,
            setFillStyle,
            setStrokeStyle() {},
            setLineWidth() {},
            clearCanvas() {},
            drawPolyline() {},
            drawFrame() {},
            drawPolygon() {},
            drawCircle() {},
            drawRotatedText,
        };

        class TestStyle extends DefaultStyle {
            public createCanvasWrapper() {
                return fakeCanvas as any;
            }
        }

        const style = new TestStyle({} as HTMLCanvasElement, {} as any, { ...baseScheme }) as any;
        style.streetLabels = [
            {
                text: 'Blue Sea',
                anchor: new Vector(10, 10),
                angleRad: 0,
                color: 'rgb(67, 120, 207)',
                fontScale: 1.35,
            },
            {
                text: 'Central Park',
                anchor: new Vector(20, 20),
                angleRad: 0,
                color: 'rgb(59, 139, 74)',
                fontScale: 1.2,
            },
        ];

        const domainController = DomainController.getInstance();
        domainController.zoom = 2;

        style.draw();

        expect(setFillStyle).toHaveBeenCalledWith('rgb(67, 120, 207)');
        expect(setFillStyle).toHaveBeenCalledWith('rgb(59, 139, 74)');

        const baseFontPx = Math.max(9, Math.min(14, 8 + domainController.zoom * 0.65));
        const waterCall = drawRotatedText.mock.calls.find((call) => call[0] === 'Blue Sea');
        const parkCall = drawRotatedText.mock.calls.find((call) => call[0] === 'Central Park');

        expect(waterCall).toBeDefined();
        expect(parkCall).toBeDefined();
        expect(waterCall![3]).toBeCloseTo(baseFontPx * 1.35, 5);
        expect(parkCall![3]).toBeCloseTo(baseFontPx * 1.2, 5);
    });
});
