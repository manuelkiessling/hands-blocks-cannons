/**
 * @fileoverview Projectile management including creation, movement, and wall collision.
 * Provides pure functions that return new state rather than mutating.
 */

import { findProjectileBlockCollision } from './CollisionSystem.js';
import type {
  Block,
  BlockId,
  DestroyedBlockInfo,
  Position,
  Projectile,
  ProjectileId,
  RoomBounds,
} from './types.js';

/**
 * Result of updating projectiles for one tick.
 */
export interface ProjectileUpdateResult {
  /** Updated projectiles map */
  projectiles: Map<ProjectileId, Projectile>;
  /** Updated blocks map (with destroyed blocks removed) */
  blocks: Map<BlockId, Block>;
  /** IDs of projectiles that were destroyed */
  destroyedProjectileIds: string[];
  /** Information about blocks that were destroyed */
  destroyedBlocks: DestroyedBlockInfo[];
  /** Information about wall hits (for visual effects) */
  wallHits: WallHitInfo[];
}

/**
 * Information about a projectile hitting a wall.
 */
export interface WallHitInfo {
  position: Position;
  wallSide: 'minZ' | 'maxZ';
}

/**
 * Move a projectile by its velocity over the given time delta.
 * @param projectile - The projectile to move
 * @param deltaTime - Time delta in seconds
 * @returns New projectile with updated position
 */
export function moveProjectile(projectile: Projectile, deltaTime: number): Projectile {
  return {
    ...projectile,
    position: {
      x: projectile.position.x + projectile.velocity.x * deltaTime,
      y: projectile.position.y + projectile.velocity.y * deltaTime,
      z: projectile.position.z + projectile.velocity.z * deltaTime,
    },
  };
}

/**
 * Check if a projectile has left the room bounds along the Z axis.
 * @param position - Position to check
 * @param room - Room bounds
 * @returns 'minZ' or 'maxZ' if outside bounds, null if inside
 */
export function checkWallCollision(position: Position, room: RoomBounds): 'minZ' | 'maxZ' | null {
  if (position.z < room.minZ) return 'minZ';
  if (position.z > room.maxZ) return 'maxZ';
  return null;
}

/**
 * Update all projectiles for one tick.
 * Handles movement, wall collisions, and block collisions.
 *
 * @param projectiles - Current projectiles map
 * @param blocks - Current blocks map
 * @param room - Room bounds for wall collision
 * @param deltaTime - Time delta in seconds
 * @returns Update result with new maps and collision info
 */
export function updateProjectiles(
  projectiles: ReadonlyMap<ProjectileId, Projectile>,
  blocks: ReadonlyMap<BlockId, Block>,
  room: RoomBounds,
  deltaTime: number
): ProjectileUpdateResult {
  const destroyedProjectileIds: string[] = [];
  const destroyedBlocks: DestroyedBlockInfo[] = [];
  const wallHits: WallHitInfo[] = [];
  const newProjectiles = new Map<ProjectileId, Projectile>();
  const blocksToRemove = new Set<BlockId>();

  for (const [id, projectile] of projectiles) {
    // Move projectile
    const movedProjectile = moveProjectile(projectile, deltaTime);
    const newPosition = movedProjectile.position;

    // Check wall collision
    const wallSide = checkWallCollision(newPosition, room);
    if (wallSide !== null) {
      destroyedProjectileIds.push(id);
      // Record wall hit position (use last valid position before exit)
      wallHits.push({
        position: {
          x: projectile.position.x,
          y: projectile.position.y,
          z: wallSide === 'minZ' ? room.minZ : room.maxZ,
        },
        wallSide,
      });
      continue;
    }

    // Check for collision with opponent blocks
    const hitBlock = findProjectileBlockCollision(
      newPosition,
      projectile.ownerId,
      blocks,
      blocksToRemove
    );

    if (hitBlock) {
      // Projectile hit an opponent block - destroy both
      destroyedProjectileIds.push(id);
      blocksToRemove.add(hitBlock.id);
      destroyedBlocks.push({
        blockId: hitBlock.id,
        position: hitBlock.position,
        color: hitBlock.color,
      });
      continue;
    }

    // No collision - keep the projectile
    newProjectiles.set(id, movedProjectile);
  }

  // Create new blocks map without destroyed blocks
  const newBlocks = new Map(blocks);
  for (const blockId of blocksToRemove) {
    newBlocks.delete(blockId);
  }

  return {
    projectiles: newProjectiles,
    blocks: newBlocks,
    destroyedProjectileIds,
    destroyedBlocks,
    wallHits,
  };
}

/**
 * Remove a specific projectile from the map.
 * @param projectiles - Current projectiles map
 * @param projectileId - ID of projectile to remove
 * @returns New map without the specified projectile
 */
export function removeProjectile(
  projectiles: ReadonlyMap<ProjectileId, Projectile>,
  projectileId: ProjectileId
): Map<ProjectileId, Projectile> {
  const newProjectiles = new Map(projectiles);
  newProjectiles.delete(projectileId);
  return newProjectiles;
}

/**
 * Remove all projectiles owned by a specific player.
 * @param projectiles - Current projectiles map
 * @param playerId - ID of player whose projectiles to remove
 * @returns New map without the player's projectiles
 */
export function removePlayerProjectiles(
  projectiles: ReadonlyMap<ProjectileId, Projectile>,
  playerId: string
): Map<ProjectileId, Projectile> {
  const newProjectiles = new Map<ProjectileId, Projectile>();
  for (const [id, projectile] of projectiles) {
    if (projectile.ownerId !== playerId) {
      newProjectiles.set(id, projectile);
    }
  }
  return newProjectiles;
}
