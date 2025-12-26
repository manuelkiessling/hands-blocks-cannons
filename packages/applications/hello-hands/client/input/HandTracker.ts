/**
 * @fileoverview Hand tracking for Hello Hands.
 *
 * Re-exports the framework HandTracker with single-hand default.
 * Uses framework gesture utilities for pinch and raised-hand detection.
 */

// Re-export framework HandTracker and utilities
// Re-export rendering utilities for camera preview
export {
  drawCameraPreview,
  drawHandSkeleton2D,
  drawPinchIndicator,
  extractLandmarks2D,
  HAND_CONNECTIONS,
  type HandState,
  HandTracker,
  isHandRaised,
  isPinching,
  LANDMARKS,
  type Point2D,
  type TrackedHand,
} from '@gesture-app/framework-input';
