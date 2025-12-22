/**
 * @fileoverview 3D visualization of hand skeleton in the scene.
 */

import * as THREE from 'three';
import { HAND_COLORS, HAND_LANDMARKS } from '../constants.js';
import type { HandState } from '../types.js';

/** Connections between hand landmarks for bone rendering */
const BONE_CONNECTIONS: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4], // Thumb
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8], // Index
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12], // Middle
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16], // Ring
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20], // Pinky
  [5, 9],
  [9, 13],
  [13, 17], // Palm
];

/**
 * Renders a 3D hand skeleton in the scene.
 */
export class HandVisualizer {
  private readonly scene: THREE.Scene;
  private readonly joints: THREE.Mesh[] = [];
  private readonly bones: THREE.Mesh[] = [];
  private readonly jointMaterial: THREE.MeshBasicMaterial;
  private readonly boneMaterial: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Create materials
    this.jointMaterial = new THREE.MeshBasicMaterial({
      color: HAND_COLORS.NORMAL,
      transparent: true,
      opacity: 0.7,
    });
    this.boneMaterial = new THREE.MeshBasicMaterial({
      color: HAND_COLORS.NORMAL,
      transparent: true,
      opacity: 0.5,
    });

    // Create joint meshes
    for (let i = 0; i < HAND_LANDMARKS.COUNT; i++) {
      const size = i === 0 ? 0.12 : i % 4 === 0 ? 0.1 : 0.07;
      const geometry = new THREE.SphereGeometry(size, 8, 8);
      const joint = new THREE.Mesh(geometry, this.jointMaterial.clone());
      joint.visible = false;
      this.scene.add(joint);
      this.joints.push(joint);
    }

    // Create bone meshes
    for (let i = 0; i < BONE_CONNECTIONS.length; i++) {
      const geometry = new THREE.CylinderGeometry(0.025, 0.025, 1, 6);
      const bone = new THREE.Mesh(geometry, this.boneMaterial.clone());
      bone.visible = false;
      this.scene.add(bone);
      this.bones.push(bone);
    }
  }

  /**
   * Update hand visualization with new positions.
   * @param positions - Array of 3D positions for each joint
   * @param handState - Current hand state for coloring
   */
  update(positions: THREE.Vector3[] | null, handState: HandState = 'normal'): void {
    if (!positions || positions.length < HAND_LANDMARKS.COUNT) {
      this.hide();
      return;
    }

    // Update color based on state
    const color =
      handState === 'outside'
        ? HAND_COLORS.OUTSIDE
        : handState === 'warning'
          ? HAND_COLORS.WARNING
          : HAND_COLORS.NORMAL;
    this.setColor(color);

    // Update joint positions
    for (let i = 0; i < HAND_LANDMARKS.COUNT; i++) {
      const pos = positions[i];
      const joint = this.joints[i];
      if (pos && joint) {
        joint.position.copy(pos);
        joint.visible = true;
      }
    }

    // Update bone positions
    for (let i = 0; i < BONE_CONNECTIONS.length; i++) {
      const connection = BONE_CONNECTIONS[i];
      const bone = this.bones[i];
      if (!connection || !bone) continue;

      const [a, b] = connection;
      const start = positions[a];
      const end = positions[b];

      if (!start || !end) continue;

      // Position bone between joints
      bone.position.lerpVectors(start, end, 0.5);
      bone.scale.y = start.distanceTo(end);
      bone.lookAt(end);
      bone.rotateX(Math.PI / 2);
      bone.visible = true;
    }
  }

  /**
   * Hide all hand visualization elements.
   */
  hide(): void {
    for (const joint of this.joints) {
      joint.visible = false;
    }
    for (const bone of this.bones) {
      bone.visible = false;
    }
  }

  /**
   * Set the color of all hand elements.
   */
  private setColor(color: number): void {
    for (const joint of this.joints) {
      (joint.material as THREE.MeshBasicMaterial).color.setHex(color);
    }
    for (const bone of this.bones) {
      (bone.material as THREE.MeshBasicMaterial).color.setHex(color);
    }
  }

  /**
   * Dispose of all resources.
   */
  dispose(): void {
    for (const joint of this.joints) {
      this.scene.remove(joint);
      joint.geometry.dispose();
      (joint.material as THREE.Material).dispose();
    }
    for (const bone of this.bones) {
      this.scene.remove(bone);
      bone.geometry.dispose();
      (bone.material as THREE.Material).dispose();
    }
  }
}
