/**
 * @fileoverview Testing utilities for gesture apps.
 *
 * This package provides shared test utilities, factories, and helpers
 * for testing gesture application packages.
 */

export { createAppManifestTests, createAppRegistrationTests } from './appTests.js';
export { createMockConnection, type MockConnection } from './mockConnection.js';
export { createMockLandmarks, createMockTrackedHand, type MockTrackedHand } from './mockHands.js';

/**
 * Framework testing version.
 */
export const FRAMEWORK_TESTING_VERSION = '1.0.0';
