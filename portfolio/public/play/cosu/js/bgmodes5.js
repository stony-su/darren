'use strict';
// ─────────────────────────────────────────────────────────────
// bgmodes5: three geometries.
//   kleinian    limit sets of groups of Möbius maps
//   hyperbolic  regular tilings of the Poincaré disc
//   penrose     the aperiodic rhomb tiling, by repeated subdivision
// ─────────────────────────────────────────────────────────────

// ── kleinian ──────────────────────────────────────────────────
// kind 0: the Maskit slice, by Jos Leys' fast algorithm. The trace parameter a + bi walks
//         along the edge of the slice, where the limit set is most intricate.
// kind 1: a necklace of mirrors. Discs round a ring, one inside and one outside, each kissing
//         its neighbours; a point is inverted out of whichever disc holds it until it is free.
BGMODES.kleinian = { id: 'kleinian', scale: 0.8, minScale: 0.45, fs: GL_PRE + `
uniform vec2 uT;           // Maskit: a, b
uniform vec2 uMob;         // necklace: the point the view is centred on, inside the unit disc
uniform float uBeads;
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdiv(vec2 a, vec2 b) { return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / max(dot(b, b), 1e-12); }
vec3 maskit(vec2 z) {      // returns: iterations, which side it left by, how close it came to the limit set
  float a = uT.x, b = uT.y, n = 0., side = 0.;
  vec2 lz = z + vec2(1.), llz = z + vec2(-1.);
  for (int i = 0; i < 64; i++) {
    z.x += b / a * z.y;                                 // the strip leans; straighten it, wrap, lean it back
    z.x = mod(z.x + 1., 2.) - 1.;
    z.x -= b / a * z.y;
    // above the line that separates the two halves of the strip: turn half a turn about (-b/2, a/2)
    if (z.y >= a * .5 + (2. * a - 1.95) / 4. * sign(z.x + b * .5) * (1. - exp(-(7.2 - (1.95 - a) * 15.) * abs(z.x + b * .5)))) z = vec2(-b, a) - z;
    float ir = 1. / max(dot(z, z), 1e-12);              // the other generator: an inversion and a shift
    z *= -ir;
    z = vec2(-b - z.x, a + z.y);
    n += 1.;
    if (dot(z - llz, z - llz) < 1e-6) { side = 2.; break; }     // a two-cycle: inside one of the discs
    if (z.y < 0. || z.y > a) { side = z.y < 0. ? 0. : 1.; break; }
    llz = lz; lz = z;
  }
  return vec3(n, side, 0.);
}
vec3 necklace(vec2 z) {
  float N = uBeads, R = 1., rr = sin(PI / N) / (1. + sin(PI / N));     // ring discs kiss each other and the unit circle from inside
  float ring = 1. - rr, inner = ring - rr, n = 0., last = 0., trap = 1e9;
  for (int i = 0; i < 44; i++) {
    float l = length(z);
    if (l > R) { z /= l * l; last = N + 1.; }                           // outside the outer mirror
    else if (l < inner) { z *= inner * inner / (l * l); last = N; }     // inside the inner one
    else {
      float k = floor(mod(atan(z.y, z.x) + PI / N, TAU) / (TAU / N));
      vec2 c = ring * vec2(cos(k * TAU / N), sin(k * TAU / N)), d = z - c;
      float d2 = dot(d, d);
      if (d2 >= rr * rr) break;                                         // free: in the gaps between the mirrors
      z = c + d * rr * rr / d2;
      last = k;
    }
    trap = min(trap, abs(length(z) - ring));
    n += 1.;
  }
  return vec3(n, last, trap);
}
void main() {
  vec2 p = P() - uCenter;
  float kind = step(.5, uSeed.z);
  vec3 r;
  float depth;
  if (kind < .5) {
    r = maskit(vec2(p.x * 2.5 + uTime * .03, p.y * 2.5 + uT.x * .5));
    depth = r.x / 64.;
  } else {
    vec2 z = rot(uTime * .04) * p * 2.15;
    z = cdiv(z + uMob, vec2(1., 0.) + cmul(vec2(uMob.x, -uMob.y), z));    // slide the view by a Möbius map: the pattern breathes without breaking
    r = necklace(z);
    depth = r.x / 44.;
  }
  float glow = pow(depth, 1.5), lines = smoothstep(.12, .0, abs(fract(r.x * .5) - .5) - .3);
  vec3 tone = pal4(r.x * .045 + r.y * .25 + uSeed.w + .2 * spec(clamp(depth, 0., 1.)));
  vec3 col;
  if (luma(uBase) < .4) col = uBase + tone * (.07 + .2 * lines * (1. - depth)) + mix(tone, uInk, .55) * glow * (.75 + .6 * uBands.x + .4 * uPulse);
  else col = mix(mix(uBase, tone, .2 + .22 * lines), mix(tone, uInk, .35), smoothstep(.1, .8, glow) * .7);
  fragColor = vec4(finish(col), 1.);
}`,
  step(glx, m, U, S) {
    const t = glx.flow * 0.06 + glx.seedV[0] * TAU, th = glx.time * 0.11;
    m.t = [1.925 + 0.07 * Math.cos(t) + 0.01 * glx.bands[0], 0.045 - 0.045 * Math.cos(t * 1.0)];
    const r = 0.32 + 0.12 * Math.sin(glx.time * 0.07) + 0.1 * S.kiai + 0.05 * glx.bands[0];
    m.mob = [r * Math.cos(th), r * Math.sin(th)];
  },
  bind(glx, m, prog) { prog.set('uT', m.t || [1.95, 0.02]).set('uMob', m.mob || [0.3, 0]).set('uBeads', 4 + Math.floor(glx.seedV[3] * 5)); },
};

// ── hyperbolic: {p, q} tilings, by folding every point into one triangle ──────────
const HYP_TILINGS = [[7, 3], [5, 4], [4, 5], [6, 4], [8, 3], [4, 6], [3, 7], [5, 5], [3, 8], [6, 6]];
BGMODES.hyperbolic = { id: 'hyperbolic', scale: 0.85, minScale: 0.5, fs: GL_PRE + `
uniform vec2 uPQ, uMob;
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdiv(vec2 a, vec2 b) { return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / max(dot(b, b), 1e-12); }
void main() {
  vec2 z = (P() - uCenter) * 2.12;
  float outside = step(1., dot(z, z));
  if (outside > .5) z /= dot(z, z);                    // the plane beyond the disc is the disc's reflection
  float rim = 1. - dot(z, z);                          // falls to zero at the circle at infinity
  z = cdiv(z + uMob, vec2(1., 0.) + cmul(vec2(uMob.x, -uMob.y), z));     // a translation of the hyperbolic plane
  z = rot(uTime * .03) * z;
  float p = uPQ.x, q = uPQ.y, wedge = PI / p;
  float s = sqrt(cos(PI / q) * cos(PI / q) - sin(wedge) * sin(wedge));
  vec2 c = vec2(cos(PI / q) / s, 0.);                  // the third mirror: a circle that meets the unit circle at right angles
  float rr = sin(wedge) / s, flips = 0., dEdge = 1e9;
  for (int i = 0; i < 40; i++) {
    float a = mod(atan(z.y, z.x), 2. * wedge);
    if (a > wedge) { a = 2. * wedge - a; flips += 1.; }
    z = length(z) * vec2(cos(a), sin(a));
    vec2 d = z - c;
    float d2 = dot(d, d);
    if (d2 >= rr * rr) { dEdge = sqrt(d2) - rr; break; }
    z = c + d * rr * rr / d2;
    flips += 1.;
  }
  // the folded point lies in one triangle: its edges are the tile's edge, and the two axes through the tile's centre
  float edge = smoothstep(.02, .008, dEdge / (1. - dot(z, z) + .05) * .5);
  float axes = smoothstep(.012, .004, min(z.y, abs(sin(wedge) * z.x - cos(wedge) * z.y)) / (1. - dot(z, z) + .05) * .5);
  float parity = mod(flips, 2.);
  float ringT = length(z) / (c.x - rr);                // 0 at the tile's centre, 1 at the middle of its edge
  vec3 tone = pal4(ringT * .35 + parity * .5 + uSeed.w + .12 * floor(flips * .25));
  float fill = mix(.2, .55, parity) * (.75 + .25 * cos(ringT * 9. - uTime * .8 - uBands.x * 3.));     // rings breathe out from each tile's centre
  vec3 col;
  if (luma(uBase) < .4) {
    col = uBase + tone * fill * (.7 + .5 * rim);
    col += uInk * (edge * (.55 + .4 * uPulse) + axes * .14);
  } else {
    col = mix(uBase, tone, fill * 1.15);
    col = mix(col, uInk, edge * .85 + axes * .22);
  }
  col = mix(col, uBase, outside * .55 + smoothstep(.06, 0., rim) * .5);     // fade into the circle at infinity
  fragColor = vec4(finish(col), 1.);
}`,
  init(glx, m) {
    m.pq = HYP_TILINGS[Math.floor(glx.seedV[2] * HYP_TILINGS.length) % HYP_TILINGS.length];
    m.vel = [0, 0]; m.pos = [0, 0]; m.section = -1; m.k = Math.floor(glx.seedV[2] * HYP_TILINGS.length);
  },
  // A hit pushes the plane away from where it landed.
  onHit(glx, m, p, strength) {
    const dx = glx.center[0] - p[0], dy = glx.center[1] - p[1], l = Math.hypot(dx, dy) || 1;
    m.vel[0] += (dx / l) * 0.35 * strength; m.vel[1] += (dy / l) * 0.35 * strength;
  },
  step(glx, m, U, S, dt) {
    if (S.section !== m.section) {                  // each section is a different tiling
      if (m.section >= 0) m.pq = HYP_TILINGS[(m.k + S.section) % HYP_TILINGS.length];
      m.section = S.section;
    }
    const t = glx.flow * 0.12;
    const drift = [0.3 * Math.cos(t), 0.3 * Math.sin(t * 0.83)];
    for (let i = 0; i < 2; i++) { m.vel[i] *= Math.exp(-dt * 2.2); m.pos[i] += m.vel[i] * dt; m.pos[i] *= Math.exp(-dt * 0.6); }
    let x = drift[0] + m.pos[0], y = drift[1] + m.pos[1];
    const l = Math.hypot(x, y);
    if (l > 0.82) { x *= 0.82 / l; y *= 0.82 / l; }
    m.mob = [x, y];
  },
  bind(glx, m, prog) { prog.set('uPQ', m.pq).set('uMob', m.mob || [0, 0]); },
};

// ── penrose: Robinson triangles, deflated in the shader ───────────────────────────
// A wheel of ten thin triangles round the origin is subdivided again and again; each pixel
// follows the triangle it falls in. Two triangles share each rhomb, and the rhomb's centre
// is the middle of their common edge, so every rhomb can be lit as one piece.
BGMODES.penrose = { id: 'penrose', scale: 0.9, minScale: 0.5, fs: GL_PRE + `
uniform float uDepth, uFront, uSpin, uGain;
const float PHI = 1.61803398875;
float cross2(vec2 a, vec2 b) { return a.x * b.y - a.y * b.x; }
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0., 1.)); }
bool sameSide(vec2 p, vec2 a, vec2 b, vec2 c) { return cross2(b - a, p - a) * cross2(b - a, c - a) >= 0.; }   // is p on c's side of the line a–b?
void main() {
  vec2 ps = P();
  vec2 p = rot(uSpin) * (ps - uCenter);
  float R = 2.4;
  float k = floor(mod(atan(p.y, p.x) + PI / 10., TAU) / (TAU / 10.));
  vec2 A = vec2(0.), B = R * vec2(cos((2. * k - 1.) * PI / 10.), sin((2. * k - 1.) * PI / 10.)), C = R * vec2(cos((2. * k + 1.) * PI / 10.), sin((2. * k + 1.) * PI / 10.));
  if (mod(k, 2.) < .5) { vec2 t = B; B = C; C = t; }
  float type = 0.;
  // the deflation front: inside it the tiling is one level finer
  float levels = uDepth + uGain * step(length(p), uFront);
  for (int i = 0; i < 11; i++) {
    if (float(i) >= levels) break;
    if (type < .5) {
      vec2 Pn = A + (B - A) / PHI;
      if (sameSide(p, C, Pn, B)) { A = C; C = B; B = Pn; }                 // thin (C, P, B)
      else { B = C; C = A; A = Pn; type = 1.; }                            // fat  (P, C, A)
    } else {
      vec2 Q = B + (A - B) / PHI, Rn = B + (C - B) / PHI;
      if (sameSide(p, Q, Rn, B)) { A = Q; C = B; B = Rn; }                 // fat  (Q, R, B)
      else if (sameSide(p, Rn, A, C)) { B = C; C = A; A = Rn; }            // fat  (R, C, A)
      else { vec2 a0 = A; A = Rn; B = Q; C = a0; type = 0.; }              // thin (R, Q, A)
    }
  }
  vec2 mid = (B + C) * .5;                             // the rhomb's centre, shared by its two halves
  float d = min(seg(p, A, B), seg(p, A, C));           // its outline; the edge B–C is inside the rhomb
  float id = hash21(floor(mid * 400.) + uSeed.xy * 31.);
  vec2 midS = transpose(rot(uSpin)) * mid + uCenter;   // back to screen space, to meet the hits
  float lit = 0.;
  vec3 litCol = vec3(0.);
  for (int i = 0; i < 8; i++) {
    float age = uTime - uHits[i].z;
    if (uHits[i].w <= 0. || age < 0. || age > 1.6) continue;
    float dd = length(midS - uHits[i].xy);
    float w = exp(-age * 2.6) * smoothstep(.03, 0., abs(dd - age * .45) - .05) * uHits[i].w;     // a ring of tiles lights and moves outward
    lit += w; litCol += uHitCol[i] * w;
  }
  vec3 tone = pal4((type < .5 ? .0 : .5) + id * .22 + uSeed.w);
  float fill = (type < .5 ? .5 : .24) * (.7 + .3 * id) + .5 * spec(id) * (.25 + .75 * uEnergy);      // every rhomb listens to its own band
  float line = smoothstep(.0055, .002, d);
  vec3 col;
  if (luma(uBase) < .4) {
    col = uBase + tone * fill * .8 + litCol * .8;
    col += uInk * line * (.5 + .4 * uPulse);
  } else {
    col = mix(uBase, tone, fill * 1.2);
    col = mix(col, litCol / max(lit, 1e-3), clamp(lit, 0., 1.) * .8);
    col = mix(col, uInk, line * .85);
  }
  float front = smoothstep(.012, 0., abs(length(p) - uFront)) * step(uFront, 1.6);
  col = mix(col, uInk, front * .35);
  fragColor = vec4(finish(col), 1.);
}`,
  step(glx, m, U, S) {
    // Every eight beats a ring crosses the screen and leaves the tiling one level finer. After two
    // of those a ring closes in from the edge and takes both levels away again.
    const span = 8, gen = Math.floor(S.beats / span), ph = S.beats / span - gen, k = ((gen % 3) + 3) % 3;
    m.depth = k === 1 ? 6 : 5;
    m.gain = k === 2 ? 2 : 1;
    m.front = (k === 2 ? 1 - ph : ph) * 2.2;
    m.spin = glx.time * 0.018 + glx.seedV[0] * TAU;
  },
  bind(glx, m, prog) { prog.set('uDepth', m.depth || 5).set('uFront', m.front || 0).set('uSpin', m.spin || 0).set('uGain', m.gain || 1); },
};
