import type { GameSession, OpponentType, SessionStatus } from '../types.js';

/**
 * Configuration for session URL generation.
 */
export interface SessionStoreConfig {
  /**
   * Base domain for session URLs.
   * Sessions are hosted at: {sessionId}-{appId}-gestures.{baseDomain}
   * Example: xf46zra-blocks-cannons-gestures.dx-tooling.org
   */
  baseDomain: string;
}

/**
 * Default configuration.
 */
const DEFAULT_CONFIG: SessionStoreConfig = {
  baseDomain: 'dx-tooling.org',
};

/**
 * In-memory store for game sessions.
 */
export class SessionStore {
  private sessions = new Map<string, GameSession>();
  private readonly config: SessionStoreConfig;

  constructor(config: Partial<SessionStoreConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate a unique session ID.
   */
  generateSessionId(): string {
    // Generate 6 random alphanumeric characters
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 6; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    // Ensure uniqueness
    if (this.sessions.has(id)) {
      return this.generateSessionId();
    }
    return id;
  }

  /**
   * Generate the game URL for a session.
   * Format: https://{sessionId}-{appId}-gestures.{baseDomain}
   * Example: https://xf46zra-blocks-cannons-gestures.dx-tooling.org
   */
  private generateGameUrl(sessionId: string, appId: string): string {
    return `https://${sessionId}-${appId}-gestures.${this.config.baseDomain}`;
  }

  /**
   * Create a new session.
   */
  create(id: string, appId: string, opponentType: OpponentType): GameSession {
    const gameUrl = this.generateGameUrl(id, appId);
    const joinUrl = opponentType === 'human' ? gameUrl : null;
    const containerName = `session-${appId}-${id}`;

    const session: GameSession = {
      id,
      appId,
      opponentType,
      status: 'starting',
      gameUrl,
      joinUrl,
      containerName,
      createdAt: new Date(),
    };

    this.sessions.set(id, session);
    return session;
  }

  /**
   * Get a session by ID.
   */
  get(id: string): GameSession | undefined {
    return this.sessions.get(id);
  }

  /**
   * Update session status.
   */
  updateStatus(id: string, status: SessionStatus, errorMessage?: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.status = status;
      if (errorMessage) {
        session.errorMessage = errorMessage;
      }
    }
  }

  /**
   * Delete a session.
   */
  delete(id: string): boolean {
    return this.sessions.delete(id);
  }

  /**
   * Get all sessions.
   */
  getAll(): GameSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get all sessions for a specific app.
   */
  getByAppId(appId: string): GameSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.appId === appId);
  }

  /**
   * Clean up old sessions (ended or error status older than 1 hour).
   */
  cleanup(): number {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    let cleaned = 0;

    for (const [id, session] of this.sessions) {
      if (
        (session.status === 'ended' || session.status === 'error') &&
        session.createdAt < oneHourAgo
      ) {
        this.sessions.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }
}
