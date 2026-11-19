/* ─────────────────────────────────────────────────────────────────────────────
   FRAGMENT ECOLOGY · core/gl.js
   Thin WebGL2 helpers: programs with cached uniforms, fullscreen triangle,
   float textures, framebuffers, ping-pong pairs.
   ───────────────────────────────────────────────────────────────────────────── */
(function () {
  const AA = (window.AA = window.AA || {});

  const FS_VERT = `#version 300 es
  precision highp float;
  out vec2 vUv;
  void main(){
    vec2 v = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    vUv = v;
    gl_Position = vec4(v * 2.0 - 1.0, 0.0, 1.0);
  }`;

  function context(canvas, opts = {}) {
    const gl = canvas.getContext('webgl2', Object.assign({
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    }, opts));
    return gl || null;
  }

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      const lines = src.split('\n').map((l, i) => `${String(i + 1).padStart(3)}  ${l}`).join('\n');
      console.error('[AA.GL] shader compile failed:\n' + log + '\n' + lines);
      throw new Error('shader compile failed: ' + log);
    }
    return sh;
  }

  function program(gl, fragSrc, vertSrc = FS_VERT) {
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vertSrc));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      console.error('[AA.GL] link failed: ' + log);
      throw new Error('program link failed: ' + log);
    }
    const locs = new Map();
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog, i);
      const name = info.name.replace(/\[0\]$/, '');
      locs.set(name, { loc: gl.getUniformLocation(prog, info.name), type: info.type, size: info.size });
    }
    return {
      prog, locs,
      use() { gl.useProgram(prog); return this; },
      /* set({ uTime: 1.0, uRes: [w,h], uTex: 0 }) — numbers → float unless the
         uniform is declared int/sampler, arrays → vecN or float arrays. */
      set(obj) {
        for (const k in obj) {
          const u = locs.get(k);
          if (!u) continue;
          const v = obj[k];
          const T = u.type;
          if (typeof v === 'number') {
            if (T === gl.INT || T === gl.BOOL || T === gl.SAMPLER_2D || T === gl.UNSIGNED_INT) gl.uniform1i(u.loc, v | 0);
            else gl.uniform1f(u.loc, v);
          } else if (v && v.length !== undefined) {
            if (T === gl.FLOAT_VEC2) gl.uniform2fv(u.loc, v);
            else if (T === gl.FLOAT_VEC3) gl.uniform3fv(u.loc, v);
            else if (T === gl.FLOAT_VEC4) gl.uniform4fv(u.loc, v);
            else if (T === gl.FLOAT_MAT3) gl.uniformMatrix3fv(u.loc, false, v);
            else if (T === gl.FLOAT_MAT4) gl.uniformMatrix4fv(u.loc, false, v);
            else if (T === gl.FLOAT) gl.uniform1fv(u.loc, v);
            else if (T === gl.INT) gl.uniform1iv(u.loc, v);
          }
        }
        return this;
      },
    };
  }

  /* one VAO is enough for gl_VertexID based drawing */
  function emptyVao(gl) {
    const vao = gl.createVertexArray();
    return vao;
  }

  function drawQuad(gl) { gl.drawArrays(gl.TRIANGLES, 0, 3); }

  /* Best renderable float format available. */
  function floatFormat(gl) {
    if (gl.getExtension('EXT_color_buffer_float')) {
      return { internal: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT, filterable: !!gl.getExtension('OES_texture_float_linear'), bits: 32 };
    }
    if (gl.getExtension('EXT_color_buffer_half_float')) {
      return { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, filterable: true, bits: 16 };
    }
    return null;
  }

  function texture(gl, w, h, fmt, opts = {}) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const filter = opts.filter !== undefined ? opts.filter : (fmt.filterable ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    const wrap = opts.wrap || gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internal, w, h, 0, fmt.format, fmt.type, opts.data || null);
    return tex;
  }

  function framebuffer(gl, tex) {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) console.warn('[AA.GL] framebuffer incomplete', status);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fb;
  }

  /* A render target: texture + framebuffer. */
  function target(gl, w, h, fmt, opts) {
    const tex = texture(gl, w, h, fmt, opts);
    const fb = framebuffer(gl, tex);
    return {
      tex, fb, w, h,
      bind() { gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, w, h); },
      dispose() { gl.deleteTexture(tex); gl.deleteFramebuffer(fb); },
    };
  }

  /* Two targets that swap roles each step. */
  function pingpong(gl, w, h, fmt, opts) {
    const a = target(gl, w, h, fmt, opts), b = target(gl, w, h, fmt, opts);
    const pp = {
      read: a, write: b, w, h,
      swap() { const t = pp.read; pp.read = pp.write; pp.write = t; },
      dispose() { a.dispose(); b.dispose(); },
    };
    return pp;
  }

  function bindTex(gl, unit, tex) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    return unit;
  }

  function clear(gl, r = 0, g = 0, b = 0, a = 1) {
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /* Shared GLSL snippets, pasted into fragment shaders. */
  const GLSL = {
    header: `#version 300 es
    precision highp float;
    precision highp int;
    in vec2 vUv;
    out vec4 fragColor;`,
    hash: `
    float hash11(float p){ p = fract(p*0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
    float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
    vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz)*p3.zy); }
    vec3 hash32(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz)*p3.zyx); }`,
    /* gradient noise 2D, returns [-1,1] */
    noise2: `
    float gnoise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      vec2 u = f*f*f*(f*(f*6.0-15.0)+10.0);
      vec2 ga = hash22(i + vec2(0,0))*2.0-1.0;
      vec2 gb = hash22(i + vec2(1,0))*2.0-1.0;
      vec2 gc = hash22(i + vec2(0,1))*2.0-1.0;
      vec2 gd = hash22(i + vec2(1,1))*2.0-1.0;
      float va = dot(ga, f - vec2(0,0));
      float vb = dot(gb, f - vec2(1,0));
      float vc = dot(gc, f - vec2(0,1));
      float vd = dot(gd, f - vec2(1,1));
      return mix(mix(va, vb, u.x), mix(vc, vd, u.x), u.y) * 1.6;
    }`,
    palette: `
    uniform vec3 uPal[4];
    vec3 pal(float t){ return clamp(uPal[0] + uPal[1]*cos(6.28318*(uPal[2]*t + uPal[3])), 0.0, 1.0); }`,
    /* filmic-ish tonemap + dither for clean dark gradients */
    finish: `
    vec3 tonemap(vec3 c){ c = max(c, 0.0); return c*(2.51*c+0.03)/(c*(2.43*c+0.59)+0.14); }
    vec3 dither(vec3 c, vec2 fc){ return c + (hash12(fc + fract(uTime)*17.0) - 0.5) / 255.0; }`,
  };

  AA.GL = { FS_VERT, context, program, emptyVao, drawQuad, floatFormat, texture, framebuffer, target, pingpong, bindTex, clear, GLSL };
})();
