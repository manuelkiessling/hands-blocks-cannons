/**
 * @fileoverview Re-exports protocol messages from shared package.
 * This maintains backward compatibility while using the shared definitions.
 */

export {
  // Schemas
  PositionSchema,
  BlockTypeSchema,
  BlockSchema,
  ProjectileSchema,
  RoomBoundsSchema,
  WallGridConfigSchema,
  // Client messages
  JoinGameMessage,
  BlockGrabMessage,
  BlockMoveMessage,
  BlockReleaseMessage,
  CannonFireMessage,
  ClientMessage,
  // Server messages
  WelcomeMessage,
  OpponentJoinedMessage,
  OpponentLeftMessage,
  BlockGrabbedMessage,
  BlockMovedMessage,
  BlockReleasedMessage,
  ErrorMessage,
  ProjectileSpawnedMessage,
  ProjectilesUpdateMessage,
  ProjectileDestroyedMessage,
  BlockDestroyedMessage,
  WallHitMessage,
  ServerMessage,
  // Utilities
  parseClientMessage,
  serializeServerMessage,
} from '@block-game/shared';

// Re-export types for convenience
export type {
  Position,
  Block,
  Projectile,
  RoomBounds,
  WallGridConfig,
} from '@block-game/shared';
