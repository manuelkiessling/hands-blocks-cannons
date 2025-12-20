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
    it('should add a player and create their blocks', () => {
      const state = GameState.create();
      const newState = state.addPlayer('player-1', 1);

      expect(newState.getPlayerCount()).toBe(1);
      expect(newState.getPlayer('player-1')).toBeDefined();
      expect(newState.getPlayer('player-1')?.number).toBe(1);
      expect(newState.blocks.size).toBe(5); // default blocksPerPlayer
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

      expect(state.blocks.size).toBe(10);

      const newState = state.removePlayer('player-1');

      expect(newState.blocks.size).toBe(5);
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

      const newState = state.moveBlock(blockId, newPosition);

      expect(newState.getBlock(blockId)?.position).toEqual(newPosition);
    });

    it('should clamp position to room bounds', () => {
      const state = GameState.create().addPlayer('player-1', 1);
      const blockId = getFirstBlockId(state);
      const outsidePosition = { x: 100, y: 100, z: 100 }; // Way outside bounds

      const newState = state.moveBlock(blockId, outsidePosition);
      const resultPos = newState.getBlock(blockId)?.position;

      // Should be clamped to room max - blockHalfSize (0.5)
      // Room is: maxX: 7, maxY: 5, maxZ: 8
      expect(resultPos?.x).toBe(6.5);
      expect(resultPos?.y).toBe(4.5);
      expect(resultPos?.z).toBe(7.5);
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
});
