/**
 * @fileoverview MediaPipe hand tracking for Hello Hands.
 *
 * Simplified hand tracker that detects hand position and gestures.
 */

import { Camera } from '@mediapipe/camera_utils';
import { Hands } from '@mediapipe/hands';

/** MediaPipe configuration */
const MEDIAPIPE_CONFIG = {
  HANDS_PATH: './mediapipe/hands/',
  MAX_HANDS: 1, // Only track one hand for simplicity
  MODEL_COMPLEXITY: 1,
  MIN_DETECTION_CONFIDENCE: 0.7,
  MIN_TRACKING_CONFIDENCE: 0.5,
  VIDEO_WIDTH: 640,
  VIDEO_HEIGHT: 480,
} as const;

/** Hand landmark indices */
const LANDMARKS = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_TIP: 8,
  MIDDLE_TIP: 12,
} as const;

/** Pinch detection threshold (normalized distance) */
const PINCH_THRESHOLD = 0.08;

/** Raised hand detection threshold (wrist Y position) */
const RAISED_THRESHOLD = 0.4;

/**
 * Simplified hand state for Hello Hands.
 */
export interface HandState {
  /** Normalized position (0-1 range, center of palm) */
  position: { x: number; y: number };
  /** Whether thumb and index are pinched together */
  isPinching: boolean;
  /** Whether hand is raised above threshold */
  isRaised: boolean;
}

/**
 * Callback for hand tracking updates.
 */
export type HandCallback = (hand: HandState | null) => void;

/**
 * Manages MediaPipe hand tracking.
 */
export class HandTracker {
  private hands: Hands | null = null;
  private camera: Camera | null = null;
  private readonly video: HTMLVideoElement;
  private callback: HandCallback | null = null;
  private isRunning = false;

  constructor(videoElement: HTMLVideoElement) {
    this.video = videoElement;
  }

  /**
   * Initialize hand tracking.
   */
  async initialize(onHand: HandCallback): Promise<void> {
    this.callback = onHand;

    // Get camera stream
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: MEDIAPIPE_CONFIG.VIDEO_WIDTH,
        height: MEDIAPIPE_CONFIG.VIDEO_HEIGHT,
        facingMode: 'user',
      },
    });
    this.video.srcObject = stream;
    await this.video.play();

    // Initialize MediaPipe Hands
    this.hands = new Hands({
      locateFile: (file: string) => `${MEDIAPIPE_CONFIG.HANDS_PATH}${file}`,
    });

    this.hands.setOptions({
      maxNumHands: MEDIAPIPE_CONFIG.MAX_HANDS,
      modelComplexity: MEDIAPIPE_CONFIG.MODEL_COMPLEXITY,
      minDetectionConfidence: MEDIAPIPE_CONFIG.MIN_DETECTION_CONFIDENCE,
      minTrackingConfidence: MEDIAPIPE_CONFIG.MIN_TRACKING_CONFIDENCE,
    });

    this.hands.onResults((results) => {
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        if (landmarks) {
          const handState = this.extractHandState(landmarks);
          this.callback?.(handState);
        }
      } else {
        this.callback?.(null);
      }
    });

    // Initialize camera feed
    this.camera = new Camera(this.video, {
      onFrame: async () => {
        if (this.hands && this.isRunning) {
          await this.hands.send({ image: this.video });
        }
      },
      width: MEDIAPIPE_CONFIG.VIDEO_WIDTH,
      height: MEDIAPIPE_CONFIG.VIDEO_HEIGHT,
    });
  }

  /**
   * Extract simplified hand state from landmarks.
   */
  private extractHandState(landmarks: { x: number; y: number; z: number }[]): HandState {
    const wrist = landmarks[LANDMARKS.WRIST];
    const thumbTip = landmarks[LANDMARKS.THUMB_TIP];
    const indexTip = landmarks[LANDMARKS.INDEX_TIP];
    const middleTip = landmarks[LANDMARKS.MIDDLE_TIP];

    // Calculate palm center (average of key points)
    const palmX = (wrist.x + indexTip.x + middleTip.x) / 3;
    const palmY = (wrist.y + indexTip.y + middleTip.y) / 3;

    // Detect pinch (thumb and index finger close together)
    const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
    const isPinching = pinchDist < PINCH_THRESHOLD;

    // Detect raised hand (wrist above threshold)
    const isRaised = wrist.y < RAISED_THRESHOLD;

    return {
      position: { x: palmX, y: palmY },
      isPinching,
      isRaised,
    };
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
