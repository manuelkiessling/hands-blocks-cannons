/**
 * @fileoverview Movement interpolation logic for the bot.
 */

import type { Position } from '@block-game/shared';

/**
 * Configuration for bot movement.
 */
export interface MovementConfig {
  /** Position update frequency while dragging (ms) */
  moveSpeed: number;
  /** How long to drag before releasing (ms) */
  moveDuration: number;
  /** Max distance to move from current position */
  moveRange: number;
}

/**
 * Active movement state.
 */
export interface MovementState {
  startPos: Position;
  targetPos: Position;
  startTime: number;
  duration: number;
}

/**
 * Generate a random target position within range of the current position.
 * @param currentPos - Current position
 * @param range - Maximum distance to move
 * @param roomBounds - Optional room bounds for clamping
 */
export function generateRandomTarget(
  currentPos: Position,
  range: number,
  roomBounds?: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  }
): Position {
  const blockHalfSize = 0.5;

  let targetX = currentPos.x + (Math.random() - 0.5) * 2 * range;
  let targetY = currentPos.y + (Math.random() - 0.5) * 2 * range;
  const targetZ = currentPos.z; // Keep Z the same

  // Clamp to room bounds if available
  if (roomBounds) {
    targetX = Math.max(
      roomBounds.minX + blockHalfSize,
      Math.min(roomBounds.maxX - blockHalfSize, targetX)
    );
    targetY = Math.max(
      roomBounds.minY + blockHalfSize,
      Math.min(roomBounds.maxY - blockHalfSize, targetY)
    );
  }

  return { x: targetX, y: targetY, z: targetZ };
}

/**
 * Calculate eased position along movement path.
 * Uses ease-in-out interpolation.
 *
 * @param state - Current movement state
 * @param now - Current timestamp
 * @returns Current interpolated position and progress (0-1)
 */
export function calculateMovementPosition(
  state: MovementState,
  now: number = Date.now()
): { position: Position; progress: number } {
  const elapsed = now - state.startTime;
  const progress = Math.min(1, elapsed / state.duration);

  // Ease-in-out interpolation
  const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

  const position: Position = {
    x: state.startPos.x + (state.targetPos.x - state.startPos.x) * eased,
    y: state.startPos.y + (state.targetPos.y - state.startPos.y) * eased,
    z: state.startPos.z, // Keep Z constant
  };

  return { position, progress };
}

/**
 * Create a new movement state.
 */
export function createMovementState(
  startPos: Position,
  targetPos: Position,
  duration: number,
  now: number = Date.now()
): MovementState {
  return {
    startPos,
    targetPos,
    startTime: now,
    duration,
  };
}
