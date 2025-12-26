/**
 * @fileoverview Shared test factories for app registration and manifest tests.
 *
 * These factories generate standard test suites that every app should have,
 * reducing duplication and ensuring consistency.
 */

import type { AppManifest } from '@gesture-app/framework-protocol';
import { globalRegistry } from '@gesture-app/framework-protocol';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Create a test suite for app manifest validation.
 *
 * Tests that the manifest has all required fields and valid structure.
 *
 * @example
 * ```typescript
 * import { createAppManifestTests } from '@gesture-app/framework-testing';
 *
 * describe('My App', () => {
 *   createAppManifestTests(APP_ID, APP_MANIFEST);
 * });
 * ```
 */
export function createAppManifestTests(appId: string, manifest: AppManifest): void {
  describe('manifest', () => {
    it('should have an id matching the expected value', () => {
      expect(manifest.id).toBe(appId);
    });

    it('should have a non-empty name', () => {
      expect(manifest.name).toBeDefined();
      expect(manifest.name.length).toBeGreaterThan(0);
    });

    it('should have a valid version string', () => {
      expect(manifest.version).toBeDefined();
      expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('should have a description if provided', () => {
      // Description is optional, but if provided should be non-empty
      if (manifest.description !== undefined) {
        expect(typeof manifest.description).toBe('string');
        expect(manifest.description.length).toBeGreaterThan(0);
      }
    });

    it('should have tags as an array if provided', () => {
      // Tags are optional, but if provided should be an array of strings
      if (manifest.tags !== undefined) {
        expect(Array.isArray(manifest.tags)).toBe(true);
        for (const tag of manifest.tags) {
          expect(typeof tag).toBe('string');
        }
      }
    });

    it('should have a valid manifest structure', () => {
      expect(manifest).toMatchObject({
        id: appId,
        name: expect.any(String),
        version: expect.any(String),
      });
    });
  });
}

/**
 * Create a test suite for app registration with the global registry.
 *
 * Tests that the app can register and be retrieved from the registry.
 *
 * @example
 * ```typescript
 * import { createAppRegistrationTests } from '@gesture-app/framework-testing';
 *
 * describe('My App', () => {
 *   createAppRegistrationTests(APP_ID, registerApp);
 * });
 * ```
 */
export function createAppRegistrationTests(appId: string, registerApp: () => void): void {
  describe('registration', () => {
    beforeEach(() => {
      globalRegistry.clear();
    });

    it('should register with global registry', () => {
      expect(globalRegistry.has(appId)).toBe(false);

      registerApp();

      expect(globalRegistry.has(appId)).toBe(true);
    });

    it('should be idempotent (safe to call multiple times)', () => {
      registerApp();
      registerApp();
      registerApp();

      expect(globalRegistry.has(appId)).toBe(true);
      expect(globalRegistry.listIds()).toHaveLength(1);
    });

    it('should be retrievable after registration', () => {
      registerApp();

      const manifest = globalRegistry.get(appId);
      expect(manifest.id).toBe(appId);
    });

    it('should coexist with other apps without conflicts', () => {
      // Register the app under test
      registerApp();

      // Register a mock second app
      const mockApp: AppManifest = {
        id: 'mock-test-app',
        name: 'Mock Test App',
        version: '1.0.0',
      };
      globalRegistry.register(mockApp);

      // Both should exist
      expect(globalRegistry.has(appId)).toBe(true);
      expect(globalRegistry.has('mock-test-app')).toBe(true);
      expect(globalRegistry.listIds()).toHaveLength(2);
    });

    it('should not require framework edits to register', () => {
      // This test documents that adding an app requires:
      // - NO changes to framework-protocol
      // - NO changes to framework-server
      // - NO changes to framework-client
      // The app self-registers using the public API

      registerApp();

      // If we got here, the framework API is sufficient
      expect(globalRegistry.get(appId)).toBeDefined();
    });
  });
}
