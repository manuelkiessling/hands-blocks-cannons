import WebSocket from 'ws';
import type { Block, Position } from '../protocol/messages.js';
import { logger } from '../utils/logger.js';

export interface BotConfig {
  /** Time between starting new actions (ms) */
  actionInterval: number;
  /** Position update frequency while dragging (ms) */
  moveSpeed: number;
  /** How long to drag before releasing (ms) */
  moveDuration: number;
  /** Max distance to move from current position */
  moveRange: number;
}

const DEFAULT_CONFIG: BotConfig = {
  actionInterval: 2000,
  moveSpeed: 50,
  moveDuration: 1500,
  moveRange: 3,
};

type BotState = 'idle' | 'grabbing' | 'moving' | 'releasing';

interface RoomBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

interface ServerMessage {
  type: string;
  playerId?: string;
  playerNumber?: 1 | 2;
  blocks?: Block[];
  room?: RoomBounds;
  blockId?: string;
  position?: Position;
  message?: string;
}

export class BotClient {
  private ws: WebSocket | null = null;
  private playerId: string | null = null;
  private playerNumber: 1 | 2 | null = null;
  private room: RoomBounds | null = null;
  private myBlocks: Map<string, Block> = new Map();
  private grabbedBlockId: string | null = null;
  private state: BotState = 'idle';
  private config: BotConfig;

  private actionTimer: ReturnType<typeof setTimeout> | null = null;
  private moveTimer: ReturnType<typeof setInterval> | null = null;
  private moveStartTime = 0;
  private moveStartPos: Position | null = null;
  private moveTargetPos: Position | null = null;

  constructor(config: Partial<BotConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

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
  }

  private onMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'welcome':
        this.playerId = message.playerId ?? null;
        this.playerNumber = message.playerNumber ?? null;
        this.room = message.room ?? null;

        logger.info('Bot joined as player', {
          playerId: this.playerId,
          playerNumber: message.playerNumber,
          room: this.room,
        });

        // Store our blocks
        if (message.blocks) {
          for (const block of message.blocks) {
            if (block.ownerId === this.playerId) {
              this.myBlocks.set(block.id, block);
            }
          }
        }
        logger.info('Bot has blocks', { count: this.myBlocks.size });

        // Start the behavior loop
        this.scheduleNextAction();
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
        // Ignore opponent actions
        break;

      case 'error':
        logger.error('Server error', { message: message.message });
        break;
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
    if (this.state !== 'idle') {
      // Still busy, reschedule
      this.scheduleNextAction();
      return;
    }

    const block = this.pickRandomBlock();
    if (!block) {
      logger.warn('Bot has no blocks to move');
      this.scheduleNextAction();
      return;
    }

    this.startGrab(block);
  }

  private pickRandomBlock(): Block | null {
    const blocks = Array.from(this.myBlocks.values());
    if (blocks.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * blocks.length);
    return blocks[randomIndex] ?? null;
  }

  private generateRandomTarget(currentPos: Position): Position {
    const range = this.config.moveRange;
    const blockHalfSize = 0.5;

    let targetX = currentPos.x + (Math.random() - 0.5) * 2 * range;
    let targetY = currentPos.y + (Math.random() - 0.5) * 2 * range;
    const targetZ = currentPos.z; // Keep z the same

    // Clamp to room bounds if available
    if (this.room) {
      targetX = Math.max(
        this.room.minX + blockHalfSize,
        Math.min(this.room.maxX - blockHalfSize, targetX)
      );
      targetY = Math.max(
        this.room.minY + blockHalfSize,
        Math.min(this.room.maxY - blockHalfSize, targetY)
      );
    }

    return { x: targetX, y: targetY, z: targetZ };
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
    this.moveStartTime = Date.now();
    this.moveStartPos = { ...block.position };
    this.moveTargetPos = this.generateRandomTarget(block.position);

    logger.info('Bot moving block', {
      blockId: block.id,
      from: this.moveStartPos,
      to: this.moveTargetPos,
    });

    // Start interpolation timer
    this.moveTimer = setInterval(() => {
      this.updateMove();
    }, this.config.moveSpeed);
  }

  private updateMove(): void {
    if (!this.grabbedBlockId || !this.moveStartPos || !this.moveTargetPos) {
      return;
    }

    const elapsed = Date.now() - this.moveStartTime;
    const progress = Math.min(1, elapsed / this.config.moveDuration);

    // Ease-in-out interpolation
    const eased = progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;

    const currentPos: Position = {
      x: this.moveStartPos.x + (this.moveTargetPos.x - this.moveStartPos.x) * eased,
      y: this.moveStartPos.y + (this.moveTargetPos.y - this.moveStartPos.y) * eased,
      z: this.moveStartPos.z,
    };

    // Update our local state
    const block = this.myBlocks.get(this.grabbedBlockId);
    if (block) {
      block.position = currentPos;
    }

    // Send position update
    this.send({
      type: 'block_move',
      blockId: this.grabbedBlockId,
      position: currentPos,
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
    this.moveStartPos = null;
    this.moveTargetPos = null;
    this.state = 'idle';

    // Schedule next action
    this.scheduleNextAction();
  }
}
