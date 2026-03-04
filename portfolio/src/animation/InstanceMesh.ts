import * as THREE from 'three';

export interface InstanceMeshParams {
  side?: THREE.Side;
  transparent?: boolean;
  blending?: THREE.Blending;
}

/**
 * Creates a pseudo-instanced mesh by duplicating base geometry N times
 * with per-instance lookup UVs for GPGPU texture sampling.
 * Ported to modern Three.js (r160+) — uses BufferGeometry only.
 */
export function createInstanceMesh(
  geometry: THREE.BufferGeometry,
  numInstances: number,
  uniforms: Record<string, THREE.IUniform>,
  vs: string,
  fs: string,
  params: InstanceMeshParams = {}
): THREE.Mesh {
  const geo = buildInstancedGeometry(geometry, numInstances);

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vs,
    fragmentShader: fs,
    side: params.side ?? THREE.DoubleSide,
    transparent: params.transparent ?? false,
    blending: params.blending ?? THREE.NormalBlending,
  });

  const mesh = new THREE.Mesh(geo, material);
  return mesh;
}

function buildInstancedGeometry(
  baseGeometry: THREE.BufferGeometry,
  numInstances: number
): THREE.BufferGeometry {
  const posAttr = baseGeometry.getAttribute('position') as THREE.BufferAttribute;
  const normAttr = baseGeometry.getAttribute('normal') as THREE.BufferAttribute;
  const indexAttr = baseGeometry.getIndex();

  // Expand indexed geometry into flat triangle arrays
  let basePositions: Float32Array;
  let baseNormals: Float32Array;
  let numFaces: number;

  if (indexAttr) {
    const indices = indexAttr.array;
    numFaces = indices.length / 3;
    basePositions = new Float32Array(numFaces * 9);
    baseNormals = new Float32Array(numFaces * 9);

    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      basePositions[i * 3 + 0] = posAttr.getX(idx);
      basePositions[i * 3 + 1] = posAttr.getY(idx);
      basePositions[i * 3 + 2] = posAttr.getZ(idx);
      baseNormals[i * 3 + 0] = normAttr.getX(idx);
      baseNormals[i * 3 + 1] = normAttr.getY(idx);
      baseNormals[i * 3 + 2] = normAttr.getZ(idx);
    }
  } else {
    numFaces = posAttr.count / 3;
    basePositions = new Float32Array(posAttr.array);
    baseNormals = new Float32Array(normAttr.array);
  }

  const vertsPerInstance = numFaces * 3;
  const totalVerts = vertsPerInstance * numInstances;
  const lookupSize = Math.ceil(Math.sqrt(numInstances));

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const lookups = new Float32Array(totalVerts * 2);

  for (let i = 0; i < numInstances; i++) {
    const y = Math.floor(i / lookupSize) / lookupSize;
    const x = (i - Math.floor(i / lookupSize) * lookupSize) / lookupSize;
    const a = 0.5 / lookupSize;
    const lookupX = x + a;
    const lookupY = y + a;

    for (let j = 0; j < vertsPerInstance; j++) {
      const srcIdx = j * 3;
      const dstIdx = (i * vertsPerInstance + j) * 3;
      const lookupIdx = (i * vertsPerInstance + j) * 2;

      positions[dstIdx + 0] = basePositions[srcIdx + 0];
      positions[dstIdx + 1] = basePositions[srcIdx + 1];
      positions[dstIdx + 2] = basePositions[srcIdx + 2];

      normals[dstIdx + 0] = baseNormals[srcIdx + 0];
      normals[dstIdx + 1] = baseNormals[srcIdx + 1];
      normals[dstIdx + 2] = baseNormals[srcIdx + 2];

      lookups[lookupIdx + 0] = lookupX;
      lookups[lookupIdx + 1] = lookupY;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('lookup', new THREE.BufferAttribute(lookups, 2));

  return geo;
}
