/**
 * @fileoverview Block and projectile mesh management.
 * Handles creation, updates, and removal of game entities.
 */

import * as THREE from 'three';
import { BLOCK_FLOAT_AMPLITUDE, HIGHLIGHT_COLORS } from '../constants.js';
import type { Block, BlockEntity, Projectile, ProjectileEntity } from '../types.js';

/**
 * Manages block and projectile meshes in the scene.
 */
export class BlockRenderer {
  private readonly scene: THREE.Scene;
  private readonly _blocks: Map<string, BlockEntity> = new Map();
  private readonly _projectiles: Map<string, ProjectileEntity> = new Map();
  private readonly myBlockIds: Set<string> = new Set();

  /** Read-only access to blocks collection */
  get blocks(): ReadonlyMap<string, BlockEntity> {
    return this._blocks;
  }

  /** Read-only access to projectiles collection */
  get projectiles(): ReadonlyMap<string, ProjectileEntity> {
    return this._projectiles;
  }

  // Highlights
  private readonly reachableHighlight: THREE.LineSegments;
  private readonly grabbedHighlight: THREE.LineSegments;
  private readonly opponentGrabHighlight: THREE.LineSegments;

  private playerId: string | null = null;
  private playerNumber: 1 | 2 | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Create highlight meshes
    const highlightGeo = new THREE.BoxGeometry(1.15, 1.15, 1.15);
    const highlightEdges = new THREE.EdgesGeometry(highlightGeo);

    this.reachableHighlight = new THREE.LineSegments(
      highlightEdges,
      new THREE.LineBasicMaterial({
        color: HIGHLIGHT_COLORS.REACHABLE,
        transparent: true,
        opacity: 0.9,
      })
    );
    this.reachableHighlight.visible = false;
    this.scene.add(this.reachableHighlight);

    this.grabbedHighlight = new THREE.LineSegments(
      highlightEdges.clone(),
      new THREE.LineBasicMaterial({
        color: HIGHLIGHT_COLORS.GRABBED,
        transparent: true,
        opacity: 1,
      })
    );
    this.grabbedHighlight.visible = false;
    this.scene.add(this.grabbedHighlight);

    this.opponentGrabHighlight = new THREE.LineSegments(
      highlightEdges.clone(),
      new THREE.LineBasicMaterial({
        color: HIGHLIGHT_COLORS.OPPONENT_GRAB,
        transparent: true,
        opacity: 0.7,
      })
    );
    this.opponentGrabHighlight.visible = false;
    this.scene.add(this.opponentGrabHighlight);
  }

  /**
   * Set the current player info.
   */
  setPlayer(playerId: string, playerNumber: 1 | 2): void {
    this.playerId = playerId;
    this.playerNumber = playerNumber;
  }

  /**
   * Create a block mesh and add it to the scene.
   */
  createBlock(blockData: Block): BlockEntity {
    const isMyBlock = blockData.ownerId === this.playerId;
    const isCannon = blockData.blockType === 'cannon';

    // Cannon has distinct shape
    const geometry = isCannon
      ? new THREE.BoxGeometry(0.8, 0.8, 1.5)
      : new THREE.BoxGeometry(1, 1, 1);

    const material = new THREE.MeshStandardMaterial({
      color: blockData.color,
      transparent: true,
      opacity: isMyBlock ? 0.9 : 0.5,
      emissive: isCannon ? blockData.color : 0x000000,
      emissiveIntensity: isCannon ? 0.3 : 0,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(blockData.position.x, blockData.position.y, blockData.position.z);

    // Orient cannon to point towards enemy
    if (isCannon && this.playerNumber) {
      mesh.rotation.y = this.playerNumber === 1 ? 0 : Math.PI;
    }

    const entity: BlockEntity = {
      mesh,
      data: blockData,
      baseY: blockData.position.y,
      phase: Math.random() * Math.PI * 2,
      isGrabbed: false,
    };

    this.scene.add(mesh);
    this._blocks.set(blockData.id, entity);

    if (isMyBlock) {
      this.myBlockIds.add(blockData.id);
    }

    return entity;
  }

  /**
   * Create a projectile mesh and add it to the scene.
   */
  createProjectile(projectileData: Projectile, projectileSize: number = 0.3): ProjectileEntity {
    const geometry = new THREE.SphereGeometry(projectileSize, 16, 16);
    const material = new THREE.MeshStandardMaterial({
      color: projectileData.color,
      emissive: projectileData.color,
      emissiveIntensity: 0.6,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(
      projectileData.position.x,
      projectileData.position.y,
      projectileData.position.z
    );

    const entity: ProjectileEntity = {
      mesh,
      data: projectileData,
    };

    this.scene.add(mesh);
    this._projectiles.set(projectileData.id, entity);

    return entity;
  }

  /**
   * Update a block's position.
   */
  updateBlockPosition(blockId: string, position: { x: number; y: number; z: number }): void {
    const entity = this._blocks.get(blockId);
    if (entity) {
      entity.mesh.position.set(position.x, position.y, position.z);
      entity.baseY = position.y;
    }
  }

  /**
   * Update a projectile's position.
   */
  updateProjectilePosition(
    projectileId: string,
    position: { x: number; y: number; z: number }
  ): void {
    const entity = this._projectiles.get(projectileId);
    if (entity) {
      entity.mesh.position.set(position.x, position.y, position.z);
    }
  }

  /**
   * Remove a block from the scene.
   */
  removeBlock(blockId: string): void {
    const entity = this._blocks.get(blockId);
    if (entity) {
      this.scene.remove(entity.mesh);
      entity.mesh.geometry.dispose();
      if (entity.mesh.material instanceof THREE.Material) {
        entity.mesh.material.dispose();
      }
      this._blocks.delete(blockId);
      this.myBlockIds.delete(blockId);
    }
  }

  /**
   * Remove a projectile from the scene.
   */
  removeProjectile(projectileId: string): void {
    const entity = this._projectiles.get(projectileId);
    if (entity) {
      this.scene.remove(entity.mesh);
      entity.mesh.geometry.dispose();
      if (entity.mesh.material instanceof THREE.Material) {
        entity.mesh.material.dispose();
      }
      this._projectiles.delete(projectileId);
    }
  }

  /**
   * Mark a block as grabbed.
   */
  setBlockGrabbed(blockId: string, isGrabbed: boolean): void {
    const entity = this._blocks.get(blockId);
    if (entity) {
      entity.isGrabbed = isGrabbed;
      if (isGrabbed && !this.myBlockIds.has(blockId)) {
        // Opponent grabbed a block - show highlight
        this.opponentGrabHighlight.position.copy(entity.mesh.position);
        this.opponentGrabHighlight.visible = true;
      }
    }
    if (!isGrabbed) {
      this.opponentGrabHighlight.visible = false;
    }
  }

  /**
   * Show reachable block highlight at a position.
   */
  showReachableHighlight(position: THREE.Vector3, rotation?: THREE.Euler): void {
    this.reachableHighlight.position.copy(position);
    if (rotation) {
      this.reachableHighlight.rotation.copy(rotation);
    }
    this.reachableHighlight.visible = true;
  }

  /**
   * Hide the reachable block highlight.
   */
  hideReachableHighlight(): void {
    this.reachableHighlight.visible = false;
  }

  /**
   * Show grabbed block highlight at a position.
   */
  showGrabbedHighlight(position: THREE.Vector3, rotation?: THREE.Euler): void {
    this.grabbedHighlight.position.copy(position);
    if (rotation) {
      this.grabbedHighlight.rotation.copy(rotation);
    }
    this.grabbedHighlight.visible = true;
  }

  /**
   * Hide the grabbed block highlight.
   */
  hideGrabbedHighlight(): void {
    this.grabbedHighlight.visible = false;
  }

  /**
   * Update floating animations for all blocks.
   */
  updateAnimations(elapsedTime: number, grabbedBlockId: string | null): void {
    for (const [id, entity] of this._blocks) {
      if (id !== grabbedBlockId && !entity.isGrabbed) {
        // Gentle floating animation
        entity.mesh.position.y =
          entity.baseY + Math.sin(elapsedTime + entity.phase) * BLOCK_FLOAT_AMPLITUDE;
      }
    }

    // Update opponent grab highlight position
    if (this.opponentGrabHighlight.visible) {
      for (const entity of this._blocks.values()) {
        if (entity.isGrabbed && !this.myBlockIds.has(entity.data.id)) {
          this.opponentGrabHighlight.position.copy(entity.mesh.position);
          break;
        }
      }
    }
  }

  /**
   * Get a block entity by ID.
   */
  getBlock(blockId: string): BlockEntity | undefined {
    return this._blocks.get(blockId);
  }

  /**
   * Get all my block IDs.
   */
  getMyBlockIds(): Set<string> {
    return this.myBlockIds;
  }

  /**
   * Check if a block is mine.
   */
  isMyBlock(blockId: string): boolean {
    return this.myBlockIds.has(blockId);
  }

  /**
   * Find the nearest block to a point within a max distance.
   */
  findNearestBlock(
    point: THREE.Vector3,
    maxDistance: number,
    onlyMyBlocks: boolean = true
  ): BlockEntity | null {
    let nearest: BlockEntity | null = null;
    let nearestDist = maxDistance;

    for (const [blockId, entity] of this._blocks) {
      if (onlyMyBlocks && !this.myBlockIds.has(blockId)) continue;

      const dx = entity.mesh.position.x - point.x;
      const dy = entity.mesh.position.y - point.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = entity;
      }
    }

    return nearest;
  }

  /**
   * Remove all blocks belonging to a player.
   */
  removePlayerBlocks(ownerId: string): void {
    for (const [blockId, entity] of this._blocks) {
      if (entity.data.ownerId === ownerId) {
        this.removeBlock(blockId);
      }
    }
  }

  /**
   * Remove all projectiles belonging to a player.
   */
  removePlayerProjectiles(ownerId: string): void {
    for (const [projId, entity] of this._projectiles) {
      if (entity.data.ownerId === ownerId) {
        this.removeProjectile(projId);
      }
    }
  }

  /**
   * Clear all blocks and projectiles.
   */
  clear(): void {
    for (const blockId of [...this._blocks.keys()]) {
      this.removeBlock(blockId);
    }
    for (const projId of [...this._projectiles.keys()]) {
      this.removeProjectile(projId);
    }
    this.myBlockIds.clear();
    this.playerId = null;
    this.playerNumber = null;
  }

  /**
   * Dispose of all resources.
   */
  dispose(): void {
    this.clear();
    this.scene.remove(this.reachableHighlight);
    this.scene.remove(this.grabbedHighlight);
    this.scene.remove(this.opponentGrabHighlight);
  }
}
