/**
 * @fileoverview Generate Docker configuration files for a gesture app.
 *
 * This module provides utilities to generate Dockerfile, nginx.conf,
 * and entrypoint.sh from templates, customized for a specific app.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Options for generating Docker files.
 */
export interface GenerateDockerOptions {
  /** App name (e.g., 'hello-hands', 'blocks-cannons') */
  readonly appName: string;

  /** Display name for logging (e.g., 'Hello Hands', 'Blocks & Cannons') */
  readonly displayName?: string;

  /** Output directory for generated files (default: ./docker relative to appDir) */
  readonly outputDir?: string;

  /** App directory (where package.json is) */
  readonly appDir: string;

  /** WebSocket server port (default: 3001) */
  readonly port?: number;

  /** Additional environment variables to include */
  readonly additionalEnvVars?: Record<string, string>;

  /** Whether to include bot support in entrypoint */
  readonly withBotSupport?: boolean;
}

/**
 * Template placeholders.
 */
const PLACEHOLDERS = {
  APP_NAME: '{{APP_NAME}}',
  APP_DISPLAY_NAME: '{{APP_DISPLAY_NAME}}',
  PORT: '{{PORT}}',
  ADDITIONAL_ENV_VARS: '{{ADDITIONAL_ENV_VARS}}',
};

/**
 * Get the templates directory path.
 */
function getTemplatesDir(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  // When running from dist, templates are in ../docker relative to dist
  // When running from src, templates are in ../docker relative to src
  const possiblePaths = [join(__dirname, '..', 'docker'), join(__dirname, '..', '..', 'docker')];

  for (const p of possiblePaths) {
    if (existsSync(join(p, 'Dockerfile.template'))) {
      return p;
    }
  }

  throw new Error('Could not find Docker templates directory');
}

/**
 * Replace template placeholders with actual values.
 */
function replacePlaceholders(template: string, options: GenerateDockerOptions): string {
  let result = template;

  // Replace all occurrences
  result = result.replaceAll(PLACEHOLDERS.APP_NAME, options.appName);
  result = result.replaceAll(PLACEHOLDERS.APP_DISPLAY_NAME, options.displayName ?? options.appName);
  result = result.replaceAll(PLACEHOLDERS.PORT, String(options.port ?? 3001));

  // Handle additional env vars
  if (options.additionalEnvVars) {
    const envLines = Object.entries(options.additionalEnvVars)
      .map(([key, value]) => `ENV ${key}="${value}"`)
      .join('\n');
    result = result.replaceAll(PLACEHOLDERS.ADDITIONAL_ENV_VARS, envLines);
  } else {
    result = result.replaceAll(PLACEHOLDERS.ADDITIONAL_ENV_VARS, '');
  }

  return result;
}

/**
 * Generate Dockerfile for an app.
 */
export function generateDockerfile(options: GenerateDockerOptions): string {
  const templatesDir = getTemplatesDir();
  const template = readFileSync(join(templatesDir, 'Dockerfile.template'), 'utf-8');
  return replacePlaceholders(template, options);
}

/**
 * Generate nginx.conf for an app.
 */
export function generateNginxConf(options: GenerateDockerOptions): string {
  const templatesDir = getTemplatesDir();
  const template = readFileSync(join(templatesDir, 'nginx.conf.template'), 'utf-8');
  return replacePlaceholders(template, options);
}

/**
 * Generate entrypoint.sh for an app.
 */
export function generateEntrypoint(options: GenerateDockerOptions): string {
  const templatesDir = getTemplatesDir();
  const template = readFileSync(join(templatesDir, 'entrypoint.sh.template'), 'utf-8');
  return replacePlaceholders(template, options);
}

/**
 * Generate all Docker files for an app and write them to disk.
 *
 * @example
 * ```typescript
 * generateDockerFiles({
 *   appName: 'my-app',
 *   displayName: 'My App',
 *   appDir: '/path/to/packages/applications/my-app',
 * });
 * ```
 */
export function generateDockerFiles(options: GenerateDockerOptions): void {
  const outputDir = options.outputDir ?? join(options.appDir, 'docker');

  // Create output directory if it doesn't exist
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Generate and write files
  const dockerfile = generateDockerfile(options);
  writeFileSync(join(outputDir, 'Dockerfile'), dockerfile);

  const nginxConf = generateNginxConf(options);
  writeFileSync(join(outputDir, 'nginx.conf'), nginxConf);

  const entrypoint = generateEntrypoint(options);
  writeFileSync(join(outputDir, 'entrypoint.sh'), entrypoint);

  console.log(`Generated Docker files in ${outputDir}`);
}
