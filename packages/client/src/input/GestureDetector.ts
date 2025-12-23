/**
 * @fileoverview Gesture detection from hand landmarks.
 */

import * as THREE from 'three';
import { CAMERA_MARGIN, EDGE_THRESHOLD, HAND_LANDMARKS, PINCH_THRESHOLD } from '../constants.js';
import type { HandLandmarks, HandState, RoomBounds } from '../types.js';

/**
 * Detects gestures and converts hand positions to 3D coordinates.
 */
export class GestureDetector {
  private room: RoomBounds | null = null;
  private playerNumber: 1 | 2 | null = null;

  /**
   * Set the room bounds and player number for coordinate mapping.
   */
  configure(room: RoomBounds, playerNumber: 1 | 2): void {
    this.room = room;
    this.playerNumber = playerNumber;
  }

  /**
   * Check if the hand is in a pinch gesture.
   * @param landmarks - Hand landmarks from MediaPipe
   * @returns True if pinching (thumb and index finger close together)
   */
  isPinching(landmarks: HandLandmarks): boolean {
    const thumb = landmarks[HAND_LANDMARKS.THUMB_TIP];
    const index = landmarks[HAND_LANDMARKS.INDEX_TIP];

    if (!thumb || !index) return false;

    const dist = Math.hypot(thumb.x - index.x, thumb.y - index.y);
    return dist < PINCH_THRESHOLD;
  }

  /**
   * Get the pinch point (midpoint between thumb and index finger) in 3D space.
   */
  getPinchPoint(landmarks: HandLandmarks): THREE.Vector3 | null {
    const thumb = landmarks[HAND_LANDMARKS.THUMB_TIP];
    const index = landmarks[HAND_LANDMARKS.INDEX_TIP];

    if (!thumb || !index) return null;

    return this.landmarkTo3D({
      x: (thumb.x + index.x) / 2,
      y: (thumb.y + index.y) / 2,
      z: 0,
    });
  }

  /**
   * Get the wrist position in 3D space.
   */
  getWristPosition(landmarks: HandLandmarks): THREE.Vector3 | null {
    const wrist = landmarks[HAND_LANDMARKS.WRIST];
    if (!wrist) return null;
    return this.landmarkTo3D(wrist);
  }

  /**
   * Get the hand's state relative to camera bounds.
   */
  getHandState(landmarks: HandLandmarks): HandState {
    const wrist = landmarks[HAND_LANDMARKS.WRIST];
    if (!wrist) return 'normal';

    const nearLeft = wrist.x < CAMERA_MARGIN + EDGE_THRESHOLD;
    const nearRight = wrist.x > 1 - CAMERA_MARGIN - EDGE_THRESHOLD;
    const nearTop = wrist.y < CAMERA_MARGIN + EDGE_THRESHOLD;
    const nearBottom = wrist.y > 1 - CAMERA_MARGIN - EDGE_THRESHOLD;

    const outsideLeft = wrist.x < CAMERA_MARGIN;
    const outsideRight = wrist.x > 1 - CAMERA_MARGIN;
    const outsideTop = wrist.y < CAMERA_MARGIN;
    const outsideBottom = wrist.y > 1 - CAMERA_MARGIN;

    if (outsideLeft || outsideRight || outsideTop || outsideBottom) {
      return 'outside';
    }
    if (nearLeft || nearRight || nearTop || nearBottom) {
      return 'warning';
    }
    return 'normal';
  }

  /**
   * Convert all landmarks to 3D positions for visualization.
   * These positions are NOT clamped to room bounds - the hand can move freely.
   */
  landmarksTo3D(landmarks: HandLandmarks): THREE.Vector3[] {
    return landmarks.map((lm) => this.landmarkTo3DUnclamped(lm));
  }

  /**
   * Convert a single landmark to 3D position, clamped to room bounds.
   * Used for interactions (grab, drag) where game logic requires staying in bounds.
   */
  private landmarkTo3D(lm: { x: number; y: number; z: number }): THREE.Vector3 {
    return this.convertLandmarkTo3D(lm, true);
  }

  /**
   * Convert a single landmark to 3D position without clamping.
   * Used for visualization where the hand should move freely.
   */
  private landmarkTo3DUnclamped(lm: { x: number; y: number; z: number }): THREE.Vector3 {
    return this.convertLandmarkTo3D(lm, false);
  }

  /**
   * Core coordinate conversion from camera space to 3D world space.
   * @param lm - Landmark in camera coordinates (0-1 range)
   * @param clamp - Whether to clamp output to room bounds
   */
  private convertLandmarkTo3D(
    lm: { x: number; y: number; z: number },
    clamp: boolean
  ): THREE.Vector3 {
    if (!this.room || !this.playerNumber) {
      return new THREE.Vector3(0, 0, 0);
    }

    // Normalize to 0-1 range within camera bounds (accounting for margin)
    let normX = (lm.x - CAMERA_MARGIN) / (1 - 2 * CAMERA_MARGIN);
    let normY = (lm.y - CAMERA_MARGIN) / (1 - 2 * CAMERA_MARGIN);

    // Only clamp for interactions, not for visualization
    if (clamp) {
      normX = Math.max(0, Math.min(1, normX));
      normY = Math.max(0, Math.min(1, normY));
    }

    // Map to room X/Y bounds
    // Player 1 (looking from +Z): mirror X so left hand = left on screen
    // Player 2 (looking from -Z): don't mirror X
    const mappedX = this.playerNumber === 1 ? 1 - normX : normX;
    const x = mappedX * (this.room.maxX - this.room.minX) + this.room.minX;
    const y = (1 - normY) * (this.room.maxY - this.room.minY) + this.room.minY;

    // Z position: hand is at the player's side of the room
    const blockHalfSize = 0.5;
    const handZ =
      this.playerNumber === 1 ? this.room.maxZ - blockHalfSize : this.room.minZ + blockHalfSize;

    return new THREE.Vector3(x, y, handZ);
  }
}
