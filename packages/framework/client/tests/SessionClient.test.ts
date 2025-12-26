import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ConnectionState, SessionClient, type SessionClientEvents } from '../src/index.js';

// ============ Mock WebSocket ============

interface MockWebSocket {
  url: string;
  readyState: number;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null;
  sentMessages: string[];
  close: () => void;
  send: (data: string) => void;
}

const mockWebSockets: MockWebSocket[] = [];

class MockWebSocketClass implements MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  url: string;
  readyState = MockWebSocketClass.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    mockWebSockets.push(this);
  }

  close(): void {
    this.readyState = MockWebSocketClass.CLOSED;
    this.onclose?.();
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  // Test helpers
  simulateOpen(): void {
    this.readyState = MockWebSocketClass.OPEN;
    this.onopen?.();
  }

  simulateMessage(data: object): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateClose(): void {
    this.readyState = MockWebSocketClass.CLOSED;
    this.onclose?.();
  }

  simulateError(): void {
    this.onerror?.();
  }
}

// Install mock
(globalThis as { WebSocket?: typeof MockWebSocketClass }).WebSocket = MockWebSocketClass;

// ============ Test Helpers ============

interface TestMessage {
  type: string;
  [key: string]: unknown;
}

function createClient(events: SessionClientEvents<TestMessage, TestMessage> = {}) {
  return new SessionClient<TestMessage, TestMessage, TestMessage>(events);
}

function getLastWebSocket(): MockWebSocket {
  const ws = mockWebSockets[mockWebSockets.length - 1];
  if (!ws) throw new Error('No WebSocket created');
  return ws;
}

function parseMessage(ws: MockWebSocket, index = 0): TestMessage {
  return JSON.parse(ws.sentMessages[index] ?? '{}') as TestMessage;
}

// ============ Tests ============

describe('SessionClient', () => {
  beforeEach(() => {
    mockWebSockets.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('connection management', () => {
    it('should start in disconnected state', () => {
      const client = createClient();
      expect(client.state).toBe('disconnected');
      expect(client.isConnected).toBe(false);
    });

    it('should transition to connecting when connect called', () => {
      const stateChanges: ConnectionState[] = [];
      const client = createClient({
        onConnectionStateChange: (state) => stateChanges.push(state),
      });

      client.connect('ws://localhost:3001');

      expect(stateChanges).toContain('connecting');
      expect(client.state).toBe('connecting');
    });

    it('should transition to connected on open', () => {
      const stateChanges: ConnectionState[] = [];
      const client = createClient({
        onConnectionStateChange: (state) => stateChanges.push(state),
      });

      client.connect('ws://localhost:3001');
      getLastWebSocket().simulateOpen();

      expect(stateChanges).toContain('connected');
      expect(client.state).toBe('connected');
      expect(client.isConnected).toBe(true);
    });

    it('should transition to disconnected on close', () => {
      const stateChanges: ConnectionState[] = [];
      const client = createClient({
        onConnectionStateChange: (state) => stateChanges.push(state),
      });

      client.connect('ws://localhost:3001');
      getLastWebSocket().simulateOpen();
      getLastWebSocket().simulateClose();

      expect(client.state).toBe('disconnected');
      expect(client.isConnected).toBe(false);
    });

    it('should transition to error on error', () => {
      const stateChanges: ConnectionState[] = [];
      const client = createClient({
        onConnectionStateChange: (state) => stateChanges.push(state),
      });

      client.connect('ws://localhost:3001');
      getLastWebSocket().simulateError();

      expect(stateChanges).toContain('error');
    });

    it('should disconnect properly', () => {
      const client = createClient();
      client.connect('ws://localhost:3001');
      getLastWebSocket().simulateOpen();

      client.disconnect();

      expect(client.state).toBe('disconnected');
      expect(client.isConnected).toBe(false);
    });
  });

  describe('welcome handling', () => {
    it('should handle welcome message and store participant info', () => {
      let welcomeData: { participantId: string; participantNumber: number } | null = null;
      const client = createClient({
        onSessionJoin: (data) => {
          welcomeData = {
            participantId: data.participantId,
            participantNumber: data.participantNumber,
          };
        },
      });

      client.connect('ws://localhost:3001');
      getLastWebSocket().simulateOpen();
      getLastWebSocket().simulateMessage({
        type: 'welcome',
        participantId: 'player-1',
        participantNumber: 1,
        sessionPhase: 'waiting',
        customData: 'test',
      });

      expect(welcomeData?.participantId).toBe('player-1');
      expect(welcomeData?.participantNumber).toBe(1);
      expect(client.getParticipantId()).toBe('player-1');
      expect(client.getParticipantNumber()).toBe(1);
      expect(client.getSessionPhase()).toBe('waiting');
    });
  });

  describe('session lifecycle', () => {
    it('should handle opponent joined', () => {
      let opponentJoined = false;
      const client = createClient({
        onOpponentJoined: () => {
          opponentJoined = true;
        },
      });

      client.connect('ws://localhost:3001');
      getLastWebSocket().simulateOpen();
      getLastWebSocket().simulateMessage({ type: 'opponent_joined', blocks: [] });

      expect(opponentJoined).toBe(true);
    });

    it('should handle opponent left', () => {
      let opponentLeft = false;
      const client = createClient({
        onOpponentLeft: () => {
          opponentLeft = true;
        },
      });

      client.connect('ws://localhost:3001');
      getLastWebSocket().simulateOpen();
      getLastWebSocket().simulateMessage({ type: 'opponent_left' });

      expect(opponentLeft).toBe(true);
    });

    it('should handle session_started message', () => {
      let started = false;
      const client = createClient({
        onSessionStart: () => {
          started = true;
        },
      });

      client.connect('ws://localhost:3001');
      getLastWebSocket().simulateOpen();
      getLastWebSocket().simulateMessage({ type: 'session_started' });

      expect(started).toBe(true);
      expect(client.getSessionPhase()).toBe('playing');
    });

    it('should handle session_ended message', () => {
      let endData: { winnerId: string; winnerNumber: number; reason: string } | null = null;
      const client = createClient({
        onSessionEnd: (winnerId, winnerNumber, reason) => {
          endData = { winnerId, winnerNumber, reason };
        },
      });

      client.connect('ws://localhost:3001');
      getLastWebSocket().simulateOpen();
      getLastWebSocket().simulateMessage({
        type: 'session_ended',
        winnerId: 'player-1',
        winnerNumber: 1,
        reason: 'blocks_destroyed',
      });

      expect(endData?.winnerId).toBe('player-1');
      expect(endData?.winnerNumber).toBe(1);
      expect(endData?.reason).toBe('blocks_destroyed');
      expect(client.getSessionPhase()).toBe('finished');
    });

    it('should handle error message', () => {
      let errorMessage: string | null = null;
      const client = createClient({
        onError: (msg) => {
          errorMessage = msg;
        },
      });

      client.connect('ws://localhost:3001');
      getLastWebSocket().simulateOpen();
      getLastWebSocket().simulateMessage({ type: 'error', message: 'Session is full' });

      expect(errorMessage).toBe('Session is full');
    });
  });

  describe('play-again flow', () => {
    it('should handle play_again_status message', () => {
      let statusData: { votedCount: number; total: number } | null = null;
      const client = createClient({
        onPlayAgainStatus: (votedCount, total) => {
          statusData = { votedCount, total };
        },
      });

      client.connect('ws://localhost:3001');
      getLastWebSocket().simulateOpen();
      getLastWebSocket().simulateMessage({
        type: 'play_again_status',
        votedParticipantIds: ['player-1'],
        totalParticipants: 2,
      });

      expect(statusData?.votedCount).toBe(1);
      expect(statusData?.total).toBe(2);
    });

    it('should handle session_reset message', () => {
      let resetReceived = false;
      const client = createClient({
        onSessionReset: () => {
          resetReceived = true;
        },
      });

      client.connect('ws://localhost:3001');
      getLastWebSocket().simulateOpen();
      // First simulate session ending
      getLastWebSocket().simulateMessage({
        type: 'session_ended',
        winnerId: 'player-1',
        winnerNumber: 1,
        reason: 'test',
      });

      expect(client.getSessionPhase()).toBe('finished');

      // Then reset
      getLastWebSocket().simulateMessage({
        type: 'session_reset',
        blocks: [],
      });

      expect(resetReceived).toBe(true);
      expect(client.getSessionPhase()).toBe('waiting');
    });
  });

  describe('outgoing messages', () => {
    it('should send participant_ready message', () => {
      const client = createClient();
      client.connect('ws://localhost:3001');
      getLastWebSocket().simulateOpen();

      client.sendReady();

      const msg = parseMessage(getLastWebSocket());
      expect(msg.type).toBe('participant_ready');
    });

    it('should send play_again_vote message', () => {
      const client = createClient();
      client.connect('ws://localhost:3001');
      getLastWebSocket().simulateOpen();

      client.sendPlayAgainVote();

      const msg = parseMessage(getLastWebSocket());
      expect(msg.type).toBe('play_again_vote');
    });

    it('should send app messages', () => {
      const client = createClient();
      client.connect('ws://localhost:3001');
      getLastWebSocket().simulateOpen();

      client.sendAppMessage({ type: 'block_grab', blockId: 'block-1' });

      const msg = parseMessage(getLastWebSocket());
      expect(msg.type).toBe('block_grab');
      expect(msg.blockId).toBe('block-1');
    });

    it('should not send messages when disconnected', () => {
      const client = createClient();
      // Not connected

      client.sendReady();

      expect(mockWebSockets).toHaveLength(0);
    });
  });

  describe('app message routing', () => {
    it('should route non-framework messages to onAppMessage', () => {
      const appMessages: TestMessage[] = [];
      const client = createClient({
        onAppMessage: (msg) => {
          appMessages.push(msg);
        },
      });

      client.connect('ws://localhost:3001');
      getLastWebSocket().simulateOpen();

      // Framework message - should NOT be routed to onAppMessage
      getLastWebSocket().simulateMessage({
        type: 'welcome',
        participantId: 'p1',
        participantNumber: 1,
      });

      // App message - should be routed
      getLastWebSocket().simulateMessage({ type: 'block_grabbed', playerId: 'p1', blockId: 'b1' });
      getLastWebSocket().simulateMessage({ type: 'projectile_spawned', projectile: {} });

      expect(appMessages).toHaveLength(2);
      expect(appMessages[0]?.type).toBe('block_grabbed');
      expect(appMessages[1]?.type).toBe('projectile_spawned');
    });
  });

  describe('reconnection', () => {
    it('should not reconnect by default', () => {
      const client = createClient();
      client.connect('ws://localhost:3001');
      getLastWebSocket().simulateOpen();
      getLastWebSocket().simulateClose();

      vi.advanceTimersByTime(5000);

      // Should only have 1 connection attempt (the initial one)
      expect(mockWebSockets).toHaveLength(1);
    });

    it('should reconnect when enabled', () => {
      const client = new SessionClient(
        {},
        {
          autoReconnect: true,
          reconnectDelayMs: 1000,
          maxReconnectAttempts: 3,
        }
      );

      client.connect('ws://localhost:3001');
      getLastWebSocket().simulateOpen();
      getLastWebSocket().simulateClose();

      // Advance past reconnect delay
      vi.advanceTimersByTime(1100);

      expect(mockWebSockets).toHaveLength(2);
    });

    it('should stop reconnecting after max attempts', () => {
      const client = new SessionClient(
        {},
        {
          autoReconnect: true,
          reconnectDelayMs: 100,
          maxReconnectAttempts: 2,
        }
      );

      client.connect('ws://localhost:3001');
      getLastWebSocket().simulateOpen();

      // Close and reconnect cycle
      for (let i = 0; i < 5; i++) {
        getLastWebSocket().simulateClose();
        vi.advanceTimersByTime(200);
      }

      // Should have initial + 2 reconnect attempts = 3
      expect(mockWebSockets).toHaveLength(3);
    });

    it('should cancel reconnection on disconnect', () => {
      const client = new SessionClient(
        {},
        {
          autoReconnect: true,
          reconnectDelayMs: 1000,
          maxReconnectAttempts: 3,
        }
      );

      client.connect('ws://localhost:3001');
      getLastWebSocket().simulateOpen();
      getLastWebSocket().simulateClose();

      // Disconnect before reconnect timer fires
      client.disconnect();
      vi.advanceTimersByTime(2000);

      // Should only have 1 connection attempt
      expect(mockWebSockets).toHaveLength(1);
    });
  });

  describe('state reset', () => {
    it('should reset participant info on disconnect', () => {
      const client = createClient();
      client.connect('ws://localhost:3001');
      getLastWebSocket().simulateOpen();
      getLastWebSocket().simulateMessage({
        type: 'welcome',
        participantId: 'player-1',
        participantNumber: 1,
        sessionPhase: 'playing',
      });

      expect(client.getParticipantId()).toBe('player-1');

      client.disconnect();

      expect(client.getParticipantId()).toBeNull();
      expect(client.getParticipantNumber()).toBeNull();
      expect(client.getSessionPhase()).toBe('waiting');
    });
  });
});
