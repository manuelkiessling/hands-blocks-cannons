/**
 * @fileoverview Bot decision-making logic.
 */

import type { Block } from '@block-game/shared';

/**
 * Configuration for bot behavior.
 */
export interface BehaviorConfig {
  /** Time between starting new actions (ms) */
  actionInterval: number;
  /** Chance to fire cannon each action cycle (0-1) */
  fireChance: number;
  /** Minimum time between cannon fires (ms) */
  fireCooldown: number;
}

/**
 * Pick a random block from the player's blocks.
 * @param blocks - Map of the player's blocks
 * @returns A random block or null if no blocks available
 */
export function pickRandomBlock(blocks: Map<string, Block>): Block | null {
  const blockArray = Array.from(blocks.values());
  if (blockArray.length === 0) return null;

  const randomIndex = Math.floor(Math.random() * blockArray.length);
  return blockArray[randomIndex] ?? null;
}

/**
 * Decide whether the bot should fire the cannon this action cycle.
 * @param fireChance - Probability of firing (0-1)
 * @param lastFireTime - Timestamp of last fire
 * @param fireCooldown - Minimum time between fires (ms)
 * @param hasCanon - Whether the bot has a cannon
 * @param now - Current timestamp
 */
export function shouldFireCannon(
  fireChance: number,
  lastFireTime: number,
  fireCooldown: number,
  hasCannon: boolean,
  now: number = Date.now()
): boolean {
  if (!hasCannon) return false;
  if (now - lastFireTime < fireCooldown) return false;
  return Math.random() < fireChance;
}

/**
 * Decide on the next bot action.
 */
export type BotAction =
  | { type: 'fire_cannon' }
  | { type: 'move_block'; block: Block }
  | { type: 'idle' };

/**
 * Decide what the bot should do next.
 * @param blocks - Map of the bot's blocks
 * @param cannonId - ID of the bot's cannon (if any)
 * @param behaviorConfig - Bot behavior configuration
 * @param lastFireTime - Timestamp of last cannon fire
 */
export function decideNextAction(
  blocks: Map<string, Block>,
  cannonId: string | null,
  behaviorConfig: BehaviorConfig,
  lastFireTime: number
): BotAction {
  // Check if should fire cannon
  if (
    shouldFireCannon(
      behaviorConfig.fireChance,
      lastFireTime,
      behaviorConfig.fireCooldown,
      cannonId !== null
    )
  ) {
    return { type: 'fire_cannon' };
  }

  // Try to move a block
  const block = pickRandomBlock(blocks);
  if (block) {
    return { type: 'move_block', block };
  }

  return { type: 'idle' };
}
