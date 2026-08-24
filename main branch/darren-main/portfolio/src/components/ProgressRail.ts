/**
 * Unified bottom timeline: one dot per intro step and per slide, evenly
 * spread, with a track line behind them and an accent progress fill that
 * advances to the active dot. Shared by the intro and the slideshow.
 */
export class ProgressRail {
  private labels: string[];
  private introCount: number;
  private onSelect: (index: number) => void;
  private el: HTMLElement | null = null;
  private buttons: HTMLButtonElement[] = [];
  private activeIndex = 0;

  constructor(labels: string[], introCount: number, onSelect: (index: number) => void) {
    this.labels = labels;
    this.introCount = introCount;
    this.onSelect = onSelect;
  }

  mount(container: HTMLElement): void {
    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', 'Timeline');
    nav.className = 'progress-rail';

    const track = document.createElement('div');
    track.className = 'rail-track';
    nav.appendChild(track);

    const progress = document.createElement('div');
    progress.className = 'rail-progress';
    nav.appendChild(progress);

    const row = document.createElement('div');
    row.className = 'rail-row';

    this.labels.forEach((label, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = i < this.introCount ? 'rail-btn rail-btn-intro' : 'rail-btn';
      btn.setAttribute('aria-label', `Go to ${label}`);
      btn.innerHTML = `<span class="rail-label font-body">${label}</span><span class="rail-dot"></span>`;
      btn.addEventListener('click', () => this.onSelect(i));
      row.appendChild(btn);
      this.buttons.push(btn);
    });

    nav.appendChild(row);
    container.appendChild(nav);
    this.el = nav;
    this.setActive(this.activeIndex);
  }

  setActive(index: number): void {
    this.activeIndex = index;
    this.buttons.forEach((btn, i) => {
      btn.classList.toggle('active', i === index);
      btn.classList.toggle('passed', i < index);
      btn.setAttribute('aria-current', i === index ? 'true' : 'false');
    });
    const frac = this.labels.length > 1 ? index / (this.labels.length - 1) : 0;
    this.el?.style.setProperty('--rail-frac', String(frac));
  }
}
