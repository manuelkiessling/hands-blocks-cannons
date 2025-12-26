/**
 * @fileoverview Build utilities for gesture apps.
 *
 * This package provides shared build configurations and utilities
 * to reduce duplication across application packages.
 */

export {
  type GenerateDockerOptions,
  generateDockerFiles,
  generateDockerfile,
  generateEntrypoint,
  generateNginxConf,
} from './generateDocker.js';
export { createGestureAppViteConfig, type GestureAppViteOptions } from './viteConfig.js';

/**
 * Framework build version.
 */
export const FRAMEWORK_BUILD_VERSION = '1.0.0';
