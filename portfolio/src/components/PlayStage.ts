import type { Project, StageControl, StageDef, StageVariant } from '../data/projects';
import { PROJECTS } from '../data/projects';

/**
 * The real project, full-screen, on top of the deck.
 *
 * Builds run in a same-origin frame and are spoken to only through
 * /play/_stage/bridge.js; other people's sites run sandboxed. One frame exists
 * at a time and it is destroyed on the way out, because a game left running
 * behind the deck would keep its GPU context and its audio.
 */

export interface PlayStageHooks {
  /** About to cover the page: anything mid-animation should stop now. */
  onOpening: () => void;
  /** Fully covering the page. */
  onCovered: () => void;
  onClosing: () => void;
  /** The visitor stepped to another project from inside the stage. */
  onNavigate: (projectIndex: number) => void;
}

const FADE_MS = 300;
const TEARDOWN_MS = 150;
const SLOW_LOAD_MS = 12000;
const FLIP_MS = 420;

const pad = (n: number): string => String(n).padStart(2, '0');

export class PlayStage {
  private container: HTMLElement;
  private hooks: PlayStageHooks;
  private root: HTMLElement | null = null;
  private body!: HTMLElement;
  private controlsEl!: HTMLElement;
  private hintEl!: HTMLElement;
  private titleEl!: HTMLElement;
  private countEl!: HTMLElement;
  private linkEl!: HTMLAnchorElement;
  private prevBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;
  private loader: HTMLElement | null = null;

  private frame: HTMLIFrameElement | null = null;
  private frameExit: 'tap' | 'hold' = 'tap';
  private projectIndex = -1;
  private opener: HTMLElement | null = null;
  private slowTimer: number | null = null;
  private coverTimer: number | null = null;
  private flipTimer: number | null = null;

  private touch = window.matchMedia('(hover: none)').matches;
  private playable = PROJECTS.flatMap((p, i) => (p.play ? [i] : []));

  constructor(container: HTMLElement, hooks: PlayStageHooks) {
    this.container = container;
    this.hooks = hooks;
  }

  get isOpen(): boolean {
    return this.root !== null;
  }

  open(projectIndex: number, opener: HTMLElement | null): void {
    if (this.root || !PROJECTS[projectIndex]?.play) return;
    this.opener = opener;
    this.hooks.onOpening();
    const root = this.build();
    this.show(projectIndex);

    // The rest of the page leaves the tab order and the accessibility tree.
    Array.from(this.container.children).forEach((el) => {
      if (el !== root) el.setAttribute('inert', '');
    });
    // Focus has to land inside the dialog; a frame takes it over once loaded.
    root.querySelector<HTMLElement>('.ps-close')?.focus({ preventScroll: true });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => root.classList.add('open'));
    });
    this.coverTimer = window.setTimeout(() => {
      this.coverTimer = null;
      document.documentElement.classList.add('stage-open');
      this.hooks.onCovered();
    }, FADE_MS);

    window.addEventListener('message', this.onMessage);
    window.addEventListener('keydown', this.onKey, true);
  }

  close(): void {
    const root = this.root;
    if (!root) return;
    this.root = null;
    if (this.coverTimer !== null) window.clearTimeout(this.coverTimer);
    this.coverTimer = null;

    this.clearContent();
    window.removeEventListener('message', this.onMessage);
    window.removeEventListener('keydown', this.onKey, true);

    Array.from(this.container.children).forEach((el) => el.removeAttribute('inert'));
    document.documentElement.classList.remove('stage-open');
    this.hooks.onClosing();

    root.classList.remove('open');
    root.style.pointerEvents = 'none';
    window.setTimeout(() => root.remove(), FADE_MS);
    this.opener?.focus({ preventScroll: true });
    this.opener = null;
  }

  /* ── Shell ── */

  private build(): HTMLElement {
    const root = document.createElement('div');
    root.className = 'play-stage font-body';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.innerHTML = `
      <header class="ps-bar">
        <div class="ps-id">
          <span class="ps-count"></span>
          <h2 class="ps-title font-display italic"></h2>
        </div>
        <div class="ps-controls" role="toolbar" aria-label="Project controls"></div>
        <div class="ps-actions">
          <a class="ps-link" target="_blank" rel="noopener">Open in new tab <span aria-hidden="true">↗</span></a>
          <button type="button" class="ps-close">Close <span aria-hidden="true">✕</span></button>
        </div>
      </header>
      <div class="ps-body"></div>
      <footer class="ps-foot">
        <button type="button" class="ps-nav ps-prev"></button>
        <p class="ps-hint"></p>
        <button type="button" class="ps-nav ps-next"></button>
      </footer>
    `;
    this.body = root.querySelector('.ps-body')!;
    this.controlsEl = root.querySelector('.ps-controls')!;
    this.hintEl = root.querySelector('.ps-hint')!;
    this.titleEl = root.querySelector('.ps-title')!;
    this.countEl = root.querySelector('.ps-count')!;
    this.linkEl = root.querySelector('.ps-link')!;
    this.prevBtn = root.querySelector('.ps-prev')!;
    this.nextBtn = root.querySelector('.ps-next')!;

    root.querySelector('.ps-close')!.addEventListener('click', () => this.close());
    this.prevBtn.addEventListener('click', () => this.step(-1));
    this.nextBtn.addEventListener('click', () => this.step(1));

    // Stage buttons must not pull focus out of a running game: several of them
    // pause the moment their window blurs.
    root.querySelector('.ps-bar')!.addEventListener('mousedown', (e) => {
      if ((e.target as Element).closest('button')) e.preventDefault();
    });
    root.querySelector('.ps-foot')!.addEventListener('mousedown', (e) => {
      if ((e.target as Element).closest('button')) e.preventDefault();
    });

    this.container.appendChild(root);
    this.root = root;
    return root;
  }

  private step(delta: number): void {
    const at = this.playable.indexOf(this.projectIndex);
    const next = this.playable[(at + delta + this.playable.length) % this.playable.length];
    this.show(next);
    this.hooks.onNavigate(next);
  }

  private neighbour(delta: number): Project {
    const at = this.playable.indexOf(this.projectIndex);
    return PROJECTS[this.playable[(at + delta + this.playable.length) % this.playable.length]];
  }

  /* ── Content ── */

  private show(index: number): void {
    this.clearContent();
    this.projectIndex = index;
    const project = PROJECTS[index];
    const play = project.play as StageDef;

    this.root?.setAttribute('aria-label', `${project.title}, playable`);
    this.titleEl.textContent = project.title;
    this.countEl.textContent = `${pad(index + 1)} / ${pad(PROJECTS.length)}`;
    this.prevBtn.textContent = `‹ ${this.neighbour(-1).title}`;
    this.nextBtn.textContent = `${this.neighbour(1).title} ›`;

    const outbound = play.kind === 'remote' ? play.src : project.liveUrl;
    this.linkEl.hidden = !outbound;
    if (outbound) this.linkEl.href = outbound;

    const filmOnly = this.touch && play.touch === 'film';
    if (filmOnly) {
      this.hintEl.textContent = 'This one needs a keyboard, so here is how it plays. Try it on a desktop.';
      this.showFilm(project.film?.src ?? '', project.film?.poster ?? '', false);
      return;
    }

    this.hintEl.textContent = play.hint;
    switch (play.kind) {
      case 'build':
        this.frameExit = play.exit;
        this.renderControls(play.controls ?? []);
        this.mountFrame(play.src, project, false);
        break;
      case 'remote':
        this.renderControls(play.controls ?? []);
        this.mountFrame(play.src, project, true);
        break;
      case 'phone':
        this.showPhone(play.screens);
        break;
      case 'film':
        this.showFilm(play.src, play.poster, play.portrait === true, play.variants);
        break;
    }
  }

  /** Everything the current project had running, gone. */
  private clearContent(): void {
    this.destroyFrame();
    if (this.slowTimer !== null) window.clearTimeout(this.slowTimer);
    this.slowTimer = null;
    this.stopFlip();
    this.body?.querySelectorAll('video').forEach((v) => {
      v.pause();
      v.removeAttribute('src');
      v.load();
    });
    if (this.body) this.body.textContent = '';
    if (this.controlsEl) this.controlsEl.textContent = '';
    this.loader = null;
  }

  /* ── Frames ── */

  private mountFrame(src: string, project: Project, remote: boolean): void {
    const poster = project.film?.poster || project.image;
    const loader = document.createElement('div');
    loader.className = 'ps-loader';
    if (poster) loader.style.backgroundImage = `url("${poster}")`;
    loader.innerHTML = `<span class="ps-loader-text">Loading ${project.title}</span>`;
    this.body.appendChild(loader);
    this.loader = loader;

    this.createFrame(src, remote, project.title);

    this.slowTimer = window.setTimeout(() => {
      this.slowTimer = null;
      const text = this.loader?.querySelector('.ps-loader-text');
      if (text) text.textContent = 'Still loading. You can also open it in a new tab.';
    }, SLOW_LOAD_MS);
  }

  private createFrame(src: string, remote: boolean, title: string): void {
    const frame = document.createElement('iframe');
    frame.className = 'ps-frame';
    frame.title = title;
    frame.allow = 'autoplay; fullscreen; gamepad';
    if (remote) {
      frame.setAttribute(
        'sandbox',
        'allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock',
      );
      frame.referrerPolicy = 'no-referrer';
    }
    frame.addEventListener('load', () => {
      this.hideLoader();
      // Some games focus themselves while loading. Focusing the frame again
      // would bounce through this page and blur them, and they pause on blur.
      if (document.activeElement !== frame) frame.focus();
    });
    frame.src = src;
    this.body.appendChild(frame);
    this.frame = frame;
  }

  private destroyFrame(): void {
    const frame = this.frame;
    if (!frame) return;
    this.frame = null;
    if (frame.hasAttribute('sandbox')) {
      frame.remove();
      return;
    }
    // The message is delivered asynchronously, so the frame has to outlive it
    // by a moment to close its audio and give its GPU context back.
    this.post(frame, { type: 'teardown' });
    frame.style.visibility = 'hidden';
    window.setTimeout(() => frame.remove(), TEARDOWN_MS);
  }

  private hideLoader(): void {
    if (this.slowTimer !== null) window.clearTimeout(this.slowTimer);
    this.slowTimer = null;
    this.loader?.classList.add('done');
  }

  private post(frame: HTMLIFrameElement, message: Record<string, unknown>): void {
    frame.contentWindow?.postMessage({ ns: 'stage', ...message }, location.origin);
  }

  private onMessage = (e: MessageEvent): void => {
    const frame = this.frame;
    if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
    const data = e.data as { ns?: string; type?: string } | null;
    if (data?.ns !== 'stage') return;
    if (data.type === 'ready') this.post(frame, { type: 'init', exit: this.frameExit });
    else if (data.type === 'exit') this.close();
  };

  private onKey = (e: KeyboardEvent): void => {
    // Only reaches here when focus is on the stage itself; a focused frame
    // keeps its keys and leaves through the bridge.
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    }
  };

  /* ── Controls ── */

  private addButton(label: string, active: boolean, group: string | undefined, run: () => void): void {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ps-control';
    btn.textContent = label;
    if (group) {
      btn.dataset.group = group;
      btn.setAttribute('aria-pressed', String(active));
    }
    btn.addEventListener('click', (e) => {
      if (group) {
        this.controlsEl
          .querySelectorAll<HTMLElement>(`[data-group="${group}"]`)
          .forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      }
      run();
      // detail 0 means the keyboard pressed it: hand the keys back to the game.
      if (e.detail === 0) this.frame?.focus();
    });
    this.controlsEl.appendChild(btn);
  }

  private renderControls(controls: StageControl[]): void {
    for (const control of controls) {
      this.addButton(control.label, control.active === true, control.group, () => {
        const action = control.action;
        if ('load' in action) this.reload(action.load);
        else if (this.frame) this.post(this.frame, { type: 'cmd', cmd: action.cmd, arg: action.arg });
      });
    }
  }

  /** A new element rather than a new src: that would add a history entry. */
  private reload(src: string): void {
    const title = this.frame?.title ?? '';
    this.destroyFrame();
    this.loader?.classList.remove('done');
    this.createFrame(src, false, title);
  }

  /* ── Film ── */

  private showFilm(src: string, poster: string, portrait: boolean, variants?: StageVariant[]): void {
    const wrap = document.createElement('div');
    wrap.className = portrait ? 'ps-film-wrap portrait' : 'ps-film-wrap';

    const video = document.createElement('video');
    video.className = 'ps-film';
    video.controls = true;
    video.muted = true;
    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    if (poster) video.poster = poster;
    video.src = src;
    wrap.appendChild(video);

    const flip = document.createElement('img');
    flip.className = 'ps-flip';
    flip.alt = '';
    flip.hidden = true;
    wrap.appendChild(flip);
    this.body.appendChild(wrap);

    if (!variants?.length) return;

    this.addButton('Trailer', true, 'variant', () => {
      this.stopFlip();
      flip.hidden = true;
      video.hidden = false;
      video.play().catch(() => {});
    });
    for (const variant of variants) {
      this.addButton(variant.label, false, 'variant', () => {
        video.pause();
        video.hidden = true;
        flip.hidden = false;
        flip.alt = `${variant.label} loadout in play`;
        this.playFlip(flip, variant.frames);
      });
    }
  }

  private playFlip(img: HTMLImageElement, frames: string[]): void {
    this.stopFlip();
    // Decode ahead so the first pass doesn't flash through empty frames.
    frames.forEach((src) => {
      new Image().src = src;
    });
    let i = 0;
    img.src = frames[0];
    this.flipTimer = window.setInterval(() => {
      i = (i + 1) % frames.length;
      img.src = frames[i];
    }, FLIP_MS);
  }

  private stopFlip(): void {
    if (this.flipTimer !== null) window.clearInterval(this.flipTimer);
    this.flipTimer = null;
  }

  /* ── Phone ── */

  private showPhone(screens: { src: string; label: string }[]): void {
    const phone = document.createElement('div');
    phone.className = 'ps-phone';
    const screen = document.createElement('div');
    screen.className = 'ps-phone-screen';
    screen.tabIndex = 0;
    screen.setAttribute('aria-label', 'App screen, scrollable');
    const img = document.createElement('img');
    img.alt = screens[0]?.label ?? '';
    if (screens[0]) img.src = screens[0].src;
    screen.appendChild(img);
    phone.appendChild(screen);
    this.body.appendChild(phone);

    screens.forEach((s, i) => {
      this.addButton(s.label, i === 0, 'screen', () => {
        img.src = s.src;
        img.alt = s.label;
        screen.scrollTop = 0;
      });
    });
  }
}
