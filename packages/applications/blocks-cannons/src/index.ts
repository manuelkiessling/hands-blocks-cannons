/**
 * @fileoverview Blocks & Cannons application.
 *
 * This is a two-player competitive hand-gesture game where players:
 * - Control blocks using hand gestures (pinch to grab, move, release)
 * - Position blocks strategically to protect their side
 * - Fire projectiles from cannons to destroy opponent blocks
 * - Win by destroying all opponent blocks
 *
 * This package contains the app-specific logic that plugs into
 * the framework runtime.
 */

import { type AppManifest, globalRegistry } from '@gesture-app/framework-protocol';

/**
 * Application manifest for Blocks & Cannons.
 */
export const APP_MANIFEST: AppManifest = {
  id: 'blocks-cannons',
  name: 'Blocks & Cannons',
  version: '1.0.0',
  description: 'A two-player competitive hand-gesture game',
  tags: ['game', 'competitive', 'multiplayer'],
} as const;

/**
 * Application identifier.
 */
export const APP_ID = APP_MANIFEST.id;

/**
 * Application display name.
 */
export const APP_NAME = APP_MANIFEST.name;

/**
 * Application version.
 */
export const APP_VERSION = APP_MANIFEST.version;

/**
 * Register this application with the global registry.
 *
 * Call this at application startup to make the app discoverable
 * by the framework.
 */
export function registerApp(): void {
  if (!globalRegistry.has(APP_ID)) {
    globalRegistry.register(APP_MANIFEST);
  }
}

// Auto-register when this module is imported
registerApp();
