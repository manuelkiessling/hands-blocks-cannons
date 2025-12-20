import { loadGameConfig } from '../config/gameConfig.js';
import type { Block, Position, Projectile } from '../protocol/messages.js';

export type PlayerId = string;
export type BlockId = string;
export type ProjectileId = string;
export type PlayerNumber = 1 | 2;
export type BlockType = 'regular' | 'cannon';

export interface Player {
  readonly id: PlayerId;
  readonly number: PlayerNumber;
  readonly grabbedBlockId: BlockId | null;
}

// Load configuration from YAML
const yamlConfig = loadGameConfig();

/** Cannon auto-fire interval in milliseconds (0 = manual fire only) */
export const CANNON_AUTO_FIRE_INTERVAL_MS = yamlConfig.cannon.autoFireInterval;

/** Cannon fire cooldown in milliseconds */
export const CANNON_COOLDOWN_MS = yamlConfig.cannon.cooldown;

/** Whether cannons are indestructible (cannot be hit by projectiles) */
export const CANNON_INDESTRUCTIBLE = yamlConfig.cannon.indestructible;

/** Projectile speed (units per second) */
export const PROJECTILE_SPEED = yamlConfig.projectile.speed;

/** Projectile size (radius) */
export const PROJECTILE_SIZE = yamlConfig.projectile.size;

/** Block half size for collision detection */
export const BLOCK_HALF_SIZE = yamlConfig.blocks.halfSize;

/** Whether blocks push each other when they collide */
export const BLOCK_COLLISION_ENABLED = yamlConfig.blocks.collision;

/** Server tick rate in milliseconds */
export const TICK_RATE_MS = yamlConfig.tickRate;

/** Camera distance from room edge (units) */
export const CAMERA_DISTANCE = yamlConfig.camera.distance;

/** Wall grid configuration */
export const WALL_GRID_CONFIG = yamlConfig.wallGrid;

/** Info about a destroyed block (for explosion effects) */
export interface DestroyedBlockInfo {
  readonly blockId: string;
  readonly position: Position;
  readonly color: number;
}

/** The room/arena bounds - a 3D box that contains all gameplay */
export interface RoomBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface GameConfig {
  readonly blocksPerPlayer: number;
  readonly room: RoomBounds;
}

/** Room bounds loaded from YAML config */
export const DEFAULT_ROOM: RoomBounds = yamlConfig.room;

export const DEFAULT_GAME_CONFIG: GameConfig = {
  blocksPerPlayer: yamlConfig.blocks.perPlayer,
  room: DEFAULT_ROOM,
};

/** Clamp a position to stay within room bounds (accounting for block size) */
export function clampToRoom(pos: Position, room: RoomBounds, blockHalfSize = 0.5): Position {
  return {
    x: Math.max(room.minX + blockHalfSize, Math.min(room.maxX - blockHalfSize, pos.x)),
    y: Math.max(room.minY + blockHalfSize, Math.min(room.maxY - blockHalfSize, pos.y)),
    z: Math.max(room.minZ + blockHalfSize, Math.min(room.maxZ - blockHalfSize, pos.z)),
  };
}

/**
 * Get spawn Z position for a player's blocks.
 * Blocks spawn at the very edge of the room on the player's side.
 * Player 1 is at maxZ (close to screen), Player 2 is at minZ (far side).
 */
export function getPlayerSpawnZ(playerNumber: PlayerNumber, room: RoomBounds): number {
  const blockHalfSize = 0.5;
  // Spawn right at the edge of the room (accounting for block size)
  return playerNumber === 1 ? room.maxZ - blockHalfSize : room.minZ + blockHalfSize;
}

export const BLOCK_COLORS = [
  0x4a9eff, // Blue
  0xa855f7, // Purple
  0xec4899, // Pink
  0x22c55e, // Green
  0xf59e0b, // Orange
];

/** Special color for cannon blocks */
export const CANNON_COLOR = 0xff3366; // Bright red-pink

/** Projectile color (matches cannon) */
export const PROJECTILE_COLOR = 0xffff00; // Bright yellow

export type { Block, Position, Projectile };
