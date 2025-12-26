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

  // AI configuration
  // biome-ignore lint/complexity/useLiteralKeys: TS noPropertyAccessFromIndexSignature
  useAI: process.env['BOT_USE_AI'] !== 'false', // Default: true
  // biome-ignore lint/complexity/useLiteralKeys: TS noPropertyAccessFromIndexSignature
  difficulty: Number(process.env['BOT_DIFFICULTY']) || 0.5, // 0-1 scale
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

export * from './BotAI.js';
export * from './BotBehavior.js';
export type { BotConfig } from './BotClient.js';
// Export for programmatic use
export { BotClient } from './BotClient.js';
export * from './BotMovement.js';
