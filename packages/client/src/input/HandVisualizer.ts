/**
 * @fileoverview Volumetric 3D hand visualization with translucent surfaces.
 */

import * as THREE from 'three';
import { HAND_COLORS, HAND_LANDMARKS } from '../constants.js';

/** Finger paths from base to tip */
const FINGER_PATHS = [
  [0, 1, 2, 3, 4], // Thumb
  [0, 5, 6, 7, 8], // Index
  [0, 9, 10, 11, 12], // Middle
  [0, 13, 14, 15, 16], // Ring
  [0, 17, 18, 19, 20], // Pinky
];

/** Palm triangles for the filled palm mesh */
const PALM_TRIANGLES: Array<[number, number, number]> = [
  // Central palm
  [0, 5, 9],
  [0, 9, 13],
  [0, 13, 17],
  // Finger base connections
  [5, 6, 9],
  [9, 6, 10],
  [9, 10, 13],
  [13, 10, 14],
  [13, 14, 17],
  [17, 14, 18],
];

/** Fingertip landmark indices */
const FINGERTIPS = [4, 8, 12, 16, 20];

/** Width profile for finger segments (wider at base, narrower at tip) */
const FINGER_WIDTH = [0.18, 0.14, 0.11, 0.09, 0.07];

/**
 * Renders a volumetric hand with translucent curved surfaces.
 */
export class HandVisualizer {
  private readonly scene: THREE.Scene;

  // Finger tube meshes (one per finger)
  private readonly fingerMeshes: THREE.Mesh[] = [];

  // Palm surface mesh
  private readonly palmMesh: THREE.Mesh;

  // Fingertip spheres for soft ends
  private readonly fingertipMeshes: THREE.Mesh[] = [];

  // Shared materials
  private readonly fingerMaterial: THREE.MeshStandardMaterial;
  private readonly palmMaterial: THREE.MeshStandardMaterial;
  private readonly tipMaterial: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Create translucent finger material
    this.fingerMaterial = new THREE.MeshStandardMaterial({
      color: HAND_COLORS.NORMAL,
      emissive: HAND_COLORS.NORMAL,
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.6,
      roughness: 0.4,
      metalness: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Create palm material (slightly more transparent)
    this.palmMaterial = new THREE.MeshStandardMaterial({
      color: HAND_COLORS.NORMAL,
      emissive: HAND_COLORS.NORMAL,
      emissiveIntensity: 0.2,
      transparent: true,
      opacity: 0.4,
      roughness: 0.5,
      metalness: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Create fingertip material (brighter glow)
    this.tipMaterial = new THREE.MeshStandardMaterial({
      color: HAND_COLORS.NORMAL,
      emissive: HAND_COLORS.NORMAL,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.7,
      roughness: 0.2,
      metalness: 0.0,
    });

    // Create finger tube meshes
    for (let i = 0; i < FINGER_PATHS.length; i++) {
      // Create a tube geometry placeholder (will be updated each frame)
      const geometry = new THREE.BufferGeometry();
      const mesh = new THREE.Mesh(geometry, this.fingerMaterial.clone());
      mesh.visible = false;
      mesh.renderOrder = 1;
      this.scene.add(mesh);
      this.fingerMeshes.push(mesh);
    }

    // Create palm mesh
    const palmGeometry = new THREE.BufferGeometry();
    this.palmMesh = new THREE.Mesh(palmGeometry, this.palmMaterial);
    this.palmMesh.visible = false;
    this.palmMesh.renderOrder = 0;
    this.scene.add(this.palmMesh);

    // Create fingertip meshes
    for (let i = 0; i < FINGERTIPS.length; i++) {
      const geometry = new THREE.SphereGeometry(FINGER_WIDTH[4] ?? 0.07, 12, 12);
      const mesh = new THREE.Mesh(geometry, this.tipMaterial.clone());
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.scene.add(mesh);
      this.fingertipMeshes.push(mesh);
    }
  }

  /**
   * Update hand visualization with new positions.
   */
  update(positions: THREE.Vector3[] | null): void {
    if (!positions || positions.length < HAND_LANDMARKS.COUNT) {
      this.hide();
      return;
    }

    // Update finger tubes
    for (let i = 0; i < FINGER_PATHS.length; i++) {
      const path = FINGER_PATHS[i];
      const mesh = this.fingerMeshes[i];
      if (!path || !mesh) continue;

      const points: THREE.Vector3[] = [];
      for (const idx of path) {
        const pos = positions[idx];
        if (pos) points.push(pos.clone());
      }

      if (points.length >= 2) {
        this.updateFingerTube(mesh, points, i);
        mesh.visible = true;
      } else {
        mesh.visible = false;
      }
    }

    // Update palm mesh
    this.updatePalmMesh(positions);

    // Update fingertip meshes
    for (let i = 0; i < FINGERTIPS.length; i++) {
      const tipIdx = FINGERTIPS[i];
      const mesh = this.fingertipMeshes[i];
      const pos = tipIdx !== undefined ? positions[tipIdx] : undefined;

      if (mesh && pos) {
        mesh.position.copy(pos);
        mesh.visible = true;
      } else if (mesh) {
        mesh.visible = false;
      }
    }
  }

  /**
   * Create a smooth tube along finger path with variable width.
   */
  private updateFingerTube(mesh: THREE.Mesh, points: THREE.Vector3[], fingerIndex: number): void {
    if (points.length < 2) return;

    // Create smooth curve through points
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.3);

    // Generate tube geometry with variable radius
    const segments = 16;
    const radialSegments = 8;

    const tubularPoints: THREE.Vector3[] = [];
    const radiusValues: number[] = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      tubularPoints.push(curve.getPoint(t));

      // Calculate radius based on position along finger
      const widthIndex = Math.min(
        Math.floor(t * (FINGER_WIDTH.length - 1)),
        FINGER_WIDTH.length - 1
      );
      const nextIndex = Math.min(widthIndex + 1, FINGER_WIDTH.length - 1);
      const localT = (t * (FINGER_WIDTH.length - 1)) % 1;
      const w1 = FINGER_WIDTH[widthIndex] ?? 0.1;
      const w2 = FINGER_WIDTH[nextIndex] ?? 0.1;
      const radius = w1 + (w2 - w1) * localT;

      // Thumb is slightly thicker
      const thumbMultiplier = fingerIndex === 0 ? 1.2 : 1.0;
      radiusValues.push(radius * thumbMultiplier);
    }

    // Build tube geometry manually for variable radius
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < tubularPoints.length; i++) {
      const point = tubularPoints[i];
      const radius = radiusValues[i];

      if (!point || radius === undefined) continue;

      // Get tangent direction
      let tangent: THREE.Vector3;
      if (i === 0) {
        const next = tubularPoints[1];
        tangent = next
          ? new THREE.Vector3().subVectors(next, point).normalize()
          : new THREE.Vector3(0, 1, 0);
      } else if (i === tubularPoints.length - 1) {
        const prev = tubularPoints[i - 1];
        tangent = prev
          ? new THREE.Vector3().subVectors(point, prev).normalize()
          : new THREE.Vector3(0, 1, 0);
      } else {
        const prev = tubularPoints[i - 1];
        const next = tubularPoints[i + 1];
        tangent =
          prev && next
            ? new THREE.Vector3().subVectors(next, prev).normalize()
            : new THREE.Vector3(0, 1, 0);
      }

      // Create perpendicular vectors
      const up =
        Math.abs(tangent.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const normal1 = new THREE.Vector3().crossVectors(tangent, up).normalize();
      const normal2 = new THREE.Vector3().crossVectors(tangent, normal1).normalize();

      // Create ring of vertices
      for (let j = 0; j <= radialSegments; j++) {
        const angle = (j / radialSegments) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const nx = normal1.x * cos + normal2.x * sin;
        const ny = normal1.y * cos + normal2.y * sin;
        const nz = normal1.z * cos + normal2.z * sin;

        positions.push(point.x + nx * radius, point.y + ny * radius, point.z + nz * radius);
        normals.push(nx, ny, nz);
      }
    }

    // Create faces
    for (let i = 0; i < tubularPoints.length - 1; i++) {
      for (let j = 0; j < radialSegments; j++) {
        const a = i * (radialSegments + 1) + j;
        const b = a + 1;
        const c = a + radialSegments + 1;
        const d = c + 1;

        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    // Update geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);

    // Dispose old geometry and assign new one
    mesh.geometry.dispose();
    mesh.geometry = geometry;
  }

  /**
   * Update the palm mesh surface.
   */
  private updatePalmMesh(positions: THREE.Vector3[]): void {
    const verts: number[] = [];
    const norms: number[] = [];
    const indices: number[] = [];

    let vertexIndex = 0;

    for (const tri of PALM_TRIANGLES) {
      const p0 = positions[tri[0]];
      const p1 = positions[tri[1]];
      const p2 = positions[tri[2]];

      if (!p0 || !p1 || !p2) continue;

      // Calculate face normal
      const edge1 = new THREE.Vector3().subVectors(p1, p0);
      const edge2 = new THREE.Vector3().subVectors(p2, p0);
      const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

      // Add vertices (both sides by using double-sided material)
      verts.push(p0.x, p0.y, p0.z);
      verts.push(p1.x, p1.y, p1.z);
      verts.push(p2.x, p2.y, p2.z);

      norms.push(normal.x, normal.y, normal.z);
      norms.push(normal.x, normal.y, normal.z);
      norms.push(normal.x, normal.y, normal.z);

      indices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2);
      vertexIndex += 3;
    }

    if (verts.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
      geometry.setIndex(indices);

      this.palmMesh.geometry.dispose();
      this.palmMesh.geometry = geometry;
      this.palmMesh.visible = true;
    } else {
      this.palmMesh.visible = false;
    }
  }

  /**
   * Hide all hand visualization elements.
   */
  hide(): void {
    for (const mesh of this.fingerMeshes) {
      mesh.visible = false;
    }
    this.palmMesh.visible = false;
    for (const mesh of this.fingertipMeshes) {
      mesh.visible = false;
    }
  }

  /**
   * Dispose of all resources.
   */
  dispose(): void {
    for (const mesh of this.fingerMeshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }

    this.scene.remove(this.palmMesh);
    this.palmMesh.geometry.dispose();
    this.palmMaterial.dispose();

    for (const mesh of this.fingertipMeshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }

    this.fingerMaterial.dispose();
    this.tipMaterial.dispose();
  }
}
