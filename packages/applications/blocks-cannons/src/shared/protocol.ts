/**
 * @fileoverview Blocks & Cannons protocol message definitions.
 * Uses Zod for runtime validation of incoming messages.
 */

import { z } from 'zod';

// ============ Shared Schemas ============

/**
 * Schema for 3D position coordinates.
 */
export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

/**
 * Schema for block type enumeration.
 */
export const BlockTypeSchema = z.enum(['regular', 'cannon']);

/**
 * Schema for a block entity.
 */
export const BlockSchema = z.object({
  id: z.string(),
  position: PositionSchema,
  color: z.number(),
  ownerId: z.string(),
  blockType: BlockTypeSchema.default('regular'),
});

/**
 * Schema for a projectile entity.
 */
export const ProjectileSchema = z.object({
  id: z.string(),
  position: PositionSchema,
  velocity: PositionSchema,
  ownerId: z.string(),
  color: z.number(),
});

/**
 * Schema for room bounds configuration.
 */
export const RoomBoundsSchema = z.object({
  minX: z.number(),
  maxX: z.number(),
  minY: z.number(),
  maxY: z.number(),
  minZ: z.number(),
  maxZ: z.number(),
});

/**
 * Schema for wall grid configuration.
 */
export const WallGridConfigSchema = z.object({
  enabled: z.boolean(),
  highlightDuration: z.number(),
  highlightIntensity: z.number(),
});

/**
 * Schema for game phase enumeration.
 */
export const GamePhaseSchema = z.enum(['waiting', 'playing', 'finished']);
export type GamePhase = z.infer<typeof GamePhaseSchema>;

// ============ Client -> Server Messages ============

/**
 * Client request to grab a block.
 */
export const BlockGrabMessage = z.object({
  type: z.literal('block_grab'),
  blockId: z.string(),
});

/**
 * Client request to move a grabbed block.
 */
export const BlockMoveMessage = z.object({
  type: z.literal('block_move'),
  blockId: z.string(),
  position: PositionSchema,
});

/**
 * Client request to release a grabbed block.
 */
export const BlockReleaseMessage = z.object({
  type: z.literal('block_release'),
  blockId: z.string(),
});

/**
 * Client request to fire a cannon.
 */
export const CannonFireMessage = z.object({
  type: z.literal('cannon_fire'),
  cannonId: z.string(),
});

/**
 * Union of all valid client-to-server messages.
 */
export const ClientMessage = z.discriminatedUnion('type', [
  BlockGrabMessage,
  BlockMoveMessage,
  BlockReleaseMessage,
  CannonFireMessage,
]);

export type ClientMessage = z.infer<typeof ClientMessage>;

// ============ Server -> Client Messages ============

/**
 * Notification that a block was grabbed.
 */
export const BlockGrabbedMessage = z.object({
  type: z.literal('block_grabbed'),
  playerId: z.string(),
  blockId: z.string(),
});

/**
 * Notification that a block was moved.
 */
export const BlockMovedMessage = z.object({
  type: z.literal('block_moved'),
  playerId: z.string(),
  blockId: z.string(),
  position: PositionSchema,
});

/**
 * Notification that a block was released.
 */
export const BlockReleasedMessage = z.object({
  type: z.literal('block_released'),
  playerId: z.string(),
  blockId: z.string(),
});

/**
 * Server error message.
 */
export const ErrorMessage = z.object({
  type: z.literal('error'),
  message: z.string(),
});

/**
 * Notification that a projectile was spawned.
 */
export const ProjectileSpawnedMessage = z.object({
  type: z.literal('projectile_spawned'),
  projectile: ProjectileSchema,
});

/**
 * Batch update of projectile positions.
 */
export const ProjectilesUpdateMessage = z.object({
  type: z.literal('projectiles_update'),
  projectiles: z.array(ProjectileSchema),
});

/**
 * Notification that a projectile was destroyed.
 */
export const ProjectileDestroyedMessage = z.object({
  type: z.literal('projectile_destroyed'),
  projectileId: z.string(),
});

/**
 * Notification that a block was destroyed (for explosion effects).
 */
export const BlockDestroyedMessage = z.object({
  type: z.literal('block_destroyed'),
  blockId: z.string(),
  position: PositionSchema,
  color: z.number(),
});

/**
 * Notification that a projectile hit a wall.
 */
export const WallHitMessage = z.object({
  type: z.literal('wall_hit'),
  position: PositionSchema,
  wallSide: z.union([z.literal('minZ'), z.literal('maxZ')]),
});

/**
 * Union of all valid server-to-client messages.
 */
export const ServerMessage = z.discriminatedUnion('type', [
  BlockGrabbedMessage,
  BlockMovedMessage,
  BlockReleasedMessage,
  ProjectileSpawnedMessage,
  ProjectilesUpdateMessage,
  ProjectileDestroyedMessage,
  BlockDestroyedMessage,
  WallHitMessage,
  ErrorMessage,
]);

export type ServerMessage = z.infer<typeof ServerMessage>;

// ============ Framework appData payloads ============

export const BlocksWelcomeDataSchema = z.object({
  blocks: z.array(BlockSchema),
  projectiles: z.array(ProjectileSchema),
  room: RoomBoundsSchema,
  cameraDistance: z.number(),
  wallGrid: WallGridConfigSchema,
  projectileSize: z.number(),
  gamePhase: GamePhaseSchema,
});
export type BlocksWelcomeData = z.infer<typeof BlocksWelcomeDataSchema>;

export const BlocksOpponentJoinedDataSchema = z.object({
  blocks: z.array(BlockSchema),
});
export type BlocksOpponentJoinedData = z.infer<typeof BlocksOpponentJoinedDataSchema>;

export const BlocksResetDataSchema = z.object({
  blocks: z.array(BlockSchema),
});
export type BlocksResetData = z.infer<typeof BlocksResetDataSchema>;

export const BlocksSessionEndedDataSchema = z.object({
  appReason: z.literal('blocks_destroyed').optional(),
});
export type BlocksSessionEndedData = z.infer<typeof BlocksSessionEndedDataSchema>;

// ============ Utility Functions ============

/**
 * Parse and validate a client message from unknown data.
 * @param data - Raw data to parse (typically from JSON.parse)
 * @returns Validated ClientMessage or null if invalid
 */
export function parseClientMessage(data: unknown): ClientMessage | null {
  const result = ClientMessage.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Serialize a server message to JSON string.
 * @param message - Server message to serialize
 * @returns JSON string representation
 */
export function serializeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message);
}

/**
 * Type guard for checking if a message is a specific type.
 * @param message - Message to check
 * @param type - Expected message type
 */
export function isMessageType<T extends ServerMessage['type']>(
  message: ServerMessage,
  type: T
): message is Extract<ServerMessage, { type: T }> {
  return message.type === type;
}
