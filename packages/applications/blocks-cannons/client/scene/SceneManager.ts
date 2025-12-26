/**
 * @fileoverview Core Three.js scene management.
 * Handles scene setup, camera, lighting, and starfield background.
 */

import * as THREE from 'three';
import { CAMERA, LIGHT_INTENSITY, SCENE_COLORS, STARFIELD } from '../constants.js';

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

    // Create renderer with logarithmic depth buffer for better z-fighting prevention
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      logarithmicDepthBuffer: true,
    });
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
    const twinklePhases = new Float32Array(STARFIELD.COUNT);

    for (let i = 0; i < STARFIELD.COUNT; i++) {
      // Spherical distribution with denser clusters
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = STARFIELD.RADIUS * (0.4 + Math.random() * 0.6);

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      // More varied star colors with better distribution
      const colorRoll = Math.random();
      if (colorRoll < 0.5) {
        // Blue-white stars (O, B, A type)
        const blueIntensity = 0.7 + Math.random() * 0.3;
        colors[i * 3] = 0.7 + Math.random() * 0.3;
        colors[i * 3 + 1] = 0.8 + Math.random() * 0.2;
        colors[i * 3 + 2] = blueIntensity;
      } else if (colorRoll < 0.7) {
        // Pure white (A type)
        colors[i * 3] = 0.95 + Math.random() * 0.05;
        colors[i * 3 + 1] = 0.95 + Math.random() * 0.05;
        colors[i * 3 + 2] = 1.0;
      } else if (colorRoll < 0.85) {
        // Yellow stars (G type, like Sun)
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.9 + Math.random() * 0.1;
        colors[i * 3 + 2] = 0.7 + Math.random() * 0.2;
      } else if (colorRoll < 0.95) {
        // Orange stars (K type)
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.6 + Math.random() * 0.2;
        colors[i * 3 + 2] = 0.3 + Math.random() * 0.2;
      } else {
        // Red giants (M type)
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.3 + Math.random() * 0.2;
        colors[i * 3 + 2] = 0.2 + Math.random() * 0.1;
      }

      // Star sizes with more variation
      const sizeRoll = Math.random();
      if (sizeRoll < 0.75) {
        sizes[i] = 0.4 + Math.random() * 0.8;
      } else if (sizeRoll < 0.92) {
        sizes[i] = 1.2 + Math.random() * 1.5;
      } else if (sizeRoll < 0.98) {
        sizes[i] = 2.7 + Math.random() * 2.0;
      } else {
        // A few very bright stars
        sizes[i] = 4.5 + Math.random() * 2.5;
      }

      // Random phase for twinkling
      twinklePhases[i] = Math.random() * Math.PI * 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('twinklePhase', new THREE.BufferAttribute(twinklePhases, 1));

    const starMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
      },
      vertexShader: `
        attribute float size;
        attribute float twinklePhase;
        varying vec3 vColor;
        varying float vTwinkle;
        uniform float time;
        void main() {
          vColor = color;
          // Subtle twinkling effect
          vTwinkle = 0.85 + 0.15 * sin(time * 2.0 + twinklePhase);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * vTwinkle * (200.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vTwinkle;
        void main() {
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          if (dist > 0.5) discard;
          // Soft glow falloff
          float alpha = pow(1.0 - smoothstep(0.0, 0.5, dist), 1.5) * vTwinkle;
          // Add subtle glow halo
          float glow = exp(-dist * 4.0) * 0.3;
          gl_FragColor = vec4(vColor * (1.0 + glow), alpha);
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

    // More vibrant and varied nebula colors
    const nebulaColors = [
      { color: 0x6b2a9e, opacity: 0.12 }, // Deep purple
      { color: 0x1a5a8b, opacity: 0.1 }, // Ocean blue
      { color: 0x8b1a4a, opacity: 0.08 }, // Magenta
      { color: 0x2a8b6b, opacity: 0.07 }, // Teal
      { color: 0x4a1a8b, opacity: 0.09 }, // Violet
      { color: 0x1a3a6b, opacity: 0.08 }, // Navy blue
      { color: 0x6b4a1a, opacity: 0.06 }, // Bronze glow
      { color: 0x3a1a6b, opacity: 0.1 }, // Indigo
    ];

    for (let i = 0; i < STARFIELD.NEBULA_COUNT; i++) {
      const colorData = nebulaColors[i % nebulaColors.length];
      if (!colorData) continue;
      const size = 100 + Math.random() * 150;

      // Create higher resolution gradient texture with more detail
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      // Multi-layered gradient for more depth
      const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      gradient.addColorStop(0, `rgba(255, 255, 255, ${colorData.opacity * 1.5})`);
      gradient.addColorStop(0.2, `rgba(255, 255, 255, ${colorData.opacity})`);
      gradient.addColorStop(0.5, `rgba(255, 255, 255, ${colorData.opacity * 0.5})`);
      gradient.addColorStop(0.8, `rgba(255, 255, 255, ${colorData.opacity * 0.2})`);
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 256, 256);

      // Add some noise/texture to break up uniformity
      const imageData = ctx.getImageData(0, 0, 256, 256);
      const data = imageData.data;
      for (let j = 0; j < data.length; j += 4) {
        const noise = (Math.random() - 0.5) * 20;
        const r = data[j] ?? 0;
        const g = data[j + 1] ?? 0;
        const b = data[j + 2] ?? 0;
        data[j] = Math.max(0, Math.min(255, r + noise));
        data[j + 1] = Math.max(0, Math.min(255, g + noise));
        data[j + 2] = Math.max(0, Math.min(255, b + noise));
      }
      ctx.putImageData(imageData, 0, 0);

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

      // Position far away in random direction, avoiding the play area
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const dist = 100 + Math.random() * 80;

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
   * Update scene animations (call each frame).
   * @param elapsedTime - Total elapsed time in seconds
   */
  update(elapsedTime: number): void {
    // Update starfield twinkling
    if (this.starfield) {
      const material = this.starfield.material as THREE.ShaderMaterial;
      if (material.uniforms.time) {
        material.uniforms.time.value = elapsedTime;
      }
      // Slow rotation for subtle movement
      this.starfield.rotation.y = elapsedTime * STARFIELD.ROTATION_SPEED;
    }

    // Subtle nebula rotation (even slower)
    if (this.nebulae) {
      this.nebulae.rotation.y = elapsedTime * STARFIELD.ROTATION_SPEED * 0.3;
    }
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
