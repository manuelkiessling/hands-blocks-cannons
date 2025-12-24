import { BlockGameServer } from './server.js';
import { logger } from './utils/logger.js';

// biome-ignore lint/complexity/useLiteralKeys: Required for noPropertyAccessFromIndexSignature
const PORT = Number(process.env['PORT']) || 3001;

logger.info('Starting Block Game Server...');

const server = new BlockGameServer({
  port: PORT,
  onInactivityShutdown: (reason: string) => {
    logger.info('Inactivity shutdown triggered', { reason });
    server.close();
    process.exit(0);
  },
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down...');
  server.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down...');
  server.close();
  process.exit(0);
});
