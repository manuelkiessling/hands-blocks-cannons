/**
 * @fileoverview Framework server runtime.
 *
 * This package provides the core server runtime for two-participant,
 * WebSocket-networked, hand-gesture-driven applications. It handles:
 * - 2-participant admission
 * - Connection registry
 * - Lifecycle gating (waiting → playing → finished)
 * - Message routing (sender/opponent/all)
 * - Play-again voting and reset coordination
 */

import type {
  ParticipantId,
  ParticipantNumber,
  SessionEndedReason,
  SessionPhase,
} from '@gesture-app/framework-protocol';

// Re-export protocol types for convenience
export type { ParticipantId, ParticipantNumber, SessionPhase, SessionEndedReason };

// Export server factory
export {
  type AppServer,
  type AppServerConfig,
  createAppServer,
} from './createAppServer.js';
// Export session runtime
export {
  type AppHooks,
  type Connection,
  DEFAULT_RUNTIME_CONFIG,
  type MessageResponse,
  type MessageTarget,
  type Participant,
  SessionRuntime,
  type SessionRuntimeConfig,
} from './SessionRuntime.js';

/**
 * Framework server version.
 */
export const FRAMEWORK_SERVER_VERSION = '1.0.0';
