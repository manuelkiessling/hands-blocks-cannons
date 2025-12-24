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
  GamePhase,
  MultiHandResult,
  Position,
  RoomBounds,
  TrackedHand,
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
  private gamePhase: GamePhase = 'waiting';
  private playerReadySent = false;

  // Current tracked hands for interaction processing (supports multiple hands)
  private currentHands: MultiHandResult = [];

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
      onGameStarted: this.handleGameStarted.bind(this),
      onGameOver: this.handleGameOver.bind(this),
      onPlayAgainStatus: this.handlePlayAgainStatus.bind(this),
      onGameReset: this.handleGameReset.bind(this),
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
    this.gamePhase = data.gamePhase;

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

  private handleGameStarted(): void {
    this.gamePhase = 'playing';
    console.log('Game started!');
    this.statusDisplay.updateStatus('Game started - pinch to grab your blocks');
  }

  private handleGameOver(winnerId: string, winnerNumber: 1 | 2, _reason: string): void {
    this.gamePhase = 'finished';
    const isWinner = winnerId === this.playerId;
    console.log('Game over!', { winnerId, winnerNumber, isWinner, myPlayerId: this.playerId });

    this.statusDisplay.showGameOverOverlay(isWinner, () => {
      console.log('Sending play again vote to server');
      this.gameClient.sendPlayAgainVote();
    });
  }

  private handlePlayAgainStatus(votedPlayerIds: string[], totalPlayers: number): void {
    console.log('Play again status update', {
      votedPlayerIds,
      totalPlayers,
      myPlayerId: this.playerId,
    });
    this.statusDisplay.updatePlayAgainStatus(votedPlayerIds.length, totalPlayers);
  }

  private handleGameReset(blocks: Block[]): void {
    console.log('Game reset received - starting new round', { blockCount: blocks.length });

    // Hide game over overlay
    this.statusDisplay.hideGameOverOverlay();

    // Clear all existing blocks and projectiles
    this.blockRenderer.clear();
    this.interactionManager.clear();

    // Re-set player and room info (clear() resets these)
    if (this.playerId && this.playerNumber && this.room) {
      this.blockRenderer.setPlayer(this.playerId, this.playerNumber);
      this.blockRenderer.setRoom(this.room);
    }

    // Create fresh blocks
    for (const blockData of blocks) {
      this.blockRenderer.createBlock(blockData);
    }

    // Reset game phase to waiting
    this.gamePhase = 'waiting';
    this.playerReadySent = false;

    // Show hand raise overlay again
    this.statusDisplay.showHandRaiseOverlay();
    const webcamVideo = document.getElementById('webcam') as HTMLVideoElement;
    if (webcamVideo) {
      this.statusDisplay.syncOverlayCamera(webcamVideo);
    }
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
      await this.handTracker.initialize((hands) => {
        this.currentHands = hands;
        this.processHandUpdate(hands);
      });

      this.handTracker.start();
      this.statusDisplay.hideFallback();

      // Show hand raise overlay if game is waiting
      if (this.gamePhase === 'waiting') {
        this.statusDisplay.showHandRaiseOverlay();
        // Sync the camera stream to the overlay preview
        const webcamVideo = document.getElementById('webcam') as HTMLVideoElement;
        if (webcamVideo) {
          this.statusDisplay.syncOverlayCamera(webcamVideo);
        }
      } else {
        this.statusDisplay.updateStatus('Ready - pinch to grab your blocks');
      }
    } catch (err) {
      console.error('Failed to initialize hand tracking:', err);
      this.statusDisplay.showFallback();
      this.statusDisplay.updateStatus('Camera error');
    }
  }

  private processHandUpdate(hands: MultiHandResult): void {
    if (hands.length === 0) {
      this.handVisualizer.hide();
      return;
    }

    // Send player_ready on first hand detection
    if (!this.playerReadySent) {
      this.playerReadySent = true;
      this.gameClient.sendPlayerReady();
      console.log('Hand detected - player ready sent');

      // Hide the hand raise overlay with fade animation
      this.statusDisplay.hideHandRaiseOverlay();

      if (this.gamePhase === 'waiting') {
        this.statusDisplay.updateStatus('Waiting for game to start...');
      }
    }

    // Convert each hand's landmarks to 3D and update visualization
    const handsPositions3D = hands.map((hand: TrackedHand) =>
      this.gestureDetector.landmarksTo3D(hand.landmarks)
    );
    this.handVisualizer.update(handsPositions3D);
  }

  // ============ Animation Loop ============

  private animate = (): void => {
    requestAnimationFrame(this.animate);

    const elapsed = this.sceneManager.getElapsedTime();
    const deltaTime = elapsed - this.lastFrameTime;
    this.lastFrameTime = elapsed;

    // Process interaction only when game is playing
    if (this.playerId && this.gamePhase === 'playing') {
      // Track which hands we've seen this frame
      const seenHands = new Set<'Left' | 'Right'>();
      const statuses: string[] = [];

      // Process each detected hand
      for (const hand of this.currentHands) {
        seenHands.add(hand.handedness);
        const pinchPoint = this.gestureDetector.getPinchPoint(hand.landmarks);
        const isPinching = this.gestureDetector.isPinching(hand.landmarks);
        const status = this.interactionManager.processInteraction(
          hand.handedness,
          pinchPoint,
          isPinching
        );
        statuses.push(status);
      }

      // Mark any hands that weren't detected as lost
      const allHands: Array<'Left' | 'Right'> = ['Left', 'Right'];
      for (const handedness of allHands) {
        if (!seenHands.has(handedness)) {
          this.interactionManager.markHandLost(handedness);
        }
      }

      // Show status from the first active hand (or first status if grabbing)
      const activeStatus =
        statuses.find((s) => s === 'Grabbing') ?? statuses[0] ?? 'No hand detected';
      this.statusDisplay.updateInteractionStatus(activeStatus, this.opponentConnected);
    }

    // Update animations - pass all grabbed block IDs
    const grabbedBlockIds = this.interactionManager.getGrabbedBlockIds();
    this.blockRenderer.updateAnimations(elapsed, null, grabbedBlockIds);
    this.effectsManager.update(deltaTime);
    this.sceneManager.update(elapsed);
    this.roomRenderer.update(elapsed);

    // Render
    this.sceneManager.render();
  };

  // ============ Cleanup ============

  private cleanup(): void {
    this.playerId = null;
    this.playerNumber = null;
    this.room = null;
    this.opponentConnected = false;
    this.currentHands = [];
    this.gamePhase = 'waiting';
    this.playerReadySent = false;

    this.blockRenderer.clear();
    this.interactionManager.clear();
    this.handTracker.stop();
  }
}

// Start the game
new Game();
