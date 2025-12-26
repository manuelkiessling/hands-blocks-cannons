/**
 * @fileoverview Game types and runtime configuration for blocks-cannons server.
 * Re-exports shared types and provides server-specific runtime config.
 */

import { BLOCK_COLORS, CANNON_COLOR, PROJECTILE_COLOR } from '../../shared/constants.js';
import type { Position, RoomBounds } from '../../shared/types.js';
import { loadGameConfig } from '../config/gameConfig.js';

// ============ Re-export Shared Types ============

export type {
  Block,
  BlockId,
  BlockType,
  DestroyedBlockInfo,
  GamePhase,
  Player,
  PlayerId,
  PlayerNumber,
  Position,
  Projectile,
  ProjectileId,
  RoomBounds,
  Velocity,
  WallGridConfig,
  WallHitInfo,
} from '../../shared/types.js';

export { MAX_GRABBED_BLOCKS } from '../../shared/types.js';

// ============ Runtime Configuration ============

/**
 * Game configuration loaded from YAML file.
 * All timing values are in milliseconds unless otherwise noted.
 */
const yamlConfig = loadGameConfig();

/** Cannon auto-fire interval in milliseconds (0 = manual fire only) */
export const CANNON_AUTO_FIRE_INTERVAL_MS = yamlConfig.cannon.autoFireInterval;

/** Cannon fire cooldown in milliseconds */
export const CANNON_COOLDOWN_MS = yamlConfig.cannon.cooldown;

/** Whether cannons are indestructible (cannot be hit by projectiles) */
export const CANNON_INDESTRUCTIBLE = yamlConfig.cannon.indestructible;

/** Projectile speed (units per second) */
export const PROJECTILE_SPEED = yamlConfig.projectile.speed;

/** Projectile size (radius) for collision detection */
export const PROJECTILE_SIZE = yamlConfig.projectile.size;

/** Block half size for collision detection */
export const BLOCK_HALF_SIZE = yamlConfig.blocks.halfSize;

/** Whether blocks push each other when they collide */
export const BLOCK_COLLISION_ENABLED = yamlConfig.blocks.collision;

/** Server tick rate in milliseconds */
export const TICK_RATE_MS = yamlConfig.tickRate;

// ============ Inactivity / Cleanup Constants ============

/** Inactivity timeout in milliseconds before server auto-shutdown */
// Environment variable override takes precedence over YAML config
// biome-ignore lint/complexity/useLiteralKeys: Required for noPropertyAccessFromIndexSignature
const inactivityEnvValue = process.env['INACTIVITY_TIMEOUT_MS'];
export const INACTIVITY_TIMEOUT_MS = inactivityEnvValue
  ? Number.parseInt(inactivityEnvValue, 10)
  : yamlConfig.inactivity.timeoutMs;

/** Interval in milliseconds between inactivity checks */
export const INACTIVITY_CHECK_INTERVAL_MS = yamlConfig.inactivity.checkIntervalMs;

/** Camera distance from room edge (units) */
export const CAMERA_DISTANCE = yamlConfig.camera.distance;

/** Wall grid configuration for hit visualization */
export const WALL_GRID_CONFIG = yamlConfig.wallGrid;

/** Room bounds loaded from YAML config */
export const DEFAULT_ROOM: RoomBounds = yamlConfig.room;

// ============ Game Configuration ============

/**
 * Game configuration for a game session.
 */
export interface GameConfig {
  readonly blocksPerPlayer: number;
  readonly room: RoomBounds;
}

/**
 * Default game configuration loaded from YAML.
 */
export const DEFAULT_GAME_CONFIG: GameConfig = {
  blocksPerPlayer: yamlConfig.blocks.perPlayer,
  room: DEFAULT_ROOM,
};

// ============ Constants (Re-exported from shared) ============

export { BLOCK_COLORS, CANNON_COLOR, PROJECTILE_COLOR };

// ============ Utility Functions ============

/**
 * Clamp a position to stay within room bounds (accounting for block size).
 * @param pos - Position to clamp
 * @param room - Room bounds to clamp within
 * @param blockHalfSize - Half size of the block (default: 0.5)
 * @returns Clamped position
 */
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
 * @param playerNumber - Player number (1 or 2)
 * @param room - Room bounds
 * @returns Z coordinate for spawning blocks
 */
export function getPlayerSpawnZ(playerNumber: 1 | 2, room: RoomBounds): number {
  const blockHalfSize = 0.5;
  // Player 1 is at maxZ (close to screen), Player 2 is at minZ (far side)
  return playerNumber === 1 ? room.maxZ - blockHalfSize : room.minZ + blockHalfSize;
}
