import { describe, expect, it } from 'vitest';
import {
  blocksCollide,
  calculatePushVector,
  findProjectileBlockCollision,
  projectileHitsBlock,
  resolveBlockCollisions,
} from '../../src/server/game/CollisionSystem.js';
import type { Block, Position } from '../../src/server/game/types.js';
import { BLOCK_HALF_SIZE } from '../../src/server/game/types.js';

describe('CollisionSystem', () => {
  describe('blocksCollide', () => {
    it('should detect overlapping blocks', () => {
      const posA: Position = { x: 0, y: 0, z: 0 };
      const posB: Position = { x: 0.5, y: 0.5, z: 0.5 };

      expect(blocksCollide(posA, posB)).toBe(true);
    });

    it('should not detect non-overlapping blocks', () => {
      const posA: Position = { x: 0, y: 0, z: 0 };
      const posB: Position = { x: 2, y: 2, z: 2 };

      expect(blocksCollide(posA, posB)).toBe(false);
    });

    it('should detect edge-touching blocks as colliding', () => {
      const posA: Position = { x: 0, y: 0, z: 0 };
      const posB: Position = { x: 0.99, y: 0, z: 0 }; // Just inside collision distance

      expect(blocksCollide(posA, posB)).toBe(true);
    });
  });

  describe('projectileHitsBlock', () => {
    it('should detect projectile hitting block center', () => {
      const projPos: Position = { x: 0, y: 0, z: 0 };
      const blockPos: Position = { x: 0, y: 0, z: 0 };

      expect(projectileHitsBlock(projPos, blockPos)).toBe(true);
    });

    it('should detect projectile hitting block edge', () => {
      const projPos: Position = { x: 0.6, y: 0, z: 0 }; // Just outside block but projectile radius touches
      const blockPos: Position = { x: 0, y: 0, z: 0 };

      expect(projectileHitsBlock(projPos, blockPos)).toBe(true);
    });

    it('should not detect miss', () => {
      const projPos: Position = { x: 2, y: 2, z: 2 };
      const blockPos: Position = { x: 0, y: 0, z: 0 };

      expect(projectileHitsBlock(projPos, blockPos)).toBe(false);
    });
  });

  describe('calculatePushVector', () => {
    it('should push along X axis when X overlap is smallest', () => {
      const movedPos: Position = { x: 0, y: 0, z: 0 };
      const otherPos: Position = { x: 0.8, y: 0.5, z: 0.5 };

      const push = calculatePushVector(movedPos, otherPos);

      expect(push.x).toBeGreaterThan(0);
      expect(push.y).toBe(0);
      expect(push.z).toBe(0);
    });

    it('should push in negative direction when needed', () => {
      const movedPos: Position = { x: 0, y: 0, z: 0 };
      const otherPos: Position = { x: -0.8, y: 0.5, z: 0.5 };

      const push = calculatePushVector(movedPos, otherPos);

      expect(push.x).toBeLessThan(0);
    });
  });

  describe('resolveBlockCollisions', () => {
    it('should push colliding blocks apart', () => {
      const block1: Block = {
        id: 'block-1',
        position: { x: 0, y: 0, z: 0 },
        color: 0xff0000,
        ownerId: 'player-1',
        blockType: 'regular',
      };

      const block2: Block = {
        id: 'block-2',
        position: { x: 0.5, y: 0, z: 0 },
        color: 0x00ff00,
        ownerId: 'player-1',
        blockType: 'regular',
      };

      const blocks = new Map<string, Block>();
      blocks.set(block1.id, block1);
      blocks.set(block2.id, block2);

      const room = { minX: -10, maxX: 10, minY: -10, maxY: 10, minZ: -10, maxZ: 10 };

      resolveBlockCollisions(blocks, block1.id, block1.position, room);

      const updated2 = blocks.get('block-2');
      expect(updated2?.position.x).toBeGreaterThan(0.5);
    });

    it('should stop mover when pushing a block pinned to the wall', () => {
      const room = { minX: -1, maxX: 1, minY: -1, maxY: 1, minZ: -1, maxZ: 1 };

      const pinned: Block = {
        id: 'pinned',
        position: { x: room.minX + BLOCK_HALF_SIZE, y: 0, z: 0 },
        color: 0x00ff00,
        ownerId: 'player-1',
        blockType: 'regular',
      };

      const mover: Block = {
        id: 'mover',
        position: { x: pinned.position.x + 0.1, y: 0, z: 0 },
        color: 0xff0000,
        ownerId: 'player-1',
        blockType: 'regular',
      };

      const blocks = new Map<string, Block>([
        [pinned.id, pinned],
        [mover.id, mover],
      ]);

      resolveBlockCollisions(blocks, mover.id, mover.position, room);

      const resolvedPinned = blocks.get('pinned');
      const resolvedMover = blocks.get('mover');

      expect(resolvedPinned).toBeDefined();
      expect(resolvedMover).toBeDefined();
      if (!resolvedPinned || !resolvedMover) return;

      expect(resolvedPinned.position.x).toBeCloseTo(room.minX + BLOCK_HALF_SIZE);
      expect(resolvedMover.position.x).toBeCloseTo(resolvedPinned.position.x + BLOCK_HALF_SIZE * 2);
      expect(blocksCollide(resolvedPinned.position, resolvedMover.position)).toBe(false);
    });

    it('should allow push chains when there is space near the wall', () => {
      const room = { minX: -5, maxX: 5, minY: -1, maxY: 1, minZ: -1, maxZ: 1 };

      const blockC: Block = {
        id: 'block-c',
        position: { x: -3.5, y: 0, z: 0 },
        color: 0x0000ff,
        ownerId: 'player-1',
        blockType: 'regular',
      };

      const blockB: Block = {
        id: 'block-b',
        position: { x: -2.4, y: 0, z: 0 },
        color: 0x00ff00,
        ownerId: 'player-1',
        blockType: 'regular',
      };

      const mover: Block = {
        id: 'mover',
        position: { x: -1.7, y: 0, z: 0 },
        color: 0xff0000,
        ownerId: 'player-1',
        blockType: 'regular',
      };

      const blocks = new Map<string, Block>([
        [blockC.id, blockC],
        [blockB.id, blockB],
        [mover.id, mover],
      ]);

      resolveBlockCollisions(blocks, mover.id, mover.position, room);

      const resolvedC = blocks.get('block-c');
      const resolvedB = blocks.get('block-b');
      const resolvedMover = blocks.get('mover');

      expect(resolvedC).toBeDefined();
      expect(resolvedB).toBeDefined();
      expect(resolvedMover).toBeDefined();
      if (!resolvedC || !resolvedB || !resolvedMover) return;

      expect(blocksCollide(resolvedMover.position, resolvedB.position)).toBe(false);
      expect(blocksCollide(resolvedB.position, resolvedC.position)).toBe(false);

      // Ensure pushes propagated left while staying inside room
      expect(resolvedB.position.x).toBeLessThan(blockB.position.x);
      expect(resolvedC.position.x).toBeLessThan(blockC.position.x);
      expect(resolvedC.position.x).toBeGreaterThanOrEqual(room.minX + BLOCK_HALF_SIZE);
      expect(resolvedMover.position.x).toBeCloseTo(mover.position.x);
    });
  });

  describe('findProjectileBlockCollision', () => {
    it('should find collision with opponent block', () => {
      const blocks = new Map<string, Block>();
      blocks.set('enemy-block', {
        id: 'enemy-block',
        position: { x: 0, y: 0, z: 0 },
        color: 0xff0000,
        ownerId: 'player-2',
        blockType: 'regular',
      });

      const hit = findProjectileBlockCollision({ x: 0, y: 0, z: 0 }, 'player-1', blocks);

      expect(hit).not.toBeNull();
      expect(hit?.id).toBe('enemy-block');
    });

    it('should not hit own blocks', () => {
      const blocks = new Map<string, Block>();
      blocks.set('own-block', {
        id: 'own-block',
        position: { x: 0, y: 0, z: 0 },
        color: 0xff0000,
        ownerId: 'player-1',
        blockType: 'regular',
      });

      const hit = findProjectileBlockCollision({ x: 0, y: 0, z: 0 }, 'player-1', blocks);

      expect(hit).toBeNull();
    });

    it('should skip excluded blocks', () => {
      const blocks = new Map<string, Block>();
      blocks.set('enemy-block', {
        id: 'enemy-block',
        position: { x: 0, y: 0, z: 0 },
        color: 0xff0000,
        ownerId: 'player-2',
        blockType: 'regular',
      });

      const hit = findProjectileBlockCollision(
        { x: 0, y: 0, z: 0 },
        'player-1',
        blocks,
        new Set(['enemy-block'])
      );

      expect(hit).toBeNull();
    });
  });
});
