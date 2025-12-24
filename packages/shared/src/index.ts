/**
 * @fileoverview Main entry point for the shared package.
 * Re-exports all types, protocol definitions, and constants.
 */

// Constants
export {
  BLOCK_COLORS,
  BLOCK_FLOAT_AMPLITUDE,
  BLOCK_REACH_DISTANCE,
  CAMERA_MARGIN,
  CANNON_COLOR,
  EDGE_THRESHOLD,
  EXPLOSION_DURATION_MS,
  EXPLOSION_PARTICLE_COUNT,
  HAND_COLORS,
  HIGHLIGHT_COLORS,
  PINCH_THRESHOLD,
  POSITION_SEND_THROTTLE_MS,
  PROJECTILE_COLOR,
} from './constants.js';
export type { GamePhase } from './protocol/index.js';
// Protocol
export {
  BlockDestroyedMessage,
  BlockGrabbedMessage,
  BlockGrabMessage,
  BlockMovedMessage,
  BlockMoveMessage,
  BlockReleasedMessage,
  BlockReleaseMessage,
  BlockSchema,
  BlockTypeSchema,
  // Client messages
  BotIdentifyMessage,
  CannonFireMessage,
  ClientMessage,
  ErrorMessage,
  GameOverMessage,
  // Game phase
  GamePhaseSchema,
  GameResetMessage,
  GameStartedMessage,
  isMessageType,
  JoinGameMessage,
  OpponentJoinedMessage,
  OpponentLeftMessage,
  PlayAgainStatusMessage,
  PlayAgainVoteMessage,
  PlayerReadyMessage,
  // Schemas
  PositionSchema,
  ProjectileDestroyedMessage,
  ProjectileSchema,
  ProjectileSpawnedMessage,
  ProjectilesUpdateMessage,
  // Utilities
  parseClientMessage,
  RoomBoundsSchema,
  ServerMessage,
  serializeServerMessage,
  WallGridConfigSchema,
  WallHitMessage,
  // Server messages
  WelcomeMessage,
} from './protocol/index.js';
// Types
export type {
  Block,
  BlockId,
  BlockType,
  DestroyedBlockInfo,
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
} from './types/index.js';

// Type constants
export { MAX_GRABBED_BLOCKS } from './types/index.js';
