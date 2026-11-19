/* ─────────────────────────────────────────────────────────────────────────────
   FRAGMENT ECOLOGY · core/prng.js
   Seeded randomness, seeded 3D Perlin noise, cosine palettes.
   Everything visual in the site derives from these three primitives.
   ───────────────────────────────────────────────────────────────────────────── */
(function () {
  const AA = (window.AA = window.AA || {});

  /* ── Integer hash (lowbias32) so seeds that differ by 1 look nothing alike ── */
  function hash32(x) {
    x = x >>> 0;
    x ^= x >>> 16; x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15; x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
  }

  /* ── mulberry32 PRNG wrapped in a small toolkit ── */
  function rng(seed) {
    let a = hash32(seed) || 0x9e3779b9;
    const next = () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const r = {
      next,
      range: (lo, hi) => lo + (hi - lo) * next(),
      int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      bool: (p = 0.5) => next() < p,
      sign: () => (next() < 0.5 ? -1 : 1),
      gauss: () => {
        let u = 0, v = 0;
        while (u === 0) u = next();
        while (v === 0) v = next();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      },
      shuffle: (arr) => {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
      },
      /* a derived stream, so sub-systems can consume randomness independently */
      fork: () => rng(Math.floor(next() * 0xffffffff)),
    };
    return r;
  }

  /* ── Improved Perlin noise (3D) with a seeded permutation table ── */
  function perlin(r) {
    const p = new Uint8Array(512);
    const perm = r.shuffle(Array.from({ length: 256 }, (_, i) => i));
    for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const lerp = (a, b, t) => a + t * (b - a);
    function grad(h, x, y, z) {
      switch (h & 15) {
        case 0: return x + y;   case 1: return -x + y;  case 2: return x - y;   case 3: return -x - y;
        case 4: return x + z;   case 5: return -x + z;  case 6: return x - z;   case 7: return -x - z;
        case 8: return y + z;   case 9: return -y + z;  case 10: return y - z;  case 11: return -y - z;
        case 12: return y + x;  case 13: return -y + z; case 14: return y - x;  default: return -y - z;
      }
    }
    return function noise3(x, y, z) {
      let X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
      x -= X; y -= Y; z -= Z; X &= 255; Y &= 255; Z &= 255;
      const u = fade(x), v = fade(y), w = fade(z);
      const A = p[X] + Y, AA_ = p[A] + Z, AB = p[A + 1] + Z;
      const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
      return lerp(
        lerp(lerp(grad(p[AA_], x, y, z), grad(p[BA], x - 1, y, z), u),
             lerp(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u), v),
        lerp(lerp(grad(p[AA_ + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u),
             lerp(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u), v),
        w);
    };
  }

  /* ── Cosine palettes (a + b·cos 2π(c·t + d)), curated set, seeded phase ──
     Dark ground is assumed everywhere: callers scale by activity. */
  const PALETTES = [
    { a: [0.50, 0.50, 0.50], b: [0.50, 0.50, 0.50], c: [1.0, 1.0, 1.0], d: [0.00, 0.33, 0.67], name: 'spectrum' },
    { a: [0.50, 0.50, 0.50], b: [0.50, 0.50, 0.50], c: [1.0, 1.0, 1.0], d: [0.00, 0.10, 0.20], name: 'ember' },
    { a: [0.50, 0.50, 0.50], b: [0.50, 0.50, 0.50], c: [1.0, 1.0, 1.0], d: [0.30, 0.20, 0.20], name: 'rose' },
    { a: [0.50, 0.50, 0.50], b: [0.50, 0.50, 0.50], c: [1.0, 1.0, 0.5], d: [0.80, 0.90, 0.30], name: 'citrus' },
    { a: [0.50, 0.50, 0.50], b: [0.50, 0.50, 0.50], c: [1.0, 0.7, 0.4], d: [0.00, 0.15, 0.20], name: 'sand' },
    { a: [0.50, 0.50, 0.50], b: [0.50, 0.50, 0.50], c: [2.0, 1.0, 0.0], d: [0.50, 0.20, 0.25], name: 'coral' },
    { a: [0.80, 0.50, 0.40], b: [0.20, 0.40, 0.20], c: [2.0, 1.0, 1.0], d: [0.00, 0.25, 0.25], name: 'peach' },
    { a: [0.40, 0.50, 0.60], b: [0.60, 0.50, 0.40], c: [1.0, 1.0, 1.0], d: [0.10, 0.25, 0.55], name: 'glacier' },
    { a: [0.55, 0.45, 0.60], b: [0.45, 0.55, 0.40], c: [1.0, 1.0, 1.0], d: [0.85, 0.15, 0.45], name: 'violet' },
    { a: [0.45, 0.55, 0.50], b: [0.55, 0.45, 0.50], c: [1.0, 1.0, 1.0], d: [0.60, 0.30, 0.05], name: 'acid' },
  ];

  function palette(r, opts = {}) {
    const base = PALETTES[r.int(0, PALETTES.length - 1)];
    const shift = r.range(0, 1);
    const jit = () => r.range(-0.04, 0.04);
    const P = {
      name: base.name,
      a: base.a.map((v) => v + jit()),
      b: base.b.map((v) => v + jit()),
      c: base.c.slice(),
      d: base.d.map((v) => v + shift),
    };
    P.at = (t, out = [0, 0, 0]) => {
      for (let i = 0; i < 3; i++) {
        out[i] = Math.min(1, Math.max(0, P.a[i] + P.b[i] * Math.cos(6.28318530718 * (P.c[i] * t + P.d[i]))));
      }
      return out;
    };
    P.css = (t, alpha = 1) => {
      const c = P.at(t);
      return `rgba(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0},${alpha})`;
    };
    P.hex = (t) => {
      const c = P.at(t);
      return '#' + c.map((v) => ((v * 255) | 0).toString(16).padStart(2, '0')).join('');
    };
    /* the brightest, most saturated point of the palette — used as UI accent */
    P.accent = (t0 = 0, t1 = 1) => {
      let best = 0, bestScore = -1;
      for (let i = 0; i <= 32; i++) {
        const t = t0 + (t1 - t0) * (i / 32), c = P.at(t);
        const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]);
        const score = (mx - mn) * 1.2 + mx;
        if (score > bestScore) { bestScore = score; best = t; }
      }
      return P.hex(best);
    };
    /* flattened for GLSL: 12 floats a,b,c,d */
    P.uniforms = () => [...P.a, ...P.b, ...P.c, ...P.d];
    return P;
  }

  /* ── Small numeric helpers shared by the pieces ── */
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  AA.hash32 = hash32;
  AA.rng = rng;
  AA.perlin = perlin;
  AA.palette = palette;
  AA.PALETTES = PALETTES;
  AA.clamp = clamp;
  AA.lerp = lerp;
  AA.smoothstep = smoothstep;
})();
