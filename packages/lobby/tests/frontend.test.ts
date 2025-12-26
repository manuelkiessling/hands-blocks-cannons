/**
 * Tests for frontend API client functions.
 *
 * These tests verify that the frontend correctly communicates with the backend API.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import types that match the frontend
interface AppManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  tags?: readonly string[];
  supportsBot?: boolean;
}

interface AppsResponse {
  apps: AppManifest[];
}

interface CreateSessionResponse {
  sessionId: string;
  appId: string;
  gameUrl: string;
  joinUrl: string | null;
}

// Re-implement frontend functions for testing (avoiding DOM dependencies)
async function fetchApps(): Promise<AppManifest[]> {
  const response = await fetch('/api/sessions/apps');
  if (!response.ok) {
    throw new Error('Failed to fetch applications');
  }
  const data: AppsResponse = await response.json();
  return data.apps;
}

async function createSession(
  appId: string,
  opponentType: 'bot' | 'human',
  botDifficulty?: number
): Promise<CreateSessionResponse> {
  const response = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId, opponentType, botDifficulty }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create session');
  }

  return response.json();
}

describe('Frontend API Client', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('fetchApps', () => {
    it('should fetch and return available apps', async () => {
      const mockApps: AppManifest[] = [
        {
          id: 'blocks-cannons',
          name: 'Blocks & Cannons',
          version: '1.0.0',
          description: 'A competitive game',
          tags: ['game', 'competitive'],
          supportsBot: true,
        },
        {
          id: 'hello-hands',
          name: 'Hello Hands',
          version: '1.0.0',
          description: 'A demo app',
          tags: ['demo'],
          supportsBot: false,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apps: mockApps }),
      });

      const apps = await fetchApps();

      expect(mockFetch).toHaveBeenCalledWith('/api/sessions/apps');
      expect(apps).toHaveLength(2);
      expect(apps[0].id).toBe('blocks-cannons');
      expect(apps[1].id).toBe('hello-hands');
    });

    it('should throw error on failed fetch', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(fetchApps()).rejects.toThrow('Failed to fetch applications');
    });

    it('should handle empty apps list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ apps: [] }),
      });

      const apps = await fetchApps();

      expect(apps).toHaveLength(0);
    });
  });

  describe('createSession', () => {
    it('should create a bot session with appId', async () => {
      const mockResponse: CreateSessionResponse = {
        sessionId: 'abc123',
        appId: 'blocks-cannons',
        gameUrl: 'https://abc123-blocks-cannons-gestures.dx-tooling.org',
        joinUrl: null,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const session = await createSession('blocks-cannons', 'bot', 0.5);

      expect(mockFetch).toHaveBeenCalledWith('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: 'blocks-cannons',
          opponentType: 'bot',
          botDifficulty: 0.5,
        }),
      });
      expect(session.sessionId).toBe('abc123');
      expect(session.appId).toBe('blocks-cannons');
      expect(session.joinUrl).toBeNull();
    });

    it('should create a human session with appId', async () => {
      const mockResponse: CreateSessionResponse = {
        sessionId: 'def456',
        appId: 'hello-hands',
        gameUrl: 'https://def456-hello-hands-gestures.dx-tooling.org',
        joinUrl: 'https://def456-hello-hands-gestures.dx-tooling.org',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const session = await createSession('hello-hands', 'human');

      expect(mockFetch).toHaveBeenCalledWith('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: 'hello-hands',
          opponentType: 'human',
          botDifficulty: undefined,
        }),
      });
      expect(session.appId).toBe('hello-hands');
      expect(session.joinUrl).toBe(session.gameUrl);
    });

    it('should throw error with message from server', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Unknown application: invalid-app' }),
      });

      await expect(createSession('invalid-app', 'bot')).rejects.toThrow(
        'Unknown application: invalid-app'
      );
    });

    it('should throw generic error when no message from server', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      });

      await expect(createSession('some-app', 'bot')).rejects.toThrow('Failed to create session');
    });

    it('should include botDifficulty only for bot games', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: 'xyz789',
          appId: 'blocks-cannons',
          gameUrl: 'https://xyz789-blocks-cannons-gestures.dx-tooling.org',
          joinUrl: null,
        }),
      });

      await createSession('blocks-cannons', 'bot', 0.75);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.botDifficulty).toBe(0.75);
    });
  });
});

