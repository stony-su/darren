'use strict';
// ─────────────────────────────────────────────────────────────
// bgmodes3: three more living grounds.
//   belousov  three reagents chasing each other into spiral waves
//   sandpile  the Abelian sandpile; every hit is a pile of grains
//   feedback  the finished picture, fed back into itself
// ─────────────────────────────────────────────────────────────

// ── belousov: a three-species cyclic reaction (after Turner's model of the BZ reaction) ──
const FS_BZ_STEP = `#version 300 es
precision highp float;
uniform sampler2D uPrev;
uniform vec2 uTexel;
uniform vec3 uK;
uniform vec4 uInj[8];
uniform float uAspect, uTick;
out vec4 fragColor;
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  vec3 c = vec3(0.);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) c += texture(uPrev, uv + vec2(float(i), float(j)) * uTexel).rgb;
  c /= 9.;
  vec3 n = c + c * vec3(uK.x * c.g - uK.z * c.b, uK.y * c.b - uK.x * c.r, uK.z * c.r - uK.y * c.g);   // each feeds on the next and is eaten by the last
  for (int i = 0; i < 8; i++) {
    if (uInj[i].w <= 0.) continue;
    vec2 d = (uv - uInj[i].xy) * vec2(uAspect, 1.);
    if (length(d) < uInj[i].z) n = vec3(h21(gl_FragCoord.xy + uTick), h21(gl_FragCoord.yx + uTick * 1.7 + 5.), h21(gl_FragCoord.xy * 1.3 + uTick + 9.));
  }
  fragColor = vec4(clamp(n, 0., 1.), 1.);
}`;
const FS_BZ_NOISE = `#version 300 es
precision highp float;
uniform float uTick;
out vec4 fragColor;
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main() { vec2 p = gl_FragCoord.xy; fragColor = vec4(h21(p + uTick), h21(p.yx + uTick + 31.), h21(p * 1.7 + uTick + 77.), 1.); }`;

BGMODES.belousov = {
  id: 'belousov', minScale: 0.7,
  fs: GL_PRE + `
uniform sampler2D uSim;
uniform vec2 uSimTexel;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = texture(uSim, uv).rgb;
  vec2 e = uSimTexel * 1.3;
  float gx = texture(uSim, uv + vec2(e.x, 0.)).r - texture(uSim, uv - vec2(e.x, 0.)).r;
  float gy = texture(uSim, uv + vec2(0., e.y)).r - texture(uSim, uv - vec2(0., e.y)).r;
  float lit = clamp(dot(vec2(gx, gy), vec2(-.7, .7)) * 2.5, -1., 1.);
  vec3 w = c * c;                                       // sharpen the fronts
  float tot = w.r + w.g + w.b;
  vec3 ink = (uP0 * w.r + uP1 * w.g + uP2 * w.b) / max(tot, 1e-4);
  float amt = smoothstep(.02, .6, tot);
  vec3 col = luma(uBase) < .4 ? uBase + ink * amt * (.5 + .22 * lit + .25 * uBands.x) : mix(uBase, ink, amt * .8) * (1. + .05 * lit);
  fragColor = vec4(finish(col), 1.);
}`,
  init(glx, m) {
    const gl = glx.gl, h = 230, w = Math.round(h * glx.w / glx.h), opt = { float: true, repeat: true };
    m.a = glx.makeTarget(w, h, opt); m.b = glx.makeTarget(w, h, opt);
    m.step = glx.prog('bz:step', FS_BZ_STEP);
    gl.disable(gl.BLEND);
    glx.prog('bz:noise', FS_BZ_NOISE).use().set('uTick', m.rng.range(0, 99));
    simPass(glx, m.a);
    const v = glx.seedV[2];                              // the three rates set how tight the spirals wind
    m.k = [1.0 + 0.5 * v, 1.0 + 0.5 * glx.seedV[3], 1.0 + 0.5 * (1 - v)];
    m.inj = new Float32Array(32); m.queue = []; m.count = 0; m.acc = 0;
    for (let i = 0; i < 40; i++) this.generation(glx, m);
  },
  resize(glx, m) { this.dispose(glx, m); this.init(glx, m); },
  dispose(glx, m) { glx.freeTarget(m.a); glx.freeTarget(m.b); m.a = m.b = null; },
  generation(glx, m) {
    m.inj.fill(0);
    for (let k = 0; k < 8 && m.queue.length; k++) m.inj.set(m.queue.shift(), k * 4);
    m.step.use().set('uPrev', m.a.tex).set('uTexel', [1 / m.a.w, 1 / m.a.h]).set('uK', m.k).set('uInj', m.inj).set('uAspect', m.a.w / m.a.h).set('uTick', m.count++);
    simPass(glx, m.b);
    const t = m.a; m.a = m.b; m.b = t;
  },
  // A hit stirs a drop of the dish back into noise, and new spirals wind out of it.
  onHit(glx, m, p, strength, col, soft) {
    if (soft) return;
    const uv = simUv(glx, p);
    m.queue.push([uv[0], uv[1], 0.02 + 0.03 * strength, 1]);
    if (m.queue.length > 8) m.queue.shift();
  },
  step(glx, m, U, S, dt) {
    glx.gl.disable(glx.gl.BLEND);
    m.acc += dt * (26 + 34 * S.energy + 30 * glx.bands[0]);     // generations per second follow the music
    let n = Math.min(3, Math.floor(m.acc));
    m.acc -= Math.floor(m.acc);
    if (m.queue.length && n < 1) n = 1;
    while (n-- > 0) this.generation(glx, m);
  },
  bind(glx, m, prog) { prog.set('uSim', m.a.tex).set('uSimTexel', [1 / m.a.w, 1 / m.a.h]); },
};

// ── sandpile: a cell holding four grains topples one onto each neighbour ──────────
// Heights are 16-bit, split over red and green. Blue glows where a cell has just toppled.
// Alpha is how long a cell has left. Its time starts when it first leaves the table's resting
// height; when it runs out the cell goes back there and its grains are gone. So a pile blooms
// into its fractal, stands for a few seconds, and is erased from the middle outward, in the
// order it was built.
const FS_SP_STEP = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uPrev;
uniform ivec2 uSize;
uniform vec4 uDrop[8];    // cell x, cell y, grains
uniform float uClear, uFill, uCool, uAge;
out vec4 fragColor;
int H(ivec2 q) {
  if (q.x < 0 || q.y < 0 || q.x >= uSize.x || q.y >= uSize.y) return 0;     // grains that leave the table are gone
  vec2 v = texelFetch(uPrev, q, 0).rg * 255.;
  return int(v.r + .5) + 256 * int(v.g + .5);
}
void main() {
  ivec2 q = ivec2(gl_FragCoord.xy);
  vec4 was = texelFetch(uPrev, q, 0);
  int h = H(q), t = h / 4;
  int n = h - 4 * t + H(q + ivec2(1, 0)) / 4 + H(q - ivec2(1, 0)) / 4 + H(q + ivec2(0, 1)) / 4 + H(q - ivec2(0, 1)) / 4;
  float heat = max(t > 0 ? 1. : 0., was.b - uCool);
  // a cell's time starts when it first leaves the resting height, and nothing renews it
  float life = (h == int(uFill) && n != h) ? 1. : max(was.a - uAge, 0.);
  if (uClear > .5 || (life <= 0. && n < 4)) { n = int(uFill); heat = 0.; life = 0.; }
  for (int i = 0; i < 8; i++) if (uDrop[i].z > 0. && q == ivec2(uDrop[i].xy)) { n += int(uDrop[i].z); life = 1.; }
  n = min(n, 65535);
  fragColor = vec4(float(n & 255) / 255., float(n >> 8) / 255., heat, life);
}`;

BGMODES.sandpile = {
  id: 'sandpile', minScale: 0.8,
  fs: GL_PRE + `
uniform sampler2D uSim;
uniform vec2 uSimSize;
uniform float uRest;
void main() {
  vec2 g = gl_FragCoord.xy / uRes * uSimSize;
  vec4 s = texelFetch(uSim, ivec2(g), 0);
  float h = s.r * 255. + s.g * 65280.;
  float lv = h > 3.5 ? 4. : mod(h - uRest + 4., 4.);          // counted from the table's resting height, which is the ground colour
  vec3 col = lv < .5 ? uBase : lv < 1.5 ? mix(uBase, uP0, .55) : lv < 2.5 ? mix(uBase, uP1, .7) : lv < 3.5 ? mix(uBase, uP2, .86) : uP3;
  col = mix(uBase, col, smoothstep(0., .3, s.a));            // a pile fades as its time runs out
  col = mix(col, uInk, s.b * (.55 + .3 * uBands.x));         // cells that have just toppled glow, so an avalanche shows as it runs
  vec2 f = abs(fract(g) - .5);
  col = mix(uBase, col, .35 + .65 * smoothstep(.5, .4, max(f.x, f.y)));     // a hairline between cells
  fragColor = vec4(finish(col), 1.);
}`,
  init(glx, m) {
    const h = clamp(Math.round(glx.cssH / 6), 96, 170), w = Math.round(h * glx.w / glx.h);
    m.a = glx.makeTarget(w, h, { nearest: true }); m.b = glx.makeTarget(w, h, { nearest: true });
    m.step = glx.prog('sp:step', FS_SP_STEP);
    m.fill = [0, 0, 2][Math.floor(glx.seedV[2] * 3) % 3];        // an empty table, or one already two grains deep
    m.drop = new Float32Array(32); m.queue = []; m.section = -1; m.clear = 1; m.ambient = 0;
  },
  resize(glx, m) { this.dispose(glx, m); this.init(glx, m); },
  dispose(glx, m) { glx.freeTarget(m.a); glx.freeTarget(m.b); m.a = m.b = null; },
  onHit(glx, m, p, strength, col, soft) {
    if (soft) return;
    const uv = simUv(glx, p), big = m.fill ? 0.12 : 1;          // a deep table spreads the same grains much further
    m.queue.push([Math.floor(uv[0] * m.a.w), Math.floor(uv[1] * m.a.h), Math.round((180 + 420 * strength * strength) * big)]);     // about the footprint of the note that made it
    if (m.queue.length > 16) m.queue.shift();
  },
  step(glx, m, U, S, dt) {
    const gl = glx.gl;
    gl.disable(gl.BLEND);
    if (S.section !== m.section) {                  // a new section sweeps the table
      if (m.section >= 0 && S.playing) m.clear = 1;
      m.section = S.section;
    }
    m.ambient -= dt;
    if (m.ambient < 0 && !S.playing) {              // left alone, the table drops a tall pile of its own: the classic single-source fractal
      m.ambient = 5.2;
      const c = simUv(glx, glx.center), r = () => (Math.random() - 0.5) * 0.25;
      m.queue.push([Math.floor((c[0] + r() * m.a.h / m.a.w) * m.a.w), Math.floor((c[1] + r()) * m.a.h), 5200 * (m.fill ? 0.12 : 1)]);
    }
    const steps = Math.round(24 + 30 * S.energy);
    for (let i = 0; i < steps; i++) {
      m.drop.fill(0);
      if (i === 0) for (let k = 0; k < 8 && m.queue.length; k++) m.drop.set(m.queue.shift(), k * 4);
      m.step.use().set('uPrev', m.a.tex).set('uSize', [m.a.w, m.a.h]).set('uDrop', m.drop).set('uClear', m.clear).set('uFill', m.fill)
        .set('uCool', i === 0 ? 0.07 : 0).set('uAge', i === 0 ? (S.playing ? 2 : 1) / 255 : 0);       // the glow cools and the piles age once a frame, not once a step
      simPass(glx, m.b);
      m.clear = 0;
      const t = m.a; m.a = m.b; m.b = t;
    }
  },
  bind(glx, m, prog) { prog.set('uSim', m.a.tex).set('uSimSize', [m.a.w, m.a.h]).set('uRest', m.fill); },
};

// ── feedback: a camera pointed at its own monitor ─────────────────────────────
// The shader looks at the previous finished background (blooms, sparks and all), a little
// smaller and a little turned, and draws the beat, the waveform and the hits on top.
BGMODES.feedback = {
  id: 'feedback', minScale: 0.6,
  fs: GL_PRE + `
uniform sampler2D uPrev;
uniform float uZoom, uTwist, uKeep;
uniform vec3 uShape;       // sides, mirror, spiral
float ngon(vec2 p, float n, float r) {       // distance to a regular polygon's outline
  float a = atan(p.y, p.x) + PI / n, seg = TAU / n;
  return abs(cos(mod(a, seg) - seg * .5) * length(p) - r * cos(PI / n));
}
void main() {
  vec2 asp = vec2(uRes.x / uRes.y, 1.);
  vec2 p = P() - uCenter;
  // where this point was a frame ago
  vec2 q = p;
  if (uShape.y > .5) q.x = abs(q.x);                                   // a mirror down the middle
  float r = length(q) + 1e-5;
  q = rot(uTwist * (1. + uShape.z * (.6 / (r + .25) - 1.))) * q * uZoom;    // the spiral variant turns faster toward the middle
  vec2 uvp = (q + uCenter) / asp + .5;
  vec3 prev = texture(uPrev, uvp).rgb - uBase;
  // each pass the picture gives a little of its colour to the next pen along
  prev = mix(prev, prev.gbr, .035);
  vec3 sig = sign(prev) * max(abs(prev) * uKeep - 1.6 / 255., 0.);      // the subtraction lets faint trails reach zero
  float inside = step(0., uvp.x) * step(uvp.x, 1.) * step(0., uvp.y) * step(uvp.y, 1.);
  sig *= inside;

  // what the camera sees that is new
  float n = uShape.x, pulse = pow(1. - uBeat, 3.);
  vec2 s = rot(uTime * .21 + floor(uBeats) * .31) * p;
  float size = .2 + .05 * pulse + .08 * uBands.x;
  float line = smoothstep(.006, .0015, ngon(s, n, size)) * (.35 + .65 * pulse);
  float a = atan(p.y, p.x) / TAU + .5;
  float wr = .36 + .05 * wave(abs(fract(a * 2.) * 2. - 1.));
  line += smoothstep(.004, .001, abs(length(p) - wr)) * smoothstep(.02, .15, uBands.w) * .7;
  vec3 add = pal4(uBeats * .0625 + uSeed.w) * line;
  vec2 ps = P();
  for (int i = 0; i < 8; i++) {
    float age = uTime - uHits[i].z;
    if (uHits[i].w <= 0. || age < 0. || age > .3) continue;
    float d = length(ps - uHits[i].xy);
    add += uHitCol[i] * smoothstep(.006, .001, abs(d - .03 - age * .2)) * (1. - age / .3) * uHits[i].w;
  }
  vec3 col = uBase + sig + add * (1. - uDim) * (luma(uBase) < .4 ? 1. : -1.);
  vec3 d = col - uBase;
  float m = max(abs(d.r), max(abs(d.g), abs(d.b)));
  fragColor = vec4(uBase + d / (1. + uCalm * max(m - .35, 0.) * 2.), 1.);
}`,
  init(glx, m) {
    m.prev = glx.makeTarget(glx.bgT.w, glx.bgT.h);
    const v = glx.seedV;
    m.dir = v[2] < 0.5 ? 1 : -1;                    // falling in or flying out
    m.turn = (v[3] < 0.5 ? 1 : -1) * (0.012 + 0.03 * v[0]);
    m.shape = [3 + Math.floor(v[1] * 5), v[2] > 0.25 && v[2] < 0.75 ? 1 : 0, v[3] > 0.6 ? 1 : 0];
  },
  resize(glx, m) { this.rescale(glx, m); },
  rescale(glx, m) { if (!m.prev) return; glx.freeTarget(m.prev); m.prev = glx.makeTarget(glx.bgT.w, glx.bgT.h); },
  dispose(glx, m) { glx.freeTarget(m.prev); m.prev = null; },
  step(glx, m, U, S, dt) {
    const f = dt * 60;                              // the same motion at any frame rate
    m.zoom = Math.pow(1 + m.dir * (0.012 + 0.014 * S.energy + 0.02 * glx.bands[0]), f);
    m.twist = m.turn * f * (0.6 + 0.8 * S.energy);
    m.keep = Math.pow(S.playing ? 0.93 : 0.955, f);
  },
  bind(glx, m, prog) { prog.set('uPrev', m.prev.tex).set('uZoom', m.zoom || 1.02).set('uTwist', m.twist || 0.02).set('uKeep', m.keep || 0.94).set('uShape', m.shape); },
  after(glx, m) { glx.gl.disable(glx.gl.BLEND); glx.copy(glx.bgT, m.prev); },
};
