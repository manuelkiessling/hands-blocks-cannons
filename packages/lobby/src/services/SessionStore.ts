import type { AppSession, OpponentType, SessionStatus } from '../types.js';

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
 * In-memory store for app sessions.
 */
export class SessionStore {
  private sessions = new Map<string, AppSession>();
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
   * Generate the session URL.
   * Format: https://{sessionId}-{appId}-gestures.{baseDomain}
   * Example: https://xf46zra-blocks-cannons-gestures.dx-tooling.org
   */
  private generateSessionUrl(sessionId: string, appId: string): string {
    return `https://${sessionId}-${appId}-gestures.${this.config.baseDomain}`;
  }

  /**
   * Create a new session.
   */
  create(id: string, appId: string, opponentType: OpponentType): AppSession {
    const sessionUrl = this.generateSessionUrl(id, appId);
    const joinUrl = opponentType === 'human' ? sessionUrl : null;
    const containerName = `session-${appId}-${id}`;

    const session: AppSession = {
      id,
      appId,
      opponentType,
      status: 'starting',
      sessionUrl,
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
  get(id: string): AppSession | undefined {
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
  getAll(): AppSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get all sessions for a specific app.
   */
  getByAppId(appId: string): AppSession[] {
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
