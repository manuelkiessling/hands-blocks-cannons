import { describe, expect, it } from 'vitest';
import { GameState } from '../src/game/GameState.js';

// Helper to safely get first block ID from state
function getFirstBlockId(state: GameState): string {
  const blockId = Array.from(state.blocks.keys())[0];
  if (!blockId) throw new Error('No blocks found');
  return blockId;
}

// Helper to get first N block IDs
function getBlockIds(state: GameState, count: number): string[] {
  const ids = Array.from(state.blocks.keys()).slice(0, count);
  if (ids.length < count) throw new Error(`Expected ${count} blocks, got ${ids.length}`);
  return ids;
}

describe('GameState', () => {
  describe('create', () => {
    it('should create an empty game state', () => {
      const state = GameState.create();

      expect(state.getPlayerCount()).toBe(0);
      expect(state.blocks.size).toBe(0);
    });
  });

  describe('addPlayer', () => {
    it('should add a player and create their blocks (including cannon)', () => {
      const state = GameState.create();
      const newState = state.addPlayer('player-1', 1);

      expect(newState.getPlayerCount()).toBe(1);
      expect(newState.getPlayer('player-1')).toBeDefined();
      expect(newState.getPlayer('player-1')?.number).toBe(1);
      // 5 regular blocks + 1 cannon = 6 total
      expect(newState.blocks.size).toBe(6);
    });

    it('should not mutate the original state', () => {
      const state = GameState.create();
      const newState = state.addPlayer('player-1', 1);

      expect(state.getPlayerCount()).toBe(0);
      expect(newState.getPlayerCount()).toBe(1);
    });

    it('should return same state if player already exists', () => {
      const state = GameState.create().addPlayer('player-1', 1);
      const newState = state.addPlayer('player-1', 1);

      expect(newState).toBe(state);
    });

    it('should assign blocks to the correct player', () => {
      const state = GameState.create().addPlayer('player-1', 1);

      for (const block of state.blocks.values()) {
        expect(block.ownerId).toBe('player-1');
      }
    });
  });

  describe('removePlayer', () => {
    it('should remove a player and their blocks', () => {
      const state = GameState.create().addPlayer('player-1', 1);
      const newState = state.removePlayer('player-1');

      expect(newState.getPlayerCount()).toBe(0);
      expect(newState.blocks.size).toBe(0);
    });

    it('should only remove blocks owned by the removed player', () => {
      const state = GameState.create().addPlayer('player-1', 1).addPlayer('player-2', 2);

      // Each player has 5 regular blocks + 1 cannon = 6, so 12 total
      expect(state.blocks.size).toBe(12);

      const newState = state.removePlayer('player-1');

      expect(newState.blocks.size).toBe(6);
      for (const block of newState.blocks.values()) {
        expect(block.ownerId).toBe('player-2');
      }
    });
  });

  describe('getNextPlayerNumber', () => {
    it('should return 1 for empty game', () => {
      const state = GameState.create();
      expect(state.getNextPlayerNumber()).toBe(1);
    });

    it('should return 2 when player 1 exists', () => {
      const state = GameState.create().addPlayer('player-1', 1);
      expect(state.getNextPlayerNumber()).toBe(2);
    });

    it('should return null when game is full', () => {
      const state = GameState.create().addPlayer('player-1', 1).addPlayer('player-2', 2);

      expect(state.getNextPlayerNumber()).toBe(null);
    });
  });

  describe('grabBlock', () => {
    it('should allow a player to grab their own block', () => {
      const state = GameState.create().addPlayer('player-1', 1);
      const blockId = getFirstBlockId(state);

      const newState = state.grabBlock('player-1', blockId);

      expect(newState.getPlayer('player-1')?.grabbedBlockId).toBe(blockId);
    });

    it("should not allow grabbing another player's block", () => {
      const state = GameState.create().addPlayer('player-1', 1).addPlayer('player-2', 2);

      const player2Block = Array.from(state.blocks.values()).find((b) => b.ownerId === 'player-2');

      if (!player2Block) throw new Error('Player 2 block not found');

      const newState = state.grabBlock('player-1', player2Block.id);

      expect(newState.getPlayer('player-1')?.grabbedBlockId).toBe(null);
    });

    it('should not allow grabbing if already grabbing', () => {
      const state = GameState.create().addPlayer('player-1', 1);
      const [block1, block2] = getBlockIds(state, 2);

      const stateWithGrab = state.grabBlock('player-1', block1);
      const newState = stateWithGrab.grabBlock('player-1', block2);

      expect(newState.getPlayer('player-1')?.grabbedBlockId).toBe(block1);
    });
  });

  describe('releaseBlock', () => {
    it('should release a grabbed block', () => {
      const state = GameState.create().addPlayer('player-1', 1);
      const blockId = getFirstBlockId(state);

      const grabbedState = state.grabBlock('player-1', blockId);
      const releasedState = grabbedState.releaseBlock('player-1');

      expect(releasedState.getPlayer('player-1')?.grabbedBlockId).toBe(null);
    });
  });

  describe('moveBlock', () => {
    it('should update block position within bounds', () => {
      const state = GameState.create().addPlayer('player-1', 1);
      const blockId = getFirstBlockId(state);
      const newPosition = { x: 2, y: 1, z: 0 }; // Within room bounds

      const { state: newState } = state.moveBlock(blockId, newPosition);

      expect(newState.getBlock(blockId)?.position).toEqual(newPosition);
    });

    it('should clamp position to room bounds', () => {
      const state = GameState.create().addPlayer('player-1', 1);
      const blockId = getFirstBlockId(state);
      const outsidePosition = { x: 100, y: 100, z: 100 }; // Way outside bounds

      const { state: newState } = state.moveBlock(blockId, outsidePosition);
      const resultPos = newState.getBlock(blockId)?.position;

      // Should be clamped to room max - blockHalfSize (0.5)
      // Room is: maxX: 7, maxY: 5, maxZ: 32
      expect(resultPos?.x).toBe(6.5);
      expect(resultPos?.y).toBe(4.5);
      expect(resultPos?.z).toBe(31.5);
    });

    it('should not mutate original state', () => {
      const state = GameState.create().addPlayer('player-1', 1);
      const blockId = getFirstBlockId(state);
      const originalPosition = state.getBlock(blockId)?.position;
      const newPosition = { x: 2, y: 1, z: 0 };

      state.moveBlock(blockId, newPosition);

      expect(state.getBlock(blockId)?.position).toEqual(originalPosition);
    });
  });

  describe('cannon and projectiles', () => {
    // Helper to find cannon block
    function getCannonId(state: GameState, playerId: string): string {
      for (const [id, block] of state.blocks) {
        if (block.ownerId === playerId && block.blockType === 'cannon') {
          return id;
        }
      }
      throw new Error('Cannon not found');
    }

    it('should create a cannon block for each player', () => {
      const state = GameState.create().addPlayer('player-1', 1);

      const cannons = Array.from(state.blocks.values()).filter((b) => b.blockType === 'cannon');

      expect(cannons.length).toBe(1);
      expect(cannons[0]?.ownerId).toBe('player-1');
    });

    it('should allow a player to fire their cannon', () => {
      const state = GameState.create().addPlayer('player-1', 1);
      const cannonId = getCannonId(state, 'player-1');

      const { state: newState, projectile } = state.fireCannon('player-1', cannonId);

      expect(projectile).not.toBeNull();
      expect(projectile?.ownerId).toBe('player-1');
      expect(newState.projectiles.size).toBe(1);
    });

    it("should not allow firing another player's cannon", () => {
      const state = GameState.create().addPlayer('player-1', 1).addPlayer('player-2', 2);
      const cannon1Id = getCannonId(state, 'player-1');

      const { state: newState, projectile } = state.fireCannon('player-2', cannon1Id);

      expect(projectile).toBeNull();
      expect(newState.projectiles.size).toBe(0);
    });

    it('should enforce cannon cooldown', () => {
      const state = GameState.create().addPlayer('player-1', 1);
      const cannonId = getCannonId(state, 'player-1');

      const { state: firedState } = state.fireCannon('player-1', cannonId);
      const { projectile: secondProjectile } = firedState.fireCannon('player-1', cannonId);

      // Second fire should fail due to cooldown
      expect(secondProjectile).toBeNull();
    });

    it('should fire projectiles towards opponent (Player 1 fires -Z)', () => {
      const state = GameState.create().addPlayer('player-1', 1);
      const cannonId = getCannonId(state, 'player-1');

      const { projectile } = state.fireCannon('player-1', cannonId);

      // Player 1 fires towards negative Z
      expect(projectile?.velocity.z).toBeLessThan(0);
    });

    it('should fire projectiles towards opponent (Player 2 fires +Z)', () => {
      const state = GameState.create().addPlayer('player-2', 2);
      const cannonId = getCannonId(state, 'player-2');

      const { projectile } = state.fireCannon('player-2', cannonId);

      // Player 2 fires towards positive Z
      expect(projectile?.velocity.z).toBeGreaterThan(0);
    });

    it('should update projectile positions over time', () => {
      const state = GameState.create().addPlayer('player-1', 1);
      const cannonId = getCannonId(state, 'player-1');

      const { state: firedState, projectile } = state.fireCannon('player-1', cannonId);
      expect(projectile).not.toBeNull();

      const initialZ = projectile?.position.z ?? 0;
      const { state: updatedState } = firedState.updateProjectiles(0.1); // 100ms

      const updatedProjectile = updatedState.getProjectile(projectile?.id ?? '');
      expect(updatedProjectile?.position.z).toBeLessThan(initialZ); // Moved towards -Z
    });

    it('should destroy projectiles when they leave the room', () => {
      const state = GameState.create().addPlayer('player-1', 1);
      const cannonId = getCannonId(state, 'player-1');

      const { state: firedState, projectile } = state.fireCannon('player-1', cannonId);
      expect(projectile).not.toBeNull();

      // Simulate enough time for projectile to leave room
      const { state: updatedState, destroyedProjectileIds } = firedState.updateProjectiles(10);

      expect(updatedState.projectiles.size).toBe(0);
      expect(destroyedProjectileIds).toContain(projectile?.id);
    });

    it('should destroy opponent blocks on projectile collision', () => {
      // Create game with two players
      const state = GameState.create().addPlayer('player-1', 1).addPlayer('player-2', 2);

      // Get Player 1's cannon
      const cannon1Id = getCannonId(state, 'player-1');
      const cannon = state.getBlock(cannon1Id);
      expect(cannon).toBeDefined();

      // Move an opponent block to the cannon's firing path
      const player2Block = Array.from(state.blocks.values()).find(
        (b) => b.ownerId === 'player-2' && b.blockType === 'regular'
      );
      expect(player2Block).toBeDefined();

      // Position enemy block just 1.5 units in front of cannon (towards -Z for player 1)
      const targetPosition = {
        x: cannon?.position.x ?? 0,
        y: cannon?.position.y ?? 0,
        z: (cannon?.position.z ?? 0) - 1.5,
      };
      const { state: stateWithMovedBlock } = state.moveBlock(
        player2Block?.id ?? '',
        targetPosition
      );

      // Fire the cannon
      const { state: firedState, projectile } = stateWithMovedBlock.fireCannon(
        'player-1',
        cannon1Id
      );
      expect(projectile).not.toBeNull();

      // Update projectiles in small steps until collision
      let currentState = firedState;
      let foundCollision = false;
      for (let i = 0; i < 20; i++) {
        const result = currentState.updateProjectiles(0.05); // 50ms steps
        currentState = result.state;
        if (result.destroyedBlocks.length > 0) {
          foundCollision = true;
          expect(result.destroyedBlocks[0]?.blockId).toBe(player2Block?.id);
          break;
        }
      }

      expect(foundCollision).toBe(true);
      // The block should be removed from state
      expect(currentState.getBlock(player2Block?.id ?? '')).toBeUndefined();
    });

    it('should not destroy own blocks on projectile collision', () => {
      const state = GameState.create().addPlayer('player-1', 1);
      const cannonId = getCannonId(state, 'player-1');

      // Get one of player 1's own blocks
      const ownBlock = Array.from(state.blocks.values()).find(
        (b) => b.ownerId === 'player-1' && b.blockType === 'regular'
      );
      expect(ownBlock).toBeDefined();

      // Fire the cannon
      const { state: firedState, projectile } = state.fireCannon('player-1', cannonId);
      expect(projectile).not.toBeNull();

      // Update projectiles multiple times
      let currentState = firedState;
      for (let i = 0; i < 10; i++) {
        const result = currentState.updateProjectiles(0.1);
        currentState = result.state;

        // Own blocks should never be destroyed
        expect(result.destroyedBlocks.every((b) => b.blockId !== ownBlock?.id)).toBe(true);
      }

      // Own block should still exist
      expect(currentState.getBlock(ownBlock?.id ?? '')).toBeDefined();
    });
  });
});
