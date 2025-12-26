/**
 * @fileoverview Bot AI decision-making logic.
 * Pure functions for testability - all state is passed in, no side effects.
 */

import type { Block, Position, Projectile, RoomBounds } from '../../shared/types.js';

// ============ Types ============

/**
 * Represents a detected threat to one of the bot's blocks.
 */
export interface Threat {
  /** The projectile that poses the threat */
  projectile: Projectile;
  /** The block that is threatened */
  threatenedBlock: Block;
  /** Estimated time until impact in seconds */
  timeToImpact: number;
  /** Predicted impact position */
  impactPosition: Position;
}

/**
 * AI configuration derived from difficulty level.
 */
export interface AIConfig {
  /** Difficulty level 0-1 (0 = easy, 1 = impossible) */
  difficulty: number;
}

/**
 * Derived AI parameters based on difficulty.
 */
export interface AIDerivedParams {
  /** Reaction time in milliseconds (how long before AI responds to threats) */
  reactionTimeMs: number;
  /** Aim accuracy 0-1 (affects aim offset) */
  aimAccuracy: number;
  /** How far ahead to predict projectile paths (in seconds) */
  predictionTime: number;
  /** Probability of actually dodging when threatened (0-1) */
  dodgeProbability: number;
}

/**
 * Complete bot game state for AI decision-making.
 */
export interface BotGameState {
  myBlocks: ReadonlyMap<string, Block>;
  myCannonId: string | null;
  opponentBlocks: ReadonlyMap<string, Block>;
  opponentCannonId: string | null;
  projectiles: ReadonlyMap<string, Projectile>;
  room: RoomBounds;
  playerNumber: 1 | 2;
}

/**
 * Possible AI actions.
 */
export type AIAction =
  | { type: 'evade'; blockId: string; targetPosition: Position }
  | { type: 'fire_cannon' }
  | { type: 'idle' };

// ============ Constants ============

/** Block half-size for collision detection (should match game config) */
const BLOCK_HALF_SIZE = 0.5;

/** Projectile radius for collision detection (should match game config) */
const PROJECTILE_RADIUS = 0.3;

/** Combined collision threshold (block half-size + projectile radius) */
const COLLISION_THRESHOLD = BLOCK_HALF_SIZE + PROJECTILE_RADIUS;

// ============ Difficulty Scaling ============

/**
 * Derive AI parameters from difficulty level.
 * @param config - AI configuration with difficulty level
 * @returns Derived parameters scaled by difficulty
 */
export function deriveAIParams(config: AIConfig): AIDerivedParams {
  const { difficulty } = config;

  // Clamp difficulty to valid range
  const d = Math.max(0, Math.min(1, difficulty));

  // Linear interpolation helper
  const lerp = (min: number, max: number) => min + (max - min) * d;

  return {
    // Reaction time: 2000ms at difficulty 0, 100ms at difficulty 1
    reactionTimeMs: lerp(2000, 100),
    // Aim accuracy: 30% at difficulty 0, 95% at difficulty 1
    aimAccuracy: lerp(0.3, 0.95),
    // Prediction time: 0.5s at difficulty 0, 2s at difficulty 1
    predictionTime: lerp(0.5, 2.0),
    // Dodge probability: 30% at difficulty 0, 95% at difficulty 1
    dodgeProbability: lerp(0.3, 0.95),
  };
}

// ============ Threat Detection ============

/**
 * Predict where a projectile will be after a given time.
 * @param projectile - The projectile to predict
 * @param deltaTime - Time in seconds to predict ahead
 * @returns Predicted position
 */
export function predictProjectilePosition(projectile: Projectile, deltaTime: number): Position {
  return {
    x: projectile.position.x + projectile.velocity.x * deltaTime,
    y: projectile.position.y + projectile.velocity.y * deltaTime,
    z: projectile.position.z + projectile.velocity.z * deltaTime,
  };
}

/**
 * Check if a projectile will collide with a block within the prediction window.
 * Uses simple ray-box intersection approximation.
 *
 * @param projectile - The projectile to check
 * @param block - The block to check collision against
 * @param maxTime - Maximum time to check ahead (seconds)
 * @returns Time to impact in seconds, or null if no collision predicted
 */
export function predictCollision(
  projectile: Projectile,
  block: Block,
  maxTime: number
): number | null {
  // Only check projectiles moving towards the block's Z position
  const dz = block.position.z - projectile.position.z;

  // If projectile is moving away or parallel, no collision
  if (projectile.velocity.z === 0) return null;
  if ((dz > 0 && projectile.velocity.z < 0) || (dz < 0 && projectile.velocity.z > 0)) {
    return null;
  }

  // Time to reach the block's Z plane
  const timeToZ = dz / projectile.velocity.z;

  // Check if within prediction window
  if (timeToZ < 0 || timeToZ > maxTime) return null;

  // Predict projectile position at impact time
  const impactPos = predictProjectilePosition(projectile, timeToZ);

  // Check if within block's X/Y bounds (with collision threshold)
  const dx = Math.abs(impactPos.x - block.position.x);
  const dy = Math.abs(impactPos.y - block.position.y);

  if (dx <= COLLISION_THRESHOLD && dy <= COLLISION_THRESHOLD) {
    return timeToZ;
  }

  return null;
}

/**
 * Detect all threats to the bot's blocks from active projectiles.
 * Only detects threats to regular blocks (cannons are indestructible).
 *
 * @param ownBlocks - Map of the bot's blocks
 * @param projectiles - Map of all active projectiles
 * @param playerId - The bot's player ID (to filter out own projectiles)
 * @param predictionTime - How far ahead to predict (seconds)
 * @returns Array of threats sorted by urgency (soonest first)
 */
export function detectThreats(
  ownBlocks: ReadonlyMap<string, Block>,
  projectiles: ReadonlyMap<string, Projectile>,
  playerId: string,
  predictionTime: number
): Threat[] {
  const threats: Threat[] = [];

  for (const projectile of projectiles.values()) {
    // Skip own projectiles (they can't hurt us)
    if (projectile.ownerId === playerId) continue;

    for (const block of ownBlocks.values()) {
      // Skip cannons - they are indestructible and don't need protection
      if (block.blockType === 'cannon') continue;

      const timeToImpact = predictCollision(projectile, block, predictionTime);

      if (timeToImpact !== null) {
        const impactPosition = predictProjectilePosition(projectile, timeToImpact);
        threats.push({
          projectile,
          threatenedBlock: block,
          timeToImpact,
          impactPosition,
        });
      }
    }
  }

  // Sort by urgency (soonest threats first)
  threats.sort((a, b) => a.timeToImpact - b.timeToImpact);

  return threats;
}

/**
 * Check if a specific block is under threat.
 * @param blockId - ID of the block to check
 * @param threats - Array of detected threats
 * @returns The most urgent threat to this block, or null
 */
export function getBlockThreat(blockId: string, threats: Threat[]): Threat | null {
  return threats.find((t) => t.threatenedBlock.id === blockId) ?? null;
}

// ============ Evasion Planning ============

/**
 * Calculate the perpendicular escape direction from a projectile path.
 * @param projectile - The incoming projectile
 * @returns Normalized perpendicular vector in XY plane
 */
export function getEscapeDirection(projectile: Projectile): { x: number; y: number } {
  // The projectile moves primarily in Z, so escape perpendicular to its XY velocity
  // If no XY velocity, use a default escape direction
  const vx = projectile.velocity.x;
  const vy = projectile.velocity.y;

  // If projectile has significant XY velocity, perpendicular is (-vy, vx)
  const xyMagnitude = Math.sqrt(vx * vx + vy * vy);

  if (xyMagnitude > 0.01) {
    // Normalize perpendicular vector
    return {
      x: -vy / xyMagnitude,
      y: vx / xyMagnitude,
    };
  }

  // Default: escape in X direction if no significant XY velocity
  return { x: 1, y: 0 };
}

/**
 * Clamp a position to stay within room bounds (accounting for block size).
 * @param pos - Position to clamp
 * @param room - Room bounds
 * @returns Clamped position
 */
export function clampToRoom(pos: Position, room: RoomBounds): Position {
  return {
    x: Math.max(room.minX + BLOCK_HALF_SIZE, Math.min(room.maxX - BLOCK_HALF_SIZE, pos.x)),
    y: Math.max(room.minY + BLOCK_HALF_SIZE, Math.min(room.maxY - BLOCK_HALF_SIZE, pos.y)),
    z: pos.z, // Keep Z constant (blocks stay on their plane)
  };
}

/**
 * Check if a position is safe from a threat.
 * @param position - Position to check
 * @param threat - The threat to check against
 * @returns true if the position is safe
 */
export function isPositionSafe(position: Position, threat: Threat): boolean {
  const impactPos = threat.impactPosition;
  const dx = Math.abs(position.x - impactPos.x);
  const dy = Math.abs(position.y - impactPos.y);

  // Safe if outside collision threshold
  return dx > COLLISION_THRESHOLD || dy > COLLISION_THRESHOLD;
}

/**
 * Plan an evasion maneuver for a threatened block.
 * Calculates a safe position perpendicular to the projectile's path.
 *
 * @param block - The block that needs to evade
 * @param threat - The threat to evade
 * @param room - Room bounds for clamping
 * @param escapeDistance - How far to move (default: 2 units)
 * @returns Target position to move to, or null if no safe escape exists
 */
export function planEvasion(
  block: Block,
  threat: Threat,
  room: RoomBounds,
  escapeDistance: number = 2.0
): Position | null {
  const escapeDir = getEscapeDirection(threat.projectile);

  // Try escaping in the primary direction first
  const primaryTarget: Position = {
    x: block.position.x + escapeDir.x * escapeDistance,
    y: block.position.y + escapeDir.y * escapeDistance,
    z: block.position.z,
  };

  const clampedPrimary = clampToRoom(primaryTarget, room);

  // Check if primary escape is safe
  if (isPositionSafe(clampedPrimary, threat)) {
    return clampedPrimary;
  }

  // Try the opposite direction
  const oppositeTarget: Position = {
    x: block.position.x - escapeDir.x * escapeDistance,
    y: block.position.y - escapeDir.y * escapeDistance,
    z: block.position.z,
  };

  const clampedOpposite = clampToRoom(oppositeTarget, room);

  if (isPositionSafe(clampedOpposite, threat)) {
    return clampedOpposite;
  }

  // Try cardinal directions as fallback
  const cardinalOffsets = [
    { x: escapeDistance, y: 0 },
    { x: -escapeDistance, y: 0 },
    { x: 0, y: escapeDistance },
    { x: 0, y: -escapeDistance },
  ];

  for (const offset of cardinalOffsets) {
    const target: Position = {
      x: block.position.x + offset.x,
      y: block.position.y + offset.y,
      z: block.position.z,
    };

    const clamped = clampToRoom(target, room);

    if (isPositionSafe(clamped, threat)) {
      return clamped;
    }
  }

  // No safe escape found
  return null;
}

// ============ Target Selection ============

/**
 * Calculate the distance between two positions in the XY plane.
 * @param a - First position
 * @param b - Second position
 * @returns Distance in XY plane
 */
export function distanceXY(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Information about a potential target.
 */
export interface TargetInfo {
  block: Block;
  /** Priority score (higher = better target) */
  priority: number;
  /** Distance from our cannon in XY plane */
  distance: number;
}

/**
 * Select the best target from opponent's blocks.
 * Only targets regular blocks (cannons are indestructible).
 * Prioritizes nearest blocks (easier to hit).
 *
 * @param opponentBlocks - Map of opponent's blocks
 * @param _opponentCannonId - ID of opponent's cannon (unused, cannons are indestructible)
 * @param ownCannon - Our cannon block (for distance calculation)
 * @returns Best target block, or null if no valid targets
 */
export function selectTarget(
  opponentBlocks: ReadonlyMap<string, Block>,
  _opponentCannonId: string | null,
  ownCannon: Block | null
): TargetInfo | null {
  if (opponentBlocks.size === 0) return null;

  const targets: TargetInfo[] = [];

  for (const block of opponentBlocks.values()) {
    // Skip cannons - they are indestructible
    if (block.blockType === 'cannon') {
      continue;
    }

    const distance = ownCannon ? distanceXY(ownCannon.position, block.position) : 0;

    // Priority is inversely related to distance (closer = higher priority)
    const priority = 100 - distance;

    targets.push({ block, priority, distance });
  }

  // No valid targets (only cannons remain)
  if (targets.length === 0) return null;

  // Sort by priority (highest first = closest)
  targets.sort((a, b) => b.priority - a.priority);

  return targets[0] ?? null;
}

/**
 * Calculate aim offset based on accuracy.
 * Lower accuracy = more random offset from target.
 *
 * @param accuracy - Aim accuracy (0-1)
 * @param maxOffset - Maximum offset distance at 0 accuracy
 * @returns Random offset to apply to aim
 */
export function calculateAimOffset(
  accuracy: number,
  maxOffset: number = 3.0
): { x: number; y: number } {
  // At accuracy 1, offset is 0
  // At accuracy 0, offset can be up to maxOffset in any direction
  const offsetMagnitude = maxOffset * (1 - accuracy);

  // Random direction
  const angle = Math.random() * 2 * Math.PI;

  return {
    x: Math.cos(angle) * offsetMagnitude * Math.random(),
    y: Math.sin(angle) * offsetMagnitude * Math.random(),
  };
}

/**
 * Calculate the ideal position to move our cannon to hit a target.
 * Since projectiles travel in Z direction, we need to align X position.
 *
 * @param target - Target block to aim at
 * @param ownCannon - Our cannon block
 * @param aimAccuracy - Aim accuracy (0-1) for offset calculation
 * @param room - Room bounds for clamping
 * @returns Target position for our cannon, or null if already aligned
 */
export function calculateAimPosition(
  target: Block,
  ownCannon: Block,
  aimAccuracy: number,
  room: RoomBounds
): Position | null {
  // Calculate aim offset based on accuracy
  const offset = calculateAimOffset(aimAccuracy);

  // Target X position with offset
  const targetX = target.position.x + offset.x;
  const targetY = target.position.y + offset.y;

  // Check if we need to move significantly
  const dx = Math.abs(targetX - ownCannon.position.x);
  const dy = Math.abs(targetY - ownCannon.position.y);

  // If already close enough (within collision threshold), no need to move
  if (dx < COLLISION_THRESHOLD && dy < COLLISION_THRESHOLD) {
    return null;
  }

  // Calculate new cannon position (keep Z constant)
  const newPosition: Position = {
    x: targetX,
    y: targetY,
    z: ownCannon.position.z,
  };

  return clampToRoom(newPosition, room);
}

// ============ Decision Engine ============

/**
 * Result of AI decision-making.
 */
export interface AIDecision {
  action: AIAction;
  /** Reason for the decision (for debugging/logging) */
  reason: string;
}

/**
 * Random number generator interface for testability.
 */
export interface RandomGenerator {
  /** Returns a random number between 0 and 1 */
  random(): number;
}

/** Default random generator using Math.random */
const defaultRandom: RandomGenerator = {
  random: () => Math.random(),
};

/**
 * Main AI decision function.
 * Integrates threat detection, evasion, and target selection with difficulty scaling.
 *
 * Priority order:
 * 1. Evade immediate threats (if dodge roll succeeds)
 * 2. Fire cannon at targets
 * 3. Idle
 *
 * @param state - Current bot game state
 * @param params - AI parameters (derived from difficulty)
 * @param playerId - Bot's player ID
 * @param rng - Random number generator (for testability)
 * @returns AI decision with action and reason
 */
export function decideAction(
  state: BotGameState,
  params: AIDerivedParams,
  playerId: string,
  rng: RandomGenerator = defaultRandom
): AIDecision {
  const { myBlocks, myCannonId, opponentBlocks, opponentCannonId, projectiles, room } = state;

  // Step 1: Detect threats
  const threats = detectThreats(myBlocks, projectiles, playerId, params.predictionTime);

  // Step 2: Handle most urgent threat (if any)
  if (threats.length > 0) {
    const urgentThreat = threats[0];

    // Roll for dodge (based on difficulty)
    if (urgentThreat && rng.random() < params.dodgeProbability) {
      const evasionTarget = planEvasion(urgentThreat.threatenedBlock, urgentThreat, room);

      if (evasionTarget) {
        return {
          action: {
            type: 'evade',
            blockId: urgentThreat.threatenedBlock.id,
            targetPosition: evasionTarget,
          },
          reason: `Evading projectile threatening block ${urgentThreat.threatenedBlock.id}`,
        };
      }
    }
  }

  // Step 3: Consider firing cannon
  const ownCannon = myCannonId ? (myBlocks.get(myCannonId) ?? null) : null;

  if (ownCannon && opponentBlocks.size > 0) {
    const target = selectTarget(opponentBlocks, opponentCannonId, ownCannon);

    if (target) {
      // Check if we're aimed well enough to fire
      const aimPos = calculateAimPosition(target.block, ownCannon, params.aimAccuracy, room);

      // If aimPos is null, we're already aligned - fire!
      if (aimPos === null) {
        return {
          action: { type: 'fire_cannon' },
          reason: `Firing at ${target.block.blockType} (aligned)`,
        };
      }

      // Move cannon to aim at target
      return {
        action: {
          type: 'evade', // Reuse evade action for movement
          blockId: ownCannon.id,
          targetPosition: aimPos,
        },
        reason: `Aiming cannon at ${target.block.blockType}`,
      };
    }
  }

  // Step 4: Idle if nothing to do
  return {
    action: { type: 'idle' },
    reason: 'No threats or targets',
  };
}

/**
 * Determine if the bot should take action based on reaction time.
 * @param lastActionTime - Timestamp of last action
 * @param reactionTimeMs - Reaction time in milliseconds
 * @param now - Current timestamp (for testing)
 * @returns true if enough time has passed to act
 */
export function canAct(
  lastActionTime: number,
  reactionTimeMs: number,
  now: number = Date.now()
): boolean {
  return now - lastActionTime >= reactionTimeMs;
}
