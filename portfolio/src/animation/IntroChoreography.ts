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

/* ══════════ Slide 1 — "I code websites" : </> glyph, breathing ══════════ */

export function codeGlyphDrawer(): TargetDrawer {
  const cx = STAGE_W / 2;
  const cy = STAGE_H / 2;
  const h = 146; // bracket half-height
  const bw = 126; // bracket horizontal run
  const gap = 298; // apex distance from center — spread wide so the three
  //                  marks read as distinct strokes, not one dense blob.

  return (ctx, t) => {
    // Very slow, small breathing so particles mostly settle (settled particles
    // show palette color; constantly-moving ones glow white and bloom out).
    const s = 1 + 0.03 * Math.sin(t * 0.5);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);

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

    ctx.restore();
  };
}

/* ══════════ Slide 2 — reading : open book, pages flutter ══════════ */

export function openBookDrawer(): TargetDrawer {
  const cx = STAGE_W / 2;
  const cy = STAGE_H / 2;

  return (ctx, t) => {
    // Subtle, slow flutter so particles settle into color instead of glowing.
    const fL = Math.sin(t * 0.5) * 6;
    const fR = Math.sin(t * 0.5 + 1.1) * 6;

    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Thick page outlines (medium weight → DARREN-like density → dim & legible)
    // with a dark interior; the negative space is what reads as an open book.
    ctx.lineWidth = 24;
    ctx.beginPath();
    ctx.moveTo(cx - 16, cy - 56);
    ctx.quadraticCurveTo(cx - 176, cy - 104 + fL, cx - 336, cy - 62 + fL);
    ctx.lineTo(cx - 316, cy + 96 + fL * 0.5);
    ctx.quadraticCurveTo(cx - 176, cy + 122, cx - 16, cy + 98);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx + 16, cy - 56);
    ctx.quadraticCurveTo(cx + 176, cy - 104 + fR, cx + 336, cy - 62 + fR);
    ctx.lineTo(cx + 316, cy + 96 + fR * 0.5);
    ctx.quadraticCurveTo(cx + 176, cy + 122, cx + 16, cy + 98);
    ctx.closePath();
    ctx.stroke();

    // Spine
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 54);
    ctx.lineTo(cx, cy + 96);
    ctx.stroke();
  };
}

/* ══════════ Slide 3 — hockey : ice skate, static + spray shimmer ══════════ */

export function iceSkateDrawer(): TargetDrawer {
  const cx = STAGE_W / 2;
  const cy = STAGE_H / 2;

  return (ctx, t) => {
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // The boot stays put so its particles settle into color; the ice-spray
    // shimmer off the heel is the idle life.
    const N = 6;
    for (let k = 0; k < N; k++) {
      const life = (t * 0.85 + k / N) % 1;
      const sx = cx - 172 - life * 96;
      const sy = cy + 66 + life * 22 + Math.sin(t * 5 + k) * 4;
      const r = (1 - life) * 6 + 1.6;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }

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
