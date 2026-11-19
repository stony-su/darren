import * as THREE from 'three';
import type { Project, ProjectPage } from '../data/projects';
import { THEMES } from '../theme/themes';
import { placeholderPages } from '../data/placeholderPages';
import { GlassStage } from './GlassStage';
import type { StageClient } from './GlassStage';
import { fracture, hashString, mulberry32 } from './fracture';
import type { Cell, ShardKind } from './fracture';
import { buildShardGeometry } from './shardGeometry';
import {
  blankTexture,
  HERO_MAX,
  loadTexture,
  noiseTexture,
  textureFromImage,
  textureFromVideo,
} from './textures';
import type { LoadedTexture } from './textures';

import glassVert from '../shaders/glass-vert.glsl?raw';
import glassFrag from '../shaders/glass-frag.glsl?raw';

/* ── Timing, in seconds unless the name says otherwise ── */

const DWELL_MS = 540;      // hover on the picture before it gives way
const REVEAL_S = 0.22;     // cross-fade from the DOM picture to the glass
const BURST_S = 1.25;      // a shard's flight out
const BURST_STAGGER_S = 0.22;
const RETURN_S = 0.8;
const RETURN_STAGGER_S = 0.16;
const SEAL_S = 0.34;       // glass fades back to the picture after landing
const LEAVE_GRACE_MS = 380;

/* ── Slab proportions per kind, in pane pixels ── */

const SLAB: Record<ShardKind, { half: number; bevel: number; dome: number; grow: number }> = {
  plate: { half: 15, bevel: 5.5, dome: 13, grow: 1.6 },
  shard: { half: 12, bevel: 4.6, dome: 9.5, grow: 1.4 },
  chip: { half: 9, bevel: 3.4, dome: 6, grow: 1.2 },
};

/* ── The exploded view ──
 * Where the cloud sits once it is out. `spread` scales the fracture pattern
 * up about the impact so it fills the slide; `z` is how far each kind comes
 * toward the eye. Plates hang back and stay legible, chips come right at
 * you, and a couple of plates are sent *behind* the pane so the cloud has
 * depth in both directions rather than only toward the viewer. */

const REACH_X = 0.40;
const REACH_Y = 0.36;
const KIND_SPREAD: Record<ShardKind, number> = { plate: 1, shard: 1.02, chip: 1.1 };
const KIND_TUMBLE: Record<ShardKind, number> = { plate: 0.14, shard: 0.3, chip: 0.9 };

/* ── The dish ──────────────────────────────────────────────────────────────
 * The cloud is not a flat spray at assorted depths: it lies on a shallow
 * bowl with its mouth toward the viewer. Pieces from the middle of the pane
 * sink away behind where the picture was; pieces from the edges come forward
 * past it. Because the camera is a real perspective, the near ones grow and
 * the far ones shrink on their own, so the arrangement reads as one curved
 * surface rather than as scattered cards.
 *
 * Depth comes from where a shard lands *on screen*, not from where its cell
 * sat in the pane, so the small centre chips — which are thrown wider than
 * their cells were — still sit on the same surface as everything else.
 *
 * The power keeps the floor of the bowl broad and lifts the rim late; a
 * linear ramp gives a cone, which reads as a funnel instead of a dish. */

const DISH_CENTRE = -170;   // px, the floor of the bowl, behind the pane
const DISH_RIM = 205;       // px, where the outermost pieces come forward to
const DISH_POWER = 1.5;
const DISH_JITTER = 46;     // px, so it is broken glass and not a machined dish
const SHELL_TILT = 0.36;    // rad at the rim: pieces lie along the bowl's face
// The floor of the dish shrinks whatever sits on it, and the pieces down
// there are the smallest to begin with; they keep a little more size than
// the rim pieces so the middle of the bowl does not read as a hole.
const KIND_SCALE: Record<ShardKind, [number, number]> = {
  plate: [0.80, 0.94],
  shard: [0.84, 1.0],
  chip: [0.88, 1.12],
};

/* ── Spin ──
 * One shard at a time is taken hold of and turned like a globe, about its own
 * centre. The axis is always a SCREEN axis, never a body axis, so it cannot
 * gimbal however far the shard has already been turned — which is why nothing
 * here needs the pitch limit the old Euler pair had to be held away from.
 *
 * The arrangement itself no longer moves: nothing sways, leans, homes or is
 * dragged as a whole, so the pitch limit, the homing time constant, the
 * parallax lean and the sway all went with the root.rotation write in tick(). */

const SPIN_RAD_PER_PX = 0.012;   // ~520px of drag is one full turn
const SPIN_FRICTION_S = 0.42;    // e-fold of the coast after release
const SPIN_STOP = 0.02;          // rad/s below which nothing is visibly moving
const SPIN_MAX_RATE = 26;        // rad/s; past ~4 turns a second the face strobes

const MAX_BUILT = 2;            // projects kept on the GPU at once
const built: LiquidGlass[] = [];

type State = 'idle' | 'arming' | 'open' | 'closing';

interface Pose {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  scale: number;
}

interface Shard {
  cell: Cell;
  mesh: THREE.Mesh;
  uniforms: Record<string, THREE.IUniform>;
  shut: Pose;
  open: Pose;
  /** Pose the current transition started from, so an interrupt is smooth. */
  from: Pose;
  fromAmt: number;
  /**
   * The interpolated pose alone, with the drift, the tumble and the pointer's
   * spin left out. The mesh carries all three on top of this; `from` must be
   * captured from here and never from the mesh — see startTransition.
   */
  pose: Pose;
  /**
   * The turn the pointer has put into this shard: about SCREEN axes, and
   * about the shard's own centre. Identity until something takes hold of it.
   */
  spin: THREE.Quaternion;
  /** What to keep turning by after release: a world axis whose length is the
   *  rate in radians per second. */
  spinVel: THREE.Vector3;
  /** 0 assembled, 1 fully out. */
  amt: number;
  /** Distance from the impact, 0..1, which sets the stagger both ways. */
  dist: number;
  delay: number;
  duration: number;
  elapsed: number;
  target: 0 | 1;
  drift: { amp: THREE.Vector3; speed: number; phase: number; axis: THREE.Vector3; rate: number };
  /** Free rotation picked up since the shard left, in radians. */
  tumble: number;
  pageMix: number;
}

export interface GlassHooks {
  onOpen?: (g: LiquidGlass) => void;
  onClose?: (g: LiquidGlass) => void;
  /** Everything has landed and the picture is whole again. */
  onSettled?: (g: LiquidGlass) => void;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * A damped spring solved in closed form: quick out, one soft overshoot, then
 * it settles. Glass that lands dead on its mark looks like a slideshow; this
 * is what gives the shards a sense of mass.
 */
function settle(t: number): number {
  if (t >= 1) return 1;
  const w = 7.4;
  const z = 5.2;
  return 1 - Math.exp(-z * t) * (Math.cos(w * t) + (z / w) * Math.sin(w * t));
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const SPARE_Q = new THREE.Quaternion();
const SPARE_V = new THREE.Vector3();
// The spin's own scratch. Kept apart from SPARE_Q, which the tumble uses in
// the same loop iteration, so a later edit to one cannot quietly reach into
// the other.
const SPIN_Q = new THREE.Quaternion();
const SPIN_AXIS = new THREE.Vector3();

/**
 * The hover reveal on a project card.
 *
 * Rest on the picture and it crazes, a bright front runs out from under the
 * pointer, and the pane comes apart into slabs of liquid glass that drift
 * out across the slide. They are real geometry in a real perspective — each
 * one a domed, bevelled solid with the picture refracting inside it — so
 * they pass in front of and behind each other, catch the light differently
 * as they turn, and can be taken hold of and spun. The large plates carry
 * the project's other screens, poured into their own outlines. Leave, and
 * they fly home and the picture is whole again.
 */
export class LiquidGlass implements StageClient {
  private card: HTMLElement;
  private media: HTMLElement;
  private host: HTMLElement;
  private project: Project;
  private hooks: GlassHooks;
  private pages: ProjectPage[];
  private accent: THREE.Color;
  private rng: () => number;
  private impactN: [number, number];

  private stage: GlassStage | null = null;
  private root: THREE.Group | null = null;
  private shards: Shard[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private textures: THREE.Texture[] = [];
  private shared: Record<string, THREE.IUniform> = {};
  private paneW = 0;
  private paneH = 0;
  private heroTex: THREE.Texture | null = null;
  /** What heroTex holds. A live video frame always outranks a still. */
  private heroKind: 'none' | 'still' | 'video' = 'none';
  private isBuilt = false;
  /** Bumped by every teardown, so a late image cannot land on a dead cut. */
  private buildGen = 0;
  private lastUsed = 0;
  /** The pointer has been on this card since it was last built. */
  private wantPages = false;
  private pagesRequested = false;

  private state: State = 'idle';
  private dwellTimer: number | null = null;
  private leaveTimer: number | null = null;
  private sealAt = 0;
  private clock = 0;
  private crackT = 0;
  private reveal = 0;

  private dragging = false;
  private dragId = -1;
  private dragLast: [number, number] = [0, 0];
  private dragAt = 0;
  /** The one shard a drag is turning. Never outlives endDrag(). */
  private grabbed: Shard | null = null;

  /* ── Picking ──
   * One raycaster and one hit array for the instance, and the meshes kept in
   * the same order as `shards` so a hit maps back with an indexOf instead of
   * a side table. Nothing on the pick path allocates. */
  private raycaster = new THREE.Raycaster();
  private pickList: THREE.Object3D[] = [];
  private hits: THREE.Intersection[] = [];
  private ndc = new THREE.Vector2();
  /** Last pointer position in viewport px, latched by the move handler and
   *  read once a frame. */
  private pointerX = 0;
  private pointerY = 0;
  /** The pointer has moved since the last pick was resolved. */
  private pickDirty = false;
  /** Timestamp after which a still pointer is re-picked anyway. */
  private pickDue = 0;
  private hovered: Shard | null = null;
  /** The card's box in viewport pixels, read once per layout. */
  private cardBox = { left: 0, top: 0, right: 0, bottom: 0 };
  /** Mirrors the `glass-grab` class, so it is written only when it changes. */
  private grabCursor = false;

  private video: HTMLVideoElement | null;
  private picture: HTMLElement | null;
  private pictureOpacity = 1;

  constructor(card: HTMLElement, media: HTMLElement, project: Project, hooks: GlassHooks = {}) {
    this.card = card;
    this.media = media;
    this.host = card.closest<HTMLElement>('.slide') ?? card;
    this.project = project;
    this.hooks = hooks;
    this.video = media.querySelector('video');
    this.picture = media.querySelector('img, video');
    this.pages = project.pages?.length ? project.pages : placeholderPages(project);
    this.accent = new THREE.Color(THEMES[project.theme].css.accent).convertSRGBToLinear();

    this.rng = mulberry32(hashString(project.title));
    // The break starts a little off dead centre, which reads as a strike
    // rather than as a diagram.
    this.impactN = [0.5 + (this.rng() - 0.5) * 0.22, 0.5 + (this.rng() - 0.5) * 0.22];

    card.addEventListener('pointerenter', this.onCardEnter);
    media.addEventListener('pointerenter', this.onMediaEnter);
    media.addEventListener('pointerleave', this.onMediaLeave);
    this.host.addEventListener('pointermove', this.onHostMove);
    this.host.addEventListener('pointerdown', this.onHostDown);
    this.host.addEventListener('pointerleave', this.onHostLeave);
    window.addEventListener('pointerup', this.onWindowUp);
    window.addEventListener('pointercancel', this.onWindowUp);
  }

  get isOpen(): boolean {
    return this.state === 'open';
  }

  /* ── Build ── */

  /** Cut the pane and put it on the GPU. Idempotent; safe to call early. */
  build(): void {
    if (this.isBuilt) {
      this.lastUsed = performance.now();
      return;
    }
    const w = this.media.offsetWidth;
    const h = this.media.offsetHeight;
    if (!w || !h) return;

    const stage = (this.stage = GlassStage.shared());
    const aniso = stage.renderer.capabilities.getMaxAnisotropy();
    this.paneW = w;
    this.paneH = h;

    const impact: [number, number] = [w * this.impactN[0], h * this.impactN[1]];
    const rng = mulberry32(hashString(this.project.title));
    const cells = fracture(w, h, impact, this.pages.length, rng);

    /* Uniforms every shard shares — one write moves the whole cloud. */
    const env = this.environmentFor();
    const noise = noiseTexture();
    this.textures.push(noise);
    this.shared = {
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uAccent: { value: this.accent },
      uKeyDir: { value: new THREE.Vector3(-0.42, 0.66, 0.62).normalize() },
      uFillDir: { value: new THREE.Vector3(0.68, -0.34, 0.65).normalize() },
      uEnvTop: { value: env.top },
      uEnvHorizon: { value: env.horizon },
      uEnvBottom: { value: env.bottom },
      uEnvWindow: { value: new THREE.Vector3(-0.34, 0.55, 0.76).normalize() },
      uPaneAspect: { value: w / h },
      uPaneSize: { value: new THREE.Vector2(w, h) },
      uImpactUv: { value: new THREE.Vector2(impact[0] / w, 1 - impact[1] / h) },
      uCrackR: { value: 0 },
      uCrackAmt: { value: 0 },
      uIor: { value: 1.52 },
      // ~26px of red-to-blue separation on a 1280px hero at the mid-bevel and
      // under 2px on the face. The old value gave about 2px everywhere, which
      // is below the threshold of visibility — which is why the edge
      // highlight stayed pure white, and pure white edges are what plastic does.
      uDispersion: { value: 0.085 },
      // Seven per cent of the bevel's width of channel separation at normal
      // incidence, seventeen at grazing: visible as colour, not as a blur.
      uEdgeSplit: { value: 0.075 },
      uTint: { value: 0.85 },
      uNoise: { value: noise },
    };

    const hero = this.heroTexture(aniso);
    const blank = blankTexture();
    this.textures.push(blank);
    if (hero) {
      this.textures.push(hero.texture);
      this.heroTex = hero.texture;
      this.heroKind = this.video && this.video.readyState >= 2 ? 'video' : 'still';
    }

    const root = new THREE.Group();
    this.root = root;
    this.shards = cells.map((cell) => this.buildShard(cell, hero?.texture ?? blank, blank));
    // The list the raycaster walks, built once and in shard order. Walked by
    // hand rather than by descending the scene graph, because the stage is
    // shared: MAX_BUILT keeps two projects' clouds in it at once and three's
    // raycaster tests `layers` and never `visible`, so the graph would hand
    // back a shard belonging to a card that is parked and hidden.
    this.pickList = this.shards.map((s) => s.mesh);
    this.shards.forEach((s) => root.add(s.mesh));
    root.visible = false;
    stage.add(root);

    this.layout();
    this.isBuilt = true;
    this.lastUsed = performance.now();
    this.registerBuilt();

    // Nothing decoded yet (a film still buffering, an image on its way): cut
    // the glass now and pour the still in behind it, so the first hover shows
    // the project and never a pane of dark glass.
    if (!hero) void this.loadStillHero(aniso);
    this.requestPages();
  }

  /**
   * The project's other screens are only wanted by someone who has come to
   * the card, so a visitor flicking through the deck never pays for them.
   */
  private requestPages(): void {
    if (!this.isBuilt || !this.wantPages || this.pagesRequested || !this.stage) return;
    this.pagesRequested = true;
    void this.loadPages(this.stage.renderer.capabilities.getMaxAnisotropy());
  }

  private environmentFor(): { top: THREE.Color; horizon: THREE.Color; bottom: THREE.Color } {
    // A cool studio ceiling over a dark floor, warmed a touch by the theme so
    // the reflections belong to this slide rather than to a generic showroom.
    const tint = this.accent.clone().multiplyScalar(0.35);
    return {
      top: new THREE.Color(0.44, 0.5, 0.62).add(tint),
      horizon: new THREE.Color(0.15, 0.18, 0.26).add(tint.clone().multiplyScalar(0.4)),
      bottom: new THREE.Color(0.014, 0.016, 0.03),
    };
  }

  private setHero(next: LoadedTexture, kind: 'still' | 'video'): void {
    this.heroKind = kind;
    const previous = this.heroTex;
    if (previous === next.texture) return; // repainted in place
    this.heroTex = next.texture;
    this.textures.push(next.texture);
    for (const shard of this.shards) shard.uniforms.uHero.value = next.texture;
    if (previous) {
      const i = this.textures.indexOf(previous);
      if (i >= 0) this.textures.splice(i, 1);
      previous.dispose();
    }
  }

  /**
   * Re-cut the hero from the video's current frame. A <video> usually has
   * nothing decodable yet when the slide warms up, so a video card would
   * otherwise shatter into blank glass; and even once it does, the frame
   * that matters is the one on screen when the pointer lands.
   */
  private refreshVideoFrame(): void {
    if (!this.video || !this.stage || !this.shards.length) return;
    const next = textureFromVideo(
      this.video,
      this.stage.renderer.capabilities.getMaxAnisotropy(),
      this.paneW / this.paneH,
      this.heroKind === 'video' ? this.heroTex : null,
    );
    if (next) this.setHero(next, 'video');
  }

  private heroTexture(aniso: number): LoadedTexture | null {
    const crop = this.paneW / this.paneH;
    const img = this.media.querySelector('img');
    if (img) {
      const t = textureFromImage(img, aniso, crop);
      if (t) return t;
    }
    if (this.video) return textureFromVideo(this.video, aniso, crop);
    return null;
  }

  /** The poster, or an image the browser has not finished decoding. */
  private async loadStillHero(aniso: number): Promise<void> {
    const img = this.media.querySelector('img');
    const src = this.video?.poster || img?.currentSrc || img?.dataset.src || img?.src;
    if (!src) return;
    const gen = this.buildGen;
    try {
      const still = await loadTexture(src, aniso, HERO_MAX, this.paneW / this.paneH);
      // A live frame may have arrived while this was in flight, and it wins.
      if (gen !== this.buildGen || this.heroKind === 'video') {
        still.texture.dispose();
        return;
      }
      this.setHero(still, 'still');
    } catch {
      // No still to show: the glass keeps its dark blank.
    }
  }

  private buildShard(cell: Cell, hero: THREE.Texture, blank: THREE.Texture): Shard {
    const slab = SLAB[cell.kind];
    const flow = this.rng() * Math.PI;
    const geo = buildShardGeometry(cell, {
      halfThickness: slab.half,
      bevel: slab.bevel,
      dome: slab.dome,
      grow: slab.grow,
      pane: { w: this.paneW, h: this.paneH },
      bevelSegments: cell.kind === 'chip' ? 3 : 4,
      domeRings: cell.kind === 'chip' ? 2 : 3,
    });
    // three's Mesh.raycast tests the bounding sphere, then every triangle —
    // unless the geometry also carries a box, which it builds only on request
    // and shardGeometry only ever computes the sphere. A slab is nothing like
    // a sphere: a plate is ~43px thick inside a sphere of radius ~217, so the
    // sphere alone waves through the near misses round a shard's corners and
    // pays a hundred-odd triangle tests for each. One line buys a tight
    // second gate, in the shard's own space, where the thickness counts.
    geo.computeBoundingBox();
    this.geometries.push(geo);

    const uniforms: Record<string, THREE.IUniform> = {
      ...this.shared,
      uHero: { value: hero },
      uPage: { value: blank },
      uPageMix: { value: 0 },
      // Raised by loadPages once this shard's page has arrived. Until then
      // the plate keeps showing the project instead of fading to nothing.
      uHasPage: { value: 0 },
      uPageFit: { value: new THREE.Vector2(1, 1) },
      uOpen: { value: 0 },
      uMelt: { value: 0 },
      uMeltScale: { value: Math.min(9, cell.span * 0.035) },
      uThickness: { value: slab.half * 2 },
      uRefract: { value: cell.kind === 'chip' ? 0.85 : 1.15 },
      uPageUvPerPx: {
        value: new THREE.Vector2(1 / (cell.bbox.w || 1), 1 / (cell.bbox.h || 1)),
      },
      // Which way the glass flowed when it was poured, and where this shard
      // sits in the baked field. Per shard, never shared, or all sixteen
      // pieces of one pane carry identical cord and identical seed.
      uGrain: {
        value: new THREE.Vector4(
          Math.cos(flow), Math.sin(flow), this.rng() * 7, this.rng() * 7,
        ),
      },
      // Rewritten every frame in tick(); see updateLocalEye.
      uLocalEye: { value: new THREE.Vector3() },
      // Half-thickness and dome height, so the shader knows where the front
      // and back surfaces of this particular slab actually are.
      uSlab: { value: new THREE.Vector3(slab.half, slab.dome, slab.bevel) },
    };

    const mat = new THREE.ShaderMaterial({
      vertexShader: glassVert,
      fragmentShader: glassFrag,
      uniforms,
      transparent: true,
      depthTest: true,
      // Real solids: a nearer shard hides the one behind it. The alpha is
      // high enough that writing depth costs nothing in fidelity and buys
      // correct occlusion in a cloud fifteen slabs deep.
      depthWrite: true,
      side: THREE.FrontSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;

    const rng = this.rng;
    return {
      cell,
      mesh,
      uniforms,
      shut: { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1 },
      open: { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1 },
      from: { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1 },
      fromAmt: 0,
      pose: { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1 },
      spin: new THREE.Quaternion(),
      spinVel: new THREE.Vector3(),
      amt: 0,
      dist: 0,
      delay: 0,
      duration: BURST_S,
      elapsed: 0,
      target: 0,
      drift: {
        amp: new THREE.Vector3(
          (rng() - 0.5) * 9,
          3 + rng() * 8,
          (rng() - 0.5) * 22,
        ),
        speed: 0.22 + rng() * 0.3,
        phase: rng() * Math.PI * 2,
        axis: new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize(),
        rate: (rng() - 0.5) * (cell.kind === 'chip' ? 0.5 : 0.12),
      },
      tumble: 0,
      pageMix: 0,
    };
  }

  private async loadPages(aniso: number): Promise<void> {
    const wanted = new Map<number, Shard[]>();
    for (const shard of this.shards) {
      if (shard.cell.page < 0) continue;
      const list = wanted.get(shard.cell.page) ?? [];
      list.push(shard);
      wanted.set(shard.cell.page, list);
    }
    const gen = this.buildGen;
    await Promise.all(
      Array.from(wanted.entries()).map(async ([index, shards]) => {
        const page = this.pages[index];
        if (!page) return;
        try {
          const loaded = await loadTexture(page.src, aniso);
          if (gen !== this.buildGen) {
            loaded.texture.dispose();
            return;
          }
          this.textures.push(loaded.texture);
          for (const shard of shards) {
            shard.uniforms.uPage.value = loaded.texture;
            shard.uniforms.uHasPage.value = 1;
            const fit = this.pageFit(shard.cell, loaded.aspect);
            shard.uniforms.uPageFit.value = fit;
            (shard.uniforms.uPageUvPerPx.value as THREE.Vector2).set(
              fit.x / (shard.cell.bbox.w || 1),
              fit.y / (shard.cell.bbox.h || 1),
            );
          }
        } catch {
          // A page that will not decode simply keeps the hero fragment.
          for (const shard of shards) shard.uniforms.uHasPage.value = 0;
        }
      }),
    );
  }

  /**
   * The slice of the page a shard draws from. Cover-fitting alone leaves the
   * screenshots looking pasted on; stretching alone shreds them. Splitting
   * the difference is the distortion that makes each shard read as glass
   * holding a page rather than as a rectangle wearing one.
   */
  private pageFit(cell: Cell, pageAspect: number): THREE.Vector2 {
    const box = (cell.bbox.w || 1) / (cell.bbox.h || 1);
    let su = 1;
    let sv = 1;
    if (box > pageAspect) sv = pageAspect / box;
    else su = box / pageAspect;
    const warp = 0.55;
    return new THREE.Vector2(su + (1 - su) * warp, sv + (1 - sv) * warp);
  }

  private registerBuilt(): void {
    built.push(this);
    while (built.length > MAX_BUILT) {
      // Free whichever idle project has gone longest without a hover.
      const idle = built.filter((g) => g !== this && g.state === 'idle');
      if (!idle.length) break;
      idle.sort((a, b) => a.lastUsed - b.lastUsed);
      idle[0].teardown();
    }
  }

  /* ── Layout ── */

  /**
   * Put the cloud over the card and work out where every shard flies to.
   *
   * Targets are chosen on the *screen* and then converted back into the
   * space the shard actually lives in, dividing out the magnification its
   * depth will apply. Without that the shards that come furthest forward
   * would sail off the edges while the ones that hang back would huddle.
   */
  private layout(): void {
    const stage = this.stage;
    const root = this.root;
    if (!stage || !root) return;

    const rect = this.mediaRect();
    if (!rect) return;

    // Cached here because the leave test needs it every frame and reading it
    // there would force a layout flush per frame.
    const cardRect = this.card.getBoundingClientRect();
    this.cardBox = {
      left: cardRect.left, top: cardRect.top,
      right: cardRect.right, bottom: cardRect.bottom,
    };

    const [cx, cy] = stage.toWorld(rect.left + rect.w / 2, rect.top + rect.h / 2);
    root.position.set(cx, cy, 0);

    const impact: [number, number] = [this.paneW * this.impactN[0], this.paneH * this.impactN[1]];

    // How far the pattern has to be scaled up to fill the slide.
    let maxDx = 1;
    let maxDy = 1;
    for (const s of this.shards) {
      maxDx = Math.max(maxDx, Math.abs(s.cell.centroid[0] - impact[0]));
      maxDy = Math.max(maxDy, Math.abs(s.cell.centroid[1] - impact[1]));
    }
    const spreadX = clamp((REACH_X * stage.width) / maxDx, 1.15, 4.4);
    const spreadY = clamp((REACH_Y * stage.height) / maxDy, 1.15, 4.4);

    let maxDist = 1;
    for (const s of this.shards) {
      maxDist = Math.max(maxDist, Math.hypot(s.cell.centroid[0] - impact[0], s.cell.centroid[1] - impact[1]));
    }

    const rng = mulberry32(hashString(this.project.title) ^ 0x9e37);
    const euler = new THREE.Euler();
    const axis = new THREE.Vector3();
    const tumbleQ = new THREE.Quaternion();

    // Where every shard lands on screen, before depth. The dish needs the
    // whole set's reach before it can place any one of them on the surface.
    const plan = this.shards.map((shard) => {
      const c = shard.cell.centroid;
      const k = KIND_SPREAD[shard.cell.kind];
      return {
        dx: (c[0] - impact[0]) * spreadX * k,
        dy: -(c[1] - impact[1]) * spreadY * k,
      };
    });
    let maxR = 1;
    for (const p of plan) maxR = Math.max(maxR, Math.hypot(p.dx, p.dy));

    this.shards.forEach((shard, index) => {
      const cell = shard.cell;

      // Closed: exactly over its own piece of the picture.
      shard.shut.pos.set(
        cell.centroid[0] - this.paneW / 2,
        this.paneH / 2 - cell.centroid[1],
        0,
      );
      shard.shut.quat.identity();
      shard.shut.scale = 1;

      // Open: the fracture pattern blown up about the impact, laid onto the
      // dish, and aimed at where it should land on screen. Dividing the
      // target by the magnification its depth will apply is what lets a
      // piece be flung forward without also being flung off the edge.
      const { dx, dy } = plan[index];
      const r = Math.hypot(dx, dy) / maxR;
      const z =
        DISH_CENTRE +
        (DISH_RIM - DISH_CENTRE) * Math.pow(r, DISH_POWER) +
        (rng() - 0.5) * DISH_JITTER;
      const mag = stage.magnification(z);

      const screenX = dx + (rng() - 0.5) * 26;
      const screenY = dy + (rng() - 0.5) * 26;
      shard.open.pos.set(screenX / mag - cx, screenY / mag - cy, z);

      // Lie along the bowl: tip each piece back toward the axis by as much
      // as the surface has turned by the time it reaches that radius. The
      // rotation runs about the tangent, which is the radial direction
      // turned a quarter circle.
      const len = Math.hypot(dx, dy) || 1;
      axis.set(dy / len, -dx / len, 0);
      shard.open.quat.setFromAxisAngle(axis, SHELL_TILT * r);

      const tumble = KIND_TUMBLE[cell.kind];
      euler.set(
        (rng() - 0.5) * tumble,
        (rng() - 0.5) * tumble,
        (rng() - 0.5) * tumble * 0.6,
      );
      shard.open.quat.multiply(tumbleQ.setFromEuler(euler));

      const [s0, s1] = KIND_SCALE[cell.kind];
      shard.open.scale = s0 + rng() * (s1 - s0);

      // Distance through the *pane*, not across the screen: this is the
      // fracture running outward, and it sets who leaves first.
      shard.dist =
        Math.hypot(cell.centroid[0] - impact[0], cell.centroid[1] - impact[1]) / maxDist;

      if (this.state !== 'open') this.resetToShut(shard);
    });
  }

  /**
   * Where the picture sits on screen, read from layout offsets rather than
   * from a bounding box. The card tilts and lifts under the pointer and
   * recedes once the glass is out; a bounding box would fold all of that in,
   * and the shards would sit a few pixels off the picture they came from.
   */
  private mediaRect(): { left: number; top: number; w: number; h: number } | null {
    const w = this.media.offsetWidth;
    const h = this.media.offsetHeight;
    if (!w || !h) return null;
    const slide = this.host.getBoundingClientRect();
    const inCard = this.host === this.card;
    const ox = inCard ? 0 : this.card.offsetLeft + this.card.clientLeft;
    const oy = inCard ? 0 : this.card.offsetTop + this.card.clientTop;
    return {
      left: slide.left + ox + this.media.offsetLeft,
      top: slide.top + oy + this.media.offsetTop,
      w,
      h,
    };
  }

  /**
   * Park a shard on its piece of the picture with no transition left to run.
   * Without this the interpolator would still be holding the pose it was
   * constructed with — the origin — and the shards would crawl out to their
   * places from the middle of the card the first time the loop ran.
   */
  private resetToShut(shard: Shard): void {
    shard.mesh.position.copy(shard.shut.pos);
    shard.mesh.quaternion.copy(shard.shut.quat);
    shard.mesh.scale.setScalar(1);
    shard.from.pos.copy(shard.shut.pos);
    shard.from.quat.copy(shard.shut.quat);
    shard.from.scale = 1;
    shard.pose.pos.copy(shard.shut.pos);
    shard.pose.quat.copy(shard.shut.quat);
    shard.pose.scale = 1;
    // A rebuilt or re-fitted pane must not inherit a turn: the shut pose is
    // the picture, and anything left in `spin` here is a seam through it.
    shard.spin.identity();
    shard.spinVel.set(0, 0, 0);
    shard.fromAmt = 0;
    shard.amt = 0;
    shard.target = 0;
    shard.tumble = 0;
    shard.pageMix = 0;
    shard.uniforms.uPageMix.value = 0;
    shard.uniforms.uOpen.value = 0;
    shard.uniforms.uMelt.value = 0;
    // Already landed, so the interpolator has nothing to do.
    shard.elapsed = shard.duration + shard.delay;
  }

  /** Re-fit after a viewport change. Rebuilds the cut if the pane resized. */
  refit(): void {
    if (!this.isBuilt || this.state !== 'idle') return;
    const w = this.media.offsetWidth;
    const h = this.media.offsetHeight;
    if (!w || !h) return;
    if (Math.abs(w - this.paneW) > 2 || Math.abs(h - this.paneH) > 2) {
      this.teardown();
      this.build();
      return;
    }
    this.layout();
  }

  /* ── States ── */

  private arm(clientX: number, clientY: number): void {
    if (this.state === 'arming' || this.state === 'open') return;
    this.build();
    if (!this.root) return;
    this.lastUsed = performance.now();
    this.wantPages = true;
    this.requestPages();

    if (this.state === 'closing') {
      this.openNow();
      return;
    }

    this.refreshVideoFrame();
    this.layout();
    this.setImpactFrom(clientX, clientY);
    // Seeded so the first open frame has a real pointer position: the dwell
    // runs 540ms and pointerenter is often the only event inside it.
    this.pointerX = clientX;
    this.pointerY = clientY;

    this.state = 'arming';
    this.crackT = 0;
    this.root.visible = true;
    this.card.classList.add('glass-arming');
    this.stage?.join(this);

    this.dwellTimer = window.setTimeout(() => {
      this.dwellTimer = null;
      if (this.state === 'arming') this.openNow();
    }, DWELL_MS);
  }

  /** Redirect the fracture to wherever the pointer actually landed. */
  private setImpactFrom(clientX: number, clientY: number): void {
    const rect = this.mediaRect();
    if (!rect) return;
    const u = clamp((clientX - rect.left) / rect.w, 0.06, 0.94);
    const v = clamp((clientY - rect.top) / rect.h, 0.06, 0.94);
    (this.shared.uImpactUv.value as THREE.Vector2).set(u, 1 - v);
  }

  private openNow(): void {
    if (!this.root) return;
    this.clearDwell();
    this.clearLeave();
    this.state = 'open';

    if (this.video) {
      // Freeze on exactly the frame the shards are about to carry away. The
      // deck's media owner restarts it from onSettled.
      this.refreshVideoFrame();
      this.video.pause();
    }

    for (const shard of this.shards) this.startTransition(shard, 1);
    this.shared.uCrackAmt.value = 1.35;

    this.card.classList.remove('glass-returning');
    this.card.classList.add('glass-open');
    // Selection stays off for as long as the cloud is out, so a drag that
    // crosses a gap between shards cannot start highlighting the slide's copy.
    // The grab cursor is a separate class now: only a shard is a handle.
    this.host.classList.add('glass-live');
    // Ask for the cursor on the very next frame rather than waiting for a
    // move: the pointer is already sitting on a shard when the dwell ends.
    this.pickDirty = true;
    this.stage?.join(this);
    this.hooks.onOpen?.(this);
  }

  private close(): void {
    if (!this.root || this.state === 'idle' || this.state === 'closing') return;
    this.clearDwell();
    this.clearLeave();
    this.endDrag();
    const wasOpen = this.state === 'open';
    this.state = 'closing';

    // The spin is deliberately NOT cleared here. startTransition freezes it,
    // and tick() fades it out with the shard's own openness, so the turn
    // unwinds over the flight instead of snapping square at the instant the
    // pointer strays. The old short-way-round yaw normalisation went with it:
    // a quaternion cannot wind up the way an unbounded Euler yaw could.
    for (const shard of this.shards) this.startTransition(shard, 0);

    this.sealAt = this.clock + RETURN_S + RETURN_STAGGER_S;
    this.card.classList.remove('glass-open');
    this.card.classList.add('glass-returning');
    this.host.classList.remove('glass-live');
    this.setGrabCursor(false);
    // Forgotten here, not in finish(). updateHover stops running the moment
    // the state leaves 'open', so this is the last chance anything has to let
    // go of the piece the pointer was over.
    this.hovered = null;
    this.stage?.join(this);
    if (wasOpen) this.hooks.onClose?.(this);
  }

  /** Called when everything has landed and the picture is whole again. */
  private finish(): void {
    this.state = 'idle';
    for (const shard of this.shards) {
      shard.tumble = 0;
      // Nothing may survive into the next open. The gate in tick() has
      // already faded any leftover turn to nothing on screen, but the
      // quaternion itself would still be sitting there — and it would fade
      // back IN as the next hover raised `amt`, so the shard would come out
      // of the picture already crooked.
      shard.spin.identity();
      shard.spinVel.set(0, 0, 0);
    }
    this.hovered = null;
    this.pickDirty = false;
    this.setPictureOpacity(1);
    this.reveal = 0;
    this.crackT = 0;
    if (this.root) this.root.visible = false;
    this.card.classList.remove('glass-arming', 'glass-returning', 'glass-open');
    this.setGrabCursor(false);
    this.host.classList.remove('glass-live');
    this.hooks.onSettled?.(this);
  }

  /**
   * Put the pane back this instant, with no flight home. For when something
   * is about to cover the whole page and a landing would never be seen.
   */
  snapShut(): void {
    if (this.state === 'idle') return;
    const wasOpen = this.state === 'open';
    this.clearDwell();
    this.clearLeave();
    this.endDrag();
    for (const shard of this.shards) this.resetToShut(shard);
    this.stage?.leave(this);
    this.finish();
    if (wasOpen) this.hooks.onClose?.(this);
  }

  /** Cancelled during the dwell: no break, just let the crazing fade. */
  private cancel(): void {
    this.clearDwell();
    if (this.state !== 'arming') return;
    this.state = 'closing';
    this.sealAt = this.clock;
    this.card.classList.remove('glass-arming');
    this.card.classList.add('glass-returning');
  }

  release(): void {
    if (this.state === 'arming') this.cancel();
    else if (this.state === 'open') this.close();
  }

  /**
   * Begin a flight, from wherever the shard's *pose* currently is.
   *
   * From the pose, emphatically not from the mesh. The mesh carries three
   * things this interpolator does not own — the idle drift, the tumble, and
   * whatever the pointer has spun into the shard — and tick() re-applies all
   * three on top of whatever this produces. Capturing the mesh would fold
   * them into `from` and compose them a second time on the very next frame,
   * so the shard would jump by its whole banked turn the instant the pane was
   * asked to close under it. The picture still stays continuous across the
   * interrupt, because the extras are continuous in the clock and in `amt`.
   */
  private startTransition(shard: Shard, target: 0 | 1): void {
    shard.from.pos.copy(shard.pose.pos);
    shard.from.quat.copy(shard.pose.quat);
    shard.from.scale = shard.pose.scale;
    shard.fromAmt = shard.amt;
    shard.elapsed = 0;
    shard.target = target;
    shard.duration = target === 1 ? BURST_S : RETURN_S;
    // Nearest to the impact leaves first; furthest comes home first.
    shard.delay =
      target === 1 ? shard.dist * BURST_STAGGER_S : (1 - shard.dist) * RETURN_STAGGER_S;
    // Stop the coast the moment the shard is asked to fly home. The unwind
    // fades `spin` out by slerping it up from identity, and that slerp picks
    // its way round once, from the sign of spin.w — so a spin still growing
    // under it flips that choice on the frame w crosses half a turn, and the
    // shard snaps most of a half turn in mid-flight.
    if (target === 0) shard.spinVel.set(0, 0, 0);
  }

  /* ── Frame ── */

  tick(dt: number, now: number): boolean {
    if (!this.root || !this.stage) return false;
    this.clock += dt;
    this.shared.uTime.value = this.clock;

    const arming = this.state === 'arming';

    // Cross-fade with the DOM picture underneath.
    const revealTarget = this.state === 'idle' || (this.state === 'closing' && this.clock >= this.sealAt) ? 0 : 1;
    const revealRate = dt / (revealTarget ? REVEAL_S : SEAL_S);
    this.reveal = clamp(this.reveal + (revealTarget ? revealRate : -revealRate), 0, 1);
    this.shared.uReveal.value = this.reveal;

    // The shock front runs out from the impact while the pane is crazing,
    // then blows past the border as it lets go.
    if (arming) {
      this.crackT = Math.min(1, this.crackT + dt / (DWELL_MS / 1000));
      this.shared.uCrackR.value = this.crackT * 1.5;
      this.shared.uCrackAmt.value = 0.5 + 0.9 * this.crackT;
    } else if (this.shared.uCrackAmt.value > 0) {
      this.shared.uCrackR.value = (this.shared.uCrackR.value as number) + dt * 3.4;
      this.shared.uCrackAmt.value = Math.max(0, (this.shared.uCrackAmt.value as number) - dt * 3.2);
    }

    /* The cloud itself never moves: root stays an unrotated, unscaled Group
     * that layout() only ever translates. That is not housekeeping — it is
     * what makes the pre-multiplied spin below a rotation in SCREEN axes
     * rather than in some drifting parent frame. */

    /* Shards. */
    let moving = false;
    let spread = 0;
    for (const shard of this.shards) {
      shard.elapsed += dt;
      const local = clamp((shard.elapsed - shard.delay) / shard.duration, 0, 1);
      const eased = shard.target === 1 ? settle(local) : easeInOut(local);
      if (local < 1) moving = true;

      const to = shard.target === 1 ? shard.open : shard.shut;
      shard.amt = shard.fromAmt + (shard.target - shard.fromAmt) * eased;

      // The flight itself, kept apart from what is drawn: this — and only
      // this — is what an interrupt is allowed to resume from.
      shard.pose.pos.lerpVectors(shard.from.pos, to.pos, eased);
      shard.pose.quat.slerpQuaternions(shard.from.quat, to.quat, eased);
      shard.pose.scale = shard.from.scale + (to.scale - shard.from.scale) * eased;

      shard.mesh.position.copy(shard.pose.pos);
      shard.mesh.quaternion.copy(shard.pose.quat);
      shard.mesh.scale.setScalar(shard.pose.scale);

      // Idle drift, faded in with the shard's own openness so it never
      // disturbs the landing.
      const amt = shard.amt;
      if (amt > 0.001) {
        const d = shard.drift;
        const ph = this.clock * d.speed * Math.PI * 2 + d.phase;
        shard.mesh.position.x += Math.sin(ph * 0.8) * d.amp.x * amt;
        shard.mesh.position.y += Math.sin(ph) * d.amp.y * amt;
        shard.mesh.position.z += Math.sin(ph * 0.6 + 1.4) * d.amp.z * amt;
        if (d.rate) {
          shard.tumble += d.rate * dt;
          // Post-multiplied: the idle roll is about the shard's own axes,
          // where "in whose frame" is meaningless, and scaled by openness so
          // the shard unwinds to square as it lands.
          SPARE_Q.setFromAxisAngle(d.axis, shard.tumble * amt);
          shard.mesh.quaternion.multiply(SPARE_Q);
        }
      }

      // Free spin. spinVel is a world angular velocity — an axis and a rate
      // in one vector — so integrating it over dt is one setFromAxisAngle and
      // friction is a plain scalar decay of the rate.
      if (shard !== this.grabbed) {
        const rateSq = shard.spinVel.lengthSq();
        if (rateSq > SPIN_STOP * SPIN_STOP) {
          const rate = Math.sqrt(rateSq);
          SPIN_AXIS.copy(shard.spinVel).divideScalar(rate);
          SPIN_Q.setFromAxisAngle(SPIN_AXIS, rate * dt);
          // Pre-multiplied for the same reason the drag is: a flicked shard
          // keeps turning about the screen axis it was thrown about, the way
          // a globe keeps turning about its axle. `spin` is the only
          // quaternion here fed back into itself, so it is the only one that
          // can drift off unit length — and glass-vert.glsl reads the model
          // matrix's columns as a rotation plus one uniform scale, so a
          // drifting norm would show as the whole shard slowly swelling.
          shard.spin.premultiply(SPIN_Q).normalize();
          shard.spinVel.multiplyScalar(Math.exp(-dt / SPIN_FRICTION_S));
        } else if (rateSq > 0) {
          // Below about a degree a second nothing is visibly moving. Stop, or
          // the loop keeps multiplying quaternions for the rest of the hover.
          shard.spinVel.set(0, 0, 0);
        }
      }

      // The turn the pointer put in goes on the OUTSIDE of everything else.
      // Pre-multiplied, it is a rotation in the parent's frame — which, with
      // root only ever translated, is the screen's frame — about the mesh's
      // own origin, because Object3D composes T·R·S and the position is
      // applied after R. shardGeometry centres every shard on its cell's
      // centroid, so that origin is the shard's own middle: it turns in place
      // like a globe on a stand rather than swinging round the cloud.
      //
      // Faded by the shard's own openness, so it is exactly identity at the
      // moment the shard is back on its piece of the picture. Anything left
      // over there would show as a seam across the reassembled pane.
      if (Math.abs(shard.spin.w) < 1 - 1e-7) {
        // The test is on |w|, not w: past a half turn w goes negative, and a
        // `w < 1` test would silently drop the spin exactly when there is
        // most of it to drop. settle() overshoots to about 1.09 on the way
        // out, so the gate is clamped, or a shard grabbed mid-burst is turned
        // nine per cent too far and springs back.
        const gate = clamp(amt, 0, 1);
        // A slerp from identity is quaternion exponentiation: the same turn
        // with its angle scaled by `gate`, taking the short way round.
        shard.mesh.quaternion.premultiply(
          gate > 0.999 ? shard.spin : SPIN_Q.identity().slerp(shard.spin, gate),
        );
      }

      // The plates turn into their page a third of the way through the
      // flight, and turn back before they land.
      if (shard.cell.page >= 0) {
        const target = shard.target === 1 ? clamp((eased - 0.3) / 0.5, 0, 1) : 0;
        const rate = shard.target === 1 ? dt / 0.45 : dt / 0.3;
        shard.pageMix += clamp(target - shard.pageMix, -rate, rate);
        shard.uniforms.uPageMix.value = shard.pageMix;
      }

      this.updateLocalEye(shard);
      shard.uniforms.uOpen.value = amt;
      shard.uniforms.uMelt.value = amt * (0.5 + 0.5 * Math.sin(this.clock * 0.7 + shard.drift.phase));
      spread += amt;
    }

    if (this.shards.length) {
      spread /= this.shards.length;
      this.setPictureOpacity(this.reveal > 0 ? 1 - clamp(spread * 2.4, 0, 1) : 1);
    }

    // The cursor's pick, once a frame and after the loop, so the ray tests
    // exactly the matrices this frame is about to draw with — updateLocalEye
    // has just refreshed every one of them.
    this.updateHover(now);

    if (this.state === 'closing' && !moving && this.reveal <= 0.001) {
      this.finish();
      return false;
    }
    return this.state !== 'idle' || this.reveal > 0.001 || moving;
  }

  /**
   * Put the camera into the shard's own coordinates.
   *
   * The slab is built along its local z — front face out at +half+dome, back
   * face at -half — so a ray traced in local space can be intersected against
   * those two planes with nothing more than a divide. That is what lets the
   * picture sit at a real depth inside the glass and parallax correctly as
   * the shard turns, rather than sliding by a flat offset that gives the
   * whole thing away as a decal.
   */
  private updateLocalEye(shard: Shard): void {
    if (!this.stage) return;
    // The renderer would do this at draw time anyway; doing it here just
    // means the matrix is current when we invert it.
    shard.mesh.updateMatrixWorld();
    SPARE_V.copy(this.stage.camera.position);
    shard.mesh.worldToLocal(SPARE_V);
    (shard.uniforms.uLocalEye.value as THREE.Vector3).copy(SPARE_V);
  }

  /* ── Picking ── */

  /**
   * A pointer position in viewport pixels, as a ray through the stage.
   *
   * The stage canvas is `position: fixed; inset: 0` at exactly the viewport's
   * CSS size, so clientX/clientY are already canvas-local and there is
   * nothing to subtract. That is the point: a getBoundingClientRect here
   * would force a style and layout flush, and on a page animating the card's
   * tilt underneath that costs more than the raycast it is paying for.
   *
   * The divisor is the stage's own width/height rather than
   * window.innerWidth, because those are what camera.aspect and the
   * projection matrix were last built from. It is the agreement between those
   * three numbers, not any one of them, that aims the ray through the right
   * pixel — which is also why reading the canvas box instead would be a bug.
   */
  private rayFrom(clientX: number, clientY: number): boolean {
    const stage = this.stage;
    if (!stage || stage.width <= 0 || stage.height <= 0) return false;
    // The renderer refreshes this once a frame anyway; repeating it costs one
    // matrix compose and means a pick taken in the same frame as a resize is
    // not unprojected through the previous viewport.
    stage.camera.updateMatrixWorld();
    this.ndc.set((clientX / stage.width) * 2 - 1, 1 - (clientY / stage.height) * 2);
    this.raycaster.setFromCamera(this.ndc, stage.camera);
    return true;
  }

  /**
   * The shard under the pointer, or null over a gap between them.
   *
   * The material is FrontSide, so three culls back faces in the cast too:
   * each shard reports at most its near surface, and after the sort the first
   * hit is the piece the depth buffer put on top. Whatever is drawn in front
   * is what is grabbed, which is the only rule a pointer can be expected to
   * know.
   *
   * What the cast cannot see is the melt: that displacement lives in the
   * vertex shader, so this tests the undisplaced slab. At the rim the shader
   * damps it to a quarter, which is under three screen pixels once the open
   * scale and the dish's magnification are in — an edge pick fails a pixel
   * early rather than firing on a neighbour.
   */
  private pickShard(clientX: number, clientY: number): Shard | null {
    if (!this.pickList.length || !this.rayFrom(clientX, clientY)) return null;

    // Cleared first, because intersectObjects appends to whatever it is given.
    this.hits.length = 0;
    // recursive:false — the meshes have no children, and the default is true.
    this.raycaster.intersectObjects(this.pickList, false, this.hits);
    if (!this.hits.length) return null;

    const index = this.pickList.indexOf(this.hits[0].object);
    // Dropped immediately: three allocates a point, a barycoord, a normal and
    // a face per hit, and holding the array across frames keeps a mesh — and
    // its geometry and typed arrays — reachable straight through a teardown.
    this.hits.length = 0;
    return index >= 0 ? this.shards[index] : null;
  }

  /**
   * Resolve the hover pick, at most once a frame and never during a drag.
   *
   * A still pointer still needs re-picking now and then: the idle drift
   * carries a piece twenty-odd pixels and it can wander out from under a
   * cursor that never moved. A tenth of a second of staleness on a cursor is
   * invisible; a raycast every frame for a pointer that is not moving is not.
   */
  private updateHover(now: number): void {
    if (this.state !== 'open') return;

    if (this.dragging) {
      // Nothing to ask. The shard being turned is the answer, and this is the
      // frame that can least afford a raycast.
      this.hovered = this.grabbed;
      return;
    }

    // Asked every frame, ahead of the pick's slow path: a pointer that has
    // stopped moving off the card is exactly the case the grace timer is for,
    // and gating it behind the pick would arm it a tenth of a second late.
    if (this.nearCloud(this.pointerX, this.pointerY)) this.clearLeave();
    else this.armLeave();

    if (!this.pickDirty && now < this.pickDue) return;
    this.pickDirty = false;
    this.pickDue = now + 100;

    this.hovered = this.pickShard(this.pointerX, this.pointerY);
    this.setGrabCursor(this.hovered !== null);
  }

  /**
   * The cursor, written only when it changes.
   *
   * The class used to sit on for as long as the pane was open, promising a
   * handle across the whole slide when only the shards are one. It follows
   * the pick now, which is why the guard is not optional: an unguarded
   * classList write is a style invalidation sixty times a second to say
   * nothing at all. Every site that used to remove the class goes through
   * here too, or the mirror desyncs — the class gone with grabCursor still
   * true, and the next setGrabCursor(true) early-returning for good.
   */
  private setGrabCursor(on: boolean): void {
    if (on === this.grabCursor) return;
    this.grabCursor = on;
    this.host.classList.toggle('glass-grab', on);
  }

  /**
   * Turn the held shard by a pointer delta, like a hand laid on a globe.
   *
   * The axis is the screen axis at right angles to the drag — z x drag — and
   * the turn is PRE-multiplied, so the axis is read in the parent's frame and
   * stays screen-aligned however far the shard has already been turned.
   * Post-multiplying would read it in the shard's own frame instead: turn a
   * shard a quarter turn to the right and its own "up" is pointing at the
   * viewer, so dragging up would spin it flat in the plane of the screen
   * instead of tipping it. That is the stick.
   */
  private spinBy(shard: Shard, dxPx: number, dyPx: number, dt: number): void {
    const dist = Math.hypot(dxPx, dyPx);
    if (dist < 0.01) return;
    const angle = dist * SPIN_RAD_PER_PX;

    // GlassStage sits the eye on +z looking at the origin with no roll, and
    // root is only ever translated, so screen right is world +x and screen up
    // is world +y; the pointer's y runs the other way. z x (dx, -dy, 0) =
    // (dy, dx, 0), whose length is already `dist`, so one hypot does both
    // jobs. setFromAxisAngle does not normalise its axis, and a short axis
    // becomes a silent scale in the model matrix — which the shader reads as
    // a swelling shard — so this has to be a unit vector.
    SPIN_AXIS.set(dyPx, dxPx, 0).divideScalar(dist);
    SPIN_Q.setFromAxisAngle(SPIN_AXIS, angle);
    shard.spin.premultiply(SPIN_Q).normalize();

    // What to throw on release, as a world angular velocity. Held as one
    // vector rather than as an axis and a scalar rate, because that is what
    // lets a change of direction cancel the old fling instead of merely
    // slowing it. Capped, because moves are coalesced: a 60px jump reported
    // 8ms after the last one implies 90 rad/s, and past about four turns a
    // second the face is a strobe and only aliases.
    SPIN_AXIS.multiplyScalar(Math.min(angle / dt, SPIN_MAX_RATE));
    shard.spinVel.lerp(SPIN_AXIS, 0.6);
  }

  /**
   * Within reach of the glass.
   *
   * Not of the CARD. The exploded view spreads across most of the screen, so
   * a piece routinely sits hundreds of pixels outside the card it came from —
   * and a test against the card alone armed the leave timer while the pointer
   * was resting on a shard, which closed the pane out from under the very
   * thing the user had reached for. The cloud is centred on the slide and
   * reaches REACH of it, so that is what the pointer has to be inside.
   */
  private nearCloud(x: number, y: number): boolean {
    const m = 90;
    const card = this.cardBox;
    if (x >= card.left - m && x <= card.right + m &&
        y >= card.top - m && y <= card.bottom + m) return true;

    const stage = this.stage;
    if (!stage) return false;
    return (
      Math.abs(x - stage.width / 2) <= REACH_X * stage.width + m &&
      Math.abs(y - stage.height / 2) <= REACH_Y * stage.height + m
    );
  }

  /**
   * Start the grace timer once the pointer has strayed off the cloud.
   *
   * The cloud covers most of the slide, so leaving the card is not leaving
   * the glass; the pointer gets a moment to cross the gaps between shards.
   * Lifted out of the move handler because pointerup has to ask the same
   * question now — a drag can end anywhere at all.
   */
  private armLeave(): void {
    if (this.leaveTimer !== null) return;
    this.leaveTimer = window.setTimeout(() => {
      this.leaveTimer = null;
      // A drag started inside the grace window owns the pane; it makes its
      // own decision when the pointer comes up.
      if (this.state === 'open' && !this.dragging) this.close();
    }, LEAVE_GRACE_MS);
  }

  /* ── Pointer ── */

  private onCardEnter = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return;
    this.wantPages = true;
    this.requestPages();
  };

  private onMediaEnter = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return;
    this.arm(e.clientX, e.clientY);
  };

  private onMediaLeave = (): void => {
    if (this.state === 'arming') this.cancel();
  };

  /**
   * The move handler latches where the pointer is and returns. Nothing else.
   *
   * A drag is fed by its own window listener, which keeps working when the
   * pointer runs off the slide; this handler must not also see it, or it
   * would let the leave test arm the grace timer under a drag in progress and
   * the pane would close over the very shard the pointer is holding.
   *
   * Everything else it used to do was per-frame work driven at the pointer's
   * event rate. Chrome coalesces moves to one a frame; Firefox and Safari do
   * not, and a high-rate mouse delivers six or eight between two paints. Each
   * one paid for two getBoundingClientRect calls — a forced style and layout
   * flush, on a page animating the card's tilt underneath — for an answer the
   * next event threw away. tick() asks both questions once, for the frame it
   * is about to draw.
   */
  private onHostMove = (e: PointerEvent): void => {
    if (this.dragging) return;

    // Latched before the state check, not after: the dwell runs 540ms and the
    // pointer will have travelled during it, so the frame the pane opens on
    // needs a position newer than pointerenter's.
    this.pointerX = e.clientX;
    this.pointerY = e.clientY;
    if (this.state !== 'open') return;
    this.pickDirty = true;
  };

  /**
   * Turn the held shard while the pointer is down.
   *
   * Bound to the window, not the host, so the turn keeps following a pointer
   * that has run off the card; attached in onHostDown and detached in
   * endDrag, so it costs nothing when nothing is being spun.
   * setPointerCapture would feed the drag just as well, but releasing it
   * fires a pointerleave at the host, and that would race onHostLeave and
   * slam the pane shut on the shard that had just been flung.
   */
  private onDragMove = (e: PointerEvent): void => {
    const shard = this.grabbed;
    if (!shard || e.pointerId !== this.dragId) return;
    const now = performance.now();
    // A floor on the interval, or a pair of events in the same millisecond
    // divides a real delta by nothing and throws the shard into a strobe.
    const dt = Math.max(6, now - this.dragAt) / 1000;
    this.spinBy(shard, e.clientX - this.dragLast[0], e.clientY - this.dragLast[1], dt);
    this.dragLast[0] = e.clientX;
    this.dragLast[1] = e.clientY;
    this.dragAt = now;
  };

  private onHostDown = (e: PointerEvent): void => {
    if (this.state !== 'open' || this.dragging) return;
    if (e.pointerType === 'touch' || e.button !== 0) return;
    // Links, buttons and the scrubber keep their own click.
    if ((e.target as Element | null)?.closest('a, button, input, textarea, select')) return;

    // Picked here rather than taken from `hovered`: that answer is a frame
    // old at best and a tenth of a second old on the still-pointer path, and
    // at a plausible 2000px/s a pointer covers more than the gap between two
    // shards in that time. One raycast on a press is not a budget question.
    // Held in a local, because `grabbed` is Shard | null and an assignment to
    // a mutable field does not narrow across the statements that follow it.
    const shard = this.pickShard(e.clientX, e.clientY);
    // The gaps between the shards are not handles. Nothing is taken hold of
    // and there is no preventDefault, so the slide keeps whatever click it
    // would otherwise have had; selection is still suppressed, by the
    // always-on glass-live class rather than by this.
    if (!shard) return;

    e.preventDefault();
    this.dragging = true;
    this.dragId = e.pointerId;
    this.grabbed = shard;
    this.hovered = shard;
    this.dragLast[0] = e.clientX;
    this.dragLast[1] = e.clientY;
    this.dragAt = performance.now();
    // Taking hold of a shard that is still coasting stops it dead, the way a
    // hand laid on a globe does.
    shard.spinVel.set(0, 0, 0);

    window.addEventListener('pointermove', this.onDragMove);
    this.host.classList.add('glass-dragging');
    this.setGrabCursor(true);
    // A grace timer armed a moment before the press must not survive it. The
    // `!this.dragging` guard inside its callback is the second line of
    // defence, not the first.
    this.clearLeave();
  };

  private onWindowUp = (e: PointerEvent): void => {
    if (!this.dragging || e.pointerId !== this.dragId) return;
    // A pointer held still before release throws nothing. Read the shard
    // before endDrag(), which lets go of it.
    if (this.grabbed && performance.now() - this.dragAt > 110) this.grabbed.spinVel.set(0, 0, 0);
    this.endDrag();

    // onHostMove has been returning early for the whole drag, so the leave
    // test has not run since the press and the pointer may have ended up well
    // off the card. Ask once here, or a flick that carries the pointer away
    // leaves the pane open until the user wanders back.
    this.pointerX = e.clientX;
    this.pointerY = e.clientY;
    this.pickDirty = true;
    if (this.state === 'open' && !this.nearCloud(e.clientX, e.clientY)) this.armLeave();
  };

  private onHostLeave = (): void => {
    // A shard being spun owns the pointer, wherever it has got to. The pane
    // closes, if it should, when the drag ends — see onWindowUp.
    if (this.dragging) return;
    this.release();
  };

  /**
   * Let go. The shard keeps whatever it was thrown with — that is what makes
   * the release coast, and it is why the velocity lives on the Shard and not
   * on the class: a second piece can be grabbed while the first is still
   * turning. Deliberately says nothing about the leave timer, because
   * close(), teardown() and destroy() all call this on their way out and must
   * not arm one.
   */
  private endDrag(): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.dragId = -1;
    // Released before anything can dispose the mesh behind it.
    this.grabbed = null;
    window.removeEventListener('pointermove', this.onDragMove);
    this.host.classList.remove('glass-dragging');
  }

  private clearDwell(): void {
    if (this.dwellTimer !== null) window.clearTimeout(this.dwellTimer);
    this.dwellTimer = null;
  }

  private clearLeave(): void {
    if (this.leaveTimer !== null) window.clearTimeout(this.leaveTimer);
    this.leaveTimer = null;
  }

  /**
   * Fade the DOM picture out in step with the glass covering it. One value
   * drives both sides of the hand-over: a CSS transition would have to guess
   * at four different durations and would drift on every interrupt.
   */
  private setPictureOpacity(v: number): void {
    if (!this.picture) return;
    // Always take the last step back to fully opaque, however small it is:
    // the tolerance that keeps this from writing style every frame would
    // otherwise leave the picture parked a half percent short for good.
    const done = v > 0.995;
    if (!done && Math.abs(v - this.pictureOpacity) < 0.008) return;
    if (done && this.pictureOpacity > 0.995) return;
    this.pictureOpacity = done ? 1 : v;
    this.picture.style.opacity = done ? '' : v.toFixed(3);
  }

  /* ── Teardown ── */

  /** Give the GPU memory back but keep the instance usable. */
  private teardown(): void {
    // First, before anything is disposed. No caller reaches here mid-drag
    // today — eviction and refit both require state 'idle', dragging implies
    // 'open', and destroy() ends the drag first — but the drag now owns a
    // window listener and a reference to a mesh. Land here holding one and
    // `dragging` stays true for the life of the instance, which permanently
    // disables onHostLeave so the next open could never be closed by walking
    // away; and `grabbed` would hold a geometry and its typed arrays alive
    // straight through the dispose() calls below.
    this.clearDwell();
    this.clearLeave();
    this.endDrag();
    this.hovered = null;
    this.pickDirty = false;
    this.setGrabCursor(false);

    this.stage?.leave(this);
    if (this.root) {
      this.stage?.remove(this.root);
      this.root.clear();
    }
    for (const shard of this.shards) (shard.mesh.material as THREE.Material).dispose();
    this.geometries.forEach((g) => g.dispose());
    this.textures.forEach((t) => t.dispose());
    this.shards = [];
    this.pickList = [];
    this.hits.length = 0;
    this.geometries = [];
    this.textures = [];
    this.root = null;
    this.heroTex = null;
    this.heroKind = 'none';
    this.isBuilt = false;
    this.buildGen++;
    this.wantPages = false;
    this.pagesRequested = false;
    this.state = 'idle';
    this.reveal = 0;
    this.setPictureOpacity(1);
    const i = built.indexOf(this);
    if (i >= 0) built.splice(i, 1);
    this.card.classList.remove('glass-arming', 'glass-returning', 'glass-open');
    this.host.classList.remove('glass-live');
  }

  destroy(): void {
    this.clearDwell();
    this.clearLeave();
    this.endDrag();
    this.teardown();
    this.card.removeEventListener('pointerenter', this.onCardEnter);
    this.media.removeEventListener('pointerenter', this.onMediaEnter);
    this.media.removeEventListener('pointerleave', this.onMediaLeave);
    this.host.removeEventListener('pointermove', this.onHostMove);
    this.host.removeEventListener('pointerdown', this.onHostDown);
    this.host.removeEventListener('pointerleave', this.onHostLeave);
    window.removeEventListener('pointerup', this.onWindowUp);
    window.removeEventListener('pointercancel', this.onWindowUp);
    this.setGrabCursor(false);
    this.host.classList.remove('glass-live', 'glass-dragging');
  }
}
