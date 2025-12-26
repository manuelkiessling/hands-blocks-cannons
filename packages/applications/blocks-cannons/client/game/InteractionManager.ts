/**
 * @fileoverview Manages player interaction with blocks (grab, move, release).
 * Supports two-hand interaction with independent grab state per hand.
 */

import type * as THREE from 'three';
import {
  ANIMATION,
  BLOCK_REACH_DISTANCE,
  GRAB_RELEASE_GRACE_MS,
  MEDIAPIPE,
  POSITION_SEND_THROTTLE_MS,
} from '../constants.js';
import type { GameClient } from '../network/GameClient.js';
import type { BlockRenderer } from '../scene/BlockRenderer.js';
import type { BlockEntity, Handedness } from '../types.js';

/**
 * State for a single hand's interaction.
 */
interface HandInteractionState {
  grabbedBlock: BlockEntity | null;
  reachableBlock: BlockEntity | null;
  releaseGraceStart: number | null;
  lastSendTime: number;
  /** Order in which this hand grabbed its block (for oldest-release logic) */
  grabOrder: number;
}

/**
 * Manages block interaction state and logic for multiple hands.
 */
export class InteractionManager {
  private readonly blockRenderer: BlockRenderer;
  private readonly gameClient: GameClient;

  /** Per-hand interaction state, keyed by handedness */
  private readonly handStates: Map<Handedness, HandInteractionState> = new Map();

  /** Counter to track grab order (for releasing oldest when exceeding limit) */
  private grabOrderCounter = 0;

  constructor(blockRenderer: BlockRenderer, gameClient: GameClient) {
    this.blockRenderer = blockRenderer;
    this.gameClient = gameClient;

    // Initialize state for each possible hand
    this.handStates.set('Left', this.createInitialHandState());
    this.handStates.set('Right', this.createInitialHandState());
  }

  private createInitialHandState(): HandInteractionState {
    return {
      grabbedBlock: null,
      reachableBlock: null,
      releaseGraceStart: null,
      lastSendTime: 0,
      grabOrder: 0,
    };
  }

  /**
   * Process hand interaction for this frame.
   * @param handedness - Which hand (Left/Right from MediaPipe)
   * @param pinchPoint - Current pinch point in 3D space, or null if no hand
   * @param isPinching - Whether the hand is in a pinch gesture
   * @returns Status text describing the current interaction state
   */
  processInteraction(
    handedness: Handedness,
    pinchPoint: THREE.Vector3 | null,
    isPinching: boolean
  ): string {
    const state = this.handStates.get(handedness);
    if (!state) return 'Unknown hand';

    // No hand detected - release immediately (no grace period without hand tracking)
    if (!pinchPoint) {
      state.releaseGraceStart = null;
      if (state.grabbedBlock) {
        this.releaseBlockForHand(handedness);
      }
      this.updateHighlightForHand(handedness, null);
      return 'No hand detected';
    }

    // Check if we're in grace period (holding block but pinch detection failed)
    const isInGracePeriod = state.grabbedBlock && state.releaseGraceStart !== null;

    // Update reachable block highlight only when not grabbing AND not in grace period
    if (!state.grabbedBlock && !isInGracePeriod) {
      this.updateHighlightForHand(handedness, pinchPoint);
    }

    if (isPinching) {
      // Cancel any pending release - pinch resumed
      state.releaseGraceStart = null;

      // Try to grab if not already grabbing
      if (!state.grabbedBlock && state.reachableBlock) {
        this.grabBlockForHand(handedness, state.reachableBlock);
      }

      // Move grabbed block
      if (state.grabbedBlock) {
        this.moveGrabbedBlockForHand(handedness, pinchPoint);
        return 'Grabbing';
      }

      return state.reachableBlock ? 'Pinching' : 'Pinching (no block)';
    }

    // Not pinching - handle release with grace period
    if (state.grabbedBlock) {
      const now = Date.now();

      if (state.releaseGraceStart === null) {
        // Start grace period
        state.releaseGraceStart = now;
      }

      // Check if grace period has expired
      if (now - state.releaseGraceStart > GRAB_RELEASE_GRACE_MS) {
        // Grace period expired - actually release
        this.releaseBlockForHand(handedness);
        state.releaseGraceStart = null;
        return state.reachableBlock ? 'In reach' : 'Open';
      }

      // Still in grace period - keep block grabbed and continue moving
      this.moveGrabbedBlockForHand(handedness, pinchPoint);
      return 'Grabbing';
    }

    return state.reachableBlock ? 'In reach' : 'Open';
  }

  /**
   * Mark a hand as not detected (releases any grabbed block).
   */
  markHandLost(handedness: Handedness): void {
    const state = this.handStates.get(handedness);
    if (!state) return;

    state.releaseGraceStart = null;
    if (state.grabbedBlock) {
      this.releaseBlockForHand(handedness);
    }
    this.updateHighlightForHand(handedness, null);
  }

  /**
   * Get all currently grabbed blocks (one per hand, max 2).
   */
  getGrabbedBlocks(): BlockEntity[] {
    const grabbed: BlockEntity[] = [];
    for (const state of this.handStates.values()) {
      if (state.grabbedBlock) {
        grabbed.push(state.grabbedBlock);
      }
    }
    return grabbed;
  }

  /**
   * Get all currently grabbed block IDs.
   */
  getGrabbedBlockIds(): string[] {
    return this.getGrabbedBlocks().map((b) => b.data.id);
  }

  /**
   * Get the grabbed block for a specific hand.
   */
  getGrabbedBlockForHand(handedness: Handedness): BlockEntity | null {
    return this.handStates.get(handedness)?.grabbedBlock ?? null;
  }

  /**
   * Legacy getter for backward compatibility (returns first grabbed block).
   * @deprecated Use getGrabbedBlocks() for multi-hand support
   */
  getGrabbedBlock(): BlockEntity | null {
    for (const state of this.handStates.values()) {
      if (state.grabbedBlock) {
        return state.grabbedBlock;
      }
    }
    return null;
  }

  /**
   * Legacy getter for backward compatibility (returns first grabbed block ID).
   * @deprecated Use getGrabbedBlockIds() for multi-hand support
   */
  getGrabbedBlockId(): string | null {
    return this.getGrabbedBlock()?.data.id ?? null;
  }

  /**
   * Clear interaction state (e.g., on disconnect).
   */
  clear(): void {
    for (const state of this.handStates.values()) {
      state.grabbedBlock = null;
      state.reachableBlock = null;
      state.releaseGraceStart = null;
      state.lastSendTime = 0;
      state.grabOrder = 0;
    }
    this.grabOrderCounter = 0;
    this.blockRenderer.hideReachableHighlight();
    this.blockRenderer.hideAllGrabbedHighlights();
  }

  // ============ Private Methods ============

  private updateHighlightForHand(handedness: Handedness, pinchPoint: THREE.Vector3 | null): void {
    const state = this.handStates.get(handedness);
    if (!state) return;

    if (!pinchPoint) {
      // Only hide if this hand was showing the reachable highlight
      if (state.reachableBlock) {
        this.blockRenderer.hideReachableHighlight();
      }
      state.reachableBlock = null;
      return;
    }

    // Get block IDs that are already grabbed by any hand
    const alreadyGrabbedIds = new Set(this.getGrabbedBlockIds());

    // Find nearest block within reach that isn't already grabbed
    const nearest = this.blockRenderer.findNearestBlock(
      pinchPoint,
      BLOCK_REACH_DISTANCE,
      true, // Only my blocks
      alreadyGrabbedIds // Exclude already grabbed blocks
    );

    state.reachableBlock = nearest;

    if (nearest) {
      this.blockRenderer.showReachableHighlight(nearest.mesh.position, nearest.mesh.rotation);
    } else {
      this.blockRenderer.hideReachableHighlight();
    }
  }

  private grabBlockForHand(handedness: Handedness, block: BlockEntity): void {
    const state = this.handStates.get(handedness);
    if (!state) return;

    // Check if this block is already grabbed by another hand
    for (const [otherHand, otherState] of this.handStates) {
      if (otherHand !== handedness && otherState.grabbedBlock?.data.id === block.data.id) {
        // Block is already grabbed by other hand - don't allow double grab
        return;
      }
    }

    // Check if we're at max grabs and need to release oldest
    const currentGrabCount = this.getGrabbedBlocks().length;
    if (currentGrabCount >= MEDIAPIPE.MAX_HANDS) {
      // Find and release the oldest grab
      let oldestHand: Handedness | null = null;
      let oldestOrder = Number.MAX_VALUE;

      for (const [hand, handState] of this.handStates) {
        if (handState.grabbedBlock && handState.grabOrder < oldestOrder) {
          oldestOrder = handState.grabOrder;
          oldestHand = hand;
        }
      }

      if (oldestHand) {
        this.releaseBlockForHand(oldestHand);
      }
    }

    state.grabbedBlock = block;
    state.grabOrder = ++this.grabOrderCounter;
    this.blockRenderer.hideReachableHighlight();
    this.gameClient.sendBlockGrab(block.data.id);
  }

  private moveGrabbedBlockForHand(handedness: Handedness, pinchPoint: THREE.Vector3): void {
    const state = this.handStates.get(handedness);
    if (!state?.grabbedBlock) return;

    // Smoothly lerp block position to pinch point
    const mesh = state.grabbedBlock.mesh;
    mesh.position.x += (pinchPoint.x - mesh.position.x) * ANIMATION.GRAB_LERP;
    mesh.position.y += (pinchPoint.y - mesh.position.y) * ANIMATION.GRAB_LERP;
    state.grabbedBlock.baseY = mesh.position.y;

    // Show grabbed highlight for this hand
    this.blockRenderer.showGrabbedHighlightForHand(handedness, mesh.position, mesh.rotation);

    // Send position updates (throttled per hand)
    const now = Date.now();
    if (now - state.lastSendTime > POSITION_SEND_THROTTLE_MS) {
      this.gameClient.sendBlockMove(state.grabbedBlock.data.id, {
        x: mesh.position.x,
        y: mesh.position.y,
        z: mesh.position.z,
      });
      state.lastSendTime = now;
    }
  }

  private releaseBlockForHand(handedness: Handedness): void {
    const state = this.handStates.get(handedness);
    if (!state) return;

    if (state.grabbedBlock) {
      this.gameClient.sendBlockRelease(state.grabbedBlock.data.id);
      state.grabbedBlock = null;
      state.grabOrder = 0;
    }
    this.blockRenderer.hideGrabbedHighlightForHand(handedness);
  }
}
