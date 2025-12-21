/**
 * @fileoverview Bot client that connects to the game server and plays automatically.
 * Uses behavior and movement modules for decision-making and interpolation.
 */

import type { Block, RoomBounds, ServerMessage } from '@block-game/shared';
import WebSocket from 'ws';
import { logger } from '../utils/logger.js';
import { type BehaviorConfig, decideNextAction } from './BotBehavior.js';
import {
  type MovementConfig,
  type MovementState,
  calculateMovementPosition,
  createMovementState,
  generateRandomTarget,
} from './BotMovement.js';

/**
 * Configuration for the bot client.
 */
export interface BotConfig extends BehaviorConfig, MovementConfig {}

const DEFAULT_CONFIG: BotConfig = {
  // Behavior config
  actionInterval: 2000,
  fireChance: 0.3,
  fireCooldown: 2000,
  // Movement config
  moveSpeed: 50,
  moveDuration: 1500,
  moveRange: 3,
};

type BotState = 'idle' | 'grabbing' | 'moving' | 'releasing';

/**
 * Automated game client that plays the block game.
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

  private actionTimer: ReturnType<typeof setTimeout> | null = null;
  private moveTimer: ReturnType<typeof setInterval> | null = null;
  private movementState: MovementState | null = null;
  private lastFireTime = 0;

  constructor(config: Partial<BotConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
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
  }

  private onMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'welcome':
        this.handleWelcome(message);
        break;

      case 'opponent_joined':
        logger.info('Opponent (real player) joined');
        break;

      case 'opponent_left':
        logger.info('Opponent (real player) left');
        break;

      case 'block_grabbed':
      case 'block_moved':
      case 'block_released':
      case 'projectile_spawned':
      case 'projectiles_update':
      case 'projectile_destroyed':
      case 'block_destroyed':
      case 'wall_hit':
        // Ignore opponent/game actions
        break;

      case 'error':
        logger.error('Server error', { message: message.message });
        break;
    }
  }

  private handleWelcome(message: Extract<ServerMessage, { type: 'welcome' }>): void {
    this.playerId = message.playerId;
    this.playerNumber = message.playerNumber;
    this.room = message.room;

    logger.info('Bot joined as player', {
      playerId: this.playerId,
      playerNumber: message.playerNumber,
      room: this.room,
    });

    // Store our blocks and find cannon
    for (const block of message.blocks) {
      if (block.ownerId === this.playerId) {
        this.myBlocks.set(block.id, block);
        if (block.blockType === 'cannon') {
          this.myCannonId = block.id;
        }
      }
    }

    logger.info('Bot has blocks', {
      count: this.myBlocks.size,
      cannonId: this.myCannonId,
    });

    // Start the behavior loop
    this.scheduleNextAction();
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
    if (this.state !== 'idle') {
      // Still busy, reschedule
      this.scheduleNextAction();
      return;
    }

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

    // Start moving immediately
    this.startMove(block);
  }

  private startMove(block: Block): void {
    this.state = 'moving';

    // Generate target using movement module
    const targetPos = generateRandomTarget(
      block.position,
      this.config.moveRange,
      this.room ?? undefined
    );

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
