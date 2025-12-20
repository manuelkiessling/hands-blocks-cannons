import { z } from 'zod';

// ============ Shared Types ============

export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export type Position = z.infer<typeof PositionSchema>;

export const BlockSchema = z.object({
  id: z.string(),
  position: PositionSchema,
  color: z.number(),
  ownerId: z.string(), // Which player owns this block
});

export type Block = z.infer<typeof BlockSchema>;

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

export const ClientMessage = z.discriminatedUnion('type', [
  JoinGameMessage,
  BlockGrabMessage,
  BlockMoveMessage,
  BlockReleaseMessage,
]);

export type ClientMessage = z.infer<typeof ClientMessage>;

// ============ Server -> Client Messages ============

export const WelcomeMessage = z.object({
  type: z.literal('welcome'),
  playerId: z.string(),
  playerNumber: z.union([z.literal(1), z.literal(2)]),
  blocks: z.array(BlockSchema),
  room: RoomBoundsSchema,
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

export const ServerMessage = z.discriminatedUnion('type', [
  WelcomeMessage,
  OpponentJoinedMessage,
  OpponentLeftMessage,
  BlockGrabbedMessage,
  BlockMovedMessage,
  BlockReleasedMessage,
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
