import DomainController from './domain_controller';
import TensorField from '../impl/tensor_field';
import {RK4Integrator} from '../impl/integrator';
import {StreamlineParams} from '../impl/streamlines';
import {WaterParams} from '../impl/water_generator';
import { type GenerationBounds } from './map_generation_context';
import Graph from '../impl/graph';
import RoadGUI from './road_gui';
import WaterGUI from './water_gui';
import Vector from '../vector';
import PolygonFinder from '../impl/polygon_finder';
import Style from './style';
import {BuildingRenderState, DefaultStyle, RoughStyle} from './style';
import CanvasWrapper from './canvas_wrapper';
import Buildings, {BuildingModel} from './buildings';
import PolygonUtil from '../impl/polygon_util';
import { findBuildingHit, findOccupiedBuildingHit, type OccupiedBuildingHit } from './occupied_building_hit';
import { buildEasterEggAssignment, type EasterEggId } from './easter_eggs';
import mapLabelNamePool from '../../data/map-label-name-pool.json';
import {
    createBigParkLabels,
    createStreetLabels,
    createWaterLabel,
    normalizeMapLabelNamePool,
    type MapLabelNamePool,
    type MapLabelNamePoolInput,
} from './street_labels';
import { nextStreetLabelSeed } from './street_label_seed';
import {
    TrafficParticlesSimulation,
    type TrafficRenderParticle,
} from './traffic_particles';

/**
 * Handles Map folder, glues together impl
 */
export default class MainGUI {
    private numBigParks: number = 2;
    private numSmallParks: number = 0;
    private clusterBigParks: boolean = false;

    private domainController = DomainController.getInstance();
    private intersections: Vector[] = [];
    private bigParks: Vector[][] = [];
    private smallParks: Vector[][] = [];
    private animate: boolean = true;
    private animationSpeed: number = 30;

    private coastline: WaterGUI;
    private mainRoads: RoadGUI;
    private majorRoads: RoadGUI;
    private minorRoads: RoadGUI;
    private buildings: Buildings;

    // Params
    private coastlineParams: WaterParams;
    private mainParams: StreamlineParams;
    private majorParams: StreamlineParams;
    private minorParams: StreamlineParams = {
        dsep: 20,
        dtest: 15,
        dstep: 1,
        dlookahead: 40,
        dcirclejoin: 5,
        joinangle: 0.1,  // approx 30deg
        pathIterations: 1000,
        seedTries: 300,
        simplifyTolerance: 0.5,
        collideEarly: 0,
    };

    private redraw: boolean = true;
    private occupiedPubkeyByBuildingIndex: Record<number, string> = {};
    private verifiedBuildingIndexSet = new Set<number>();
    private selectedBuildingIndex: number | null = null;
    private hoveredBuildingIndex: number | null = null;
    private dialogHighlightedBuildingIndex: number | null = null;
    private easterEggByBuildingIndex: Record<number, EasterEggId> = {};
    private readonly easterEggDebugEnabled = import.meta.env.DEV;
    private streetLabelsEnabled = true;
    private streetLabelsZoomLevel = 10;
    private streetLabelUsernames: string[] = [];
    private streetLabelSeed = nextStreetLabelSeed();
    private readonly labelNamePool: MapLabelNamePool = normalizeMapLabelNamePool(mapLabelNamePool as MapLabelNamePoolInput);
    private trafficParticlesCount = 12;
    private trafficParticlesSpeed = 1;
    private trafficParticlesWorld: TrafficRenderParticle[] = [];
    private readonly trafficSimulation = new TrafficParticlesSimulation();
    private trafficNetworkDirty = true;

    constructor(private guiFolder: dat.GUI, private tensorField: TensorField, private closeTensorFolder: () => void) {
        const guiBindings = this as unknown as Record<string, unknown>;
        guiFolder.add(this, 'generateEverything');
        // guiFolder.add(this, 'simpleBenchMark');
        const animateController = guiFolder.add(guiBindings, 'animate');
        guiFolder.add(guiBindings, 'animationSpeed');

        this.coastlineParams = Object.assign({
            coastNoise: {
                noiseEnabled: true,
                noiseSize: 30,
                noiseAngle: 20,
            },
            riverNoise: {
                noiseEnabled: true,
                noiseSize: 30,
                noiseAngle: 20,
            },
            riverBankSize: 10,
            riverSize: 30,
        }, this.minorParams);
        this.coastlineParams.pathIterations = 10000;
        this.coastlineParams.simplifyTolerance = 10;

        this.majorParams = Object.assign({}, this.minorParams);
        this.majorParams.dsep = 100;
        this.majorParams.dtest = 30;
        this.majorParams.dlookahead = 200;
        this.majorParams.collideEarly = 0;

        this.mainParams = Object.assign({}, this.minorParams);
        this.mainParams.dsep = 400;
        this.mainParams.dtest = 200;
        this.mainParams.dlookahead = 500;
        this.mainParams.collideEarly = 0;

        const integrator = new RK4Integrator(tensorField, this.minorParams);
        const redraw = () => this.redraw = true;

        this.coastline = new WaterGUI(tensorField, this.coastlineParams, integrator,
            this.guiFolder, closeTensorFolder, 'Water', redraw).initFolder();
        this.mainRoads = new RoadGUI(this.mainParams, integrator, this.guiFolder, closeTensorFolder, 'Main', redraw).initFolder();
        this.majorRoads = new RoadGUI(this.majorParams, integrator, this.guiFolder, closeTensorFolder, 'Major', redraw, this.animate).initFolder();
        this.minorRoads = new RoadGUI(this.minorParams, integrator, this.guiFolder, closeTensorFolder, 'Minor', redraw, this.animate).initFolder();
        
        const parks = guiFolder.addFolder('Parks');
        parks.add({Generate: () => {
            this.buildings.reset();
            this.resetOccupancyState();
            this.addParks();
            this.redraw = true;
        }}, 'Generate');
        parks.add(guiBindings, 'clusterBigParks');
        parks.add(guiBindings, 'numBigParks');
        parks.add(guiBindings, 'numSmallParks');

        const buildingsFolder = guiFolder.addFolder('Buildings');
        this.buildings = new Buildings(tensorField, buildingsFolder, redraw, this.minorParams.dstep, this.animate);
        this.buildings.setPreGenerateCallback(() => {
            const allStreamlines = [];
            allStreamlines.push(...this.mainRoads.allStreamlines);
            allStreamlines.push(...this.majorRoads.allStreamlines);
            allStreamlines.push(...this.minorRoads.allStreamlines);
            allStreamlines.push(...this.coastline.streamlinesWithSecondaryRoad);
            this.buildings.setAllStreamlines(allStreamlines);
        });

        animateController.onChange((b: boolean) => {
            this.majorRoads.animate = b;
            this.minorRoads.animate = b;
            this.buildings.animate = b;
        });

        this.minorRoads.setExistingStreamlines([this.coastline, this.mainRoads, this.majorRoads]);
        this.majorRoads.setExistingStreamlines([this.coastline, this.mainRoads]);
        this.mainRoads.setExistingStreamlines([this.coastline]);

        this.trafficSimulation.setCount(this.trafficParticlesCount);
        this.trafficSimulation.setSpeedMultiplier(this.trafficParticlesSpeed);

        this.coastline.setPreGenerateCallback(() => {
            this.streetLabelSeed = nextStreetLabelSeed(this.streetLabelSeed, true);
            this.mainRoads.clearStreamlines();
            this.majorRoads.clearStreamlines();
            this.minorRoads.clearStreamlines();
            this.bigParks = [];
            this.smallParks = [];
            this.buildings.reset();
            this.resetOccupancyState();
            tensorField.parks = [];
            tensorField.sea = [];
            tensorField.river = [];
            this.markTrafficNetworkDirty();
        });

        this.mainRoads.setPreGenerateCallback(() => {
            this.streetLabelSeed = nextStreetLabelSeed(this.streetLabelSeed, true);
            this.majorRoads.clearStreamlines();
            this.minorRoads.clearStreamlines();
            this.bigParks = [];
            this.smallParks = [];
            this.buildings.reset();
            this.resetOccupancyState();
            tensorField.parks = [];
            tensorField.ignoreRiver = true;
            this.markTrafficNetworkDirty();
        });

        this.mainRoads.setPostGenerateCallback(() => {
            tensorField.ignoreRiver = false;
            this.markTrafficNetworkDirty();
        });

        this.majorRoads.setPreGenerateCallback(() => {
            this.streetLabelSeed = nextStreetLabelSeed(this.streetLabelSeed, true);
            this.minorRoads.clearStreamlines();
            this.bigParks = [];
            this.smallParks = [];
            this.buildings.reset();
            this.resetOccupancyState();
            tensorField.parks = [];
            tensorField.ignoreRiver = true;
            this.markTrafficNetworkDirty();
        });

        this.majorRoads.setPostGenerateCallback(() => {
            tensorField.ignoreRiver = false;
            this.addParks();
            this.redraw = true;
            this.markTrafficNetworkDirty();
        });

        this.minorRoads.setPreGenerateCallback(() => {
            this.streetLabelSeed = nextStreetLabelSeed(this.streetLabelSeed, true);
            this.buildings.reset();
            this.resetOccupancyState();
            this.smallParks = [];
            tensorField.parks = this.bigParks;
            this.markTrafficNetworkDirty();
        });

        this.minorRoads.setPostGenerateCallback(() => {
            this.addParks();
            this.markTrafficNetworkDirty();
        });
    }

    addParks(): void {
        const allStreamlines = this.majorRoads.allStreamlines
            .concat(this.mainRoads.allStreamlines)
            .concat(this.minorRoads.allStreamlines);

        if (allStreamlines.length === 0) {
            this.intersections = [];
            this.bigParks = [];
            this.smallParks = [];
            this.redraw = true;
            return;
        }

        const g = new Graph(allStreamlines, this.minorParams.dstep);
        this.intersections = g.intersections;

        const p = new PolygonFinder(g.nodes, {
                maxLength: 20,
                minArea: 80,
                shrinkSpacing: 4,
                chanceNoDivide: 1,
            }, this.tensorField);
        p.findPolygons();
        const polygons = p.polygons;

        if (this.minorRoads.allStreamlines.length === 0) {
            // Big parks
            this.bigParks = [];
            this.smallParks = [];
            if (polygons.length > this.numBigParks) {
                if (this.clusterBigParks) {
                    // Group in adjacent polygons 
                    const parkIndex = Math.floor(Math.random() * (polygons.length - this.numBigParks));
                    for (let i = parkIndex; i < parkIndex + this.numBigParks; i++) {
                        const park = polygons[i];
                        if (park) {
                            this.bigParks.push(park);
                        }
                    }
                } else {
                    for (let i = 0; i < this.numBigParks; i++) {
                        const parkIndex = Math.floor(Math.random() * polygons.length);
                        const park = polygons[parkIndex];
                        if (park) {
                            this.bigParks.push(park);
                        }
                    }
                }
            } else {
                this.bigParks.push(...polygons);
            }
        } else {
            // Small parks
            this.smallParks = [];
            for (let i = 0; i < this.numSmallParks; i++) {
                const parkIndex = Math.floor(Math.random() * polygons.length);
                const park = polygons[parkIndex];
                if (park) {
                    this.smallParks.push(park);
                }
            }
        }

        this.tensorField.parks = [];
        this.tensorField.parks.push(...this.bigParks);
        this.tensorField.parks.push(...this.smallParks);
    }

    async generateEverything(bounds?: GenerationBounds) {
        await this.coastline.generateRoads(bounds);
        await this.mainRoads.generateRoads(bounds, this.animate);
        await this.majorRoads.generateRoads(bounds, this.animate);
        await this.minorRoads.generateRoads(bounds, this.animate);
        this.redraw = true;
        await this.buildings.generate(this.animate);
        this.recalculateEasterEggAssignments();
        this.markTrafficNetworkDirty();
    }

    update(deltaSeconds: number) {
        let continueUpdate = true;
        const start = performance.now();
        while (continueUpdate && performance.now() - start < this.animationSpeed) {
            const minorChanged = this.minorRoads.update();
            const majorChanged = this.majorRoads.update();
            const mainChanged = this.mainRoads.update();
            const buildingsChanged = this.buildings.update();
            continueUpdate = minorChanged || majorChanged || mainChanged || buildingsChanged;
        }

        if (this.trafficNetworkDirty) {
            this.rebuildTrafficNetwork();
        }
        this.trafficParticlesWorld = this.trafficSimulation.step(deltaSeconds);

        const hasTrafficAnimation = this.trafficParticlesCount > 0 && this.trafficParticlesWorld.length > 0;
        const hasEasterEggDebugAnimation = this.easterEggDebugEnabled && Object.keys(this.easterEggByBuildingIndex).length > 0;
        this.redraw = this.redraw || continueUpdate || hasTrafficAnimation || hasEasterEggDebugAnimation;
    }

    draw(style: Style, forceDraw=false, customCanvas?: CanvasWrapper): void {
        if (!style.needsUpdate && !forceDraw && !this.redraw && !this.domainController.moved) {
            return;
        }

        style.needsUpdate = false;
        this.domainController.moved = false;
        this.redraw = false;

        style.seaPolygon = this.coastline.seaPolygon;
        style.coastline = this.coastline.coastline;
        style.river = this.coastline.river;
        style.lots = this.buildings.lots;
        style.buildingRenderStates = this.getBuildingRenderStates(style.lots.length);

        if (style instanceof DefaultStyle && style.showBuildingModels || style instanceof RoughStyle) {
            style.buildingModels = this.buildings.models;    
        }

        const bigParksScreen = this.bigParks.map((park) => park.map((point) => this.domainController.worldToScreen(point.clone())));
        const smallParksScreen = this.smallParks.map((park) => park.map((point) => this.domainController.worldToScreen(point.clone())));

        style.parks = [];
        style.parks.push(...bigParksScreen);
        style.parks.push(...smallParksScreen);
        style.minorRoads = this.minorRoads.roads;
        style.majorRoads = this.majorRoads.roads;
        style.mainRoads = this.mainRoads.roads;
        style.coastlineRoads = this.coastline.roads;
        style.secondaryRiver = this.coastline.secondaryRiver;
        style.trafficParticles = this.trafficParticlesWorld.map((particle) => ({
            center: this.domainController.worldToScreen(particle.center.clone()),
            radiusPx: particle.radiusPx,
            haloPx: particle.haloPx,
            alpha: particle.alpha,
        }));
        const roadsForStreetLabels: Vector[][] = [];
        roadsForStreetLabels.push(...style.mainRoads);
        roadsForStreetLabels.push(...style.majorRoads);
        roadsForStreetLabels.push(...style.minorRoads);
        roadsForStreetLabels.push(...style.coastlineRoads);
        if (style.secondaryRiver.length > 1) {
            roadsForStreetLabels.push(style.secondaryRiver);
        }
        const streetLabels = createStreetLabels({
            enabled: this.streetLabelsEnabled,
            zoom: this.domainController.zoom,
            zoomThreshold: this.streetLabelsZoomLevel,
            roads: roadsForStreetLabels,
            parks: style.parks,
            usernames: this.streetLabelUsernames,
            pool: this.labelNamePool.street,
            seed: this.getStreetLabelSeed(),
        });

        const waterLabel = createWaterLabel({
            polygon: style.seaPolygon,
            pool: this.labelNamePool.water,
            seed: this.getStreetLabelSeed(),
        });

        const bigParkLabels = createBigParkLabels({
            polygons: bigParksScreen,
            pool: this.labelNamePool.park,
            seed: this.getStreetLabelSeed(),
        });
        const labelColours = style.getMapLabelColours();

        style.streetLabels = [
            ...streetLabels.map((label) => ({
                ...label,
                color: labelColours.street,
            })),
            ...(waterLabel ? [{
                ...waterLabel,
                color: labelColours.water,
                fontScale: 1.35,
            }] : []),
            ...bigParkLabels.map((label) => ({
                ...label,
                color: labelColours.park,
                fontScale: 1.2,
            })),
        ];
        style.draw(customCanvas);
    }

    roadsEmpty(): boolean {
        return this.majorRoads.roadsEmpty()
            && this.minorRoads.roadsEmpty()
            && this.mainRoads.roadsEmpty()
            && this.coastline.roadsEmpty();
    }

    getBuildingFootprintsWorld(): Vector[][] {
        return this.buildings.lotWorlds;
    }

    getBuildingCentroidsWorld(): Vector[] {
        return this.buildings.lotWorldCentroids;
    }

    getBuildingCentroidWorld(index: number): Vector | null {
        return this.buildings.getLotWorldCentroid(index);
    }

    setOccupancyByBuildingIndex(byBuildingIndex: Record<number, string>): void {
        const nextState: Record<number, string> = {};
        Object.keys(byBuildingIndex).forEach((indexKey) => {
            const index = Number(indexKey);
            if (!Number.isInteger(index) || index < 0 || !byBuildingIndex[index]) {
                return;
            }
            nextState[index] = byBuildingIndex[index];
        });

        this.occupiedPubkeyByBuildingIndex = nextState;
        this.recalculateEasterEggAssignments();
        this.verifiedBuildingIndexSet = new Set(
            [...this.verifiedBuildingIndexSet].filter((index) => Boolean(this.occupiedPubkeyByBuildingIndex[index]))
        );
        if (this.hoveredBuildingIndex !== null && !this.occupiedPubkeyByBuildingIndex[this.hoveredBuildingIndex]) {
            this.hoveredBuildingIndex = null;
        }
        this.redraw = true;
    }

    setVerifiedBuildingIndexes(indexes: number[]): void {
        const nextSet = new Set<number>();
        for (const value of indexes || []) {
            if (!Number.isInteger(value) || value < 0 || !this.occupiedPubkeyByBuildingIndex[value]) {
                continue;
            }

            nextSet.add(value);
        }

        if (nextSet.size === this.verifiedBuildingIndexSet.size
            && [...nextSet].every((index) => this.verifiedBuildingIndexSet.has(index))) {
            return;
        }

        this.verifiedBuildingIndexSet = nextSet;
        this.redraw = true;
    }

    setSelectedBuildingIndex(index?: number): void {
        if (index === undefined || index === null) {
            this.selectedBuildingIndex = null;
        } else {
            this.selectedBuildingIndex = index;
        }
        this.redraw = true;
    }

    setHoveredBuildingIndex(index?: number): void {
        const nextHovered = index === undefined || index === null ? null : index;
        if (this.hoveredBuildingIndex === nextHovered) {
            return;
        }

        this.hoveredBuildingIndex = nextHovered;
        this.redraw = true;
    }

    setStreetLabelsEnabled(enabled: boolean): void {
        const nextValue = Boolean(enabled);
        if (this.streetLabelsEnabled === nextValue) {
            return;
        }

        this.streetLabelsEnabled = nextValue;
        this.redraw = true;
    }

    setStreetLabelsZoomLevel(level: number): void {
        const nextValue = Math.max(1, Math.min(20, Math.round(level)));
        if (this.streetLabelsZoomLevel === nextValue) {
            return;
        }

        this.streetLabelsZoomLevel = nextValue;
        this.redraw = true;
    }

    setStreetLabelUsernames(usernames: string[]): void {
        const normalized = this.normalizeStreetLabelUsernames(usernames);
        if (normalized.length === this.streetLabelUsernames.length
            && normalized.every((value, index) => this.streetLabelUsernames[index] === value)) {
            return;
        }

        this.streetLabelUsernames = normalized;
        this.redraw = true;
    }

    setTrafficParticlesCount(count: number): void {
        const nextValue = Math.max(0, Math.min(50, Math.round(count)));
        if (this.trafficParticlesCount === nextValue) {
            return;
        }

        this.trafficParticlesCount = nextValue;
        this.trafficSimulation.setCount(nextValue);
        this.redraw = true;
    }

    setTrafficParticlesSpeed(speed: number): void {
        const nextValue = Number.isFinite(speed) ? Math.max(0.2, Math.min(3, speed)) : 1;
        if (this.trafficParticlesSpeed === nextValue) {
            return;
        }

        this.trafficParticlesSpeed = nextValue;
        this.trafficSimulation.setSpeedMultiplier(nextValue);
        this.redraw = true;
    }

    setDialogHighlightedBuildingIndex(index?: number): void {
        const nextDialog = index === undefined || index === null ? null : index;
        if (this.dialogHighlightedBuildingIndex === nextDialog) {
            return;
        }

        this.dialogHighlightedBuildingIndex = nextDialog;
        this.redraw = true;
    }

    focusBuilding(index: number): boolean {
        const centroid = this.getBuildingCentroidWorld(index);
        if (!centroid) {
            return false;
        }

        this.domainController.animateToWorldPoint(centroid, {
            zoom: 13,
            durationMs: 650,
        });
        this.redraw = true;
        return true;
    }

    getParkCount(): number {
        return this.bigParks.length + this.smallParks.length;
    }

    getOccupiedBuildingAtWorldPoint(point: Vector): OccupiedBuildingHit | null {
        return findOccupiedBuildingHit({
            point,
            footprints: this.getBuildingFootprintsWorld(),
            occupiedPubkeyByBuildingIndex: this.occupiedPubkeyByBuildingIndex,
        });
    }

    getEasterEggBuildingAtWorldPoint(point: Vector): { index: number; easterEggId: EasterEggId } | null {
        const hit = findBuildingHit({
            point,
            footprints: this.getBuildingFootprintsWorld(),
        });

        if (!hit) {
            return null;
        }

        if (this.occupiedPubkeyByBuildingIndex[hit.index]) {
            return null;
        }

        const easterEggId = this.easterEggByBuildingIndex[hit.index];
        if (!easterEggId) {
            return null;
        }

        return {
            index: hit.index,
            easterEggId,
        };
    }

    getEasterEggBuildings(): Array<{ index: number; easterEggId: EasterEggId }> {
        return Object.entries(this.easterEggByBuildingIndex)
            .map(([indexKey, easterEggId]) => ({
                index: Number(indexKey),
                easterEggId,
            }))
            .filter((entry) => Number.isInteger(entry.index) && entry.index >= 0)
            .sort((left, right) => left.index - right.index);
    }

    // OBJ Export methods

    public get seaPolygon(): Vector[] {
        return this.coastline.seaPolygon;
    }

    public get riverPolygon(): Vector[] {
        return this.coastline.river;
    }

    public get buildingModels(): BuildingModel[] {
        return this.buildings.models;
    }

    public getBlocks(): Promise<Vector[][]> {
        return this.buildings.getBlocks();
    }

    public get minorRoadPolygons(): Vector[][] {
        return this.minorRoads.roads.map(r => PolygonUtil.resizeGeometry(r, 1 * this.domainController.zoom, false));
    }

    public get majorRoadPolygons(): Vector[][] {
        return this.majorRoads.roads.concat([this.coastline.secondaryRiver]).map(r => PolygonUtil.resizeGeometry(r, 2 * this.domainController.zoom, false));
    }

    public get mainRoadPolygons(): Vector[][] {
        return this.mainRoads.roads.concat(this.coastline.roads).map(r => PolygonUtil.resizeGeometry(r, 2.5 * this.domainController.zoom, false));
    }

    public get coastlinePolygon(): Vector[] {
        return PolygonUtil.resizeGeometry(this.coastline.coastline, 15 * this.domainController.zoom, false);
    }

    private markTrafficNetworkDirty(): void {
        this.trafficNetworkDirty = true;
    }

    private rebuildTrafficNetwork(): void {
        const roadsWorld: Vector[][] = [];
        roadsWorld.push(...this.mainRoads.allStreamlines);
        roadsWorld.push(...this.majorRoads.allStreamlines);
        roadsWorld.push(...this.minorRoads.allStreamlines);
        roadsWorld.push(...this.coastline.streamlinesWithSecondaryRoad);
        this.trafficSimulation.setNetwork(roadsWorld);
        this.trafficSimulation.setCount(this.trafficParticlesCount);
        this.trafficSimulation.setSpeedMultiplier(this.trafficParticlesSpeed);
        this.trafficNetworkDirty = false;
    }

    private resetOccupancyState(): void {
        this.occupiedPubkeyByBuildingIndex = {};
        this.easterEggByBuildingIndex = {};
        this.verifiedBuildingIndexSet.clear();
        this.selectedBuildingIndex = null;
        this.hoveredBuildingIndex = null;
        this.dialogHighlightedBuildingIndex = null;
        this.redraw = true;
    }

    private getBuildingRenderStates(size: number): BuildingRenderState[] {
        return Array.from({ length: size }, (_, index) => {
            if (this.dialogHighlightedBuildingIndex === index) {
                return 'hovered';
            }

            if (this.selectedBuildingIndex === index) {
                return 'selected';
            }

            if (this.hoveredBuildingIndex === index) {
                return 'hovered';
            }

            if (this.verifiedBuildingIndexSet.has(index)) {
                return 'verified';
            }

            if (this.occupiedPubkeyByBuildingIndex[index]) {
                return 'occupied';
            }

            if (this.easterEggDebugEnabled && this.easterEggByBuildingIndex[index]) {
                return 'easter_egg_debug';
            }

            return 'empty';
        });
    }

    private recalculateEasterEggAssignments(): void {
        this.easterEggByBuildingIndex = buildEasterEggAssignment({
            buildingCount: this.buildings.lotWorlds.length,
            occupiedPubkeyByBuildingIndex: this.occupiedPubkeyByBuildingIndex,
        });
    }

    private normalizeStreetLabelUsernames(usernames: string[]): string[] {
        const normalized: string[] = [];
        const seen = new Set<string>();

        for (const username of usernames || []) {
            if (!username) {
                continue;
            }

            const candidate = username.trim().replace(/\s+/g, ' ');
            if (!candidate) {
                continue;
            }

            const dedupeKey = candidate.toLocaleLowerCase();
            if (seen.has(dedupeKey)) {
                continue;
            }

            seen.add(dedupeKey);
            normalized.push(candidate);
        }

        return normalized;
    }

    private getStreetLabelSeed(): string {
        this.streetLabelSeed = nextStreetLabelSeed(this.streetLabelSeed, false);
        return this.streetLabelSeed;
    }
}
