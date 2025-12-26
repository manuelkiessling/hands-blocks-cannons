/**
 * @fileoverview Framework client runtime.
 *
 * This package provides the core client runtime for two-participant,
 * WebSocket-networked, hand-gesture-driven applications. It handles:
 * - WebSocket connection management
 * - Session lifecycle (waiting → playing → finished)
 * - Ready-state signaling
 * - Play-again voting coordination
 * - Message routing to app handlers
 */

import type {
  ParticipantId,
  ParticipantNumber,
  SessionEndedReason,
  SessionPhase,
} from '@gesture-app/framework-protocol';

// Re-export protocol types for convenience
export type { ParticipantId, ParticipantNumber, SessionPhase, SessionEndedReason };

// Export session client
export {
  type ConnectionState,
  DEFAULT_CLIENT_CONFIG,
  SessionClient,
  type SessionClientConfig,
  type SessionClientEvents,
  type SessionWelcomeData,
} from './SessionClient.js';

// Export session config
export {
  fetchSessionConfig,
  getInjectedConfig,
  isLocalDevelopment,
  resolveSessionConfig,
  type SessionConfig,
  type SessionConfigResult,
} from './SessionConfig.js';

/**
 * Framework client version.
 */
export const FRAMEWORK_CLIENT_VERSION = '1.0.0';
