'use strict';
// ─────────────────────────────────────────────────────────────
// figures: the plotted marks, and the persistent plot they build
// Disorder is graded by timing error: 1% at perfect, gravel at a miss.
// ─────────────────────────────────────────────────────────────

const FigureCache = new Map();

// L-system turtle → polyline. Used for the fractal figure family.
function lsystemPoints(axiom, rules, iters, angleDeg, draw = 'F') {
  let s = axiom;
  for (let i = 0; i < iters; i++) { let out = ''; for (const ch of s) out += rules[ch] || ch; s = out; }
  const a = (angleDeg * Math.PI) / 180;
  let x = 0, y = 0, dir = 0;
  const pts = [[0, 0]];
  for (const ch of s) {
    if (draw.includes(ch)) { x += Math.cos(dir); y += Math.sin(dir); pts.push([x, y]); }
    else if (ch === '+') dir += a;
    else if (ch === '-') dir -= a;
  }
  return pts;
}

// Centre on the bounding box and scale so the farthest vertex sits at radius 1.
function fitUnit(lines, rotation = 0) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const L of lines) for (const q of L) { minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]); minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]); }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  let m = 0;
  for (const L of lines) for (const q of L) m = Math.max(m, Math.hypot(q[0] - cx, q[1] - cy));
  const k = m > 0 ? 1 / m : 1, c = Math.cos(rotation), sn = Math.sin(rotation);
  for (const L of lines) for (const q of L) { const x = (q[0] - cx) * k, y = (q[1] - cy) * k; q[0] = x * c - y * sn; q[1] = x * sn + y * c; }
  return lines;
}

const LSYSTEMS = {
  koch:    ['F--F--F', { F: 'F+F--F+F' }, 3, 60, 'F'],
  dragon:  ['FX', { X: 'X+YF+', Y: '-FX-Y' }, 9, 90, 'F'],
  hilbert: ['A', { A: '+BF-AFA-FB+', B: '-AF+BFB+FA-' }, 4, 90, 'F'],
  sierp:   ['A', { A: 'B-A-B', B: 'A+B+A' }, 5, 60, 'AB'],
  levy:    ['F', { F: '+F--F+' }, 8, 45, 'F'],
  gosper:  ['A', { A: 'A-B--B+A++AA+B-', B: '+A-BB--B-A++A+B' }, 3, 60, 'AB'],
};

function figureLines(kind, fseed) {
  const key = kind + ':' + fseed;
  const hit = FigureCache.get(key);
  if (hit) return hit;
  const r = new RNG(fseed, 5);
  const lines = [];
  const normalize = pts => {
    let m = 0;
    for (const p of pts) m = Math.max(m, Math.hypot(p[0], p[1]));
    const k = m > 0 ? 1 / m : 1;
    for (const p of pts) { p[0] *= k; p[1] *= k; }
    return pts;
  };

  switch (kind) {
    case 'spiro': {                       // hypotrochoid, small-integer gear ratios
      const [p, q] = r.pick([[2, 5], [3, 7], [3, 8], [2, 7], [4, 9], [5, 12], [3, 10], [5, 13], [4, 11]]);
      const rr = p / q, d = rr * r.range(0.7, 1.25), k = (1 - rr) / rr;
      const N = 140 * p, pts = [];
      for (let i = 0; i <= N; i++) {
        const t = (i / N) * TAU * p;
        pts.push([(1 - rr) * Math.cos(t) + d * Math.cos(k * t), (1 - rr) * Math.sin(t) - d * Math.sin(k * t)]);
      }
      lines.push(normalize(pts));
      break;
    }
    case 'rose': {                        // r = cos(kθ), k = n/d
      const [n, d] = r.pick([[2, 1], [3, 1], [5, 2], [7, 3], [4, 3], [5, 3], [6, 5], [7, 2]]);
      const k = n / d, N = 160 * d, pts = [];
      for (let i = 0; i <= N; i++) {
        const th = (i / N) * TAU * d, rad = Math.cos(k * th);
        pts.push([rad * Math.cos(th), rad * Math.sin(th)]);
      }
      lines.push(normalize(pts));
      break;
    }
    case 'lissajous': {
      const [a, b] = r.pick([[1, 2], [3, 2], [3, 4], [5, 4], [2, 5], [5, 6], [4, 7]]);
      const ph = r.pick([Math.PI / 2, Math.PI / 4, Math.PI / 3]);
      const N = 90 * Math.max(a, b), pts = [];
      for (let i = 0; i <= N; i++) { const t = (i / N) * TAU; pts.push([Math.sin(a * t + ph), Math.sin(b * t)]); }
      lines.push(normalize(pts));
      break;
    }
    case 'harmono': {                     // damped two-pendulum harmonograph
      const f1 = r.pick([2, 3]) + r.range(-0.012, 0.012);
      const f2 = f1 * r.pick([1, 1.5, 2]) + r.range(-0.02, 0.02);
      const f3 = r.pick([2, 3]) + r.range(-0.012, 0.012);
      const f4 = f3 * r.pick([1, 1.5, 2]) + r.range(-0.02, 0.02);
      const p1 = r.range(0, TAU), p2 = r.range(0, TAU), p3 = r.range(0, TAU), p4 = r.range(0, TAU);
      const damp = r.range(0.018, 0.03), N = 900, T = 80, pts = [];
      for (let i = 0; i <= N; i++) {
        const t = (i / N) * T, e = Math.exp(-damp * t);
        pts.push([e * (Math.sin(f1 * t + p1) + Math.sin(f2 * t + p2)) / 2, e * (Math.sin(f3 * t + p3) + Math.sin(f4 * t + p4)) / 2]);
      }
      lines.push(normalize(pts));
      break;
    }
    case 'star': {                        // star polygon {n/k} and a counter-rotated inner copy
      const [n, k] = r.pick([[5, 2], [7, 2], [7, 3], [8, 3], [9, 2], [9, 4], [11, 3], [12, 5]]);
      const rot = r.range(0, TAU);
      for (const [scale, off] of [[1, 0], [0.55, Math.PI / n]]) {
        const pts = [];
        for (let i = 0; i <= n; i++) { const a = rot + off + ((i * k) % n) * (TAU / n); pts.push([Math.cos(a) * scale, Math.sin(a) * scale]); }
        lines.push(pts);
      }
      break;
    }
    case 'squares': {                     // nested squares, each turned a little further
      const turn = r.range(0.05, 0.11) * r.sign();
      for (let s = 0; s < 6; s++) {
        const sc = 1 - s * 0.15, a0 = Math.PI / 4 + s * turn, pts = [];
        for (let i = 0; i <= 4; i++) { const a = a0 + i * (TAU / 4); pts.push([Math.cos(a) * sc, Math.sin(a) * sc]); }
        lines.push(pts);
      }
      break;
    }
    case 'tree': {                        // binary fractal tree, slightly asymmetric
      const spread = r.range(0.38, 0.6), ratio = r.range(0.68, 0.76), lean = r.range(0.75, 1.25);
      const grow = (x, y, ang, len, depth) => {
        const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
        lines.push([[x, y], [x2, y2]]);
        if (depth > 0) { grow(x2, y2, ang - spread, len * ratio, depth - 1); grow(x2, y2, ang + spread * lean, len * ratio, depth - 1); }
      };
      grow(0, 0, -Math.PI / 2, 1, 6);
      fitUnit(lines, r.range(-0.25, 0.25));
      break;
    }
    default: {                            // L-system fractals: koch, dragon, hilbert, sierp, levy, gosper
      const L = LSYSTEMS[kind] || LSYSTEMS.koch;
      lines.push(lsystemPoints(L[0], L[1], L[2], L[3], L[4]));
      fitUnit(lines, r.range(0, TAU));
      break;
    }
  }
  FigureCache.set(key, lines);
  return lines;
}

// Stroke a figure with graded disorder. Jitter is a correlated walk so lines stay drawn, not scribbled.
function strokeFigure(ctx, lines, cx, cy, size, disorder, fseed, frac = 1) {
  const r = new RNG(fseed, 11);
  const jit = 0.01 + disorder * disorder * 0.2;
  ctx.beginPath();
  for (let li = 0; li < lines.length; li++) {
    const L = lines[li];
    const rot = r.gauss() * disorder * 0.35;
    const ox = r.gauss() * disorder * 0.14, oy = r.gauss() * disorder * 0.14;
    const c = Math.cos(rot), s = Math.sin(rot);
    const n = Math.max(2, Math.floor(L.length * frac));
    let jx = 0, jy = 0;
    for (let i = 0; i < n; i++) {
      jx = jx * 0.8 + r.gauss() * jit * 0.6;
      jy = jy * 0.8 + r.gauss() * jit * 0.6;
      const px = L[i][0] + jx, py = L[i][1] + jy;
      const X = cx + (px * c - py * s + ox) * size, Y = cy + (px * s + py * c + oy) * size;
      if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
  }
  ctx.stroke();
}

const PLOT_PAD = 40;

// Two sheets. `canvas` keeps every mark and is what the menu preview and the results show.
// `live` is what you see while playing: the same marks, but each one fades away after it lands.
class Plot {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.live = document.createElement('canvas');
    this.lctx = this.live.getContext('2d');
    this.liveOn = false;
    this.fadeAt = 0;
    this.records = [];
    this.px = 1;
    this.palette = PALETTES[0];
  }
  reset(palette) {
    this.palette = palette;
    this.records = [];
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.lctx.clearRect(0, 0, this.live.width, this.live.height);
  }
  resize(px) {
    this.px = px;
    for (const c of [this.canvas, this.live]) {
      c.width = Math.ceil((PF_W + PLOT_PAD * 2) * px);
      c.height = Math.ceil((PF_H + PLOT_PAD * 2) * px);
    }
    for (const rec of this.records) this.draw(rec);
  }
  add(rec) {
    this.records.push(rec);
    this.draw(rec);
    if (this.liveOn) this.draw(rec, this.lctx);
  }

  // Fade the live sheet so a mark is down to about 5% after `seconds`.
  // It fades in 25 steps of 11%: finer steps would stall on 8-bit alpha and leave ghosts behind.
  fade(now, seconds) {
    if (!(seconds < Infinity) || now - this.fadeAt < seconds * 40) return;
    this.fadeAt = now;
    const c = this.lctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = 'rgba(0,0,0,0.113)';
    c.fillRect(0, 0, this.live.width, this.live.height);
    c.restore();
  }

  draw(rec, target) {
    const ctx = target || this.ctx, px = this.px;
    ctx.save();
    ctx.setTransform(px, 0, 0, px, PLOT_PAD * px, PLOT_PAD * px);
    // ink multiplies on paper; on dark grounds strokes simply overdraw, so dense passages keep their colour
    ctx.globalCompositeOperation = this.palette.dark ? 'source-over' : 'multiply';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const lw = this.palette.dark ? 0.9 : 0.8;
    switch (rec.type) {
      case 'fig': {
        ctx.strokeStyle = rec.color; ctx.globalAlpha = rec.alpha ?? 0.8; ctx.lineWidth = lw;
        strokeFigure(ctx, figureLines(rec.kind, rec.fseed), rec.x, rec.y, rec.size, rec.disorder, rec.fseed, rec.frac ?? 1);
        break;
      }
      case 'path': {
        const r = new RNG(rec.fseed, 23), pts = rec.pts, d = rec.disorder;
        ctx.strokeStyle = rec.color; ctx.lineWidth = lw; ctx.globalAlpha = 0.75;
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const j = 0.4 + d * 3;
          const X = pts[i][0] + r.gauss() * j * 0.3, Y = pts[i][1] + r.gauss() * j * 0.3;
          if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
        }
        ctx.stroke();
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        const half = rec.R * 0.42;
        for (let i = 1; i < pts.length - 1; i += 2) {
          if (d > 0 && r.next() < d * 0.6) continue;
          const tx = pts[i + 1][0] - pts[i - 1][0], ty = pts[i + 1][1] - pts[i - 1][1];
          const tl = Math.hypot(tx, ty) || 1;
          const nx = -ty / tl, ny = tx / tl, wob = r.gauss() * d * 0.8;
          const h = half * (0.8 + 0.2 * Math.sin(i * 0.35));
          ctx.moveTo(pts[i][0] - (nx + wob * 0.3) * h, pts[i][1] - (ny - wob * 0.3) * h);
          ctx.lineTo(pts[i][0] + (nx - wob * 0.3) * h, pts[i][1] + (ny + wob * 0.3) * h);
        }
        ctx.stroke();
        break;
      }
      case 'spiral': {
        const r = new RNG(rec.fseed, 29), turns = rec.turns, N = Math.max(40, Math.floor(turns * 70));
        ctx.strokeStyle = rec.color; ctx.lineWidth = lw; ctx.globalAlpha = 0.7;
        ctx.beginPath();
        let jr = 0;
        for (let i = 0; i <= N; i++) {
          const f = i / N, th = f * turns * TAU;
          jr = jr * 0.9 + r.gauss() * (0.4 + rec.disorder * 3);
          const rad = rec.rMax * f + jr;
          const X = rec.x + Math.cos(th) * rad, Y = rec.y + Math.sin(th) * rad;
          if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
        }
        ctx.stroke();
        break;
      }
      case 'miss': {
        const r = new RNG(rec.fseed, 31), s = rec.size;
        ctx.strokeStyle = rec.color; ctx.lineWidth = lw; ctx.globalAlpha = 0.7;
        ctx.beginPath();
        for (const base of [Math.PI / 4, -Math.PI / 4]) {
          const a = base + r.gauss() * 0.15, c = Math.cos(a), sn = Math.sin(a);
          for (let k = -3; k <= 3; k++) {
            const off = k * s * 0.12, len = s * (0.9 - Math.abs(k) * 0.09);
            const cx = rec.x - sn * off, cy = rec.y + c * off;
            ctx.moveTo(cx - c * len + r.gauss(), cy - sn * len + r.gauss());
            ctx.lineTo(cx + c * len + r.gauss(), cy + sn * len + r.gauss());
          }
        }
        ctx.stroke();
        break;
      }
      case 'link': {
        ctx.strokeStyle = rec.color; ctx.lineWidth = lw * 0.8; ctx.globalAlpha = 0.4;
        ctx.setLineDash([1.2, 4]);
        ctx.beginPath(); ctx.moveTo(rec.x1, rec.y1); ctx.lineTo(rec.x2, rec.y2); ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }
}
