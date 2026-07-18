import { ParticleScene } from '../animation/scene';
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

interface IntroLine {
  text: string;
  /** When set, the particle field forms this word while the line is active. */
  particleText?: string;
  /** Vertical offset for the DOM text (to clear the particle-formed word). */
  offsetY?: string;
  theme: number;
  className: string;
  fontStyle: 'display' | 'body';
  stickers: StickerConfig[];
}

/* ── Per-sentence image stickers ── */

const WEBSITE_STICKERS: StickerConfig[] = [
  { src: '/pictures/websites/5q1dcsong1.jpg',        alt: 'Website screenshot: Vertex volunteer platform', left: '4%',  top: '10%',    rotation: -8,  width: 'clamp(280px, 28vw, 420px)', delay: 0 },
  { src: '/pictures/websites/chrome_5HrZmrCiJh.png', alt: 'Website screenshot',                            right: '4%', top: '10%',    rotation: 6,   width: 'clamp(280px, 28vw, 420px)', delay: 120 },
  { src: '/pictures/websites/chrome_cL5et3zIG2.jpg', alt: 'Website screenshot',                            left: '8%',  bottom: '5%',  rotation: 5,   width: 'clamp(280px, 28vw, 420px)', delay: 240 },
  { src: '/pictures/websites/chrome_dvATHhXx82.png', alt: 'Website screenshot',                            right: '8%', bottom: '5%',  rotation: -5,  width: 'clamp(280px, 28vw, 420px)', delay: 360 },
];

const BOOK_STICKERS: StickerConfig[] = [
  { src: '/pictures/books/71A6umHGhhL._UF894,1000_QL80_.jpg',  alt: 'Book cover',                          left: '4%',  top: '10%',    rotation: -6, width: 'clamp(170px, 16vw, 240px)', delay: 0 },
  { src: '/pictures/books/71Hp0VjEETL._UF1000,1000_QL80_.jpg', alt: 'Book cover',                          right: '4%', top: '10%',    rotation: 8,  width: 'clamp(170px, 16vw, 240px)', delay: 150 },
  { src: '/pictures/books/71yt6mN5HuL.jpg',                    alt: 'Book cover',                          left: '8%',  bottom: '10%', rotation: 4,  width: 'clamp(170px, 16vw, 240px)', delay: 300 },
  { src: '/pictures/books/name of the wind.jpg',               alt: 'Book cover: The Name of the Wind',    right: '8%', bottom: '10%', rotation: -7, width: 'clamp(170px, 16vw, 240px)', delay: 200 },
];

const HOCKEY_STICKERS: StickerConfig[] = [
  { src: '/pictures/hockey/mmexport1676255013225.jpg',  alt: 'Playing hockey',    left: '4%',  top: '10%',    rotation: -5, width: 'clamp(280px, 28vw, 420px)', delay: 0 },
  { src: '/pictures/hockey/PXL_20230212_013808761.jpg', alt: 'Hockey game photo', right: '4%', top: '10%',    rotation: 7,  width: 'clamp(280px, 28vw, 420px)', delay: 120 },
  { src: '/pictures/hockey/PXL_20230321_004747088.jpg', alt: 'Hockey team photo', left: '8%',  bottom: '5%',  rotation: 6,  width: 'clamp(280px, 28vw, 420px)', delay: 240 },
  { src: '/pictures/hockey/PXL_20240118_010237560.jpg', alt: 'On the ice',        right: '8%', bottom: '5%',  rotation: -4, width: 'clamp(280px, 28vw, 420px)', delay: 360 },
];

/* ── The intro sentences ── */

const INTRO_LINES: IntroLine[] = [
  {
    text: "Hi! I'm",
    particleText: 'DARREN',
    offsetY: '-16vh',
    theme: 0,
    className: 'intro-line-rise',
    fontStyle: 'display',
    stickers: [],
  },
  {
    text: 'I code websites :D',
    theme: 1,
    className: 'intro-line-letter',
    fontStyle: 'body',
    stickers: WEBSITE_STICKERS,
  },
  {
    text: "And when I'm not, you can find me reading…",
    theme: 2,
    className: 'intro-line-scale',
    fontStyle: 'body',
    stickers: BOOK_STICKERS,
  },
  {
    text: 'Or playing hockey!',
    theme: 3,
    className: 'intro-line-slide',
    fontStyle: 'body',
    stickers: HOCKEY_STICKERS,
  },
  {
    text: "And I'd like to work with you",
    theme: 4,
    className: 'intro-line-blur',
    fontStyle: 'display',
    stickers: [],
  },
];

/* ── Timing ── */

const FANOUT_DURATION = 2000;

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
  private boundScrollHandler: () => void;

  constructor(container: HTMLElement, scene: ParticleScene, onComplete: () => void) {
    this.container = container;
    this.scene = scene;
    this.onComplete = onComplete;
    this.boundScrollHandler = this.handleScroll.bind(this);
  }

  /* ── Public ── */

  start(): void {
    /* Enable scrolling on body for the intro */
    document.body.style.overflow = 'auto';
    document.body.style.overflowX = 'hidden';

    /* Kick off particle text-target generation immediately */
    this.scene.initTextTargets('DARREN');

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

    INTRO_LINES.forEach((line) => {
      /* — Text element — */
      const el = document.createElement('div');
      el.className = `intro-line absolute opacity-0 text-center px-8 max-w-4xl ${line.className}`;
      el.setAttribute('data-theme', String(line.theme));
      el.style.zIndex = '10';

      const spanClass = line.fontStyle === 'display' ? 'font-display italic' : 'font-body';
      /* Inner wrapper carries the vertical offset so it doesn't clobber the
         animation classes' transforms on the outer element. */
      const offset = line.offsetY ? ` style="transform: translateY(${line.offsetY})"` : '';
      el.innerHTML = `<div${offset}><span class="${spanClass}">${line.text}</span></div>`;

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

    this.applySizing();

    /* Begin forming DARREN slightly before the first line lands */
    setTimeout(() => {
      if (!this.completed) this.scene.setTextFormation(true);
    }, Math.max(0, FANOUT_DURATION - 700));

    /* Show the first line after the fanout, then listen to scroll */
    setTimeout(() => {
      if (this.completed) return;
      this.showLine(0);
      window.addEventListener('scroll', this.boundScrollHandler, { passive: true });
    }, FANOUT_DURATION);
  }

  /* ── Sizing per line ── */

  private applySizing(): void {
    const baseSize = 'text-5xl md:text-7xl lg:text-8xl tracking-tight';

    this.lineElements.forEach((el) => {
      el.classList.add(...baseSize.split(' '));
    });
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

  private showLine(index: number): void {
    if (index < 0 || index >= INTRO_LINES.length) return;

    this.activeIndex = index;
    const line = INTRO_LINES[index];
    const el = this.lineElements[index];
    const sc = this.stickerContainers[index];

    this.scene.setTheme(line.theme);

    if (line.particleText !== undefined) {
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

    const line = INTRO_LINES[index];
    const el = this.lineElements[index];
    const sc = this.stickerContainers[index];

    if (line.particleText !== undefined) {
      this.scene.setTextFormation(false);
    }

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
        this.scene.disposeTextTargets();
        this.onComplete();
      }, 800);
    } else {
      this.scrollSpacer?.remove();
      window.scrollTo(0, 0);
      document.body.style.overflow = 'hidden';
      this.scene.disposeTextTargets();
      this.onComplete();
    }
  }

  /* ── Theme Color ── */

  private applyThemeColor(el: HTMLElement, theme: number): void {
    ALL_TEXT_CLASSES.forEach((c) => el.classList.remove(c));
    el.classList.add(THEMES[theme]?.css.textClass ?? 'text-white');
  }
}
