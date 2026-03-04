import type { Project } from '../data/projects';
import { PROJECTS } from '../data/projects';
import { ParticleScene } from '../animation/scene';

const THEME_TEXT_COLORS = [
  'text-slate-100',
  'text-pink-400',
  'text-emerald-300',
  'text-cyan-200',
  'text-white',
];

const THEME_BORDER_COLORS = [
  'border-indigo-400/30',
  'border-pink-500/30',
  'border-emerald-400/30',
  'border-cyan-400/30',
  'border-blue-200/30',
];

const THEME_TAG_BG = [
  'bg-indigo-500/20 text-indigo-200',
  'bg-pink-500/20 text-pink-200',
  'bg-emerald-500/20 text-emerald-200',
  'bg-cyan-500/20 text-cyan-200',
  'bg-blue-200/20 text-blue-100',
];

const THEME_ACCENT = [
  'bg-indigo-500 hover:bg-indigo-400',
  'bg-pink-500 hover:bg-pink-400',
  'bg-emerald-600 hover:bg-emerald-500',
  'bg-cyan-600 hover:bg-cyan-500',
  'bg-blue-400 hover:bg-blue-300',
];

export class ProjectSlideshow {
  private container: HTMLElement;
  private scene: ParticleScene;
  private slideshowEl!: HTMLElement;

  constructor(container: HTMLElement, scene: ParticleScene) {
    this.container = container;
    this.scene = scene;
  }

  show(): void {
    // Create slideshow wrapper
    this.slideshowEl = document.createElement('div');
    this.slideshowEl.id = 'project-slideshow';
    this.slideshowEl.className =
      'fixed inset-0 z-10 flex overflow-x-auto snap-x snap-mandatory scroll-smooth';
    this.slideshowEl.style.scrollbarWidth = 'none';

    // Title slide
    this.slideshowEl.appendChild(this.createTitleSlide());

    // Project slides
    PROJECTS.forEach((project, i) => {
      this.slideshowEl.appendChild(this.createProjectSlide(project, i));
    });

    // Closing slide
    this.slideshowEl.appendChild(this.createClosingSlide());

    this.container.appendChild(this.slideshowEl);

    // Fade in
    this.slideshowEl.style.opacity = '0';
    this.slideshowEl.style.transition = 'opacity 0.8s ease-in';
    requestAnimationFrame(() => {
      this.slideshowEl.style.opacity = '1';
    });

    // Intersection observer for theme changes
    this.setupThemeObserver();

    // Map vertical scroll (mousewheel / trackpad) to horizontal scroll
    this.setupWheelRedirect();

    // Wire up video scrub bars
    this.setupVideoScrubbers();
  }

  private setupWheelRedirect(): void {
    let isScrolling = false;

    this.slideshowEl.addEventListener('wheel', (e: WheelEvent) => {
      // If user scrolls vertically, navigate to the next/previous slide
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();

        if (isScrolling) return;
        isScrolling = true;

        const slides = this.slideshowEl.querySelectorAll('.slide');
        const slideWidth = window.innerWidth;
        const currentIndex = Math.round(this.slideshowEl.scrollLeft / slideWidth);
        const direction = e.deltaY > 0 ? 1 : -1;
        const nextIndex = Math.max(0, Math.min(slides.length - 1, currentIndex + direction));

        this.slideshowEl.scrollTo({
          left: nextIndex * slideWidth,
          behavior: 'smooth',
        });

        // Debounce to prevent rapid-fire slide changes
        setTimeout(() => {
          isScrolling = false;
        }, 600);
      }
    }, { passive: false });
  }

  private createTitleSlide(): HTMLElement {
    const slide = document.createElement('div');
    slide.className = 'slide snap-center shrink-0 w-screen h-screen flex items-center justify-center';
    slide.setAttribute('data-theme', '0');

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
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
          </svg>
        </div>
      </div>
    `;

    return slide;
  }

  private createProjectSlide(project: Project, index: number): HTMLElement {
    const slide = document.createElement('div');
    slide.className = 'slide snap-center shrink-0 w-screen h-screen flex items-center justify-center p-6 md:p-12';
    slide.setAttribute('data-theme', String(project.theme));

    const textColor = THEME_TEXT_COLORS[project.theme];
    const borderColor = THEME_BORDER_COLORS[project.theme];
    const tagBg = THEME_TAG_BG[project.theme];
    const accent = THEME_ACCENT[project.theme];

    const tagsHtml = project.tags
      .map(tag => `<span class="inline-block px-3 py-1 rounded-full text-xs font-body ${tagBg}">${tag}</span>`)
      .join('');

    const linksHtml = `
      <div class="flex gap-4 mt-8">
        ${project.liveUrl ? `<a href="${project.liveUrl}" target="_blank" class="px-6 py-2.5 rounded-full text-sm font-body font-medium text-white ${accent} transition-colors">View Live</a>` : ''}
        ${project.repoUrl ? `<a href="${project.repoUrl}" target="_blank" class="px-6 py-2.5 rounded-full text-sm font-body font-medium ${textColor} border ${borderColor} hover:bg-white/5 transition-colors">Source</a>` : ''}
      </div>
    `;

    // Alternate card layout: even = image left, odd = image right
    const isEven = index % 2 === 0;
    const imageOrder = isEven ? 'order-1' : 'order-1 lg:order-2';
    const textOrder = isEven ? 'order-2' : 'order-2 lg:order-1';

    slide.innerHTML = `
      <div class="project-card w-full max-w-5xl backdrop-blur-md bg-white/[0.04] border ${borderColor} rounded-3xl overflow-hidden shadow-2xl">
        <div class="flex flex-col lg:flex-row">
          <div class="${imageOrder} lg:w-1/2">
            <div class="aspect-video lg:aspect-auto lg:h-full overflow-hidden relative">
              ${this.createMediaHtml(project)}
            </div>
          </div>
          <div class="${textOrder} lg:w-1/2 p-8 md:p-12 flex flex-col justify-center">
            <div class="flex items-center gap-3 mb-4">
              <span class="font-body text-xs tracking-widest uppercase ${textColor} opacity-50">0${index + 1}</span>
              <div class="h-px flex-1 bg-current opacity-10 ${textColor}"></div>
            </div>
            <h3 class="font-display italic text-4xl md:text-5xl ${textColor} mb-4">${project.title}</h3>
            <p class="font-body text-base md:text-lg text-slate-400 leading-relaxed mb-6">${project.description}</p>
            <div class="flex flex-wrap gap-2 mb-2">${tagsHtml}</div>
            ${linksHtml}
          </div>
        </div>
      </div>
    `;

    return slide;
  }

  private createMediaHtml(project: Project): string {
    if (project.video) {
      const id = `video-${project.title.replace(/\s+/g, '-').toLowerCase()}`;
      return `
        <video id="${id}" src="${project.video}" muted loop playsinline
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
    return `<img src="${project.image}" alt="${project.title}"
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

      // Update progress bar during playback
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
    const slide = document.createElement('div');
    slide.className = 'slide snap-center shrink-0 w-screen h-screen flex items-center justify-center';
    slide.setAttribute('data-theme', '0');

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
             target="_blank"
             class="px-8 py-3 rounded-full font-body text-sm font-medium text-slate-300 border border-slate-600 hover:bg-white/5 transition-colors">
            GitHub
          </a>
        </div>
      </div>
    `;

    return slide;
  }

  private setupThemeObserver(): void {
    const slides = this.slideshowEl.querySelectorAll('.slide');
    const titleSlide = slides[0];
    const closingSlide = slides[slides.length - 1];

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            const theme = parseInt(entry.target.getAttribute('data-theme') || '0');
            this.scene.setColorMode(theme);

            // Only enable attract mode on the title and closing slides
            const isAttractSlide = entry.target === titleSlide || entry.target === closingSlide;
            this.scene.setAttract(isAttractSlide);
          }
        });
      },
      {
        root: this.slideshowEl,
        threshold: 0.5,
      }
    );

    slides.forEach((slide) => observer.observe(slide));
  }
}
