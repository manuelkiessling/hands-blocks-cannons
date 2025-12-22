/**
 * @fileoverview Shared constants used by client, server, and bot.
 * These are compile-time constants that don't depend on runtime configuration.
 */

// ============ Block Colors ============

/**
 * Available colors for regular blocks (hex values).
 */
export const BLOCK_COLORS = [
  0x4a9eff, // Blue
  0xa855f7, // Purple
  0xec4899, // Pink
  0x22c55e, // Green
  0xf59e0b, // Orange
] as const;

/**
 * Color for cannon blocks (bright red-pink).
 */
export const CANNON_COLOR = 0xff3366;

/**
 * Color for projectiles (bright yellow).
 */
export const PROJECTILE_COLOR = 0xffff00;

// ============ Visual Constants ============

/**
 * Hand state colors for boundary feedback.
 */
export const HAND_COLORS = {
  NORMAL: 0x66aaff,
  WARNING: 0xffaa00,
  OUTSIDE: 0xff4444,
} as const;

/**
 * Highlight colors for block interactions.
 */
export const HIGHLIGHT_COLORS = {
  REACHABLE: 0x00ff88,
  GRABBED: 0xffaa00,
  OPPONENT_GRAB: 0xff6666,
} as const;

// ============ Gesture Thresholds ============

/**
 * Camera boundary margin (0-1 normalized space).
 */
export const CAMERA_MARGIN = 0.05;

/**
 * Distance threshold for pinch detection (normalized).
 */
export const PINCH_THRESHOLD = 0.07;

/**
 * Edge threshold for boundary warning (normalized).
 */
export const EDGE_THRESHOLD = 0.03;

/**
 * Distance threshold for block reachability.
 */
export const BLOCK_REACH_DISTANCE = 3;

// ============ Network Constants ============

/**
 * Minimum interval between position updates (ms).
 */
export const POSITION_SEND_THROTTLE_MS = 50;

// ============ Animation Constants ============

/**
 * Block floating animation amplitude.
 */
export const BLOCK_FLOAT_AMPLITUDE = 0.15;

/**
 * Explosion effect duration (ms).
 */
export const EXPLOSION_DURATION_MS = 1000;

/**
 * Number of particles in explosion effect.
 */
export const EXPLOSION_PARTICLE_COUNT = 20;
