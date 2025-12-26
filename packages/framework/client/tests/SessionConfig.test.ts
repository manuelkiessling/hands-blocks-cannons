import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchSessionConfig,
  getInjectedConfig,
  isLocalDevelopment,
  resolveSessionConfig,
  type SessionConfig,
} from '../src/SessionConfig.js';

// Mock window.location
const mockLocation = {
  hostname: 'example.com',
  protocol: 'https:',
};

// Store original values
const originalWindow = global.window;

describe('SessionConfig', () => {
  beforeEach(() => {
    // Setup window mock
    global.window = {
      location: mockLocation,
      __SESSION_CONFIG__: undefined,
    } as unknown as Window & typeof globalThis;

    // Reset location for each test
    mockLocation.hostname = 'example.com';

    // Reset fetch mock
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.window = originalWindow;
  });

  describe('isLocalDevelopment', () => {
    it('should return true for localhost', () => {
      mockLocation.hostname = 'localhost';
      expect(isLocalDevelopment()).toBe(true);
    });

    it('should return true for 127.0.0.1', () => {
      mockLocation.hostname = '127.0.0.1';
      expect(isLocalDevelopment()).toBe(true);
    });

    it('should return false for production hostname', () => {
      mockLocation.hostname = 'abc123-blocks-cannons-gestures.dx-tooling.org';
      expect(isLocalDevelopment()).toBe(false);
    });

    it('should return false for any non-local hostname', () => {
      mockLocation.hostname = 'game.example.com';
      expect(isLocalDevelopment()).toBe(false);
    });
  });

  describe('getInjectedConfig', () => {
    it('should return null when __SESSION_CONFIG__ is not set', () => {
      expect(getInjectedConfig()).toBeNull();
    });

    it('should return config when __SESSION_CONFIG__ is valid', () => {
      const validConfig: SessionConfig = {
        appId: 'blocks-cannons',
        wsUrl: 'wss://example.com/ws',
        lobbyUrl: 'https://lobby.example.com',
      };
      window.__SESSION_CONFIG__ = validConfig;

      const result = getInjectedConfig();
      expect(result).toEqual(validConfig);
    });

    it('should return config with appConfig when present', () => {
      const configWithAppConfig: SessionConfig = {
        appId: 'blocks-cannons',
        wsUrl: 'wss://example.com/ws',
        lobbyUrl: 'https://lobby.example.com',
        appConfig: { difficulty: 'hard' },
      };
      window.__SESSION_CONFIG__ = configWithAppConfig;

      const result = getInjectedConfig();
      expect(result).toEqual(configWithAppConfig);
      expect(result?.appConfig).toEqual({ difficulty: 'hard' });
    });

    it('should return null and warn when config is missing appId', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      window.__SESSION_CONFIG__ = {
        wsUrl: 'wss://example.com/ws',
        lobbyUrl: 'https://lobby.example.com',
      } as SessionConfig;

      expect(getInjectedConfig()).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        'Invalid __SESSION_CONFIG__: missing required fields',
        expect.anything()
      );
    });

    it('should return null when config is missing wsUrl', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      window.__SESSION_CONFIG__ = {
        appId: 'blocks-cannons',
        lobbyUrl: 'https://lobby.example.com',
      } as SessionConfig;

      expect(getInjectedConfig()).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
    });

    it('should return null when config is missing lobbyUrl', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      window.__SESSION_CONFIG__ = {
        appId: 'blocks-cannons',
        wsUrl: 'wss://example.com/ws',
      } as SessionConfig;

      expect(getInjectedConfig()).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('fetchSessionConfig', () => {
    it('should return config when fetch succeeds with valid JSON', async () => {
      const validConfig: SessionConfig = {
        appId: 'blocks-cannons',
        wsUrl: 'wss://example.com/ws',
        lobbyUrl: 'https://lobby.example.com',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(validConfig),
      });

      const result = await fetchSessionConfig();
      expect(result).toEqual(validConfig);
      expect(fetch).toHaveBeenCalledWith('/session.json');
    });

    it('should return null when fetch returns 404', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await fetchSessionConfig();
      expect(result).toBeNull();
    });

    it('should return null when fetch throws network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await fetchSessionConfig();
      expect(result).toBeNull();
    });

    it('should return null and warn when JSON is invalid', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ invalid: 'config' }),
      });

      const result = await fetchSessionConfig();
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        'Invalid session.json: missing required fields',
        expect.anything()
      );
    });
  });

  describe('resolveSessionConfig', () => {
    it('should return development mode for localhost', async () => {
      mockLocation.hostname = 'localhost';

      const result = await resolveSessionConfig();
      expect(result).toEqual({ mode: 'development' });
    });

    it('should return development mode for 127.0.0.1', async () => {
      mockLocation.hostname = '127.0.0.1';

      const result = await resolveSessionConfig();
      expect(result).toEqual({ mode: 'development' });
    });

    it('should use injected config when available (non-local)', async () => {
      mockLocation.hostname = 'session-abc.example.com';
      const validConfig: SessionConfig = {
        appId: 'blocks-cannons',
        wsUrl: 'wss://session-abc.example.com/ws',
        lobbyUrl: 'https://lobby.example.com',
      };
      window.__SESSION_CONFIG__ = validConfig;

      const result = await resolveSessionConfig();
      expect(result).toEqual({ mode: 'session', config: validConfig });
    });

    it('should fetch config when injected config not available', async () => {
      mockLocation.hostname = 'session-abc.example.com';
      const validConfig: SessionConfig = {
        appId: 'blocks-cannons',
        wsUrl: 'wss://session-abc.example.com/ws',
        lobbyUrl: 'https://lobby.example.com',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(validConfig),
      });

      const result = await resolveSessionConfig();
      expect(result).toEqual({ mode: 'session', config: validConfig });
    });

    it('should prefer injected config over fetched config', async () => {
      mockLocation.hostname = 'session-abc.example.com';
      const injectedConfig: SessionConfig = {
        appId: 'injected-app',
        wsUrl: 'wss://injected.com/ws',
        lobbyUrl: 'https://injected-lobby.com',
      };
      window.__SESSION_CONFIG__ = injectedConfig;

      // Even if fetch would return something different, it should not be called
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            appId: 'fetched-app',
            wsUrl: 'wss://fetched.com/ws',
            lobbyUrl: 'https://fetched-lobby.com',
          }),
      });

      const result = await resolveSessionConfig();
      expect(result).toEqual({ mode: 'session', config: injectedConfig });
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should fall back to development mode when no config available', async () => {
      mockLocation.hostname = 'session-abc.example.com';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await resolveSessionConfig();
      expect(result).toEqual({ mode: 'development' });
      expect(warnSpy).toHaveBeenCalledWith(
        'No session config found, falling back to development mode'
      );
    });
  });
});
