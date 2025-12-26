/**
 * @fileoverview Framework input utilities for hand tracking and gesture detection.
 *
 * This package provides:
 * - Hand landmark constants and types
 * - Gesture detection utilities (pinch, raised hand)
 * - Unified HandTracker class for MediaPipe integration
 */

// Constants
export {
  DEFAULT_MEDIAPIPE_CONFIG,
  GESTURE_THRESHOLDS,
  HAND_CONNECTIONS,
  LANDMARKS,
} from './constants.js';
// Gesture utilities
export {
  extractLandmarks2D,
  getPalmCenter,
  getPinchPoint,
  isHandRaised,
  isPinching,
} from './gestures.js';
// Hand tracker
export { HandTracker } from './HandTracker.js';
// 2D Rendering utilities
export {
  type CameraPreviewOptions,
  DEFAULT_PINCH_OPTIONS,
  DEFAULT_SKELETON_OPTIONS,
  drawCameraPreview,
  drawHandPositionIndicator,
  drawHandSkeleton2D,
  drawLabeledHand,
  drawPinchIndicator,
  type HandSkeletonOptions,
  type LabeledHandOptions,
  type PinchIndicatorOptions,
} from './rendering.js';
// Types
export type {
  HandCallback,
  Handedness,
  HandLandmarks,
  HandState,
  HandTrackerConfig,
  MultiHandCallback,
  MultiHandResult,
  Point2D,
  Point3D,
  TrackedHand,
} from './types.js';

/**
 * Framework input version.
 */
export const FRAMEWORK_INPUT_VERSION = '1.0.0';
