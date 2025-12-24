import * as childProcess from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock child_process before importing DockerSpawner
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

// Import after mocking
import { DockerSpawner } from '../src/services/DockerSpawner.js';

describe('DockerSpawner', () => {
  let spawner: DockerSpawner;
  let mockExecFile: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock to resolve by default
    mockExecFile = vi.mocked(childProcess.execFile);
    mockExecFile.mockImplementation((_cmd, _args, callback) => {
      if (typeof callback === 'function') {
        callback(null, { stdout: '', stderr: '' });
      }
      return {} as ReturnType<typeof childProcess.execFile>;
    });

    // Set wrapper path for tests
    // biome-ignore lint/complexity/useLiteralKeys: Required for noPropertyAccessFromIndexSignature
    process.env['DOCKER_WRAPPER_PATH'] = '/test/wrapper.sh';
    spawner = new DockerSpawner();
  });

  describe('spawn', () => {
    it('should call wrapper with correct arguments for bot game', async () => {
      await spawner.spawn('abc123', true, 0.7);

      expect(mockExecFile).toHaveBeenCalledTimes(1);
      const [cmd, args] = mockExecFile.mock.calls[0] as [string, string[]];

      expect(cmd).toBe('bash');
      expect(args[0]).toBe('/test/wrapper.sh');
      expect(args[1]).toBe('run');

      // Check container name
      expect(args).toContain('--name');
      const nameIndex = args.indexOf('--name');
      expect(args[nameIndex + 1]).toBe('hbc-session-abc123');

      // Check network
      expect(args).toContain('--network');
      const networkIndex = args.indexOf('--network');
      expect(args[networkIndex + 1]).toBe('outermost_router');

      // Check environment variables
      expect(args).toContain('SESSION_ID=abc123');
      expect(args).toContain('WITH_BOT=true');
      expect(args).toContain('BOT_DIFFICULTY=0.7');

      // Check Traefik labels
      expect(args).toContain('traefik.enable=true');
      expect(args).toContain(
        'traefik.http.routers.hbc-abc123.rule=Host(`abc123-hands-blocks-cannons.dx-tooling.org`)'
      );

      // Check image name is last
      expect(args[args.length - 1]).toBe('hbc-game-session');
    });

    it('should call wrapper with correct arguments for human game', async () => {
      await spawner.spawn('xyz789', false);

      const [, args] = mockExecFile.mock.calls[0] as [string, string[]];

      expect(args).toContain('WITH_BOT=false');
      expect(args).toContain('BOT_DIFFICULTY=0.5'); // default value
    });

    it('should use default bot difficulty if not provided', async () => {
      await spawner.spawn('test1', true);

      const [, args] = mockExecFile.mock.calls[0] as [string, string[]];

      expect(args).toContain('BOT_DIFFICULTY=0.5');
    });

    it('should throw on exec failure', async () => {
      const error = new Error('Docker failed') as Error & { stderr: string };
      error.stderr = 'Container already exists';
      mockExecFile.mockImplementation((_cmd, _args, callback) => {
        if (typeof callback === 'function') {
          callback(error, { stdout: '', stderr: '' });
        }
        return {} as ReturnType<typeof childProcess.execFile>;
      });

      await expect(spawner.spawn('fail1', true)).rejects.toThrow();
    });
  });

  describe('stop', () => {
    it('should call wrapper with stop command', async () => {
      await spawner.stop('hbc-session-abc123');

      expect(mockExecFile).toHaveBeenCalledTimes(1);
      const [cmd, args] = mockExecFile.mock.calls[0] as [string, string[]];

      expect(cmd).toBe('bash');
      expect(args[0]).toBe('/test/wrapper.sh');
      expect(args).toContain('stop');
      expect(args).toContain('hbc-session-abc123');
    });
  });

  describe('remove', () => {
    it('should call wrapper with rm command', async () => {
      await spawner.remove('hbc-session-abc123');

      expect(mockExecFile).toHaveBeenCalledTimes(1);
      const [cmd, args] = mockExecFile.mock.calls[0] as [string, string[]];

      expect(cmd).toBe('bash');
      expect(args[0]).toBe('/test/wrapper.sh');
      expect(args).toContain('rm');
      expect(args).toContain('hbc-session-abc123');
    });
  });

  describe('list', () => {
    it('should call wrapper with ps command and parse output', async () => {
      mockExecFile.mockImplementation((_cmd, _args, callback) => {
        if (typeof callback === 'function') {
          callback(null, {
            stdout: 'hbc-session-abc123 Up 5 minutes\nhbc-session-xyz789 Up 10 minutes\n',
            stderr: '',
          });
        }
        return {} as ReturnType<typeof childProcess.execFile>;
      });

      const containers = await spawner.list();

      expect(containers).toHaveLength(2);
      expect(containers[0]).toBe('hbc-session-abc123 Up 5 minutes');
      expect(containers[1]).toBe('hbc-session-xyz789 Up 10 minutes');
    });

    it('should return empty array when no containers', async () => {
      mockExecFile.mockImplementation((_cmd, _args, callback) => {
        if (typeof callback === 'function') {
          callback(null, { stdout: '', stderr: '' });
        }
        return {} as ReturnType<typeof childProcess.execFile>;
      });

      const containers = await spawner.list();

      expect(containers).toHaveLength(0);
    });
  });
});
