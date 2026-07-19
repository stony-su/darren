import { ParticleScene } from '../animation/scene';
import {
  darrenDrawer,
  typedCodeDrawer,
  murmurationDrawer,
  slapShotDrawer,
  paperPlaneDrawer,
} from '../animation/IntroChoreography';
import type { TargetDrawer } from '../animation/IntroChoreography';
import { THEMES, ALL_TEXT_CLASSES } from '../theme/themes';

/* ── Sticker / Image Config ── */

interface StickerConfig {
  src: string;
  alt: string;
  left?: string;
  right?: string;
  top?: string;
  bottom?: string;
  rotation: number;
  width: string;
  delay: number;
}

/** Curved-text layout: the sentence rides an SVG path instead of a straight
 *  line, pinned to the top or bottom band so the particle stage stays clear. */
interface ArcConfig {
  viewBox: string;
  path: string;
  fontSize: number;
  width: string;
}

interface IntroLine {
  text: string;
  /** Short name shown in the bottom timeline. */
  railLabel: string;
  /** Factory for the slide's particle choreography (fresh state per entry). */
  makeDrawer: () => TargetDrawer;
  /** Curved text geometry. */
  arc: ArcConfig;
  /** Vertical anchor for the text band. */
  anchor: { top?: string; bottom?: string };
  theme: number;
  className: string;
  fontStyle: 'display' | 'body';
  stickers: StickerConfig[];
}

/* ── Per-sentence image stickers ──
   Pushed hard against the screen edges (some bleeding off) so the center
   stage belongs to the particle choreography. Slides with top-anchored text
   keep their top corners clear, and vice versa. */

const WEBSITE_STICKERS: StickerConfig[] = [
  { src: '/pictures/websites/5q1dcsong1.jpg',        alt: 'Website screenshot: Vertex volunteer platform', left: '-4%',  top: '30%',   rotation: -12, width: 'clamp(230px, 21vw, 340px)', delay: 0 },
  { src: '/pictures/websites/chrome_5HrZmrCiJh.png', alt: 'Website screenshot',                            right: '-4%', top: '30%',   rotation: 10,  width: 'clamp(230px, 21vw, 340px)', delay: 120 },
  { src: '/pictures/websites/chrome_cL5et3zIG2.jpg', alt: 'Website screenshot',                            left: '-3%',  bottom: '3%', rotation: 8,   width: 'clamp(230px, 21vw, 340px)', delay: 240 },
  { src: '/pictures/websites/chrome_dvATHhXx82.png', alt: 'Website screenshot',                            right: '-3%', bottom: '3%', rotation: -9,  width: 'clamp(230px, 21vw, 340px)', delay: 360 },
];

const BOOK_STICKERS: StickerConfig[] = [
  { src: '/pictures/books/71A6umHGhhL._UF894,1000_QL80_.jpg',  alt: 'Book cover',                       left: '1%',   top: '3%',  rotation: -10, width: 'clamp(135px, 13vw, 190px)', delay: 0 },
  { src: '/pictures/books/71Hp0VjEETL._UF1000,1000_QL80_.jpg', alt: 'Book cover',                       right: '1%',  top: '3%',  rotation: 9,   width: 'clamp(135px, 13vw, 190px)', delay: 150 },
  { src: '/pictures/books/71yt6mN5HuL.jpg',                    alt: 'Book cover',                       left: '-2%',  top: '42%', rotation: 6,   width: 'clamp(135px, 13vw, 190px)', delay: 300 },
  { src: '/pictures/books/name of the wind.jpg',               alt: 'Book cover: The Name of the Wind', right: '-2%', top: '42%', rotation: -7,  width: 'clamp(135px, 13vw, 190px)', delay: 220 },
];

const HOCKEY_STICKERS: StickerConfig[] = [
  { src: '/pictures/hockey/mmexport1676255013225.jpg',  alt: 'Playing hockey',    left: '-4%',  top: '3%',  rotation: -13, width: 'clamp(220px, 20vw, 330px)', delay: 0 },
  { src: '/pictures/hockey/PXL_20230212_013808761.jpg', alt: 'Hockey game photo', right: '-4%', top: '3%',  rotation: 11,  width: 'clamp(220px, 20vw, 330px)', delay: 120 },
  { src: '/pictures/hockey/PXL_20230321_004747088.jpg', alt: 'Hockey team photo', left: '-5%',  top: '40%', rotation: 7,   width: 'clamp(220px, 20vw, 330px)', delay: 240 },
  { src: '/pictures/hockey/PXL_20240118_010237560.jpg', alt: 'On the ice',        right: '-5%', top: '40%', rotation: -8,  width: 'clamp(220px, 20vw, 330px)', delay: 360 },
];

/* ── The intro sentences ── */

const INTRO_LINES: IntroLine[] = [
  {
    text: "Hi! I'm",
    railLabel: 'Darren',
    makeDrawer: darrenDrawer,
    arc: {
      viewBox: '0 0 1000 300',
      path: 'M 100 250 Q 500 105 900 250',
      fontSize: 118,
      width: 'min(700px, 82vw)',
    },
    anchor: { top: '3vh' },
    theme: 0,
    className: 'intro-line-rise',
    fontStyle: 'display',
    stickers: [],
  },
  {
    text: 'I code websites :D',
    railLabel: 'Websites',
    makeDrawer: typedCodeDrawer,
    arc: {
      viewBox: '0 0 1000 300',
      path: 'M 20 195 C 260 95 520 255 980 135',
      fontSize: 84,
      width: 'min(880px, 92vw)',
    },
    anchor: { top: '2vh' },
    theme: 1,
    className: 'intro-line-letter',
    fontStyle: 'body',
    stickers: WEBSITE_STICKERS,
  },
  {
    text: "And when I'm not, you can find me reading…",
    railLabel: 'Reading',
    makeDrawer: murmurationDrawer,
    arc: {
      viewBox: '0 0 1300 300',
      path: 'M 20 185 C 350 75 700 285 1280 155',
      fontSize: 56,
      width: 'min(1080px, 94vw)',
    },
    anchor: { bottom: '9vh' },
    theme: 2,
    className: 'intro-line-scale',
    fontStyle: 'body',
    stickers: BOOK_STICKERS,
  },
  {
    text: 'Or playing hockey!',
    railLabel: 'Hockey',
    makeDrawer: slapShotDrawer,
    arc: {
      viewBox: '0 0 1000 300',
      path: 'M 40 255 Q 520 235 960 75',
      fontSize: 90,
      width: 'min(820px, 88vw)',
    },
    anchor: { bottom: '8vh' },
    theme: 3,
    className: 'intro-line-slide',
    fontStyle: 'body',
    stickers: HOCKEY_STICKERS,
  },
  {
    text: "And I'd like to work with you",
    railLabel: 'Together',
    makeDrawer: paperPlaneDrawer,
    arc: {
      viewBox: '0 0 1100 300',
      path: 'M 50 250 Q 550 95 1050 250',
      fontSize: 72,
      width: 'min(950px, 94vw)',
    },
    anchor: { top: '3vh' },
    theme: 4,
    className: 'intro-line-blur',
    fontStyle: 'display',
    stickers: [],
  },
];

/** Timeline labels for the intro portion of the shared progress rail. */
export const INTRO_RAIL_LABELS: string[] = INTRO_LINES.map((l) => l.railLabel);

/* ── Timing ── */

const FANOUT_DURATION = 2000;
/** Free-flow beat between one formation dissolving and the next assembling. */
const TRANSITION_GAP = 450;

/* ══════════════════════════════════════════════════════════ */

export class IntroSequence {
  private container: HTMLElement;
  private scene: ParticleScene;
  private onComplete: () => void;
  private lineElements: HTMLElement[] = [];
  private stickerContainers: (HTMLElement | null)[] = [];
  private scrollSpacer: HTMLElement | null = null;
  private overlay: HTMLElement | null = null;
  private scrollHint: HTMLElement | null = null;
  private skipButton: HTMLElement | null = null;
  private activeIndex = -1;
  private completed = false;
  private formationTimer: number | null = null;
  private boundScrollHandler: () => void;
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
  }

  /* ── Public ── */

  start(opts: { startLine?: number; immediate?: boolean } = {}): void {
    const startLine = Math.max(0, Math.min(INTRO_LINES.length - 1, opts.startLine ?? 0));
    const immediate = opts.immediate ?? false;
    /* Enable scrolling on body for the intro */
    document.body.style.overflow = 'auto';
    document.body.style.overflowX = 'hidden';

    /* Prime the first slide's choreography so the fan-out lands on targets */
    this.scene.setTargetDrawer(INTRO_LINES[startLine].makeDrawer());

    /* Scroll spacer — one viewport height per line plus buffer. Use dvh where
       supported so mobile URL-bar collapse doesn't shift the sections. */
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

    /* Scroll hint — fixed near the bottom so it never overlaps the particle text */
    const hint = document.createElement('div');
    hint.className = 'scroll-hint fixed left-1/2 z-10 font-body text-slate-400';
    hint.style.cssText +=
      'bottom: 8vh; transform: translateX(-50%); font-size: 0.95rem; opacity: 0; letter-spacing: 0.08em; transition: opacity 0.5s ease; pointer-events: none;';
    hint.textContent = 'scroll to continue';
    overlay.appendChild(hint);
    this.scrollHint = hint;

    INTRO_LINES.forEach((line, i) => {
      /* — Curved text element — */
      const el = document.createElement('div');
      el.className = `intro-line absolute opacity-0 ${line.className}`;
      el.setAttribute('data-theme', String(line.theme));
      el.style.zIndex = '10';
      el.style.left = '0';
      el.style.right = '0';
      if (line.anchor.top) el.style.top = line.anchor.top;
      if (line.anchor.bottom) el.style.bottom = line.anchor.bottom;

      const fontClass = line.fontStyle === 'display' ? 'font-display italic' : 'font-body';
      const fontWeight = line.fontStyle === 'display' ? 400 : 500;
      el.innerHTML = `
        <svg class="intro-curve" viewBox="${line.arc.viewBox}" style="width: ${line.arc.width}">
          <defs><path id="intro-arc-${i}" d="${line.arc.path}" fill="none"/></defs>
          <text class="${fontClass}" fill="currentColor"
                style="font-size: ${line.arc.fontSize}px; font-weight: ${fontWeight}">
            <textPath href="#intro-arc-${i}" startOffset="50%" text-anchor="middle">${line.text}</textPath>
          </text>
        </svg>`;

      overlay.appendChild(el);
      this.lineElements.push(el);

      /* — Sticker container (only for lines with images) — */
      if (line.stickers.length > 0) {
        const sc = document.createElement('div');
        sc.className = 'sticker-container absolute inset-0';
        sc.setAttribute('role', 'presentation');
        sc.style.opacity = '0';
        sc.style.transition = 'opacity 0.45s ease';
        sc.style.zIndex = '5';

        line.stickers.forEach((cfg) => {
          const wrapper = document.createElement('div');
          wrapper.className = 'sticker';
          wrapper.dataset.rotation = String(cfg.rotation);
          const posStyles: Record<string, string> = {
            position: 'absolute',
            width: cfg.width,
            transform: `rotate(${cfg.rotation}deg) scale(0)`,
            opacity: '0',
            transition: `transform 0.5s cubic-bezier(0.34,1.56,0.64,1) ${cfg.delay}ms, opacity 0.4s ease ${cfg.delay}ms`,
          };
          if (cfg.left)   posStyles.left   = cfg.left;
          if (cfg.right)  posStyles.right  = cfg.right;
          if (cfg.top)    posStyles.top    = cfg.top;
          if (cfg.bottom) posStyles.bottom = cfg.bottom;
          Object.assign(wrapper.style, posStyles);

          const img = document.createElement('img');
          img.src = cfg.src;
          img.alt = cfg.alt;
          img.draggable = false;

          // Books use 2:3 portrait, everything else 16:10 landscape
          const isBook = cfg.src.includes('/books/');
          const aspectRatio = isBook ? '2 / 3' : '16 / 10';

          Object.assign(img.style, {
            width: '100%',
            aspectRatio,
            display: 'block',
            borderRadius: '10px',
            border: '3px solid var(--accent-border)',
            boxShadow: 'var(--glow-shadow)',
            objectFit: 'cover',
            transition: 'border-color 0.5s ease, box-shadow 0.5s ease',
          });

          wrapper.appendChild(img);
          sc.appendChild(wrapper);
        });

        overlay.appendChild(sc);
        this.stickerContainers.push(sc);
      } else {
        this.stickerContainers.push(null);
      }
    });

    if (immediate || startLine > 0) {
      /* Replay / deep entry: particles are already spread — land directly */
      window.scrollTo({ top: startLine * window.innerHeight, behavior: 'auto' });
      this.showLine(startLine);
      window.addEventListener('scroll', this.boundScrollHandler, { passive: true });
      return;
    }

    /* Begin forming the first slide slightly before the line lands */
    setTimeout(() => {
      if (!this.completed) this.scene.setTextFormation(true);
    }, Math.max(0, FANOUT_DURATION - 700));

    /* Show the current line after the fanout, then listen to scroll.
       (A timeline click may already have scrolled past line 0.) */
    setTimeout(() => {
      if (this.completed) return;
      const line = Math.min(
        Math.floor(window.scrollY / window.innerHeight),
        INTRO_LINES.length - 1
      );
      this.showLine(Math.max(0, line));
      window.addEventListener('scroll', this.boundScrollHandler, { passive: true });
    }, FANOUT_DURATION);
  }

  /** Timeline navigation: scroll the intro to a given line. */
  goToLine(index: number): void {
    if (this.completed) return;
    const clamped = Math.max(0, Math.min(INTRO_LINES.length - 1, index));
    // Long jumps land instantly (smooth-scrolling through several viewport
    // heights flashes every line in between).
    const behavior: ScrollBehavior =
      Math.abs(clamped - Math.max(0, this.activeIndex)) > 1 ? 'auto' : 'smooth';
    window.scrollTo({ top: clamped * window.innerHeight, behavior });
  }

  /** Skip the rest of the intro (used by the timeline's slide dots). */
  finish(): void {
    this.completeIntro();
  }

  /* ── Scroll Handler ── */

  private handleScroll(): void {
    if (this.completed) return;

    const scrollY = window.scrollY;
    const vh = window.innerHeight;

    // Each line occupies one viewport height of scroll distance
    const rawIndex = Math.floor(scrollY / vh);
    const targetIndex = Math.min(rawIndex, INTRO_LINES.length - 1);

    // Past the last section → complete (tolerance for sub-pixel rounding)
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
    const el = this.lineElements[index];
    const sc = this.stickerContainers[index];

    this.onLineChange?.(index);
    this.scene.setTheme(line.theme);

    /* Every slide is a formation now: swap in its choreography, and — when
       coming from another slide — let the release burst breathe for a beat
       before the cloud gathers into the new shape. */
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

    requestAnimationFrame(() => {
      this.applyThemeColor(el, line.theme);

      el.classList.remove('intro-line-exit');
      el.classList.add('intro-line-active');
      el.style.opacity = '1';

      if (sc) {
        sc.style.opacity = '1';
        const stickers = sc.querySelectorAll<HTMLElement>('.sticker');
        stickers.forEach((s) => {
          const rot = s.dataset.rotation ?? '0';
          s.style.transform = `rotate(${rot}deg) scale(1)`;
          s.style.opacity = '1';
        });
      }
    });
  }

  private hideLine(index: number): void {
    if (index < 0 || index >= INTRO_LINES.length) return;

    const el = this.lineElements[index];
    const sc = this.stickerContainers[index];

    // Dissolve the formation — the release burst is the scene transition
    this.scene.setTextFormation(false);

    el.classList.remove('intro-line-active');
    el.classList.add('intro-line-exit');
    el.style.opacity = '0';

    if (sc) {
      sc.style.opacity = '0';
      const stickers = sc.querySelectorAll<HTMLElement>('.sticker');
      stickers.forEach((s) => {
        const rot = s.dataset.rotation ?? '0';
        s.style.transform = `rotate(${rot}deg) scale(0)`;
        s.style.opacity = '0';
      });
    }
  }

  /* ── Complete Intro ── */

  private completeIntro(): void {
    if (this.completed) return;
    this.completed = true;

    window.removeEventListener('scroll', this.boundScrollHandler);
    this.clearFormationTimer();

    try {
      sessionStorage.setItem('introSeen', '1');
    } catch {
      // Storage unavailable — revisit auto-skip just won't work.
    }

    this.scene.setTextFormation(false);

    if (this.activeIndex >= 0) {
      this.hideLine(this.activeIndex);
    }

    this.skipButton?.remove();
    this.skipButton = null;

    // Fade out overlay, remove spacer, lock scroll, call onComplete
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
