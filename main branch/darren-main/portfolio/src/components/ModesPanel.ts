import { ParticleScene } from '../animation/scene';
import { loadSettings, saveSettings } from '../animation/settings';
import type { PlaygroundSettings } from '../animation/settings';
import { MODES, DEFAULT_MODE, isModeId } from '../animation/modes';
import { PRESETS, findPreset } from '../animation/presets';
import { setPanelOpen, onPanelOpened } from './panelBus';

/**
 * Modes sidebar — the sibling of the Playground panel, one slot to its left.
 *
 * Two lists, and the split between them is the whole idea:
 *   Behaviour — modes. Rewire the physics every particle runs under, and leave
 *               it rewired (modes.ts).
 *   Scenarios — presets. Scripted choreography that plays out the same way
 *               every time, on top of whichever mode is running (presets.ts).
 *
 * Both are single-select, both persist, and both compose with everything in
 * the Playground panel.
 */
export class ModesPanel {
  private scene: ParticleScene;
  private settings: PlaygroundSettings;
  private panel: HTMLElement | null = null;
  private orb: HTMLButtonElement | null = null;
  private open = false;
  private ac = new AbortController();

  constructor(scene: ParticleScene) {
    this.scene = scene;
    this.settings = loadSettings();
    if (!isModeId(this.settings.mode)) this.settings.mode = DEFAULT_MODE;
    if (!findPreset(this.settings.preset)) this.settings.preset = null;
  }

  mount(container: HTMLElement): void {
    const orb = document.createElement('button');
    orb.type = 'button';
    orb.setAttribute('aria-label', 'Open particle modes');
    orb.setAttribute('aria-expanded', 'false');
    orb.textContent = '✦';
    orb.className =
      'pg-gear md-orb fixed bottom-6 z-20 w-11 h-11 rounded-full text-lg text-slate-200 border border-slate-600 bg-black/30 backdrop-blur-md';
    orb.addEventListener('click', () => this.toggle());
    container.appendChild(orb);
    this.orb = orb;

    const panel = document.createElement('aside');
    panel.className = 'pg-panel md-panel fixed top-0 right-0 z-30';
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', 'Particle modes');
    panel.innerHTML = this.render();
    container.appendChild(panel);
    this.panel = panel;

    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape' && this.open) this.toggle();
      },
      { signal: this.ac.signal }
    );

    onPanelOpened('modes', () => this.setOpen(false), this.ac.signal);

    this.bind();
    this.applyAll();
  }

  destroy(): void {
    this.setOpen(false);
    this.ac.abort();
    this.orb?.remove();
    this.orb = null;
    this.panel?.remove();
    this.panel = null;
    // The scene outlives this panel (the intro replays over it), so hand the
    // field back rather than leaving a preset running with no way to stop it.
    this.scene.setPreset(null);
    this.scene.setMode(DEFAULT_MODE);
  }

  private toggle(): void {
    this.setOpen(!this.open);
  }

  private setOpen(open: boolean): void {
    if (open === this.open) return;
    this.open = open;
    this.panel?.classList.toggle('open', open);
    this.orb?.classList.toggle('open', open);
    this.orb?.setAttribute('aria-expanded', String(open));
    setPanelOpen('modes', open);
  }

  private option(kind: 'mode' | 'preset', id: string, label: string, hint: string): string {
    const active = kind === 'mode' ? this.settings.mode === id : this.settings.preset === id;
    return `
      <button type="button" class="md-opt" data-kind="${kind}" data-id="${id}" aria-pressed="${active}">
        <span class="md-opt-dot" aria-hidden="true"></span>
        <span class="md-opt-text">
          <span class="md-opt-name font-body">${label}</span>
          <span class="md-opt-hint font-body">${hint}</span>
        </span>
      </button>`;
  }

  private render(): string {
    return `
      <div class="pg-head">
        <h3 class="pg-heading font-display italic">Modes</h3>
        <button type="button" id="md-close" class="pg-close" aria-label="Close modes">✕</button>
      </div>
      <p class="pg-sub font-body">Rewire the field, or set a scene running.</p>

      <div class="pg-section" style="--s: 0">
        <h4 class="pg-section-title font-body">Behaviour</h4>
        <p class="md-note font-body">How every particle moves, until you change it back.</p>
        ${MODES.map((m) => this.option('mode', m.id, m.label, m.hint)).join('')}
      </div>

      <div class="pg-section" style="--s: 1">
        <h4 class="pg-section-title font-body">Scenarios</h4>
        <p class="md-note font-body">Choreography that plays out on top of the current behaviour.</p>
        ${this.option('preset', 'none', 'None', 'Leave the field to its own devices.')}
        ${PRESETS.map((p) => this.option('preset', p.id, p.label, p.hint)).join('')}
      </div>
    `;
  }

  private bind(): void {
    this.panel!.querySelector<HTMLButtonElement>('#md-close')!.addEventListener('click', () =>
      this.toggle()
    );

    for (const btn of this.panel!.querySelectorAll<HTMLButtonElement>('.md-opt')) {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id!;
        if (btn.dataset.kind === 'mode') {
          this.settings.mode = id;
          this.scene.setMode(id);
        } else {
          this.settings.preset = id === 'none' ? null : id;
          this.scene.setPreset(this.settings.preset);
        }
        this.syncPressed();
        saveSettings(this.settings);
      });
    }
  }

  /** Reflect the current selection on both lists (single-select each). */
  private syncPressed(): void {
    for (const btn of this.panel!.querySelectorAll<HTMLButtonElement>('.md-opt')) {
      const id = btn.dataset.id!;
      const active =
        btn.dataset.kind === 'mode'
          ? this.settings.mode === id
          : (this.settings.preset ?? 'none') === id;
      btn.setAttribute('aria-pressed', String(active));
    }
  }

  /** Push the loaded selection into the scene. */
  private applyAll(): void {
    if (this.settings.mode !== DEFAULT_MODE) this.scene.setMode(this.settings.mode);
    if (this.settings.preset) this.scene.setPreset(this.settings.preset);
    this.syncPressed();
  }
}
