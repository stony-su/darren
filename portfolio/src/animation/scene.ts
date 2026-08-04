import * as THREE from 'three';
import { Curl } from './Curl';
import { createFeatherGeometry } from './Feather';
import { PostPipeline } from './PostPipeline';
import { STAGE_W, STAGE_H } from './IntroChoreography';
import type { TargetDrawer } from './IntroChoreography';
import { pickTier, lowerTier, TIER_COUNTS, FrameMonitor } from './quality';
import type { QualityTier } from './quality';
import { loadSettings } from './settings';
import type { MouseMode, LineMode } from './settings';
import { DEFAULT_MODE } from './modes';
import { findPreset } from './presets';
import type { PresetRunner } from './presets';
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
  private bloomMult = 1;
  private bloomOverride: number | null = null;
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

  // Filament-line mode (project-card slides, or forced via the panel)
  private lineTarget = 0;
  private autoLine = false;
  private panelLineMode: LineMode = 'auto';
  private simTime = 0;

  // Modes (persistent physics changes) + presets (scripted scenarios)
  private modeId = DEFAULT_MODE;
  private attractorTarget = 0;
  private holeTarget = 0;
  // Latest pointer position on the z=0 plane. Tracked separately from
  // `mousePos` (which only exists while a mouse force is armed) because the
  // black hole follows the pointer whether or not one is.
  private pointerWorld = new THREE.Vector3();
  private presetId: string | null = null;
  private presetRunner: PresetRunner | null = null;
  private presetSpeed: number | null = null;
  private presetBloom: number | null = null;

  // Animated formation targets (intro slides). A per-slide drawer paints
  // white shapes on an offscreen canvas; lit pixels become spring targets.
  private drawer: TargetDrawer | null = null;
  private drawerStart = 0;
  private lastRaster = -1;
  private targetTexture: THREE.DataTexture | null = null;
  private targetData: Float32Array | null = null;
  private targetCanvas: HTMLCanvasElement | null = null;
  private targetCtx: CanvasRenderingContext2D | null = null;
  private litBuf: Int32Array | null = null;
  private assignRand: Float32Array | null = null;
  private targetJitter: Float32Array | null = null;
  private hasTargets = false;
  private fontsReady = false;
  private targetStrengthGoal = 0;
  private burst = 0;
  private shock = 0;

  // Off-center formation placement (fractions of the visible world), eased.
  private formationGoalX = 0;
  private formationGoalY = 0;
  private formationOffX = 0;
  private formationOffY = 0;

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
      noiseSize: { value: 1.5 },
      exclusionRadius: { value: 0.35 },
      mousePos: { value: new THREE.Vector3(0, 0, 0) },
      mouseForce: { value: 0.0 },
      t_target: { value: null },
      targetStrength: { value: 0.0 },
      formationParticipation: { value: 0.45 },
      cardCenter: { value: new THREE.Vector3(0, 0, 0) },
      cardHalfSize: { value: new THREE.Vector2(0.5, 0.35) },
      cardRadius: { value: 0.05 },
      cardStrength: { value: 0.0 },
      windDir: { value: new THREE.Vector3(0, 0, 0) },
      burstStrength: { value: 0.0 },
      shockCenter: { value: new THREE.Vector3(0, 0, 0) },
      shockStrength: { value: 0.0 },
      uTime: { value: 0.0 },
      lineStrength: { value: 0.0 },
      attractorStrength: { value: 0.0 },
      holeStrength: { value: 0.0 },
      holeCenter: { value: new THREE.Vector3(0, 0, 0) },
      speedSpread: { value: 0.0 },
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
      uFormationGlow: { value: 1.0 },
      uStretch: { value: 140.0 },
      uSpeedGlow: { value: 45.0 },
      uFogColor: { value: new THREE.Vector3(...this.bgSrgbA) },
      uFogNear: { value: 2.3 },
      uFogFar: { value: 3.0 },
      // Shared objects with the sim uniforms — one value drives both shaders
      uLineStrength: this.soulUniforms.lineStrength,
      uAttractor: this.soulUniforms.attractorStrength,
      uHole: this.soulUniforms.holeStrength,
    };

    this.tier = pickTier();
    const settings = loadSettings();
    this.userCount = settings.count;
    this.instanceCount = this.userCount ?? TIER_COUNTS[this.tier];

    this.post = new PostPipeline(this.renderer, this.scene, this.camera, this.tier);

    this.curl = this.buildCurl(this.instanceCount);
    this.curl.activate(this.scene);

    applyThemeCssVars(0);

    // Formations rasterize real fonts; wait for Playfair (capped so a font
    // outage never blanks the intro).
    Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]).then(() => {
      this.fontsReady = true;
    });

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
    // Formation targets are sized to the lookup texture; the next raster
    // tick regenerates them for the new size.
    if (this.drawer) {
      this.ensureTargetResources();
      this.lastRaster = -1;
    } else {
      // Mid-browse rebuilds (perf downgrade, count change) must not collapse
      // the field to the center — it hides behind the card for seconds.
      this.seedSpread();
    }
  }

  private onMouseMove = (e: MouseEvent): void => {
    const force = this.soulUniforms.mouseForce.value as number;
    // Skipped entirely when nothing wants the pointer — but black-hole mode
    // always does, since the well *is* the pointer.
    if (force === 0 && this.holeTarget === 0) return;
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    this.raycaster.ray.intersectPlane(this.attractPlane, this.intersectPoint);
    this.pointerWorld.copy(this.intersectPoint);
    if (force !== 0) {
      (this.soulUniforms.mousePos.value as THREE.Vector3).copy(this.intersectPoint);
    }
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

  /* ── Animated formation targets ── */

  /**
   * Set the drawer whose output the particles chase (null clears it). The
   * drawer's clock restarts, so slide animations begin fresh on entry. The
   * scene re-rasterizes a few times a second while formation is active; the
   * particle springs do the actual tweening between frames.
   */
  setTargetDrawer(drawer: TargetDrawer | null): void {
    this.drawer = drawer;
    this.drawerStart = performance.now() / 1000;
    this.lastRaster = -1;
  }

  /** Shift the whole formation off the middle of the stage. x/y are fractions
   *  of the visible world size (x right, y up); the applied offset is eased and
   *  clamped at raster time so the shape can never leave the frame. Lets each
   *  slide place its cloud somewhere other than dead center. */
  setFormationOffset(x: number, y: number): void {
    this.formationGoalX = x;
    this.formationGoalY = y;
  }

  /** Fraction of particles that join the next formation (0..1). Lower keeps a
   *  compact shape sparse and colorful instead of overlapping into a white
   *  blob; the default suits wide formations like the DARREN wordmark. */
  setFormationParticipation(fraction: number): void {
    this.soulUniforms.formationParticipation.value = Math.max(0.04, Math.min(1, fraction));
  }

  /** Ramp particle formation on/off. `releaseShock` scales the blast that
   *  fires when a held formation lets go — the intro wants the full kick, a
   *  preset running the sim hot needs less of one (the shock force scales with
   *  the sim speed, so at 1.5x the default throws the field clean off-frame). */
  setTextFormation(active: boolean, releaseShock = 1): void {
    // Releasing a held formation fires a scatter burst so the shapes
    // dissolve into the flow instead of lingering as a dense cluster, plus a
    // shockwave centered on the shape so it visibly blows apart first.
    if (!active && this.targetStrengthGoal > 0 && this.hasTargets) {
      this.burst = 1;
      const { offX, offY } = this.formationStage();
      (this.soulUniforms.shockCenter.value as THREE.Vector3).set(offX, offY, 0);
      this.shock = releaseShock;
      // Flush bright trails so the dissolve doesn't smear into a whiteout
      this.post.kickDamp(0.45, 1200);
    }
    this.targetStrengthGoal = active ? 1 : 0;
  }

  disposeTargets(): void {
    this.drawer = null;
    this.targetStrengthGoal = 0;
    this.soulUniforms.targetStrength.value = 0;
    this.soulUniforms.t_target.value = null;
    this.targetTexture?.dispose();
    this.targetTexture = null;
    this.targetData = null;
    this.assignRand = null;
    this.targetJitter = null;
    this.targetCanvas = null;
    this.targetCtx = null;
    this.litBuf = null;
    this.hasTargets = false;
  }

  /** Lazily (re)build the canvas + lookup-sized target buffers. */
  private ensureTargetResources(): void {
    if (!this.targetCanvas || !this.targetCtx) {
      this.targetCanvas = document.createElement('canvas');
      this.targetCanvas.width = STAGE_W;
      this.targetCanvas.height = STAGE_H;
      this.targetCtx = this.targetCanvas.getContext('2d', { willReadFrequently: true })!;
      this.litBuf = new Int32Array(STAGE_W * STAGE_H);
    }
    const size = this.curl.soul.size;
    if (!this.targetTexture || this.targetTexture.image.width !== size) {
      const texels = size * size;
      this.targetTexture?.dispose();
      this.targetData = new Float32Array(texels * 4);
      this.assignRand = new Float32Array(texels);
      this.targetJitter = new Float32Array(texels * 3);
      for (let i = 0; i < texels; i++) {
        // w: stable per-particle stagger — also the participation mask, so
        // the same particles stay members across every animation frame.
        this.targetData[i * 4 + 3] = Math.random();
        // Stable position within the lit-pixel list: small shape changes
        // become small target moves instead of a full reshuffle.
        this.assignRand[i] = Math.random();
        this.targetJitter[i * 3] = (Math.random() - 0.5) * 0.01;
        this.targetJitter[i * 3 + 1] = (Math.random() - 0.5) * 0.01;
        this.targetJitter[i * 3 + 2] = (Math.random() - 0.5) * 0.06;
      }
      this.targetTexture = new THREE.DataTexture(
        this.targetData, size, size, THREE.RGBAFormat, THREE.FloatType
      );
      this.targetTexture.minFilter = THREE.NearestFilter;
      this.targetTexture.magFilter = THREE.NearestFilter;
      this.hasTargets = false;
      this.soulUniforms.t_target.value = this.targetTexture;
    }
  }

  /** World-space placement of the formation stage: size, plus the eased
   *  offset clamped so the shape can never leave the frame. Shared by target
   *  rasterization and the transition shockwave, so the burst is centered on
   *  the shape that just let go. */
  private formationStage(): { offX: number; offY: number; stageW: number; stageH: number } {
    const { w: worldW, h: worldH } = this.worldSizeAtZ0();
    const stageW = Math.min(2.7, worldW * 0.9);
    const stageH = stageW * (STAGE_H / STAGE_W);
    const maxOffX = Math.max(0, worldW * 0.5 - stageW * 0.5 - worldW * 0.04);
    const maxOffY = Math.max(0, worldH * 0.5 - stageH * 0.5 - worldH * 0.04);
    return {
      offX: Math.max(-maxOffX, Math.min(maxOffX, this.formationOffX * worldW)),
      offY: Math.max(-maxOffY, Math.min(maxOffY, this.formationOffY * worldH)),
      stageW,
      stageH,
    };
  }

  /** Draw the active drawer's current frame and pack lit pixels into the
   *  target texture. The canvas maps to a fixed centered world rect, so
   *  drawers compose against a stable stage. */
  private rasterizeTargets(now: number): void {
    const ctx = this.targetCtx!;
    ctx.clearRect(0, 0, STAGE_W, STAGE_H);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    this.drawer!(ctx, now - this.drawerStart);

    const img = ctx.getImageData(0, 0, STAGE_W, STAGE_H).data;
    const lit = this.litBuf!;
    let n = 0;
    for (let i = 0, p = 3; i < STAGE_W * STAGE_H; i++, p += 4) {
      if (img[p] > 128) lit[n++] = i;
    }
    if (n === 0) return; // blank frame — hold the previous targets

    const { offX, offY, stageW, stageH } = this.formationStage();
    const size = this.curl.soul.size;
    const texels = size * size;
    const data = this.targetData!;
    const assign = this.assignRand!;
    const jitter = this.targetJitter!;
    for (let i = 0; i < texels; i++) {
      const pix = lit[(assign[i] * n) | 0];
      const px = pix % STAGE_W;
      const py = (pix / STAGE_W) | 0;
      data[i * 4] = (px / STAGE_W - 0.5) * stageW + offX + jitter[i * 3];
      data[i * 4 + 1] = -(py / STAGE_H - 0.5) * stageH + offY + jitter[i * 3 + 1];
      data[i * 4 + 2] = jitter[i * 3 + 2];
    }
    this.targetTexture!.needsUpdate = true;
    this.hasTargets = true;
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

  /** Slideshow hook: gather the field into curl filament lines on
   *  project-card slides ('auto' panel mode). */
  setLineMode(on: boolean): void {
    this.autoLine = on;
    this.applyLine();
  }

  /** Playground override: 'auto' follows the slideshow, 'on'/'off' force it. */
  setLineModeOverride(mode: LineMode): void {
    this.panelLineMode = mode;
    this.applyLine();
  }

  private applyLine(): void {
    // Attractor and black-hole mode both outrank swirl lines. A 64-particle
    // chain is about as long as the whole attractor, so the followers wrap
    // right across it and smear the butterfly into an oval smudge; under the
    // black hole a leader that falls through the horizon respawns on the rim
    // and hauls its entire chain across the stage behind it. Project slides
    // turn lines on by themselves, so this combination is the default path
    // into a mode, not an exotic one — lines come back the moment it goes off.
    const on =
      this.attractorTarget > 0 || this.holeTarget > 0
        ? false
        : this.panelLineMode === 'auto'
          ? this.autoLine
          : this.panelLineMode === 'on';
    if (on && this.lineTarget === 0) {
      // Chains assembling at speed leave bright smears; keep trails flushed
      // until the lines have mostly formed.
      this.post.kickDamp(0.5, 2500);
    }
    this.lineTarget = on ? 1 : 0;
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

  /* ── Modes + presets ── */

  /** Switch the field's physics (see modes.ts). Unknown ids fall back to the
   *  default, so a stale saved setting can never wedge the scene. */
  setMode(id: string): void {
    this.modeId = id;
    const attractor = id === 'attractor' ? 1 : 0;
    const hole = id === 'blackhole' ? 1 : 0;
    // The field re-forms onto the new manifold over a second or so — several,
    // for the black hole, which has to reel the corners of the stage in before
    // the disc exists. Keep the trails flushed until it has, or the migration
    // smears into a whiteout.
    if (attractor && this.attractorTarget === 0) this.post.kickDamp(0.5, 2200);
    if (hole && this.holeTarget === 0) this.post.kickDamp(0.5, 4000);
    this.attractorTarget = attractor;
    this.holeTarget = hole;
    this.applyLine();
  }

  get currentMode(): string {
    return this.modeId;
  }

  /** Run a scripted preset (see presets.ts), or null to stop the current one.
   *  Stopping restores the user's sim speed and bloom. */
  setPreset(id: string | null): void {
    if (id === this.presetId) return;
    // Hand the sim speed back *before* stopping: a preset's stop releases its
    // formation, and that blast scales with whatever speed is in force when it
    // lands. Stopping the knot (which runs at 10x) with its own speed still
    // applied throws the whole field off-screen.
    const running = this.presetRunner;
    this.presetRunner = null;
    this.presetId = null;
    this.presetSpeed = null;
    this.presetBloom = null;
    running?.stop(this);

    const def = findPreset(id);
    if (!def) return;
    this.presetId = def.id;
    this.presetSpeed = def.simSpeed ?? null;
    this.presetRunner = def.start(this);
  }

  get currentPreset(): string | null {
    return this.presetId;
  }

  /** Preset hook: bloom strength that outranks both the theme and the
   *  per-slide override, so navigating slides mid-preset can't clobber it. */
  setPresetBloom(strength: number | null): void {
    this.presetBloom = strength;
  }

  /** Preset hook: fire a shockwave centred on the formation stage. */
  shockwave(strength: number): void {
    const { offX, offY } = this.formationStage();
    (this.soulUniforms.shockCenter.value as THREE.Vector3).set(offX, offY, 0);
    this.shock = Math.max(this.shock, strength);
  }

  /** Preset hook: briefly flush motion trails. */
  kickTrails(damp: number, durationMs: number): void {
    this.post.kickDamp(damp, durationMs);
  }

  /** Give each particle its own speed, drawn on a bell curve spanning
   *  0.1x..10x of the sim speed (off = everything runs at one speed). With
   *  swirl lines on, the draw is per chain so a filament stays one object. */
  setRandomSpeed(enabled: boolean): void {
    this.soulUniforms.speedSpread.value = enabled ? 1 : 0;
  }

  setTrailOverride(damp: number | null): void {
    this.trailOverride = damp;
  }

  setBloomMultiplier(m: number): void {
    this.bloomMult = m;
  }

  /** Replace the current theme's bloom strength (null = back to the theme's
   *  own value). For slides whose formation blooms out even though the theme
   *  suits the rest of the scene; themes are shared with project slides, so
   *  they can't be retuned per intro line. */
  setBloomOverride(strength: number | null): void {
    this.bloomOverride = strength;
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

  /** Seed the field already spread out — for boots that skip the intro's
   *  center fan-out (deep links, revisits), so particles don't spend their
   *  first seconds hidden behind the project card. Mostly seeded behind the
   *  card plane: near-camera density washes the card out through its blur. */
  seedSpread(): void {
    const soul = this.curl.soul;
    const data = new Float32Array(soul.s2 * 4);
    for (let i = 0; i < soul.s2; i++) {
      // Fixed world extent, larger than the widest frustum: a narrow
      // viewport sees a slice, keeping on-screen density consistent.
      data[i * 4] = (Math.random() - 0.5) * 4.8;
      data[i * 4 + 1] = (Math.random() - 0.5) * 3.0;
      data[i * 4 + 2] = -1.0 + Math.random() * 1.3;
      data[i * 4 + 3] = 0;
    }
    const tex = new THREE.DataTexture(data, soul.size, soul.size, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    soul.reset(tex);
    tex.dispose();
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
      // A running preset owns the sim speed; the user's slider value is kept
      // untouched underneath and takes over again the moment it stops.
      const speed = this.presetSpeed ?? this.speedMultiplier;
      this.soulUniforms.dT.value = dT * speed;
      // Sim clock scales with the speed multiplier so floater oscillation
      // paces with the rest of the field
      this.simTime += dT * speed;
      this.soulUniforms.uTime.value = this.simTime;

      // Preset choreography runs on the wall clock, not the sim clock, so its
      // beats land at the same moments whatever the sim speed is.
      this.presetRunner?.update?.(this, dT);

      // Filament-line mode ramps in/out over ~1s
      const ls = this.soulUniforms.lineStrength.value as number;
      this.soulUniforms.lineStrength.value =
        ls + (this.lineTarget - ls) * Math.min(1, dT * 1.1);

      // Mode ramps: attractor / black hole take over the field over ~1s
      const as = this.soulUniforms.attractorStrength.value as number;
      this.soulUniforms.attractorStrength.value =
        as + (this.attractorTarget - as) * Math.min(1, dT * 1.1);
      const hs = this.soulUniforms.holeStrength.value as number;
      this.soulUniforms.holeStrength.value =
        hs + (this.holeTarget - hs) * Math.min(1, dT * 1.1);
      // The well lags the pointer by ~0.4s. A black hole that tracks the cursor
      // exactly reads as weightless, and a flick across the stage snaps the
      // whole disc sideways and tears it apart; trailing it drags the disc
      // along instead, which is most of what sells the mass.
      (this.soulUniforms.holeCenter.value as THREE.Vector3).lerp(
        this.pointerWorld,
        Math.min(1, dT * 2.2)
      );

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
        // The concentrating modes are the densest steady states the field has;
        // they need less bloom and shorter trails than any theme asks for, or
        // the attractor's lobes and the black hole's inner disc fill in solid.
        // Ramped with the mode so the switch stays smooth, and still yields to
        // an explicit trail setting from the playground.
        const dense = Math.max(
          this.soulUniforms.attractorStrength.value as number,
          this.soulUniforms.holeStrength.value as number
        );
        const goal =
          (this.presetBloom ?? this.bloomOverride ?? target.strength) *
          this.bloomMult *
          (1 - 0.45 * dense);
        this.post.setBloom(cur + (goal - cur) * Math.min(1, dT * 3), target.radius, target.threshold);
        const damp = theme.afterimageDamp + (0.52 - theme.afterimageDamp) * dense;
        this.post.setDamp(this.trailOverride ?? damp);
      }

      // Animated formation: re-rasterize the active drawer a few times a
      // second while the formation is (or is fading) on-screen.
      const strengthNow = this.soulUniforms.targetStrength.value as number;
      if (this.drawer && this.fontsReady && (this.targetStrengthGoal > 0 || strengthNow > 0.001)) {
        const now = performance.now() / 1000;
        if (this.lastRaster < 0 || now - this.lastRaster >= 0.08) {
          this.ensureTargetResources();
          this.rasterizeTargets(now);
          this.lastRaster = now;
        }
      }

      // Formation strength ramp (in ~0.5s, out ~0.35s)
      const ts = this.soulUniforms.targetStrength.value as number;
      const goalActive = this.targetStrengthGoal > 0 && this.hasTargets;
      const tsGoal = goalActive ? this.targetStrengthGoal : 0;
      this.soulUniforms.targetStrength.value =
        ts + (tsGoal - ts) * Math.min(1, dT * (tsGoal > ts ? 2.2 : 3.0));

      // Held formations dim their palette glow so dense shapes read as color
      // instead of blooming to white (the DARREN theme has glow 0 already).
      // The concentrating modes get the same treatment: packing the field onto
      // a thin manifold or into an accretion disc is, on a glowing theme, the
      // same whiteout by another road.
      this.bodyUniforms.uFormationGlow.value =
        (1 - 0.85 * (this.soulUniforms.targetStrength.value as number)) *
        (1 -
          0.55 *
            Math.max(
              this.soulUniforms.attractorStrength.value as number,
              this.soulUniforms.holeStrength.value as number
            ));

      // Release-burst decay (~1s)
      if (this.burst > 0.001) {
        this.burst *= Math.pow(0.12, dT);
      } else {
        this.burst = 0;
      }
      this.soulUniforms.burstStrength.value = this.burst;

      // Shockwave decay (~0.4s). Deliberately much shorter than the burst:
      // the scatter has to be spent by the time the next formation gathers,
      // or the shapes fight the spring pulling them back in.
      if (this.shock > 0.001) {
        this.shock *= Math.pow(0.0004, dT);
      } else {
        this.shock = 0;
      }
      this.soulUniforms.shockStrength.value = this.shock;

      // Ease the formation offset toward its per-slide goal (~0.4s)
      const offK = Math.min(1, dT * 2.5);
      this.formationOffX += (this.formationGoalX - this.formationOffX) * offK;
      this.formationOffY += (this.formationGoalY - this.formationOffY) * offK;

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
    this.disposeTargets();
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
