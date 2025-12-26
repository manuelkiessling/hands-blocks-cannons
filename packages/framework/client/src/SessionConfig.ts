/**
 * @fileoverview Runtime session configuration.
 *
 * This module provides a way to inject session configuration at runtime,
 * eliminating hard-coded domain patterns. Configuration can be provided via:
 * 1. `window.__SESSION_CONFIG__` (injected by nginx/entrypoint before app loads)
 * 2. Fetched from `/session.json` endpoint (fallback)
 * 3. Local development mode (auto-detected, shows manual connection UI)
 */

/**
 * Runtime session configuration injected by the hosting environment.
 */
export interface SessionConfig {
  /** Application identifier (e.g., "blocks-cannons") */
  readonly appId: string;
  /** WebSocket URL for session server connection */
  readonly wsUrl: string;
  /** URL to return to the lobby */
  readonly lobbyUrl: string;
  /** Optional app-specific configuration */
  readonly appConfig?: unknown;
}

/**
 * Result of session config resolution.
 */
export type SessionConfigResult =
  | { mode: 'session'; config: SessionConfig }
  | { mode: 'development' };

// Extend Window interface to include our injected config
declare global {
  interface Window {
    __SESSION_CONFIG__?: SessionConfig;
  }
}

/**
 * Check if we're running in local development mode.
 * In development, we show the manual connection UI instead of auto-connecting.
 */
export function isLocalDevelopment(): boolean {
  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

/**
 * Get session config from the window global (injected by server).
 * Returns null if not present.
 */
export function getInjectedConfig(): SessionConfig | null {
  const config = window.__SESSION_CONFIG__;
  if (!config) {
    return null;
  }

  // Validate required fields
  if (
    typeof config.appId !== 'string' ||
    typeof config.wsUrl !== 'string' ||
    typeof config.lobbyUrl !== 'string'
  ) {
    console.warn('Invalid __SESSION_CONFIG__: missing required fields', config);
    return null;
  }

  return config;
}

/**
 * Fetch session config from /session.json endpoint.
 * Returns null if fetch fails or config is invalid.
 */
export async function fetchSessionConfig(): Promise<SessionConfig | null> {
  try {
    const response = await fetch('/session.json');
    if (!response.ok) {
      return null;
    }

    const config = await response.json();

    // Validate required fields
    if (
      typeof config.appId !== 'string' ||
      typeof config.wsUrl !== 'string' ||
      typeof config.lobbyUrl !== 'string'
    ) {
      console.warn('Invalid session.json: missing required fields', config);
      return null;
    }

    return config as SessionConfig;
  } catch {
    // Fetch failed (404, network error, etc.) - this is expected in dev mode
    return null;
  }
}

/**
 * Resolve session configuration.
 *
 * Resolution order:
 * 1. If in local development mode → return development mode (manual connection)
 * 2. Check window.__SESSION_CONFIG__ → use if present
 * 3. Fetch /session.json → use if available
 * 4. Fall back to development mode
 *
 * @returns SessionConfigResult indicating either session mode with config, or development mode
 */
export async function resolveSessionConfig(): Promise<SessionConfigResult> {
  // Local development always uses manual connection
  if (isLocalDevelopment()) {
    return { mode: 'development' };
  }

  // Try injected config first (synchronous, preferred)
  const injected = getInjectedConfig();
  if (injected) {
    return { mode: 'session', config: injected };
  }

  // Try fetching from endpoint
  const fetched = await fetchSessionConfig();
  if (fetched) {
    return { mode: 'session', config: fetched };
  }

  // No config available - fall back to development mode
  // This handles cases where someone accesses the raw client without session setup
  console.warn('No session config found, falling back to development mode');
  return { mode: 'development' };
}
