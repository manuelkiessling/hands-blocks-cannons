import {
  BLOCK_COLLISION_ENABLED,
  BLOCK_COLORS,
  BLOCK_HALF_SIZE,
  type Block,
  type BlockId,
  CANNON_COLOR,
  CANNON_COOLDOWN_MS,
  CANNON_INDESTRUCTIBLE,
  DEFAULT_GAME_CONFIG,
  type DestroyedBlockInfo,
  type GameConfig,
  PROJECTILE_COLOR,
  PROJECTILE_SIZE,
  PROJECTILE_SPEED,
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
 * Immutable game state - all mutations return a new GameState instance.
 * This makes the state predictable, testable, and easy to debug.
 */
export class GameState {
  private constructor(
    private readonly _blocks: ReadonlyMap<BlockId, Block>,
    private readonly _players: ReadonlyMap<PlayerId, Player>,
    private readonly _projectiles: ReadonlyMap<ProjectileId, Projectile>,
    private readonly _cannonCooldowns: ReadonlyMap<BlockId, number>, // cannonId -> readyAt timestamp
    private readonly _config: GameConfig,
    private readonly _nextProjectileId: number
  ) {}

  // ============ Static Constructors ============

  static create(config: GameConfig = DEFAULT_GAME_CONFIG): GameState {
    return new GameState(new Map(), new Map(), new Map(), new Map(), config, 1);
  }

  // ============ Getters ============

  get blocks(): ReadonlyMap<BlockId, Block> {
    return this._blocks;
  }

  get players(): ReadonlyMap<PlayerId, Player> {
    return this._players;
  }

  get projectiles(): ReadonlyMap<ProjectileId, Projectile> {
    return this._projectiles;
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

  getProjectile(projectileId: ProjectileId): Projectile | undefined {
    return this._projectiles.get(projectileId);
  }

  getBlocksArray(): Block[] {
    return Array.from(this._blocks.values());
  }

  getProjectilesArray(): Projectile[] {
    return Array.from(this._projectiles.values());
  }

  getPlayerCount(): number {
    return this._players.size;
  }

  isCannonReady(cannonId: BlockId): boolean {
    const readyAt = this._cannonCooldowns.get(cannonId);
    if (readyAt === undefined) return true;
    return Date.now() >= readyAt;
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

    // Create blocks for this player at the edge of the room on their side
    const newBlocks = new Map(this._blocks);
    const spawnZ = getPlayerSpawnZ(playerNumber, this._config.room);
    const { room } = this._config;

    // First, create the cannon block
    const cannonId = `${playerId}-cannon`;
    const cannonPosition: Position = {
      x: (Math.random() - 0.5) * (room.maxX - room.minX - 2), // Spread across X
      y: 0, // Centered vertically
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

    // Then create regular blocks - spread across X and Y, all at the same Z (edge)
    for (let i = 0; i < this._config.blocksPerPlayer; i++) {
      const blockId = `${playerId}-block-${i}`;
      const colorIndex = i % BLOCK_COLORS.length;
      const color = BLOCK_COLORS[colorIndex];

      if (color === undefined) {
        continue; // Safety check for noUncheckedIndexedAccess
      }

      // Spawn blocks spread out in X/Y only, all at the same Z (room edge)
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

    return new GameState(
      newBlocks,
      newPlayers,
      this._projectiles,
      this._cannonCooldowns,
      this._config,
      this._nextProjectileId
    );
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

    return new GameState(
      this._blocks,
      newPlayers,
      this._projectiles,
      this._cannonCooldowns,
      this._config,
      this._nextProjectileId
    );
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
   * Move a block to a new position.
   * Returns the new state and list of blocks that were pushed due to collision.
   */
  moveBlock(
    blockId: BlockId,
    position: Position
  ): { state: GameState; pushedBlocks: Array<{ id: BlockId; position: Position }> } {
    const block = this._blocks.get(blockId);

    if (!block) {
      return { state: this, pushedBlocks: [] };
    }

    // Clamp position to room bounds
    const clampedPosition = clampToRoom(position, this._config.room);

    const newBlock: Block = {
      ...block,
      position: clampedPosition,
    };

    const newBlocks = new Map(this._blocks);
    newBlocks.set(blockId, newBlock);

    // Track pushed blocks
    const pushedBlocks: Array<{ id: BlockId; position: Position }> = [];

    // Handle block-to-block collision if enabled
    if (BLOCK_COLLISION_ENABLED) {
      // Store original positions to detect changes
      const originalPositions = new Map<BlockId, Position>();
      for (const [id, b] of newBlocks) {
        if (id !== blockId) {
          originalPositions.set(id, b.position);
        }
      }

      this.resolveBlockCollisions(newBlocks, blockId, clampedPosition);

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

  /**
   * Check if two blocks are colliding (AABB overlap)
   */
  private blocksCollide(posA: Position, posB: Position): boolean {
    const size = BLOCK_HALF_SIZE * 2; // Full block size
    return (
      Math.abs(posA.x - posB.x) < size &&
      Math.abs(posA.y - posB.y) < size &&
      Math.abs(posA.z - posB.z) < size
    );
  }

  /**
   * Resolve collisions by pushing blocks apart.
   * The moved block stays in place, other blocks get pushed.
   */
  private resolveBlockCollisions(
    blocks: Map<BlockId, Block>,
    movedBlockId: BlockId,
    movedPos: Position,
    depth = 0
  ): void {
    // Prevent infinite recursion
    if (depth > 10) return;

    const movedBlock = blocks.get(movedBlockId);
    if (!movedBlock) return;

    for (const [otherId, otherBlock] of blocks) {
      // Skip self
      if (otherId === movedBlockId) continue;

      // Check collision
      if (!this.blocksCollide(movedPos, otherBlock.position)) continue;

      // Calculate push direction (from moved block to other block)
      const dx = otherBlock.position.x - movedPos.x;
      const dy = otherBlock.position.y - movedPos.y;
      const dz = otherBlock.position.z - movedPos.z;

      // Determine which axis has the smallest overlap (push along that axis)
      const overlapX = BLOCK_HALF_SIZE * 2 - Math.abs(dx);
      const overlapY = BLOCK_HALF_SIZE * 2 - Math.abs(dy);
      const overlapZ = BLOCK_HALF_SIZE * 2 - Math.abs(dz);

      let newX = otherBlock.position.x;
      let newY = otherBlock.position.y;
      let newZ = otherBlock.position.z;

      // Push along the axis with smallest overlap (most efficient separation)
      if (overlapX <= overlapY && overlapX <= overlapZ) {
        // Push along X
        newX += dx >= 0 ? overlapX : -overlapX;
      } else if (overlapY <= overlapX && overlapY <= overlapZ) {
        // Push along Y
        newY += dy >= 0 ? overlapY : -overlapY;
      } else {
        // Push along Z
        newZ += dz >= 0 ? overlapZ : -overlapZ;
      }

      // Clamp to room bounds
      const pushedPos = clampToRoom({ x: newX, y: newY, z: newZ }, this._config.room);

      // Update the pushed block
      const pushedBlock: Block = {
        ...otherBlock,
        position: pushedPos,
      };
      blocks.set(otherId, pushedBlock);

      // Recursively resolve any new collisions caused by the push
      this.resolveBlockCollisions(blocks, otherId, pushedPos, depth + 1);
    }
  }

  // ============ Cannon & Projectile Methods ============

  /**
   * Fire a projectile from a cannon. Returns { state, projectile } or { state, null } if failed.
   */
  fireCannon(
    playerId: PlayerId,
    cannonId: BlockId
  ): { state: GameState; projectile: Projectile | null } {
    const player = this._players.get(playerId);
    const cannon = this._blocks.get(cannonId);

    if (!player || !cannon) {
      return { state: this, projectile: null };
    }

    // Must own the cannon
    if (cannon.ownerId !== playerId) {
      return { state: this, projectile: null };
    }

    // Must be a cannon
    if (cannon.blockType !== 'cannon') {
      return { state: this, projectile: null };
    }

    // Check cooldown
    if (!this.isCannonReady(cannonId)) {
      return { state: this, projectile: null };
    }

    // Determine fire direction based on player number
    // Player 1 fires towards negative Z, Player 2 fires towards positive Z
    const fireDirection = player.number === 1 ? -1 : 1;

    const projectileId = `projectile-${this._nextProjectileId}`;
    const projectile: Projectile = {
      id: projectileId,
      position: {
        x: cannon.position.x,
        y: cannon.position.y,
        z: cannon.position.z + fireDirection * 0.8, // Start slightly in front of cannon
      },
      velocity: {
        x: 0,
        y: 0,
        z: fireDirection * PROJECTILE_SPEED,
      },
      ownerId: playerId,
      color: PROJECTILE_COLOR,
    };

    const newProjectiles = new Map(this._projectiles);
    newProjectiles.set(projectileId, projectile);

    // Set cooldown
    const newCooldowns = new Map(this._cannonCooldowns);
    newCooldowns.set(cannonId, Date.now() + CANNON_COOLDOWN_MS);

    const newState = new GameState(
      this._blocks,
      this._players,
      newProjectiles,
      newCooldowns,
      this._config,
      this._nextProjectileId + 1
    );

    return { state: newState, projectile };
  }

  /**
   * Auto-fire a cannon (server-initiated). Uses cannon's owner info to determine direction.
   * Does not require player validation since it's server-controlled.
   */
  fireCannonAuto(cannonId: BlockId): { state: GameState; projectile: Projectile | null } {
    const cannon = this._blocks.get(cannonId);

    if (!cannon || cannon.blockType !== 'cannon') {
      return { state: this, projectile: null };
    }

    // Check cooldown
    if (!this.isCannonReady(cannonId)) {
      return { state: this, projectile: null };
    }

    // Get the owner's player number to determine fire direction
    const owner = this._players.get(cannon.ownerId);
    if (!owner) {
      return { state: this, projectile: null };
    }

    // Player 1 fires towards negative Z, Player 2 fires towards positive Z
    const fireDirection = owner.number === 1 ? -1 : 1;

    const projectileId = `projectile-${this._nextProjectileId}`;
    const projectile: Projectile = {
      id: projectileId,
      position: {
        x: cannon.position.x,
        y: cannon.position.y,
        z: cannon.position.z + fireDirection * 0.8,
      },
      velocity: {
        x: 0,
        y: 0,
        z: fireDirection * PROJECTILE_SPEED,
      },
      ownerId: cannon.ownerId,
      color: PROJECTILE_COLOR,
    };

    const newProjectiles = new Map(this._projectiles);
    newProjectiles.set(projectileId, projectile);

    // Set cooldown
    const newCooldowns = new Map(this._cannonCooldowns);
    newCooldowns.set(cannonId, Date.now() + CANNON_COOLDOWN_MS);

    const newState = new GameState(
      this._blocks,
      this._players,
      newProjectiles,
      newCooldowns,
      this._config,
      this._nextProjectileId + 1
    );

    return { state: newState, projectile };
  }

  /**
   * Check if a projectile collides with a block (sphere vs AABB collision).
   */
  private checkCollision(projectilePos: Position, blockPos: Position): boolean {
    // Find the closest point on the block to the projectile center
    const closestX = Math.max(
      blockPos.x - BLOCK_HALF_SIZE,
      Math.min(projectilePos.x, blockPos.x + BLOCK_HALF_SIZE)
    );
    const closestY = Math.max(
      blockPos.y - BLOCK_HALF_SIZE,
      Math.min(projectilePos.y, blockPos.y + BLOCK_HALF_SIZE)
    );
    const closestZ = Math.max(
      blockPos.z - BLOCK_HALF_SIZE,
      Math.min(projectilePos.z, blockPos.z + BLOCK_HALF_SIZE)
    );

    // Calculate distance from projectile center to closest point
    const dx = projectilePos.x - closestX;
    const dy = projectilePos.y - closestY;
    const dz = projectilePos.z - closestZ;
    const distanceSquared = dx * dx + dy * dy + dz * dz;

    // Collision if distance is less than projectile radius
    return distanceSquared < PROJECTILE_SIZE * PROJECTILE_SIZE;
  }

  /**
   * Update all projectiles by deltaTime seconds.
   * Returns destroyed projectile IDs, destroyed block info, and wall hits.
   */
  updateProjectiles(deltaTime: number): {
    state: GameState;
    destroyedProjectileIds: string[];
    destroyedBlocks: DestroyedBlockInfo[];
    wallHits: Array<{ position: Position; wallSide: 'minZ' | 'maxZ' }>;
  } {
    const destroyedProjectileIds: string[] = [];
    const destroyedBlocks: DestroyedBlockInfo[] = [];
    const wallHits: Array<{ position: Position; wallSide: 'minZ' | 'maxZ' }> = [];
    const newProjectiles = new Map<ProjectileId, Projectile>();
    const blocksToRemove = new Set<BlockId>();

    const { minZ, maxZ } = this._config.room;

    for (const [id, projectile] of this._projectiles) {
      // Move projectile
      const newPosition: Position = {
        x: projectile.position.x + projectile.velocity.x * deltaTime,
        y: projectile.position.y + projectile.velocity.y * deltaTime,
        z: projectile.position.z + projectile.velocity.z * deltaTime,
      };

      // Check if projectile left the room (along Z axis)
      if (newPosition.z < minZ || newPosition.z > maxZ) {
        destroyedProjectileIds.push(id);
        // Record wall hit position (use last valid position before exit)
        const wallSide: 'minZ' | 'maxZ' = newPosition.z < minZ ? 'minZ' : 'maxZ';
        wallHits.push({
          position: {
            x: projectile.position.x,
            y: projectile.position.y,
            z: wallSide === 'minZ' ? minZ : maxZ,
          },
          wallSide,
        });
        continue;
      }

      // Check for collision with opponent blocks
      let hitBlock: Block | null = null;
      for (const [blockId, block] of this._blocks) {
        // Skip blocks owned by the projectile owner (can't hit your own blocks)
        if (block.ownerId === projectile.ownerId) continue;
        // Skip already destroyed blocks
        if (blocksToRemove.has(blockId)) continue;
        // Skip cannons if they are indestructible
        if (CANNON_INDESTRUCTIBLE && block.blockType === 'cannon') continue;

        if (this.checkCollision(newPosition, block.position)) {
          hitBlock = block;
          break;
        }
      }

      if (hitBlock) {
        // Projectile hit an opponent block - destroy both
        destroyedProjectileIds.push(id);
        blocksToRemove.add(hitBlock.id);
        destroyedBlocks.push({
          blockId: hitBlock.id,
          position: hitBlock.position,
          color: hitBlock.color,
        });
        continue;
      }

      // No collision - keep the projectile
      const newProjectile: Projectile = {
        ...projectile,
        position: newPosition,
      };
      newProjectiles.set(id, newProjectile);
    }

    // Remove destroyed blocks
    const newBlocks = new Map(this._blocks);
    for (const blockId of blocksToRemove) {
      newBlocks.delete(blockId);
    }

    const newState = new GameState(
      newBlocks,
      this._players,
      newProjectiles,
      this._cannonCooldowns,
      this._config,
      this._nextProjectileId
    );

    return { state: newState, destroyedProjectileIds, destroyedBlocks, wallHits };
  }

  /**
   * Remove a specific projectile.
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
