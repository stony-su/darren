/* ─────────────────────────────────────────────────────────────────────────────
   06 · FOLD — kaleidoscopic IFS, ray-marched through a distance field.
   Space is mirrored, rotated and scaled up to eleven times; the distance to what
   remains is estimated and marched. The seed chooses the fold rotations and
   scale, so every sibling is a different crystal. Orbit with the pointer.
   ───────────────────────────────────────────────────────────────────────────── */
(function () {
  const AA = window.AA;
  const G = AA.GL.GLSL;

  const FRAG = `${G.header}
  uniform vec2  uRes;
  uniform float uTime;
  uniform int   uIter;
  uniform float uScale;
  uniform vec3  uOffset;
  uniform vec3  uRot1, uRot2;
  uniform float uMorph, uGlow, uSpeed;
  uniform vec2  uCam;         // azimuth, elevation
  uniform float uCamDist;
  uniform float uPalOff, uPalSpan;
  uniform float uSolid, uShape;
  uniform vec3  uFog;
  uniform vec3  uLightDir;
  ${G.hash}
  ${G.palette}
  ${G.finish}

  mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1,0,0, 0,c,-s, 0,s,c); }
  mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c,0,s, 0,1,0, -s,0,c); }
  mat3 rotZ(float a){ float c = cos(a), s = sin(a); return mat3(c,-s,0, s,c,0, 0,0,1); }
  mat3 euler(vec3 e){ return rotZ(e.z) * rotY(e.y) * rotX(e.x); }

  mat3 R1, R2;
  vec3 OFF;

  float de(vec3 z, out float trap){
    float s = uScale;
    trap = 1e9;
    float k = 1.0;
    for (int i = 0; i < 14; i++) {
      if (i >= uIter) break;
      z = R1 * z;
      // tetrahedral fold: three mirror planes, four copies per level
      if (z.x + z.y < 0.0) z.xy = -z.yx;
      if (z.x + z.z < 0.0) z.xz = -z.zx;
      if (z.y + z.z < 0.0) z.zy = -z.yz;
      z = R2 * z;
      z = z * s - OFF * (s - 1.0);
      k *= s;
      trap = min(trap, length(z));            // raw orbit trap: 0 near the fold planes, ~2 far from them
    }
    // terminal primitive at every copy: sphere or cube, sized so siblings just touch
    float dsph = length(z) - uSolid;
    float dbox = length(max(abs(z) - vec3(uSolid * 0.62), 0.0));
    return mix(dsph, dbox, uShape) / k;
  }

  vec3 normalAt(vec3 p, float eps){
    float t;
    vec2 e = vec2(1.0, -1.0) * eps;
    return normalize(
      e.xyy * de(p + e.xyy, t) + e.yyx * de(p + e.yyx, t) +
      e.yxy * de(p + e.yxy, t) + e.xxx * de(p + e.xxx, t));
  }

  void main(){
    vec2 fc = gl_FragCoord.xy;
    vec2 uv = (fc - 0.5 * uRes) / uRes.y;
    float t = uTime * uSpeed;

    // fold parameters breathe
    R1 = euler(uRot1 + uMorph * 0.09 * vec3(sin(t * 0.31), sin(t * 0.23 + 1.0), sin(t * 0.17 + 2.0)));
    R2 = euler(uRot2 + uMorph * 0.07 * vec3(sin(t * 0.19 + 3.0), sin(t * 0.29 + 4.0), sin(t * 0.13 + 5.0)));
    OFF = uOffset + uMorph * 0.05 * vec3(sin(t * 0.21), sin(t * 0.27 + 1.5), sin(t * 0.16 + 3.0));

    // camera orbit
    float az = uCam.x, el = uCam.y;
    vec3 ro = uCamDist * vec3(cos(el) * sin(az), sin(el), cos(el) * cos(az));
    vec3 ta = vec3(0.0);
    vec3 fw = normalize(ta - ro);
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(rt, fw);
    vec3 rd = normalize(uv.x * rt + uv.y * up + 1.5 * fw);

    // background
    vec3 bg = uFog * (0.6 + 0.4 * uv.y) + pal(uPalOff + 0.5) * 0.06 * smoothstep(1.1, 0.0, length(uv));
    bg *= smoothstep(1.6, 0.2, length(uv));

    // bounding sphere
    float bR = 2.3;
    float b = dot(ro, rd);
    float c = dot(ro, ro) - bR * bR;
    float h = b * b - c;
    vec3 col = bg;
    float glow = 0.0;
    if (h > 0.0) {
      float tn = max(0.0, -b - sqrt(h)), tf = -b + sqrt(h);
      float tt = tn;
      float trap = 0.0, d = 0.0;
      int i = 0;
      bool hit = false;
      for (i = 0; i < 110; i++) {
        vec3 p = ro + rd * tt;
        d = de(p, trap);
        float eps = 0.0007 + 0.0011 * tt;
        glow += exp(-d * 60.0) * 0.012;
        if (d < eps) { hit = true; break; }
        tt += d * 0.8;
        if (tt > tf) break;
      }
      if (hit) {
        vec3 p = ro + rd * tt;
        vec3 n = normalAt(p, 0.0008 + 0.001 * tt);
        vec3 L = normalize(uLightDir);
        float dif = max(dot(n, L), 0.0);
        float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
        float ao = clamp(1.0 - float(i) / 110.0, 0.0, 1.0);
        ao = 0.3 + 0.7 * ao;
        // cheap soft shadow: march a little along the light
        float sh = 1.0, st = 0.02;
        for (int j = 0; j < 12; j++) {
          float tr; float dd = de(p + L * st, tr);
          sh = min(sh, 6.0 * dd / st);
          st += clamp(dd, 0.01, 0.12);
          if (sh < 0.02) break;
        }
        sh = clamp(sh, 0.0, 1.0);
        vec3 alb = pal(uPalOff + trap * uPalSpan) * 1.15;
        vec3 spec = mix(alb, vec3(1.0), 0.5) * pow(max(dot(reflect(-L, n), -rd), 0.0), 32.0) * 0.55;
        col = alb * (0.22 + 1.1 * dif * sh) * ao;
        col += alb * rim * 0.45 * ao;
        col += spec * sh * ao;
        col += pal(uPalOff + 0.33) * 0.16 * ao * (0.5 + 0.5 * n.y);   // sky fill
        col *= 1.35;
        // fog
        float fg = 1.0 - exp(-max(tt - uCamDist + 1.6, 0.0) * 0.28);
        col = mix(col, bg, fg);
      }
      col += pal(uPalOff + 0.6) * glow * uGlow;
    }
    col = tonemap(col);
    col = dither(col, fc);
    fragColor = vec4(col, 1.0);
  }`;

  class Fold extends AA.Piece {
    setup() {
      const gl = (this.gl = AA.GL.context(this.canvas));
      if (!gl) throw new Error('WebGL2 unavailable');
      this.prog = AA.GL.program(gl, FRAG);
      this.vao = AA.GL.emptyVao(gl);
      gl.bindVertexArray(this.vao);
      this.cam = [0.6, 0.3];
    }
    build() {
      const r = this.rng;
      this.pal = AA.palette(r);
      // rotations are the difference between a crystal and a cauliflower:
      // keep them small, and usually on one axis only
      const axis = r.int(0, 2);
      const small = () => (r.bool(0.5) ? r.range(-0.14, 0.14) : 0);
      const rot1 = [small(), small(), small()];
      const rot2 = [0, 0, 0];
      rot2[axis] = r.range(-0.32, 0.32);
      if (r.bool(0.3)) rot2[(axis + 1) % 3] = r.range(-0.15, 0.15);
      if (r.bool(0.25)) { rot1[0] = rot1[1] = rot1[2] = 0; }
      this.cfg = {
        scale: r.range(1.62, 2.05),       // above 2 the four copies separate into dust
        offset: [r.range(0.85, 1.15), r.range(0.85, 1.15), r.range(0.85, 1.15)],
        shape: r.bool(0.5) ? 1 : 0,
        rot1, rot2,
        camDist: r.range(5.4, 6.4),
        solid: r.range(1.5, 2.2),
        palOff: r.range(0, 1),
        palSpan: r.range(0.18, 0.45) * r.sign(),
        light: [r.range(-1, 1), r.range(0.4, 1), r.range(-1, 1)],
        az0: r.range(0, 6.28),
        orbit: r.range(0.06, 0.13) * r.sign(),
        elBase: r.range(0.15, 0.45),
      };
      this.cfg.fog = this.pal.at(this.cfg.palOff + 0.5).map((v) => v * 0.06 + 0.012);
    }
    render(t, dt) {
      const gl = this.gl, m = this.mouse, c = this.cfg;
      const speed = this.params.speed;
      // camera target: auto-orbit, pointer steers when present
      const azT = c.az0 + t * c.orbit * speed + (m.active ? (m.x - 0.5) * 2.4 : 0);
      const elT = c.elBase + Math.sin(t * 0.07 * speed) * 0.18 + (m.active ? (m.y - 0.5) * 1.1 : 0);
      const k = 1 - Math.exp(-(dt || 0.016) * 2.5);
      this.cam[0] += (azT - this.cam[0]) * k;
      this.cam[1] += (elT - this.cam[1]) * k;
      gl.viewport(0, 0, this.w, this.h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.prog.use().set({
        uRes: [this.w, this.h], uTime: t,
        uIter: Math.round(this.params.detail), uScale: c.scale, uOffset: c.offset,
        uRot1: c.rot1, uRot2: c.rot2, uMorph: this.params.morph, uGlow: this.params.glow, uSpeed: speed,
        uCam: this.cam, uCamDist: c.camDist, uPalOff: c.palOff, uPalSpan: c.palSpan, uSolid: c.solid, uShape: c.shape,
        uFog: c.fog, uLightDir: c.light, uPal: this.pal.uniforms(),
      });
      AA.GL.drawQuad(gl);
    }
    accent() { return this.pal.accent(); }
  }

  AA.register({
    id: 'fold',
    num: '06',
    title: 'Fold',
    klass: Fold,
    seed: 191,
    maxPixelRatio: 0.9,
    tagline: 'Kaleidoscopic IFS, ray-marched',
    blurb: 'Space is mirrored, sorted, rotated and scaled up to eleven times, and a ray walks the distance to whatever survives. The fold angles breathe; the pointer orbits the camera. Every seed is a different crystal.',
    tech: 'GLSL · sphere-traced distance field · orbit-trap colour · soft shadows',
    params: [
      { key: 'detail', label: 'Fold depth', min: 3, max: 11, step: 1, value: 7 },
      { key: 'morph', label: 'Morph', min: 0, max: 2, step: 0.05, value: 0.7 },
      { key: 'speed', label: 'Speed', min: 0, max: 2.5, step: 0.05, value: 1 },
      { key: 'glow', label: 'Glow', min: 0, max: 2, step: 0.05, value: 0.6 },
    ],
  });
})();
