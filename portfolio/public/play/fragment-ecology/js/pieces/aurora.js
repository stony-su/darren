/* ─────────────────────────────────────────────────────────────────────────────
   01 · AURORA — domain-warped gradient noise, GLSL fragment shader.
   The field is read-only; the pointer bends the domain it is sampled from.
   ───────────────────────────────────────────────────────────────────────────── */
(function () {
  const AA = window.AA;
  const G = AA.GL.GLSL;

  const FRAG = `${G.header}
  uniform vec2  uRes;
  uniform float uTime;
  uniform vec2  uMouse;
  uniform float uMouseActive;
  uniform vec2  uSeed;
  uniform float uWarp;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uRotA;
  uniform float uContrast;
  uniform float uGlow;
  uniform float uDrift;
  ${G.hash}
  ${G.noise2}
  ${G.palette}
  ${G.finish}

  mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

  float fbm4(vec2 p){
    float v = 0.0, a = 0.5;
    mat2 m = rot(uRotA);
    for (int i = 0; i < 4; i++) {
      v += a * gnoise(p);
      p = m * p * 2.03 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    mat2 m = rot(uRotA);
    for (int i = 0; i < 5; i++) {
      v += a * gnoise(p);
      p = m * p * 2.03 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  void main(){
    vec2 fc = gl_FragCoord.xy;
    vec2 uv = (fc - 0.5 * uRes) / uRes.y;
    float t = uTime * uSpeed;
    vec2 p = uv * uScale + uSeed;

    // pointer: a soft gravitational dent in the sampling domain
    vec2 mo = (uMouse - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    vec2 dm = uv - mo;
    float md = length(dm);
    float pull = uMouseActive * exp(-md * md * 7.0);
    p += (dm / (md + 1e-3)) * pull * 0.55;

    p += vec2(cos(t * 0.07), sin(t * 0.05)) * uDrift;

    vec2 q = vec2(fbm4(p + t * 0.10), fbm4(p + vec2(5.2, 1.3) - t * 0.08));
    vec2 r = vec2(fbm4(p + uWarp * q + vec2(1.7, 9.2) + t * 0.15),
                  fbm4(p + uWarp * q + vec2(8.3, 2.8) + t * 0.126));
    float f = fbm(p + uWarp * r);

    float n = f * 0.5 + 0.5;
    float lq = length(q), lr = length(r);
    vec3 col = pal(n + 0.18 * lr);
    float lum = smoothstep(-0.35, 0.95, f + 0.35 * lq);
    col *= pow(lum, uContrast) * 1.35;

    // luminous ridges where the second warp is strongest
    col += pal(n * 0.5 + 0.62) * pow(clamp(lr * 0.75, 0.0, 1.0), 6.0) * uGlow;
    // faint highlight where the pointer is
    col += pal(0.8) * pull * 0.25;

    float vig = smoothstep(1.45, 0.3, length(uv));
    col *= mix(0.45, 1.0, vig);
    col = tonemap(col);
    col = dither(col, fc);
    fragColor = vec4(col, 1.0);
  }`;

  class Aurora extends AA.Piece {
    setup() {
      const gl = (this.gl = AA.GL.context(this.canvas));
      if (!gl) throw new Error('WebGL2 unavailable');
      this.prog = AA.GL.program(gl, FRAG);
      this.vao = AA.GL.emptyVao(gl);
      gl.bindVertexArray(this.vao);
    }
    build() {
      const r = this.rng;
      this.pal = AA.palette(r);
      this.u = {
        uSeed: [r.range(-100, 100), r.range(-100, 100)],
        uRotA: r.range(0.3, 1.2) * r.sign(),
        uContrast: r.range(1.2, 2.2),
        uGlow: r.range(0.35, 0.9),
        uDrift: r.range(0.15, 0.5),
        uPal: this.pal.uniforms(),
      };
    }
    render(t) {
      const gl = this.gl, m = this.mouse;
      gl.viewport(0, 0, this.w, this.h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.prog.use().set(this.u).set({
        uRes: [this.w, this.h],
        uTime: t,
        uMouse: [m.x, m.y],
        uMouseActive: m.active ? 1 : 0,
        uWarp: this.params.warp,
        uScale: this.params.scale,
        uSpeed: this.params.speed,
      });
      AA.GL.drawQuad(gl);
    }
    accent() { return this.pal.accent(0.3, 1.0); }
  }

  AA.register({
    id: 'aurora',
    num: '01',
    title: 'Aurora',
    klass: Aurora,
    seed: 7,
    hero: true,
    maxPixelRatio: 1.0,
    tagline: 'Domain-warped gradient noise',
    blurb: 'Five octaves of gradient noise fold back into their own coordinates twice. Nothing is drawn; a field is sampled, and the pointer dents the space it is sampled from.',
    tech: 'GLSL · fragment shader · 1 pass',
    params: [
      { key: 'warp', label: 'Warp', min: 0, max: 8, step: 0.05, value: 4.0 },
      { key: 'scale', label: 'Scale', min: 0.4, max: 3.5, step: 0.01, value: 1.4 },
      { key: 'speed', label: 'Speed', min: 0, max: 2, step: 0.01, value: 0.55 },
    ],
  });
})();
