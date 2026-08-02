import { ParticleScene } from '../animation/scene';
import {
  darrenDrawer,
  codeGlyphDrawer,
  glassesDrawer,
  iceSkateDrawer,
  paperPlaneDrawer,
} from '../animation/IntroChoreography';
import type { TargetDrawer } from '../animation/IntroChoreography';
import { THEMES, ALL_TEXT_CLASSES } from '../theme/themes';

const SVGNS = 'http://www.w3.org/2000/svg';

function clampNum(min: number, v: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/* ── Config types ── */

interface Slot {
  src: string;
  alt: string;
  /** Center as a fraction of the viewport (0..1). */
  cx: number;
  cy: number;
  /** Width: clamp(min, wvw% of the sizing basis, max). */
  wvw: number;
  wmin: number;
  wmax: number;
  aspect: number; // width / height
  rot: number;
  z: number;
}

/** Curved-text layout: the sentence's letters are placed individually along an
 *  SVG path, so each glyph can fly into place on its own. */
interface ArcConfig {
  viewBox: string;
  path: string;
  fontSize: number;
  letterSpacing: number;
  width: string;
}

interface Anchor {
  top?: string;
  bottom?: string;
  shiftX?: string;
  shiftY?: string;
}

interface IntroLine {
  text: string;
  railLabel: string;
  makeDrawer: () => TargetDrawer;
  arc: ArcConfig;
  anchor: Anchor;
  /** Image frames for this slide (0–POOL_SIZE of them). */
  slots: Slot[];
  /** Where the particle formation sits, as a fraction of the world (x right,
   *  y up). Lets the cloud live somewhere other than dead center. */
  formationOffset: [number, number];
  /** Fraction of particles that form the shape (default 0.45). Compact icon
   *  slides run lower so the shape stays sparse and colorful, not a white blob. */
  participation?: number;
  /** Bloom strength for this slide, overriding the theme's (undefined = theme
   *  default). Slides whose formation blows out to white run 0. */
  bloom?: number;
  theme: number;
  fontStyle: 'display' | 'body';
}

/* ── Per-slide image layouts ──
   Each slide arranges its frames differently — a left cascade, a right
   staircase, an upper-right diagonal — so no two slides share a composition. */

const WEBSITE_SLOTS: Slot[] = [
  { src: '/pictures/websites/5q1dcsong1.jpg',        alt: 'Website screenshot: Vertex volunteer platform', cx: 0.17, cy: 0.32, wvw: 23, wmin: 180, wmax: 300, aspect: 1.6, rot: -7,  z: 4 },
  { src: '/pictures/websites/chrome_5HrZmrCiJh.png', alt: 'Website screenshot',                            cx: 0.26, cy: 0.49, wvw: 23, wmin: 180, wmax: 300, aspect: 1.6, rot: -1,  z: 3 },
  { src: '/pictures/websites/chrome_cL5et3zIG2.jpg', alt: 'Website screenshot',                            cx: 0.16, cy: 0.66, wvw: 23, wmin: 180, wmax: 300, aspect: 1.6, rot: -11, z: 2 },
  { src: '/pictures/websites/chrome_dvATHhXx82.png', alt: 'Website screenshot',                            cx: 0.27, cy: 0.81, wvw: 21, wmin: 170, wmax: 280, aspect: 1.6, rot: 6,   z: 1 },
];

const BOOK_SLOTS: Slot[] = [
  { src: '/pictures/books/71A6umHGhhL._UF894,1000_QL80_.jpg',  alt: 'Book cover',                       cx: 0.75, cy: 0.30, wvw: 11, wmin: 115, wmax: 170, aspect: 0.6667, rot: 7,  z: 4 },
  { src: '/pictures/books/71Hp0VjEETL._UF1000,1000_QL80_.jpg', alt: 'Book cover',                       cx: 0.81, cy: 0.46, wvw: 11, wmin: 115, wmax: 170, aspect: 0.6667, rot: -5, z: 3 },
  { src: '/pictures/books/71yt6mN5HuL.jpg',                    alt: 'Book cover',                       cx: 0.75, cy: 0.62, wvw: 11, wmin: 115, wmax: 170, aspect: 0.6667, rot: 9,  z: 2 },
  { src: '/pictures/books/name of the wind.jpg',               alt: 'Book cover: The Name of the Wind', cx: 0.82, cy: 0.77, wvw: 11, wmin: 115, wmax: 170, aspect: 0.6667, rot: -7, z: 1 },
];

const HOCKEY_SLOTS: Slot[] = [
  { src: '/pictures/hockey/mmexport1676255013225.jpg',  alt: 'Playing hockey',    cx: 0.69, cy: 0.24, wvw: 21, wmin: 175, wmax: 290, aspect: 1.6, rot: 6,  z: 2 },
  { src: '/pictures/hockey/PXL_20230212_013808761.jpg', alt: 'Hockey game photo', cx: 0.82, cy: 0.38, wvw: 21, wmin: 175, wmax: 290, aspect: 1.6, rot: -6, z: 3 },
  { src: '/pictures/hockey/PXL_20230321_004747088.jpg', alt: 'Hockey team photo', cx: 0.71, cy: 0.54, wvw: 21, wmin: 175, wmax: 290, aspect: 1.6, rot: 10, z: 1 },
  { src: '/pictures/hockey/PXL_20240118_010237560.jpg', alt: 'On the ice',        cx: 0.85, cy: 0.66, wvw: 19, wmin: 165, wmax: 270, aspect: 1.6, rot: -3, z: 1 },
];

/* ── The intro sentences ── */

const INTRO_LINES: IntroLine[] = [
  {
    text: "Hi! I'm",
    railLabel: 'Darren',
    makeDrawer: darrenDrawer,
    arc: {
      viewBox: '0 0 1000 300',
      path: 'M 120 210 Q 500 120 880 210',
      fontSize: 116,
      letterSpacing: 4,
      width: 'min(680px, 80vw)',
    },
    anchor: { top: '4vh' },
    formationOffset: [0, 0],
    theme: 0,
    fontStyle: 'display',
    slots: [],
  },
  {
    text: 'I code websites :D',
    railLabel: 'Websites',
    makeDrawer: codeGlyphDrawer,
    arc: {
      viewBox: '0 0 1000 300',
      path: 'M 60 168 Q 500 198 940 168',
      fontSize: 76,
      letterSpacing: 2,
      width: 'min(760px, 88vw)',
    },
    anchor: { top: '4vh', shiftX: '-8vw' },
    formationOffset: [0.15, 0.0],
    participation: 0.13,
    theme: 1,
    fontStyle: 'body',
    slots: WEBSITE_SLOTS,
  },
  {
    text: "And when I'm not, you can find me reading…",
    railLabel: 'Reading',
    makeDrawer: glassesDrawer,
    arc: {
      viewBox: '0 0 1300 300',
      path: 'M 40 165 C 330 95 620 220 900 150 S 1180 120 1270 160',
      fontSize: 50,
      letterSpacing: 1,
      width: 'min(1040px, 94vw)',
    },
    anchor: { bottom: '5vh', shiftX: '-6vw' },
    formationOffset: [-0.14, 0.02],
    participation: 0.13,
    theme: 2,
    fontStyle: 'body',
    slots: BOOK_SLOTS,
  },
  {
    text: 'Or playing hockey!',
    railLabel: 'Hockey',
    makeDrawer: iceSkateDrawer,
    arc: {
      viewBox: '0 0 1000 300',
      path: 'M 60 175 Q 500 140 940 165',
      fontSize: 84,
      letterSpacing: 2,
      width: 'min(720px, 86vw)',
    },
    anchor: { top: '5vh', shiftX: '-12vw' },
    formationOffset: [-0.13, -0.1],
    participation: 0.13,
    theme: 3,
    fontStyle: 'body',
    slots: HOCKEY_SLOTS,
  },
  {
    text: "And I'd like to work with you",
    railLabel: 'Together',
    makeDrawer: paperPlaneDrawer,
    arc: {
      viewBox: '0 0 1100 300',
      path: 'M 80 215 Q 550 110 1020 215',
      fontSize: 72,
      letterSpacing: 3,
      width: 'min(880px, 92vw)',
    },
    anchor: { top: '4vh' },
    formationOffset: [0, 0],
    bloom: 0,
    theme: 4,
    fontStyle: 'display',
    slots: [],
  },
];

/** Timeline labels for the intro portion of the shared progress rail. */
export const INTRO_RAIL_LABELS: string[] = INTRO_LINES.map((l) => l.railLabel);

/* ── Timing / layout ── */

const FANOUT_DURATION = 2000;
/** Free-flow beat between one formation dissolving and the next assembling. */
const TRANSITION_GAP = 450;
/** Persistent image frames (max stickers on any single slide). */
const POOL_SIZE = 4;

interface Glyph {
  g: SVGGElement;
  t: SVGTextElement;
}

interface LineRecord {
  el: HTMLDivElement;
  pathEl: SVGPathElement;
  glyphs: Glyph[];
}

interface Frame {
  wrapper: HTMLDivElement;
  imgs: [HTMLImageElement, HTMLImageElement];
  cur: number;
  src: string | null;
}

/* ══════════════════════════════════════════════════════════ */

export class IntroSequence {
  private container: HTMLElement;
  private scene: ParticleScene;
  private onComplete: () => void;
  private lineRecords: LineRecord[] = [];
  private framePool: Frame[] = [];
  private scrollSpacer: HTMLElement | null = null;
  private overlay: HTMLElement | null = null;
  private scrollHint: HTMLElement | null = null;
  private skipButton: HTMLElement | null = null;
  private activeIndex = -1;
  private completed = false;
  private formationTimer: number | null = null;
  private boundScrollHandler: () => void;
  private boundResizeHandler: () => void;
  private onLineChange: ((index: number) => void) | null;

  constructor(
    container: HTMLElement,
    scene: ParticleScene,
    onComplete: () => void,
    onLineChange?: (index: number) => void
  ) {
    this.container = container;
    this.scene = scene;
    this.onComplete = onComplete;
    this.onLineChange = onLineChange ?? null;
    this.boundScrollHandler = this.handleScroll.bind(this);
    this.boundResizeHandler = this.relayoutFrames.bind(this);
  }

  /* ── Public ── */

  start(opts: { startLine?: number; immediate?: boolean } = {}): void {
    const startLine = Math.max(0, Math.min(INTRO_LINES.length - 1, opts.startLine ?? 0));
    const immediate = opts.immediate ?? false;
    document.body.style.overflow = 'auto';
    document.body.style.overflowX = 'hidden';

    /* Prime the first slide's choreography + placement */
    this.scene.setTargetDrawer(INTRO_LINES[startLine].makeDrawer());
    this.scene.setFormationOffset(...INTRO_LINES[startLine].formationOffset);
    this.scene.setFormationParticipation(INTRO_LINES[startLine].participation ?? 0.45);
    this.scene.setBloomOverride(INTRO_LINES[startLine].bloom ?? null);

    /* Scroll spacer — one viewport height per line plus buffer. */
    const spacer = document.createElement('div');
    spacer.id = 'intro-scroll-spacer';
    spacer.style.width = '100%';
    const spacerHeight = (INTRO_LINES.length + 2) * 100;
    spacer.style.height = `${spacerHeight}vh`;
    if (CSS.supports('height', '100dvh')) {
      spacer.style.height = `${spacerHeight}dvh`;
    }
    spacer.style.position = 'relative';
    spacer.style.zIndex = '0';
    spacer.style.pointerEvents = 'none';
    this.container.appendChild(spacer);
    this.scrollSpacer = spacer;

    const overlay = document.createElement('div');
    overlay.id = 'intro-overlay';
    overlay.className = 'fixed inset-0 z-10 flex items-center justify-center pointer-events-none';
    overlay.style.overflow = 'hidden';
    this.container.appendChild(overlay);
    this.overlay = overlay;

    /* Skip button */
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.textContent = 'Skip intro';
    skip.setAttribute('aria-label', 'Skip introduction');
    skip.className =
      'fixed top-5 right-5 z-20 px-4 py-2 rounded-full font-body text-xs tracking-widest uppercase text-slate-300 border border-slate-600 hover:bg-white/10 transition-colors';
    skip.style.pointerEvents = 'auto';
    skip.addEventListener('click', () => this.completeIntro());
    this.container.appendChild(skip);
    this.skipButton = skip;

    /* Scroll hint */
    const hint = document.createElement('div');
    hint.className = 'scroll-hint fixed left-1/2 z-10 font-body text-slate-400';
    hint.style.cssText +=
      'bottom: 8vh; transform: translateX(-50%); font-size: 0.95rem; opacity: 0; letter-spacing: 0.08em; transition: opacity 0.5s ease; pointer-events: none;';
    hint.textContent = 'scroll to continue';
    overlay.appendChild(hint);
    this.scrollHint = hint;

    this.buildFramePool(overlay);
    this.buildLines(overlay);

    /* Measure + place glyphs once laid out, and again once the real font
       loads (metrics shift between fallback and Playfair). */
    requestAnimationFrame(() => this.layoutAllLines());
    document.fonts?.ready.then(() => this.layoutAllLines());

    if (immediate || startLine > 0) {
      this.jumpToLine(startLine);
      this.showLine(startLine);
      window.addEventListener('scroll', this.boundScrollHandler, { passive: true });
      window.addEventListener('resize', this.boundResizeHandler);
      return;
    }

    /* Begin forming the first slide slightly before the line lands */
    setTimeout(() => {
      if (!this.completed) this.scene.setTextFormation(true);
    }, Math.max(0, FANOUT_DURATION - 700));

    setTimeout(() => {
      if (this.completed) return;
      const line = Math.min(
        Math.floor(window.scrollY / window.innerHeight),
        INTRO_LINES.length - 1
      );
      this.showLine(Math.max(0, line));
      window.addEventListener('scroll', this.boundScrollHandler, { passive: true });
      window.addEventListener('resize', this.boundResizeHandler);
    }, FANOUT_DURATION);
  }

  /** Timeline navigation: scroll the intro to a given line. */
  goToLine(index: number): void {
    if (this.completed) return;
    const clamped = Math.max(0, Math.min(INTRO_LINES.length - 1, index));
    if (Math.abs(clamped - Math.max(0, this.activeIndex)) > 1) {
      // Long jumps land instantly: a smooth scroll crosses every viewport in
      // between, and each one forms (then dissolves) its line for a few frames.
      this.jumpToLine(clamped);
    } else {
      window.scrollTo({ top: clamped * window.innerHeight, behavior: 'smooth' });
    }
  }

  /** Scroll straight to a line with no animation. `behavior: 'auto'` is not
   *  enough — it defers to `html { scroll-behavior: smooth }`, so the CSS has
   *  to be suppressed for the assignment. */
  private jumpToLine(index: number): void {
    const root = document.documentElement;
    const prev = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, index * window.innerHeight);
    root.style.scrollBehavior = prev;
  }

  /** Skip the rest of the intro (used by the timeline's slide dots). */
  finish(): void {
    this.completeIntro();
  }

  /* ── DOM construction ── */

  private buildFramePool(overlay: HTMLElement): void {
    for (let i = 0; i < POOL_SIZE; i++) {
      const wrapper = document.createElement('div');
      wrapper.className = 'intro-frame';
      wrapper.style.transitionDelay = `${i * 0.05}s`;

      const imgs: HTMLImageElement[] = [];
      for (let k = 0; k < 2; k++) {
        const img = document.createElement('img');
        img.draggable = false;
        img.className = 'intro-frame-img';
        img.style.opacity = k === 0 ? '1' : '0';
        wrapper.appendChild(img);
        imgs.push(img);
      }

      overlay.appendChild(wrapper);
      this.framePool.push({ wrapper, imgs: [imgs[0], imgs[1]], cur: 0, src: null });
      this.parkFrame(this.framePool[i]);
    }
  }

  private buildLines(overlay: HTMLElement): void {
    INTRO_LINES.forEach((line, i) => {
      const el = document.createElement('div');
      el.className = 'arc-line absolute';
      el.setAttribute('data-theme', String(line.theme));
      el.style.zIndex = '10';
      el.style.left = '0';
      el.style.right = '0';
      if (line.anchor.top) el.style.top = line.anchor.top;
      if (line.anchor.bottom) el.style.bottom = line.anchor.bottom;
      const tx = line.anchor.shiftX ?? '0';
      const ty = line.anchor.shiftY ?? '0';
      el.style.transform = `translate(${tx}, ${ty})`;

      const fontClass =
        line.fontStyle === 'display' ? 'font-display italic' : 'font-body';
      const fontWeight = 500;
      const pid = `intro-arc-${i}`;

      el.innerHTML = `
        <svg class="intro-curve" viewBox="${line.arc.viewBox}" style="width: ${line.arc.width}">
          <defs><path id="${pid}" d="${line.arc.path}" fill="none"/></defs>
          <g class="intro-letters" fill="currentColor"></g>
        </svg>`;

      const pathEl = el.querySelector<SVGPathElement>(`#${pid}`)!;
      const lettersG = el.querySelector<SVGGElement>('.intro-letters')!;

      const glyphs: Glyph[] = [];
      for (const ch of Array.from(line.text)) {
        const g = document.createElementNS(SVGNS, 'g');
        g.setAttribute('class', 'intro-glyph');
        const t = document.createElementNS(SVGNS, 'text');
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('dominant-baseline', 'central');
        t.setAttribute('class', fontClass);
        t.setAttribute('style', `font-size:${line.arc.fontSize}px;font-weight:${fontWeight}`);
        // A lone space in an SVG <text> gets trimmed (zero advance), which
        // collapses word gaps — use a non-breaking space so it keeps its width.
        t.textContent = ch === ' ' ? ' ' : ch;
        g.appendChild(t);
        lettersG.appendChild(g);
        glyphs.push({ g, t });
      }

      this.applyThemeColor(el, line.theme);
      overlay.appendChild(el);
      this.lineRecords.push({ el, pathEl, glyphs });
    });
  }

  /* ── Arc-text placement ── */

  private layoutAllLines(): void {
    INTRO_LINES.forEach((line, i) => this.layoutLine(i, line.arc));
  }

  private layoutLine(index: number, arc: ArcConfig): void {
    const rec = this.lineRecords[index];
    if (!rec) return;
    let total = 0;
    const L = rec.pathEl.getTotalLength();
    if (!L) return;

    const widths = rec.glyphs.map((gl) => gl.t.getComputedTextLength());
    for (const w of widths) total += w;
    total += arc.letterSpacing * Math.max(0, widths.length - 1);

    let cursor = (L - total) / 2;
    rec.glyphs.forEach((gl, i) => {
      const mid = clampNum(0, cursor + widths[i] / 2, L);
      const p = rec.pathEl.getPointAtLength(mid);
      const p2 = rec.pathEl.getPointAtLength(Math.min(L, mid + 1));
      const ang = (Math.atan2(p2.y - p.y, p2.x - p.x) * 180) / Math.PI;
      gl.g.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${ang})`);
      cursor += widths[i] + arc.letterSpacing;
    });
  }

  /* ── Image frames ── */

  private parkFrame(frame: Frame): void {
    const x = window.innerWidth * 0.5;
    const y = window.innerHeight * 0.58;
    frame.wrapper.style.opacity = '0';
    frame.wrapper.style.transform = `translate(calc(${x}px - 50%), calc(${y}px - 50%)) rotate(0deg) scale(0.5)`;
  }

  private applyFrameSlots(index: number): void {
    const slots = INTRO_LINES[index].slots;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const basis = Math.min(vw, 1600);

    this.framePool.forEach((frame, i) => {
      const slot = slots[i];
      if (!slot) {
        this.parkFrame(frame);
        return;
      }
      const wpx = clampNum(slot.wmin, (slot.wvw / 100) * basis, slot.wmax);
      const hpx = wpx / slot.aspect;
      const x = slot.cx * vw;
      const y = slot.cy * vh;

      frame.wrapper.style.width = `${wpx}px`;
      frame.wrapper.style.height = `${hpx}px`;
      frame.wrapper.style.zIndex = String(slot.z);
      frame.wrapper.style.transform = `translate(calc(${x}px - 50%), calc(${y}px - 50%)) rotate(${slot.rot}deg) scale(1)`;
      frame.wrapper.style.opacity = '1';

      /* Cross-fade to the new photo as the frame flies, so the content morphs
         mid-flight instead of hard-cutting. */
      if (frame.src !== slot.src) {
        const next = frame.cur ^ 1;
        const img = frame.imgs[next];
        img.src = slot.src;
        img.alt = slot.alt;
        img.style.aspectRatio = String(slot.aspect);
        frame.imgs[next].style.opacity = '1';
        frame.imgs[frame.cur].style.opacity = '0';
        frame.cur = next;
        frame.src = slot.src;
      }
    });
  }

  private relayoutFrames(): void {
    if (this.completed || this.activeIndex < 0) return;
    this.applyFrameSlots(this.activeIndex);
  }

  /* ── Scroll Handler ── */

  private handleScroll(): void {
    if (this.completed) return;

    const scrollY = window.scrollY;
    const vh = window.innerHeight;
    const rawIndex = Math.floor(scrollY / vh);
    const targetIndex = Math.min(rawIndex, INTRO_LINES.length - 1);

    const maxScroll = document.documentElement.scrollHeight - vh;
    if (scrollY >= INTRO_LINES.length * vh - vh * 0.15 || scrollY >= maxScroll - 5) {
      this.completeIntro();
      return;
    }

    if (targetIndex !== this.activeIndex) {
      if (this.activeIndex >= 0) {
        this.hideLine(this.activeIndex);
      }
      this.showLine(targetIndex);
    }
  }

  /* ── Show / Hide a line ── */

  private clearFormationTimer(): void {
    if (this.formationTimer !== null) {
      clearTimeout(this.formationTimer);
      this.formationTimer = null;
    }
  }

  private showLine(index: number): void {
    if (index < 0 || index >= INTRO_LINES.length) return;

    const isTransition = this.activeIndex >= 0 && this.activeIndex !== index;
    this.activeIndex = index;
    const line = INTRO_LINES[index];
    const rec = this.lineRecords[index];

    this.onLineChange?.(index);
    this.scene.setTheme(line.theme);
    this.scene.setFormationOffset(...line.formationOffset);
    this.scene.setFormationParticipation(line.participation ?? 0.45);
    this.scene.setBloomOverride(line.bloom ?? null);

    /* Swap in the slide's choreography; let the release burst breathe for a
       beat before the cloud regathers when arriving from another slide. */
    this.scene.setTargetDrawer(line.makeDrawer());
    this.clearFormationTimer();
    if (isTransition) {
      this.formationTimer = window.setTimeout(() => {
        this.formationTimer = null;
        if (!this.completed) this.scene.setTextFormation(true);
      }, TRANSITION_GAP);
    } else {
      this.scene.setTextFormation(true);
    }

    if (this.scrollHint) {
      this.scrollHint.style.opacity = index === 0 ? '0.5' : '0';
    }

    /* Telekinetic drift: the frames glide from wherever they were straight to
       this slide's layout — no pop-in. */
    this.applyFrameSlots(index);

    /* Letters assemble along the arc with a left-to-right stagger. */
    rec.glyphs.forEach((gl, i) => {
      gl.t.style.transitionDelay = `${i * 0.022}s`;
    });
    this.applyThemeColor(rec.el, line.theme);
    requestAnimationFrame(() => {
      rec.el.classList.remove('is-exit');
      rec.el.classList.add('is-active');
    });
  }

  private hideLine(index: number): void {
    if (index < 0 || index >= INTRO_LINES.length) return;

    // Dissolve the formation — the release burst is the scene transition
    this.scene.setTextFormation(false);

    const rec = this.lineRecords[index];
    const n = rec.glyphs.length;
    rec.glyphs.forEach((gl, i) => {
      gl.t.style.transitionDelay = `${(n - 1 - i) * 0.012}s`;
    });
    rec.el.classList.remove('is-active');
    rec.el.classList.add('is-exit');
  }

  /* ── Complete Intro ── */

  private completeIntro(): void {
    if (this.completed) return;
    this.completed = true;

    window.removeEventListener('scroll', this.boundScrollHandler);
    window.removeEventListener('resize', this.boundResizeHandler);
    this.clearFormationTimer();

    try {
      sessionStorage.setItem('introSeen', '1');
    } catch {
      // Storage unavailable — revisit auto-skip just won't work.
    }

    this.scene.setTextFormation(false);
    this.scene.setFormationOffset(0, 0);

    if (this.activeIndex >= 0) {
      this.hideLine(this.activeIndex);
    }
    this.framePool.forEach((f) => this.parkFrame(f));

    this.skipButton?.remove();
    this.skipButton = null;

    if (this.overlay) {
      this.overlay.style.transition = 'opacity 0.8s ease-out';
      this.overlay.style.opacity = '0';
      setTimeout(() => {
        this.overlay?.remove();
        this.scrollSpacer?.remove();
        window.scrollTo(0, 0);
        document.body.style.overflow = 'hidden';
        this.scene.disposeTargets();
        this.onComplete();
      }, 800);
    } else {
      this.scrollSpacer?.remove();
      window.scrollTo(0, 0);
      document.body.style.overflow = 'hidden';
      this.scene.disposeTargets();
      this.onComplete();
    }
  }

  /* ── Theme Color ── */

  private applyThemeColor(el: HTMLElement, theme: number): void {
    ALL_TEXT_CLASSES.forEach((c) => el.classList.remove(c));
    el.classList.add(THEMES[theme]?.css.textClass ?? 'text-white');
  }
}
