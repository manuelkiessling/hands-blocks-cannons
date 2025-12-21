import { describe, expect, it } from 'vitest';
import {
  createProjectile,
  fireCannon,
  fireCannonAuto,
  getFireDirection,
  isCannonReady,
  setCannonCooldown,
} from '../src/game/CannonSystem.js';
import type { Block, Player } from '../src/game/types.js';

describe('CannonSystem', () => {
  const createCannon = (overrides: Partial<Block> = {}): Block => ({
    id: 'cannon-1',
    position: { x: 0, y: 0, z: 10 },
    color: 0xff0000,
    ownerId: 'player-1',
    blockType: 'cannon',
    ...overrides,
  });

  const createPlayer = (overrides: Partial<Player> = {}): Player => ({
    id: 'player-1',
    number: 1,
    grabbedBlockId: null,
    ...overrides,
  });

  describe('isCannonReady', () => {
    it('should return true when no cooldown set', () => {
      const cooldowns = new Map<string, number>();
      expect(isCannonReady('cannon-1', cooldowns)).toBe(true);
    });

    it('should return false when on cooldown', () => {
      const now = Date.now();
      const cooldowns = new Map([['cannon-1', now + 5000]]);
      expect(isCannonReady('cannon-1', cooldowns, now)).toBe(false);
    });

    it('should return true when cooldown expired', () => {
      const now = Date.now();
      const cooldowns = new Map([['cannon-1', now - 1000]]);
      expect(isCannonReady('cannon-1', cooldowns, now)).toBe(true);
    });
  });

  describe('getFireDirection', () => {
    it('should return -1 for player 1', () => {
      expect(getFireDirection(1)).toBe(-1);
    });

    it('should return 1 for player 2', () => {
      expect(getFireDirection(2)).toBe(1);
    });
  });

  describe('createProjectile', () => {
    it('should create projectile at cannon position with offset', () => {
      const cannon = createCannon({ position: { x: 5, y: 3, z: 10 } });
      const projectile = createProjectile(cannon, 1, 'proj-1');

      expect(projectile.id).toBe('proj-1');
      expect(projectile.position.x).toBe(5);
      expect(projectile.position.y).toBe(3);
      expect(projectile.position.z).toBeLessThan(10); // Offset in -Z for player 1
      expect(projectile.velocity.z).toBeLessThan(0);
      expect(projectile.ownerId).toBe(cannon.ownerId);
    });

    it('should fire towards +Z for player 2', () => {
      const cannon = createCannon({ ownerId: 'player-2' });
      const projectile = createProjectile(cannon, 2, 'proj-1');

      expect(projectile.velocity.z).toBeGreaterThan(0);
    });
  });

  describe('setCannonCooldown', () => {
    it('should set cooldown for cannon', () => {
      const cooldowns = new Map<string, number>();
      const now = 1000;
      const newCooldowns = setCannonCooldown('cannon-1', cooldowns, now);

      const readyAt = newCooldowns.get('cannon-1');
      expect(readyAt).toBeGreaterThan(now);
    });

    it('should not mutate original map', () => {
      const cooldowns = new Map<string, number>();
      setCannonCooldown('cannon-1', cooldowns);

      expect(cooldowns.has('cannon-1')).toBe(false);
    });
  });

  describe('fireCannon', () => {
    it('should fire cannon when all conditions met', () => {
      const players = new Map([['player-1', createPlayer()]]);
      const blocks = new Map([['cannon-1', createCannon()]]);
      const cooldowns = new Map<string, number>();

      const result = fireCannon('player-1', 'cannon-1', players, blocks, cooldowns, 1);

      expect(result.projectile).not.toBeNull();
      expect(result.projectile?.id).toBe('projectile-1');
      expect(result.nextProjectileId).toBe(2);
    });

    it('should fail when player does not own cannon', () => {
      const players = new Map([
        ['player-1', createPlayer()],
        ['player-2', createPlayer({ id: 'player-2', number: 2 })],
      ]);
      const blocks = new Map([['cannon-1', createCannon({ ownerId: 'player-2' })]]);
      const cooldowns = new Map<string, number>();

      const result = fireCannon('player-1', 'cannon-1', players, blocks, cooldowns, 1);

      expect(result.projectile).toBeNull();
    });

    it('should fail when cannon is on cooldown', () => {
      const players = new Map([['player-1', createPlayer()]]);
      const blocks = new Map([['cannon-1', createCannon()]]);
      const now = Date.now();
      const cooldowns = new Map([['cannon-1', now + 10000]]);

      const result = fireCannon('player-1', 'cannon-1', players, blocks, cooldowns, 1);

      expect(result.projectile).toBeNull();
    });

    it('should fail when block is not a cannon', () => {
      const players = new Map([['player-1', createPlayer()]]);
      const blocks = new Map([
        ['block-1', { ...createCannon(), id: 'block-1', blockType: 'regular' as const }],
      ]);
      const cooldowns = new Map<string, number>();

      const result = fireCannon('player-1', 'block-1', players, blocks, cooldowns, 1);

      expect(result.projectile).toBeNull();
    });
  });

  describe('fireCannonAuto', () => {
    it('should fire cannon automatically', () => {
      const players = new Map([['player-1', createPlayer()]]);
      const blocks = new Map([['cannon-1', createCannon()]]);
      const cooldowns = new Map<string, number>();

      const result = fireCannonAuto('cannon-1', blocks, players, cooldowns, 1);

      expect(result.projectile).not.toBeNull();
    });

    it('should respect cooldown', () => {
      const players = new Map([['player-1', createPlayer()]]);
      const blocks = new Map([['cannon-1', createCannon()]]);
      const now = Date.now();
      const cooldowns = new Map([['cannon-1', now + 10000]]);

      const result = fireCannonAuto('cannon-1', blocks, players, cooldowns, 1);

      expect(result.projectile).toBeNull();
    });
  });
});
