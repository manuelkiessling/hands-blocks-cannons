/**
 * @fileoverview Client-specific type definitions.
 */

import type { Block, GamePhase, Projectile, RoomBounds, WallGridConfig } from '@block-game/shared';
import type * as THREE from 'three';

// Re-export shared types for convenience
export type {
  Block,
  BlockId,
  BlockType,
  GamePhase,
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
 * Array of hand landmarks from MediaPipe (21 landmarks per hand).
 */
export type HandLandmarks = HandLandmark[];

/**
 * Handedness label from MediaPipe.
 * Note: "Left" means it appears on the left side of the camera image,
 * which is actually the user's right hand (mirror effect).
 */
export type Handedness = 'Left' | 'Right';

/**
 * A single tracked hand with landmarks and handedness.
 */
export interface TrackedHand {
  landmarks: HandLandmarks;
  handedness: Handedness;
  /** Confidence score for handedness classification (0-1) */
  score: number;
}

/**
 * Result from hand tracking containing all detected hands.
 */
export type MultiHandResult = TrackedHand[];

/**
 * Extended block data with Three.js mesh and local state.
 * Mesh can be a single Mesh (regular blocks) or a Group (cannons with complex geometry).
 */
export interface BlockEntity {
  mesh: THREE.Mesh | THREE.Group;
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
  gamePhase: GamePhase;
}

/**
 * Connection state.
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
