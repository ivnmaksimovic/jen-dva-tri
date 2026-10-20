import * as THREE from 'three';
import type { Game } from '../Game.js';

/**
 * THROWAWAY PROTOTYPE CODE — ticket 19: the camera is controllable.
 *
 * Every tester reached for zoom and rotate unprompted, including the author, so
 * the old "fixed near-top view" decision is gone. What replaces it:
 *
 *   **One finger belongs to the game, two fingers belong to the camera.** That
 *   split is the whole reason this is its own module instead of gestures bolted
 *   into the two control schemes: A and C mean opposite-ish things about a
 *   touch, but neither may own two fingers, so the camera can claim them
 *   without knowing which Push scheme happens to be live. Pinch = zoom,
 *   twist = rotate, two-finger drag = pan. (With three or more down, nothing
 *   changes: two is already the camera's.)
 *
 *   **Following is a mode, not a property.** The camera follows the aimed Car
 *   until the player first touches it with two fingers — then it stays where
 *   they put it. Recentre gives it back: default birdseye framing over the
 *   SELECTED Car (which is also the last Car pushed, since selection follows
 *   whatever you push). Zoom and rotation survive a Push; they are offsets you
 *   chose, and having them reset under your hands would feel broken.
 */

export interface CameraParams {
  /** Default framing: the same numbers the fixed camera used. */
  height: number;
  back: number;
  /** How fast it chases the Car while following (1/s). */
  follow: number;
  /** Manual offsets the player has chosen. `zoom` multiplies the framing. */
  zoom: number;
  /** Rotation around the Car, radians (0 = the fixed world heading). */
  yaw: number;
  /** False once the player has panned: the camera stays where they left it. */
  following: boolean;
}

export const DEFAULT_CAMERA_PARAMS: CameraParams = {
  height: 5.2,
  back: 1.8,
  follow: 5,
  zoom: 1,
  yaw: 0,
  following: true,
};

/** Zoom limits: room enough to see a whole loop, not enough to lose the Car. */
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2.5;

export class CameraRig {
  /** Where the camera looks. It only chases the Car while `following`. */
  private readonly target = new THREE.Vector3();
  private readonly pointer = new THREE.Vector2();
  /** Two-finger gesture bookkeeping — dies with the gesture, like all of it. */
  private readonly touches = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private pinchAngle = 0;
  private readonly pinchMid = new THREE.Vector2();
  private gesturing = false;
  /** Drag-per-frame while the Car is being followed: the camera must not lag. */
  private started = false;

  constructor(
    private readonly game: Game,
    readonly params: CameraParams,
    /**
     * Called when a camera gesture begins, so whichever Push scheme owns the
     * canvas can drop the gesture it thought it had. Two fingers is a claim the
     * game layer cannot refuse.
     */
    private readonly onClaim: (pointerIds: number[]) => void,
  ) {
    const el = game.renderer.domElement;
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e));
  }

  private ndc(e: PointerEvent): THREE.Vector2 {
    const r = this.game.renderer.domElement.getBoundingClientRect();
    return this.pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
  }

  /** Where the ground plane meets this ray — how pan distances are measured. */
  private groundAt(e: PointerEvent): THREE.Vector3 | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(this.ndc(e), this.game.camera);
    const out = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), out)
      ? out
      : null;
  }

  private down(e: PointerEvent): void {
    if (this.touches.has(e.pointerId)) return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.touches.size !== 2) return;
    // Two fingers is the camera's, always. The Push scheme must let go.
    this.gesturing = true;
    this.params.following = false;
    this.beginPinch();
    this.onClaim([...this.touches.keys()]);
  }

  private beginPinch(): void {
    const pts = [...this.touches.values()];
    const [a, b] = pts;
    this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    this.pinchAngle = Math.atan2(b.y - a.y, b.x - a.x);
    this.pinchMid.set((a.x + b.x) / 2, (a.y + b.y) / 2);
    this.lastMidScreen = this.pinchMid.clone();
  }

  private lastMidScreen = new THREE.Vector2();

  private move(e: PointerEvent): void {
    if (!this.touches.has(e.pointerId)) return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!this.gesturing || this.touches.size < 2) return;
    const pts = [...this.touches.values()];
    const [a, b] = pts;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const mid = new THREE.Vector2((a.x + b.x) / 2, (a.y + b.y) / 2);

    // Pinch: how much further apart the fingers got is how much closer we get.
    if (this.pinchDist > 0) {
      const ratio = dist / this.pinchDist;
      this.params.zoom = THREE.MathUtils.clamp(
        this.params.zoom / ratio,
        ZOOM_MIN,
        ZOOM_MAX,
      );
    }
    // Twist: the fingers sweeping round moves us round with them.
    let dAngle = angle - this.pinchAngle;
    if (dAngle > Math.PI) dAngle -= Math.PI * 2;
    if (dAngle < -Math.PI) dAngle += Math.PI * 2;
    this.params.yaw -= dAngle;

    // Pan: the ground point under the midpoint is what slides under the fingers,
    // so measure the slide in WORLD units rather than guessing at pixels.
    const before = this.groundAt({ clientX: this.lastMidScreen.x, clientY: this.lastMidScreen.y } as PointerEvent);
    const after = this.groundAt({ clientX: mid.x, clientY: mid.y } as PointerEvent);
    if (before && after) {
      const slide = before.clone().sub(after);
      this.target.add(slide); // drag the world this way; keep what we were looking at
    }

    this.pinchDist = dist;
    this.pinchAngle = angle;
    this.pinchMid.copy(mid);
    this.lastMidScreen.copy(mid);
  }

  private up(e: PointerEvent): void {
    this.touches.delete(e.pointerId);
    if (this.touches.size < 2) {
      this.gesturing = false;
      this.pinchDist = 0;
      return;
    }
    // One finger of three lifted: re-seed from the surviving two rather than
    // jumping by whatever distance the pair now happens to be at.
    this.beginPinch();
  }

  /** Back to the default birdseye over the selected Car, following again. */
  recentre(carPosition: THREE.Vector3): void {
    this.params.zoom = 1;
    this.params.yaw = 0;
    this.params.following = true;
    this.target.copy(carPosition);
  }

  /** Once per frame, after physics and before render. */
  update(dt: number, carPosition: THREE.Vector3): void {
    const cam = this.game.camera;
    if (!this.started) {
      this.target.copy(carPosition);
      this.started = true;
    }
    if (this.params.following) {
      const k = 1 - Math.exp(-this.params.follow * dt);
      this.target.lerp(carPosition, k);
    }
    const height = this.params.height * this.params.zoom;
    const back = this.params.back * this.params.zoom;
    // Rotate the whole offset around the target by the yaw the player chose, so
    // rotation reads as orbiting the Car rather than spinning the map.
    const offset = new THREE.Vector3(0, height, back).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      this.params.yaw,
    );
    const desired = this.target.clone().add(offset);
    const k = this.params.following ? 1 - Math.exp(-this.params.follow * dt) : 1;
    cam.position.lerp(desired, this.gesturing ? 1 : k);
    cam.lookAt(this.target);
  }
}
