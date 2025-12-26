/**
 * @fileoverview Shared Vite configuration factory for gesture apps.
 *
 * Provides a consistent build configuration for all app clients,
 * including MediaPipe asset copying and common settings.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type UserConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

/**
 * Options for creating a gesture app Vite config.
 */
export interface GestureAppViteOptions {
  /**
   * Absolute path to the client directory (where vite.config.ts is located).
   * Use: dirname(fileURLToPath(import.meta.url))
   */
  readonly clientDir: string;

  /**
   * Development server port.
   * @default 5173
   */
  readonly port?: number;

  /**
   * Whether to open browser on dev server start.
   * @default false
   */
  readonly open?: boolean;

  /**
   * Whether to generate sourcemaps.
   * @default false
   */
  readonly sourcemap?: boolean;

  /**
   * Additional Vite plugins to include.
   * @default []
   */
  readonly additionalPlugins?: UserConfig['plugins'];

  /**
   * Path to node_modules from the client directory.
   * Used to locate MediaPipe assets.
   * @default '../../../../node_modules'
   */
  readonly nodeModulesPath?: string;

  /**
   * Whether to include MediaPipe hands assets.
   * @default true
   */
  readonly includeMediaPipe?: boolean;

  /**
   * Output directory relative to the client directory.
   * @default '../dist/client'
   */
  readonly outDir?: string;
}

/**
 * Create a Vite configuration for a gesture app client.
 *
 * @example
 * ```typescript
 * // client/vite.config.ts
 * import { dirname } from 'node:path';
 * import { fileURLToPath } from 'node:url';
 * import { createGestureAppViteConfig } from '@gesture-app/framework-build';
 *
 * export default createGestureAppViteConfig({
 *   clientDir: dirname(fileURLToPath(import.meta.url)),
 *   port: 5173,
 * });
 * ```
 */
export function createGestureAppViteConfig(options: GestureAppViteOptions): UserConfig {
  const {
    clientDir,
    port = 5173,
    open = false,
    sourcemap = false,
    additionalPlugins = [],
    nodeModulesPath = '../../../../node_modules',
    includeMediaPipe = true,
    outDir = '../dist/client',
  } = options;

  const plugins: UserConfig['plugins'] = [];

  // Add MediaPipe static copy plugin if enabled
  if (includeMediaPipe) {
    plugins.push(
      viteStaticCopy({
        targets: [
          {
            src: resolve(clientDir, nodeModulesPath, '@mediapipe/hands/*'),
            dest: 'mediapipe/hands',
          },
        ],
      })
    );
  }

  // Add any additional plugins
  if (additionalPlugins) {
    plugins.push(...additionalPlugins);
  }

  return defineConfig({
    root: clientDir,
    base: './',
    build: {
      outDir,
      emptyOutDir: true,
      target: 'ES2022',
      sourcemap,
    },
    server: {
      port,
      open,
    },
    plugins,
  });
}
