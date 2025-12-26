/**
 * @fileoverview Server-side exports for blocks-cannons.
 */

export type { GameConfigYaml } from './config/gameConfig.js';
export { clearConfigCache, loadGameConfig } from './config/gameConfig.js';
export * from './game/index.js';
