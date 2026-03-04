import * as THREE from 'three';
import { PhysicsRenderer } from './PhysicsRenderer';
import { createInstanceMesh } from './InstanceMesh';

export interface CurlParams {
  geometry: THREE.BufferGeometry;
  instanceNumber: number;
  renderer: THREE.WebGLRenderer;
  vertexShader: string;
  fragmentShader: string;
  simulationShader: string;
  bodyUniforms: Record<string, THREE.IUniform>;
  soulUniforms: Record<string, THREE.IUniform>;
}

/**
 * Curl particle system — orchestrates GPGPU physics simulation + instanced mesh rendering.
 * Ported from Curl.js to TypeScript with modern Three.js.
 */
export class Curl {
  active = false;
  soul: PhysicsRenderer;
  body: THREE.Mesh;

  constructor(params: CurlParams) {
    const bodyUniforms: Record<string, THREE.IUniform> = {
      t_pos: { value: null },
      t_oPos: { value: null },
      t_ooPos: { value: null },
    };

    // Merge in external body uniforms
    for (const key in params.bodyUniforms) {
      if (!bodyUniforms[key]) {
        bodyUniforms[key] = params.bodyUniforms[key];
      }
    }

    const lookupSize = Math.ceil(Math.sqrt(params.instanceNumber));

    // Create GPGPU simulation
    this.soul = new PhysicsRenderer(
      lookupSize,
      params.simulationShader,
      params.renderer
    );

    // Bind render target textures to body uniforms
    this.soul.addBoundTexture(bodyUniforms.t_pos, 'output');
    this.soul.addBoundTexture(bodyUniforms.t_oPos, 'oOutput');
    this.soul.addBoundTexture(bodyUniforms.t_ooPos, 'ooOutput');

    // Initialize particles near the origin (small spread for fan-out effect)
    this.soul.resetRand(0.01);

    // Set simulation uniforms
    this.soul.setUniforms(params.soulUniforms);

    // Create instanced rendering mesh
    this.body = createInstanceMesh(
      params.geometry,
      params.instanceNumber,
      bodyUniforms,
      params.vertexShader,
      params.fragmentShader,
      { side: THREE.DoubleSide }
    );

    this.body.frustumCulled = false;
  }

  update(): void {
    if (this.active) {
      this.soul.update();
    }
  }

  activate(scene: THREE.Scene): void {
    scene.add(this.body);
    this.active = true;
  }

  deactivate(scene: THREE.Scene): void {
    scene.remove(this.body);
    this.active = false;
  }

  dispose(): void {
    this.soul.dispose();
    if (this.body.geometry) this.body.geometry.dispose();
    if (this.body.material instanceof THREE.Material) this.body.material.dispose();
  }
}
