/**
 * @fileoverview Volumetric 3D hand visualization with translucent finger tubes.
 * Supports rendering multiple hands simultaneously.
 */

import * as THREE from 'three';
import { HAND_COLORS, HAND_LANDMARKS, HAND_VISUAL, MEDIAPIPE } from '../constants.js';

/** Finger paths from knuckle to tip (excluding wrist for cleaner gradient) */
const FINGER_PATHS = [
  [1, 2, 3, 4], // Thumb (CMC to tip)
  [5, 6, 7, 8], // Index (MCP to tip)
  [9, 10, 11, 12], // Middle
  [13, 14, 15, 16], // Ring
  [17, 18, 19, 20], // Pinky
];

/** Fingertip landmark indices for primary fingers (thumb, index) that show spheres */
const PRIMARY_FINGERTIPS = [4, 8];

/** Opacity multiplier for secondary fingers (middle, ring, pinky) */
const SECONDARY_FINGER_OPACITY = 0.5;

/** Width profile for finger segments (wider at base, narrower at tip) */
const FINGER_WIDTH = [0.32, 0.26, 0.2, 0.14];

/**
 * Data structure for a single hand's meshes.
 */
interface HandMeshes {
  fingerMeshes: THREE.Mesh[];
  fingertipMeshes: THREE.Mesh[];
  tipMaterial: THREE.MeshStandardMaterial;
  smoothedPositions: THREE.Vector3[] | null;
}

/**
 * Custom shader for per-vertex opacity gradient.
 */
const fingerVertexShader = `
  attribute float opacity;
  varying float vOpacity;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vOpacity = opacity;
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fingerFragmentShader = `
  uniform vec3 color;
  uniform vec3 emissive;
  uniform float emissiveIntensity;
  uniform float baseOpacity;

  varying float vOpacity;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    // Simple lighting
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    
    // Ambient + diffuse approximation
    float diffuse = max(dot(normal, vec3(0.5, 0.7, 0.5)), 0.0);
    vec3 lighting = color * (0.4 + 0.6 * diffuse);
    
    // Add emissive
    vec3 finalColor = lighting + emissive * emissiveIntensity;
    
    // Apply per-vertex opacity with base opacity
    float finalOpacity = vOpacity * baseOpacity;
    
    gl_FragColor = vec4(finalColor, finalOpacity);
  }
`;

/**
 * Renders volumetric hands with translucent finger tubes.
 * Supports multiple hands simultaneously (up to MAX_HANDS).
 */
export class HandVisualizer {
  private readonly scene: THREE.Scene;

  // Meshes for each hand (indexed by hand slot 0, 1, etc.)
  private readonly handMeshes: HandMeshes[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Create meshes for each possible hand
    for (let handIndex = 0; handIndex < MEDIAPIPE.MAX_HANDS; handIndex++) {
      this.handMeshes.push(this.createHandMeshes());
    }
  }

  /**
   * Create a complete set of meshes for one hand.
   */
  private createHandMeshes(): HandMeshes {
    const fingerMeshes: THREE.Mesh[] = [];
    const fingertipMeshes: THREE.Mesh[] = [];

    // Create fingertip material (brighter glow)
    const tipMaterial = new THREE.MeshStandardMaterial({
      color: HAND_COLORS.NORMAL,
      emissive: HAND_COLORS.NORMAL,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: HAND_VISUAL.TIP_OPACITY,
      roughness: 0.2,
      metalness: 0.0,
    });

    // Create finger tube meshes with custom shader material
    const handColor = new THREE.Color(HAND_COLORS.NORMAL);
    for (let i = 0; i < FINGER_PATHS.length; i++) {
      // Secondary fingers (middle, ring, pinky) are less opaque
      const isSecondary = i >= 2;
      const opacityMultiplier = isSecondary ? SECONDARY_FINGER_OPACITY : 1.0;

      const geometry = new THREE.BufferGeometry();
      const material = new THREE.ShaderMaterial({
        uniforms: {
          color: { value: handColor },
          emissive: { value: handColor },
          emissiveIntensity: { value: 0.25 },
          baseOpacity: { value: HAND_VISUAL.FINGER_OPACITY * opacityMultiplier },
        },
        vertexShader: fingerVertexShader,
        fragmentShader: fingerFragmentShader,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      mesh.renderOrder = 1;
      this.scene.add(mesh);
      fingerMeshes.push(mesh);
    }

    // Create fingertip meshes only for primary fingers (thumb and index)
    for (let i = 0; i < PRIMARY_FINGERTIPS.length; i++) {
      const geometry = new THREE.SphereGeometry(FINGER_WIDTH[3] ?? 0.14, 12, 12);
      const mesh = new THREE.Mesh(geometry, tipMaterial.clone());
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.scene.add(mesh);
      fingertipMeshes.push(mesh);
    }

    return {
      fingerMeshes,
      fingertipMeshes,
      tipMaterial,
      smoothedPositions: null,
    };
  }

  /**
   * Update hand visualizations with new positions for multiple hands.
   * @param handsPositions - Array of position arrays, one per detected hand
   */
  update(handsPositions: (THREE.Vector3[] | null)[]): void {
    // Update each hand slot
    for (let handIndex = 0; handIndex < this.handMeshes.length; handIndex++) {
      const handMesh = this.handMeshes[handIndex];
      const positions = handsPositions[handIndex] ?? null;

      if (!handMesh) continue;

      if (!positions || positions.length < HAND_LANDMARKS.COUNT) {
        this.hideHand(handIndex);
        handMesh.smoothedPositions = null;
        continue;
      }

      // Apply temporal smoothing to reduce shakiness
      const renderPositions = this.applySmoothingForHand(handMesh, positions);

      // Update finger tubes
      for (let i = 0; i < FINGER_PATHS.length; i++) {
        const path = FINGER_PATHS[i];
        const mesh = handMesh.fingerMeshes[i];
        if (!path || !mesh) continue;

        const points: THREE.Vector3[] = [];
        for (const idx of path) {
          const pos = renderPositions[idx];
          if (pos) points.push(pos.clone());
        }

        if (points.length >= 2) {
          this.updateFingerTube(mesh, points, i);
          mesh.visible = true;
        } else {
          mesh.visible = false;
        }
      }

      // Update fingertip meshes (only for thumb and index)
      for (let i = 0; i < PRIMARY_FINGERTIPS.length; i++) {
        const tipIdx = PRIMARY_FINGERTIPS[i];
        const mesh = handMesh.fingertipMeshes[i];
        const pos = tipIdx !== undefined ? renderPositions[tipIdx] : undefined;

        if (mesh && pos) {
          mesh.position.copy(pos);
          mesh.visible = true;
        } else if (mesh) {
          mesh.visible = false;
        }
      }
    }
  }

  /**
   * Apply temporal smoothing to positions for a specific hand.
   */
  private applySmoothingForHand(handMesh: HandMeshes, positions: THREE.Vector3[]): THREE.Vector3[] {
    // Initialize smoothed positions on first frame
    if (!handMesh.smoothedPositions) {
      handMesh.smoothedPositions = positions.map((p) => p.clone());
      return handMesh.smoothedPositions;
    }

    // Lerp each position toward the target
    for (let i = 0; i < positions.length; i++) {
      const target = positions[i];
      const smoothed = handMesh.smoothedPositions[i];

      if (target && smoothed) {
        smoothed.lerp(target, HAND_VISUAL.SMOOTHING_FACTOR);
      } else if (target && !smoothed) {
        handMesh.smoothedPositions[i] = target.clone();
      }
    }

    return handMesh.smoothedPositions;
  }

  /**
   * Hide all meshes for a specific hand.
   */
  private hideHand(handIndex: number): void {
    const handMesh = this.handMeshes[handIndex];
    if (!handMesh) return;

    for (const mesh of handMesh.fingerMeshes) {
      mesh.visible = false;
    }
    for (const mesh of handMesh.fingertipMeshes) {
      mesh.visible = false;
    }
  }

  /**
   * Create a smooth tube along finger path with variable width and opacity gradient.
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
    const opacityValues: number[] = [];

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
      const w1 = FINGER_WIDTH[widthIndex] ?? 0.2;
      const w2 = FINGER_WIDTH[nextIndex] ?? 0.2;
      const radius = w1 + (w2 - w1) * localT;

      // Thumb is slightly thicker
      const thumbMultiplier = fingerIndex === 0 ? 1.2 : 1.0;
      radiusValues.push(radius * thumbMultiplier);

      // Opacity gradient: nearly transparent at base (t=0), full at tip (t=1)
      // Use ease-in curve for more gradual fade
      const opacityT = t * t; // Quadratic ease-in
      const minOpacity = 0.05; // Nearly transparent at base
      const maxOpacity = 1.0; // Full opacity at tip
      opacityValues.push(minOpacity + (maxOpacity - minOpacity) * opacityT);
    }

    // Build tube geometry manually for variable radius
    const positions: number[] = [];
    const normals: number[] = [];
    const opacities: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < tubularPoints.length; i++) {
      const point = tubularPoints[i];
      const radius = radiusValues[i];
      const opacity = opacityValues[i];

      if (!point || radius === undefined || opacity === undefined) continue;

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
        opacities.push(opacity);
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

    // Update geometry with opacity attribute
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('opacity', new THREE.Float32BufferAttribute(opacities, 1));
    geometry.setIndex(indices);

    // Dispose old geometry and assign new one
    mesh.geometry.dispose();
    mesh.geometry = geometry;
  }

  /**
   * Hide all hand visualization elements for all hands.
   */
  hide(): void {
    for (let i = 0; i < this.handMeshes.length; i++) {
      this.hideHand(i);
    }
  }

  /**
   * Dispose of all resources.
   */
  dispose(): void {
    for (const handMesh of this.handMeshes) {
      for (const mesh of handMesh.fingerMeshes) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }

      for (const mesh of handMesh.fingertipMeshes) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }

      handMesh.tipMaterial.dispose();
    }
  }
}
