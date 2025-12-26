/**
 * @fileoverview Hello Hands - A minimal two-participant hand tracking demo.
 *
 * This is a proof-of-concept application demonstrating that the gesture-app
 * framework is truly app-agnostic. Two participants join, see each other's
 * hand positions, and can wave hello!
 */

import {
  type AppManifest,
  globalRegistry,
  validateManifest,
} from '@gesture-app/framework-protocol';

/** Application identifier */
export const APP_ID = 'hello-hands';

/** Human-readable application name */
export const APP_NAME = 'Hello Hands';

/** Application version */
export const APP_VERSION = '1.0.0';

/** Application manifest for framework registration */
export const APP_MANIFEST: AppManifest = {
  id: APP_ID,
  name: APP_NAME,
  version: APP_VERSION,
  description: 'A minimal two-participant hand tracking demo - wave hello to your friend!',
  tags: ['demo', 'minimal', 'hands'],
  supportsBot: false,
};

/**
 * Register this application with the global registry.
 * Safe to call multiple times (idempotent).
 */
export function registerApp(): void {
  if (!globalRegistry.has(APP_ID)) {
    validateManifest(APP_MANIFEST);
    globalRegistry.register(APP_MANIFEST);
  }
}

// Auto-register when this module is imported
registerApp();

// Re-export shared types for convenience
export * from './shared/index.js';
