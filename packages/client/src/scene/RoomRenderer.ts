/**
 * @fileoverview Room visualization including wireframe bounds and floor grid.
 */

import * as THREE from 'three';
import type { RoomBounds } from '../types.js';
import { SCENE_COLORS } from '../constants.js';

/**
 * Renders the room wireframe and floor grid.
 */
export class RoomRenderer {
  private readonly scene: THREE.Scene;
  private roomWireframe: THREE.Group | null = null;
  private floorGrid: THREE.GridHelper | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
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
      opacity: 0.6,
    });
    const mainWireframe = new THREE.LineSegments(edges, material);
    this.roomWireframe.add(mainWireframe);

    // Add subtle glow layer (slightly larger, more transparent)
    const glowGeometry = new THREE.BoxGeometry(width + 0.1, height + 0.1, depth + 0.1);
    const glowEdges = new THREE.EdgesGeometry(glowGeometry);
    const glowMaterial = new THREE.LineBasicMaterial({
      color: SCENE_COLORS.ROOM_WIREFRAME,
      transparent: true,
      opacity: 0.15,
    });
    const glowWireframe = new THREE.LineSegments(glowEdges, glowMaterial);
    this.roomWireframe.add(glowWireframe);

    // Center the wireframe group
    this.roomWireframe.position.set(
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      (minZ + maxZ) / 2
    );

    this.scene.add(this.roomWireframe);

    // Add floor grid inside the room
    this.floorGrid = new THREE.GridHelper(
      Math.max(width, depth),
      20,
      SCENE_COLORS.GRID_MAIN,
      SCENE_COLORS.GRID_SECONDARY
    );
    this.floorGrid.position.y = minY;
    
    // Make grid transparent
    const gridMaterial = this.floorGrid.material;
    if (Array.isArray(gridMaterial)) {
      gridMaterial.forEach((mat) => {
        mat.transparent = true;
        mat.opacity = 0.3;
      });
    } else {
      gridMaterial.transparent = true;
      gridMaterial.opacity = 0.3;
    }
    
    this.scene.add(this.floorGrid);
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

    if (this.floorGrid) {
      this.scene.remove(this.floorGrid);
      this.floorGrid.geometry.dispose();
      const material = this.floorGrid.material;
      if (Array.isArray(material)) {
        material.forEach((mat) => mat.dispose());
      } else {
        material.dispose();
      }
      this.floorGrid = null;
    }
  }
}

