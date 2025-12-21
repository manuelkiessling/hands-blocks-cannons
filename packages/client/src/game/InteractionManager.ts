/**
 * @fileoverview Manages player interaction with blocks (grab, move, release).
 */

import * as THREE from 'three';
import type { BlockEntity } from '../types.js';
import type { BlockRenderer } from '../scene/BlockRenderer.js';
import type { GameClient } from '../network/GameClient.js';
import { ANIMATION, BLOCK_REACH_DISTANCE, POSITION_SEND_THROTTLE_MS } from '../constants.js';

/**
 * Manages block interaction state and logic.
 */
export class InteractionManager {
  private readonly blockRenderer: BlockRenderer;
  private readonly gameClient: GameClient;

  private grabbedBlock: BlockEntity | null = null;
  private reachableBlock: BlockEntity | null = null;
  private lastSendTime = 0;

  constructor(blockRenderer: BlockRenderer, gameClient: GameClient) {
    this.blockRenderer = blockRenderer;
    this.gameClient = gameClient;
  }

  /**
   * Process hand interaction for this frame.
   * @param pinchPoint - Current pinch point in 3D space, or null if no hand
   * @param isPinching - Whether the hand is in a pinch gesture
   * @returns Status text describing the current interaction state
   */
  processInteraction(
    pinchPoint: THREE.Vector3 | null,
    isPinching: boolean
  ): string {
    // No hand detected
    if (!pinchPoint) {
      if (this.grabbedBlock) {
        this.releaseCurrentBlock();
      }
      this.updateHighlight(null);
      return 'No hand detected';
    }

    // Update reachable block highlight when not grabbing
    if (!this.grabbedBlock) {
      this.updateHighlight(pinchPoint);
    }

    if (isPinching) {
      // Try to grab if not already grabbing
      if (!this.grabbedBlock && this.reachableBlock) {
        this.grabBlock(this.reachableBlock);
      }

      // Move grabbed block
      if (this.grabbedBlock) {
        this.moveGrabbedBlock(pinchPoint);
        return 'Grabbing';
      }

      return this.reachableBlock ? 'Pinching' : 'Pinching (no block)';
    } else {
      // Release if was grabbing
      if (this.grabbedBlock) {
        this.releaseCurrentBlock();
      }

      return this.reachableBlock ? 'In reach' : 'Open';
    }
  }

  /**
   * Get the currently grabbed block.
   */
  getGrabbedBlock(): BlockEntity | null {
    return this.grabbedBlock;
  }

  /**
   * Get the currently grabbed block ID.
   */
  getGrabbedBlockId(): string | null {
    return this.grabbedBlock?.data.id ?? null;
  }

  /**
   * Clear interaction state (e.g., on disconnect).
   */
  clear(): void {
    this.grabbedBlock = null;
    this.reachableBlock = null;
    this.blockRenderer.hideReachableHighlight();
    this.blockRenderer.hideGrabbedHighlight();
  }

  // ============ Private Methods ============

  private updateHighlight(pinchPoint: THREE.Vector3 | null): void {
    if (!pinchPoint) {
      this.blockRenderer.hideReachableHighlight();
      this.reachableBlock = null;
      return;
    }

    // Find nearest block within reach
    const nearest = this.blockRenderer.findNearestBlock(
      pinchPoint,
      BLOCK_REACH_DISTANCE,
      true // Only my blocks
    );

    this.reachableBlock = nearest;

    if (nearest) {
      this.blockRenderer.showReachableHighlight(
        nearest.mesh.position,
        nearest.mesh.rotation
      );
    } else {
      this.blockRenderer.hideReachableHighlight();
    }
  }

  private grabBlock(block: BlockEntity): void {
    this.grabbedBlock = block;
    this.blockRenderer.hideReachableHighlight();
    this.gameClient.sendBlockGrab(block.data.id);
  }

  private moveGrabbedBlock(pinchPoint: THREE.Vector3): void {
    if (!this.grabbedBlock) return;

    // Smoothly lerp block position to pinch point
    const mesh = this.grabbedBlock.mesh;
    mesh.position.x += (pinchPoint.x - mesh.position.x) * ANIMATION.GRAB_LERP;
    mesh.position.y += (pinchPoint.y - mesh.position.y) * ANIMATION.GRAB_LERP;
    this.grabbedBlock.baseY = mesh.position.y;

    // Show grabbed highlight
    this.blockRenderer.showGrabbedHighlight(mesh.position, mesh.rotation);

    // Send position updates (throttled)
    const now = Date.now();
    if (now - this.lastSendTime > POSITION_SEND_THROTTLE_MS) {
      this.gameClient.sendBlockMove(this.grabbedBlock.data.id, {
        x: mesh.position.x,
        y: mesh.position.y,
        z: mesh.position.z,
      });
      this.lastSendTime = now;
    }
  }

  private releaseCurrentBlock(): void {
    if (this.grabbedBlock) {
      this.gameClient.sendBlockRelease(this.grabbedBlock.data.id);
      this.grabbedBlock = null;
    }
    this.blockRenderer.hideGrabbedHighlight();
  }
}

