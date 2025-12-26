/**
 * @fileoverview Bot client that connects to the game server and plays automatically.
 * Uses behavior and movement modules for decision-making and interpolation.
 * Tracks full game state for AI decision-making.
 */

import WebSocket from 'ws';
import type {
  Block,
  GamePhase,
  Position,
  Projectile,
  RoomBounds,
  ServerMessage,
} from '../../shared/index.js';
import { logger } from '../utils/logger.js';
import { type AIDerivedParams, type BotGameState, decideAction, deriveAIParams } from './BotAI.js';
import { type BehaviorConfig, decideNextAction } from './BotBehavior.js';
import {
  calculateMovementPosition,
  createMovementState,
  type MovementConfig,
  type MovementState,
} from './BotMovement.js';

/**
 * Configuration for the bot client.
 */
export interface BotConfig extends BehaviorConfig, MovementConfig {
  /**
   * Enable AI mode for intelligent decision-making.
   * When false, uses legacy random behavior.
   * @default true
   */
  useAI?: boolean;

  /**
   * AI difficulty level (0-1).
   * 0 = easy (slow reactions, poor aim)
   * 1 = impossible (instant reactions, perfect aim)
   * @default 0.5
   */
  difficulty?: number;
}

const DEFAULT_CONFIG: BotConfig = {
  // Behavior config (legacy mode)
  actionInterval: 2000,
  fireChance: 0.3,
  fireCooldown: 2000,
  // Movement config
  moveSpeed: 50,
  moveDuration: 1500,
  moveRange: 3,
  // AI config
  useAI: true,
  difficulty: 0.5,
};

type BotState = 'idle' | 'grabbing' | 'moving' | 'releasing';

/**
 * Automated game client that plays the block game.
 * Tracks full game state including opponent blocks and projectiles for AI decision-making.
 */
export class BotClient {
  private ws: WebSocket | null = null;
  private playerId: string | null = null;
  private playerNumber: 1 | 2 | null = null;
  private room: RoomBounds | null = null;
  private myBlocks: Map<string, Block> = new Map();
  private myCannonId: string | null = null;
  private grabbedBlockId: string | null = null;
  private state: BotState = 'idle';
  private readonly config: BotConfig;

  // Game state tracking for AI
  private opponentBlocks: Map<string, Block> = new Map();
  private opponentCannonId: string | null = null;
  private allProjectiles: Map<string, Projectile> = new Map();

  // AI parameters (derived from difficulty)
  private readonly aiParams: AIDerivedParams;
  private lastAIActionTime = 0;

  // Game phase tracking
  private gamePhase: GamePhase = 'waiting';

  private actionTimer: ReturnType<typeof setTimeout> | null = null;
  private moveTimer: ReturnType<typeof setInterval> | null = null;
  private movementState: MovementState | null = null;
  private lastFireTime = 0;

  constructor(config: Partial<BotConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.aiParams = deriveAIParams({ difficulty: this.config.difficulty ?? 0.5 });

    logger.info('Bot AI configured', {
      useAI: this.config.useAI,
      difficulty: this.config.difficulty,
      aiParams: this.aiParams,
    });
  }

  /**
   * Connect to the game server.
   * @param url - WebSocket URL (e.g., ws://localhost:3001)
   */
  connect(url: string): void {
    logger.info('Bot connecting', { url });

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      logger.info('Bot connected to server');
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as ServerMessage;
        this.onMessage(message);
      } catch {
        logger.error('Failed to parse server message');
      }
    });

    this.ws.on('close', () => {
      logger.info('Bot disconnected');
      this.cleanup();
    });

    this.ws.on('error', (error: Error) => {
      logger.error('Bot WebSocket error', { error: error.message });
    });
  }

  /**
   * Disconnect from the server.
   */
  disconnect(): void {
    this.cleanup();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private cleanup(): void {
    if (this.actionTimer) {
      clearTimeout(this.actionTimer);
      this.actionTimer = null;
    }
    if (this.moveTimer) {
      clearInterval(this.moveTimer);
      this.moveTimer = null;
    }
    this.state = 'idle';
    this.grabbedBlockId = null;
    this.movementState = null;
    this.opponentBlocks.clear();
    this.opponentCannonId = null;
    this.allProjectiles.clear();
    this.gamePhase = 'waiting';
  }

  // ============ State Getters for AI ============

  /** Get all opponent blocks (read-only for AI) */
  getOpponentBlocks(): ReadonlyMap<string, Block> {
    return this.opponentBlocks;
  }

  /** Get opponent cannon ID */
  getOpponentCannonId(): string | null {
    return this.opponentCannonId;
  }

  /** Get all active projectiles (read-only for AI) */
  getAllProjectiles(): ReadonlyMap<string, Projectile> {
    return this.allProjectiles;
  }

  /** Get own blocks (read-only for AI) */
  getMyBlocks(): ReadonlyMap<string, Block> {
    return this.myBlocks;
  }

  /** Get own cannon ID */
  getMyCannonId(): string | null {
    return this.myCannonId;
  }

  /** Get room bounds */
  getRoom(): RoomBounds | null {
    return this.room;
  }

  /** Get player ID */
  getPlayerId(): string | null {
    return this.playerId;
  }

  /** Get player number */
  getPlayerNumber(): 1 | 2 | null {
    return this.playerNumber;
  }

  private onMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'welcome':
        this.handleWelcome(message);
        break;

      case 'opponent_joined':
        this.handleOpponentJoined(message);
        break;

      case 'opponent_left':
        logger.info('Opponent (real player) left');
        this.opponentBlocks.clear();
        this.opponentCannonId = null;
        break;

      case 'block_grabbed':
        this.handleBlockGrabbed(message);
        break;

      case 'block_released':
        // Track opponent release state if needed in the future
        break;

      case 'block_moved':
        this.handleBlockMoved(message);
        break;

      case 'projectile_spawned':
        this.handleProjectileSpawned(message);
        break;

      case 'projectiles_update':
        this.handleProjectilesUpdate(message);
        break;

      case 'projectile_destroyed':
        this.allProjectiles.delete(message.projectileId);
        break;

      case 'block_destroyed':
        this.handleBlockDestroyed(message);
        break;

      case 'wall_hit':
        // Visual effect only, no state tracking needed
        break;

      case 'game_started':
        this.handleGameStarted();
        break;

      case 'game_over':
        this.handleGameOver(message);
        break;

      case 'play_again_status':
        // Bot doesn't need to track voting status, it auto-votes
        break;

      case 'game_reset':
        this.handleGameReset(message);
        break;

      case 'error':
        logger.error('Server error', { message: message.message });
        break;
    }
  }

  private handleGameStarted(): void {
    logger.info('Game started! Bot beginning behavior loop');
    this.gamePhase = 'playing';
    // Now start the behavior loop
    this.scheduleNextAction();
  }

  private handleGameOver(message: Extract<ServerMessage, { type: 'game_over' }>): void {
    const isWinner = message.winnerId === this.playerId;
    logger.info('Game over!', {
      winnerId: message.winnerId,
      winnerNumber: message.winnerNumber,
      isWinner,
    });

    // Stop the behavior loop
    this.gamePhase = 'finished';
    if (this.actionTimer) {
      clearTimeout(this.actionTimer);
      this.actionTimer = null;
    }
    if (this.moveTimer) {
      clearInterval(this.moveTimer);
      this.moveTimer = null;
    }

    // Auto-vote to play again
    logger.info('Bot automatically voting to play again');
    this.send({ type: 'play_again_vote' });
  }

  private handleGameReset(message: Extract<ServerMessage, { type: 'game_reset' }>): void {
    logger.info('Game reset - preparing for new round');

    // Clear current state
    this.myBlocks.clear();
    this.opponentBlocks.clear();
    this.allProjectiles.clear();
    this.myCannonId = null;
    this.opponentCannonId = null;
    this.grabbedBlockId = null;
    this.movementState = null;
    this.state = 'idle';

    // Process fresh blocks
    for (const block of message.blocks) {
      if (block.ownerId === this.playerId) {
        this.myBlocks.set(block.id, block);
        if (block.blockType === 'cannon') {
          this.myCannonId = block.id;
        }
      } else {
        this.opponentBlocks.set(block.id, block);
        if (block.blockType === 'cannon') {
          this.opponentCannonId = block.id;
        }
      }
    }

    // Reset to waiting phase (bot is already ready as a bot)
    this.gamePhase = 'waiting';

    logger.info('Bot ready for new round', {
      myBlocks: this.myBlocks.size,
      myCannonId: this.myCannonId,
      opponentBlocks: this.opponentBlocks.size,
    });
  }

  private handleOpponentJoined(message: Extract<ServerMessage, { type: 'opponent_joined' }>): void {
    logger.info('Opponent joined', { blocks: message.blocks.length });

    // Store opponent's blocks
    for (const block of message.blocks) {
      this.opponentBlocks.set(block.id, block);
      if (block.blockType === 'cannon') {
        this.opponentCannonId = block.id;
      }
    }

    logger.info('Opponent blocks tracked', {
      count: this.opponentBlocks.size,
      cannonId: this.opponentCannonId,
    });
  }

  private handleBlockGrabbed(message: Extract<ServerMessage, { type: 'block_grabbed' }>): void {
    const { playerId, blockId } = message;

    // Only track opponent's blocks
    if (playerId === this.playerId) return;

    // If we don't know about this block yet, create a placeholder
    // We'll get the position from subsequent block_moved messages
    if (!this.opponentBlocks.has(blockId)) {
      const isCannon = blockId.includes('cannon');
      const newBlock: Block = {
        id: blockId,
        position: { x: 0, y: 0, z: 0 }, // Will be updated by block_moved
        color: 0xff0000,
        ownerId: playerId,
        blockType: isCannon ? 'cannon' : 'regular',
      };
      this.opponentBlocks.set(blockId, newBlock);

      if (isCannon) {
        this.opponentCannonId = blockId;
      }

      logger.info('Discovered opponent block from grab', { blockId, isCannon });
    }
  }

  private handleBlockMoved(message: Extract<ServerMessage, { type: 'block_moved' }>): void {
    const { playerId, blockId, position } = message;

    // Update own blocks if it's ours (pushed by collision)
    if (playerId === this.playerId) {
      const block = this.myBlocks.get(blockId);
      if (block) {
        this.myBlocks.set(blockId, { ...block, position });
      }
    } else {
      // Update or create opponent block
      const existingBlock = this.opponentBlocks.get(blockId);
      if (existingBlock) {
        this.opponentBlocks.set(blockId, { ...existingBlock, position });
      } else {
        // Create new block entry - opponent joined after us
        // Infer blockType from blockId (cannon blocks contain "cannon")
        const isCannon = blockId.includes('cannon');
        const newBlock: Block = {
          id: blockId,
          position,
          color: 0xff0000, // Default color (doesn't affect AI)
          ownerId: playerId,
          blockType: isCannon ? 'cannon' : 'regular',
        };
        this.opponentBlocks.set(blockId, newBlock);

        if (isCannon) {
          this.opponentCannonId = blockId;
        }

        logger.info('Discovered opponent block', { blockId, isCannon });
      }
    }
  }

  private handleProjectileSpawned(
    message: Extract<ServerMessage, { type: 'projectile_spawned' }>
  ): void {
    const { projectile } = message;
    this.allProjectiles.set(projectile.id, projectile);
  }

  private handleProjectilesUpdate(
    message: Extract<ServerMessage, { type: 'projectiles_update' }>
  ): void {
    // Replace all projectile data with latest positions
    this.allProjectiles.clear();
    for (const projectile of message.projectiles) {
      this.allProjectiles.set(projectile.id, projectile);
    }
  }

  private handleBlockDestroyed(message: Extract<ServerMessage, { type: 'block_destroyed' }>): void {
    const { blockId } = message;

    // Remove from own blocks
    if (this.myBlocks.has(blockId)) {
      this.myBlocks.delete(blockId);
      if (this.myCannonId === blockId) {
        this.myCannonId = null;
      }
    }

    // Remove from opponent blocks
    if (this.opponentBlocks.has(blockId)) {
      this.opponentBlocks.delete(blockId);
      if (this.opponentCannonId === blockId) {
        this.opponentCannonId = null;
      }
    }
  }

  private handleWelcome(message: Extract<ServerMessage, { type: 'welcome' }>): void {
    this.playerId = message.playerId;
    this.playerNumber = message.playerNumber;
    this.room = message.room;
    this.gamePhase = message.gamePhase;

    logger.info('Bot joined as player', {
      playerId: this.playerId,
      playerNumber: message.playerNumber,
      room: this.room,
      gamePhase: this.gamePhase,
    });

    // Store blocks separated by owner
    for (const block of message.blocks) {
      if (block.ownerId === this.playerId) {
        this.myBlocks.set(block.id, block);
        if (block.blockType === 'cannon') {
          this.myCannonId = block.id;
        }
      } else {
        // Opponent's block
        this.opponentBlocks.set(block.id, block);
        if (block.blockType === 'cannon') {
          this.opponentCannonId = block.id;
        }
      }
    }

    // Store initial projectiles (if any)
    for (const projectile of message.projectiles) {
      this.allProjectiles.set(projectile.id, projectile);
    }

    logger.info('Bot has blocks', {
      count: this.myBlocks.size,
      cannonId: this.myCannonId,
      opponentBlocks: this.opponentBlocks.size,
      opponentCannonId: this.opponentCannonId,
    });

    // Identify as bot to the server
    this.send({ type: 'bot_identify' });
    logger.info('Bot identified itself to server');

    // If game is already playing (reconnect scenario), start behavior
    // Otherwise wait for game_started message
    if (this.gamePhase === 'playing') {
      logger.info('Game already in progress, starting behavior loop');
      this.scheduleNextAction();
    } else {
      logger.info('Waiting for game to start (human player must raise hand)');
    }
  }

  private send(message: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private scheduleNextAction(): void {
    this.actionTimer = setTimeout(() => {
      this.tick();
    }, this.config.actionInterval);
  }

  private tick(): void {
    // Use AI or legacy behavior
    if (this.config.useAI) {
      this.tickAI();
    } else {
      // Legacy mode can't interrupt
      if (this.state !== 'idle') {
        this.scheduleNextAction();
        return;
      }
      this.tickLegacy();
    }
  }

  /**
   * AI-driven tick: uses intelligent decision-making.
   * Can interrupt offensive actions for defensive evasion.
   */
  private tickAI(): void {
    // Check reaction time
    const now = Date.now();
    if (now - this.lastAIActionTime < this.aiParams.reactionTimeMs) {
      this.scheduleNextAction();
      return;
    }

    // Build game state for AI
    if (!this.playerId || !this.room || !this.playerNumber) {
      this.scheduleNextAction();
      return;
    }

    const gameState: BotGameState = {
      myBlocks: this.myBlocks,
      myCannonId: this.myCannonId,
      opponentBlocks: this.opponentBlocks,
      opponentCannonId: this.opponentCannonId,
      projectiles: this.allProjectiles,
      room: this.room,
      playerNumber: this.playerNumber,
    };

    // Get AI decision
    const decision = decideAction(gameState, this.aiParams, this.playerId);

    logger.debug('AI decision', {
      action: decision.action.type,
      reason: decision.reason,
      myBlocks: this.myBlocks.size,
      myCannonId: this.myCannonId,
      opponentBlocks: this.opponentBlocks.size,
      projectiles: this.allProjectiles.size,
      state: this.state,
    });

    // If currently busy with non-defensive action, check if we need to interrupt for defense
    if (this.state !== 'idle') {
      // Only interrupt for defensive evasion of a DIFFERENT block than we're moving
      if (decision.action.type === 'evade' && decision.action.blockId !== this.grabbedBlockId) {
        logger.info('Interrupting for defensive evasion', {
          currentBlock: this.grabbedBlockId,
          threatBlock: decision.action.blockId,
        });
        this.interruptCurrentAction();
        // Fall through to execute the evasion
      } else {
        // Not a defensive interrupt, stay busy
        this.scheduleNextAction();
        return;
      }
    }

    // Execute the action
    switch (decision.action.type) {
      case 'evade': {
        const block = this.myBlocks.get(decision.action.blockId);
        if (block) {
          this.startMoveToPosition(block, decision.action.targetPosition);
        } else {
          this.scheduleNextAction();
        }
        break;
      }

      case 'fire_cannon':
        this.fireCannon();
        this.lastAIActionTime = now;
        this.scheduleNextAction();
        break;

      case 'idle':
        this.scheduleNextAction();
        break;
    }
  }

  /**
   * Interrupt the current action to handle a more urgent task.
   */
  private interruptCurrentAction(): void {
    // Stop any ongoing movement
    if (this.moveTimer) {
      clearInterval(this.moveTimer);
      this.moveTimer = null;
    }

    // Release currently grabbed block if any
    if (this.grabbedBlockId) {
      this.send({ type: 'block_release', blockId: this.grabbedBlockId });
      this.grabbedBlockId = null;
    }

    this.movementState = null;
    this.state = 'idle';
  }

  /**
   * Legacy tick: uses random behavior.
   */
  private tickLegacy(): void {
    // Use behavior module to decide next action
    const action = decideNextAction(this.myBlocks, this.myCannonId, this.config, this.lastFireTime);

    switch (action.type) {
      case 'fire_cannon':
        this.fireCannon();
        this.scheduleNextAction();
        break;

      case 'move_block':
        this.startGrab(action.block);
        break;

      case 'idle':
        logger.warn('Bot has no blocks to move');
        this.scheduleNextAction();
        break;
    }
  }

  private fireCannon(): void {
    if (!this.myCannonId) return;

    logger.info('Bot firing cannon!', { cannonId: this.myCannonId });
    this.send({ type: 'cannon_fire', cannonId: this.myCannonId });
    this.lastFireTime = Date.now();
  }

  private startGrab(block: Block): void {
    this.state = 'grabbing';
    this.grabbedBlockId = block.id;

    logger.info('Bot grabbing block', { blockId: block.id });
    this.send({ type: 'block_grab', blockId: block.id });

    // Start moving immediately (legacy random movement)
    this.startMoveRandom(block);
  }

  /**
   * Start moving a block to a specific target position (AI mode).
   */
  private startMoveToPosition(block: Block, targetPos: Position): void {
    this.state = 'grabbing';
    this.grabbedBlockId = block.id;

    logger.info('Bot AI grabbing block', { blockId: block.id });
    this.send({ type: 'block_grab', blockId: block.id });

    // Start moving to target
    this.state = 'moving';
    this.movementState = createMovementState(block.position, targetPos, this.config.moveDuration);

    logger.info('Bot AI moving block', {
      blockId: block.id,
      from: block.position,
      to: targetPos,
    });

    // Start interpolation timer
    this.moveTimer = setInterval(() => {
      this.updateMove();
    }, this.config.moveSpeed);
  }

  /**
   * Start moving a block to a random position (legacy mode).
   */
  private startMoveRandom(block: Block): void {
    this.state = 'moving';

    // Generate target using movement module
    const targetPos = {
      x: block.position.x + (Math.random() - 0.5) * 2 * this.config.moveRange,
      y: block.position.y + (Math.random() - 0.5) * 2 * this.config.moveRange,
      z: block.position.z,
    };

    // Clamp to room bounds if available
    if (this.room) {
      const blockHalfSize = 0.5;
      targetPos.x = Math.max(
        this.room.minX + blockHalfSize,
        Math.min(this.room.maxX - blockHalfSize, targetPos.x)
      );
      targetPos.y = Math.max(
        this.room.minY + blockHalfSize,
        Math.min(this.room.maxY - blockHalfSize, targetPos.y)
      );
    }

    // Create movement state
    this.movementState = createMovementState(block.position, targetPos, this.config.moveDuration);

    logger.info('Bot moving block', {
      blockId: block.id,
      from: block.position,
      to: targetPos,
    });

    // Start interpolation timer
    this.moveTimer = setInterval(() => {
      this.updateMove();
    }, this.config.moveSpeed);
  }

  private updateMove(): void {
    if (!this.grabbedBlockId || !this.movementState) {
      return;
    }

    // Calculate position using movement module
    const { position, progress } = calculateMovementPosition(this.movementState);

    // Update our local state
    const block = this.myBlocks.get(this.grabbedBlockId);
    if (block) {
      this.myBlocks.set(this.grabbedBlockId, { ...block, position });
    }

    // Send position update
    this.send({
      type: 'block_move',
      blockId: this.grabbedBlockId,
      position,
    });

    // Check if done
    if (progress >= 1) {
      this.finishMove();
    }
  }

  private finishMove(): void {
    if (this.moveTimer) {
      clearInterval(this.moveTimer);
      this.moveTimer = null;
    }

    this.state = 'releasing';

    if (this.grabbedBlockId) {
      logger.info('Bot releasing block', { blockId: this.grabbedBlockId });
      this.send({ type: 'block_release', blockId: this.grabbedBlockId });
    }

    this.grabbedBlockId = null;
    this.movementState = null;
    this.state = 'idle';

    // Schedule next action
    this.scheduleNextAction();
  }
}
