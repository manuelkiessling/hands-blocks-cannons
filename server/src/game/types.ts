import type { Block, Position } from '../protocol/messages.js';

export type PlayerId = string;
export type BlockId = string;
export type PlayerNumber = 1 | 2;

export interface Player {
  readonly id: PlayerId;
  readonly number: PlayerNumber;
  readonly grabbedBlockId: BlockId | null;
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

/** Default room: 14 units wide (x), 10 units tall (y), 16 units deep (z) */
export const DEFAULT_ROOM: RoomBounds = {
  minX: -7,
  maxX: 7,
  minY: -5,
  maxY: 5,
  minZ: -8,
  maxZ: 8,
};

export const DEFAULT_GAME_CONFIG: GameConfig = {
  blocksPerPlayer: 5,
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

/** Get spawn position for a player's blocks */
export function getPlayerSpawnArea(playerNumber: PlayerNumber, room: RoomBounds): Position {
  // Match block spawn to same side as the hand:
  // Player 1 hand is at maxZ - 2, so blocks spawn around maxZ - 3 to maxZ - 5
  // Player 2 hand is at minZ + 2, so blocks spawn around minZ + 3 to minZ + 5
  const zOffset = playerNumber === 1 ? room.maxZ - 4 : room.minZ + 4;
  return { x: 0, y: 0, z: zOffset };
}

export const BLOCK_COLORS = [
  0x4a9eff, // Blue
  0xa855f7, // Purple
  0xec4899, // Pink
  0x22c55e, // Green
  0xf59e0b, // Orange
];

export type { Block, Position };
