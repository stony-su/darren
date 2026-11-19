/* ─────────────────────────────────────────────────────────────────────────────
   02 · CURL — particles advected through a divergence-free noise field.
   The potential is a seeded Perlin scalar; velocity is its curl, so the flow
   never clots and never drains. Canvas 2D, additive strokes, decaying trails.
   ───────────────────────────────────────────────────────────────────────────── */
(function () {
  const AA = window.AA;

  class Curl extends AA.Piece {
    setup() {
      this.ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: true });
      if (!this.ctx) throw new Error('Canvas 2D unavailable');
      this.grid = null;
    }

    build() {
      const r = this.rng;
      this.noise = AA.perlin(r.fork());
      this.pal = AA.palette(r);
      this.cfg = {
        offset: [r.range(-50, 50), r.range(-50, 50)],
        detail: r.range(0.3, 0.6),          // weight of the second noise layer
        detailScale: r.range(2.1, 3.1),
        zSpeed: r.range(0.08, 0.2),
        wind: [r.range(-0.25, 0.25), r.range(-0.15, 0.15)],
        tone: r.range(0, 1),                // where on the palette this seed lives
        toneSpread: r.range(0.15, 0.5),     // how much of the palette it spans
        toneAxis: r.range(0, Math.PI * 2),  // spatial direction of the tone gradient
        speedTone: r.range(0.1, 0.35),
        width: r.range(0.9, 1.6),
        lifeMin: 80, lifeMax: r.int(200, 420),
      };
      this.bg = [7, 7, 10];
      // 32 colour buckets, precomputed CSS strings
      this.buckets = [];
      for (let i = 0; i < 32; i++) this.buckets.push(this.pal.css(i / 32, 0.55));
      this._allocParticles(true);
      this._allocGrid();
      this.clearNeeded = true;
      this._fieldReady = false;
      this.z = r.range(0, 100);
    }

    onResize() { this._allocGrid(); this.clearNeeded = true; }
    onParam(k) { if (k === 'particles') this._allocParticles(false); }

    _allocParticles(fresh) {
      const n = Math.floor(this.params.particles);
      const old = this.P;
      const P = (this.P = {
        n,
        x: new Float32Array(n), y: new Float32Array(n),
        px: new Float32Array(n), py: new Float32Array(n),
        life: new Float32Array(n), max: new Float32Array(n),
        tone: new Float32Array(n),
      });
      const keep = !fresh && old ? Math.min(old.n, n) : 0;
      if (keep) {
        for (const k of ['x', 'y', 'px', 'py', 'life', 'max', 'tone']) P[k].set(old[k].subarray(0, keep));
      }
      for (let i = keep; i < n; i++) this._spawn(i, true);
    }

    _spawn(i, randomLife) {
      const P = this.P, r = this.rng, c = this.cfg;
      const x = r.next(), y = r.next();
      P.x[i] = P.px[i] = x; P.y[i] = P.py[i] = y;
      P.max[i] = r.range(c.lifeMin, c.lifeMax);
      P.life[i] = randomLife ? r.range(0, P.max[i]) : 0;
      // tone: gradient across the canvas along a seeded axis + jitter
      const proj = (x - 0.5) * Math.cos(c.toneAxis) + (y - 0.5) * Math.sin(c.toneAxis);
      P.tone[i] = c.tone + proj * c.toneSpread + r.range(-0.03, 0.03);
    }

    _allocGrid() {
      const cols = Math.min(180, Math.max(24, Math.round(this.w / (14 * this.pr))));
      const rows = Math.max(16, Math.round(cols * this.h / this.w));
      this.grid = { cols, rows, phi: new Float32Array((cols + 2) * (rows + 2)), vx: new Float32Array(cols * rows), vy: new Float32Array(cols * rows) };
    }

    _computeField(dt) {
      const g = this.grid, c = this.cfg, noise = this.noise;
      const s = this.params.turbulence;
      const cols = g.cols, rows = g.rows, W = cols + 2;
      this.z += dt * c.zSpeed;
      const z = this.z, ox = c.offset[0], oy = c.offset[1];
      const asp = cols / rows;
      // potential on a grid one cell larger on each side so central differences are cheap
      for (let j = 0; j < rows + 2; j++) {
        const y = ((j - 1) / rows) * s;
        for (let i = 0; i < cols + 2; i++) {
          const x = ((i - 1) / cols) * s * asp;
          let v = noise(x + ox, y + oy, z);
          v += c.detail * noise(x * c.detailScale + 31.7, y * c.detailScale - 17.3, z * 1.6 + 5.0);
          g.phi[j * W + i] = v;
        }
      }
      // curl: v = (dphi/dy, -dphi/dx); scale so typical |v| ~ 1
      const k = 0.5 * s * 0.9;
      const wx = c.wind[0], wy = c.wind[1];
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const p = (j + 1) * W + (i + 1);
          const dx = g.phi[p + 1] - g.phi[p - 1];
          const dy = g.phi[p + W] - g.phi[p - W];
          const o = j * cols + i;
          g.vx[o] = dy * k + wx;
          g.vy[o] = -dx * k + wy;
        }
      }
    }

    render(t, dt) {
      const ctx = this.ctx, P = this.P, g = this.grid, m = this.mouse;
      const w = this.w, h = this.h;
      if (this.clearNeeded) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = `rgb(${this.bg.join(',')})`;
        ctx.fillRect(0, 0, w, h);
        this.clearNeeded = false;
      }
      if (dt <= 0) return;
      // the potential drifts slowly; refreshing it every other frame is invisible and halves the noise cost
      if (!this._fieldReady || (this.frames & 1) === 0) { this._computeField(dt * 2); this._fieldReady = true; }

      // fade
      ctx.globalCompositeOperation = 'source-over';
      const fade = 1 - this.params.persistence;
      ctx.fillStyle = `rgba(${this.bg[0]},${this.bg[1]},${this.bg[2]},${fade.toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);

      // advect
      const cols = g.cols, rows = g.rows;
      const step = this.params.speed * dt * 0.25;    // in normalised units per second
      const mx = m.x, my = 1 - m.y, mActive = m.active;
      const mvx = m.vx, mvy = -m.vy;
      const swirl = 0.9, radius2 = 0.02;
      const speedTone = this.cfg.speedTone;
      const groups = this._groups || (this._groups = Array.from({ length: 32 }, () => []));
      for (let b = 0; b < 32; b++) groups[b].length = 0;

      for (let i = 0; i < P.n; i++) {
        let x = P.x[i], y = P.y[i];
        // bilinear sample of the velocity grid
        const fx = x * cols - 0.5, fy = y * rows - 0.5;
        let ix = Math.floor(fx), iy = Math.floor(fy);
        const tx = fx - ix, ty = fy - iy;
        ix = ix < 0 ? 0 : ix > cols - 2 ? cols - 2 : ix;
        iy = iy < 0 ? 0 : iy > rows - 2 ? rows - 2 : iy;
        const o = iy * cols + ix;
        const a = (1 - tx) * (1 - ty), b = tx * (1 - ty), c = (1 - tx) * ty, d = tx * ty;
        let vx = g.vx[o] * a + g.vx[o + 1] * b + g.vx[o + cols] * c + g.vx[o + cols + 1] * d;
        let vy = g.vy[o] * a + g.vy[o + 1] * b + g.vy[o + cols] * c + g.vy[o + cols + 1] * d;
        if (mActive) {
          const dx = x - mx, dy = y - my;
          const d2 = dx * dx + dy * dy;
          const kk = Math.exp(-d2 / radius2);
          vx += (-dy * swirl + mvx * 12) * kk;
          vy += (dx * swirl + mvy * 12) * kk;
        }
        const sp = Math.sqrt(vx * vx + vy * vy);
        P.px[i] = x; P.py[i] = y;
        x += vx * step; y += vy * step;
        P.x[i] = x; P.y[i] = y;
        P.life[i] += 1;
        if (x < -0.02 || x > 1.02 || y < -0.02 || y > 1.02 || P.life[i] > P.max[i]) {
          this._spawn(i, false);
          continue;
        }
        // fade in/out over life so births and deaths don't pop
        const lf = P.life[i] / P.max[i];
        if (lf < 0.04 || lf > 0.96) continue;
        let tone = P.tone[i] + sp * speedTone;
        tone -= Math.floor(tone);
        groups[(tone * 32) | 0].push(i);
      }

      // draw, additive, one path per colour bucket
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = this.cfg.width * this.pr;
      ctx.lineCap = 'round';
      for (let b = 0; b < 32; b++) {
        const grp = groups[b];
        if (!grp.length) continue;
        ctx.strokeStyle = this.buckets[b];
        ctx.beginPath();
        for (let k = 0; k < grp.length; k++) {
          const i = grp[k];
          ctx.moveTo(P.px[i] * w, P.py[i] * h);
          ctx.lineTo(P.x[i] * w, P.y[i] * h);
        }
        ctx.stroke();
      }
    }

    accent() { const c = this.cfg; return this.pal.accent(c.tone - c.toneSpread * 0.5, c.tone + c.toneSpread * 0.5 + c.speedTone); }
  }

  AA.register({
    id: 'curl',
    num: '02',
    title: 'Curl',
    klass: Curl,
    seed: 23,
    maxPixelRatio: 1.5,
    tagline: 'Divergence-free particle advection',
    blurb: 'Thousands of particles read the curl of a seeded Perlin potential. Because the field has no sources or sinks, the flow never clots. Drag to stir it.',
    tech: 'Canvas 2D · seeded Perlin · additive strokes',
    params: [
      { key: 'particles', label: 'Particles', min: 1000, max: 16000, step: 500, value: 7000 },
      { key: 'turbulence', label: 'Turbulence', min: 0.6, max: 6, step: 0.05, value: 2.2 },
      { key: 'speed', label: 'Speed', min: 0.1, max: 3, step: 0.05, value: 1.0 },
      { key: 'persistence', label: 'Persistence', min: 0.85, max: 0.99, step: 0.005, value: 0.945 },
    ],
  });
})();
