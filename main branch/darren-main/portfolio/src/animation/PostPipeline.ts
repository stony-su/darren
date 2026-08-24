import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { QualityTier } from './quality';

/**
 * Post-processing chain: render -> afterimage (motion trails) -> bloom -> output.
 * Tier gating: 'low' skips the composer entirely, 'mid' gets bloom only,
 * 'high' gets trails + bloom.
 */
export class PostPipeline {
  readonly active: boolean;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private afterimagePass: AfterimagePass | null = null;

  private baseDamp = 0.75;
  private dampKickUntil = 0;
  private dampKickValue = 0;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    tier: QualityTier
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.active = tier !== 'low';

    if (!this.active) return;

    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.composer.setPixelRatio(renderer.getPixelRatio());
    this.composer.setSize(size.x, size.y);

    this.composer.addPass(new RenderPass(scene, camera));

    if (tier === 'high') {
      this.afterimagePass = new AfterimagePass(this.baseDamp);
      this.composer.addPass(this.afterimagePass);
    }

    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.45, 0.5, 0.3);
    this.composer.addPass(this.bloomPass);

    this.composer.addPass(new OutputPass());
  }

  render(): void {
    if (this.composer) {
      // Temporary damp kick after theme switches to flush stale-colored trails.
      if (this.afterimagePass) {
        const now = performance.now();
        const damp = now < this.dampKickUntil ? this.dampKickValue : this.baseDamp;
        this.afterimagePass.uniforms['damp'].value = damp;
        this.afterimagePass.enabled = this.baseDamp > 0.01;
      }
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  setSize(w: number, h: number): void {
    if (!this.composer) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  setBloom(strength: number, radius: number, threshold: number): void {
    if (!this.bloomPass) return;
    this.bloomPass.strength = strength;
    this.bloomPass.radius = radius;
    this.bloomPass.threshold = threshold;
  }

  getBloomStrength(): number {
    return this.bloomPass ? this.bloomPass.strength : 0;
  }

  setDamp(damp: number): void {
    this.baseDamp = damp;
  }

  /** Briefly lower the afterimage damp (e.g. on theme change) to clear ghosting. */
  kickDamp(tempDamp: number, durationMs: number): void {
    this.dampKickValue = tempDamp;
    this.dampKickUntil = performance.now() + durationMs;
  }

  dispose(): void {
    this.composer?.dispose();
  }
}
