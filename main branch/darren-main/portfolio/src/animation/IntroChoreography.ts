/**
 * Time-driven canvas drawers for the intro's particle formations.
 *
 * Each intro slide supplies one drawer. The scene rasterizes the drawer onto
 * an offscreen canvas a few times a second and packs the lit pixels into the
 * GPGPU target texture; the particle springs chase the moving targets, so
 * every scene is literally the same cloud flowing into a new drawing.
 *
 * Design rule (learned the hard way): keep each shape a clean, mostly-static
 * silhouette with a slow, low-amplitude idle. If the drawing lurches frame to
 * frame, the springs chase a jumping target and the cloud looks erratic. A
 * near-static target + gentle idle = cohesive, DARREN-like elegance.
 *
 * Drawer contract: paint white-on-transparent into a STAGE_W x STAGE_H
 * canvas (the rasterizer clears it first and only reads alpha). `t` is
 * seconds since the slide became active, so animations restart on entry.
 */

export const STAGE_W = 960;
export const STAGE_H = 480;

export type TargetDrawer = (ctx: CanvasRenderingContext2D, t: number) => void;

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function ease(x: number): number {
  const t = clamp01(x);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Stop-motion clock: `t` quantized to whole `hold`-second steps.
 *
 * A shape that turns continuously never lets the springs settle and blurs into
 * its own swept volume (see the module header) — a helix becomes a cylinder, a
 * Möbius strip becomes a doughnut. Held frames give the springs something to
 * arrive at, and the jump between them reads as a deliberate tick rather than
 * a stutter.
 */
function stepped(t: number, hold: number): number {
  return Math.floor(t / hold) * hold;
}

interface Pt {
  x: number;
  y: number;
}

/**
 * Split a sampled open curve into contiguous runs of constant depth sign,
 * carrying one point across each boundary so the runs join without a seam.
 */
function splitRuns(pts: Pt[], over: boolean[]): { pts: Pt[]; over: boolean }[] {
  const runs: { pts: Pt[]; over: boolean }[] = [];
  let cur: Pt[] = [];
  let curOver = over[0];
  for (let i = 0; i < pts.length; i++) {
    if (over[i] !== curOver && cur.length) {
      cur.push(pts[i]); // carry one point so runs join without a seam
      runs.push({ pts: cur, over: curOver });
      cur = [];
      curOver = over[i];
    }
    cur.push(pts[i]);
  }
  if (cur.length > 1) runs.push({ pts: cur, over: curOver });
  return runs;
}

/**
 * Paint a curve that passes through itself so the strands weave.
 *
 * Canvas has no depth buffer and every stroke here is the same white, so
 * overlapping strands merge into one blob unless the crossings are cut. Runs
 * that pass behind are laid down first; then each run in front punches a gap
 * through whatever is already there before painting itself. The punch is inset
 * from the run's ends so it bites the crossings rather than the junctions
 * where a run meets its own continuation.
 *
 * Shared by the trefoil knot, the DNA helix and the Möbius strip — all three
 * are the same problem.
 */
function weave(
  ctx: CanvasRenderingContext2D,
  runs: { pts: Pt[]; over: boolean }[],
  width: number,
  gap: number,
  inset = 0.18
): void {
  const trace = (run: Pt[], ins: number): void => {
    const a = Math.floor(run.length * ins);
    const b = Math.ceil(run.length * (1 - ins));
    if (b - a < 2) return;
    ctx.beginPath();
    ctx.moveTo(run[a].x, run[a].y);
    for (let i = a + 1; i < b; i++) ctx.lineTo(run[i].x, run[i].y);
    ctx.stroke();
  };

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#fff';

  for (const r of runs) {
    if (r.over) continue;
    ctx.lineWidth = width;
    trace(r.pts, 0);
  }

  for (const r of runs) {
    if (!r.over) continue;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = width + gap;
    trace(r.pts, inset);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = width;
    trace(r.pts, 0);
  }

  ctx.globalCompositeOperation = 'source-over';
}

/* ══════════ Slide 0 — "Hi! I'm" : DARREN ══════════ */

export function darrenDrawer(): TargetDrawer {
  return (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'italic 700 190px "Playfair Display", Georgia, serif';
    ctx.fillText('DARREN', STAGE_W / 2, STAGE_H / 2, STAGE_W - 120);
  };
}

/* ══════════ Slide 1 — "I code websites" : </> glyph, still ══════════ */

export function codeGlyphDrawer(): TargetDrawer {
  const cx = STAGE_W / 2;
  const cy = STAGE_H / 2;
  const h = 146; // bracket half-height
  const bw = 126; // bracket horizontal run
  const gap = 298; // apex distance from center — spread wide so the three
  //                  marks read as distinct strokes, not one dense blob.

  // Still object (no idle): drawn identically every frame so particles settle
  // and hold crisp, exactly like the DARREN wordmark.
  return (ctx) => {
    // Stroke weight is tuned so the lit-pixel count (hence particle density)
    // lands near DARREN's — thin strokes overpack particles and whiteout.
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 40;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // "<" angle bracket
    ctx.beginPath();
    ctx.moveTo(cx - gap + bw, cy - h);
    ctx.lineTo(cx - gap, cy);
    ctx.lineTo(cx - gap + bw, cy + h);
    ctx.stroke();

    // ">" angle bracket
    ctx.beginPath();
    ctx.moveTo(cx + gap - bw, cy - h);
    ctx.lineTo(cx + gap, cy);
    ctx.lineTo(cx + gap - bw, cy + h);
    ctx.stroke();

    // "/" slash
    ctx.beginPath();
    ctx.moveTo(cx - 84, cy + h);
    ctx.lineTo(cx + 84, cy - h);
    ctx.stroke();
  };
}

/* ══════════ Slide 2 — reading : reading glasses (still) ══════════ */

export function glassesDrawer(): TargetDrawer {
  const cx = STAGE_W / 2;
  const cy = STAGE_H / 2;
  const R = 100; // lens radius
  const off = 162; // lens center offset from center

  // Still object (no idle). Two lens rings + bridge + temple arms read as
  // reading glasses; the ring interiors are the negative space that keeps it
  // from collapsing into two solid discs.
  return (ctx) => {
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Lens rings
    ctx.lineWidth = 26;
    ctx.beginPath();
    ctx.arc(cx - off, cy + 6, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + off, cy + 6, R, 0, Math.PI * 2);
    ctx.stroke();

    // Bridge over the nose (hump between the inner lens edges)
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.moveTo(cx - off + R - 6, cy - 6);
    ctx.quadraticCurveTo(cx, cy - 58, cx + off - R + 6, cy - 6);
    ctx.stroke();

    // Temple arms splaying out from the outer edges
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(cx - off - R + 8, cy - 6);
    ctx.quadraticCurveTo(cx - off - R - 96, cy - 30, cx - off - R - 150, cy - 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + off + R - 8, cy - 6);
    ctx.quadraticCurveTo(cx + off + R + 96, cy - 30, cx + off + R + 150, cy - 8);
    ctx.stroke();
  };
}

/* ══════════ Slide 3 — hockey : ice skate (still) ══════════ */

export function iceSkateDrawer(): TargetDrawer {
  const cx = STAGE_W / 2;
  const cy = STAGE_H / 2;

  // Still object (no idle): drawn identically every frame so the boot holds
  // crisp like the DARREN wordmark.
  return (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Boot outline (toe leading right, heel back-left)
    ctx.lineWidth = 30;
    ctx.beginPath();
    ctx.moveTo(cx - 150, cy + 58);
    ctx.lineTo(cx + 150, cy + 58);
    ctx.quadraticCurveTo(cx + 188, cy + 44, cx + 178, cy + 2);
    ctx.lineTo(cx + 108, cy - 92);
    ctx.quadraticCurveTo(cx + 86, cy - 134, cx + 36, cy - 132);
    ctx.lineTo(cx - 52, cy - 130);
    ctx.quadraticCurveTo(cx - 112, cy - 122, cx - 122, cy - 52);
    ctx.lineTo(cx - 148, cy + 16);
    ctx.closePath();
    ctx.stroke();

    // Laces across the ankle/tongue
    ctx.lineWidth = 12;
    for (let i = 0; i < 3; i++) {
      const yy = cy - 84 + i * 32;
      ctx.beginPath();
      ctx.moveTo(cx - 8, yy);
      ctx.lineTo(cx + 78, yy - 10);
      ctx.stroke();
    }

    // Blade posts + runner
    ctx.lineWidth = 26;
    ctx.beginPath();
    ctx.moveTo(cx + 90, cy + 58);
    ctx.lineTo(cx + 90, cy + 104);
    ctx.moveTo(cx - 94, cy + 58);
    ctx.lineTo(cx - 94, cy + 104);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - 168, cy + 108);
    ctx.lineTo(cx + 160, cy + 108);
    ctx.quadraticCurveTo(cx + 190, cy + 106, cx + 190, cy + 80); // upturned toe pick
    ctx.stroke();
  };
}

/* ══════════ Slide 4 — "work with you" : sheet folds into a plane ══════════ */

const SHEET_VERTS = [160, -105, -160, -105, -160, 105, 160, 105];
const DART_VERTS = [185, 0, -150, -92, -150, 88, -98, 4];

export function paperPlaneDrawer(): TargetDrawer {
  const FOLD_START = 0.3;
  const FOLD_END = 2.0;
  const LAUNCH_END = 2.6;
  const cx = STAGE_W / 2;
  const cy = STAGE_H * 0.46;
  const Rx = STAGE_W * 0.34;
  const Ry = STAGE_H * 0.27;
  const OMEGA = 0.8;

  const planePos = (a: number): [number, number, number] => {
    const x = cx + Rx * Math.sin(a);
    const y = cy - Ry * Math.sin(2 * a);
    const ang = Math.atan2(-2 * Ry * Math.cos(2 * a), Rx * Math.cos(a));
    return [x, y, ang];
  };

  const launchAng = Math.atan2(-2 * Ry, Rx);

  return (ctx, t) => {
    const fold = ease((t - FOLD_START) / (FOLD_END - FOLD_START));

    let x = cx;
    let y = cy;
    let ang = 0;
    let scale = 1;

    if (t >= LAUNCH_END) {
      // Endless seamless figure-8 soar — no loop seam to hide
      const a = (t - LAUNCH_END) * OMEGA;
      [x, y, ang] = planePos(a);
      scale = 0.62;

      // Drift trail behind the plane
      ctx.fillStyle = '#fff';
      for (let k = 1; k <= 8; k++) {
        const ak = a - k * 0.13;
        if (ak <= 0) continue;
        const [tx, ty] = planePos(ak);
        ctx.beginPath();
        ctx.arc(tx, ty, Math.max(1.5, 8 - k * 0.8), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (t >= FOLD_END) {
      const f = ease((t - FOLD_END) / (LAUNCH_END - FOLD_END));
      ang = launchAng * f;
      scale = lerp(1, 0.62, f);
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.scale(scale, scale);

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    for (let v = 0; v < 4; v++) {
      const vxp = lerp(SHEET_VERTS[v * 2], DART_VERTS[v * 2], fold);
      const vyp = lerp(SHEET_VERTS[v * 2 + 1], DART_VERTS[v * 2 + 1], fold);
      if (v === 0) ctx.moveTo(vxp, vyp);
      else ctx.lineTo(vxp, vyp);
    }
    ctx.closePath();
    ctx.fill();

    // Fold seam: erase a thin line nose→notch so the wings read as two
    // particle panels (and as a growing crease while the sheet folds)
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lerp(SHEET_VERTS[0], DART_VERTS[0], fold), lerp(SHEET_VERTS[1], DART_VERTS[1], fold));
    ctx.lineTo(lerp(SHEET_VERTS[6], DART_VERTS[6], fold), lerp(SHEET_VERTS[7], DART_VERTS[7], fold));
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';

    ctx.restore();
  };
}

/* ══════════ Playground preset — supernova core ══════════ */

/** Eight-point star: [angle, tip distance, base half-width]. */
const STAR_SPIKES: [number, number, number][] = [
  [0, 300, 32],
  [Math.PI, 300, 32],
  [Math.PI / 2, 196, 28],
  [-Math.PI / 2, 196, 28],
  [Math.PI / 4, 124, 20],
  [(3 * Math.PI) / 4, 124, 20],
  [(-3 * Math.PI) / 4, 124, 20],
  [-Math.PI / 4, 124, 20],
];

/**
 * The star the Supernova preset collapses into, before it blows up.
 *
 * Static by design (see the module header): a still target lets the springs
 * settle, so the core reads as a hard bright disc with clean rays instead of a
 * smudge. The rays matter for more than the silhouette — they spread the
 * participating particles over ~5x the lit pixels a bare disc would offer, so
 * the core is dense-and-bright rather than a solid white saucer.
 */
export function starCoreDrawer(): TargetDrawer {
  const cx = STAGE_W / 2;
  const cy = STAGE_H / 2;
  const R = 54; // core radius

  return (ctx) => {
    ctx.fillStyle = '#fff';

    for (const [a, len, halfW] of STAR_SPIKES) {
      const c = Math.cos(a);
      const s = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(cx + c * len, cy + s * len); // tip
      ctx.lineTo(cx - s * halfW, cy + c * halfW); // base, one side
      ctx.lineTo(cx + s * halfW, cy - c * halfW); // base, other side
      ctx.closePath();
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
  };
}

/* ══════════ Playground preset — trefoil knot ══════════ */

/**
 * Static trefoil knot for the playground's Gather preset (not an intro slide).
 *
 * Strands weave properly: the curve is split into runs by the sign of its
 * depth and handed to `weave` above. The one thing the knot needs that the
 * shared helper does not do is find a seam-free place to start — this curve is
 * a closed loop, so a run straddling the array's ends would come out as two.
 *
 * Static by design — a moving target keeps the springs chasing and the shape
 * blurs into its own convex hull instead of settling onto the strands.
 */
export function knotDrawer(): TargetDrawer {
  const N = 900;
  const raw: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    raw.push({
      x: Math.sin(a) + 2 * Math.sin(2 * a),
      y: Math.cos(a) - 2 * Math.cos(2 * a),
      z: -Math.sin(3 * a),
    });
  }

  let maxX = 0;
  let maxY = 0;
  for (const p of raw) {
    maxX = Math.max(maxX, Math.abs(p.x));
    maxY = Math.max(maxY, Math.abs(p.y));
  }
  const scale = Math.min((STAGE_W * 0.44) / maxX, (STAGE_H * 0.42) / maxY);
  const pts = raw.map((p) => ({
    x: STAGE_W / 2 + p.x * scale,
    y: STAGE_H / 2 - p.y * scale,
    z: p.z,
  }));

  // Contiguous runs of constant depth sign, walked from the first sign change
  // so no run is split across the array seam.
  const runs: { pts: typeof pts; over: boolean }[] = [];
  let start = 0;
  while (start < N && Math.sign(pts[start].z) === Math.sign(pts[(start + N - 1) % N].z)) start++;
  let cur: typeof pts = [];
  let curOver = pts[start % N].z > 0;
  for (let k = 0; k <= N; k++) {
    const p = pts[(start + k) % N];
    const over = p.z > 0;
    if (over !== curOver && cur.length) {
      cur.push(p); // carry one point so runs join without a seam
      runs.push({ pts: cur, over: curOver });
      cur = [];
      curOver = over;
    }
    cur.push(p);
  }
  if (cur.length > 1) runs.push({ pts: cur, over: curOver });

  const W = 16; // strand thickness
  const GAP = 14; // extra width of the punch that reads as "passes under"

  return (ctx) => weave(ctx, runs, W, GAP);
}

/* ══════════ Playground preset — solar system ══════════ */

/** Orbital elements. `a` is the semi-major axis in canvas px, `e` the
 *  eccentricity, `w` the argument of perihelion (how the ellipse is turned),
 *  `phase` where the planet starts, `r` the planet's disc radius. Periods
 *  come from Kepler's third law below, so the inner planets visibly lap the
 *  outer ones. */
const SOLAR_PLANETS: { a: number; e: number; w: number; phase: number; r: number }[] = [
  { a: 96,  e: 0.21, w: 0.6,  phase: 0.15, r: 12 },
  { a: 150, e: 0.09, w: 2.3,  phase: 0.62, r: 15 },
  { a: 210, e: 0.16, w: 4.1,  phase: 0.35, r: 14 },
  { a: 288, e: 0.30, w: 1.4,  phase: 0.80, r: 17 },
  { a: 384, e: 0.12, w: 5.2,  phase: 0.05, r: 13 },
];

/** Period of the innermost planet in seconds; the rest follow T ∝ a^1.5. */
const SOLAR_T0 = 5.0;

/**
 * The deliberate exception to the "static targets settle, moving targets
 * blur" rule: the planets move every frame ON PURPOSE. The particles chasing
 * them never catch up, and the lag smears each planet into a comet tail that
 * traces its orbit — the rings are drawn by the failure to settle.
 *
 * The orbits are real Kepler ellipses, sun at the focus: mean anomaly from t,
 * eccentric anomaly by fixed-point iteration (converges fast at these
 * eccentricities), so each planet visibly rushes through perihelion and
 * lingers at aphelion.
 */
export function solarDrawer(): TargetDrawer {
  const cx = STAGE_W / 2;
  const cy = STAGE_H / 2;
  // The stage canvas is 2:1 but the orbits are nearly round, so squash y —
  // this is also what tilts the system into the "seen at an angle" look.
  const SQUASH = 0.52;

  return (ctx, t) => {
    ctx.fillStyle = '#fff';

    // Sun: a modest disc — deliberately smaller than its billing. Membership
    // is dealt by lit area, and every pixel the sun takes is a pixel the
    // rings lose; the bloom the preset pins low still reads it as the biggest
    // thing on stage.
    ctx.beginPath();
    ctx.ellipse(cx, cy, 33, 33 * SQUASH, 0, 0, Math.PI * 2);
    ctx.fill();

    for (const p of SOLAR_PLANETS) {
      const T = SOLAR_T0 * Math.pow(p.a / SOLAR_PLANETS[0].a, 1.5);
      const M = ((t / T + p.phase) % 1) * Math.PI * 2;
      // Kepler's equation M = E - e·sin E, by fixed-point iteration.
      let E = M;
      for (let i = 0; i < 5; i++) E = M + p.e * Math.sin(E);
      // Position on the ellipse with the sun at the focus.
      const ox = p.a * (Math.cos(E) - p.e);
      const oy = p.a * Math.sqrt(1 - p.e * p.e) * Math.sin(E);
      const x = cx + ox * Math.cos(p.w) - oy * Math.sin(p.w);
      const y = cy + (ox * Math.sin(p.w) + oy * Math.cos(p.w)) * SQUASH;
      ctx.beginPath();
      ctx.ellipse(x, y, p.r, p.r * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };
}

/* ══════════ Playground preset — DNA helix ══════════ */

/** Seconds each held frame lasts, and the turn it advances by. Stop-motion by
 *  necessity, not style: at any continuous rate the springs never catch the
 *  strands and the helix fills in as a plain cylinder. */
const DNA_HOLD = 0.85;
const DNA_STEP = 0.34;

/**
 * A double helix with rungs, turning in held frames.
 *
 * The strands are one sine and its negation, so they cross on screen wherever
 * the sine is zero — which is exactly where their depths are furthest apart,
 * and the reason the weave has to be drawn rather than assumed. Runs are split
 * by the sign of the depth and handed to `weave`; the rungs go down first, so
 * the front strand's punch cuts them too and they read as passing behind it.
 *
 * The ladder runs UP the stage, which is not a matter of taste. The rasterizer
 * scans lit pixels row by row from the top and hands each particle a fixed
 * fraction into that list, so a particle's rank is very nearly its row. Stand
 * the helix upright and a turn moves every particle sideways along its own
 * rung and nowhere else. Lay it on its side and each turn redeals the whole
 * population along the strands, which is a stage-wide stampede every 0.85s and
 * draws as one horizontal bar.
 */
export function dnaDrawer(): TargetDrawer {
  const cx = STAGE_W / 2;
  const cy = STAGE_H / 2;
  const HALF = STAGE_H * 0.44; // vertical reach of the ladder
  const AMP = 104; // strand amplitude, across the stage
  const TURNS = 1.75; // full turns over its length
  const K = (Math.PI * 2 * TURNS) / (HALF * 2);
  const N = 200; // samples along the ladder
  const RUNG_EVERY = 8; // samples between rungs
  const W = 15; // strand thickness
  const GAP = 13;

  return (ctx, t) => {
    const ph = stepped(t, DNA_HOLD) * (DNA_STEP / DNA_HOLD);

    const a: Pt[] = [];
    const b: Pt[] = [];
    const aOver: boolean[] = [];
    const bOver: boolean[] = [];
    for (let i = 0; i <= N; i++) {
      const y = cy - HALF + (2 * HALF * i) / N;
      const th = K * (y - cy) + ph;
      const dx = AMP * Math.sin(th);
      a.push({ x: cx + dx, y });
      b.push({ x: cx - dx, y });
      // Depth is the quarter-turn-shifted partner of the on-screen offset, so
      // a strand is in front exactly halfway between two crossings.
      aOver.push(Math.cos(th) > 0);
      bOver.push(Math.cos(th) <= 0);
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 8;
    for (let i = 0; i <= N; i += RUNG_EVERY) {
      ctx.beginPath();
      ctx.moveTo(a[i].x, a[i].y);
      ctx.lineTo(b[i].x, b[i].y);
      ctx.stroke();
    }

    weave(ctx, [...splitRuns(a, aOver), ...splitRuns(b, bOver)], W, GAP);
  };
}

/* ══════════ Playground preset — hourglass ══════════ */

/** Pour, then flip. The preset reads these to flush the trails on each turn. */
export const HOURGLASS_POUR = 6.4;
export const HOURGLASS_FLIP = 1.3;
export const HOURGLASS_CYCLE = HOURGLASS_POUR + HOURGLASS_FLIP;

/**
 * Sand draining through a neck, piling up, and the glass turning over.
 *
 * This one is choreography in the strictest sense — it needs no physics at
 * all, because the target rasterizer already sorts lit pixels top to bottom
 * and hands each particle a *stable fraction* into that list (`assignRand` in
 * scene.ts). So a particle's rank IS its place in the pour order: draw the
 * upper sand, then the falling stream, then the pile, and a particle whose
 * rank sits in the stream band is literally in the stream. Drain the top and
 * every rank walks down through the neck on its own.
 *
 * Which is also why there is no glass drawn around it. A frame's pixels sit at
 * fixed positions but their *ranks* shift every time the sand above them
 * redistributes, so particles would hop between the frame and the sand for the
 * whole pour. The sand's own silhouette has to carry it.
 *
 * Areas are conserved by construction rather than by tuning: the bulbs are
 * cones meeting at the neck, so sand standing `h` above the neck in the top
 * one is exactly the sand missing from the bottom `H - h` of the other, and
 * the two surfaces are mirror images at every instant.
 */
export function hourglassDrawer(): TargetDrawer {
  const cx = STAGE_W / 2;
  const cy = STAGE_H / 2;
  const H = STAGE_H * 0.44; // neck to either end
  const W = STAGE_W * 0.2; // half-width at the far end of a bulb
  const NECK = 9; // half-width of the falling stream
  const HEAP = 26; // how far the pile's cone stands above its own level

  return (ctx, t) => {
    const p = t % HOURGLASS_CYCLE;
    // Sand leaves through the neck at a roughly constant rate, and the upper
    // bulb's area goes as h^2 — so the level sinks slowly, then plummets.
    const pouring = p < HOURGLASS_POUR;
    const h = pouring ? H * Math.sqrt(Math.max(0, 1 - p / HOURGLASS_POUR)) : 0;
    // The flip: half a turn, held empty. A drained glass turned through pi is
    // pixel-for-pixel a full one the right way up, so the cycle can simply
    // start over at rotation zero — no seam to hide.
    const rot = pouring ? 0 : Math.PI * ease((p - HOURGLASS_POUR) / HOURGLASS_FLIP);

    const wAt = (W * h) / H; // half-width of both sand surfaces

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.fillStyle = '#fff';

    // Upper bulb: sand standing h above the neck, inside the cone.
    if (h > 1) {
      ctx.beginPath();
      ctx.moveTo(-wAt, -h);
      ctx.lineTo(wAt, -h);
      ctx.lineTo(NECK, 0);
      ctx.lineTo(-NECK, 0);
      ctx.closePath();
      ctx.fill();

      // The stream, from the neck down to whatever the pile has reached.
      ctx.fillRect(-NECK, 0, NECK * 2, h);
    }

    // Lower bulb: filled from the floor up to the mirror level, under a cone
    // heaped where the stream has been landing.
    ctx.beginPath();
    ctx.moveTo(-W, H);
    ctx.lineTo(W, H);
    ctx.lineTo(wAt, h);
    ctx.lineTo(0, h - Math.min(HEAP, h * 0.6));
    ctx.lineTo(-wAt, h);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  };
}

/* ══════════ Playground preset — fireworks ══════════ */

const FW_RISE = 0.95; // seconds from launch to apex
const FW_LIFE = 1.35; // seconds a burst keeps expanding before it is spent
const FW_SLOT = FW_RISE + FW_LIFE;

/** Where each shell goes up and how it opens. `x`/`apex` are fractions of the
 *  stage (x from the centre, apex measured down from the top). Ordered so the
 *  launch pad only ever shuffles a little way along: the handover from a spent
 *  burst to the next comet is the one moment the ranking jumps, and the shorter
 *  the hop, the more it reads as embers falling and less as a bolt sideways. */
const FW_SHELLS: { x: number; apex: number; petals: number; r: number }[] = [
  { x: -0.30, apex: 0.24, petals: 26, r: 152 },
  { x: -0.08, apex: 0.38, petals: 20, r: 108 },
  { x: 0.14, apex: 0.17, petals: 32, r: 182 },
  { x: 0.34, apex: 0.30, petals: 22, r: 124 },
  { x: 0.06, apex: 0.26, petals: 24, r: 142 },
];

/** One pass of the whole display, seconds. */
export const FIREWORKS_LOOP = FW_SLOT * FW_SHELLS.length;

/** Where and when each shell goes off, in stage fractions (-0.5..0.5, y up) —
 *  the preset fires a real shockwave at each one, since the sim carries a
 *  single shock centre and firing them one at a time is the way round that. */
export const FIREWORKS_BURSTS: { at: number; x: number; y: number }[] = FW_SHELLS.map((s, i) => ({
  at: i * FW_SLOT + FW_RISE,
  x: s.x,
  y: 0.5 - s.apex,
}));

/**
 * Shells launching, arcing, and bursting, one at a time across the stage.
 *
 * One at a time is the compromise this machinery forces, and it is worth
 * knowing why. Lit pixels are ranked top to bottom and each particle holds a
 * fixed rank, so with several shells alight at once a burst opening high up
 * shifts the rank of every pixel below it and the whole population stampedes
 * sideways — which drew, when it was tried, one diagonal white streak and
 * nothing resembling a firework. With a single shell in the air the ranks
 * describe that shell alone: the rising dot's particles are the ones that go
 * out with its petals, which is exactly the behaviour wanted.
 *
 * Nothing settles here and nothing should — the smear IS the trail of sparks.
 * But the *amount* drawn has to hold still even while everything moves, which
 * is what FW_AREA is for: membership is dealt by lit pixel, so a shell that
 * draws a fifth as much at one moment as at another packs five times the
 * particles onto every pixel it has left, and the display turns into a white
 * ball. The rising comet and the open burst are sized to the same budget.
 */
const FW_AREA = 8600; // lit pixels a shell holds, rising or burst
const FW_TRAIL = 16; // sparks in the rising comet
const FW_HEAD = 20; // radius of its leading spark

export function fireworksDrawer(): TargetDrawer {
  const cx = STAGE_W / 2;
  const GRAV = 240; // px the sparks droop over a full burst
  const floor = STAGE_H * 1.04; // just below frame, where shells launch from

  return (ctx, t) => {
    ctx.fillStyle = '#fff';
    const now = t % FIREWORKS_LOOP;
    const s = FW_SHELLS[Math.floor(now / FW_SLOT) % FW_SHELLS.length];
    const age = now % FW_SLOT;

    const apexY = STAGE_H * s.apex;
    const sx = cx + s.x * STAGE_W;

    if (age < FW_RISE) {
      // Rising: a comet decelerating toward the apex, tapering back to a thin
      // tail. Fat, because it carries the same membership the burst will.
      const u = age / FW_RISE;
      for (let k = 0; k < FW_TRAIL; k++) {
        const uk = u - k * 0.028;
        if (uk <= 0) continue;
        const y = lerp(floor, apexY, 1 - (1 - uk) * (1 - uk));
        ctx.beginPath();
        ctx.arc(sx, y, FW_HEAD - k * ((FW_HEAD - 5) / FW_TRAIL), 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    // Burst: petals thrown outward, slowing as they go and drooping under
    // gravity. Two rings, so the burst has an inner core as well as an outer
    // one — a single ring of dots reads as a cog, not an explosion. The petals
    // hold their size the whole way out (that is the budget) and only shrink
    // in the last moments, so the shell burns out on the beat the next one
    // leaves the ground.
    const v = (age - FW_RISE) / FW_LIFE;
    const spread = s.r * Math.sqrt(v) * 1.4;
    const droop = GRAV * v * v;
    const dot =
      Math.sqrt(FW_AREA / (s.petals * (1 + 0.55 * 0.55) * Math.PI)) *
      (1 - ease((v - 0.8) / 0.2));
    if (dot < 0.5) return;
    for (let i = 0; i < s.petals; i++) {
      const a = (i / s.petals) * Math.PI * 2 + s.x * 5;
      for (const ring of [1, 0.55]) {
        ctx.beginPath();
        ctx.arc(
          sx + Math.cos(a) * spread * ring,
          apexY + Math.sin(a) * spread * ring * 0.9 + droop * ring,
          dot * ring,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }
  };
}

/* ══════════ Playground preset — clock ══════════ */

/**
 * A working analog clock: the field tells you the actual time.
 *
 * The cheapest thing on the list and the best behaved. Nothing moves except on
 * a whole second — including the hour hand, which tracks the minute — so the
 * target is static between ticks and the springs settle completely. The jump
 * on each tick is the one moment of motion, which is exactly what a ticking
 * clock should look like.
 *
 * The seconds are a bead running the rim rather than a hand, and that is not
 * decoration. Each tick redeals every rank downstream of the pixels that
 * moved, so what changes once a second has to be a small share of the lit
 * area: a full second hand is a twentieth of the dial, and swinging it drags
 * the whole population a twentieth of the way round the ranking — visible as a
 * permanent comb of particles migrating vertically, since ranks run down the
 * rows. A bead is under one percent and the dial holds still.
 */
export function clockDrawer(): TargetDrawer {
  const cx = STAGE_W / 2;
  const cy = STAGE_H / 2;
  const R = STAGE_H * 0.42;

  const hand = (ctx: CanvasRenderingContext2D, turns: number, len: number, w: number): void => {
    const a = turns * Math.PI * 2 - Math.PI / 2;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(a) * R * 0.1, cy - Math.sin(a) * R * 0.1);
    ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    ctx.stroke();
  };

  return (ctx) => {
    const now = new Date();
    const s = Math.floor(now.getSeconds());
    const m = now.getMinutes();
    const h = now.getHours() % 12;

    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineCap = 'round';

    // Rim. Thin, but it is the largest single share of the lit pixels here —
    // which is what keeps the dial from being nothing but four fat strokes.
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const long = i % 3 === 0;
      const inner = R - (long ? 40 : 25);
      ctx.lineWidth = long ? 16 : 10;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * (R - 8), cy + Math.sin(a) * (R - 8));
      ctx.stroke();
    }

    hand(ctx, (h + m / 60) / 12, R * 0.5, 20);
    hand(ctx, m / 60, R * 0.72, 14);

    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.fill();

    const sa = (s / 60) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(sa) * R * 0.86, cy + Math.sin(sa) * R * 0.86, 10, 0, Math.PI * 2);
    ctx.fill();
  };
}

/* ══════════ Playground preset — heartbeat ══════════ */

export const EKG_BEAT = 0.92; // seconds per beat (~65 bpm)
export const EKG_BEATS = 3; // beats visible across the strip
export const EKG_LOOP = EKG_BEAT * EKG_BEATS;
/** Where in a beat the R spike lands — the preset syncs its shockwave to it. */
export const EKG_R_PHASE = 0.335;

// Strip geometry, as fractions of the stage, so the preset can work out where
// on screen a spike is without the drawer's pixel maths leaking out.
const EKG_X0 = 0.05;
const EKG_X1 = 0.95;
const EKG_CY = 0.58; // baseline height (fraction from the top)
const EKG_AMP = 0.42; // R spike, same units

/** Where the sweep is when it crosses beat `i`'s R spike, in stage fractions
 *  (-0.5..0.5, y up) — the point the preset centres its shockwave on. */
export function ekgSpikeAt(beat: number): { x: number; y: number } {
  const f = ((beat % EKG_BEATS) + EKG_R_PHASE) / EKG_BEATS;
  return { x: EKG_X0 + (EKG_X1 - EKG_X0) * f - 0.5, y: 0.5 - EKG_CY + EKG_AMP };
}

/** One beat of a lead-II trace: P, the QRS complex, then T. Each wave is a
 *  gaussian; the QRS is three of them nearly on top of each other, which is
 *  what makes it a spike rather than a bump. */
function ecg(p: number): number {
  const bump = (c: number, w: number, amp: number): number =>
    amp * Math.exp(-Math.pow((p - c) / w, 2));
  return (
    bump(0.16, 0.035, 0.16) + // P
    bump(0.3, 0.012, -0.18) + // Q
    bump(EKG_R_PHASE, 0.013, 1.0) + // R
    bump(0.375, 0.016, -0.3) + // S
    bump(0.6, 0.06, 0.26) // T
  );
}

/**
 * An EKG trace under a sweeping bar of light.
 *
 * Two obvious builds do not survive contact with the rasterizer. Drawing the
 * trace only as far as the sweep has got collapses the lit-pixel list to
 * almost nothing on each wrap, and the whole population lands on a handful of
 * pixels — a white dot, not a monitor. Thickening a stretch of the trace at
 * the cursor is worse in a quieter way: it adds pixels to the same rows the
 * trace already occupies, so every rank downstream shifts and the population
 * slides bodily along the strip.
 *
 * A vertical bar does neither. It is drawn across the strip's full height, so
 * the pixels it adds to each row are the same count wherever it is; ranks stay
 * put, the trace holds, and only the handful of particles the bar is passing
 * over get shuffled — a disturbance travelling along a settled trace, which is
 * what a sweep looks like. The pulse itself comes from the shockwave the
 * preset fires on each R spike.
 */
export function ekgDrawer(): TargetDrawer {
  const cy = STAGE_H * EKG_CY;
  const x0 = STAGE_W * EKG_X0;
  const x1 = STAGE_W * EKG_X1;
  const AMP = STAGE_H * EKG_AMP;
  const N = 700;
  const BAR = 5; // half-width of the sweep bar
  const BAR_H = 108; // how far it reaches above and below the baseline

  return (ctx, t) => {
    const cursor = lerp(x0, x1, (t % EKG_LOOP) / EKG_LOOP);

    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // The trace: static, so the springs settle onto it and hold it crisp.
    ctx.lineWidth = 9;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const phase = ((i / N) * EKG_BEATS) % 1;
      const x = lerp(x0, x1, i / N);
      const y = cy - AMP * ecg(phase);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillRect(cursor - BAR, cy - BAR_H, BAR * 2, BAR_H * 2);
  };
}

/* ══════════ Playground preset — Möbius strip ══════════ */

const MOBIUS_HOLD = 1.8;
const MOBIUS_STEP = 0.42;

/**
 * A Möbius strip, turning in held frames.
 *
 * Drawn as a ribbon of quads in painter's order, far to near. `weave` cannot
 * be used here — it splits a curve into two layers, over and under, and a
 * surface passing across itself needs a real depth ordering. What each quad
 * does borrow is the punch: before it paints, it cuts a gap along its own two
 * long edges, so anything already behind it is bitten back and the crossing
 * reads as one band passing under another instead of the two merging into a
 * single white shape. Only the long edges are cut, never the short ones a quad
 * shares with its neighbours along the ribbon — cut those and the band comes
 * apart into slats.
 *
 * The one-sidedness is in the boundary: it is a single edge, and following it
 * takes two laps to get back where it started, passing over the band once and
 * under it once on the way.
 *
 * Stop-motion, and slower than the helix's: the whole silhouette moves on each
 * step, so the pose needs more than a second to land before the next one.
 */
export function mobiusDrawer(): TargetDrawer {
  const cx = STAGE_W / 2;
  const cy = STAGE_H / 2;
  const R = 1; // centre-circle radius, in strip units
  const HW = 0.38; // half-width of the band
  // Tipped far enough to see the ring is a ring, shallow enough that the band
  // still turns visibly from face-on to edge-on as it goes round. Flatten it
  // toward the lens and the twist disappears into a plain annulus.
  const TILT = 0.62;
  const SCALE = Math.min(STAGE_W * 0.4, STAGE_H * 0.46) / (R + HW);
  const QUADS = 120;
  const GAP = 11;
  const SPLIT = 7; // width of the gap punched down the band's midline

  // Surface point, rotated into view. `u` runs the centre circle, `v` crosses
  // the band; the u/2 is the half-turn that makes the strip one-sided.
  const surf = (u: number, v: number, spin: number): { x: number; y: number; z: number } => {
    const rad = R + v * HW * Math.cos(u / 2);
    const px = rad * Math.cos(u);
    const py = rad * Math.sin(u);
    const pz = v * HW * Math.sin(u / 2);
    // Spin about the vertical, then tip the whole ring toward the lens.
    const sx = px * Math.cos(spin) - py * Math.sin(spin);
    const sy = px * Math.sin(spin) + py * Math.cos(spin);
    return {
      x: cx + sx * SCALE,
      y: cy - (pz * Math.cos(TILT) - sy * Math.sin(TILT)) * SCALE,
      z: pz * Math.sin(TILT) + sy * Math.cos(TILT),
    };
  };

  return (ctx, t) => {
    const spin = stepped(t, MOBIUS_HOLD) * (MOBIUS_STEP / MOBIUS_HOLD);

    const quads = [];
    for (let i = 0; i < QUADS; i++) {
      const u0 = (i / QUADS) * Math.PI * 2;
      const u1 = ((i + 1) / QUADS) * Math.PI * 2;
      const c0 = surf(u0, -1, spin);
      const c1 = surf(u1, -1, spin);
      const c2 = surf(u1, 1, spin);
      const c3 = surf(u0, 1, spin);
      const m0 = surf(u0, 0, spin);
      const m1 = surf(u1, 0, spin);
      quads.push({ c0, c1, c2, c3, m0, m1, z: (c0.z + c1.z + c2.z + c3.z) / 4 });
    }
    quads.sort((p, q) => p.z - q.z);

    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    for (const q of quads) {
      // Cut back whatever is behind, along this quad's two long edges only.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = GAP;
      ctx.beginPath();
      ctx.moveTo(q.c0.x, q.c0.y);
      ctx.lineTo(q.c1.x, q.c1.y);
      ctx.moveTo(q.c3.x, q.c3.y);
      ctx.lineTo(q.c2.x, q.c2.y);
      ctx.stroke();

      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(q.c0.x, q.c0.y);
      ctx.lineTo(q.c1.x, q.c1.y);
      ctx.lineTo(q.c2.x, q.c2.y);
      ctx.lineTo(q.c3.x, q.c3.y);
      ctx.closePath();
      ctx.fill();

      // Split the band down its middle. A solid ribbon reads as an annulus
      // however carefully it is shaded — white on transparent is all the
      // rasterizer keeps. Two parallel strands swapping sides as they go round
      // is what makes the twist legible, and it thins the shape out besides.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = SPLIT;
      ctx.beginPath();
      ctx.moveTo(q.m0.x, q.m0.y);
      ctx.lineTo(q.m1.x, q.m1.y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  };
}

/* ══════════ Playground preset — ocean ══════════ */

/** Swell components: wavenumber (radians per world unit), speed, amplitude in
 *  world units, how far they run across the view rather than straight at it,
 *  and how hard they pull the water toward their own crests. Three at odd
 *  periods, so the surface never repeats inside a viewing. */
const SWELL: { k: number; w: number; amp: number; skew: number; q: number }[] = [
  { k: 2.6, w: 1.6, amp: 0.15, skew: 0.25, q: 0.85 },
  { k: 4.3, w: 2.4, amp: 0.06, skew: -0.5, q: 0.6 },
  { k: 8.1, w: 3.6, amp: 0.022, skew: 0.9, q: 0.35 },
];

/**
 * A sine swell seen at a low angle, with crests that steepen and break.
 *
 * Broad and thin, so it is the one shape on this list that takes a high
 * membership without blooming — the field is spread over a dozen long profile
 * lines rather than packed into a silhouette.
 *
 * The waves are Gerstner rather than plain sines: each component displaces the
 * surface sideways as well as up, toward its own crest. That is what sharpens
 * the crests and flattens the troughs, and because the sampling is displaced
 * with the water, particles crowd along the crest lines by themselves — the
 * same crowding that draws the galaxy's arms, one dimension down.
 */
export function oceanDrawer(): TargetDrawer {
  const cx = STAGE_W / 2;
  const HORIZON = STAGE_H * 0.26;
  const F = 560; // focal length in px — the projection is a real pinhole
  const EYE = 1.0; // camera height above the water, world units
  const Z_FAR = 7.0;
  const Z_NEAR = 1.35;
  const ROWS = 22;
  const N = 190; // samples across a row
  const SPAN = 0.56; // how far past the frame edges a row is drawn

  /** Gerstner sum at a point on the flat water, at time t. */
  const wave = (
    x: number,
    z: number,
    t: number
  ): { h: number; shift: number; steep: number } => {
    let h = 0;
    let shift = 0;
    let steep = 0;
    for (const s of SWELL) {
      const th = s.k * (z + x * s.skew) - s.w * t;
      h += s.amp * Math.cos(th);
      shift -= s.q * s.amp * Math.sin(th);
      steep += s.q * s.amp * s.k * Math.cos(th);
    }
    return { h, shift, steep };
  };

  return (ctx, t) => {
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let r = 0; r < ROWS; r++) {
      // Rows are laid out in depth, geometrically — which puts them where
      // perspective wants them on screen, crowded at the horizon and spread
      // apart in the foreground, without any of it being faked.
      const z = Z_FAR * Math.pow(Z_NEAR / Z_FAR, r / (ROWS - 1));
      const scale = F / z; // px per world unit at this depth
      const baseY = HORIZON + EYE * scale;
      const near = 1 - (Math.log(z / Z_NEAR) / Math.log(Z_FAR / Z_NEAR));

      ctx.lineWidth = 2.5 + 6 * near;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        // Sampled evenly across the SCREEN and projected back out to the
        // water, so every row covers the frame and the far ones take in a much
        // wider stretch of sea, exactly as they should.
        const sx = (i / N - 0.5) * 2 * SPAN * STAGE_W;
        const xw = (sx * z) / F;
        const w = wave(xw, z, t);
        if (i === 0) ctx.moveTo(cx + sx + w.shift * scale, baseY - w.h * scale);
        else ctx.lineTo(cx + sx + w.shift * scale, baseY - w.h * scale);
      }
      ctx.stroke();

      // Foam: the near rows only, on the crests steep enough to be breaking.
      if (near < 0.45) continue;
      for (let i = 0; i <= N; i += 4) {
        const sx = (i / N - 0.5) * 2 * SPAN * STAGE_W;
        const xw = (sx * z) / F;
        const w = wave(xw, z, t);
        if (w.h < 0.09 || w.steep < 0.55) continue;
        ctx.beginPath();
        ctx.arc(
          cx + sx + w.shift * scale,
          baseY - w.h * scale - 3 * near,
          1.5 + 4 * near,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }
  };
}
