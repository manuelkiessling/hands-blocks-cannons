import { describe, expect, it } from 'vitest';
import {
  // Constants
  BLOCK_COLORS,
  BLOCK_FLOAT_AMPLITUDE,
  // Types
  type Block,
  // Protocol
  BlockGrabMessage,
  type BlockId,
  BlockSchema,
  BlocksWelcomeDataSchema,
  type BlockType,
  CANNON_COLOR,
  type GamePhase,
  GamePhaseSchema,
  MAX_GRABBED_BLOCKS,
  PINCH_THRESHOLD,
  type Player,
  type PlayerId,
  type PlayerNumber,
  type Position,
  PositionSchema,
  type Projectile,
  parseClientMessage,
  type RoomBounds,
  type ServerMessage,
  serializeServerMessage,
} from '../src/shared/index.js';

describe('blocks-cannons/shared', () => {
  describe('types', () => {
    it('should export type aliases', () => {
      // Type checks (compile-time)
      const playerId: PlayerId = 'player-1';
      const blockId: BlockId = 'block-1';
      const playerNumber: PlayerNumber = 1;
      const blockType: BlockType = 'cannon';
      const gamePhase: GamePhase = 'playing';

      expect(playerId).toBe('player-1');
      expect(blockId).toBe('block-1');
      expect(playerNumber).toBe(1);
      expect(blockType).toBe('cannon');
      expect(gamePhase).toBe('playing');
    });

    it('should export Position interface', () => {
      const pos: Position = { x: 1, y: 2, z: 3 };
      expect(pos.x).toBe(1);
      expect(pos.y).toBe(2);
      expect(pos.z).toBe(3);
    });

    it('should export Block interface', () => {
      const block: Block = {
        id: 'block-1',
        position: { x: 0, y: 0, z: 0 },
        color: 0xff0000,
        ownerId: 'player-1',
        blockType: 'regular',
      };
      expect(block.id).toBe('block-1');
      expect(block.blockType).toBe('regular');
    });

    it('should export Projectile interface', () => {
      const proj: Projectile = {
        id: 'proj-1',
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 1 },
        ownerId: 'player-1',
        color: 0xffff00,
      };
      expect(proj.velocity.z).toBe(1);
    });

    it('should export Player interface', () => {
      const player: Player = {
        id: 'player-1',
        number: 1,
        grabbedBlockIds: ['block-1'],
        isBot: false,
        isReady: true,
      };
      expect(player.number).toBe(1);
      expect(player.grabbedBlockIds).toHaveLength(1);
    });

    it('should export RoomBounds interface', () => {
      const room: RoomBounds = {
        minX: -7,
        maxX: 7,
        minY: -5,
        maxY: 5,
        minZ: -8,
        maxZ: 32,
      };
      expect(room.maxZ - room.minZ).toBe(40);
    });

    it('should export MAX_GRABBED_BLOCKS constant', () => {
      expect(MAX_GRABBED_BLOCKS).toBe(2);
    });
  });

  describe('constants', () => {
    it('should export block colors array', () => {
      expect(BLOCK_COLORS).toHaveLength(5);
      expect(BLOCK_COLORS[0]).toBe(0x4a9eff); // Bright blue
    });

    it('should export cannon color', () => {
      expect(CANNON_COLOR).toBe(0xff2222);
    });

    it('should export gesture thresholds', () => {
      expect(PINCH_THRESHOLD).toBe(0.07);
    });

    it('should export animation constants', () => {
      expect(BLOCK_FLOAT_AMPLITUDE).toBe(0.15);
    });
  });

  describe('protocol schemas', () => {
    it('should validate Position schema', () => {
      const valid = PositionSchema.safeParse({ x: 1, y: 2, z: 3 });
      expect(valid.success).toBe(true);

      const invalid = PositionSchema.safeParse({ x: 1, y: 2 });
      expect(invalid.success).toBe(false);
    });

    it('should validate Block schema', () => {
      const valid = BlockSchema.safeParse({
        id: 'block-1',
        position: { x: 0, y: 0, z: 0 },
        color: 0xff0000,
        ownerId: 'player-1',
        blockType: 'regular',
      });
      expect(valid.success).toBe(true);
    });

    it('should validate GamePhase schema', () => {
      expect(GamePhaseSchema.safeParse('waiting').success).toBe(true);
      expect(GamePhaseSchema.safeParse('playing').success).toBe(true);
      expect(GamePhaseSchema.safeParse('finished').success).toBe(true);
      expect(GamePhaseSchema.safeParse('invalid').success).toBe(false);
    });
  });

  describe('protocol messages', () => {
    it('should validate BlockGrabMessage', () => {
      const msg = { type: 'block_grab', blockId: 'block-1' };
      const result = BlockGrabMessage.safeParse(msg);
      expect(result.success).toBe(true);
    });

    it('should validate BlocksWelcomeDataSchema (appData for welcome)', () => {
      const msg = {
        blocks: [],
        projectiles: [],
        room: { minX: -7, maxX: 7, minY: -5, maxY: 5, minZ: -8, maxZ: 32 },
        cameraDistance: 20,
        wallGrid: { enabled: true, highlightDuration: 500, highlightIntensity: 0.5 },
        projectileSize: 0.3,
        gamePhase: 'waiting',
      };
      const result = BlocksWelcomeDataSchema.safeParse(msg);
      expect(result.success).toBe(true);
    });
  });

  describe('protocol utilities', () => {
    it('should parse valid client messages', () => {
      const msg = parseClientMessage({ type: 'block_grab', blockId: 'block-1' });
      expect(msg).not.toBeNull();
      expect(msg?.type).toBe('block_grab');
    });

    it('should return null for invalid client messages', () => {
      const msg = parseClientMessage({ type: 'invalid_type' });
      expect(msg).toBeNull();
    });

    it('should serialize server messages', () => {
      const msg: ServerMessage = { type: 'block_grabbed', playerId: 'p1', blockId: 'b1' };
      const json = serializeServerMessage(msg);
      expect(json).toBe('{"type":"block_grabbed","playerId":"p1","blockId":"b1"}');
    });
  });
});
