import {
  type AppManifest,
  AppNotFoundError,
  globalRegistry,
} from '@gesture-app/framework-protocol';
import { type Request, type Response, Router } from 'express';
import { DockerSpawner } from '../services/DockerSpawner.js';
import type { SessionStore } from '../services/SessionStore.js';
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  SessionStatusResponse,
} from '../types.js';

/**
 * Validate that an appId exists in the registry.
 * @returns The app manifest if found
 * @throws AppNotFoundError if not found
 */
function validateAppId(appId: string): AppManifest {
  return globalRegistry.get(appId);
}

export function createSessionRouter(sessionStore: SessionStore): Router {
  const router = Router();
  const dockerSpawner = new DockerSpawner();

  /**
   * GET /api/apps - List available applications
   */
  router.get('/apps', (_req: Request, res: Response) => {
    const apps = globalRegistry.listAll();
    res.json({ apps });
  });

  /**
   * POST /api/sessions - Create a new app session
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const body = req.body as CreateSessionRequest;
      const { appId, opponentType, botDifficulty } = body;

      // Validate appId
      if (!appId || typeof appId !== 'string') {
        res.status(400).json({ error: 'appId is required' });
        return;
      }

      // Validate appId exists in registry
      try {
        validateAppId(appId);
      } catch (err) {
        if (err instanceof AppNotFoundError) {
          res.status(400).json({
            error: `Unknown application: ${appId}`,
            availableApps: globalRegistry.listIds(),
          });
          return;
        }
        throw err;
      }

      // Validate opponentType
      if (!opponentType || (opponentType !== 'bot' && opponentType !== 'human')) {
        res.status(400).json({ error: 'Invalid opponentType. Must be "bot" or "human".' });
        return;
      }

      // Generate session ID and create session record
      const sessionId = sessionStore.generateSessionId();
      const session = sessionStore.create(sessionId, appId, opponentType);

      // Spawn Docker container
      try {
        await dockerSpawner.spawn(sessionId, appId, opponentType === 'bot', botDifficulty);
        sessionStore.updateStatus(sessionId, opponentType === 'bot' ? 'active' : 'waiting');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to spawn container';
        sessionStore.updateStatus(sessionId, 'error', errorMessage);
        res.status(500).json({ error: errorMessage });
        return;
      }

      const response: CreateSessionResponse = {
        sessionId: session.id,
        appId: session.appId,
        sessionUrl: session.sessionUrl,
        joinUrl: session.joinUrl,
      };

      res.status(201).json(response);
    } catch (err) {
      console.error('Error creating session:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /api/sessions/:id - Get session status
   */
  router.get('/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const session = sessionStore.get(id ?? '');

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const response: SessionStatusResponse = {
      sessionId: session.id,
      appId: session.appId,
      status: session.status,
      sessionUrl: session.sessionUrl,
      joinUrl: session.joinUrl,
      errorMessage: session.errorMessage,
    };

    res.json(response);
  });

  /**
   * DELETE /api/sessions/:id - End a session
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    const { id } = req.params;
    const session = sessionStore.get(id ?? '');

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    try {
      await dockerSpawner.stop(session.containerName);
      await dockerSpawner.remove(session.containerName);
      sessionStore.updateStatus(id ?? '', 'ended');
      res.json({ message: 'Session ended' });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to stop container';
      console.error('Error stopping session:', errorMessage);
      res.status(500).json({ error: errorMessage });
    }
  });

  return router;
}
