/* ─────────────────────────────────────────────────────────────────────────────
   03 · REAGENT — Gray-Scott reaction-diffusion, WebGL2 ping-pong.
   The cells ARE the field: each reads its neighbours and rewrites itself.
   Seed picks a (feed, kill) pair from the living ribbon of parameter space and
   tilts it gently across the canvas so no region behaves quite like another.
   ───────────────────────────────────────────────────────────────────────────── */
(function () {
  const AA = window.AA;
  const G = AA.GL.GLSL;

  /* Pearson-type regimes known to stay alive under Da=1, Db=0.5, dt=1 */
  const REGIMES = [
    { f: 0.0545, k: 0.0620, name: 'coral' },
    { f: 0.0367, k: 0.0649, name: 'mitosis' },
    { f: 0.0300, k: 0.0620, name: 'solitons' },
    { f: 0.0780, k: 0.0610, name: 'worms' },
    { f: 0.0290, k: 0.0570, name: 'mazes' },
    { f: 0.0390, k: 0.0580, name: 'holes' },
    { f: 0.0180, k: 0.0510, name: 'spots & loops' },
    { f: 0.0620, k: 0.0609, name: 'u-skate' },
    { f: 0.0420, k: 0.0590, name: 'fingerprint' },
    { f: 0.0460, k: 0.0594, name: 'bacteria' },
    { f: 0.0500, k: 0.0600, name: 'tubes' },
    { f: 0.0220, k: 0.0510, name: 'loops' },
    { f: 0.0380, k: 0.0610, name: 'reef' },
    { f: 0.0320, k: 0.0600, name: 'spots' },
    { f: 0.0250, k: 0.0600, name: 'pulsating' },
  ];

  const INIT = `${G.header}
  uniform vec2 uRes;
  uniform float uAspect;
  uniform vec4 uBlobs[10];
  uniform float uSpeckle;
  uniform float uNoiseSeed;
  ${G.hash}
  ${G.noise2}
  void main(){
    vec2 uv = vUv;
    float b = 0.0;
    vec2 p = uv * vec2(uAspect, 1.0);
    for (int i = 0; i < 10; i++) {
      vec4 bl = uBlobs[i];
      if (bl.z <= 0.0) continue;
      float d = length(p - bl.xy * vec2(uAspect, 1.0));
      // ring or disc depending on w
      float m = bl.w > 0.5 ? smoothstep(0.004, 0.0, abs(d - bl.z) - 0.006) : smoothstep(bl.z, bl.z * 0.7, d);
      b = max(b, m);
    }
    float n = gnoise(p * 60.0 + uNoiseSeed) * 0.5 + 0.5;
    b = max(b, step(1.0 - uSpeckle, n) * hash12(gl_FragCoord.xy + uNoiseSeed));
    fragColor = vec4(1.0, b, 0.0, 1.0);
  }`;

  const STEP = `${G.header}
  uniform sampler2D uState;
  uniform vec2 uTexel;
  uniform float uFeed, uKill;
  uniform vec4 uGrad;
  uniform vec3 uBrush;
  uniform float uAspect;
  void main(){
    vec2 uv = vUv;
    vec2 tx = vec2(uTexel.x, 0.0), ty = vec2(0.0, uTexel.y);
    vec4 c = texture(uState, uv);
    vec4 lap = -c
      + 0.20 * (texture(uState, uv + tx) + texture(uState, uv - tx) + texture(uState, uv + ty) + texture(uState, uv - ty))
      + 0.05 * (texture(uState, uv + tx + ty) + texture(uState, uv - tx + ty) + texture(uState, uv + tx - ty) + texture(uState, uv - tx - ty));
    float a = c.r, b = c.g;
    vec2 q = uv - 0.5;
    float f = uFeed + uGrad.x * q.x + uGrad.y * q.y;
    float k = uKill + uGrad.z * q.x + uGrad.w * q.y;
    float abb = a * b * b;
    float na = a + (1.0 * lap.r - abb + f * (1.0 - a));
    float nb = b + (0.5 * lap.g + abb - (k + f) * b);
    if (uBrush.z > 0.0) {
      float d = length((uv - uBrush.xy) * vec2(uAspect, 1.0));
      nb += smoothstep(uBrush.z, uBrush.z * 0.3, d) * 0.35;
    }
    fragColor = vec4(clamp(na, 0.0, 1.0), clamp(nb, 0.0, 1.0), 0.0, 1.0);
  }`;

  const SHOW = `${G.header}
  uniform sampler2D uState;
  uniform vec2 uTexel;
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uRelief;
  uniform float uPalOff, uPalSpan;
  uniform vec3 uLight;
  ${G.hash}
  ${G.palette}
  ${G.finish}
  void main(){
    vec2 uv = vUv;
    vec2 tx = vec2(uTexel.x, 0.0), ty = vec2(0.0, uTexel.y);
    vec4 c = texture(uState, uv);
    float b = c.g, a = c.r;
    float bx = texture(uState, uv + tx).g - texture(uState, uv - tx).g;
    float by = texture(uState, uv + ty).g - texture(uState, uv - ty).g;
    vec3 n = normalize(vec3(-bx * uRelief, -by * uRelief, 1.0));
    vec3 L = normalize(uLight);
    float diff = max(dot(n, L), 0.0);
    vec3 V = vec3(0.0, 0.0, 1.0);
    float spec = pow(max(dot(reflect(-L, n), V), 0.0), 28.0);
    float v = smoothstep(0.08, 0.42, b);
    vec3 col = pal(uPalOff + v * uPalSpan) * (0.15 + 0.85 * v);
    col *= 0.35 + 0.8 * diff;
    col += vec3(1.0) * spec * 0.45 * v;
    // the substrate: where A is depleted the ground warms slightly
    col += pal(uPalOff + 0.5) * (1.0 - a) * 0.10 * (1.0 - v);
    // vignette
    vec2 q = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
    col *= mix(0.55, 1.0, smoothstep(1.3, 0.35, length(q)));
    col = tonemap(col);
    col = dither(col, gl_FragCoord.xy);
    fragColor = vec4(col, 1.0);
  }`;

  class Reagent extends AA.Piece {
    setup() {
      const gl = (this.gl = AA.GL.context(this.canvas));
      if (!gl) throw new Error('WebGL2 unavailable');
      this.fmt = AA.GL.floatFormat(gl);
      if (!this.fmt) throw new Error('float render targets unavailable');
      this.pInit = AA.GL.program(gl, INIT);
      this.pStep = AA.GL.program(gl, STEP);
      this.pShow = AA.GL.program(gl, SHOW);
      this.vao = AA.GL.emptyVao(gl);
      gl.bindVertexArray(this.vao);
      this.sim = null;
    }

    onResize(w, h) {
      const gl = this.gl;
      const scale = 0.5;
      let sw = Math.round(w * scale), sh = Math.round(h * scale);
      const mx = Math.max(sw, sh);
      if (mx > 1024) { sw = Math.round(sw * 1024 / mx); sh = Math.round(sh * 1024 / mx); }
      sw = Math.max(64, sw); sh = Math.max(64, sh);
      if (this.sim) this.sim.dispose();
      this.sim = AA.GL.pingpong(gl, sw, sh, this.fmt, { wrap: gl.REPEAT, filter: gl.NEAREST });
      this.texel = [1 / sw, 1 / sh];
      if (this.cfg) this._init();
    }

    build() {
      const r = this.rng;
      this.pal = AA.palette(r);
      const reg = r.pick(REGIMES);
      const blobs = [];
      const nb = r.int(6, 10);
      for (let i = 0; i < 10; i++) {
        if (i < nb) blobs.push(r.range(0.05, 0.95), r.range(0.05, 0.95), r.range(0.02, 0.08), r.bool(0.35) ? 1 : 0);
        else blobs.push(0, 0, 0, 0);
      }
      this.cfg = {
        regime: reg.name,
        f: reg.f + r.range(-0.0015, 0.0015),
        k: reg.k + r.range(-0.0008, 0.0008),
        grad: [r.range(-0.006, 0.006), r.range(-0.004, 0.004), r.range(-0.003, 0.003), r.range(-0.003, 0.003)].map((v) => (r.bool(0.6) ? v : 0)),
        blobs,
        speckle: r.range(0.03, 0.10),
        noiseSeed: r.range(0, 1000),
        relief: r.range(14, 40),
        palOff: r.range(0, 1),
        palSpan: r.range(0.25, 0.6) * r.sign(),
        light: [r.range(-0.8, 0.8), r.range(-0.8, 0.8), r.range(0.5, 1.0)],
      };
      if (this.sim) this._init();
    }

    _init() {
      const gl = this.gl, c = this.cfg;
      for (const tgt of [this.sim.read, this.sim.write]) {
        tgt.bind();
        this.pInit.use().set({
          uRes: [this.sim.w, this.sim.h], uAspect: this.sim.w / this.sim.h,
          uBlobs: c.blobs, uSpeckle: c.speckle, uNoiseSeed: c.noiseSeed,
        });
        AA.GL.drawQuad(gl);
      }
    }

    render(t, dt) {
      const gl = this.gl, m = this.mouse, s = this.sim, c = this.cfg;
      if (!s) return;
      // fast-forward the first second so the field fills before the eye settles
      const boost = Math.round(40 * Math.max(0, 1 - this.frames / 70));
      const steps = dt > 0 ? Math.round(this.params.speed) + boost : 0;
      let brush = [0, 0, 0];
      if (m.active) {
        const speed = Math.hypot(m.vx, m.vy);
        if (m.down) brush = [m.x, m.y, 0.035];
        else if (speed > 0.002) brush = [m.x, m.y, 0.008 + Math.min(speed, 0.05) * 0.3];
      }
      this.pStep.use().set({
        uTexel: this.texel, uAspect: s.w / s.h,
        uFeed: c.f + this.params.feed, uKill: c.k + this.params.kill,
        uGrad: c.grad, uBrush: brush, uState: 0,
      });
      for (let i = 0; i < steps; i++) {
        s.write.bind();
        AA.GL.bindTex(gl, 0, s.read.tex);
        AA.GL.drawQuad(gl);
        s.swap();
        if (i === 0 && brush[2] > 0) this.pStep.set({ uBrush: [0, 0, 0] });
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.w, this.h);
      AA.GL.bindTex(gl, 0, s.read.tex);
      this.pShow.use().set({
        uState: 0, uTexel: this.texel, uRes: [this.w, this.h], uTime: t,
        uRelief: c.relief * this.params.relief, uPalOff: c.palOff, uPalSpan: c.palSpan,
        uLight: c.light, uPal: this.pal.uniforms(),
      });
      AA.GL.drawQuad(gl);
    }

    accent() { const c = this.cfg; return this.pal.accent(c.palOff, c.palOff + c.palSpan); }
  }

  AA.register({
    id: 'reagent',
    num: '03',
    title: 'Reagent',
    klass: Reagent,
    seed: 41,
    maxPixelRatio: 1.5,
    adaptive: false,          // resizing would reset the simulation state
    tagline: 'Gray-Scott reaction-diffusion',
    blurb: 'Two virtual chemicals feed, kill and diffuse on a torus. The seed lands in one of fifteen living regimes: coral, mitosis, worms, solitons. Paint with the pointer to feed it.',
    tech: 'WebGL2 · float ping-pong · 9-point Laplacian · relief lighting',
    params: [
      { key: 'speed', label: 'Steps / frame', min: 1, max: 24, step: 1, value: 10 },
      { key: 'feed', label: 'Feed bias', min: -0.01, max: 0.01, step: 0.0002, value: 0 },
      { key: 'kill', label: 'Kill bias', min: -0.006, max: 0.006, step: 0.0001, value: 0 },
      { key: 'relief', label: 'Relief', min: 0, max: 2.5, step: 0.05, value: 1 },
    ],
  });
})();
