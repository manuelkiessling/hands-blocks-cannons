/**
 * @fileoverview Application registry for the gesture framework.
 *
 * The registry allows applications to self-register and be discovered
 * by the framework at runtime. This enables:
 * - Adding new apps without modifying framework code
 * - Dynamic app selection in lobby and containers
 * - App metadata for UI display
 */

/**
 * Application manifest - the contract apps implement to register with the framework.
 *
 * This is the minimal metadata required for an app to be usable.
 * Apps may extend this with additional app-specific metadata.
 */
export interface AppManifest {
  /** Unique app identifier (e.g., 'blocks-cannons') */
  readonly id: string;

  /** Display name for UI */
  readonly name: string;

  /** Semantic version */
  readonly version: string;

  /** Optional description */
  readonly description?: string;

  /** Optional tags for categorization */
  readonly tags?: readonly string[];
}

/**
 * Error thrown when an app is not found in the registry.
 */
export class AppNotFoundError extends Error {
  constructor(appId: string) {
    super(`Application not found: ${appId}`);
    this.name = 'AppNotFoundError';
  }
}

/**
 * Error thrown when trying to register an app with a duplicate ID.
 */
export class DuplicateAppError extends Error {
  constructor(appId: string) {
    super(`Application already registered: ${appId}`);
    this.name = 'DuplicateAppError';
  }
}

/**
 * Error thrown when an app manifest is invalid.
 */
export class InvalidManifestError extends Error {
  constructor(message: string) {
    super(`Invalid app manifest: ${message}`);
    this.name = 'InvalidManifestError';
  }
}

/**
 * Validate an app manifest.
 * @throws {InvalidManifestError} if manifest is invalid
 */
export function validateManifest(manifest: unknown): asserts manifest is AppManifest {
  if (typeof manifest !== 'object' || manifest === null) {
    throw new InvalidManifestError('manifest must be an object');
  }

  const m = manifest as Record<string, unknown>;

  if (typeof m['id'] !== 'string' || m['id'].length === 0) {
    throw new InvalidManifestError('id must be a non-empty string');
  }

  if (typeof m['name'] !== 'string' || m['name'].length === 0) {
    throw new InvalidManifestError('name must be a non-empty string');
  }

  if (typeof m['version'] !== 'string' || m['version'].length === 0) {
    throw new InvalidManifestError('version must be a non-empty string');
  }

  if (m['description'] !== undefined && typeof m['description'] !== 'string') {
    throw new InvalidManifestError('description must be a string');
  }

  if (m['tags'] !== undefined) {
    if (!Array.isArray(m['tags'])) {
      throw new InvalidManifestError('tags must be an array');
    }
    for (const tag of m['tags']) {
      if (typeof tag !== 'string') {
        throw new InvalidManifestError('tags must be an array of strings');
      }
    }
  }
}

/**
 * Application registry.
 *
 * Apps register themselves with the registry at startup, allowing the
 * framework to discover and load them by ID.
 *
 * @example
 * ```typescript
 * const registry = new AppRegistry();
 *
 * // Apps self-register
 * registry.register({
 *   id: 'blocks-cannons',
 *   name: 'Blocks & Cannons',
 *   version: '1.0.0',
 * });
 *
 * // Framework uses registry to load apps
 * const manifest = registry.get('blocks-cannons');
 * ```
 */
export class AppRegistry {
  private readonly apps = new Map<string, AppManifest>();

  /**
   * Register an application.
   * @param manifest - App manifest
   * @throws {InvalidManifestError} if manifest is invalid
   * @throws {DuplicateAppError} if app with same ID already registered
   */
  register(manifest: AppManifest): void {
    validateManifest(manifest);

    if (this.apps.has(manifest.id)) {
      throw new DuplicateAppError(manifest.id);
    }

    this.apps.set(manifest.id, manifest);
  }

  /**
   * Get an app manifest by ID.
   * @param appId - App identifier
   * @throws {AppNotFoundError} if app not found
   */
  get(appId: string): AppManifest {
    const manifest = this.apps.get(appId);
    if (!manifest) {
      throw new AppNotFoundError(appId);
    }
    return manifest;
  }

  /**
   * Check if an app is registered.
   * @param appId - App identifier
   */
  has(appId: string): boolean {
    return this.apps.has(appId);
  }

  /**
   * Get an app manifest by ID, or undefined if not found.
   * @param appId - App identifier
   */
  tryGet(appId: string): AppManifest | undefined {
    return this.apps.get(appId);
  }

  /**
   * List all registered app IDs.
   */
  listIds(): string[] {
    return [...this.apps.keys()];
  }

  /**
   * List all registered app manifests.
   */
  listAll(): AppManifest[] {
    return [...this.apps.values()];
  }

  /**
   * Get the number of registered apps.
   */
  get size(): number {
    return this.apps.size;
  }

  /**
   * Clear all registered apps.
   * Primarily useful for testing.
   */
  clear(): void {
    this.apps.clear();
  }
}

/**
 * Global app registry instance.
 *
 * Apps can import and register themselves with this shared instance.
 * The framework uses this instance to discover and load apps.
 */
export const globalRegistry = new AppRegistry();
