import * as THREE from 'three';
import { Curl } from './Curl';
import { createFeatherGeometry } from './Feather';
import { PostPipeline } from './PostPipeline';
import { createTextTargetTexture } from './TextTargets';
import { pickTier, lowerTier, TIER_COUNTS, FrameMonitor } from './quality';
import type { QualityTier } from './quality';
import { loadSettings, DEFAULT_SETTINGS } from './settings';
import type { MouseMode } from './settings';
import { THEMES, bgToRgb } from '../theme/themes';
import { applyThemeCssVars } from '../theme/themes';
import type { Vec3Tuple } from '../theme/themes';

// Import shaders as raw strings
import simplexGlsl from '../shaders/simplex.glsl?raw';
import curlGlsl from '../shaders/curl.glsl?raw';
import ssCurlGlsl from '../shaders/ss-curl.glsl?raw';
import vsSnakeGlsl from '../shaders/vs-snake.glsl?raw';
import fsSnakeGlsl from '../shaders/fs-snake.glsl?raw';

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Main particle animation scene: Three.js renderer, GPGPU curl particle
 * system, palette-blended theme transitions, post-processing, text
 * formation targets, and content-aware flow (card deflection + wind).
 */
export class ParticleScene {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  ambientLight: THREE.AmbientLight;
  clock: THREE.Clock;
  curl: Curl;
  post: PostPipeline;
  tier: QualityTier;

  private soulUniforms: Record<string, THREE.IUniform>;
  private bodyUniforms: Record<string, THREE.IUniform>;
  private simShader: string;
  private instanceCount: number;
  private userCount: number | null;

  // Theme blend state (side A -> side B)
  private themeIndexB = 0;
  private blend = 1;
  private colorA = new THREE.Color(THEMES[0].bg);
  private colorB = new THREE.Color(THEMES[0].bg);
  private clearColor = new THREE.Color(THEMES[0].bg);
  private bgSrgbA: Vec3Tuple = bgToRgb(THEMES[0].bg);
  private bgSrgbB: Vec3Tuple = bgToRgb(THEMES[0].bg);
  private snowTarget = 0;

  // Playground / interaction state
  private speedMultiplier = 1;
  private bloomMult = DEFAULT_SETTINGS.bloomMult;
  private trailOverride: number | null = null;
  private panelMouseMode: MouseMode = 'auto';
  private autoAttract = false;
  private mouseStrength = 1;

  // Wind + gusts
  private windTarget = new THREE.Vector3();
  private windCurrent = new THREE.Vector3();
  private gust = new THREE.Vector3();

  // Card deflection
  private cardStrengthTarget = 0;

  // Text formation
  private textTexture: THREE.DataTexture | null = null;
  private textPromise: Promise<void> | null = null;
  private textString: string | null = null;
  private targetStrengthGoal = 0;
  private burst = 0;

  private animationId: number | null = null;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private attractPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private intersectPoint = new THREE.Vector3();

  private frameMonitor: FrameMonitor | null = null;

  // Ambient light breathing
  private ambientConfig = {
    baseIntensity: 0.15,
    pulseAmount: 0.1,
    breathSpeed: 0.3,
  };

  constructor(container: HTMLElement) {
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(65, w / h, 0.001, 10);
    this.camera.position.z = 2;

    this.scene = new THREE.Scene();

    this.ambientLight = new THREE.AmbientLight(0x4466aa, this.ambientConfig.baseIntensity);
    this.scene.add(this.ambientLight);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(this.clearColor);
    container.appendChild(this.renderer.domElement);

    this.renderer.domElement.style.position = 'fixed';
    this.renderer.domElement.style.inset = '0';
    this.renderer.domElement.style.zIndex = '0';

    this.clock = new THREE.Clock();

    this.simShader = ssCurlGlsl
      .replace('%SIMPLEX%', simplexGlsl)
      .replace('%CURL%', curlGlsl);

    // All simulation uniforms must exist before the Curl is constructed —
    // the sim material compiles once against this exact set.
    this.soulUniforms = {
      dT: { value: 0 },
      noiseSize: { value: DEFAULT_SETTINGS.noiseSize },
      exclusionRadius: { value: 0.35 },
      mousePos: { value: new THREE.Vector3(0, 0, 0) },
      mouseForce: { value: 0.0 },
      t_target: { value: null },
      targetStrength: { value: 0.0 },
      cardCenter: { value: new THREE.Vector3(0, 0, 0) },
      cardHalfSize: { value: new THREE.Vector2(0.5, 0.35) },
      cardRadius: { value: 0.05 },
      cardStrength: { value: 0.0 },
      windDir: { value: new THREE.Vector3(0, 0, 0) },
      burstStrength: { value: 0.0 },
    };

    const theme0 = THEMES[0];
    this.bodyUniforms = {
      uPaletteA: { value: theme0.palette.map((p) => new THREE.Vector3(...p)) },
      uPaletteB: { value: theme0.palette.map((p) => new THREE.Vector3(...p)) },
      uBlend: { value: 1.0 },
      uNormalA: { value: theme0.normalMode ? 1.0 : 0.0 },
      uNormalB: { value: theme0.normalMode ? 1.0 : 0.0 },
      uFxA: { value: new THREE.Vector4(theme0.fx.glow, theme0.fx.sparkle, ...theme0.fx.tScale) },
      uFxB: { value: new THREE.Vector4(theme0.fx.glow, theme0.fx.sparkle, ...theme0.fx.tScale) },
      uSnowflake: { value: 0.0 },
      uStretch: { value: 140.0 },
      uSpeedGlow: { value: 45.0 },
      uFogColor: { value: new THREE.Vector3(...this.bgSrgbA) },
      uFogNear: { value: 2.3 },
      uFogFar: { value: 3.0 },
    };

    this.tier = pickTier();
    const settings = loadSettings();
    this.userCount = settings.count;
    this.instanceCount = this.userCount ?? TIER_COUNTS[this.tier];

    this.post = new PostPipeline(this.renderer, this.scene, this.camera, this.tier);

    this.curl = this.buildCurl(this.instanceCount);
    this.curl.activate(this.scene);

    applyThemeCssVars(0);

    window.addEventListener('resize', this.onResize);
    window.addEventListener('mousemove', this.onMouseMove);
  }

  private buildCurl(count: number): Curl {
    const featherGeo = createFeatherGeometry(0.015);
    return new Curl({
      soulUniforms: this.soulUniforms,
      bodyUniforms: this.bodyUniforms,
      geometry: featherGeo,
      instanceNumber: count,
      renderer: this.renderer,
      vertexShader: vsSnakeGlsl,
      fragmentShader: fsSnakeGlsl,
      simulationShader: this.simShader,
      defines: this.post.active ? { USE_LINEAR_OUT: '' } : undefined,
    });
  }

  /** Tear down and recreate the particle system at a new count. Call only
   *  from event handlers / timeouts — never mid-animate. */
  rebuildCurl(count: number): void {
    this.curl.deactivate(this.scene);
    this.curl.dispose();
    this.instanceCount = count;
    this.curl = this.buildCurl(count);
    this.curl.activate(this.scene);
    // Text targets are sized to the lookup texture; regenerate for the new size.
    if (this.textString) {
      const text = this.textString;
      this.textTexture?.dispose();
      this.textTexture = null;
      this.initTextTargets(text);
    }
  }

  private onMouseMove = (e: MouseEvent): void => {
    if ((this.soulUniforms.mouseForce.value as number) === 0) return;
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
    this.post.setSize(w, h);
  };

  /** World-space size of the z=0 plane as seen by the camera. */
  worldSizeAtZ0(): { w: number; h: number } {
    const h = 2 * this.camera.position.z * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    return { w: h * this.camera.aspect, h };
  }

  /* ── Mouse attract / repel ── */

  /** Slideshow hook: enable attract on title/closing slides ('auto' mode). */
  setAttract(enabled: boolean): void {
    this.autoAttract = enabled;
    this.applyMouse();
  }

  setMouseMode(mode: MouseMode): void {
    this.panelMouseMode = mode;
    this.applyMouse();
  }

  setMouseStrength(strength: number): void {
    this.mouseStrength = strength;
    this.applyMouse();
  }

  private applyMouse(): void {
    const mode =
      this.panelMouseMode === 'auto'
        ? (this.autoAttract ? 'attract' : 'off')
        : this.panelMouseMode;
    this.soulUniforms.mouseForce.value =
      mode === 'attract' ? this.mouseStrength : mode === 'repel' ? -this.mouseStrength : 0;
    if (mode === 'off') {
      (this.soulUniforms.mousePos.value as THREE.Vector3).set(0, 0, 0);
    }
  }

  /* ── Theme transitions ── */

  /** Blend the particles + background to a theme. Always blends between
   *  exactly two palettes — no pass-through of intermediate themes. */
  setTheme(index: number): void {
    if (index === this.themeIndexB && this.blend >= 1) return;

    const eased = easeInOutQuad(Math.min(1, this.blend));

    // Snapshot the currently-visible blended state into side A
    const palA = this.bodyUniforms.uPaletteA.value as THREE.Vector3[];
    const palB = this.bodyUniforms.uPaletteB.value as THREE.Vector3[];
    for (let s = 0; s < 5; s++) palA[s].lerp(palB[s], eased);
    (this.bodyUniforms.uFxA.value as THREE.Vector4).lerp(
      this.bodyUniforms.uFxB.value as THREE.Vector4,
      eased
    );
    this.bodyUniforms.uNormalA.value =
      (this.bodyUniforms.uNormalA.value as number) +
      ((this.bodyUniforms.uNormalB.value as number) - (this.bodyUniforms.uNormalA.value as number)) * eased;
    this.colorA.lerp(this.colorB, eased);
    this.bgSrgbA = [
      this.bgSrgbA[0] + (this.bgSrgbB[0] - this.bgSrgbA[0]) * eased,
      this.bgSrgbA[1] + (this.bgSrgbB[1] - this.bgSrgbA[1]) * eased,
      this.bgSrgbA[2] + (this.bgSrgbB[2] - this.bgSrgbA[2]) * eased,
    ];

    // Load the new target into side B
    const theme = THEMES[index] ?? THEMES[0];
    for (let s = 0; s < 5; s++) palB[s].set(...theme.palette[s]);
    (this.bodyUniforms.uFxB.value as THREE.Vector4).set(
      theme.fx.glow, theme.fx.sparkle, theme.fx.tScale[0], theme.fx.tScale[1]
    );
    this.bodyUniforms.uNormalB.value = theme.normalMode ? 1.0 : 0.0;
    this.colorB.set(theme.bg);
    this.bgSrgbB = bgToRgb(theme.bg);
    this.snowTarget = theme.snowflake;

    this.blend = 0;
    this.themeIndexB = index;

    applyThemeCssVars(index);
    this.post.kickDamp(0.55, 300);
  }

  get currentTheme(): number {
    return this.themeIndexB;
  }

  /* ── Text formation ── */

  /** Start generating the target texture for particle text formation. */
  initTextTargets(text: string): void {
    this.textString = text;
    const lookupSize = this.curl.soul.size;
    const { w } = this.worldSizeAtZ0();
    this.textPromise = createTextTargetTexture(text, lookupSize, w).then((tex) => {
      // A rebuild may have superseded this generation
      if (this.textString !== text) {
        tex.dispose();
        return;
      }
      this.textTexture?.dispose();
      this.textTexture = tex;
      this.soulUniforms.t_target.value = tex;
    });
  }

  /** Ramp particle text formation on/off. */
  setTextFormation(active: boolean): void {
    // Releasing a held formation fires a scatter burst so the letters
    // dissolve into the flow instead of lingering as a dense cluster.
    if (!active && this.targetStrengthGoal > 0 && this.textTexture) {
      this.burst = 1;
      // Flush bright trails so the dissolve doesn't smear into a whiteout
      this.post.kickDamp(0.45, 1200);
    }
    this.targetStrengthGoal = active ? 1 : 0;
  }

  disposeTextTargets(): void {
    this.targetStrengthGoal = 0;
    this.soulUniforms.targetStrength.value = 0;
    this.soulUniforms.t_target.value = null;
    this.textTexture?.dispose();
    this.textTexture = null;
    this.textString = null;
    this.textPromise = null;
  }

  /* ── Content-aware flow ── */

  /** Deflect particles around a DOM rect (project card), or clear with null. */
  setCardRect(rect: DOMRect | null): void {
    if (!rect) {
      this.cardStrengthTarget = 0;
      return;
    }
    const { w: worldW, h: worldH } = this.worldSizeAtZ0();
    const cx = ((rect.left + rect.width / 2) / window.innerWidth - 0.5) * worldW;
    const cy = -((rect.top + rect.height / 2) / window.innerHeight - 0.5) * worldH;
    const scale = worldW / window.innerWidth;
    (this.soulUniforms.cardCenter.value as THREE.Vector3).set(cx, cy, 0);
    (this.soulUniforms.cardHalfSize.value as THREE.Vector2).set(
      (rect.width / 2) * scale,
      (rect.height / 2) * scale
    );
    this.soulUniforms.cardRadius.value = 24 * scale;
    this.cardStrengthTarget = 1;
  }

  /** Per-slide ambient wind direction. */
  setWind(x: number, y: number, z: number): void {
    this.windTarget.set(x, y, z);
  }

  /** Momentary gust (e.g. from slideshow scroll velocity). Decays automatically. */
  addGust(x: number, y = 0): void {
    this.gust.x = THREE.MathUtils.clamp(this.gust.x + x, -3, 3);
    this.gust.y = THREE.MathUtils.clamp(this.gust.y + y, -3, 3);
  }

  /* ── Playground hooks ── */

  setSpeedMultiplier(m: number): void {
    this.speedMultiplier = m;
  }

  setNoiseSize(n: number): void {
    this.soulUniforms.noiseSize.value = n;
  }

  setTrailOverride(damp: number | null): void {
    this.trailOverride = damp;
  }

  setBloomMultiplier(m: number): void {
    this.bloomMult = m;
  }

  setParticleCount(count: number | null): void {
    this.userCount = count;
    this.rebuildCurl(count ?? TIER_COUNTS[this.tier]);
  }

  getParticleCount(): number {
    return this.instanceCount;
  }

  resetParticles(): void {
    this.curl.soul.resetRand(0.01);
  }

  /* ── Perf watch ── */

  /** Start sampling frame times; downgrade one tier if the device struggles.
   *  Call after the intro (rebuilds would reset text formation). */
  startPerfWatch(): void {
    if (this.frameMonitor || this.tier === 'low') return;
    this.frameMonitor = new FrameMonitor(60, 120, 33);
    this.frameMonitor.onSlow(() => {
      this.tier = lowerTier(this.tier);
      const newPost = new PostPipeline(this.renderer, this.scene, this.camera, this.tier);
      this.post.dispose();
      this.post = newPost;
      // Rebuild keeps USE_LINEAR_OUT consistent with the new pipeline
      if (this.userCount === null) {
        this.rebuildCurl(TIER_COUNTS[this.tier]);
      } else {
        this.rebuildCurl(this.userCount);
      }
    });
  }

  /* ── Main loop ── */

  start(): void {
    this.clock.start();
    const animate = (): void => {
      this.animationId = requestAnimationFrame(animate);

      const dT = this.clock.getDelta();
      this.soulUniforms.dT.value = dT * this.speedMultiplier;

      this.frameMonitor?.tick(dT);

      // Theme blend
      if (this.blend < 1) {
        this.blend = Math.min(1, this.blend + dT / 0.7);
      }
      const eased = easeInOutQuad(this.blend);
      this.bodyUniforms.uBlend.value = eased;

      // Background + fog track the blend
      this.clearColor.copy(this.colorA).lerp(this.colorB, eased);
      this.renderer.setClearColor(this.clearColor);
      const fog = this.bodyUniforms.uFogColor.value as THREE.Vector3;
      if (this.post.active) {
        fog.set(
          this.bgSrgbA[0] + (this.bgSrgbB[0] - this.bgSrgbA[0]) * eased,
          this.bgSrgbA[1] + (this.bgSrgbB[1] - this.bgSrgbA[1]) * eased,
          this.bgSrgbA[2] + (this.bgSrgbB[2] - this.bgSrgbA[2]) * eased
        );
      } else {
        fog.set(this.clearColor.r, this.clearColor.g, this.clearColor.b);
      }

      // Snowflake morph
      const snow = this.bodyUniforms.uSnowflake.value as number;
      this.bodyUniforms.uSnowflake.value = snow + (this.snowTarget - snow) * Math.min(1, dT * 4);

      // Bloom + trails toward per-theme targets
      const theme = THEMES[this.themeIndexB];
      if (this.post.active) {
        const target = theme.bloom;
        const cur = this.post.getBloomStrength();
        const goal = target.strength * this.bloomMult;
        this.post.setBloom(cur + (goal - cur) * Math.min(1, dT * 3), target.radius, target.threshold);
        this.post.setDamp(this.trailOverride ?? theme.afterimageDamp);
      }

      // Text formation strength ramp (in ~0.5s, out ~0.35s)
      const ts = this.soulUniforms.targetStrength.value as number;
      const goalActive = this.targetStrengthGoal > 0 && this.textTexture !== null;
      const tsGoal = goalActive ? this.targetStrengthGoal : 0;
      this.soulUniforms.targetStrength.value =
        ts + (tsGoal - ts) * Math.min(1, dT * (tsGoal > ts ? 2.2 : 3.0));

      // Release-burst decay (~1s)
      if (this.burst > 0.001) {
        this.burst *= Math.pow(0.12, dT);
      } else {
        this.burst = 0;
      }
      this.soulUniforms.burstStrength.value = this.burst;

      // Card deflection strength tween
      const cs = this.soulUniforms.cardStrength.value as number;
      this.soulUniforms.cardStrength.value =
        cs + (this.cardStrengthTarget - cs) * Math.min(1, dT * 3);

      // Wind: base direction lerp + decaying gust
      this.windCurrent.lerp(this.windTarget, Math.min(1, dT * 2));
      this.gust.multiplyScalar(Math.pow(0.92, dT * 60));
      (this.soulUniforms.windDir.value as THREE.Vector3)
        .copy(this.windCurrent)
        .add(this.gust);

      // Ambient light breathing
      const time = this.clock.elapsedTime;
      this.ambientLight.intensity =
        this.ambientConfig.baseIntensity +
        Math.sin(time * this.ambientConfig.breathSpeed) * this.ambientConfig.pulseAmount;

      this.curl.update();
      this.post.render();
    };

    animate();
  }

  dispose(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.disposeTextTargets();
    this.curl.dispose();
    this.post.dispose();
    this.renderer.dispose();
  }

  /** Resolves after the first frame renders. */
  getReady(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        this.renderer.render(this.scene, this.camera);
        resolve();
      });
    });
  }
}
