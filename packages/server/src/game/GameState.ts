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
import { blocksCollide, resolveBlockCollisions } from './CollisionSystem.js';
import { updateProjectiles as projectileSystemUpdate } from './ProjectileSystem.js';
import {
  BLOCK_COLLISION_ENABLED,
  BLOCK_COLORS,
  type Block,
  type BlockId,
  CANNON_COLOR,
  clampToRoom,
  DEFAULT_GAME_CONFIG,
  type DestroyedBlockInfo,
  type GameConfig,
  type GamePhase,
  getPlayerSpawnZ,
  MAX_GRABBED_BLOCKS,
  type Player,
  type PlayerId,
  type PlayerNumber,
  type Position,
  type Projectile,
  type ProjectileId,
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
    private readonly _nextProjectileId: number,
    private readonly _gamePhase: GamePhase = 'waiting'
  ) {}

  // ============ Static Constructors ============

  /**
   * Create a new empty game state with the given configuration.
   * @param config - Game configuration (defaults to DEFAULT_GAME_CONFIG)
   */
  static create(config: GameConfig = DEFAULT_GAME_CONFIG): GameState {
    return new GameState(new Map(), new Map(), new Map(), new Map(), config, 1, 'waiting');
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

  /** Current game phase */
  get gamePhase(): GamePhase {
    return this._gamePhase;
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
    return player?.grabbedBlockIds.includes(blockId) ?? false;
  }

  /**
   * Check if a block is currently grabbed by any player.
   */
  isBlockGrabbed(blockId: BlockId): boolean {
    for (const player of this._players.values()) {
      if (player.grabbedBlockIds.includes(blockId)) {
        return true;
      }
    }
    return false;
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
      grabbedBlockIds: [],
      isBot: false,
      isReady: false,
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
      this._nextProjectileId,
      this._gamePhase
    );
  }

  /**
   * Find a valid spawn position that doesn't overlap with existing blocks.
   * @param existingBlocks - Map of already placed blocks
   * @param spawnZ - Z coordinate for spawning
   * @param room - Room bounds
   * @param includeY - Whether to randomize Y (true for regular blocks, false for cannon)
   * @param maxAttempts - Maximum attempts before giving up
   * @returns A valid position or the last attempted position if max attempts reached
   */
  private findValidSpawnPosition(
    existingBlocks: ReadonlyMap<BlockId, Block>,
    spawnZ: number,
    room: { minX: number; maxX: number; minY: number; maxY: number },
    includeY: boolean,
    maxAttempts = 50
  ): Position {
    const minSeparation = 1.2; // Slightly larger than block size to ensure no overlap

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidate: Position = {
        x: (Math.random() - 0.5) * (room.maxX - room.minX - 2),
        y: includeY ? (Math.random() - 0.5) * (room.maxY - room.minY - 2) : 0,
        z: spawnZ,
      };

      // Check against all existing blocks
      let hasCollision = false;
      for (const block of existingBlocks.values()) {
        if (blocksCollide(candidate, block.position, minSeparation)) {
          hasCollision = true;
          break;
        }
      }

      if (!hasCollision) {
        return candidate;
      }
    }

    // Fallback: return a position even if it might overlap (shouldn't happen with reasonable block counts)
    return {
      x: (Math.random() - 0.5) * (room.maxX - room.minX - 2),
      y: includeY ? (Math.random() - 0.5) * (room.maxY - room.minY - 2) : 0,
      z: spawnZ,
    };
  }

  private createPlayerBlocks(playerId: PlayerId, playerNumber: PlayerNumber): Map<BlockId, Block> {
    const newBlocks = new Map(this._blocks);
    const spawnZ = getPlayerSpawnZ(playerNumber, this._config.room);
    const { room } = this._config;

    // Create cannon block with collision-free position
    const cannonId = `${playerId}-cannon`;
    const cannonPosition = this.findValidSpawnPosition(newBlocks, spawnZ, room, false);
    const cannonBlock: Block = {
      id: cannonId,
      position: clampToRoom(cannonPosition, room),
      color: CANNON_COLOR,
      ownerId: playerId,
      blockType: 'cannon',
    };
    newBlocks.set(cannonId, cannonBlock);

    // Create regular blocks with collision-free positions
    for (let i = 0; i < this._config.blocksPerPlayer; i++) {
      const blockId = `${playerId}-block-${i}`;
      const colorIndex = i % BLOCK_COLORS.length;
      const color = BLOCK_COLORS[colorIndex];

      if (color === undefined) continue;

      const rawPosition = this.findValidSpawnPosition(newBlocks, spawnZ, room, true);

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
      this._nextProjectileId,
      this._gamePhase
    );
  }

  /**
   * Mark a player as a bot.
   * @param playerId - ID of the player to mark as bot
   * @returns New game state with the player marked as bot
   */
  markPlayerAsBot(playerId: PlayerId): GameState {
    const player = this._players.get(playerId);
    if (!player) return this;

    const newPlayer: Player = { ...player, isBot: true, isReady: true };
    const newPlayers = new Map(this._players);
    newPlayers.set(playerId, newPlayer);

    return new GameState(
      this._blocks,
      newPlayers,
      this._projectiles,
      this._cannonCooldowns,
      this._config,
      this._nextProjectileId,
      this._gamePhase
    );
  }

  /**
   * Mark a player as ready (they raised their hand).
   * @param playerId - ID of the player to mark as ready
   * @returns New game state with the player marked as ready
   */
  markPlayerReady(playerId: PlayerId): GameState {
    const player = this._players.get(playerId);
    if (!player || player.isReady) return this;

    const newPlayer: Player = { ...player, isReady: true };
    const newPlayers = new Map(this._players);
    newPlayers.set(playerId, newPlayer);

    return new GameState(
      this._blocks,
      newPlayers,
      this._projectiles,
      this._cannonCooldowns,
      this._config,
      this._nextProjectileId,
      this._gamePhase
    );
  }

  /**
   * Check if all human players are ready.
   * @returns true if all non-bot players have isReady === true
   */
  areAllHumansReady(): boolean {
    for (const player of this._players.values()) {
      if (!player.isBot && !player.isReady) {
        return false;
      }
    }
    // At least one human must be connected
    const hasHuman = Array.from(this._players.values()).some((p) => !p.isBot);
    return hasHuman;
  }

  /**
   * Transition the game to the playing phase.
   * @returns New game state with playing phase
   */
  startGame(): GameState {
    if (this._gamePhase === 'playing') return this;

    return new GameState(
      this._blocks,
      this._players,
      this._projectiles,
      this._cannonCooldowns,
      this._config,
      this._nextProjectileId,
      'playing'
    );
  }

  /**
   * Transition the game to a specific phase.
   * @param phase - Target game phase
   * @returns New game state with the given phase
   */
  setGamePhase(phase: GamePhase): GameState {
    if (this._gamePhase === phase) return this;

    return new GameState(
      this._blocks,
      this._players,
      this._projectiles,
      this._cannonCooldowns,
      this._config,
      this._nextProjectileId,
      phase
    );
  }

  /**
   * Get the count of regular (non-cannon) blocks for a player.
   * @param playerId - ID of the player
   * @returns Number of regular blocks the player has
   */
  getRegularBlockCountForPlayer(playerId: PlayerId): number {
    let count = 0;
    for (const block of this._blocks.values()) {
      if (block.ownerId === playerId && block.blockType === 'regular') {
        count++;
      }
    }
    return count;
  }

  /**
   * Check if there's a winner (opponent has 0 regular blocks).
   * @returns Winner info or null if no winner yet
   */
  checkForWinner(): { winnerId: PlayerId; winnerNumber: PlayerNumber } | null {
    const players = Array.from(this._players.values());
    if (players.length !== 2) return null;

    for (const player of players) {
      const regularBlockCount = this.getRegularBlockCountForPlayer(player.id);
      if (regularBlockCount === 0) {
        // This player lost - find the opponent (winner)
        const winner = players.find((p) => p.id !== player.id);
        if (winner) {
          return { winnerId: winner.id, winnerNumber: winner.number };
        }
      }
    }

    return null;
  }

  /**
   * Mark a player as wanting to play again.
   * @param playerId - ID of the player voting
   * @returns New game state with the vote recorded
   */
  markPlayerWantsPlayAgain(playerId: PlayerId): GameState {
    const player = this._players.get(playerId);
    if (!player || player.wantsPlayAgain) return this;

    const newPlayer: Player = { ...player, wantsPlayAgain: true };
    const newPlayers = new Map(this._players);
    newPlayers.set(playerId, newPlayer);

    return new GameState(
      this._blocks,
      newPlayers,
      this._projectiles,
      this._cannonCooldowns,
      this._config,
      this._nextProjectileId,
      this._gamePhase
    );
  }

  /**
   * Check if all players have voted to play again.
   * @returns true if all players want to play again
   */
  allPlayersWantPlayAgain(): boolean {
    if (this._players.size === 0) return false;

    for (const player of this._players.values()) {
      if (!player.wantsPlayAgain) return false;
    }
    return true;
  }

  /**
   * Get the list of player IDs who have voted to play again.
   */
  getPlayAgainVoters(): PlayerId[] {
    return Array.from(this._players.values())
      .filter((p) => p.wantsPlayAgain)
      .map((p) => p.id);
  }

  /**
   * Reset the game for a new round.
   * Clears all blocks and projectiles, creates fresh blocks for existing players.
   * Resets players' ready and wantsPlayAgain status.
   * @returns New game state ready for a new round
   */
  resetForNewRound(): GameState {
    // Start with empty blocks and projectiles
    let newBlocks = new Map<BlockId, Block>();
    const newProjectiles = new Map<ProjectileId, Projectile>();
    const newCooldowns = new Map<BlockId, number>();

    // Reset player states
    const newPlayers = new Map<PlayerId, Player>();
    for (const player of this._players.values()) {
      const resetPlayer: Player = {
        ...player,
        grabbedBlockIds: [],
        isReady: !!player.isBot, // Bots stay ready, humans need to raise hand
        wantsPlayAgain: false,
      };
      newPlayers.set(player.id, resetPlayer);
    }

    // Create new state with reset players
    let newState = new GameState(
      newBlocks,
      newPlayers,
      newProjectiles,
      newCooldowns,
      this._config,
      1, // Reset projectile ID counter
      'waiting'
    );

    // Create fresh blocks for each player
    for (const player of newPlayers.values()) {
      newBlocks = newState.createPlayerBlocks(player.id, player.number);
      newState = new GameState(
        newBlocks,
        newPlayers,
        newProjectiles,
        newCooldowns,
        this._config,
        1,
        'waiting'
      );
    }

    return newState;
  }

  // ============ Block Interaction ============

  /**
   * Grab a block (start dragging it).
   * If player is already holding MAX_GRABBED_BLOCKS, releases the oldest grab first.
   * @param playerId - ID of the player grabbing
   * @param blockId - ID of the block to grab
   * @returns Object with new state and optionally the released block ID
   */
  grabBlock(
    playerId: PlayerId,
    blockId: BlockId
  ): { state: GameState; releasedBlockId: BlockId | null } {
    const player = this._players.get(playerId);
    const block = this._blocks.get(blockId);

    if (!player || !block) return { state: this, releasedBlockId: null };
    if (block.ownerId !== playerId) return { state: this, releasedBlockId: null }; // Can only grab own blocks
    if (player.grabbedBlockIds.includes(blockId)) return { state: this, releasedBlockId: null }; // Already grabbing this block

    // Check if block is grabbed by another player
    if (this.isBlockGrabbed(blockId)) return { state: this, releasedBlockId: null };

    let releasedBlockId: BlockId | null = null;
    let newGrabbedIds = [...player.grabbedBlockIds];

    // If at max capacity, release the oldest grab (first in array)
    if (newGrabbedIds.length >= MAX_GRABBED_BLOCKS) {
      releasedBlockId = newGrabbedIds[0] ?? null;
      newGrabbedIds = newGrabbedIds.slice(1);
    }

    // Add new block to end of array (newest)
    newGrabbedIds.push(blockId);

    const newPlayer: Player = { ...player, grabbedBlockIds: newGrabbedIds };
    const newPlayers = new Map(this._players);
    newPlayers.set(playerId, newPlayer);

    const newState = new GameState(
      this._blocks,
      newPlayers,
      this._projectiles,
      this._cannonCooldowns,
      this._config,
      this._nextProjectileId,
      this._gamePhase
    );

    return { state: newState, releasedBlockId };
  }

  /**
   * Release a specific grabbed block.
   * @param playerId - ID of the player releasing
   * @param blockId - ID of the block to release
   * @returns New game state with the block released
   */
  releaseBlock(playerId: PlayerId, blockId?: BlockId): GameState {
    const player = this._players.get(playerId);

    if (!player || player.grabbedBlockIds.length === 0) return this;

    let newGrabbedIds: BlockId[];

    if (blockId) {
      // Release specific block
      if (!player.grabbedBlockIds.includes(blockId)) return this;
      newGrabbedIds = player.grabbedBlockIds.filter((id) => id !== blockId);
    } else {
      // Legacy behavior: release all blocks (or could release oldest)
      newGrabbedIds = [];
    }

    const newPlayer: Player = { ...player, grabbedBlockIds: newGrabbedIds };
    const newPlayers = new Map(this._players);
    newPlayers.set(playerId, newPlayer);

    return new GameState(
      this._blocks,
      newPlayers,
      this._projectiles,
      this._cannonCooldowns,
      this._config,
      this._nextProjectileId,
      this._gamePhase
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
      this._nextProjectileId,
      this._gamePhase
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
      result.nextProjectileId,
      this._gamePhase
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
      result.nextProjectileId,
      this._gamePhase
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
      this._nextProjectileId,
      this._gamePhase
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
      this._nextProjectileId,
      this._gamePhase
    );
  }
}
