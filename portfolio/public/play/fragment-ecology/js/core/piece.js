/* ─────────────────────────────────────────────────────────────────────────────
   FRAGMENT ECOLOGY · core/piece.js
   Base class every artwork extends, plus the registry the site is built from.

   A Piece owns: a canvas, a seed, a param table, a pointer state and a
   requestAnimationFrame loop that only runs while the piece is on screen.

   Subclass contract:
     setup()          once, after the canvas exists (create GL context etc.)
     build()          rebuild all seeded state from this.rng   (seed changed)
     render(t, dt)    draw one frame
     onResize(w, h)   canvas size changed (in device pixels)
     onParam(k, v)    a live parameter changed
     accent()         return a CSS colour for the UI to adopt
   ───────────────────────────────────────────────────────────────────────────── */
(function () {
  const AA = (window.AA = window.AA || {});

  class Piece {
    constructor(def, canvas, host) {
      this.def = def;
      this.canvas = canvas;
      this.host = host || canvas.parentElement;
      this.params = {};
      this.defaults = {};
      for (const p of def.params || []) { this.params[p.key] = p.value; this.defaults[p.key] = p.value; }
      this.seed = def.seed || 1;
      this.rng = AA.rng(this.seed);
      this.time = 0;
      this.frames = 0;
      this.running = false;
      this.paused = false;
      this.visible = false;
      this.w = 1; this.h = 1;
      this.pr = Math.min(window.devicePixelRatio || 1, def.maxPixelRatio || 1.5);
      this.mouse = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, down: false, active: false, vx: 0, vy: 0 };
      this.listeners = {};
      this._loop = this._loop.bind(this);
      this._last = 0;
      this._fps = 60; this._fpsAcc = 0; this._fpsN = 0;
      this.ok = true;
    }

    /* ── lifecycle ── */
    mount() {
      try {
        this.setup();
      } catch (e) {
        console.error(`[${this.def.id}] setup failed`, e);
        this.ok = false;
        this.emit('error', e);
        return this;
      }
      this._bindPointer();
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(this.canvas);
      this.resize();
      this.reseed();
      return this;
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width * this.pr));
      const h = Math.max(1, Math.round(r.height * this.pr));
      if (w === this.w && h === this.h && this.canvas.width === w) return;
      this.w = w; this.h = h;
      this.canvas.width = w; this.canvas.height = h;
      if (this.ok) {
        try { this.onResize(w, h); } catch (e) { console.error(`[${this.def.id}] resize failed`, e); }
      }
    }

    reseed() {
      if (!this.ok) return;
      this.rng = AA.rng(this.seed);
      this.time = 0;
      this.frames = 0;
      try { this.build(); } catch (e) { console.error(`[${this.def.id}] build failed`, e); this.ok = false; this.emit('error', e); return; }
      this.emit('seed', this.seed);
      this.emit('accent', this.accent());
    }

    setSeed(s) {
      s = Math.max(1, Math.min(999999, Math.floor(Number(s) || 1)));
      this.seed = s;
      this.reseed();
    }
    nextSeed() { this.setSeed(this.seed >= 999999 ? 1 : this.seed + 1); }
    prevSeed() { this.setSeed(this.seed <= 1 ? 999999 : this.seed - 1); }
    randomSeed() { this.setSeed(1 + Math.floor(Math.random() * 999999)); }

    setParam(key, value) {
      const p = (this.def.params || []).find((q) => q.key === key);
      if (!p) return;
      value = Number(value);
      this.params[key] = value;
      if (p.live === false) this.reseed();
      else if (this.ok) { try { this.onParam(key, value); } catch (e) { console.error(e); } }
      this.emit('param', { key, value });
    }

    resetParams() {
      for (const k in this.defaults) this.params[k] = this.defaults[k];
      this.reseed();
      this.emit('params', this.params);
    }

    /* ── run loop ── */
    start() {
      if (this.running || !this.ok) return;
      this.running = true;
      this._last = performance.now();
      requestAnimationFrame(this._loop);
    }
    stop() { this.running = false; }
    togglePause() { this.paused = !this.paused; this.emit('pause', this.paused); }

    _loop(now) {
      if (!this.running) return;
      let dt = (now - this._last) / 1000;
      this._last = now;
      if (dt > 0.1) dt = 0.1;              // tab was hidden: don't explode simulations
      this._fpsAcc += dt; this._fpsN++;
      if (this._fpsAcc > 0.5) { this._fps = this._fpsN / this._fpsAcc; this._fpsAcc = 0; this._fpsN = 0; this.emit('fps', this._fps); }
      // adaptive resolution: shader-bound pieces drop internal resolution when the GPU can't keep up
      if (this.def.adaptive !== false && this.time > 2 && this._fps < 30 && this.pr > 0.5 && now - (this._lastAdapt || 0) > 2500) {
        this.pr = Math.max(0.5, this.pr * 0.8);
        this._lastAdapt = now;
        this.w = -1; this.resize();
        this.emit('adapt', this.pr);
      }
      if (!this.paused) {
        this.time += dt;
        this.frames++;
        try { this.render(this.time, dt); }
        catch (e) { console.error(`[${this.def.id}] render failed`, e); this.ok = false; this.running = false; this.emit('error', e); return; }
      }
      this._decayMouse(dt);
      requestAnimationFrame(this._loop);
    }

    /* ── pointer ── */
    _bindPointer() {
      const el = this.host;
      const m = this.mouse;
      const upd = (e) => {
        const r = this.canvas.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width;
        const ny = 1 - (e.clientY - r.top) / r.height;
        m.vx = (nx - m.x); m.vy = (ny - m.y);
        m.px = m.x; m.py = m.y;
        m.x = nx; m.y = ny;
        m.active = true;
      };
      el.addEventListener('pointermove', upd, { passive: true });
      el.addEventListener('pointerdown', (e) => { if (e.target.closest('.hud')) return; m.down = true; upd(e); }, { passive: true });
      window.addEventListener('pointerup', () => { m.down = false; }, { passive: true });
      el.addEventListener('pointerleave', () => { m.active = false; m.down = false; }, { passive: true });
    }
    _decayMouse(dt) { const k = Math.exp(-dt * 8); this.mouse.vx *= k; this.mouse.vy *= k; }

    /* ── export ── */
    snapshot() {
      if (!this.ok) return;
      // render synchronously then read before the compositor swaps buffers
      try { this.render(this.time, 0); } catch (e) { /* ignore */ }
      const a = document.createElement('a');
      a.download = `fragment-ecology_${this.def.id}_seed-${this.seed}.png`;
      a.href = this.canvas.toDataURL('image/png');
      a.click();
    }

    /* ── events ── */
    on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); return this; }
    emit(ev, data) { (this.listeners[ev] || []).forEach((f) => f(data)); }

    /* ── subclass hooks ── */
    setup() {}
    build() {}
    render() {}
    onResize() {}
    onParam() {}
    accent() { return '#ffffff'; }
    dispose() { this.stop(); if (this._ro) this._ro.disconnect(); }

    /* ── helpers ── */
    aspect() { return this.w / this.h; }
    fps() { return this._fps; }
  }

  /* ── Registry ── */
  const registry = [];
  function register(def) {
    if (!def.id || !def.klass) throw new Error('register needs id + klass');
    registry.push(def);
    return def;
  }

  AA.Piece = Piece;
  AA.register = register;
  AA.registry = registry;
})();
