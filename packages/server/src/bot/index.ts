import { logger } from '../utils/logger.js';
import { BotClient } from './BotClient.js';

// Parse command line arguments
const args = process.argv.slice(2);
const serverUrl = args[0] ?? 'ws://localhost:3001';

// Parse optional config from environment
// Using bracket notation required by noPropertyAccessFromIndexSignature
const config = {
  // biome-ignore lint/complexity/useLiteralKeys: TS noPropertyAccessFromIndexSignature
  actionInterval: Number(process.env['BOT_ACTION_INTERVAL']) || 2000,
  // biome-ignore lint/complexity/useLiteralKeys: TS noPropertyAccessFromIndexSignature
  moveSpeed: Number(process.env['BOT_MOVE_SPEED']) || 50,
  // biome-ignore lint/complexity/useLiteralKeys: TS noPropertyAccessFromIndexSignature
  moveDuration: Number(process.env['BOT_MOVE_DURATION']) || 1500,
  // biome-ignore lint/complexity/useLiteralKeys: TS noPropertyAccessFromIndexSignature
  moveRange: Number(process.env['BOT_MOVE_RANGE']) || 3,
};

logger.info('Starting bot player', { serverUrl, config });

const bot = new BotClient(config);
bot.connect(serverUrl);

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, disconnecting bot...');
  bot.disconnect();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, disconnecting bot...');
  bot.disconnect();
  process.exit(0);
});
