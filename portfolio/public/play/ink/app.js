/* ==================================================================
   Ink — a study in diffusion
   A real-time GPU fluid simulation of ink dispersing through water.
   ================================================================== */
'use strict';

(function () {

  // ----------------------------------------------------------------
  // Inks & palettes.  Each ink has a "water" colour (luminous, for the
  // dark mode) and a "paper" colour (pigment, for the light mode).
  // ----------------------------------------------------------------
  const PALETTES = [
    { name: 'Deep Sea', inks: [
      { name: 'Indigo',     water: [0.18, 0.32, 1.00], paper: [0.12, 0.20, 0.72] },
      { name: 'Cerulean',   water: [0.22, 0.62, 1.00], paper: [0.10, 0.45, 0.85] },
      { name: 'Teal',       water: [0.10, 0.85, 0.78], paper: [0.05, 0.55, 0.52] },
      { name: 'Aquamarine', water: [0.60, 0.98, 0.92], paper: [0.30, 0.78, 0.74] },
      { name: 'Pearl',      water: [0.92, 0.90, 0.84], paper: [0.42, 0.46, 0.54] },
    ] },
    { name: 'Ember', inks: [
      { name: 'Vermilion',  water: [1.00, 0.30, 0.12], paper: [0.88, 0.20, 0.08] },
      { name: 'Amber',      water: [1.00, 0.64, 0.16], paper: [0.92, 0.52, 0.10] },
      { name: 'Gold',       water: [1.00, 0.86, 0.38], paper: [0.90, 0.72, 0.22] },
      { name: 'Rose',       water: [1.00, 0.38, 0.56], paper: [0.85, 0.22, 0.42] },
      { name: 'Wine',       water: [0.72, 0.12, 0.30], paper: [0.45, 0.06, 0.20] },
    ] },
    { name: 'Sumi', inks: [
      { name: 'Sumi',       water: [0.90, 0.88, 0.82], paper: [0.06, 0.06, 0.08] },
      { name: 'Ash',        water: [0.62, 0.65, 0.72], paper: [0.38, 0.38, 0.40] },
      { name: 'Vermilion',  water: [1.00, 0.30, 0.15], paper: [0.82, 0.18, 0.10] },
      { name: 'Gold leaf',  water: [1.00, 0.80, 0.34], paper: [0.85, 0.66, 0.24] },
    ] },
    { name: 'Aurora', inks: [
      { name: 'Emerald',    water: [0.12, 0.92, 0.52], paper: [0.06, 0.62, 0.36] },
      { name: 'Violet',     water: [0.58, 0.32, 1.00], paper: [0.42, 0.18, 0.78] },
      { name: 'Cyan',       water: [0.24, 0.92, 1.00], paper: [0.08, 0.62, 0.80] },
      { name: 'Magenta',    water: [1.00, 0.28, 0.78], paper: [0.82, 0.12, 0.58] },
      { name: 'Lime',       water: [0.74, 1.00, 0.34], paper: [0.55, 0.75, 0.12] },
    ] },
    { name: 'Blush', inks: [
      { name: 'Peony',      water: [1.00, 0.48, 0.62], paper: [0.90, 0.32, 0.48] },
      { name: 'Lilac',      water: [0.76, 0.62, 1.00], paper: [0.56, 0.42, 0.82] },
      { name: 'Coral',      water: [1.00, 0.54, 0.42], paper: [0.90, 0.40, 0.28] },
      { name: 'Plum',       water: [0.56, 0.22, 0.56], paper: [0.40, 0.12, 0.40] },
      { name: 'Cream',      water: [1.00, 0.92, 0.74], paper: [0.80, 0.66, 0.38] },
    ] },
  ];

  // ----------------------------------------------------------------
  // Configuration
  // ----------------------------------------------------------------
  const QUALITY = {
    low:    { simRes: 128, dyeRes: 512,  pressureIterations: 16, coarseIterations: 24 },
    medium: { simRes: 256, dyeRes: 1024, pressureIterations: 24, coarseIterations: 32 },
    high:   { simRes: 384, dyeRes: 2048, pressureIterations: 36, coarseIterations: 40 },
  };

  const isTouchOnly = window.matchMedia('(hover: none)').matches;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isSmall = Math.min(window.innerWidth, window.innerHeight) < 600;

  const DEFAULTS = {
    quality: (isTouchOnly || isSmall) ? 'low' : 'medium',
    curl: 16,         // vorticity confinement — how much the ink curls
    gravity: 16,      // ink is heavier than water and sinks
    diffusion: 0.2,   // molecular diffusion of the dye
    viscosity: 0.32,  // velocity dissipation
    dyeFade: 0.035,   // slow dissolution of the ink
    clarity: 0.12,    // extra fade for thin veils, keeps the water clear
    dropSize: 0.5,
    ambient: 0.5,     // strength of the slow background current
    sharp: true,      // MacCormack advection (crisper filaments)
    bloom: true,
    grain: true,
    autoDrops: true,
    hoverStir: true,
    rain: true,       // after a long quiet spell it starts to rain
  };
  const config = Object.assign({}, DEFAULTS);
  if (config.quality === 'low') { config.sharp = false; config.bloom = false; }

  const SLIDERS = [
    { key: 'curl',      label: 'Swirl',     min: 0,    max: 50,   step: 1,     fmt: v => v.toFixed(0) },
    { key: 'gravity',   label: 'Sink',      min: 0,    max: 60,   step: 1,     fmt: v => v.toFixed(0) },
    { key: 'diffusion', label: 'Diffusion', min: 0,    max: 1,    step: 0.01,  fmt: v => v.toFixed(2) },
    { key: 'viscosity', label: 'Viscosity', min: 0.02, max: 2.5,  step: 0.01,  fmt: v => v.toFixed(2) },
    { key: 'dyeFade',   label: 'Fade',      min: 0,    max: 0.5,  step: 0.005, fmt: v => v.toFixed(3) },
    { key: 'clarity',   label: 'Clarity',   min: 0,    max: 0.6,  step: 0.01,  fmt: v => v.toFixed(2) },
    { key: 'dropSize',  label: 'Drop size', min: 0.1,  max: 1,    step: 0.01,  fmt: v => v.toFixed(2) },
    { key: 'ambient',   label: 'Current',   min: 0,    max: 1,    step: 0.01,  fmt: v => v.toFixed(2) },
  ];
  const TOGGLES = [
    { key: 'sharp',     label: 'Sharp' },
    { key: 'bloom',     label: 'Bloom' },
    { key: 'grain',     label: 'Grain' },
    { key: 'autoDrops', label: 'Auto drops' },
    { key: 'hoverStir', label: 'Hover stir' },
    { key: 'rain',      label: 'Rain' },
  ];

  const RAIN_AFTER = 20;       // seconds without touching the water before it rains
  const STROKE_FORCE = 1300;
  const HOVER_FORCE = 220;
  const TRAIL_AMOUNT = 0.12;

  // ----------------------------------------------------------------
  // DOM
  // ----------------------------------------------------------------
  const $ = id => document.getElementById(id);
  const canvas = $('c');
  const body = document.body;
  const els = {
    cursor: $('cursor'), cursorLag: $('cursor-lag'), hint: $('hint'),
    mode: $('btn-mode'), pause: $('btn-pause'), fullscreen: $('btn-fullscreen'), info: $('btn-info'),
    mood: $('btn-mood'), moodName: $('mood-name'), swatches: $('swatches'),
    clear: $('btn-clear'), save: $('btn-save'), settings: $('btn-settings'),
    panel: $('panel'), panelBody: $('panel-body'), panelClose: $('btn-panel-close'), reset: $('btn-reset'),
    modal: $('modal'), modalBackdrop: $('modal-backdrop'), modalClose: $('btn-modal-close'),
    nogl: $('nogl'),
  };

  // ----------------------------------------------------------------
  // WebGL context
  // ----------------------------------------------------------------
  function getWebGLContext(canvas) {
    const params = { alpha: false, depth: false, stencil: false, antialias: false,
                     preserveDrawingBuffer: false, powerPreference: 'high-performance' };
    let gl = canvas.getContext('webgl2', params);
    const isWebGL2 = !!gl;
    if (!isWebGL2) gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);
    if (!gl) return null;

    let halfFloat = null;
    let supportLinearFiltering = false;
    if (isWebGL2) {
      gl.getExtension('EXT_color_buffer_float');
      gl.getExtension('EXT_color_buffer_half_float');
      supportLinearFiltering = true; // half-float filtering is core in WebGL2
    } else {
      halfFloat = gl.getExtension('OES_texture_half_float');
      supportLinearFiltering = !!gl.getExtension('OES_texture_half_float_linear');
    }

    const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : (halfFloat && halfFloat.HALF_FLOAT_OES);
    let formatRGBA, formatRG, formatR;
    if (isWebGL2) {
      formatRGBA = getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, halfFloatTexType);
      formatRG = getSupportedFormat(gl, gl.RG16F, gl.RG, halfFloatTexType);
      formatR = getSupportedFormat(gl, gl.R16F, gl.RED, halfFloatTexType);
    } else {
      formatRGBA = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
      formatRG = formatRGBA;
      formatR = formatRGBA;
    }
    if (!formatRGBA) return null;

    return { gl, isWebGL2, ext: { formatRGBA, formatRG, formatR, halfFloatTexType, supportLinearFiltering } };
  }

  function getSupportedFormat(gl, internalFormat, format, type) {
    if (!supportRenderTextureFormat(gl, internalFormat, format, type)) {
      switch (internalFormat) {
        case gl.R16F: return getSupportedFormat(gl, gl.RG16F, gl.RG, type);
        case gl.RG16F: return getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type);
        default: return null;
      }
    }
    return { internalFormat, format };
  }

  function supportRenderTextureFormat(gl, internalFormat, format, type) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(texture);
    return status === gl.FRAMEBUFFER_COMPLETE;
  }

  const ctx = getWebGLContext(canvas);
  if (!ctx) {
    console.warn('Ink: WebGL with float render targets is unavailable.');
    els.nogl.hidden = false;
    body.classList.add('no-custom-cursor');
    return;
  }
  const { gl, ext } = ctx;

  // ----------------------------------------------------------------
  // Shaders
  // ----------------------------------------------------------------
  const baseVertexShader = `
    precision highp float;
    attribute vec2 aPosition;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform vec2 texelSize;
    void main () {
      vUv = aPosition * 0.5 + 0.5;
      vL = vUv - vec2(texelSize.x, 0.0);
      vR = vUv + vec2(texelSize.x, 0.0);
      vT = vUv + vec2(0.0, texelSize.y);
      vB = vUv - vec2(0.0, texelSize.y);
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  const copyShader = `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    uniform sampler2D uTexture;
    uniform float uScale;
    void main () {
      gl_FragColor = texture2D(uTexture, vUv) * uScale;
    }
  `;

  const splatShader = `
    precision highp float;
    precision mediump sampler2D;
    varying vec2 vUv;
    uniform sampler2D uTarget;
    uniform float aspectRatio;
    uniform vec4 color;
    uniform vec2 point;
    uniform float radius;
    uniform float wobble;
    uniform float seed;
    void main () {
      vec2 p = vUv - point;
      p.x *= aspectRatio;
      float ang = atan(p.y, p.x);
      float w = 1.0 + wobble * (0.6 * sin(3.0 * ang + seed) + 0.3 * sin(5.0 * ang - seed * 1.7) + 0.15 * sin(8.0 * ang + seed * 2.3));
      float d = dot(p, p) / (radius * w);
      vec4 base = texture2D(uTarget, vUv);
      gl_FragColor = base + exp(-d) * color;
    }
  `;

  const advectionShader = `
    precision highp float;
    precision mediump sampler2D;
    varying vec2 vUv;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 texelSize;
    uniform vec2 dyeTexelSize;
    uniform float dt;
    uniform float dissipation;
    uniform float thinFade;
    vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
      vec2 st = uv / tsize - 0.5;
      vec2 iuv = floor(st);
      vec2 fuv = fract(st);
      vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
      vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
      vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
      vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
      return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
    }
    void main () {
    #ifdef MANUAL_FILTERING
      vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
      vec4 result = bilerp(uSource, coord, dyeTexelSize);
    #else
      vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
      vec4 result = texture2D(uSource, coord);
    #endif
      float decay = 1.0 + (dissipation + thinFade * exp(-result.a * 4.0)) * dt;
      gl_FragColor = result / decay;
    }
  `;

  // MacCormack correction: sharper transport of the dye with the
  // result clamped to the neighbourhood of the back-traced sample.
  const macCormackShader = `
    precision highp float;
    precision mediump sampler2D;
    varying vec2 vUv;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform sampler2D uForward;
    uniform sampler2D uBack;
    uniform vec2 texelSize;
    uniform vec2 dyeTexelSize;
    uniform float dt;
    uniform float dissipation;
    uniform float thinFade;
    void main () {
      vec2 vel = texture2D(uVelocity, vUv).xy;
      vec2 coord = vUv - dt * vel * texelSize;
      vec4 fwd = texture2D(uForward, vUv);
      vec4 back = texture2D(uBack, vUv);
      vec4 src = texture2D(uSource, vUv);
      vec4 result = fwd + 0.5 * (src - back);
      vec2 st = coord / dyeTexelSize - 0.5;
      vec2 iuv = floor(st);
      vec4 a = texture2D(uSource, (iuv + vec2(0.5, 0.5)) * dyeTexelSize);
      vec4 b = texture2D(uSource, (iuv + vec2(1.5, 0.5)) * dyeTexelSize);
      vec4 c = texture2D(uSource, (iuv + vec2(0.5, 1.5)) * dyeTexelSize);
      vec4 d = texture2D(uSource, (iuv + vec2(1.5, 1.5)) * dyeTexelSize);
      vec4 mn = min(min(a, b), min(c, d));
      vec4 mx = max(max(a, b), max(c, d));
      result = clamp(result, mn, mx);
      float decay = 1.0 + (dissipation + thinFade * exp(-result.a * 4.0)) * dt;
      gl_FragColor = result / decay;
    }
  `;

  const divergenceShader = `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).x;
      float R = texture2D(uVelocity, vR).x;
      float T = texture2D(uVelocity, vT).y;
      float B = texture2D(uVelocity, vB).y;
      vec2 C = texture2D(uVelocity, vUv).xy;
      if (vL.x < 0.0) { L = -C.x; }
      if (vR.x > 1.0) { R = -C.x; }
      if (vT.y > 1.0) { T = -C.y; }
      if (vB.y < 0.0) { B = -C.y; }
      float div = 0.5 * (R - L + T - B);
      gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
    }
  `;

  const curlShader = `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).y;
      float R = texture2D(uVelocity, vR).y;
      float T = texture2D(uVelocity, vT).x;
      float B = texture2D(uVelocity, vB).x;
      float vorticity = R - L - T + B;
      gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
    }
  `;

  // Vorticity confinement + gravity on the ink + a slow, divergence-free
  // ambient current so the water is never entirely still.
  const forcesShader = `
    precision highp float;
    precision mediump sampler2D;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uVelocity;
    uniform sampler2D uCurl;
    uniform sampler2D uDye;
    uniform float curl;
    uniform float dt;
    uniform float gravity;
    uniform float ambient;
    uniform float time;
    void main () {
      float L = texture2D(uCurl, vL).x;
      float R = texture2D(uCurl, vR).x;
      float T = texture2D(uCurl, vT).x;
      float B = texture2D(uCurl, vB).x;
      float C = texture2D(uCurl, vUv).x;
      vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
      force /= length(force) + 0.0001;
      force *= curl * C;
      force.y *= -1.0;

      vec2 velocity = texture2D(uVelocity, vUv).xy;
      velocity += force * dt;

      float amount = texture2D(uDye, vUv).a;
      velocity.y -= gravity * min(amount, 1.2) * dt;

      float a1 = 3.1 * vUv.x + time * 0.13;
      float b1 = 2.3 * vUv.y - time * 0.09;
      float a2 = 6.7 * vUv.x - time * 0.17;
      float b2 = 5.1 * vUv.y + time * 0.11;
      vec2 current = vec2(2.3 * sin(a1) * cos(b1), -3.1 * cos(a1) * sin(b1))
                   + 0.45 * vec2(5.1 * sin(a2) * cos(b2), -6.7 * cos(a2) * sin(b2));
      velocity += ambient * current * dt;

      velocity = clamp(velocity, vec2(-1000.0), vec2(1000.0));
      gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
  `;

  const pressureShader = `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;
    uniform float uScale;
    void main () {
      float L = texture2D(uPressure, vL).x;
      float R = texture2D(uPressure, vR).x;
      float T = texture2D(uPressure, vT).x;
      float B = texture2D(uPressure, vB).x;
      float divergence = texture2D(uDivergence, vUv).x;
      float pressure = (L + R + B + T - uScale * divergence) * 0.25;
      gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
    }
  `;

  // Two-grid correction for the pressure solve: the residual of the fine
  // Jacobi iterations is restricted to a coarse grid, solved there (where
  // low-frequency error converges quickly), and the correction is added back.
  const residualShader = `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;
    void main () {
      float L = texture2D(uPressure, vL).x;
      float R = texture2D(uPressure, vR).x;
      float T = texture2D(uPressure, vT).x;
      float B = texture2D(uPressure, vB).x;
      float C = texture2D(uPressure, vUv).x;
      float divergence = texture2D(uDivergence, vUv).x;
      float r = divergence - (L + R + B + T - 4.0 * C);
      gl_FragColor = vec4(r, 0.0, 0.0, 1.0);
    }
  `;

  const restrictShader = `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    uniform sampler2D uTexture;
    uniform vec2 uTexel;
    void main () {
      vec4 s = texture2D(uTexture, vUv + uTexel * vec2(-1.0, -1.0))
             + texture2D(uTexture, vUv + uTexel * vec2( 1.0, -1.0))
             + texture2D(uTexture, vUv + uTexel * vec2(-1.0,  1.0))
             + texture2D(uTexture, vUv + uTexel * vec2( 1.0,  1.0));
      gl_FragColor = s * 0.25;
    }
  `;

  const correctShader = `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    uniform sampler2D uPressure;
    uniform sampler2D uCorrection;
    void main () {
      gl_FragColor = vec4(texture2D(uPressure, vUv).x + texture2D(uCorrection, vUv).x, 0.0, 0.0, 1.0);
    }
  `;

  const gradientSubtractShader = `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uPressure, vL).x;
      float R = texture2D(uPressure, vR).x;
      float T = texture2D(uPressure, vT).x;
      float B = texture2D(uPressure, vB).x;
      vec2 velocity = texture2D(uVelocity, vUv).xy;
      velocity.xy -= vec2(R - L, T - B);
      gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
  `;

  const diffuseShader = `
    precision highp float;
    precision mediump sampler2D;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uDye;
    uniform float rate;
    void main () {
      vec4 c = texture2D(uDye, vUv);
      vec4 sum = texture2D(uDye, vL) + texture2D(uDye, vR) + texture2D(uDye, vT) + texture2D(uDye, vB);
      gl_FragColor = c + rate * (sum - 4.0 * c);
    }
  `;

  const bloomPrefilterShader = `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    uniform sampler2D uTexture;
    uniform float uThreshold;
    uniform float uExposure;
    vec3 tonemap (vec3 c) {
      float l = max(c.r, max(c.g, c.b));
      if (l < 1e-5) return vec3(0.0);
      return c * (1.0 - exp(-l)) / l;
    }
    void main () {
      vec4 d = texture2D(uTexture, vUv);
      vec3 c = tonemap(d.rgb * uExposure);
      float br = max(c.r, max(c.g, c.b));
      c *= smoothstep(uThreshold, uThreshold + 0.45, br);
      gl_FragColor = vec4(c, 1.0);
    }
  `;

  const blurShader = `
    precision mediump float;
    precision mediump sampler2D;
    varying highp vec2 vUv;
    uniform sampler2D uTexture;
    uniform vec2 uDir;
    void main () {
      vec3 s = texture2D(uTexture, vUv).rgb * 0.2270270270;
      s += (texture2D(uTexture, vUv + uDir * 1.3846153846).rgb + texture2D(uTexture, vUv - uDir * 1.3846153846).rgb) * 0.3162162162;
      s += (texture2D(uTexture, vUv + uDir * 3.2307692308).rgb + texture2D(uTexture, vUv - uDir * 3.2307692308).rgb) * 0.0702702703;
      gl_FragColor = vec4(s, 1.0);
    }
  `;

  // Final composite: dye -> water (luminous) or paper (pigment), then
  // vignette, aberration and grain.
  const displayShader = `
    precision highp float;
    precision mediump sampler2D;
    varying vec2 vUv;
    uniform sampler2D uDye;
    uniform sampler2D uBloom;
    uniform vec2 uRes;
    uniform float uTime;
    uniform float uMode;
    uniform float uExposure;
    uniform float uDensity;
    uniform float uBloomAmt;
    uniform float uGrain;
    uniform float uVignette;
    uniform float uAberration;
    uniform float uScatter;
    uniform float uCore;

    float hash12 (vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    float vnoise (vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
                 mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    vec3 tonemap (vec3 c) {
      float l = max(c.r, max(c.g, c.b));
      if (l < 1e-5) return vec3(0.0);
      return c * (1.0 - exp(-l)) / l;
    }

    void main () {
      vec2 uv = vUv;
      vec2 cuv = uv - 0.5;
      cuv.x *= uRes.x / uRes.y;
      float r2 = dot(cuv, cuv);

      vec2 off = (uv - 0.5) * r2 * uAberration;
      vec4 dC = texture2D(uDye, uv);
      float dR = texture2D(uDye, uv + off).r;
      float dB = texture2D(uDye, uv - off).b;
      vec4 dye = vec4(dR, dC.g, dB, dC.a);

      // ---- water: ink lit from the side, glowing against deep water ----
      float depth = smoothstep(-0.25, 1.15, uv.y);
      vec3 bgDark = mix(vec3(0.008, 0.009, 0.016), vec3(0.052, 0.058, 0.084), depth);
      float pool = 1.0 - smoothstep(0.0, 1.05, length(vec2(cuv.x * 0.8, cuv.y - 0.12)));
      bgDark += vec3(0.018, 0.021, 0.03) * pool;
      vec3 ink = tonemap(dye.rgb * uExposure);
      float thin = exp(-dye.a * uCore);           // dense ink blocks its own light
      ink *= mix(0.35, 1.0, thin);
      vec3 scatter = vec3(0.55, 0.62, 0.75) * (1.0 - exp(-dye.a * 0.6)) * uScatter * thin;
      vec3 bloom = texture2D(uBloom, uv).rgb * uBloomAmt;
      vec3 water = bgDark + ink + scatter + bloom;

      // ---- paper: pigment absorbing light (Beer–Lambert) ----
      vec2 px = uv * uRes;
      float fiber = vnoise(px * 0.55) * 0.55 + vnoise(px * 0.13) * 0.3 + vnoise(px * 0.035) * 0.15;
      vec3 paper = vec3(0.962, 0.947, 0.915);
      paper *= 1.0 + (fiber - 0.5) * 0.075 + (hash12(px) - 0.5) * 0.02;
      vec3 absorb = max(vec3(dye.a) - dye.rgb, 0.0);
      vec3 paperInk = paper * exp(-absorb * uDensity);

      vec3 col = mix(water, paperInk, uMode);

      float vig = 1.0 - uVignette * smoothstep(0.12, 1.7, r2);
      col *= mix(vig, mix(1.0, vig, 0.5), uMode);

      float g = hash12(px + fract(uTime * 0.73) * 1234.5) - 0.5;
      col += g * uGrain * mix(1.0, 0.65, uMode);

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  // ----------------------------------------------------------------
  // GL helpers
  // ----------------------------------------------------------------
  function compileShader(type, source, keywords) {
    if (keywords && keywords.length) source = keywords.map(k => '#define ' + k + '\n').join('') + source;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(shader));
    return shader;
  }

  class Program {
    constructor(vertexShader, fragmentShader) {
      this.program = gl.createProgram();
      gl.attachShader(this.program, vertexShader);
      gl.attachShader(this.program, fragmentShader);
      gl.bindAttribLocation(this.program, 0, 'aPosition');
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(this.program));
      this.uniforms = {};
      const count = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const name = gl.getActiveUniform(this.program, i).name;
        this.uniforms[name] = gl.getUniformLocation(this.program, name);
      }
    }
    bind() { gl.useProgram(this.program); }
  }

  const vs = compileShader(gl.VERTEX_SHADER, baseVertexShader);
  const fsKeywords = ext.supportLinearFiltering ? [] : ['MANUAL_FILTERING'];
  const programs = {
    copy:        new Program(vs, compileShader(gl.FRAGMENT_SHADER, copyShader)),
    splat:       new Program(vs, compileShader(gl.FRAGMENT_SHADER, splatShader)),
    advection:   new Program(vs, compileShader(gl.FRAGMENT_SHADER, advectionShader, fsKeywords)),
    macCormack:  new Program(vs, compileShader(gl.FRAGMENT_SHADER, macCormackShader)),
    divergence:  new Program(vs, compileShader(gl.FRAGMENT_SHADER, divergenceShader)),
    curl:        new Program(vs, compileShader(gl.FRAGMENT_SHADER, curlShader)),
    forces:      new Program(vs, compileShader(gl.FRAGMENT_SHADER, forcesShader)),
    pressure:    new Program(vs, compileShader(gl.FRAGMENT_SHADER, pressureShader)),
    residual:    new Program(vs, compileShader(gl.FRAGMENT_SHADER, residualShader)),
    restrict:    new Program(vs, compileShader(gl.FRAGMENT_SHADER, restrictShader)),
    correct:     new Program(vs, compileShader(gl.FRAGMENT_SHADER, correctShader)),
    gradient:    new Program(vs, compileShader(gl.FRAGMENT_SHADER, gradientSubtractShader)),
    diffuse:     new Program(vs, compileShader(gl.FRAGMENT_SHADER, diffuseShader)),
    prefilter:   new Program(vs, compileShader(gl.FRAGMENT_SHADER, bloomPrefilterShader)),
    blur:        new Program(vs, compileShader(gl.FRAGMENT_SHADER, blurShader)),
    display:     new Program(vs, compileShader(gl.FRAGMENT_SHADER, displayShader)),
  };

  // Fullscreen quad
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  function blit(target) {
    if (target == null) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  function createFBO(w, h, internalFormat, format, type, filter) {
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return {
      texture, fbo, width: w, height: h,
      texelSizeX: 1 / w, texelSizeY: 1 / h,
      attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, texture); return id; },
      dispose() { gl.deleteTexture(texture); gl.deleteFramebuffer(fbo); },
    };
  }

  function createDoubleFBO(w, h, internalFormat, format, type, filter) {
    let fbo1 = createFBO(w, h, internalFormat, format, type, filter);
    let fbo2 = createFBO(w, h, internalFormat, format, type, filter);
    return {
      width: w, height: h, texelSizeX: 1 / w, texelSizeY: 1 / h,
      get read() { return fbo1; }, set read(v) { fbo1 = v; },
      get write() { return fbo2; }, set write(v) { fbo2 = v; },
      swap() { const t = fbo1; fbo1 = fbo2; fbo2 = t; },
      dispose() { fbo1.dispose(); fbo2.dispose(); },
    };
  }

  function resizeFBO(target, w, h, internalFormat, format, type, filter) {
    const next = createFBO(w, h, internalFormat, format, type, filter);
    programs.copy.bind();
    gl.uniform1i(programs.copy.uniforms.uTexture, target.attach(0));
    gl.uniform1f(programs.copy.uniforms.uScale, 1);
    blit(next);
    target.dispose();
    return next;
  }

  function resizeDoubleFBO(target, w, h, internalFormat, format, type, filter) {
    if (target.width === w && target.height === h) return target;
    target.read = resizeFBO(target.read, w, h, internalFormat, format, type, filter);
    target.write.dispose();
    target.write = createFBO(w, h, internalFormat, format, type, filter);
    target.width = w; target.height = h;
    target.texelSizeX = 1 / w; target.texelSizeY = 1 / h;
    return target;
  }

  // ----------------------------------------------------------------
  // Framebuffers
  // ----------------------------------------------------------------
  let dye, velocity, divergence, curl, pressure, residual, residualCoarse, pressureCoarse, dyeTmpA, dyeTmpB, bloomA, bloomB;

  function getResolution(resolution) {
    let aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspect < 1) aspect = 1 / aspect;
    const min = Math.round(resolution);
    const max = Math.round(resolution * aspect);
    return gl.drawingBufferWidth > gl.drawingBufferHeight ? { width: max, height: min } : { width: min, height: max };
  }

  function initFramebuffers() {
    const q = QUALITY[config.quality];
    const simRes = getResolution(q.simRes);
    const dyeRes = getResolution(q.dyeRes);
    const type = ext.halfFloatTexType;
    const rgba = ext.formatRGBA, rg = ext.formatRG, r = ext.formatR;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    gl.disable(gl.BLEND);

    dye = dye ? resizeDoubleFBO(dye, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, type, filtering)
              : createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, type, filtering);
    velocity = velocity ? resizeDoubleFBO(velocity, simRes.width, simRes.height, rg.internalFormat, rg.format, type, filtering)
                        : createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, type, filtering);

    if (divergence) divergence.dispose();
    if (curl) curl.dispose();
    if (pressure) pressure.dispose();
    if (residual) residual.dispose();
    if (residualCoarse) residualCoarse.dispose();
    if (pressureCoarse) pressureCoarse.dispose();
    if (dyeTmpA) dyeTmpA.dispose();
    if (dyeTmpB) dyeTmpB.dispose();
    if (bloomA) bloomA.dispose();
    if (bloomB) bloomB.dispose();

    divergence = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, type, gl.NEAREST);
    curl = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, type, gl.NEAREST);
    pressure = createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, type, gl.NEAREST);
    const cw = Math.max(4, Math.round(simRes.width / 4)), ch = Math.max(4, Math.round(simRes.height / 4));
    residual = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, type, filtering);
    residualCoarse = createFBO(cw, ch, r.internalFormat, r.format, type, gl.NEAREST);
    pressureCoarse = createDoubleFBO(cw, ch, r.internalFormat, r.format, type, filtering);
    dyeTmpA = createFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, type, filtering);
    dyeTmpB = createFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, type, filtering);
    const bw = Math.max(2, dyeRes.width >> 2), bh = Math.max(2, dyeRes.height >> 2);
    bloomA = createFBO(bw, bh, rgba.internalFormat, rgba.format, type, filtering);
    bloomB = createFBO(bw, bh, rgba.internalFormat, rgba.format, type, filtering);
  }

  // ----------------------------------------------------------------
  // State
  // ----------------------------------------------------------------
  const state = {
    time: 0,
    lastFrame: performance.now(),
    paused: false,
    clearing: 0,               // seconds of accelerated dissolve remaining
    mode: { value: 0, target: 0, from: 0, t: 1, dur: 1.4 },
    paletteIndex: 0,
    selectedInk: -1,           // -1 = auto
    introDone: false,
    lastInteraction: -10,
    lastActivity: performance.now(),
    nextAutoDrop: 7,
    wantCapture: false,
    panelOpen: false,
    modalOpen: false,
    lastInkIndex: -1,
    hintDismissed: false,
    overUI: false,
    lastDropX: 0.5,
    rain: { active: false, start: 0, duration: 0, endedAt: -1e9, nextAt: RAIN_AFTER, acc: 0, peak: 5, color: null, color2: null },
  };
  const drops = [];
  const pointers = new Map();

  const aspect = () => canvas.width / canvas.height;
  const clamp01 = v => Math.min(1, Math.max(0, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const cssColor = c => `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
  const palette = () => PALETTES[state.paletteIndex];
  const inkColor = ink => state.mode.target > 0.5 ? ink.paper : ink.water;

  function dropRadius() {
    const s = config.dropSize;
    return 0.0005 + s * s * 0.009;
  }
  function correctRadius(radius) {
    const a = aspect();
    return a > 1 ? radius * a : radius;
  }

  function pickInk() {
    const inks = palette().inks;
    if (state.selectedInk >= 0 && state.selectedInk < inks.length) return inks[state.selectedInk];
    let i;
    do { i = Math.floor(Math.random() * inks.length); } while (inks.length > 1 && i === state.lastInkIndex);
    state.lastInkIndex = i;
    return inks[i];
  }

  // ----------------------------------------------------------------
  // Splats & drops
  // ----------------------------------------------------------------
  function splat(x, y, dx, dy, color, amount, radius, wobble, seed, velRadiusScale) {
    const p = programs.splat;
    p.bind();
    gl.uniform1f(p.uniforms.aspectRatio, aspect());
    gl.uniform2f(p.uniforms.point, x, y);
    gl.uniform1f(p.uniforms.seed, seed || 0);

    if (dx !== 0 || dy !== 0) {
      gl.uniform1i(p.uniforms.uTarget, velocity.read.attach(0));
      gl.uniform4f(p.uniforms.color, dx, dy, 0, 0);
      gl.uniform1f(p.uniforms.radius, correctRadius(radius * (velRadiusScale || 1)));
      gl.uniform1f(p.uniforms.wobble, 0);
      blit(velocity.write);
      velocity.swap();
    }
    if (amount > 0 && color) {
      gl.uniform1i(p.uniforms.uTarget, dye.read.attach(0));
      gl.uniform4f(p.uniforms.color, color[0] * amount, color[1] * amount, color[2] * amount, amount);
      gl.uniform1f(p.uniforms.radius, correctRadius(radius));
      gl.uniform1f(p.uniforms.wobble, wobble || 0);
      blit(dye.write);
      dye.swap();
    }
  }

  // A drop is a short-lived emitter: ink keeps flowing in for a moment,
  // while the initial impulse pushes the water into a vortex pair.
  // A drop is a short-lived emitter. A clicked drop starts as a small core
  // and opens into a soft cloud. A drop that fell in ("compact") behaves like
  // the droplet itself: it keeps plunging with its momentum while drag slows
  // it, shedding dense ink along the way; its wake then blooms on its own.
  function addDrop(x, y, color, o) {
    o = o || {};
    const size = o.size || 1;
    const full = dropRadius() * size * (0.85 + Math.random() * 0.3);
    const compact = !!o.compact;
    drops.push({
      x, y, color,
      life: 0,
      duration: o.duration || (compact ? 0.55 + Math.random() * 0.2 : 0.45 + Math.random() * 0.25),
      amount: (o.amount || (compact ? 2.6 : 1.6)) * (0.85 + Math.random() * 0.4),
      r0: compact ? Math.min(full, 0.00022) : full * 0.3,
      r1: compact ? Math.max(0.0006, full * 0.45) : full,
      pvx: o.pvx || 0,
      pvy: o.pvy !== undefined ? o.pvy : (compact ? -(0.26 + Math.random() * 0.1) : 0),
      drag: o.drag || 4.5,
      vx: o.vx !== undefined ? o.vx : (Math.random() - 0.5) * (compact ? 30 : 70),
      vy: o.vy !== undefined ? o.vy : (compact ? -(90 + Math.random() * 50) : -(55 + Math.random() * 75)),
      seed: Math.random() * 6.283,
      wobble: 0.22 + Math.random() * 0.3,
    });
  }

  function applyDrops(dt) {
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      const t0 = Math.min(d.life / d.duration, 1);
      d.life += dt;
      const t1 = Math.min(d.life / d.duration, 1);
      if (t0 >= 1) { drops.splice(i, 1); continue; }
      // dye: bell-shaped flow that integrates to 1
      const dyeW = (Math.cos(Math.PI * t0) - Math.cos(Math.PI * t1)) * 0.5;
      // velocity: front-loaded impulse that integrates to 1
      const velW = (t1 - t0) * (2 - (t0 + t1));
      // the droplet keeps moving through the water, slowed by drag
      d.x += d.pvx * dt;
      d.y += d.pvy * dt;
      const k = Math.exp(-d.drag * dt);
      d.pvx *= k; d.pvy *= k;
      const s = t1 * t1 * (3 - 2 * t1);               // growth of the core
      const r = lerp(d.r0, d.r1, s);
      const dense = Math.min(6, d.r1 / r);             // same total ink, packed tighter early on
      const velScale = Math.max(1.5, (d.r1 * 1.2) / r);
      splat(d.x, d.y, d.vx * velW, d.vy * velW, d.color, d.amount * dyeW * dense, r, d.wobble * s, d.seed + t1 * 0.6, velScale);
    }
  }

  function applyPointers(dt) {
    const a = aspect();
    for (const p of pointers.values()) {
      if (!p.moved) continue;
      p.moved = false;
      const dx = p.x - p.ax, dy = p.y - p.ay;
      const dist = Math.hypot(dx * a, dy);
      if (p.down) {
        const radius = dropRadius() * 0.45;
        const sig = Math.sqrt(radius);
        const n = Math.min(24, Math.max(1, Math.ceil(dist / (sig * 0.7))));
        const fx = dx * STROKE_FORCE, fy = dy * STROKE_FORCE;
        const amt = p.stirOnly ? 0 : TRAIL_AMOUNT * Math.min(1, dist / (sig * 0.7));
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          splat(p.ax + dx * t, p.ay + dy * t, fx, fy, p.color, amt, radius, 0.15, p.seed + t, 2.4);
        }
      } else if (config.hoverStir && p.type === 'mouse') {
        splat(p.x, p.y, dx * HOVER_FORCE, dy * HOVER_FORCE, null, 0, dropRadius() * 1.2, 0, 0, 1);
      }
      p.ax = p.x; p.ay = p.y;
    }
  }

  // A drop seen falling from the top of the page before it meets the water.
  function drip(x, y, color, options, onLand) {
    options = Object.assign({ compact: true }, options || {});
    let landed = false;
    let el = null;
    const rect = canvas.getBoundingClientRect();
    const px = rect.left + x * rect.width;
    const py = rect.top + (1 - y) * rect.height;
    const size = 6 + Math.min(1.6, options.size || 1) * 5;
    const land = () => {
      if (landed) return;
      landed = true;
      addDrop(x, y, color, options);
      if (el) ripple(px, py + size / 2, true);
      if (onLand) onLand();
    };
    if (reducedMotion) { land(); return; }
    const fall = (0.55 + py / 720) * (options.fall || 1);   // seconds until it meets the water
    el = document.createElement('span');
    el.className = 'drip';
    el.style.left = (px - size / 2) + 'px';
    el.style.width = size + 'px';
    el.style.height = size + 'px';
    el.style.setProperty('--c', cssColor(color));
    el.style.setProperty('--y', py.toFixed(1) + 'px');
    el.style.setProperty('--d', fall.toFixed(2) + 's');
    body.appendChild(el);
    const impact = setTimeout(land, fall * 1000);
    const remove = () => { clearTimeout(impact); land(); if (el) { el.remove(); el = null; } };
    el.addEventListener('animationend', e => { if (e.animationName === 'drip-enter') remove(); });
    setTimeout(remove, fall * 1000 + 1500);
  }

  function neighbourInk(ink) {
    const inks = palette().inks;
    const i = inks.indexOf(ink);
    if (i < 0 || inks.length < 2) return pickInk();
    return inks[(i + (Math.random() < 0.5 ? 1 : inks.length - 1)) % inks.length];
  }

  function landingX() {
    let x;
    do { x = 0.15 + Math.random() * 0.7; } while (Math.abs(x - state.lastDropX) < 0.18);
    state.lastDropX = x;
    return x;
  }

  function autoDrops() {
    if (!config.autoDrops || !state.introDone || state.rain.active) return;
    const t = state.time;
    if (t < state.nextAutoDrop) return;
    if (t - state.lastInteraction < 4) { state.nextAutoDrop = t + 2 + Math.random() * 2; return; }

    const x = landingX();
    const y = 0.48 + Math.random() * 0.4;
    const kind = Math.random();
    if (kind < 0.5) {
      // a single drop
      drip(x, y, inkColor(pickInk()), { size: 0.7 + Math.random() * 0.8 });
      state.nextAutoDrop = t + 5 + Math.random() * 6;
    } else if (kind < 0.82) {
      // a pair of related inks, the second a moment later
      const ink = pickInk();
      drip(x, y, inkColor(ink), { size: 0.8 + Math.random() * 0.5 });
      const ink2 = neighbourInk(ink);
      setTimeout(() => {
        if (!state.paused && config.autoDrops) drip(x + (Math.random() - 0.5) * 0.14, y + (Math.random() - 0.5) * 0.1, inkColor(ink2), { size: 0.5 + Math.random() * 0.4 });
      }, 500 + Math.random() * 700);
      state.nextAutoDrop = t + 7 + Math.random() * 6;
    } else {
      // a run of small drips in a row
      const color = inkColor(pickInk());
      const n = 3 + Math.floor(Math.random() * 2);
      const drift = (Math.random() - 0.5) * 0.22;
      for (let i = 0; i < n; i++) {
        setTimeout(() => {
          if (!state.paused && config.autoDrops) drip(x + drift * i / n, y - i * 0.025, color, { size: 0.35 + Math.random() * 0.25, amount: 1.2 });
        }, i * 330);
      }
      state.nextAutoDrop = t + 8 + Math.random() * 6;
    }
  }

  // ----------------------------------------------------------------
  // Rain. Left alone long enough, the water is visited by a shower: it
  // builds over a few seconds, holds, then eases off; a touch ends it.
  // ----------------------------------------------------------------
  const smooth = v => { v = clamp01(v); return v * v * (3 - 2 * v); };

  function startRain(duration) {
    const r = state.rain;
    const ink = pickInk();
    r.active = true;
    r.start = state.time;
    r.duration = duration || (26 + Math.random() * 20);
    r.acc = 0;
    r.peak = 3.5 + Math.random() * 1.8;              // drops per second at full strength
    r.color = inkColor(ink);
    r.color2 = inkColor(neighbourInk(ink));
  }

  function rain(dt) {
    const r = state.rain;
    if (!r.active) {
      const quiet = state.time - state.lastInteraction;
      if (config.rain && config.autoDrops && state.introDone && state.time >= r.nextAt && quiet > RAIN_AFTER) startRain();
      return;
    }
    const t = state.time - r.start;
    if (state.lastInteraction > r.start && r.duration > t + 1.5) r.duration = t + 1.5;   // someone touched the water
    if (t >= r.duration) {
      r.active = false;
      r.endedAt = state.time;
      r.nextAt = state.time + 90 + Math.random() * 60;
      state.nextAutoDrop = state.time + 6 + Math.random() * 4;
      return;
    }
    const env = smooth(t / 6) * (1 - smooth((t - (r.duration - 8)) / 8));
    r.acc += r.peak * env * dt;
    while (r.acc >= 1) {
      r.acc -= 1;
      const x = 0.04 + Math.random() * 0.92;
      const y = 0.58 + Math.pow(Math.random(), 0.7) * 0.36;
      const color = Math.random() < 0.85 ? r.color : r.color2;
      drip(x, y, color, {
        size: 0.28 + Math.random() * 0.28,
        amount: 0.7 + Math.random() * 0.3,
        fall: 0.75,
        pvy: -(0.18 + Math.random() * 0.1),
        vy: -(60 + Math.random() * 40),
      });
    }
  }

  // ----------------------------------------------------------------
  // Simulation step
  // ----------------------------------------------------------------
  function step(dt) {
    gl.disable(gl.BLEND);
    const simTexel = [velocity.texelSizeX, velocity.texelSizeY];
    const dyeTexel = [dye.texelSizeX, dye.texelSizeY];
    const clearBoost = state.clearing > 0 ? 45 : 0;
    // rain fades the water a little faster, and it keeps clearing for a while afterwards
    const rainFade = state.rain.active ? 0.06 : 0.06 * clamp01(1 - (state.time - state.rain.endedAt) / 25);
    let p;

    p = programs.curl; p.bind();
    gl.uniform2f(p.uniforms.texelSize, simTexel[0], simTexel[1]);
    gl.uniform1i(p.uniforms.uVelocity, velocity.read.attach(0));
    blit(curl);

    p = programs.forces; p.bind();
    gl.uniform2f(p.uniforms.texelSize, simTexel[0], simTexel[1]);
    gl.uniform1i(p.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(p.uniforms.uCurl, curl.attach(1));
    gl.uniform1i(p.uniforms.uDye, dye.read.attach(2));
    gl.uniform1f(p.uniforms.curl, config.curl);
    gl.uniform1f(p.uniforms.dt, dt);
    gl.uniform1f(p.uniforms.gravity, config.gravity);
    gl.uniform1f(p.uniforms.ambient, config.ambient * 2.5);
    gl.uniform1f(p.uniforms.time, state.time);
    blit(velocity.write);
    velocity.swap();

    p = programs.divergence; p.bind();
    gl.uniform2f(p.uniforms.texelSize, simTexel[0], simTexel[1]);
    gl.uniform1i(p.uniforms.uVelocity, velocity.read.attach(0));
    blit(divergence);

    p = programs.copy; p.bind();
    gl.uniform1i(p.uniforms.uTexture, pressure.read.attach(0));
    gl.uniform1f(p.uniforms.uScale, 0.8);
    blit(pressure.write);
    pressure.swap();

    solvePressure(simTexel);

    p = programs.gradient; p.bind();
    gl.uniform2f(p.uniforms.texelSize, simTexel[0], simTexel[1]);
    gl.uniform1i(p.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(p.uniforms.uVelocity, velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();

    p = programs.advection; p.bind();
    gl.uniform2f(p.uniforms.texelSize, simTexel[0], simTexel[1]);
    gl.uniform2f(p.uniforms.dyeTexelSize, simTexel[0], simTexel[1]);
    gl.uniform1i(p.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(p.uniforms.uSource, velocity.read.attach(0));
    gl.uniform1f(p.uniforms.dt, dt);
    gl.uniform1f(p.uniforms.dissipation, config.viscosity + clearBoost * 0.5);
    gl.uniform1f(p.uniforms.thinFade, 0);
    blit(velocity.write);
    velocity.swap();

    if (config.sharp) {
      gl.uniform2f(p.uniforms.dyeTexelSize, dyeTexel[0], dyeTexel[1]);
      gl.uniform1i(p.uniforms.uVelocity, velocity.read.attach(0));
      gl.uniform1i(p.uniforms.uSource, dye.read.attach(1));
      gl.uniform1f(p.uniforms.dissipation, 0);
      gl.uniform1f(p.uniforms.dt, dt);
      blit(dyeTmpA);
      gl.uniform1i(p.uniforms.uSource, dyeTmpA.attach(1));
      gl.uniform1f(p.uniforms.dt, -dt);
      blit(dyeTmpB);

      p = programs.macCormack; p.bind();
      gl.uniform2f(p.uniforms.texelSize, simTexel[0], simTexel[1]);
      gl.uniform2f(p.uniforms.dyeTexelSize, dyeTexel[0], dyeTexel[1]);
      gl.uniform1i(p.uniforms.uVelocity, velocity.read.attach(0));
      gl.uniform1i(p.uniforms.uSource, dye.read.attach(1));
      gl.uniform1i(p.uniforms.uForward, dyeTmpA.attach(2));
      gl.uniform1i(p.uniforms.uBack, dyeTmpB.attach(3));
      gl.uniform1f(p.uniforms.dt, dt);
      gl.uniform1f(p.uniforms.dissipation, config.dyeFade + clearBoost + rainFade);
      gl.uniform1f(p.uniforms.thinFade, config.clarity);
      blit(dye.write);
      dye.swap();
    } else {
      gl.uniform2f(p.uniforms.dyeTexelSize, dyeTexel[0], dyeTexel[1]);
      gl.uniform1i(p.uniforms.uVelocity, velocity.read.attach(0));
      gl.uniform1i(p.uniforms.uSource, dye.read.attach(1));
      gl.uniform1f(p.uniforms.dissipation, config.dyeFade + clearBoost + rainFade);
      gl.uniform1f(p.uniforms.thinFade, config.clarity);
      blit(dye.write);
      dye.swap();
    }

    if (config.diffusion > 0) {
      const total = config.diffusion * 0.6;          // Laplacian coefficient per frame
      const passes = Math.ceil(total / 0.2);          // keep each pass well inside stability
      const rate = total / passes;
      p = programs.diffuse; p.bind();
      gl.uniform2f(p.uniforms.texelSize, dyeTexel[0], dyeTexel[1]);
      gl.uniform1f(p.uniforms.rate, rate);
      for (let i = 0; i < passes; i++) {
        gl.uniform1i(p.uniforms.uDye, dye.read.attach(0));
        blit(dye.write);
        dye.swap();
      }
    }
  }

  function jacobi(target, source, texel, scale, iterations) {
    const p = programs.pressure; p.bind();
    gl.uniform2f(p.uniforms.texelSize, texel[0], texel[1]);
    gl.uniform1i(p.uniforms.uDivergence, source.attach(0));
    gl.uniform1f(p.uniforms.uScale, scale);
    for (let i = 0; i < iterations; i++) {
      gl.uniform1i(p.uniforms.uPressure, target.read.attach(1));
      blit(target.write);
      target.swap();
    }
  }

  function solvePressure(simTexel) {
    const q = QUALITY[config.quality];
    const fine = Math.max(2, q.pressureIterations >> 1);
    let p;

    // fine smoothing
    jacobi(pressure, divergence, simTexel, 1, fine);

    // residual -> coarse grid
    p = programs.residual; p.bind();
    gl.uniform2f(p.uniforms.texelSize, simTexel[0], simTexel[1]);
    gl.uniform1i(p.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(p.uniforms.uDivergence, divergence.attach(1));
    blit(residual);

    p = programs.restrict; p.bind();
    gl.uniform1i(p.uniforms.uTexture, residual.attach(0));
    gl.uniform2f(p.uniforms.uTexel, residual.texelSizeX, residual.texelSizeY);
    blit(residualCoarse);

    // coarse solve of the error (grid spacing is 4x, so the source scales by 16)
    p = programs.copy; p.bind();
    gl.uniform1i(p.uniforms.uTexture, pressureCoarse.read.attach(0));
    gl.uniform1f(p.uniforms.uScale, 0);
    blit(pressureCoarse.write);
    pressureCoarse.swap();
    jacobi(pressureCoarse, residualCoarse, [pressureCoarse.texelSizeX, pressureCoarse.texelSizeY], 16, q.coarseIterations);

    // prolongate and add the correction
    p = programs.correct; p.bind();
    gl.uniform1i(p.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(p.uniforms.uCorrection, pressureCoarse.read.attach(1));
    blit(pressure.write);
    pressure.swap();

    // fine smoothing again
    jacobi(pressure, divergence, simTexel, 1, q.pressureIterations - fine);
  }

  // ----------------------------------------------------------------
  // Rendering
  // ----------------------------------------------------------------
  const EXPOSURE = 1.5;

  function applyBloom() {
    let p = programs.prefilter; p.bind();
    gl.uniform1i(p.uniforms.uTexture, dye.read.attach(0));
    gl.uniform1f(p.uniforms.uThreshold, 0.28);
    gl.uniform1f(p.uniforms.uExposure, EXPOSURE);
    blit(bloomA);

    p = programs.blur; p.bind();
    let src = bloomA, dst = bloomB;
    const passes = [[1, 0], [0, 1], [2.4, 0], [0, 2.4]];
    for (const [dx, dy] of passes) {
      gl.uniform1i(p.uniforms.uTexture, src.attach(0));
      gl.uniform2f(p.uniforms.uDir, dx * src.texelSizeX, dy * src.texelSizeY);
      blit(dst);
      const t = src; src = dst; dst = t;
    }
    // four passes: result lands back in bloomA
  }

  function render() {
    const m = state.mode.value;
    const useBloom = config.bloom && m < 0.995;
    gl.disable(gl.BLEND);
    if (useBloom) applyBloom();

    const p = programs.display; p.bind();
    gl.uniform1i(p.uniforms.uDye, dye.read.attach(0));
    gl.uniform1i(p.uniforms.uBloom, bloomA.attach(1));
    gl.uniform2f(p.uniforms.uRes, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(p.uniforms.uTime, state.time);
    gl.uniform1f(p.uniforms.uMode, m);
    gl.uniform1f(p.uniforms.uExposure, EXPOSURE);
    gl.uniform1f(p.uniforms.uDensity, 2.6);
    gl.uniform1f(p.uniforms.uBloomAmt, useBloom ? 0.35 * (1 - m) : 0);
    gl.uniform1f(p.uniforms.uGrain, config.grain ? 0.05 : 0);
    gl.uniform1f(p.uniforms.uVignette, 0.55);
    gl.uniform1f(p.uniforms.uAberration, 0.006 * (1 - m));
    gl.uniform1f(p.uniforms.uScatter, 0.07);
    gl.uniform1f(p.uniforms.uCore, 0.2);
    blit(null);
  }

  // ----------------------------------------------------------------
  // Main loop
  // ----------------------------------------------------------------
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      return true;
    }
    return false;
  }

  function frame() {
    const now = performance.now();
    let dt = (now - state.lastFrame) / 1000;
    state.lastFrame = now;
    dt = Math.min(Math.max(dt, 0), 1 / 30);

    if (resizeCanvas()) initFramebuffers();
    updateMode(dt);
    updateCursor();
    updateIdle(now);

    if (!state.paused) {
      simulate(dt);
    } else {
      // still let the pointer stir a little while paused, for feel
      for (const p of pointers.values()) { p.moved = false; p.ax = p.x; p.ay = p.y; }
    }
    render();

    if (state.wantCapture) {
      state.wantCapture = false;
      captureFrame();
    }
    requestAnimationFrame(frame);
  }

  function simulate(dt) {
    state.time += dt;
    if (state.clearing > 0) state.clearing -= dt;
    applyDrops(dt);
    applyPointers(dt);
    autoDrops();
    rain(dt);
    step(dt);
  }

  function updateMode(dt) {
    const mo = state.mode;
    if (mo.t < 1) {
      mo.t = Math.min(1, mo.t + dt / mo.dur);
      mo.value = lerp(mo.from, mo.target, easeInOut(mo.t));
    }
  }

  function captureFrame() {
    try {
      canvas.toBlob(blob => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'ink-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.png';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      }, 'image/png');
    } catch (e) { console.warn(e); }
  }

  // ----------------------------------------------------------------
  // Actions
  // ----------------------------------------------------------------
  function clearInk() {
    state.clearing = 1.1;
    drops.length = 0;
  }

  function setMode(target) {
    const mo = state.mode;
    if (mo.target === target) return;
    mo.from = mo.value; mo.target = target; mo.t = 0;
    body.dataset.mode = target > 0.5 ? 'paper' : 'water';
    els.mode.setAttribute('aria-pressed', target > 0.5 ? 'true' : 'false');
    updateAccent();
  }
  const toggleMode = () => setMode(state.mode.target > 0.5 ? 0 : 1);

  function togglePause() {
    state.paused = !state.paused;
    body.classList.toggle('paused', state.paused);
    state.lastFrame = performance.now();
  }

  function setQuality(q) {
    if (!QUALITY[q] || q === config.quality) return;
    config.quality = q;
    if (q === 'low') { config.sharp = false; config.bloom = false; }
    if (q === 'high') { config.sharp = true; config.bloom = true; }
    initFramebuffers();
    syncPanel();
  }

  function setPalette(index, animate) {
    state.paletteIndex = (index + PALETTES.length) % PALETTES.length;
    state.selectedInk = -1;
    state.lastInkIndex = -1;
    if (animate) {
      els.moodName.classList.add('swap');
      setTimeout(() => { els.moodName.textContent = palette().name; els.moodName.classList.remove('swap'); }, 320);
    } else {
      els.moodName.textContent = palette().name;
    }
    buildSwatches();
    updateAccent();
  }

  function selectInk(i) {
    state.selectedInk = i;
    for (const s of els.swatches.children) s.classList.toggle('selected', Number(s.dataset.index) === i);
    updateAccent();
  }

  function updateAccent() {
    const inks = palette().inks;
    const ink = state.selectedInk >= 0 ? inks[state.selectedInk] : inks[0];
    body.style.setProperty('--accent', cssColor(inkColor(ink)));
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen || function () {}).call(document.documentElement);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
    }
  }

  function openPanel(open) {
    state.panelOpen = open;
    els.panel.classList.toggle('open', open);
    els.panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    els.settings.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function openModal(open) {
    state.modalOpen = open;
    els.modal.classList.toggle('open', open);
    els.modal.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function ripple(px, py, small) {
    const r = document.createElement('span');
    r.className = small ? 'ripple small' : 'ripple';
    r.style.left = px + 'px';
    r.style.top = py + 'px';
    body.appendChild(r);
    r.addEventListener('animationend', () => r.remove());
    setTimeout(() => { if (r.parentNode) r.remove(); }, 1200);
  }

  function dismissHint() {
    if (state.hintDismissed) return;
    state.hintDismissed = true;
    els.hint.classList.remove('show');
  }

  // ----------------------------------------------------------------
  // UI: swatches
  // ----------------------------------------------------------------
  function buildSwatches() {
    const inks = palette().inks;
    els.swatches.innerHTML = '';
    const stops = list => list.map(cssColor).concat(cssColor(list[0])).join(', ');

    const auto = document.createElement('button');
    auto.className = 'swatch auto' + (state.selectedInk === -1 ? ' selected' : '');
    auto.dataset.index = -1;
    auto.style.setProperty('--i', 0);
    auto.style.setProperty('--gw', stops(inks.map(k => k.water)));
    auto.style.setProperty('--gp', stops(inks.map(k => k.paper)));
    auto.innerHTML = '<span class="swatch-fill"></span><span class="swatch-name">Any ink</span>';
    auto.title = 'A different ink each drop';
    auto.addEventListener('click', () => selectInk(-1));
    els.swatches.appendChild(auto);

    inks.forEach((ink, i) => {
      const b = document.createElement('button');
      b.className = 'swatch' + (state.selectedInk === i ? ' selected' : '');
      b.dataset.index = i;
      b.style.setProperty('--i', i + 1);
      b.style.setProperty('--cw', cssColor(ink.water));
      b.style.setProperty('--cp', cssColor(ink.paper));
      b.innerHTML = '<span class="swatch-fill"></span><span class="swatch-name">' + ink.name + '</span>';
      b.title = ink.name;
      b.addEventListener('click', () => selectInk(i));
      els.swatches.appendChild(b);
    });
  }

  // ----------------------------------------------------------------
  // UI: settings panel
  // ----------------------------------------------------------------
  const panelSync = [];

  function buildPanel() {
    els.panelBody.innerHTML = '';
    panelSync.length = 0;

    for (const s of SLIDERS) {
      const wrap = document.createElement('div');
      wrap.className = 'ctl';
      wrap.innerHTML = '<div class="ctl-row"><span class="ctl-label">' + s.label + '</span><span class="ctl-value"></span></div>';
      const input = document.createElement('input');
      input.type = 'range'; input.min = s.min; input.max = s.max; input.step = s.step;
      input.setAttribute('aria-label', s.label);
      const val = wrap.querySelector('.ctl-value');
      const refresh = () => {
        input.value = config[s.key];
        val.textContent = s.fmt(config[s.key]);
        input.style.setProperty('--p', ((config[s.key] - s.min) / (s.max - s.min) * 100).toFixed(1) + '%');
      };
      input.addEventListener('input', () => { config[s.key] = parseFloat(input.value); refresh(); });
      panelSync.push(refresh);
      refresh();
      wrap.appendChild(input);
      els.panelBody.appendChild(wrap);
    }

    const toggles = document.createElement('div');
    toggles.className = 'ctl ctl-toggles';
    for (const t of TOGGLES) {
      const b = document.createElement('button');
      b.className = 'toggle';
      b.innerHTML = '<span>' + t.label + '</span><span class="toggle-sw"></span>';
      const refresh = () => b.classList.toggle('on', !!config[t.key]);
      b.addEventListener('click', () => { config[t.key] = !config[t.key]; refresh(); });
      panelSync.push(refresh);
      refresh();
      toggles.appendChild(b);
    }
    els.panelBody.appendChild(toggles);

    const q = document.createElement('div');
    q.className = 'ctl';
    q.innerHTML = '<div class="ctl-row"><span class="ctl-label">Quality</span></div>';
    const seg = document.createElement('div');
    seg.className = 'segmented';
    for (const k of ['low', 'medium', 'high']) {
      const b = document.createElement('button');
      b.className = 'seg';
      b.textContent = k;
      const refresh = () => b.classList.toggle('on', config.quality === k);
      b.addEventListener('click', () => setQuality(k));
      panelSync.push(refresh);
      refresh();
      seg.appendChild(b);
    }
    q.appendChild(seg);
    els.panelBody.appendChild(q);
  }

  function syncPanel() { for (const f of panelSync) f(); }

  function resetDefaults() {
    const quality = config.quality;
    Object.assign(config, DEFAULTS);
    config.quality = quality;
    if (quality === 'low') { config.sharp = false; config.bloom = false; }
    syncPanel();
  }

  // ----------------------------------------------------------------
  // UI: pointer input
  // ----------------------------------------------------------------
  function uvFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    return [clamp01((e.clientX - rect.left) / rect.width), 1 - clamp01((e.clientY - rect.top) / rect.height)];
  }

  canvas.addEventListener('contextmenu', e => e.preventDefault());

  canvas.addEventListener('pointerdown', e => {
    if (state.modalOpen) return;
    const [x, y] = uvFromEvent(e);
    const stirOnly = e.shiftKey || e.button === 2;
    const ink = pickInk();
    const color = inkColor(ink);
    pointers.set(e.pointerId, { x, y, ax: x, ay: y, down: true, stirOnly, color, moved: false, type: e.pointerType, seed: Math.random() * 6.283 });
    if (!stirOnly) {
      const press = e.pressure && e.pointerType === 'pen' ? 0.6 + e.pressure : 1;
      addDrop(x, y, color, { size: press });
      ripple(e.clientX, e.clientY);
    }
    state.lastInteraction = state.time;
    noteActivity();
    els.cursor.classList.add('down');
    dismissHint();
    if (state.panelOpen) openPanel(false);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });

  window.addEventListener('pointermove', e => {
    noteActivity();
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      cursor.tx = e.clientX; cursor.ty = e.clientY;
      if (!cursor.visible) { cursor.visible = true; cursor.x = cursor.tx; cursor.y = cursor.ty; els.cursor.classList.add('visible'); }
      const overUI = !!(e.target && e.target.closest && e.target.closest('button, input, .panel, .modal-card, .swatches'));
      state.overUI = overUI;
      els.cursor.classList.toggle('ui', overUI);
    }
    let p = pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType !== 'mouse' || e.target !== canvas || state.modalOpen) return;
      const [x, y] = uvFromEvent(e);
      p = { x, y, ax: x, ay: y, down: false, stirOnly: true, color: null, moved: false, type: 'mouse', seed: 0 };
      pointers.set(e.pointerId, p);
      return;
    }
    const [x, y] = uvFromEvent(e);
    if (!p.down && (e.target !== canvas || state.modalOpen)) { p.x = x; p.y = y; p.ax = x; p.ay = y; return; }
    p.x = x; p.y = y; p.moved = true;
    if (p.down) state.lastInteraction = state.time;
  });

  function endPointer(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (e.pointerType === 'mouse') { p.down = false; p.moved = false; p.ax = p.x; p.ay = p.y; }
    else pointers.delete(e.pointerId);
    els.cursor.classList.remove('down');
  }
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);

  document.addEventListener('mouseleave', () => { cursor.visible = false; els.cursor.classList.remove('visible'); });

  // ----------------------------------------------------------------
  // UI: cursor & idle
  // ----------------------------------------------------------------
  const cursor = { x: 0, y: 0, tx: 0, ty: 0, visible: false };
  const hasFinePointer = window.matchMedia('(pointer: fine)').matches && !isTouchOnly;
  if (!hasFinePointer) body.classList.add('no-custom-cursor');
  if (isTouchOnly) els.hint.firstElementChild.textContent = 'Tap to drop';

  function updateCursor() {
    if (!hasFinePointer || !cursor.visible) return;
    cursor.x += (cursor.tx - cursor.x) * 0.35;
    cursor.y += (cursor.ty - cursor.y) * 0.35;
    els.cursor.style.transform = 'translate3d(' + cursor.tx + 'px,' + cursor.ty + 'px,0)';
    els.cursorLag.style.transform = 'translate3d(' + (cursor.x - cursor.tx).toFixed(1) + 'px,' + (cursor.y - cursor.ty).toFixed(1) + 'px,0)';
  }

  function noteActivity() {
    state.lastActivity = performance.now();
    if (body.classList.contains('idle')) body.classList.remove('idle');
  }

  function updateIdle(now) {
    let dragging = false;
    for (const p of pointers.values()) if (p.down) { dragging = true; break; }
    const allowed = hasFinePointer && state.introDone && !state.panelOpen && !state.modalOpen && !state.overUI && !dragging;
    const idle = allowed && (now - state.lastActivity > 5000);
    if (idle !== body.classList.contains('idle')) body.classList.toggle('idle', idle);
  }

  // ----------------------------------------------------------------
  // UI: buttons & keys
  // ----------------------------------------------------------------
  els.mode.addEventListener('click', toggleMode);
  els.pause.addEventListener('click', togglePause);
  els.fullscreen.addEventListener('click', toggleFullscreen);
  els.info.addEventListener('click', () => openModal(!state.modalOpen));
  els.modalClose.addEventListener('click', () => openModal(false));
  els.modalBackdrop.addEventListener('click', () => openModal(false));
  els.mood.addEventListener('click', () => setPalette(state.paletteIndex + 1, true));
  els.clear.addEventListener('click', clearInk);
  els.save.addEventListener('click', () => { state.wantCapture = true; });
  els.settings.addEventListener('click', () => openPanel(!state.panelOpen));
  els.panelClose.addEventListener('click', () => openPanel(false));
  els.reset.addEventListener('click', resetDefaults);

  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    noteActivity();
    switch (e.key) {
      case ' ': e.preventDefault(); togglePause(); break;
      case 'c': case 'C': clearInk(); break;
      case 'm': case 'M': toggleMode(); break;
      case 'p': case 'P': setPalette(state.paletteIndex + 1, true); break;
      case 'h': case 'H': body.classList.toggle('hide-ui'); if (body.classList.contains('hide-ui')) { openPanel(false); } break;
      case 'f': case 'F': toggleFullscreen(); break;
      case 's': case 'S': state.wantCapture = true; break;
      case ',': openPanel(!state.panelOpen); break;
      case '?': case 'i': case 'I': openModal(!state.modalOpen); break;
      case 'Escape': openModal(false); openPanel(false); break;
      case '0': selectInk(-1); break;
      default:
        if (e.key >= '1' && e.key <= '9') {
          const i = Number(e.key) - 1;
          if (i < palette().inks.length) selectInk(i);
        }
    }
  });

  // pointer clicks should not leave buttons focused (space would re-trigger them)
  document.addEventListener('click', e => {
    const b = e.target && e.target.closest && e.target.closest('button');
    if (b && e.detail > 0) b.blur();
  });

  document.addEventListener('visibilitychange', () => { state.lastFrame = performance.now(); });

  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); });
  canvas.addEventListener('webglcontextrestored', () => { location.reload(); });

  // ----------------------------------------------------------------
  // Intro
  // ----------------------------------------------------------------
  function afterIntro() {
    if (state.introDone) return;
    state.introDone = true;
    const inks = palette().inks;
    setTimeout(() => drip(0.435, 0.7, inkColor(inks[1]), { size: 0.75 }), 900);
    setTimeout(() => drip(0.575, 0.6, inkColor(inks[2 % inks.length]), { size: 0.85 }), 2100);
    setTimeout(() => { if (!state.hintDismissed) els.hint.classList.add('show'); }, 2400);
    setTimeout(() => body.classList.add('ready'), 4600);
  }
  setTimeout(() => {
    const inks = palette().inks;
    drip(0.5, 0.65, inkColor(inks[0]), { amount: 2.2, size: 1.25, vx: 0, vy: -95, duration: 0.55 }, afterIntro);
  }, 550);
  setTimeout(afterIntro, 4000); // safety net

  // ----------------------------------------------------------------
  // A small console API, for the curious:  INK.drop(0.5, 0.6)
  // ----------------------------------------------------------------
  window.INK = {
    config, state, palettes: PALETTES, quality: QUALITY, reinit: initFramebuffers,
    drop(x, y, ink, options) {
      const inks = palette().inks;
      const chosen = typeof ink === 'number' ? inks[ink % inks.length] : (ink || pickInk());
      addDrop(x, y, inkColor(chosen), options);
    },
    // the same, but the drop is seen falling from the top of the page first
    drip(x, y, ink, options) {
      const inks = palette().inks;
      const chosen = typeof ink === 'number' ? inks[ink % inks.length] : (ink || pickInk());
      drip(x, y, inkColor(chosen), options);
    },
    stir(x, y, dx, dy) { splat(x, y, dx, dy, null, 0, dropRadius(), 0, 0, 1); },
    clear: clearInk,
    mode: setMode,
    palette: i => setPalette(i, true),
    ink: selectInk,
    pause: togglePause,
    rain: seconds => startRain(seconds),
    // total amount of ink on screen (diagnostic; reads the GPU back)
    mass() {
      const w = dye.read.width, h = dye.read.height;
      const buf = new Float32Array(w * h * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, dye.read.fbo);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, buf);
      let sum = 0, max = 0;
      for (let i = 3; i < buf.length; i += 4) { sum += buf[i]; if (buf[i] > max) max = buf[i]; }
      return { total: sum / (w * h), max };
    },
    // advance the simulation by a fixed amount of time (deterministic)
    simulate(seconds, fps) {
      const rate = fps || 60;
      const n = Math.max(1, Math.round(seconds * rate));
      for (let i = 0; i < n; i++) { updateMode(1 / rate); simulate(1 / rate); }
      render();
    },
  };

  // ----------------------------------------------------------------
  // Boot
  // ----------------------------------------------------------------
  resizeCanvas();
  initFramebuffers();
  setPalette(0, false);
  buildPanel();
  updateAccent();
  state.lastFrame = performance.now();
  requestAnimationFrame(frame);

})();
