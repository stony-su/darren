import * as THREE from 'three';
import { Curl } from './Curl';
import { createFeatherGeometry } from './Feather';

// Import shaders as raw strings
import simplexGlsl from '../shaders/simplex.glsl?raw';
import curlGlsl from '../shaders/curl.glsl?raw';
import ssCurlGlsl from '../shaders/ss-curl.glsl?raw';
import vsSnakeGlsl from '../shaders/vs-snake.glsl?raw';
import fsSnakeGlsl from '../shaders/fs-snake.glsl?raw';

export interface ThemeConfig {
  name: string;
  bg: number;
}

export const THEMES: ThemeConfig[] = [
  { name: 'normal', bg: 0x111122 },
  { name: 'neon', bg: 0x0a0a12 },
  { name: 'matcha', bg: 0x0d1a0d },
  { name: 'beach', bg: 0x0a1525 },
  { name: 'blizzard', bg: 0x1a2530 },
];

/**
 * Main particle animation scene.
 * Manages Three.js renderer, camera, particle system, color theme transitions.
 */
export class ParticleScene {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  ambientLight: THREE.AmbientLight;
  clock: THREE.Clock;
  curl: Curl;

  private soulUniforms: Record<string, THREE.IUniform>;
  private bodyUniforms: Record<string, THREE.IUniform>;

  private currentThemeIndex = 0;
  private targetColorMode = 0;
  private animationId: number | null = null;
  private attractEnabled = false;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private attractPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private intersectPoint = new THREE.Vector3();

  // Ambient light breathing
  private ambientConfig = {
    baseIntensity: 0.15,
    pulseAmount: 0.1,
    breathSpeed: 0.3,
  };

  constructor(container: HTMLElement) {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Camera
    this.camera = new THREE.PerspectiveCamera(65, w / h, 0.001, 10);
    this.camera.position.z = 2;

    // Scene
    this.scene = new THREE.Scene();

    // Ambient light
    this.ambientLight = new THREE.AmbientLight(0x4466aa, this.ambientConfig.baseIntensity);
    this.scene.add(this.ambientLight);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(THEMES[0].bg);
    container.appendChild(this.renderer.domElement);

    // Style the canvas
    this.renderer.domElement.style.position = 'fixed';
    this.renderer.domElement.style.inset = '0';
    this.renderer.domElement.style.zIndex = '0';

    this.clock = new THREE.Clock();

    // Build shaders with chunk injection
    const simShader = ssCurlGlsl
      .replace('%SIMPLEX%', simplexGlsl)
      .replace('%CURL%', curlGlsl);

    // Uniforms
    this.soulUniforms = {
      dT: { value: 0 },
      noiseSize: { value: 1.5 },
      exclusionRadius: { value: 0.35 },
      mousePos: { value: new THREE.Vector3(0, 0, 0) },
      mouseForce: { value: 0.0 },
    };

    this.bodyUniforms = {
      colorMode: { value: 0.0 },
    };

    // Feather geometry
    const featherGeo = createFeatherGeometry(0.015);

    // Particle count
    const instanceCount = 25000;

    // Create curl particle system
    this.curl = new Curl({
      soulUniforms: this.soulUniforms,
      bodyUniforms: this.bodyUniforms,
      geometry: featherGeo,
      instanceNumber: instanceCount,
      renderer: this.renderer,
      vertexShader: vsSnakeGlsl,
      fragmentShader: fsSnakeGlsl,
      simulationShader: simShader,
    });

    this.curl.activate(this.scene);

    // Window resize
    window.addEventListener('resize', this.onResize);

    // Mouse tracking for attract mode
    window.addEventListener('mousemove', this.onMouseMove);
  }

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.attractEnabled) return;
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    this.raycaster.ray.intersectPlane(this.attractPlane, this.intersectPoint);
    (this.soulUniforms.mousePos.value as THREE.Vector3).copy(this.intersectPoint);
  };

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  /** Enable/disable mouse attract mode */
  setAttract(enabled: boolean): void {
    this.attractEnabled = enabled;
    this.soulUniforms.mouseForce.value = enabled ? 1.0 : 0.0;
    if (!enabled) {
      (this.soulUniforms.mousePos.value as THREE.Vector3).set(0, 0, 0);
    }
  }

  /** Smoothly transition to a color theme (0–4) */
  setColorMode(themeIndex: number): void {
    this.currentThemeIndex = themeIndex;
    this.targetColorMode = themeIndex;
    // Immediately jump the clear color so the background doesn't lag
    this.renderer.setClearColor(THEMES[themeIndex].bg);
    // Also snap the colorMode partway to reduce perceived delay
    const current = this.bodyUniforms.colorMode.value as number;
    this.bodyUniforms.colorMode.value = current + (themeIndex - current) * 0.5;
  }

  /** Start the animation loop */
  start(): void {
    this.clock.start();
    const animate = (): void => {
      this.animationId = requestAnimationFrame(animate);

      const dT = this.clock.getDelta();
      this.soulUniforms.dT.value = dT;

      // Smooth color mode transition (fast lerp for snappy response)
      const currentColor = this.bodyUniforms.colorMode.value as number;
      const diff = this.targetColorMode - currentColor;
      if (Math.abs(diff) > 0.01) {
        this.bodyUniforms.colorMode.value = currentColor + diff * 0.25;
      } else {
        this.bodyUniforms.colorMode.value = this.targetColorMode;
      }

      // Ambient light breathing
      const time = this.clock.elapsedTime;
      this.ambientLight.intensity =
        this.ambientConfig.baseIntensity +
        Math.sin(time * this.ambientConfig.breathSpeed) * this.ambientConfig.pulseAmount;

      // Update GPGPU simulation
      this.curl.update();

      // Render
      this.renderer.render(this.scene, this.camera);
    };

    animate();
  }

  /** Stop animation and dispose resources */
  dispose(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
    window.removeEventListener('resize', this.onResize);
    this.curl.dispose();
    this.renderer.dispose();
  }

  /** Get a promise that resolves after the first frame renders */
  getReady(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        this.renderer.render(this.scene, this.camera);
        resolve();
      });
    });
  }
}
