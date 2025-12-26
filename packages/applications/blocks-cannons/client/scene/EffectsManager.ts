/**
 * @fileoverview Visual effects including explosions and wall hit highlights.
 */

import * as THREE from 'three';
import { EFFECTS, EXPLOSION_DURATION_MS, EXPLOSION_PARTICLE_COUNT } from '../constants.js';
import type {
  Explosion,
  ExplosionParticle,
  Position,
  RoomBounds,
  WallGridConfig,
  WallHighlight,
} from '../types.js';

/**
 * Manages visual effects like explosions and wall hit highlights.
 */
export class EffectsManager {
  private readonly scene: THREE.Scene;
  private readonly explosions: Explosion[] = [];
  private readonly wallHighlights: Map<string, WallHighlight> = new Map();
  private room: RoomBounds | null = null;
  private wallGridConfig: WallGridConfig = {
    enabled: false,
    highlightDuration: 1000,
    highlightIntensity: 0.8,
  };
  private projectileSize = 0.3;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Set the room bounds for effects.
   */
  setRoom(room: RoomBounds): void {
    this.room = room;
  }

  /**
   * Set wall grid configuration.
   */
  setWallGridConfig(config: WallGridConfig, projectileSize: number): void {
    this.wallGridConfig = config;
    this.projectileSize = projectileSize;
  }

  /**
   * Create an explosion effect at a position.
   */
  createExplosion(position: THREE.Vector3, color: number): void {
    const particles: ExplosionParticle[] = [];

    for (let i = 0; i < EXPLOSION_PARTICLE_COUNT; i++) {
      const geometry = new THREE.BoxGeometry(0.15, 0.15, 0.15);
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(geometry, material);

      // Start at explosion center
      mesh.position.copy(position);

      // Random velocity outward
      const speed = 3 + Math.random() * 5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const velocity = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.sin(phi) * Math.sin(theta) * speed,
        Math.cos(phi) * speed
      );

      // Random rotation speed
      const rotationSpeed = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10
      );

      this.scene.add(mesh);
      particles.push({ mesh, velocity, rotationSpeed });
    }

    this.explosions.push({
      particles,
      startTime: Date.now(),
      duration: EXPLOSION_DURATION_MS,
    });
  }

  /**
   * Create a wall hit highlight effect.
   */
  createWallHitHighlight(position: Position, wallSide: 'minZ' | 'maxZ'): void {
    if (!this.room || !this.wallGridConfig.enabled) return;

    // Calculate grid cell
    const cellSize = 1;
    const gridX = Math.floor(position.x / cellSize) * cellSize + cellSize / 2;
    const gridY = Math.floor(position.y / cellSize) * cellSize + cellSize / 2;
    const zPos = wallSide === 'minZ' ? this.room.minZ + 0.01 : this.room.maxZ - 0.01;

    // Create unique key
    const impactKey = `${wallSide}_${position.x.toFixed(2)}_${position.y.toFixed(2)}_${Date.now()}`;

    // Create highlight group
    const highlightGroup = new THREE.Group();
    const meshes: THREE.Object3D[] = [];

    // Impact circle
    const circleGeometry = new THREE.CircleGeometry(this.projectileSize, 32);
    const circleMaterial = new THREE.MeshBasicMaterial({
      color: EFFECTS.WALL_HIT_COLOR,
      transparent: true,
      opacity: this.wallGridConfig.highlightIntensity,
      side: THREE.DoubleSide,
    });
    const impactCircle = new THREE.Mesh(circleGeometry, circleMaterial);
    impactCircle.position.set(position.x, position.y, zPos);
    highlightGroup.add(impactCircle);
    meshes.push(impactCircle);

    // Grid cell outline
    const cellCorners = [
      new THREE.Vector3(gridX - cellSize / 2, gridY - cellSize / 2, zPos),
      new THREE.Vector3(gridX + cellSize / 2, gridY - cellSize / 2, zPos),
      new THREE.Vector3(gridX + cellSize / 2, gridY + cellSize / 2, zPos),
      new THREE.Vector3(gridX - cellSize / 2, gridY + cellSize / 2, zPos),
      new THREE.Vector3(gridX - cellSize / 2, gridY - cellSize / 2, zPos),
    ];
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(cellCorners);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: EFFECTS.WALL_GRID_COLOR,
      transparent: true,
      opacity: this.wallGridConfig.highlightIntensity,
    });
    const gridOutline = new THREE.Line(lineGeometry, lineMaterial);
    highlightGroup.add(gridOutline);
    meshes.push(gridOutline);

    this.scene.add(highlightGroup);

    // Store highlight with timeout for removal
    const highlightData: WallHighlight = {
      group: highlightGroup,
      meshes,
      startTime: Date.now(),
      timeoutId: setTimeout(() => {
        this.scene.remove(highlightGroup);
        this.wallHighlights.delete(impactKey);
      }, this.wallGridConfig.highlightDuration),
    };

    this.wallHighlights.set(impactKey, highlightData);
  }

  /**
   * Update all effects (call each frame).
   */
  update(deltaTime: number): void {
    this.updateExplosions(deltaTime);
    this.updateWallHighlights();
  }

  private updateExplosions(deltaTime: number): void {
    const now = Date.now();

    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const explosion = this.explosions[i];
      if (!explosion) continue;
      const elapsed = now - explosion.startTime;
      const progress = elapsed / explosion.duration;

      if (progress >= 1) {
        // Remove explosion
        for (const particle of explosion.particles) {
          this.scene.remove(particle.mesh);
          particle.mesh.geometry.dispose();
          if (particle.mesh.material instanceof THREE.Material) {
            particle.mesh.material.dispose();
          }
        }
        this.explosions.splice(i, 1);
        continue;
      }

      // Update particles
      for (const particle of explosion.particles) {
        // Apply velocity with gravity
        particle.mesh.position.add(particle.velocity.clone().multiplyScalar(deltaTime));
        particle.velocity.y -= 9.8 * deltaTime;

        // Apply rotation
        particle.mesh.rotation.x += particle.rotationSpeed.x * deltaTime;
        particle.mesh.rotation.y += particle.rotationSpeed.y * deltaTime;
        particle.mesh.rotation.z += particle.rotationSpeed.z * deltaTime;

        // Fade out
        (particle.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - progress;

        // Shrink slightly
        const scale = 1 - progress * 0.5;
        particle.mesh.scale.setScalar(scale);
      }
    }
  }

  private updateWallHighlights(): void {
    if (!this.wallGridConfig.enabled) return;

    const now = Date.now();
    for (const data of this.wallHighlights.values()) {
      const elapsed = now - data.startTime;
      const progress = elapsed / this.wallGridConfig.highlightDuration;

      if (progress < 1) {
        const newOpacity = this.wallGridConfig.highlightIntensity * (1 - progress);
        for (const mesh of data.meshes) {
          if (mesh instanceof THREE.Mesh || mesh instanceof THREE.Line) {
            (mesh.material as THREE.Material & { opacity: number }).opacity = newOpacity;
          }
        }
      }
    }
  }

  /**
   * Dispose of all resources.
   */
  dispose(): void {
    // Clear explosions
    for (const explosion of this.explosions) {
      for (const particle of explosion.particles) {
        this.scene.remove(particle.mesh);
        particle.mesh.geometry.dispose();
        if (particle.mesh.material instanceof THREE.Material) {
          particle.mesh.material.dispose();
        }
      }
    }
    this.explosions.length = 0;

    // Clear wall highlights
    for (const data of this.wallHighlights.values()) {
      clearTimeout(data.timeoutId);
      this.scene.remove(data.group);
    }
    this.wallHighlights.clear();
  }
}
