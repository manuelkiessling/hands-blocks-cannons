/**
 * @fileoverview Main entry point - orchestrates all game modules.
 */

import * as THREE from 'three';
import { InteractionManager } from './game/index.js';
import { GestureDetector, HandTracker, HandVisualizer } from './input/index.js';
import { GameClient } from './network/index.js';
import { BlockRenderer, EffectsManager, RoomRenderer, SceneManager } from './scene/index.js';
import type {
  Block,
  ConnectionState,
  GameInitData,
  HandLandmarks,
  Position,
  RoomBounds,
} from './types.js';
import { StatusDisplay } from './ui/index.js';

/**
 * Main game application.
 */
class Game {
  // Core systems
  private readonly sceneManager: SceneManager;
  private readonly roomRenderer: RoomRenderer;
  private readonly blockRenderer: BlockRenderer;
  private readonly effectsManager: EffectsManager;
  private readonly handTracker: HandTracker;
  private readonly gestureDetector: GestureDetector;
  private readonly handVisualizer: HandVisualizer;
  private readonly gameClient: GameClient;
  private readonly interactionManager: InteractionManager;
  private readonly statusDisplay: StatusDisplay;

  // Game state
  private playerId: string | null = null;
  private playerNumber: 1 | 2 | null = null;
  private room: RoomBounds | null = null;
  private projectileSize = 0.3;
  private opponentConnected = false;
  private lastFrameTime = 0;

  // Current hand landmarks for interaction processing
  private currentLandmarks: HandLandmarks | null = null;

  constructor() {
    // Get container element
    const container = document.getElementById('container');
    if (!container) {
      throw new Error('Required DOM element not found: #container');
    }
    const videoElement = document.getElementById('webcam') as HTMLVideoElement;

    // Initialize scene
    this.sceneManager = new SceneManager(container);
    this.roomRenderer = new RoomRenderer(this.sceneManager.scene);
    this.blockRenderer = new BlockRenderer(this.sceneManager.scene);
    this.effectsManager = new EffectsManager(this.sceneManager.scene);

    // Initialize input
    this.handVisualizer = new HandVisualizer(this.sceneManager.scene);
    this.gestureDetector = new GestureDetector();
    this.handTracker = new HandTracker(videoElement);

    // Initialize UI
    this.statusDisplay = new StatusDisplay();

    // Initialize network
    this.gameClient = new GameClient({
      onConnectionStateChange: this.handleConnectionStateChange.bind(this),
      onWelcome: this.handleWelcome.bind(this),
      onOpponentJoined: this.handleOpponentJoined.bind(this),
      onOpponentLeft: this.handleOpponentLeft.bind(this),
      onBlockGrabbed: this.handleBlockGrabbed.bind(this),
      onBlockMoved: this.handleBlockMoved.bind(this),
      onBlockReleased: this.handleBlockReleased.bind(this),
      onProjectileSpawned: this.handleProjectileSpawned.bind(this),
      onProjectilesUpdate: this.handleProjectilesUpdate.bind(this),
      onProjectileDestroyed: this.handleProjectileDestroyed.bind(this),
      onBlockDestroyed: this.handleBlockDestroyed.bind(this),
      onWallHit: this.handleWallHit.bind(this),
      onError: this.handleError.bind(this),
    });

    // Initialize interaction manager
    this.interactionManager = new InteractionManager(this.blockRenderer, this.gameClient);

    // Setup UI handlers
    this.statusDisplay.setupConnectButton((url) => this.connect(url));

    // Check for auto-connect (game session container)
    const autoConnectUrl = this.getAutoConnectUrl();
    if (autoConnectUrl) {
      this.statusDisplay.hideServerConfig();
      this.connect(autoConnectUrl);
    }

    // Start animation loop
    this.animate();
  }

  /**
   * Check if running in a game session container and return auto-connect URL.
   * Returns null if manual connection is needed.
   */
  private getAutoConnectUrl(): string | null {
    const hostname = window.location.hostname;

    // Check if hostname matches game session pattern: {sessionId}-hands-blocks-cannons.dx-tooling.org
    const sessionPattern = /^[a-z0-9]+-hands-blocks-cannons\.dx-tooling\.org$/;
    if (sessionPattern.test(hostname)) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${hostname}/ws`;
    }

    return null;
  }

  /**
   * Connect to a game server.
   */
  connect(url: string): void {
    this.gameClient.connect(url);
  }

  // ============ Network Event Handlers ============

  private handleConnectionStateChange(state: ConnectionState): void {
    this.statusDisplay.updateConnectionStatus(state);

    if (state === 'disconnected') {
      this.cleanup();
      this.statusDisplay.showServerConfig();
    }
  }

  private handleWelcome(data: GameInitData): void {
    this.playerId = data.playerId;
    this.playerNumber = data.playerNumber;
    this.room = data.room;
    this.projectileSize = data.projectileSize;

    // Configure systems
    this.blockRenderer.setPlayer(data.playerId, data.playerNumber);
    this.blockRenderer.setRoom(data.room);
    this.gestureDetector.configure(data.room, data.playerNumber);
    this.effectsManager.setRoom(data.room);
    this.effectsManager.setWallGridConfig(data.wallGrid, data.projectileSize);

    // Setup room and camera
    this.roomRenderer.createRoomWireframe(data.room);
    this.sceneManager.setupCameraForPlayer(data.playerNumber, data.room, data.cameraDistance);

    // Create initial blocks
    for (const blockData of data.blocks) {
      this.blockRenderer.createBlock(blockData);
    }

    // Create initial projectiles
    for (const projData of data.projectiles) {
      this.blockRenderer.createProjectile(projData, this.projectileSize);
    }

    // Update UI
    this.statusDisplay.hideServerConfig();
    this.statusDisplay.updatePlayerInfo(data.playerId, data.playerNumber);

    // Start hand tracking
    this.initHandTracking();
  }

  private handleOpponentJoined(blocks: Block[]): void {
    this.opponentConnected = true;
    this.statusDisplay.updateConnectionStatus('connected', 'Opponent joined!');

    // Add opponent's blocks if we don't have them yet (they joined after us)
    for (const block of blocks) {
      if (!this.blockRenderer.getBlock(block.id)) {
        this.blockRenderer.createBlock(block);
      }
    }
  }

  private handleOpponentLeft(): void {
    this.opponentConnected = false;
    this.statusDisplay.updateConnectionStatus('connected', 'Opponent left');

    // Remove opponent's entities
    if (this.playerId) {
      // Remove blocks not owned by me
      for (const blockId of [...this.blockRenderer.blocks.keys()]) {
        const entity = this.blockRenderer.getBlock(blockId);
        if (entity && entity.data.ownerId !== this.playerId) {
          this.blockRenderer.removeBlock(blockId);
        }
      }
      // Remove projectiles not owned by me
      for (const [projId, entity] of this.blockRenderer.projectiles) {
        if (entity.data.ownerId !== this.playerId) {
          this.blockRenderer.removeProjectile(projId);
        }
      }
    }
  }

  private handleBlockGrabbed(_playerId: string, blockId: string): void {
    this.blockRenderer.setBlockGrabbed(blockId, true);
  }

  private handleBlockMoved(_playerId: string, blockId: string, position: Position): void {
    this.blockRenderer.updateBlockPosition(blockId, position);
  }

  private handleBlockReleased(_playerId: string, blockId: string): void {
    this.blockRenderer.setBlockGrabbed(blockId, false);
  }

  private handleProjectileSpawned(projectile: {
    id: string;
    position: Position;
    velocity: Position;
    ownerId: string;
    color: number;
  }): void {
    this.blockRenderer.createProjectile(projectile, this.projectileSize);
  }

  private handleProjectilesUpdate(
    projectiles: Array<{
      id: string;
      position: Position;
      velocity: Position;
      ownerId: string;
      color: number;
    }>
  ): void {
    for (const projData of projectiles) {
      const existing = this.blockRenderer.projectiles.get(projData.id);
      if (existing) {
        this.blockRenderer.updateProjectilePosition(projData.id, projData.position);
      } else {
        this.blockRenderer.createProjectile(projData, this.projectileSize);
      }
    }
  }

  private handleProjectileDestroyed(projectileId: string): void {
    this.blockRenderer.removeProjectile(projectileId);
  }

  private handleBlockDestroyed(blockId: string, position: Position, color: number): void {
    // Create explosion effect
    this.effectsManager.createExplosion(
      new THREE.Vector3(position.x, position.y, position.z),
      color
    );
    // Remove block
    this.blockRenderer.removeBlock(blockId);

    // Log if it was my block
    if (this.blockRenderer.isMyBlock(blockId)) {
      console.log('One of your blocks was destroyed!');
    }
  }

  private handleWallHit(position: Position, wallSide: 'minZ' | 'maxZ'): void {
    this.effectsManager.createWallHitHighlight(position, wallSide);
  }

  private handleError(message: string): void {
    console.error('Server error:', message);
    this.statusDisplay.updateStatus(`Error: ${message}`);
  }

  // ============ Hand Tracking ============

  private async initHandTracking(): Promise<void> {
    try {
      await this.handTracker.initialize((landmarks) => {
        this.currentLandmarks = landmarks;
        this.processHandUpdate(landmarks);
      });

      this.handTracker.start();
      this.statusDisplay.hideFallback();
      this.statusDisplay.updateStatus('Ready - pinch to grab your blocks');
    } catch (err) {
      console.error('Failed to initialize hand tracking:', err);
      this.statusDisplay.showFallback();
      this.statusDisplay.updateStatus('Camera error');
    }
  }

  private processHandUpdate(landmarks: HandLandmarks | null): void {
    if (!landmarks) {
      this.handVisualizer.hide();
      return;
    }

    // Convert landmarks to 3D and update visualization
    const positions3D = this.gestureDetector.landmarksTo3D(landmarks);
    this.handVisualizer.update(positions3D);
  }

  // ============ Animation Loop ============

  private animate = (): void => {
    requestAnimationFrame(this.animate);

    const elapsed = this.sceneManager.getElapsedTime();
    const deltaTime = elapsed - this.lastFrameTime;
    this.lastFrameTime = elapsed;

    // Process interaction
    if (this.playerId && this.currentLandmarks) {
      const pinchPoint = this.gestureDetector.getPinchPoint(this.currentLandmarks);
      const isPinching = this.gestureDetector.isPinching(this.currentLandmarks);
      const status = this.interactionManager.processInteraction(pinchPoint, isPinching);
      this.statusDisplay.updateInteractionStatus(status, this.opponentConnected);
    }

    // Update animations
    const grabbedBlockId = this.interactionManager.getGrabbedBlockId();
    this.blockRenderer.updateAnimations(elapsed, grabbedBlockId);
    this.effectsManager.update(deltaTime);

    // Render
    this.sceneManager.render();
  };

  // ============ Cleanup ============

  private cleanup(): void {
    this.playerId = null;
    this.playerNumber = null;
    this.room = null;
    this.opponentConnected = false;
    this.currentLandmarks = null;

    this.blockRenderer.clear();
    this.interactionManager.clear();
    this.handTracker.stop();
  }
}

// Start the game
new Game();
