/**
 * @fileoverview Core game types shared between client, server, and bot.
 * These types define the fundamental data structures used throughout the game.
 */

/**
 * Unique identifier for a player in the game.
 */
export type PlayerId = string;

/**
 * Unique identifier for a block entity.
 */
export type BlockId = string;

/**
 * Unique identifier for a projectile entity.
 */
export type ProjectileId = string;

/**
 * Player number indicating which side of the arena they play on.
 * - Player 1: Positioned at maxZ, fires towards minZ
 * - Player 2: Positioned at minZ, fires towards maxZ
 */
export type PlayerNumber = 1 | 2;

/**
 * Type of block entity.
 * - regular: Standard movable block that can be destroyed
 * - cannon: Special block that fires projectiles (may be indestructible)
 */
export type BlockType = 'regular' | 'cannon';

/**
 * 3D position coordinates in world space.
 */
export interface Position {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * 3D velocity vector (units per second).
 */
export interface Velocity {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * A block entity in the game world.
 */
export interface Block {
  readonly id: BlockId;
  readonly position: Position;
  readonly color: number;
  readonly ownerId: PlayerId;
  readonly blockType: BlockType;
}

/**
 * A projectile entity fired from a cannon.
 */
export interface Projectile {
  readonly id: ProjectileId;
  readonly position: Position;
  readonly velocity: Velocity;
  readonly ownerId: PlayerId;
  readonly color: number;
}

/**
 * Player state in the game.
 */
export interface Player {
  readonly id: PlayerId;
  readonly number: PlayerNumber;
  readonly grabbedBlockId: BlockId | null;
}

/**
 * Defines the 3D bounds of the game arena.
 */
export interface RoomBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * Configuration for wall hit visualization.
 */
export interface WallGridConfig {
  readonly enabled: boolean;
  readonly highlightDuration: number;
  readonly highlightIntensity: number;
}

/**
 * Information about a destroyed block, used for visual effects.
 */
export interface DestroyedBlockInfo {
  readonly blockId: BlockId;
  readonly position: Position;
  readonly color: number;
}

/**
 * Information about a projectile hitting a wall.
 */
export interface WallHitInfo {
  readonly position: Position;
  readonly wallSide: 'minZ' | 'maxZ';
}

