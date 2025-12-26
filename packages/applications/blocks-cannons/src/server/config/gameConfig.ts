/**
 * @fileoverview Game configuration loading from YAML.
 * Validates and caches configuration for the blocks-cannons game.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

// Schema for game configuration
const GameConfigSchema = z.object({
  room: z.object({
    minX: z.number(),
    maxX: z.number(),
    minY: z.number(),
    maxY: z.number(),
    minZ: z.number(),
    maxZ: z.number(),
  }),
  blocks: z.object({
    perPlayer: z.number().int().positive(),
    halfSize: z.number().positive(),
    collision: z.boolean(),
  }),
  cannon: z.object({
    autoFireInterval: z.number().int().min(0),
    cooldown: z.number().int().positive(),
    indestructible: z.boolean(),
  }),
  projectile: z.object({
    speed: z.number().positive(),
    size: z.number().positive(),
  }),
  camera: z.object({
    distance: z.number().positive(),
  }),
  wallGrid: z.object({
    enabled: z.boolean(),
    highlightDuration: z.number().int().positive(),
    highlightIntensity: z.number().min(0).max(1),
  }),
  tickRate: z.number().int().positive(),
  inactivity: z.object({
    timeoutMs: z.number().int().positive(),
    checkIntervalMs: z.number().int().positive(),
  }),
});

export type GameConfigYaml = z.infer<typeof GameConfigSchema>;

let cachedConfig: GameConfigYaml | null = null;

/**
 * Load and validate game configuration from YAML file.
 * Caches the result for subsequent calls.
 *
 * Config file is loaded from:
 * - CONFIG_PATH environment variable if set
 * - Otherwise from ./config/game.yaml relative to cwd (project root)
 */
export function loadGameConfig(): GameConfigYaml {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Use CONFIG_PATH env var or default to config/game.yaml relative to cwd
  // biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket notation for index signatures
  const configPath = process.env['CONFIG_PATH'] ?? join(process.cwd(), 'config/game.yaml');

  try {
    const fileContents = readFileSync(configPath, 'utf8');
    const rawConfig = parseYaml(fileContents) as unknown;
    const validatedConfig = GameConfigSchema.parse(rawConfig);
    cachedConfig = validatedConfig;
    return validatedConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Invalid game configuration:', error.issues);
      throw new Error(`Invalid game configuration: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Clear the cached config (useful for testing or hot-reloading)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}
