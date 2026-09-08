import type { Project, ProjectPage } from '../data/projects';
import { THEMES } from '../theme/themes';
import { placeholderPages } from '../data/placeholderPages';

/* ── Timing ────────────────────────────────────────────────────────────────
 * The CSS transitions in style.css are tuned to these; change them together. */

const DWELL_MS = 620;          // hover time before the pane gives way
const CRACK_SPREAD_MS = 360;   // cracks reach the far edge this long after impact
const OPEN_MS = 1100;          // flight out (matches .shatter.is-open .shard)
const OPEN_STAGGER_MS = 170;   // nearest shards leave first
const CLOSE_MS = 780;          // flight home (matches .shard transition)
const CLOSE_STAGGER_MS = 120;  // farthest shards return first
const SEAL_MS = 650;           // crack glint after the shards land

/* ── Fracture pattern ──────────────────────────────────────────────────────
 * Seeds sit on three rings around an impact point near the middle of the
 * pane, so the Voronoi cells read as a spider-web fracture: a cluster of
 * slivers at the impact, a ring of mid-size fragments, and a ring of big
 * outer shards that reach the edges. The big ones become the page windows. */

type Pt = [number, number];
type Kind = 'sliver' | 'glass' | 'page';

const RING_RADIUS: Record<Kind, number> = { sliver: 0.1, glass: 0.34, page: 0.72 };
const RING_COUNT: Record<Kind, number> = { sliver: 5, glass: 6, page: 7 };
const Z_ORDER: Record<Kind, number> = { page: 1, glass: 2, sliver: 3 };

/* ── Exploded view ─────────────────────────────────────────────────────────
 * Where the outer ring's centroids land, as a fraction of the slide, and how
 * far a shard may grow. The pattern is scaled about the impact point and
 * moved onto the slide centre; shards then scale about their own centroids
 * by no more than the pattern did, which is what keeps neighbours apart (a
 * convex cell scaled about its centroid stays inside the same cell scaled
 * about the impact point). */

const REACH_X = 0.38;
const REACH_Y = 0.28;
const MAX_SHARD_SCALE = 2;
const CORNER_RADIUS = 5;       // px at scale 1; softens the polygons into glass chips
const PAGE_INSET = 0.9;        // page art sits this far inside its slab
const PERSPECTIVE = 1600;      // px, matches .shatter-stage in style.css

interface Seed {
  kind: Kind;
  /** Position in half-extent units: -1..1 across the pane. */
  nx: number;
  ny: number;
  page?: ProjectPage;
  /** Per-shard character, fixed at construction so a card always shatters the same way. */
  roll: number;       // -1..1, spins the shard about its normal
  jitter: Pt;         // px nudge off the exploded-view position
  glintPhase: number; // 0..1, offsets the glint sweep
  floatDur: number;   // ms, idle bob period
  floatPhase: number; // ms, idle bob start offset
}

interface Shard {
  seed: Seed;
  el: HTMLElement;
  body: HTMLElement;
  hero: HTMLImageElement;
  page: HTMLImageElement | null;
  rim: SVGSVGElement;
  rimPaths: SVGPathElement[];
  label: HTMLElement | null;
  centroid: Pt;
  open: string;
  shut: string;
}

interface Edge {
  a: Pt;
  b: Pt;
  len: number;
  paths: SVGPathElement[];
}

export interface ShatterHooks {
  onOpen?: (s: GlassShatter) => void;
  onClose?: (s: GlassShatter) => void;
}

type State = 'idle' | 'arming' | 'open' | 'closing';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SHUT = 'translate3d(0px, 0px, 0px) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1)';

let uidCounter = 0;

/* ── Small geometry kit ── */

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Keep the part of `poly` closer to `a` than to `b` (Sutherland–Hodgman against the bisector). */
function clipToBisector(poly: Pt[], a: Pt, b: Pt): Pt[] {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const nx = b[0] - a[0];
  const ny = b[1] - a[1];
  const side = (p: Pt) => (p[0] - mx) * nx + (p[1] - my) * ny;
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const sp = side(p);
    const sq = side(q);
    if (sp <= 0) out.push(p);
    if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

function voronoi(seeds: Pt[], w: number, h: number): Pt[][] {
  return seeds.map((s, i) => {
    let poly: Pt[] = [[0, 0], [w, 0], [w, h], [0, h]];
    for (let j = 0; j < seeds.length && poly.length >= 3; j++) {
      if (j !== i) poly = clipToBisector(poly, s, seeds[j]);
    }
    return poly.length >= 3 ? poly : [];
  });
}

function centroidOf(poly: Pt[]): Pt {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(area) < 1e-6) {
    // Degenerate sliver: fall back to the vertex mean.
    const n = poly.length || 1;
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * area), cy / (3 * area)];
}

function bboxOf(poly: Pt[]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Scale a polygon about a point. */
function scaleAbout(poly: Pt[], c: Pt, k: number): Pt[] {
  return poly.map((p) => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k]);
}

/** Horizontal chord of a convex polygon at height y, or null if it misses. */
function chordAt(poly: Pt[], y: number): [number, number] | null {
  let x0 = Infinity;
  let x1 = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if ((a[1] <= y && b[1] >= y) || (a[1] >= y && b[1] <= y)) {
      if (Math.abs(b[1] - a[1]) < 1e-6) {
        x0 = Math.min(x0, a[0], b[0]);
        x1 = Math.max(x1, a[0], b[0]);
      } else {
        const x = a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]);
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
      }
    }
  }
  return x0 <= x1 ? [x0, x1] : null;
}

const f = (n: number) => n.toFixed(1);
const px = (n: number) => `${f(n)}px`;

/**
 * SVG path for a polygon with its corners rounded off (quadratic arcs), in
 * coordinates shifted by (ox, oy). Shared by the clip-path and the rim so the
 * highlight follows the exact silhouette.
 */
function roundedPath(poly: Pt[], r: number, ox = 0, oy = 0): string {
  const n = poly.length;
  if (n < 3) return 'M0 0Z';
  let d = '';
  for (let i = 0; i < n; i++) {
    const p = poly[(i - 1 + n) % n];
    const v = poly[i];
    const q = poly[(i + 1) % n];
    const lenIn = Math.hypot(v[0] - p[0], v[1] - p[1]) || 1;
    const lenOut = Math.hypot(q[0] - v[0], q[1] - v[1]) || 1;
    const rr = Math.min(r, lenIn / 2, lenOut / 2);
    const ax = v[0] + ((p[0] - v[0]) * rr) / lenIn;
    const ay = v[1] + ((p[1] - v[1]) * rr) / lenIn;
    const bx = v[0] + ((q[0] - v[0]) * rr) / lenOut;
    const by = v[1] + ((q[1] - v[1]) * rr) / lenOut;
    d += `${i === 0 ? 'M' : 'L'}${f(ax - ox)} ${f(ay - oy)}Q${f(v[0] - ox)} ${f(v[1] - oy)} ${f(bx - ox)} ${f(by - oy)}`;
  }
  return d + 'Z';
}

/**
 * The hover reveal on a project card's image. Dwelling on the picture etches
 * hairline cracks across it; when they meet, the pane fractures into shards
 * of liquid glass that drift out over the whole slide. The largest shards
 * glimmer into windows onto the project's other pages, the mid-size ones keep
 * their fragment of the picture, and the slivers from the impact point
 * scatter as clear chips. Leave the card and the shards fly home and the pane
 * seals itself.
 *
 * The shard layer lives on the slide, not the card, so it can spread past
 * the card's clipped edges; the card's pointer tilt is frozen flat while the
 * pane is live so the shards stay in register with the picture (style.css).
 */
export class GlassShatter {
  private card: HTMLElement;
  private media: HTMLElement;
  private host: HTMLElement;
  private video: HTMLVideoElement | null;
  private heroSrc: string;
  private accent: string;
  private seeds: Seed[];
  private centerN: Pt;
  private hooks: ShatterHooks;
  private uid: string;

  private root: HTMLElement | null = null;
  private stage: HTMLElement | null = null;
  private cracks: SVGSVGElement | null = null;
  private crackGroups: SVGGElement[] = [];
  private rimGradient: SVGLinearGradientElement | null = null;
  private flash: HTMLElement | null = null;
  private shards: Shard[] = [];
  private edges: Edge[] = [];
  private geomKey = '';
  private size: Pt = [0, 0];

  private state: State = 'idle';
  private timers: number[] = [];
  private floats: Animation[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private pausedVideo = false;

  constructor(card: HTMLElement, media: HTMLElement, project: Project, hooks: ShatterHooks = {}) {
    this.card = card;
    this.media = media;
    this.host = card.closest<HTMLElement>('.slide') ?? card;
    this.hooks = hooks;
    this.video = media.querySelector('video');
    this.heroSrc = project.image ?? '';
    this.accent = THEMES[project.theme].css.accent;
    this.uid = `shatter-rim-${++uidCounter}`;

    const pages = project.pages?.length ? project.pages : placeholderPages(project);
    const rng = mulberry32(hashString(project.title));
    this.centerN = [(rng() - 0.5) * 0.16, (rng() - 0.5) * 0.16];
    this.seeds = this.makeSeeds(pages, rng);

    media.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch') return;
      this.arm(e.clientX, e.clientY);
    });
    // The dwell is on the *image*: drifting off it before the cracks meet cancels.
    media.addEventListener('pointerleave', () => {
      if (this.state === 'arming') this.cancel();
    });
    // But an open pane spreads over the whole slide, so only leaving the card closes it.
    card.addEventListener('pointerleave', () => this.release());
  }

  get isOpen(): boolean {
    return this.state === 'open';
  }

  /** Idempotent — called on slide-change warm-up and again on first hover. */
  build(): void {
    if (this.root) return;

    const root = document.createElement('div');
    root.className = 'shatter';
    root.setAttribute('aria-hidden', 'true');
    root.style.setProperty('--shatter-accent', this.accent);

    // One rim gradient per card, in stage coordinates, so every shard's edge
    // catches the same light from the top left.
    const defs = document.createElementNS(SVG_NS, 'svg');
    defs.setAttribute('class', 'shatter-defs');
    defs.setAttribute('width', '0');
    defs.setAttribute('height', '0');
    const grad = document.createElementNS(SVG_NS, 'linearGradient');
    grad.setAttribute('id', this.uid);
    grad.setAttribute('gradientUnits', 'userSpaceOnUse');
    [
      ['0', '#ffffff', '0.95'],
      ['0.45', '#ffffff', '0.55'],
      ['1', this.accent, '0.7'],
    ].forEach(([offset, color, opacity]) => {
      const stop = document.createElementNS(SVG_NS, 'stop');
      stop.setAttribute('offset', offset);
      stop.setAttribute('stop-color', color);
      stop.setAttribute('stop-opacity', opacity);
      grad.appendChild(stop);
    });
    const defsEl = document.createElementNS(SVG_NS, 'defs');
    defsEl.appendChild(grad);
    defs.appendChild(defsEl);
    root.appendChild(defs);
    this.rimGradient = grad;

    const stage = document.createElement('div');
    stage.className = 'shatter-stage';

    const glow = document.createElement('div');
    glow.className = 'shatter-glow';
    stage.appendChild(glow);

    const cracks = document.createElementNS(SVG_NS, 'svg');
    cracks.setAttribute('class', 'shatter-cracks');
    cracks.setAttribute('preserveAspectRatio', 'none');
    this.crackGroups = ['crack-glow', 'crack-core'].map((cls) => {
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', cls);
      cracks.appendChild(g);
      return g;
    });
    stage.appendChild(cracks);

    this.shards = this.seeds.map((seed) => this.buildShard(seed));
    // Slivers sit on top: they fly highest and are the smallest.
    [...this.shards]
      .sort((a, b) => Z_ORDER[a.seed.kind] - Z_ORDER[b.seed.kind])
      .forEach((s) => stage.appendChild(s.el));

    const flash = document.createElement('div');
    flash.className = 'shatter-flash';
    stage.appendChild(flash);

    root.appendChild(stage);
    this.host.appendChild(root);
    this.root = root;
    this.stage = stage;
    this.cracks = cracks;
    this.flash = flash;

    this.layout(true);
  }

  /** Pointer arrived on the image: start the dwell and let the cracks creep. */
  arm(clientX: number, clientY: number): void {
    if (this.state === 'arming' || this.state === 'open') return;
    this.build();
    if (!this.root) return;

    if (this.state === 'closing') {
      // Caught mid-flight: turn the shards straight back around.
      this.setImpact(clientX, clientY);
      this.open();
      return;
    }

    this.clearTimers();
    this.layout(false);
    this.setImpact(clientX, clientY);

    this.root.classList.add('is-live');
    void this.root.offsetWidth; // paint the closed state before the cracks start drawing
    this.root.classList.add('is-arming');
    this.card.classList.add('shatter-arming');
    this.state = 'arming';

    this.timers.push(window.setTimeout(() => this.open(), DWELL_MS));
  }

  /** Pointer left the card (or the slide moved on): stop whatever is happening. */
  release(): void {
    if (this.state === 'arming') this.cancel();
    else if (this.state === 'open') this.close();
  }

  /** Re-fit to the card after a viewport change. No-op while anything is in motion. */
  refit(): void {
    if (!this.root || this.state !== 'idle') return;
    this.layout(false);
  }

  destroy(): void {
    this.clearTimers();
    this.floats.forEach((a) => a.cancel());
    this.floats = [];
    this.root?.remove();
    this.root = null;
    this.stage = null;
    this.cracks = null;
    this.flash = null;
    this.rimGradient = null;
    this.shards = [];
    this.edges = [];
    this.state = 'idle';
    this.card.classList.remove('shatter-arming', 'shatter-active', 'shatter-returning');
  }

  /* ── Pattern ── */

  private makeSeeds(pages: ProjectPage[], rng: () => number): Seed[] {
    const seeds: Seed[] = [];
    const rings: Kind[] = ['sliver', 'glass', 'page'];
    for (const kind of rings) {
      const count = kind === 'page' ? Math.max(4, Math.min(9, pages.length)) : RING_COUNT[kind];
      const base = rng() * Math.PI * 2;
      const step = (Math.PI * 2) / count;
      for (let k = 0; k < count; k++) {
        const ang = base + k * step + (rng() - 0.5) * step * 0.5;
        const r = RING_RADIUS[kind] * (1 + (rng() - 0.5) * 0.3);
        const clamp = (v: number) => Math.max(-0.94, Math.min(0.94, v));
        seeds.push({
          kind,
          nx: clamp(this.centerN[0] + r * Math.cos(ang)),
          ny: clamp(this.centerN[1] + r * Math.sin(ang)),
          page: kind === 'page' ? pages[k] : undefined,
          roll: rng() * 2 - 1,
          jitter: [(rng() - 0.5) * 18, (rng() - 0.5) * 18],
          glintPhase: rng(),
          floatDur: 3800 + rng() * 2600,
          floatPhase: rng() * 4000,
        });
      }
    }
    return seeds;
  }

  private buildShard(seed: Seed): Shard {
    const el = document.createElement('div');
    el.className = `shard is-${seed.kind}`;

    const body = document.createElement('div');
    body.className = 'shard-body';

    const hero = document.createElement('img');
    hero.className = 'shard-hero';
    hero.alt = '';
    hero.decoding = 'async';
    hero.draggable = false;
    if (this.heroSrc) hero.src = this.heroSrc;
    body.appendChild(hero);

    let page: HTMLImageElement | null = null;
    let label: HTMLElement | null = null;
    if (seed.page) {
      page = document.createElement('img');
      page.className = 'shard-page';
      page.alt = '';
      page.decoding = 'async';
      page.draggable = false;
      page.src = seed.page.src;
      body.appendChild(page);
    }

    const tint = document.createElement('div');
    tint.className = 'shard-tint';
    body.appendChild(tint);

    const gloss = document.createElement('div');
    gloss.className = 'shard-gloss';
    body.appendChild(gloss);

    // Edge light, inside the clip so half of each stroke is cut away and the
    // rest reads as a bevel: a wide soft band, an accent fringe, a bright core.
    const rim = document.createElementNS(SVG_NS, 'svg');
    rim.setAttribute('class', 'shard-rim');
    rim.setAttribute('preserveAspectRatio', 'none');
    const rimPaths = ['rim-band', 'rim-fringe', 'rim-core'].map((cls) => {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', cls);
      rim.appendChild(path);
      return path;
    });
    rimPaths[2].style.stroke = `url(#${this.uid})`;
    body.appendChild(rim);

    if (seed.page) {
      label = document.createElement('span');
      label.className = 'shard-label';
      label.textContent = seed.page.label;
      body.appendChild(label);
    }

    el.appendChild(body);
    return {
      seed, el, body, hero, page, rim, rimPaths, label,
      centroid: [0, 0], open: SHUT, shut: SHUT,
    };
  }

  /* ── Geometry ── */

  /**
   * Fit the stage over the image, cut the pane into cells, and work out where
   * each shard flies to. Runs on build, on resize, and before every arm; it
   * bails early when nothing has moved.
   */
  private layout(force: boolean): void {
    if (!this.root || !this.stage || !this.cracks) return;
    const media = this.media;
    const W = media.offsetWidth;
    const H = media.offsetHeight;
    if (!W || !H) return;

    // Stage origin in host (slide) coordinates, from layout offsets rather
    // than bounding rects so the card's hover transform can't skew it. The
    // media's offsetParent is the card; the card's is the slide.
    const inCard = this.host === this.card;
    const sx = inCard ? media.offsetLeft : this.card.offsetLeft + this.card.clientLeft + media.offsetLeft;
    const sy = inCard ? media.offsetTop : this.card.offsetTop + this.card.clientTop + media.offsetTop;
    const hostW = this.host.clientWidth;
    const hostH = this.host.clientHeight;

    const key = `${W}:${H}:${sx}:${sy}:${hostW}:${hostH}`;
    if (!force && key === this.geomKey) return;
    this.geomKey = key;
    this.size = [W, H];

    const stage = this.stage;
    stage.style.left = px(sx);
    stage.style.top = px(sy);
    stage.style.width = px(W);
    stage.style.height = px(H);
    this.cracks.setAttribute('viewBox', `0 0 ${W} ${H}`);
    this.rimGradient?.setAttribute('x2', String(W));
    this.rimGradient?.setAttribute('y2', String(H));

    const hw = W / 2;
    const hh = H / 2;
    const C: Pt = [hw + this.centerN[0] * hw, hh + this.centerN[1] * hh];
    // The exploded view is centred on the slide, not the image: the shards
    // fill the screen as if the pane had burst toward the viewer.
    const Q: Pt = [hostW / 2 - sx, hostH / 2 - sy];
    stage.style.perspectiveOrigin = `${px(Q[0])} ${px(Q[1])}`;

    // Pattern scale: the outer ring's centroids (at ~0.75 of the half-extents)
    // land at REACH of the slide. Shards grow up to what that spread allows.
    const kx = Math.max(1.15, (REACH_X * hostW) / (0.75 * hw));
    const ky = Math.max(1.05, (REACH_Y * hostH) / (0.75 * hh));
    const pageScale = Math.min(MAX_SHARD_SCALE, 0.92 * Math.min(kx, ky));
    const glassScale = pageScale * 0.85;
    const sliverScale = pageScale * 0.7;

    const seedPts: Pt[] = this.seeds.map((s) => [hw + s.nx * hw, hh + s.ny * hh]);
    const cells = voronoi(seedPts, W, H);

    // Keep clear of the slide edges, and of the progress rail along the bottom.
    const minX = -sx + 36;
    const maxX = hostW - sx - 36;
    const minY = -sy + 36;
    const maxY = hostH - sy - 76;

    this.shards.forEach((shard, i) => {
      const poly = cells[i];
      const seed = shard.seed;
      if (poly.length < 3) {
        shard.body.style.clipPath = 'polygon(0 0, 0 0, 0 0)';
        shard.open = SHUT;
        shard.shut = SHUT;
        return;
      }
      const c = centroidOf(poly);
      const bb = bboxOf(poly);
      shard.centroid = c;

      const outline = roundedPath(poly, CORNER_RADIUS);
      shard.body.style.clipPath = `path("${outline}")`;
      shard.rim.setAttribute('viewBox', `0 0 ${W} ${H}`);
      shard.rimPaths.forEach((p) => p.setAttribute('d', outline));
      if (shard.page) {
        // The page art floats inside its slab, leaving a glass margin all round.
        shard.page.style.left = px(bb.x);
        shard.page.style.top = px(bb.y);
        shard.page.style.width = px(bb.w);
        shard.page.style.height = px(bb.h);
        shard.page.style.clipPath =
          `path("${roundedPath(scaleAbout(poly, c, PAGE_INSET), CORNER_RADIUS * PAGE_INSET, bb.x, bb.y)}")`;
      }
      if (shard.label) {
        // Low in the shard, but only where the cell is wide enough to hold it.
        const ly = c[1] + bb.h * 0.24;
        const chord = chordAt(poly, ly);
        const fits = chord && chord[1] - chord[0] > 96;
        shard.label.style.left = px(fits ? (chord[0] + chord[1]) / 2 : c[0]);
        shard.label.style.top = px(fits ? ly : c[1]);
      }
      shard.el.style.transformOrigin = `${px(c[0])} ${px(c[1])}`;

      // Flight: scale the fracture pattern up about the impact point, move it
      // onto the slide centre, tilt each shard away from the middle.
      const vx = c[0] - C[0];
      const vy = c[1] - C[1];
      const ux = vx / hw;
      const uy = vy / hh;
      const dist = Math.min(1, Math.hypot(ux, uy));

      let fx: number, fy: number, sc: number, tz: number, rx: number, ry: number, rz: number;
      switch (seed.kind) {
        case 'page':
          fx = kx; fy = ky; sc = pageScale;
          tz = 30 + 30 * dist;
          rx = -uy * 5; ry = ux * 7; rz = seed.roll * 3;
          break;
        case 'glass':
          fx = kx; fy = ky; sc = glassScale;
          tz = 16;
          rx = -uy * 8; ry = ux * 10; rz = seed.roll * 6;
          break;
        default:
          fx = kx * 1.35; fy = ky * 1.35; sc = sliverScale;
          tz = 56;
          rx = -uy * 34 + seed.roll * 10; ry = ux * 34; rz = seed.roll * 26;
          break;
      }

      let tx = Q[0] + vx * fx + seed.jitter[0] - c[0];
      let ty = Q[1] + vy * fy + seed.jitter[1] - c[1];
      // Keep the shard inside the slide, which clips its overflow. Project the
      // scaled box the way the browser will — perspective magnifies about Q —
      // and pad a little for the tilt and the landing overshoot.
      const mag = PERSPECTIVE / (PERSPECTIVE - tz);
      const pad = 0.05;
      const ex0 = c[0] + (bb.x - c[0]) * sc + tx - bb.w * pad;
      const ex1 = c[0] + (bb.x + bb.w - c[0]) * sc + tx + bb.w * pad;
      const ey0 = c[1] + (bb.y - c[1]) * sc + ty - bb.h * pad;
      const ey1 = c[1] + (bb.y + bb.h - c[1]) * sc + ty + bb.h * pad;
      const px0 = Q[0] + (ex0 - Q[0]) * mag;
      const px1 = Q[0] + (ex1 - Q[0]) * mag;
      const py0 = Q[1] + (ey0 - Q[1]) * mag;
      const py1 = Q[1] + (ey1 - Q[1]) * mag;
      if (px0 < minX) tx += (minX - px0) / mag;
      else if (px1 > maxX) tx -= (px1 - maxX) / mag;
      if (py0 < minY) ty += (minY - py0) / mag;
      else if (py1 > maxY) ty -= (py1 - maxY) / mag;

      // Strokes and the label are authored in screen pixels; undo the shard's
      // scale for them so a big shard doesn't get a fat rim and a huge caption.
      shard.el.style.setProperty('--inv', (1 / sc).toFixed(3));
      shard.open =
        `translate3d(${px(tx)}, ${px(ty)}, ${px(tz)}) ` +
        `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg) ` +
        `scale(${sc.toFixed(3)})`;
      shard.shut = SHUT;
    });

    this.buildCracks(cells, W, H);

    if (this.state !== 'open') {
      // Land on the closed pose without animating there from the old one.
      this.shards.forEach((shard) => {
        shard.el.style.transition = 'none';
        shard.el.style.transform = shard.shut;
      });
      void this.root.offsetHeight;
      this.shards.forEach((shard) => {
        shard.el.style.transition = '';
      });
    }
  }

  /** One crack per shared cell edge; the pane's own border isn't a crack. */
  private buildCracks(cells: Pt[][], W: number, H: number): void {
    const eps = 0.5;
    const onSameSide = (p: Pt, q: Pt) =>
      (Math.abs(p[0]) < eps && Math.abs(q[0]) < eps) ||
      (Math.abs(p[0] - W) < eps && Math.abs(q[0] - W) < eps) ||
      (Math.abs(p[1]) < eps && Math.abs(q[1]) < eps) ||
      (Math.abs(p[1] - H) < eps && Math.abs(q[1] - H) < eps);
    const keyOf = (p: Pt) => `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}`;

    const seen = new Set<string>();
    const edges: Edge[] = [];
    for (const poly of cells) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        if (onSameSide(a, b)) continue;
        const ka = keyOf(a);
        const kb = keyOf(b);
        const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 1) continue;
        edges.push({ a, b, len, paths: [] });
      }
    }

    this.crackGroups.forEach((g) => g.replaceChildren());
    for (const edge of edges) {
      edge.paths = this.crackGroups.map((g) => {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', `M${f(edge.a[0])} ${f(edge.a[1])} L${f(edge.b[0])} ${f(edge.b[1])}`);
        path.style.setProperty('--len', f(edge.len));
        g.appendChild(path);
        return path;
      });
    }
    this.edges = edges;
  }

  /**
   * Everything that depends on where the pointer landed: the cracks grow out
   * from there, and the shards leave (and later return) in distance order.
   */
  private setImpact(clientX: number, clientY: number): void {
    if (!this.stage) return;
    const [W, H] = this.size;
    const r = this.media.getBoundingClientRect();
    const ix = Math.max(0, Math.min(W, ((clientX - r.left) / (r.width || 1)) * W));
    const iy = Math.max(0, Math.min(H, ((clientY - r.top) / (r.height || 1)) * H));
    this.stage.style.setProperty('--ix', `${((ix / W) * 100).toFixed(1)}%`);
    this.stage.style.setProperty('--iy', `${((iy / H) * 100).toFixed(1)}%`);

    const corners: Pt[] = [[0, 0], [W, 0], [W, H], [0, H]];
    const maxD = Math.max(...corners.map((c) => Math.hypot(c[0] - ix, c[1] - iy))) || 1;

    this.shards.forEach((shard) => {
      const d = Math.hypot(shard.centroid[0] - ix, shard.centroid[1] - iy) / maxD;
      const open = Math.round(20 + OPEN_STAGGER_MS * d);
      shard.el.style.setProperty('--d', `${open}ms`);
      shard.el.style.setProperty('--dc', `${Math.round(CLOSE_STAGGER_MS * (1 - d))}ms`);
      shard.el.style.setProperty('--gd', `${Math.round(open + 300 + shard.seed.glintPhase * 260)}ms`);
    });

    for (const edge of this.edges) {
      const da = Math.hypot(edge.a[0] - ix, edge.a[1] - iy);
      const db = Math.hypot(edge.b[0] - ix, edge.b[1] - iy);
      // Draw each crack outward from whichever end is nearer the impact.
      const [from, to] = da <= db ? [edge.a, edge.b] : [edge.b, edge.a];
      const d = `M${f(from[0])} ${f(from[1])} L${f(to[0])} ${f(to[1])}`;
      const delay = `${Math.round((Math.min(da, db) / maxD) * CRACK_SPREAD_MS)}ms`;
      for (const path of edge.paths) {
        path.setAttribute('d', d);
        path.style.setProperty('--cd', delay);
      }
    }
  }

  /* ── States ── */

  private open(): void {
    if (!this.root) return;
    this.clearTimers();
    this.state = 'open';

    if (this.video) {
      this.captureVideoFrame();
      if (!this.video.paused) {
        this.video.pause();
        this.pausedVideo = true;
      }
    }

    // The shard faces must be fully on *before* the flight starts, or the
    // page shards would fade from nothing instead of from the picture.
    this.root.classList.remove('is-closing');
    this.root.classList.add('has-faces');
    void this.root.offsetWidth;

    this.root.classList.add('is-open');
    this.card.classList.add('shatter-active');
    this.card.classList.remove('shatter-returning');
    if (this.cracks) {
      this.cracks.style.transition = '';
      this.cracks.style.opacity = '';
    }
    this.shards.forEach((shard) => {
      shard.el.style.transform = shard.open;
    });

    if (this.flash) {
      this.flash.classList.remove('is-firing');
      void this.flash.offsetWidth;
      this.flash.classList.add('is-firing');
    }

    // The bob starts once the shards have settled at their full size, so the
    // browser rasterises them sharp at that size before anything animates on.
    this.stopFloat(true);
    this.timers.push(window.setTimeout(() => this.startFloat(), OPEN_MS + OPEN_STAGGER_MS + 60));
    this.hooks.onOpen?.(this);
  }

  private close(): void {
    if (!this.root) return;
    this.clearTimers();
    this.state = 'closing';

    this.root.classList.remove('is-open');
    this.root.classList.add('is-closing');
    this.card.classList.remove('shatter-active');
    this.card.classList.add('shatter-returning');
    this.shards.forEach((shard) => {
      shard.el.style.transform = shard.shut;
    });
    this.stopFloat(false);
    this.hooks.onClose?.(this);

    // The picture beneath is sharp again ~800ms in (see .shatter-returning),
    // so the faces can drop a beat after the last shard lands.
    const land = CLOSE_MS + CLOSE_STAGGER_MS + 60;
    this.timers.push(window.setTimeout(() => this.seal(), land));
    this.timers.push(window.setTimeout(() => this.finish(), land + SEAL_MS + 100));
  }

  /** Shards are home: the picture is whole again, so the cracks glint once and fade. */
  private seal(): void {
    if (!this.root || !this.cracks) return;
    this.root.classList.remove('has-faces');
    const cracks = this.cracks;
    cracks.style.transition = 'none';
    cracks.style.opacity = '0.9';
    void cracks.getBoundingClientRect();
    cracks.style.transition = `opacity ${SEAL_MS}ms ease`;
    cracks.style.opacity = '0';
  }

  private finish(): void {
    if (!this.root) return;
    this.state = 'idle';
    this.root.classList.remove('is-live', 'is-closing', 'is-arming', 'has-faces');
    if (this.cracks) {
      this.cracks.style.transition = '';
      this.cracks.style.opacity = '';
    }
    this.shards.forEach((shard) => {
      shard.body.style.transition = '';
      shard.body.style.transform = '';
    });
    this.card.classList.remove('shatter-arming', 'shatter-returning');
    this.resumeVideo();
  }

  private cancel(): void {
    if (!this.root) return;
    this.clearTimers();
    this.state = 'idle';
    this.root.classList.remove('is-arming');
    this.card.classList.remove('shatter-arming');
    const root = this.root;
    this.timers.push(window.setTimeout(() => {
      if (this.state === 'idle') root.classList.remove('is-live');
    }, 320));
  }

  private clearTimers(): void {
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
  }

  /* ── Idle drift ── */

  /**
   * Floating shards bob on their own clocks. This lives on the inner body via
   * the Web Animations API so it never fights the wrapper's flight transition,
   * and so it can be handed off smoothly when the shards are called home.
   */
  private startFloat(): void {
    this.stopFloat(true);
    for (const shard of this.shards) {
      shard.body.style.transition = '';
      shard.body.style.transform = '';
      const sliver = shard.seed.kind === 'sliver';
      const amp = sliver ? 5 : 3;
      const rot = sliver ? 1.6 : 0.45;
      this.floats.push(
        shard.body.animate(
          [
            { transform: `translate3d(0, ${-amp}px, 0) rotate(${-rot}deg)` },
            { transform: `translate3d(0, ${amp}px, 0) rotate(${rot}deg)` },
          ],
          {
            duration: shard.seed.floatDur,
            delay: -shard.seed.floatPhase,
            iterations: Infinity,
            direction: 'alternate',
            easing: 'ease-in-out',
          },
        ),
      );
    }
  }

  private stopFloat(instant: boolean): void {
    if (!this.floats.length) return;
    if (instant) {
      this.floats.forEach((a) => a.cancel());
      this.floats = [];
      return;
    }
    // Freeze each body where its bob left it, then ease that offset away
    // under the flight home. Reads first, then writes, to avoid layout thrash.
    const bodies = this.shards.map((s) => s.body);
    const current = bodies.map((b) => getComputedStyle(b).transform);
    this.floats.forEach((a) => a.cancel());
    this.floats = [];
    bodies.forEach((b, i) => {
      b.style.transition = 'none';
      b.style.transform = current[i] === 'none' ? '' : current[i];
    });
    void this.root?.offsetWidth;
    bodies.forEach((b) => {
      b.style.transition = 'transform 720ms cubic-bezier(0.4, 0, 0.2, 1)';
      b.style.transform = '';
    });
  }

  /* ── Video cards ── */

  /** Freeze the playing frame onto the shards so a video pane fractures too. */
  private captureVideoFrame(): void {
    const v = this.video;
    if (!v || v.readyState < 2 || !v.videoWidth) return;
    const scale = Math.min(1, 1280 / v.videoWidth);
    const cv = (this.canvas ??= document.createElement('canvas'));
    cv.width = Math.round(v.videoWidth * scale);
    cv.height = Math.round(v.videoHeight * scale);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    try {
      ctx.drawImage(v, 0, 0, cv.width, cv.height);
      const url = cv.toDataURL('image/jpeg', 0.86);
      this.shards.forEach((shard) => {
        shard.hero.src = url;
      });
    } catch {
      // Tainted or undecodable frame: the shards stay clear glass.
    }
  }

  private resumeVideo(): void {
    if (!this.pausedVideo || !this.video) return;
    this.pausedVideo = false;
    // Only if the slide is still on screen — the slideshow's observer owns
    // playback otherwise.
    const r = this.video.getBoundingClientRect();
    if (r.right > 0 && r.left < window.innerWidth) {
      this.video.play().catch(() => {});
    }
  }
}
