/**
 * @fileoverview Framework protocol definitions.
 *
 * This package defines the core protocol messages for two-participant,
 * WebSocket-networked, hand-gesture-driven applications. It handles
 * lifecycle events common to all apps while allowing apps to define
 * their own domain-specific messages.
 */

/**
 * Participant identifier.
 */
export type ParticipantId = string;

/**
 * Participant number (1 or 2).
 */
export type ParticipantNumber = 1 | 2;

/**
 * Session lifecycle phase.
 */
export type SessionPhase = 'waiting' | 'playing' | 'finished';

/**
 * Base interface for all framework messages (client → server).
 */
export interface FrameworkClientMessage {
  readonly type: string;
}

/**
 * Base interface for all framework messages (server → client).
 */
export interface FrameworkServerMessage {
  readonly type: string;
}

/**
 * Participant ready message (client → server).
 * Sent when participant has raised their hand and is ready to start.
 */
export interface ParticipantReadyMessage extends FrameworkClientMessage {
  readonly type: 'participant_ready';
}

/**
 * Session started message (server → clients).
 * Sent when all participants are ready and the session begins.
 */
export interface SessionStartedMessage extends FrameworkServerMessage {
  readonly type: 'session_started';
}

/**
 * Session ended message (server → clients).
 * Sent when the session ends (either normally or due to disconnect).
 */
export interface SessionEndedMessage extends FrameworkServerMessage {
  readonly type: 'session_ended';
  readonly reason: 'completed' | 'participant_left' | 'timeout';
}

/**
 * Check if a message is a framework lifecycle message.
 */
export function isFrameworkMessage(message: { type: string }): boolean {
  return ['participant_ready', 'session_started', 'session_ended'].includes(message.type);
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
