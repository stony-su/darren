/* ─────────────────────────────────────────────────────────────────────────────
   04 · ATTRACTOR — Clifford / De Jong / Svensson maps iterated on the GPU.
   A quarter-million orbits advance in parallel; every landing point deposits
   light into a float buffer that forgets at exactly the rate the coefficients
   drift, so the shape breathes instead of flickering.
   Seeds are screened: a map that collapses to a point or a cycle is rejected.
   ───────────────────────────────────────────────────────────────────────────── */
(function () {
  const AA = window.AA;
  const G = AA.GL.GLSL;

  const STEP = `${G.header}
  uniform sampler2D uPos;
  uniform vec4 uK;         // a b c d
  uniform int uType;       // 0 clifford, 1 de jong, 2 svensson
  uniform float uFrame;
  uniform float uReinject;
  ${G.hash}
  vec2 advance(vec2 p){
    float a = uK.x, b = uK.y, c = uK.z, d = uK.w;
    if (uType == 0) return vec2(sin(a*p.y) + c*cos(a*p.x), sin(b*p.x) + d*cos(b*p.y));
    if (uType == 1) return vec2(sin(a*p.y) - cos(b*p.x), sin(c*p.x) - cos(d*p.y));
    return vec2(d*sin(a*p.x) - sin(b*p.y), c*cos(a*p.x) + cos(b*p.y));
  }
  void main(){
    vec4 p = texture(uPos, vUv);
    vec2 n = advance(p.xy);
    vec2 fc = gl_FragCoord.xy;
    if (hash12(fc + uFrame * 0.618) < uReinject || any(isnan(n))) {
      n = (hash22(fc * 1.7 + uFrame) - 0.5) * 4.0;
    }
    fragColor = vec4(n, p.xy);
  }`;

  const POINT_VS = `#version 300 es
  precision highp float;
  uniform sampler2D uPos;
  uniform int uSize;
  uniform float uAspect, uZoom, uRot;
  uniform vec2 uCenter;
  uniform float uColScale, uColOff, uAngleW;
  out vec3 vCol;
  ${G.palette}
  void main(){
    int id = gl_VertexID;
    ivec2 tc = ivec2(id % uSize, id / uSize);
    vec4 p = texelFetch(uPos, tc, 0);
    vec2 q = (p.xy - uCenter) * uZoom;
    float cr = cos(uRot), sr = sin(uRot);
    q = mat2(cr, -sr, sr, cr) * q;
    q.x /= uAspect;
    gl_Position = vec4(q, 0.0, 1.0);
    gl_PointSize = 1.0;
    float v = length(p.xy - p.zw);
    float ang = atan(p.y - uCenter.y, p.x - uCenter.x) / 6.28318 + 0.5;
    vCol = pal(fract(uColOff + v * uColScale + ang * uAngleW));
  }`;

  const POINT_FS = `#version 300 es
  precision highp float;
  in vec3 vCol;
  out vec4 fragColor;
  uniform float uIntensity;
  void main(){ fragColor = vec4(vCol * uIntensity, 1.0); }`;

  const FADE = `${G.header}
  uniform float uDecay;
  void main(){ fragColor = vec4(vec3(uDecay), 1.0); }`;

  const SHOW = `${G.header}
  uniform sampler2D uAcc;
  uniform vec2 uRes;
  uniform float uTime, uExposure;
  uniform vec3 uTint;
  ${G.hash}
  ${G.finish}
  void main(){
    vec3 acc = texture(uAcc, vUv).rgb;
    vec3 col = 1.0 - exp(-acc * uExposure);
    col = pow(col, vec3(0.85));
    vec2 q = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
    col += uTint * 0.035 * smoothstep(1.2, 0.0, length(q));
    col = dither(col, gl_FragCoord.xy);
    fragColor = vec4(col, 1.0);
  }`;

  /* JS mirror of the map for screening seeds */
  function mapJS(type, k, x, y) {
    const [a, b, c, d] = k;
    if (type === 0) return [Math.sin(a * y) + c * Math.cos(a * x), Math.sin(b * x) + d * Math.cos(b * y)];
    if (type === 1) return [Math.sin(a * y) - Math.cos(b * x), Math.sin(c * x) - Math.cos(d * y)];
    return [d * Math.sin(a * x) - Math.sin(b * y), c * Math.cos(a * x) + Math.cos(b * y)];
  }

  function screen(type, k) {
    let x = 0.1, y = 0.1;
    for (let i = 0; i < 200; i++) { [x, y] = mapJS(type, k, x, y); if (!isFinite(x) || !isFinite(y)) return null; }
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    const N = 4000, xs = new Float32Array(N), ys = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      [x, y] = mapJS(type, k, x, y);
      xs[i] = x; ys[i] = y;
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
    const bw = maxx - minx, bh = maxy - miny;
    if (!(bw > 0.8 && bh > 0.8)) return null;
    // occupancy on a 48x48 grid: thin cycles occupy few cells, chaos occupies many
    const cells = new Uint8Array(48 * 48);
    let occ = 0;
    for (let i = 0; i < N; i++) {
      const cx = Math.min(47, ((xs[i] - minx) / bw * 48) | 0), cy = Math.min(47, ((ys[i] - miny) / bh * 48) | 0);
      const o = cy * 48 + cx;
      if (!cells[o]) { cells[o] = 1; occ++; }
    }
    if (occ < 48 * 48 * 0.16) return null;
    return { minx, maxx, miny, maxy, occ };
  }

  class Attractor extends AA.Piece {
    setup() {
      const gl = (this.gl = AA.GL.context(this.canvas));
      if (!gl) throw new Error('WebGL2 unavailable');
      this.fmt = AA.GL.floatFormat(gl);
      if (!this.fmt || this.fmt.bits < 32) {
        // positions need 32-bit precision; try to get it even if half is the default
        if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('32-bit float render targets unavailable');
        this.fmt = { internal: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT, filterable: false, bits: 32 };
      }
      this.pStep = AA.GL.program(gl, STEP);
      this.pPoint = AA.GL.program(gl, POINT_FS, POINT_VS);
      this.pFade = AA.GL.program(gl, FADE);
      this.pShow = AA.GL.program(gl, SHOW);
      this.vao = AA.GL.emptyVao(gl);
      gl.bindVertexArray(this.vao);
      this.acc = null; this.pos = null;
    }

    onResize(w, h) {
      if (this.acc) this.acc.dispose();
      this.acc = AA.GL.target(this.gl, w, h, this.fmt, { filter: this.gl.NEAREST });
      this.acc.bind(); AA.GL.clear(this.gl, 0, 0, 0, 1);
    }

    build() {
      const r = this.rng;
      this.pal = AA.palette(r);
      // screened coefficient search — deterministic per seed
      let type, k, box;
      for (let tries = 0; tries < 200; tries++) {
        type = r.int(0, 2);
        if (type === 0) k = [r.range(-2, 2), r.range(-2, 2), r.range(-1.5, 1.5), r.range(-1.5, 1.5)];
        else if (type === 1) k = [r.range(-2.8, 2.8), r.range(-2.8, 2.8), r.range(-2.8, 2.8), r.range(-2.8, 2.8)];
        else k = [r.range(-2.5, 2.5), r.range(-2.5, 2.5), r.range(-2.0, 2.0), r.range(-2.0, 2.0)];
        box = screen(type, k);
        if (box) break;
      }
      if (!box) { type = 0; k = [-1.4, 1.6, 1.0, 0.7]; box = screen(0, k); }
      this.cfg = {
        type, k, box,
        phase: [r.range(0, 6.28), r.range(0, 6.28), r.range(0, 6.28), r.range(0, 6.28)],
        freq: [r.range(0.13, 0.3), r.range(0.13, 0.3), r.range(0.13, 0.3), r.range(0.13, 0.3)],
        rot: r.range(-0.35, 0.35),
        colScale: r.range(0.12, 0.3),
        colOff: r.range(0, 1),
        angleW: r.bool(0.5) ? r.range(0.2, 0.6) : 0,
        reinject: 0.0015,
      };
      this.kNow = k.slice();
      this.mouseK = [0, 0];
      this._allocPositions();
      if (this.acc) { this.acc.bind(); AA.GL.clear(this.gl, 0, 0, 0, 1); }
    }

    _allocPositions() {
      const gl = this.gl;
      const N = (this.N = Math.round(this.params.density));
      if (this.pos) this.pos.dispose();
      const data = new Float32Array(N * N * 4);
      const r = this.rng.fork();
      for (let i = 0; i < N * N; i++) {
        data[i * 4] = r.range(-2, 2); data[i * 4 + 1] = r.range(-2, 2);
        data[i * 4 + 2] = data[i * 4]; data[i * 4 + 3] = data[i * 4 + 1];
      }
      const fmt32 = { internal: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT, filterable: false };
      this.pos = AA.GL.pingpong(gl, N, N, fmt32, { filter: gl.NEAREST });
      for (const tgt of [this.pos.read, this.pos.write]) {
        gl.bindTexture(gl.TEXTURE_2D, tgt.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, N, N, 0, gl.RGBA, gl.FLOAT, data);
      }
    }

    onParam(k) {
      if (k === 'density') { this._allocPositions(); }
    }

    render(t, dt) {
      const gl = this.gl, c = this.cfg, m = this.mouse;
      if (!this.acc || !this.pos) return;
      // coefficients: slow seeded drift + pointer tilt, smoothed
      const drift = this.params.drift;
      const tx = m.active ? (m.x - 0.5) * 0.10 : 0, ty = m.active ? (m.y - 0.5) * 0.10 : 0;
      const sm = 1 - Math.exp(-dt * 3);
      this.mouseK[0] += (tx - this.mouseK[0]) * sm;
      this.mouseK[1] += (ty - this.mouseK[1]) * sm;
      for (let i = 0; i < 4; i++) this.kNow[i] = c.k[i] + drift * 0.09 * Math.sin(t * c.freq[i] + c.phase[i]);
      this.kNow[0] += this.mouseK[0]; this.kNow[3] += this.mouseK[1];

      const box = c.box;
      const bw = box.maxx - box.minx, bh = box.maxy - box.miny;
      const aspect = this.w / this.h;
      const zoom = Math.min(1.7 * aspect / bw, 1.7 / bh) * 0.92;
      const center = [(box.minx + box.maxx) / 2, (box.miny + box.maxy) / 2];

      // fade accumulation
      this.acc.bind();
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
      this.pFade.use().set({ uDecay: dt > 0 ? this.params.decay : 1 });
      AA.GL.drawQuad(gl);

      const iters = dt > 0 ? 2 : 0;
      for (let it = 0; it < iters; it++) {
        // advance every orbit one step
        gl.disable(gl.BLEND);
        this.pos.write.bind();
        AA.GL.bindTex(gl, 0, this.pos.read.tex);
        this.pStep.use().set({ uPos: 0, uK: this.kNow, uType: c.type, uFrame: this.frames * 2 + it, uReinject: c.reinject });
        AA.GL.drawQuad(gl);
        this.pos.swap();
        // deposit
        this.acc.bind();
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        AA.GL.bindTex(gl, 0, this.pos.read.tex);
        this.pPoint.use().set({
          uPos: 0, uSize: this.N, uAspect: aspect, uZoom: zoom, uRot: c.rot + 0.03 * Math.sin(t * 0.09),
          uCenter: center, uColScale: c.colScale, uColOff: c.colOff, uAngleW: c.angleW,
          uIntensity: 0.06 * (512 * 512) / (this.N * this.N) * 3.0, uPal: this.pal.uniforms(),
        });
        gl.drawArrays(gl.POINTS, 0, this.N * this.N);
      }
      gl.disable(gl.BLEND);

      // show
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.w, this.h);
      AA.GL.bindTex(gl, 0, this.acc.tex);
      const tint = this.pal.at(c.colOff + 0.5);
      this.pShow.use().set({ uAcc: 0, uRes: [this.w, this.h], uTime: t, uExposure: this.params.exposure, uTint: tint });
      AA.GL.drawQuad(gl);
    }

    accent() { return this.pal.accent(); }
  }

  AA.register({
    id: 'attractor',
    num: '04',
    title: 'Attractor',
    klass: Attractor,
    seed: 113,
    maxPixelRatio: 1.25,
    adaptive: false,          // resizing would reset the simulation state
    tagline: 'Strange attractors, GPU-iterated',
    blurb: 'A quarter-million orbits of a chaotic map advance in lockstep, each depositing light where it lands. Coefficients drift on slow sines; the pointer tilts them. Seeds that collapse to a cycle are screened out before you see them.',
    tech: 'WebGL2 · texture-resident orbits · additive float accumulation',
    params: [
      { key: 'density', label: 'Orbits (side)', min: 256, max: 1024, step: 256, value: 512 },
      { key: 'exposure', label: 'Exposure', min: 0.2, max: 6, step: 0.05, value: 1.6 },
      { key: 'decay', label: 'Memory', min: 0.80, max: 0.995, step: 0.005, value: 0.93 },
      { key: 'drift', label: 'Drift', min: 0, max: 1.5, step: 0.05, value: 0.5 },
    ],
  });
})();
