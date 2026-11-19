'use strict';
// ─────────────────────────────────────────────────────────────
// game: input, judgement, scoring, health — and every judgement
// becomes a mark on the plot. Also the auto-player.
// ─────────────────────────────────────────────────────────────

class Game {
  constructor(app, map, palette, opts = {}) {
    this.app = app; this.map = map; this.pal = palette;
    this.auto = !!opts.auto;
    this.objs = map.objects.map(o => Object.assign({}, o, {
      done: false, headDone: false, headHit: false, tracking: false, nextCheck: 0, hitChecks: 0,
      rot: 0, rotDraw: 0, lastAng: null, spinVel: 0, lastFull: 0, bonus: 0, ballX: o.x, ballY: o.y, snd: false,
    }));
    const D = map.diff;
    this.R = map.radius; this.w = map.windows; this.preempt = map.preempt;
    this.diffMult = Math.round(((D.HP + D.CS + D.OD) / 38) * 5 + 1);
    this.drain = 0.008 + D.HP * 0.0045;
    this.score = 0; this.shownScore = 0;
    this.combo = 0; this.maxCombo = 0; this.comboT = 0;
    this.counts = { 300: 0, 100: 0, 50: 0, 0: 0 };
    this.health = 1;
    this.errors = []; this.recentErrors = [];
    this.first = 0;
    this.keys = new Set();
    this.cx = 256; this.cy = 192;
    this.lastHit = null;
    this.state = 'playing';
    this.endAt = null;
    this.autoFrom = { x: 256, y: 192, t: -Infinity };
    this.autoTapUntil = 0;
    this.momentum = this.auto ? 1 : 0.45;    // how much of the arrangement the player has earned (see Synth.setMomentum)
  }

  get holding() { return this.keys.size > 0; }

  // The music follows the play: hits fill the arrangement in, a miss thins it out and takes the melody away.
  feed(amount) { this.momentum = Math.min(1, this.momentum + amount); this.app.onMomentum(this.momentum, true); }
  starve(keep = 0.4) { this.momentum *= keep; this.app.onMomentum(this.momentum, false); }
  pen(o) { return this.pal.pens[o.colorIdx % this.pal.pens.length]; }

  press(id, now) {
    if (this.auto || this.keys.has(id)) return;
    this.keys.add(id);
    if (this.state === 'playing') this.tryHit(now);
  }
  release(id) { this.keys.delete(id); }

  tryHit(now) {
    for (let i = this.first; i < this.objs.length; i++) {
      const o = this.objs[i];
      if (o.t - this.preempt > now) break;
      if (o.type === 'spinner' || o.headDone) continue;
      const err = now - o.t;
      if (err > this.w.w50) continue;
      if (dist(this.cx, this.cy, o.x, o.y) > this.R) continue;
      if (err < -400) return;
      if (err < -this.w.w50) { this.headResult(o, 0, null, now); return; }
      const a = Math.abs(err);
      this.headResult(o, a <= this.w.w300 ? 300 : a <= this.w.w100 ? 100 : 50, err, now);
      return;
    }
  }

  addCombo() {
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.comboT = performance.now();
    if (this.combo % 25 === 0) this.app.onCombo(this.combo);
  }

  tapSound(o) {
    if (!o.snd) this.app.synth.hit(o.newCombo && o.kiai ? 'finish' : 'normal', o.midi);
  }

  headResult(o, j, err, now) {
    o.headDone = true;
    if (o.type === 'circle') {
      o.done = true;
      this.judge(o, j, err, o.x, o.y, now);
      return;
    }
    // slider head
    o.headHit = j > 0;
    if (j > 0) {
      this.addCombo();
      this.feed(0.03);
      this.score += 30;
      this.health = Math.min(1, this.health + 0.02);
      this.tapSound(o);
      const disorder = clamp(Math.abs(err) / this.w.w50, 0, 1);
      this.app.plot.add({ type: 'fig', x: o.x, y: o.y, size: this.R * 1.2, kind: o.figure, fseed: o.fseed, disorder, color: this.pen(o), frac: 1 - disorder * 0.4 });
      this.app.bursts.add({ type: 'ring', x: o.x, y: o.y, r: this.R, color: this.pen(o), dur: 260 });
      this.app.onHit(o, j, o.x, o.y, this.pen(o), true);
      this.link(o.x, o.y, o);
      this.pushError(err);
    } else {
      this.breakCombo();
      this.starve();
      this.app.bursts.add({ type: 'shatter', x: o.x, y: o.y, r: this.R, dur: 600 });
      this.app.onMiss(o.x, o.y);
    }
  }

  judge(o, j, err, x, y, now) {
    this.counts[j]++;
    const pen = this.pen(o);
    const b = this.app.bursts;
    if (j === 0) {
      this.breakCombo();
      this.starve();
      this.health -= 0.045 + this.map.diff.HP * 0.011;
      this.app.plot.add({ type: 'miss', x, y, size: this.R * 0.75, fseed: o.fseed, color: this.pal.ink });
      b.add({ type: 'shatter', x, y, r: this.R, dur: 700 });
      b.add({ type: 'text', x, y: y - this.R * 0.2, text: '×', color: this.pal.ink, dur: 650 });
      this.app.onMiss(x, y);
      this.lastHit = null;
      return;
    }
    this.addCombo();
    this.feed(j === 300 ? 0.07 : j === 100 ? 0.04 : 0.015);
    this.score += Math.round(j + (j * Math.max(this.combo - 1, 0) * this.diffMult) / 25);
    this.health = Math.min(1, this.health + (j === 300 ? 0.05 : j === 100 ? 0.025 : 0.008));

    if (o.type === 'circle') this.tapSound(o);
    if (o.type === 'spinner') this.app.synth.hit('finish', o.midi);

    const disorder = err != null ? clamp(Math.abs(err) / this.w.w50, 0, 1) : j === 300 ? 0 : j === 100 ? 0.45 : 0.8;
    const frac = j === 300 ? 1 : j === 100 ? 0.8 : 0.55;
    const size = o.type === 'spinner' ? 60 : this.R * (o.type === 'slider' ? 0.9 : 1.35);
    this.app.plot.add({ type: 'fig', x, y, size, kind: o.figure, fseed: o.fseed + 1, disorder, color: pen, frac });
    b.add({ type: 'land', x, y, size, kind: o.figure, fseed: o.fseed + 1, disorder, color: pen, dur: 520 });
    b.add({ type: 'ring', x, y, r: o.type === 'spinner' ? 60 : this.R, color: pen, dur: 280 });
    if (j === 300 && !this.pal.gpuSparks) b.add({ type: 'sparks', x, y, r: this.R * 0.9, color: pen, dur: 560 });   // with WebGL the sparks are GPU points
    else b.add({ type: 'text', x, y: y - this.R * 0.2, text: String(j), color: pen, dur: 600 });
    const [sx, sy] = this.app.toScreen(x, y);
    this.app.field.vortex(sx, sy, j === 300 ? 1.4 : 0.8);
    this.app.onHit(o, j, x, y, pen, false);
    this.link(x, y, o);
    if (err != null) this.pushError(err);
  }

  link(x, y, o) {
    if (this.lastHit) this.app.plot.add({ type: 'link', x1: this.lastHit[0], y1: this.lastHit[1], x2: x, y2: y, color: this.pal.ink });
    this.lastHit = [x, y];
  }

  pushError(err) {
    this.errors.push(err);
    this.recentErrors.push({ e: err, t: performance.now() });
    if (this.recentErrors.length > 30) this.recentErrors.shift();
  }

  breakCombo() {
    if (this.combo >= 20) this.app.synth.hit('break');
    this.combo = 0;
  }

  inBreak(now) {
    if (this.first >= this.objs.length) return true;
    const o = this.objs[this.first];
    if (o.type === 'spinner' && now >= o.t - this.preempt) return true;
    return now < o.t - this.preempt - 200;
  }

  update(now, dt) {
    if (this.state !== 'playing') return;
    if (this.auto) this.autoStep(now);
    for (let i = this.first; i < this.objs.length; i++) {
      const o = this.objs[i];
      if (o.t - this.preempt > now) break;
      if (o.done) continue;
      if (o.type === 'circle') { if (now > o.t + this.w.w50) this.headResult(o, 0, null, now); }
      else if (o.type === 'slider') this.updateSlider(o, now);
      else this.updateSpinner(o, now, dt);
    }
    while (this.first < this.objs.length && this.objs[this.first].done) this.first++;

    if (!this.inBreak(now)) this.health -= this.drain * dt;
    this.health = Math.min(1, this.health);
    this.shownScore += (this.score - this.shownScore) * Math.min(1, dt * 12);

    if (this.health <= 0) { this.health = 0; this.state = 'failed'; this.app.onGameEnd(true); return; }
    if (this.first >= this.objs.length) {
      if (this.endAt === null) this.endAt = now + 1400;
      if (now >= this.endAt) { this.state = 'done'; this.app.onGameEnd(false); }
    }
  }

  // ── auto-player: a perfect run, with every tap on the exact sample ──
  autoStep(now) {
    const app = this.app;
    for (let i = this.first; i < this.objs.length; i++) {
      const o = this.objs[i];
      if (o.t - now > 140) break;
      if (!o.snd && o.type !== 'spinner' && !o.headDone) {
        o.snd = true;
        app.synth.hit(o.newCombo && o.kiai ? 'finish' : 'normal', o.midi, app.conductor.ctxTimeFor(o.t));
      }
    }
    for (let guard = 0; guard < 8; guard++) {
      let cur = null;
      for (let i = this.first; i < this.objs.length; i++) { if (!this.objs[i].done) { cur = this.objs[i]; break; } }
      if (!cur) { this.keys.delete('AUTO'); return; }

      if (cur.type === 'spinner') {
        if (now < cur.t) { this.glide(306, 192, cur.t, now); this.keys.delete('AUTO'); return; }
        const a = ((now - cur.t) / 1000) * 7.4 * TAU;
        this.cx = 256 + Math.cos(a) * 50; this.cy = 192 + Math.sin(a) * 50;
        this.keys.add('AUTO');
        this.autoFrom = { x: this.cx, y: this.cy, t: Math.min(now, cur.endT) };
        return;
      }
      if (cur.type === 'slider' && cur.headDone) {
        const [bx, by] = sliderPos(cur, Math.min(now, cur.endT));
        this.cx = bx; this.cy = by;
        this.keys.add('AUTO');
        this.autoFrom = { x: bx, y: by, t: Math.min(now, cur.endT) };
        return;
      }
      if (now >= cur.t) {
        this.cx = cur.x; this.cy = cur.y;
        this.keys.add('AUTO');
        this.autoTapUntil = now + 70;
        this.autoFrom = { x: cur.x, y: cur.y, t: cur.t };
        this.headResult(cur, 300, 0, now);
        continue;                       // several objects can fall due inside one frame
      }
      this.glide(cur.x, cur.y, cur.t, now);
      if (now > this.autoTapUntil) this.keys.delete('AUTO');
      return;
    }
  }

  glide(tx, ty, tt, now) {
    const f = this.autoFrom;
    const start = Math.max(f.t, tt - Math.min(tt - f.t, 420));
    const u = clamp((now - start) / Math.max(1, tt - start), 0, 1);
    const e = u * u * (3 - 2 * u);
    this.cx = lerp(f.x, tx, e); this.cy = lerp(f.y, ty, e);
  }

  updateSlider(o, now) {
    if (!o.headDone && now > o.t + this.w.w50) this.headResult(o, 0, null, now);
    if (now < o.t) return;
    const [bx, by] = sliderPos(o, Math.min(now, o.endT));
    o.ballX = bx; o.ballY = by;
    const radius = o.tracking ? this.R * 2.4 : this.R;
    o.tracking = this.holding && dist(this.cx, this.cy, bx, by) <= radius;
    if (o.tracking && now - (o._fed || 0) > 90) { o._fed = now; this.app.onSlide(bx, by, this.pen(o)); }
    while (o.nextCheck < o.checks.length && o.checks[o.nextCheck].t <= now) {
      const c = o.checks[o.nextCheck++];
      if (o.tracking) {
        o.hitChecks++;
        if (c.kind !== 'end') {
          this.addCombo();
          this.feed(0.015);
          this.score += c.kind === 'repeat' ? 30 : 10;
          this.health = Math.min(1, this.health + 0.012);
          this.app.synth.hit(c.kind === 'repeat' ? 'normal' : 'tick', o.midi);
          const [tx, ty] = sliderPos(o, c.t);
          this.app.onTick(tx, ty, this.pen(o), c.kind);
        } else {
          this.app.synth.hit('normal', o.midi);
        }
      } else if (c.kind !== 'end') {
        this.breakCombo();
        this.starve(0.7);
      }
    }
    if (now >= o.endT && o.nextCheck >= o.checks.length) {
      const total = o.checks.length + 1;
      const ratio = (o.hitChecks + (o.headHit ? 1 : 0)) / total;
      const j = ratio >= 1 ? 300 : ratio >= 0.5 ? 100 : ratio > 0 ? 50 : 0;
      o.done = true;
      o._body = null;
      this.app.plot.add({ type: 'path', pts: o.path, R: this.R, color: this.pen(o), disorder: 1 - ratio, fseed: o.fseed });
      this.judge(o, j, null, o.endX, o.endY, now);
    }
  }

  updateSpinner(o, now, dt) {
    if (now < o.t) return;
    if (now <= o.endT && this.holding) {
      const ang = Math.atan2(this.cy - 192, this.cx - 256);
      if (o.lastAng !== null && dt > 0) {
        const cap = 8 * TAU * dt;
        const d = clamp(wrapAngle(ang - o.lastAng), -cap, cap);
        o.rot += Math.abs(d);
        o.rotDraw += d;
        o.spinVel = lerp(o.spinVel, Math.abs(d) / dt, 0.15);
      }
      o.lastAng = ang;
      const full = Math.floor(o.rot / TAU);
      if (full > o.lastFull) {
        o.lastFull = full;
        this.health = Math.min(1, this.health + 0.01);
        if (full > o.required) { o.bonus++; this.score += 1000; this.app.synth.hit('tick', o.midi + 12); }
        else { this.score += 100; this.app.synth.hit('tick', o.midi); }
      }
    } else {
      o.lastAng = null;
      o.spinVel *= 0.92;
    }
    if (now > o.endT) {
      const ratio = o.rot / (TAU * o.required);
      const j = ratio >= 1 ? 300 : ratio >= 0.85 ? 100 : ratio >= 0.6 ? 50 : 0;
      o.done = true;
      this.app.plot.add({ type: 'spiral', x: 256, y: 192, turns: clamp(o.rot / TAU, 0.6, 16), rMax: 150, color: this.pen(o), disorder: 1 - Math.min(1, ratio), fseed: o.fseed });
      this.judge(o, j, null, 256, 192, now);
    }
  }

  // The spinner currently on screen and spinning, if any (drives the galaxy effect).
  get activeSpinner() {
    const o = this.objs[this.first];
    return o && o.type === 'spinner' && !o.done ? o : null;
  }

  get total() { const c = this.counts; return c[300] + c[100] + c[50] + c[0]; }
  get accuracy() {
    const c = this.counts, n = this.total;
    return n ? (300 * c[300] + 100 * c[100] + 50 * c[50]) / (300 * n) : 1;
  }
  get grade() {
    const c = this.counts, n = this.total;
    if (this.state === 'failed') return 'F';
    if (!n) return 'D';
    const p300 = c[300] / n, p50 = c[50] / n;
    if (c[300] === n) return 'SS';
    if (p300 > 0.9 && p50 < 0.01 && c[0] === 0) return 'S';
    if ((p300 > 0.8 && c[0] === 0) || p300 > 0.9) return 'A';
    if ((p300 > 0.7 && c[0] === 0) || p300 > 0.8) return 'B';
    if (p300 > 0.6) return 'C';
    return 'D';
  }
  get meanError() { return this.errors.length ? this.errors.reduce((a, b) => a + b, 0) / this.errors.length : 0; }
  get unstableRate() {
    const n = this.errors.length;
    if (n < 2) return 0;
    const m = this.meanError;
    return Math.sqrt(this.errors.reduce((a, b) => a + (b - m) * (b - m), 0) / n) * 10;
  }
}
