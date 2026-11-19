'use strict';
// ─────────────────────────────────────────────────────────────
// fx: the bloom effects and the director that schedules them.
// A bloom opens fast, holds for a breath and fades quickly. Only one big
// bloom is ever on screen: a newcomer cuts the previous one instead of
// stacking on it. Blooms are drawn behind the notes, never over them.
// ─────────────────────────────────────────────────────────────

const FX_PRE = GL_PRE + `
uniform float uT, uGrow, uFade;
uniform vec2 uOrigin;
uniform vec4 uA;
uniform vec3 uC0, uC1, uC2;
void emit(vec3 col, float a) { a = clamp(a, 0., 1.) * uFade; fragColor = vec4(col * a, a); }
`;

const FXV_PRE = `#version 300 es
precision highp float;
precision highp int;
uniform float uT, uGrow, uFade, uPx, uCount;
uniform vec2 uOrigin, uP2C;
uniform vec4 uA;
uniform vec3 uC0, uC1, uC2;
out vec4 vCol;
#define PI 3.14159265359
#define TAU 6.28318530718
float hash11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
`;

const FS_POINT = `#version 300 es
precision highp float;
in vec4 vCol;
out vec4 fragColor;
void main() {
  float a = smoothstep(.5, .28, length(gl_PointCoord - .5)) * vCol.a;
  fragColor = vec4(vCol.rgb * a, a);
}`;

const FXDEFS = {
  // layered rose curves with n-fold symmetry
  mandala: { dur: 1.25, grow: 0.5, hold: 0.5, params: r => [r.int(5, 11), r.next(), r.next(), r.next()], fs: FX_PRE + `
void main() {
  vec2 p = P() - uOrigin;
  float r = length(p), a = atan(p.y, p.x), n = uA.x, acc = 0.;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float k = n * (1. + floor(fi * .5));
    float dir = mod(fi, 2.) < .5 ? 1. : -1.;
    float rr = (.10 + .15 * fi) * (1. + .2 * cos(k * a + uT * (1.3 - .15 * fi) * dir + uA.y * 6.)) * (.3 + .7 * uGrow);
    acc += smoothstep(.006 + .0015 * fi, 0., abs(r - rr)) * (1. - fi * .1);
  }
  float spokes = smoothstep(.03, 0., abs(sin(a * n * .5 + uT * .3))) * smoothstep(.08, .3, r) * .35;
  float R = uGrow * 1.15;
  emit(mix(uC0, uC1, smoothstep(.1, .75, r)), (acc + spokes) * smoothstep(R, R - .2, r));
}` },

  // Chladni figure: sand shaking down onto the nodal lines of a vibrating plate
  chladni: { dur: 1.35, grow: 0.6, hold: 0.6, params: r => { const n = r.int(1, 5); let m = r.int(2, 7); if (m === n) m++; return [n, m, r.next(), r.next()]; }, fs: FX_PRE + `
void main() {
  vec2 q = (P() - uOrigin) / .6;
  float n = uA.x, m = uA.y, sgn = uA.z < .5 ? -1. : 1.;
  float v = cos(n * PI * q.x) * cos(m * PI * q.y) + sgn * cos(m * PI * q.x) * cos(n * PI * q.y);
  float plate = smoothstep(1., .94, max(abs(q.x), abs(q.y)));
  float w = mix(.6, .075, uGrow);
  float density = smoothstep(w, 0., abs(v));
  float grain = hash21(floor(gl_FragCoord.xy * (900. / uRes.y) / 1.7) + floor(uT * 24.) * 7.1);
  float sand = density * (.35 + .65 * step(grain, density * density));
  emit(mix(uC0, uC1, .5 + .5 * sin(v * 3.)), sand * plate * .9);
}` },

  // quasicrystal: N plane waves at equal angles
  quasi: { dur: 1.2, grow: 0.5, hold: 0.5, params: r => [r.pick([5, 7, 8, 12]), r.next(), r.next(), r.next()], fs: FX_PRE + `
void main() {
  vec2 p = P() - uOrigin;
  float r = length(p), N = uA.x, s = 0.;
  for (int i = 0; i < 12; i++) {
    if (float(i) >= N) break;
    float a = PI * float(i) / N + uA.y * TAU;
    s += cos(dot(p * 44., vec2(cos(a), sin(a))) + uT * 3.);
  }
  s /= N;
  float line = smoothstep(.14, 0., abs(s - .1)) + smoothstep(.5, .72, s) * .8;
  float R = uGrow * 1.3;
  emit(mix(uC0, uC1, smoothstep(-.3, .6, s)), line * smoothstep(R, R - .25, r) * .6);
}` },

  // a Julia set that opens like a flower
  julia: { dur: 1.5, grow: 0.65, hold: 0.7, params: r => [r.next(), r.next(), r.next(), r.next()], fs: FX_PRE + `
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
void main() {
  vec2 p = P() - uOrigin;
  float r = length(p);
  vec2 z = rot(uA.x * TAU + uT * .25) * p * (3.6 - 1.3 * uGrow);
  float th = uA.y * TAU + uT * .8;
  vec2 c = .7885 * vec2(cos(th), sin(th));
  vec2 dz = vec2(1., 0.);
  float m2 = 0., n = 0.;
  for (int i = 0; i < 48; i++) { dz = 2. * cmul(z, dz); z = cmul(z, z) + c; m2 = dot(z, z); if (m2 > 64.) break; n += 1.; }
  float a = .08;
  vec3 col = uC2;
  if (m2 > 64.) {
    float d = .5 * sqrt(m2 / max(dot(dz, dz), 1e-12)) * log(m2);
    float sn = n + 1. - log(log(m2) * .5) / log(2.);
    a = exp(-d * 24.) + .22 * exp(-d * 3.5);
    col = mix(uC0, uC1, .5 + .5 * sin(sn * .55));
  }
  float R = uGrow * 1.25;
  emit(col, a * smoothstep(R, R - .3, r));
}` },

  // recursive subdivision: panels light in a wave from the origin, then drain
  subdiv: { dur: 1.0, grow: 0.9, hold: 0.9, params: r => [r.next(), r.next(), r.next(), r.next()], fs: FX_PRE + `
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float asp = uRes.x / uRes.y;
  vec2 lo = vec2(0.), hi = vec2(1.);
  float id = 1. + uA.x * 50.;
  for (int i = 0; i < 6; i++) {
    vec2 sz = hi - lo;
    if (i > 2 && hash11(id * 1.37 + 3.) < .28) break;
    float t = mix(.32, .68, hash11(id * 7.13 + float(i)));
    if (sz.x * asp > sz.y) { float s = lo.x + sz.x * t; if (uv.x < s) { hi.x = s; id = id * 2. + 1.; } else { lo.x = s; id = id * 2. + 2.; } }
    else { float s = lo.y + sz.y * t; if (uv.y < s) { hi.y = s; id = id * 2. + 1.; } else { lo.y = s; id = id * 2. + 2.; } }
  }
  vec2 c = (lo + hi) * .5, hf = (hi - lo) * .5;
  float delay = length((c - .5) * vec2(asp, 1.) - uOrigin) * .5 + hash11(id) * .08;
  float t = uT - delay;
  float on = smoothstep(0., .07, t) * (1. - smoothstep(.1, .42, t));
  vec2 d = hf - abs(uv - c);
  float edge = min(d.x * asp, d.y);
  float border = smoothstep(.0045, .0015, edge);
  float hatch = smoothstep(.35, .15, abs(fract((uv.x * asp + uv.y) * 46.) - .5));
  float filled = step(hash11(id + 9.), .4);
  float h = hash11(id * 3.3);
  vec3 col = h < .34 ? uC0 : h < .67 ? uC1 : uC2;
  emit(col, on * max(border, filled * hatch * .55));
}` },

  // cracks spreading through glass
  shatter: { dur: 1.4, grow: 0.35, hold: 0.7, params: r => [r.next(), r.next(), r.next(), r.next()], fs: FX_PRE + `
void main() {
  vec2 p = P() - uOrigin;
  float r = length(p);
  vec2 x = p * 6.5 + uA.xy * 30.;
  vec2 n = floor(x), f = fract(x), mg = vec2(0.), mr = vec2(0.);
  float md = 8.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j)), rr = g + hash22(n + g) - f;
    float d = dot(rr, rr);
    if (d < md) { md = d; mr = rr; mg = g; }
  }
  float e = 8.;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j)), rr = g + hash22(n + g) - f;
    if (dot(mr - rr, mr - rr) > 1e-5) e = min(e, dot(.5 * (mr + rr), normalize(rr - mr)));
  }
  float R = uGrow * 1.5;
  emit(uC0, smoothstep(.04, 0., e) * smoothstep(R, R - .1, r));
}` },

  // nested Gielis superformula shapes
  superformula: { dur: 1.2, grow: 0.5, hold: 0.5, params: r => r.pick([[5, 2, 7, 7], [6, 1, 7, 8], [7, 3, 4, 17], [3, 4.5, 10, 10], [8, 1.5, 4, 4], [12, 3, 2, 9]]), fs: FX_PRE + `
float sf(float th) {
  float a = pow(abs(cos(uA.x * th * .25)), uA.z) + pow(abs(sin(uA.x * th * .25)), uA.w);
  return pow(max(a, 1e-4), -1. / uA.y);
}
void main() {
  vec2 p = P() - uOrigin;
  float r = length(p), th = atan(p.y, p.x), acc = 0.;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float g = clamp(uGrow * 1.7 - fi * .1, 0., 1.);
    float rr = clamp(sf(th + fi * .22 * sin(uT * .9) + uT * .2), 0., 1.7) * (.07 + .075 * fi) * g;
    acc += smoothstep(.0055, 0., abs(r - rr)) * g * (1. - fi * .09);
  }
  emit(mix(uC0, uC1, clamp(r * 1.8, 0., 1.)), acc);
}` },

  // two ring families sliding across each other
  moire: { dur: 1.1, grow: 0.5, hold: 0.45, params: r => [r.next(), r.next(), r.next(), r.next()], fs: FX_PRE + `
void main() {
  vec2 p = P() - uOrigin;
  vec2 o = .06 * vec2(cos(uT * 2.2 + uA.x * 6.), sin(uT * 1.7 + uA.y * 6.)) * (1. + uGrow);
  float r1 = smoothstep(.24, .1, abs(fract(length(p - o) * 27.) - .5));
  float r2 = smoothstep(.24, .1, abs(fract(length(p + o) * 27.) - .5));
  float R = uGrow * 1.25;
  emit(mix(uC0, uC1, r2 / max(r1 + r2, 1e-3)), (r1 + r2) * .42 * smoothstep(R, R - .22, length(p)));
}` },

  // a halftone screen with a wave travelling through the dot sizes
  halftone: { dur: 1.15, grow: 0.55, hold: 0.5, params: r => [r.next(), r.next(), r.next(), r.next()], fs: FX_PRE + `
void main() {
  vec2 p = rot(uA.y * 1.2) * (P() - uOrigin);
  const float S = 24.;
  vec2 g = p * S, id = floor(g) + .5, f = g - id;
  float d = length(id) / S;
  float wave = .5 + .5 * sin(d * 15. - uT * 9. + uA.x * 6.);
  float R = uGrow * 1.35;
  float rad = .47 * wave * smoothstep(R, R - .4, d);
  emit(mix(uC0, uC1, wave), smoothstep(rad, rad - .09, length(f)) * step(.03, rad) * .7);
}` },

  // Apollonian gasket by repeated folding and inversion
  apollo: { dur: 1.3, grow: 0.6, hold: 0.6, params: r => [r.next(), r.next(), r.next(), r.next()], fs: FX_PRE + `
void main() {
  vec2 q = P() - uOrigin;
  vec2 p = rot(uT * .2 + uA.x * TAU) * q * (2.7 - .8 * uGrow);
  float scale = 1., s = 1.16 + .12 * uA.y, trap = 1e9;
  for (int i = 0; i < 7; i++) {
    p = -1. + 2. * fract(.5 * p + .5);
    float r2 = dot(p, p), k = s / r2;
    p *= k; scale *= k;
    trap = min(trap, r2);
  }
  float d = .25 * abs(p.y) / scale;
  float R = uGrow * 1.3;
  emit(mix(uC0, uC1, clamp(trap * 2.2, 0., 1.)), smoothstep(.0055, 0., d) * smoothstep(R, R - .25, length(q)) * .7);
}` },

  // Sierpinski carpet: one more level of holes with each step of growth
  carpet: { dur: 1.3, grow: 0.8, hold: 0.8, params: r => [r.next(), r.next(), r.next(), r.next()], fs: FX_PRE + `
void main() {
  vec2 q = rot((uA.x - .5) * .5) * (P() - uOrigin) / .88 + .5;
  float inside = step(0., q.x) * step(q.x, 1.) * step(0., q.y) * step(q.y, 1.);
  float levels = 1. + floor(uGrow * 4.99), hole = 0., lv = 0.;
  vec2 u = q;
  for (int i = 0; i < 5; i++) {
    if (float(i) >= levels) break;
    vec2 c = floor(u * 3.);
    if (c.x == 1. && c.y == 1.) { hole = 1.; lv = float(i); break; }
    u = fract(u * 3.);
  }
  emit(mix(uC0, uC1, lv / 4.), hole * inside * (.3 + .7 * step(levels - 1.5, lv)) * .7);
}` },

  // Rule 90: an elementary cellular automaton unrolling from the top of the screen
  rule90: { dur: 1.4, grow: 0.8, hold: 0.8, params: r => [r.next(), r.next(), r.next(), r.next()], fs: FX_PRE + `
void main() {
  float cs = uRes.y / 128.;
  vec2 g = vec2(gl_FragCoord.x - .5 * uRes.x - uOrigin.x * uRes.y, uRes.y - gl_FragCoord.y) / cs;
  ivec2 c = ivec2(floor(g));
  int n = c.y, k = c.x + n;
  float a = 0.;
  if (n >= 0 && k >= 0 && k <= 2 * n && (k & 1) == 0) { int kk = k / 2; if ((kk & (n - kk)) == 0) a = 1.; }   // Pascal triangle mod 2
  vec2 f = abs(fract(g) - .5);
  float cell = smoothstep(.5, .32, max(f.x, f.y));
  float front = uGrow * 132.;
  float lit = step(float(n), front) * (.7 + .3 * exp(-(front - float(n)) * .12));
  emit(mix(uC0, uC1, float(n) / 128.), a * cell * lit);
}` },

  // the Mandelbrot set itself, for the two-hundredth combo
  mandel: { dur: 1.6, grow: 0.7, hold: 0.8, params: r => [r.next(), r.next(), r.next(), r.next()], fs: FX_PRE + `
void main() {
  vec2 q = P() - uOrigin;
  vec2 c = vec2(-.62, 0.) + rot((uA.x - .5) * .5) * q * mix(3.6, 2.5, uGrow);
  vec2 z = vec2(0.), dz = vec2(0.);
  float m2 = 0., n = 0.;
  for (int i = 0; i < 64; i++) {
    dz = 2. * vec2(z.x * dz.x - z.y * dz.y, z.x * dz.y + z.y * dz.x) + vec2(1., 0.);
    z = vec2(z.x * z.x - z.y * z.y, 2. * z.x * z.y) + c;
    m2 = dot(z, z);
    if (m2 > 64.) break;
    n += 1.;
  }
  float a = .1;
  vec3 col = uC2;
  if (m2 > 64.) {
    float d = .5 * sqrt(m2 / max(dot(dz, dz), 1e-12)) * log(m2);
    float sn = n + 1. - log(log(m2) * .5) / log(2.);
    a = exp(-d * 50.) + .2 * exp(-d * 6.) + .12 * smoothstep(.12, 0., abs(fract(sn * .5) - .5));
    col = mix(uC0, uC1, .5 + .5 * sin(sn * .6));
  }
  float R = uGrow * 1.3;
  emit(col, a * smoothstep(R, R - .3, length(q)));
}` },

  // the spectrum as a crown of bars, bass at the top, mirrored left and right
  spectrum: { dur: 1.5, grow: 0.35, hold: 0.9, params: r => [r.pick([48, 64, 96]), r.next(), r.next(), r.next()], fs: FX_PRE + `
void main() {
  vec2 p = P() - uOrigin;
  float r = length(p), a = abs(atan(p.x, p.y)) / PI;        // 0 at the top, 1 at the bottom, the same on both sides
  float n = uA.x, k = (floor(a * n) + .5) / n;
  float v = spec(k * .92) * uGrow;
  float r0 = .2 + .03 * uBands.x, r1 = r0 + .02 + v * .34;
  float gapm = smoothstep(.5, .36, abs(fract(a * n) - .5));
  float bar = step(r0, r) * smoothstep(r1 + .004, r1 - .004, r) * gapm;
  float cap = smoothstep(.006, .002, abs(r - r1 - .012)) * gapm;
  float ring = smoothstep(.004, .001, abs(r - r0 + .012));
  emit(mix(uC0, uC1, k), bar * .55 + cap * .9 + ring * .5);
}` },

  // the waveform wrapped round a circle, three times, each a little later than the last
  waveform: { dur: 1.4, grow: 0.4, hold: 0.85, params: r => [r.int(1, 3), r.next(), r.next(), r.next()], fs: FX_PRE + `
void main() {
  vec2 p = P() - uOrigin;
  float r = length(p), a = atan(p.y, p.x) / TAU + .5, acc = 0.;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x = abs(fract(a * uA.x + fi * .21 + uT * .03) * 2. - 1.);     // folded, so the ring closes on itself
    float rr = (.16 + .1 * fi) * uGrow + wave(x) * (.035 + .02 * fi);
    acc += smoothstep(.0055, .0012, abs(r - rr)) * (1. - fi * .22);
  }
  emit(mix(uC0, uC1, smoothstep(.1, .45, r)), acc);
}` },

  // the spinner's galaxy: logarithmic arms that turn with the player
  spiral: { continuous: true, fs: FX_PRE + `
void main() {
  vec2 p = P() - uOrigin;
  float r = length(p), a = atan(p.y, p.x);
  float arms = uA.x;
  float sp = a * arms + log(r + .02) * 5.5 - uA.y * arms;
  float band = pow(.5 + .5 * cos(sp), 3.);
  float dust = vnoise(vec2(log(r + .02) * 7., a * 3. + uA.y) * 2.5);
  float core = exp(-r * 10.);
  emit(mix(uC0, uC1, smoothstep(.05, .5, r)), (band * (.3 + .7 * dust) * smoothstep(.78, .12, r) + core) * uA.z);
}` },

  // phyllotaxis: seeds at the golden angle, born from the centre outward
  phyllo: { points: 1500, dur: 1.3, grow: 0.6, hold: 0.55, params: r => [r.pick([8, 13, 21]), r.next(), r.next(), r.next()], vs: FXV_PRE + `
void main() {
  float i = float(gl_VertexID), n = i / uCount;
  float ang = i * 2.39996323 + uT * .5 * (uA.z - .5);
  float born = smoothstep(n - .1, n + .02, uGrow * 1.14 - .1);
  float r = sqrt(n) * .82 * (.3 + .7 * uGrow);
  vec2 p = uOrigin + r * vec2(cos(ang), sin(ang));
  gl_Position = vec4(p * uP2C, 0., 1.);
  gl_PointSize = uPx * (3. + 11. * sqrt(n)) * born;
  vCol = vec4(mix(uC0, uC1, mod(i, uA.x) / uA.x), born * uFade * .9);
}` },

  // chaos game: fern, Sierpinski triangle, Heighway dragon, Lévy C, Koch curve, tree
  ifs: { points: 70000, dur: 1.5, grow: 0.7, hold: 0.7, params: r => [r.range(-0.3, 0.3), r.range(0.9, 1.15), r.int(0, 5), r.next()], vs: FXV_PRE + `
uniform vec4 uMa[4];
uniform vec4 uMt[4];
uniform vec4 uBox;
void main() {
  float id = float(gl_VertexID);
  vec2 p = vec2(0.);
  float tone = 0.;
  for (int k = 0; k < 18; k++) {
    float h = hash11(id * .7310 + float(k) * 17.171 + uA.w * 31.);
    int j = h < uMt[0].z ? 0 : h < uMt[1].z ? 1 : h < uMt[2].z ? 2 : 3;
    vec4 m = uMa[j];
    p = vec2(m.x * p.x + m.y * p.y, m.z * p.x + m.w * p.y) + uMt[j].xy;
    tone = mix(tone, float(j) / 3., .45);
  }
  vec2 q = (p - uBox.xy) * uBox.z;
  float along = uBox.w < .5 ? q.y + .5 : length(q) * 1.3;
  float g = uGrow * 1.3 - .1;
  float born = 1. - smoothstep(g - .12, g + .04, along);
  q = rot(uA.x) * q * uA.y;
  gl_Position = vec4((uOrigin + q) * uP2C, 0., 1.);
  gl_PointSize = uPx * 1.7 * born;
  vCol = vec4(mix(uC0, uC1, tone), born * uFade * .75);
}` },

  // Hilbert curve drawing itself
  hilbert: { points: 1023 * 8, dur: 1.3, grow: 0.75, hold: 0.75, params: r => [r.pick([0, Math.PI / 4]), r.range(0.7, 0.85), r.next(), r.next()], vs: FXV_PRE + `
ivec2 d2xy(int n, int d) {
  int x = 0, y = 0, t = d;
  for (int s = 1; s < n; s *= 2) {
    int rx = 1 & (t / 2), ry = 1 & (t ^ rx);
    if (ry == 0) { if (rx == 1) { x = s - 1 - x; y = s - 1 - y; } int tmp = x; x = y; y = tmp; }
    x += s * rx; y += s * ry;
    t /= 4;
  }
  return ivec2(x, y);
}
void main() {
  const int ORD = 32;
  float i = float(gl_VertexID), seg = floor(i / 8.), f = fract(i / 8.);
  vec2 a = vec2(d2xy(ORD, int(seg))), b = vec2(d2xy(ORD, int(min(seg + 1., float(ORD * ORD - 1)))));
  vec2 q = (mix(a, b, f) / float(ORD - 1) - .5) * uA.y;
  float n = i / uCount, head = uGrow * 1.06;
  float born = step(n, head), tip = exp(-(head - n) * 40.) * born;
  gl_Position = vec4((uOrigin + rot(uA.x) * q) * uP2C, 0., 1.);
  gl_PointSize = uPx * (3.6 + 5. * tip) * born;
  vCol = vec4(mix(uC0, uC1, n) + uC2 * tip, born * uFade * (.85 + .15 * tip));
}` },

  // a decaying Lissajous trace, as on an oscilloscope
  scope: { points: 7000, dur: 1.2, grow: 0.7, hold: 0.65, params: r => { const [a, b] = r.pick([[3, 2], [3, 4], [5, 4], [2, 5], [5, 6], [4, 7], [7, 6]]); return [a, b, r.range(4, 7), r.next()]; }, vs: FXV_PRE + `
void main() {
  float i = float(gl_VertexID), n = i / uCount;
  float t = n * TAU * uA.z;
  float decay = exp(-n * 1.5);
  vec2 q = vec2(sin(uA.x * t * .5 + uT * .8), sin(uA.y * t * .5 + uA.w * TAU)) * decay * .44;
  float head = uGrow * 1.05;
  float born = step(n, head), tip = exp(-(head - n) * 28.) * born;
  gl_Position = vec4((uOrigin + q) * uP2C, 0., 1.);
  gl_PointSize = uPx * (3.2 + 4.5 * tip) * born;
  vCol = vec4(mix(uC0, uC1, n) + uC2 * tip * .6, born * uFade * (.8 + .2 * tip));
}` },

  // Maurer rose: 360 chords between points of r = sin(n·θ) taken d degrees apart
  maurer: { points: 360 * 24, dur: 1.3, grow: 0.7, hold: 0.7, params: r => { const [n, d] = r.pick([[2, 39], [3, 47], [4, 31], [5, 97], [6, 71], [7, 19], [2, 29], [6, 37]]); return [n, d, r.next(), r.next()]; }, vs: FXV_PRE + `
void main() {
  float i = float(gl_VertexID), seg = floor(i / 24.), f = fract(i / 24.);
  float k0 = seg * uA.y * PI / 180., k1 = (seg + 1.) * uA.y * PI / 180.;
  vec2 a = sin(uA.x * k0) * vec2(cos(k0), sin(k0)), b = sin(uA.x * k1) * vec2(cos(k1), sin(k1));
  vec2 q = mix(a, b, f) * .58 * (.4 + .6 * uGrow);
  float n = seg / 360., born = step(n, uGrow * 1.08);
  gl_Position = vec4((uOrigin + rot(uT * .25) * q) * uP2C, 0., 1.);
  gl_PointSize = uPx * 2.6 * born;
  vCol = vec4(mix(uC0, uC1, n), born * uFade * .85);
}` },

  // streamlines: every line grows from its root along a noise field
  flow: { points: 560 * 48, dur: 1.3, grow: 0.7, hold: 0.65, params: r => [r.next(), r.next(), r.next(), r.next()], vs: FXV_PRE + `
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  float i = float(gl_VertexID), line = floor(i / 48.), st = mod(i, 48.);
  vec2 p = (vec2(hash11(line * 1.31 + uA.x * 9.), hash11(line * 2.77 + uA.y * 9.)) * 2. - 1.) * vec2(.95, .55);
  for (int k = 0; k < 48; k++) {
    if (float(k) >= st) break;
    float a = (vn(p * 2.3 + uA.zw * 10.) * 2. - 1.) * 3.4 + uA.z * 6.;
    p += vec2(cos(a), sin(a)) * .0105;
  }
  float n = st / 48., born = step(n, uGrow * 1.1);
  gl_Position = vec4((uOrigin + p) * uP2C, 0., 1.);
  gl_PointSize = uPx * (3.6 - 1.8 * n) * born;
  vCol = vec4(mix(uC0, uC1, hash11(line * .73)), born * uFade * .9);
}` },

  // results: staggered bursts, each a little sphere of golden-angle sparks
  fireworks: { points: 2400, dur: 3.4, grow: 3.4, hold: 2.9, params: r => [r.next(), r.next(), r.next(), r.next()], vs: FXV_PRE + `
void main() {
  float i = float(gl_VertexID), b = floor(i / 300.), k = mod(i, 300.);
  float t = uT - (b * .3 + hash11(b * 3.7 + uA.w) * .12);
  vec2 o = uOrigin + vec2((hash11(b * 5.1 + uA.x) - .5) * 1.0, (hash11(b * 9.3 + uA.y) - .5) * .45 + .06);
  float ang = k * 2.39996 + b, sp = (.3 + .7 * sqrt(hash11(k * .37 + b * 11.))) * .46;
  float e = 1. - exp(-max(t, 0.) * 3.4);
  vec2 p = o + vec2(cos(ang), sin(ang)) * sp * e + vec2(0., -.1 * t * t);
  float life = clamp(1. - t / 1.5, 0., 1.), on = step(0., t) * life;
  gl_Position = vec4(p * uP2C, 0., 1.);
  gl_PointSize = uPx * (3. + 5. * life) * on;
  float h = mod(b, 3.);
  vCol = vec4(h < .5 ? uC0 : h < 1.5 ? uC1 : uC2, on * life * uFade);
}` },
};

// Affine maps for the chaos game: [a, b, c, d, e, f, cumulative probability] and the fit box [cx, cy, scale, radial]
const IFS_SETS = [
  { maps: [[0, 0, 0, 0.16, 0, 0, 0.01], [0.85, 0.04, -0.04, 0.85, 0, 1.6, 0.86], [0.2, -0.26, 0.23, 0.22, 0, 1.6, 0.93], [-0.15, 0.28, 0.26, 0.24, 0, 0.44, 1]], box: [0.24, 5, 0.092, 0] },
  { maps: [[0.5, 0, 0, 0.5, 0, 0, 0.3334], [0.5, 0, 0, 0.5, 0.5, 0, 0.6667], [0.5, 0, 0, 0.5, 0.25, 0.433, 2], [0, 0, 0, 0, 0, 0, 2]], box: [0.5, 0.36, 0.95, 1] },
  { maps: [[0.5, -0.5, 0.5, 0.5, 0, 0, 0.5], [-0.5, -0.5, 0.5, -0.5, 1, 0, 2], [0, 0, 0, 0, 0, 0, 2], [0, 0, 0, 0, 0, 0, 2]], box: [0.42, 0.17, 0.62, 1] },
  { maps: [[0.5, -0.5, 0.5, 0.5, 0, 0, 0.5], [0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 2], [0, 0, 0, 0, 0, 0, 2], [0, 0, 0, 0, 0, 0, 2]], box: [0.5, 0.375, 0.5, 1] },
  { maps: [[1 / 3, 0, 0, 1 / 3, 0, 0, 0.25], [1 / 6, -0.2887, 0.2887, 1 / 6, 1 / 3, 0, 0.5], [1 / 6, 0.2887, -0.2887, 1 / 6, 0.5, 0.2887, 0.75], [1 / 3, 0, 0, 1 / 3, 2 / 3, 0, 2]], box: [0.5, 0.14, 0.95, 1] },
  { maps: [[0, 0, 0, 0.5, 0, 0, 0.05], [0.42, -0.42, 0.42, 0.42, 0, 0.2, 0.45], [0.42, 0.42, -0.42, 0.42, 0, 0.2, 0.85], [0.1, 0, 0, 0.1, 0, 0.2, 2]], box: [0, 0.3, 1.25, 0] },
];

const VS_HITBLOOM = `#version 300 es
precision highp float;
uniform vec4 uHits[8];
uniform vec3 uHitCol[8];
uniform float uTime, uSize;
uniform vec2 uP2C;
out vec2 vUv;
out vec3 vCol;
out vec3 vK;
void main() {
  int i = gl_InstanceID;
  vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2. - 1.;
  float age = uTime - uHits[i].z;
  float on = (uHits[i].w > 0. && age >= 0. && age < .45) ? 1. : 0.;
  vUv = c; vCol = uHitCol[i]; vK = vec3(age / .45, uHits[i].w, float(i));
  gl_Position = vec4((uHits[i].xy + c * uSize * on * (.6 + .4 * uHits[i].w)) * uP2C, 0., 1.);
}`;
const FS_HITBLOOM = `#version 300 es
precision highp float;
uniform float uFade;
in vec2 vUv;
in vec3 vCol;
in vec3 vK;
out vec4 fragColor;
void main() {
  float r = length(vUv), a = atan(vUv.y, vUv.x);
  float g = 1. - pow(1. - clamp(vK.x, 0., 1.), 3.);
  float k = 5. + mod(vK.z, 4.);
  float pr = g * (.62 + .2 * cos(k * a + vK.z * 1.7));
  float petal = smoothstep(.06, 0., abs(r - pr));
  float ring = smoothstep(.035, 0., abs(r - g * .92)) * .55;
  float core = exp(-r * r * 9.) * (1. - g) * .55;
  float fade = (1. - vK.x) * (1. - vK.x);
  float al = clamp((petal + ring + core) * fade * vK.y, 0., 1.) * uFade * step(r, 1.);
  fragColor = vec4(vCol * al, al);
}`;

// Sparks: each hit throws a burst of points, and the whole flight of every point is computed from
// the hit's time and place, so nothing is stored. The hit picks one of four figures:
// a golden-angle spray, spiral arms, a ring, or a star.
const VS_SPARK = `#version 300 es
precision highp float;
precision highp int;
uniform vec4 uSrc[8];
uniform vec3 uSrcCol[8];
uniform float uTime, uPx, uCount, uReach, uLife, uFade, uDark;
uniform vec2 uP2C;
uniform vec3 uInk;
out vec4 vCol;
#define TAU 6.28318530718
float hash11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
void main() {
  int i = gl_InstanceID;
  float k = float(gl_VertexID), age = uTime - uSrc[i].z, w = uSrc[i].w;
  gl_Position = vec4(2., 2., 0., 1.); gl_PointSize = 0.; vCol = vec4(0.);
  if (w <= 0. || age < 0. || age > uLife || k > uCount * (.35 + .65 * w)) return;
  float id = uSrc[i].z * 7.31 + float(i);
  float h1 = hash11(k * .731 + id), h2 = hash11(k * 1.37 + id * 1.7 + 5.), h3 = hash11(k * 2.11 + id + 9.);
  float fig = floor(hash11(id * 3.3) * 4.);
  float ang = k * 2.39996323 + id, sp = .35 + .65 * sqrt(h2);
  if (fig > .5 && fig < 1.5) { float arms = 3. + floor(hash11(id) * 4.); ang = floor(h1 * arms) / arms * TAU + sp * 2.6 + id; }
  else if (fig > 2.5) { float n = 4. + floor(hash11(id + 2.) * 4.); sp *= .55 + .45 * abs(cos(ang * n * .5)); }
  else if (fig > 1.5) sp = .82 + .18 * h2;
  float u = age / uLife, flown = 1. - exp(-age * 7.);       // fast out, then drifting
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 p = uSrc[i].xy + dir * sp * uReach * flown * (.6 + .4 * w);
  p += vec2(-dir.y, dir.x) * sin(age * 9. + h3 * TAU) * .006 * u;
  p.y -= .05 * age * age;
  gl_Position = vec4(p * uP2C, 0., 1.);
  gl_PointSize = uPx * (1.6 + 3.8 * h3) * (1. - .6 * u);
  vCol = vec4(mix(uSrcCol[i], uInk, uDark * step(.82, h1) * .7), (1. - u) * (1. - u) * uFade * (.55 + .45 * h2));
}`;

const FX = {
  level: 1, cur: null, ghost: null, order: [], oi: 0, rng: new RNG(1), penI: 0,
  spin: null, spinAmt: 0, spinRot: 0, foldT: -99, queue: [], queueAt: 0, lastBig: -99,

  reset(seed) {
    this.cur = this.ghost = null; this.spin = null; this.spinAmt = 0; this.queue = []; this.foldT = -99;
    this.rng = new RNG(seed, 777);
    const o = ['phyllo', 'mandala', 'chladni', 'ifs', 'quasi', 'hilbert', 'superformula', 'scope', 'maurer', 'flow', 'rule90', 'moire', 'halftone', 'apollo', 'carpet', 'spectrum', 'waveform'];
    for (let i = o.length - 1; i > 0; i--) { const j = this.rng.int(0, i); [o[i], o[j]] = [o[j], o[i]]; }
    this.order = o; this.oi = 0; this.penI = 0;
    if (GLX.ok) { GLX.fold = 0; GLX.glitch = 0; GLX.flash = 0; }
  },

  // Start a big bloom. Returns false when it yields to one that has only just opened.
  bloom(type, opts = {}) {
    if (!GLX.ok || this.level <= 0.01) return false;
    const def = FXDEFS[type], now = GLX.time;
    if (!def) return false;
    if (this.cur && now - this.cur.t0 < (opts.yieldUnder !== undefined ? opts.yieldUnder : opts.force ? 0 : 0.4)) return false;
    if (this.cur) { this.ghost = this.cur; this.ghost.cut = now; }
    const pens = GLX.pal.v.pens, i = this.penI++;
    this.cur = {
      type, def, t0: now, cut: null,
      origin: opts.origin || [GLX.center[0], GLX.center[1]],
      a: opts.a || def.params(this.rng),
      colors: opts.colors || [pens[i % 4], pens[(i + 1) % 4], GLX.pal.dark ? GLX.pal.v.ink : pens[(i + 2) % 4]],
      gain: opts.gain || 1,
    };
    this.lastBig = now;
    return true;
  },

  next() { const t = this.order[this.oi++ % this.order.length]; return t; },

  // ── hooks called by the app ────────────────────────────────
  onCombo(combo) {
    if (combo % 100 === 0) this.bloom(combo % 200 === 0 ? 'mandel' : 'julia', { force: true });
    else this.bloom(this.next());
  },
  onSection(sec, prev) {
    if (!GLX.ok) return;
    if (sec.kiai) {
      this.bloom('mandala', { force: true, gain: 1.15 });
      this.foldT = GLX.time;
      GLX.flash = 0.22; GLX.flashCol = GLX.pal.dark ? GLX.pal.v.pens[this.penI % 4] : [-0.25, -0.25, -0.25];
    } else if (prev) {
      this.bloom('subdiv', { yieldUnder: 0.9 });      // a milestone bloom that has just opened keeps the screen
    }
  },
  onMiss() { if (GLX.ok) GLX.glitch = 0.55; },
  onSpinnerDone() { this.bloom('phyllo', { force: true, gain: 1.1 }); },
  onFail() { this.queue = []; this.bloom('shatter', { force: true }); },
  onResults(grade) {
    this.queue = grade === 'SS' ? ['fireworks', 'julia', 'phyllo'] : grade === 'S' ? ['fireworks', 'mandala'] : grade === 'A' ? ['phyllo'] : [];
    this.queueAt = GLX.time + 0.5;
  },

  envelope(b, now) {
    const age = now - b.t0, d = b.def;
    const u = clamp(age / d.grow, 0, 1);
    const grow = 1 - Math.pow(1 - u, 3);
    let fade = age < d.hold ? 1 : 1 - clamp((age - d.hold) / (d.dur - d.hold), 0, 1);
    fade = fade * fade * (3 - 2 * fade);
    if (b.cut !== null) fade *= 1 - clamp((now - b.cut) / 0.14, 0, 1);
    return { age, grow, fade, dead: age >= d.dur || (b.cut !== null && now - b.cut >= 0.14) };
  },

  drawBloom(glx, U, b, env) {
    const gl = glx.gl, d = b.def, t = glx.bgT;
    const dark = glx.pal.dark;
    const fade = env.fade * this.level * b.gain * (dark ? 0.9 : d.points ? 1 : 0.8);   // dots need more weight on a light ground
    if (fade <= 0.003) return;
    const p2c = [2 * glx.h / glx.w, 2];
    let p;
    if (d.points) {
      p = glx.prog('fx:' + b.type, FS_POINT, d.vs).use();
      p.set('uT', env.age).set('uGrow', env.grow).set('uFade', fade).set('uOrigin', b.origin).set('uA', b.a)
        .set('uC0', b.colors[0]).set('uC1', b.colors[1]).set('uC2', b.colors[2])
        .set('uP2C', p2c).set('uPx', (t.h / 900) * (dark ? 1 : 1.3)).set('uCount', d.points);
      if (b.type === 'ifs') {
        const set = IFS_SETS[Math.floor(b.a[2]) % IFS_SETS.length];
        const ma = new Float32Array(16), mt = new Float32Array(16);
        set.maps.forEach((m, i) => { ma.set(m.slice(0, 4), i * 4); mt.set([m[4], m[5], m[6], 0], i * 4); });
        p.set('uMa', ma).set('uMt', mt).set('uBox', set.box);
      }
      gl.drawArrays(gl.POINTS, 0, d.points);
    } else {
      p = glx.prog('fx:' + b.type, d.fs).use();
      p.setAll(U).set('uRes', [t.w, t.h]).set('uT', env.age).set('uGrow', env.grow).set('uFade', fade).set('uOrigin', b.origin).set('uA', b.a)
        .set('uC0', b.colors[0]).set('uC1', b.colors[1]).set('uC2', b.colors[2]);
      glx.tri();
    }
  },

  warm(glx) {
    if (this.warmList === undefined) {
      this.warmList = Object.keys(FXDEFS).map(k => ['fx:' + k, FXDEFS[k].points ? FS_POINT : FXDEFS[k].fs, FXDEFS[k].points ? FXDEFS[k].vs : undefined]);
      this.warmList.push(['fx:hitbloom', FS_HITBLOOM, VS_HITBLOOM]);
      this.warmList.push(['fx:spark', FS_POINT, VS_SPARK]);
      this.warmTick = 0;
    }
    if (!this.warmList.length || this.warmTick++ % 2) return;
    const [name, fs, vs] = this.warmList[0];
    try {
      const gl = glx.gl, prog = glx.prog(name, fs, vs);
      if (!prog.done) return;                         // still compiling on another thread
      this.warmList.shift();
      // Compiling is not enough: Direct3D back ends finish the job on the first draw, so draw once, off screen.
      const p = prog.use();
      if (!this.warmT) this.warmT = glx.makeTarget(4, 4);
      glx.target(this.warmT);
      p.set('uRes', [4, 4]).set('uFade', 0).set('uCount', 1).set('uP2C', [1, 1]);
      if (name === 'fx:hitbloom') { p.set('uHits', glx.hits).set('uHitCol', glx.hitCols); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 1); }
      else if (name === 'fx:spark') { p.set('uSrc', glx.hits).set('uSrcCol', glx.hitCols); gl.drawArraysInstanced(gl.POINTS, 0, 1, 1); }
      else if (vs) gl.drawArrays(gl.POINTS, 0, 1);
      else glx.tri();
    } catch (e) { console.error(e.message); if (this.warmList[0] && this.warmList[0][0] === name) this.warmList.shift(); }
  },

  draw(glx, U, S) {
    const gl = glx.gl, now = glx.time;
    this.level = S.fx;
    this.warm(glx);
    // kaleidoscope fold: quick in, slower out
    const fa = now - this.foldT;
    glx.fold = fa < 0 || fa > 1.1 ? 0 : fa < 0.16 ? fa / 0.16 : 1 - (fa - 0.16) / 0.94;
    glx.fold *= glx.fold;

    if (this.queue.length && now >= this.queueAt && !this.cur) {
      this.bloom(this.queue.shift(), { force: true });
      this.queueAt = now + 0.2;
    }
    if (this.level <= 0.01) return;
    gl.enable(gl.BLEND);
    if (glx.pal.dark) gl.blendFunc(gl.ONE, gl.ONE); else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    glx.target(glx.bgT);

    // spinner galaxy: the only continuous effect, and it owns the screen while it runs
    this.spinAmt += ((this.spin ? clamp(this.spin.vel / 30, 0.25, 1) : 0) - this.spinAmt) * Math.min(1, S.dt * 6);
    if (this.spin) this.spinRot = this.spin.rot;
    if (this.spinAmt > 0.01) {
      const pens = glx.pal.v.pens;
      glx.prog('fx:spiral', FXDEFS.spiral.fs).use().setAll(U).set('uRes', [glx.bgT.w, glx.bgT.h])
        .set('uT', now).set('uGrow', 1).set('uFade', this.level * (glx.pal.dark ? 0.8 : 0.6)).set('uOrigin', glx.center)
        .set('uA', [3, this.spinRot, this.spinAmt, 0]).set('uC0', pens[0]).set('uC1', pens[1]).set('uC2', pens[2]);
      glx.tri();
    }

    for (const key of ['ghost', 'cur']) {
      const b = this[key];
      if (!b) continue;
      const env = this.envelope(b, now);
      if (env.dead) { this[key] = null; continue; }
      try { this.drawBloom(glx, U, b, env); }
      catch (e) { console.error(e.message); this[key] = null; }
    }

    // per-hit petals
    const hb = glx.prog('fx:hitbloom', FS_HITBLOOM, VS_HITBLOOM).use();
    hb.set('uHits', glx.hits).set('uHitCol', glx.hitCols).set('uTime', now).set('uSize', 0.13)
      .set('uP2C', [2 * glx.h / glx.w, 2]).set('uFade', this.level * (glx.pal.dark ? 0.75 : 0.6));
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 8);

    // sparks: a full burst for every hit, a pinch for slider ticks and the rolling ball
    const dark = glx.pal.dark;
    const sp = glx.prog('fx:spark', FS_POINT, VS_SPARK).use();
    sp.set('uTime', now).set('uP2C', [2 * glx.h / glx.w, 2]).set('uPx', (glx.bgT.h / 900) * (dark ? 1 : 1.3)).set('uInk', glx.pal.v.ink).set('uDark', dark ? 1 : 0);
    sp.set('uSrc', glx.hits).set('uSrcCol', glx.hitCols).set('uCount', 120).set('uReach', 0.21).set('uLife', 0.7).set('uFade', this.level * (dark ? 0.9 : 0.8));
    gl.drawArraysInstanced(gl.POINTS, 0, 120, 8);
    sp.set('uSrc', glx.emits).set('uSrcCol', glx.emitCols).set('uCount', 22).set('uReach', 0.075).set('uLife', 0.5).set('uFade', this.level * (dark ? 0.8 : 0.7));
    gl.drawArraysInstanced(gl.POINTS, 0, 22, 8);
    gl.disable(gl.BLEND);
  },
};
