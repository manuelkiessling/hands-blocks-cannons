import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionRouter } from '../src/routes/sessions.js';
import { SessionStore } from '../src/services/SessionStore.js';

// Mock DockerSpawner
vi.mock('../src/services/DockerSpawner.js', () => {
  return {
    DockerSpawner: class MockDockerSpawner {
      spawn = vi.fn().mockResolvedValue(undefined);
      stop = vi.fn().mockResolvedValue(undefined);
      remove = vi.fn().mockResolvedValue(undefined);
    },
  };
});

describe('Sessions Router', () => {
  let app: express.Express;
  let sessionStore: SessionStore;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStore = new SessionStore();
    app = express();
    app.use(express.json());
    app.use('/api/sessions', createSessionRouter(sessionStore));
  });

  // Helper to make requests
  async function request(method: string, path: string, body?: object) {
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) {
      options.body = JSON.stringify(body);
    }

    // Create a simple test server
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 3000;

    try {
      const response = await fetch(`http://localhost:${port}${path}`, options);
      const data = await response.json().catch(() => ({}));
      return { status: response.status, data };
    } finally {
      server.close();
    }
  }

  describe('POST /api/sessions', () => {
    it('should create a bot session', async () => {
      const { status, data } = await request('POST', '/api/sessions', {
        opponentType: 'bot',
        botDifficulty: 0.8,
      });

      expect(status).toBe(201);
      expect(data.sessionId).toMatch(/^[a-z0-9]{6}$/);
      expect(data.gameUrl).toContain(data.sessionId);
      expect(data.joinUrl).toBeNull();
    });

    it('should create a human session with joinUrl', async () => {
      const { status, data } = await request('POST', '/api/sessions', {
        opponentType: 'human',
      });

      expect(status).toBe(201);
      expect(data.joinUrl).toBe(data.gameUrl);
    });

    it('should reject invalid opponentType', async () => {
      const { status, data } = await request('POST', '/api/sessions', {
        opponentType: 'invalid',
      });

      expect(status).toBe(400);
      expect(data.error).toContain('Invalid opponentType');
    });

    it('should reject missing opponentType', async () => {
      const { status, data } = await request('POST', '/api/sessions', {});

      expect(status).toBe(400);
      expect(data.error).toContain('Invalid opponentType');
    });
  });

  describe('GET /api/sessions/:id', () => {
    it('should return session status', async () => {
      // First create a session
      const createResult = await request('POST', '/api/sessions', {
        opponentType: 'bot',
      });
      const sessionId = createResult.data.sessionId;

      const { status, data } = await request('GET', `/api/sessions/${sessionId}`);

      expect(status).toBe(200);
      expect(data.sessionId).toBe(sessionId);
      expect(data.status).toBe('active'); // Bot games become active immediately
    });

    it('should return 404 for non-existent session', async () => {
      const { status, data } = await request('GET', '/api/sessions/nonexistent');

      expect(status).toBe(404);
      expect(data.error).toBe('Session not found');
    });
  });

  describe('DELETE /api/sessions/:id', () => {
    it('should end a session', async () => {
      // First create a session
      const createResult = await request('POST', '/api/sessions', {
        opponentType: 'bot',
      });
      const sessionId = createResult.data.sessionId;

      const { status, data } = await request('DELETE', `/api/sessions/${sessionId}`);

      expect(status).toBe(200);
      expect(data.message).toBe('Session ended');

      // Verify session is marked as ended
      const session = sessionStore.get(sessionId);
      expect(session?.status).toBe('ended');
    });

    it('should return 404 for non-existent session', async () => {
      const { status, data } = await request('DELETE', '/api/sessions/nonexistent');

      expect(status).toBe(404);
      expect(data.error).toBe('Session not found');
    });
  });
});
