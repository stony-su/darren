import * as THREE from 'three';
import type { Cell, Pt } from './fracture';

/* ── Shard geometry ────────────────────────────────────────────────────────
 * A cell becomes a solid of glass, not a plane with a texture on it:
 *
 *        ╭─────────────╮        domed front face (a shallow lens)
 *      ╭─╯             ╰─╮      quarter-round bevel
 *      │                 │      straight wall, the thickness you see
 *      ╰─╮             ╭─╯      quarter-round bevel
 *        ╰─────────────╯        flat back face
 *
 * The dome is what makes it read as liquid rather than as a cut tile: the
 * face is slightly convex, so it magnifies what it refracts and the
 * highlight slides across it as the shard turns. The bevels are where all
 * the light lives — every rim, dispersion fringe and glint in the shader is
 * driven by how far a fragment sits round that curve.
 *
 * Normals are built analytically ring by ring rather than averaged from
 * triangles, so the curvature is exactly smooth and the face/bevel junction
 * has no crease in it.
 *
 * Built in shard-local pixels: the origin is the cell's centroid (so the
 * mesh rotates about its own middle) and +y is up, flipped from the pane's
 * y-down coordinates.
 *
 * Attributes beyond position/normal:
 *   uvHero  the fragment's place in the *whole* pane, so the shards
 *           together reassemble the project screenshot seamlessly
 *   uvPage  the fragment's place in this cell's own box, which is how a
 *           page screenshot gets poured into the shard's silhouette
 *   aEdge   0 on the flat of the face, 1 out on the wall
 */

export interface ShardGeometryOptions {
  /** Half-thickness of the slab, in pane pixels. */
  halfThickness: number;
  /** Radius of the quarter-round, in pane pixels. */
  bevel: number;
  /** How far the front face bulges past the bevel, in pane pixels. */
  dome: number;
  /** Pushed out past the cell's own edge, so neighbours touch. */
  grow: number;
  /** Pane size, for the seamless hero UVs. */
  pane: { w: number; h: number };
  bevelSegments: number;
  domeRings: number;
}

/** Move every edge of a convex polygon inward by `d` and re-corner it. */
function insetConvex(poly: Pt[], d: number): Pt[] {
  const n = poly.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n];
    const cur = poly[i];
    const next = poly[(i + 1) % n];

    // Inward normals of the two edges meeting at this corner. The polygon is
    // wound counter-clockwise here, so the inward side is to the left.
    const e0 = [cur[0] - prev[0], cur[1] - prev[1]];
    const e1 = [next[0] - cur[0], next[1] - cur[1]];
    const l0 = Math.hypot(e0[0], e0[1]) || 1;
    const l1 = Math.hypot(e1[0], e1[1]) || 1;
    const n0 = [-e0[1] / l0, e0[0] / l0];
    const n1 = [-e1[1] / l1, e1[0] / l1];

    // Intersect the two offset edge lines. Near-parallel edges (a shallow
    // corner) fall back to the averaged normal, which is what the limit is.
    const det = n0[0] * n1[1] - n0[1] * n1[0];
    if (Math.abs(det) < 1e-6) {
      const ax = (n0[0] + n1[0]) / 2;
      const ay = (n0[1] + n1[1]) / 2;
      const al = Math.hypot(ax, ay) || 1;
      out.push([cur[0] + (ax / al) * d, cur[1] + (ay / al) * d]);
      continue;
    }
    const c0 = n0[0] * cur[0] + n0[1] * cur[1] + d;
    const c1 = n1[0] * cur[0] + n1[1] * cur[1] + d;
    let px = (c0 * n1[1] - c1 * n0[1]) / det;
    let py = (n0[0] * c1 - n1[0] * c0) / det;

    // A needle-sharp corner sends the offset point miles away; rein it in so
    // the bevel stays a bevel.
    const dx = px - cur[0];
    const dy = py - cur[1];
    const len = Math.hypot(dx, dy);
    const cap = Math.abs(d) * 2.6;
    if (len > cap) {
      px = cur[0] + (dx / len) * cap;
      py = cur[1] + (dy / len) * cap;
    }
    out.push([px, py]);
  }
  return out;
}

function signedArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

interface Ring {
  /** One vertex per polygon corner. */
  pos: [number, number, number][];
  nrm: [number, number, number][];
  edge: number[];
}

export function buildShardGeometry(cell: Cell, opts: ShardGeometryOptions): THREE.BufferGeometry {
  const { halfThickness: t, pane, bevelSegments: B, domeRings: DR } = opts;

  // Into shard-local, y-up coordinates centred on the centroid.
  let poly: Pt[] = cell.poly.map(([x, y]) => [x - cell.centroid[0], cell.centroid[1] - y]);
  if (signedArea(poly) < 0) poly = poly.slice().reverse(); // counter-clockwise
  const n = poly.length;

  if (opts.grow > 0) poly = insetConvex(poly, -opts.grow);

  // The bevel can't eat more than the cell can spare, or the face vanishes.
  const bevel = Math.min(opts.bevel, cell.span * 0.11);
  const dome = Math.min(opts.dome, cell.span * 0.07);
  const face = insetConvex(poly, bevel);

  // Radius and outward direction at each corner of the face, for the dome's
  // slope and the bevel's normal.
  const radius: number[] = [];
  const outward: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.hypot(face[i][0], face[i][1]) || 1;
    radius.push(r);
    const ox = poly[i][0] - face[i][0];
    const oy = poly[i][1] - face[i][1];
    const ol = Math.hypot(ox, oy) || 1;
    outward.push([ox / ol, oy / ol]);
  }

  const domeZ = (s: number) => t + dome * (1 - s * s);
  /** Surface normal of the domed face at corner i, distance fraction s. */
  const domeNormal = (i: number, s: number): [number, number, number] => {
    // z = t + dome(1 - s²) over radius r, so dz/dr = -2·dome·s / r and the
    // normal leans outward by exactly that slope.
    const slope = (2 * dome * s) / radius[i];
    const nx = outward[i][0] * slope;
    const ny = outward[i][1] * slope;
    const l = Math.hypot(nx, ny, 1);
    return [nx / l, ny / l, 1 / l];
  };

  const rings: Ring[] = [];

  // 1. The domed face, as concentric rings out to the inset outline. Ring 0
  //    is degenerate at the centroid and gives the fan its hub.
  for (let k = 0; k <= DR; k++) {
    const s = k / DR;
    const ring: Ring = { pos: [], nrm: [], edge: [] };
    for (let i = 0; i < n; i++) {
      ring.pos.push([face[i][0] * s, face[i][1] * s, domeZ(s)]);
      ring.nrm.push(domeNormal(i, s));
      ring.edge.push(0);
    }
    rings.push(ring);
  }

  // 2. The quarter-round, swinging from the face's normal out to the wall's.
  for (let k = 1; k <= B; k++) {
    const th = (k / B) * (Math.PI / 2);
    const sin = Math.sin(th);
    const cos = Math.cos(th);
    const ring: Ring = { pos: [], nrm: [], edge: [] };
    for (let i = 0; i < n; i++) {
      const px = face[i][0] + (poly[i][0] - face[i][0]) * sin;
      const py = face[i][1] + (poly[i][1] - face[i][1]) * sin;
      ring.pos.push([px, py, t - bevel * (1 - cos)]);
      // Blended so that at th=0 this is exactly the face's normal (no crease)
      // and at th=90° it is exactly the wall's.
      const edgeN = domeNormal(i, 1);
      const nx = outward[i][0] * sin + edgeN[0] * cos;
      const ny = outward[i][1] * sin + edgeN[1] * cos;
      const nz = edgeN[2] * cos;
      const l = Math.hypot(nx, ny, nz) || 1;
      ring.pos[i][2] = t - bevel * (1 - cos);
      ring.nrm.push([nx / l, ny / l, nz / l]);
      ring.edge.push(sin);
    }
    rings.push(ring);
  }

  // 3. The wall: straight down the silhouette, the part that shows thickness.
  {
    const ring: Ring = { pos: [], nrm: [], edge: [] };
    for (let i = 0; i < n; i++) {
      ring.pos.push([poly[i][0], poly[i][1], -(t - bevel)]);
      ring.nrm.push([outward[i][0], outward[i][1], 0]);
      ring.edge.push(1);
    }
    rings.push(ring);
  }

  // 4. Back bevel, mirrored, then the flat back face.
  for (let k = B - 1; k >= 0; k--) {
    const th = (k / B) * (Math.PI / 2);
    const sin = Math.sin(th);
    const cos = Math.cos(th);
    const ring: Ring = { pos: [], nrm: [], edge: [] };
    for (let i = 0; i < n; i++) {
      const px = face[i][0] + (poly[i][0] - face[i][0]) * sin;
      const py = face[i][1] + (poly[i][1] - face[i][1]) * sin;
      ring.pos.push([px, py, -t + bevel * (1 - cos)]);
      const l = Math.hypot(outward[i][0] * sin, outward[i][1] * sin, -cos) || 1;
      ring.nrm.push([(outward[i][0] * sin) / l, (outward[i][1] * sin) / l, -cos / l]);
      ring.edge.push(sin * 0.8);
    }
    rings.push(ring);
  }
  {
    const ring: Ring = { pos: [], nrm: [], edge: [] };
    for (let i = 0; i < n; i++) {
      ring.pos.push([0, 0, -t]);
      ring.nrm.push([0, 0, -1]);
      ring.edge.push(0);
    }
    rings.push(ring);
  }

  /* ── Emit ── */

  const pos: number[] = [];
  const nrm: number[] = [];
  const uvH: number[] = [];
  const uvP: number[] = [];
  const edge: number[] = [];
  const idx: number[] = [];

  for (const ring of rings) {
    for (let i = 0; i < n; i++) {
      const p = ring.pos[i];
      const q = ring.nrm[i];
      pos.push(p[0], p[1], p[2]);
      nrm.push(q[0], q[1], q[2]);
      edge.push(ring.edge[i]);

      // Hero UV: where this point sits on the unbroken pane. Pane pixels are
      // y-down, the mesh is y-up, so v counts back from the top.
      const paneX = cell.centroid[0] + p[0];
      const paneY = cell.centroid[1] - p[1];
      uvH.push(paneX / pane.w, 1 - paneY / pane.h);

      // Page UV: where this point sits in the cell's own bounding box. How
      // that box is filled — cover-fitted, or squashed for the liquid warp —
      // is a uniform, so it can follow whatever the screenshot's shape is.
      const bx = cell.bbox;
      uvP.push((paneX - bx.x) / (bx.w || 1), 1 - (paneY - bx.y) / (bx.h || 1));
    }
  }

  const ringCount = rings.length;
  const at = (ring: number, i: number) => ring * n + (i % n);

  // Face fan: ring 0 is the hub, all its copies sit on the centroid.
  for (let i = 0; i < n; i++) idx.push(at(0, 0), at(1, i), at(1, i + 1));
  // Every neighbouring pair of rings bridges into a band of quads, wound so
  // the outside faces out.
  for (let r = 1; r < ringCount - 2; r++) {
    for (let i = 0; i < n; i++) {
      const a = at(r, i), b = at(r, i + 1);
      const c = at(r + 1, i), d = at(r + 1, i + 1);
      idx.push(a, c, d, a, d, b);
    }
  }
  // Back fan, reversed so it faces away from the viewer.
  const last = ringCount - 1;
  for (let i = 0; i < n; i++) idx.push(at(last, 0), at(last - 1, i + 1), at(last - 1, i));

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uvHero', new THREE.Float32BufferAttribute(uvH, 2));
  g.setAttribute('uvPage', new THREE.Float32BufferAttribute(uvP, 2));
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
