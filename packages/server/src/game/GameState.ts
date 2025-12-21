/**
 * @fileoverview Immutable game state - all mutations return a new GameState instance.
 * This makes the state predictable, testable, and easy to debug.
 *
 * GameState orchestrates the game by delegating to specialized systems:
 * - CollisionSystem: Block and projectile collision detection
 * - ProjectileSystem: Projectile movement and lifecycle
 * - CannonSystem: Cannon firing and cooldowns
 */

import {
  fireCannon as cannonSystemFire,
  fireCannonAuto as cannonSystemFireAuto,
  isCannonReady as cannonSystemIsReady,
} from './CannonSystem.js';
import { resolveBlockCollisions } from './CollisionSystem.js';
import { updateProjectiles as projectileSystemUpdate } from './ProjectileSystem.js';
import {
  BLOCK_COLLISION_ENABLED,
  BLOCK_COLORS,
  type Block,
  type BlockId,
  CANNON_COLOR,
  DEFAULT_GAME_CONFIG,
  type DestroyedBlockInfo,
  type GameConfig,
  type Player,
  type PlayerId,
  type PlayerNumber,
  type Position,
  type Projectile,
  type ProjectileId,
  clampToRoom,
  getPlayerSpawnZ,
} from './types.js';

/**
 * Immutable game state container.
 * All state-modifying methods return a new GameState instance.
 */
export class GameState {
  private constructor(
    private readonly _blocks: ReadonlyMap<BlockId, Block>,
    private readonly _players: ReadonlyMap<PlayerId, Player>,
    private readonly _projectiles: ReadonlyMap<ProjectileId, Projectile>,
    private readonly _cannonCooldowns: ReadonlyMap<BlockId, number>,
    private readonly _config: GameConfig,
    private readonly _nextProjectileId: number
  ) {}

  // ============ Static Constructors ============

  /**
   * Create a new empty game state with the given configuration.
   * @param config - Game configuration (defaults to DEFAULT_GAME_CONFIG)
   */
  static create(config: GameConfig = DEFAULT_GAME_CONFIG): GameState {
    return new GameState(new Map(), new Map(), new Map(), new Map(), config, 1);
  }

  // ============ Getters ============

  /** Read-only access to all blocks */
  get blocks(): ReadonlyMap<BlockId, Block> {
    return this._blocks;
  }

  /** Read-only access to all players */
  get players(): ReadonlyMap<PlayerId, Player> {
    return this._players;
  }

  /** Read-only access to all projectiles */
  get projectiles(): ReadonlyMap<ProjectileId, Projectile> {
    return this._projectiles;
  }

  /** Game configuration */
  get config(): GameConfig {
    return this._config;
  }

  /** Get a specific block by ID */
  getBlock(blockId: BlockId): Block | undefined {
    return this._blocks.get(blockId);
  }

  /** Get a specific player by ID */
  getPlayer(playerId: PlayerId): Player | undefined {
    return this._players.get(playerId);
  }

  /** Get a specific projectile by ID */
  getProjectile(projectileId: ProjectileId): Projectile | undefined {
    return this._projectiles.get(projectileId);
  }

  /** Get all blocks as an array */
  getBlocksArray(): Block[] {
    return Array.from(this._blocks.values());
  }

  /** Get all projectiles as an array */
  getProjectilesArray(): Projectile[] {
    return Array.from(this._projectiles.values());
  }

  /** Get current player count */
  getPlayerCount(): number {
    return this._players.size;
  }

  /**
   * Check if a cannon is ready to fire.
   * @param cannonId - ID of the cannon to check
   */
  isCannonReady(cannonId: BlockId): boolean {
    return cannonSystemIsReady(cannonId, this._cannonCooldowns);
  }

  /**
   * Get the next available player number, or null if game is full.
   */
  getNextPlayerNumber(): PlayerNumber | null {
    const hasPlayer1 = Array.from(this._players.values()).some((p) => p.number === 1);
    const hasPlayer2 = Array.from(this._players.values()).some((p) => p.number === 2);

    if (!hasPlayer1) return 1;
    if (!hasPlayer2) return 2;
    return null;
  }

  /**
   * Check if a block is owned by a specific player.
   */
  isBlockOwnedBy(blockId: BlockId, playerId: PlayerId): boolean {
    const block = this._blocks.get(blockId);
    return block?.ownerId === playerId;
  }

  /**
   * Check if a block is currently grabbed by a specific player.
   */
  isBlockGrabbedBy(blockId: BlockId, playerId: PlayerId): boolean {
    const player = this._players.get(playerId);
    return player?.grabbedBlockId === blockId;
  }

  // ============ Player Management ============

  /**
   * Add a player to the game and create their initial blocks.
   * @param playerId - Unique ID for the player
   * @param playerNumber - Player number (1 or 2)
   * @returns New game state with the player added
   */
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

    // Create blocks for this player
    const newBlocks = this.createPlayerBlocks(playerId, playerNumber);

    return new GameState(
      newBlocks,
      newPlayers,
      this._projectiles,
      this._cannonCooldowns,
      this._config,
      this._nextProjectileId
    );
  }

  private createPlayerBlocks(playerId: PlayerId, playerNumber: PlayerNumber): Map<BlockId, Block> {
    const newBlocks = new Map(this._blocks);
    const spawnZ = getPlayerSpawnZ(playerNumber, this._config.room);
    const { room } = this._config;

    // Create cannon block
    const cannonId = `${playerId}-cannon`;
    const cannonPosition: Position = {
      x: (Math.random() - 0.5) * (room.maxX - room.minX - 2),
      y: 0,
      z: spawnZ,
    };
    const cannonBlock: Block = {
      id: cannonId,
      position: clampToRoom(cannonPosition, room),
      color: CANNON_COLOR,
      ownerId: playerId,
      blockType: 'cannon',
    };
    newBlocks.set(cannonId, cannonBlock);

    // Create regular blocks
    for (let i = 0; i < this._config.blocksPerPlayer; i++) {
      const blockId = `${playerId}-block-${i}`;
      const colorIndex = i % BLOCK_COLORS.length;
      const color = BLOCK_COLORS[colorIndex];

      if (color === undefined) continue;

      const rawPosition: Position = {
        x: (Math.random() - 0.5) * (room.maxX - room.minX - 2),
        y: (Math.random() - 0.5) * (room.maxY - room.minY - 2),
        z: spawnZ,
      };

      const block: Block = {
        id: blockId,
        position: clampToRoom(rawPosition, room),
        color,
        ownerId: playerId,
        blockType: 'regular',
      };
      newBlocks.set(blockId, block);
    }

    return newBlocks;
  }

  /**
   * Remove a player and all their blocks/projectiles from the game.
   * @param playerId - ID of the player to remove
   * @returns New game state without the player
   */
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

    // Remove projectiles owned by this player
    const newProjectiles = new Map(this._projectiles);
    for (const [projectileId, projectile] of this._projectiles) {
      if (projectile.ownerId === playerId) {
        newProjectiles.delete(projectileId);
      }
    }

    return new GameState(
      newBlocks,
      newPlayers,
      newProjectiles,
      this._cannonCooldowns,
      this._config,
      this._nextProjectileId
    );
  }

  // ============ Block Interaction ============

  /**
   * Grab a block (start dragging it).
   * @param playerId - ID of the player grabbing
   * @param blockId - ID of the block to grab
   * @returns New game state with the grab recorded
   */
  grabBlock(playerId: PlayerId, blockId: BlockId): GameState {
    const player = this._players.get(playerId);
    const block = this._blocks.get(blockId);

    if (!player || !block) return this;
    if (block.ownerId !== playerId) return this; // Can only grab own blocks
    if (player.grabbedBlockId !== null) return this; // Already grabbing

    const newPlayer: Player = { ...player, grabbedBlockId: blockId };
    const newPlayers = new Map(this._players);
    newPlayers.set(playerId, newPlayer);

    return new GameState(
      this._blocks,
      newPlayers,
      this._projectiles,
      this._cannonCooldowns,
      this._config,
      this._nextProjectileId
    );
  }

  /**
   * Release a grabbed block.
   * @param playerId - ID of the player releasing
   * @returns New game state with the grab cleared
   */
  releaseBlock(playerId: PlayerId): GameState {
    const player = this._players.get(playerId);

    if (!player || player.grabbedBlockId === null) return this;

    const newPlayer: Player = { ...player, grabbedBlockId: null };
    const newPlayers = new Map(this._players);
    newPlayers.set(playerId, newPlayer);

    return new GameState(
      this._blocks,
      newPlayers,
      this._projectiles,
      this._cannonCooldowns,
      this._config,
      this._nextProjectileId
    );
  }

  /**
   * Move a block to a new position, handling collisions.
   * @param blockId - ID of the block to move
   * @param position - Target position
   * @returns Object containing new state and list of pushed blocks
   */
  moveBlock(
    blockId: BlockId,
    position: Position
  ): { state: GameState; pushedBlocks: Array<{ id: BlockId; position: Position }> } {
    const block = this._blocks.get(blockId);

    if (!block) {
      return { state: this, pushedBlocks: [] };
    }

    const clampedPosition = clampToRoom(position, this._config.room);
    const newBlock: Block = { ...block, position: clampedPosition };

    const newBlocks = new Map(this._blocks);
    newBlocks.set(blockId, newBlock);

    const pushedBlocks: Array<{ id: BlockId; position: Position }> = [];

    // Handle block-to-block collision if enabled
    if (BLOCK_COLLISION_ENABLED) {
      const originalPositions = new Map<BlockId, Position>();
      for (const [id, b] of newBlocks) {
        if (id !== blockId) {
          originalPositions.set(id, b.position);
        }
      }

      resolveBlockCollisions(newBlocks, blockId, clampedPosition, this._config.room);

      // Find blocks that were pushed
      for (const [id, b] of newBlocks) {
        const original = originalPositions.get(id);
        if (
          original &&
          (original.x !== b.position.x ||
            original.y !== b.position.y ||
            original.z !== b.position.z)
        ) {
          pushedBlocks.push({ id, position: b.position });
        }
      }
    }

    const newState = new GameState(
      newBlocks,
      this._players,
      this._projectiles,
      this._cannonCooldowns,
      this._config,
      this._nextProjectileId
    );

    return { state: newState, pushedBlocks };
  }

  // ============ Cannon & Projectile Methods ============

  /**
   * Fire a cannon as a specific player.
   * @param playerId - ID of the player firing
   * @param cannonId - ID of the cannon to fire
   * @returns Object containing new state and spawned projectile (or null)
   */
  fireCannon(
    playerId: PlayerId,
    cannonId: BlockId
  ): { state: GameState; projectile: Projectile | null } {
    const result = cannonSystemFire(
      playerId,
      cannonId,
      this._players,
      this._blocks,
      this._cannonCooldowns,
      this._nextProjectileId
    );

    if (!result.projectile) {
      return { state: this, projectile: null };
    }

    const newProjectiles = new Map(this._projectiles);
    newProjectiles.set(result.projectile.id, result.projectile);

    const newState = new GameState(
      this._blocks,
      this._players,
      newProjectiles,
      result.cooldowns,
      this._config,
      result.nextProjectileId
    );

    return { state: newState, projectile: result.projectile };
  }

  /**
   * Auto-fire a cannon (server-initiated).
   * @param cannonId - ID of the cannon to fire
   * @returns Object containing new state and spawned projectile (or null)
   */
  fireCannonAuto(cannonId: BlockId): { state: GameState; projectile: Projectile | null } {
    const result = cannonSystemFireAuto(
      cannonId,
      this._blocks,
      this._players,
      this._cannonCooldowns,
      this._nextProjectileId
    );

    if (!result.projectile) {
      return { state: this, projectile: null };
    }

    const newProjectiles = new Map(this._projectiles);
    newProjectiles.set(result.projectile.id, result.projectile);

    const newState = new GameState(
      this._blocks,
      this._players,
      newProjectiles,
      result.cooldowns,
      this._config,
      result.nextProjectileId
    );

    return { state: newState, projectile: result.projectile };
  }

  /**
   * Update all projectiles by deltaTime seconds.
   * @param deltaTime - Time elapsed in seconds
   * @returns Object containing new state and collision information
   */
  updateProjectiles(deltaTime: number): {
    state: GameState;
    destroyedProjectileIds: string[];
    destroyedBlocks: DestroyedBlockInfo[];
    wallHits: Array<{ position: Position; wallSide: 'minZ' | 'maxZ' }>;
  } {
    const result = projectileSystemUpdate(
      this._projectiles,
      this._blocks,
      this._config.room,
      deltaTime
    );

    const newState = new GameState(
      result.blocks,
      this._players,
      result.projectiles,
      this._cannonCooldowns,
      this._config,
      this._nextProjectileId
    );

    return {
      state: newState,
      destroyedProjectileIds: result.destroyedProjectileIds,
      destroyedBlocks: result.destroyedBlocks,
      wallHits: result.wallHits,
    };
  }

  /**
   * Remove a specific projectile.
   * @param projectileId - ID of the projectile to remove
   * @returns New game state without the projectile
   */
  removeProjectile(projectileId: ProjectileId): GameState {
    if (!this._projectiles.has(projectileId)) {
      return this;
    }

    const newProjectiles = new Map(this._projectiles);
    newProjectiles.delete(projectileId);

    return new GameState(
      this._blocks,
      this._players,
      newProjectiles,
      this._cannonCooldowns,
      this._config,
      this._nextProjectileId
    );
  }
}
