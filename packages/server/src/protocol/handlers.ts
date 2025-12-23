/**
 * @fileoverview Protocol message handlers using a registry pattern.
 * Each message type has a dedicated handler function registered in the handlers map.
 * This makes the system easily extensible - just add a new handler function.
 */

import type { WebSocket } from 'ws';
import type { GameState } from '../game/GameState.js';
import type { PlayerId, Position } from '../game/types.js';
import { logger } from '../utils/logger.js';
import {
  type ClientMessage,
  parseClientMessage,
  type ServerMessage,
  serializeServerMessage,
} from './messages.js';

// ============ Types ============

/**
 * Context for handling a message from a connected client.
 */
export interface ConnectionContext {
  /** WebSocket connection */
  ws: WebSocket;
  /** ID of the player who sent the message */
  playerId: PlayerId;
}

/**
 * Target for sending a response message.
 */
export type MessageTarget = 'sender' | 'opponent' | 'all';

/**
 * A response to be sent after handling a message.
 */
export interface MessageResponse {
  target: MessageTarget;
  message: ServerMessage;
}

/**
 * Result of handling a message.
 */
export interface MessageHandlerResult {
  /** Updated game state */
  newState: GameState;
  /** Messages to send in response */
  responses: MessageResponse[];
}

/**
 * Handler function type for a specific message type.
 */
type MessageHandler<T extends ClientMessage> = (
  message: T,
  context: ConnectionContext,
  state: GameState
) => MessageHandlerResult;

// ============ Handler Registry ============

/**
 * Registry of message handlers by type.
 * Add new handlers here to extend the protocol.
 */
const messageHandlers: {
  [K in ClientMessage['type']]: MessageHandler<Extract<ClientMessage, { type: K }>>;
} = {
  join_game: handleJoinGame,
  block_grab: handleBlockGrab,
  block_move: handleBlockMove,
  block_release: handleBlockRelease,
  cannon_fire: handleCannonFire,
};

// ============ Main Handler ============

/**
 * Handle an incoming client message by dispatching to the appropriate handler.
 * @param message - Parsed client message
 * @param context - Connection context
 * @param state - Current game state
 * @returns Handler result with new state and responses
 */
export function handleMessage(
  message: ClientMessage,
  context: ConnectionContext,
  state: GameState
): MessageHandlerResult {
  const handler = messageHandlers[message.type];
  // TypeScript ensures handler exists due to exhaustive type checking
  return handler(message as never, context, state);
}

// ============ Individual Handlers ============

/**
 * Handle join_game message.
 * Note: Actual join logic is in GameManager.handleConnection.
 */
function handleJoinGame(
  _message: Extract<ClientMessage, { type: 'join_game' }>,
  _context: ConnectionContext,
  state: GameState
): MessageHandlerResult {
  // Handled separately in GameManager.handleConnection
  return { newState: state, responses: [] };
}

/**
 * Handle block_grab message - player wants to grab a block.
 */
function handleBlockGrab(
  message: Extract<ClientMessage, { type: 'block_grab' }>,
  context: ConnectionContext,
  state: GameState
): MessageHandlerResult {
  const { blockId } = message;
  const newState = state.grabBlock(context.playerId, blockId);

  // Only broadcast if the grab was successful (state changed)
  if (newState !== state) {
    return {
      newState,
      responses: [
        {
          target: 'opponent',
          message: {
            type: 'block_grabbed',
            playerId: context.playerId,
            blockId,
          },
        },
      ],
    };
  }

  return { newState: state, responses: [] };
}

/**
 * Handle block_move message - player is moving a grabbed block.
 */
function handleBlockMove(
  message: Extract<ClientMessage, { type: 'block_move' }>,
  context: ConnectionContext,
  state: GameState
): MessageHandlerResult {
  const { blockId, position } = message;

  // Validate ownership and grab state
  if (!state.isBlockOwnedBy(blockId, context.playerId)) {
    return { newState: state, responses: [] };
  }

  if (!state.isBlockGrabbedBy(blockId, context.playerId)) {
    return { newState: state, responses: [] };
  }

  const { state: newState, pushedBlocks } = state.moveBlock(blockId, position);
  const resolvedMoverPos = newState.getBlock(blockId)?.position ?? position;

  const responses: MessageResponse[] = [
    createBlockMovedResponse('opponent', context.playerId, blockId, resolvedMoverPos),
  ];

  // Broadcast pushed blocks to ALL players (including the mover)
  for (const pushed of pushedBlocks) {
    responses.push(createBlockMovedResponse('all', context.playerId, pushed.id, pushed.position));
  }

  return { newState, responses };
}

/**
 * Handle block_release message - player releases a grabbed block.
 */
function handleBlockRelease(
  message: Extract<ClientMessage, { type: 'block_release' }>,
  context: ConnectionContext,
  state: GameState
): MessageHandlerResult {
  const { blockId } = message;
  const player = state.getPlayer(context.playerId);

  if (!player || player.grabbedBlockId !== blockId) {
    return { newState: state, responses: [] };
  }

  const newState = state.releaseBlock(context.playerId);

  return {
    newState,
    responses: [
      {
        target: 'opponent',
        message: {
          type: 'block_released',
          playerId: context.playerId,
          blockId,
        },
      },
    ],
  };
}

/**
 * Handle cannon_fire message - player fires their cannon.
 */
function handleCannonFire(
  message: Extract<ClientMessage, { type: 'cannon_fire' }>,
  context: ConnectionContext,
  state: GameState
): MessageHandlerResult {
  const { cannonId } = message;
  const { state: newState, projectile } = state.fireCannon(context.playerId, cannonId);

  if (!projectile) {
    // Fire failed (cooldown, not owned, etc.)
    return { newState: state, responses: [] };
  }

  return {
    newState,
    responses: [
      {
        target: 'all',
        message: {
          type: 'projectile_spawned',
          projectile,
        },
      },
    ],
  };
}

// ============ Helper Functions ============

/**
 * Create a block_moved response message.
 */
function createBlockMovedResponse(
  target: MessageTarget,
  playerId: PlayerId,
  blockId: string,
  position: Position
): MessageResponse {
  return {
    target,
    message: {
      type: 'block_moved',
      playerId,
      blockId,
      position,
    },
  };
}

// ============ Utility Functions ============

/**
 * Parse an incoming message from raw data.
 * @param data - Raw message data (string or object)
 * @returns Parsed ClientMessage or null if invalid
 */
export function parseIncomingMessage(data: unknown): ClientMessage | null {
  try {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    return parseClientMessage(parsed);
  } catch {
    logger.warn('Failed to parse incoming message');
    return null;
  }
}

/**
 * Send a message to a WebSocket client.
 * @param ws - WebSocket connection
 * @param message - Message to send
 */
export function sendMessage(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(serializeServerMessage(message));
  }
}
