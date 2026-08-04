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
 * depth, the under-runs are painted first, then each over-run punches a gap
 * through whatever is already there before painting itself. The punch is
 * inset from the run's ends so it bites the crossings rather than the
 * z-zero junctions where an over-run meets its own under-run.
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

  const trace = (ctx: CanvasRenderingContext2D, run: typeof pts, inset: number) => {
    const a = Math.floor(run.length * inset);
    const b = Math.ceil(run.length * (1 - inset));
    if (b - a < 2) return;
    ctx.beginPath();
    ctx.moveTo(run[a].x, run[a].y);
    for (let i = a + 1; i < b; i++) ctx.lineTo(run[i].x, run[i].y);
    ctx.stroke();
  };

  return (ctx) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#fff';

    for (const r of runs) {
      if (r.over) continue;
      ctx.lineWidth = W;
      trace(ctx, r.pts, 0);
    }

    for (const r of runs) {
      if (!r.over) continue;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = W + GAP;
      trace(ctx, r.pts, 0.18);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = W;
      trace(ctx, r.pts, 0);
    }

    ctx.globalCompositeOperation = 'source-over';
  };
}
