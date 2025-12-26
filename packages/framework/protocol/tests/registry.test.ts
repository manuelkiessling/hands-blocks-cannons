import { beforeEach, describe, expect, it } from 'vitest';
import {
  type AppManifest,
  AppNotFoundError,
  AppRegistry,
  DuplicateAppError,
  globalRegistry,
  InvalidManifestError,
  validateManifest,
} from '../src/index.js';

describe('AppRegistry', () => {
  let registry: AppRegistry;

  beforeEach(() => {
    registry = new AppRegistry();
  });

  describe('register', () => {
    it('should register a valid app manifest', () => {
      const manifest: AppManifest = {
        id: 'test-app',
        name: 'Test App',
        version: '1.0.0',
      };

      registry.register(manifest);

      expect(registry.has('test-app')).toBe(true);
    });

    it('should register app with optional description', () => {
      const manifest: AppManifest = {
        id: 'test-app',
        name: 'Test App',
        version: '1.0.0',
        description: 'A test application',
      };

      registry.register(manifest);

      const retrieved = registry.get('test-app');
      expect(retrieved.description).toBe('A test application');
    });

    it('should register app with optional tags', () => {
      const manifest: AppManifest = {
        id: 'test-app',
        name: 'Test App',
        version: '1.0.0',
        tags: ['demo', 'multiplayer'],
      };

      registry.register(manifest);

      const retrieved = registry.get('test-app');
      expect(retrieved.tags).toEqual(['demo', 'multiplayer']);
    });

    it('should throw DuplicateAppError for duplicate registration', () => {
      const manifest: AppManifest = {
        id: 'test-app',
        name: 'Test App',
        version: '1.0.0',
      };

      registry.register(manifest);

      expect(() => registry.register(manifest)).toThrow(DuplicateAppError);
      expect(() => registry.register(manifest)).toThrow('Application already registered: test-app');
    });
  });

  describe('get', () => {
    it('should return registered app manifest', () => {
      const manifest: AppManifest = {
        id: 'test-app',
        name: 'Test App',
        version: '1.0.0',
      };

      registry.register(manifest);
      const retrieved = registry.get('test-app');

      expect(retrieved).toEqual(manifest);
    });

    it('should throw AppNotFoundError for unregistered app', () => {
      expect(() => registry.get('unknown-app')).toThrow(AppNotFoundError);
      expect(() => registry.get('unknown-app')).toThrow('Application not found: unknown-app');
    });
  });

  describe('tryGet', () => {
    it('should return manifest for registered app', () => {
      const manifest: AppManifest = {
        id: 'test-app',
        name: 'Test App',
        version: '1.0.0',
      };

      registry.register(manifest);

      expect(registry.tryGet('test-app')).toEqual(manifest);
    });

    it('should return undefined for unregistered app', () => {
      expect(registry.tryGet('unknown-app')).toBeUndefined();
    });
  });

  describe('has', () => {
    it('should return true for registered app', () => {
      registry.register({
        id: 'test-app',
        name: 'Test App',
        version: '1.0.0',
      });

      expect(registry.has('test-app')).toBe(true);
    });

    it('should return false for unregistered app', () => {
      expect(registry.has('unknown-app')).toBe(false);
    });
  });

  describe('listIds', () => {
    it('should return empty array for empty registry', () => {
      expect(registry.listIds()).toEqual([]);
    });

    it('should return all registered app IDs', () => {
      registry.register({ id: 'app-a', name: 'App A', version: '1.0.0' });
      registry.register({ id: 'app-b', name: 'App B', version: '1.0.0' });
      registry.register({ id: 'app-c', name: 'App C', version: '1.0.0' });

      const ids = registry.listIds();

      expect(ids).toHaveLength(3);
      expect(ids).toContain('app-a');
      expect(ids).toContain('app-b');
      expect(ids).toContain('app-c');
    });
  });

  describe('listAll', () => {
    it('should return empty array for empty registry', () => {
      expect(registry.listAll()).toEqual([]);
    });

    it('should return all registered manifests', () => {
      const manifests: AppManifest[] = [
        { id: 'app-a', name: 'App A', version: '1.0.0' },
        { id: 'app-b', name: 'App B', version: '2.0.0' },
      ];

      for (const m of manifests) {
        registry.register(m);
      }

      const all = registry.listAll();

      expect(all).toHaveLength(2);
      expect(all).toContainEqual(manifests[0]);
      expect(all).toContainEqual(manifests[1]);
    });
  });

  describe('size', () => {
    it('should return 0 for empty registry', () => {
      expect(registry.size).toBe(0);
    });

    it('should return correct count', () => {
      registry.register({ id: 'app-a', name: 'A', version: '1.0.0' });
      registry.register({ id: 'app-b', name: 'B', version: '1.0.0' });

      expect(registry.size).toBe(2);
    });
  });

  describe('clear', () => {
    it('should remove all registered apps', () => {
      registry.register({ id: 'app-a', name: 'A', version: '1.0.0' });
      registry.register({ id: 'app-b', name: 'B', version: '1.0.0' });

      registry.clear();

      expect(registry.size).toBe(0);
      expect(registry.has('app-a')).toBe(false);
      expect(registry.has('app-b')).toBe(false);
    });
  });
});

describe('validateManifest', () => {
  it('should accept valid manifest', () => {
    expect(() =>
      validateManifest({
        id: 'test',
        name: 'Test',
        version: '1.0.0',
      })
    ).not.toThrow();
  });

  it('should reject null', () => {
    expect(() => validateManifest(null)).toThrow(InvalidManifestError);
    expect(() => validateManifest(null)).toThrow('manifest must be an object');
  });

  it('should reject non-object', () => {
    expect(() => validateManifest('string')).toThrow(InvalidManifestError);
    expect(() => validateManifest(123)).toThrow(InvalidManifestError);
  });

  it('should reject missing id', () => {
    expect(() =>
      validateManifest({
        name: 'Test',
        version: '1.0.0',
      })
    ).toThrow('id must be a non-empty string');
  });

  it('should reject empty id', () => {
    expect(() =>
      validateManifest({
        id: '',
        name: 'Test',
        version: '1.0.0',
      })
    ).toThrow('id must be a non-empty string');
  });

  it('should reject missing name', () => {
    expect(() =>
      validateManifest({
        id: 'test',
        version: '1.0.0',
      })
    ).toThrow('name must be a non-empty string');
  });

  it('should reject missing version', () => {
    expect(() =>
      validateManifest({
        id: 'test',
        name: 'Test',
      })
    ).toThrow('version must be a non-empty string');
  });

  it('should reject non-string description', () => {
    expect(() =>
      validateManifest({
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        description: 123,
      })
    ).toThrow('description must be a string');
  });

  it('should reject non-array tags', () => {
    expect(() =>
      validateManifest({
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        tags: 'not-array',
      })
    ).toThrow('tags must be an array');
  });

  it('should reject non-string tag items', () => {
    expect(() =>
      validateManifest({
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        tags: ['valid', 123],
      })
    ).toThrow('tags must be an array of strings');
  });
});

describe('globalRegistry', () => {
  beforeEach(() => {
    globalRegistry.clear();
  });

  it('should be an AppRegistry instance', () => {
    expect(globalRegistry).toBeInstanceOf(AppRegistry);
  });

  it('should be shared across imports', () => {
    globalRegistry.register({
      id: 'shared-test',
      name: 'Shared Test',
      version: '1.0.0',
    });

    expect(globalRegistry.has('shared-test')).toBe(true);
  });
});
