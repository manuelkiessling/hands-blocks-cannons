import { createServer } from './server.js';

// biome-ignore lint/complexity/useLiteralKeys: Required for noPropertyAccessFromIndexSignature
const PORT = Number(process.env['PORT']) || 3002;

console.log('Starting Lobby Server...');

const app = createServer();

const httpServer = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Lobby server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  httpServer.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  httpServer.close();
  process.exit(0);
});
