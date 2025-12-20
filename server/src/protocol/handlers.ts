import type { WebSocket } from 'ws';
import type { GameState } from '../game/GameState.js';
import type { PlayerId } from '../game/types.js';
import { logger } from '../utils/logger.js';
import {
  type ClientMessage,
  type ServerMessage,
  parseClientMessage,
  serializeServerMessage,
} from './messages.js';

export interface ConnectionContext {
  ws: WebSocket;
  playerId: PlayerId;
}

export interface MessageHandlerResult {
  newState: GameState;
  responses: Array<{ target: 'sender' | 'opponent' | 'all'; message: ServerMessage }>;
}

export function handleMessage(
  message: ClientMessage,
  context: ConnectionContext,
  state: GameState
): MessageHandlerResult {
  switch (message.type) {
    case 'join_game':
      // Handled separately in GameManager
      return { newState: state, responses: [] };

    case 'block_grab':
      return handleBlockGrab(message.blockId, context, state);

    case 'block_move':
      return handleBlockMove(message.blockId, message.position, context, state);

    case 'block_release':
      return handleBlockRelease(message.blockId, context, state);

    case 'cannon_fire':
      return handleCannonFire(message.cannonId, context, state);
  }
}

function handleBlockGrab(
  blockId: string,
  context: ConnectionContext,
  state: GameState
): MessageHandlerResult {
  const newState = state.grabBlock(context.playerId, blockId);

  // Only broadcast if the grab was successful
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

function handleBlockMove(
  blockId: string,
  position: { x: number; y: number; z: number },
  context: ConnectionContext,
  state: GameState
): MessageHandlerResult {
  // Only allow moving blocks you own and are grabbing
  if (!state.isBlockOwnedBy(blockId, context.playerId)) {
    return { newState: state, responses: [] };
  }

  if (!state.isBlockGrabbedBy(blockId, context.playerId)) {
    return { newState: state, responses: [] };
  }

  const { state: newState, pushedBlocks } = state.moveBlock(blockId, position);

  const responses: MessageHandlerResult['responses'] = [
    {
      target: 'opponent',
      message: {
        type: 'block_moved',
        playerId: context.playerId,
        blockId,
        position,
      },
    },
  ];

  // Broadcast pushed blocks to ALL players (including the mover)
  for (const pushed of pushedBlocks) {
    responses.push({
      target: 'all',
      message: {
        type: 'block_moved',
        playerId: context.playerId,
        blockId: pushed.id,
        position: pushed.position,
      },
    });
  }

  return { newState, responses };
}

function handleBlockRelease(
  blockId: string,
  context: ConnectionContext,
  state: GameState
): MessageHandlerResult {
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

function handleCannonFire(
  cannonId: string,
  context: ConnectionContext,
  state: GameState
): MessageHandlerResult {
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

export function parseIncomingMessage(data: unknown): ClientMessage | null {
  try {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    return parseClientMessage(parsed);
  } catch {
    logger.warn('Failed to parse incoming message');
    return null;
  }
}

export function sendMessage(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(serializeServerMessage(message));
  }
}
