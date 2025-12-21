import { describe, expect, it } from 'vitest';
import {
  checkWallCollision,
  moveProjectile,
  updateProjectiles,
} from '../src/game/ProjectileSystem.js';
import type { Block, Projectile, RoomBounds } from '../src/game/types.js';

describe('ProjectileSystem', () => {
  const createProjectile = (overrides: Partial<Projectile> = {}): Projectile => ({
    id: 'projectile-1',
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: -10 },
    ownerId: 'player-1',
    color: 0xffff00,
    ...overrides,
  });

  const testRoom: RoomBounds = {
    minX: -10,
    maxX: 10,
    minY: -10,
    maxY: 10,
    minZ: -20,
    maxZ: 20,
  };

  describe('moveProjectile', () => {
    it('should move projectile by velocity * deltaTime', () => {
      const projectile = createProjectile({
        position: { x: 0, y: 0, z: 10 },
        velocity: { x: 1, y: 2, z: -10 },
      });

      const moved = moveProjectile(projectile, 0.1);

      expect(moved.position.x).toBeCloseTo(0.1);
      expect(moved.position.y).toBeCloseTo(0.2);
      expect(moved.position.z).toBeCloseTo(9);
    });

    it('should not mutate original projectile', () => {
      const projectile = createProjectile();
      const originalZ = projectile.position.z;

      moveProjectile(projectile, 1);

      expect(projectile.position.z).toBe(originalZ);
    });
  });

  describe('checkWallCollision', () => {
    it('should return minZ when past minimum Z', () => {
      const result = checkWallCollision({ x: 0, y: 0, z: -25 }, testRoom);
      expect(result).toBe('minZ');
    });

    it('should return maxZ when past maximum Z', () => {
      const result = checkWallCollision({ x: 0, y: 0, z: 25 }, testRoom);
      expect(result).toBe('maxZ');
    });

    it('should return null when inside room', () => {
      const result = checkWallCollision({ x: 0, y: 0, z: 0 }, testRoom);
      expect(result).toBeNull();
    });
  });

  describe('updateProjectiles', () => {
    it('should move projectiles over time', () => {
      const projectile = createProjectile({
        position: { x: 0, y: 0, z: 10 },
        velocity: { x: 0, y: 0, z: -10 },
      });

      const projectiles = new Map([['projectile-1', projectile]]);
      const blocks = new Map<string, Block>();

      const result = updateProjectiles(projectiles, blocks, testRoom, 0.5);

      const updated = result.projectiles.get('projectile-1');
      expect(updated?.position.z).toBeCloseTo(5);
    });

    it('should destroy projectiles that hit walls', () => {
      const projectile = createProjectile({
        position: { x: 0, y: 0, z: -19 },
        velocity: { x: 0, y: 0, z: -10 },
      });

      const projectiles = new Map([['projectile-1', projectile]]);
      const blocks = new Map<string, Block>();

      const result = updateProjectiles(projectiles, blocks, testRoom, 1);

      expect(result.projectiles.size).toBe(0);
      expect(result.destroyedProjectileIds).toContain('projectile-1');
      expect(result.wallHits.length).toBe(1);
      expect(result.wallHits[0]?.wallSide).toBe('minZ');
    });

    it('should destroy blocks hit by projectiles', () => {
      const projectile = createProjectile({
        position: { x: 0, y: 0, z: 1 },
        velocity: { x: 0, y: 0, z: -10 },
        ownerId: 'player-1',
      });

      const enemyBlock: Block = {
        id: 'enemy-block',
        position: { x: 0, y: 0, z: 0 },
        color: 0xff0000,
        ownerId: 'player-2',
        blockType: 'regular',
      };

      const projectiles = new Map([['projectile-1', projectile]]);
      const blocks = new Map([['enemy-block', enemyBlock]]);

      const result = updateProjectiles(projectiles, blocks, testRoom, 0.1);

      expect(result.destroyedProjectileIds).toContain('projectile-1');
      expect(result.destroyedBlocks.length).toBe(1);
      expect(result.destroyedBlocks[0]?.blockId).toBe('enemy-block');
      expect(result.blocks.has('enemy-block')).toBe(false);
    });

    it('should not destroy own blocks', () => {
      const projectile = createProjectile({
        position: { x: 0, y: 0, z: 1 },
        velocity: { x: 0, y: 0, z: -10 },
        ownerId: 'player-1',
      });

      const ownBlock: Block = {
        id: 'own-block',
        position: { x: 0, y: 0, z: 0 },
        color: 0xff0000,
        ownerId: 'player-1',
        blockType: 'regular',
      };

      const projectiles = new Map([['projectile-1', projectile]]);
      const blocks = new Map([['own-block', ownBlock]]);

      const result = updateProjectiles(projectiles, blocks, testRoom, 0.1);

      expect(result.destroyedBlocks.length).toBe(0);
      expect(result.blocks.has('own-block')).toBe(true);
    });
  });
});
