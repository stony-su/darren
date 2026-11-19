/* ── Fracture ──────────────────────────────────────────────────────────────
 * Cuts a rectangle into the cells a struck pane breaks into. Seeds sit on
 * three rings around the impact: a few small chips at the point of contact,
 * a ring of mid fragments, and a ring of big outer plates that reach the
 * border. The plates are the ones large enough to carry a page screenshot.
 *
 * Everything here is plain 2D geometry in pane pixels, x right and y DOWN
 * (the coordinate system the DOM hands us). Turning that into the y-up
 * space the meshes live in is the geometry builder's job. */

export type Pt = [number, number];

/** What a cell becomes: a page window, a mid fragment, or a small chip. */
export type ShardKind = 'plate' | 'shard' | 'chip';

export interface Cell {
  kind: ShardKind;
  /** Convex outline in pane pixels, wound clockwise in y-down space. */
  poly: Pt[];
  centroid: Pt;
  area: number;
  /** Longest chord through the centroid — the cell's "size" for art direction. */
  span: number;
  bbox: { x: number; y: number; w: number; h: number };
  /** Index into the project's page list; plates only. */
  page: number;
}

/* Ring geometry, in fractions of the pane's half-extents. */
const RINGS: { kind: ShardKind; radius: number; count: number; wobble: number }[] = [
  { kind: 'chip', radius: 0.13, count: 5, wobble: 0.34 },
  { kind: 'shard', radius: 0.4, count: 7, wobble: 0.3 },
  { kind: 'plate', radius: 0.82, count: 9, wobble: 0.2 },
];

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small deterministic PRNG so a project always breaks the same way. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Keep the half of `poly` that is closer to `a` than to `b`. */
function clipToBisector(poly: Pt[], a: Pt, b: Pt): Pt[] {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const nx = b[0] - a[0];
  const ny = b[1] - a[1];
  const side = (p: Pt) => (p[0] - mx) * nx + (p[1] - my) * ny;
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const sp = side(p);
    const sq = side(q);
    if (sp <= 0) out.push(p);
    if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/** Drop vertices that sit on top of their neighbour — bevelling hates them. */
function dedupe(poly: Pt[], eps = 0.75): Pt[] {
  const out: Pt[] = [];
  for (const p of poly) {
    const last = out[out.length - 1];
    if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < eps) continue;
    out.push(p);
  }
  while (out.length > 2) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < eps) out.pop();
    else break;
  }
  return out;
}

export function centroidOf(poly: Pt[]): Pt {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(area) < 1e-6) {
    const n = poly.length || 1;
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * area), cy / (3 * area)];
}

export function areaOf(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a) / 2;
}

export function bboxOf(poly: Pt[]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Break a `w` × `h` pane around `impact` (also in pane pixels).
 *
 * The seeds are laid on rings rather than scattered, because a real impact
 * fracture is radial: cells fan out from the point of contact and grow as
 * they go. Scattered seeds give a uniform crazing that reads as a mosaic,
 * not as broken glass.
 */
export function fracture(
  w: number,
  h: number,
  impact: Pt,
  pageCount: number,
  rng: () => number,
): Cell[] {
  const hw = w / 2;
  const hh = h / 2;

  interface Seed { kind: ShardKind; p: Pt }
  const seeds: Seed[] = [];

  for (const ring of RINGS) {
    const base = rng() * Math.PI * 2;
    const step = (Math.PI * 2) / ring.count;
    for (let k = 0; k < ring.count; k++) {
      const ang = base + k * step + (rng() - 0.5) * step * ring.wobble;
      const r = ring.radius * (1 + (rng() - 0.5) * 0.34);
      // Ellipse, not circle: the ring has to reach the short side and the
      // long side of the pane at about the same time.
      const x = impact[0] + Math.cos(ang) * r * hw;
      const y = impact[1] + Math.sin(ang) * r * hh;
      seeds.push({
        kind: ring.kind,
        p: [Math.max(-hw * 0.5, Math.min(w + hw * 0.5, x)),
            Math.max(-hh * 0.5, Math.min(h + hh * 0.5, y))],
      });
    }
  }

  const rect: Pt[] = [[0, 0], [w, 0], [w, h], [0, h]];
  const cells: Cell[] = [];

  seeds.forEach((seed, i) => {
    let poly = rect;
    for (let j = 0; j < seeds.length && poly.length >= 3; j++) {
      if (j !== i) poly = clipToBisector(poly, seed.p, seeds[j].p);
    }
    poly = dedupe(poly);
    if (poly.length < 3) return;

    const area = areaOf(poly);
    if (area < 620) return; // a splinter that would be all bevel and no glass

    const centroid = centroidOf(poly);
    let span = 0;
    for (const p of poly) span = Math.max(span, Math.hypot(p[0] - centroid[0], p[1] - centroid[1]) * 2);

    cells.push({
      kind: seed.kind,
      poly,
      centroid,
      area,
      span,
      bbox: bboxOf(poly),
      page: -1,
    });
  });

  // Hand the pages to the biggest plates, and leave the two smallest showing
  // the picture they came from: an exploded view of one thing reads better
  // than a set of unrelated screens, and the colour of the project's own
  // shot is what keeps the cloud from going monotone.
  const plates = cells.filter((c) => c.kind === 'plate').sort((a, b) => b.area - a.area);
  plates.slice(0, Math.max(0, plates.length - 3)).forEach((cell, i) => {
    cell.page = i % Math.max(1, pageCount);
  });

  return cells;
}
