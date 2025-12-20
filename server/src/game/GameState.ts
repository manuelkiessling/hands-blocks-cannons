import {
  BLOCK_COLORS,
  type Block,
  type BlockId,
  DEFAULT_GAME_CONFIG,
  type GameConfig,
  type Player,
  type PlayerId,
  type PlayerNumber,
  type Position,
  clampToRoom,
  getPlayerSpawnArea,
} from './types.js';

/**
 * Immutable game state - all mutations return a new GameState instance.
 * This makes the state predictable, testable, and easy to debug.
 */
export class GameState {
  private constructor(
    private readonly _blocks: ReadonlyMap<BlockId, Block>,
    private readonly _players: ReadonlyMap<PlayerId, Player>,
    private readonly _config: GameConfig
  ) {}

  // ============ Static Constructors ============

  static create(config: GameConfig = DEFAULT_GAME_CONFIG): GameState {
    return new GameState(new Map(), new Map(), config);
  }

  // ============ Getters ============

  get blocks(): ReadonlyMap<BlockId, Block> {
    return this._blocks;
  }

  get players(): ReadonlyMap<PlayerId, Player> {
    return this._players;
  }

  get config(): GameConfig {
    return this._config;
  }

  getBlock(blockId: BlockId): Block | undefined {
    return this._blocks.get(blockId);
  }

  getPlayer(playerId: PlayerId): Player | undefined {
    return this._players.get(playerId);
  }

  getBlocksArray(): Block[] {
    return Array.from(this._blocks.values());
  }

  getPlayerCount(): number {
    return this._players.size;
  }

  getNextPlayerNumber(): PlayerNumber | null {
    const hasPlayer1 = Array.from(this._players.values()).some((p) => p.number === 1);
    const hasPlayer2 = Array.from(this._players.values()).some((p) => p.number === 2);

    if (!hasPlayer1) return 1;
    if (!hasPlayer2) return 2;
    return null;
  }

  isBlockOwnedBy(blockId: BlockId, playerId: PlayerId): boolean {
    const block = this._blocks.get(blockId);
    return block?.ownerId === playerId;
  }

  isBlockGrabbedBy(blockId: BlockId, playerId: PlayerId): boolean {
    const player = this._players.get(playerId);
    return player?.grabbedBlockId === blockId;
  }

  // ============ Immutable Updates ============

  addPlayer(playerId: PlayerId, playerNumber: PlayerNumber): GameState {
    if (this._players.has(playerId)) {
      return this; // Player already exists
    }

    const newPlayer: Player = {
      id: playerId,
      number: playerNumber,
      grabbedBlockId: null,
    };

    const newPlayers = new Map(this._players);
    newPlayers.set(playerId, newPlayer);

    // Create blocks for this player in their spawn area
    const newBlocks = new Map(this._blocks);
    const spawnArea = getPlayerSpawnArea(playerNumber, this._config.room);

    for (let i = 0; i < this._config.blocksPerPlayer; i++) {
      const blockId = `${playerId}-block-${i}`;
      const colorIndex = i % BLOCK_COLORS.length;
      const color = BLOCK_COLORS[colorIndex];

      if (color === undefined) {
        continue; // Safety check for noUncheckedIndexedAccess
      }

      // Spawn blocks spread out in the player's area
      const rawPosition: Position = {
        x: spawnArea.x + (Math.random() - 0.5) * 6,
        y: spawnArea.y + (Math.random() - 0.5) * 4,
        z: spawnArea.z + (Math.random() - 0.5) * 3,
      };

      const block: Block = {
        id: blockId,
        position: clampToRoom(rawPosition, this._config.room),
        color,
        ownerId: playerId,
      };
      newBlocks.set(blockId, block);
    }

    return new GameState(newBlocks, newPlayers, this._config);
  }

  removePlayer(playerId: PlayerId): GameState {
    if (!this._players.has(playerId)) {
      return this;
    }

    const newPlayers = new Map(this._players);
    newPlayers.delete(playerId);

    // Remove blocks owned by this player
    const newBlocks = new Map(this._blocks);
    for (const [blockId, block] of this._blocks) {
      if (block.ownerId === playerId) {
        newBlocks.delete(blockId);
      }
    }

    return new GameState(newBlocks, newPlayers, this._config);
  }

  grabBlock(playerId: PlayerId, blockId: BlockId): GameState {
    const player = this._players.get(playerId);
    const block = this._blocks.get(blockId);

    if (!player || !block) {
      return this;
    }

    // Can only grab your own blocks
    if (block.ownerId !== playerId) {
      return this;
    }

    // Already grabbing something
    if (player.grabbedBlockId !== null) {
      return this;
    }

    const newPlayer: Player = {
      ...player,
      grabbedBlockId: blockId,
    };

    const newPlayers = new Map(this._players);
    newPlayers.set(playerId, newPlayer);

    return new GameState(this._blocks, newPlayers, this._config);
  }

  releaseBlock(playerId: PlayerId): GameState {
    const player = this._players.get(playerId);

    if (!player || player.grabbedBlockId === null) {
      return this;
    }

    const newPlayer: Player = {
      ...player,
      grabbedBlockId: null,
    };

    const newPlayers = new Map(this._players);
    newPlayers.set(playerId, newPlayer);

    return new GameState(this._blocks, newPlayers, this._config);
  }

  moveBlock(blockId: BlockId, position: Position): GameState {
    const block = this._blocks.get(blockId);

    if (!block) {
      return this;
    }

    // Clamp position to room bounds
    const clampedPosition = clampToRoom(position, this._config.room);

    const newBlock: Block = {
      ...block,
      position: clampedPosition,
    };

    const newBlocks = new Map(this._blocks);
    newBlocks.set(blockId, newBlock);

    return new GameState(newBlocks, this._players, this._config);
  }
}
