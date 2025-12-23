import { type Request, type Response, Router } from 'express';
import { DockerSpawner } from '../services/DockerSpawner.js';
import type { SessionStore } from '../services/SessionStore.js';
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  SessionStatusResponse,
} from '../types.js';

export function createSessionRouter(sessionStore: SessionStore): Router {
  const router = Router();
  const dockerSpawner = new DockerSpawner();

  /**
   * POST /api/sessions - Create a new game session
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const body = req.body as CreateSessionRequest;
      const { opponentType, botDifficulty } = body;

      if (!opponentType || (opponentType !== 'bot' && opponentType !== 'human')) {
        res.status(400).json({ error: 'Invalid opponentType. Must be "bot" or "human".' });
        return;
      }

      // Generate session ID and create session record
      const sessionId = sessionStore.generateSessionId();
      const session = sessionStore.create(sessionId, opponentType);

      // Spawn Docker container
      try {
        await dockerSpawner.spawn(sessionId, opponentType === 'bot', botDifficulty);
        sessionStore.updateStatus(sessionId, opponentType === 'bot' ? 'active' : 'waiting');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to spawn container';
        sessionStore.updateStatus(sessionId, 'error', errorMessage);
        res.status(500).json({ error: errorMessage });
        return;
      }

      const response: CreateSessionResponse = {
        sessionId: session.id,
        gameUrl: session.gameUrl,
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
      status: session.status,
      gameUrl: session.gameUrl,
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
