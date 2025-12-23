import { beforeEach, describe, expect, it } from 'vitest';
import { GestureDetector } from '../src/input/GestureDetector.js';
import type { RoomBounds } from '../src/types.js';

// Test room bounds matching typical game configuration
const TEST_ROOM: RoomBounds = {
  minX: -7,
  maxX: 7,
  minY: -5,
  maxY: 5,
  minZ: -8,
  maxZ: 32,
};

/**
 * Create hand landmarks at a specific normalized position.
 * All landmarks are placed at the same position for simplicity.
 */
function createLandmarksAt(x: number, y: number) {
  return Array(21)
    .fill(null)
    .map(() => ({ x, y, z: 0 }));
}

describe('GestureDetector', () => {
  let detector: GestureDetector;

  beforeEach(() => {
    detector = new GestureDetector();
    detector.configure(TEST_ROOM, 1);
  });

  describe('Coordinate Mapping', () => {
    describe('landmarksTo3D (visualization - unclamped)', () => {
      it('should map center of camera to center of room', () => {
        const landmarks = createLandmarksAt(0.5, 0.5);
        const positions = detector.landmarksTo3D(landmarks);

        // Center should map to (0, 0) in room coordinates
        expect(positions[0]?.x).toBeCloseTo(0, 1);
        expect(positions[0]?.y).toBeCloseTo(0, 1);
      });

      it('should allow positions outside room bounds when hand is at camera edge', () => {
        // Hand at camera edge (x=0, within margin area)
        const landmarks = createLandmarksAt(0, 0.5);
        const positions = detector.landmarksTo3D(landmarks);

        // Should extend beyond maxX (for player 1, x is mirrored)
        // x=0 maps to normX = (0 - 0.05) / 0.9 ≈ -0.055, then mirrored to ~1.055
        // which maps to x > maxX
        expect(positions[0]?.x).toBeGreaterThan(TEST_ROOM.maxX);
      });

      it('should allow positions outside room bounds on all edges', () => {
        // Test all four edges
        const edgeCases = [
          { input: { x: 0, y: 0.5 }, expectXGreater: true, expectYInRange: true },
          { input: { x: 1, y: 0.5 }, expectXLess: true, expectYInRange: true },
          { input: { x: 0.5, y: 0 }, expectXInRange: true, expectYGreater: true },
          { input: { x: 0.5, y: 1 }, expectXInRange: true, expectYLess: true },
        ];

        for (const {
          input,
          expectXGreater,
          expectXLess,
          expectYGreater,
          expectYLess,
        } of edgeCases) {
          const landmarks = createLandmarksAt(input.x, input.y);
          const positions = detector.landmarksTo3D(landmarks);
          const pos = positions[0];

          if (expectXGreater) {
            expect(pos?.x).toBeGreaterThan(TEST_ROOM.maxX);
          }
          if (expectXLess) {
            expect(pos?.x).toBeLessThan(TEST_ROOM.minX);
          }
          if (expectYGreater) {
            expect(pos?.y).toBeGreaterThan(TEST_ROOM.maxY);
          }
          if (expectYLess) {
            expect(pos?.y).toBeLessThan(TEST_ROOM.minY);
          }
        }
      });

      it('should map positions linearly across the camera frame', () => {
        // Quarter positions should map to quarter room positions (roughly)
        const quarterLandmarks = createLandmarksAt(0.25, 0.25);
        const quarterPositions = detector.landmarksTo3D(quarterLandmarks);

        const threequarterLandmarks = createLandmarksAt(0.75, 0.75);
        const threequarterPositions = detector.landmarksTo3D(threequarterLandmarks);

        // Verify linear relationship (positions should be symmetric around center)
        const threeQuarterX = threequarterPositions[0]?.x ?? 0;
        const threeQuarterY = threequarterPositions[0]?.y ?? 0;
        expect(quarterPositions[0]?.x).toBeCloseTo(-threeQuarterX, 0);
        expect(quarterPositions[0]?.y).toBeCloseTo(-threeQuarterY, 0);
      });
    });

    describe('getPinchPoint (interaction - clamped)', () => {
      it('should clamp pinch point to room bounds when hand is at camera edge', () => {
        // Create landmarks with thumb and index at camera edge
        const landmarks = createLandmarksAt(0.5, 0.5);
        // Set thumb (4) and index (8) at far left
        landmarks[4] = { x: 0, y: 0.5, z: 0 };
        landmarks[8] = { x: 0, y: 0.5, z: 0 };

        const pinchPoint = detector.getPinchPoint(landmarks);

        // Pinch point should be clamped to room maxX (for player 1)
        expect(pinchPoint?.x).toBeLessThanOrEqual(TEST_ROOM.maxX);
        expect(pinchPoint?.x).toBeGreaterThanOrEqual(TEST_ROOM.minX);
      });

      it('should clamp pinch point on all edges', () => {
        const edgeCases = [
          { x: 0, y: 0.5 }, // Left edge
          { x: 1, y: 0.5 }, // Right edge
          { x: 0.5, y: 0 }, // Top edge
          { x: 0.5, y: 1 }, // Bottom edge
          { x: 0, y: 0 }, // Top-left corner
          { x: 1, y: 1 }, // Bottom-right corner
        ];

        for (const { x, y } of edgeCases) {
          const landmarks = createLandmarksAt(0.5, 0.5);
          landmarks[4] = { x, y, z: 0 };
          landmarks[8] = { x, y, z: 0 };

          const pinchPoint = detector.getPinchPoint(landmarks);

          expect(pinchPoint?.x).toBeLessThanOrEqual(TEST_ROOM.maxX);
          expect(pinchPoint?.x).toBeGreaterThanOrEqual(TEST_ROOM.minX);
          expect(pinchPoint?.y).toBeLessThanOrEqual(TEST_ROOM.maxY);
          expect(pinchPoint?.y).toBeGreaterThanOrEqual(TEST_ROOM.minY);
        }
      });

      it('should return same position as visualization when within bounds', () => {
        // When hand is well within camera frame, both should give same result
        const landmarks = createLandmarksAt(0.5, 0.5);
        landmarks[4] = { x: 0.5, y: 0.5, z: 0 };
        landmarks[8] = { x: 0.5, y: 0.5, z: 0 };

        const visualPositions = detector.landmarksTo3D(landmarks);
        const pinchPoint = detector.getPinchPoint(landmarks);

        // Visualization position at thumb index should match pinch point
        // (when within bounds, clamped and unclamped are the same)
        expect(pinchPoint?.x).toBeCloseTo(visualPositions[4]?.x ?? 0, 1);
        expect(pinchPoint?.y).toBeCloseTo(visualPositions[4]?.y ?? 0, 1);
      });
    });
  });

  describe('Player Orientation', () => {
    it('should mirror X axis for player 1', () => {
      detector.configure(TEST_ROOM, 1);

      // Hand at left side of camera
      const landmarks = createLandmarksAt(0.2, 0.5);
      const positions = detector.landmarksTo3D(landmarks);

      // For player 1, left on camera = right in world (positive X)
      expect(positions[0]?.x).toBeGreaterThan(0);
    });

    it('should NOT mirror X axis for player 2', () => {
      detector.configure(TEST_ROOM, 2);

      // Hand at left side of camera
      const landmarks = createLandmarksAt(0.2, 0.5);
      const positions = detector.landmarksTo3D(landmarks);

      // For player 2, left on camera = left in world (negative X)
      expect(positions[0]?.x).toBeLessThan(0);
    });

    it('should place hand at correct Z for player 1 (maxZ side)', () => {
      detector.configure(TEST_ROOM, 1);

      const landmarks = createLandmarksAt(0.5, 0.5);
      const positions = detector.landmarksTo3D(landmarks);

      // Player 1 is at maxZ side
      expect(positions[0]?.z).toBeCloseTo(TEST_ROOM.maxZ - 0.5, 1);
    });

    it('should place hand at correct Z for player 2 (minZ side)', () => {
      detector.configure(TEST_ROOM, 2);

      const landmarks = createLandmarksAt(0.5, 0.5);
      const positions = detector.landmarksTo3D(landmarks);

      // Player 2 is at minZ side
      expect(positions[0]?.z).toBeCloseTo(TEST_ROOM.minZ + 0.5, 1);
    });
  });

  describe('isPinching', () => {
    it('should detect pinch when thumb and index are close', () => {
      const landmarks = createLandmarksAt(0.5, 0.5);
      // Place thumb and index very close together
      landmarks[4] = { x: 0.5, y: 0.5, z: 0 };
      landmarks[8] = { x: 0.505, y: 0.505, z: 0 };

      expect(detector.isPinching(landmarks)).toBe(true);
    });

    it('should NOT detect pinch when thumb and index are far apart', () => {
      const landmarks = createLandmarksAt(0.5, 0.5);
      // Place thumb and index far apart
      landmarks[4] = { x: 0.3, y: 0.3, z: 0 };
      landmarks[8] = { x: 0.7, y: 0.7, z: 0 };

      expect(detector.isPinching(landmarks)).toBe(false);
    });
  });

  describe('Unconfigured State', () => {
    it('should return zero vector when not configured', () => {
      const unconfigured = new GestureDetector();
      const landmarks = createLandmarksAt(0.5, 0.5);

      const positions = unconfigured.landmarksTo3D(landmarks);
      expect(positions[0]?.x).toBe(0);
      expect(positions[0]?.y).toBe(0);
      expect(positions[0]?.z).toBe(0);
    });
  });
});
