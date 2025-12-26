/**
 * @fileoverview 2D Canvas rendering utilities for hand skeleton visualization.
 *
 * Provides functions to draw hand skeletons on 2D canvas, useful for:
 * - Camera preview overlays
 * - Debug visualization
 * - 2D hand-based games
 */

import { HAND_CONNECTIONS, LANDMARKS } from './constants.js';
import type { Point2D } from './types.js';

/**
 * Options for rendering a hand skeleton.
 */
export interface HandSkeletonOptions {
  /** Primary color for bones and joints (CSS color string) */
  readonly color?: string;

  /** Whether to mirror the X coordinates (for webcam view) */
  readonly mirror?: boolean;

  /** Line width for bones */
  readonly boneWidth?: number;

  /** Radius for regular joints */
  readonly jointRadius?: number;

  /** Radius for fingertip joints */
  readonly fingertipRadius?: number;

  /** Whether to show glow effect around fingertips */
  readonly showGlow?: boolean;

  /** Whether to highlight the pinch point when pinching */
  readonly highlightPinch?: boolean;
}

/**
 * Default skeleton rendering options.
 */
export const DEFAULT_SKELETON_OPTIONS: Required<HandSkeletonOptions> = {
  color: '#4ecdc4',
  mirror: false,
  boneWidth: 2,
  jointRadius: 2,
  fingertipRadius: 4,
  showGlow: false,
  highlightPinch: true,
};

/**
 * Fingertip landmark indices for special styling.
 */
const FINGERTIP_INDICES: readonly number[] = [
  LANDMARKS.THUMB_TIP,
  LANDMARKS.INDEX_TIP,
  LANDMARKS.MIDDLE_TIP,
  LANDMARKS.RING_TIP,
  LANDMARKS.PINKY_TIP,
];

/**
 * Check if a landmark index is a fingertip.
 */
function isFingertip(index: number): boolean {
  return FINGERTIP_INDICES.includes(index);
}

/**
 * Draw a hand skeleton on a 2D canvas.
 *
 * @param ctx - Canvas 2D rendering context
 * @param landmarks - Array of 21 hand landmarks (normalized 0-1 coordinates)
 * @param options - Rendering options
 *
 * @example
 * ```typescript
 * drawHandSkeleton2D(ctx, hand.landmarks, {
 *   color: '#ff6b6b',
 *   mirror: true,
 *   showGlow: true,
 * });
 * ```
 */
export function drawHandSkeleton2D(
  ctx: CanvasRenderingContext2D,
  landmarks: readonly Point2D[],
  options: HandSkeletonOptions = {}
): void {
  if (landmarks.length < 21) return;

  const opts = { ...DEFAULT_SKELETON_OPTIONS, ...options };
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // Helper to get X coordinate with optional mirroring
  const getX = (x: number) => (opts.mirror ? 1 - x : x) * w;
  const getY = (y: number) => y * h;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Draw bones (connections between landmarks)
  ctx.strokeStyle = opts.color;
  ctx.lineWidth = opts.boneWidth;

  for (const [a, b] of HAND_CONNECTIONS) {
    const pa = landmarks[a];
    const pb = landmarks[b];
    if (pa && pb) {
      ctx.beginPath();
      ctx.moveTo(getX(pa.x), getY(pa.y));
      ctx.lineTo(getX(pb.x), getY(pb.y));
      ctx.stroke();
    }
  }

  // Draw joints
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    if (!lm) continue;

    const x = getX(lm.x);
    const y = getY(lm.y);
    const isTip = isFingertip(i);
    const radius = isTip ? opts.fingertipRadius : opts.jointRadius;

    // Optional glow for fingertips
    if (isTip && opts.showGlow) {
      ctx.beginPath();
      ctx.arc(x, y, radius + 8, 0, Math.PI * 2);
      ctx.fillStyle = `${opts.color}44`;
      ctx.fill();
    }

    // Draw joint
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = isTip ? '#fff' : opts.color;
    ctx.fill();
  }
}

/**
 * Options for drawing a pinch indicator.
 */
export interface PinchIndicatorOptions {
  /** Whether to mirror the X coordinates */
  readonly mirror?: boolean;

  /** Outer ring radius */
  readonly radius?: number;

  /** Ring color */
  readonly color?: string;

  /** Ring line width */
  readonly lineWidth?: number;

  /** Whether to show inner glow */
  readonly showGlow?: boolean;
}

/**
 * Default pinch indicator options.
 */
export const DEFAULT_PINCH_OPTIONS: Required<PinchIndicatorOptions> = {
  mirror: false,
  radius: 12,
  color: '#ffffff',
  lineWidth: 2,
  showGlow: true,
};

/**
 * Draw a pinch indicator at the midpoint between thumb and index finger.
 *
 * @param ctx - Canvas 2D rendering context
 * @param landmarks - Array of 21 hand landmarks
 * @param options - Rendering options
 *
 * @example
 * ```typescript
 * if (isPinching(landmarks)) {
 *   drawPinchIndicator(ctx, landmarks, { color: '#00ff00' });
 * }
 * ```
 */
export function drawPinchIndicator(
  ctx: CanvasRenderingContext2D,
  landmarks: readonly Point2D[],
  options: PinchIndicatorOptions = {}
): void {
  const thumb = landmarks[LANDMARKS.THUMB_TIP];
  const index = landmarks[LANDMARKS.INDEX_TIP];

  if (!thumb || !index) return;

  const opts = { ...DEFAULT_PINCH_OPTIONS, ...options };
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // Calculate midpoint
  const midX = (thumb.x + index.x) / 2;
  const midY = (thumb.y + index.y) / 2;

  const x = (opts.mirror ? 1 - midX : midX) * w;
  const y = midY * h;

  // Draw glow
  if (opts.showGlow) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, opts.radius * 2);
    gradient.addColorStop(0, `${opts.color}88`);
    gradient.addColorStop(0.5, `${opts.color}44`);
    gradient.addColorStop(1, `${opts.color}00`);

    ctx.beginPath();
    ctx.arc(x, y, opts.radius * 2, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  // Draw ring
  ctx.beginPath();
  ctx.arc(x, y, opts.radius, 0, Math.PI * 2);
  ctx.strokeStyle = opts.color;
  ctx.lineWidth = opts.lineWidth;
  ctx.stroke();
}

/**
 * Options for drawing a full hand with label.
 */
export interface LabeledHandOptions extends HandSkeletonOptions {
  /** Label text to display below the hand */
  readonly label?: string;

  /** Label font (CSS font string) */
  readonly labelFont?: string;

  /** Whether this hand is currently pinching */
  readonly isPinching?: boolean;
}

/**
 * Draw a complete hand visualization with optional label and pinch indicator.
 *
 * This is a convenience function that combines skeleton and pinch drawing.
 *
 * @param ctx - Canvas 2D rendering context
 * @param landmarks - Array of 21 hand landmarks
 * @param options - Rendering options
 *
 * @example
 * ```typescript
 * drawLabeledHand(ctx, hand.landmarks, {
 *   color: '#4ecdc4',
 *   label: 'You',
 *   mirror: true,
 *   isPinching: hand.isPinching,
 * });
 * ```
 */
export function drawLabeledHand(
  ctx: CanvasRenderingContext2D,
  landmarks: readonly Point2D[],
  options: LabeledHandOptions = {}
): void {
  const {
    label,
    labelFont = 'bold 16px "Segoe UI", sans-serif',
    isPinching = false,
    ...skeletonOptions
  } = options;

  // Draw skeleton
  drawHandSkeleton2D(ctx, landmarks, skeletonOptions);

  // Draw pinch indicator if pinching
  if (isPinching) {
    drawPinchIndicator(ctx, landmarks, {
      mirror: skeletonOptions.mirror,
    });
  }

  // Draw label at wrist
  if (label) {
    const wrist = landmarks[LANDMARKS.WRIST];
    if (wrist) {
      const w = ctx.canvas.width;
      const h = ctx.canvas.height;
      const x = (skeletonOptions.mirror ? 1 - wrist.x : wrist.x) * w;
      const y = wrist.y * h + 40;

      ctx.font = labelFont;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 4;
      ctx.fillText(label, x, y);
      ctx.shadowBlur = 0;
    }
  }
}

/**
 * Options for drawing a camera preview with hand overlay.
 */
export interface CameraPreviewOptions extends HandSkeletonOptions {
  /** Whether this hand is currently pinching */
  readonly isPinching?: boolean;
}

/**
 * Draw a camera preview with hand skeleton overlay.
 *
 * Draws the video frame and overlays the hand skeleton on top.
 * Useful for camera preview elements showing hand tracking status.
 *
 * @param ctx - Canvas 2D rendering context
 * @param video - Video element with camera feed
 * @param landmarks - Array of 21 hand landmarks (or null if no hand)
 * @param options - Rendering options
 *
 * @example
 * ```typescript
 * // In render loop:
 * drawCameraPreview(ctx, videoElement, hand?.landmarks ?? null, {
 *   color: hand?.isRaised ? '#4ecdc4' : '#ff6b6b',
 *   isPinching: hand?.isPinching ?? false,
 * });
 * ```
 */
export function drawCameraPreview(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  landmarks: readonly Point2D[] | null,
  options: CameraPreviewOptions = {}
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // Draw video frame
  ctx.drawImage(video, 0, 0, w, h);

  // Draw hand overlay if landmarks available
  if (landmarks && landmarks.length >= 21) {
    drawHandSkeleton2D(ctx, landmarks, options);

    // Draw pinch indicator
    if (options.isPinching) {
      drawPinchIndicator(ctx, landmarks, {
        mirror: options.mirror,
      });
    }
  }
}

/**
 * Draw a simple hand position indicator (circle) when landmarks are not available.
 *
 * Useful for showing opponent's hand position when only coordinates are sent,
 * not full landmark data.
 *
 * @param ctx - Canvas 2D rendering context
 * @param x - X position (normalized 0-1 or pixel)
 * @param y - Y position (normalized 0-1 or pixel)
 * @param options - Rendering options
 *
 * @example
 * ```typescript
 * // For normalized coordinates:
 * drawHandPositionIndicator(ctx, friend.x * canvas.width, friend.y * canvas.height, {
 *   color: '#ff6b6b',
 *   isPinching: friend.isPinching,
 * });
 * ```
 */
export function drawHandPositionIndicator(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  options: {
    readonly color?: string;
    readonly radius?: number;
    readonly isPinching?: boolean;
    readonly label?: string;
    readonly labelFont?: string;
  } = {}
): void {
  const {
    color = '#4ecdc4',
    radius = 30,
    isPinching = false,
    label,
    labelFont = 'bold 16px "Segoe UI", sans-serif',
  } = options;

  const effectiveRadius = isPinching ? radius * 0.7 : radius;

  // Outer glow
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, effectiveRadius + 20);
  gradient.addColorStop(0, `${color}66`);
  gradient.addColorStop(1, `${color}00`);
  ctx.beginPath();
  ctx.arc(x, y, effectiveRadius + 20, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  // Main circle
  ctx.beginPath();
  ctx.arc(x, y, effectiveRadius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Inner highlight
  ctx.beginPath();
  ctx.arc(
    x - effectiveRadius * 0.2,
    y - effectiveRadius * 0.2,
    effectiveRadius * 0.3,
    0,
    Math.PI * 2
  );
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.fill();

  // Pinch ring
  if (isPinching) {
    ctx.beginPath();
    ctx.arc(x, y, effectiveRadius + 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Label
  if (label) {
    ctx.font = labelFont;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y + effectiveRadius + 25);
  }
}
