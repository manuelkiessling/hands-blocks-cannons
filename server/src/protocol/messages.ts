import { z } from 'zod';

// ============ Shared Types ============

export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export type Position = z.infer<typeof PositionSchema>;

export const BlockTypeSchema = z.enum(['regular', 'cannon']);

export type BlockType = z.infer<typeof BlockTypeSchema>;

export const BlockSchema = z.object({
  id: z.string(),
  position: PositionSchema,
  color: z.number(),
  ownerId: z.string(), // Which player owns this block
  blockType: BlockTypeSchema.default('regular'),
});

export type Block = z.infer<typeof BlockSchema>;

export const ProjectileSchema = z.object({
  id: z.string(),
  position: PositionSchema,
  velocity: PositionSchema, // Direction and speed (units per second)
  ownerId: z.string(),
  color: z.number(),
});

export type Projectile = z.infer<typeof ProjectileSchema>;

export const RoomBoundsSchema = z.object({
  minX: z.number(),
  maxX: z.number(),
  minY: z.number(),
  maxY: z.number(),
  minZ: z.number(),
  maxZ: z.number(),
});

export type RoomBounds = z.infer<typeof RoomBoundsSchema>;

// ============ Client -> Server Messages ============

export const JoinGameMessage = z.object({
  type: z.literal('join_game'),
});

export const BlockGrabMessage = z.object({
  type: z.literal('block_grab'),
  blockId: z.string(),
});

export const BlockMoveMessage = z.object({
  type: z.literal('block_move'),
  blockId: z.string(),
  position: PositionSchema,
});

export const BlockReleaseMessage = z.object({
  type: z.literal('block_release'),
  blockId: z.string(),
});

export const CannonFireMessage = z.object({
  type: z.literal('cannon_fire'),
  cannonId: z.string(), // The cannon block ID
});

export const ClientMessage = z.discriminatedUnion('type', [
  JoinGameMessage,
  BlockGrabMessage,
  BlockMoveMessage,
  BlockReleaseMessage,
  CannonFireMessage,
]);

export type ClientMessage = z.infer<typeof ClientMessage>;

// ============ Server -> Client Messages ============

export const WallGridConfigSchema = z.object({
  enabled: z.boolean(),
  highlightDuration: z.number(),
  highlightIntensity: z.number(),
});

export type WallGridConfig = z.infer<typeof WallGridConfigSchema>;

export const WelcomeMessage = z.object({
  type: z.literal('welcome'),
  playerId: z.string(),
  playerNumber: z.union([z.literal(1), z.literal(2)]),
  blocks: z.array(BlockSchema),
  projectiles: z.array(ProjectileSchema),
  room: RoomBoundsSchema,
  cameraDistance: z.number(),
  wallGrid: WallGridConfigSchema,
  projectileSize: z.number(),
});

export const OpponentJoinedMessage = z.object({
  type: z.literal('opponent_joined'),
});

export const OpponentLeftMessage = z.object({
  type: z.literal('opponent_left'),
});

export const BlockGrabbedMessage = z.object({
  type: z.literal('block_grabbed'),
  playerId: z.string(),
  blockId: z.string(),
});

export const BlockMovedMessage = z.object({
  type: z.literal('block_moved'),
  playerId: z.string(),
  blockId: z.string(),
  position: PositionSchema,
});

export const BlockReleasedMessage = z.object({
  type: z.literal('block_released'),
  playerId: z.string(),
  blockId: z.string(),
});

export const ErrorMessage = z.object({
  type: z.literal('error'),
  message: z.string(),
});

export const ProjectileSpawnedMessage = z.object({
  type: z.literal('projectile_spawned'),
  projectile: ProjectileSchema,
});

export const ProjectilesUpdateMessage = z.object({
  type: z.literal('projectiles_update'),
  projectiles: z.array(ProjectileSchema),
});

export const ProjectileDestroyedMessage = z.object({
  type: z.literal('projectile_destroyed'),
  projectileId: z.string(),
});

export const BlockDestroyedMessage = z.object({
  type: z.literal('block_destroyed'),
  blockId: z.string(),
  position: PositionSchema, // For explosion effect
  color: z.number(), // For explosion particles
});

export const WallHitMessage = z.object({
  type: z.literal('wall_hit'),
  position: PositionSchema, // Where the projectile hit the wall
  wallSide: z.union([z.literal('minZ'), z.literal('maxZ')]), // Which wall was hit
});

export const ServerMessage = z.discriminatedUnion('type', [
  WelcomeMessage,
  OpponentJoinedMessage,
  OpponentLeftMessage,
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

// ============ Type Guards & Utilities ============

export function parseClientMessage(data: unknown): ClientMessage | null {
  const result = ClientMessage.safeParse(data);
  return result.success ? result.data : null;
}

export function serializeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message);
}
