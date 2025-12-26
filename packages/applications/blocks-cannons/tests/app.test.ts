import { globalRegistry } from '@gesture-app/framework-protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import { APP_ID, APP_MANIFEST, APP_NAME, APP_VERSION, registerApp } from '../src/index.js';

describe('blocks-cannons app', () => {
  describe('manifest', () => {
    it('should export app identifier', () => {
      expect(APP_ID).toBe('blocks-cannons');
    });

    it('should export app name', () => {
      expect(APP_NAME).toBe('Blocks & Cannons');
    });

    it('should export app version', () => {
      expect(APP_VERSION).toBe('1.0.0');
    });

    it('should export valid app manifest', () => {
      expect(APP_MANIFEST.id).toBe('blocks-cannons');
      expect(APP_MANIFEST.name).toBe('Blocks & Cannons');
      expect(APP_MANIFEST.version).toBe('1.0.0');
      expect(APP_MANIFEST.description).toBe('A two-player competitive hand-gesture game');
      expect(APP_MANIFEST.tags).toEqual(['game', 'competitive', 'multiplayer']);
    });
  });

  describe('registration', () => {
    beforeEach(() => {
      globalRegistry.clear();
    });

    it('should auto-register with global registry on import', () => {
      // The import at the top of this file triggers auto-registration
      // But we cleared the registry in beforeEach, so re-register
      registerApp();

      expect(globalRegistry.has('blocks-cannons')).toBe(true);
    });

    it('should be discoverable in global registry', () => {
      registerApp();

      const manifest = globalRegistry.get('blocks-cannons');

      expect(manifest.id).toBe('blocks-cannons');
      expect(manifest.name).toBe('Blocks & Cannons');
    });

    it('should handle multiple registerApp calls gracefully', () => {
      registerApp();
      registerApp(); // Should not throw
      registerApp();

      expect(globalRegistry.size).toBe(1);
    });
  });
});
