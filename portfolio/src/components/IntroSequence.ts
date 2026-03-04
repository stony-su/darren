import { ParticleScene } from '../animation/scene';

/* ── Sticker / Image Config ── */

interface StickerConfig {
  src: string;
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
  theme: number;
  className: string;
  fontStyle: 'display' | 'body';
  stickers: StickerConfig[];
}

/* ── Per-sentence image stickers ── */

const WEBSITE_STICKERS: StickerConfig[] = [
  { src: '/pictures/websites/5q1dcsong1.jpg',         left: '4%',  top: '10%',    rotation: -8,  width: 'clamp(280px, 28vw, 420px)', delay: 0 },
  { src: '/pictures/websites/chrome_5HrZmrCiJh.png',  right: '4%', top: '10%',    rotation: 6,   width: 'clamp(280px, 28vw, 420px)', delay: 120 },
  { src: '/pictures/websites/chrome_cL5et3zIG2.jpg',  left: '8%',  bottom: '5%',  rotation: 5,   width: 'clamp(280px, 28vw, 420px)', delay: 240 },
  { src: '/pictures/websites/chrome_dvATHhXx82.png',  right: '8%', bottom: '5%',  rotation: -5,  width: 'clamp(280px, 28vw, 420px)', delay: 360 },
];

const BOOK_STICKERS: StickerConfig[] = [
  { src: '/pictures/books/71A6umHGhhL._UF894,1000_QL80_.jpg',  left: '4%',  top: '10%',    rotation: -6, width: 'clamp(170px, 16vw, 240px)', delay: 0 },
  { src: '/pictures/books/71Hp0VjEETL._UF1000,1000_QL80_.jpg', right: '4%', top: '10%',    rotation: 8,  width: 'clamp(170px, 16vw, 240px)', delay: 150 },
  { src: '/pictures/books/71yt6mN5HuL.jpg',                    left: '8%',  bottom: '10%', rotation: 4,  width: 'clamp(170px, 16vw, 240px)', delay: 300 },
  { src: '/pictures/books/name of the wind.jpg',                right: '8%', bottom: '10%', rotation: -7, width: 'clamp(170px, 16vw, 240px)', delay: 200 },
];

const HOCKEY_STICKERS: StickerConfig[] = [
  { src: '/pictures/hockey/mmexport1676255013225.jpg',   left: '4%',  top: '10%',    rotation: -5, width: 'clamp(280px, 28vw, 420px)', delay: 0 },
  { src: '/pictures/hockey/PXL_20230212_013808761.jpg',  right: '4%', top: '10%',    rotation: 7,  width: 'clamp(280px, 28vw, 420px)', delay: 120 },
  { src: '/pictures/hockey/PXL_20230321_004747088.jpg',  left: '8%',  bottom: '5%',  rotation: 6,  width: 'clamp(280px, 28vw, 420px)', delay: 240 },
  { src: '/pictures/hockey/PXL_20240118_010237560.jpg',  right: '8%', bottom: '5%',  rotation: -4, width: 'clamp(280px, 28vw, 420px)', delay: 360 },
];

/* ── The six intro sentences ── */

const INTRO_LINES: IntroLine[] = [
  {
    text: "Hi! I'm Darren",
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
    text: "And when I'm not, you can find me reading\u2026",
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

/* Box-shadow glow matched to each particle theme colour */
const THEME_GLOW: Record<number, string> = {
  1: '0 4px 24px rgba(244,114,182,0.35), 0 0 48px rgba(244,114,182,0.12)',  // neon-pink
  2: '0 4px 24px rgba(110,231,183,0.35), 0 0 48px rgba(110,231,183,0.12)',  // matcha-green
  3: '0 4px 24px rgba(165,243,252,0.35), 0 0 48px rgba(165,243,252,0.12)',  // beach-cyan
};

/* Theme-tinted border colours */
const THEME_BORDER: Record<number, string> = {
  1: 'rgba(244,114,182,0.55)',   // neon-pink tint
  2: 'rgba(110,231,183,0.55)',   // matcha-green tint
  3: 'rgba(165,243,252,0.55)',   // beach-cyan tint
};

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

    /* Create scroll spacer — each line gets 100vh of scroll space, plus extra buffer to ensure
       the user can always scroll past the last line (avoids sub-pixel rounding issues on laptops) */
    const spacer = document.createElement('div');
    spacer.id = 'intro-scroll-spacer';
    spacer.style.width = '100%';
    spacer.style.height = `${(INTRO_LINES.length + 2) * 100}vh`;
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

    INTRO_LINES.forEach((line, i) => {
      /* — Text element — */
      const el = document.createElement('div');
      el.className = `intro-line absolute opacity-0 text-center px-8 max-w-4xl ${line.className}`;
      el.setAttribute('data-theme', String(line.theme));
      el.style.zIndex = '10';

      const spanClass = line.fontStyle === 'display' ? 'font-display italic' : 'font-body';
      let html = `<span class="${spanClass}">${line.text}</span>`;

      /* Add scroll hint below the first line */
      if (i === 0) {
        html += `<div class="scroll-hint" style="margin-top: 1.2rem; font-size: 0.95rem; opacity: 0.5; font-family: var(--font-body); letter-spacing: 0.08em; font-style: normal;">scroll to continue</div>`;
      }

      el.innerHTML = html;

      overlay.appendChild(el);
      this.lineElements.push(el);

      /* — Sticker container (only for lines with images) — */
      if (line.stickers.length > 0) {
        const sc = document.createElement('div');
        sc.className = 'sticker-container absolute inset-0';
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
          img.alt = '';
          img.draggable = false;

          // Determine aspect ratio — books use 2:3 portrait, everything else 16:10 landscape
          const isBook = cfg.src.includes('/books/');
          const aspectRatio = isBook ? '2 / 3' : '16 / 10';

          Object.assign(img.style, {
            width: '100%',
            aspectRatio,
            display: 'block',
            borderRadius: '10px',
            border: `3px solid ${THEME_BORDER[line.theme] ?? 'rgba(255,255,255,0.8)'}`,
            boxShadow: THEME_GLOW[line.theme] ?? '0 4px 20px rgba(0,0,0,0.3)',
            objectFit: 'cover',
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

    /* Show the first line after the fanout, then listen to scroll */
    setTimeout(() => {
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

    // Past the last section → complete
    // Use a tolerance to handle sub-pixel rounding that can prevent reaching the exact threshold on some screens
    const maxScroll = document.documentElement.scrollHeight - vh;
    if (scrollY >= INTRO_LINES.length * vh - vh * 0.15 || scrollY >= maxScroll - 5) {
      this.completeIntro();
      return;
    }

    if (targetIndex !== this.activeIndex) {
      // Hide current line
      if (this.activeIndex >= 0) {
        this.hideLine(this.activeIndex);
      }
      // Show new line
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

    this.scene.setColorMode(line.theme);

    requestAnimationFrame(() => {
      this.applyThemeColor(el, line.theme);

      // Reset exit state if re-entering
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

    // Hide active line
    if (this.activeIndex >= 0) {
      this.hideLine(this.activeIndex);
    }

    // Fade out overlay, remove spacer, lock scroll, call onComplete
    if (this.overlay) {
      this.overlay.style.transition = 'opacity 0.8s ease-out';
      this.overlay.style.opacity = '0';
      setTimeout(() => {
        this.overlay?.remove();
        this.scrollSpacer?.remove();
        window.scrollTo(0, 0);
        document.body.style.overflow = 'hidden';
        this.onComplete();
      }, 800);
    }
  }

  /* ── Theme Color ── */

  private applyThemeColor(el: HTMLElement, theme: number): void {
    const colors = [
      'text-slate-100',   // 0 normal
      'text-pink-400',    // 1 neon
      'text-emerald-300', // 2 matcha
      'text-cyan-200',    // 3 beach
      'text-white',       // 4 blizzard
    ];
    colors.forEach((c) => el.classList.remove(c));
    el.classList.add(colors[theme] ?? 'text-white');
  }
}
