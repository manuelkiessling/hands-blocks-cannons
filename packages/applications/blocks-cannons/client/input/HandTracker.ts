/**
 * @fileoverview MediaPipe hand tracking initialization and management.
 */

import { Camera } from '@mediapipe/camera_utils';
import { Hands } from '@mediapipe/hands';
import { MEDIAPIPE } from '../constants.js';
import type { Handedness, MultiHandResult, TrackedHand } from '../types.js';

/**
 * Callback for when hands are detected.
 * Receives array of tracked hands (empty array if no hands detected).
 */
export type MultiHandCallback = (hands: MultiHandResult) => void;

/**
 * Manages MediaPipe hand tracking with support for multiple hands.
 */
export class HandTracker {
  private hands: Hands | null = null;
  private camera: Camera | null = null;
  private readonly video: HTMLVideoElement;
  private callback: MultiHandCallback | null = null;
  private isRunning = false;

  constructor(videoElement: HTMLVideoElement) {
    this.video = videoElement;
  }

  /**
   * Initialize hand tracking.
   * @param onHands - Callback for hand updates (receives array of tracked hands)
   */
  async initialize(onHands: MultiHandCallback): Promise<void> {
    this.callback = onHands;

    // Get camera stream
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: MEDIAPIPE.VIDEO_WIDTH,
        height: MEDIAPIPE.VIDEO_HEIGHT,
        facingMode: 'user',
      },
    });
    this.video.srcObject = stream;
    await this.video.play();

    // Initialize hands with local assets
    this.hands = new Hands({
      locateFile: (file: string) => `${MEDIAPIPE.HANDS_PATH}${file}`,
    });

    this.hands.setOptions({
      maxNumHands: MEDIAPIPE.MAX_HANDS,
      modelComplexity: MEDIAPIPE.MODEL_COMPLEXITY,
      minDetectionConfidence: MEDIAPIPE.MIN_DETECTION_CONFIDENCE,
      minTrackingConfidence: MEDIAPIPE.MIN_TRACKING_CONFIDENCE,
    });

    this.hands.onResults((results) => {
      const trackedHands: TrackedHand[] = [];

      if (results.multiHandLandmarks && results.multiHandedness) {
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
          const landmarks = results.multiHandLandmarks[i];
          const handedness = results.multiHandedness[i];

          if (landmarks && handedness) {
            trackedHands.push({
              landmarks,
              handedness: handedness.label as Handedness,
              score: handedness.score ?? 1,
            });
          }
        }
      }

      this.callback?.(trackedHands);
    });

    // Initialize camera
    this.camera = new Camera(this.video, {
      onFrame: async () => {
        if (this.hands && this.isRunning) {
          await this.hands.send({ image: this.video });
        }
      },
      width: MEDIAPIPE.VIDEO_WIDTH,
      height: MEDIAPIPE.VIDEO_HEIGHT,
    });
  }

  /**
   * Start tracking.
   */
  start(): void {
    if (this.camera && !this.isRunning) {
      this.isRunning = true;
      this.camera.start();
    }
  }

  /**
   * Stop tracking.
   */
  stop(): void {
    this.isRunning = false;
  }

  /**
   * Check if tracking is running.
   */
  get running(): boolean {
    return this.isRunning;
  }
}
