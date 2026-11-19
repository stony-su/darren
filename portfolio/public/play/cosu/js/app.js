'use strict';
// ─────────────────────────────────────────────────────────────
// app: layout, modes, menu / results / pause, input, main loop
// ─────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const App = {
  canvas: null, ctx: null, W: 1, H: 1, dpr: 1,
  view: { s: 1, ox: 0, oy: 0, key: 0, dpr: 1 },
  mode: 'menu',                       // menu | play | paused | results
  seed: 1, diffKey: 'normal', styleId: 'plotter', style: MODES[0],
  song: null, maps: {}, palette: PALETTES[0], paper: null,
  plot: new Plot(), field: new Field(), bursts: new Bursts(), cursor: new InkCursor(),
  synth: null, conductor: null, game: null, auto: false,
  mouse: { x: -100, y: -100, touch: false }, cursorPos: [-100, -100],
  prefs: null, preview: { queue: [], i: 0 }, previewCon: null, gallery: { open: false, seeds: [], queue: [] },
  kiaiAmt: 0, energySm: 0.3, dimSm: 0, calmSm: 0, plotAlpha: 1,
  dtSm: 16.7, refreshEst: 16.7, slow: 0, scaleTrial: null, scaleLocked: false, lastFrame: 0, plotScale: 0, lastSec: -1, secT0: 0,

  init() {
    this.canvas = $('stage');
    this.ctx = this.canvas.getContext('2d');
    const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.prefs = Object.assign({ music: 0.8, fx: 0.7, offset: 0, field: calm ? 0.3 : 1, dim: 0.45, effects: calm ? 0.4 : 1, post: true, scale: 1, sens: 1, fade: 2.5, reactive: true, glass: true, finish: true }, loadPref('prefs', {}));
    this.seed = loadPref('seed', Math.floor(Math.random() * 99999) + 1);
    this.diffKey = loadPref('diff', 'normal');
    if (!DIFFS[this.diffKey]) this.diffKey = 'normal';
    this.styleId = modeById(loadPref('style', 'plotter')).id;
    GLX.init($('gl'));
    document.body.classList.toggle('nogl', !GLX.ok);
    this.setCompose(this.prefs.post);
    this.bindUI();
    this.bindInput();
    this.resize(true);
    window.addEventListener('resize', () => this.resize());
    this.loadSeed(this.seed);
    requestAnimationFrame(() => this.frame());
  },

  setCompose(on) {
    GLX.compose = !!on && GLX.ok;
    document.body.classList.toggle('compose', GLX.compose);
  },

  // ── seeds, songs, modes ─────────────────────────────────────
  loadSeed(seed) {
    seed = clamp(Math.floor(Number(seed)) || 1, 1, 9999999);
    this.seed = seed;
    savePref('seed', seed);
    const previewing = !!this.previewCon;
    this.stopPreview(0.12);
    GLX.snapshot();
    this.song = new Song(seed);
    this.maps = {};
    for (const k of Object.keys(DIFFS)) this.maps[k] = buildBeatmap(this.song, k);
    this.applyStyle();
    this.renderMenuInfo();
    this.startPreview();
    GLX.wipe();
    this.markGallery();
    if (previewing) this.togglePreview();           // browsing with the preview on keeps it on
  },

  setStyle(id) {
    GLX.snapshot();
    this.styleId = modeById(id).id;
    savePref('style', this.styleId);
    this.applyStyle();
    GLX.wipe();
    this.renderMenuInfo();
    this.startPreview();
    if (this.gallery.open) this.fillGallery(this.gallery.seeds);     // the covers are printed in the mode's inks
  },

  // ── seed gallery ────────────────────────────────────────────
  // Twelve seeds at a time, each with a cover drawn from its own song: the tempo, key, mode and
  // groove steer a small generative print. Covers are made one a frame so opening it never stalls.
  openGallery() {
    if (this.mode !== 'menu') return;
    this.gallery.open = true;
    $('gallery').hidden = false;
    $('browse').setAttribute('aria-expanded', 'true');
    const base = Math.max(1, this.seed - ((this.seed - 1) % 12));
    this.fillGallery(Array.from({ length: 12 }, (_, i) => base + i));
  },
  closeGallery() {
    if (!this.gallery.open) return;
    this.gallery.open = false;
    this.gallery.queue = [];
    $('gallery').hidden = true;
    $('browse').setAttribute('aria-expanded', 'false');
  },
  fillGallery(seeds) {
    const G = this.gallery, box = $('g-cards');
    G.seeds = seeds; G.queue = [];
    box.textContent = '';
    const run = seeds.every((s, i) => i === 0 || s === seeds[i - 1] + 1);
    $('g-range').textContent = run ? `${seeds[0]} to ${seeds[seeds.length - 1]}` : 'shuffled';
    for (const seed of seeds) {
      const song = seed === this.seed ? this.song : new Song(seed);
      const card = document.createElement('button');
      card.className = 'card'; card.type = 'button'; card.dataset.seed = seed;
      card.setAttribute('aria-pressed', seed === this.seed ? 'true' : 'false');
      const cv = document.createElement('canvas');
      cv.width = 192; cv.height = 192;
      cv.setAttribute('aria-hidden', 'true');
      const line = (cls, text) => { const el = document.createElement('span'); el.className = cls; el.textContent = text; return el; };
      card.append(cv, line('card-title', song.title), line('card-meta', `${song.bpm} BPM · ${song.groove.label}`), line('card-meta', `Seed ${seed}`));
      card.addEventListener('click', () => { if (seed !== this.seed) this.loadSeed(seed); });
      card.addEventListener('dblclick', () => { this.closeGallery(); this.startPlay(false); });
      box.appendChild(card);
      G.queue.push({ song, cv });
    }
  },
  markGallery() {
    if (!this.gallery.open) return;
    if (!this.gallery.seeds.includes(this.seed)) return this.openGallery();       // browsed off the page: turn to the one with this seed
    document.querySelectorAll('.card').forEach(c => c.setAttribute('aria-pressed', Number(c.dataset.seed) === this.seed ? 'true' : 'false'));
  },
  stepGallery() {
    const job = this.gallery.queue.shift();
    if (!job) return;
    const pal = this.paletteFor(job.song.seed), g = job.cv.getContext('2d'), n = job.cv.width;
    const px = GLX.cover(job.song, pal, n);
    if (px === undefined) { this.gallery.queue.unshift(job); return; }       // the cover shader is still compiling
    if (px) { g.putImageData(new ImageData(px, n, n), 0, 0); return; }
    // without WebGL: the seed's first figure, plotted in its pens
    g.fillStyle = pal.paper; g.fillRect(0, 0, n, n);
    g.lineWidth = 1; g.lineJoin = 'round';
    const kinds = FIGURE_KINDS.concat(FRACTAL_KINDS);
    for (let i = 0; i < 3; i++) {
      g.strokeStyle = pal.pens[i]; g.globalAlpha = 0.85;
      strokeFigure(g, figureLines(kinds[hash32(job.song.seed, i) % kinds.length], hash32(job.song.seed, i, 7)), n / 2, n / 2, n * (0.42 - i * 0.1), 0, job.song.seed + i);
    }
  },

  // A mode supplies the background and a family of palettes; the seed picks the palette.
  applyStyle() {
    const st = modeById(this.styleId);
    this.style = st;
    const pal = this.paletteFor(this.seed);
    this.palette = pal;
    const root = document.documentElement.style;
    root.setProperty('--paper', pal.paper);
    root.setProperty('--ink', pal.ink);
    root.setProperty('--grid', pal.grid);
    pal.pens.forEach((c, i) => root.setProperty(`--pen${i + 1}`, c));
    root.colorScheme = pal.dark ? 'dark' : 'light';
    this.plot.palette = pal;
    if (!GLX.ok) this.paper = renderPaper(this.W, this.H, this.dpr, pal, this.seed);
    this.startBackground();
    this.field.setup(this.seed, this.prefs.field);
    FX.reset(this.seed);
  },

  // The palette a seed wears in the current mode.
  paletteFor(seed) {
    const st = modeById(this.styleId), base = st.palettes[hash32(seed, 3) % st.palettes.length];
    return Object.assign({}, base, {
      dark: !!base.dark, busy: GLX.ok && st.id !== 'plotter',
      v: { paper: hexToVec(base.paper), ink: hexToVec(base.ink), grid: hexToVec(base.grid), pens: base.pens.map(hexToVec) },
    });
  },

  startBackground() {
    if (!GLX.ok) return;
    let def = BGMODES[this.style.shader] || BGMODES.flat;
    if (def.needsFloat && !GLX.floatRT) def = BGMODES.flat;
    GLX.setMode(def, this.palette, this.seed);
  },

  perfectRecords(map) {
    const recs = [], R = map.radius, pal = this.palette;
    let last = null;
    for (const o of map.objects) {
      const pen = pal.pens[o.colorIdx % pal.pens.length];
      if (o.type === 'spinner') {
        recs.push({ type: 'spiral', x: 256, y: 192, turns: Math.min(16, o.required), rMax: 150, color: pen, disorder: 0, fseed: o.fseed });
        last = null;
        continue;
      }
      if (last) recs.push({ type: 'link', x1: last[0], y1: last[1], x2: o.x, y2: o.y, color: pal.ink });
      if (o.type === 'slider') {
        recs.push({ type: 'fig', x: o.x, y: o.y, size: R * 1.2, kind: o.figure, fseed: o.fseed, disorder: 0, color: pen });
        recs.push({ type: 'path', pts: o.path, R, color: pen, disorder: 0, fseed: o.fseed });
        recs.push({ type: 'link', x1: o.x, y1: o.y, x2: o.endX, y2: o.endY, color: pal.ink });
      }
      recs.push({ type: 'fig', x: o.endX, y: o.endY, size: o.type === 'slider' ? R * 0.9 : R * 1.35, kind: o.figure, fseed: o.fseed + 1, disorder: 0, color: pen, seed: true });
      last = [o.endX, o.endY];
    }
    return recs;
  },

  startPreview() {
    this.plot.reset(this.palette);
    this.preview.queue = this.perfectRecords(this.maps[this.diffKey]);
    this.preview.i = 0;
  },

  stepPreview() {
    const q = this.preview.queue;
    const n = Math.ceil(q.length / 200);
    let fed = false;
    for (let k = 0; k < n && this.preview.i < q.length; k++) {
      const rec = q[this.preview.i++];
      this.plot.add(rec);
      if (rec.seed && !fed && GLX.ok) {          // the preview also feeds the living backgrounds
        fed = true;
        const [sx, sy] = this.toScreen(rec.x, rec.y);
        GLX.seed(sx, sy, 0.7);
      }
    }
  },

  // ── layout ──────────────────────────────────────────────────
  resize(first) {
    this.W = window.innerWidth; this.H = window.innerHeight;
    const budget = GLX.light ? 2.3e6 : 4.2e6;       // stage pixels; frame time follows this number more than anything else
    this.dpr = clamp(Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(budget / Math.max(1, this.W * this.H))) * this.prefs.scale, 0.5, 2);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.canvas.style.width = this.W + 'px';
    this.canvas.style.height = this.H + 'px';
    this.field.resize(this.W, this.H);
    GLX.resize(this.W, this.H, this.dpr);
    if (!first && !GLX.ok) this.paper = renderPaper(this.W, this.H, this.dpr, this.palette, this.seed);
    this.relayout();
  },

  relayout() {
    const W = this.W, H = this.H;
    let x0 = 0;
    const panelMode = this.mode === 'menu' || this.mode === 'results';
    if (panelMode && W >= 860) {
      const panel = $(this.mode === 'menu' ? 'menu' : 'results');
      x0 = panel.getBoundingClientRect().right + 16;
    }
    const aw = W - x0, ah = H;
    const s = Math.min(aw / 640, ah / 480);
    const ox = x0 + (aw - PF_W * s) / 2;
    const oy = (ah - PF_H * s) / 2 + (panelMode ? 0 : 8 * s);
    this.view = { s, ox, oy, key: this.view.key + 1, dpr: this.dpr };
    const px = s * this.dpr;
    if (Math.abs(px - this.plotScale) > 1e-3) { this.plotScale = px; this.plot.resize(px); }
  },

  toPlayfield(x, y) { const v = this.view; return [(x - v.ox) / v.s, (y - v.oy) / v.s]; },
  toScreen(x, y) { const v = this.view; return [v.ox + x * v.s, v.oy + y * v.s]; },

  // Cursor sensitivity. The game cursor sits `sens` times as far from the centre of the playfield
  // as the mouse does, so a small hand movement can cross the whole field. Touch stays 1:1.
  gameCursor() {
    const m = this.mouse, k = m.touch ? 1 : this.prefs.sens;
    if (k === 1) return [m.x, m.y];
    const [cx, cy] = this.toScreen(256, 192);
    return [clamp(cx + (m.x - cx) * k, 0, this.W), clamp(cy + (m.y - cy) * k, 0, this.H)];
  },

  showPanel(which) {
    $('menu').hidden = which !== 'menu';
    $('results').hidden = which !== 'results';
    $('pause').hidden = which !== 'pause';
    document.body.classList.toggle('playing', which === null);
  },

  // ── play lifecycle ──────────────────────────────────────────
  ensureSynth() {
    if (this.synth) return true;
    try { this.synth = new Synth(); }
    catch (e) { $('play-note').textContent = 'This browser has no Web Audio support, so the song cannot play.'; return false; }
    GLX.listen(this.synth.analyser);
    return true;
  },

  // The menu can play the song's first peak, starting two bars before the drop.
  togglePreview() {
    if (this.previewCon) return this.stopPreview();
    if (this.mode !== 'menu' || !this.ensureSynth()) return;
    this.synth.ctx.resume();
    this.synth.setVolumes(this.prefs.music, this.prefs.fx);
    this.synth.reactive = false;
    this.synth.setMomentum(1);
    const peak = this.song.sections.find(x => x.kiai);
    const con = new Conductor(this.synth, this.song, 60, 0);
    con.onEnd = () => { if (this.previewCon === con) this.stopPreview(); };
    con.start(Math.max(0, peak.startBeat - 8), peak.endBeat);
    this.previewCon = con;
    $('preview').textContent = '■ Stop';
    $('preview').setAttribute('aria-pressed', 'true');
  },
  stopPreview(fade = 0.25) {
    if (!this.previewCon) return;
    this.previewCon.stop(fade);
    this.previewCon = null;
    $('preview').textContent = '▶ Preview';
    $('preview').setAttribute('aria-pressed', 'false');
  },

  startPlay(auto = this.auto) {
    if (!this.ensureSynth()) return;
    this.auto = !!auto;
    this.closeGallery();
    GLX.snapshot();
    this.stopPreview();
    this.synth.ctx.resume();
    this.synth.setVolumes(this.prefs.music, this.prefs.fx);
    if (this.conductor) this.conductor.stop();
    const map = this.maps[this.diffKey];
    this.mode = 'play';
    this.showPanel(null);
    this.relayout();
    this.plot.reset(this.palette);
    this.plot.liveOn = true;
    this.bursts.clear();
    this.field.clear();
    this.startBackground();             // a clean dish: simulations restart so the hits are what seeds them
    FX.reset(this.seed);
    this.lastSec = -1;
    this.game = new Game(this, map, this.palette, { auto: this.auto });
    this.synth.reactive = !!this.prefs.reactive && !this.auto;
    this.synth.setMomentum(this.game.momentum);
    const leadIn = Math.max(1000, map.preempt + 900 - map.objects[0].t);
    this.conductor = new Conductor(this.synth, this.song, leadIn, this.prefs.offset);
    this.conductor.start();
    GLX.wipe();
  },

  pause() {
    if (this.mode !== 'play') return;
    this.mode = 'paused';
    this.conductor.pause();
    this.game.keys.clear();
    this.showPanel('pause');
    $('p-continue').focus();
  },

  resume() {
    if (this.mode !== 'paused') return;
    this.mode = 'play';
    this.showPanel(null);
    this.conductor.resume();
  },

  quitToMenu() {
    GLX.snapshot();
    if (this.conductor) this.conductor.stop(0.4);
    if (this.synth && this.synth.ctx.state === 'suspended') this.synth.ctx.resume();
    this.conductor = null; this.game = null;
    this.plot.liveOn = false;
    this.mode = 'menu';
    this.bursts.clear();
    FX.reset(this.seed);
    this.showPanel('menu');
    this.relayout();
    this.startPreview();
    GLX.wipe();
  },

  // hooks from the game → effects
  onHit(o, j, x, y, pen) {
    const [sx, sy] = this.toScreen(x, y);
    GLX.hit(sx, sy, pen, j === 300 ? 1 : j === 100 ? 0.65 : 0.45);
    if (o.type === 'spinner') FX.onSpinnerDone();
  },
  onTick(x, y, pen) { const [sx, sy] = this.toScreen(x, y); GLX.hit(sx, sy, pen, 0.35); },
  // a held slider feeds the living backgrounds along its path, and the ball throws sparks as it rolls
  onSlide(x, y, pen) { const [sx, sy] = this.toScreen(x, y); GLX.seed(sx, sy, 0.3, pen); GLX.emit(sx, sy, pen, 0.7); },
  onMiss(x, y) { FX.onMiss(); const [sx, sy] = this.toScreen(x, y); GLX.miss(sx, sy); },
  onMomentum(m, hit) {
    if (!this.synth) return;
    this.synth.setMomentum(m);
    this.synth.leadOpen(hit);
    if (!hit) this.synth.muffle();
  },
  onCombo(combo) { FX.onCombo(combo); },

  onGameEnd(failed) {
    const g = this.game;
    GLX.snapshot();
    if (failed) { this.conductor.stop(1.6); FX.onFail(); } else FX.onResults(g.grade);
    this.mode = 'results';
    this.plot.liveOn = false;
    this.plotAlpha = 0.12;
    let maxCombo = 0;
    for (const o of g.objs) maxCombo += o.type === 'slider' ? o.checks.length + 1 : 1;
    $('r-status').textContent = failed ? 'Pen lifted: health ran out' : g.auto ? 'Perfect run, played by the machine' : 'Plot complete';
    $('r-grade').textContent = g.grade;
    $('r-grade').dataset.grade = g.grade;
    $('r-score').textContent = String(g.score).padStart(8, '0');
    $('r-acc').textContent = (g.accuracy * 100).toFixed(2) + '%';
    $('r-combo').textContent = `${g.maxCombo}× / ${maxCombo}×`;
    $('r-300').textContent = g.counts[300];
    $('r-100').textContent = g.counts[100];
    $('r-50').textContent = g.counts[50];
    $('r-miss').textContent = g.counts[0];
    $('r-ur').textContent = g.auto ? '0.0' : g.unstableRate.toFixed(1);
    const m = g.meanError;
    $('r-mean').textContent = g.auto ? 'exact' : g.errors.length ? `${m >= 0 ? '+' : '−'}${Math.abs(m).toFixed(1)} ms ${m >= 0 ? 'late' : 'early'}` : '—';
    $('r-title').textContent = `${this.song.title}, Op. ${this.song.opus}`;
    $('r-sheet').textContent = `${DIFFS[this.diffKey].name} · ${this.maps[this.diffKey].stars.toFixed(1)}★ · ${this.style.name}`;
    $('r-note').textContent = g.auto
      ? 'This is the drawing a perfect run leaves: every figure closed, with only its 1% of disorder. Now try to match it.'
      : 'Perfect hits plot their figure with 1% disorder; late or early hits wander, break and lift the pen. Misses leave a crossed hatch.';
    $('r-retry').textContent = g.auto ? 'Play it' : 'Retry';
    $('r-next').textContent = g.auto ? 'Rewatch' : 'Next seed';
    this.showPanel('results');
    this.relayout();
    GLX.wipe();
    $('r-retry').focus();
  },

  // ── main loop ───────────────────────────────────────────────
  frame() {
    const perf = performance.now();
    const dt = Math.min(0.05, (perf - (this.lastFrame || perf)) / 1000);
    this.lastFrame = perf;
    const inGame = this.game && this.conductor && this.mode !== 'menu';
    const con = inGame ? this.conductor : this.mode === 'menu' ? this.previewCon : null;     // the menu preview drives the visuals too
    let songT = perf, energy = 0.35, secIdx = 0, kiai = false, beats = perf / 500;
    if (con) {
      songT = con.timeMs();
      beats = songT / (this.song.spb * 1000);
      const sec = beats >= 0 ? this.song.sectionAt(beats) : this.song.sections[0];
      energy = sec.energy;
      secIdx = this.song.sections.indexOf(sec);
      kiai = sec.kiai && this.mode !== 'results';
      if (this.mode === 'play' && beats >= 0 && secIdx !== this.lastSec) {
        if (this.lastSec >= 0 || sec.kiai) FX.onSection(sec, this.lastSec >= 0);
        this.lastSec = secIdx;
        this.secT0 = GLX.time;
      }
    }
    const beatPhase = ((beats % 1) + 1) % 1, barPhase = (((beats / 4) % 1) + 1) % 1;

    if (this.mode === 'play') {
      if (!this.game.auto) {
        this.cursorPos = this.gameCursor();
        const [px, py] = this.toPlayfield(this.cursorPos[0], this.cursorPos[1]);
        this.game.cx = px; this.game.cy = py;
        this.cursor.push(this.cursorPos[0], this.cursorPos[1]);
      }
      this.game.update(songT, dt);
      this.plot.fade(perf, this.prefs.fade > 10 ? Infinity : this.prefs.fade);
      if (this.game.auto) {
        this.cursorPos = this.toScreen(this.game.cx, this.game.cy);
        this.cursor.push(this.cursorPos[0], this.cursorPos[1]);
      }
    }
    const live = this.mode === 'play';
    const sp = live ? this.game.activeSpinner : null;
    FX.spin = sp && songT >= sp.t ? { rot: sp.rotDraw, vel: sp.spinVel } : null;

    const pulse = Math.pow(1 - beatPhase, 4) * (con ? (energy >= 0.5 ? 1 : 0.4) : 0.25);
    this.kiaiAmt = lerp(this.kiaiAmt, kiai ? 1 : 0, Math.min(1, dt * 3));
    this.energySm = lerp(this.energySm, energy, Math.min(1, dt * 2));
    const playing = live || this.mode === 'paused';
    const dimTarget = playing ? clamp(this.prefs.dim + (this.style.dim - 0.45), 0, 0.92) : this.mode === 'results' ? 0.5 : 0.22;
    this.dimSm = lerp(this.dimSm, dimTarget, Math.min(1, dt * 2.5));
    this.calmSm = lerp(this.calmSm, playing ? 1 : this.mode === 'results' ? 0.6 : 0, Math.min(1, dt * 2.5));
    const accent = this.currentPen();

    if (this.style.field2d && this.mode !== 'paused') {
      this.field.step(dt, perf, live ? energy : 0.3, live ? pulse : 0, live ? secIdx : 0, this.palette, accent, kiai ? 0.28 : 0.06);
    }
    if (this.mode === 'menu') { this.stepPreview(); this.stepGallery(); }
    this.render(songT, pulse, beatPhase, accent);

    if (GLX.ok) {
      const c = this.toScreen(256, 192);
      GLX.frame({
        dt, paused: this.mode === 'paused', playing: live, beats, beat: beatPhase, bar: barPhase, pulse,
        energy: this.energySm, kiai: this.kiaiAmt, dim: this.dimSm, calm: this.calmSm, combo: this.game ? Math.min(1, this.game.combo / 100) : 0,
        section: secIdx, sectionT: GLX.time - this.secT0, cx: c[0], cy: c[1],
        glow: this.style.glow * (live ? 1 : 0.3), fx: this.prefs.effects, accent: hexToVec(accent), stage: GLX.compose ? this.canvas : null,
        glass: this.glassOn(), finish: this.prefs.finish ? this.style.finish : null,
      });
    }
    this.watchFrameRate(dt, live);
    requestAnimationFrame(() => this.frame());
  },

  // Last resort. The background lowers its own resolution first; if frames still run long with the
  // background at its floor, the stage resolution steps down. Like the background, each step is a
  // trial: if it does not shorten the frames it is undone and not tried again this session.
  watchFrameRate(dt, live) {
    if (!live || dt <= 0) return;
    this.dtSm = this.dtSm * 0.95 + dt * 1000 * 0.05;
    if (this.dtSm < this.refreshEst) this.refreshEst = Math.max(4, this.dtSm);
    if (this.scaleTrial) {
      const t = this.scaleTrial;
      if (--t.wait > 0) return;
      this.scaleTrial = null;
      if (this.dtSm > t.before * 0.93) {
        this.setRenderScale(t.scale);
        this.scaleLocked = true;
        this.refreshEst = this.dtSm;
        if (GLX.ok) GLX.refresh = Math.max(GLX.refresh, this.dtSm);
      }
      return;
    }
    if (this.scaleLocked) return;
    const refresh = GLX.ok ? GLX.refresh : this.refreshEst;
    const floor = GLX.ok && GLX.mode ? GLX.bgScale <= (GLX.mode.def.minScale || 0.3) + 0.01 && !GLX.trial : true;
    this.slow = this.dtSm > refresh * 1.16 && floor ? this.slow + 1 : Math.max(0, this.slow - 2);
    if (this.slow > 140 && this.prefs.scale > 0.6) {
      this.scaleTrial = { before: this.dtSm, scale: this.prefs.scale, wait: 150 };
      this.setRenderScale(Math.max(0.6, Math.round((this.prefs.scale - 0.15) * 20) / 20));
      this.slow = 0;
    }
  },

  setRenderScale(v) {
    this.prefs.scale = v;
    savePref('prefs', this.prefs);
    $('set-scale').value = v;
    $('set-scale-value').textContent = `${Math.round(v * 100)}%`;
    this.resize();
  },

  // Glass notes need the composited path and a float render target; otherwise notes are drawn opaque.
  glassOn() { return GLX.ok && GLX.compose && !!this.prefs.glass && !!GLX.noteT && GLX.noteT.float; },

  currentPen() {
    const g = this.game, pens = this.palette.pens;
    if (g && g.objs[g.first]) return pens[g.objs[g.first].colorIdx % pens.length];
    return pens[0];
  },

  render(songT, pulse, beatPhase, accent) {
    const ctx = this.ctx, pal = this.palette, v = this.view;
    const playing = this.mode === 'play' || this.mode === 'paused';
    pal.glass = this.glassOn();
    pal.gpuSparks = GLX.ok && this.prefs.effects > 0.01;
    GLX.noteClear();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (GLX.ok) ctx.clearRect(0, 0, this.W, this.H);
    else if (this.paper) ctx.drawImage(this.paper, 0, 0, this.W, this.H);
    if (this.style.field2d) ctx.drawImage(this.field.canvas, 0, 0, this.W, this.H);
    const D = DIFFS[this.diffKey];
    const label = `PLOT ${String(this.seed).padStart(5, '0')} · ${this.song.keyName.toUpperCase()} · ${this.song.bpm} BPM · ${D.name.toUpperCase()}`;
    drawGrid(ctx, v, pal, playing ? pulse * 0.6 : 0, label);
    if (playing && !GLX.ok) drawMoire(ctx, v, songT, beatPhase, this.kiaiAmt, pal, accent);   // with WebGL the moiré lives in the paper shader

    ctx.save();
    ctx.globalCompositeOperation = pal.dark ? 'source-over' : 'multiply';
    // While playing you see the live sheet, whose marks fade after they land. The full drawing
    // is kept on the other sheet and develops on screen when the song ends.
    const sheet = [v.ox - PLOT_PAD * v.s, v.oy - PLOT_PAD * v.s, (PF_W + PLOT_PAD * 2) * v.s, (PF_H + PLOT_PAD * 2) * v.s];
    if (playing) {
      const stays = this.prefs.fade > 10;
      ctx.globalAlpha = stays ? (pal.busy ? 0.42 : 0.5) : (pal.busy ? 0.8 : 0.85);
      ctx.drawImage(this.plot.live, ...sheet);
    } else {
      const full = pal.dark ? 0.78 : 1;
      this.plotAlpha = this.mode === 'results' ? lerp(this.plotAlpha, full, 0.03) : full;
      ctx.globalAlpha = this.plotAlpha;
      ctx.drawImage(this.plot.canvas, ...sheet);
    }
    ctx.restore();

    if (playing && this.game) {
      drawObjects(ctx, this.game, songT, v, pal);
      const o0 = this.game.objs[0];
      if (o0 && songT < o0.t - this.game.preempt) {
        ctx.save();
        ctx.globalAlpha = clamp(-songT / 600, 0, 1) * 0.85;
        ctx.fillStyle = pal.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `500 ${Math.round(16 * v.s)}px ${MONO}`;
        haloText(ctx, this.game.auto ? 'watch: this is a perfect run' : 'Z  X  or mouse buttons to hit', v.ox + 256 * v.s, v.oy + 192 * v.s, pal);
        ctx.restore();
      }
    }
    this.bursts.draw(ctx, v, pal);
    if (playing && this.game) drawHUD(ctx, this.game, songT, this.W, this.H, pal);
    if (this.mode === 'play') {
      this.cursor.draw(ctx, this.cursorPos[0], this.cursorPos[1], pal, accent, this.game.holding, this.game.combo);
      if (pal.glass) GLX.note(this.cursorPos[0], this.cursorPos[1], 17, 0.85);      // the cursor is a bead of glass
    }
  },

  // ── DOM ─────────────────────────────────────────────────────
  renderMenuInfo() {
    const s = this.song, map = this.maps[this.diffKey], D = DIFFS[this.diffKey];
    $('seed-input').value = this.seed;
    $('tb-title').textContent = s.title;
    $('tb-opus').textContent = `Op. ${s.opus}`;
    $('tb-key').textContent = s.keyName;
    $('tb-tempo').textContent = `${s.bpm} BPM`;
    $('tb-groove').textContent = s.groove.label;
    const secs = Math.round(map.endTime / 1000);
    $('tb-length').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    $('tb-pens').textContent = this.palette.name;
    document.querySelectorAll('.diff').forEach(b => {
      const k = b.dataset.diff, on = k === this.diffKey;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.querySelector('.stars').textContent = `${this.maps[k].stars.toFixed(1)}★`;
    });
    document.querySelectorAll('.mode').forEach(b => b.setAttribute('aria-checked', b.dataset.mode === this.styleId ? 'true' : 'false'));
    $('mode-note').textContent = GLX.ok || this.styleId === 'plotter' ? this.style.note : `${this.style.note}. The moving background needs WebGL2, which this browser lacks; colours still apply.`;
    let nc = 0, ns = 0, nsp = 0;
    for (const o of map.objects) { if (o.type === 'circle') nc++; else if (o.type === 'slider') ns++; else nsp++; }
    $('diffstats').innerHTML =
      `<span>AR ${D.AR}</span><span>CS ${D.CS}</span><span>OD ${D.OD}</span><span>HP ${D.HP}</span>` +
      `<span class="count">${nc} circles · ${ns} sliders · ${nsp} spinner${nsp === 1 ? '' : 's'}</span>`;
  },

  bindUI() {
    $('seed-input').addEventListener('change', e => this.loadSeed(e.target.value));
    $('prev').addEventListener('click', () => this.loadSeed(this.seed - 1));
    $('next').addEventListener('click', () => this.loadSeed(this.seed + 1));
    $('rand').addEventListener('click', () => this.loadSeed(Math.floor(Math.random() * 999999) + 1));
    document.querySelectorAll('.diff').forEach(b => b.addEventListener('click', () => {
      this.diffKey = b.dataset.diff;
      savePref('diff', this.diffKey);
      this.renderMenuInfo();
      this.startPreview();
    }));
    document.querySelectorAll('.mode').forEach(b => b.addEventListener('click', () => this.setStyle(b.dataset.mode)));
    $('play').addEventListener('click', () => this.startPlay(false));
    $('watch').addEventListener('click', () => this.startPlay(true));
    $('preview').addEventListener('click', () => this.togglePreview());
    $('browse').addEventListener('click', () => (this.gallery.open ? this.closeGallery() : this.openGallery()));
    $('g-close').addEventListener('click', () => this.closeGallery());
    $('g-prev').addEventListener('click', () => { const b = Math.max(1, Math.min(...this.gallery.seeds) - 12); this.fillGallery(Array.from({ length: 12 }, (_, i) => b + i)); });
    $('g-next').addEventListener('click', () => { const b = Math.max(...this.gallery.seeds) + 1; this.fillGallery(Array.from({ length: 12 }, (_, i) => b + i)); });
    $('g-shuffle').addEventListener('click', () => this.fillGallery(Array.from({ length: 12 }, () => Math.floor(Math.random() * 999999) + 1)));
    $('r-retry').addEventListener('click', () => this.startPlay(false));
    $('r-next').addEventListener('click', () => {
      if (this.game && this.game.auto) this.startPlay(true);
      else { this.loadSeed(this.seed + 1); this.quitToMenu(); }
    });
    $('r-menu').addEventListener('click', () => this.quitToMenu());
    $('p-continue').addEventListener('click', () => this.resume());
    $('p-retry').addEventListener('click', () => this.startPlay());
    $('p-quit').addEventListener('click', () => this.quitToMenu());

    const pct = v => `${Math.round(v * 100)}%`;
    const sliders = [
      ['sens', v => `${v.toFixed(2)}×`], ['fade', v => (v > 10 ? 'never' : `${v} s`)],
      ['music', pct], ['fx', pct], ['offset', v => `${v > 0 ? '+' : ''}${v} ms`], ['dim', pct], ['effects', pct], ['scale', pct], ['field', pct],
    ];
    for (const [key, fmt] of sliders) {
      const input = $(`set-${key}`), out = $(`set-${key}-value`);
      input.value = this.prefs[key];
      out.textContent = fmt(Number(this.prefs[key]));
      input.addEventListener('input', () => {
        const v = Number(input.value);
        this.prefs[key] = v;
        out.textContent = fmt(v);
        savePref('prefs', this.prefs);
        if (this.synth) this.synth.setVolumes(this.prefs.music, this.prefs.fx);
        if (key === 'field') { this.field.density = v; this.field.spawnAll(); }
        if (key === 'scale') { this.scaleLocked = false; this.scaleTrial = null; this.resize(); }
      });
    }
    const post = $('set-post');
    post.checked = !!this.prefs.post;
    post.disabled = !GLX.ok;
    post.addEventListener('change', () => { this.prefs.post = post.checked; savePref('prefs', this.prefs); this.setCompose(post.checked); });
    for (const key of ['reactive', 'glass', 'finish']) {
      const box = $(`set-${key}`);
      box.checked = !!this.prefs[key];
      if (key !== 'reactive') box.disabled = !GLX.ok;
      box.addEventListener('change', () => {
        this.prefs[key] = box.checked;
        savePref('prefs', this.prefs);
        if (key === 'reactive' && this.synth && this.game) { this.synth.reactive = box.checked && !this.game.auto; this.synth.setMomentum(this.game.momentum); this.synth.leadOpen(true); }
      });
    }
  },

  bindInput() {
    const c = this.canvas;
    window.addEventListener('mousemove', e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.touch = false; });
    c.addEventListener('mousedown', e => {
      if (this.mode !== 'play') return;
      e.preventDefault();
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.touch = false;
      this.syncCursor();
      this.game.press('M' + e.button, this.conductor.timeMs());
    });
    window.addEventListener('mouseup', e => { if (this.game) this.game.release('M' + e.button); });
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('touchstart', e => {
      if (this.mode !== 'play') return;
      e.preventDefault();
      for (const t of e.changedTouches) {
        this.mouse.x = t.clientX; this.mouse.y = t.clientY; this.mouse.touch = true;
        this.syncCursor();
        this.game.press('T' + t.identifier, this.conductor.timeMs());
      }
    }, { passive: false });
    c.addEventListener('touchmove', e => {
      if (this.mode !== 'play') return;
      e.preventDefault();
      const t = e.changedTouches[0];
      this.mouse.x = t.clientX; this.mouse.y = t.clientY; this.mouse.touch = true;
    }, { passive: false });
    const end = e => { if (this.game) for (const t of e.changedTouches) this.game.release('T' + t.identifier); };
    c.addEventListener('touchend', end);
    c.addEventListener('touchcancel', end);
    window.addEventListener('keydown', e => this.onKey(e, true));
    window.addEventListener('keyup', e => this.onKey(e, false));
    window.addEventListener('blur', () => { if (this.mode === 'play') this.pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'play') this.pause(); });
  },

  syncCursor() {
    if (this.game.auto) return;
    const [gx, gy] = this.gameCursor();
    const [px, py] = this.toPlayfield(gx, gy);
    this.game.cx = px; this.game.cy = py;
  },

  onKey(e, down) {
    const code = e.code;
    if (this.mode === 'play') {
      if (code === 'KeyZ' || code === 'KeyX') {
        e.preventDefault();
        if (!down) this.game.release(code);
        else if (!e.repeat) { this.syncCursor(); this.game.press(code, this.conductor.timeMs()); }
        return;
      }
      if (down && code === 'Escape') { e.preventDefault(); this.pause(); }
      if (down && code === 'Backquote') { e.preventDefault(); this.startPlay(); }
      return;
    }
    if (!down) { if (this.game) this.game.release(code); return; }
    const tag = e.target && e.target.tagName;
    if (this.mode === 'paused') {
      if (code === 'Escape') { e.preventDefault(); this.resume(); }
      else if (code === 'Backquote') { e.preventDefault(); this.startPlay(); }
      return;
    }
    if (this.mode === 'results') {
      if (code === 'Enter' || code === 'Backquote') { e.preventDefault(); this.startPlay(false); }
      else if (code === 'Escape') { e.preventDefault(); this.quitToMenu(); }
      return;
    }
    if (this.mode === 'menu') {
      if (tag === 'INPUT' && e.target.type === 'number') return;
      if (code === 'Enter') { e.preventDefault(); this.startPlay(false); }
      else if (code === 'KeyA') { e.preventDefault(); this.startPlay(true); }
      else if (code === 'KeyP') { e.preventDefault(); this.togglePreview(); }
      else if (code === 'KeyG') { e.preventDefault(); if (this.gallery.open) this.closeGallery(); else this.openGallery(); }
      else if (code === 'Escape' && this.gallery.open) { e.preventDefault(); this.closeGallery(); }
      else if (tag === 'INPUT' && e.target.type === 'range') return;
      else if (code === 'ArrowRight') { e.preventDefault(); this.loadSeed(this.seed + 1); }
      else if (code === 'ArrowLeft') { e.preventDefault(); this.loadSeed(this.seed - 1); }
    }
  },
};

const boot = () => App.init();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
