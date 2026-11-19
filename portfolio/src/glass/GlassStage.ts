import * as THREE from 'three';

/* ── Glass stage ───────────────────────────────────────────────────────────
 * One transparent WebGL layer over the whole page, shared by every card, and
 * a camera set up so that **one world unit is one CSS pixel at z = 0**.
 *
 * That calibration is the whole trick. It means a shard sitting at the
 * media element's coordinates lines up with the picture underneath to the
 * pixel, with no fitting or fudge factors — and the moment a shard moves
 * along +z it is genuinely nearer the eye, so it grows, slides outward from
 * the middle of the screen, and parallaxes against its neighbours the way a
 * real object would. Depth here is not a drop shadow standing in for depth.
 *
 * The loop only runs while a card is doing something; the last one to finish
 * turns it off. The particle field owns its own canvas below this one. */

const FOV = 52;

export interface StageClient {
  /** Advance by `dt` seconds. Return false once there is nothing left to do. */
  tick(dt: number, now: number): boolean;
}

export class GlassStage {
  private static instance: GlassStage | null = null;

  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;

  /** Camera distance in px — how far z has to travel to matter. */
  depth = 0;
  width = 0;
  height = 0;

  private clients = new Set<StageClient>();
  private raf = 0;
  private lastT = 0;
  private resizeHandler: () => void;

  static shared(): GlassStage {
    return (GlassStage.instance ??= new GlassStage());
  }

  private constructor() {
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      // The shards are drawn over live DOM, so the buffer has to keep its
      // alpha and the browser has to composite it, not us.
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearAlpha(0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.canvas = this.renderer.domElement;
    this.canvas.className = 'glass-layer';
    this.canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 10, 12000);

    this.resizeHandler = () => this.resize();
    window.addEventListener('resize', this.resizeHandler);
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    // Put the eye exactly far enough back that the plane at z = 0 covers the
    // viewport, so world units and CSS pixels agree there.
    this.depth = h / 2 / Math.tan((FOV / 2) * (Math.PI / 180));
    this.camera.aspect = w / h;
    this.camera.position.set(0, 0, this.depth);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }

  /** Viewport coordinates (CSS px, y down) to world coordinates (y up). */
  toWorld(x: number, y: number): [number, number] {
    return [x - this.width / 2, this.height / 2 - y];
  }

  /**
   * How much a point at depth `z` is magnified on screen. Handed to the
   * shards so a target can be aimed at a place on screen rather than at a
   * place in space.
   */
  magnification(z: number): number {
    return this.depth / Math.max(1, this.depth - z);
  }

  add(obj: THREE.Object3D): void {
    this.scene.add(obj);
  }

  remove(obj: THREE.Object3D): void {
    this.scene.remove(obj);
  }

  join(client: StageClient): void {
    this.clients.add(client);
    if (!this.raf) {
      this.lastT = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  leave(client: StageClient): void {
    this.clients.delete(client);
  }

  private frame = (now: number): void => {
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastT) / 1000));
    this.lastT = now;

    for (const client of Array.from(this.clients)) {
      if (!client.tick(dt, now)) this.clients.delete(client);
    }

    this.renderer.render(this.scene, this.camera);

    if (this.clients.size) {
      this.raf = requestAnimationFrame(this.frame);
    } else {
      // Nothing left in flight: clear the layer and stop burning frames.
      this.raf = 0;
      this.renderer.clear();
    }
  };
}
