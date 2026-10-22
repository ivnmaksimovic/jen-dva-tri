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
  /**
   * How far the view leans off straight-down, radians FROM VERTICAL: 0 is top
   * down, larger values lower the camera toward the horizon. Default reproduces
   * the old fixed framing exactly (atan2(back, height)).
   */
  tilt: number;
  /** Set true if the rotation reads backwards; then it is a flip, not a rewrite. */
  invertRotate: boolean;
  /** False once the player has panned: the camera stays where they left it. */
  following: boolean;
}

const DEFAULT_HEIGHT = 5.2;
const DEFAULT_BACK = 1.8;

export const DEFAULT_CAMERA_PARAMS: CameraParams = {
  height: DEFAULT_HEIGHT,
  back: DEFAULT_BACK,
  follow: 5,
  zoom: 1,
  yaw: 0,
  tilt: Math.atan2(DEFAULT_BACK, DEFAULT_HEIGHT), // the old fixed framing, unchanged
  following: true,
  invertRotate: false,
};

/** How much of a finger-drag becomes tilt (radians per CSS pixel). */
const TILT_PER_PX = 0.005;
/**
 * Tilt limits from vertical: 0 is straight down (bird's eye), 1.45 rad (~83 deg)
 * puts the camera nearly on the ground. Bird's eye must be REACHABLE — it was
 * clamped just short of it before, which read as broken.
 */
const TILT_MAX = 1.45;
const TILT_MIN = 0;

/**
 * Zoom limits. ZOOM_MAX is deliberately enormous: the Track can be huge and
 * seeing all of it matters more than seeing the Cars, which the user said not
 * to worry about. `Game`'s far plane was widened to match (it clipped at 100).
 */
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 60;

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
     *
     * NOT a synthetic pointercancel on the canvas: the first attempt did that,
     * and this very rig then heard the event too, deleted both fingers and
     * killed its own gesture before it began. Cancelling must be a call to the
     * layer, never a message posted to everyone.
     */
    private readonly onClaim: () => void,
    /** Called once every finger is up, so the Push schemes can hear again. */
    private readonly onRelease: () => void,
  ) {
    const el = game.renderer.domElement;
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e));
    // Right-drag pans, so the browser must keep its menu out of it.
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const before = this.groundAt(e);
        // Wheel up = closer. Same exponential feel whatever device you are on.
        const step = Math.exp((e.deltaY < 0 ? -1 : 1) * 0.12);
        this.params.zoom = THREE.MathUtils.clamp(
          this.params.zoom * step,
          ZOOM_MIN,
          ZOOM_MAX,
        );
        this.params.following = false;
        this.apply(); // right now, so the pointer still sits over the same spot
        const after = this.groundAt(e);
        if (before && after) this.target.add(before.clone().sub(after));
      },
      { passive: false },
    );
  }

  private ndc(e: { clientX: number; clientY: number }): THREE.Vector2 {
    const r = this.game.renderer.domElement.getBoundingClientRect();
    return this.pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
  }

  /**
   * Where the ground plane meets this ray — how pan distances are measured.
   * Takes only clientX/clientY, because it is asked about mouse drags and wheel
   * events as happily as fingers, and none of them need anything else.
   */
  private groundAt(e: { clientX: number; clientY: number }): THREE.Vector3 | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(this.ndc(e as PointerEvent), this.game.camera);
    const out = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), out)
      ? out
      : null;
  }

  private down(e: PointerEvent): void {
    if (this.mouseDown(e)) return;
    if (this.touches.has(e.pointerId)) return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.touches.size !== 2) return;
    // Two fingers is the camera's, always. The Push scheme must let go.
    this.gesturing = true;
    this.params.following = false;
    this.beginPinch();
    this.onClaim();
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

  /**
   * MOUSE / DESKTOP. The left button belongs to the game — that is how you
   * flick a Car with a mouse — so the camera takes the buttons Maps and most 3D
   * tools leave free:
   *
   *   wheel      zoom (towards the pointer, like Maps)
   *   right-drag pan — the map moves with the pointer
   *   middle-drag rotate (sideways) and tilt (up/down)
   *   alt-drag / shift-drag do the same for trackpads with no middle button
   *
   * Recognised only when `pointerType` is mouse or pen, so synthetic events in
   * headless checks can never accidentally drive the camera.
   */
  private mouse: { id: number; mode: 'pan' | 'orbit' } | null = null;
  private readonly lastPointer = new THREE.Vector2();

  private static isMouse(e: PointerEvent): boolean {
    return e.pointerType === 'mouse' || e.pointerType === 'pen';
  }

  private mouseDown(e: PointerEvent): boolean {
    if (!CameraRig.isMouse(e)) return false;
    if (e.button === 2 || e.altKey) this.mouse = { id: e.pointerId, mode: 'pan' };
    else if (e.button === 1 || e.shiftKey) this.mouse = { id: e.pointerId, mode: 'orbit' };
    else return false; // left button: that one is the game's
    this.params.following = false;
    this.lastPointer.set(e.clientX, e.clientY);
    this.onClaim();
    return true;
  }

  private mouseMove(e: PointerEvent): void {
    if (!this.mouse) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.lastPointer.set(e.clientX, e.clientY);
    if (this.mouse.mode === 'orbit') {
      // Same convention as two fingers: the view follows the pointer.
      this.params.yaw += (this.params.invertRotate ? -dx : dx) * 0.006;
      this.params.tilt = THREE.MathUtils.clamp(
        this.params.tilt + dy * TILT_PER_PX,
        TILT_MIN,
        TILT_MAX,
      );
      return;
    }
    // Pan: measure the ground point under the pointer before and after, so the
    // world slides exactly with the cursor instead of by guessed pixels.
    const before = this.groundAt({ clientX: e.clientX - dx, clientY: e.clientY - dy } as PointerEvent);
    const after = this.groundAt(e);
    if (before && after) this.target.add(before.clone().sub(after));
  }

  private move(e: PointerEvent): void {
    if (this.mouse) {
      this.mouseMove(e);
      return;
    }
    if (!this.touches.has(e.pointerId)) return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!this.gesturing || this.touches.size < 2) return;
    const pts = [...this.touches.values()];
    const [a, b] = pts;
    const mid0 = new THREE.Vector2((a.x + b.x) / 2, (a.y + b.y) / 2);
    if (this.touches.size >= 3) {
      /**
       * Three fingers means TILT and nothing else. It used to keep panning too,
       * so a tilt swipe that hit the limit carried straight on into a pan.
       */
      const dyAll = mid0.y - this.lastMidScreen.y;
      this.params.tilt = THREE.MathUtils.clamp(
        this.params.tilt + dyAll * TILT_PER_PX,
        TILT_MIN,
        TILT_MAX,
      );
      this.lastMidScreen.copy(mid0);
      return;
    }
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
    /**
     * The MAP follows the fingers, as every maps app does: twisting clockwise
     * turns the map clockwise. The camera therefore orbits the other way round,
     * which is a positive yaw (see `update`). It was the other way about when
     * first built, and read as broken.
     */
    this.params.yaw += this.params.invertRotate ? -dAngle : dAngle;

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
    if (CameraRig.isMouse(e) && e.pointerId === this.mouse?.id) this.mouse = null;
    if (this.mouse && e.pointerId === this.mouse.id) {
      this.mouse = null;
      this.onRelease();
      return;
    }
    this.touches.delete(e.pointerId);
    if (this.touches.size === 0) {
      this.gesturing = false;
      this.pinchDist = 0;
      this.onRelease();
      return;
    }
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
    this.params.tilt = DEFAULT_CAMERA_PARAMS.tilt;
    this.params.following = true;
    this.target.copy(carPosition);
  }

  /** The camera's offset from what it is looking at, in world space. */
  private offset(): THREE.Vector3 {
    // One distance, one angle off vertical: zoom changes how far away we are,
    // tilt changes how steeply we look down. (Previously both were scaled
    // independently, which made tilt impossible to express at all.)
    const dist = Math.hypot(this.params.height, this.params.back) * this.params.zoom;
    return new THREE.Vector3(0, Math.cos(this.params.tilt), Math.sin(this.params.tilt))
      .multiplyScalar(dist)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.params.yaw);
  }

  /** Write the camera out right now — used by the wheel handler so that the
   *  ground point under the pointer is honest before we measure it again. */
  private apply(): void {
    this.game.camera.position.copy(this.target.clone().add(this.offset()));
    this.game.camera.lookAt(this.target);
  }

  /** Once per frame, after physics and before render. */
  update(dt: number, carPosition: THREE.Vector3): void {
    if (!this.started) {
      this.target.copy(carPosition);
      this.started = true;
    }
    if (this.params.following) {
      const k = 1 - Math.exp(-this.params.follow * dt);
      this.target.lerp(carPosition, k);
      this.game.camera.position.lerp(this.target.clone().add(this.offset()), k);
      this.game.camera.lookAt(this.target);
      return;
    }
    this.apply();
  }
}
