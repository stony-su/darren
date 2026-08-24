import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function createFeatherGeometry(size: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Stem — thin vertical rectangle
  const stem = new THREE.PlaneGeometry(1, 1, 1, 1);
  stem.scale(0.2 * 0.2 * size, 3 * 0.2 * size, 0.2 * 0.2 * size);
  parts.push(stem);

  // Barbs — 10 pairs on each side
  const height = 0.65;
  const numOf = 10;

  for (let i = 0; i < numOf; i++) {
    for (let j = 0; j < 2; j++) {
      const barb = new THREE.PlaneGeometry(1, 1, 1, 1);
      const sx = 0.4 * 0.1 * size;
      const sy = 2.5 * 0.1 * size;
      const sz = 0.4 * 0.1 * size;

      const mat = new THREE.Matrix4();

      const px = ((j - 0.5) * 2) * 0.1 * size;
      const py = (-0.5 + (i / numOf)) * height * size;
      const rz = ((j - 0.5) * 2) * Math.PI / 3;

      mat.compose(
        new THREE.Vector3(px, py, 0),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)),
        new THREE.Vector3(sx, sy, sz)
      );

      barb.applyMatrix4(mat);
      parts.push(barb);
    }
  }

  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('Failed to merge feather geometry');
  merged.computeVertexNormals();

  // Dispose individual parts
  parts.forEach(p => p.dispose());

  return merged;
}
