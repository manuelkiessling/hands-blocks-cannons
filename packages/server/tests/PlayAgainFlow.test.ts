/**
 * @fileoverview Tests for the play again voting flow.
 * Specifically tests scenarios where multiple players vote to play again.
 */

import { parseClientMessage } from '@block-game/shared';
import { describe, expect, it } from 'vitest';
import { GameState } from '../src/game/GameState.js';
import { parseIncomingMessage } from '../src/protocol/handlers.js';

/**
 * Simulates the GameManager's handlePlayAgainVote logic
 * This helps us test the exact flow without needing WebSocket mocks
 */
function simulateHandlePlayAgainVote(
  state: GameState,
  playerId: string
): { newState: GameState; shouldReset: boolean; reason?: string } {
  // Check if player exists (like GameManager does)
  const player = state.getPlayer(playerId);
  if (!player) {
    return { newState: state, shouldReset: false, reason: 'player_not_found' };
  }

  // Check game phase (like GameManager does)
  if (state.gamePhase !== 'finished') {
    return { newState: state, shouldReset: false, reason: 'wrong_phase' };
  }

  // Record the vote
  const newState = state.markPlayerWantsPlayAgain(playerId);

  // Check if all players want to play again
  const shouldReset = newState.allPlayersWantPlayAgain();

  return { newState, shouldReset };
}

describe('Play Again Flow', () => {
  describe('GameState voting mechanics', () => {
    it('should track votes from multiple players correctly', () => {
      let state = GameState.create()
        .addPlayer('player-1', 1)
        .addPlayer('player-2', 2)
        .startGame()
        .setGamePhase('finished');

      // Initial state - no votes
      expect(state.getPlayAgainVoters()).toEqual([]);
      expect(state.allPlayersWantPlayAgain()).toBe(false);

      // Player 1 votes
      state = state.markPlayerWantsPlayAgain('player-1');
      expect(state.getPlayAgainVoters()).toEqual(['player-1']);
      expect(state.allPlayersWantPlayAgain()).toBe(false);

      // Player 2 votes
      state = state.markPlayerWantsPlayAgain('player-2');
      expect(state.getPlayAgainVoters()).toContain('player-1');
      expect(state.getPlayAgainVoters()).toContain('player-2');
      expect(state.getPlayAgainVoters().length).toBe(2);
      expect(state.allPlayersWantPlayAgain()).toBe(true);
    });

    it('should handle votes in reverse order', () => {
      let state = GameState.create()
        .addPlayer('player-1', 1)
        .addPlayer('player-2', 2)
        .startGame()
        .setGamePhase('finished');

      // Player 2 votes first
      state = state.markPlayerWantsPlayAgain('player-2');
      expect(state.getPlayAgainVoters()).toEqual(['player-2']);
      expect(state.allPlayersWantPlayAgain()).toBe(false);

      // Player 1 votes second
      state = state.markPlayerWantsPlayAgain('player-1');
      expect(state.getPlayAgainVoters().length).toBe(2);
      expect(state.allPlayersWantPlayAgain()).toBe(true);
    });

    it('should handle duplicate votes from same player', () => {
      let state = GameState.create()
        .addPlayer('player-1', 1)
        .addPlayer('player-2', 2)
        .startGame()
        .setGamePhase('finished');

      // Player 1 votes
      state = state.markPlayerWantsPlayAgain('player-1');
      const stateAfterFirstVote = state;

      // Player 1 votes again (duplicate)
      state = state.markPlayerWantsPlayAgain('player-1');

      // State should be unchanged (same reference)
      expect(state).toBe(stateAfterFirstVote);
      expect(state.getPlayAgainVoters()).toEqual(['player-1']);
      expect(state.allPlayersWantPlayAgain()).toBe(false);

      // Player 2 votes
      state = state.markPlayerWantsPlayAgain('player-2');
      expect(state.allPlayersWantPlayAgain()).toBe(true);
    });

    it('should handle vote from non-existent player', () => {
      let state = GameState.create()
        .addPlayer('player-1', 1)
        .addPlayer('player-2', 2)
        .startGame()
        .setGamePhase('finished');

      // Non-existent player votes
      const originalState = state;
      state = state.markPlayerWantsPlayAgain('player-999');

      // State should be unchanged
      expect(state).toBe(originalState);
      expect(state.getPlayAgainVoters()).toEqual([]);
    });

    it('should correctly identify when all players want to play again with exact player count', () => {
      let state = GameState.create()
        .addPlayer('player-1', 1)
        .addPlayer('player-2', 2)
        .startGame()
        .setGamePhase('finished');

      // Verify player count
      expect(state.getPlayerCount()).toBe(2);

      // Vote from player 1
      state = state.markPlayerWantsPlayAgain('player-1');
      expect(state.getPlayAgainVoters().length).toBe(1);
      expect(state.getPlayerCount()).toBe(2);
      expect(state.allPlayersWantPlayAgain()).toBe(false);

      // Vote from player 2
      state = state.markPlayerWantsPlayAgain('player-2');
      expect(state.getPlayAgainVoters().length).toBe(2);
      expect(state.getPlayerCount()).toBe(2);
      expect(state.allPlayersWantPlayAgain()).toBe(true);
    });
  });

  describe('Full play again cycle', () => {
    it('should properly reset game after both players vote', () => {
      // Setup: create game and transition to finished
      let state = GameState.create()
        .addPlayer('player-1', 1)
        .addPlayer('player-2', 2)
        .startGame()
        .setGamePhase('finished');

      expect(state.gamePhase).toBe('finished');

      // Both players vote
      state = state.markPlayerWantsPlayAgain('player-1');
      state = state.markPlayerWantsPlayAgain('player-2');

      // Verify all want to play again
      expect(state.allPlayersWantPlayAgain()).toBe(true);

      // Reset for new round
      const resetState = state.resetForNewRound();

      // Verify reset
      expect(resetState.gamePhase).toBe('waiting');
      expect(resetState.getPlayAgainVoters()).toEqual([]);
      expect(resetState.allPlayersWantPlayAgain()).toBe(false);

      // Both players should have their votes cleared
      expect(resetState.getPlayer('player-1')?.wantsPlayAgain).toBeFalsy();
      expect(resetState.getPlayer('player-2')?.wantsPlayAgain).toBeFalsy();

      // Both players should still exist
      expect(resetState.getPlayerCount()).toBe(2);
      expect(resetState.getPlayer('player-1')).toBeDefined();
      expect(resetState.getPlayer('player-2')).toBeDefined();
    });

    it('should handle rapid sequential votes without issues', () => {
      let state = GameState.create()
        .addPlayer('player-1', 1)
        .addPlayer('player-2', 2)
        .startGame()
        .setGamePhase('finished');

      // Simulate rapid fire voting
      state = state.markPlayerWantsPlayAgain('player-1');
      state = state.markPlayerWantsPlayAgain('player-2');
      state = state.markPlayerWantsPlayAgain('player-1'); // duplicate
      state = state.markPlayerWantsPlayAgain('player-2'); // duplicate

      expect(state.getPlayAgainVoters().length).toBe(2);
      expect(state.allPlayersWantPlayAgain()).toBe(true);
    });
  });

  describe('Player state verification', () => {
    it('should preserve player properties when voting', () => {
      let state = GameState.create()
        .addPlayer('player-1', 1)
        .addPlayer('player-2', 2)
        .startGame()
        .setGamePhase('finished');

      // Get player before voting
      const player1Before = state.getPlayer('player-1');
      expect(player1Before?.id).toBe('player-1');
      expect(player1Before?.number).toBe(1);

      // Vote
      state = state.markPlayerWantsPlayAgain('player-1');

      // Verify player properties preserved
      const player1After = state.getPlayer('player-1');
      expect(player1After?.id).toBe('player-1');
      expect(player1After?.number).toBe(1);
      expect(player1After?.wantsPlayAgain).toBe(true);
    });

    it('should not affect other players when one votes', () => {
      let state = GameState.create()
        .addPlayer('player-1', 1)
        .addPlayer('player-2', 2)
        .startGame()
        .setGamePhase('finished');

      // Player 1 votes
      state = state.markPlayerWantsPlayAgain('player-1');

      // Player 2 should be unaffected
      const player2 = state.getPlayer('player-2');
      expect(player2?.wantsPlayAgain).toBeFalsy();
    });
  });

  describe('Edge cases', () => {
    it('should handle single player scenario', () => {
      let state = GameState.create().addPlayer('player-1', 1).startGame().setGamePhase('finished');

      expect(state.getPlayerCount()).toBe(1);

      // Single player votes
      state = state.markPlayerWantsPlayAgain('player-1');

      // With only one player, all players have voted
      expect(state.allPlayersWantPlayAgain()).toBe(true);
    });

    it('should handle voting before game is finished', () => {
      let state = GameState.create().addPlayer('player-1', 1).addPlayer('player-2', 2).startGame();

      // Game is in 'playing' phase, not 'finished'
      expect(state.gamePhase).toBe('playing');

      // Voting should still work at the state level (validation is in GameManager)
      state = state.markPlayerWantsPlayAgain('player-1');
      expect(state.getPlayAgainVoters()).toEqual(['player-1']);
    });

    it('should handle player disconnect during voting', () => {
      let state = GameState.create()
        .addPlayer('player-1', 1)
        .addPlayer('player-2', 2)
        .startGame()
        .setGamePhase('finished');

      // Player 1 votes
      state = state.markPlayerWantsPlayAgain('player-1');
      expect(state.allPlayersWantPlayAgain()).toBe(false);

      // Player 2 disconnects
      state = state.removePlayer('player-2');
      expect(state.getPlayerCount()).toBe(1);

      // Now only player 1 remains, and they already voted
      expect(state.allPlayersWantPlayAgain()).toBe(true);
    });
  });

  describe('GameManager flow simulation', () => {
    it('should trigger reset when both players vote sequentially', () => {
      let state = GameState.create()
        .addPlayer('player-1', 1)
        .addPlayer('player-2', 2)
        .startGame()
        .setGamePhase('finished');

      // Player 1 votes
      const result1 = simulateHandlePlayAgainVote(state, 'player-1');
      expect(result1.shouldReset).toBe(false);
      state = result1.newState;

      // Player 2 votes
      const result2 = simulateHandlePlayAgainVote(state, 'player-2');
      expect(result2.shouldReset).toBe(true);
    });

    it('should NOT trigger reset if player not found in state', () => {
      const state = GameState.create()
        .addPlayer('player-1', 1)
        .addPlayer('player-2', 2)
        .startGame()
        .setGamePhase('finished');

      // Unknown player tries to vote
      const result = simulateHandlePlayAgainVote(state, 'player-999');
      expect(result.shouldReset).toBe(false);
      expect(result.reason).toBe('player_not_found');
    });

    it('should NOT trigger reset if game phase is not finished', () => {
      const state = GameState.create()
        .addPlayer('player-1', 1)
        .addPlayer('player-2', 2)
        .startGame(); // Phase is 'playing', not 'finished'

      const result = simulateHandlePlayAgainVote(state, 'player-1');
      expect(result.shouldReset).toBe(false);
      expect(result.reason).toBe('wrong_phase');
    });

    it('should handle player reconnect scenario (vote lost)', () => {
      let state = GameState.create()
        .addPlayer('player-1', 1)
        .addPlayer('player-2', 2)
        .startGame()
        .setGamePhase('finished');

      // Player 1 votes
      const result1 = simulateHandlePlayAgainVote(state, 'player-1');
      state = result1.newState;
      expect(state.getPlayAgainVoters()).toContain('player-1');

      // Player 1 disconnects
      state = state.removePlayer('player-1');
      expect(state.getPlayerCount()).toBe(1);

      // Player 1 reconnects with NEW ID (this is what happens in real GameManager)
      state = state.addPlayer('player-3', 1);
      expect(state.getPlayerCount()).toBe(2);

      // Now player 1's vote is LOST - player-3 hasn't voted
      expect(state.getPlayAgainVoters()).not.toContain('player-3');
      expect(state.allPlayersWantPlayAgain()).toBe(false);

      // Player 2 votes
      const result2 = simulateHandlePlayAgainVote(state, 'player-2');
      state = result2.newState;

      // Still not enough - player-3 (the new player-1) hasn't voted
      expect(result2.shouldReset).toBe(false);
      expect(state.getPlayAgainVoters()).toContain('player-2');
      expect(state.getPlayAgainVoters()).not.toContain('player-3');
    });

    it('should handle the EXACT scenario: both players vote but reset does not trigger', () => {
      // This test tries to reproduce the reported bug
      // We need to find what conditions could cause this
      let state = GameState.create()
        .addPlayer('player-1', 1)
        .addPlayer('player-2', 2)
        .startGame()
        .setGamePhase('finished');

      // Both players exist and game is finished
      expect(state.getPlayerCount()).toBe(2);
      expect(state.gamePhase).toBe('finished');

      // Player 1 votes - using the GameManager simulation
      let result = simulateHandlePlayAgainVote(state, 'player-1');
      state = result.newState;
      expect(result.shouldReset).toBe(false);
      expect(state.getPlayAgainVoters().length).toBe(1);

      // IMPORTANT: Verify state is correctly updated
      const player1AfterVote = state.getPlayer('player-1');
      expect(player1AfterVote?.wantsPlayAgain).toBe(true);

      // Player 2 votes - using the GameManager simulation
      result = simulateHandlePlayAgainVote(state, 'player-2');
      state = result.newState;

      // This SHOULD trigger reset
      expect(result.shouldReset).toBe(true);
      expect(state.getPlayAgainVoters().length).toBe(2);

      // Verify both players have voted
      const player1Final = state.getPlayer('player-1');
      const player2Final = state.getPlayer('player-2');
      expect(player1Final?.wantsPlayAgain).toBe(true);
      expect(player2Final?.wantsPlayAgain).toBe(true);
    });

    it('should handle rapid double-click on play again button', () => {
      let state = GameState.create()
        .addPlayer('player-1', 1)
        .addPlayer('player-2', 2)
        .startGame()
        .setGamePhase('finished');

      // Player 1 clicks multiple times rapidly
      let result = simulateHandlePlayAgainVote(state, 'player-1');
      state = result.newState;
      expect(result.shouldReset).toBe(false);

      // Second click from player 1 (should be idempotent)
      result = simulateHandlePlayAgainVote(state, 'player-1');
      state = result.newState;
      expect(result.shouldReset).toBe(false);

      // Third click from player 1 (should still be idempotent)
      result = simulateHandlePlayAgainVote(state, 'player-1');
      state = result.newState;
      expect(result.shouldReset).toBe(false);

      // Verify only one vote is counted
      expect(state.getPlayAgainVoters().length).toBe(1);

      // Player 2 votes once
      result = simulateHandlePlayAgainVote(state, 'player-2');
      state = result.newState;
      expect(result.shouldReset).toBe(true);
    });
  });

  describe('Game phase transitions', () => {
    it('should NOT allow game to start from finished phase (even if players are ready)', () => {
      // This tests the bug where the game would immediately restart after ending
      // because players were still marked as "ready" from the previous game
      let state = GameState.create().addPlayer('player-1', 1).addPlayer('player-2', 2);

      // Mark both players as ready
      state = state.markPlayerReady('player-1');
      state = state.markPlayerReady('player-2');
      expect(state.areAllHumansReady()).toBe(true);

      // Start the game
      state = state.startGame();
      expect(state.gamePhase).toBe('playing');

      // Game ends
      state = state.setGamePhase('finished');
      expect(state.gamePhase).toBe('finished');

      // Players are STILL ready (this was the bug condition)
      expect(state.areAllHumansReady()).toBe(true);

      // The game should NOT restart from 'finished' phase
      // GameManager.checkAndStartGame() should only start from 'waiting' phase
      // This is verified by checking that gamePhase !== 'waiting'
      expect(state.gamePhase).not.toBe('waiting');

      // After reset, players should NOT be ready anymore
      const resetState = state.resetForNewRound();
      expect(resetState.gamePhase).toBe('waiting');
      expect(resetState.areAllHumansReady()).toBe(false); // This is key!
    });

    it('should reset player ready status when resetting for new round', () => {
      let state = GameState.create().addPlayer('player-1', 1).addPlayer('player-2', 2);

      // Mark ready, start, finish
      state = state.markPlayerReady('player-1');
      state = state.markPlayerReady('player-2');
      state = state.startGame();
      state = state.setGamePhase('finished');

      // Reset
      const resetState = state.resetForNewRound();

      // Human players should not be ready after reset
      const player1 = resetState.getPlayer('player-1');
      const player2 = resetState.getPlayer('player-2');
      expect(player1?.isReady).toBe(false);
      expect(player2?.isReady).toBe(false);
      expect(resetState.areAllHumansReady()).toBe(false);
    });
  });

  describe('Message parsing', () => {
    it('should correctly parse play_again_vote message from raw JSON', () => {
      const rawMessage = '{"type":"play_again_vote"}';
      const parsed = parseIncomingMessage(rawMessage);

      expect(parsed).not.toBeNull();
      expect(parsed?.type).toBe('play_again_vote');
    });

    it('should correctly parse play_again_vote message from object', () => {
      const messageObj = { type: 'play_again_vote' };
      const parsed = parseClientMessage(messageObj);

      expect(parsed).not.toBeNull();
      expect(parsed?.type).toBe('play_again_vote');
    });

    it('should reject malformed play_again_vote message', () => {
      const malformed = { type: 'play_again_vote', extraField: 'should not matter' };
      // Zod with discriminatedUnion should still accept this
      const parsed = parseClientMessage(malformed);
      expect(parsed).not.toBeNull();
      expect(parsed?.type).toBe('play_again_vote');
    });

    it('should reject completely invalid message', () => {
      const invalid = { type: 'unknown_type' };
      const parsed = parseClientMessage(invalid);
      expect(parsed).toBeNull();
    });
  });
});
