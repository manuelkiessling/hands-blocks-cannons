/**
 * @fileoverview Collision detection and resolution for blocks and projectiles.
 * Provides pure functions for collision checks without maintaining state.
 */

import {
  BLOCK_HALF_SIZE,
  type Block,
  type BlockId,
  CANNON_INDESTRUCTIBLE,
  PROJECTILE_SIZE,
  type Position,
  type RoomBounds,
  clampToRoom,
} from './types.js';

/**
 * Check if two blocks are colliding using AABB (Axis-Aligned Bounding Box) overlap.
 * @param posA - Position of first block
 * @param posB - Position of second block
 * @param blockSize - Full size of a block (default: BLOCK_HALF_SIZE * 2)
 * @returns True if the blocks are overlapping
 */
export function blocksCollide(
  posA: Position,
  posB: Position,
  blockSize: number = BLOCK_HALF_SIZE * 2
): boolean {
  return (
    Math.abs(posA.x - posB.x) < blockSize &&
    Math.abs(posA.y - posB.y) < blockSize &&
    Math.abs(posA.z - posB.z) < blockSize
  );
}

/**
 * Check if a projectile collides with a block using sphere-vs-AABB collision.
 * @param projectilePos - Center position of the projectile
 * @param blockPos - Center position of the block
 * @param projectileRadius - Radius of the projectile (default: PROJECTILE_SIZE)
 * @param blockHalfSize - Half size of the block (default: BLOCK_HALF_SIZE)
 * @returns True if there is a collision
 */
export function projectileHitsBlock(
  projectilePos: Position,
  blockPos: Position,
  projectileRadius: number = PROJECTILE_SIZE,
  blockHalfSize: number = BLOCK_HALF_SIZE
): boolean {
  // Find the closest point on the block to the projectile center
  const closestX = Math.max(
    blockPos.x - blockHalfSize,
    Math.min(projectilePos.x, blockPos.x + blockHalfSize)
  );
  const closestY = Math.max(
    blockPos.y - blockHalfSize,
    Math.min(projectilePos.y, blockPos.y + blockHalfSize)
  );
  const closestZ = Math.max(
    blockPos.z - blockHalfSize,
    Math.min(projectilePos.z, blockPos.z + blockHalfSize)
  );

  // Calculate squared distance from projectile center to closest point
  const dx = projectilePos.x - closestX;
  const dy = projectilePos.y - closestY;
  const dz = projectilePos.z - closestZ;
  const distanceSquared = dx * dx + dy * dy + dz * dz;

  // Collision if distance is less than projectile radius
  return distanceSquared < projectileRadius * projectileRadius;
}

/**
 * Calculate the push vector needed to separate two colliding blocks.
 * Pushes along the axis with the smallest overlap (most efficient separation).
 * @param movedPos - Position of the block that initiated the collision
 * @param otherPos - Position of the block being pushed
 * @returns The delta to add to otherPos to separate the blocks
 */
export function calculatePushVector(movedPos: Position, otherPos: Position): Position {
  const dx = otherPos.x - movedPos.x;
  const dy = otherPos.y - movedPos.y;
  const dz = otherPos.z - movedPos.z;

  // Determine which axis has the smallest overlap
  const overlapX = BLOCK_HALF_SIZE * 2 - Math.abs(dx);
  const overlapY = BLOCK_HALF_SIZE * 2 - Math.abs(dy);
  const overlapZ = BLOCK_HALF_SIZE * 2 - Math.abs(dz);

  // Push along the axis with smallest overlap
  if (overlapX <= overlapY && overlapX <= overlapZ) {
    return { x: dx >= 0 ? overlapX : -overlapX, y: 0, z: 0 };
  } else if (overlapY <= overlapX && overlapY <= overlapZ) {
    return { x: 0, y: dy >= 0 ? overlapY : -overlapY, z: 0 };
  } else {
    return { x: 0, y: 0, z: dz >= 0 ? overlapZ : -overlapZ };
  }
}

/**
 * Resolve collisions by pushing blocks apart.
 * The moved block stays in place, other blocks get pushed.
 * Modifies the blocks map in place.
 *
 * @param blocks - Map of all blocks (will be mutated)
 * @param movedBlockId - ID of the block that initiated the movement
 * @param movedPos - New position of the moved block
 * @param room - Room bounds for clamping
 * @param maxDepth - Maximum recursion depth to prevent infinite loops
 */
export function resolveBlockCollisions(
  blocks: Map<BlockId, Block>,
  movedBlockId: BlockId,
  movedPos: Position,
  room: RoomBounds,
  maxDepth = 10
): void {
  resolveBlockCollisionsRecursive(blocks, movedBlockId, movedPos, room, 0, maxDepth);
}

function resolveBlockCollisionsRecursive(
  blocks: Map<BlockId, Block>,
  movedBlockId: BlockId,
  movedPos: Position,
  room: RoomBounds,
  depth: number,
  maxDepth: number
): void {
  // Prevent infinite recursion
  if (depth > maxDepth) return;

  const movedBlock = blocks.get(movedBlockId);
  if (!movedBlock) return;

  for (const [otherId, otherBlock] of blocks) {
    // Skip self
    if (otherId === movedBlockId) continue;

    // Check collision
    if (!blocksCollide(movedPos, otherBlock.position)) continue;

    // Calculate push direction and apply
    const pushVector = calculatePushVector(movedPos, otherBlock.position);
    const pushedPos = clampToRoom(
      {
        x: otherBlock.position.x + pushVector.x,
        y: otherBlock.position.y + pushVector.y,
        z: otherBlock.position.z + pushVector.z,
      },
      room
    );

    // Update the pushed block
    const pushedBlock: Block = {
      ...otherBlock,
      position: pushedPos,
    };
    blocks.set(otherId, pushedBlock);

    // Recursively resolve any new collisions caused by the push
    resolveBlockCollisionsRecursive(blocks, otherId, pushedPos, room, depth + 1, maxDepth);
  }
}

/**
 * Find the first block hit by a projectile.
 * @param projectilePos - Current position of the projectile
 * @param projectileOwnerId - ID of the player who owns the projectile
 * @param blocks - Map of all blocks to check
 * @param excludeBlockIds - Set of block IDs to skip (e.g., already destroyed)
 * @returns The hit block or null if no collision
 */
export function findProjectileBlockCollision(
  projectilePos: Position,
  projectileOwnerId: string,
  blocks: ReadonlyMap<BlockId, Block>,
  excludeBlockIds: Set<BlockId> = new Set()
): Block | null {
  for (const [blockId, block] of blocks) {
    // Skip blocks owned by the projectile owner (can't hit your own blocks)
    if (block.ownerId === projectileOwnerId) continue;
    // Skip excluded blocks
    if (excludeBlockIds.has(blockId)) continue;
    // Skip cannons if they are indestructible
    if (CANNON_INDESTRUCTIBLE && block.blockType === 'cannon') continue;

    if (projectileHitsBlock(projectilePos, block.position)) {
      return block;
    }
  }
  return null;
}
