'use strict';
// ─────────────────────────────────────────────────────────────
// render: hit objects as plotter drawings, and the HUD
// `pal.busy` is set in every mode with a generative background; there,
// thin strokes and text get a paper-coloured halo so they stay legible.
// `pal.glass` is set when the notes are glass: the stage then draws only
// their linework over a thin tinted body, and tells GL where each dome is.
// ─────────────────────────────────────────────────────────────

const MONO = '"DM Mono", ui-monospace, "SFMono-Regular", Menlo, monospace';

function haloText(ctx, text, x, y, pal, w = 4) {
  if (pal.busy) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineWidth = w;
    ctx.strokeStyle = rgba(pal.paper, 0.72);
    ctx.strokeText(text, x, y);
    ctx.restore();
  }
  ctx.fillText(text, x, y);
}

// The body of a glass note: the ground colour leaning toward the note's pen.
function glassTint(pal, pen) {
  if (!pal._tint) pal._tint = {};
  if (!pal._tint[pen]) {
    const a = hexToRgb(pal.paper), b = hexToRgb(pen);
    pal._tint[pen] = `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], 0.2))).join(',')})`;
  }
  return pal._tint[pen];
}
const glassFill = pal => (pal.busy ? 0.3 : 0.5);

function drawHitCircle(ctx, X, Y, r, pen, pal, alpha, num) {
  if (pal.glass) {
    GLX.note(X, Y, r, alpha);
    ctx.globalAlpha = alpha * glassFill(pal);
    ctx.fillStyle = glassTint(pal, pen);
  } else {
    ctx.globalAlpha = alpha * (pal.busy ? 0.96 : 0.93);
    ctx.fillStyle = pal.paper;
  }
  ctx.beginPath(); ctx.arc(X, Y, r, 0, TAU); ctx.fill();
  ctx.globalAlpha = alpha * 0.4;
  ctx.strokeStyle = pen; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = 1; k <= 3; k++) { const rr = r * (0.28 + k * 0.13); ctx.moveTo(X + rr, Y); ctx.arc(X, Y, rr, 0, TAU); }
  ctx.stroke();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = Math.max(1.5, r * 0.13);
  ctx.beginPath(); ctx.arc(X, Y, r * 0.86, 0, TAU); ctx.stroke();
  ctx.strokeStyle = pal.ink; ctx.lineWidth = pal.busy ? 1.8 : 1.3;
  ctx.beginPath(); ctx.arc(X, Y, r, 0, TAU); ctx.stroke();
  if (num != null) {
    ctx.fillStyle = pal.ink;
    ctx.font = `500 ${Math.round(r * 0.66)}px ${MONO}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (pal.glass) haloText(ctx, num, X, Y + r * 0.04, pal, 3.5); else ctx.fillText(num, X, Y + r * 0.04);
  }
}

// The approach ring arrives rippled and resolves into a true circle exactly on the beat.
function drawApproach(ctx, X, Y, r, prog, pen, alpha, k, phase, pal) {
  const sc = lerp(3.3, 1, prog);
  const amp = Math.pow(1 - prog, 1.4) * 0.1;
  ctx.beginPath();
  const N = 120;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU;
    const rr = r * sc * (1 + amp * Math.sin(k * a + phase));
    const x = X + Math.cos(a) * rr, y = Y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  const lw = Math.max(1.4, r * 0.06);
  if (pal.busy) {
    ctx.globalAlpha = alpha * 0.5;
    ctx.strokeStyle = pal.paper;
    ctx.lineWidth = lw + 3;
    ctx.stroke();
  }
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = pen;
  ctx.lineWidth = pal.busy ? lw + 0.6 : lw;
  ctx.stroke();
}

// A slider body is drawn once, at full strength, into its own bitmap and then composited.
// Stroking it straight onto the stage with partial alpha would let the layers bleed into each other.
function sliderBody(o, view, pal, game) {
  const key = view.key * 2 + (pal.glass ? 1 : 0);
  if (o._body && o._bodyKey === key) return o._body;
  const s = view.s, r = game.R * s, pad = r + 4, dpr = view.dpr || 1;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const q of o.path) { minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]); minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]); }
  const x0 = Math.floor(view.ox + minX * s - pad), y0 = Math.floor(view.oy + minY * s - pad);
  const w = Math.ceil((maxX - minX) * s + pad * 2) + 1, h = Math.ceil((maxY - minY) * s + pad * 2) + 1;
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  g.translate(-x0, -y0);
  const P = new Path2D();
  for (let i = 0; i < o.path.length; i++) {
    const X = view.ox + o.path[i][0] * s, Y = view.oy + o.path[i][1] * s;
    if (i === 0) P.moveTo(X, Y); else P.lineTo(X, Y);
  }
  const pen = game.pen(o);
  g.lineCap = 'round'; g.lineJoin = 'round';
  // Each line of the body is a wide stroke with a narrower one taken out of its middle. On paper the
  // middle is painted over; for glass it is cut away, and a thin tinted body is laid underneath at the end.
  const band = (style, outer, inner) => {
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = style; g.lineWidth = outer; g.stroke(P);
    if (pal.glass) { g.globalCompositeOperation = 'destination-out'; g.strokeStyle = '#000'; } else g.strokeStyle = pal.paper;
    g.lineWidth = inner; g.stroke(P);
  };
  band(pal.ink, r * 2, r * 2 - (pal.busy ? 3.6 : 2.6));
  band(pen, r * 1.8, r * 1.8 - Math.max(3, r * 0.24));
  for (let k = 1; k <= 3; k++) {                      // topographic contours along the body
    const cw = r * 2 * (0.8 - k * 0.2);
    if (cw < 4) break;
    band(rgba(pen, 0.5), cw, cw - 1.7);
  }
  if (pal.glass) {
    g.globalCompositeOperation = 'destination-over';
    g.globalAlpha = glassFill(pal);
    g.strokeStyle = glassTint(pal, pen); g.lineWidth = r * 2 - 1; g.stroke(P);
  }
  o._body = { c, x0, y0, w, h };
  o._bodyKey = key;
  return o._body;
}

function drawSlider(ctx, o, now, view, pal, alpha, game) {
  const s = view.s, r = game.R * s, pen = game.pen(o);
  const sx = x => view.ox + x * s, sy = y => view.oy + y * s;
  ctx.save();
  const b = sliderBody(o, view, pal, game);
  ctx.globalAlpha = alpha * 0.95;
  ctx.drawImage(b.c, b.x0, b.y0, b.w, b.h);
  if (pal.glass) {                                    // a string of domes along the path makes the half-pipe
    const last = o.path.length - 1;
    for (let i = 0; i < last; i += 3) GLX.note(sx(o.path[i][0]), sy(o.path[i][1]), r, alpha);
    GLX.note(sx(o.path[last][0]), sy(o.path[last][1]), r, alpha);
  }
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // upcoming ticks
  ctx.fillStyle = pal.ink;
  for (let i = o.nextCheck; i < o.checks.length; i++) {
    const c = o.checks[i];
    if (c.kind !== 'tick') continue;
    const [tx, ty] = sliderPos(o, c.t);
    ctx.beginPath(); ctx.arc(sx(tx), sy(ty), Math.max(1.8, r * 0.1), 0, TAU); ctx.fill();
  }

  // repeat chevron at whichever end turns the ball around next
  const n = o.path.length;
  if (o.repeats > 1) {
    const span = Math.max(0, Math.floor((now - o.t) / o.spanMs));
    if (span < o.repeats - 1) {
      const atEnd = span % 2 === 0;
      const a = atEnd ? o.path[n - 1] : o.path[0];
      const q = atEnd ? o.path[Math.max(0, n - 6)] : o.path[Math.min(n - 1, 5)];
      const ang = Math.atan2(q[1] - a[1], q[0] - a[0]);
      const X = sx(a[0]), Y = sy(a[1]), L = r * 0.42;
      const tx = X + Math.cos(ang) * L * 0.5, ty = Y + Math.sin(ang) * L * 0.5;
      ctx.strokeStyle = pal.ink; ctx.lineWidth = Math.max(2, r * 0.12);
      ctx.beginPath();
      ctx.moveTo(tx - Math.cos(ang - 0.75) * L, ty - Math.sin(ang - 0.75) * L);
      ctx.lineTo(tx, ty);
      ctx.lineTo(tx - Math.cos(ang + 0.75) * L, ty - Math.sin(ang + 0.75) * L);
      ctx.stroke();
    }
  }

  if (!o.headDone) drawHitCircle(ctx, sx(o.x), sy(o.y), r, pen, pal, alpha, o.combo);

  // ball + follow circle
  if (now >= o.t && now <= o.endT) {
    const X = sx(o.ballX), Y = sy(o.ballY);
    ctx.globalAlpha = 1;
    const fr = o.tracking ? r * 2.4 : r * 1.25;
    o._fr = lerp(o._fr || r, fr, 0.25);
    if (pal.busy) {
      ctx.strokeStyle = rgba(pal.paper, 0.5); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(X, Y, o._fr, 0, TAU); ctx.stroke();
    }
    ctx.strokeStyle = pal.ink; ctx.lineWidth = pal.busy ? 1.6 : 1.2;
    ctx.setLineDash(o.tracking ? [] : [3, 5]);
    ctx.beginPath(); ctx.arc(X, Y, o._fr, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = pen;
    ctx.beginPath(); ctx.arc(X, Y, r * 0.74, 0, TAU); ctx.fill();
    ctx.strokeStyle = pal.paper; ctx.lineWidth = 1.2;
    const roll = ((now - o.t) / 1000) * 9;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = roll + (k * TAU) / 3;
      ctx.moveTo(X, Y); ctx.lineTo(X + Math.cos(a) * r * 0.6, Y + Math.sin(a) * r * 0.6);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawSpinner(ctx, o, now, view, pal, alpha, game) {
  const s = view.s, X = view.ox + 256 * s, Y = view.oy + 192 * s, Rm = 168 * s;
  const pen = game.pen(o);
  if (pal.glass) GLX.note(X, Y, Rm, 0.5 * alpha);     // the spinner is one great lens
  ctx.save();
  ctx.globalAlpha = alpha * (pal.busy ? 0.45 : 0.3);
  ctx.strokeStyle = pal.ink; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i <= 8; i++) { ctx.moveTo(X + (Rm * i) / 8, Y); ctx.arc(X, Y, (Rm * i) / 8, 0, TAU); }
  ctx.stroke();
  ctx.globalAlpha = alpha * (pal.busy ? 0.75 : 0.6);
  ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = o.rotDraw + (i * TAU) / 24, a2 = a + 0.35;
    ctx.moveTo(X + Math.cos(a) * Rm * 0.22, Y + Math.sin(a) * Rm * 0.22);
    ctx.quadraticCurveTo(X + Math.cos(a2) * Rm * 0.62, Y + Math.sin(a2) * Rm * 0.62, X + Math.cos(a) * Rm, Y + Math.sin(a) * Rm);
  }
  ctx.stroke();
  const life = clamp((now - o.t) / (o.endT - o.t), 0, 1);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = pen; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(X, Y, Math.max(2, Rm * (1 - life)), 0, TAU); ctx.stroke();
  const ratio = clamp(o.rot / (TAU * o.required), 0, 1);
  ctx.lineWidth = Math.max(3, 6 * s); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(X, Y, Rm * 1.05, -Math.PI / 2, -Math.PI / 2 + TAU * ratio); ctx.stroke();
  ctx.fillStyle = pal.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `500 ${Math.round(15 * s)}px ${MONO}`;
  haloText(ctx, now < o.t ? 'hold and spin' : `${Math.round((o.spinVel / TAU) * 60)} rpm`, X, Y, pal);
  if (o.bonus > 0) { ctx.font = `500 ${Math.round(22 * s)}px ${MONO}`; ctx.fillStyle = pen; haloText(ctx, `+${o.bonus * 1000}`, X, Y + 40 * s, pal); }
  ctx.restore();
}

function drawFollowPoints(ctx, game, now, view, pal) {
  const { objs, preempt, R } = game, s = view.s;
  ctx.save();
  ctx.strokeStyle = pal.ink; ctx.lineWidth = pal.busy ? 1.8 : 1.3;
  ctx.setLineDash([2 * s, 7 * s]);
  ctx.lineDashOffset = -now * 0.04;
  for (let i = Math.max(1, game.first); i < objs.length; i++) {
    const b = objs[i];
    if (b.t - preempt > now) break;
    const a = objs[i - 1];
    if (a.type === 'spinner' || b.type === 'spinner' || now > b.t) continue;
    const gap = b.t - a.endT;
    if (gap > 2400 || gap <= 0) continue;
    const dx = b.x - a.endX, dy = b.y - a.endY, d = Math.hypot(dx, dy);
    if (d < R * 2.4) continue;
    const ux = dx / d, uy = dy / d;
    const f0 = clamp((now - a.endT) / gap, 0, 1);
    const x1 = a.endX + ux * (R + f0 * (d - 2 * R)), y1 = a.endY + uy * (R + f0 * (d - 2 * R));
    const x2 = b.x - ux * R, y2 = b.y - uy * R;
    ctx.globalAlpha = clamp((now - (b.t - preempt)) / 300, 0, 1) * (pal.busy ? 0.75 : 0.5);
    ctx.beginPath();
    ctx.moveTo(view.ox + x1 * s, view.oy + y1 * s); ctx.lineTo(view.ox + x2 * s, view.oy + y2 * s);
    ctx.stroke();
  }
  ctx.restore();
}

function drawObjects(ctx, game, now, view, pal) {
  const { objs, preempt } = game, fadeIn = game.map.fadeIn, s = view.s;
  drawFollowPoints(ctx, game, now, view, pal);
  const vis = [];
  for (let i = game.first; i < objs.length; i++) {
    const o = objs[i];
    if (o.t - preempt > now) break;
    if (!o.done) vis.push(o);
  }
  for (let k = vis.length - 1; k >= 0; k--) {
    const o = vis[k];
    const alpha = clamp((now - (o.t - preempt)) / fadeIn, 0, 1);
    if (o.type === 'spinner') { drawSpinner(ctx, o, now, view, pal, alpha, game); continue; }
    if (o.type === 'slider') drawSlider(ctx, o, now, view, pal, alpha, game);
    else { ctx.save(); drawHitCircle(ctx, view.ox + o.x * s, view.oy + o.y * s, game.R * s, game.pen(o), pal, alpha, o.combo); ctx.restore(); }
    if (!o.headDone && now < o.t + 40) {
      ctx.save();
      const prog = clamp(1 - (o.t - now) / preempt, 0, 1);
      drawApproach(ctx, view.ox + o.x * s, view.oy + o.y * s, game.R * s, prog, game.pen(o), alpha * 0.95, 5 + (o.i % 4), now * 0.004 + o.i, pal);
      ctx.restore();
    }
  }
}

function drawHUD(ctx, game, now, W, H, pal) {
  const u = clamp(Math.min(W / 1280, H / 800), 0.62, 1.4);
  const pen = pal.pens[0];
  ctx.save();
  ctx.lineCap = 'round';

  // health: a plotted line that trembles as it runs out
  const hx = 22 * u, hy = 24 * u, hw = Math.min(W * 0.34, 400 * u);
  if (pal.busy) {
    ctx.strokeStyle = rgba(pal.paper, 0.55); ctx.lineWidth = 9 * u;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + hw, hy); ctx.stroke();
  }
  ctx.strokeStyle = rgba(pal.ink, pal.busy ? 0.3 : 0.15); ctx.lineWidth = 3 * u;
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + hw, hy); ctx.stroke();
  const h = clamp(game.health, 0, 1), shake = Math.pow(1 - h, 2) * 3.2 * u;
  ctx.strokeStyle = h < 0.25 ? pal.pens[1] : pal.ink; ctx.lineWidth = 3 * u;
  ctx.beginPath();
  const steps = Math.max(2, Math.floor((hw * h) / 4));
  for (let i = 0; i <= steps; i++) {
    const x = hx + (hw * h * i) / steps, y = hy + Math.sin(i * 0.9 + now * 0.02) * shake;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.strokeStyle = rgba(pal.ink, 0.5); ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) { const x = hx + (hw * i) / 10; ctx.moveTo(x, hy + 5 * u); ctx.lineTo(x, hy + (i % 5 === 0 ? 11 : 8) * u); }
  ctx.stroke();

  // score + accuracy + progress
  ctx.fillStyle = pal.ink;
  ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.font = `500 ${Math.round(34 * u)}px ${MONO}`;
  haloText(ctx, String(Math.round(game.shownScore)).padStart(8, '0'), W - 22 * u, 14 * u, pal, 5);
  ctx.font = `400 ${Math.round(17 * u)}px ${MONO}`;
  const accText = (game.accuracy * 100).toFixed(2) + '%';
  haloText(ctx, accText, W - 22 * u, 56 * u, pal);
  const aw = ctx.measureText(accText).width;
  const px = W - 22 * u - aw - 16 * u, py = 56 * u + 9 * u, pr = 7.5 * u;
  const prog = clamp(now / Math.max(1, game.map.endTime), 0, 1);
  if (pal.busy) { ctx.fillStyle = rgba(pal.paper, 0.6); ctx.beginPath(); ctx.arc(px, py, pr + 2, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = pal.ink; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.stroke();
  ctx.fillStyle = rgba(pal.ink, 0.6);
  ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, pr, -Math.PI / 2, -Math.PI / 2 + TAU * prog); ctx.closePath(); ctx.fill();

  if (game.auto) {
    ctx.fillStyle = pal.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = `500 ${Math.round(12 * u)}px ${MONO}`;
    haloText(ctx, 'A U T O   ·   P E R F E C T   R U N', W / 2, 18 * u, pal);
  }

  // combo
  const pop = 1 + 0.22 * Math.exp(-(performance.now() - game.comboT) / 90);
  ctx.save();
  ctx.translate(22 * u, H - 22 * u);
  ctx.scale(pop, pop);
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = pal.ink;
  ctx.font = `500 ${Math.round(46 * u)}px ${MONO}`;
  haloText(ctx, `${game.combo}×`, 0, 0, pal, 6);
  ctx.restore();

  // three pips over the combo: the layers of the arrangement the player has earned (percussion, harmony, bells)
  const syn = game.app.synth;
  if (syn && syn.reactive) {
    for (let i = 0; i < 3; i++) {
      const x0 = 24 * u + i * 27 * u, y0 = H - 84 * u, on = syn.layerLevel[i + 1];
      if (pal.busy) { ctx.strokeStyle = rgba(pal.paper, 0.55); ctx.lineWidth = 7 * u; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + 20 * u, y0); ctx.stroke(); }
      ctx.strokeStyle = rgba(on > 0.5 ? pal.pens[i] : pal.ink, 0.22 + 0.78 * on); ctx.lineWidth = 3 * u;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + 20 * u, y0); ctx.stroke();
    }
  }

  // hit error meter
  const w = game.w, k = 1.15 * u, cx = W / 2, by = H - 26 * u;
  if (pal.busy) { ctx.fillStyle = rgba(pal.paper, 0.55); ctx.fillRect(cx - w.w50 * k - 4, by - 11 * u, w.w50 * 2 * k + 8, 22 * u); }
  ctx.fillStyle = rgba(pal.ink, pal.busy ? 0.16 : 0.07); ctx.fillRect(cx - w.w50 * k, by - 3 * u, w.w50 * 2 * k, 6 * u);
  ctx.fillStyle = rgba(pal.ink, pal.busy ? 0.22 : 0.12); ctx.fillRect(cx - w.w100 * k, by - 3 * u, w.w100 * 2 * k, 6 * u);
  ctx.fillStyle = rgba(pen, pal.busy ? 0.6 : 0.35); ctx.fillRect(cx - w.w300 * k, by - 3 * u, w.w300 * 2 * k, 6 * u);
  ctx.fillStyle = pal.ink; ctx.fillRect(cx - 0.75, by - 9 * u, 1.5, 18 * u);
  const tnow = performance.now();
  for (const r of game.recentErrors) {
    const age = (tnow - r.t) / 4000;
    if (age > 1) continue;
    ctx.fillStyle = rgba(Math.abs(r.e) <= w.w300 ? pen : pal.ink, (1 - age) * 0.85);
    ctx.fillRect(cx + clamp(r.e, -w.w50, w.w50) * k - 1, by - 8 * u, 2, 16 * u);
  }
  if (game.errors.length) {
    const m = clamp(game.meanError, -w.w50, w.w50) * k;
    ctx.fillStyle = pal.ink;
    ctx.beginPath(); ctx.moveTo(cx + m, by - 11 * u); ctx.lineTo(cx + m - 4 * u, by - 17 * u); ctx.lineTo(cx + m + 4 * u, by - 17 * u); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
