/**
 * @fileoverview Core Three.js scene management.
 * Handles scene setup, camera, lighting, and starfield background.
 */

import * as THREE from 'three';
import {
  CAMERA,
  LIGHT_INTENSITY,
  SCENE_COLORS,
  STARFIELD,
} from '../constants.js';

/**
 * Creates and manages the Three.js scene, camera, renderer, and background.
 */
export class SceneManager {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  private readonly clock: THREE.Clock;
  private starfield: THREE.Points | null = null;
  private nebulae: THREE.Group | null = null;

  constructor(container: HTMLElement) {
    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SCENE_COLORS.BACKGROUND);

    // Create camera
    this.camera = new THREE.PerspectiveCamera(
      CAMERA.FOV,
      window.innerWidth / window.innerHeight,
      CAMERA.NEAR,
      CAMERA.FAR
    );
    this.camera.position.set(0, CAMERA.HEIGHT, 14);
    this.camera.lookAt(0, -1, 0);

    // Create renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // Create clock for animations
    this.clock = new THREE.Clock();

    // Setup lighting
    this.setupLighting();

    // Create space background
    this.starfield = this.createStarfield();
    this.nebulae = this.createNebulae();

    // Handle window resize
    window.addEventListener('resize', this.handleResize.bind(this));
  }

  private setupLighting(): void {
    // Space-themed ambient light
    const ambientLight = new THREE.AmbientLight(SCENE_COLORS.AMBIENT, LIGHT_INTENSITY.AMBIENT);
    this.scene.add(ambientLight);

    // Main directional light (like a distant star)
    const mainLight = new THREE.DirectionalLight(SCENE_COLORS.MAIN_LIGHT, LIGHT_INTENSITY.MAIN);
    mainLight.position.set(10, 20, 15);
    this.scene.add(mainLight);

    // Blue rim light from below (reflected nebula light)
    const rimLight = new THREE.DirectionalLight(SCENE_COLORS.RIM_LIGHT, LIGHT_INTENSITY.RIM);
    rimLight.position.set(-5, -10, -10);
    this.scene.add(rimLight);

    // Additional ambient for visibility
    const ambientLight2 = new THREE.AmbientLight(0xffffff, LIGHT_INTENSITY.AMBIENT_SECONDARY);
    this.scene.add(ambientLight2);

    // Additional directional light
    const dirLight = new THREE.DirectionalLight(0xffffff, LIGHT_INTENSITY.MAIN);
    dirLight.position.set(5, 10, 7);
    this.scene.add(dirLight);
  }

  private createStarfield(): THREE.Points {
    const positions = new Float32Array(STARFIELD.COUNT * 3);
    const colors = new Float32Array(STARFIELD.COUNT * 3);
    const sizes = new Float32Array(STARFIELD.COUNT);

    for (let i = 0; i < STARFIELD.COUNT; i++) {
      // Spherical distribution
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = STARFIELD.RADIUS * (0.5 + Math.random() * 0.5);

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      // Star colors
      const colorRoll = Math.random();
      if (colorRoll < 0.7) {
        // Blue-white stars
        colors[i * 3] = 0.8 + Math.random() * 0.2;
        colors[i * 3 + 1] = 0.85 + Math.random() * 0.15;
        colors[i * 3 + 2] = 1.0;
      } else if (colorRoll < 0.85) {
        // Pure white
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 1.0;
        colors[i * 3 + 2] = 1.0;
      } else if (colorRoll < 0.95) {
        // Yellow/orange stars
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.8 + Math.random() * 0.15;
        colors[i * 3 + 2] = 0.5 + Math.random() * 0.3;
      } else {
        // Red giants
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.4 + Math.random() * 0.2;
        colors[i * 3 + 2] = 0.3 + Math.random() * 0.2;
      }

      // Star sizes
      const sizeRoll = Math.random();
      if (sizeRoll < 0.8) {
        sizes[i] = 0.5 + Math.random() * 1.0;
      } else if (sizeRoll < 0.95) {
        sizes[i] = 1.5 + Math.random() * 1.5;
      } else {
        sizes[i] = 3.0 + Math.random() * 2.0;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const starMaterial = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (200.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          if (dist > 0.5) discard;
          float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      vertexColors: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const stars = new THREE.Points(geometry, starMaterial);
    this.scene.add(stars);
    return stars;
  }

  private createNebulae(): THREE.Group {
    const nebulaGroup = new THREE.Group();

    const nebulaColors = [
      { color: 0x4a1a6b, opacity: 0.08 },
      { color: 0x1a3a6b, opacity: 0.06 },
      { color: 0x6b1a3a, opacity: 0.05 },
    ];

    for (let i = 0; i < STARFIELD.NEBULA_COUNT; i++) {
      const colorData = nebulaColors[i % nebulaColors.length]!;
      const size = 80 + Math.random() * 120;

      // Create gradient texture
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;

      const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, `rgba(255, 255, 255, ${colorData.opacity})`);
      gradient.addColorStop(0.4, `rgba(255, 255, 255, ${colorData.opacity * 0.5})`);
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);

      const texture = new THREE.CanvasTexture(canvas);

      const nebulaMat = new THREE.MeshBasicMaterial({
        map: texture,
        color: colorData.color,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });

      const nebulaGeo = new THREE.PlaneGeometry(size, size);
      const nebula = new THREE.Mesh(nebulaGeo, nebulaMat);

      // Position far away in random direction
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const dist = 120 + Math.random() * 50;

      nebula.position.set(
        dist * Math.sin(phi) * Math.cos(theta),
        dist * Math.sin(phi) * Math.sin(theta),
        dist * Math.cos(phi)
      );

      nebula.lookAt(0, 0, 0);
      nebulaGroup.add(nebula);
    }

    this.scene.add(nebulaGroup);
    return nebulaGroup;
  }

  /**
   * Setup camera position for a specific player.
   * @param playerNumber - Player number (1 or 2)
   * @param room - Room bounds
   * @param cameraDistance - Distance from room edge
   */
  setupCameraForPlayer(
    playerNumber: 1 | 2,
    room: { minZ: number; maxZ: number },
    cameraDistance: number
  ): void {
    const roomCenterZ = (room.minZ + room.maxZ) / 2;

    if (playerNumber === 1) {
      // Player 1: looking from positive Z side
      this.camera.position.set(0, CAMERA.HEIGHT, room.maxZ + cameraDistance);
      this.camera.lookAt(0, 0, roomCenterZ);
    } else {
      // Player 2: looking from negative Z side
      this.camera.position.set(0, CAMERA.HEIGHT, room.minZ - cameraDistance);
      this.camera.lookAt(0, 0, roomCenterZ);
    }
  }

  private handleResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /**
   * Get elapsed time since start in seconds.
   */
  getElapsedTime(): number {
    return this.clock.getElapsedTime();
  }

  /**
   * Get time since last frame in seconds.
   */
  getDeltaTime(): number {
    return this.clock.getDelta();
  }

  /**
   * Render the scene.
   */
  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Dispose of all resources.
   */
  dispose(): void {
    window.removeEventListener('resize', this.handleResize.bind(this));
    this.renderer.dispose();
    if (this.starfield) {
      this.scene.remove(this.starfield);
      this.starfield.geometry.dispose();
    }
    if (this.nebulae) {
      this.scene.remove(this.nebulae);
    }
  }
}

