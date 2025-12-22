/**
 * @fileoverview MediaPipe hand tracking initialization and management.
 */

import { Camera } from '@mediapipe/camera_utils';
import { Hands } from '@mediapipe/hands';
import { MEDIAPIPE } from '../constants.js';
import type { HandLandmarks } from '../types.js';

/**
 * Callback for when hand landmarks are detected.
 */
export type HandLandmarksCallback = (landmarks: HandLandmarks | null) => void;

/**
 * Manages MediaPipe hand tracking.
 */
export class HandTracker {
  private hands: Hands | null = null;
  private camera: Camera | null = null;
  private readonly video: HTMLVideoElement;
  private callback: HandLandmarksCallback | null = null;
  private isRunning = false;

  constructor(videoElement: HTMLVideoElement) {
    this.video = videoElement;
  }

  /**
   * Initialize hand tracking.
   * @param onLandmarks - Callback for landmark updates
   */
  async initialize(onLandmarks: HandLandmarksCallback): Promise<void> {
    this.callback = onLandmarks;

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
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        if (landmarks) {
          this.callback?.(landmarks);
        } else {
          this.callback?.(null);
        }
      } else {
        this.callback?.(null);
      }
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
