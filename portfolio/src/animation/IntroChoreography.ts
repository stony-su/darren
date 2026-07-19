/**
 * Time-driven canvas drawers for the intro's particle formations.
 *
 * Each intro slide supplies one drawer. The scene rasterizes the drawer onto
 * an offscreen canvas a few times a second and packs the lit pixels into the
 * GPGPU target texture; the particle springs chase the moving targets, so
 * every scene is literally the same cloud flowing into a new drawing.
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

/* ══════════ Slide 1 — "I code websites" : live-typed snippet ══════════ */

const CODE_LINES = [
  'const darren = {',
  "  builds: 'websites',",
  "  stack: ['ts', 'three'],",
  "  vibe: 'handcrafted',",
  '};',
];

export function typedCodeDrawer(): TargetDrawer {
  const total = CODE_LINES.reduce((n, l) => n + l.length, 0);
  const TYPE_CPS = 16;
  const DELETE_CPS = 70;
  const typeDur = total / TYPE_CPS;
  const holdDur = 2.8;
  const deleteDur = total / DELETE_CPS;
  const pauseDur = 0.8;
  const cycle = typeDur + holdDur + deleteDur + pauseDur;

  const FONT = '500 40px Consolas, "Courier New", monospace';
  const LH = 58;
  const codeX = 200;
  const codeY = 150;

  return (ctx, t) => {
    const tc = t % cycle;

    /* Editor chrome stays put the whole time — a stable anchor while the
       code inside is typed and wiped. */
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    if ('roundRect' in ctx) {
      ctx.roundRect(130, 48, 700, 384, 28);
    } else {
      (ctx as CanvasRenderingContext2D).rect(130, 48, 700, 384);
    }
    ctx.stroke();
    ctx.fillStyle = '#fff';
    for (let d = 0; d < 3; d++) {
      ctx.beginPath();
      ctx.arc(176 + d * 30, 86, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    let visible: number;
    let blink: boolean;
    if (tc < typeDur) {
      visible = Math.floor(tc * TYPE_CPS);
      blink = true;
    } else if (tc < typeDur + holdDur) {
      visible = total;
      blink = (tc * 1.9) % 1 < 0.55;
    } else if (tc < typeDur + holdDur + deleteDur) {
      visible = total - Math.floor((tc - typeDur - holdDur) * DELETE_CPS);
      blink = true;
    } else {
      visible = 0;
      blink = (tc * 1.9) % 1 < 0.55;
    }
    visible = Math.max(0, Math.min(total, visible));

    ctx.font = FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const charW = ctx.measureText('0').width;

    let remaining = visible;
    let cursorX = codeX;
    let cursorY = codeY;
    for (let li = 0; li < CODE_LINES.length; li++) {
      const line = CODE_LINES[li];
      const shown = Math.min(line.length, remaining);
      if (shown > 0) {
        ctx.fillText(line.slice(0, shown), codeX, codeY + li * LH);
      }
      remaining -= shown;
      if (shown < line.length || li === CODE_LINES.length - 1) {
        cursorX = codeX + shown * charW;
        cursorY = codeY + li * LH;
        if (remaining <= 0) break;
      }
    }

    if (blink) {
      ctx.fillRect(cursorX + 4, cursorY - 22, charW * 0.9, 44);
    }
  };
}

/* ══════════ Slide 2 — reading : a murmuration of words ══════════ */

const FLOCK_WORDS = [
  'stories', 'worlds', 'wonder', 'magic', 'heroes', 'myths',
  'pages', 'dreams', 'quests', 'legends', 'ink', 'chapters',
];

export function murmurationDrawer(): TargetDrawer {
  const n = FLOCK_WORDS.length;
  const px = new Float32Array(n);
  const py = new Float32Array(n);
  const vx = new Float32Array(n);
  const vy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    px[i] = STAGE_W / 2 + Math.cos(a) * 240;
    py[i] = STAGE_H / 2 + Math.sin(a) * 140;
    vx[i] = -Math.sin(a) * 110;
    vy[i] = Math.cos(a) * 70;
  }
  let last = 0;

  return (ctx, t) => {
    const dt = Math.min(0.15, Math.max(0.001, t - last));
    last = t;

    /* A wandering attractor leads the flock; separation keeps the words
       legible instead of piling into one blob. */
    const ax = STAGE_W / 2 + STAGE_W * 0.29 * Math.sin(t * 0.33 + 1.3);
    const ay = STAGE_H / 2 + STAGE_H * 0.22 * Math.sin(t * 0.51);

    for (let i = 0; i < n; i++) {
      vx[i] += (ax - px[i]) * 0.55 * dt;
      vy[i] += (ay - py[i]) * 0.55 * dt;
      vx[i] += Math.sin(t * 0.9 + i * 2.1) * 46 * dt;
      vy[i] += Math.cos(t * 0.7 + i * 1.7) * 34 * dt;

      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const dx = px[i] - px[j];
        const dy = py[i] - py[j];
        const d = Math.hypot(dx, dy);
        if (d > 1 && d < 120) {
          const push = ((120 - d) / 120) * 320 * dt;
          vx[i] += (dx / d) * push;
          vy[i] += (dy / d) * push * 1.4;
        }
      }

      // Soft stage bounds
      if (px[i] < 110) vx[i] += (110 - px[i]) * 2.4 * dt;
      if (px[i] > STAGE_W - 110) vx[i] -= (px[i] - (STAGE_W - 110)) * 2.4 * dt;
      if (py[i] < 70) vy[i] += (70 - py[i]) * 2.8 * dt;
      if (py[i] > STAGE_H - 70) vy[i] -= (py[i] - (STAGE_H - 70)) * 2.8 * dt;

      // Speed clamp keeps the flock lively but followable
      const sp = Math.hypot(vx[i], vy[i]);
      const target = sp < 70 ? 70 : sp > 190 ? 190 : sp;
      if (sp > 1) {
        vx[i] = (vx[i] / sp) * target;
        vy[i] = (vy[i] / sp) * target;
      }

      px[i] += vx[i] * dt;
      py[i] += vy[i] * dt;
    }

    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      // Tilt with the flight direction, mirrored so words never flip upside down
      let ang = Math.atan2(vy[i], vx[i]);
      if (ang > Math.PI / 2) ang -= Math.PI;
      if (ang < -Math.PI / 2) ang += Math.PI;
      ang = Math.max(-0.45, Math.min(0.45, ang));

      const fs = 38 + ((i * 53) % 5) * 8;
      ctx.save();
      ctx.translate(px[i], py[i]);
      ctx.rotate(ang);
      ctx.font = `italic 600 ${fs}px "Playfair Display", Georgia, serif`;
      ctx.fillText(FLOCK_WORDS[i], 0, 0);
      ctx.restore();
    }
  };
}

/* ══════════ Slide 3 — hockey : wind-up, slap shot, puck burst ══════════ */

/* Joint layout per pose, relative to the player's origin on the ice
   (y negative = up): hip, shoulder, head, frontKnee, frontFoot, backKnee,
   backFoot, upperHand, lowerHand, bladeTip. */
type Pose = number[];

const POSE_GLIDE_A: Pose = [0,-96, 12,-176, 20,-206, 40,-52, 58,-2, -30,-50, -58,-2, 38,-140, 72,-112, 138,-6];
const POSE_GLIDE_B: Pose = [0,-100, 12,-178, 20,-208, 18,-56, -8,-2, 34,-50, 64,-2, 36,-138, 70,-110, 130,-8];
const POSE_WINDUP:  Pose = [-6,-98, -14,-178, -6,-208, 52,-54, 66,-2, -34,-48, -62,-2, -4,-160, -52,-170, -118,-172];
const POSE_CONTACT: Pose = [10,-92, 34,-168, 44,-198, 50,-52, 70,-2, -40,-46, -66,-2, 28,-128, 58,-96, 66,-4];
const POSE_FOLLOW:  Pose = [16,-96, 44,-170, 54,-200, 52,-54, 72,-2, -20,-60, -52,-28, 40,-138, 76,-120, 160,-118];
const POSE_SETTLE:  Pose = [12,-98, 36,-172, 46,-202, 48,-54, 68,-2, -26,-54, -58,-6, 40,-140, 74,-116, 150,-90];

const SHOT_KEYFRAMES: [number, Pose][] = [
  [0.0, POSE_GLIDE_A],
  [0.55, POSE_GLIDE_B],
  [1.1, POSE_GLIDE_A],
  [2.0, POSE_WINDUP],
  [2.3, POSE_CONTACT],
  [2.7, POSE_FOLLOW],
  [4.4, POSE_SETTLE],
  [5.2, POSE_GLIDE_A],
];

const SHOT_CYCLE = 5.2;

function samplePose(tc: number, out: Pose): void {
  for (let k = 0; k < SHOT_KEYFRAMES.length - 1; k++) {
    const [t0, p0] = SHOT_KEYFRAMES[k];
    const [t1, p1] = SHOT_KEYFRAMES[k + 1];
    if (tc >= t0 && tc <= t1) {
      const f = ease((tc - t0) / (t1 - t0));
      for (let i = 0; i < p0.length; i++) out[i] = lerp(p0[i], p1[i], f);
      return;
    }
  }
  const final = SHOT_KEYFRAMES[SHOT_KEYFRAMES.length - 1][1];
  for (let i = 0; i < final.length; i++) out[i] = final[i];
}

export function slapShotDrawer(): TargetDrawer {
  const pose: Pose = new Array(20).fill(0);

  return (ctx, t) => {
    const tc = t % SHOT_CYCLE;
    const groundY = STAGE_H * 0.8;

    // Skate in from the left, plant for the shot, drift back before the wrap
    let x0: number;
    if (tc < 2.2) x0 = lerp(STAGE_W * 0.16, STAGE_W * 0.4, ease(tc / 2.2));
    else if (tc < 4.4) x0 = STAGE_W * 0.4 + ((tc - 2.2) / 2.2) * 20;
    else x0 = lerp(STAGE_W * 0.4 + 20, STAGE_W * 0.16, ease((tc - 4.4) / 0.8));

    samplePose(tc, pose);

    // Ice
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(50, groundY + 18);
    ctx.lineTo(STAGE_W - 50, groundY + 18);
    ctx.stroke();

    const P = (i: number): [number, number] => [x0 + pose[i * 2], groundY + pose[i * 2 + 1]];
    const [hip, sh, head, fk, ff, bk, bf, h1, h2, blade] =
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(P);

    const limb = (pts: [number, number][], w: number): void => {
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    };

    limb([hip, bk, bf], 26);          // back leg
    limb([hip, fk, ff], 26);          // front leg
    limb([hip, sh], 28);              // torso
    limb([sh, h1, h2], 20);           // arms to the stick
    limb([h1, h2, blade], 13);        // stick shaft
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(head[0], head[1], 24, 0, Math.PI * 2);
    ctx.fill();

    /* Puck: waits on the ice, launches at stick contact, flies flat-ish,
       then bursts into a scatter ring — the transition energy. */
    const SHOT_T = 2.3;
    const FLIGHT = 1.0;
    const burstX = STAGE_W * 0.88;
    if (tc < SHOT_T) {
      ctx.beginPath();
      ctx.arc(x0 + 96, groundY - 12, 15, 0, Math.PI * 2);
      ctx.fill();
    } else if (tc < SHOT_T + FLIGHT) {
      const f = (tc - SHOT_T) / FLIGHT;
      const puckX = lerp(x0 + 70, burstX, f);
      const puckY = groundY - 12 - 140 * (1 - Math.pow(1 - f, 2));
      for (let k = 0; k < 4; k++) {
        const fb = Math.max(0, f - k * 0.06);
        const bx = lerp(x0 + 70, burstX, fb);
        const by = groundY - 12 - 140 * (1 - Math.pow(1 - fb, 2));
        ctx.beginPath();
        ctx.arc(bx, by, 15 - k * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(puckX, puckY, 15, 0, Math.PI * 2);
      ctx.fill();
    } else if (tc < SHOT_T + FLIGHT + 0.8) {
      const f = (tc - SHOT_T - FLIGHT) / 0.8;
      const R = 150 * ease(f);
      const r = Math.max(2, 13 * (1 - f));
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2 + f * 0.9;
        ctx.beginPath();
        ctx.arc(burstX + Math.cos(a) * R, groundY - 152 + Math.sin(a) * R * 0.8, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
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
