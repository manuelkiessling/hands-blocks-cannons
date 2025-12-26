/**
 * @fileoverview Cannon firing mechanics and cooldown management.
 * Provides pure functions for cannon operations.
 */

import {
  type Block,
  type BlockId,
  CANNON_COOLDOWN_MS,
  type Player,
  type PlayerId,
  type PlayerNumber,
  PROJECTILE_COLOR,
  PROJECTILE_SPEED,
  type Projectile,
} from './types.js';

/** Offset from cannon center where projectiles spawn */
const PROJECTILE_SPAWN_OFFSET = 0.8;

/**
 * Result of attempting to fire a cannon.
 */
export interface CannonFireResult {
  /** The spawned projectile, or null if firing failed */
  projectile: Projectile | null;
  /** Updated cooldowns map */
  cooldowns: Map<BlockId, number>;
  /** Next projectile ID to use */
  nextProjectileId: number;
}

/**
 * Check if a cannon is ready to fire (not on cooldown).
 * @param cannonId - ID of the cannon block
 * @param cooldowns - Map of cannon ID to ready-at timestamp
 * @param now - Current timestamp (default: Date.now())
 * @returns True if the cannon can fire
 */
export function isCannonReady(
  cannonId: BlockId,
  cooldowns: ReadonlyMap<BlockId, number>,
  now: number = Date.now()
): boolean {
  const readyAt = cooldowns.get(cannonId);
  if (readyAt === undefined) return true;
  return now >= readyAt;
}

/**
 * Get the fire direction for a player.
 * Player 1 fires towards negative Z, Player 2 fires towards positive Z.
 * @param playerNumber - The player's number (1 or 2)
 * @returns 1 for positive Z, -1 for negative Z
 */
export function getFireDirection(playerNumber: PlayerNumber): number {
  return playerNumber === 1 ? -1 : 1;
}

/**
 * Create a projectile fired from a cannon.
 * @param cannon - The cannon block firing
 * @param playerNumber - The owning player's number
 * @param projectileId - ID for the new projectile
 * @returns The created projectile
 */
export function createProjectile(
  cannon: Block,
  playerNumber: PlayerNumber,
  projectileId: string
): Projectile {
  const fireDirection = getFireDirection(playerNumber);

  return {
    id: projectileId,
    position: {
      x: cannon.position.x,
      y: cannon.position.y,
      z: cannon.position.z + fireDirection * PROJECTILE_SPAWN_OFFSET,
    },
    velocity: {
      x: 0,
      y: 0,
      z: fireDirection * PROJECTILE_SPEED,
    },
    ownerId: cannon.ownerId,
    color: PROJECTILE_COLOR,
  };
}

/**
 * Set cooldown for a cannon.
 * @param cannonId - ID of the cannon
 * @param cooldowns - Current cooldowns map
 * @param now - Current timestamp (default: Date.now())
 * @returns New cooldowns map with the cannon on cooldown
 */
export function setCannonCooldown(
  cannonId: BlockId,
  cooldowns: ReadonlyMap<BlockId, number>,
  now: number = Date.now()
): Map<BlockId, number> {
  const newCooldowns = new Map(cooldowns);
  newCooldowns.set(cannonId, now + CANNON_COOLDOWN_MS);
  return newCooldowns;
}

/**
 * Attempt to fire a cannon as a player.
 * Validates ownership, block type, and cooldown.
 *
 * @param playerId - ID of the player firing
 * @param cannonId - ID of the cannon to fire
 * @param players - Map of players
 * @param blocks - Map of blocks
 * @param cooldowns - Map of cannon cooldowns
 * @param nextProjectileId - Next projectile ID to use
 * @returns Fire result with projectile (or null) and updated state
 */
export function fireCannon(
  playerId: PlayerId,
  cannonId: BlockId,
  players: ReadonlyMap<PlayerId, Player>,
  blocks: ReadonlyMap<BlockId, Block>,
  cooldowns: ReadonlyMap<BlockId, number>,
  nextProjectileId: number
): CannonFireResult {
  const player = players.get(playerId);
  const cannon = blocks.get(cannonId);

  // Validate player and cannon exist
  if (!player || !cannon) {
    return {
      projectile: null,
      cooldowns: new Map(cooldowns),
      nextProjectileId,
    };
  }

  // Must own the cannon
  if (cannon.ownerId !== playerId) {
    return {
      projectile: null,
      cooldowns: new Map(cooldowns),
      nextProjectileId,
    };
  }

  // Must be a cannon block
  if (cannon.blockType !== 'cannon') {
    return {
      projectile: null,
      cooldowns: new Map(cooldowns),
      nextProjectileId,
    };
  }

  // Check cooldown
  if (!isCannonReady(cannonId, cooldowns)) {
    return {
      projectile: null,
      cooldowns: new Map(cooldowns),
      nextProjectileId,
    };
  }

  // Fire the cannon
  const projectileId = `projectile-${nextProjectileId}`;
  const projectile = createProjectile(cannon, player.number, projectileId);
  const newCooldowns = setCannonCooldown(cannonId, cooldowns);

  return {
    projectile,
    cooldowns: newCooldowns,
    nextProjectileId: nextProjectileId + 1,
  };
}

/**
 * Attempt to auto-fire a cannon (server-initiated).
 * Uses the cannon owner's player number for direction.
 * Does not validate ownership since it's server-controlled.
 *
 * @param cannonId - ID of the cannon to fire
 * @param blocks - Map of blocks
 * @param players - Map of players (to get owner's player number)
 * @param cooldowns - Map of cannon cooldowns
 * @param nextProjectileId - Next projectile ID to use
 * @returns Fire result with projectile (or null) and updated state
 */
export function fireCannonAuto(
  cannonId: BlockId,
  blocks: ReadonlyMap<BlockId, Block>,
  players: ReadonlyMap<PlayerId, Player>,
  cooldowns: ReadonlyMap<BlockId, number>,
  nextProjectileId: number
): CannonFireResult {
  const cannon = blocks.get(cannonId);

  // Validate cannon exists and is correct type
  if (!cannon || cannon.blockType !== 'cannon') {
    return {
      projectile: null,
      cooldowns: new Map(cooldowns),
      nextProjectileId,
    };
  }

  // Check cooldown
  if (!isCannonReady(cannonId, cooldowns)) {
    return {
      projectile: null,
      cooldowns: new Map(cooldowns),
      nextProjectileId,
    };
  }

  // Get owner's player number for fire direction
  const owner = players.get(cannon.ownerId);
  if (!owner) {
    return {
      projectile: null,
      cooldowns: new Map(cooldowns),
      nextProjectileId,
    };
  }

  // Fire the cannon
  const projectileId = `projectile-${nextProjectileId}`;
  const projectile = createProjectile(cannon, owner.number, projectileId);
  const newCooldowns = setCannonCooldown(cannonId, cooldowns);

  return {
    projectile,
    cooldowns: newCooldowns,
    nextProjectileId: nextProjectileId + 1,
  };
}
