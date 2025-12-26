import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Configuration for Docker spawner.
 */
export interface DockerSpawnerConfig {
  /** Path to the docker wrapper script */
  wrapperPath: string;
  /** Base image name (will be prefixed with appId) */
  baseImageName: string;
  /** Docker network name */
  network: string;
  /**
   * Base domain for routing.
   * Containers are hosted at: {sessionId}-{appId}-gestures.{baseDomain}
   * Example: xf46zra-blocks-cannons-gestures.dx-tooling.org
   */
  baseDomain: string;
}

/**
 * Default configuration.
 */
const DEFAULT_CONFIG: DockerSpawnerConfig = {
  wrapperPath: '/app/bin/docker-cli-wrapper.sh',
  baseImageName: 'game-session',
  network: 'outermost_router',
  baseDomain: 'dx-tooling.org',
};

/**
 * Docker spawner that uses the docker-cli-wrapper.sh script.
 */
export class DockerSpawner {
  private readonly config: DockerSpawnerConfig;

  constructor(config: Partial<DockerSpawnerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    // Allow environment variable override for wrapper path
    // biome-ignore lint/complexity/useLiteralKeys: Required for noPropertyAccessFromIndexSignature
    if (process.env['DOCKER_WRAPPER_PATH']) {
      // biome-ignore lint/complexity/useLiteralKeys: Required for noPropertyAccessFromIndexSignature
      this.config.wrapperPath = process.env['DOCKER_WRAPPER_PATH'];
    }
  }

  /**
   * Get the image name for an app.
   * Format: {appId}-{baseImageName}
   */
  private getImageName(appId: string): string {
    return `${appId}-${this.config.baseImageName}`;
  }

  /**
   * Spawn a new game session container.
   */
  async spawn(
    sessionId: string,
    appId: string,
    withBot: boolean,
    botDifficulty = 0.5
  ): Promise<void> {
    const containerName = `session-${appId}-${sessionId}`;
    const hostname = `${sessionId}-${appId}-gestures.${this.config.baseDomain}`;
    const routerName = `session-${appId}-${sessionId}`;
    const imageName = this.getImageName(appId);

    const args = [
      'run',
      '-d',
      '--rm', // Auto-remove container when it exits
      '--name',
      containerName,
      '--network',
      this.config.network,
      // Environment variables
      '-e',
      `SESSION_ID=${sessionId}`,
      '-e',
      `APP_ID=${appId}`,
      '-e',
      `WITH_BOT=${withBot}`,
      '-e',
      `BOT_DIFFICULTY=${botDifficulty}`,
      // Traefik labels
      '-l',
      'traefik.enable=true',
      '-l',
      'outermost_router.enable=true',
      '-l',
      `traefik.docker.network=${this.config.network}`,
      '-l',
      `traefik.http.routers.${routerName}.rule=Host(\`${hostname}\`)`,
      '-l',
      `traefik.http.routers.${routerName}.entrypoints=websecure`,
      '-l',
      `traefik.http.routers.${routerName}.tls=true`,
      '-l',
      `traefik.http.services.${routerName}.loadbalancer.server.port=80`,
      // Image
      imageName,
    ];

    try {
      await this.exec(args);
      console.log(`Spawned container: ${containerName}`);
    } catch (err) {
      console.error(`Failed to spawn container ${containerName}:`, err);
      throw err;
    }
  }

  /**
   * Stop a container.
   */
  async stop(containerName: string): Promise<void> {
    try {
      await this.exec(['stop', containerName]);
      console.log(`Stopped container: ${containerName}`);
    } catch (err) {
      console.error(`Failed to stop container ${containerName}:`, err);
      throw err;
    }
  }

  /**
   * Remove a container.
   */
  async remove(containerName: string): Promise<void> {
    try {
      await this.exec(['rm', containerName]);
      console.log(`Removed container: ${containerName}`);
    } catch (err) {
      console.error(`Failed to remove container ${containerName}:`, err);
      throw err;
    }
  }

  /**
   * List running game session containers.
   */
  async list(): Promise<string[]> {
    try {
      const { stdout } = await this.exec(['ps']);
      return stdout
        .trim()
        .split('\n')
        .filter((line) => line.length > 0);
    } catch (err) {
      console.error('Failed to list containers:', err);
      throw err;
    }
  }

  /**
   * Execute a docker command via the wrapper script.
   * The wrapper script is executed directly (no sudo) since the container
   * has access to the Docker socket mounted from the host.
   * We explicitly use bash to ensure the script executes even if permissions
   * aren't set correctly on the mounted volume.
   */
  private async exec(args: string[]): Promise<{ stdout: string; stderr: string }> {
    try {
      return await execFileAsync('bash', [this.config.wrapperPath, ...args]);
    } catch (err) {
      if (err instanceof Error && 'stderr' in err) {
        throw new Error(`Docker command failed: ${(err as { stderr: string }).stderr}`);
      }
      throw err;
    }
  }
}
