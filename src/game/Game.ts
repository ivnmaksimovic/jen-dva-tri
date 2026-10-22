import * as THREE from 'three';

export interface GameOptions {
  container: HTMLElement;
}

/**
 * Core engine wrapper: owns the renderer, scene, camera and the main loop.
 * Scene content and game logic live outside this class, so the engine stays
 * reusable regardless of what the game becomes.
 */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  private readonly container: HTMLElement;
  private readonly clock = new THREE.Clock();
  private readonly updaters = new Set<(dt: number) => void>();
  private running = false;

  constructor({ container }: GameOptions) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    // Clamp pixel ratio — 3x on mobile wastes fill-rate and battery for no visual gain.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // Far plane wide enough to zoom out over a whole Track: the camera can now go
    // dozens of world units up, and 100 clipped the world away at that distance.
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.05, 4000);
    this.camera.position.set(0, 0.6, 3);
    this.camera.lookAt(0, 0, 0);

    window.addEventListener('resize', () => this.onResize());
    this.onResize();
  }

  /** Register a per-frame update function; receives delta time in seconds. */
  onUpdate(fn: (dt: number) => void): void {
    this.updaters.add(fn);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  stop(): void {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  private tick(): void {
    const dt = this.clock.getDelta();
    for (const update of this.updaters) update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private onResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
