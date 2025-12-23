import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Docker spawner that uses the docker-cli-wrapper.sh script.
 */
export class DockerSpawner {
  private readonly wrapperPath: string;
  private readonly imageName = 'hbc-game-session';
  private readonly network = 'outermost_router';
  private readonly baseDomain = 'hands-blocks-cannons.dx-tooling.org';

  constructor() {
    // biome-ignore lint/complexity/useLiteralKeys: Required for noPropertyAccessFromIndexSignature
    this.wrapperPath = process.env['DOCKER_WRAPPER_PATH'] || '/app/bin/docker-cli-wrapper.sh';
  }

  /**
   * Spawn a new game session container.
   */
  async spawn(sessionId: string, withBot: boolean, botDifficulty = 0.5): Promise<void> {
    const containerName = `hbc-session-${sessionId}`;
    const hostname = `${sessionId}-${this.baseDomain}`;
    const routerName = `hbc-${sessionId}`;

    const args = [
      'run',
      '-d',
      '--name',
      containerName,
      '--network',
      this.network,
      // Environment variables
      '-e',
      `SESSION_ID=${sessionId}`,
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
      `traefik.docker.network=${this.network}`,
      '-l',
      `traefik.http.routers.${routerName}.rule=Host(\`${hostname}\`)`,
      '-l',
      `traefik.http.routers.${routerName}.entrypoints=websecure`,
      '-l',
      `traefik.http.routers.${routerName}.tls=true`,
      '-l',
      `traefik.http.services.${routerName}.loadbalancer.server.port=80`,
      // Image
      this.imageName,
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
   */
  private async exec(args: string[]): Promise<{ stdout: string; stderr: string }> {
    try {
      return await execFileAsync('sudo', ['-n', this.wrapperPath, ...args]);
    } catch (err) {
      if (err instanceof Error && 'stderr' in err) {
        throw new Error(`Docker command failed: ${(err as { stderr: string }).stderr}`);
      }
      throw err;
    }
  }
}
