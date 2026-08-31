import type { Project } from '../data/projects';
import { PROJECTS } from '../data/projects';
import { ParticleScene } from '../animation/scene';
import { THEMES } from '../theme/themes';
import { ProgressRail } from './ProgressRail';
import { PagePinwheel } from './PagePinwheel';

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
  private slideshowEl!: HTMLElement;
  private rail: ProgressRail | null = null;
  private gridOverlay: HTMLElement | null = null;
  private lastFocused: HTMLElement | null = null;
  private currentIndex = 0;
  private lastScrollLeft = 0;
  private ghostEls: HTMLElement[] = [];
  private fans: PagePinwheel[] = [];
  private openFan: PagePinwheel | null = null;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private scrollRafPending = false;
  private hashTimer: number | null = null;
  private boundKeyHandler: (e: KeyboardEvent) => void;
  private boundResizeHandler: () => void;

  constructor(container: HTMLElement, scene: ParticleScene) {
    this.container = container;
    this.scene = scene;
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

    this.buildRail();
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
    this.setupCaseStudies();
    this.setupCardTilt();
    this.setupPageFans();

    window.addEventListener('keydown', this.boundKeyHandler);
    window.addEventListener('resize', this.boundResizeHandler);

    // Watch performance once the steady-state view is up
    this.scene.startPerfWatch();
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
    this.currentIndex = index;
    const isEdge = index === 0 || index === this.slideCount - 1;

    // Scrolling away from a hovered card leaves no pointerleave behind.
    this.closeFan();
    // Build the incoming card's deck now so the first hover is instant.
    if (!isEdge) this.fans[index - 1]?.build();

    this.scene.setTheme(this.themeForSlide(index));
    this.scene.setAttract(isEdge);
    // Only the centred copy slides (Work / Contact) hold the middle clear. The
    // project slides put a card there, and its own deflection does that job.
    this.scene.setCenterExclusion(isEdge);
    const wind = isEdge ? [0, 0, 0] : WIND_TABLE[(index - 1) % WIND_TABLE.length];
    this.scene.setWind(wind[0], wind[1], wind[2]);

    this.updateRail();
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
    const card = slide?.querySelector('.project-card');
    this.scene.setCardRect(card ? card.getBoundingClientRect() : null);
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

  /* ── Hover deck: page pinwheel on the card image ── */

  /**
   * Hovering a card's image spins a deck of page screenshots out of it. The
   * deck opens from the image but spreads across the whole card, so it closes
   * on leaving the *card* — otherwise it would collapse the moment the pointer
   * drifted off the image to look at a panel.
   */
  private setupPageFans(): void {
    if (this.reducedMotion || window.matchMedia('(hover: none)').matches) return;

    const slides = this.slideshowEl.querySelectorAll<HTMLElement>('.slide');
    PROJECTS.forEach((project, i) => {
      const card = slides[i + 1]?.querySelector<HTMLElement>('.project-card');
      const media = card?.querySelector<HTMLElement>('.project-media');
      if (!card || !media) return;

      const fan = new PagePinwheel(card, media, project);
      this.fans[i] = fan;

      media.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'touch') return;
        this.openFanFor(fan);
      });
      card.addEventListener('pointerleave', () => {
        if (this.openFan === fan) this.closeFan();
      });
    });
  }

  private openFanFor(fan: PagePinwheel): void {
    if (this.openFan === fan) return;
    this.openFan?.setOpen(false);
    this.openFan = fan;
    fan.setOpen(true);
    // Fanned panels are the thing to read — drop the field into slow motion so
    // the background stops competing for the eye.
    this.scene.setTimeScale(0.22);
  }

  private closeFan(): void {
    if (!this.openFan) return;
    this.openFan.setOpen(false);
    this.openFan = null;
    this.scene.setTimeScale(1);
  }

  private handleResize(): void {
    // Keep the current slide snapped when the viewport size changes
    this.slideshowEl.style.scrollBehavior = 'auto';
    this.slideshowEl.scrollLeft = this.currentIndex * window.innerWidth;
    this.slideshowEl.style.scrollBehavior = '';
    this.updateCardRect();
    this.closeFan();
    this.fans.forEach((fan) => fan.refit());
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

  /* ── Progress rail ── */

  private buildRail(): void {
    // One dot per slide. `introCount` is 0 here: this branch's intro is its own
    // scroll sequence and doesn't share the timeline.
    const labels = ['Work', ...PROJECTS.map((p) => p.title), 'Contact'];
    this.rail = new ProgressRail(labels, 0, (i) => this.goTo(i));
    this.rail.mount(this.container);
    this.updateRail();
  }

  private updateRail(): void {
    this.rail?.setActive(this.currentIndex);
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
      <div class="text-center px-8 max-w-3xl">
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
        ${project.caseStudy ? `
        <button type="button" class="case-study-toggle px-6 py-2.5 rounded-full text-sm font-body font-medium ${css.textClass} border ${css.borderClass} hover:bg-white/5 transition-colors" aria-expanded="false">
          Case study <span class="case-study-chevron inline-block transition-transform" aria-hidden="true">▾</span>
        </button>` : ''}
      </div>
    `;

    const caseStudyHtml = project.caseStudy
      ? `
      <div class="case-study-panel" hidden>
        <div class="pt-6 mt-6 border-t ${css.borderClass} space-y-4">
          <div>
            <h4 class="font-body text-xs tracking-widest uppercase ${css.textClass} opacity-60 mb-1">What I built</h4>
            <p class="font-body text-sm text-slate-400 leading-relaxed">${project.caseStudy.built}</p>
          </div>
          <div>
            <h4 class="font-body text-xs tracking-widest uppercase ${css.textClass} opacity-60 mb-1">What was hard</h4>
            <p class="font-body text-sm text-slate-400 leading-relaxed">${project.caseStudy.challenge}</p>
          </div>
          <div>
            <h4 class="font-body text-xs tracking-widest uppercase ${css.textClass} opacity-60 mb-1">Outcome</h4>
            <p class="font-body text-sm text-slate-400 leading-relaxed">${project.caseStudy.outcome}</p>
          </div>
        </div>
      </div>`
      : '';

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
          <div class="card-copy ${textOrder} lg:w-1/2 p-8 md:p-12 flex flex-col justify-center">
            <div class="flex items-center gap-3 mb-4">
              <span class="font-body text-xs tracking-widest uppercase ${css.textClass} opacity-50">0${index + 1}</span>
              <div class="h-px flex-1 bg-current opacity-10 ${css.textClass}"></div>
            </div>
            <h3 class="font-display italic text-4xl md:text-5xl ${css.textClass} mb-4">${project.title}</h3>
            <p class="font-body text-base md:text-lg text-slate-400 leading-relaxed mb-6">${project.description}</p>
            <div class="flex flex-wrap gap-2 mb-2">${tagsHtml}</div>
            ${linksHtml}
            ${caseStudyHtml}
          </div>
        </div>
        <div class="card-glare" aria-hidden="true"></div>
      </div>
    `;

    return slide;
  }

  private setupCaseStudies(): void {
    const toggles = this.slideshowEl.querySelectorAll<HTMLButtonElement>('.case-study-toggle');
    toggles.forEach((toggle) => {
      toggle.addEventListener('click', () => {
        const card = toggle.closest('.project-card') as HTMLElement | null;
        const panel = card?.querySelector<HTMLElement>('.case-study-panel');
        const chevron = toggle.querySelector<HTMLElement>('.case-study-chevron');
        if (!panel || !card) return;

        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!expanded));
        panel.hidden = expanded;
        if (chevron) chevron.style.transform = expanded ? '' : 'rotate(180deg)';
        // Tall content scrolls inside the card instead of overflowing the slide
        card.classList.toggle('max-h-[86dvh]', !expanded);
        card.classList.toggle('overflow-y-auto', !expanded);
        // Card size changed — refresh the particle deflection rect
        requestAnimationFrame(() => this.updateCardRect());
      });
    });
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
    return `<img src="${project.image ?? ''}" alt="${project.title} screenshot"
                 class="w-full h-full object-cover transition-transform duration-700 hover:scale-105" />`;
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

      window.addEventListener('mousemove', (e) => { if (isDragging) seek(e); });
      window.addEventListener('touchmove', (e) => { if (isDragging) seek(e.touches[0]); }, { passive: true });
      window.addEventListener('mouseup', () => { isDragging = false; });
      window.addEventListener('touchend', () => { isDragging = false; });
    });
  }

  private createClosingSlide(): HTMLElement {
    const slide = document.createElement('section');
    slide.setAttribute('aria-label', 'Contact');
    slide.className = 'slide snap-center shrink-0 w-screen h-dvh flex items-center justify-center';

    slide.innerHTML = `
      <div class="text-center px-8 max-w-2xl">
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
