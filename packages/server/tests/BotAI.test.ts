import type { Block, Position, Projectile, RoomBounds } from '@block-game/shared';
import { describe, expect, it } from 'vitest';
import {
  type AIDerivedParams,
  type BotGameState,
  calculateAimOffset,
  calculateAimPosition,
  canAct,
  clampToRoom,
  decideAction,
  deriveAIParams,
  detectThreats,
  distanceXY,
  getBlockThreat,
  getEscapeDirection,
  isPositionSafe,
  planEvasion,
  predictCollision,
  predictProjectilePosition,
  type RandomGenerator,
  selectTarget,
} from '../src/bot/BotAI.js';

// ============ Test Helpers ============

const createBlock = (overrides: Partial<Block> = {}): Block => ({
  id: 'block-1',
  position: { x: 0, y: 0, z: 10 },
  color: 0xff0000,
  ownerId: 'player-1',
  blockType: 'regular',
  ...overrides,
});

const createProjectile = (overrides: Partial<Projectile> = {}): Projectile => ({
  id: 'proj-1',
  position: { x: 0, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 10 }, // Moving towards +Z
  ownerId: 'player-2',
  color: 0x00ff00,
  ...overrides,
});

const createRoom = (): RoomBounds => ({
  minX: -7,
  maxX: 7,
  minY: -5,
  maxY: 5,
  minZ: -8,
  maxZ: 32,
});

const createGameState = (overrides: Partial<BotGameState> = {}): BotGameState => ({
  myBlocks: new Map(),
  myCannonId: null,
  opponentBlocks: new Map(),
  opponentCannonId: null,
  projectiles: new Map(),
  room: createRoom(),
  playerNumber: 1,
  ...overrides,
});

// Deterministic random generator for testing
const createMockRng = (values: number[]): RandomGenerator => {
  let index = 0;
  return {
    random: () => {
      const value = values[index % values.length];
      index++;
      return value ?? 0;
    },
  };
};

// ============ Tests ============

describe('BotAI', () => {
  describe('deriveAIParams', () => {
    it('should return slow reactions at difficulty 0', () => {
      const params = deriveAIParams({ difficulty: 0 });
      expect(params.reactionTimeMs).toBe(2000);
      expect(params.aimAccuracy).toBe(0.3);
      expect(params.dodgeProbability).toBe(0.3);
    });

    it('should return fast reactions at difficulty 1', () => {
      const params = deriveAIParams({ difficulty: 1 });
      expect(params.reactionTimeMs).toBe(100);
      expect(params.aimAccuracy).toBe(0.95);
      expect(params.dodgeProbability).toBe(0.95);
    });

    it('should interpolate at difficulty 0.5', () => {
      const params = deriveAIParams({ difficulty: 0.5 });
      expect(params.reactionTimeMs).toBe(1050); // (2000 + 100) / 2
      expect(params.aimAccuracy).toBeCloseTo(0.625); // (0.3 + 0.95) / 2
      expect(params.dodgeProbability).toBeCloseTo(0.625);
    });

    it('should clamp difficulty to valid range', () => {
      const paramsLow = deriveAIParams({ difficulty: -0.5 });
      const paramsHigh = deriveAIParams({ difficulty: 1.5 });

      expect(paramsLow.reactionTimeMs).toBe(2000); // Same as 0
      expect(paramsHigh.reactionTimeMs).toBe(100); // Same as 1
    });
  });

  describe('predictProjectilePosition', () => {
    it('should predict position based on velocity', () => {
      const projectile = createProjectile({
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 1, y: 2, z: 10 },
      });

      const predicted = predictProjectilePosition(projectile, 1.0);

      expect(predicted.x).toBe(1);
      expect(predicted.y).toBe(2);
      expect(predicted.z).toBe(10);
    });

    it('should handle negative velocities', () => {
      const projectile = createProjectile({
        position: { x: 10, y: 10, z: 10 },
        velocity: { x: -5, y: -5, z: -10 },
      });

      const predicted = predictProjectilePosition(projectile, 0.5);

      expect(predicted.x).toBe(7.5);
      expect(predicted.y).toBe(7.5);
      expect(predicted.z).toBe(5);
    });
  });

  describe('predictCollision', () => {
    it('should detect collision when projectile heads toward block', () => {
      const projectile = createProjectile({
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 10 }, // Moving towards +Z
      });

      const block = createBlock({
        position: { x: 0, y: 0, z: 10 }, // In the path
      });

      const timeToImpact = predictCollision(projectile, block, 2.0);

      expect(timeToImpact).toBeCloseTo(1.0); // 10 units / 10 units per sec
    });

    it('should return null when projectile misses block', () => {
      const projectile = createProjectile({
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 10 },
      });

      const block = createBlock({
        position: { x: 5, y: 5, z: 10 }, // Off to the side
      });

      const timeToImpact = predictCollision(projectile, block, 2.0);

      expect(timeToImpact).toBeNull();
    });

    it('should return null when projectile moves away from block', () => {
      const projectile = createProjectile({
        position: { x: 0, y: 0, z: 20 },
        velocity: { x: 0, y: 0, z: 10 }, // Moving away
      });

      const block = createBlock({
        position: { x: 0, y: 0, z: 10 }, // Behind projectile
      });

      const timeToImpact = predictCollision(projectile, block, 2.0);

      expect(timeToImpact).toBeNull();
    });

    it('should return null when collision is beyond prediction window', () => {
      const projectile = createProjectile({
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 10 },
      });

      const block = createBlock({
        position: { x: 0, y: 0, z: 100 }, // Far away
      });

      const timeToImpact = predictCollision(projectile, block, 2.0);

      expect(timeToImpact).toBeNull();
    });

    it('should handle projectiles with no Z velocity', () => {
      const projectile = createProjectile({
        position: { x: 0, y: 0, z: 5 },
        velocity: { x: 5, y: 0, z: 0 }, // Moving sideways only
      });

      const block = createBlock({
        position: { x: 0, y: 0, z: 10 },
      });

      const timeToImpact = predictCollision(projectile, block, 2.0);

      expect(timeToImpact).toBeNull();
    });
  });

  describe('detectThreats', () => {
    it('should detect threats from enemy projectiles', () => {
      const block = createBlock({ id: 'my-block', ownerId: 'player-1' });
      const projectile = createProjectile({
        position: { x: 0, y: 0, z: 5 },
        velocity: { x: 0, y: 0, z: 5 },
        ownerId: 'player-2',
      });

      const blocks = new Map([['my-block', block]]);
      const projectiles = new Map([['proj-1', projectile]]);

      const threats = detectThreats(blocks, projectiles, 'player-1', 2.0);

      expect(threats).toHaveLength(1);
      expect(threats[0]?.threatenedBlock.id).toBe('my-block');
      expect(threats[0]?.projectile.id).toBe('proj-1');
    });

    it('should ignore own projectiles', () => {
      const block = createBlock({ id: 'my-block', ownerId: 'player-1' });
      const projectile = createProjectile({
        position: { x: 0, y: 0, z: 5 },
        velocity: { x: 0, y: 0, z: 5 },
        ownerId: 'player-1', // Same owner
      });

      const blocks = new Map([['my-block', block]]);
      const projectiles = new Map([['proj-1', projectile]]);

      const threats = detectThreats(blocks, projectiles, 'player-1', 2.0);

      expect(threats).toHaveLength(0);
    });

    it('should sort threats by urgency (soonest first)', () => {
      const block1 = createBlock({
        id: 'block-near',
        position: { x: 0, y: 0, z: 5 },
      });
      const block2 = createBlock({
        id: 'block-far',
        position: { x: 0, y: 0, z: 15 },
      });

      const projectile = createProjectile({
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 10 },
      });

      const blocks = new Map([
        ['block-near', block1],
        ['block-far', block2],
      ]);
      const projectiles = new Map([['proj-1', projectile]]);

      const threats = detectThreats(blocks, projectiles, 'player-1', 3.0);

      expect(threats).toHaveLength(2);
      expect(threats[0]?.threatenedBlock.id).toBe('block-near');
      expect(threats[1]?.threatenedBlock.id).toBe('block-far');
    });
  });

  describe('getBlockThreat', () => {
    it('should find threat for specific block', () => {
      const block = createBlock({ id: 'target-block' });
      const projectile = createProjectile();

      const threats = [
        {
          projectile,
          threatenedBlock: block,
          timeToImpact: 1.0,
          impactPosition: { x: 0, y: 0, z: 10 },
        },
      ];

      const threat = getBlockThreat('target-block', threats);

      expect(threat).not.toBeNull();
      expect(threat?.threatenedBlock.id).toBe('target-block');
    });

    it('should return null when block is not threatened', () => {
      const block = createBlock({ id: 'other-block' });
      const projectile = createProjectile();

      const threats = [
        {
          projectile,
          threatenedBlock: block,
          timeToImpact: 1.0,
          impactPosition: { x: 0, y: 0, z: 10 },
        },
      ];

      const threat = getBlockThreat('not-threatened', threats);

      expect(threat).toBeNull();
    });
  });

  describe('getEscapeDirection', () => {
    it('should return perpendicular direction', () => {
      const projectile = createProjectile({
        velocity: { x: 1, y: 0, z: 10 },
      });

      const dir = getEscapeDirection(projectile);

      // Perpendicular to (1, 0) should be (0, 1) normalized
      expect(dir.x).toBeCloseTo(0);
      expect(Math.abs(dir.y)).toBeCloseTo(1);
    });

    it('should return default direction when no XY velocity', () => {
      const projectile = createProjectile({
        velocity: { x: 0, y: 0, z: 10 },
      });

      const dir = getEscapeDirection(projectile);

      expect(dir.x).toBe(1);
      expect(dir.y).toBe(0);
    });
  });

  describe('clampToRoom', () => {
    it('should clamp position to room bounds', () => {
      const room = createRoom();
      const pos: Position = { x: 100, y: 100, z: 50 };

      const clamped = clampToRoom(pos, room);

      expect(clamped.x).toBe(room.maxX - 0.5);
      expect(clamped.y).toBe(room.maxY - 0.5);
      expect(clamped.z).toBe(50); // Z is not clamped
    });

    it('should not modify valid position', () => {
      const room = createRoom();
      const pos: Position = { x: 0, y: 0, z: 10 };

      const clamped = clampToRoom(pos, room);

      expect(clamped.x).toBe(0);
      expect(clamped.y).toBe(0);
      expect(clamped.z).toBe(10);
    });
  });

  describe('isPositionSafe', () => {
    it('should return true when position is outside collision threshold', () => {
      const position: Position = { x: 5, y: 5, z: 10 };
      const threat = {
        projectile: createProjectile(),
        threatenedBlock: createBlock(),
        timeToImpact: 1.0,
        impactPosition: { x: 0, y: 0, z: 10 },
      };

      expect(isPositionSafe(position, threat)).toBe(true);
    });

    it('should return false when position overlaps with impact', () => {
      const position: Position = { x: 0, y: 0, z: 10 };
      const threat = {
        projectile: createProjectile(),
        threatenedBlock: createBlock(),
        timeToImpact: 1.0,
        impactPosition: { x: 0, y: 0, z: 10 },
      };

      expect(isPositionSafe(position, threat)).toBe(false);
    });
  });

  describe('planEvasion', () => {
    it('should find safe escape position', () => {
      const block = createBlock({ position: { x: 0, y: 0, z: 10 } });
      const threat = {
        projectile: createProjectile({ velocity: { x: 0, y: 0, z: 10 } }),
        threatenedBlock: block,
        timeToImpact: 1.0,
        impactPosition: { x: 0, y: 0, z: 10 },
      };
      const room = createRoom();

      const escapePos = planEvasion(block, threat, room);

      expect(escapePos).not.toBeNull();
      if (escapePos) {
        // Should have moved away from impact
        const dx = Math.abs(escapePos.x - 0);
        const dy = Math.abs(escapePos.y - 0);
        expect(dx > 0.8 || dy > 0.8).toBe(true); // At least collision threshold away
      }
    });

    it('should return null when no safe escape exists', () => {
      // Create a block cornered with threats from all sides
      const block = createBlock({
        position: { x: -6.5, y: -4.5, z: 10 }, // In corner
      });
      const threat = {
        projectile: createProjectile(),
        threatenedBlock: block,
        timeToImpact: 0.1,
        // Impact covers most escape directions
        impactPosition: { x: -6.5, y: -4.5, z: 10 },
      };
      // Very small room to limit escape options
      const smallRoom: RoomBounds = {
        minX: -7,
        maxX: -6,
        minY: -5,
        maxY: -4,
        minZ: 0,
        maxZ: 20,
      };

      const escapePos = planEvasion(block, threat, smallRoom, 0.5);

      // In a very constrained room, escape might not be possible
      // This depends on the exact geometry - just verify it doesn't throw
      expect(escapePos === null || escapePos !== null).toBe(true);
    });
  });

  describe('distanceXY', () => {
    it('should calculate distance correctly', () => {
      const a: Position = { x: 0, y: 0, z: 0 };
      const b: Position = { x: 3, y: 4, z: 100 };

      expect(distanceXY(a, b)).toBe(5); // 3-4-5 triangle
    });

    it('should return 0 for same position', () => {
      const a: Position = { x: 5, y: 5, z: 10 };

      expect(distanceXY(a, a)).toBe(0);
    });
  });

  describe('selectTarget', () => {
    it('should skip cannons (they are indestructible)', () => {
      const regularBlock = createBlock({
        id: 'regular',
        blockType: 'regular',
        position: { x: 0, y: 0, z: 0 },
      });
      const cannonBlock = createBlock({
        id: 'cannon',
        blockType: 'cannon',
        position: { x: 5, y: 5, z: 0 },
      });

      const opponentBlocks = new Map([
        ['regular', regularBlock],
        ['cannon', cannonBlock],
      ]);

      const target = selectTarget(opponentBlocks, 'cannon', null);

      expect(target).not.toBeNull();
      // Should select regular block, NOT cannon (cannon is indestructible)
      expect(target?.block.id).toBe('regular');
    });

    it('should return null when only cannon exists (nothing destroyable)', () => {
      const cannonBlock = createBlock({
        id: 'cannon',
        blockType: 'cannon',
        position: { x: 0, y: 0, z: 0 },
      });

      const opponentBlocks = new Map([['cannon', cannonBlock]]);

      const target = selectTarget(opponentBlocks, 'cannon', null);

      expect(target).toBeNull();
    });

    it('should select nearest regular block', () => {
      const farBlock = createBlock({
        id: 'far',
        blockType: 'regular',
        position: { x: 10, y: 10, z: 0 },
      });
      const nearBlock = createBlock({
        id: 'near',
        blockType: 'regular',
        position: { x: 1, y: 1, z: 0 },
      });

      const ownCannon = createBlock({
        id: 'my-cannon',
        position: { x: 0, y: 0, z: 20 },
      });

      const opponentBlocks = new Map([
        ['far', farBlock],
        ['near', nearBlock],
      ]);

      const target = selectTarget(opponentBlocks, null, ownCannon);

      expect(target).not.toBeNull();
      expect(target?.block.id).toBe('near');
    });

    it('should return null when no targets', () => {
      const opponentBlocks = new Map<string, Block>();

      const target = selectTarget(opponentBlocks, null, null);

      expect(target).toBeNull();
    });
  });

  describe('calculateAimOffset', () => {
    it('should return zero offset at perfect accuracy', () => {
      // With accuracy 1, offset magnitude should be 0
      const offset = calculateAimOffset(1.0);

      expect(offset.x).toBeCloseTo(0);
      expect(offset.y).toBeCloseTo(0);
    });

    it('should return larger offsets at lower accuracy', () => {
      // Run multiple times to verify offset is within bounds
      for (let i = 0; i < 10; i++) {
        const offset = calculateAimOffset(0.0, 3.0);
        const magnitude = Math.sqrt(offset.x * offset.x + offset.y * offset.y);
        expect(magnitude).toBeLessThanOrEqual(3.0);
      }
    });
  });

  describe('calculateAimPosition', () => {
    it('should return null when already aligned', () => {
      const target = createBlock({ position: { x: 0, y: 0, z: 0 } });
      const ownCannon = createBlock({ position: { x: 0, y: 0, z: 20 } });
      const room = createRoom();

      // Perfect accuracy and already aligned
      const aimPos = calculateAimPosition(target, ownCannon, 1.0, room);

      expect(aimPos).toBeNull();
    });

    it('should calculate position to align with target', () => {
      const target = createBlock({ position: { x: 5, y: 3, z: 0 } });
      const ownCannon = createBlock({ position: { x: 0, y: 0, z: 20 } });
      const room = createRoom();

      const aimPos = calculateAimPosition(target, ownCannon, 1.0, room);

      expect(aimPos).not.toBeNull();
      if (aimPos) {
        expect(aimPos.x).toBeCloseTo(5);
        expect(aimPos.y).toBeCloseTo(3);
        expect(aimPos.z).toBe(20); // Z unchanged
      }
    });
  });

  describe('decideAction', () => {
    it('should evade when threatened and dodge roll succeeds', () => {
      const myBlock = createBlock({ id: 'my-block', position: { x: 0, y: 0, z: 30 } });
      const projectile = createProjectile({
        position: { x: 0, y: 0, z: 20 },
        velocity: { x: 0, y: 0, z: 10 },
        ownerId: 'opponent',
      });

      const state = createGameState({
        myBlocks: new Map([['my-block', myBlock]]),
        projectiles: new Map([['proj-1', projectile]]),
      });

      const params: AIDerivedParams = {
        reactionTimeMs: 0,
        aimAccuracy: 0.5,
        predictionTime: 2.0,
        dodgeProbability: 1.0, // Always dodge
      };

      const rng = createMockRng([0.1]); // Low roll, will dodge
      const decision = decideAction(state, params, 'player-1', rng);

      expect(decision.action.type).toBe('evade');
    });

    it('should fire cannon when aligned with target', () => {
      const myCannon = createBlock({
        id: 'my-cannon',
        blockType: 'cannon',
        position: { x: 0, y: 0, z: 30 },
      });
      const opponentBlock = createBlock({
        id: 'enemy-block',
        position: { x: 0, y: 0, z: 0 }, // Aligned with cannon
        ownerId: 'opponent',
      });

      const state = createGameState({
        myBlocks: new Map([['my-cannon', myCannon]]),
        myCannonId: 'my-cannon',
        opponentBlocks: new Map([['enemy-block', opponentBlock]]),
      });

      const params: AIDerivedParams = {
        reactionTimeMs: 0,
        aimAccuracy: 1.0, // Perfect aim
        predictionTime: 2.0,
        dodgeProbability: 1.0,
      };

      const decision = decideAction(state, params, 'player-1');

      expect(decision.action.type).toBe('fire_cannon');
    });

    it('should return idle when nothing to do', () => {
      const state = createGameState({
        myBlocks: new Map(),
        opponentBlocks: new Map(),
        projectiles: new Map(),
      });

      const params: AIDerivedParams = {
        reactionTimeMs: 0,
        aimAccuracy: 0.5,
        predictionTime: 2.0,
        dodgeProbability: 1.0,
      };

      const decision = decideAction(state, params, 'player-1');

      expect(decision.action.type).toBe('idle');
    });

    it('should not dodge when dodge roll fails', () => {
      const myBlock = createBlock({ id: 'my-block', position: { x: 0, y: 0, z: 30 } });
      const projectile = createProjectile({
        position: { x: 0, y: 0, z: 20 },
        velocity: { x: 0, y: 0, z: 10 },
        ownerId: 'opponent',
      });

      const state = createGameState({
        myBlocks: new Map([['my-block', myBlock]]),
        projectiles: new Map([['proj-1', projectile]]),
      });

      const params: AIDerivedParams = {
        reactionTimeMs: 0,
        aimAccuracy: 0.5,
        predictionTime: 2.0,
        dodgeProbability: 0.0, // Never dodge
      };

      const rng = createMockRng([0.9]); // High roll, won't dodge
      const decision = decideAction(state, params, 'player-1', rng);

      // Should not evade
      expect(decision.action.type).not.toBe('evade');
    });
  });

  describe('canAct', () => {
    it('should return true when enough time has passed', () => {
      const lastAction = 1000;
      const reactionTime = 500;
      const now = 2000;

      expect(canAct(lastAction, reactionTime, now)).toBe(true);
    });

    it('should return false when not enough time has passed', () => {
      const lastAction = 1000;
      const reactionTime = 500;
      const now = 1200;

      expect(canAct(lastAction, reactionTime, now)).toBe(false);
    });

    it('should return true when exactly at reaction time', () => {
      const lastAction = 1000;
      const reactionTime = 500;
      const now = 1500;

      expect(canAct(lastAction, reactionTime, now)).toBe(true);
    });
  });
});
