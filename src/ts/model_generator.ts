import * as log from 'loglevel';
import * as THREE from 'three'
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import JSZip from 'jszip';
import Vector from './vector';
import {BuildingModel} from './ui/buildings';

enum ModelGeneratorStates {
    WAITING,
    SUBTRACT_OCEAN,
    ADD_COASTLINE,
    SUBTRACT_RIVER,
    ADD_ROADS,
    ADD_BLOCKS,
    ADD_BUILDINGS,
    CREATE_ZIP,
}

export default class ModelGenerator {
    private readonly exportSTL = new STLExporter();
    private resolve: (blob: Blob) => void = () => {};
    private zip = new JSZip();
    private state: ModelGeneratorStates = ModelGeneratorStates.WAITING;

    private polygonsToProcess: Vector[][] = [];
    private roadsGeometries: THREE.BufferGeometry[] = [];
    private blocksGeometries: THREE.BufferGeometry[] = [];
    private buildingsGeometries: THREE.BufferGeometry[] = [];
    private buildingsToProcess: BuildingModel[] = [];


    constructor(private ground: Vector[],
                private sea: Vector[],
                private coastline: Vector[],
                private river: Vector[],
                private mainRoads: Vector[][],
                private majorRoads: Vector[][],
                private minorRoads: Vector[][],
                private buildings: BuildingModel[],
                private blocks: Vector[][]) {
    }

    public async getSTL(): Promise<Blob> {
        return new Promise<Blob>(resolve => {
            this.resolve = resolve;
            this.zip = new JSZip();
            this.roadsGeometries = [];
            this.blocksGeometries = [];
            this.buildingsGeometries = [];
            this.polygonsToProcess = [];
            this.buildingsToProcess = [];
            this.zip.file("model/README.txt", "For guidance on working with these exported STL files, see https://github.com/devsigner-xyz/NostrCity/blob/main/docs/empezar/exportacion-y-stl.md");
            this.setState(ModelGeneratorStates.SUBTRACT_OCEAN);
        });
    }

    private setState(s: ModelGeneratorStates): void {
        this.state = s;
        log.info(ModelGeneratorStates[s]);
    }

    /**
     * Return true if processing a model
     * Work done in update loop so main thread isn't swamped
     */
    public update(): boolean {
        switch(this.state) {
            case ModelGeneratorStates.WAITING: {
                return false;
            }
            case ModelGeneratorStates.SUBTRACT_OCEAN: {
                const seaLevelMesh = this.polygonToMesh(this.ground, 0);
                this.addMeshToZip("model/domain.stl", seaLevelMesh);

                const seaMesh = this.polygonToMesh(this.sea, 0);
                this.addMeshToZip("model/sea.stl", seaMesh);
                this.setState(ModelGeneratorStates.ADD_COASTLINE);
                break;
            }
            case ModelGeneratorStates.ADD_COASTLINE: {
                const coastlineMesh = this.polygonToMesh(this.coastline, 0);
                this.addMeshToZip("model/coastline.stl", coastlineMesh);
                this.setState(ModelGeneratorStates.SUBTRACT_RIVER);
                break;
            }
            case ModelGeneratorStates.SUBTRACT_RIVER: {
                const riverMesh = this.polygonToMesh(this.river, 0);
                this.addMeshToZip("model/river.stl", riverMesh);
                this.setState(ModelGeneratorStates.ADD_ROADS);
                this.polygonsToProcess = this.minorRoads.concat(this.majorRoads).concat(this.mainRoads);
                break;
            }
            case ModelGeneratorStates.ADD_ROADS: {
                if (this.polygonsToProcess.length === 0) {
                    const mesh = new THREE.Mesh(this.mergeGeometries(this.roadsGeometries));
                    this.addMeshToZip("model/roads.stl", mesh);
                    
                    this.setState(ModelGeneratorStates.ADD_BLOCKS);
                    this.polygonsToProcess = [...this.blocks];
                    break;
                }

                const road = this.polygonsToProcess.pop();
                if (!road) {
                    break;
                }
                const roadsMesh = this.polygonToMesh(road, 0);
                this.roadsGeometries.push(this.toWorldGeometry(roadsMesh));
                break;
            }
            case ModelGeneratorStates.ADD_BLOCKS: {
                if (this.polygonsToProcess.length === 0) {
                    const mesh = new THREE.Mesh(this.mergeGeometries(this.blocksGeometries));
                    this.addMeshToZip("model/blocks.stl", mesh);

                    this.setState(ModelGeneratorStates.ADD_BUILDINGS);
                    this.buildingsToProcess = [...this.buildings];
                    break; 
                }

                const block = this.polygonsToProcess.pop();
                if (!block) {
                    break;
                }
                const blockMesh = this.polygonToMesh(block, 1);
                this.blocksGeometries.push(this.toWorldGeometry(blockMesh));
                break;
            }
            case ModelGeneratorStates.ADD_BUILDINGS: {
                if (this.buildingsToProcess.length === 0) {
                    const mesh = new THREE.Mesh(this.mergeGeometries(this.buildingsGeometries));
                    this.addMeshToZip("model/buildings.stl", mesh);
                    this.setState(ModelGeneratorStates.CREATE_ZIP);
                    break;
                }

                const b = this.buildingsToProcess.pop();
                if (!b) {
                    break;
                }
                const buildingMesh = this.polygonToMesh(b.lotScreen, b.height);
                this.buildingsGeometries.push(this.toWorldGeometry(buildingMesh));
                break;
            }
            case ModelGeneratorStates.CREATE_ZIP: {
                this.zip.generateAsync({ type: "blob" }).then((blob: Blob) => this.resolve(blob));
                this.setState(ModelGeneratorStates.WAITING);
                break;
            }
            default: {
                break;
            }
        }
        return true;
    }

    /**
     * Rotate and scale mesh so up is in the right direction
     */
    private threeToBlender(mesh: THREE.Object3D): void {
        mesh.scale.multiplyScalar(0.02);
        mesh.updateMatrixWorld(true);
    }

    private addMeshToZip(path: string, mesh: THREE.Mesh): void {
        this.threeToBlender(mesh);

        const geometry = mesh.geometry as THREE.BufferGeometry;
        if (!this.hasGeometryContent(geometry)) {
            this.zip.file(path, this.emptyStl());
            return;
        }

        this.zip.file(path, this.exportSTL.parse(mesh) as string);
    }

    private emptyStl(): string {
        return 'solid exported\nendsolid exported\n';
    }

    private mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
        const populatedGeometries = geometries.filter((geometry) => this.hasGeometryContent(geometry));

        if (populatedGeometries.length === 0) {
            return new THREE.BufferGeometry();
        }

        if (populatedGeometries.length === 1) {
            return populatedGeometries[0]?.clone() ?? new THREE.BufferGeometry();
        }

        return BufferGeometryUtils.mergeGeometries(populatedGeometries, false) ?? new THREE.BufferGeometry();
    }

    private hasGeometryContent(geometry: THREE.BufferGeometry): boolean {
        const positions = geometry.getAttribute('position');
        return positions !== undefined && positions.count > 0;
    }

    private hasPolygonArea(polygon: Vector[]): boolean {
        let twiceArea = 0;

        for (let i = 0; i < polygon.length; i++) {
            const current = polygon[i];
            const next = polygon[(i + 1) % polygon.length];
            if (!current || !next) {
                continue;
            }

            twiceArea += current.x * next.y - next.x * current.y;
        }

        return Math.abs(twiceArea) > 1e-6;
    }

    private toWorldGeometry(mesh: THREE.Mesh): THREE.BufferGeometry {
        mesh.updateMatrixWorld(true);
        return (mesh.geometry as THREE.BufferGeometry).clone().applyMatrix4(mesh.matrixWorld);
    }

    /**
     * Extrude a polygon into a THREE.js mesh
     */
    private polygonToMesh(polygon: Vector[], height: number): THREE.Mesh {
        if (polygon.length < 3) {
            log.error("Tried to export empty polygon as OBJ");
            return new THREE.Mesh(new THREE.BufferGeometry());
        }

        if (!this.hasPolygonArea(polygon)) {
            log.warn("Tried to export degenerate polygon as OBJ");
            return new THREE.Mesh(new THREE.BufferGeometry());
        }

        const firstPoint = polygon[0];
        if (!firstPoint) {
            return new THREE.Mesh(new THREE.BufferGeometry());
        }

        const shape = new THREE.Shape();
        shape.moveTo(firstPoint.x, firstPoint.y);
        for (let i = 1; i < polygon.length; i++) {
            const point = polygon[i];
            if (!point) {
                continue;
            }
            shape.lineTo(point.x, point.y);
        }
        shape.lineTo(firstPoint.x, firstPoint.y);

        if (height === 0) {
            return new THREE.Mesh(new THREE.ShapeGeometry(shape));
        }

        const extrudeSettings = {
            steps: 1,
            depth: height,
            bevelEnabled: false,
        };

        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        const mesh = new THREE.Mesh(geometry);
        // mesh.translateZ(-height);
        mesh.updateMatrixWorld(true);
        return mesh;
    }
}
