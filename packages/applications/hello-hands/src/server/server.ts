/**
 * @fileoverview Hello Hands standalone WebSocket server.
 *
 * A minimal server that can be run directly to host hello-hands sessions.
 */

import { SessionRuntime } from '@gesture-app/framework-server';
import { type WebSocket, WebSocketServer } from 'ws';
import type {
  ClientMessage,
  HelloHandsResetData,
  HelloHandsWelcomeData,
  ServerMessage,
} from '../shared/protocol.js';
import { createHelloHandsConfig, HelloHandsHooks, parseMessage } from './HelloHandsSession.js';

// biome-ignore lint/complexity/useLiteralKeys: Required for noPropertyAccessFromIndexSignature
const PORT = Number(process.env['PORT']) || 8080;

console.log('[HelloHands] Starting server...');

// Create the session runtime
const hooks = new HelloHandsHooks();
const config = createHelloHandsConfig();

const runtime = new SessionRuntime<
  ClientMessage,
  ServerMessage,
  HelloHandsWelcomeData,
  HelloHandsResetData
>(config, hooks, (message) => JSON.stringify(message), parseMessage);

// Create WebSocket server
const wss = new WebSocketServer({ port: PORT });

console.log(`[HelloHands] WebSocket server listening on port ${PORT}`);

wss.on('connection', (ws: WebSocket) => {
  console.log('[HelloHands] New connection');

  const participant = runtime.handleConnection(ws);

  if (participant) {
    console.log(`[HelloHands] Participant ${participant.id} joined (${participant.number})`);
  }

  ws.on('message', (data: Buffer) => {
    runtime.handleMessage(ws, data.toString());
  });

  ws.on('close', () => {
    console.log('[HelloHands] Connection closed');
    runtime.handleDisconnection(ws);
  });

  ws.on('error', (error) => {
    console.error('[HelloHands] WebSocket error:', error);
  });
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('[HelloHands] Shutting down...');
  runtime.stop();
  wss.close(() => {
    console.log('[HelloHands] Server stopped');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[HelloHands] Interrupted, shutting down...');
  runtime.stop();
  wss.close(() => {
    process.exit(0);
  });
});
