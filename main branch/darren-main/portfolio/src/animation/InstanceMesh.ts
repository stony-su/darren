import * as THREE from 'three';

export interface InstanceMeshParams {
  side?: THREE.Side;
  transparent?: boolean;
  blending?: THREE.Blending;
  defines?: Record<string, string>;
}

/**
 * Creates a true GPU-instanced mesh: one shared copy of the base geometry
 * drawn N times via InstancedBufferGeometry, with a per-instance `lookup`
 * UV attribute for GPGPU position-texture sampling.
 */
export function createInstanceMesh(
  geometry: THREE.BufferGeometry,
  numInstances: number,
  uniforms: Record<string, THREE.IUniform>,
  vs: string,
  fs: string,
  params: InstanceMeshParams = {}
): THREE.Mesh {
  const geo = new THREE.InstancedBufferGeometry();
  geo.instanceCount = numInstances;

  const index = geometry.getIndex();
  if (index) geo.setIndex(index);
  geo.setAttribute('position', geometry.getAttribute('position'));
  geo.setAttribute('normal', geometry.getAttribute('normal'));

  // Per-instance lookup UV: texel center i -> ((i % ls) + .5)/ls, (floor(i/ls) + .5)/ls.
  // Must match the simulation's gl_FragCoord.xy / resolution mapping exactly.
  const lookupSize = Math.ceil(Math.sqrt(numInstances));
  const lookups = new Float32Array(numInstances * 2);
  for (let i = 0; i < numInstances; i++) {
    lookups[i * 2 + 0] = ((i % lookupSize) + 0.5) / lookupSize;
    lookups[i * 2 + 1] = (Math.floor(i / lookupSize) + 0.5) / lookupSize;
  }
  geo.setAttribute('lookup', new THREE.InstancedBufferAttribute(lookups, 2));

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vs,
    fragmentShader: fs,
    side: params.side ?? THREE.DoubleSide,
    transparent: params.transparent ?? false,
    blending: params.blending ?? THREE.NormalBlending,
    defines: params.defines ?? {},
  });

  return new THREE.Mesh(geo, material);
}
