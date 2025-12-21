/**
 * @fileoverview Main entry point for the shared package.
 * Re-exports all types, protocol definitions, and constants.
 */

// Types
export type {
  PlayerId,
  BlockId,
  ProjectileId,
  PlayerNumber,
  BlockType,
  Position,
  Velocity,
  Block,
  Projectile,
  Player,
  RoomBounds,
  WallGridConfig,
  DestroyedBlockInfo,
  WallHitInfo,
} from './types/index.js';

// Protocol
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
  isMessageType,
} from './protocol/index.js';

// Constants
export {
  BLOCK_COLORS,
  CANNON_COLOR,
  PROJECTILE_COLOR,
  HAND_COLORS,
  HIGHLIGHT_COLORS,
  CAMERA_MARGIN,
  PINCH_THRESHOLD,
  EDGE_THRESHOLD,
  BLOCK_REACH_DISTANCE,
  POSITION_SEND_THROTTLE_MS,
  BLOCK_FLOAT_AMPLITUDE,
  EXPLOSION_DURATION_MS,
  EXPLOSION_PARTICLE_COUNT,
} from './constants.js';

