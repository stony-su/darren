'use strict';
// ─────────────────────────────────────────────────────────────
// bgmodes2: three living grounds, simulated on the GPU.
//   fluid     incompressible flow carrying four inks, one for each pen
//   physarum  slime-mould agents that follow and lay trails
//   lenia     a continuous cellular automaton with gliders in it
// ─────────────────────────────────────────────────────────────

const SIM_VS = VS_TRI;
// Draw one full-target pass.
function simPass(glx, target) {
  const gl = glx.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
  gl.viewport(0, 0, target.w, target.h);
  glx.tri();
}
// Which of the four pens a colour is (hits arrive with their pen's colour).
function penIndex(glx, col) {
  if (!col) return 0;
  let best = 0, bd = Infinity;
  glx.pal.v.pens.forEach((p, i) => { const d = Math.hypot(p[0] - col[0], p[1] - col[1], p[2] - col[2]); if (d < bd) { bd = d; best = i; } });
  return best;
}

// ── fluid: stable fluids (advect, confine vorticity, project), after Stam ──────
const FL_HEAD = `#version 300 es
precision highp float;
uniform vec2 uRes, uTexel;
out vec4 fragColor;
`;
const FS_FL_ADVECT = FL_HEAD + `
uniform sampler2D uVel, uSrc;
uniform float uDt, uKeep;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 from = uv - uDt * texture(uVel, uv).xy * uTexel;        // velocity is in cells of the velocity grid per second
  vec2 inside = step(vec2(0.), from) * step(from, vec2(1.));
  fragColor = texture(uSrc, from) * uKeep * inside.x * inside.y;
}`;
const FS_FL_SPLAT = FL_HEAD + `
uniform vec2 uPoint;
uniform vec4 uValue;
uniform float uRadius, uAspect;
void main() {
  vec2 d = (gl_FragCoord.xy / uRes - uPoint) * vec2(uAspect, 1.);
  fragColor = uValue * exp(-dot(d, d) / (uRadius * uRadius));
}`;
const FS_FL_CURL = FL_HEAD + `
uniform sampler2D uVel;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes, x = vec2(uTexel.x, 0.), y = vec2(0., uTexel.y);
  fragColor = vec4(.5 * (texture(uVel, uv + x).y - texture(uVel, uv - x).y - texture(uVel, uv + y).x + texture(uVel, uv - y).x), 0., 0., 1.);
}`;
const FS_FL_VORT = FL_HEAD + `
uniform sampler2D uVel, uCurl;
uniform float uDt, uAmount;
void main() {            // push along the gradient of |curl|, so small eddies do not smear away
  vec2 uv = gl_FragCoord.xy / uRes, x = vec2(uTexel.x, 0.), y = vec2(0., uTexel.y);
  float L = abs(texture(uCurl, uv - x).r), R = abs(texture(uCurl, uv + x).r), B = abs(texture(uCurl, uv - y).r), T = abs(texture(uCurl, uv + y).r);
  vec2 f = .5 * vec2(T - B, L - R);
  f = f / (length(f) + 1e-4) * uAmount * texture(uCurl, uv).r;
  fragColor = vec4(clamp(texture(uVel, uv).xy + f * uDt, -900., 900.), 0., 1.);
}`;
const FS_FL_DIV = FL_HEAD + `
uniform sampler2D uVel;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes, x = vec2(uTexel.x, 0.), y = vec2(0., uTexel.y);
  float L = texture(uVel, uv - x).x, R = texture(uVel, uv + x).x, B = texture(uVel, uv - y).y, T = texture(uVel, uv + y).y;
  vec2 c = texture(uVel, uv).xy;
  if (uv.x - uTexel.x < 0.) L = -c.x;           // walls send the flow back
  if (uv.x + uTexel.x > 1.) R = -c.x;
  if (uv.y - uTexel.y < 0.) B = -c.y;
  if (uv.y + uTexel.y > 1.) T = -c.y;
  fragColor = vec4(.5 * (R - L + T - B), 0., 0., 1.);
}`;
const FS_FL_PRESSURE = FL_HEAD + `
uniform sampler2D uPr, uDiv;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes, x = vec2(uTexel.x, 0.), y = vec2(0., uTexel.y);
  fragColor = vec4((texture(uPr, uv - x).r + texture(uPr, uv + x).r + texture(uPr, uv - y).r + texture(uPr, uv + y).r - texture(uDiv, uv).r) * .25, 0., 0., 1.);
}`;
const FS_FL_GRAD = FL_HEAD + `
uniform sampler2D uPr, uVel;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes, x = vec2(uTexel.x, 0.), y = vec2(0., uTexel.y);
  vec2 g = vec2(texture(uPr, uv + x).r - texture(uPr, uv - x).r, texture(uPr, uv + y).r - texture(uPr, uv - y).r);
  fragColor = vec4(texture(uVel, uv).xy - g, 0., 1.);
}`;

BGMODES.fluid = {
  id: 'fluid', needsFloat: true, minScale: 0.7,
  fs: GL_PRE + `
uniform sampler2D uDye;
uniform vec2 uDyeTexel;
float total(vec4 d) { return d.r + d.g + d.b + d.a; }
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec4 d = texture(uDye, uv);
  float tot = total(d);
  vec3 ink = (uP0 * d.r + uP1 * d.g + uP2 * d.b + uP3 * d.a) / max(tot, 1e-4);
  float cover = 1. - exp(-tot * 1.7);
  vec2 e = uDyeTexel * 1.5;
  vec2 g = vec2(total(texture(uDye, uv + vec2(e.x, 0.))) - total(texture(uDye, uv - vec2(e.x, 0.))),
                total(texture(uDye, uv + vec2(0., e.y))) - total(texture(uDye, uv - vec2(0., e.y))));
  float lit = clamp(dot(g, vec2(-.7, .7)) * 2.4, -1., 1.);
  float rings = smoothstep(.1, 0., abs(fract(tot * 3.4 + .25) - .5) - .36);    // the ink's own contour lines, as in suminagashi
  vec3 col;
  if (luma(uBase) < .4) col = uBase + ink * cover * (.7 + .35 * lit) + uInk * rings * cover * (.07 + .2 * uBands.z);
  else { col = mix(uBase, ink, cover * .85) * (1. + .05 * lit); col = mix(col, uInk, rings * cover * .18); }
  fragColor = vec4(finish(col), 1.);
}`,
  init(glx, m) {
    const h = 112, w = Math.round(h * glx.w / glx.h), dh = 360, dw = Math.round(dh * glx.w / glx.h);
    const T = (a, b) => glx.makeTarget(a, b, { float: true });
    m.vel = [T(w, h), T(w, h)]; m.pr = [T(w, h), T(w, h)]; m.div = T(w, h); m.curl = T(w, h); m.dye = [T(dw, dh), T(dw, dh)];
    m.P = {
      advect: glx.prog('fl:advect', FS_FL_ADVECT), splat: glx.prog('fl:splat', FS_FL_SPLAT), curl: glx.prog('fl:curl', FS_FL_CURL), vort: glx.prog('fl:vort', FS_FL_VORT),
      div: glx.prog('fl:div', FS_FL_DIV), pressure: glx.prog('fl:pressure', FS_FL_PRESSURE), grad: glx.prog('fl:grad', FS_FL_GRAD),
    };
    m.queue = []; m.last = null; m.beat = null; m.spin = m.rng.range(0, TAU);
    m.em = [0, 1, 2].map(() => [m.rng.range(0.22, 0.78), m.rng.range(0.25, 0.75)]);
  },
  resize(glx, m) { this.dispose(glx, m); this.init(glx, m); },
  dispose(glx, m) { for (const t of [...(m.vel || []), ...(m.pr || []), m.div, m.curl, ...(m.dye || [])]) glx.freeTarget(t); m.vel = null; },
  // A hit throws its pen's ink along the line the cursor travelled to reach it.
  onHit(glx, m, p, strength, col) {
    const uv = simUv(glx, p), dye = [0, 0, 0, 0];
    dye[penIndex(glx, col)] = 0.35 + 0.75 * strength;
    let dx = Math.cos(m.spin), dy = Math.sin(m.spin);
    if (m.last) { const ax = (uv[0] - m.last[0]) * glx.w / glx.h, ay = uv[1] - m.last[1], l = Math.hypot(ax, ay); if (l > 0.005) { dx = ax / l; dy = ay / l; } }
    m.spin += 2.4;
    m.last = uv;
    const power = 150 + 330 * strength;
    m.queue.push({ p: uv, f: [dx * power, dy * power], dye, r: 0.03 + 0.02 * strength });
    if (m.queue.length > 12) m.queue.shift();
  },
  step(glx, m, U, S, dt) {
    const gl = glx.gl, P = m.P, w = m.vel[0].w, h = m.vel[0].h, tx = [1 / w, 1 / h], res = [w, h];
    const sdt = Math.min(dt, 1 / 30);
    const swap = a => { const t = a[0]; a[0] = a[1]; a[1] = t; };
    const beat = Math.floor(S.beats);
    if (beat !== m.beat) {                          // three slow sources breathe ink in, one on each beat
      m.beat = beat;
      const k = ((beat % 3) + 3) % 3, a = m.spin * 0.37 + beat * 2.4, dye = [0, 0, 0, 0];
      const power = (S.playing ? 45 : 120) * (0.6 + S.energy + glx.bands[0]);
      dye[((beat % 4) + 4) % 4] = S.playing ? 0.22 : 0.6;
      m.queue.push({ p: m.em[k], f: [Math.cos(a) * power, Math.sin(a) * power], dye, r: 0.05 });
    }
    gl.disable(gl.BLEND);
    P.curl.use().set('uRes', res).set('uTexel', tx).set('uVel', m.vel[0].tex);
    simPass(glx, m.curl);
    P.vort.use().set('uRes', res).set('uTexel', tx).set('uVel', m.vel[0].tex).set('uCurl', m.curl.tex).set('uDt', sdt).set('uAmount', 14 + 10 * S.energy);
    simPass(glx, m.vel[1]); swap(m.vel);
    if (m.queue.length) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      for (const q of m.queue) {
        P.splat.use().set('uRes', res).set('uPoint', q.p).set('uValue', [q.f[0], q.f[1], 0, 0]).set('uRadius', q.r).set('uAspect', w / h);
        simPass(glx, m.vel[0]);
        P.splat.use().set('uRes', [m.dye[0].w, m.dye[0].h]).set('uPoint', q.p).set('uValue', q.dye).set('uRadius', q.r * 0.8).set('uAspect', w / h);
        simPass(glx, m.dye[0]);
      }
      gl.disable(gl.BLEND);
      m.queue.length = 0;
    }
    P.div.use().set('uRes', res).set('uTexel', tx).set('uVel', m.vel[0].tex);
    simPass(glx, m.div);
    for (let i = 0; i < 16; i++) {
      P.pressure.use().set('uRes', res).set('uTexel', tx).set('uPr', m.pr[0].tex).set('uDiv', m.div.tex);
      simPass(glx, m.pr[1]); swap(m.pr);
    }
    P.grad.use().set('uRes', res).set('uTexel', tx).set('uPr', m.pr[0].tex).set('uVel', m.vel[0].tex);
    simPass(glx, m.vel[1]); swap(m.vel);
    P.advect.use().set('uRes', res).set('uTexel', tx).set('uVel', m.vel[0].tex).set('uSrc', m.vel[0].tex).set('uDt', sdt).set('uKeep', Math.exp(-sdt * 0.5));
    simPass(glx, m.vel[1]); swap(m.vel);
    P.advect.use().set('uRes', [m.dye[0].w, m.dye[0].h]).set('uTexel', tx).set('uVel', m.vel[0].tex).set('uSrc', m.dye[0].tex).set('uDt', sdt).set('uKeep', Math.exp(-sdt * (S.playing ? 0.5 : 0.28)));
    simPass(glx, m.dye[1]); swap(m.dye);
  },
  bind(glx, m, prog) { prog.set('uDye', m.dye[0].tex).set('uDyeTexel', [1 / m.dye[0].w, 1 / m.dye[0].h]); },
};

// ── physarum: agents sense the trail ahead, turn toward it, step, and add to it ─
const FS_PH_AGENT = `#version 300 es
precision highp float;
uniform sampler2D uAgents, uTrail;
uniform vec2 uTrailSize;
uniform float uSA, uRA, uSD, uStep, uTime;
uniform vec4 uBurst[4];   // xy where, z radius, w on
out vec4 fragColor;
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float sense(vec2 pos, float ang, float sp) {
  vec3 t = texture(uTrail, pos + vec2(cos(ang), sin(ang)) * uSD / uTrailSize).rgb;
  float own = sp < .5 ? t.r : sp < 1.5 ? t.g : t.b;
  return own * 2. - (t.r + t.g + t.b);          // drawn to its own kind, put off by the others
}
void main() {
  vec4 a = texelFetch(uAgents, ivec2(gl_FragCoord.xy), 0);
  vec2 pos = a.xy;
  float ang = a.z, sp = a.w;
  float f = sense(pos, ang, sp), l = sense(pos, ang + uSA, sp), r = sense(pos, ang - uSA, sp);
  float rnd = h21(gl_FragCoord.xy + fract(uTime) * 91.7);
  if (f < l && f < r) ang += rnd < .5 ? uRA : -uRA;
  else if (l > f && l > r) ang += uRA;
  else if (r > f && r > l) ang -= uRA;
  ang += (rnd - .5) * .1;
  for (int i = 0; i < 4; i++) {                 // a hit scatters everything near it outward; the colony then closes the wound
    if (uBurst[i].w <= 0.) continue;
    vec2 d = (pos - uBurst[i].xy) * vec2(uTrailSize.x / uTrailSize.y, 1.);
    if (length(d) < uBurst[i].z) ang = atan(d.y, d.x) + (rnd - .5) * 1.2;
  }
  fragColor = vec4(fract(pos + vec2(cos(ang), sin(ang)) * uStep / uTrailSize), ang, sp);
}`;
const VS_PH_DEPOSIT = `#version 300 es
precision highp float;
uniform sampler2D uAgents;
uniform int uN;
uniform float uAmount;
out vec3 vCol;
void main() {
  vec4 a = texelFetch(uAgents, ivec2(gl_VertexID % uN, gl_VertexID / uN), 0);
  gl_Position = vec4(a.xy * 2. - 1., 0., 1.);
  gl_PointSize = 1.;
  vCol = (a.w < .5 ? vec3(1., 0., 0.) : a.w < 1.5 ? vec3(0., 1., 0.) : vec3(0., 0., 1.)) * uAmount;
}`;
const FS_PH_DEPOSIT = `#version 300 es
precision highp float;
in vec3 vCol;
out vec4 fragColor;
void main() { fragColor = vec4(vCol, 1.); }`;
const FS_PH_DIFFUSE = `#version 300 es
precision highp float;
uniform sampler2D uTrail;
uniform vec2 uTexel;
uniform float uDecay;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  vec3 s = vec3(0.);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) s += texture(uTrail, uv + vec2(float(i), float(j)) * uTexel).rgb;
  fragColor = vec4(mix(texture(uTrail, uv).rgb, s / 9., .3) * uDecay, 1.);
}`;

// sensor angle, turn angle (degrees), sensor distance, step (trail cells)
const PH_PRESETS = [[22.5, 45, 9, 1.0], [45, 45, 9, 1.1], [30, 15, 16, 1.2], [60, 30, 6, 0.9], [15, 60, 20, 1.3], [35, 25, 12, 1.4]];

BGMODES.physarum = {
  id: 'physarum', needsFloat: true, minScale: 0.7,
  fs: GL_PRE + `
uniform sampler2D uTrail;
uniform float uGain;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 v = 1. - exp(-texture(uTrail, uv).rgb * uGain);
  vec3 col;
  if (luma(uBase) < .4) {
    col = uBase + (uP0 * v.r + uP1 * v.g + uP2 * v.b) * .78;
    col += uInk * pow(max(v.r, max(v.g, v.b)), 5.) * (.16 + .3 * uBands.z);
  } else {
    col = mix(uBase, uP0, v.r * .88);
    col = mix(col, uP1, v.g * .88);
    col = mix(col, uP2, v.b * .88);
  }
  fragColor = vec4(finish(col), 1.);
}`,
  init(glx, m) {
    const gl = glx.gl, N = glx.light ? 352 : 480, h = 540, w = Math.round(h * glx.w / glx.h), asp = w / h;
    m.N = N;
    m.agents = [glx.makeTarget(N, N, { float: 'full', nearest: true }), glx.makeTarget(N, N, { float: 'full', nearest: true })];
    m.trail = [glx.makeTarget(w, h, { float: true, repeat: true }), glx.makeTarget(w, h, { float: true, repeat: true })];
    m.pAgent = glx.prog('ph:agent', FS_PH_AGENT);
    m.pDeposit = glx.prog('ph:deposit', FS_PH_DEPOSIT, VS_PH_DEPOSIT);
    m.pDiffuse = glx.prog('ph:diffuse', FS_PH_DIFFUSE);
    const r = m.rng, shape = Math.floor(glx.seedV[2] * 3), species = 1 + Math.floor(glx.seedV[3] * 3), data = new Float32Array(N * N * 4);
    for (let i = 0; i < N * N; i++) {
      const a = r.range(0, TAU);
      let x, y, head;
      if (shape === 0) { const d = 0.36 * Math.sqrt(r.next()); x = 0.5 + Math.cos(a) * d / asp; y = 0.5 + Math.sin(a) * d; head = a + Math.PI; }        // a disc, facing in
      else if (shape === 1) { const d = 0.33 + r.range(-0.02, 0.02); x = 0.5 + Math.cos(a) * d / asp; y = 0.5 + Math.sin(a) * d; head = a + Math.PI + r.range(-0.9, 0.9); }   // a ring that falls inward
      else { x = r.next(); y = r.next(); head = a; }                                                                                              // everywhere
      data.set([x, y, head, i % species], i * 4);
    }
    gl.bindTexture(gl.TEXTURE_2D, m.agents[0].tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, N, N, gl.RGBA, gl.FLOAT, data);
    m.idx = Math.floor(glx.seedV[1] * PH_PRESETS.length) % PH_PRESETS.length;
    m.cur = PH_PRESETS[m.idx].slice(); m.to = m.cur.slice();
    m.burst = new Float32Array(16); m.bn = 0; m.section = -1;
  },
  resize(glx, m) { this.dispose(glx, m); this.init(glx, m); },
  dispose(glx, m) { for (const t of [...(m.agents || []), ...(m.trail || [])]) glx.freeTarget(t); m.agents = m.trail = null; },
  onHit(glx, m, p, strength, col, soft) {
    if (soft) return;
    const uv = simUv(glx, p);
    m.burst.set([uv[0], uv[1], 0.035 + 0.045 * strength, 1], (m.bn++ % 4) * 4);
  },
  step(glx, m, U, S, dt) {
    const gl = glx.gl, tw = m.trail[0].w, th = m.trail[0].h, D = Math.PI / 180;
    if (S.section !== m.section) {                  // each section the colony changes its habits, and so its shape
      if (m.section >= 0) { m.idx = (m.idx + 1 + (S.section % 2)) % PH_PRESETS.length; m.to = PH_PRESETS[m.idx].slice(); }
      m.section = S.section;
    }
    const k = Math.min(1, dt * 0.8);
    for (let i = 0; i < 4; i++) m.cur[i] += (m.to[i] - m.cur[i]) * k;
    gl.disable(gl.BLEND);
    const steps = S.energy > 0.85 ? 2 : 1;
    for (let s = 0; s < steps; s++) {
      m.pAgent.use().set('uAgents', m.agents[0].tex).set('uTrail', m.trail[0].tex).set('uTrailSize', [tw, th])
        .set('uSA', m.cur[0] * D).set('uRA', m.cur[1] * D).set('uSD', m.cur[2]).set('uStep', m.cur[3] * (1 + 0.7 * S.pulse + 0.8 * glx.bands[0]))
        .set('uTime', glx.time + s * 0.37).set('uBurst', m.burst);
      simPass(glx, m.agents[1]);
      m.agents.reverse();
      m.burst.fill(0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, m.trail[0].fbo);
      gl.viewport(0, 0, tw, th);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      m.pDeposit.use().set('uAgents', m.agents[0].tex).set('uN', m.N).set('uAmount', 0.055);
      gl.drawArrays(gl.POINTS, 0, m.N * m.N);
      gl.disable(gl.BLEND);
      m.pDiffuse.use().set('uTrail', m.trail[0].tex).set('uTexel', [1 / tw, 1 / th]).set('uDecay', 0.9);
      simPass(glx, m.trail[1]);
      m.trail.reverse();
    }
  },
  bind(glx, m, prog) { prog.set('uTrail', m.trail[0].tex).set('uGain', 5.5 * (480 * 480) / (m.N * m.N) * (1 + 0.5 * glx.hitPulse)); },
};

// ── lenia: Bert Chan's continuous life. Radius 11, the Orbium rule; the gliders are Orbium ─
const LENIA_R = 11;
const ORBIUM = [
  '0,0,0,0,0,0,.1,.14,.1,0,0,.03,.03,0,0,.3,0,0,0,0', '0,0,0,0,0,.08,.24,.3,.3,.18,.14,.15,.16,.15,.09,.2,0,0,0,0',
  '0,0,0,0,0,.15,.34,.44,.46,.38,.18,.14,.11,.13,.19,.18,.45,0,0,0', '0,0,0,0,.06,.13,.39,.5,.5,.37,.06,0,0,0,.02,.16,.68,0,0,0',
  '0,0,0,.11,.17,.17,.33,.4,.38,.28,.14,0,0,0,0,0,.18,.42,0,0', '0,0,.09,.18,.13,.06,.08,.26,.32,.32,.27,0,0,0,0,0,0,.82,0,0',
  '.27,0,.16,.12,0,0,0,.25,.38,.44,.45,.34,0,0,0,0,0,.22,.17,0', '0,.07,.2,.02,0,0,0,.31,.48,.57,.6,.57,0,0,0,0,0,0,.49,0',
  '0,.59,.19,0,0,0,0,.2,.57,.69,.76,.76,.49,0,0,0,0,0,.36,0', '0,.58,.19,0,0,0,0,0,.67,.83,.9,.92,.87,.12,0,0,0,0,.22,.07',
  '0,0,.46,0,0,0,0,0,.7,.93,1,1,1,.61,0,0,0,0,.18,.11', '0,0,.82,0,0,0,0,0,.47,1,1,.98,1,.96,.27,0,0,0,.19,.1',
  '0,0,.46,0,0,0,0,0,.25,1,1,.84,.92,.97,.54,.14,.04,.1,.21,.05', '0,0,0,.4,0,0,0,0,.09,.8,1,.82,.8,.85,.63,.31,.18,.19,.2,.01',
  '0,0,0,.36,.1,0,0,0,.05,.54,.86,.79,.74,.72,.6,.39,.28,.24,.13,0', '0,0,0,.01,.3,.07,0,0,.08,.36,.64,.7,.64,.6,.51,.39,.29,.19,.04,0',
  '0,0,0,0,.1,.24,.14,.1,.15,.29,.45,.53,.52,.46,.4,.31,.21,.08,0,0', '0,0,0,0,0,.08,.21,.21,.22,.29,.36,.39,.37,.33,.26,.18,.09,0,0,0',
  '0,0,0,0,0,0,.03,.13,.19,.22,.24,.24,.23,.18,.13,.05,0,0,0,0', '0,0,0,0,0,0,0,0,.02,.06,.08,.09,.07,.05,.01,0,0,0,0,0',
].map(row => row.split(',').map(Number));

// One step of the rule, with three house rules that keep the dish readable:
// gliders are only released into empty water, crowds die back (the rule also supports a maze-like
// growth that would otherwise cover everything), and the edges of the dish absorb whatever reaches them.
// Crowding is read from the state texture's own mipmaps: a coarse level is the local density.
const FS_LN_STEP = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uState, uKernel, uPattern;
uniform ivec2 uSize;
uniform float uInvSum, uDt, uStampSize;
uniform vec4 uStamp[4];    // where (uv), heading, on
out vec4 fragColor;
const int R = ${LENIA_R};
void main() {
  ivec2 q = ivec2(gl_FragCoord.xy);
  float u = 0.;
  for (int j = -R; j <= R; j++) for (int i = -R; i <= R; i++) {
    float k = texelFetch(uKernel, ivec2(i + R, j + R), 0).r;
    if (k > 0.) u += k * texelFetch(uState, (q + ivec2(i, j) + uSize) % uSize, 0).r;
  }
  u *= uInvSum;
  float a = clamp(texelFetch(uState, q, 0).r + uDt * (2. * exp(-(u - .15) * (u - .15) / (2. * .015 * .015)) - 1.), 0., 1.);
  vec2 uv = (vec2(q) + .5) / vec2(uSize);
  float crowd = textureLod(uState, uv, 4.6).r;         // mean over a patch about two gliders wide; a lone glider reads near 0.05
  a = max(a - .05 * smoothstep(.12, .2, crowd), 0.);
  float asp = float(uSize.x) / float(uSize.y);
  a *= mix(.8, 1., smoothstep(0., .035, min(min(uv.x, 1. - uv.x) * asp, min(uv.y, 1. - uv.y))));
  if (u < .01) {
    for (int i = 0; i < 4; i++) {
      if (uStamp[i].w < .5) continue;
      vec2 d = (uv - uStamp[i].xy) * vec2(asp, 1.) / uStampSize;
      float c = cos(uStamp[i].z), s = sin(uStamp[i].z);
      vec2 p = vec2(c * d.x - s * d.y, s * d.x + c * d.y) + .5;
      if (p.x > 0. && p.x < 1. && p.y > 0. && p.y < 1.) a = max(a, texture(uPattern, p).r);
    }
  }
  fragColor = vec4(a, u, crowd, 1.);
}`;

BGMODES.lenia = {
  id: 'lenia', needsFloat: true, minScale: 0.7,
  fs: GL_PRE + `
uniform sampler2D uState;
void main() {
  vec2 s = texture(uState, gl_FragCoord.xy / uRes).rg;       // the cell, and the neighbourhood it feels
  float a = smoothstep(.02, .95, s.r), aura = smoothstep(.03, .16, s.g);
  vec3 body = pal4(s.r * .5 + s.g * 1.6 + uSeed.w);
  vec3 col;
  if (luma(uBase) < .4) col = uBase + body * a * (.85 + .4 * uBands.x) + pal4(uSeed.w + .5) * aura * (1. - a) * .13;
  else col = mix(mix(uBase, uGridC, aura * .7), body, a * .88);
  fragColor = vec4(finish(col), 1.);
}`,
  init(glx, m) {
    const gl = glx.gl, h = 150, w = Math.round(h * glx.w / glx.h), R = LENIA_R, K = 2 * R + 1;
    m.st = [glx.makeTarget(w, h, { float: true, repeat: true }), glx.makeTarget(w, h, { float: true, repeat: true })];
    for (const t of m.st) { gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.generateMipmap(gl.TEXTURE_2D); }
    m.pStep = glx.prog('ln:step', FS_LN_STEP);
    m.stamp = new Float32Array(16);
    const tex = (tw, thh, data, filter) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, tw, thh, 0, gl.RED, gl.UNSIGNED_BYTE, data);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    const kd = new Uint8Array(K * K);
    let sum = 0;
    for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) {      // a ring-shaped bump
      const r = Math.hypot(i - R, j - R) / R;
      kd[j * K + i] = r > 0 && r < 1 ? Math.round(Math.exp(4 - 1 / (r * (1 - r))) * 255) : 0;
      sum += kd[j * K + i] / 255;
    }
    m.kernel = tex(K, K, kd, gl.NEAREST); m.invSum = 1 / sum;
    const pd = new Uint8Array(400);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) pd[y * 20 + x] = Math.round(ORBIUM[y][x] * 255);
    m.pattern = tex(20, 20, pd, gl.LINEAR);
    m.queue = []; m.ambient = 0; m.aim = m.rng.range(0, TAU);
    for (let i = 0; i < 6; i++) m.queue.push([m.rng.range(0.12, 0.88), m.rng.range(0.18, 0.82), m.rng.range(0, TAU), 1]);
  },
  resize(glx, m) { this.dispose(glx, m); this.init(glx, m); },
  dispose(glx, m) {
    for (const t of m.st || []) glx.freeTarget(t);
    if (m.kernel) { glx.gl.deleteTexture(m.kernel); glx.gl.deleteTexture(m.pattern); }
    m.st = m.kernel = m.pattern = null;
  },
  // A hit releases a glider where it landed, if the water there is clear. They set off across the dish,
  // and what happens when two meet is up to them.
  onHit(glx, m, p, strength, col, soft) {
    if (strength < 0.4 || glx.time - (m.born || -9) < (soft ? 0.9 : 0.4)) return;
    m.born = glx.time;
    const uv = simUv(glx, p);
    m.aim += 2.39996;
    m.queue.push([uv[0], uv[1], m.aim, 1]);
    if (m.queue.length > 6) m.queue.shift();
  },
  step(glx, m, U, S, dt) {
    const gl = glx.gl, A = m.st, w = A[0].w, h = A[0].h;
    m.ambient -= dt;
    if (m.ambient < 0) { m.ambient = S.playing ? 5 : 1.8; m.queue.push([0.1 + 0.8 * Math.random(), 0.15 + 0.7 * Math.random(), Math.random() * TAU, 1]); }
    m.stamp.fill(0);
    for (let k = 0; k < 4 && m.queue.length; k++) m.stamp.set(m.queue.shift(), k * 4);
    gl.disable(gl.BLEND);
    m.pStep.use().set('uState', A[0].tex).set('uKernel', m.kernel).set('uPattern', m.pattern).set('uSize', [w, h]).set('uInvSum', m.invSum).set('uDt', 0.1)
      .set('uStamp', m.stamp).set('uStampSize', (20 * LENIA_R / 13) / h);
    simPass(glx, A[1]);
    A.reverse();
    gl.bindTexture(gl.TEXTURE_2D, A[0].tex);
    gl.generateMipmap(gl.TEXTURE_2D);
  },
  bind(glx, m, prog) { prog.set('uState', m.st[0].tex); },
};
