import * as THREE from 'three';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Rasterizes text to an offscreen canvas and packs the lit pixels into a
 * lookupSize x lookupSize float DataTexture of world-space target positions:
 * texel i = target for particle i (xyz = position near the z=0 plane,
 * w = per-particle random used to stagger arrival).
 */
export async function createTextTargetTexture(
  text: string,
  lookupSize: number,
  worldWidth: number
): Promise<THREE.DataTexture> {
  // Wait for Playfair Display so glyph metrics are real (capped so we never hang).
  await Promise.race([document.fonts.ready, delay(1500)]);

  const cw = 1024;
  const ch = 256;
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'italic 700 190px "Playfair Display", Georgia, serif';
  ctx.fillText(text, cw / 2, ch / 2, cw - 40);

  const img = ctx.getImageData(0, 0, cw, ch).data;
  const lit: [number, number][] = [];
  let minX = cw, maxX = 0, minY = ch, maxY = 0;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (img[(y * cw + x) * 4 + 3] > 128) {
        lit.push([x, y]);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const texels = lookupSize * lookupSize;
  const data = new Float32Array(texels * 4);

  if (lit.length === 0) {
    // Degenerate fallback (font totally failed): cluster near origin.
    for (let i = 0; i < texels; i++) {
      data[i * 4 + 0] = (Math.random() - 0.5) * 0.5;
      data[i * 4 + 1] = (Math.random() - 0.5) * 0.2;
      data[i * 4 + 2] = (Math.random() - 0.5) * 0.06;
      data[i * 4 + 3] = Math.random();
    }
  } else {
    const bboxW = Math.max(1, maxX - minX);
    const bboxH = Math.max(1, maxY - minY);
    const bboxCx = (minX + maxX) / 2;
    const bboxCy = (minY + maxY) / 2;

    // Word spans at most ~72% of the visible width, capped at 2.1 world units.
    const targetW = Math.min(2.1, worldWidth * 0.72);
    const targetH = targetW * (bboxH / bboxW);

    // Prime-stride walk through lit pixels = deterministic shuffle, avoids clumping.
    for (let i = 0; i < texels; i++) {
      const [px, py] = lit[(i * 7919) % lit.length];
      data[i * 4 + 0] = ((px - bboxCx) / bboxW) * targetW + (Math.random() - 0.5) * 0.008;
      data[i * 4 + 1] = -((py - bboxCy) / bboxH) * targetH + (Math.random() - 0.5) * 0.008;
      data[i * 4 + 2] = (Math.random() - 0.5) * 0.06;
      data[i * 4 + 3] = Math.random();
    }
  }

  const texture = new THREE.DataTexture(
    data,
    lookupSize,
    lookupSize,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}
