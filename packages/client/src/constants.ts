/**
 * @fileoverview Client-specific constants for rendering and interaction.
 */

// Re-export shared constants
export {
  BLOCK_COLORS,
  BLOCK_FLOAT_AMPLITUDE,
  BLOCK_REACH_DISTANCE,
  CAMERA_MARGIN,
  CANNON_COLOR,
  EXPLOSION_DURATION_MS,
  EXPLOSION_PARTICLE_COUNT,
  HAND_COLORS,
  HIGHLIGHT_COLORS,
  PINCH_THRESHOLD,
  POSITION_SEND_THROTTLE_MS,
  PROJECTILE_COLOR,
} from '@block-game/shared';

// ============ Camera Constants ============

export const CAMERA = {
  /** Field of view in degrees */
  FOV: 60,
  /** Near clipping plane */
  NEAR: 0.1,
  /** Far clipping plane */
  FAR: 500,
  /** Initial camera height above floor */
  HEIGHT: 3,
} as const;

// ============ Scene Colors ============

export const SCENE_COLORS = {
  /** Background color (deep space black with blue tint) */
  BACKGROUND: 0x050510,
  /** Ambient light color */
  AMBIENT: 0x334455,
  /** Main directional light color */
  MAIN_LIGHT: 0xffffff,
  /** Rim light color (blue) */
  RIM_LIGHT: 0x4488ff,
  /** Room wireframe color (cyan/teal) */
  ROOM_WIREFRAME: 0x00ffcc,
  /** Floor grid main lines */
  GRID_MAIN: 0x00aa88,
  /** Floor grid secondary lines */
  GRID_SECONDARY: 0x003344,
} as const;

// ============ Light Intensities ============

export const LIGHT_INTENSITY = {
  AMBIENT: 0.4,
  AMBIENT_SECONDARY: 0.6,
  MAIN: 0.8,
  RIM: 0.3,
} as const;

// ============ Animation Constants ============

export const ANIMATION = {
  /** Lerp factor for grabbed block following hand */
  GRAB_LERP: 0.25,
} as const;

// ============ Grab Interaction Constants ============

/**
 * Grace period before releasing a grabbed block (ms).
 * Prevents accidental drops from momentary tracking lapses.
 */
export const GRAB_RELEASE_GRACE_MS = 150;

// ============ Starfield Constants ============

export const STARFIELD = {
  /** Number of stars to render */
  COUNT: 5000,
  /** Radius of star sphere */
  RADIUS: 250,
  /** Number of nebula clouds */
  NEBULA_COUNT: 8,
  /** Slow rotation speed for subtle movement */
  ROTATION_SPEED: 0.0002,
} as const;

// ============ Room Visual Constants ============

export const ROOM_VISUAL = {
  /** Corner marker size */
  CORNER_SIZE: 0.6,
  /** Corner marker opacity */
  CORNER_OPACITY: 0.9,
  /** Edge pulse speed (radians per second) */
  PULSE_SPEED: 1.5,
  /** Edge pulse range (opacity variation) */
  PULSE_RANGE: 0.15,
  /** Energy field panel opacity */
  FIELD_OPACITY: 0.03,
} as const;

// ============ Visual Effect Constants ============

export const EFFECTS = {
  /** Wall hit highlight color */
  WALL_HIT_COLOR: 0xff4400,
  /** Wall hit grid outline color */
  WALL_GRID_COLOR: 0xffaa00,
} as const;

// ============ Projectile Colors ============

/**
 * Player-relative projectile colors for visual distinction.
 */
export const PROJECTILE_COLORS = {
  /** Yellow - own projectiles */
  OWN: 0xffff00,
  /** Danger red - opponent projectiles */
  OPPONENT: 0xff4444,
} as const;

// ============ Cannon Visual Constants ============

/**
 * Cannon appearance settings.
 */
export const CANNON_VISUAL = {
  /** Emissive intensity for cannon barrel */
  EMISSIVE_INTENSITY: 0.5,
  /** Muzzle ring glow intensity */
  MUZZLE_GLOW: 0.8,
  /** Pulse animation speed (radians per second) */
  PULSE_SPEED: 3,
  /** Pulse intensity range (min-max emissive variation) */
  PULSE_RANGE: 0.2,
} as const;

// ============ Laser Beam Constants ============

/**
 * Cannon laser/aiming beam indicator styling.
 */
export const LASER_BEAM = {
  /** Yellow - own cannon beam */
  COLOR_OWN: 0xffff00,
  /** Red - opponent cannon beam */
  COLOR_OPPONENT: 0xff4444,
  /** Laser beam base opacity */
  OPACITY: 0.6,
  /** Line width (note: may not work on all platforms) */
  LINE_WIDTH: 2,
  /** Crosshair size at beam endpoint */
  CROSSHAIR_SIZE: 0.5,
  /** Crosshair inner ring size */
  CROSSHAIR_INNER_SIZE: 0.15,
} as const;

// ============ MediaPipe Configuration ============

export const MEDIAPIPE = {
  /** Local path to MediaPipe hands assets (copied by vite-plugin-static-copy) */
  HANDS_PATH: './mediapipe/hands/',
  /** Maximum number of hands to track */
  MAX_HANDS: 2,
  /** Model complexity (0-2) */
  MODEL_COMPLEXITY: 1,
  /** Minimum detection confidence */
  MIN_DETECTION_CONFIDENCE: 0.7,
  /** Minimum tracking confidence */
  MIN_TRACKING_CONFIDENCE: 0.5,
  /** Video dimensions */
  VIDEO_WIDTH: 640,
  VIDEO_HEIGHT: 480,
} as const;

// ============ Hand Landmark Indices ============

export const HAND_LANDMARKS = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_TIP: 8,
  /** Total number of landmarks */
  COUNT: 21,
} as const;

// ============ Hand Visualization Constants ============

export const HAND_VISUAL = {
  /** Opacity for finger tubes (0-1) */
  FINGER_OPACITY: 0.3,
  /** Opacity for fingertips (0-1) */
  TIP_OPACITY: 0.35,
  /** Smoothing factor for hand movement (0-1). Lower = smoother, higher = more responsive */
  SMOOTHING_FACTOR: 0.3,
} as const;
