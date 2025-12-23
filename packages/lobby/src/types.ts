/**
 * Game session types for the lobby.
 */

export type OpponentType = 'bot' | 'human';

export type SessionStatus = 'starting' | 'waiting' | 'active' | 'ended' | 'error';

export interface GameSession {
  /** Unique session identifier (alphanumeric, lowercase) */
  id: string;
  /** Type of opponent */
  opponentType: OpponentType;
  /** Current session status */
  status: SessionStatus;
  /** URL to join the game */
  gameUrl: string;
  /** URL to share with opponent (for human games) */
  joinUrl: string | null;
  /** Docker container name */
  containerName: string;
  /** When the session was created */
  createdAt: Date;
  /** Error message if status is 'error' */
  errorMessage?: string;
}

export interface CreateSessionRequest {
  opponentType: OpponentType;
  botDifficulty?: number;
}

export interface CreateSessionResponse {
  sessionId: string;
  gameUrl: string;
  joinUrl: string | null;
}

export interface SessionStatusResponse {
  sessionId: string;
  status: SessionStatus;
  gameUrl: string;
  joinUrl: string | null;
  errorMessage?: string;
}
