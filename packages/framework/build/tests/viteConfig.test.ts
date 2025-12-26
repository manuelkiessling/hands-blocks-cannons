/**
 * @fileoverview Tests for Vite config factory.
 */

import { describe, expect, it } from 'vitest';
import { createGestureAppViteConfig, type GestureAppViteOptions } from '../src/viteConfig.js';

describe('createGestureAppViteConfig', () => {
  const baseOptions: GestureAppViteOptions = {
    clientDir: '/test/client',
  };

  it('should create config with default options', () => {
    const config = createGestureAppViteConfig(baseOptions);

    expect(config.root).toBe('/test/client');
    expect(config.base).toBe('./');
    expect(config.build?.outDir).toBe('../dist/client');
    expect(config.build?.target).toBe('ES2022');
    expect(config.server?.port).toBe(5173);
    expect(config.server?.open).toBe(false);
  });

  it('should apply custom port', () => {
    const config = createGestureAppViteConfig({
      ...baseOptions,
      port: 5174,
    });

    expect(config.server?.port).toBe(5174);
  });

  it('should enable sourcemaps when specified', () => {
    const config = createGestureAppViteConfig({
      ...baseOptions,
      sourcemap: true,
    });

    expect(config.build?.sourcemap).toBe(true);
  });

  it('should enable browser open when specified', () => {
    const config = createGestureAppViteConfig({
      ...baseOptions,
      open: true,
    });

    expect(config.server?.open).toBe(true);
  });

  it('should use custom output directory', () => {
    const config = createGestureAppViteConfig({
      ...baseOptions,
      outDir: '../build/static',
    });

    expect(config.build?.outDir).toBe('../build/static');
  });

  it('should include MediaPipe plugin by default', () => {
    const config = createGestureAppViteConfig(baseOptions);

    expect(config.plugins).toBeDefined();
    expect(Array.isArray(config.plugins)).toBe(true);
    // MediaPipe plugin should be included
    expect(config.plugins?.length).toBeGreaterThan(0);
  });

  it('should exclude MediaPipe plugin when disabled', () => {
    const config = createGestureAppViteConfig({
      ...baseOptions,
      includeMediaPipe: false,
    });

    // No plugins added when MediaPipe is disabled and no additional plugins
    expect(config.plugins?.length).toBe(0);
  });
});
