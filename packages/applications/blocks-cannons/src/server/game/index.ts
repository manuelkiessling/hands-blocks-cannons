/**
 * @fileoverview Game logic exports for blocks-cannons server.
 */

export * from './CannonSystem.js';
export * from './CollisionSystem.js';
export { GameState } from './GameState.js';
// Explicitly export to avoid conflict with WallHitInfo from types.js
export {
  checkWallCollision,
  moveProjectile,
  type ProjectileUpdateResult,
  removePlayerProjectiles,
  removeProjectile,
  updateProjectiles,
} from './ProjectileSystem.js';
export * from './types.js';
