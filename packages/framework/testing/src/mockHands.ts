/**
 * @fileoverview Mock hand data for testing gesture detection and hand tracking.
 */

/**
 * 2D point for landmarks.
 */
interface Point2D {
  x: number;
  y: number;
}

/**
 * 3D point for landmarks.
 */
interface Point3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Mock tracked hand structure.
 */
export interface MockTrackedHand {
  landmarks: Point3D[];
  handedness: 'Left' | 'Right';
  score: number;
}

/**
 * Create mock 2D hand landmarks (21 points).
 *
 * By default creates a hand at the center of the frame (0.5, 0.5).
 *
 * @param options - Options to customize the mock landmarks
 *
 * @example
 * ```typescript
 * // Default centered hand
 * const landmarks = createMockLandmarks();
 *
 * // Hand in raised position (top of frame)
 * const raisedHand = createMockLandmarks({ y: 0.2 });
 *
 * // Hand with pinched fingers
 * const pinching = createMockLandmarks({ pinching: true });
 * ```
 */
export function createMockLandmarks(
  options: {
    /** X position (0-1, default: 0.5) */
    x?: number;
    /** Y position (0-1, default: 0.5) */
    y?: number;
    /** Whether to position fingers for pinching gesture */
    pinching?: boolean;
    /** Whether to position hand as raised (low Y value) */
    raised?: boolean;
  } = {}
): Point2D[] {
  const baseX = options.x ?? 0.5;
  const baseY = options.raised ? 0.3 : (options.y ?? 0.5);

  // Create basic hand structure
  const landmarks: Point2D[] = [];

  // Wrist (0)
  landmarks.push({ x: baseX, y: baseY });

  // Thumb (1-4)
  const thumbSpread = options.pinching ? 0.02 : 0.08;
  landmarks.push({ x: baseX - 0.06, y: baseY - 0.02 }); // CMC
  landmarks.push({ x: baseX - 0.08, y: baseY - 0.06 }); // MCP
  landmarks.push({ x: baseX - 0.06, y: baseY - 0.1 }); // IP
  landmarks.push({ x: baseX - thumbSpread, y: baseY - 0.14 }); // TIP

  // Index (5-8)
  const indexX = options.pinching ? baseX - 0.02 : baseX - 0.04;
  landmarks.push({ x: baseX - 0.04, y: baseY - 0.04 }); // MCP
  landmarks.push({ x: baseX - 0.04, y: baseY - 0.1 }); // PIP
  landmarks.push({ x: indexX, y: baseY - 0.14 }); // DIP
  landmarks.push({ x: indexX, y: baseY - 0.16 }); // TIP (close to thumb if pinching)

  // Middle (9-12)
  landmarks.push({ x: baseX, y: baseY - 0.04 }); // MCP
  landmarks.push({ x: baseX, y: baseY - 0.1 }); // PIP
  landmarks.push({ x: baseX, y: baseY - 0.15 }); // DIP
  landmarks.push({ x: baseX, y: baseY - 0.18 }); // TIP

  // Ring (13-16)
  landmarks.push({ x: baseX + 0.04, y: baseY - 0.04 }); // MCP
  landmarks.push({ x: baseX + 0.04, y: baseY - 0.09 }); // PIP
  landmarks.push({ x: baseX + 0.04, y: baseY - 0.13 }); // DIP
  landmarks.push({ x: baseX + 0.04, y: baseY - 0.16 }); // TIP

  // Pinky (17-20)
  landmarks.push({ x: baseX + 0.06, y: baseY - 0.02 }); // MCP
  landmarks.push({ x: baseX + 0.07, y: baseY - 0.07 }); // PIP
  landmarks.push({ x: baseX + 0.07, y: baseY - 0.1 }); // DIP
  landmarks.push({ x: baseX + 0.07, y: baseY - 0.13 }); // TIP

  return landmarks;
}

/**
 * Create mock 3D hand landmarks (21 points).
 *
 * Same as createMockLandmarks but with z coordinates.
 */
export function createMockLandmarks3D(
  options: { x?: number; y?: number; z?: number; pinching?: boolean; raised?: boolean } = {}
): Point3D[] {
  const landmarks2D = createMockLandmarks(options);
  const baseZ = options.z ?? 0;

  return landmarks2D.map((lm) => ({
    ...lm,
    z: baseZ,
  }));
}

/**
 * Create a mock TrackedHand object for testing.
 *
 * @example
 * ```typescript
 * const rightHand = createMockTrackedHand({ handedness: 'Right' });
 * const leftPinching = createMockTrackedHand({
 *   handedness: 'Left',
 *   pinching: true,
 * });
 * ```
 */
export function createMockTrackedHand(
  options: {
    x?: number;
    y?: number;
    z?: number;
    pinching?: boolean;
    raised?: boolean;
    handedness?: 'Left' | 'Right';
    score?: number;
  } = {}
): MockTrackedHand {
  return {
    landmarks: createMockLandmarks3D(options),
    handedness: options.handedness ?? 'Right',
    score: options.score ?? 0.95,
  };
}
