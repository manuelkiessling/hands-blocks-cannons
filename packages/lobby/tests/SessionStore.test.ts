import { beforeEach, describe, expect, it } from 'vitest';
import { SessionStore } from '../src/services/SessionStore.js';

describe('SessionStore', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore();
  });

  describe('generateSessionId', () => {
    it('should generate a 6-character alphanumeric ID', () => {
      const id = store.generateSessionId();

      expect(id).toMatch(/^[a-z0-9]{6}$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();

      for (let i = 0; i < 100; i++) {
        ids.add(store.generateSessionId());
      }

      expect(ids.size).toBe(100);
    });
  });

  describe('create', () => {
    it('should create a bot session with correct properties', () => {
      const session = store.create('abc123', 'bot');

      expect(session.id).toBe('abc123');
      expect(session.opponentType).toBe('bot');
      expect(session.status).toBe('starting');
      expect(session.gameUrl).toBe('https://abc123-hands-blocks-cannons.dx-tooling.org');
      expect(session.joinUrl).toBeNull();
      expect(session.containerName).toBe('hbc-session-abc123');
      expect(session.createdAt).toBeInstanceOf(Date);
    });

    it('should create a human session with a join URL', () => {
      const session = store.create('xyz789', 'human');

      expect(session.id).toBe('xyz789');
      expect(session.opponentType).toBe('human');
      expect(session.joinUrl).toBe('https://xyz789-hands-blocks-cannons.dx-tooling.org');
    });

    it('should store the session for later retrieval', () => {
      store.create('test123', 'bot');

      const retrieved = store.get('test123');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('test123');
    });
  });

  describe('get', () => {
    it('should return undefined for non-existent session', () => {
      const session = store.get('nonexistent');

      expect(session).toBeUndefined();
    });

    it('should return the session if it exists', () => {
      store.create('existing', 'bot');

      const session = store.get('existing');
      expect(session).toBeDefined();
      expect(session?.id).toBe('existing');
    });
  });

  describe('updateStatus', () => {
    it('should update session status', () => {
      store.create('sess1', 'bot');
      store.updateStatus('sess1', 'active');

      const session = store.get('sess1');
      expect(session?.status).toBe('active');
    });

    it('should set error message when provided', () => {
      store.create('sess2', 'bot');
      store.updateStatus('sess2', 'error', 'Container failed to start');

      const session = store.get('sess2');
      expect(session?.status).toBe('error');
      expect(session?.errorMessage).toBe('Container failed to start');
    });

    it('should do nothing for non-existent session', () => {
      // Should not throw
      store.updateStatus('nonexistent', 'active');
    });
  });

  describe('delete', () => {
    it('should remove a session', () => {
      store.create('todelete', 'bot');
      expect(store.get('todelete')).toBeDefined();

      const deleted = store.delete('todelete');

      expect(deleted).toBe(true);
      expect(store.get('todelete')).toBeUndefined();
    });

    it('should return false for non-existent session', () => {
      const deleted = store.delete('nonexistent');

      expect(deleted).toBe(false);
    });
  });

  describe('getAll', () => {
    it('should return empty array when no sessions', () => {
      const sessions = store.getAll();

      expect(sessions).toEqual([]);
    });

    it('should return all sessions', () => {
      store.create('sess1', 'bot');
      store.create('sess2', 'human');
      store.create('sess3', 'bot');

      const sessions = store.getAll();

      expect(sessions).toHaveLength(3);
      expect(sessions.map((s) => s.id).sort()).toEqual(['sess1', 'sess2', 'sess3']);
    });
  });

  describe('cleanup', () => {
    it('should remove old ended sessions', () => {
      // Create a session and mark it as ended
      store.create('old1', 'bot');
      store.updateStatus('old1', 'ended');

      // Manually set createdAt to 2 hours ago
      const session = store.get('old1');
      if (session) {
        session.createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
      }

      const cleaned = store.cleanup();

      expect(cleaned).toBe(1);
      expect(store.get('old1')).toBeUndefined();
    });

    it('should remove old error sessions', () => {
      store.create('error1', 'bot');
      store.updateStatus('error1', 'error', 'Test error');

      const session = store.get('error1');
      if (session) {
        session.createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
      }

      const cleaned = store.cleanup();

      expect(cleaned).toBe(1);
      expect(store.get('error1')).toBeUndefined();
    });

    it('should not remove active sessions', () => {
      store.create('active1', 'bot');
      store.updateStatus('active1', 'active');

      const session = store.get('active1');
      if (session) {
        session.createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
      }

      const cleaned = store.cleanup();

      expect(cleaned).toBe(0);
      expect(store.get('active1')).toBeDefined();
    });

    it('should not remove recent ended sessions', () => {
      store.create('recent1', 'bot');
      store.updateStatus('recent1', 'ended');
      // createdAt is already recent (just created)

      const cleaned = store.cleanup();

      expect(cleaned).toBe(0);
      expect(store.get('recent1')).toBeDefined();
    });
  });
});
