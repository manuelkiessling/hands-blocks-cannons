/**
 * @fileoverview Room visualization including wireframe bounds and floor grid.
 */

import * as THREE from 'three';
import { ROOM_VISUAL, SCENE_COLORS } from '../constants.js';
import type { RoomBounds } from '../types.js';

/**
 * Renders the room wireframe and floor grid.
 */
export class RoomRenderer {
  private readonly scene: THREE.Scene;
  private roomWireframe: THREE.Group | null = null;
  private floorGrid: THREE.GridHelper | null = null;
  private cornerMarkers: THREE.Group | null = null;
  private energyFields: THREE.Group | null = null;
  private pulseMaterials: THREE.LineBasicMaterial[] = [];
  private baseOpacity = 0.6;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Create a corner marker (L-shaped bracket).
   */
  private createCornerMarker(size: number): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.LineBasicMaterial({
      color: SCENE_COLORS.ROOM_WIREFRAME,
      transparent: true,
      opacity: ROOM_VISUAL.CORNER_OPACITY,
    });
    this.pulseMaterials.push(material);

    // Create L-shape in XY plane
    const points1 = [
      new THREE.Vector3(0, size, 0),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(size, 0, 0),
    ];
    const line1 = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points1), material);
    group.add(line1);

    // Create L-shape in XZ plane
    const points2 = [new THREE.Vector3(0, 0, size), new THREE.Vector3(0, 0, 0)];
    const line2 = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points2),
      material.clone()
    );
    this.pulseMaterials.push(line2.material as THREE.LineBasicMaterial);
    group.add(line2);

    return group;
  }

  /**
   * Create or update the room wireframe visualization.
   * @param room - Room bounds to visualize
   */
  createRoomWireframe(room: RoomBounds): void {
    // Remove old wireframe if exists
    this.dispose();

    const { minX, maxX, minY, maxY, minZ, maxZ } = room;
    const width = maxX - minX;
    const height = maxY - minY;
    const depth = maxZ - minZ;

    // Create a group for the room visualization
    this.roomWireframe = new THREE.Group();

    // Main wireframe with cyan/teal sci-fi color
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const edges = new THREE.EdgesGeometry(geometry);
    const material = new THREE.LineBasicMaterial({
      color: SCENE_COLORS.ROOM_WIREFRAME,
      transparent: true,
      opacity: this.baseOpacity,
    });
    this.pulseMaterials.push(material);
    const mainWireframe = new THREE.LineSegments(edges, material);
    this.roomWireframe.add(mainWireframe);

    // Add subtle glow layer (slightly larger, more transparent)
    const glowGeometry = new THREE.BoxGeometry(width + 0.15, height + 0.15, depth + 0.15);
    const glowEdges = new THREE.EdgesGeometry(glowGeometry);
    const glowMaterial = new THREE.LineBasicMaterial({
      color: SCENE_COLORS.ROOM_WIREFRAME,
      transparent: true,
      opacity: 0.2,
    });
    const glowWireframe = new THREE.LineSegments(glowEdges, glowMaterial);
    this.roomWireframe.add(glowWireframe);

    // Center the wireframe group
    this.roomWireframe.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);

    this.scene.add(this.roomWireframe);

    // Create corner markers
    this.cornerMarkers = new THREE.Group();
    const cornerSize = ROOM_VISUAL.CORNER_SIZE;

    // 8 corners of the room
    const corners: { pos: [number, number, number]; rot: [number, number, number] }[] = [
      { pos: [minX, minY, minZ], rot: [0, 0, 0] },
      { pos: [maxX, minY, minZ], rot: [0, Math.PI / 2, 0] },
      { pos: [maxX, minY, maxZ], rot: [0, Math.PI, 0] },
      { pos: [minX, minY, maxZ], rot: [0, -Math.PI / 2, 0] },
      { pos: [minX, maxY, minZ], rot: [0, 0, Math.PI] },
      { pos: [maxX, maxY, minZ], rot: [0, Math.PI / 2, Math.PI] },
      { pos: [maxX, maxY, maxZ], rot: [0, Math.PI, Math.PI] },
      { pos: [minX, maxY, maxZ], rot: [0, -Math.PI / 2, Math.PI] },
    ];

    for (const corner of corners) {
      const marker = this.createCornerMarker(cornerSize);
      const [px, py, pz] = corner.pos;
      const [rx, ry, rz] = corner.rot;
      marker.position.set(px, py, pz);
      marker.rotation.set(rx, ry, rz);
      this.cornerMarkers.add(marker);
    }
    this.scene.add(this.cornerMarkers);

    // Create subtle energy field panels on the walls
    this.energyFields = new THREE.Group();
    const fieldMaterial = new THREE.MeshBasicMaterial({
      color: SCENE_COLORS.ROOM_WIREFRAME,
      transparent: true,
      opacity: ROOM_VISUAL.FIELD_OPACITY,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Front and back walls (Z planes)
    const wallGeomZ = new THREE.PlaneGeometry(width, height);
    const frontWall = new THREE.Mesh(wallGeomZ, fieldMaterial);
    frontWall.position.set((minX + maxX) / 2, (minY + maxY) / 2, minZ);
    this.energyFields.add(frontWall);

    const backWall = new THREE.Mesh(wallGeomZ, fieldMaterial.clone());
    backWall.position.set((minX + maxX) / 2, (minY + maxY) / 2, maxZ);
    this.energyFields.add(backWall);

    // Side walls (X planes)
    const wallGeomX = new THREE.PlaneGeometry(depth, height);
    const leftWall = new THREE.Mesh(wallGeomX, fieldMaterial.clone());
    leftWall.position.set(minX, (minY + maxY) / 2, (minZ + maxZ) / 2);
    leftWall.rotation.y = Math.PI / 2;
    this.energyFields.add(leftWall);

    const rightWall = new THREE.Mesh(wallGeomX, fieldMaterial.clone());
    rightWall.position.set(maxX, (minY + maxY) / 2, (minZ + maxZ) / 2);
    rightWall.rotation.y = Math.PI / 2;
    this.energyFields.add(rightWall);

    // Top wall (Y plane)
    const wallGeomY = new THREE.PlaneGeometry(width, depth);
    const topWall = new THREE.Mesh(wallGeomY, fieldMaterial.clone());
    topWall.position.set((minX + maxX) / 2, maxY, (minZ + maxZ) / 2);
    topWall.rotation.x = Math.PI / 2;
    this.energyFields.add(topWall);

    this.scene.add(this.energyFields);

    // Add floor grid inside the room
    this.floorGrid = new THREE.GridHelper(
      Math.max(width, depth),
      24, // More grid lines for detail
      SCENE_COLORS.GRID_MAIN,
      SCENE_COLORS.GRID_SECONDARY
    );
    this.floorGrid.position.y = minY;

    // Make grid transparent
    const gridMaterial = this.floorGrid.material;
    if (Array.isArray(gridMaterial)) {
      for (const mat of gridMaterial) {
        mat.transparent = true;
        mat.opacity = 0.35;
      }
    } else {
      gridMaterial.transparent = true;
      gridMaterial.opacity = 0.35;
    }

    this.scene.add(this.floorGrid);
  }

  /**
   * Update room visual animations (call each frame).
   * @param elapsedTime - Total elapsed time in seconds
   */
  update(elapsedTime: number): void {
    // Pulse the wireframe edges
    const pulseValue =
      this.baseOpacity + Math.sin(elapsedTime * ROOM_VISUAL.PULSE_SPEED) * ROOM_VISUAL.PULSE_RANGE;

    for (const material of this.pulseMaterials) {
      material.opacity = pulseValue;
    }
  }

  /**
   * Dispose of all room visualization objects.
   */
  dispose(): void {
    if (this.roomWireframe) {
      this.scene.remove(this.roomWireframe);
      this.roomWireframe.traverse((obj) => {
        if (obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
          if (obj.material instanceof THREE.Material) {
            obj.material.dispose();
          }
        }
      });
      this.roomWireframe = null;
    }

    if (this.cornerMarkers) {
      this.scene.remove(this.cornerMarkers);
      this.cornerMarkers.traverse((obj) => {
        if (obj instanceof THREE.Line) {
          obj.geometry.dispose();
          if (obj.material instanceof THREE.Material) {
            obj.material.dispose();
          }
        }
      });
      this.cornerMarkers = null;
    }

    if (this.energyFields) {
      this.scene.remove(this.energyFields);
      this.energyFields.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (obj.material instanceof THREE.Material) {
            obj.material.dispose();
          }
        }
      });
      this.energyFields = null;
    }

    if (this.floorGrid) {
      this.scene.remove(this.floorGrid);
      this.floorGrid.geometry.dispose();
      const material = this.floorGrid.material;
      if (Array.isArray(material)) {
        for (const mat of material) {
          mat.dispose();
        }
      } else {
        material.dispose();
      }
      this.floorGrid = null;
    }

    this.pulseMaterials = [];
  }
}
