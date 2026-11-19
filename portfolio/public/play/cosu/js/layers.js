'use strict';
// ─────────────────────────────────────────────────────────────
// layers: paper, drafting grid, living flow field, transient bursts,
// peak-section moiré, and the ink cursor
// ─────────────────────────────────────────────────────────────

function renderPaper(w, h, dpr, palette, seed) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
  const g = c.getContext('2d');
  g.fillStyle = palette.paper;
  g.fillRect(0, 0, c.width, c.height);
  const r = new RNG(seed, 404);
  const [ir, ig, ib] = hexToRgb(palette.ink);
  const n = Math.floor((c.width * c.height) / 70);
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${ir},${ig},${ib},${(0.02 + r.next() * 0.05).toFixed(3)})`;
    g.fillRect(r.next() * c.width, r.next() * c.height, dpr * (r.next() < 0.1 ? 1.5 : 0.8), dpr * 0.8);
  }
  g.strokeStyle = `rgba(${ir},${ig},${ib},0.035)`;
  g.lineWidth = dpr * 0.7;
  for (let i = 0; i < 40; i++) {
    const x = r.next() * c.width, y = r.next() * c.height, a = r.range(0, TAU), L = r.range(20, 70) * dpr;
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + 0.6) * L * 0.5, y + Math.sin(a + 0.6) * L * 0.5, x + Math.cos(a) * L, y + Math.sin(a) * L);
    g.stroke();
  }
  return c;
}

function drawGrid(ctx, view, palette, pulse, label) {
  const { s, ox, oy } = view;
  ctx.save();
  ctx.lineWidth = 1;
  if (!palette.busy) {              // the drafting grid belongs to the paper modes only
    ctx.strokeStyle = rgba(palette.grid, 0.45 + pulse * 0.25);
    ctx.beginPath();
    for (let x = 0; x <= PF_W; x += 32) { const X = Math.round(ox + x * s) + 0.5; ctx.moveTo(X, oy); ctx.lineTo(X, oy + PF_H * s); }
    for (let y = 0; y <= PF_H; y += 32) { const Y = Math.round(oy + y * s) + 0.5; ctx.moveTo(ox, Y); ctx.lineTo(ox + PF_W * s, Y); }
    ctx.stroke();
    ctx.strokeStyle = rgba(palette.grid, 0.9 + pulse * 0.1);
    ctx.beginPath();
    for (let x = 0; x <= PF_W; x += 128) { const X = Math.round(ox + x * s) + 0.5; ctx.moveTo(X, oy); ctx.lineTo(X, oy + PF_H * s); }
    for (let y = 0; y <= PF_H; y += 128) { const Y = Math.round(oy + y * s) + 0.5; ctx.moveTo(ox, Y); ctx.lineTo(ox + PF_W * s, Y); }
    ctx.stroke();
  }

  // registration marks, as on a plotter sheet
  const m = 26 * s, L = 14 * s;
  ctx.strokeStyle = rgba(palette.ink, palette.busy ? 0.7 : 0.55);
  if (palette.busy) ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (const [cx, cy, dx, dy] of [[0, 0, -1, -1], [PF_W, 0, 1, -1], [0, PF_H, -1, 1], [PF_W, PF_H, 1, 1]]) {
    const X = ox + cx * s, Y = oy + cy * s;
    ctx.moveTo(X + dx * (m - L), Y); ctx.lineTo(X + dx * m, Y);
    ctx.moveTo(X, Y + dy * (m - L)); ctx.lineTo(X, Y + dy * m);
  }
  for (const [cx, cy] of [[PF_W / 2, -20], [PF_W / 2, PF_H + 20], [-20, PF_H / 2], [PF_W + 20, PF_H / 2]]) {
    const X = ox + cx * s, Y = oy + cy * s, rr = 5 * s;
    ctx.moveTo(X + rr, Y); ctx.arc(X, Y, rr, 0, TAU);
    ctx.moveTo(X - rr * 1.7, Y); ctx.lineTo(X + rr * 1.7, Y);
    ctx.moveTo(X, Y - rr * 1.7); ctx.lineTo(X, Y + rr * 1.7);
  }
  ctx.stroke();

  if (label) {
    ctx.fillStyle = rgba(palette.ink, 0.6);
    ctx.font = `500 ${Math.max(9, 8.5 * s)}px "DM Mono", ui-monospace, monospace`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'right';
    if (palette.busy) { ctx.fillStyle = rgba(palette.ink, 0.85); haloText(ctx, label, ox + PF_W * s, oy + PF_H * s + 8 * s, palette); }
    else ctx.fillText(label, ox + PF_W * s, oy + PF_H * s + 8 * s);
  }
  ctx.restore();
}

// Two families of concentric circles sliding past each other. Only in peak sections.
function drawMoire(ctx, view, t, beatPhase, amount, palette, pen) {
  if (amount <= 0.01) return;
  const { s, ox, oy } = view;
  const cx = ox + 256 * s, cy = oy + 192 * s;
  const sway = t * 0.00035;
  const d = 26 * s;
  const ax = cx + Math.cos(sway) * d, ay = cy + Math.sin(sway * 1.3) * d;
  const bx = cx - Math.cos(sway) * d, by = cy - Math.sin(sway * 1.3) * d;
  const pulse = Math.pow(1 - beatPhase, 3);
  ctx.save();
  ctx.lineWidth = Math.max(1, 1.1 * s);
  const gap = 16 * s, n = Math.ceil((300 * s) / gap);     // kept sparse: large stroked circles are costly on a 2D canvas
  ctx.globalAlpha = amount * (0.1 + 0.08 * pulse);
  ctx.strokeStyle = palette.ink;
  ctx.beginPath();
  for (let i = 1; i <= n; i++) { ctx.moveTo(ax + i * gap, ay); ctx.arc(ax, ay, i * gap, 0, TAU); }
  ctx.stroke();
  ctx.strokeStyle = pen;
  ctx.beginPath();
  for (let i = 1; i <= n; i++) { ctx.moveTo(bx + i * gap, by); ctx.arc(bx, by, i * gap, 0, TAU); }
  ctx.stroke();
  ctx.restore();
}

class Field {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.parts = []; this.vortices = [];
    this.noise = new Noise2(1);
    this.w = 1; this.h = 1; this.density = 1;
  }
  setup(seed, density) {
    this.noise = new Noise2(seed + 5);
    this.density = density;
    this.spawnAll();
    this.clear();
  }
  resize(w, h) {
    this.w = w; this.h = h;
    this.canvas.width = Math.ceil(w); this.canvas.height = Math.ceil(h);
    this.spawnAll();
  }
  clear() { this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); }
  spawnAll() {
    const n = Math.round(clamp((this.w * this.h) / 1500, 150, 1300) * this.density);
    this.parts = [];
    for (let i = 0; i < n; i++) this.parts.push(this.spawn({}));
  }
  spawn(p) {
    p.x = Math.random() * this.w; p.y = Math.random() * this.h;
    p.life = 1.5 + Math.random() * 5; p.rank = Math.random();
    return p;
  }
  vortex(x, y, strength) {
    this.vortices.push({ x, y, s: strength, r: 150 });
    if (this.vortices.length > 8) this.vortices.shift();
  }
  step(dt, t, energy, pulse, sectionIdx, palette, accent, accentFrac) {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0,0,0,${0.05 + energy * 0.03})`;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = 'source-over';
    const sc = 0.0021 * (1 + (sectionIdx % 3) * 0.4);
    const heading = sectionIdx * 1.3;
    const speed = (0.3 + energy * 0.8 + pulse * 1.6) * 60 * dt;
    const drift = t * 0.00003;
    const inkPath = new Path2D(), penPath = new Path2D();
    for (const v of this.vortices) v.s *= Math.exp(-dt * 2.6);
    this.vortices = this.vortices.filter(v => v.s > 0.05);
    for (const p of this.parts) {
      const a = this.noise.fbm(p.x * sc, p.y * sc + drift, 2) * TAU * 1.15 + heading;
      let vx = Math.cos(a) * speed, vy = Math.sin(a) * speed;
      for (const v of this.vortices) {
        const dx = p.x - v.x, dy = p.y - v.y, d2 = dx * dx + dy * dy;
        if (d2 < v.r * v.r && d2 > 1) {
          const d = Math.sqrt(d2), f = (1 - d / v.r) * v.s * 60 * dt;
          vx += (-dy / d) * f * 3 + (dx / d) * f; vy += (dx / d) * f * 3 + (dy / d) * f;
        }
      }
      const nx = p.x + vx, ny = p.y + vy;
      const path = p.rank < accentFrac ? penPath : inkPath;
      path.moveTo(p.x, p.y); path.lineTo(nx, ny);
      p.x = nx; p.y = ny; p.life -= dt;
      if (p.life < 0 || nx < -5 || ny < -5 || nx > this.w + 5 || ny > this.h + 5) this.spawn(p);
    }
    ctx.lineWidth = 0.8;
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(palette.ink, 0.2);
    ctx.stroke(inkPath);
    ctx.strokeStyle = rgba(accent, 0.45);
    ctx.stroke(penPath);
  }
}

class Bursts {
  constructor() { this.list = []; }
  clear() { this.list = []; }
  add(b) {
    b.t0 = performance.now();
    if (b.type === 'sparks' || b.type === 'shatter') {
      b.parts = [];
      const n = b.type === 'sparks' ? 12 : 8;
      for (let i = 0; i < n; i++) {
        b.parts.push({ a: (i / n) * TAU + Math.random() * 0.5, v: 0.6 + Math.random() * 0.8, curl: (Math.random() - 0.5) * 2.2, rot: Math.random() * TAU });
      }
    }
    this.list.push(b);
    if (this.list.length > 80) this.list.shift();
  }
  draw(ctx, view, palette) {
    const now = performance.now(), { s, ox, oy } = view;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    this.list = this.list.filter(b => now - b.t0 < b.dur);
    for (const b of this.list) {
      const p = (now - b.t0) / b.dur;
      const X = ox + b.x * s, Y = oy + b.y * s;
      switch (b.type) {
        case 'land': {
          ctx.globalAlpha = Math.pow(1 - p, 1.5) * 0.95;
          ctx.strokeStyle = b.color; ctx.lineWidth = 1.4;
          strokeFigure(ctx, figureLines(b.kind, b.fseed), X, Y, b.size * s * (0.55 + 0.45 * easeOutCubic(p)), b.disorder, b.fseed, Math.min(1, p * 2.4));
          break;
        }
        case 'ring': {
          ctx.globalAlpha = 1 - p;
          ctx.strokeStyle = b.color; ctx.lineWidth = Math.max(0.5, b.r * s * 0.12 * (1 - p));
          ctx.beginPath(); ctx.arc(X, Y, b.r * s * (1 + 0.45 * easeOutCubic(p)), 0, TAU); ctx.stroke();
          break;
        }
        case 'sparks': {
          ctx.globalAlpha = 1 - p; ctx.strokeStyle = b.color; ctx.lineWidth = 1.2;
          ctx.beginPath();
          for (const q of b.parts) {
            const e0 = easeOutCubic(Math.max(0, p - 0.12)), e1 = easeOutCubic(p);
            const r0 = (b.r + e0 * 70 * q.v) * s, r1 = (b.r + e1 * 70 * q.v) * s;
            const a0 = q.a + q.curl * e0, a1 = q.a + q.curl * e1;
            ctx.moveTo(X + Math.cos(a0) * r0, Y + Math.sin(a0) * r0);
            ctx.lineTo(X + Math.cos(a1) * r1, Y + Math.sin(a1) * r1);
          }
          ctx.stroke();
          break;
        }
        case 'shatter': {
          ctx.globalAlpha = 1 - p; ctx.strokeStyle = palette.ink; ctx.lineWidth = 1.3;
          ctx.beginPath();
          for (const q of b.parts) {
            const e = easeOutQuad(p), cx = X + Math.cos(q.a) * (b.r * 0.5 + e * 26 * q.v) * s, cy = Y + Math.sin(q.a) * (b.r * 0.5 + e * 26 * q.v) * s + p * p * 30 * s;
            const rot = q.rot + p * 3 * q.curl, L = 7 * s;
            ctx.moveTo(cx - Math.cos(rot) * L, cy - Math.sin(rot) * L); ctx.lineTo(cx + Math.cos(rot) * L, cy + Math.sin(rot) * L);
          }
          ctx.stroke();
          break;
        }
        case 'text': {
          ctx.globalAlpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
          ctx.fillStyle = b.color;
          ctx.font = `500 ${Math.round(15 * s)}px "DM Mono", ui-monospace, monospace`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(b.text, X, Y - easeOutCubic(p) * 16 * s);
          break;
        }
      }
    }
    ctx.restore();
  }
}

class InkCursor {
  constructor() { this.pts = []; }
  push(x, y) {
    const now = performance.now();
    const last = this.pts[this.pts.length - 1];
    if (last && Math.hypot(x - last.x, y - last.y) < 1.5) { last.t = now; return; }
    this.pts.push({ x, y, t: now });
    if (this.pts.length > 140) this.pts.shift();
  }
  // the trail lengthens and takes the pen's colour as the combo grows
  draw(ctx, x, y, palette, pen, holding, combo = 0) {
    const now = performance.now(), life = 180 + Math.min(combo, 120) * 1.3;
    while (this.pts.length && now - this.pts[0].t > life) this.pts.shift();
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1], b = this.pts[i];
      const f = 1 - (now - b.t) / life;
      ctx.globalAlpha = f * 0.7;
      ctx.strokeStyle = combo >= 30 ? pen : palette.ink;
      ctx.lineWidth = 0.6 + f * 3.4;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const rr = holding ? 9 : 11;
    if (palette.busy) {
      ctx.strokeStyle = rgba(palette.paper, 0.6); ctx.lineWidth = 4.5;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.stroke();
    }
    ctx.strokeStyle = palette.ink; ctx.lineWidth = palette.busy ? 1.8 : 1.2;
    ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - rr - 5, y); ctx.lineTo(x - rr + 3, y);
    ctx.moveTo(x + rr - 3, y); ctx.lineTo(x + rr + 5, y);
    ctx.moveTo(x, y - rr - 5); ctx.lineTo(x, y - rr + 3);
    ctx.moveTo(x, y + rr - 3); ctx.lineTo(x, y + rr + 5);
    ctx.stroke();
    ctx.fillStyle = pen;
    ctx.beginPath(); ctx.arc(x, y, holding ? 4.5 : 3, 0, TAU); ctx.fill();
    ctx.restore();
  }
}
