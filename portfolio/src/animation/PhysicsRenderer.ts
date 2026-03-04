import * as THREE from 'three';

/**
 * GPGPU Physics Renderer — triple-buffer ping-pong simulation on render targets.
 * Ported from the original PhysicsRenderer.js to modern Three.js (r160+).
 */
export class PhysicsRenderer {
  renderer: THREE.WebGLRenderer;
  size: number;
  s2: number;
  resolution: THREE.Vector2;

  rt_1: THREE.WebGLRenderTarget;
  rt_2: THREE.WebGLRenderTarget;
  rt_3: THREE.WebGLRenderTarget;

  counter: number;
  simulation: THREE.ShaderMaterial;
  simulationUniforms: Record<string, THREE.IUniform>;
  texturePassProgram: THREE.ShaderMaterial;

  boundTextures: [THREE.IUniform, string][];

  camera: THREE.OrthographicCamera;
  scene: THREE.Scene;
  mesh: THREE.Mesh;

  output: THREE.WebGLRenderTarget;
  oOutput: THREE.WebGLRenderTarget;
  ooOutput: THREE.WebGLRenderTarget;

  // Internal shaders
  private static VSPass = [
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
    '}',
  ].join('\n');

  private static FSPass = [
    'uniform sampler2D tDiffuse;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec4 c = texture2D( tDiffuse , vUv );',
    '  gl_FragColor = c ;',
    '}',
  ].join('\n');

  constructor(size: number, shader: string, renderer: THREE.WebGLRenderer) {
    this.checkCompatibility(renderer);
    this.renderer = renderer;
    this.size = size;
    this.s2 = size * size;
    this.resolution = new THREE.Vector2(size, size);

    const rtOptions: THREE.RenderTargetOptions = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      stencilBuffer: false,
    };

    this.rt_1 = new THREE.WebGLRenderTarget(size, size, rtOptions);
    this.rt_2 = this.rt_1.clone();
    this.rt_3 = this.rt_1.clone();

    this.counter = 0;
    this.boundTextures = [];

    // GPGPU ortho setup
    this.camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1);
    this.scene = new THREE.Scene();
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
    this.scene.add(this.mesh);

    // Create programs
    this.texturePassProgram = this.createTexturePassProgram();
    this.simulation = this.createSimulationProgram(shader);
    this.simulationUniforms = this.simulation.uniforms;

    // Initialize outputs to avoid null references
    this.output = this.rt_3;
    this.oOutput = this.rt_2;
    this.ooOutput = this.rt_1;
  }

  private checkCompatibility(renderer: THREE.WebGLRenderer): void {
    const gl = renderer.getContext();
    if (gl instanceof WebGL2RenderingContext) return; // WebGL2 has float textures built-in
    // WebGL1 fallback check
    if (!gl.getExtension('OES_texture_float')) {
      console.error('PhysicsRenderer: No Float Textures support');
    }
    if (gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) === 0) {
      console.error('PhysicsRenderer: Vertex shader textures not supported');
    }
  }

  private createTexturePassProgram(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
      },
      vertexShader: PhysicsRenderer.VSPass,
      fragmentShader: PhysicsRenderer.FSPass,
    });
  }

  private createSimulationProgram(sim: string): THREE.ShaderMaterial {
    this.simulationUniforms = {
      t_oPos: { value: null },
      t_pos: { value: null },
      resolution: { value: this.resolution },
    };

    return new THREE.ShaderMaterial({
      uniforms: this.simulationUniforms,
      vertexShader: PhysicsRenderer.VSPass,
      fragmentShader: sim,
    });
  }

  update(): void {
    const flipFlop = this.counter % 3;

    if (flipFlop === 0) {
      this.simulation.uniforms.t_oPos.value = this.rt_1.texture;
      this.simulation.uniforms.t_pos.value = this.rt_2.texture;
      this.pass(this.simulation, this.rt_3);
      this.ooOutput = this.rt_1;
      this.oOutput = this.rt_2;
      this.output = this.rt_3;
    } else if (flipFlop === 1) {
      this.simulation.uniforms.t_oPos.value = this.rt_2.texture;
      this.simulation.uniforms.t_pos.value = this.rt_3.texture;
      this.pass(this.simulation, this.rt_1);
      this.ooOutput = this.rt_2;
      this.oOutput = this.rt_3;
      this.output = this.rt_1;
    } else {
      this.simulation.uniforms.t_oPos.value = this.rt_3.texture;
      this.simulation.uniforms.t_pos.value = this.rt_1.texture;
      this.pass(this.simulation, this.rt_2);
      this.ooOutput = this.rt_3;
      this.oOutput = this.rt_1;
      this.output = this.rt_2;
    }

    this.counter++;
    this.bindTextures();
  }

  private pass(shader: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget): void {
    this.mesh.material = shader;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
  }

  setUniforms(uniforms: Record<string, THREE.IUniform>): void {
    for (const key in uniforms) {
      this.simulation.uniforms[key] = uniforms[key];
    }
    // Preserve required internal uniforms
    this.simulation.uniforms.t_pos = { value: null };
    this.simulation.uniforms.t_oPos = { value: null };
    this.simulation.uniforms.resolution = { value: this.resolution };
  }

  setUniform(name: string, u: THREE.IUniform): void {
    this.simulation.uniforms[name] = u;
  }

  reset(texture: THREE.DataTexture): void {
    this.texturePassProgram.uniforms.tDiffuse.value = texture;
    this.pass(this.texturePassProgram, this.rt_1);
    this.pass(this.texturePassProgram, this.rt_2);
    this.pass(this.texturePassProgram, this.rt_3);
  }

  resetRand(spread: number, alpha?: boolean): void {
    const data = new Float32Array(this.s2 * 4);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() - 0.5) * spread;
      if (alpha && i % 4 === 3) {
        data[i] = 0;
      }
    }

    const texture = new THREE.DataTexture(
      data,
      this.size,
      this.size,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.needsUpdate = true;

    this.reset(texture);
  }

  addBoundTexture(uniform: THREE.IUniform, value: string): void {
    this.boundTextures.push([uniform, value]);
  }

  private bindTextures(): void {
    for (const [uniform, textureToBind] of this.boundTextures) {
      const rt = (this as any)[textureToBind] as THREE.WebGLRenderTarget;
      if (rt) {
        uniform.value = rt.texture;
      }
    }
  }

  dispose(): void {
    this.rt_1.dispose();
    this.rt_2.dispose();
    this.rt_3.dispose();
    this.simulation.dispose();
    this.texturePassProgram.dispose();
  }
}
