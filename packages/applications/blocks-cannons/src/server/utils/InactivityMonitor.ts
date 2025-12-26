import { INACTIVITY_CHECK_INTERVAL_MS, INACTIVITY_TIMEOUT_MS } from '../game/types.js';
import { logger } from './logger.js';

export interface InactivityMonitorConfig {
  /** Timeout in milliseconds before shutdown */
  timeoutMs: number;
  /** Interval in milliseconds between checks */
  checkIntervalMs: number;
  /** Callback to invoke when shutdown is triggered */
  onShutdown: (reason: string) => void;
}

/**
 * Monitors server activity and triggers shutdown after a period of inactivity.
 *
 * Inactivity is defined as:
 * - No player has ever connected AND startup timeout reached
 * - No players currently connected AND last activity timeout reached
 */
export class InactivityMonitor {
  private readonly config: InactivityMonitorConfig;
  private readonly startTime: number;
  private lastActivityTime: number;
  private connectionCount: number;
  private hasEverConnected: boolean;
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<InactivityMonitorConfig> & { onShutdown: (reason: string) => void }) {
    this.config = {
      timeoutMs: config.timeoutMs ?? INACTIVITY_TIMEOUT_MS,
      checkIntervalMs: config.checkIntervalMs ?? INACTIVITY_CHECK_INTERVAL_MS,
      onShutdown: config.onShutdown,
    };

    this.startTime = Date.now();
    this.lastActivityTime = Date.now();
    this.connectionCount = 0;
    this.hasEverConnected = false;

    this.startChecking();

    logger.info('Inactivity monitor started', {
      timeoutMs: this.config.timeoutMs,
      checkIntervalMs: this.config.checkIntervalMs,
    });
  }

  /**
   * Record that activity has occurred (e.g., a message was received).
   */
  recordActivity(): void {
    this.lastActivityTime = Date.now();
  }

  /**
   * Record a connection state change.
   * @param connected - true if a new connection, false if a disconnection
   */
  recordConnection(connected: boolean): void {
    if (connected) {
      this.connectionCount++;
      this.hasEverConnected = true;
      this.lastActivityTime = Date.now();
      logger.debug('Connection recorded', { connectionCount: this.connectionCount });
    } else {
      this.connectionCount = Math.max(0, this.connectionCount - 1);
      this.lastActivityTime = Date.now();
      logger.debug('Disconnection recorded', { connectionCount: this.connectionCount });
    }
  }

  /**
   * Get current connection count.
   */
  getConnectionCount(): number {
    return this.connectionCount;
  }

  /**
   * Stop the inactivity monitor.
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('Inactivity monitor stopped');
    }
  }

  private startChecking(): void {
    this.checkInterval = setInterval(() => this.check(), this.config.checkIntervalMs);
  }

  private check(): void {
    const now = Date.now();
    const timeSinceStart = now - this.startTime;
    const timeSinceActivity = now - this.lastActivityTime;

    // Case 1: No one has ever connected and startup timeout reached
    if (!this.hasEverConnected && timeSinceStart >= this.config.timeoutMs) {
      const reason = `No players connected within ${this.config.timeoutMs / 1000} seconds of startup`;
      logger.info('Inactivity timeout triggered', { reason, timeSinceStart });
      this.stop();
      this.config.onShutdown(reason);
      return;
    }

    // Case 2: Had connections but now empty and timeout reached
    if (
      this.hasEverConnected &&
      this.connectionCount === 0 &&
      timeSinceActivity >= this.config.timeoutMs
    ) {
      const reason = `No players connected for ${this.config.timeoutMs / 1000} seconds`;
      logger.info('Inactivity timeout triggered', { reason, timeSinceActivity });
      this.stop();
      this.config.onShutdown(reason);
      return;
    }

    // Case 3: Players connected but no activity for timeout period
    if (this.connectionCount > 0 && timeSinceActivity >= this.config.timeoutMs) {
      const reason = `No activity for ${this.config.timeoutMs / 1000} seconds`;
      logger.info('Inactivity timeout triggered', { reason, timeSinceActivity });
      this.stop();
      this.config.onShutdown(reason);
      return;
    }

    // Log status periodically for debugging
    logger.debug('Inactivity check', {
      connectionCount: this.connectionCount,
      hasEverConnected: this.hasEverConnected,
      timeSinceActivity: Math.round(timeSinceActivity / 1000),
      timeSinceStart: Math.round(timeSinceStart / 1000),
      timeoutSeconds: this.config.timeoutMs / 1000,
    });
  }
}
