'use strict';
// ─────────────────────────────────────────────────────────────
// gl: one WebGL2 context that draws the generative background and the
// bloom effects, then composites the 2D stage over them. The final pass
// is where the picture is finished: the notes become glass that refracts
// what is behind them, hits send lens ripples through it, a miss smears
// it, each mode gets its print finish, and screens change with a wipe.
// Every shader can hear the music through a spectrum texture.
// Everything degrades to plain 2D if WebGL2 is missing.
// ─────────────────────────────────────────────────────────────

const VS_TRI = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Shared by every fragment shader: uniforms that carry the music, the palette and recent hits.
const GL_PRE = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uRes;
uniform float uTime;      // seconds; stops while paused
uniform float uFlow;      // music-weighted distance travelled
uniform float uBeats;     // beats since the song began
uniform float uBeat;      // phase within the beat
uniform float uBar;       // phase within the bar
uniform float uPulse;     // kick envelope
uniform float uEnergy;    // section energy, smoothed
uniform float uKiai;      // peak section, smoothed
uniform float uDim;       // background dim
uniform float uCalm;      // 1 while playing: compress the background's highlights
uniform float uHitPulse;  // decaying sum of recent hits
uniform float uCombo;     // combo / 100
uniform float uSection;
uniform float uSectionT;  // seconds since the section changed
uniform vec4 uSeed;
uniform vec2 uCenter;     // focal point (centre of the playfield)
uniform vec3 uBase, uInk, uGridC, uP0, uP1, uP2, uP3;
uniform vec3 uAccent;      // the pen of the note being played
uniform vec4 uHits[8];    // xy position, z birth time, w strength
uniform vec3 uHitCol[8];
uniform sampler2D uAudio; // what is playing right now. row 0: spectrum, low to high; row 1: waveform
uniform vec4 uBands;      // bass, mids, treble, overall level; 0..1, smoothed
out vec4 fragColor;
#define PI 3.14159265359
#define TAU 6.28318530718
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float hash11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec2 hash22(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = rot(.5) * p * 2.02 + 17.; a *= .5; } return s; }
vec3 pal4(float t) {      // cyclic blend through the four pens
  t = fract(t) * 4.; float f = fract(t); f = f * f * (3. - 2. * f); int i = int(floor(t));
  vec3 a = i == 0 ? uP0 : i == 1 ? uP1 : i == 2 ? uP2 : uP3;
  vec3 b = i == 0 ? uP1 : i == 1 ? uP2 : i == 2 ? uP3 : uP0;
  return mix(a, b, f);
}
float luma(vec3 c) { return dot(c, vec3(.299, .587, .114)); }
float spec(float x) { return texture(uAudio, vec2(x, .25)).r; }           // x: 0 = 30 Hz … 1 = 16 kHz
float wave(float x) { return texture(uAudio, vec2(x, .75)).r * 2. - 1.; }  // a steadied oscilloscope trace
vec2 P() { return (gl_FragCoord.xy - .5 * uRes) / uRes.y; }
vec3 finish(vec3 col) {   // dim toward the ground colour, then soft-limit what still stands out from it
  vec3 d = (col - uBase) * (1. - uDim);
  float m = max(abs(d.r), max(abs(d.g), abs(d.b)));
  return uBase + d / (1. + uCalm * m * 2.0);
}
`;

const FS_EXTRACT = GL_PRE + `
uniform sampler2D uBgTex, uGameTex;
uniform float uCompose, uThresh;
uniform vec2 uSrcTexel;
vec3 scene(vec2 uv) {
  vec3 bg = texture(uBgTex, uv).rgb * .55;          // the notes should glow more than the scenery
  if (uCompose < .5) return bg;
  vec4 g = texture(uGameTex, uv);
  return bg * (1. - g.a) + g.rgb * 1.15;
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = vec3(0.);
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(float(i & 1) * 2. - 1., float(i >> 1) * 2. - 1.) * uSrcTexel;
    vec3 s = scene(uv + o);
    float l = max(s.r, max(s.g, s.b));
    c += s * smoothstep(uThresh, uThresh + .3, l);
  }
  fragColor = vec4(c * .25, 1.);
}`;

const FS_BLUR = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes, uDir;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = texture(uTex, uv).rgb * .227027;
  c += (texture(uTex, uv + uDir * 1.384615).rgb + texture(uTex, uv - uDir * 1.384615).rgb) * .316216;
  c += (texture(uTex, uv + uDir * 3.230769).rgb + texture(uTex, uv - uDir * 3.230769).rgb) * .070270;
  fragColor = vec4(c, 1.);
}`;

const FS_COPY = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;
out vec4 fragColor;
void main() { fragColor = texture(uTex, gl_FragCoord.xy / uRes); }`;

// The note buffer. Every note is an instanced quad carrying a dome; overlapping domes keep the taller one,
// so a string of them along a slider's path makes a half-pipe of glass.
const VS_NOTE = `#version 300 es
layout(location = 0) in vec4 aPos;      // centre xy and half-size xy, in clip space
layout(location = 1) in vec2 aAmt;      // strength, radius in screen heights
out vec2 vUv;
out vec2 vAmt;
void main() {
  vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2. - 1.;
  vUv = c; vAmt = aAmt;
  gl_Position = vec4(aPos.xy + c * aPos.zw, 0., 1.);
}`;
const FS_NOTE = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vAmt;
out vec4 fragColor;
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 >= 1.) discard;
  fragColor = vec4(sqrt(1. - r2), vAmt.x, vAmt.y, 1.);      // dome height, strength, radius
}`;

const FS_FINAL = GL_PRE + `
uniform sampler2D uBgTex, uGameTex, uBloomTex, uNoteTex, uSnapTex;
uniform float uCompose, uGlow, uGlitch, uFold, uFlash, uVig, uLens, uGlass, uDark, uFinishAmt, uSort, uWipe, uWipeKind;
uniform int uFinish;       // 0 none · 1 misregistered inks · 2 cathode-ray tube · 3 halftone · 4 ordered dither · 5 engraving
uniform vec3 uFlashCol;
uniform vec2 uNoteTexel, uSortAt;
uniform vec4 uWipeSeed;

// ── glass ──────────────────────────────────────────────────
// A note is a dome of glass lying on the picture. Its slope comes from its height alone
// (a hemisphere h high leans by sqrt(1 - h²) / h), and its direction from the height's gradient.
vec2 gShift;               // how far this pixel looks sideways through the glass, in uv
float gSpec, gRim, gShadow, gAmt;
void glassAt(vec2 uv) {
  gShift = vec2(0.); gSpec = 0.; gRim = 0.; gShadow = 0.; gAmt = 0.;
  if (uGlass <= 0.) return;
  vec2 asp = vec2(uRes.y / uRes.x, 1.);
  vec3 nb = texture(uNoteTex, uv).rgb;
  vec3 lit = texture(uNoteTex, uv + vec2(-.0048, .0064) * asp).rgb;        // the light is up and to the left; glass there shades this point
  gShadow = smoothstep(0., .45, lit.r) * lit.g * (1. - smoothstep(0., .12, nb.r)) * uGlass;
  if (nb.r < .004) return;
  vec2 e = uNoteTexel * 1.5;
  vec2 g = vec2(texture(uNoteTex, uv + vec2(e.x, 0.)).r - texture(uNoteTex, uv - vec2(e.x, 0.)).r,
                texture(uNoteTex, uv + vec2(0., e.y)).r - texture(uNoteTex, uv - vec2(0., e.y)).r);
  float gn = length(g);
  vec2 dir = gn > 1e-5 ? -g / gn : vec2(0.);          // away from the centre of the dome
  float h = min(nb.r, 1.), u = sqrt(1. - h * h);
  gAmt = nb.g * uGlass;
  gShift = dir * u * h * nb.b * .95 * gAmt * asp;      // strongest two thirds of the way out, nothing at the rim
  vec3 n = normalize(vec3(dir * u, h + .12));
  vec3 L = normalize(vec3(-.5, .62, .6));
  gSpec = pow(max(dot(n, normalize(L + vec3(0., 0., 1.))), 0.), 46.) * gAmt
        + pow(max(dot(dir, -normalize(L.xy)), 0.), 2.) * smoothstep(.4, .95, u) * .22 * gAmt;      // and the light gathered on the far side
  gRim = smoothstep(.7, 1., u) * gAmt;
}

// ── print finishes that belong to the background ───────────
float bayer4(vec2 p) {
  ivec2 q = ivec2(p) & 3;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[q.x + q.y * 4]) + .5) / 16.;
}
vec3 printed(vec3 c) {
  if (uFinish < 3 || uFinishAmt <= 0.) return c;
  vec2 px = gl_FragCoord.xy * (900. / uRes.y);
  vec3 d3 = c - uBase;
  float m = max(abs(d3.r), max(abs(d3.g), abs(d3.b)));
  float d = clamp(m * 1.9, 0., 1.);                    // how much ink this point carries
  vec3 ink = uBase + d3 / max(d, .06);                 // that ink at full strength
  vec3 o = c;
  if (uFinish == 3) {            // halftone: dots whose area is the tone
    vec2 q = rot(.52) * px / 5.2;
    float rad = sqrt(d / PI) * 1.02;
    o = mix(uBase, ink, smoothstep(rad + .07, rad - .07, length(fract(q) - .5)));
  } else if (uFinish == 4) {     // ordered dither down to a few levels
    float cell = max(1., floor(uRes.y / 420.));
    o = uBase + floor(d3 * 5. + bayer4(floor(gl_FragCoord.xy / cell))) / 5.;
  } else {                       // engraving: lines that swell with the tone, cross-hatched in the darks
    float v = dot(px, vec2(.5, .866)) / 4.4 + .7 * sin(dot(px, vec2(.866, -.5)) * .012);
    float w = dot(px, vec2(.866, -.5)) / 4.4;
    float a = smoothstep(d + .14, d - .14, abs(fract(v) - .5) * 2.);
    float b = smoothstep(.16, -.12, abs(fract(w) - .5) * 2. - (d - .55) / .45);
    o = mix(uBase, ink, max(a, b * step(.55, d)));
  }
  return mix(c, o, uFinishAmt);
}

vec3 background(vec2 uvb) {
  vec3 bg;
  if (gAmt > 0.) {             // seen through glass, each colour bends a little differently
    bg = vec3(texture(uBgTex, uvb - gShift * .93).r, texture(uBgTex, uvb - gShift).g, texture(uBgTex, uvb - gShift * 1.07).b);
    bg = printed(bg);
    bg = uDark > .5 ? bg + uInk * (gSpec * .55 + gRim * .07) : bg * (1. - gRim * .13) + gSpec * .12;
  } else bg = printed(texture(uBgTex, uvb).rgb);
  return bg * (1. - gShadow * (uDark > .5 ? .4 : .2));
}
vec3 scene(vec2 uv, vec2 uvb) {
  vec3 bg = background(uvb);
  if (uCompose < .5) return bg;
  vec4 g = texture(uGameTex, uv);
  return bg * (1. - g.a) + g.rgb;
}
vec2 foldUv(vec2 uv) {    // six-fold kaleidoscope around the focal point
  vec2 asp = vec2(uRes.x / uRes.y, 1.);
  vec2 p = (uv - .5) * asp - uCenter;
  float r = length(p), a = atan(p.y, p.x) + uTime * .15;
  float seg = TAU / 6.;
  a = abs(mod(a, seg) - seg * .5);
  p = r * vec2(cos(a), sin(a)) + uCenter;
  return p / asp + .5;
}

// ── transitions ────────────────────────────────────────────
// 0 = still the old screen, 1 = the new one
float wipeMask(vec2 p, float t) {
  if (uWipeKind < .5) {          // an iris with a rippled edge: an approach circle run backwards
    float r = length(p), a = atan(p.y, p.x);
    float edge = t * 1.45 * (1. + .07 * sin(a * 7. + uWipeSeed.x * TAU) * (1. - t));
    return 1. - smoothstep(edge - .025, edge, r);
  }
  if (uWipeKind < 1.5) {         // Voronoi cells turn over, nearest first
    vec2 x = p * 6.5 + uWipeSeed.xy * 20., n = floor(x), f = fract(x), best = vec2(0.);
    float md = 8.;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j)), r = g + hash22(n + g) - f;
      float d = dot(r, r);
      if (d < md) { md = d; best = n + g + hash22(n + g); }
    }
    float delay = length((best - uWipeSeed.xy * 20.) / 6.5) * .95 + hash21(floor(best * 3.)) * .14;
    return smoothstep(delay, delay + .05, t * 1.25);
  }
  if (uWipeKind < 2.5) {         // slanted blinds, staggered
    float v = (p.x * .8 + p.y * .6) * 9. + uWipeSeed.z * 5.;
    float delay = hash11(floor(v) + uWipeSeed.w * 31.) * .45;
    return smoothstep(0., .08, (t * 1.5 - delay) - fract(v) * .55);
  }
  float n = fbm(p * 2.6 + uWipeSeed.zw * 9.) * .75 + length(p) * .3;          // a front of noise, eaten from the middle outward
  return smoothstep(n - .02, n + .02, t * 1.25);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = P();
  vec2 disp = vec2(0.);
  if (uLens > 0.) {       // each hit sends a short refracting ring through the picture
    for (int i = 0; i < 8; i++) {
      float age = uTime - uHits[i].z;
      if (uHits[i].w <= 0. || age < 0. || age > .5) continue;
      vec2 d = p - uHits[i].xy;
      float l = length(d) + 1e-4;
      float front = age * .85 + .03;
      float ring = exp(-pow((l - front) * 24., 2.));
      disp += (d / l) * ring * (1. - age / .5) * uHits[i].w * .009 * uLens;
    }
  }
  vec2 uvd = uv - disp * vec2(uRes.y / uRes.x, 1.);
  if (uGlitch > 0.) {
    float row = floor(uvd.y * 34.), tt = floor(uTime * 45.);
    uvd.x += (hash21(vec2(row, tt)) - .5) * step(.8, hash21(vec2(tt, row * 1.7))) * uGlitch * .045;
  }
  if (uSort > 0.) {       // a miss: columns of the picture smear downward from where it happened
    float cw = 3. / uRes.x, cx = floor(uvd.x / cw);
    float near = smoothstep(.2, .02, abs(uvd.x - uSortAt.x) * uRes.x / uRes.y) * step(.35, hash11(cx * .731 + 2.));
    float top = uSortAt.y + (hash11(cx * 1.37) - .35) * .1;
    float len = (.05 + .22 * hash11(cx * 2.11 + 7.)) * uSort * near;
    float t = (top - uvd.y) / max(len, 1e-4);
    if (t > 0. && t < 1.) uvd.y = top - len * t * t * .35;       // every pixel of the streak repeats one near its head
  }
  vec2 uvb = (uvd - .5) * (1. - .006 * uPulse - .003 * uBands.x) + .5;
  if (uFinish == 2) { vec2 c = uvb - .5; uvb = .5 + c * (1. + .05 * uFinishAmt * dot(c, c)); }      // the tube's face bulges
  glassAt(uvd);

  vec2 oR = vec2(0.), oB = vec2(0.);
  if (uGlitch > 0.) { oR.x += uGlitch * .0035; oB.x -= uGlitch * .0035; }
  if (uFinish == 1) {     // misregistered inks: every bar is a fresh pull, and no two sit the same
    vec2 px = vec2(uRes.y / uRes.x, 1.) / 900.;
    float pull = floor(uBeats / 4.);
    oR += (vec2(1.2, .55) + (hash22(vec2(pull, 1.) + uSeed.xy) - .5) * 1.1) * px * uFinishAmt;
    oB += (vec2(-.7, 1.) + (hash22(vec2(pull, 7.) + uSeed.zw) - .5) * 1.1) * px * uFinishAmt;
  }
  vec3 col;
  if (dot(oR, oR) + dot(oB, oB) > 0.) col = vec3(scene(uvd + oR, uvb + oR).r, scene(uvd, uvb).g, scene(uvd + oB, uvb + oB).b);
  else col = scene(uvd, uvb);
  if (uFinish == 1) {     // and the ink never lies quite flat
    vec2 q = gl_FragCoord.xy * (900. / uRes.y);
    vec3 d3 = uBase - col;
    float inked = clamp(max(d3.r, max(d3.g, d3.b)) * 2.2, 0., 1.);
    float grain = vnoise(q * .85 + uSeed.xy * 40.) * vnoise(q * .21 + uSeed.zw * 40.);
    col = mix(col, uBase, inked * smoothstep(.12, .62, grain) * .22 * uFinishAmt);
  }
  if (uFold > 0.) {
    vec3 k = texture(uBgTex, foldUv(uvb)).rgb;
    vec4 g = uCompose > .5 ? texture(uGameTex, uvd) : vec4(0.);
    col = mix(col, k * (1. - g.a) + g.rgb, uFold);
  }
  if (uGlow > 0.) col += texture(uBloomTex, uvd).rgb * uGlow;
  col += uFlashCol * uFlash;
  vec2 q = uv - .5;
  col *= 1. - uVig * dot(q, q) * 1.5;
  // in peak sections the edges of the screen breathe in the current pen's colour
  col = mix(col, uAccent, smoothstep(.3, .78, length(q)) * uKiai * (.3 + .7 * uPulse) * .2);
  if (uFinish == 2) {     // scanlines, an aperture grille, a little flicker and a bar of brightness rolling up the tube
    float pitch = max(2., floor(uRes.y / 300.));
    float line = .5 + .5 * cos(gl_FragCoord.y / pitch * TAU);
    vec3 grille = 1. + .13 * cos(TAU * (gl_FragCoord.x / (pitch * 1.5) + vec3(0., .333, .667)));
    vec3 tube = col * (1. - .3 * line) * grille * 1.2;
    tube *= 1. + .012 * sin(uTime * 113.) + .03 * smoothstep(.06, 0., abs(fract(uv.y - uTime * .13) - .5));
    col = mix(col, tube, uFinishAmt);
  }
  if (uWipe < 1.) {
    float m = wipeMask(p - uCenter, uWipe);
    col = mix(texture(uSnapTex, uv).rgb, col, m);
    col = mix(col, uInk, m * (1. - m) * 1.6);          // a line of ink along the front
  }
  col += (hash21(gl_FragCoord.xy + fract(uTime) * 91.7) - .5) * (1.5 / 255.);
  fragColor = vec4(col, 1.);
}`;

// Cover art: a small generative print for one seed, drawn from the song's own numbers.
// uA = tempo 0..1, scale index, root 0..1, groove index;  uB = lift, style, two free hashes
const FS_COVER = GL_PRE + `
uniform vec4 uA, uB;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes, p = uv - .5;
  float style = floor(uB.y * 6.);
  vec3 col = uBase;
  float fold = 3. + floor(uA.y + .5) + floor(uB.z * 3.);            // the mode sets the symmetry
  if (style < .5) {              // ridgelines: stacked noise profiles, each hiding the ones behind
    for (int i = 0; i < 26; i++) {
      float fi = float(i), y0 = .92 - fi * .032;
      float env = exp(-pow((uv.x - .5) * (2.6 + uA.x * 2.), 2.));
      float h = y0 + env * (.03 + .1 * vnoise(vec2(uv.x * (9. + uA.x * 14.) + uSeed.x * 40., fi * .7 + uSeed.y * 9.)) * (.4 + vnoise(vec2(uv.x * 40., fi))));
      float below = smoothstep(h + .002, h - .002, uv.y);
      col = mix(col, uBase, below);
      col = mix(col, pal4(fi / 26. * .6 + uSeed.w), smoothstep(.006, .001, abs(uv.y - h)) * step(.08, uv.x) * step(uv.x, .92));
    }
  } else if (style < 1.5) {      // Schotter: a grid of squares that loses its order as it goes down
    float n = 9. + floor(uA.x * 6.);
    vec2 g = (uv - vec2(.5, .5)) * 1.16 + .5, id = floor(g * n), f = fract(g * n) - .5;
    float inside = step(0., g.x) * step(g.x, 1.) * step(0., g.y) * step(g.y, 1.);
    float disorder = pow(1. - (id.y + .5) / n, 1.6);
    vec2 jit = (hash22(id + uSeed.xy * 50.) - .5) * disorder * .9;
    vec2 q = rot((hash21(id + uSeed.zw * 50.) - .5) * disorder * 2.4) * (f - jit);
    float box = abs(max(abs(q.x), abs(q.y)) - .44);
    col = mix(col, pal4(hash21(id * 1.3 + 4.) * .5 + uSeed.w), smoothstep(.07, .025, box) * inside);
  } else if (style < 2.5) {      // rosette: layered rose curves with the mode's symmetry
    float r = length(p), a = atan(p.y, p.x) + uA.z * TAU;
    for (int i = 0; i < 7; i++) {
      float fi = float(i);
      float rr = (.06 + .055 * fi) * (1. + (.16 + .2 * uB.w) * cos(fold * (1. + mod(fi, 2.)) * a + fi * 1.3 + uSeed.x * 20.));
      col = mix(col, pal4(fi * .14 + uSeed.w), smoothstep(.006, .0015, abs(r - rr)));
    }
  } else if (style < 3.5) {      // marbled ink: noise warped by noise
    vec2 q = p * (2.2 + uA.x * 2.) + uSeed.xy * 30.;
    vec2 w = vec2(fbm(q + 1.7), fbm(q + vec2(5.2, 1.3)));
    float v = fbm(q + 2.4 * w + uSeed.zw * 9.);
    float bands = abs(fract(v * (5. + fold)) - .5) * 2.;
    col = mix(uBase, pal4(v * 1.4 + uSeed.w), .25 + .6 * smoothstep(.25, .75, v));
    col = mix(col, uInk, smoothstep(.12, .0, bands) * .55);
  } else if (style < 4.5) {      // Truchet arcs, two tile sizes
    float n = 5. + floor(uA.x * 5.);
    vec2 g = uv * n, id = floor(g), f = fract(g);
    if (hash21(id + uSeed.xy * 31.) > .5) f.x = 1. - f.x;
    float d = min(abs(length(f) - .5), abs(length(f - 1.) - .5));
    float side = mod(mod(id.x + id.y, 2.) + step(.5, hash21(id + uSeed.xy * 31.)) + step(length(f), .5) + step(length(f - 1.), .5), 2.);
    col = mix(uBase, mix(uBase, pal4(vnoise(uv * 2.5 + uSeed.zw * 9.) + uSeed.w), .6), side);
    col = mix(col, uInk, smoothstep(.07, .04, d));
  } else {                       // a Julia set chosen by the key
    vec2 z = rot(uA.z * TAU) * p * 2.7;
    float th = uSeed.y * TAU + uA.w;
    vec2 c = .7885 * vec2(cos(th), sin(th)), dz = vec2(1., 0.);
    float m2 = 0., n = 0.;
    for (int i = 0; i < 64; i++) {
      dz = 2. * vec2(z.x * dz.x - z.y * dz.y, z.x * dz.y + z.y * dz.x);
      z = vec2(z.x * z.x - z.y * z.y, 2. * z.x * z.y) + c;
      m2 = dot(z, z);
      if (m2 > 64.) break;
      n += 1.;
    }
    if (m2 > 64.) {
      float d = .5 * sqrt(m2 / max(dot(dz, dz), 1e-12)) * log(m2);
      float sn = n + 1. - log(log(m2) * .5) / log(2.);
      col = mix(uBase, pal4(sn * .05 + uSeed.w), .18 + .5 * exp(-d * 9.));
      col = mix(col, uInk, exp(-d * 90.) * .8);
    } else col = mix(uBase, uInk, .12);
  }
  // a hairline frame
  vec2 e = min(uv, 1. - uv);
  col = mix(col, uInk, smoothstep(.022, .019, min(e.x, e.y)) * smoothstep(.014, .017, min(e.x, e.y)) * .7);
  fragColor = vec4(col, 1.);
}`;

// A shader program. Compiling is started here and finished on first use, so that where the browser
// can compile on another thread (KHR_parallel_shader_compile) nothing waits for it: `done` says
// whether finishing would block. Errors surface from finish().
class Prog {
  constructor(gl, vsSrc, fsSrc, name) {
    this.gl = gl; this.name = name; this.src = [vsSrc, fsSrc];
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    this.sh = [sh(gl.VERTEX_SHADER, vsSrc), sh(gl.FRAGMENT_SHADER, fsSrc)];
    const p = gl.createProgram();
    gl.attachShader(p, this.sh[0]); gl.attachShader(p, this.sh[1]); gl.linkProgram(p);
    this.p = p; this.u = {}; this.unit = 0; this.pending = true;
  }
  get done() {
    if (!this.pending) return true;
    const par = Prog.parallel === undefined ? (Prog.parallel = this.gl.getExtension('KHR_parallel_shader_compile')) : Prog.parallel;
    return !par || !!this.gl.getProgramParameter(this.p, par.COMPLETION_STATUS_KHR);
  }
  finish() {
    if (!this.pending) return this;
    const gl = this.gl, p = this.p;
    this.pending = false;
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      let msg = `program "${this.name}" failed to link\n${gl.getProgramInfoLog(p) || ''}`;
      this.sh.forEach((s, i) => {
        if (gl.getShaderParameter(s, gl.COMPILE_STATUS)) return;
        const log = gl.getShaderInfoLog(s) || '';
        const m = /ERROR: \d+:(\d+)/.exec(log);
        const lines = this.src[i].split('\n');
        const at = m ? parseInt(m[1], 10) : 0;
        const ctx = at ? lines.slice(Math.max(0, at - 3), at + 2).map((l, k) => `${Math.max(1, at - 2) + k}: ${l}`).join('\n') : '';
        msg = `shader "${this.name}" failed to compile\n${log}\n${ctx}`;
      });
      this.failed = msg;
      throw new Error(msg);
    }
    for (const s of this.sh) gl.deleteShader(s);
    this.sh = this.src = null;
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      this.u[info.name.replace(/\[0\]$/, '')] = { loc: gl.getUniformLocation(p, info.name), type: info.type };
    }
    return this;
  }
  use() {
    if (this.pending) this.finish();
    if (this.failed) throw new Error(this.failed);
    this.gl.useProgram(this.p); this.unit = 0;
    return this;
  }
  set(name, v) {
    const u = this.u[name], gl = this.gl;
    if (!u) return this;
    switch (u.type) {
      case gl.FLOAT: if (typeof v === 'number') gl.uniform1f(u.loc, v); else gl.uniform1fv(u.loc, v); break;
      case gl.FLOAT_VEC2: gl.uniform2fv(u.loc, v); break;
      case gl.FLOAT_VEC3: gl.uniform3fv(u.loc, v); break;
      case gl.FLOAT_VEC4: gl.uniform4fv(u.loc, v); break;
      case gl.INT: case gl.BOOL: gl.uniform1i(u.loc, v); break;
      case gl.INT_VEC2: gl.uniform2iv(u.loc, v); break;
      case gl.SAMPLER_2D:
        gl.activeTexture(gl.TEXTURE0 + this.unit);
        gl.bindTexture(gl.TEXTURE_2D, v);
        gl.uniform1i(u.loc, this.unit++);
        break;
    }
    return this;
  }
  setAll(obj) { for (const k in obj) this.set(k, obj[k]); return this; }
}

const FINISHES = { none: 0, riso: 1, crt: 2, halftone: 3, dither: 4, engraving: 5 };
const NOTE_MAX = 1400;

const GLX = {
  ok: false, compose: false, gl: null, canvas: null,
  w: 2, h: 2, cssW: 1, cssH: 1,
  floatRT: false, light: false, renderer: '', aspect: 0, time: 0, flow: 0,
  bgScale: 1, modeScale: 1, mode: null, pal: null,
  hits: new Float32Array(32), hitCols: new Float32Array(24), hitN: 0, hitPulse: 0,
  emits: new Float32Array(32), emitCols: new Float32Array(24), emitN: 0,     // small spark sources: slider ticks, the ball
  bgT: null, blA: null, blB: null, noteT: null, snapT: null, gameTex: null, gameSize: [0, 0],
  glitch: 0, fold: 0, flash: 0, flashCol: [1, 1, 1], lens: 1, glowUser: 1,
  sort: 0, sortAt: [0.5, 0.5], wipeT0: -99, wipeKind: 0, wipeSeed: [0, 0, 0, 0], wipeN: 0,
  notes: new Float32Array(NOTE_MAX * 6), noteN: 0, noteDrawn: false,
  analyser: null, audio: null, bands: [0, 0, 0, 0],
  progs: new Map(), U: {}, center: [0, 0], lastS: null,
  frameMs: 16.7, frames: 0, cool: 0, refresh: 16.7, patience: 240, lastDef: null, trial: null,
  error: '',

  init(canvas) {
    this.canvas = canvas;
    let gl = null;
    try {
      gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
    } catch (e) { gl = null; }
    if (!gl) { this.error = 'WebGL2 is not available'; return false; }
    this.gl = gl;
    this.floatRT = !!gl.getExtension('EXT_color_buffer_float');
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    this.renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    // integrated and mobile GPUs get a smaller pixel budget to start from
    this.light = /Intel|Mali|Adreno|PowerVR|SwiftShader|llvmpipe|Basic Render/i.test(this.renderer) && !/Arc/i.test(this.renderer);
    this.floatLinear = !!gl.getExtension('OES_texture_float_linear');
    Prog.parallel = gl.getExtension('KHR_parallel_shader_compile');     // lets shaders compile off the main thread
    try {
      this.pFinal = new Prog(gl, VS_TRI, FS_FINAL, 'final');
      this.pExtract = new Prog(gl, VS_TRI, FS_EXTRACT, 'extract');
      this.pBlur = new Prog(gl, VS_TRI, FS_BLUR, 'blur');
      this.pNote = new Prog(gl, VS_NOTE, FS_NOTE, 'note');
      for (const p of [this.pFinal, this.pExtract, this.pBlur, this.pNote]) p.finish();
    } catch (e) { console.error(e.message); this.error = e.message; return false; }
    this.vao = gl.createVertexArray();
    // instanced note quads read their place and strength from one buffer
    this.noteVao = gl.createVertexArray();
    gl.bindVertexArray(this.noteVao);
    this.noteBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.noteBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.notes.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 24, 0); gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 16); gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(this.vao);
    const tex = (w, h, internal, format, data) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.UNSIGNED_BYTE, data);
      return t;
    };
    this.gameTex = tex(1, 1, gl.RGBA, gl.RGBA, new Uint8Array(4));
    this.audio = { n: 256, data: new Uint8Array(512), spec: new Float32Array(256), freq: null, time: null };
    this.audio.data.fill(128, 256);
    this.audio.tex = tex(256, 2, gl.R8, gl.RED, this.audio.data);
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.ok = false; this.lost = true; });
    this.ok = true;
    this.compose = true;
    return true;
  },

  prog(name, fs, vs = VS_TRI) {
    let p = this.progs.get(name);
    if (!p) { p = new Prog(this.gl, vs, fs, name); this.progs.set(name, p); }
    return p;
  },

  // opt.float: 'half' (default when truthy) or 'full' for 32-bit; nearest / repeat as named
  makeTarget(w, h, opt = {}) {
    const gl = this.gl;
    w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const fl = opt.float && this.floatRT, full = fl && opt.float === 'full';
    gl.texImage2D(gl.TEXTURE_2D, 0, full ? gl.RGBA32F : fl ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, full ? gl.FLOAT : fl ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    const f = opt.nearest || (full && !this.floatLinear) ? gl.NEAREST : gl.LINEAR, wr = opt.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wr);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wr);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, w, h, float: fl };
  },
  freeTarget(t) { if (!t) return; this.gl.deleteTexture(t.tex); this.gl.deleteFramebuffer(t.fbo); },
  target(t) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null);
    gl.viewport(0, 0, t ? t.w : this.w, t ? t.h : this.h);
  },
  tri() { this.gl.drawArrays(this.gl.TRIANGLES, 0, 3); },
  copy(src, dst) {
    this.target(dst);
    this.prog('copy', FS_COPY).use().set('uTex', src.tex).set('uRes', [dst.w, dst.h]);
    this.tri();
  },

  resize(cssW, cssH, dpr) {
    if (!this.ok) return;
    this.cssW = cssW; this.cssH = cssH;
    this.w = Math.round(cssW * dpr); this.h = Math.round(cssH * dpr);
    this.canvas.width = this.w; this.canvas.height = this.h;
    this.canvas.style.width = cssW + 'px'; this.canvas.style.height = cssH + 'px';
    const aspect = this.w / this.h, reshaped = Math.abs(aspect - (this.aspect || 0)) > 0.01;
    this.aspect = aspect;
    this.freeTarget(this.noteT); this.freeTarget(this.snapT);
    this.noteT = this.makeTarget(this.w / 2, this.h / 2, { float: true });
    this.snapT = null;
    this.wipeT0 = -99;
    this.rebuild();
    // a change of resolution alone must not wipe a running simulation; only a change of shape does
    const def = this.mode && this.mode.def;
    if (def && def.resize && (reshaped || def.sized)) def.resize(this, this.mode);
  },

  rebuild() {
    this.freeTarget(this.bgT); this.freeTarget(this.blA); this.freeTarget(this.blB);
    const s = this.bgScale;
    this.bgT = this.makeTarget(this.w * s, this.h * s);
    this.blA = this.makeTarget(this.w / 4, this.h / 4);
    this.blB = this.makeTarget(this.w / 4, this.h / 4);
    const def = this.mode && this.mode.def;
    if (def && def.rescale) def.rescale(this, this.mode);
  },

  // p-space: origin at screen centre, y up, one unit = screen height
  toP(x, y) { return [(x - this.cssW / 2) / this.cssH, (this.cssH / 2 - y) / this.cssH]; },

  setMode(def, pal, seed) {
    if (!this.ok) return;
    if (this.mode && this.mode.def.dispose) this.mode.def.dispose(this, this.mode);
    const r = new RNG(seed, 9001);
    this.seedV = [r.next(), r.next(), r.next(), r.next()];
    this.pal = pal;
    let prog;
    try { prog = this.prog('bg:' + def.id, def.fs).finish(); }
    catch (e) { console.error(e.message); def = BGMODES.flat; prog = this.prog('bg:flat', def.fs); }
    this.modeScale = def.scale || 1;
    this.bgScale = Math.min(this.modeScale, this.bgScale < 0.999 && this.lastDef === def ? this.bgScale : 1);   // restarting the same mode keeps what the machine could manage
    this.lastDef = def;
    this.mode = null;                                 // rebuild must not call into a mode that is not set up yet
    this.rebuild();
    this.mode = { def, prog, seed, rng: r };
    try { if (def.init) def.init(this, this.mode); }
    catch (e) { console.error('mode init failed: ' + e.message); this.mode = { def: BGMODES.flat, prog: this.prog('bg:flat', BGMODES.flat.fs), seed, rng: r }; }
    this.hits.fill(0); this.emits.fill(0); this.hitPulse = 0; this.sort = 0;
    this.frames = 0; this.cool = 90; this.patience = 240; this.trial = null;
  },

  hit(x, y, hex, strength) {
    if (!this.ok) return;
    const i = this.hitN++ % 8, p = this.toP(x, y), c = hexToVec(hex);
    this.hits[i * 4] = p[0]; this.hits[i * 4 + 1] = p[1]; this.hits[i * 4 + 2] = this.time; this.hits[i * 4 + 3] = strength;
    this.hitCols[i * 3] = c[0]; this.hitCols[i * 3 + 1] = c[1]; this.hitCols[i * 3 + 2] = c[2];
    this.hitPulse = Math.min(1.6, this.hitPulse + strength * 0.55);
    if (this.mode && this.mode.def.onHit) this.mode.def.onHit(this, this.mode, p, strength, c);
  },

  // A small spray of sparks without the lens ripple or the petals: slider ticks, the ball as it rolls.
  emit(x, y, hex, strength) {
    if (!this.ok) return;
    const i = this.emitN++ % 8, p = this.toP(x, y), c = hexToVec(hex);
    this.emits[i * 4] = p[0]; this.emits[i * 4 + 1] = p[1]; this.emits[i * 4 + 2] = this.time; this.emits[i * 4 + 3] = strength;
    this.emitCols[i * 3] = c[0]; this.emitCols[i * 3 + 1] = c[1]; this.emitCols[i * 3 + 2] = c[2];
  },

  // Feed the simulations without the visible hit effects (the menu preview, and sliders as they are held).
  // The last argument tells the mode this is not a hit, so it can answer more quietly.
  seed(x, y, strength, hex) {
    if (this.ok && this.mode && this.mode.def.onHit) this.mode.def.onHit(this, this.mode, this.toP(x, y), strength, hex ? hexToVec(hex) : null, true);
  },

  // A miss smears the picture below the point where it happened.
  miss(x, y) {
    if (!this.ok) return;
    this.sort = 1;
    this.sortAt = [x / this.cssW, 1 - y / this.cssH];
    if (this.mode && this.mode.def.onMiss) this.mode.def.onMiss(this, this.mode, this.toP(x, y));
  },

  // ── glass notes ─────────────────────────────────────────────
  // The app lists the notes on screen each frame: centre and radius in CSS pixels, strength 0..1.
  noteClear() { this.noteN = 0; },
  note(x, y, r, strength) {
    if (this.noteN >= NOTE_MAX || strength <= 0.01) return;
    const o = this.noteN++ * 6, d = this.notes;
    d[o] = (x / this.cssW) * 2 - 1; d[o + 1] = 1 - (y / this.cssH) * 2;
    d[o + 2] = (r / this.cssW) * 2; d[o + 3] = (r / this.cssH) * 2;
    d[o + 4] = strength; d[o + 5] = r / this.cssH;
  },
  drawNotes() {
    const gl = this.gl;
    if (!this.noteN && !this.noteDrawn) return false;
    this.target(this.noteT);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    this.noteDrawn = this.noteN > 0;
    if (!this.noteN) return false;
    gl.bindVertexArray(this.noteVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.noteBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.notes, 0, this.noteN * 6);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.MAX);                        // the taller dome wins
    gl.blendFunc(gl.ONE, gl.ONE);
    this.pNote.use();
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.noteN);
    gl.blendEquation(gl.FUNC_ADD);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.vao);
    return true;
  },

  // ── the music, as a texture ─────────────────────────────────
  listen(analyser) {
    this.analyser = analyser;
    if (!this.ok || !analyser) return;
    this.audio.freq = new Uint8Array(analyser.frequencyBinCount);
    this.audio.time = new Uint8Array(analyser.fftSize);
    this.audio.rate = analyser.context.sampleRate;
  },
  hear(dt) {
    const A = this.audio, n = A.n, B = this.bands, fall = Math.exp(-dt * 9);
    let bass = 0, mid = 0, treble = 0, level = 0;
    if (this.analyser && A.freq && dt > 0) {
      this.analyser.getByteFrequencyData(A.freq);
      this.analyser.getByteTimeDomainData(A.time);
      const bins = A.freq.length, perHz = bins / (A.rate / 2);
      let nb = 0, nm = 0, nt = 0;
      for (let i = 0; i < n; i++) {                   // 256 columns, logarithmic from 30 Hz to 16 kHz
        const f0 = 30 * Math.pow(533.3, i / n), f1 = 30 * Math.pow(533.3, (i + 1) / n);
        const a = Math.floor(f0 * perHz), b = Math.min(bins, Math.max(a + 1, Math.ceil(f1 * perHz)));
        let v = 0;
        for (let k = a; k < b; k++) if (A.freq[k] > v) v = A.freq[k];
        v = clamp((v / 255 + (i / n) * 0.42 - 0.22) / 0.55, 0, 1);    // tilt the top up: music carries far less energy there
        v *= Math.sqrt(v);
        A.spec[i] = Math.max(v, A.spec[i] * fall);
        A.data[i] = A.spec[i] * 255;
        if (f1 < 150) { bass += v; nb++; } else if (f1 < 2000) { mid += v; nm++; } else { treble += v; nt++; }
      }
      bass /= nb || 1; mid /= nm || 1; treble /= nt || 1;
      // waveform: start at a rising zero crossing so the trace stands still
      const T = A.time, span = T.length;
      let z = 0;
      for (let k = 1; k < span / 2; k++) if (T[k - 1] < 128 && T[k] >= 128) { z = k; break; }
      const hop = Math.max(1, Math.floor((span - z) / n / 1.02));
      for (let i = 0; i < n; i++) { const s = T[Math.min(span - 1, z + i * hop)]; A.data[n + i] = s; level += (s - 128) * (s - 128); }
      level = Math.min(1, Math.sqrt(level / n) / 40);
    } else {
      for (let i = 0; i < n; i++) { A.spec[i] *= fall; A.data[i] = A.spec[i] * 255; A.data[n + i] = 128; }
    }
    B[0] = Math.max(bass, B[0] * fall); B[1] = Math.max(mid, B[1] * fall); B[2] = Math.max(treble, B[2] * fall); B[3] = Math.max(level, B[3] * fall);
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, A.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, n, 2, gl.RED, gl.UNSIGNED_BYTE, A.data);
  },

  upload(stage) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.gameTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, stage);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  },

  // Dynamic resolution for the background only: gameplay stays at full sharpness.
  // Slow frames shrink the background; it grows back cautiously, waiting longer after each setback.
  // Every shrink is a trial: if it buys no time, the pace is being set by the display or by a power
  // saver rather than by the shader, so the step is undone and that pace becomes the new baseline.
  adapt(dtMs) {
    if (dtMs > 120) return;
    this.frameMs = this.frameMs * 0.93 + dtMs * 0.07;
    this.frames++;
    if (this.frames < 40) return;
    if (this.frameMs < this.refresh && this.frameMs > 3) this.refresh = Math.max(4, this.frameMs);
    if (this.cool > 0) { this.cool--; return; }
    if (this.trial) {
      const t = this.trial;
      this.trial = null;
      if (this.frameMs > t.before * 0.93) {
        this.bgScale = t.scale;
        this.rebuild();
        this.refresh = this.frameMs;
        this.cool = 120;
        return;
      }
    }
    const min = this.mode.def.minScale || 0.3;      // cheap backgrounds are not worth blurring
    if (this.frameMs > this.refresh * 1.12 && this.bgScale > min) {
      this.trial = { before: this.frameMs, scale: this.bgScale };
      this.bgScale = Math.max(min, this.bgScale * 0.82);
      this.rebuild();
      this.cool = 55;
      this.patience = Math.min(2400, this.patience * 1.7);
    } else if (this.frameMs < this.refresh * 1.035 && this.bgScale < this.modeScale - 0.01) {
      this.bgScale = Math.min(this.modeScale, this.bgScale * 1.1);
      this.rebuild();
      this.cool = this.patience;
    }
  },

  // Compile the shaders nobody has asked for yet, one at a time, while nothing else needs the time:
  // every mode's background and the cover art. Where the browser compiles on another thread this
  // costs the frame nothing, and choosing a mode or opening the gallery no longer waits.
  warm() {
    if (this.warmList === undefined) {
      this.warmList = Object.keys(BGMODES).map(k => ['bg:' + k, BGMODES[k].fs]);
      this.warmList.push(['cover', FS_COVER]);
      this.warming = null;
    }
    if (this.warming) {
      if (!this.warming.done) return;
      try { this.warming.finish(); } catch (e) { console.error(e.message); }
      this.warming = null;
    }
    if (!Prog.parallel || !this.warmList.length) return;       // without threaded compiles, leave them for when they are needed
    const [name, fs] = this.warmList.shift();
    if (!this.progs.has(name)) this.warming = this.prog(name, fs);
  },

  // ── transitions ─────────────────────────────────────────────
  // Keep the picture as it stands; the next frames are revealed over it by a generative wipe.
  snapshot() {
    if (!this.ok || !this.lastS || !this.bgT) return;
    if (!this.snapT) this.snapT = this.makeTarget(this.w, this.h);
    this.gl.bindVertexArray(this.vao);
    this.gl.disable(this.gl.BLEND);
    const was = this.wipeT0;
    this.wipeT0 = -99;                                // the kept picture is the finished one, not a half-wiped one
    this.final(this.snapT, this.lastS, this.lastComposing, this.lastGlow);
    this.wipeT0 = was;
  },
  wipe() {
    if (!this.snapT) return;
    this.wipeT0 = this.time;
    this.wipeKind = this.wipeN++ % 4;
    this.wipeSeed = [Math.random(), Math.random(), Math.random(), Math.random()];
  },

  final(target, S, composing, glow) {
    const pal = this.pal, fin = FINISHES[S.finish] || 0;
    const w = clamp((this.time - this.wipeT0) / 0.62, 0, 1);
    this.target(target);
    this.pFinal.use().setAll(this.U).set('uRes', [target ? target.w : this.w, target ? target.h : this.h])
      .set('uBgTex', this.bgT.tex).set('uGameTex', this.gameTex).set('uBloomTex', this.blA.tex).set('uNoteTex', this.noteT.tex)
      .set('uSnapTex', this.snapT && target !== this.snapT ? this.snapT.tex : this.gameTex)
      .set('uCompose', composing ? 1 : 0).set('uGlow', glow > 0.02 ? glow : 0).set('uGlitch', this.glitch * S.fx).set('uFold', this.fold * S.fx)
      .set('uFlash', this.flash * S.fx).set('uFlashCol', this.flashCol).set('uVig', pal.dark ? 0.55 : 0.16).set('uLens', this.lens * S.fx)
      .set('uGlass', S.glass && composing && this.noteDrawn ? 1 : 0).set('uDark', pal.dark ? 1 : 0).set('uNoteTexel', [1 / this.noteT.w, 1 / this.noteT.h])
      .set('uFinish', fin).set('uFinishAmt', fin ? 1 : 0)
      .set('uSort', this.sort * S.fx).set('uSortAt', this.sortAt)
      .set('uWipe', this.snapT && target !== this.snapT ? w * w * (3 - 2 * w) : 1).set('uWipeKind', this.wipeKind).set('uWipeSeed', this.wipeSeed);
    this.tri();
  },

  frame(S) {
    if (!this.ok || !this.mode) return;
    const gl = this.gl, dt = S.paused ? 0 : S.dt;
    this.time += dt;
    this.flow += dt * (0.22 + S.energy * 0.9 + S.pulse * 0.5 + this.bands[0] * 0.5);
    this.hitPulse *= Math.exp(-dt * 4.5);
    this.glitch = Math.max(0, this.glitch - dt * 5.5);
    this.flash = Math.max(0, this.flash - dt * 4.5);
    this.sort = Math.max(0, this.sort - dt * 2.6);
    const c = this.toP(S.cx, S.cy), k = Math.min(1, S.dt * 5);
    this.center[0] += (c[0] - this.center[0]) * k; this.center[1] += (c[1] - this.center[1]) * k;

    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND);
    this.hear(dt);

    const pal = this.pal, U = this.U;
    U.uTime = this.time; U.uFlow = this.flow; U.uBeats = S.beats; U.uBeat = S.beat; U.uBar = S.bar; U.uPulse = S.pulse;
    U.uEnergy = S.energy; U.uKiai = S.kiai; U.uDim = S.dim; U.uCalm = S.calm; U.uHitPulse = this.hitPulse; U.uCombo = S.combo;
    U.uSection = S.section; U.uSectionT = S.sectionT; U.uSeed = this.seedV; U.uCenter = this.center;
    U.uBase = pal.v.paper; U.uInk = pal.v.ink; U.uGridC = pal.v.grid;
    U.uP0 = pal.v.pens[0]; U.uP1 = pal.v.pens[1]; U.uP2 = pal.v.pens[2]; U.uP3 = pal.v.pens[3];
    U.uHits = this.hits; U.uHitCol = this.hitCols; U.uAccent = S.accent;
    U.uAudio = this.audio.tex; U.uBands = this.bands;

    const m = this.mode;
    if (m.def.step && dt > 0) m.def.step(this, m, U, S, dt);

    gl.disable(gl.BLEND);
    this.target(this.bgT);
    m.prog.use().setAll(U).set('uRes', [this.bgT.w, this.bgT.h]);
    if (m.def.bind) m.def.bind(this, m, m.prog);
    this.tri();

    FX.draw(this, U, S);
    if (m.def.after) m.def.after(this, m);           // modes that feed the finished picture back into themselves

    const composing = this.compose && !!S.stage;
    if (composing) this.upload(S.stage);
    gl.disable(gl.BLEND);
    if (S.glass && composing && this.noteT.float) this.drawNotes(); else this.noteDrawn = false;
    const glow = pal.dark ? S.glow * this.glowUser : 0;      // glow only reads on dark grounds
    if (glow > 0.02) {
      this.target(this.blA);
      this.pExtract.use().setAll(U).set('uRes', [this.blA.w, this.blA.h]).set('uBgTex', this.bgT.tex).set('uGameTex', this.gameTex)
        .set('uCompose', composing ? 1 : 0).set('uThresh', 0.42).set('uSrcTexel', [1 / this.w, 1 / this.h]);
      this.tri();
      for (let i = 0; i < 2; i++) {
        const sc = i === 0 ? 1 : 2.2;
        this.target(this.blB);
        this.pBlur.use().set('uRes', [this.blB.w, this.blB.h]).set('uTex', this.blA.tex).set('uDir', [sc / this.blA.w, 0]);
        this.tri();
        this.target(this.blA);
        this.pBlur.use().set('uRes', [this.blA.w, this.blA.h]).set('uTex', this.blB.tex).set('uDir', [0, sc / this.blA.h]);
        this.tri();
      }
    }

    this.final(null, S, composing, glow);
    this.lastS = S; this.lastComposing = composing; this.lastGlow = glow;
    if (!S.playing && FX.warmList && !FX.warmList.length) this.warm();
    if (!S.paused) this.adapt(S.dt * 1000);
  },

  // ── cover art ───────────────────────────────────────────────
  // Draws one seed's cover and returns its pixels (top row first). Null without WebGL; undefined while the
  // cover shader is still compiling.
  cover(song, pal, size) {
    if (!this.ok) return null;
    const gl = this.gl;
    if (!this.coverT || this.coverT.w !== size) { this.freeTarget(this.coverT); this.coverT = this.makeTarget(size, size); }
    let p;
    try { p = this.prog('cover', FS_COVER); if (!p.done) return undefined; p.finish(); }      // still compiling: ask again next frame
    catch (e) { if (!this.coverFailed) console.error(e.message); this.coverFailed = true; return null; }
    const r = new RNG(song.seed, 9001), sv = [r.next(), r.next(), r.next(), r.next()];
    const h = new RNG(song.seed, 606);
    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND);
    this.target(this.coverT);
    p.use().set('uRes', [size, size]).set('uSeed', sv).set('uBase', pal.v.paper).set('uInk', pal.v.ink)
      .set('uP0', pal.v.pens[0]).set('uP1', pal.v.pens[1]).set('uP2', pal.v.pens[2]).set('uP3', pal.v.pens[3])
      .set('uA', [(song.bpm - 110) / 62, Object.keys(SCALES).indexOf(song.scaleName), song.root / 12, Object.keys(GROOVES).indexOf(song.grooveName)])
      .set('uB', [song.lift, h.next(), h.next(), h.next()]);
    this.tri();
    const px = new Uint8Array(size * size * 4);
    gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const out = new Uint8ClampedArray(size * size * 4), row = size * 4;
    for (let y = 0; y < size; y++) out.set(px.subarray((size - 1 - y) * row, (size - y) * row), y * row);
    this.target(null);
    return out;
  },
};
