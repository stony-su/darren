'use strict';
// ─────────────────────────────────────────────────────────────
// core: math helpers, seeded randomness, gradient noise, pen palettes
// ─────────────────────────────────────────────────────────────

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeOutQuad = t => 1 - (1 - t) * (1 - t);
const easeInQuad = t => t * t;
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const wrapAngle = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

function hash32(...ns) {
  let h = 2166136261 >>> 0;
  for (const n of ns) {
    h ^= n | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class RNG {
  constructor(...seed) { this.f = mulberry32(hash32(...seed, 0x9e3779b9)); this.spare = null; }
  next() { return this.f(); }
  range(a, b) { return a + (b - a) * this.f(); }
  int(a, b) { return a + Math.floor(this.f() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.f() * arr.length)]; }
  chance(p) { return this.f() < p; }
  sign() { return this.f() < 0.5 ? -1 : 1; }
  gauss() {
    if (this.spare !== null) { const s = this.spare; this.spare = null; return s; }
    let u = 0, v = 0;
    while (u === 0) u = this.f();
    v = this.f();
    const m = Math.sqrt(-2 * Math.log(u));
    this.spare = m * Math.sin(TAU * v);
    return m * Math.cos(TAU * v);
  }
  weighted(items, weights) {
    let total = 0;
    for (const w of weights) total += w;
    let x = this.f() * total;
    for (let i = 0; i < items.length; i++) { x -= weights[i]; if (x <= 0) return items[i]; }
    return items[items.length - 1];
  }
}

// 2D gradient noise (Perlin, seeded) with fractal sum.
class Noise2 {
  constructor(seed) {
    const r = new RNG(seed, 1013);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(r.next() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    this.gx = new Float32Array(16); this.gy = new Float32Array(16);
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; this.gx[i] = Math.cos(a); this.gy[i] = Math.sin(a); }
  }
  get(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255, P = this.perm;
    const g = (h, dx, dy) => this.gx[h & 15] * dx + this.gy[h & 15] * dy;
    const n00 = g(P[X + P[Y]], xf, yf);
    const n10 = g(P[X + 1 + P[Y]], xf - 1, yf);
    const n01 = g(P[X + P[Y + 1]], xf, yf - 1);
    const n11 = g(P[X + 1 + P[Y + 1]], xf - 1, yf - 1);
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * 1.414;
  }
  fbm(x, y, oct = 3) {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { s += amp * this.get(x * f, y * f); norm += amp; amp *= 0.5; f *= 2.03; }
    return s / norm;
  }
}

// Pen sets. Paper stays cool so the inks read cleanly at speed.
const PALETTES = [
  { name: 'Riso',        paper: '#f2f2ef', grid: '#cfd6dc', ink: '#1b1c23', pens: ['#f0359b', '#0a6fd1', '#d08a00', '#009a57'] },
  { name: 'Cyanotype',   paper: '#edf1f4', grid: '#c3d2de', ink: '#14223a', pens: ['#1a4f8a', '#c8413b', '#2f8fc9', '#5a4a9c'] },
  { name: 'Ultramarine', paper: '#f3f3f1', grid: '#d2d6de', ink: '#1c1d26', pens: ['#2433c4', '#ec4a2a', '#6a7bff', '#1f8a78'] },
  { name: 'Botanical',   paper: '#f0f2ed', grid: '#cdd6cf', ink: '#1b211d', pens: ['#1d6b4f', '#b8412f', '#c08a0c', '#2e4a9e'] },
  { name: 'Gel Pen',     paper: '#f0f1f4', grid: '#d0d3de', ink: '#1d1b26', pens: ['#7a2ff0', '#ff2e63', '#00a0a0', '#f07c00'] },
  { name: 'Sienna',      paper: '#f2f2ee', grid: '#d4d4cf', ink: '#24242b', pens: ['#a0522d', '#39598f', '#c47a1a', '#6b3f7a'] },
];

// Modes: one generative background + one colour world each. The seed picks the palette inside a mode.
// `finish` names the print finish the final pass gives the mode (see FINISHES in gl.js).
// dark palettes draw light-on-dark (screen blending, glow); light ones draw ink-on-paper (multiply).
const DARK = true;
const MODES = [
  { id: 'plotter', name: 'Plotter', note: 'Flow field on drafting film', shader: 'paper', finish: 'riso', field2d: true, grid: true, glow: 0, dim: 0, palettes: PALETTES },
  { id: 'julia', name: 'Julia', note: 'Julia sets morphing with the song', shader: 'julia', glow: 0.85, dim: 0.42, palettes: [
    { name: 'Abyss',     dark: DARK, paper: '#080a18', grid: '#262b52', ink: '#eef1ff', pens: ['#ff5fa2', '#4fd2ff', '#ffd166', '#9a8cff'] },
    { name: 'Ember',     dark: DARK, paper: '#120908', grid: '#47251d', ink: '#fff3e8', pens: ['#ff7a45', '#ffc247', '#ff4d6d', '#6fe3c4'] },
    { name: 'Verdigris', dark: DARK, paper: '#051312', grid: '#1d4640', ink: '#eafff9', pens: ['#3df2c5', '#f2d13d', '#ff7aa8', '#74a8ff'] },
  ] },
  { id: 'tunnel', name: 'Menger', note: 'Raymarched fractal corridor', shader: 'tunnel', glow: 0.9, dim: 0.4, palettes: [
    { name: 'Reactor',    dark: DARK, paper: '#07090f', grid: '#263047', ink: '#f2f6ff', pens: ['#49f0ff', '#ff4fd8', '#b6ff4a', '#ffb347'] },
    { name: 'Monolith',   dark: DARK, paper: '#0c0c0e', grid: '#34343a', ink: '#f5f2ea', pens: ['#ff5a3c', '#f5d547', '#e8e8e8', '#5aa9ff'] },
    { name: 'Deep Field', dark: DARK, paper: '#0a0714', grid: '#2f2450', ink: '#f4eeff', pens: ['#b388ff', '#ff6ec7', '#5df2d6', '#ffd66b'] },
  ] },
  { id: 'turing', name: 'Turing', note: 'Reaction–diffusion grown from your hits', shader: 'turing', finish: 'riso', glow: 0.5, dim: 0.45, palettes: [
    { name: 'Lino',  paper: '#ece8dd', grid: '#c9c6ba', ink: '#16213a', pens: ['#1f3a8a', '#d1442f', '#0f7b6c', '#b9770e'] },
    { name: 'Petri', dark: DARK, paper: '#081410', grid: '#1f4034', ink: '#eafff3', pens: ['#7dffb2', '#ffe66d', '#ff8fab', '#7cc7ff'] },
    { name: 'Coral', paper: '#f4ecea', grid: '#dccfcc', ink: '#3a1420', pens: ['#e4572e', '#17768f', '#a8327e', '#c98a00'] },
  ] },
  { id: 'automaton', name: 'Automaton', note: 'Cyclic cellular automaton, one step per sixteenth', shader: 'automaton', finish: 'crt', glow: 0.7, dim: 0.5, palettes: [
    { name: 'Phosphor',  dark: DARK, paper: '#06100a', grid: '#1b3a26', ink: '#d8ffe0', pens: ['#39ff88', '#b6ff3d', '#3de8ff', '#ffe14d'] },
    { name: 'Cartridge', dark: DARK, paper: '#0f0f1b', grid: '#33335a', ink: '#f4f4ff', pens: ['#ff4d6d', '#ffd23f', '#3bceac', '#6a8dff'] },
    { name: 'Amber',     dark: DARK, paper: '#120c04', grid: '#4a3516', ink: '#fff2d6', pens: ['#ffb000', '#ff6a00', '#ffe08a', '#ff3d5a'] },
  ] },
  { id: 'attractor', name: 'Attractor', note: 'Strange attractors as luminous dust', shader: 'attractor', glow: 1.0, dim: 0.3, palettes: [
    { name: 'Gilt',      dark: DARK, paper: '#070912', grid: '#2a2c40', ink: '#fff7e0', pens: ['#ffcf5c', '#ff8e5c', '#8fd3ff', '#f5f0ff'] },
    { name: 'Aurora',    dark: DARK, paper: '#04100f', grid: '#17403c', ink: '#eafffb', pens: ['#5cffc8', '#7aa8ff', '#e07aff', '#fff27a'] },
    { name: 'Rosewater', dark: DARK, paper: '#12070e', grid: '#45203a', ink: '#ffeef6', pens: ['#ff7eb6', '#ffb86b', '#c29bff', '#7ee8fa'] },
  ] },
  { id: 'truchet', name: 'Truchet', note: 'Truchet tiles that flip on the bar', shader: 'truchet', finish: 'halftone', glow: 0, dim: 0.5, palettes: [
    { name: 'Bauhaus',       paper: '#f1ede2', grid: '#d2cdc0', ink: '#17171a', pens: ['#d7352a', '#1d4fa3', '#d99a00', '#16735a'] },
    { name: 'Swimming Pool', paper: '#e9f2f4', grid: '#c1d6dc', ink: '#0f2a3d', pens: ['#0e7fa8', '#ee5d43', '#d99a12', '#2a9d74'] },
    { name: 'Sorbet',        paper: '#f6ecef', grid: '#e0cfd6', ink: '#2b1b2e', pens: ['#e0487c', '#6b5bd6', '#e07c1a', '#1f9e8e'] },
  ] },
  { id: 'ripple', name: 'Ripple', note: 'Every hit is a wave source; the waves interfere', shader: 'ripple', finish: 'engraving', glow: 0.6, dim: 0.4, palettes: [
    { name: 'Tide', paper: '#eef2f3', grid: '#c4d2d8', ink: '#10202b', pens: ['#0b72b9', '#e2533d', '#10957d', '#7b4bd1'] },
    { name: 'Dusk', dark: DARK, paper: '#0b1020', grid: '#28335a', ink: '#eef3ff', pens: ['#6ea8ff', '#ff8a6b', '#62e6c1', '#d59bff'] },
    { name: 'Op',   paper: '#f2f2f0', grid: '#cfcfcc', ink: '#111114', pens: ['#e6392f', '#2b63d9', '#111114', '#d99a00'] },
  ] },
  { id: 'crystal', name: 'Crystal', note: 'Drifting Voronoi glass', shader: 'crystal', glow: 0.75, dim: 0.5, palettes: [
    { name: 'Cathedral', dark: DARK, paper: '#0a0a14', grid: '#2c2c48', ink: '#fdf8ee', pens: ['#e23a4e', '#2f7fe0', '#f2b632', '#2fb37a'] },
    { name: 'Opal',      dark: DARK, paper: '#0b1214', grid: '#253c42', ink: '#f0fbff', pens: ['#6fe7dd', '#b79cff', '#ff9ecb', '#ffe28a'] },
    { name: 'Garnet',    dark: DARK, paper: '#140a10', grid: '#462033', ink: '#fff0f3', pens: ['#ff4f79', '#ff9e3d', '#c264ff', '#51d6ff'] },
  ] },
  { id: 'penrose', name: 'Penrose', note: 'Aperiodic rhomb tiling that deflates as you watch. Hits light the tiles', shader: 'penrose', finish: 'riso', glow: 0.6, dim: 0.5, palettes: [
    { name: 'Girih',        paper: '#f0ebdd', grid: '#d6cfbd', ink: '#1b1a17', pens: ['#1f6f8b', '#c0562b', '#d1a11f', '#2f7f5f'] },
    { name: 'Quasicrystal', dark: DARK, paper: '#080b12', grid: '#232c44', ink: '#f0f6ff', pens: ['#6fe7dd', '#b79cff', '#ff9ecb', '#ffe28a'] },
    { name: 'Alhambra',     dark: DARK, paper: '#100b08', grid: '#40301f', ink: '#fff1d6', pens: ['#e2a23a', '#2f8f8a', '#d1503a', '#f0e2c0'] },
  ] },
  { id: 'hyperbolic', name: 'Hyperbolic', note: 'Tilings of the Poincaré disc, after Escher. Hits push the plane', shader: 'hyperbolic', finish: 'engraving', glow: 0.5, dim: 0.55, palettes: [
    { name: 'Woodcut',      paper: '#efe9dc', grid: '#d3ccba', ink: '#17140f', pens: ['#b8412f', '#2e4a6e', '#c08a0c', '#3a6b4a'] },
    { name: 'Circle Limit', dark: DARK, paper: '#0c0c12', grid: '#2e2e42', ink: '#f4efe2', pens: ['#f2b632', '#e2574c', '#4f9bd1', '#e8e2d0'] },
    { name: 'Fresco',       paper: '#f1ece4', grid: '#d9d0c4', ink: '#241c1a', pens: ['#c0603a', '#3f7f8f', '#b9902a', '#6b4f8a'] },
  ] },
  { id: 'newton', name: 'Newton', note: 'Newton fractal. The roots are where you last hit', shader: 'newton', finish: 'halftone', glow: 0.4, dim: 0.55, palettes: [
    { name: 'Stained',     dark: DARK, paper: '#0a0a14', grid: '#2c2c48', ink: '#fdf8ee', pens: ['#e23a4e', '#2f7fe0', '#f2b632', '#2fb37a'] },
    { name: 'Gouache',     paper: '#f3efe6', grid: '#d8d2c4', ink: '#1d1b26', pens: ['#d7352a', '#1d4fa3', '#d99a00', '#16735a'] },
    { name: 'Ultraviolet', dark: DARK, paper: '#0c0714', grid: '#33224d', ink: '#f6eeff', pens: ['#b06bff', '#ff5fa2', '#4fd2ff', '#ffd166'] },
  ] },
  { id: 'lyapunov', name: 'Lyapunov', note: 'Markus–Lyapunov fractal: where the logistic map keeps order and where it loses it', shader: 'lyapunov', finish: 'dither', glow: 0.6, dim: 0.5, palettes: [
    { name: 'Zircon',    dark: DARK, paper: '#0a0c12', grid: '#2a2e40', ink: '#fff7e0', pens: ['#ffcf5c', '#ff8e5c', '#8fd3ff', '#5a6a9c'] },
    { name: 'Lagoon',    dark: DARK, paper: '#061413', grid: '#1d4640', ink: '#eafff9', pens: ['#3df2c5', '#f2d13d', '#ff7aa8', '#3a7a8c'] },
    { name: 'Blueprint', paper: '#e8eef4', grid: '#c2d0de', ink: '#10233d', pens: ['#1a4f8a', '#c8413b', '#2f8fc9', '#5a4a9c'] },
  ] },
  { id: 'kleinian', name: 'Kleinian', note: 'Limit sets of groups of Möbius maps', shader: 'kleinian', glow: 0.85, dim: 0.45, palettes: [
    { name: 'Pearl',   dark: DARK, paper: '#0b0e14', grid: '#2a3142', ink: '#fbf6ea', pens: ['#f0e6d2', '#9ad0ff', '#ffb6c9', '#c8f2d8'] },
    { name: 'Indra',   dark: DARK, paper: '#100810', grid: '#3e2240', ink: '#fff0fa', pens: ['#ffcf5c', '#ff6ec7', '#7ee8fa', '#c29bff'] },
    { name: 'Lacquer', paper: '#f2ede4', grid: '#d8d0c2', ink: '#1c1512', pens: ['#b3261e', '#1d4f8a', '#c98a00', '#2f6b4f'] },
  ] },
  { id: 'mandelbulb', name: 'Mandelbulb', note: 'A Mandelbulb or a Mandelbox, raymarched. The bass bends its power', shader: 'mandelbulb', glow: 0.8, dim: 0.35, palettes: [
    { name: 'Coral Reef', dark: DARK, paper: '#07090f', grid: '#263047', ink: '#f2f6ff', pens: ['#ff7a66', '#ffd166', '#4fd2ff', '#b388ff'] },
    { name: 'Basalt',     dark: DARK, paper: '#0b0b0d', grid: '#34343a', ink: '#f5f2ea', pens: ['#e8e8e8', '#ff5a3c', '#f5d547', '#5aa9ff'] },
    { name: 'Jade',       dark: DARK, paper: '#051210', grid: '#1d4640', ink: '#eafff9', pens: ['#3df2c5', '#c8f26b', '#f2d13d', '#74a8ff'] },
  ] },
  { id: 'belousov', name: 'Belousov', note: 'Three reagents chase each other into spiral waves. Hits stir the dish', shader: 'belousov', glow: 0.5, dim: 0.55, palettes: [
    { name: 'Reagent',   dark: DARK, paper: '#0d0808', grid: '#40221f', ink: '#fff3ee', pens: ['#ff4d3d', '#ffb347', '#4fc3f7', '#f5f0ff'] },
    { name: 'Litmus',    paper: '#f2eef0', grid: '#d9d0d6', ink: '#2a1a24', pens: ['#c8413b', '#2f6fb5', '#8a4fb5', '#d99a12'] },
    { name: 'Malachite', dark: DARK, paper: '#06120f', grid: '#1c4036', ink: '#eafff6', pens: ['#3df2a5', '#2fb3d1', '#f2d13d', '#ff7a66'] },
  ] },
  { id: 'sandpile', name: 'Sandpile', note: 'Abelian sandpile. Every hit drops a pile of grains and starts an avalanche', shader: 'sandpile', glow: 0.5, dim: 0.5, palettes: [
    { name: 'Dune',   paper: '#f1eadb', grid: '#d8cfba', ink: '#2b2118', pens: ['#d9b77a', '#c98a2b', '#a0522d', '#3b5a78'] },
    { name: 'Mosaic', dark: DARK, paper: '#0e0c14', grid: '#302c44', ink: '#fdf8ee', pens: ['#2f4f8f', '#2fb37a', '#f2b632', '#e23a4e'] },
    { name: 'Slate',  dark: DARK, paper: '#0c1014', grid: '#2a3640', ink: '#f2f8ff', pens: ['#34506b', '#5f9fd0', '#ffb86b', '#ff6b8b'] },
  ] },
  { id: 'lenia', name: 'Lenia', note: 'Continuous cellular automaton. Every hit releases a glider', shader: 'lenia', glow: 0.8, dim: 0.35, palettes: [
    { name: 'Plankton', dark: DARK, paper: '#04121a', grid: '#16384a', ink: '#eafaff', pens: ['#5df2d6', '#7aa8ff', '#f2d13d', '#ff7aa8'] },
    { name: 'Culture',  paper: '#eef0e8', grid: '#d0d6c6', ink: '#1b211d', pens: ['#2a7f62', '#a8327e', '#c98a00', '#2b63d9'] },
    { name: 'Abyssal',  dark: DARK, paper: '#0a0714', grid: '#2f2450', ink: '#f4eeff', pens: ['#b388ff', '#5df2d6', '#ff6ec7', '#ffd66b'] },
  ] },
  { id: 'physarum', name: 'Slime mould', note: 'Physarum: a hundred thousand agents following each other’s trails. Hits scatter them', shader: 'physarum', glow: 0.85, dim: 0.45, palettes: [
    { name: 'Agar',       dark: DARK, paper: '#0b0d08', grid: '#2e3520', ink: '#fbffe6', pens: ['#e8f26b', '#6be0a8', '#ff9a5c', '#9ad0ff'] },
    { name: 'Mycelium',   paper: '#efeadf', grid: '#d5cebd', ink: '#23201a', pens: ['#7a4a21', '#2f6b4f', '#b3541e', '#3d4f8a'] },
    { name: 'Neon Petri', dark: DARK, paper: '#070812', grid: '#232646', ink: '#f2f4ff', pens: ['#ff4fd8', '#49f0ff', '#b6ff4a', '#ffb347'] },
  ] },
  { id: 'fluid', name: 'Fluid', note: 'Four inks in water. Each hit throws its pen’s ink along the path you took to it', shader: 'fluid', glow: 0.7, dim: 0.4, palettes: [
    { name: 'Suminagashi', paper: '#f1ede4', grid: '#d7d0c2', ink: '#1a1a22', pens: ['#23356b', '#c8402a', '#2f7f76', '#c08a1e'] },
    { name: 'Ebru',        dark: DARK, paper: '#0b0f17', grid: '#283248', ink: '#f2f6ff', pens: ['#ff5d73', '#4fc3f7', '#ffd166', '#b388ff'] },
    { name: 'Oil',         dark: DARK, paper: '#0d0a08', grid: '#3c2e22', ink: '#fff4e6', pens: ['#ff8a3d', '#ffd447', '#5ee0c1', '#e86bff'] },
  ] },
  { id: 'feedback', name: 'Feedback', note: 'Video feedback: the picture, blooms and all, is fed back into itself', shader: 'feedback', finish: 'crt', glow: 0.9, dim: 0.4, palettes: [
    { name: 'Vidicon',  dark: DARK, paper: '#06060c', grid: '#24243c', ink: '#f4f4ff', pens: ['#49f0ff', '#ff4fd8', '#b6ff4a', '#f4f4ff'] },
    { name: 'Tape',     dark: DARK, paper: '#0f0a12', grid: '#3a2a44', ink: '#fff0f6', pens: ['#ff7a45', '#ffc247', '#6fe3c4', '#c29bff'] },
    { name: 'Scanline', dark: DARK, paper: '#04100a', grid: '#1b3a26', ink: '#e6ffee', pens: ['#39ff88', '#3de8ff', '#ffe14d', '#ff6ad5'] },
  ] },
];
const modeById = id => MODES.find(m => m.id === id) || MODES[0];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const hexToVec = hex => hexToRgb(hex).map(v => v / 255);
function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function loadPref(key, fallback) {
  try { const v = localStorage.getItem('cosu.' + key); return v === null ? fallback : JSON.parse(v); }
  catch (e) { return fallback; }
}
function savePref(key, value) {
  try { localStorage.setItem('cosu.' + key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
}
