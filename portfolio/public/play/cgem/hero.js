/* cGEM 2026 — hero particle field
   One point cloud, three foldings: DNA helix → plasmid map → maple leaf.
   Crisp dots + hairline bonds only; depth from size/opacity, never blur. */

(() => {
  "use strict";

  const canvas = document.getElementById("helix-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* palette (rgb strings) */
  const DOT_MIST = "169,191,206";
  const DOT_STEEL = "108,138,166";
  const DOT_TIDE = "80,158,148";
  const EDGE_RGB = "152,178,197";

  /* timing */
  const ASSEMBLE_MS = 2100;
  const MORPH_MS = 2000;
  const HOLDS = [8200, 6200, 6400];     /* helix, plasmid, leaf */

  let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, scale = 1;
  let N = 0, AMBIENT = 0;
  let parts = [];                        /* per-particle statics */
  let shapes = [];                       /* [shape][particle] = {x,y,z} */
  let edges = [];                        /* [shape] = [{a,b,alpha}] */
  let cur = 0, nxt = 0;
  let phase = "assemble";                /* assemble | hold | morph */
  let phaseStart = 0;
  let running = false, inView = true, rafId = 0;
  let px = 0, py = 0, sx = 0, sy = 0;    /* pointer target / smoothed */
  let startTime = performance.now();

  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

  /* ---- shape builders: return exactly n points in ~[-1.1, 1.1] space ---- */

  function buildHelix(n) {
    const pts = [], eg = [];
    const nStrand = Math.floor(n * 0.34);
    const turns = 2.15, R = 0.5, HGT = 2.15;
    for (let s = 0; s < 2; s++) {
      for (let i = 0; i < nStrand; i++) {
        const t = i / (nStrand - 1);
        const a = t * turns * TAU + s * Math.PI;
        pts.push({ x: Math.cos(a) * R, y: (t - 0.5) * HGT, z: Math.sin(a) * R });
        if (i > 0) eg.push({ a: s * nStrand + i - 1, b: s * nStrand + i, alpha: 0.30 });
      }
    }
    const RUNG_STEP = 7;
    for (let i = 2; i < nStrand - 2; i += RUNG_STEP) {
      eg.push({ a: i, b: nStrand + i, alpha: 0.20 });
    }
    /* halo dust around the strands */
    while (pts.length < n) {
      const t = Math.random();
      const a = rand(0, TAU);
      const r = R + rand(0.12, 0.75);
      pts.push({ x: Math.cos(a) * r, y: (t - 0.5) * (HGT + 0.5), z: Math.sin(a) * r });
    }
    return { pts, eg, spin: "helix" };
  }

  function buildPlasmid(n) {
    const pts = [], eg = [];
    const nRing = Math.floor(n * 0.40);
    for (let i = 0; i < nRing; i++) {
      const a = (i / nRing) * TAU;
      pts.push({ x: Math.cos(a) * 0.98, y: Math.sin(a) * 0.98, z: 0 });
      eg.push({ a: i, b: (i + 1) % nRing, alpha: 0.30 });
    }
    /* three annotation arcs (gene segments) on an inner track */
    const arcs = [[0.10, 0.34], [0.42, 0.58], [0.68, 0.92]];
    let base = nRing;
    const nArcPts = Math.floor(n * 0.075);
    for (const [a0, a1] of arcs) {
      for (let i = 0; i < nArcPts; i++) {
        const a = (a0 + (a1 - a0) * (i / (nArcPts - 1))) * TAU;
        pts.push({ x: Math.cos(a) * 0.66, y: Math.sin(a) * 0.66, z: 0.04 });
        if (i > 0) eg.push({ a: base + i - 1, b: base + i, alpha: 0.26 });
      }
      base += nArcPts;
    }
    /* restriction-site ticks crossing the outer ring */
    const nTicks = 11;
    for (let k = 0; k < nTicks; k++) {
      const a = (k / nTicks) * TAU + 0.18;
      const i0 = pts.length;
      pts.push({ x: Math.cos(a) * 0.86, y: Math.sin(a) * 0.86, z: 0 });
      pts.push({ x: Math.cos(a) * 1.12, y: Math.sin(a) * 1.12, z: 0 });
      eg.push({ a: i0, b: i0 + 1, alpha: 0.30 });
    }
    while (pts.length < n) {
      const a = rand(0, TAU), r = rand(0.1, 1.35);
      pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: rand(-0.2, 0.2) });
    }
    return { pts: pts.slice(0, n), eg, spin: "plasmid" };
  }

  /* simplified maple leaf outline, y up, roughly unit-sized */
  const LEAF_PATH = [
    [0.00, 1.10], [0.12, 0.86], [0.26, 0.94], [0.20, 0.62], [0.42, 0.74],
    [0.48, 0.60], [0.74, 0.72], [0.62, 0.44], [0.90, 0.42], [0.72, 0.22],
    [1.02, 0.04], [0.70, -0.04], [0.78, -0.24], [0.48, -0.18], [0.50, -0.44],
    [0.24, -0.30], [0.14, -0.44], [0.06, -0.42], [0.06, -0.78], [-0.06, -0.78],
    [-0.06, -0.42], [-0.14, -0.44], [-0.24, -0.30], [-0.50, -0.44], [-0.48, -0.18],
    [-0.78, -0.24], [-0.70, -0.04], [-1.02, 0.04], [-0.72, 0.22], [-0.90, 0.42],
    [-0.62, 0.44], [-0.74, 0.72], [-0.48, 0.60], [-0.42, 0.74], [-0.20, 0.62],
    [-0.26, 0.94], [-0.12, 0.86]
  ];

  function pointInLeaf(x, y) {
    let inside = false;
    for (let i = 0, j = LEAF_PATH.length - 1; i < LEAF_PATH.length; j = i++) {
      const [xi, yi] = LEAF_PATH[i], [xj, yj] = LEAF_PATH[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function buildLeaf(n) {
    const pts = [], eg = [];
    /* resample the outline evenly by perimeter */
    const per = [];
    let total = 0;
    for (let i = 0; i < LEAF_PATH.length; i++) {
      const a = LEAF_PATH[i], b = LEAF_PATH[(i + 1) % LEAF_PATH.length];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      per.push(d); total += d;
    }
    const nOut = Math.floor(n * 0.42);
    let seg = 0, acc = 0;
    for (let i = 0; i < nOut; i++) {
      const target = (i / nOut) * total;
      while (acc + per[seg] < target) { acc += per[seg]; seg = (seg + 1) % per.length; }
      const a = LEAF_PATH[seg], b = LEAF_PATH[(seg + 1) % LEAF_PATH.length];
      const f = (target - acc) / per[seg];
      pts.push({ x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, z: 0 });
      if (i > 0) eg.push({ a: i - 1, b: i, alpha: 0.30 });
    }
    eg.push({ a: nOut - 1, b: 0, alpha: 0.30 });
    /* veins: stem to five lobe tips */
    const tips = [[0, 1.06], [0.98, 0.05], [-0.98, 0.05], [0.71, 0.68], [-0.71, 0.68]];
    const stem = [0, -0.55];
    const nVein = 9;
    for (const tip of tips) {
      const i0 = pts.length;
      for (let i = 0; i <= nVein; i++) {
        const f = i / nVein;
        pts.push({ x: stem[0] + (tip[0] - stem[0]) * f, y: stem[1] + (tip[1] - stem[1]) * f, z: 0.03 });
        if (i > 0) eg.push({ a: i0 + i - 1, b: i0 + i, alpha: 0.18 });
      }
    }
    /* interior fill */
    let guard = 0;
    while (pts.length < n && guard < 40000) {
      guard++;
      const x = rand(-1.05, 1.05), y = rand(-0.85, 1.12);
      if (pointInLeaf(x, y)) pts.push({ x, y, z: rand(-0.05, 0.05) });
    }
    while (pts.length < n) pts.push({ x: rand(-0.3, 0.3), y: rand(-0.3, 0.3), z: 0 });
    /* scale leaf a touch */
    for (const p of pts) { p.x *= 0.92; p.y *= 0.92; }
    return { pts: pts.slice(0, n), eg, spin: "leaf" };
  }

  /* ---- rotation per shape mode ---- */

  function rotFor(mode, t) {
    switch (mode) {
      case "helix":   return { rx: 0.10, ry: t * 0.00035, rz: -0.14 };
      case "plasmid": return { rx: 0.85 + Math.sin(t * 0.00022) * 0.08, ry: 0, rz: t * 0.00016 };
      default:        return { rx: Math.sin(t * 0.00019) * 0.10, ry: Math.sin(t * 0.00026) * 0.30, rz: 0.06 };
    }
  }

  function rotate(p, r, out) {
    /* rz then rx then ry */
    let x = p.x, y = p.y, z = p.z;
    let c = Math.cos(r.rz), s = Math.sin(r.rz);
    let x1 = x * c - y * s, y1 = x * s + y * c;
    c = Math.cos(r.rx); s = Math.sin(r.rx);
    let y2 = y1 * c - z * s, z1 = y1 * s + z * c;
    c = Math.cos(r.ry); s = Math.sin(r.ry);
    out.x = x1 * c + z1 * s;
    out.y = y2;
    out.z = -x1 * s + z1 * c;
    return out;
  }

  /* ---- setup ---- */

  function build() {
    const hero = canvas.parentElement;
    W = hero.clientWidth; H = hero.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cx = W * 0.5;
    cy = H * 0.47;
    scale = Math.min(W * 0.3, H * 0.36);

    N = Math.max(340, Math.min(980, Math.round((W * H) / 1750)));

    shapes = []; edges = [];
    const builders = [buildHelix, buildPlasmid, buildLeaf];
    const spins = [];
    for (const b of builders) {
      const s = b(N);
      shapes.push(s.pts); edges.push(s.eg); spins.push(s.spin);
    }
    build.spins = spins;

    parts = new Array(N);
    for (let i = 0; i < N; i++) {
      const roll = Math.random();
      parts[i] = {
        size: rand(0.9, 2.1),
        color: roll < 0.78 ? DOT_MIST : roll < 0.93 ? DOT_STEEL : DOT_TIDE,
        base: rand(0.35, 0.9),
        jp: rand(0, TAU),
        js: rand(0.0006, 0.0013),
        delay: Math.random() * (ASSEMBLE_MS * 0.55),
        sx: rand(-0.6, 1.6) * W - (cx - W * 0.5),   /* scatter start, canvas space */
        sy: rand(-0.4, 1.4) * H - (cy - H * 0.5)
      };
    }
  }

  /* scratch objects to avoid GC churn */
  const _a = { x: 0, y: 0, z: 0 }, _b = { x: 0, y: 0, z: 0 };
  let proj;                              /* Float32Array [x,y,size,alpha] * N */

  function project(i, t, morphP) {
    const spins = build.spins;
    const rc = rotFor(spins[cur], t);
    const pc = rotate(shapes[cur][i], rc, _a);
    let x, y, z;
    if (morphP >= 1 || cur === nxt) {
      x = pc.x; y = pc.y; z = pc.z;
    } else {
      const rn = rotFor(spins[nxt], t);
      const pn = rotate(shapes[nxt][i], rn, _b);
      const e = easeIO(morphP);
      /* gentle arc so paths don't read as straight tweens */
      const arc = Math.sin(morphP * Math.PI) * 0.22;
      x = pc.x + (pn.x - pc.x) * e + (pc.y - pn.y) * arc * 0.35;
      y = pc.y + (pn.y - pc.y) * e + (pn.x - pc.x) * arc * 0.35;
      z = pc.z + (pn.z - pc.z) * e;
    }
    const P = parts[i];
    /* breathing jitter */
    const j = Math.sin(t * P.js + P.jp) * 0.014;
    x += j; y += Math.cos(t * P.js * 0.8 + P.jp) * 0.014; z += j * 0.5;

    const persp = 1 / (1 - z * 0.24);
    let sxp = cx + (x * scale * persp) + sx * 16;
    let syp = cy + (-y * scale * persp) + sy * 10;

    /* assembly: fly in from scatter */
    let a = P.base * (0.55 + 0.45 * clamp01((persp - 0.8) / 0.5));
    if (phase === "assemble") {
      const p = clamp01((t - startTime - P.delay) / (ASSEMBLE_MS * 0.45 + P.delay * 0.2));
      const e = easeOut(p);
      sxp = (cx + P.sx) + (sxp - (cx + P.sx)) * e;
      syp = (cy + P.sy) + (syp - (cy + P.sy)) * e;
      a *= 0.15 + 0.85 * e;
    }
    const o = i * 4;
    proj[o] = sxp; proj[o + 1] = syp;
    proj[o + 2] = P.size * persp;
    proj[o + 3] = a;
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);

    let morphP = 1;
    if (phase === "morph") morphP = clamp01((t - phaseStart) / MORPH_MS);

    if (!proj || proj.length !== N * 4) proj = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) project(i, t, morphP);

    /* edges — current set fades out, next set fades in */
    let globalEdge = 1;
    if (phase === "assemble") globalEdge = clamp01((t - startTime - ASSEMBLE_MS * 0.55) / (ASSEMBLE_MS * 0.45));
    const sets = (phase === "morph" && cur !== nxt)
      ? [[cur, (1 - easeIO(morphP))], [nxt, easeIO(morphP)]]
      : [[cur, 1]];

    ctx.lineWidth = 1;
    ctx.lineCap = "round";
    for (const [si, w] of sets) {
      if (w <= 0.02) continue;
      /* group edges into two alpha buckets to limit strokes */
      for (const bucket of [0.30, 0.20]) {
        ctx.beginPath();
        let any = false;
        for (const e of edges[si]) {
          const near = Math.abs(e.alpha - bucket) < 0.06;
          if (!near) continue;
          const oa = e.a * 4, ob = e.b * 4;
          ctx.moveTo(proj[oa], proj[oa + 1]);
          ctx.lineTo(proj[ob], proj[ob + 1]);
          any = true;
        }
        if (any) {
          ctx.strokeStyle = `rgba(${EDGE_RGB},${(bucket * w * globalEdge).toFixed(3)})`;
          ctx.stroke();
        }
      }
    }

    /* dots, batched per color */
    for (const col of [DOT_MIST, DOT_STEEL, DOT_TIDE]) {
      /* two alpha layers per color for depth without per-dot fill calls */
      for (const layer of [0, 1]) {
        ctx.beginPath();
        let any = false;
        for (let i = 0; i < N; i++) {
          const P = parts[i];
          if (P.color !== col) continue;
          const o = i * 4;
          const hi = proj[o + 3] > 0.55;
          if ((layer === 1) !== hi) continue;
          const r = Math.max(0.4, proj[o + 2]);
          ctx.moveTo(proj[o] + r, proj[o + 1]);
          ctx.arc(proj[o], proj[o + 1], r, 0, TAU);
          any = true;
        }
        if (any) {
          ctx.fillStyle = `rgba(${col},${layer === 1 ? 0.85 : 0.38})`;
          ctx.fill();
        }
      }
    }
  }

  function tick(now) {
    rafId = 0;
    /* pointer smoothing */
    sx += (px - sx) * 0.04;
    sy += (py - sy) * 0.04;

    /* phase machine */
    if (scrub !== null) {
      scrub += (scrubTarget - scrub) * 0.12;
      if (Math.abs(scrubTarget - scrub) < 0.001) scrub = scrubTarget;
      cur = Math.min(2, Math.floor(scrub));
      nxt = Math.min(2, cur + 1);
      const f = scrub - cur;
      if (f <= 0 || nxt === cur) { nxt = cur; phase = "hold"; phaseStart = now; }
      else { phase = "morph"; phaseStart = now - f * MORPH_MS; }
    } else if (phase === "assemble" && now - startTime > ASSEMBLE_MS) {
      phase = "hold"; phaseStart = now;
    } else if (phase === "hold" && now - phaseStart > HOLDS[cur]) {
      nxt = (cur + 1) % shapes.length;
      phase = "morph"; phaseStart = now;
    } else if (phase === "morph" && now - phaseStart > MORPH_MS) {
      cur = nxt; phase = "hold"; phaseStart = now;
    }

    draw(now);
    if (running && inView) rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (running || REDUCE) return;
    running = true;
    if (!rafId && inView) rafId = requestAnimationFrame(tick);
  }
  function stop() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }

  /* ---- static frame for reduced motion ---- */
  function staticFrame() {
    phase = "hold"; phaseStart = 0; cur = 0; nxt = 0;
    startTime = -1e9;                    /* skip assembly */
    draw(1200);                          /* fixed time → fixed rotation */
  }

  /* ---- scrubbing, for the portfolio's stage ---- */
  let scrub = null, scrubTarget = 0;
  window.cgemHero = {
    scrubTo(value) {
      scrubTarget = Math.max(0, Math.min(2, value));
      if (scrub === null) scrub = cur;
      if (REDUCE) { scrub = scrubTarget; tick(1200); }
    }
  };

  /* ---- wiring ---- */

  build();
  if (REDUCE) {
    staticFrame();
  } else {
    startTime = performance.now();
    start();
  }

  let resizeT = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      const wasPhase = phase;
      build();
      proj = new Float32Array(N * 4);
      if (REDUCE) { staticFrame(); return; }
      if (wasPhase === "assemble") startTime = performance.now();
      if (!rafId && running && inView) rafId = requestAnimationFrame(tick);
    }, 160);
  });

  window.addEventListener("pointermove", (e) => {
    px = (e.clientX / W - 0.5) * 2;
    py = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
  }, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop(); else start();
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((ents) => {
      inView = ents[0].isIntersecting;
      if (inView) start(); else if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    }, { threshold: 0.02 }).observe(canvas.parentElement);
  }
})();
