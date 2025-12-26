import { beforeEach, describe, expect, it } from 'vitest';
import {
  type AppHooks,
  type Connection,
  DEFAULT_RUNTIME_CONFIG,
  SessionRuntime,
} from '../src/index.js';

// ============ Test Helpers ============

interface TestMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * Create a mock connection for testing.
 */
function createMockConnection(): Connection & { sentMessages: string[]; closed: boolean } {
  return {
    sentMessages: [],
    closed: false,
    readyState: 1,
    OPEN: 1,
    send(data: string) {
      this.sentMessages.push(data);
    },
    close() {
      this.closed = true;
      this.readyState = 3;
    },
  };
}

/**
 * Create minimal app hooks for testing.
 */
function createTestHooks(): AppHooks<TestMessage, TestMessage, object, object> & {
  calls: { method: string; args: unknown[] }[];
} {
  const calls: { method: string; args: unknown[] }[] = [];

  return {
    calls,
    generateParticipantId: (num) => {
      calls.push({ method: 'generateParticipantId', args: [num] });
      return `participant-${num}`;
    },
    onParticipantJoin: (p) => {
      calls.push({ method: 'onParticipantJoin', args: [p] });
      return { customData: 'welcome' };
    },
    onParticipantLeave: (id) => {
      calls.push({ method: 'onParticipantLeave', args: [id] });
    },
    onMessage: (msg, senderId, phase) => {
      calls.push({ method: 'onMessage', args: [msg, senderId, phase] });
      return [];
    },
    onSessionStart: () => {
      calls.push({ method: 'onSessionStart', args: [] });
    },
    onReset: () => {
      calls.push({ method: 'onReset', args: [] });
      return { resetData: 'fresh' };
    },
  };
}

function createRuntime(hooks = createTestHooks()) {
  return new SessionRuntime<TestMessage, TestMessage, object, object>(
    DEFAULT_RUNTIME_CONFIG,
    hooks,
    (msg) => JSON.stringify(msg),
    (data) => {
      try {
        return JSON.parse(data) as TestMessage;
      } catch {
        return null;
      }
    }
  );
}

function parseMessage(conn: ReturnType<typeof createMockConnection>, index = 0): TestMessage {
  return JSON.parse(conn.sentMessages[index] ?? '{}') as TestMessage;
}

// ============ Tests ============

describe('SessionRuntime', () => {
  describe('2-participant admission', () => {
    it('should accept first participant as number 1', () => {
      const runtime = createRuntime();
      const conn = createMockConnection();

      const participant = runtime.handleConnection(conn);

      expect(participant).not.toBeNull();
      expect(participant?.number).toBe(1);
      expect(participant?.id).toBe('participant-1');
    });

    it('should accept second participant as number 2', () => {
      const runtime = createRuntime();
      const conn1 = createMockConnection();
      const conn2 = createMockConnection();

      runtime.handleConnection(conn1);
      const participant = runtime.handleConnection(conn2);

      expect(participant).not.toBeNull();
      expect(participant?.number).toBe(2);
      expect(participant?.id).toBe('participant-2');
    });

    it('should reject third participant', () => {
      const runtime = createRuntime();
      const conn1 = createMockConnection();
      const conn2 = createMockConnection();
      const conn3 = createMockConnection();

      runtime.handleConnection(conn1);
      runtime.handleConnection(conn2);
      const participant = runtime.handleConnection(conn3);

      expect(participant).toBeNull();
      expect(conn3.closed).toBe(true);

      const errorMsg = parseMessage(conn3);
      expect(errorMsg.type).toBe('error');
    });

    it('should send welcome message on join', () => {
      const runtime = createRuntime();
      const conn = createMockConnection();

      runtime.handleConnection(conn);

      const welcome = parseMessage(conn);
      expect(welcome.type).toBe('welcome');
      expect(welcome.participantId).toBe('participant-1');
      expect(welcome.participantNumber).toBe(1);
      expect(welcome.sessionPhase).toBe('waiting');
      expect((welcome as { appData?: { customData?: string } }).appData?.customData).toBe(
        'welcome'
      );
    });

    it('should notify opponent when second participant joins', () => {
      const runtime = createRuntime();
      const conn1 = createMockConnection();
      const conn2 = createMockConnection();

      runtime.handleConnection(conn1);
      conn1.sentMessages.length = 0; // Clear welcome message

      runtime.handleConnection(conn2);

      // conn1 should receive opponent_joined
      const notification = parseMessage(conn1);
      expect(notification.type).toBe('opponent_joined');
    });

    it('should allow reconnection after disconnect', () => {
      const runtime = createRuntime();
      const conn1 = createMockConnection();
      const conn2 = createMockConnection();

      runtime.handleConnection(conn1);
      runtime.handleDisconnection(conn1);

      const p2 = runtime.handleConnection(conn2);

      // Should get number 1 again since it was freed
      expect(p2?.number).toBe(1);
    });
  });

  describe('ready-state gating', () => {
    it('should not start session until both participants are ready', () => {
      const hooks = createTestHooks();
      const runtime = createRuntime(hooks);
      const conn1 = createMockConnection();
      const conn2 = createMockConnection();

      runtime.handleConnection(conn1);
      runtime.handleConnection(conn2);

      // Only first participant ready
      runtime.handleMessage(conn1, JSON.stringify({ type: 'participant_ready' }));

      expect(runtime.getPhase()).toBe('waiting');
      expect(hooks.calls.filter((c) => c.method === 'onSessionStart')).toHaveLength(0);
    });

    it('should start session when both participants are ready', () => {
      const hooks = createTestHooks();
      const runtime = createRuntime(hooks);
      const conn1 = createMockConnection();
      const conn2 = createMockConnection();

      runtime.handleConnection(conn1);
      runtime.handleConnection(conn2);
      conn1.sentMessages.length = 0;
      conn2.sentMessages.length = 0;

      runtime.handleMessage(conn1, JSON.stringify({ type: 'participant_ready' }));
      runtime.handleMessage(conn2, JSON.stringify({ type: 'participant_ready' }));

      expect(runtime.getPhase()).toBe('playing');
      expect(hooks.calls.filter((c) => c.method === 'onSessionStart')).toHaveLength(1);

      // Both should receive session_started
      const msg1 = parseMessage(conn1);
      const msg2 = parseMessage(conn2);
      expect(msg1.type).toBe('session_started');
      expect(msg2.type).toBe('session_started');
    });

    it('should handle bot auto-ready', () => {
      const hooks = createTestHooks();
      const runtime = createRuntime(hooks);
      const conn1 = createMockConnection();
      const conn2 = createMockConnection();

      runtime.handleConnection(conn1);
      runtime.handleConnection(conn2);

      // Bot identifies (auto-ready)
      runtime.handleMessage(conn1, JSON.stringify({ type: 'bot_identify' }));
      expect(runtime.getPhase()).toBe('waiting');

      // Human ready
      runtime.handleMessage(conn2, JSON.stringify({ type: 'participant_ready' }));
      expect(runtime.getPhase()).toBe('playing');
    });

    it('should support participant_ready message type', () => {
      const runtime = createRuntime();
      const conn1 = createMockConnection();
      const conn2 = createMockConnection();

      runtime.handleConnection(conn1);
      runtime.handleConnection(conn2);

      runtime.handleMessage(conn1, JSON.stringify({ type: 'participant_ready' }));
      runtime.handleMessage(conn2, JSON.stringify({ type: 'participant_ready' }));

      expect(runtime.getPhase()).toBe('playing');
    });
  });

  describe('disconnect semantics', () => {
    it('should notify opponent when participant disconnects', () => {
      const runtime = createRuntime();
      const conn1 = createMockConnection();
      const conn2 = createMockConnection();

      runtime.handleConnection(conn1);
      runtime.handleConnection(conn2);
      conn2.sentMessages.length = 0;

      runtime.handleDisconnection(conn1);

      const notification = parseMessage(conn2);
      expect(notification.type).toBe('opponent_left');
    });

    it('should call onParticipantLeave hook', () => {
      const hooks = createTestHooks();
      const runtime = createRuntime(hooks);
      const conn = createMockConnection();

      runtime.handleConnection(conn);
      runtime.handleDisconnection(conn);

      const leaveCalls = hooks.calls.filter((c) => c.method === 'onParticipantLeave');
      expect(leaveCalls).toHaveLength(1);
      expect(leaveCalls[0]?.args[0]).toBe('participant-1');
    });

    it('should remove participant from registry', () => {
      const runtime = createRuntime();
      const conn = createMockConnection();

      runtime.handleConnection(conn);
      expect(runtime.getParticipantCount()).toBe(1);

      runtime.handleDisconnection(conn);
      expect(runtime.getParticipantCount()).toBe(0);
    });
  });

  describe('play-again voting', () => {
    let runtime: SessionRuntime<TestMessage, TestMessage, object, object>;
    let hooks: ReturnType<typeof createTestHooks>;
    let conn1: ReturnType<typeof createMockConnection>;
    let conn2: ReturnType<typeof createMockConnection>;

    beforeEach(() => {
      hooks = createTestHooks();
      runtime = createRuntime(hooks);
      conn1 = createMockConnection();
      conn2 = createMockConnection();

      // Setup: both connected and session started
      runtime.handleConnection(conn1);
      runtime.handleConnection(conn2);
      runtime.handleMessage(conn1, JSON.stringify({ type: 'participant_ready' }));
      runtime.handleMessage(conn2, JSON.stringify({ type: 'participant_ready' }));

      // End the session
      runtime.endSession('participant-1', 1, 'test');

      conn1.sentMessages.length = 0;
      conn2.sentMessages.length = 0;
    });

    it('should ignore play_again_vote when not in finished phase', () => {
      // Create fresh runtime in waiting phase
      const freshRuntime = createRuntime();
      const conn = createMockConnection();
      freshRuntime.handleConnection(conn);
      conn.sentMessages.length = 0;

      freshRuntime.handleMessage(conn, JSON.stringify({ type: 'play_again_vote' }));

      // No play_again_status message should be sent
      expect(conn.sentMessages).toHaveLength(0);
    });

    it('should broadcast vote status when participant votes', () => {
      runtime.handleMessage(conn1, JSON.stringify({ type: 'play_again_vote' }));

      const status1 = parseMessage(conn1);
      const status2 = parseMessage(conn2);

      expect(status1.type).toBe('play_again_status');
      expect(status1.votedParticipantIds).toContain('participant-1');
      expect(status1.totalParticipants).toBe(2);

      expect(status2.type).toBe('play_again_status');
    });

    it('should reset session when all vote to play again', () => {
      runtime.handleMessage(conn1, JSON.stringify({ type: 'play_again_vote' }));
      conn1.sentMessages.length = 0;
      conn2.sentMessages.length = 0;

      runtime.handleMessage(conn2, JSON.stringify({ type: 'play_again_vote' }));

      // Should call onReset hook
      expect(hooks.calls.filter((c) => c.method === 'onReset')).toHaveLength(1);

      // Phase should be waiting
      expect(runtime.getPhase()).toBe('waiting');

      // Should broadcast reset (after status update)
      const messages1 = conn1.sentMessages.map((s) => JSON.parse(s) as TestMessage);
      const resetMsg = messages1.find((m) => m.type === 'session_reset');
      expect(resetMsg).toBeDefined();
      expect((resetMsg as { appData?: { resetData?: string } }).appData?.resetData).toBe('fresh');
    });

    it('should reset participant ready states on reset (except bots)', () => {
      // Make participant-1 a bot first
      const freshHooks = createTestHooks();
      const freshRuntime = createRuntime(freshHooks);
      const c1 = createMockConnection();
      const c2 = createMockConnection();

      freshRuntime.handleConnection(c1);
      freshRuntime.handleConnection(c2);
      freshRuntime.handleMessage(c1, JSON.stringify({ type: 'bot_identify' }));
      freshRuntime.handleMessage(c2, JSON.stringify({ type: 'participant_ready' }));

      freshRuntime.endSession('participant-1', 1, 'app_condition');
      freshRuntime.handleMessage(c1, JSON.stringify({ type: 'play_again_vote' }));
      freshRuntime.handleMessage(c2, JSON.stringify({ type: 'play_again_vote' }));

      // Check participant states
      const p1 = freshRuntime.getParticipant('participant-1');
      const p2 = freshRuntime.getParticipant('participant-2');

      expect(p1?.isReady).toBe(true); // Bot stays ready
      expect(p1?.wantsPlayAgain).toBe(false); // Vote cleared
      expect(p2?.isReady).toBe(false); // Human must re-ready
      expect(p2?.wantsPlayAgain).toBe(false);
    });
  });

  describe('message routing', () => {
    it('should delegate app messages to onMessage hook', () => {
      const hooks = createTestHooks();
      const runtime = createRuntime(hooks);
      const conn = createMockConnection();

      runtime.handleConnection(conn);
      runtime.handleMessage(conn, JSON.stringify({ type: 'custom_app_message', data: 123 }));

      const msgCalls = hooks.calls.filter((c) => c.method === 'onMessage');
      expect(msgCalls).toHaveLength(1);
      expect((msgCalls[0]?.args[0] as TestMessage).type).toBe('custom_app_message');
      expect(msgCalls[0]?.args[1]).toBe('participant-1');
      expect(msgCalls[0]?.args[2]).toBe('waiting');
    });

    it('should send error on invalid message format', () => {
      const runtime = createRuntime();
      const conn = createMockConnection();

      runtime.handleConnection(conn);
      conn.sentMessages.length = 0;

      runtime.handleMessage(conn, 'not valid json {{{');

      const error = parseMessage(conn);
      expect(error.type).toBe('error');
    });

    it('should route responses based on target', () => {
      const hooks = createTestHooks();
      hooks.onMessage = () => [
        { target: 'sender', message: { type: 'to_sender' } },
        { target: 'opponent', message: { type: 'to_opponent' } },
        { target: 'all', message: { type: 'to_all' } },
      ];

      const runtime = createRuntime(hooks);
      const conn1 = createMockConnection();
      const conn2 = createMockConnection();

      runtime.handleConnection(conn1);
      runtime.handleConnection(conn2);
      conn1.sentMessages.length = 0;
      conn2.sentMessages.length = 0;

      runtime.handleMessage(conn1, JSON.stringify({ type: 'trigger' }));

      const msgs1 = conn1.sentMessages.map((s) => JSON.parse(s) as TestMessage);
      const msgs2 = conn2.sentMessages.map((s) => JSON.parse(s) as TestMessage);

      // conn1 (sender) should get: to_sender, to_all
      expect(msgs1.map((m) => m.type)).toContain('to_sender');
      expect(msgs1.map((m) => m.type)).toContain('to_all');
      expect(msgs1.map((m) => m.type)).not.toContain('to_opponent');

      // conn2 (opponent) should get: to_opponent, to_all
      expect(msgs2.map((m) => m.type)).toContain('to_opponent');
      expect(msgs2.map((m) => m.type)).toContain('to_all');
      expect(msgs2.map((m) => m.type)).not.toContain('to_sender');
    });
  });

  describe('public API', () => {
    it('should expose participant queries', () => {
      const runtime = createRuntime();
      const conn = createMockConnection();

      runtime.handleConnection(conn);

      expect(runtime.getParticipantCount()).toBe(1);
      expect(runtime.getParticipant('participant-1')).toBeDefined();
      expect(runtime.getAllParticipants()).toHaveLength(1);
    });

    it('should allow sending messages via public API', () => {
      const runtime = createRuntime();
      const conn = createMockConnection();

      runtime.handleConnection(conn);
      conn.sentMessages.length = 0;

      runtime.sendToParticipant('participant-1', { type: 'direct' });
      runtime.broadcast({ type: 'broadcast' });

      const msgs = conn.sentMessages.map((s) => JSON.parse(s) as TestMessage);
      expect(msgs.map((m) => m.type)).toContain('direct');
      expect(msgs.map((m) => m.type)).toContain('broadcast');
    });
  });
});
