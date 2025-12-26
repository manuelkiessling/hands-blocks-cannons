/**
 * @fileoverview Framework protocol definitions.
 *
 * This package defines the core protocol messages for two-participant,
 * WebSocket-networked, hand-gesture-driven applications. It handles
 * lifecycle events common to all apps while allowing apps to define
 * their own domain-specific messages.
 */

export {
  BotIdentifyMessageSchema,
  createSessionClientMessageSchema,
  createSessionServerMessageSchema,
  ErrorMessageSchema,
  type FrameworkClientMessage,
  FrameworkClientMessageSchema,
  PlayAgainStatusMessageSchema,
  PlayAgainVoteMessageSchema,
  type SessionEndedReason,
  SessionEndedReasonSchema,
  SessionStartedMessageSchema,
} from './messages.js';
export {
  type ParticipantId,
  ParticipantIdSchema,
  type ParticipantNumber,
  ParticipantNumberSchema,
  type SessionPhase,
  SessionPhaseSchema,
} from './types.js';

/**
 * Check if a message is a framework lifecycle message (canonical set).
 */
export function isFrameworkMessage(message: { type: string }): boolean {
  return new Set([
    'participant_ready',
    'bot_identify',
    'play_again_vote',
    'welcome',
    'opponent_joined',
    'opponent_left',
    'session_started',
    'session_ended',
    'play_again_status',
    'session_reset',
    'error',
  ]).has(message.type);
}

/**
 * Framework protocol version.
 */
export const FRAMEWORK_PROTOCOL_VERSION = '1.0.0';

// ============ App Registry ============

export {
  type AppManifest,
  AppNotFoundError,
  AppRegistry,
  DuplicateAppError,
  globalRegistry,
  InvalidManifestError,
  validateManifest,
} from './registry.js';
