import * as THREE from 'three';

/* ── Textures ──────────────────────────────────────────────────────────────
 * Everything the glass refracts goes through here first. Source art is a
 * full screen capture (1920 × 1080 and up) and there can be eight of them
 * per project; handing those to the GPU untouched costs tens of megabytes
 * for detail no shard is big enough to show. Each one is redrawn once at a
 * sane size, mipmapped, and cached. */

export const HERO_MAX = 1280;
const PAGE_MAX = 1024;

function fit(w: number, h: number, max: number): [number, number] {
  const k = Math.min(1, max / Math.max(w, h));
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
}

/**
 * The part of a source an `object-fit: cover` pane actually shows. The shards
 * map the whole texture onto the pane, so anything the DOM crops away has to
 * be gone from the texture too, or the glass arrives stretched over a picture
 * it no longer lines up with.
 */
function coverRect(w: number, h: number, aspect?: number): [number, number, number, number] {
  if (!aspect) return [0, 0, w, h];
  if (w / h > aspect) {
    const sw = h * aspect;
    return [(w - sw) / 2, 0, sw, h];
  }
  const sh = w / aspect;
  return [0, (h - sh) / 2, w, sh];
}

function toTexture(canvas: HTMLCanvasElement, aniso: number): THREE.Texture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  // The refraction offset can walk a sample past the edge; clamping keeps
  // that as a smear of the border rather than the far side wrapping in.
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = aniso;
  tex.needsUpdate = true;
  return tex;
}

function paint(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  [sx, sy, sw, sh]: [number, number, number, number],
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
}

function draw(
  source: CanvasImageSource,
  w: number,
  h: number,
  max: number,
  cropAspect?: number,
): HTMLCanvasElement {
  const rect = coverRect(w, h, cropAspect);
  const [cw, ch] = fit(rect[2], rect[3], max);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  paint(canvas, source, rect);
  return canvas;
}

/** A 1×1 nothing, so a material can compile before its art has decoded. */
export function blankTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0b0d16';
    ctx.fillRect(0, 0, 1, 1);
  }
  return toTexture(canvas, 1);
}

export interface LoadedTexture {
  texture: THREE.Texture;
  aspect: number;
}

/**
 * An <img> the browser has already decoded (the card's own picture) becomes
 * a texture with no round trip at all — which is what lets the first hover
 * break the glass immediately instead of a frame or two later.
 */
export function textureFromImage(
  img: HTMLImageElement,
  aniso: number,
  cropAspect?: number,
): LoadedTexture | null {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!img.complete || !w || !h) return null;
  return {
    texture: toTexture(draw(img, w, h, HERO_MAX, cropAspect), aniso),
    aspect: cropAspect ?? w / h,
  };
}

/**
 * The frame a video is showing right now. A hover captures twice (once as the
 * pane crazes, once as it lets go), so `reuse` lets the second capture repaint
 * the first one's canvas instead of allocating and uploading a new pair.
 */
export function textureFromVideo(
  video: HTMLVideoElement,
  aniso: number,
  cropAspect?: number,
  reuse?: THREE.Texture | null,
): LoadedTexture | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (video.readyState < 2 || !w || !h) return null;
  try {
    const rect = coverRect(w, h, cropAspect);
    const [cw, ch] = fit(rect[2], rect[3], HERO_MAX);
    const existing = reuse?.image as HTMLCanvasElement | undefined;
    if (reuse && existing && existing.width === cw && existing.height === ch) {
      paint(existing, video, rect);
      reuse.needsUpdate = true;
      return { texture: reuse, aspect: cw / ch };
    }
    return {
      texture: toTexture(draw(video, w, h, HERO_MAX, cropAspect), aniso),
      aspect: cropAspect ?? w / h,
    };
  } catch {
    return null; // tainted frame
  }
}

export function loadTexture(
  src: string,
  aniso: number,
  max = PAGE_MAX,
  cropAspect?: number,
): Promise<LoadedTexture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const w = img.naturalWidth || max;
      const h = img.naturalHeight || Math.round(max / 1.6);
      resolve({
        texture: toTexture(draw(img, w, h, max, cropAspect), aniso),
        aspect: cropAspect ?? w / h,
      });
    };
    img.onerror = () => reject(new Error(`glass: could not load ${src.slice(0, 64)}`));
    img.src = src;
  });
}

/* ── Surface noise ─────────────────────────────────────────────────────────
 * The ripple that makes the glass look poured used to be three simplex
 * evaluations per fragment, which is roughly a hundred and fifty instructions
 * on every pixel the cloud covers. It is the same field every frame, so it is
 * baked once into a small tiling texture instead and scrolled: two fetches
 * where there were three evaluations.
 *
 * Value noise, one octave per channel at three lattice sizes, wrapping so the
 * tile joins itself invisibly. */

function lattice(n: number, seed: number): Float32Array {
  let a = seed >>> 0;
  const g = new Float32Array(n * n);
  for (let i = 0; i < g.length; i++) {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    g[i] = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return g;
}

/** Value noise sampled at (x, y) in cells, wrapping at the lattice edge. */
function valueNoise(g: Float32Array, n: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  // Smoothstep on the fraction: linear interpolation would leave the lattice
  // visible as a grid of creases.
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const at = (i: number, j: number) => g[(((j % n) + n) % n) * n + (((i % n) + n) % n)];
  const a = at(x0, y0);
  const b = at(x0 + 1, y0);
  const c = at(x0, y0 + 1);
  const d = at(x0 + 1, y0 + 1);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

export function noiseTexture(): THREE.Texture {
  const SIZE = 128;
  const cells = [6, 11, 19];
  const grids = cells.map((n, i) => lattice(n, 0x9e3779b9 ^ (i * 0x85ebca6b)));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const image = ctx!.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const o = (y * SIZE + x) * 4;
      for (let c = 0; c < 3; c++) {
        const n = cells[c];
        image.data[o + c] = Math.round(
          valueNoise(grids[c], n, (x / SIZE) * n, (y / SIZE) * n) * 255,
        );
      }
      image.data[o + 3] = 255;
    }
  }
  ctx!.putImageData(image, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  // Data, not colour: it must not be decoded from sRGB on the way in.
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
