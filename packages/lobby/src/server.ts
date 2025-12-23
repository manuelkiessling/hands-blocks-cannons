import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';
import { createSessionRouter } from './routes/sessions.js';
import { SessionStore } from './services/SessionStore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createServer(): Express {
  const app = express();
  const sessionStore = new SessionStore();

  // Middleware
  app.use(express.json());

  // API routes
  app.use('/api/sessions', createSessionRouter(sessionStore));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Serve static frontend files
  const publicDir = join(__dirname, '..', 'public');
  app.use(express.static(publicDir));

  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (_req, res) => {
    res.sendFile(join(publicDir, 'index.html'));
  });

  return app;
}
