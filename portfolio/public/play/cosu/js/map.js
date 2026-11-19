'use strict';
// ─────────────────────────────────────────────────────────────
// map: derive a beatmap from the composed song
// playfield is the classic 512 × 384 coordinate space
// ─────────────────────────────────────────────────────────────

const PF_W = 512, PF_H = 384;

const DIFFS = {
  easy:   { key: 'easy',   name: 'Easy',   AR: 4,   CS: 3,   OD: 3,   HP: 3, grid: 1,    minGap: 2,   fill: 2,   spacing: 72,  sv: 1.0, sliderMin: 2,   stream: false, stars: 1.6 },
  normal: { key: 'normal', name: 'Normal', AR: 6,   CS: 3.6, OD: 5,   HP: 4, grid: 0.5,  minGap: 1,   fill: 1,   spacing: 96,  sv: 1.3, sliderMin: 1.5, stream: false, stars: 2.5 },
  hard:   { key: 'hard',   name: 'Hard',   AR: 8,   CS: 4,   OD: 7,   HP: 5, grid: 0.5,  minGap: 0.5, fill: 1,   spacing: 118, sv: 1.6, sliderMin: 1,   stream: false, stars: 3.8 },
  insane: { key: 'insane', name: 'Insane', AR: 9.2, CS: 4.3, OD: 8.3, HP: 6, grid: 0.25, minGap: 0.5, fill: 0.5, spacing: 146, sv: 1.9, sliderMin: 1,   stream: true,  stars: 5.1 },
};

const arToMs = ar => (ar < 5 ? 1200 + 600 * (5 - ar) / 5 : 1200 - 750 * (ar - 5) / 5);
const csToRadius = cs => 54.4 - 4.48 * cs;
const odWindows = od => ({ w300: 80 - 6 * od, w100: 140 - 8 * od, w50: 200 - 10 * od });

const FIGURE_KINDS = ['spiro', 'rose', 'lissajous', 'harmono', 'star', 'squares'];
const FRACTAL_KINDS = ['koch', 'dragon', 'hilbert', 'sierp', 'levy', 'gosper', 'tree'];

function buildBeatmap(song, diffKey) {
  const D = DIFFS[diffKey];
  const r = new RNG(song.seed, hash32(diffKey.length, diffKey.charCodeAt(0)));
  const noise = new Noise2(song.seed + 77);
  const R = csToRadius(D.CS);
  const beatMs = song.spb * 1000;
  const picks = pickRhythm(song, D, r);
  const objects = placeObjects(picks, song, D, r, noise, R, beatMs);
  const last = objects[objects.length - 1];
  const stars = D.stars * Math.pow(song.bpm / 130, 0.85);
  return {
    song, diff: D, objects, radius: R,
    preempt: arToMs(D.AR), fadeIn: Math.min(400, arToMs(D.AR) * 0.66),
    windows: odWindows(D.OD),
    endTime: last ? last.endT : 0,
    stars: Math.round(stars * 100) / 100,
    beatMs,
  };
}

function pickRhythm(song, D, r) {
  const picks = [];
  const EPS = 1e-6;
  for (const s of song.sections) {
    if (s.name === 'break') {
      picks.push({ beat: s.startBeat + 2, kind: 'spin', endBeat: s.endBeat - 1.5, section: s });
      continue;
    }
    const calm = s.name === 'intro' || s.name === 'outro';
    const minGap = calm ? Math.max(D.minGap * 2, 1) : D.minGap;
    const cands = [];
    for (const n of song.lead) {
      if (n.beat >= s.startBeat && n.beat < s.endBeat) cands.push({ beat: n.beat, dur: n.dur, midi: n.midi, lead: true });
    }
    for (const e of song.events) {
      if ((e.type === 'kick' || e.type === 'snare' || e.type === 'clap') && e.vel >= 0.8 && e.beat >= s.startBeat && e.beat < s.endBeat) {
        cands.push({ beat: e.beat, dur: 0, midi: song.rootMidiAt(e.beat, song.tonic + 24), lead: false });
      }
    }
    cands.sort((a, b) => a.beat - b.beat || (b.lead - a.lead));
    let lastBeat = -Infinity, lastEnd = -Infinity;
    for (const c of cands) {
      if (Math.abs(c.beat / D.grid - Math.round(c.beat / D.grid)) > EPS) continue;
      if (c.beat < lastEnd + minGap - EPS) continue;
      if (!c.lead && c.beat < lastEnd + D.fill - EPS) continue;  // drums only fill empty space
      if (c.beat >= s.endBeat - 0.5 && s.name === 'outro') continue;
      let kind = 'circle', dur = 0;
      if (c.lead && c.dur >= D.sliderMin - EPS && r.chance(calm ? 0.8 : D.key === 'insane' ? 0.45 : 0.65)) {
        dur = Math.min(Math.floor(c.dur / D.grid) * D.grid, 4);
        if (c.beat + dur > s.endBeat) dur = s.endBeat - c.beat;
        if (dur >= Math.min(1, D.sliderMin)) kind = 'slider'; else dur = 0;
      }
      picks.push({ beat: c.beat, kind, dur, midi: c.midi, section: s });
      lastBeat = c.beat;
      lastEnd = c.beat + dur + (kind === 'slider' ? (D.minGap > 0.5 ? 0.5 : 0) : 0);
    }
  }
  picks.sort((a, b) => a.beat - b.beat);

  // Insane: bursts of sixteenth streams inside peak sections
  if (D.stream) {
    const extra = [];
    for (let i = 0; i < picks.length - 1; i++) {
      const a = picks[i], b = picks[i + 1];
      if (a.kind !== 'circle' || b.kind === 'spin' || !a.section.kiai) continue;
      if (Math.abs(b.beat - a.beat - 1) < 1e-6 && r.chance(0.28)) {
        for (let k = 1; k <= 3; k++) extra.push({ beat: a.beat + k * 0.25, kind: 'circle', dur: 0, midi: a.midi + [2, 4, 7][k - 1], section: a.section, stream: true });
      }
    }
    picks.push(...extra);
    picks.sort((a, b) => a.beat - b.beat);
  }
  return picks;
}

function inField(x, y, m) { return x >= m && x <= PF_W - m && y >= m && y <= PF_H - m; }

function placeObjects(picks, song, D, r, noise, R, beatMs) {
  const objs = [];
  const margin = R + 2;
  let x = 256 + r.range(-90, 90), y = 192 + r.range(-60, 60);
  let ang = r.range(0, TAU);
  let pattern = { type: 'flow' }, patLeft = 0;
  let prevEndBeat = null;
  let comboNum = 0, colorIdx = r.int(0, 3), comboId = -1, lastBarPair = -1;
  // Curves and fractals alternate from combo to combo. The fractal shuffle has its own stream
  // so that adding kinds never moves an object in an existing seed.
  const classic = FIGURE_KINDS.slice();
  for (let i = classic.length - 1; i > 0; i--) { const j = r.int(0, i); [classic[i], classic[j]] = [classic[j], classic[i]]; }
  const fr = new RNG(song.seed, 4242), fractal = FRACTAL_KINDS.slice();
  for (let i = fractal.length - 1; i > 0; i--) { const j = fr.int(0, i); [fractal[i], fractal[j]] = [fractal[j], fractal[i]]; }
  const figureOrder = [];
  for (let i = 0; i < Math.max(classic.length, fractal.length); i++) {
    if (i < classic.length) figureOrder.push(classic[i]);
    if (i < fractal.length) figureOrder.push(fractal[i]);
  }

  for (let i = 0; i < picks.length; i++) {
    const p = picks[i];
    const t = p.beat * beatMs;
    const barPair = Math.floor(p.beat / 8);
    let newCombo = i === 0 || p.kind === 'spin' || (objs.length && objs[objs.length - 1].type === 'spinner') || barPair !== lastBarPair || comboNum >= 10;
    if (p.stream) newCombo = false;
    if (newCombo) { comboNum = 0; comboId++; colorIdx = (colorIdx + 1) % 4; }
    lastBarPair = barPair;
    comboNum++;

    const base = {
      i: objs.length, t, beat: p.beat, midi: p.midi || 72, newCombo, combo: comboNum, colorIdx, comboId,
      kiai: !!p.section.kiai, figure: figureOrder[comboId % figureOrder.length], fseed: hash32(song.seed, i, 99),
    };

    if (p.kind === 'spin') {
      objs.push(Object.assign(base, { type: 'spinner', x: 256, y: 192, endT: p.endBeat * beatMs, endX: 256, endY: 192,
        required: Math.max(2, ((p.endBeat - p.beat) * song.spb) * (0.9 + D.OD * 0.07)) }));
      x = 256; y = 192; prevEndBeat = p.endBeat; patLeft = 0;
      continue;
    }

    if (prevEndBeat !== null) {
      const gap = p.beat - prevEndBeat;
      if (patLeft <= 0 || newCombo) {
        const hot = p.section.kiai;
        const type = r.weighted(['flow', 'polygon', 'zigzag', 'spiral'], hot ? [1, 2.2, 1, 1.4] : [2.4, 1, 0.8, 0.8]);
        const n = r.pick([3, 4, 5, 6]);
        pattern = { type, turn: (TAU / n) * r.sign(), amp: r.range(1.6, 2.4), dir: r.sign(), grow: r.range(0.9, 1.08) };
        patLeft = type === 'polygon' ? n : r.int(4, 8);
        if (type === 'polygon') ang += r.range(-0.4, 0.4);
      }
      patLeft--;
      let d;
      if (p.stream || gap <= 0.26) d = R * 0.75;
      else d = clamp(D.spacing * gap * (p.section.kiai ? 1.12 : 1), R * 1.5, 270);
      switch (pattern.type) {
        case 'flow': ang += noise.get(i * 0.23, song.seed * 0.001) * 1.9; break;
        case 'polygon': ang += pattern.turn; break;
        case 'zigzag': ang += (i % 2 ? 1 : -1) * pattern.amp; break;
        case 'spiral': ang += 0.9 * pattern.dir; d *= pattern.grow; break;
      }
      let nx = x + Math.cos(ang) * d, ny = y + Math.sin(ang) * d;
      if (!inField(nx, ny, margin) || tooClose(objs, nx, ny, R, p)) {
        let found = false;
        for (let k = 1; k <= 24 && !found; k++) {
          const a2 = ang + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (TAU / 24);
          const tx = x + Math.cos(a2) * d, ty = y + Math.sin(a2) * d;
          if (inField(tx, ty, margin) && !tooClose(objs, tx, ty, R, p)) { nx = tx; ny = ty; ang = a2; found = true; }
        }
        if (!found) {
          for (let k = 1; k <= 24 && !found; k++) {
            const a2 = ang + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (TAU / 24);
            const tx = x + Math.cos(a2) * d, ty = y + Math.sin(a2) * d;
            if (inField(tx, ty, margin)) { nx = tx; ny = ty; ang = a2; found = true; }
          }
        }
        if (!found) { nx = clamp(nx, margin, PF_W - margin); ny = clamp(ny, margin, PF_H - margin); ang += Math.PI * 0.7; }
      }
      x = nx; y = ny;
    }

    if (p.kind === 'slider') {
      const s = makeSlider(x, y, ang + r.range(-0.9, 0.9), p.dur, D, r, R, beatMs, song);
      if (s) {
        const obj = Object.assign(base, s);
        obj.finalize(t);
        objs.push(obj);
        x = s.endX; y = s.endY;
        ang = s.endAngle;
        prevEndBeat = p.beat + p.dur;
        continue;
      }
    }
    objs.push(Object.assign(base, { type: 'circle', x, y, endT: t, endX: x, endY: y }));
    prevEndBeat = p.beat;
  }
  return objs;
}

function tooClose(objs, x, y, R, p) {
  if (p.stream) return false;
  const n = objs.length;
  for (let k = Math.max(0, n - 3); k < n - 1; k++) {
    const o = objs[k];
    if (dist(o.x, o.y, x, y) < R * 1.3 || dist(o.endX, o.endY, x, y) < R * 1.3) return true;
  }
  return false;
}

function makeSlider(x0, y0, a0, durBeats, D, r, R, beatMs, song) {
  const margin = R + 2;
  let total = D.sv * 100 * durBeats;
  let repeats = 1;
  if (total > 250) repeats = 2;
  if (total > 420) repeats = 3;
  const L = total / repeats;
  const shape = r.weighted(['line', 'arc', 'bezier', 'wave'], [1, 1.6, 1.6, 1.1]);
  const bend = r.range(0.6, 2.0) * r.sign();
  const off1 = r.range(-0.6, 0.6), off2 = r.range(-0.6, 0.6);
  const waves = r.pick([1, 1.5, 2]), amp = r.range(10, 22);

  for (let tr = 0; tr < 16; tr++) {
    const a = a0 + (tr % 2 ? 1 : -1) * Math.ceil(tr / 2) * (TAU / 16);
    const raw = sliderShape(shape, x0, y0, a, L, bend, off1, off2, waves, amp);
    const pts = resample(raw, L);
    if (pts && pts.every(q => inField(q[0], q[1], margin))) {
      const spanMs = (durBeats * beatMs) / repeats;
      const checks = [];
      const beatsPerSpan = durBeats / repeats;
      for (let k = 0; k < repeats; k++) {
        for (let j = 1; j < beatsPerSpan - 0.2; j++) checks.push({ t: 0 + k * spanMs + j * beatMs, kind: 'tick' });
        if (k < repeats - 1) checks.push({ t: (k + 1) * spanMs, kind: 'repeat' });
      }
      checks.push({ t: durBeats * beatMs, kind: 'end' });
      const end = repeats % 2 === 1 ? pts[pts.length - 1] : pts[0];
      const pen = repeats % 2 === 1 ? pts[pts.length - 3] || pts[0] : pts[2] || pts[0];
      return {
        type: 'slider', x: x0, y: y0, path: pts, length: L, repeats, spanMs,
        endT: 0, // filled below
        durMs: durBeats * beatMs, checks, shape,
        endX: end[0], endY: end[1], endAngle: Math.atan2(end[1] - pen[1], end[0] - pen[0]),
        finalize(t) { this.endT = t + this.durMs; for (const c of this.checks) c.t += t; },
      };
    }
  }
  return null;
}

function sliderShape(shape, x0, y0, a, L, bend, off1, off2, waves, amp) {
  const dx = Math.cos(a), dy = Math.sin(a), px = -dy, py = dx;
  const out = [];
  const N = 80;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    let along, side;
    switch (shape) {
      case 'line': along = u * L; side = 0; break;
      case 'arc': {
        const rad = L / Math.abs(bend);
        const th = u * bend;
        along = Math.sin(Math.abs(th)) * rad; side = (1 - Math.cos(th)) * rad * Math.sign(bend);
        break;
      }
      case 'bezier': {
        const c1 = [L * 0.33, off1 * L], c2 = [L * 0.66, off2 * L], c3 = [L * 0.95, 0];
        const m = 1 - u;
        along = 3 * m * m * u * c1[0] + 3 * m * u * u * c2[0] + u * u * u * c3[0];
        side = 3 * m * m * u * c1[1] + 3 * m * u * u * c2[1] + u * u * u * c3[1];
        break;
      }
      case 'wave': along = u * L; side = Math.sin(u * TAU * waves) * amp; break;
    }
    out.push([x0 + dx * along + px * side, y0 + dy * along + py * side]);
  }
  return out;
}

// Rescale about the start so the arc length equals L, then resample evenly.
function resample(raw, L) {
  let len = 0;
  for (let i = 1; i < raw.length; i++) len += dist(raw[i - 1][0], raw[i - 1][1], raw[i][0], raw[i][1]);
  if (len < 1) return null;
  const k = L / len, [x0, y0] = raw[0];
  const pts = raw.map(q => [x0 + (q[0] - x0) * k, y0 + (q[1] - y0) * k]);
  const step = 3;
  const n = Math.max(2, Math.ceil(L / step) + 1);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  const out = [];
  let j = 1;
  for (let i = 0; i < n; i++) {
    const s = (i / (n - 1)) * cum[cum.length - 1];
    while (j < cum.length - 1 && cum[j] < s) j++;
    const seg = cum[j] - cum[j - 1] || 1;
    const f = (s - cum[j - 1]) / seg;
    out.push([lerp(pts[j - 1][0], pts[j][0], f), lerp(pts[j - 1][1], pts[j][1], f)]);
  }
  return out;
}

function sliderPos(o, t) {
  const p = clamp((t - o.t) / o.spanMs, 0, o.repeats);
  let k = Math.floor(p), local = p - k;
  if (k >= o.repeats) { k = o.repeats - 1; local = 1; }
  const frac = k % 2 === 0 ? local : 1 - local;
  const f = frac * (o.path.length - 1);
  const i = Math.floor(f), g = f - i;
  const a = o.path[i], b = o.path[Math.min(i + 1, o.path.length - 1)];
  return [lerp(a[0], b[0], g), lerp(a[1], b[1], g)];
}
