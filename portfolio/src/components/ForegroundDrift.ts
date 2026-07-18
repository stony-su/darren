interface Mote {
  /** Trailing offset along the path (in path-time units behind the head). */
  off: number;
  /** Perpendicular wobble amplitude, px. */
  amp: number;
  /** Radius, px — larger motes read as closer to the lens. */
  size: number;
  phase: number;
  speed: number;
}

interface Streamlet {
  x0: number; y0: number;
  cx: number; cy: number;
  x1: number; y1: number;
  start: number;
  dur: number;
  motes: Mote[];
  color: [number, number, number];
}

/**
 * Foreground depth layer: a transparent 2D canvas above the project card
 * (but below all controls) where small groups of soft accent-tinted motes
 * occasionally drift across the screen. Sitting in front of the DOM card,
 * they sell the illusion that the particle space extends past the UI plane.
 * Kept sparse and low-alpha so text is never obscured for long.
 */
export class ForegroundDrift {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private raf: number | null = null;
  private streamlets: Streamlet[] = [];
  private nextSpawn = 0;
  private onResize = (): void => this.resize();

  mount(container: HTMLElement): void {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;inset:0;z-index:15;pointer-events:none;';
    container.appendChild(canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', this.onResize);

    this.nextSpawn = performance.now() + 2500 + Math.random() * 2500;
    const loop = (): void => {
      this.raf = requestAnimationFrame(loop);
      this.tick();
    };
    loop();
  }

  destroy(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    window.removeEventListener('resize', this.onResize);
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
    this.streamlets = [];
  }

  private resize(): void {
    if (!this.canvas || !this.ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(window.innerWidth * dpr);
    this.canvas.height = Math.round(window.innerHeight * dpr);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Current theme accent, for tinting motes to match the particle field. */
  private accent(): [number, number, number] {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const m = /^#([0-9a-f]{6})$/i.exec(v);
    if (!m) return [165, 180, 252];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  private spawn(now: number): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ltr = Math.random() < 0.5;
    // Paths cross the middle band of the screen — where the card lives
    const y0 = h * (0.28 + Math.random() * 0.44);
    const y1 = h * (0.28 + Math.random() * 0.44);
    const arc = h * (0.12 + Math.random() * 0.22) * (Math.random() < 0.5 ? 1 : -1);

    const motes: Mote[] = [];
    const count = 8 + Math.floor(Math.random() * 6);
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      motes.push({
        off: i * (0.02 + Math.random() * 0.012) + Math.random() * 0.008,
        amp: 5 + Math.random() * 14,
        size: 3.5 + r * r * 10,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 0.9,
      });
    }

    this.streamlets.push({
      x0: ltr ? -70 : w + 70,
      y0,
      cx: w * (0.32 + Math.random() * 0.36),
      cy: Math.min(y0, y1) + arc,
      x1: ltr ? w + 70 : -70,
      y1,
      start: now,
      dur: 8000 + Math.random() * 3500,
      motes,
      color: this.accent(),
    });
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = performance.now();
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    // Sparse by design: at most two groups at once, long quiet gaps
    if (now > this.nextSpawn && this.streamlets.length < 2 && !document.hidden) {
      this.spawn(now);
      this.nextSpawn = now + 9000 + Math.random() * 9000;
    }

    ctx.globalCompositeOperation = 'lighter';

    for (let i = this.streamlets.length - 1; i >= 0; i--) {
      const s = this.streamlets[i];
      const t = (now - s.start) / s.dur;
      let alive = false;
      const [r, g, b] = s.color;

      for (const m of s.motes) {
        // Head leads; each mote trails behind by its offset
        const tp = t * 1.35 - m.off;
        if (tp > 1) continue;
        alive = true;
        if (tp < 0) continue;

        const u = 1 - tp;
        const bx = u * u * s.x0 + 2 * u * tp * s.cx + tp * tp * s.x1;
        const by = u * u * s.y0 + 2 * u * tp * s.cy + tp * tp * s.y1;
        // Perpendicular wobble around the path tangent
        const tx = u * (s.cx - s.x0) + tp * (s.x1 - s.cx);
        const ty = u * (s.cy - s.y0) + tp * (s.y1 - s.cy);
        const len = Math.hypot(tx, ty) || 1;
        const wob = Math.sin(now * 0.001 * m.speed + m.phase) * m.amp;
        const px = bx + (-ty / len) * wob;
        const py = by + (tx / len) * wob;

        const alpha = Math.sin(Math.PI * tp) * 0.34;
        const grad = ctx.createRadialGradient(px, py, 0, px, py, m.size);
        grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, m.size, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!alive) this.streamlets.splice(i, 1);
    }

    ctx.globalCompositeOperation = 'source-over';
  }
}
