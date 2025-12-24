import type * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GRAB_RELEASE_GRACE_MS } from '../src/constants.js';
import { InteractionManager } from '../src/game/InteractionManager.js';
import type { BlockEntity } from '../src/types.js';

// ============ Mock Types ============

interface MockBlockRenderer {
  findNearestBlock: ReturnType<typeof vi.fn>;
  showReachableHighlight: ReturnType<typeof vi.fn>;
  hideReachableHighlight: ReturnType<typeof vi.fn>;
  showGrabbedHighlightForHand: ReturnType<typeof vi.fn>;
  hideGrabbedHighlightForHand: ReturnType<typeof vi.fn>;
  hideAllGrabbedHighlights: ReturnType<typeof vi.fn>;
}

interface MockGameClient {
  sendBlockGrab: ReturnType<typeof vi.fn>;
  sendBlockMove: ReturnType<typeof vi.fn>;
  sendBlockRelease: ReturnType<typeof vi.fn>;
}

// Default handedness for tests
const DEFAULT_HAND = 'Right' as const;

// ============ Test Utilities ============

/**
 * Create a mock BlockRenderer for testing.
 */
function createMockBlockRenderer(): MockBlockRenderer {
  return {
    findNearestBlock: vi.fn(),
    showReachableHighlight: vi.fn(),
    hideReachableHighlight: vi.fn(),
    showGrabbedHighlightForHand: vi.fn(),
    hideGrabbedHighlightForHand: vi.fn(),
    hideAllGrabbedHighlights: vi.fn(),
  };
}

/**
 * Create a mock GameClient for testing.
 */
function createMockGameClient(): MockGameClient {
  return {
    sendBlockGrab: vi.fn(),
    sendBlockMove: vi.fn(),
    sendBlockRelease: vi.fn(),
  };
}

/**
 * Create a test block entity with minimal required properties.
 */
function createTestBlock(id: string, x = 0, y = 0): BlockEntity {
  return {
    mesh: {
      position: { x, y, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    } as unknown as THREE.Mesh,
    data: {
      id,
      ownerId: 'player-1',
      blockType: 'regular',
      color: 0xff0000,
      position: { x, y, z: 0 },
    },
    baseY: y,
    phase: 0,
    isGrabbed: false,
  };
}

/**
 * Create a test pinch point vector.
 */
function createPinchPoint(x: number, y: number, z = 0): THREE.Vector3 {
  return { x, y, z } as THREE.Vector3;
}

// ============ Tests ============

describe('InteractionManager', () => {
  let mockBlockRenderer: MockBlockRenderer;
  let mockGameClient: MockGameClient;
  let manager: InteractionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    mockBlockRenderer = createMockBlockRenderer();
    mockGameClient = createMockGameClient();
    manager = new InteractionManager(
      mockBlockRenderer as unknown as Parameters<
        (typeof InteractionManager)['prototype']['processInteraction']
      >[0] extends infer T
        ? T
        : never,
      mockGameClient as unknown as Parameters<
        (typeof InteractionManager)['prototype']['processInteraction']
      >[0] extends infer T
        ? T
        : never
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ============ Basic Grab/Release ============

  describe('Basic Grab/Release', () => {
    it('should grab block when pinching near a reachable block', () => {
      const block = createTestBlock('block-1');
      mockBlockRenderer.findNearestBlock.mockReturnValue(block);

      const pinchPoint = createPinchPoint(0, 0);

      // First frame: not pinching - finds reachable block
      manager.processInteraction(DEFAULT_HAND, pinchPoint, false);
      expect(mockBlockRenderer.findNearestBlock).toHaveBeenCalled();

      // Second frame: pinching - grabs the block
      const status = manager.processInteraction(DEFAULT_HAND, pinchPoint, true);

      expect(status).toBe('Grabbing');
      expect(mockGameClient.sendBlockGrab).toHaveBeenCalledWith('block-1');
      expect(manager.getGrabbedBlockId()).toBe('block-1');
    });

    it('should release block when pinch ends (after grace period)', () => {
      const block = createTestBlock('block-1');
      mockBlockRenderer.findNearestBlock.mockReturnValue(block);

      const pinchPoint = createPinchPoint(0, 0);

      // Grab the block
      manager.processInteraction(DEFAULT_HAND, pinchPoint, false);
      manager.processInteraction(DEFAULT_HAND, pinchPoint, true);
      expect(manager.getGrabbedBlockId()).toBe('block-1');

      // Stop pinching - starts grace period
      manager.processInteraction(DEFAULT_HAND, pinchPoint, false);
      expect(manager.getGrabbedBlockId()).toBe('block-1'); // Still grabbed

      // Advance past grace period
      vi.advanceTimersByTime(GRAB_RELEASE_GRACE_MS + 10);

      // Next frame after grace period - should release
      manager.processInteraction(DEFAULT_HAND, pinchPoint, false);

      expect(mockGameClient.sendBlockRelease).toHaveBeenCalledWith('block-1');
      expect(manager.getGrabbedBlockId()).toBeNull();
    });

    it('should not grab when no block in reach', () => {
      mockBlockRenderer.findNearestBlock.mockReturnValue(null);

      const pinchPoint = createPinchPoint(0, 0);
      const status = manager.processInteraction(DEFAULT_HAND, pinchPoint, true);

      expect(status).toBe('Pinching (no block)');
      expect(mockGameClient.sendBlockGrab).not.toHaveBeenCalled();
      expect(manager.getGrabbedBlockId()).toBeNull();
    });

    it('should move grabbed block to follow pinch point', () => {
      const block = createTestBlock('block-1', 0, 0);
      mockBlockRenderer.findNearestBlock.mockReturnValue(block);

      // Grab the block
      manager.processInteraction(DEFAULT_HAND, createPinchPoint(0, 0), false);
      manager.processInteraction(DEFAULT_HAND, createPinchPoint(0, 0), true);

      // Move hand to new position
      const newPinchPoint = createPinchPoint(5, 3);
      manager.processInteraction(DEFAULT_HAND, newPinchPoint, true);

      // Block should be moving towards the new position (lerped)
      expect(block.mesh.position.x).toBeGreaterThan(0);
      expect(block.mesh.position.y).toBeGreaterThan(0);
      expect(mockBlockRenderer.showGrabbedHighlightForHand).toHaveBeenCalled();
    });
  });

  // ============ Grace Period - Core Stickiness ============

  describe('Grace Period - Core Stickiness', () => {
    it('should NOT release block immediately when pinch briefly fails', () => {
      const block = createTestBlock('block-1');
      mockBlockRenderer.findNearestBlock.mockReturnValue(block);

      const pinchPoint = createPinchPoint(0, 0);

      // Grab the block
      manager.processInteraction(DEFAULT_HAND, pinchPoint, false);
      manager.processInteraction(DEFAULT_HAND, pinchPoint, true);
      expect(manager.getGrabbedBlockId()).toBe('block-1');

      // Pinch fails for one frame
      manager.processInteraction(DEFAULT_HAND, pinchPoint, false);

      // Block should still be grabbed
      expect(manager.getGrabbedBlockId()).toBe('block-1');
      expect(mockGameClient.sendBlockRelease).not.toHaveBeenCalled();
    });

    it('should keep block grabbed during entire grace period', () => {
      const block = createTestBlock('block-1');
      mockBlockRenderer.findNearestBlock.mockReturnValue(block);

      const pinchPoint = createPinchPoint(0, 0);

      // Grab the block
      manager.processInteraction(DEFAULT_HAND, pinchPoint, false);
      manager.processInteraction(DEFAULT_HAND, pinchPoint, true);

      // Stop pinching - starts grace period
      manager.processInteraction(DEFAULT_HAND, pinchPoint, false);

      // Advance time but stay within grace period
      vi.advanceTimersByTime(GRAB_RELEASE_GRACE_MS - 10);
      manager.processInteraction(DEFAULT_HAND, pinchPoint, false);

      // Should still be grabbed
      expect(manager.getGrabbedBlockId()).toBe('block-1');
      expect(mockGameClient.sendBlockRelease).not.toHaveBeenCalled();
    });

    it('should release block only after grace period expires', () => {
      const block = createTestBlock('block-1');
      mockBlockRenderer.findNearestBlock.mockReturnValue(block);

      const pinchPoint = createPinchPoint(0, 0);

      // Grab the block
      manager.processInteraction(DEFAULT_HAND, pinchPoint, false);
      manager.processInteraction(DEFAULT_HAND, pinchPoint, true);

      // Stop pinching
      manager.processInteraction(DEFAULT_HAND, pinchPoint, false);

      // Advance past grace period
      vi.advanceTimersByTime(GRAB_RELEASE_GRACE_MS + 10);

      // Should release on next frame
      manager.processInteraction(DEFAULT_HAND, pinchPoint, false);

      expect(manager.getGrabbedBlockId()).toBeNull();
      expect(mockGameClient.sendBlockRelease).toHaveBeenCalledWith('block-1');
    });

    it('should cancel pending release if pinch resumes within grace period', () => {
      const block = createTestBlock('block-1');
      mockBlockRenderer.findNearestBlock.mockReturnValue(block);

      const pinchPoint = createPinchPoint(0, 0);

      // Grab the block
      manager.processInteraction(DEFAULT_HAND, pinchPoint, false);
      manager.processInteraction(DEFAULT_HAND, pinchPoint, true);

      // Stop pinching - starts grace period
      manager.processInteraction(DEFAULT_HAND, pinchPoint, false);

      // Wait a bit but not past grace period
      vi.advanceTimersByTime(GRAB_RELEASE_GRACE_MS / 2);

      // Resume pinching
      manager.processInteraction(DEFAULT_HAND, pinchPoint, true);

      // Block should still be grabbed
      expect(manager.getGrabbedBlockId()).toBe('block-1');
      expect(mockGameClient.sendBlockRelease).not.toHaveBeenCalled();

      // Even after more time passes, block stays grabbed because pinch resumed
      vi.advanceTimersByTime(GRAB_RELEASE_GRACE_MS * 2);
      manager.processInteraction(DEFAULT_HAND, pinchPoint, true);

      expect(manager.getGrabbedBlockId()).toBe('block-1');
      expect(mockGameClient.sendBlockRelease).not.toHaveBeenCalled();
    });
  });

  // ============ Grace Period - Block Jumping Prevention ============

  describe('Grace Period - Block Jumping Prevention', () => {
    it('should NOT update highlight or find new blocks during grace period', () => {
      const block1 = createTestBlock('block-1');
      const block2 = createTestBlock('block-2', 2, 2);
      mockBlockRenderer.findNearestBlock.mockReturnValue(block1);

      const pinchPoint = createPinchPoint(0, 0);

      // Grab block 1
      manager.processInteraction(DEFAULT_HAND, pinchPoint, false);
      manager.processInteraction(DEFAULT_HAND, pinchPoint, true);

      mockBlockRenderer.findNearestBlock.mockClear();
      mockBlockRenderer.findNearestBlock.mockReturnValue(block2);

      // Stop pinching - starts grace period
      const nearBlock2Point = createPinchPoint(2, 2);
      manager.processInteraction(DEFAULT_HAND, nearBlock2Point, false);

      // Should NOT have called findNearestBlock during grace period
      expect(mockBlockRenderer.findNearestBlock).not.toHaveBeenCalled();

      // Should still have block 1 grabbed
      expect(manager.getGrabbedBlockId()).toBe('block-1');
    });

    it('should NOT switch to different block during grace period', () => {
      const block1 = createTestBlock('block-1');
      const block2 = createTestBlock('block-2', 5, 5);
      mockBlockRenderer.findNearestBlock.mockReturnValue(block1);

      // Grab block 1
      manager.processInteraction(DEFAULT_HAND, createPinchPoint(0, 0), false);
      manager.processInteraction(DEFAULT_HAND, createPinchPoint(0, 0), true);

      expect(manager.getGrabbedBlockId()).toBe('block-1');

      // Move hand near block 2 and stop pinching
      mockBlockRenderer.findNearestBlock.mockReturnValue(block2);
      manager.processInteraction(DEFAULT_HAND, createPinchPoint(5, 5), false);

      // Still within grace period - should keep block 1
      expect(manager.getGrabbedBlockId()).toBe('block-1');

      // Resume pinching at new location
      manager.processInteraction(DEFAULT_HAND, createPinchPoint(5, 5), true);

      // Should still have block 1, not block 2
      expect(manager.getGrabbedBlockId()).toBe('block-1');
    });

    it('should continue moving current block during grace period', () => {
      const block = createTestBlock('block-1', 0, 0);
      mockBlockRenderer.findNearestBlock.mockReturnValue(block);

      // Grab the block
      manager.processInteraction(DEFAULT_HAND, createPinchPoint(0, 0), false);
      manager.processInteraction(DEFAULT_HAND, createPinchPoint(0, 0), true);

      // Stop pinching but move hand - starts grace period
      manager.processInteraction(DEFAULT_HAND, createPinchPoint(3, 3), false);

      // Block should still be moving towards hand position
      expect(block.mesh.position.x).toBeGreaterThan(0);
      expect(block.mesh.position.y).toBeGreaterThan(0);
      expect(mockBlockRenderer.showGrabbedHighlightForHand).toHaveBeenCalled();
    });
  });

  // ============ Edge Cases ============

  describe('Edge Cases', () => {
    it('should release immediately when hand is lost (no pinch point)', () => {
      const block = createTestBlock('block-1');
      mockBlockRenderer.findNearestBlock.mockReturnValue(block);

      // Grab the block
      manager.processInteraction(DEFAULT_HAND, createPinchPoint(0, 0), false);
      manager.processInteraction(DEFAULT_HAND, createPinchPoint(0, 0), true);

      expect(manager.getGrabbedBlockId()).toBe('block-1');

      // Hand is lost (null pinch point) - should release immediately
      const status = manager.processInteraction(DEFAULT_HAND, null, false);

      expect(status).toBe('No hand detected');
      expect(manager.getGrabbedBlockId()).toBeNull();
      expect(mockGameClient.sendBlockRelease).toHaveBeenCalledWith('block-1');
    });

    it('should handle multiple quick pinch on/off cycles', () => {
      const block = createTestBlock('block-1');
      mockBlockRenderer.findNearestBlock.mockReturnValue(block);

      const pinchPoint = createPinchPoint(0, 0);

      // Grab the block
      manager.processInteraction(DEFAULT_HAND, pinchPoint, false);
      manager.processInteraction(DEFAULT_HAND, pinchPoint, true);

      // Multiple quick pinch cycles
      for (let i = 0; i < 5; i++) {
        manager.processInteraction(DEFAULT_HAND, pinchPoint, false); // Release attempt
        vi.advanceTimersByTime(GRAB_RELEASE_GRACE_MS / 3); // Less than grace period
        manager.processInteraction(DEFAULT_HAND, pinchPoint, true); // Resume pinch
      }

      // Block should still be grabbed through all cycles
      expect(manager.getGrabbedBlockId()).toBe('block-1');
      expect(mockGameClient.sendBlockRelease).not.toHaveBeenCalled();
    });

    it('should reset grace timer if pinch resumes then fails again', () => {
      const block = createTestBlock('block-1');
      mockBlockRenderer.findNearestBlock.mockReturnValue(block);

      const pinchPoint = createPinchPoint(0, 0);

      // Grab the block
      manager.processInteraction(DEFAULT_HAND, pinchPoint, false);
      manager.processInteraction(DEFAULT_HAND, pinchPoint, true);

      // First pinch failure - starts grace period
      manager.processInteraction(DEFAULT_HAND, pinchPoint, false);

      // Wait almost the full grace period
      vi.advanceTimersByTime(GRAB_RELEASE_GRACE_MS - 10);

      // Resume pinching (cancels grace timer)
      manager.processInteraction(DEFAULT_HAND, pinchPoint, true);

      // Stop pinching again (starts new grace period)
      manager.processInteraction(DEFAULT_HAND, pinchPoint, false);

      // Even though total time since first failure exceeds grace period,
      // the timer was reset when pinch resumed
      vi.advanceTimersByTime(GRAB_RELEASE_GRACE_MS - 10);
      manager.processInteraction(DEFAULT_HAND, pinchPoint, false);

      // Should still be grabbed (new grace period hasn't expired)
      expect(manager.getGrabbedBlockId()).toBe('block-1');
      expect(mockGameClient.sendBlockRelease).not.toHaveBeenCalled();

      // Now wait for new grace period to expire
      vi.advanceTimersByTime(20);
      manager.processInteraction(DEFAULT_HAND, pinchPoint, false);

      // Now should be released
      expect(manager.getGrabbedBlockId()).toBeNull();
      expect(mockGameClient.sendBlockRelease).toHaveBeenCalled();
    });

    it('should clear grace state on clear() call', () => {
      const block = createTestBlock('block-1');
      mockBlockRenderer.findNearestBlock.mockReturnValue(block);

      const pinchPoint = createPinchPoint(0, 0);

      // Grab the block
      manager.processInteraction(DEFAULT_HAND, pinchPoint, false);
      manager.processInteraction(DEFAULT_HAND, pinchPoint, true);

      // Start grace period
      manager.processInteraction(DEFAULT_HAND, pinchPoint, false);

      // Clear all state
      manager.clear();

      expect(manager.getGrabbedBlockId()).toBeNull();
      expect(mockBlockRenderer.hideReachableHighlight).toHaveBeenCalled();
      expect(mockBlockRenderer.hideAllGrabbedHighlights).toHaveBeenCalled();

      // Verify no release was sent (clear doesn't send network messages)
      // sendBlockRelease should NOT have been called by clear()
      expect(mockGameClient.sendBlockRelease).not.toHaveBeenCalled();
    });

    it('should return correct status during grace period', () => {
      const block = createTestBlock('block-1');
      mockBlockRenderer.findNearestBlock.mockReturnValue(block);

      const pinchPoint = createPinchPoint(0, 0);

      // Grab the block
      manager.processInteraction(DEFAULT_HAND, pinchPoint, false);
      manager.processInteraction(DEFAULT_HAND, pinchPoint, true);

      // Stop pinching - enter grace period
      const status = manager.processInteraction(DEFAULT_HAND, pinchPoint, false);

      // Should still show 'Grabbing' during grace period
      expect(status).toBe('Grabbing');
    });
  });

  // ============ Two-Hand Interaction Tests ============

  describe('Two-Hand Interaction', () => {
    it('should allow grabbing two different blocks with two hands', () => {
      const block1 = createTestBlock('block-1');
      const block2 = createTestBlock('block-2', 3, 3);

      // Right hand grabs block 1
      mockBlockRenderer.findNearestBlock.mockReturnValue(block1);
      manager.processInteraction('Right', createPinchPoint(0, 0), false);
      manager.processInteraction('Right', createPinchPoint(0, 0), true);

      // Left hand grabs block 2
      mockBlockRenderer.findNearestBlock.mockReturnValue(block2);
      manager.processInteraction('Left', createPinchPoint(3, 3), false);
      manager.processInteraction('Left', createPinchPoint(3, 3), true);

      // Both blocks should be grabbed
      const grabbedIds = manager.getGrabbedBlockIds();
      expect(grabbedIds).toContain('block-1');
      expect(grabbedIds).toContain('block-2');
      expect(grabbedIds).toHaveLength(2);
    });

    it('should not allow same block to be grabbed by both hands', () => {
      const block = createTestBlock('block-1');
      mockBlockRenderer.findNearestBlock.mockReturnValue(block);

      // Right hand grabs block
      manager.processInteraction('Right', createPinchPoint(0, 0), false);
      manager.processInteraction('Right', createPinchPoint(0, 0), true);

      // Left hand tries to grab same block
      manager.processInteraction('Left', createPinchPoint(0, 0), false);
      manager.processInteraction('Left', createPinchPoint(0, 0), true);

      // Only one grab should have succeeded
      expect(manager.getGrabbedBlockIds()).toHaveLength(1);
    });

    it('should release hand independently', () => {
      const block1 = createTestBlock('block-1');
      const block2 = createTestBlock('block-2', 3, 3);

      // Both hands grab blocks
      mockBlockRenderer.findNearestBlock.mockReturnValue(block1);
      manager.processInteraction('Right', createPinchPoint(0, 0), false);
      manager.processInteraction('Right', createPinchPoint(0, 0), true);

      mockBlockRenderer.findNearestBlock.mockReturnValue(block2);
      manager.processInteraction('Left', createPinchPoint(3, 3), false);
      manager.processInteraction('Left', createPinchPoint(3, 3), true);

      expect(manager.getGrabbedBlockIds()).toHaveLength(2);

      // Right hand releases (after grace period)
      manager.processInteraction('Right', createPinchPoint(0, 0), false);
      vi.advanceTimersByTime(GRAB_RELEASE_GRACE_MS + 10);
      manager.processInteraction('Right', createPinchPoint(0, 0), false);

      // Only block 2 should still be grabbed
      const grabbedIds = manager.getGrabbedBlockIds();
      expect(grabbedIds).not.toContain('block-1');
      expect(grabbedIds).toContain('block-2');
      expect(grabbedIds).toHaveLength(1);
    });
  });
});
