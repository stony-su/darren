import type { Project } from '../data/projects';
import { PROJECTS } from '../data/projects';
import { ParticleScene } from '../animation/scene';
import { THEMES } from '../theme/themes';

/** Per-slide ambient wind directions (title/closing are calm). */
const WIND_TABLE: [number, number, number][] = [
  [0.7, 0.15, 0],
  [-0.6, 0.25, 0],
  [0.4, -0.3, 0],
  [-0.5, -0.2, 0],
  [0.6, 0.3, 0],
  [-0.4, 0.2, 0],
];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Slide slugs for hash routing: title, one per project, closing. */
export const SLUGS: string[] = ['work', ...PROJECTS.map((p) => slugify(p.title)), 'contact'];

export interface ShowOptions {
  initialIndex?: number;
}

export class ProjectSlideshow {
  private container: HTMLElement;
  private scene: ParticleScene;
  private onIndexChange: ((index: number) => void) | null;
  private slideshowEl!: HTMLElement;
  private viewAllBtn: HTMLElement | null = null;
  private gridOverlay: HTMLElement | null = null;
  private lastFocused: HTMLElement | null = null;
  private currentIndex = 0;
  private lastScrollLeft = 0;
  private ghostEls: HTMLElement[] = [];
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private scrollRafPending = false;
  private hashTimer: number | null = null;
  private destroyed = false;
  private ac = new AbortController();
  private boundKeyHandler: (e: KeyboardEvent) => void;
  private boundResizeHandler: () => void;

  constructor(
    container: HTMLElement,
    scene: ParticleScene,
    onIndexChange?: (index: number) => void
  ) {
    this.container = container;
    this.scene = scene;
    this.onIndexChange = onIndexChange ?? null;
    this.boundKeyHandler = this.handleKey.bind(this);
    this.boundResizeHandler = this.handleResize.bind(this);
  }

  get slideCount(): number {
    return PROJECTS.length + 2;
  }

  show(opts: ShowOptions = {}): void {
    this.slideshowEl = document.createElement('div');
    this.slideshowEl.id = 'project-slideshow';
    this.slideshowEl.className =
      'fixed inset-0 z-10 flex overflow-x-auto snap-x snap-mandatory scroll-smooth';
    this.slideshowEl.style.scrollbarWidth = 'none';

    this.slideshowEl.appendChild(this.createTitleSlide());
    PROJECTS.forEach((project, i) => {
      this.slideshowEl.appendChild(this.createProjectSlide(project, i));
    });
    this.slideshowEl.appendChild(this.createClosingSlide());

    this.container.appendChild(this.slideshowEl);

    this.buildViewAllButton();

    // Fade in (and jump to the deep-linked slide before the first paint)
    const initial = Math.max(0, Math.min(this.slideCount - 1, opts.initialIndex ?? 0));
    this.slideshowEl.style.opacity = '0';
    this.slideshowEl.style.transition = 'opacity 0.8s ease-in';
    requestAnimationFrame(() => {
      if (initial > 0) {
        this.slideshowEl.style.scrollBehavior = 'auto';
        this.slideshowEl.scrollLeft = initial * window.innerWidth;
        this.slideshowEl.style.scrollBehavior = '';
      }
      this.slideshowEl.style.opacity = '1';
      this.onSlideChange(initial);
    });

    this.currentIndex = initial;
    this.lastScrollLeft = initial * window.innerWidth;

    // Ghost titles sit behind the cards; parallax offsets update on scroll
    this.ghostEls = Array.from(this.slideshowEl.querySelectorAll<HTMLElement>('.ghost-title'));
    this.updateGhostParallax();

    this.setupScrollTracking();
    this.setupWheelRedirect();
    this.setupVideoScrubbers();
    this.setupCardTilt();
    this.setupGalleries();
    this.setupLivePreviews();

    window.addEventListener('keydown', this.boundKeyHandler, { signal: this.ac.signal });
    window.addEventListener('resize', this.boundResizeHandler, { signal: this.ac.signal });

    // Watch performance once the steady-state view is up
    this.scene.startPerfWatch();
  }

  /** Tear down all DOM and listeners (used when replaying the intro). */
  destroy(): void {
    this.destroyed = true;
    this.ac.abort();
    if (this.hashTimer !== null) window.clearTimeout(this.hashTimer);
    this.closeGrid();
    this.slideshowEl?.remove();
    this.viewAllBtn?.remove();
    this.viewAllBtn = null;
    this.scene.setCardRect(null);
    this.scene.setLineMode(false);
    this.scene.setAttract(false);
    this.scene.setWind(0, 0, 0);
  }

  goTo(index: number): void {
    const clamped = Math.max(0, Math.min(this.slideCount - 1, index));
    if (Math.abs(clamped - this.currentIndex) > 1) {
      // Long jumps: snap-mandatory interrupts smooth scrolls at intermediate
      // snap points, so land instantly instead.
      this.slideshowEl.style.scrollBehavior = 'auto';
      this.slideshowEl.scrollLeft = clamped * window.innerWidth;
      this.slideshowEl.style.scrollBehavior = '';
    } else {
      this.slideshowEl.scrollTo({ left: clamped * window.innerWidth, behavior: 'smooth' });
    }
  }

  /* ── Position tracking ── */

  private themeForSlide(index: number): number {
    if (index === 0 || index === this.slideCount - 1) return 0;
    return PROJECTS[index - 1].theme;
  }

  private setupScrollTracking(): void {
    this.slideshowEl.addEventListener('scroll', () => {
      if (this.scrollRafPending) return;
      this.scrollRafPending = true;
      requestAnimationFrame(() => {
        this.scrollRafPending = false;
        const left = this.slideshowEl.scrollLeft;

        // Gust from scroll velocity (decays in the scene)
        const delta = left - this.lastScrollLeft;
        this.lastScrollLeft = left;
        if (Math.abs(delta) > 2) {
          this.scene.addGust(Math.max(-1.5, Math.min(1.5, -delta * 0.0015)));
        }

        const idx = Math.round(left / window.innerWidth);
        if (idx !== this.currentIndex) {
          this.onSlideChange(idx);
        }

        // Particles track the visible card even mid-scroll
        this.updateCardRect();
        this.updateGhostParallax();
      });
    }, { passive: true });
  }

  private onSlideChange(index: number): void {
    if (this.destroyed) return;
    this.currentIndex = index;
    const isEdge = index === 0 || index === this.slideCount - 1;

    // Live-preview iframes are heavy (some run their own WebGL) — only the
    // current slide keeps one alive.
    const slides = this.slideshowEl.querySelectorAll('.slide');
    this.slideshowEl.querySelectorAll<HTMLElement>('.project-media.previewing').forEach((m) => {
      if (m.closest('.slide') !== slides[index]) this.closePreview(m);
    });

    this.scene.setTheme(this.themeForSlide(index));
    // Project slides always use their theme's bloom (the intro's last line
    // zeroes it, and that must not carry over).
    this.scene.setBloomOverride(null);
    // Title/Contact used to auto-attract, which collapsed the whole field into
    // a tight knot at the attract point (screen centre until the mouse moves).
    // Gathering is opt-in now — the playground's Gather preset.
    this.scene.setAttract(false);
    // Project-card slides gather the field into curl filament lines
    this.scene.setLineMode(!isEdge);
    const wind = isEdge ? [0, 0, 0] : WIND_TABLE[(index - 1) % WIND_TABLE.length];
    this.scene.setWind(wind[0], wind[1], wind[2]);

    this.onIndexChange?.(index);
    this.updateCardRect();
    // Programmatic jumps (deep links, goTo) don't always fire a scroll event
    // before the next paint — sync the ghosts here too.
    this.updateGhostParallax();

    // Debounced hash update
    if (this.hashTimer !== null) window.clearTimeout(this.hashTimer);
    this.hashTimer = window.setTimeout(() => {
      history.replaceState(null, '', '#' + SLUGS[index]);
    }, 150);
  }

  private updateCardRect(): void {
    const slides = this.slideshowEl.querySelectorAll('.slide');
    const slide = slides[this.currentIndex];
    // Only the project cards deflect. Title/Contact are centred copy, and a
    // deflection box around that sits on the middle of the stage — it reads as
    // the field being blown outward from the centre of the screen rather than
    // as flow around anything. Those two slides run the field unaltered.
    const card = slide?.querySelector('.project-card');
    this.scene.setCardRect(card ? card.getBoundingClientRect() : null);
  }

  private handleResize(): void {
    // Keep the current slide snapped when the viewport size changes
    this.slideshowEl.style.scrollBehavior = 'auto';
    this.slideshowEl.scrollLeft = this.currentIndex * window.innerWidth;
    this.slideshowEl.style.scrollBehavior = '';
    this.updateCardRect();
    this.updateGhostParallax();
  }

  /** Ghost titles drift slower than the cards, reading as a layer behind. */
  private updateGhostParallax(): void {
    if (this.reducedMotion) return;
    const left = this.slideshowEl.scrollLeft;
    const w = window.innerWidth;
    this.ghostEls.forEach((el, i) => {
      const offset = (i + 1) * w - left; // ghost i belongs to slide i+1
      el.style.setProperty('--ghost-par', `${(-offset * 0.3).toFixed(1)}px`);
    });
  }

  /* ── Wheel: accumulated-delta with cooldown (trackpad-friendly) ── */

  private setupWheelRedirect(): void {
    let acc = 0;
    let cooldownUntil = 0;
    let lastWheel = 0;

    this.slideshowEl.addEventListener('wheel', (e: WheelEvent) => {
      // Let native horizontal scrolling / snap handle sideways input
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();

      const unit = e.deltaMode === 1 ? 16 : 1; // line-mode (Firefox) → px
      const now = performance.now();

      if (now - lastWheel > 200 || Math.sign(e.deltaY) !== Math.sign(acc)) {
        acc = 0;
      }
      lastWheel = now;
      if (now < cooldownUntil) return;

      acc += e.deltaY * unit;
      if (Math.abs(acc) >= 120) {
        this.goTo(this.currentIndex + Math.sign(acc));
        acc = 0;
        cooldownUntil = now + 400;
      }
    }, { passive: false });
  }

  /* ── Keyboard ── */

  private handleKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

    if (this.gridOverlay) {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.closeGrid();
      }
      return;
    }

    if (e.key === 'Escape') {
      const open = this.slideshowEl.querySelector<HTMLElement>('.project-media.previewing');
      if (open) {
        e.preventDefault();
        this.closePreview(open);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        this.goTo(this.currentIndex + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.goTo(this.currentIndex - 1);
        break;
      case 'Home':
        e.preventDefault();
        this.goTo(0);
        break;
      case 'End':
        e.preventDefault();
        this.goTo(this.slideCount - 1);
        break;
    }
  }

  /* ── View-all grid overlay ── */

  private buildViewAllButton(): void {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'View all projects');
    btn.className = 'view-all-btn fixed bottom-6 left-6 z-20 font-body';
    btn.innerHTML = `
      <span class="va-icon" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      <span>All projects</span>
    `;
    btn.addEventListener('click', () => this.openGrid());
    this.container.appendChild(btn);
    this.viewAllBtn = btn;
  }

  private openGrid(): void {
    if (this.gridOverlay) return;
    this.lastFocused = document.activeElement as HTMLElement | null;

    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'All projects');
    overlay.className =
      'grid-overlay fixed inset-0 z-30 flex flex-col items-center justify-center p-8 overflow-y-auto';

    const close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close project grid');
    close.textContent = '✕';
    close.className =
      'grid-close fixed top-5 right-5 w-10 h-10 rounded-full text-slate-200 border border-slate-600';
    close.addEventListener('click', () => this.closeGrid());
    overlay.appendChild(close);

    const head = document.createElement('div');
    head.className = 'grid-head w-full max-w-4xl flex items-end justify-between gap-4 mb-6';
    head.innerHTML = `
      <h2 class="font-display italic text-4xl md:text-5xl text-slate-100">All Projects</h2>
      <span class="font-body text-xs tracking-widest uppercase text-slate-400 pb-2">${PROJECTS.length} projects</span>
    `;
    overlay.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-2 md:grid-cols-3 gap-4 max-w-4xl w-full';

    PROJECTS.forEach((p, i) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className =
        'grid-tile relative rounded-2xl overflow-hidden border border-white/10 aspect-video text-left' +
        (i + 1 === this.currentIndex ? ' current' : '');
      tile.style.setProperty('--i', String(i));
      tile.setAttribute('aria-label', `Go to ${p.title}`);
      const media = p.image
        ? `<img src="${p.image}" alt="" class="absolute inset-0 w-full h-full object-cover" />`
        : `<div class="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900"></div>`;
      tile.innerHTML = `
        ${media}
        <span class="grid-tile-caption font-body"><em class="font-display italic">0${i + 1}</em>${p.title}</span>
      `;
      tile.addEventListener('click', () => {
        this.closeGrid();
        this.goTo(i + 1);
      });
      grid.appendChild(tile);
    });

    overlay.appendChild(grid);
    // Clicking the dim backdrop (not a tile) closes, like Escape
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeGrid();
    });
    this.container.appendChild(overlay);
    this.gridOverlay = overlay;

    // Two frames so the closed state paints before the transition starts
    requestAnimationFrame(() => {
      requestAnimationFrame(() => overlay.classList.add('open'));
    });

    const firstTile = grid.querySelector<HTMLElement>('button');
    firstTile?.focus();
  }

  private closeGrid(): void {
    const overlay = this.gridOverlay;
    if (!overlay) return;
    this.gridOverlay = null;
    overlay.classList.remove('open');
    overlay.style.pointerEvents = 'none';
    window.setTimeout(() => overlay.remove(), 350);
    this.lastFocused?.focus();
    this.lastFocused = null;
  }

  /* ── Slides ── */

  private createTitleSlide(): HTMLElement {
    const slide = document.createElement('section');
    slide.setAttribute('aria-label', 'Introduction');
    slide.className = 'slide snap-center shrink-0 w-screen h-dvh flex items-center justify-center';

    slide.innerHTML = `
      <div class="slide-copy text-center px-8 max-w-3xl">
        <h2 class="font-display italic text-6xl md:text-8xl text-slate-100 mb-6 slide-title-enter">
          Selected Work
        </h2>
        <p class="font-body text-lg md:text-xl text-slate-400 mb-12">
          A curated collection of projects that excite me
        </p>
        <div class="flex items-center justify-center gap-2 text-slate-500 animate-pulse">
          <span class="font-body text-sm tracking-widest uppercase">Scroll</span>
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
          </svg>
        </div>
      </div>
    `;

    return slide;
  }

  private createProjectSlide(project: Project, index: number): HTMLElement {
    const slide = document.createElement('section');
    slide.setAttribute('aria-label', project.title);
    // overflow-hidden: the ghost title bleeds past the slide edges, and any
    // spill would widen the scroll container.
    slide.className =
      'slide relative overflow-hidden snap-center shrink-0 w-screen h-dvh flex items-center justify-center p-6 md:p-12';

    const css = THEMES[project.theme].css;

    // Huge outline title behind the card; sized so long titles still fit.
    const ghostSize = `min(15vw, ${(170 / project.title.length).toFixed(1)}vw)`;

    const tagsHtml = project.tags
      .map((tag) => `<span class="inline-block px-3 py-1 rounded-full text-xs font-body ${css.tagClass}">${tag}</span>`)
      .join('');

    const linksHtml = `
      <div class="flex gap-4 mt-8 flex-wrap">
        ${project.liveUrl ? `<a href="${project.liveUrl}" target="_blank" rel="noopener" class="px-6 py-2.5 rounded-full text-sm font-body font-medium text-white ${css.buttonClass} transition-colors">View Live</a>` : ''}
        ${project.repoUrl ? `<a href="${project.repoUrl}" target="_blank" rel="noopener" class="px-6 py-2.5 rounded-full text-sm font-body font-medium ${css.textClass} border ${css.borderClass} hover:bg-white/5 transition-colors">Source</a>` : ''}
      </div>
    `;

    // Alternate card layout: even = image left, odd = image right
    const isEven = index % 2 === 0;
    const imageOrder = isEven ? 'order-1' : 'order-1 lg:order-2';
    const textOrder = isEven ? 'order-2' : 'order-2 lg:order-1';

    slide.innerHTML = `
      <div class="ghost-title font-display italic" aria-hidden="true"
           style="--ghost-accent: ${css.accent}; font-size: ${ghostSize}">${project.title}</div>
      <div class="project-card w-full max-w-5xl backdrop-blur-md bg-black/30 border ${css.borderClass} rounded-3xl overflow-hidden shadow-2xl">
        <div class="flex flex-col lg:flex-row">
          <div class="${imageOrder} lg:w-1/2">
            <div class="project-media aspect-video lg:aspect-auto lg:h-full max-h-[58dvh] overflow-hidden relative">
              ${this.createMediaHtml(project)}
            </div>
          </div>
          <div class="${textOrder} lg:w-1/2 p-8 md:p-12 flex flex-col justify-center">
            <div class="flex items-center gap-3 mb-4">
              <span class="font-body text-xs tracking-widest uppercase ${css.textClass} opacity-50">0${index + 1}</span>
              <div class="h-px flex-1 bg-current opacity-10 ${css.textClass}"></div>
            </div>
            <h3 class="font-display italic text-4xl md:text-5xl ${css.textClass} mb-4">${project.title}</h3>
            <p class="font-body text-base md:text-lg text-slate-400 leading-relaxed mb-6">${project.description}</p>
            <div class="flex flex-wrap gap-2 mb-2">${tagsHtml}</div>
            ${linksHtml}
          </div>
        </div>
        <div class="card-glare" aria-hidden="true"></div>
      </div>
    `;

    return slide;
  }

  private createMediaHtml(project: Project): string {
    if (project.video) {
      const id = `video-${slugify(project.title)}`;
      return `
        <video id="${id}" src="${project.video}" muted loop playsinline
               aria-label="${project.title} demo video"
               class="w-full h-full object-cover"></video>
        <div class="video-scrub absolute bottom-0 left-0 right-0 pointer-events-auto"
             data-video-id="${id}">
          <div class="video-scrub-track">
            <div class="video-scrub-progress"></div>
            <div class="video-scrub-thumb"></div>
          </div>
        </div>
      `;
    }

    const previewBtn = project.embed && project.liveUrl
      ? `
        <button type="button" class="live-preview-btn font-body"
                data-url="${project.liveUrl}"
                aria-label="Toggle live preview of ${project.title}">
          <span class="lp-dot" aria-hidden="true"></span>
          <span class="lp-label">Live preview</span>
        </button>
      `
      : '';

    const shots = [project.image, ...(project.images ?? [])].filter(Boolean) as string[];
    if (shots.length > 1) {
      const imgs = shots
        .map(
          (src, i) => `
            <img src="${src}" alt="${project.title} screenshot ${i + 1}"
                 class="gallery-img absolute inset-0 w-full h-full object-cover${i === 0 ? ' is-active' : ''}" />`
        )
        .join('');
      const dots = shots
        .map(
          (_, i) => `
            <button type="button" class="gallery-dot${i === 0 ? ' is-active' : ''}"
                    aria-label="Screenshot ${i + 1} of ${shots.length}"></button>`
        )
        .join('');
      return `
        <div class="media-gallery absolute inset-0">
          ${imgs}
          <div class="gallery-dots">${dots}</div>
        </div>
        ${previewBtn}
      `;
    }

    return `
      <img src="${shots[0] ?? ''}" alt="${project.title} screenshot"
           class="w-full h-full object-cover transition-transform duration-700 hover:scale-105" />
      ${previewBtn}
    `;
  }

  /* ── Screenshot galleries ── */

  private setupGalleries(): void {
    this.slideshowEl.querySelectorAll<HTMLElement>('.media-gallery').forEach((gallery) => {
      const imgs = gallery.querySelectorAll('.gallery-img');
      const dots = gallery.querySelectorAll<HTMLElement>('.gallery-dot');
      dots.forEach((dot, i) => {
        dot.addEventListener('click', () => {
          imgs.forEach((img, j) => img.classList.toggle('is-active', i === j));
          dots.forEach((d, j) => d.classList.toggle('is-active', i === j));
        });
      });
    });
  }

  /* ── Pointer tilt + specular glare ── */

  private setupCardTilt(): void {
    if (this.reducedMotion || window.matchMedia('(hover: none)').matches) return;
    this.slideshowEl.querySelectorAll<HTMLElement>('.project-card').forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        card.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
        card.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
        card.style.setProperty('--ry', `${((x - 0.5) * 4.5).toFixed(2)}deg`);
        card.style.setProperty('--rx', `${((0.5 - y) * 3.5).toFixed(2)}deg`);
      });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });
  }

  /* ── Live preview iframes ── */

  private setupLivePreviews(): void {
    this.slideshowEl.querySelectorAll<HTMLElement>('.live-preview-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const media = btn.closest<HTMLElement>('.project-media');
        if (!media) return;
        if (media.classList.contains('previewing')) {
          this.closePreview(media);
        } else {
          this.openPreview(media, btn);
        }
      });
    });
  }

  private openPreview(media: HTMLElement, btn: HTMLElement): void {
    const frame = document.createElement('iframe');
    frame.src = btn.dataset.url!;
    frame.className = 'live-frame';
    frame.title = 'Live preview';
    frame.setAttribute('referrerpolicy', 'no-referrer');
    media.insertBefore(frame, btn);
    media.classList.add('previewing');
    btn.querySelector('.lp-label')!.textContent = 'Close preview';
    requestAnimationFrame(() => frame.classList.add('on'));
  }

  private closePreview(media: HTMLElement): void {
    media.querySelector('.live-frame')?.remove();
    media.classList.remove('previewing');
    const label = media.querySelector('.live-preview-btn .lp-label');
    if (label) label.textContent = 'Live preview';
  }

  private setupVideoScrubbers(): void {
    const scrubbers = this.slideshowEl.querySelectorAll<HTMLElement>('.video-scrub');
    scrubbers.forEach((scrub) => {
      const videoId = scrub.dataset.videoId!;
      const video = document.getElementById(videoId) as HTMLVideoElement | null;
      if (!video) return;

      const track = scrub.querySelector<HTMLElement>('.video-scrub-track')!;
      const progress = scrub.querySelector<HTMLElement>('.video-scrub-progress')!;
      const thumb = scrub.querySelector<HTMLElement>('.video-scrub-thumb')!;
      let isDragging = false;

      // Auto-play when the video's slide becomes visible
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        });
      }, { root: this.slideshowEl, threshold: 0.5 });
      observer.observe(video.closest('.slide')!);

      video.addEventListener('timeupdate', () => {
        if (isDragging || !video.duration) return;
        const pct = (video.currentTime / video.duration) * 100;
        progress.style.width = `${pct}%`;
        thumb.style.left = `${pct}%`;
      });

      const seek = (e: MouseEvent | Touch) => {
        const rect = track.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        video.currentTime = pct * video.duration;
        progress.style.width = `${pct * 100}%`;
        thumb.style.left = `${pct * 100}%`;
      };

      track.addEventListener('mousedown', (e) => {
        isDragging = true;
        seek(e);
      });
      track.addEventListener('touchstart', (e) => {
        isDragging = true;
        seek(e.touches[0]);
      }, { passive: true });

      window.addEventListener('mousemove', (e) => { if (isDragging) seek(e); }, { signal: this.ac.signal });
      window.addEventListener('touchmove', (e) => { if (isDragging) seek(e.touches[0]); }, { passive: true, signal: this.ac.signal });
      window.addEventListener('mouseup', () => { isDragging = false; }, { signal: this.ac.signal });
      window.addEventListener('touchend', () => { isDragging = false; }, { signal: this.ac.signal });
    });
  }

  private createClosingSlide(): HTMLElement {
    const slide = document.createElement('section');
    slide.setAttribute('aria-label', 'Contact');
    slide.className = 'slide snap-center shrink-0 w-screen h-dvh flex items-center justify-center';

    slide.innerHTML = `
      <div class="slide-copy text-center px-8 max-w-2xl">
        <h2 class="font-display italic text-5xl md:text-7xl text-slate-100 mb-6">
          Let's Talk
        </h2>
        <p class="font-body text-lg text-slate-400 mb-10">
          Always open to interesting conversations and collaborations.
        </p>
        <div class="flex flex-col sm:flex-row gap-4 justify-center">
          <a href="mailto:Darrensu09@gmail.com"
             class="px-8 py-3 rounded-full font-body text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-400 transition-colors">
            Gmail
          </a>
          <a href="https://github.com/stony-su"
             target="_blank" rel="noopener"
             class="px-8 py-3 rounded-full font-body text-sm font-medium text-slate-300 border border-slate-600 hover:bg-white/5 transition-colors">
            GitHub
          </a>
        </div>
      </div>
    `;

    return slide;
  }
}
