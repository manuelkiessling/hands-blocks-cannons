/**
 * @fileoverview Client-specific type definitions.
 */

import type * as THREE from 'three';
import type { Block, Projectile, RoomBounds, WallGridConfig } from '@block-game/shared';

// Re-export shared types for convenience
export type {
  Block,
  BlockId,
  BlockType,
  PlayerId,
  PlayerNumber,
  Position,
  Projectile,
  ProjectileId,
  RoomBounds,
  WallGridConfig,
} from '@block-game/shared';

/**
 * MediaPipe hand landmark.
 */
export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

/**
 * Array of hand landmarks from MediaPipe.
 */
export type HandLandmarks = HandLandmark[];

/**
 * Hand proximity state relative to camera bounds.
 */
export type HandState = 'normal' | 'warning' | 'outside';

/**
 * Extended block data with Three.js mesh and local state.
 */
export interface BlockEntity {
  mesh: THREE.Mesh;
  data: Block;
  /** Base Y position for floating animation */
  baseY: number;
  /** Phase offset for floating animation */
  phase: number;
  /** Whether this block is currently grabbed (by anyone) */
  isGrabbed: boolean;
}

/**
 * Extended projectile data with Three.js mesh.
 */
export interface ProjectileEntity {
  mesh: THREE.Mesh;
  data: Projectile;
}

/**
 * Explosion particle data.
 */
export interface ExplosionParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  rotationSpeed: THREE.Vector3;
}

/**
 * Active explosion effect.
 */
export interface Explosion {
  particles: ExplosionParticle[];
  startTime: number;
  duration: number;
}

/**
 * Wall hit highlight data.
 */
export interface WallHighlight {
  group: THREE.Group;
  meshes: THREE.Object3D[];
  startTime: number;
  timeoutId: ReturnType<typeof setTimeout>;
}

/**
 * Game initialization data from server welcome message.
 */
export interface GameInitData {
  playerId: string;
  playerNumber: 1 | 2;
  blocks: Block[];
  projectiles: Projectile[];
  room: RoomBounds;
  cameraDistance: number;
  wallGrid: WallGridConfig;
  projectileSize: number;
}

/**
 * Connection state.
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Global MediaPipe declarations.
 */
declare global {
  interface Window {
    Hands: new (config: { locateFile: (file: string) => string }) => MediaPipeHands;
    Camera: new (
      video: HTMLVideoElement,
      config: {
        onFrame: () => Promise<void>;
        width: number;
        height: number;
      }
    ) => MediaPipeCamera;
  }
}

export interface MediaPipeHands {
  setOptions(options: {
    maxNumHands: number;
    modelComplexity: number;
    minDetectionConfidence: number;
    minTrackingConfidence: number;
  }): void;
  onResults(callback: (results: MediaPipeResults) => void): void;
  send(config: { image: HTMLVideoElement }): Promise<void>;
}

export interface MediaPipeCamera {
  start(): void;
}

export interface MediaPipeResults {
  multiHandLandmarks?: HandLandmarks[];
}

