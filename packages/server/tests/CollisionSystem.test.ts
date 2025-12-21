import { describe, expect, it } from 'vitest';
import {
  blocksCollide,
  calculatePushVector,
  findProjectileBlockCollision,
  projectileHitsBlock,
  resolveBlockCollisions,
} from '../src/game/CollisionSystem.js';
import type { Block, Position } from '../src/game/types.js';

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
