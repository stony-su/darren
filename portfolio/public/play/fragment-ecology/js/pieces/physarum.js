/* ─────────────────────────────────────────────────────────────────────────────
   05 · PHYSARUM — slime-mould agents on a pheromone field, WebGL2, 4 passes.
   Agents live in a texture (x, y, heading, species). Each frame they sense the
   trail ahead-left / ahead / ahead-right, turn toward the strongest, step,
   deposit, and the trail diffuses and decays. Two species may share the field
   and avoid each other's scent, which is where the veins and membranes come from.
   ───────────────────────────────────────────────────────────────────────────── */
(function () {
  const AA = window.AA;
  const G = AA.GL.GLSL;

  const AGENT = `${G.header}
  uniform sampler2D uAgents, uTrail;
  uniform vec2 uTrailRes;
  uniform float uSA, uRA, uSO, uSS;
  uniform vec2 uSpMul;       // species-1 multipliers for sensor offset & step
  uniform float uRepel;
  uniform float uJitter;
  uniform float uFrame;
  uniform vec2 uMouse;
  uniform float uMouseOn;
  ${G.hash}
  float sense(vec2 q, float sp){
    vec4 t = texture(uTrail, q);
    return sp < 0.5 ? t.r - t.g * uRepel : t.g - t.r * uRepel;
  }
  void main(){
    vec4 a = texture(uAgents, vUv);
    vec2 p = a.xy; float h = a.z; float sp = a.w;
    vec2 px = 1.0 / uTrailRes;
    float so = uSO * (sp < 0.5 ? 1.0 : uSpMul.x);
    float ss = uSS * (sp < 0.5 ? 1.0 : uSpMul.y);
    vec2 f = p + vec2(cos(h), sin(h)) * so * px;
    vec2 l = p + vec2(cos(h + uSA), sin(h + uSA)) * so * px;
    vec2 r = p + vec2(cos(h - uSA), sin(h - uSA)) * so * px;
    float sf = sense(f, sp), sl = sense(l, sp), sr = sense(r, sp);
    vec2 rnd = hash22(gl_FragCoord.xy + uFrame * 1.37);
    if (sf > sl && sf > sr) { }
    else if (sf < sl && sf < sr) { h += (rnd.x < 0.5 ? uRA : -uRA); }
    else if (sl > sr) { h += uRA; }
    else if (sr > sl) { h -= uRA; }
    h += (rnd.y - 0.5) * uJitter;
    if (uMouseOn > 0.5) {
      float asp = uTrailRes.x / uTrailRes.y;
      vec2 d = (uMouse - p);
      d.x = d.x - round(d.x);  d.y = d.y - round(d.y);      // shortest way on the torus
      float dist = length(d * vec2(asp, 1.0));
      if (dist < 0.22) {
        float ang = atan(d.y, d.x);
        float diff = mod(ang - h + 3.14159265, 6.2831853) - 3.14159265;
        h += diff * 0.18 * (1.0 - dist / 0.22);
      }
    }
    p += vec2(cos(h), sin(h)) * ss * px;
    p = fract(p);
    fragColor = vec4(p, h, sp);
  }`;

  const DEPOSIT_VS = `#version 300 es
  precision highp float;
  uniform sampler2D uAgents;
  uniform int uSize;
  uniform float uDeposit;
  out vec4 vCol;
  void main(){
    int id = gl_VertexID;
    vec4 a = texelFetch(uAgents, ivec2(id % uSize, id / uSize), 0);
    gl_Position = vec4(a.xy * 2.0 - 1.0, 0.0, 1.0);
    gl_PointSize = 1.0;
    vCol = a.w < 0.5 ? vec4(uDeposit, 0.0, 0.0, 0.0) : vec4(0.0, uDeposit, 0.0, 0.0);
  }`;
  const DEPOSIT_FS = `#version 300 es
  precision highp float;
  in vec4 vCol; out vec4 fragColor;
  void main(){ fragColor = vCol; }`;

  const DIFFUSE = `${G.header}
  uniform sampler2D uTrail;
  uniform vec2 uTexel;
  uniform float uDecay, uBlur;
  uniform vec3 uFood;      // x y radius (0 = none)
  uniform float uAspect;
  void main(){
    vec2 uv = vUv;
    vec4 c = texture(uTrail, uv);
    vec4 s = vec4(0.0);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) s += texture(uTrail, uv + vec2(float(i), float(j)) * uTexel);
    s /= 9.0;
    vec4 o = mix(c, s, uBlur) * uDecay;
    if (uFood.z > 0.0) {
      float d = length((uv - uFood.xy) * vec2(uAspect, 1.0));
      o.rg += smoothstep(uFood.z, 0.0, d) * 0.6;
    }
    fragColor = o;
  }`;

  const SHOW = `${G.header}
  uniform sampler2D uTrail;
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uOffA, uOffB, uSpan, uExposure;
  uniform float uTwo;
  ${G.hash}
  ${G.palette}
  ${G.finish}
  void main(){
    vec4 t = texture(uTrail, vUv);
    float a = 1.0 - exp(-t.r * uExposure);
    float b = 1.0 - exp(-t.g * uExposure);
    vec3 ca = pal(uOffA + a * uSpan) * a;
    vec3 cb = pal(uOffB + b * uSpan) * b;
    vec3 col = ca + cb * uTwo;
    // gentle bloom-ish lift where both species meet
    col += vec3(1.0) * a * b * uTwo * 0.35;
    vec2 q = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
    col *= mix(0.6, 1.0, smoothstep(1.3, 0.3, length(q)));
    col = tonemap(col * 1.15);
    col = dither(col, gl_FragCoord.xy);
    fragColor = vec4(col, 1.0);
  }`;

  const D2R = Math.PI / 180;

  class Physarum extends AA.Piece {
    setup() {
      const gl = (this.gl = AA.GL.context(this.canvas));
      if (!gl) throw new Error('WebGL2 unavailable');
      if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('32-bit float render targets unavailable');
      this.linear = !!gl.getExtension('OES_texture_float_linear');
      this.fmt32 = { internal: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT, filterable: this.linear, bits: 32 };
      // RGBA16F is renderable under EXT_color_buffer_float and filterable in core WebGL2
      this.fmtTrail = { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, filterable: true, bits: 16 };
      this.pAgent = AA.GL.program(gl, AGENT);
      this.pDeposit = AA.GL.program(gl, DEPOSIT_FS, DEPOSIT_VS);
      this.pDiffuse = AA.GL.program(gl, DIFFUSE);
      this.pShow = AA.GL.program(gl, SHOW);
      this.vao = AA.GL.emptyVao(gl);
      gl.bindVertexArray(this.vao);
      this.trail = null; this.agents = null;
    }

    onResize(w, h) {
      const gl = this.gl;
      let tw = Math.round(w * 0.75), th = Math.round(h * 0.75);
      const mx = Math.max(tw, th);
      if (mx > 1440) { tw = Math.round(tw * 1440 / mx); th = Math.round(th * 1440 / mx); }
      tw = Math.max(64, tw); th = Math.max(64, th);
      if (this.trail) this.trail.dispose();
      this.trail = AA.GL.pingpong(gl, tw, th, this.fmtTrail, { wrap: gl.REPEAT, filter: gl.LINEAR });
      this.texel = [1 / tw, 1 / th];
      for (const t of [this.trail.read, this.trail.write]) { t.bind(); AA.GL.clear(gl, 0, 0, 0, 0); }
    }

    build() {
      const r = this.rng;
      this.pal = AA.palette(r);
      const two = r.bool(0.6);
      const sa = r.range(15, 55);
      this.cfg = {
        two,
        SA: sa * D2R,
        RA: (r.bool(0.5) ? sa : r.range(15, 60)) * D2R,
        SO: r.range(4, 26),
        SS: r.range(1.0, 2.6),
        spMul: two ? [r.range(0.5, 2.2), r.range(0.7, 1.4)] : [1, 1],
        repel: two ? r.range(0.4, 1.6) : 0,
        jitter: r.range(0.02, 0.25),
        decay: r.range(0.88, 0.95),
        blur: r.range(0.55, 0.9),
        deposit: r.range(0.7, 1.3),
        offA: r.range(0, 1),
        offB: 0,
        span: r.range(0.08, 0.25) * r.sign(),
        exposure: r.range(0.8, 1.4),
        layout: r.pick([0, 0, 0, 1, 1, 3]),   // uniform, disc, or two clusters; no rings (they lock into one loop)
      };
      this.cfg.offB = this.cfg.offA + r.range(0.35, 0.65);
      this._allocAgents();
      if (this.trail) for (const t of [this.trail.read, this.trail.write]) { t.bind(); AA.GL.clear(this.gl, 0, 0, 0, 0); }
    }

    _allocAgents() {
      const gl = this.gl, c = this.cfg;
      const N = (this.N = Math.round(this.params.agents));
      if (this.agents) this.agents.dispose();
      const data = new Float32Array(N * N * 4);
      const r = this.rng.fork();
      for (let i = 0; i < N * N; i++) {
        let x, y;
        if (c.layout === 0) { x = r.next(); y = r.next(); }
        else if (c.layout === 1) { const a = r.range(0, 6.2832), d = Math.sqrt(r.next()) * 0.3; x = 0.5 + Math.cos(a) * d * 0.6; y = 0.5 + Math.sin(a) * d; }
        else if (c.layout === 2) { const a = r.range(0, 6.2832), d = 0.28 + r.range(-0.03, 0.03); x = 0.5 + Math.cos(a) * d * 0.6; y = 0.5 + Math.sin(a) * d; }
        else { const side = r.bool() ? 0.25 : 0.75; x = side + r.gauss() * 0.06; y = 0.5 + r.gauss() * 0.15; }
        data[i * 4] = ((x % 1) + 1) % 1; data[i * 4 + 1] = ((y % 1) + 1) % 1;
        data[i * 4 + 2] = r.range(0, 6.2832);
        data[i * 4 + 3] = c.two ? (i % 2) : 0;
      }
      this.agents = AA.GL.pingpong(gl, N, N, this.fmt32, { filter: gl.NEAREST });
      for (const t of [this.agents.read, this.agents.write]) {
        gl.bindTexture(gl.TEXTURE_2D, t.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, N, N, 0, gl.RGBA, gl.FLOAT, data);
      }
    }

    onParam(k) { if (k === 'agents') this._allocAgents(); }

    render(t, dt) {
      const gl = this.gl, c = this.cfg, m = this.mouse, T = this.trail, A = this.agents;
      if (!T || !A) return;
      const steps = dt > 0 ? Math.round(this.params.speed) : 0;
      const n2 = this.N * this.N;
      // deposit so the domain-mean trail settles near 0.15 regardless of agent count, decay or resolution
      const decay = c.decay * this.params.decay;
      const deposit = c.deposit * 0.09 * Math.max(0.005, 1 - decay) * (T.w * T.h) / (n2 * Math.max(1, steps));
      const food = m.active && m.down ? [m.x, m.y, 0.05] : [0, 0, 0];
      for (let s = 0; s < steps; s++) {
        // 1. agents sense + move
        gl.disable(gl.BLEND);
        A.write.bind();
        AA.GL.bindTex(gl, 0, A.read.tex);
        AA.GL.bindTex(gl, 1, T.read.tex);
        this.pAgent.use().set({
          uAgents: 0, uTrail: 1, uTrailRes: [T.w, T.h],
          uSA: c.SA * this.params.sensor, uRA: c.RA * this.params.sensor, uSO: c.SO * this.params.reach, uSS: c.SS,
          uSpMul: c.spMul, uRepel: c.repel, uJitter: c.jitter, uFrame: this.frames * steps + s,
          uMouse: [m.x, m.y], uMouseOn: m.active ? 1 : 0,
        });
        AA.GL.drawQuad(gl);
        A.swap();
        // 2. deposit
        T.read.bind();
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        AA.GL.bindTex(gl, 0, A.read.tex);
        this.pDeposit.use().set({ uAgents: 0, uSize: this.N, uDeposit: deposit });
        gl.drawArrays(gl.POINTS, 0, n2);
        gl.disable(gl.BLEND);
        // 3. diffuse + decay
        T.write.bind();
        AA.GL.bindTex(gl, 0, T.read.tex);
        this.pDiffuse.use().set({
          uTrail: 0, uTexel: this.texel, uDecay: c.decay * this.params.decay, uBlur: c.blur,
          uFood: s === 0 ? food : [0, 0, 0], uAspect: T.w / T.h,
        });
        AA.GL.drawQuad(gl);
        T.swap();
      }
      // 4. show
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.w, this.h);
      AA.GL.bindTex(gl, 0, T.read.tex);
      this.pShow.use().set({
        uTrail: 0, uRes: [this.w, this.h], uTime: t,
        uOffA: c.offA, uOffB: c.offB, uSpan: c.span, uExposure: c.exposure, uTwo: c.two ? 1 : 0,
        uPal: this.pal.uniforms(),
      });
      AA.GL.drawQuad(gl);
    }

    accent() { const c = this.cfg; return this.pal.accent(Math.min(c.offA, c.offA + c.span), Math.max(c.offA, c.offA + c.span)); }
  }

  AA.register({
    id: 'physarum',
    num: '05',
    title: 'Physarum',
    klass: Physarum,
    seed: 77,
    maxPixelRatio: 1.5,
    adaptive: false,          // resizing would reset the simulation state
    tagline: 'Slime-mould transport networks',
    blurb: 'A quarter-million agents sense a pheromone trail, turn toward the strongest scent, step, and deposit. Most seeds carry two species that avoid each other. Hover to herd them, hold to drop food.',
    tech: 'WebGL2 · texture-resident agents · 4 passes per step',
    params: [
      { key: 'agents', label: 'Agents (side)', min: 256, max: 1024, step: 128, value: 512 },
      { key: 'speed', label: 'Steps / frame', min: 1, max: 4, step: 1, value: 2 },
      { key: 'sensor', label: 'Turn angle ×', min: 0.3, max: 2.5, step: 0.05, value: 1 },
      { key: 'reach', label: 'Sensor reach ×', min: 0.3, max: 3, step: 0.05, value: 1 },
      { key: 'decay', label: 'Trail decay ×', min: 0.95, max: 1.02, step: 0.001, value: 1 },
    ],
  });
})();
