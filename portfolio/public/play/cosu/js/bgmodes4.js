'use strict';
// ─────────────────────────────────────────────────────────────
// bgmodes4: three fractals.
//   mandelbulb  a Mandelbulb or a Mandelbox, raymarched
//   newton      Newton's method, with the player's last hits as the roots
//   lyapunov    Markus–Lyapunov: where the logistic map settles and where it does not
// ─────────────────────────────────────────────────────────────

BGMODES.mandelbulb = { id: 'mandelbulb', scale: 0.5, minScale: 0.3, fs: GL_PRE + `
uniform float uPower, uBoxScale;
float kind;
// distance estimate and orbit trap
vec2 bulb(vec3 p) {
  vec3 z = p;
  float dr = 1., r = 0., trap = 1e9;
  for (int i = 0; i < 6; i++) {
    r = length(z);
    if (r > 2.) break;
    float th = acos(z.z / r) * uPower, ph = atan(z.y, z.x) * uPower;
    dr = pow(r, uPower - 1.) * uPower * dr + 1.;
    z = pow(r, uPower) * vec3(sin(th) * cos(ph), sin(ph) * sin(th), cos(th)) + p;
    trap = min(trap, r);
  }
  return vec2(.5 * log(r) * r / dr, trap);
}
vec2 box(vec3 p) {
  vec3 z = p;
  float dr = 1., trap = 1e9;
  for (int i = 0; i < 10; i++) {
    z = clamp(z, -1., 1.) * 2. - z;                               // fold in the box
    float r2 = dot(z, z);
    if (r2 < .25) { z *= 4.; dr *= 4.; } else if (r2 < 1.) { z /= r2; dr /= r2; }   // fold in the sphere
    z = z * uBoxScale + p;
    dr = dr * abs(uBoxScale) + 1.;
    trap = min(trap, r2);
  }
  return vec2(length(z) / abs(dr), sqrt(trap));
}
vec2 scene(vec3 p) { return kind < .5 ? bulb(p) : box(p); }
void main() {
  kind = step(.5, uSeed.z);
  vec2 q = P() - uCenter;
  float reach = kind < .5 ? 1.25 : 3.3;                          // the fractal fits inside a ball of this radius
  float dist = (kind < .5 ? 2.55 : 6.4) * mix(1., .82, uKiai) * (1. - .02 * uPulse);
  float ya = uTime * .07 + uSeed.x * TAU + uFlow * .01, pa = .35 * sin(uTime * .05 + uSeed.y * TAU);
  vec3 ro = dist * vec3(cos(pa) * cos(ya), sin(pa), cos(pa) * sin(ya));
  vec3 fw = normalize(-ro), rt = normalize(cross(vec3(0., 1., 0.), fw)), up = cross(fw, rt);
  vec3 rd = normalize(fw * 1.55 + rt * q.x + up * q.y);
  vec3 col = uBase + pal4(uSeed.w + .3) * .03 * exp(-dot(q, q) * 3.);
  // only rays that meet the bounding ball are marched
  float b = dot(ro, rd), c = dot(ro, ro) - reach * reach, disc = b * b - c;
  if (disc > 0.) {
    float t = max(-b - sqrt(disc), 0.), tEnd = -b + sqrt(disc), steps = 0., glow = 0.;
    vec2 d = vec2(1.);
    for (int i = 0; i < 52; i++) {
      d = scene(ro + rd * t);
      glow += exp(-d.x * 30.) * .012;
      if (d.x < .0016 * t || t > tEnd) break;
      t += d.x * .9;
      steps += 1.;
    }
    if (t < tEnd) {
      vec3 pos = ro + rd * t;
      vec2 e = vec2(.0025 * t, 0.);
      vec3 n = normalize(vec3(scene(pos + e.xyy).x - scene(pos - e.xyy).x, scene(pos + e.yxy).x - scene(pos - e.yxy).x, scene(pos + e.yyx).x - scene(pos - e.yyx).x));
      float ao = pow(1. - steps / 52., 1.6);
      float dif = max(dot(n, normalize(vec3(.5, .7, -.4) + fw * -.6)), 0.), rim = pow(1. - max(dot(n, -rd), 0.), 3.);
      vec3 tint = pal4(d.y * (kind < .5 ? 1.5 : .8) + uSeed.w + spec(clamp(d.y * .6, 0., 1.)) * .25);   // the orbit trap picks the pen, and the spectrum nudges it
      col = uBase * .5 + tint * (.1 + .62 * dif * ao + .12 * ao) + mix(tint, uInk, .5) * rim * (.12 + .3 * uPulse);
    }
    col += pal4(uSeed.w + .5) * glow * (.5 + .9 * uBands.x);
  }
  fragColor = vec4(finish(col), 1.);
}`,
  step(glx, m, U, S) {
    const t = glx.time;
    m.power = 8 + 1.6 * Math.sin(t * 0.09 + glx.seedV[0] * 6) + 0.5 * glx.bands[0] + 0.25 * glx.hitPulse;     // the classic morph: the power drifts, and the bass pushes it
    m.box = (glx.seedV[3] < 0.5 ? -1.5 : -1.8) + 0.12 * Math.sin(t * 0.07) - 0.05 * glx.bands[0];
  },
  bind(glx, m, prog) { prog.set('uPower', m.power || 8).set('uBoxScale', m.box || -1.5); },
};

// ── newton: z ← z − a·p(z)/p′(z), for a polynomial whose roots are where you last hit ──
BGMODES.newton = { id: 'newton', scale: 0.8, minScale: 0.5, fs: GL_PRE + `
uniform vec2 uRoots[5];
uniform float uN;
uniform vec2 uRelax;
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cinv(vec2 z) { return vec2(z.x, -z.y) / max(dot(z, z), 1e-12); }
void main() {
  vec2 z = P();
  float n = 0., d = 1e9, dPrev = 1e9;
  int which = 0;
  for (int i = 0; i < 28; i++) {
    vec2 s = vec2(0.);                                // p′/p is the sum of 1/(z − root)
    for (int k = 0; k < 5; k++) if (float(k) < uN) s += cinv(z - uRoots[k]);
    z -= cmul(uRelax, cinv(s));
    dPrev = d; d = 1e9;
    for (int k = 0; k < 5; k++) if (float(k) < uN) { float dk = length(z - uRoots[k]); if (dk < d) { d = dk; which = k; } }
    n += 1.;
    if (d < 1e-3) break;
  }
  // convergence is quadratic, so the logarithm of the distance doubles each step: that gives a smooth count
  float sn = d < 1e-3 ? n + 1. - log2(clamp(log(d) / log(1e-3), 1., 2.)) * 1. : n;
  vec3 pen = which == 0 ? uP0 : which == 1 ? uP1 : which == 2 ? uP2 : which == 3 ? uP3 : mix(uP0, uP2, .5);
  float shade = exp(-sn * .13), band = .5 + .5 * cos(sn * PI);
  vec3 col;
  if (luma(uBase) < .4) col = uBase + pen * (.08 + .6 * shade) * (.82 + .18 * band) + uInk * smoothstep(9., 22., sn) * (.1 + .35 * uBands.z);
  else col = mix(uBase, pen, (.2 + .62 * shade) * (.85 + .15 * band));
  col = mix(col, uInk, smoothstep(.012, .008, length(P() - uRoots[which])) * .5);       // a dot on each root
  fragColor = vec4(finish(col), 1.);
}`,
  init(glx, m) {
    m.n = 3 + Math.floor(glx.seedV[2] * 3);          // three, four or five roots
    m.home = []; m.at = []; m.to = []; m.k = 0;
    for (let i = 0; i < 5; i++) {
      const a = glx.seedV[0] * TAU + (i / m.n) * TAU, p = [0.3 * Math.cos(a), 0.3 * Math.sin(a)];
      m.home.push(p); m.at.push(p.slice()); m.to.push(p.slice());
    }
    m.flat = new Float32Array(10);
  },
  // Each hit takes the next root and puts it where the hit landed; the basins re-form around it.
  onHit(glx, m, p, strength) {
    if (strength < 0.4) return;
    m.to[m.k++ % m.n] = [p[0], p[1]];
  },
  step(glx, m, U, S, dt) {
    const t = glx.time, c = glx.center, k = Math.min(1, dt * 7);
    for (let i = 0; i < m.n; i++) {
      // without hits the roots wheel slowly round the playfield
      if (!S.playing) { const a = t * 0.12 + (i / m.n) * TAU + glx.seedV[0] * TAU, r = 0.26 + 0.07 * Math.sin(t * 0.31 + i * 2); m.to[i] = [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]; }
      m.at[i][0] += (m.to[i][0] - m.at[i][0]) * k; m.at[i][1] += (m.to[i][1] - m.at[i][1]) * k;
      m.flat[i * 2] = m.at[i][0]; m.flat[i * 2 + 1] = m.at[i][1];
    }
    const w = 0.22 * glx.bands[0] + 0.1 * S.pulse;   // the relaxation factor leaves 1 on the beat, and the borders between basins curl
    m.relax = [1 + w * Math.cos(t * 0.9), w * Math.sin(t * 0.9)];
  },
  bind(glx, m, prog) { prog.set('uRoots', m.flat).set('uN', m.n).set('uRelax', m.relax || [1, 0]); },
};

// ── lyapunov: the logistic map driven by a repeating word in A, B and C ───────────
// A runs along x and B along y. C is a third rate that the music moves, so the picture is a
// slice through a solid, and the slice travels.
const LYAP_WORDS = ['AB', 'AABAB', 'BBBBBBAAAAAA', 'ABBAC', 'AACBB', 'ABCB', 'AABBC'];
BGMODES.lyapunov = { id: 'lyapunov', scale: 0.75, minScale: 0.4, fs: GL_PRE + `
uniform int uWord[12];
uniform int uLen;
uniform float uC;
uniform vec4 uView;        // centre and half-extents of the window in (A, B)
void main() {
  vec2 q = P() - uCenter;
  for (int i = 0; i < 8; i++) {                       // a hit ripples the plane the map is drawn on
    float age = uTime - uHits[i].z;
    if (uHits[i].w <= 0. || age < 0. || age > 1.2) continue;
    vec2 d = P() - uHits[i].xy;
    float l = length(d) + 1e-4;
    q += d / l * sin((l - age * .5) * 40.) * exp(-age * 3.5) * exp(-abs(l - age * .5) * 9.) * .012 * uHits[i].w;
  }
  vec2 ab = uView.xy + q * 2. * vec2(uView.z / (uRes.x / uRes.y), uView.w);
  float x = .5, lam = 0., prod = 1.;
  for (int i = 0; i < 96; i++) {
    int s = uWord[i % uLen];
    float r = s == 0 ? ab.x : s == 1 ? ab.y : uC;
    x = r * x * (1. - x);
    if (i >= 16) {
      prod *= abs(r * (1. - 2. * x));
      if ((i & 3) == 3) { lam += log(max(prod, 1e-30)); prod = 1.; }
    }
  }
  lam /= 80.;
  vec3 col;
  if (lam < 0.) {            // order: the map settles into a cycle
    float v = clamp(-lam * 1.1, 0., 1.), k = pow(v, .45);
    vec3 tone = mix(uP0, uP1, smoothstep(0., .5, k));
    tone = mix(tone, uP2, smoothstep(.5, 1., k));
    float edge = exp(-v * 26.);                       // right at the border between order and chaos
    col = luma(uBase) < .4 ? uBase + tone * (.12 + .5 * k) + uInk * edge * (.3 + .5 * uBands.z)
                           : mix(mix(uBase, tone, .25 + .6 * k), uInk, edge * .55);
  } else {                   // chaos
    float v = clamp(lam * 2.2, 0., 1.);
    col = luma(uBase) < .4 ? uBase * (1. - .5 * v) + uP3 * .1 * (1. - v) : mix(uBase, uGridC, .55 + .4 * v);
  }
  fragColor = vec4(finish(col), 1.);
}`,
  init(glx, m) {
    const word = LYAP_WORDS[Math.floor(glx.seedV[2] * LYAP_WORDS.length) % LYAP_WORDS.length];
    m.word = new Int32Array(12);
    for (let i = 0; i < word.length; i++) m.word[i] = 'ABC'.indexOf(word[i]);
    m.len = word.length;
    m.wordName = word;
  },
  step(glx, m, U, S) {
    const t = glx.time, v = glx.seedV, asp = glx.w / glx.h;
    // drift round the interesting corner of the plane, closing in during the peaks
    // The window never passes 4 on either axis: beyond it the map runs away.
    const hy = 0.56 - 0.18 * S.kiai + 0.05 * Math.sin(t * 0.05), hx = Math.min(hy * asp, 0.8);
    m.view = [Math.min(4 - hx, 3.3 + 0.2 * Math.sin(t * 0.021 + v[0] * 6)), Math.min(4 - hy, 3.42 + 0.2 * Math.cos(t * 0.017 + v[1] * 6)), hx, hy];
    m.c = 3.3 + 0.55 * Math.sin(glx.flow * 0.045 + v[3] * 6) + 0.1 * glx.bands[0];
  },
  bind(glx, m, prog) {
    const gl = glx.gl, u = prog.u.uWord;
    if (u) gl.uniform1iv(u.loc, m.word);
    prog.set('uLen', m.len).set('uC', m.c || 3.4).set('uView', m.view || [3.2, 3.4, 0.8, 0.56]);
  },
};
