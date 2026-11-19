/**
 * The one owner of every card's picture and film.
 *
 * Fifteen looping videos can't all load, so a card only gets what its distance
 * from the current slide earns it: the slide in view plays, its neighbours have
 * a poster and metadata ready, the next ones out have just the poster, and
 * everything else gives its buffer back.
 *
 * Each pane holds one <video> or <img> for the life of the page. LiquidGlass
 * keeps a reference to that element, so it is only ever re-attributed here,
 * never replaced.
 */

export type MediaBlock = 'glass' | 'stage' | 'grid' | 'hidden';

export function prefersStills(): boolean {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return reduced || conn?.saveData === true;
}

interface Pane {
  video: HTMLVideoElement | null;
  image: HTMLImageElement | null;
}

export class SlideMedia {
  /** Indexed by slide; the title and contact slides have nothing to manage. */
  private panes: (Pane | null)[];
  private current = -1;
  private blocks = new Set<MediaBlock>();
  private stillsOnly = prefersStills();

  constructor(slides: HTMLElement[]) {
    this.panes = slides.map((slide) => {
      const media = slide.querySelector('.project-media');
      if (!media) return null;
      return { video: media.querySelector('video'), image: media.querySelector('img') };
    });
    document.addEventListener('visibilitychange', () => {
      this.block('hidden', document.hidden);
    });
  }

  setCurrent(index: number): void {
    this.current = index;
    this.panes.forEach((pane, i) => {
      if (pane) this.settle(pane, Math.abs(i - index));
    });
    this.applyPlayback();
  }

  /** Stop the film for a reason. It restarts once every reason has cleared. */
  block(reason: MediaBlock, on: boolean): void {
    if (on) this.blocks.add(reason);
    else this.blocks.delete(reason);
    this.applyPlayback();
  }

  private settle(pane: Pane, distance: number): void {
    const { video, image } = pane;
    if (image && distance <= 2 && !image.getAttribute('src')) {
      image.src = image.dataset.src ?? '';
    }
    if (!video) return;

    if (distance <= 2 && !video.getAttribute('poster') && video.dataset.poster) {
      video.poster = video.dataset.poster;
    }

    if (this.stillsOnly) return;
    if (distance <= 1) {
      video.preload = distance === 0 ? 'auto' : 'metadata';
      if (!video.getAttribute('src')) video.src = video.dataset.src ?? '';
    } else if (distance > 2 && video.getAttribute('src')) {
      video.pause();
      video.removeAttribute('src');
      video.load(); // releases the decoder and whatever it had buffered
    }
  }

  private applyPlayback(): void {
    this.panes.forEach((pane, i) => {
      const video = pane?.video;
      if (!video) return;
      const wanted = i === this.current && this.blocks.size === 0 && !this.stillsOnly;
      if (wanted) video.play().catch(() => {});
      else if (!video.paused) video.pause();
    });
  }
}
