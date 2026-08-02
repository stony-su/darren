import { ParticleScene } from '../animation/scene';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../animation/settings';
import type { PlaygroundSettings, MouseMode, LineMode } from '../animation/settings';

const MOUSE_MODES: MouseMode[] = ['auto', 'attract', 'repel', 'off'];

const MOUSE_MODE_LABELS: Record<MouseMode, string> = {
  auto: 'Auto',
  attract: 'Attract',
  repel: 'Repel',
  off: 'Off',
};

const LINE_MODES: LineMode[] = ['auto', 'on', 'off'];

const LINE_MODE_LABELS: Record<LineMode, string> = {
  auto: 'Auto',
  on: 'Always',
  off: 'Off',
};

/** Sim speed the Gather preset runs at, so the knot forms up in a beat. */
const GATHER_SPEED = 10;

const COUNT_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Auto', value: null },
  { label: '10,000', value: 10000 },
  { label: '25,000', value: 25000 },
  { label: '60,000', value: 60000 },
];

/**
 * Full-height settings sidebar exposing the particle system's controls:
 * speed, noise scale, swirl lines, mouse force, trails, bloom, count, reset.
 * Slides in from the right; the gear button bottom-right toggles it.
 */
export class PlaygroundPanel {
  private scene: ParticleScene;
  private settings: PlaygroundSettings;
  private panel: HTMLElement | null = null;
  private gear: HTMLButtonElement | null = null;
  private open = false;
  private ac = new AbortController();
  /** Speed to hand back when the Gather preset is switched off. */
  private speedBeforeGather = DEFAULT_SETTINGS.speed;

  constructor(scene: ParticleScene) {
    this.scene = scene;
    this.settings = loadSettings();
  }

  mount(container: HTMLElement): void {
    const gear = document.createElement('button');
    gear.type = 'button';
    gear.setAttribute('aria-label', 'Open particle playground settings');
    gear.setAttribute('aria-expanded', 'false');
    gear.textContent = '⚙';
    gear.className =
      'pg-gear fixed bottom-6 right-6 z-20 w-11 h-11 rounded-full text-lg text-slate-200 border border-slate-600 bg-black/30 backdrop-blur-md';
    gear.addEventListener('click', () => this.toggle());
    container.appendChild(gear);
    this.gear = gear;

    const panel = document.createElement('aside');
    panel.className = 'pg-panel fixed top-0 right-0 z-30';
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', 'Particle playground settings');
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

    this.bind();
    this.applyAll();
  }

  destroy(): void {
    this.ac.abort();
    this.gear?.remove();
    this.gear = null;
    this.panel?.remove();
    this.panel = null;
    this.open = false;
  }

  private toggle(): void {
    this.open = !this.open;
    this.panel?.classList.toggle('open', this.open);
    this.gear?.classList.toggle('open', this.open);
    this.gear?.setAttribute('aria-expanded', String(this.open));
  }

  private render(): string {
    const s = this.settings;
    const countSelected = (v: number | null) => (s.count === v ? 'selected' : '');
    return `
      <div class="pg-head">
        <h3 class="pg-heading font-display italic">Playground</h3>
        <button type="button" id="pg-close" class="pg-close" aria-label="Close settings">✕</button>
      </div>
      <p class="pg-sub font-body">Tune the particle field. Changes stick around.</p>

      <div class="pg-section" style="--s: 0">
        <h4 class="pg-section-title font-body">Motion</h4>

        <div class="pg-row">
          <label for="pg-speed" class="font-body">Speed <span class="pg-value" id="pg-speed-value">${s.speed.toFixed(2)}x</span></label>
          <input type="range" id="pg-speed" min="0.1" max="10" step="0.05" value="${s.speed}" />
        </div>

        <div class="pg-row pg-row-inline">
          <span class="font-body" title="Give every particle its own speed, on a bell curve from 0.1x to 10x. Swirl-line filaments each move as one object.">Random speed</span>
          <button type="button" id="pg-random-speed" class="pg-btn font-body">${s.randomSpeed ? 'On' : 'Off'}</button>
        </div>

        <div class="pg-row">
          <label for="pg-noise" class="font-body">Noise scale <span class="pg-value" id="pg-noise-value">${s.noiseSize.toFixed(1)}</span></label>
          <input type="range" id="pg-noise" min="0.3" max="4" step="0.1" value="${s.noiseSize}" />
        </div>

        <div class="pg-row pg-row-inline">
          <span class="font-body" title="Gather particles into long swirling filament lines">Swirl lines</span>
          <button type="button" id="pg-line-mode" class="pg-btn font-body">${LINE_MODE_LABELS[s.lineMode]}</button>
        </div>
      </div>

      <div class="pg-section" style="--s: 1">
        <h4 class="pg-section-title font-body">Presets</h4>

        <div class="pg-row pg-row-inline">
          <span class="font-body" title="Gather the field into a trefoil knot. Runs the sim at 10x so it forms up quickly.">Gather knot</span>
          <button type="button" id="pg-gather" class="pg-btn font-body">${s.gather ? 'On' : 'Off'}</button>
        </div>
      </div>

      <div class="pg-section" style="--s: 2">
        <h4 class="pg-section-title font-body">Interaction</h4>

        <div class="pg-row">
          <label for="pg-mouse-strength" class="font-body">Mouse force <span class="pg-value" id="pg-mouse-strength-value">${s.mouseStrength.toFixed(1)}x</span></label>
          <input type="range" id="pg-mouse-strength" min="0" max="3" step="0.1" value="${s.mouseStrength}" />
        </div>

        <div class="pg-row pg-row-inline">
          <span class="font-body">Mouse mode</span>
          <button type="button" id="pg-mouse-mode" class="pg-btn font-body">${MOUSE_MODE_LABELS[s.mouseMode]}</button>
        </div>
      </div>

      <div class="pg-section" style="--s: 3">
        <h4 class="pg-section-title font-body">Rendering</h4>

        <div class="pg-row">
          <label for="pg-trail" class="font-body">Trails <span class="pg-value" id="pg-trail-value">${s.trailOverride === null ? 'auto' : s.trailOverride.toFixed(2)}</span></label>
          <div class="pg-inline">
            <input type="range" id="pg-trail" min="0" max="0.95" step="0.01" value="${s.trailOverride ?? 0.75}" />
            <button type="button" id="pg-trail-auto" class="pg-btn pg-btn-small font-body">auto</button>
          </div>
        </div>

        <div class="pg-row">
          <label for="pg-bloom" class="font-body">Bloom <span class="pg-value" id="pg-bloom-value">${s.bloomMult.toFixed(2)}x</span></label>
          <input type="range" id="pg-bloom" min="0" max="2" step="0.05" value="${s.bloomMult}" />
        </div>

        <div class="pg-row pg-row-inline">
          <label for="pg-count" class="font-body">Particles</label>
          <select id="pg-count" class="pg-select font-body">
            ${COUNT_OPTIONS.map((o) => `<option value="${o.value ?? 'auto'}" ${countSelected(o.value)}>${o.label}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="pg-footer" style="--s: 4">
        <button type="button" id="pg-reset" class="pg-btn pg-btn-wide font-body">Reset particles</button>
      </div>
    `;
  }

  private q<T extends HTMLElement>(id: string): T {
    return this.panel!.querySelector<T>('#' + id)!;
  }

  /** Set the speed setting and keep the slider + readout in step with it. */
  private setSpeed(v: number): void {
    this.settings.speed = v;
    this.q<HTMLInputElement>('pg-speed').value = String(v);
    this.q('pg-speed-value').textContent = v.toFixed(2) + 'x';
    this.scene.setSpeedMultiplier(v);
  }

  private bind(): void {
    this.q<HTMLButtonElement>('pg-close').addEventListener('click', () => this.toggle());

    const speed = this.q<HTMLInputElement>('pg-speed');
    speed.addEventListener('input', () => {
      this.settings.speed = parseFloat(speed.value);
      this.q('pg-speed-value').textContent = this.settings.speed.toFixed(2) + 'x';
      this.scene.setSpeedMultiplier(this.settings.speed);
      this.persist();
    });

    const randomSpeed = this.q<HTMLButtonElement>('pg-random-speed');
    randomSpeed.addEventListener('click', () => {
      this.settings.randomSpeed = !this.settings.randomSpeed;
      randomSpeed.textContent = this.settings.randomSpeed ? 'On' : 'Off';
      this.scene.setRandomSpeed(this.settings.randomSpeed);
      this.persist();
    });

    const gather = this.q<HTMLButtonElement>('pg-gather');
    gather.addEventListener('click', () => {
      this.settings.gather = !this.settings.gather;
      gather.textContent = this.settings.gather ? 'On' : 'Off';
      if (this.settings.gather) {
        // Remember where the speed slider was, then run the sim hot so the
        // knot assembles in a couple of seconds instead of half a minute.
        this.speedBeforeGather = this.settings.speed;
        this.setSpeed(GATHER_SPEED);
      } else {
        this.setSpeed(this.speedBeforeGather);
      }
      this.scene.setGatherPreset(this.settings.gather);
      this.persist();
    });

    const noise = this.q<HTMLInputElement>('pg-noise');
    noise.addEventListener('input', () => {
      this.settings.noiseSize = parseFloat(noise.value);
      this.q('pg-noise-value').textContent = this.settings.noiseSize.toFixed(1);
      this.scene.setNoiseSize(this.settings.noiseSize);
      this.persist();
    });

    const lineBtn = this.q<HTMLButtonElement>('pg-line-mode');
    lineBtn.addEventListener('click', () => {
      const next = LINE_MODES[(LINE_MODES.indexOf(this.settings.lineMode) + 1) % LINE_MODES.length];
      this.settings.lineMode = next;
      lineBtn.textContent = LINE_MODE_LABELS[next];
      this.scene.setLineModeOverride(next);
      this.persist();
    });

    const strength = this.q<HTMLInputElement>('pg-mouse-strength');
    strength.addEventListener('input', () => {
      this.settings.mouseStrength = parseFloat(strength.value);
      this.q('pg-mouse-strength-value').textContent = this.settings.mouseStrength.toFixed(1) + 'x';
      this.scene.setMouseStrength(this.settings.mouseStrength);
      this.persist();
    });

    const modeBtn = this.q<HTMLButtonElement>('pg-mouse-mode');
    modeBtn.addEventListener('click', () => {
      const next = MOUSE_MODES[(MOUSE_MODES.indexOf(this.settings.mouseMode) + 1) % MOUSE_MODES.length];
      this.settings.mouseMode = next;
      modeBtn.textContent = MOUSE_MODE_LABELS[next];
      this.scene.setMouseMode(next);
      this.persist();
    });

    const trail = this.q<HTMLInputElement>('pg-trail');
    trail.addEventListener('input', () => {
      this.settings.trailOverride = parseFloat(trail.value);
      this.q('pg-trail-value').textContent = this.settings.trailOverride.toFixed(2);
      this.scene.setTrailOverride(this.settings.trailOverride);
      this.persist();
    });

    this.q<HTMLButtonElement>('pg-trail-auto').addEventListener('click', () => {
      this.settings.trailOverride = null;
      this.q('pg-trail-value').textContent = 'auto';
      this.scene.setTrailOverride(null);
      this.persist();
    });

    const bloom = this.q<HTMLInputElement>('pg-bloom');
    bloom.addEventListener('input', () => {
      this.settings.bloomMult = parseFloat(bloom.value);
      this.q('pg-bloom-value').textContent = this.settings.bloomMult.toFixed(2) + 'x';
      this.scene.setBloomMultiplier(this.settings.bloomMult);
      this.persist();
    });

    const count = this.q<HTMLSelectElement>('pg-count');
    count.addEventListener('change', () => {
      const v = count.value === 'auto' ? null : parseInt(count.value, 10);
      this.settings.count = v;
      this.persist();
      this.scene.setParticleCount(v);
    });

    this.q<HTMLButtonElement>('pg-reset').addEventListener('click', () => {
      this.scene.resetParticles();
    });
  }

  /** Push loaded settings into the scene (count is consumed at scene construction). */
  private applyAll(): void {
    const s = this.settings;
    if (s.speed !== DEFAULT_SETTINGS.speed) this.scene.setSpeedMultiplier(s.speed);
    if (s.randomSpeed !== DEFAULT_SETTINGS.randomSpeed) this.scene.setRandomSpeed(s.randomSpeed);
    if (s.gather) this.scene.setGatherPreset(true);
    if (s.noiseSize !== DEFAULT_SETTINGS.noiseSize) this.scene.setNoiseSize(s.noiseSize);
    if (s.mouseMode !== DEFAULT_SETTINGS.mouseMode) this.scene.setMouseMode(s.mouseMode);
    if (s.mouseStrength !== DEFAULT_SETTINGS.mouseStrength) this.scene.setMouseStrength(s.mouseStrength);
    if (s.lineMode !== DEFAULT_SETTINGS.lineMode) this.scene.setLineModeOverride(s.lineMode);
    if (s.trailOverride !== null) this.scene.setTrailOverride(s.trailOverride);
    if (s.bloomMult !== DEFAULT_SETTINGS.bloomMult) this.scene.setBloomMultiplier(s.bloomMult);
  }

  private persist(): void {
    saveSettings(this.settings);
  }
}
