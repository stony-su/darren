'use strict';
// ─────────────────────────────────────────────────────────────
// bgmodes: one generative background per mode.
// Pure fragment shaders:  paper · julia · tunnel · truchet · ripple · crystal
// GPU simulations:        turing (Gray–Scott) · automaton (cyclic CA) · attractor (point cloud)
// Every shader ends in finish(), which applies the background dim.
// ─────────────────────────────────────────────────────────────

const BGMODES = {};

BGMODES.flat = { id: 'flat', minScale: 1, fs: GL_PRE + `
void main() { fragColor = vec4(uBase, 1.); }` };

// ── paper: drafting film with fibres and a little cloudiness ─────────────
// The sheet itself never changes, so it is rendered once and kept; only the moiré is live.
const FS_PAPER_BASE = GL_PRE + `
void main() {
  vec2 px = gl_FragCoord.xy * (900. / uRes.y);
  float fib = fbm(vec2(px.x * .012, px.y * .21) + uSeed.xy * 50.) - .5;
  float cloud = fbm(px * .0032 + uSeed.zw * 20.) - .5;
  float grain = hash21(floor(px * 1.3) + uSeed.xy * 7.) - .5;
  fragColor = vec4(uBase * (1. + fib * .028 + cloud * .035 + grain * .02), 1.);
}`;
BGMODES.paper = {
  id: 'paper', minScale: 1, sized: true,
  fs: GL_PRE + `
uniform sampler2D uPaper;
void main() {
  vec3 col = texture(uPaper, gl_FragCoord.xy / uRes).rgb;
  if (uKiai > .01) {      // peak sections: two families of concentric circles slide across each other
    vec2 p = P() - uCenter;
    float sway = uTime * .35, gap = .0188, r = length(p);
    vec2 o = .054 * vec2(cos(sway), sin(sway * 1.3));
    float mask = smoothstep(.64, .58, r) * uKiai * (.55 + .45 * pow(1. - uBeat, 3.));
    float a = 1. - smoothstep(.0, .09, abs(fract(length(p - o) / gap + .5) - .5));
    float b = 1. - smoothstep(.0, .09, abs(fract(length(p + o) / gap + .5) - .5));
    col = mix(col, uInk, a * mask * .2);
    col = mix(col, uAccent, b * mask * .2);
  }
  // The pen also draws what it hears, in the two margins: the waveform as a seismograph trace on the
  // right, the spectrum as a ladder of hairlines on the left (bass at the bottom).
  vec2 q = P();
  float hw = .5 * uRes.x / uRes.y, room = smoothstep(.62, .74, hw);
  if (room > 0. && uBands.w > .003) {
    float y = clamp(q.y / .7 + .5, 0., 1.), ends = smoothstep(0., .04, y) * smoothstep(1., .96, y);
    float x0 = hw - .075 + .028 * wave(y);
    col = mix(col, uInk, smoothstep(.0021, .0007, abs(q.x - x0)) * ends * room * .5);
    float rung = smoothstep(.34, .2, abs(fract(y * 56.) - .5));
    float bar = spec((floor(y * 56.) + .5) / 56.) * .085;
    col = mix(col, uAccent, rung * step(-hw + .03, q.x) * step(q.x, -hw + .03 + bar) * ends * room * .5);
  }
  fragColor = vec4(col, 1.);
}`,
  init(glx, m) {
    m.base = glx.makeTarget(glx.w, glx.h);
    glx.gl.bindVertexArray(glx.vao);
    glx.gl.disable(glx.gl.BLEND);
    glx.target(m.base);
    glx.prog('paper:base', FS_PAPER_BASE).use().set('uRes', [m.base.w, m.base.h]).set('uSeed', glx.seedV).set('uBase', glx.pal.v.paper);
    glx.tri();
  },
  resize(glx, m) { this.dispose(glx, m); this.init(glx, m); },
  dispose(glx, m) { glx.freeTarget(m.base); m.base = null; },
  bind(glx, m, prog) { prog.set('uPaper', m.base.tex); },
};

// ── julia: three families of Julia sets, the parameter c carried along its path by the music ──
BGMODES.julia = { id: 'julia', scale: 0.7, fs: GL_PRE + `
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
void main() {
  vec2 p = P() - uCenter;
  float kind = floor(uSeed.z * 3.);                 // 0: tour of the cardioid   1: the 0.7885 circle   2: cubic
  float zoom = mix(.95, .7, uKiai) * (1. - .03 * uPulse) * (1. + .08 * sin(uTime * .11));
  vec2 z = rot(uTime * .02 + uSeed.x * TAU) * p * zoom * 2.1;
  float th = uSeed.y * TAU + uFlow * .028 + .3 * sin(uTime * .13);
  float wob = .01 * sin(uTime * .9) + .015 * uHitPulse + .018 * uBands.x;     // the bass leans on the parameter
  vec2 e = vec2(cos(th), sin(th));
  vec2 c = kind < .5 ? (.5 * e - .25 * vec2(cos(2. * th), sin(2. * th))) * (1.035 + wob)
         : kind < 1.5 ? (.7885 + wob) * e
         : (.60 + wob) * e;
  vec2 dz = vec2(1., 0.);
  float m2 = 0., n = 0., trapO = 1e9, trapX = 1e9;
  for (int i = 0; i < 72; i++) {
    if (kind < 1.5) { dz = 2. * cmul(z, dz); z = cmul(z, z) + c; }
    else { vec2 z2 = cmul(z, z); dz = 3. * cmul(z2, dz); z = cmul(z2, z) + c; }
    m2 = dot(z, z);
    trapO = min(trapO, m2);
    trapX = min(trapX, abs(z.x * z.y));
    if (m2 > 256.) break;
    n += 1.;
  }
  vec3 col;
  if (m2 > 256.) {
    float pw = kind > 1.5 ? 3. : 2.;
    float sn = n + 1. - log(log(m2) * .5) / log(pw);             // smooth escape count
    float d = .5 * sqrt(m2 / max(dot(dz, dz), 1e-12)) * log(m2); // distance estimate
    float edge = exp(-d * 60. / zoom);
    float halo = exp(-d * 7. / zoom);
    float near = clamp(sn / 14., 0., 1.);
    vec3 band = pal4(sn * .035 + uSeed.w + uTime * .012);
    float contour = smoothstep(.1, 0., abs(fract(sn * .5) - .5));  // equipotential lines
    float chk = step(0., z.y);                                      // binary decomposition: the field lines
    col = uBase + band * (.06 + .10 * chk * near + .3 * halo) + band * contour * (.15 + .3 * spec(fract(sn * .04))) * (.35 + near);   // each equipotential is one band of the spectrum
    col += mix(band, uInk, .6) * edge * (.5 + .5 * uPulse);
  } else {
    col = uBase * .8 + pal4(sqrt(trapO) * 1.6 + uSeed.w + .45) * (.09 + .32 * exp(-trapX * 14.));
  }
  fragColor = vec4(finish(col), 1.);
}` };

// ── tunnel: raymarched corridors. Menger lattice · gyroid tube · turning gates ──
BGMODES.tunnel = { id: 'tunnel', scale: 0.62, fs: GL_PRE + `
float mapMenger(vec3 p) {
  float d = -1e5, s = 1.;
  for (int m = 0; m < 4; m++) {
    vec3 a = mod(p * s, 2.) - 1.;
    s *= 3.;
    vec3 r = abs(1. - 3. * abs(a));
    float da = max(r.x, r.y), db = max(r.y, r.z), dc = max(r.z, r.x);
    d = max(d, (min(da, min(db, dc)) - 1.) / s);
  }
  return d;
}
float mapGyroid(vec3 p) {
  float g = dot(sin(p * 2.6), cos(p.zxy * 2.6));
  float d = (abs(g) - .07) / 2.6 * .6;
  return max(d, .4 - length(p.xy));
}
float mapGates(vec3 p) {
  float id = floor(p.z / 1.1);
  vec3 q = vec3(p.xy, mod(p.z, 1.1) - .55);
  q.xy = rot(id * .31) * q.xy;                      // every gate turned a little further than the last
  float sq = max(abs(q.x), abs(q.y));
  float d = max(abs(sq - .8) - .06, abs(q.z) - .05);
  q.xy = rot(PI * .25) * q.xy;
  float sq2 = max(abs(q.x), abs(q.y));
  return min(d, max(abs(sq2 - 1.28) - .035, abs(q.z) - .03));
}
float scene(vec3 p, float kind) {
  if (kind > .5 && kind < 1.5) p.xy = rot(p.z * .22) * p.xy;
  return kind < .5 ? mapMenger(p) : kind < 1.5 ? mapGyroid(p) : mapGates(p);
}
vec3 penAt(float i) { i = mod(i, 4.); return i < .5 ? uP0 : i < 1.5 ? uP1 : i < 2.5 ? uP2 : uP3; }
void main() {
  float kind = floor(uSeed.z * 3.);
  vec2 q = P() - uCenter;
  vec3 ro = vec3(0., 0., uFlow * (kind < .5 ? .5 : .65));
  vec3 rd = normalize(vec3(q, .74 - .09 * uPulse));
  rd.xy = rot(.25 * sin(uTime * .11) + uSection * .7) * rd.xy;
  rd.xz = rot(.10 * sin(uTime * .19)) * rd.xz;
  rd.yz = rot(.07 * sin(uTime * .23)) * rd.yz;
  float t = .02, glow = 0., steps = 0., d = 1.;
  for (int i = 0; i < 56; i++) {
    d = scene(ro + rd * t, kind);
    glow += exp(-max(d, 0.) * 22.) * .018;
    if (d < .0012 * t || t > 16.) break;
    t += min(d * .85, .45);
    steps += 1.;
  }
  vec3 pos = ro + rd * t;
  float fog = exp(-t * .21);
  float ao = 1. - steps / 56.;
  float band = kind > 1.5 ? floor(pos.z / 1.1) * .5 + uSeed.w * 4. : pos.z * .11 + uSeed.w * 4.;
  vec3 tint = mix(penAt(floor(band)), penAt(floor(band) + 1.), smoothstep(.3, .7, fract(band)));
  vec3 col = uBase;
  if (t < 16.) {
    vec2 e = vec2(.003, 0.);
    vec3 n = normalize(vec3(
      scene(pos + e.xyy, kind) - scene(pos - e.xyy, kind),
      scene(pos + e.yxy, kind) - scene(pos - e.yxy, kind),
      scene(pos + e.yyx, kind) - scene(pos - e.yyx, kind)));
    float dif = max(dot(n, -rd), 0.);                 // a lamp on the camera
    float rim = pow(1. - dif, 3.);
    float rib = smoothstep(.035, 0., abs(fract(pos.z * 1.5) - .5) - .45) * step(kind, 1.5);
    tint = mix(tint, penAt(floor(band) + 2.), smoothstep(-.7, .7, n.y) * .55);   // faces tilt toward a second pen
    vec3 surf = tint * (.09 + .54 * dif * ao * ao) + mix(tint, uInk, .5) * rim * .16;
    surf += mix(tint, uInk, .35) * rib * (.22 + .5 * uPulse + 1.2 * spec(fract(floor(pos.z * 1.5 + .5) * .083)));   // the ribs are an equaliser running down the corridor
    col = mix(uBase, uBase * .6 + surf, fog);
  }
  col += tint * glow * (.22 + .5 * uPulse) * (.35 + .65 * fog);
  fragColor = vec4(finish(col), 1.);
}` };

// ── truchet: quarter-arc tiles, two-coloured; a ring of flips crosses the screen each bar ──
BGMODES.truchet = { id: 'truchet', minScale: 0.6, fs: GL_PRE + `
vec3 tile(vec2 p, float gen) {
  const float S = 6.5;
  vec2 g = p * S, id = floor(g), f = fract(g);
  float flip = step(.5, hash21(id + gen * 17.3 + uSeed.xy * 31.));
  if (flip > .5) f.x = 1. - f.x;
  float d1 = length(f), d2 = length(f - 1.);
  float d = min(abs(d1 - .5), abs(d2 - .5));
  float corner = step(d1, .5) + step(d2, .5);
  float chk = mod(id.x + id.y, 2.);
  float side = mod(chk + flip + corner, 2.);        // a consistent two-colouring of the whole plane
  float region = vnoise(p * 1.1 + uSeed.zw * 11.) + .25 * vnoise(p * 2.7 + 5.);
  vec3 b = mix(uBase, pal4(region * 1.1 + uSeed.w), .42);
  vec3 col = mix(uBase, b, side);
  float echo = smoothstep(.07, .0, abs(fract(d * 6. + .5) - .5) - .06) * smoothstep(.5, .1, d);
  col = mix(col, mix(col, uInk, .16), echo * side);
  col = mix(col, uInk, smoothstep(.034 + .022 * uBands.x, .02 + .012 * uBands.x, d) * .85);       // the line swells on the kick
  return col;
}
void main() {
  vec2 p = P() - uCenter;
  vec2 pp = rot(.06 * sin(uTime * .05)) * p + vec2(uFlow * .004, 0.);
  float span = mix(4., 2., step(.5, uKiai));
  float gen = floor(uBeats / span), ph = fract(uBeats / span);
  vec2 cc = (floor(pp * 6.5) + .5) / 6.5;
  float wave = ph * 2.6;
  float k = smoothstep(wave - .16, wave, length(cc));     // 1 → the ring has not reached this tile yet
  vec3 col = mix(tile(pp, gen), tile(pp, gen - 1.), k);
  float lip = smoothstep(.05, .0, abs(length(p) - wave)) * (1. - ph);
  col = mix(col, uInk, lip * .12);
  fragColor = vec4(finish(col), 1.);
}` };

// ── ripple: a ripple tank. Three slow ambient sources, plus one for every hit ──
BGMODES.ripple = { id: 'ripple', minScale: 0.6, fs: GL_PRE + `
void main() {
  vec2 p = P();
  float h = 0.;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 s = uCenter + .55 * vec2(cos(uTime * (.11 + .03 * fi) + fi * 2.1 + uSeed.x * 6.), sin(uTime * (.09 + .04 * fi) + fi * 1.3 + uSeed.y * 6.));
    h += sin(length(p - s) * (24. + 6. * fi) - uFlow * (1.5 + .3 * fi)) * .5;
  }
  h += wave(clamp(length(p - uCenter) * 1.25, 0., 1.)) * 1.5 * smoothstep(.0, .12, uBands.w);      // the music is a source too: its rings carry the waveform
  vec3 tint = vec3(0.);
  float tw = 0.;
  for (int i = 0; i < 8; i++) {
    float age = uTime - uHits[i].z;
    if (uHits[i].w <= 0. || age < 0. || age > 2.6) continue;
    float d = length(p - uHits[i].xy);
    float front = age * .6;
    float env = exp(-age * 1.4) * smoothstep(front + .01, front - .03, d) * exp(-max(front - d, 0.) * 5.);
    h += uHits[i].w * env * sin((d - front) * 70.) * 1.7;
    tint += uHitCol[i] * env;
    tw += env;
  }
  float bands = sin(h * PI * 2.4);
  float line = smoothstep(-.35, .35, bands);
  vec3 col = mix(uBase, mix(uBase, uGridC, .95), line);
  col = mix(col, mix(col, uInk, .22), smoothstep(.09, .0, abs(bands)));
  col = mix(col, tint / max(tw, 1e-3), clamp(tw, 0., 1.) * .75 * line);
  fragColor = vec4(finish(col), 1.);
}` };

// ── crystal: animated Voronoi glass with dark leading ─────────────────────
BGMODES.crystal = { id: 'crystal', minScale: 0.55, fs: GL_PRE + `
vec2 site(vec2 c) { vec2 o = hash22(c); return .5 + .42 * sin(uTime * .35 + TAU * o); }
void main() {
  vec2 x = (P() - uCenter) * 5.2 + uSeed.xy * 20. + vec2(uFlow * .015, 0.);
  vec2 n = floor(x), f = fract(x), mg = vec2(0.), mr = vec2(0.);
  float md = 8.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + site(n + g) - f;
    float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }
  float e = 8.;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j));
    vec2 r = g + site(n + g) - f;
    if (dot(mr - r, mr - r) > 1e-5) e = min(e, dot(.5 * (mr + r), normalize(r - mr)));
  }
  vec2 id = n + mg;
  float h = hash21(id + uSeed.zw * 7.);
  vec3 glass = pal4(h + uSeed.w);
  float facet = .5 + .5 * dot(normalize(vec3(mr, .55)), normalize(vec3(.4, .6, .7)));
  vec3 col = glass * (.16 + .26 * facet) * (.7 + .3 * smoothstep(.04, .14, e));
  float sweep = .5 + .5 * sin(h * TAU + uTime * .5);
  col *= .65 + .7 * sweep * (.35 + .65 * uEnergy) + uPulse * .35 * step(.62, h) + 1.1 * spec(h * .9);      // every pane listens to its own band of the spectrum
  vec2 p = P();
  for (int i = 0; i < 8; i++) {
    float age = uTime - uHits[i].z;
    if (uHits[i].w <= 0. || age < 0. || age > 1.4) continue;
    float d = length(p - uHits[i].xy);
    col += mix(uHitCol[i], glass, .4) * exp(-d * d * 16.) * exp(-age * 3.2) * .7 * uHits[i].w;
  }
  col = mix(uBase * .45, col + uBase * .5, smoothstep(.0, .05, e));
  col += uInk * smoothstep(.075, .05, e) * smoothstep(.03, .05, e) * .07;
  fragColor = vec4(finish(col), 1.);
}` };

// Shared by the simulations: converts a p-space point to simulation uv.
function simUv(glx, p) { return [p[0] * (glx.cssH / glx.cssW) + 0.5, p[1] + 0.5]; }

// ── turing: Gray–Scott reaction–diffusion; hits inoculate the dish ─────────
const FS_RD_STEP = `#version 300 es
precision highp float;
uniform sampler2D uPrev;
uniform vec2 uTexel, uFK;
uniform float uKill, uAspect;
uniform vec4 uInj[8];
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  vec2 c = texture(uPrev, uv).rg;
  vec2 tx = vec2(uTexel.x, 0.), ty = vec2(0., uTexel.y);
  vec2 l = -c;
  l += .2 * (texture(uPrev, uv + tx).rg + texture(uPrev, uv - tx).rg + texture(uPrev, uv + ty).rg + texture(uPrev, uv - ty).rg);
  l += .05 * (texture(uPrev, uv + tx + ty).rg + texture(uPrev, uv - tx - ty).rg + texture(uPrev, uv + tx - ty).rg + texture(uPrev, uv - tx + ty).rg);
  float F = uFK.x + (uv.y - .5) * .005;
  float K = uFK.y + (uv.x - .5) * .003 + uKill;
  float r = c.r * c.g * c.g;
  vec2 n = c + vec2(l.r - r + F * (1. - c.r), .5 * l.g + r - (F + K) * c.g);
  for (int i = 0; i < 8; i++) {
    if (uInj[i].w <= 0.) continue;
    vec2 d = (uv - uInj[i].xy) * vec2(uAspect, 1.);
    float m = smoothstep(uInj[i].z, uInj[i].z * .4, length(d)) * uInj[i].w;
    n.g = max(n.g, .5 * m);
    n.r = min(n.r, 1. - .5 * m);
  }
  fragColor = vec4(clamp(n, 0., 1.), 0., 1.);
}`;

// feed / kill pairs: coral, maze, worms, κ stripes, ε rings, ζ turmoil
const RD_PRESETS = [[0.0545, 0.062], [0.029, 0.057], [0.037, 0.06], [0.05, 0.063], [0.022, 0.059], [0.026, 0.061]];

BGMODES.turing = {
  id: 'turing', needsFloat: true, minScale: 0.7,
  fs: GL_PRE + `
uniform sampler2D uSim;
uniform vec2 uSimTexel;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float v = texture(uSim, uv).g;
  vec2 e = uSimTexel * 1.25;
  float gx = texture(uSim, uv + vec2(e.x, 0.)).g - texture(uSim, uv - vec2(e.x, 0.)).g;
  float gy = texture(uSim, uv + vec2(0., e.y)).g - texture(uSim, uv - vec2(0., e.y)).g;
  vec3 nrm = normalize(vec3(-gx * 9., -gy * 9., 1.));
  float lit = dot(nrm, normalize(vec3(-.45, .55, .7)));
  float m = smoothstep(.12, .3, v);
  vec3 ink = mix(pal4(fbm(uv * 2.5 + uSeed.xy * 9.) * 1.6 + uTime * .008), uInk, .2);
  vec3 col = mix(uBase, ink, m * .82);
  col *= 1. + (lit - .72) * .5 * m;
  col = mix(col, vec3(1.), pow(max(lit, 0.), 26.) * (.22 + .5 * uBands.z) * m);
  float rim = smoothstep(.08, .16, v) * (1. - smoothstep(.16, .3, v));
  col = mix(col, uInk, rim * .3);
  fragColor = vec4(finish(col), 1.);
}`,
  init(glx, m) {
    const h = 260, w = Math.round(h * glx.w / glx.h);
    m.a = glx.makeTarget(w, h, { float: true, repeat: true });
    m.b = glx.makeTarget(w, h, { float: true, repeat: true });
    const gl = glx.gl;
    for (const t of [m.a, m.b]) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.clearColor(1, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    m.step = glx.prog('rd:step', FS_RD_STEP);
    m.fk = RD_PRESETS[Math.floor(glx.seedV[2] * RD_PRESETS.length) % RD_PRESETS.length];
    m.inj = new Float32Array(32); m.queue = []; m.kill = 0; m.section = -1; m.ambient = 0;
    for (let i = 0; i < 7; i++) m.queue.push([m.rng.range(0.1, 0.9), m.rng.range(0.1, 0.9), m.rng.range(0.02, 0.05), 1]);
  },
  resize(glx, m) { this.dispose(glx, m); this.init(glx, m); },
  dispose(glx, m) { glx.freeTarget(m.a); glx.freeTarget(m.b); m.a = m.b = null; },
  onHit(glx, m, p, strength) {
    const uv = simUv(glx, p);
    m.queue.push([uv[0], uv[1], 0.018 + 0.014 * strength, 1]);
    if (m.queue.length > 8) m.queue.shift();
  },
  step(glx, m, U, S, dt) {
    const gl = glx.gl;
    if (S.section !== m.section) {                  // a new section dissolves the dish, then reseeds it
      if (m.section >= 0) { m.kill = 0.5; for (let i = 0; i < 5; i++) m.queue.push([Math.random(), Math.random(), 0.03, 1]); }
      m.section = S.section;
    }
    m.kill = Math.max(0, m.kill - dt * 1.4);
    m.ambient -= dt;
    if (m.ambient < 0 && !S.playing) { m.ambient = 1.2; m.queue.push([Math.random(), Math.random(), 0.02 + Math.random() * 0.03, 1]); }
    const steps = Math.round(8 + 8 * S.energy);
    gl.viewport(0, 0, m.a.w, m.a.h);
    for (let i = 0; i < steps; i++) {
      m.inj.fill(0);
      if (i === 0) { for (let k = 0; k < 8 && m.queue.length && m.kill < 0.05; k++) m.inj.set(m.queue.shift(), k * 4); }
      gl.bindFramebuffer(gl.FRAMEBUFFER, m.b.fbo);
      m.step.use().set('uPrev', m.a.tex).set('uTexel', [1 / m.a.w, 1 / m.a.h]).set('uFK', m.fk)
        .set('uKill', m.kill > 0.05 ? 0.012 : 0).set('uAspect', m.a.w / m.a.h).set('uInj', m.inj);
      glx.tri();
      const t = m.a; m.a = m.b; m.b = t;
    }
  },
  bind(glx, m, prog) { prog.set('uSim', m.a.tex).set('uSimTexel', [1 / m.a.w, 1 / m.a.h]); },
};

// ── automaton: cyclic cellular automaton. One generation per sixteenth note ──
const FS_CCA_STEP = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uPrev;
uniform int uN, uThresh, uRange, uMoore;
uniform ivec2 uSize;
uniform vec4 uInj[8];
uniform float uTick;
out vec4 fragColor;
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
int st(ivec2 q) { q = (q + uSize) % uSize; return int(texelFetch(uPrev, q, 0).r * 255. + .5); }
void main() {
  ivec2 q = ivec2(gl_FragCoord.xy);
  int s = st(q), nx = (s + 1) % uN, cnt = 0;
  for (int dy = -2; dy <= 2; dy++) for (int dx = -2; dx <= 2; dx++) {
    if ((dx == 0 && dy == 0) || abs(dx) > uRange || abs(dy) > uRange) continue;
    if (uMoore == 0 && abs(dx) + abs(dy) > uRange) continue;
    if (st(q + ivec2(dx, dy)) == nx) cnt++;
  }
  int o = cnt >= uThresh ? nx : s;
  vec2 uv = (vec2(q) + .5) / vec2(uSize);
  for (int i = 0; i < 8; i++) {
    if (uInj[i].w <= 0.) continue;
    vec2 d = (uv - uInj[i].xy) * vec2(float(uSize.x) / float(uSize.y), 1.);
    if (length(d) < uInj[i].z) o = int(h21(vec2(q) + uTick) * float(uN));
  }
  fragColor = vec4(float(o) / 255., float(s) / 255., 0., 1.);
}`;

// [range, threshold, states, moore]
const CCA_RULES = [[1, 1, 14, 0], [1, 3, 4, 1], [1, 3, 3, 1], [2, 2, 6, 0]];

BGMODES.automaton = {
  id: 'automaton', minScale: 0.75,
  fs: GL_PRE + `
uniform sampler2D uSim;
uniform vec2 uSimSize;
uniform float uNf, uPhase;
vec3 stateCol(float s) {
  float t = s / uNf;
  float b = pow(.5 + .5 * cos(TAU * t), 2.2);       // one stretch of the cycle glows: the wavefront
  return uBase + pal4(t * .6 + uSeed.w) * (b * (.62 + .45 * uBands.x) + .05);
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 g = uv * uSimSize;
  vec2 st = texelFetch(uSim, ivec2(g), 0).rg * 255.;
  vec3 col = mix(stateCol(st.g), stateCol(st.r), smoothstep(0., 1., uPhase));
  vec2 f = abs(fract(g) - .5);
  float cell = smoothstep(.5, .36, max(f.x, f.y));    // each cell is a soft-cornered lamp
  col = mix(uBase * .8, col, .25 + .75 * cell);
  fragColor = vec4(finish(col), 1.);
}`,
  init(glx, m) {
    const h = clamp(Math.round(glx.cssH / 7), 80, 200), w = Math.round(h * glx.w / glx.h);
    m.a = glx.makeTarget(w, h, { nearest: true }); m.b = glx.makeTarget(w, h, { nearest: true });
    m.rule = CCA_RULES[Math.floor(glx.seedV[2] * CCA_RULES.length) % CCA_RULES.length];
    m.step = glx.prog('cca:step', FS_CCA_STEP);
    m.inj = new Float32Array(32); m.queue = []; m.tick = -1; m.phase = 1; m.count = 0;
    const gl = glx.gl, data = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) { data[i * 4] = Math.floor(m.rng.next() * m.rule[2]); data[i * 4 + 3] = 255; }
    gl.bindTexture(gl.TEXTURE_2D, m.a.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);
    for (let i = 0; i < 260; i++) this.generation(glx, m);
  },
  resize(glx, m) { this.dispose(glx, m); this.init(glx, m); },
  dispose(glx, m) { glx.freeTarget(m.a); glx.freeTarget(m.b); m.a = m.b = null; },
  generation(glx, m) {
    const gl = glx.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, m.b.fbo);
    gl.viewport(0, 0, m.a.w, m.a.h);
    m.inj.fill(0);
    for (let k = 0; k < 8 && m.queue.length; k++) m.inj.set(m.queue.shift(), k * 4);
    m.step.use().set('uPrev', m.a.tex).set('uN', m.rule[2]).set('uThresh', m.rule[1]).set('uRange', m.rule[0]).set('uMoore', m.rule[3])
      .set('uSize', [m.a.w, m.a.h]).set('uInj', m.inj).set('uTick', m.count++);
    glx.tri();
    const t = m.a; m.a = m.b; m.b = t;
  },
  onHit(glx, m, p, strength) {
    const uv = simUv(glx, p);
    m.queue.push([uv[0], uv[1], 0.03 + 0.03 * strength, 1]);
    if (m.queue.length > 8) m.queue.shift();
  },
  step(glx, m, U, S) {
    const tick = Math.floor(S.beats * 4);             // sixteenth notes
    if (tick !== m.tick) { m.tick = tick; this.generation(glx, m); }
    m.phase = S.beats * 4 - tick;
  },
  bind(glx, m, prog) { prog.set('uSim', m.a.tex).set('uSimSize', [m.a.w, m.a.h]).set('uNf', m.rule[2]).set('uPhase', m.phase); },
};

// ── attractor: Clifford and de Jong maps iterated in the vertex shader, accumulated as light ──
const VS_ATTR = `#version 300 es
precision highp float;
uniform vec4 uA;
uniform float uKind, uFrame;
uniform vec2 uScale, uOff;
out float vW;
vec2 h22(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
void main() {
  float id = float(gl_VertexID);
  vec2 p = h22(vec2(id * .37 + uFrame * 13.1, id * .011 + 3.7)) * 4. - 2.;
  vec2 q = p;
  for (int i = 0; i < 20; i++) {
    q = p;
    p = uKind < .5
      ? vec2(sin(uA.x * q.y) + uA.z * cos(uA.x * q.x), sin(uA.y * q.x) + uA.w * cos(uA.y * q.y))
      : vec2(sin(uA.x * q.y) - cos(uA.y * q.x), sin(uA.z * q.x) - cos(uA.w * q.y));
  }
  vW = length(p - q);
  gl_Position = vec4(p * uScale + uOff, 0., 1.);
  gl_PointSize = 1.;
}`;
const FS_ATTR = `#version 300 es
precision highp float;
uniform float uGain;
in float vW;
out vec4 fragColor;
void main() { fragColor = vec4(uGain, uGain * vW * .5, 0., 1.); }`;
const FS_FILL = `#version 300 es
precision highp float;
out vec4 fragColor;
void main() { fragColor = vec4(0.); }`;

// kind 0 = Clifford (a, b, c, d), kind 1 = de Jong (a, b, c, d)
const ATTRACTORS = [
  [0, -1.4, 1.6, 1.0, 0.7], [0, 1.7, 1.7, 0.6, 1.2], [0, 1.5, -1.8, 1.6, 0.9], [0, -1.7, 1.3, -0.1, -1.2], [0, -1.8, -2.0, -0.5, -0.9],
  [1, 1.4, -2.3, 2.4, -2.1], [1, 2.01, -2.53, 1.61, -0.33], [1, -2.7, -0.09, -0.86, -2.2], [1, -0.827, -1.637, 1.659, -0.943], [1, 1.641, 1.902, 0.316, 1.525],
];

BGMODES.attractor = {
  id: 'attractor', minScale: 0.7,
  fs: GL_PRE + `
uniform sampler2D uAcc;
uniform float uExposure;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 a = texture(uAcc, uv).rg;
  float d = 1. - exp(-a.r * uExposure);
  float hue = a.g / max(a.r, 1e-4);
  vec3 tint = mix(uP0, uP1, smoothstep(.15, 1.1, hue));
  tint = mix(tint, uP2, smoothstep(1.0, 1.9, hue));
  vec3 col = uBase + tint * pow(d, .85) * .9 + uInk * pow(d, 5.) * .45;
  col += pal4(fbm(P() * 1.4 + uTime * .02) + uSeed.w) * .028;
  fragColor = vec4(finish(col), 1.);
}`,
  init(glx, m) {
    const w = Math.min(1500, Math.round(glx.w * 0.8)), h = Math.round(w * glx.h / glx.w);
    m.acc = glx.makeTarget(w, h, { float: true });
    m.pts = glx.prog('attr:pts', FS_ATTR, VS_ATTR);
    m.fill = glx.prog('fill', FS_FILL);
    m.idx = Math.floor(glx.seedV[2] * ATTRACTORS.length) % ATTRACTORS.length;
    m.cur = ATTRACTORS[m.idx].slice(1); m.from = m.cur.slice(); m.to = m.cur.slice(); m.mix = 1;
    m.kind = ATTRACTORS[m.idx][0]; m.section = -1; m.frame = 0;
  },
  resize(glx, m) { this.dispose(glx, m); this.init(glx, m); },
  dispose(glx, m) { glx.freeTarget(m.acc); m.acc = null; },
  step(glx, m, U, S, dt) {
    const gl = glx.gl;
    if (S.section !== m.section) {                  // each section morphs to a sibling of the same family
      if (m.section >= 0) {
        const fam = ATTRACTORS.filter(a => a[0] === m.kind);
        m.from = m.cur.slice(); m.to = fam[(fam.indexOf(ATTRACTORS[m.idx]) + S.section) % fam.length].slice(1); m.mix = 0;
      }
      m.section = S.section;
    }
    m.mix = Math.min(1, m.mix + dt * 0.45);
    const e = m.mix * m.mix * (3 - 2 * m.mix), t = glx.time;
    const wob = [Math.sin(t * 0.31), Math.sin(t * 0.23 + 1), Math.sin(t * 0.17 + 2), Math.sin(t * 0.29 + 3)];
    const A = m.cur.map((_, i) => lerp(m.from[i], m.to[i], e) + wob[i] * 0.05 + (i % 2 ? 1 : -1) * (glx.hitPulse * 0.02 + glx.bands[0] * 0.035));
    m.cur = m.cur.map((_, i) => lerp(m.from[i], m.to[i], e));
    const ext = m.kind === 0 ? Math.max(1 + Math.abs(A[2]), 1 + Math.abs(A[3])) : 2;
    const s = 0.84 / ext;
    gl.bindFramebuffer(gl.FRAMEBUFFER, m.acc.fbo);
    gl.viewport(0, 0, m.acc.w, m.acc.h);
    gl.enable(gl.BLEND);
    const keep = Math.pow(0.86, dt * 60);
    gl.blendColor(keep, keep, keep, keep);
    gl.blendFunc(gl.ZERO, gl.CONSTANT_COLOR);
    m.fill.use(); glx.tri();
    gl.blendFunc(gl.ONE, gl.ONE);
    const fl = m.acc.float, n = fl ? Math.round(150000 + 110000 * S.energy) : 60000;
    m.pts.use().set('uA', A).set('uKind', m.kind).set('uFrame', (m.frame++ % 977) + 1)
      .set('uScale', [s * glx.h / glx.w, s]).set('uOff', [glx.center[0] * 2 * glx.h / glx.w, glx.center[1] * 2])
      .set('uGain', fl ? 1 : 0.012);
    gl.drawArrays(gl.POINTS, 0, n);
    gl.disable(gl.BLEND);
    m.exposure = (fl ? 0.085 : 2.4) * (0.8 + 0.3 * S.pulse + 0.4 * glx.hitPulse + 0.6 * glx.bands[3]);
  },
  bind(glx, m, prog) { prog.set('uAcc', m.acc.tex).set('uExposure', m.exposure || 0.08); },
};
