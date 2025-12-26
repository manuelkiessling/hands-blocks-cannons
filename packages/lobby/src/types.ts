/**
 * App session types for the lobby.
 */

export type OpponentType = 'bot' | 'human';

export type SessionStatus = 'starting' | 'waiting' | 'active' | 'ended' | 'error';

export interface AppSession {
  /** Unique session identifier (alphanumeric, lowercase) */
  id: string;
  /** Application identifier */
  appId: string;
  /** Type of opponent */
  opponentType: OpponentType;
  /** Current session status */
  status: SessionStatus;
  /** URL to join the session */
  sessionUrl: string;
  /** URL to share with opponent (for human sessions) */
  joinUrl: string | null;
  /** Docker container name */
  containerName: string;
  /** When the session was created */
  createdAt: Date;
  /** Error message if status is 'error' */
  errorMessage?: string;
}

export interface CreateSessionRequest {
  /** Application identifier (must be registered in app registry) */
  appId: string;
  /** Type of opponent */
  opponentType: OpponentType;
  /** Bot difficulty (0.0 - 1.0), only used when opponentType is 'bot' */
  botDifficulty?: number;
}

export interface CreateSessionResponse {
  sessionId: string;
  appId: string;
  sessionUrl: string;
  joinUrl: string | null;
}

export interface SessionStatusResponse {
  sessionId: string;
  appId: string;
  status: SessionStatus;
  sessionUrl: string;
  joinUrl: string | null;
  errorMessage?: string;
}
