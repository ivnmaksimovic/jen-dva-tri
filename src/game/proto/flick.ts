import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Game } from '../Game.js';
import type { Car } from './car.js';
import { Finger, DEFAULT_FINGER_PARAMS, type FingerParams } from './finger.js';

/**
 * THROWAWAY PROTOTYPE CODE — the FLICK control scheme (option C), ticket 18.
 *
 * The slingshot asks you to aim and then release. This one keeps the whole Push
 * in one motion: touch down anywhere, sweep your finger through the Car, and
 * the strike happens where your finger meets it. No aiming pause, no arrow, no
 * strength metronome — which is the point, and also why everything about how
 * hard you hit comes from how fast the finger ARRIVES (see `check:finger`).
 *
 * Rules carried over from grilling (ticket 18), stated where they bite:
 *  - **Selection is tap-only.** A flick never changes which Car is aimed, even
 *    if it sweeps over three of them; the finger is also a ghost to every Car
 *    but the aimed one, so sweeping through a neighbour cannot disturb it.
 *  - **Touching down ON the Car does nothing** — no Push, same reason the
 *    slingshot requires the strike to come in from outside.
 *  - **One gesture, one Push.** Everything a gesture owns dies with it.
 *
 * The Push itself is not computed here. All this file does is follow the touch:
 * `Finger` is the body in the world, and whatever happens next is contact.
 */

/** How long a landed strike marker stays readable (seconds), per ticket 18. */
const MARKER_LINGER = 2;

export interface FlickParams extends FingerParams {
  /** Which control scheme is live: C off means this input layer is deaf. */
  on: boolean;
}

export const DEFAULT_FLICK_PARAMS: FlickParams = {
  ...DEFAULT_FINGER_PARAMS,
  on: true,
};

export function setupFlick(
  game: Game,
  /** The Rapier world — `proto.ts` owns it, not `Game`. */
  world: RAPIER.World,
  /** The aimed Car — set by TAPS and by the GUI, never by a flick. */
  getCar: () => Car,
  params: FlickParams,
  onPush: () => void,
  onRefused: (reason: string) => void,
  canPush: () => boolean,
  /** Called with the strike's contact point so it can be shown afterwards. */
  onStrike: (point: THREE.Vector3) => void,
  /** Run between physics steps (called by the host's step loop). */
  perStep: (fn: () => void) => void,
  /** Whether this scheme is listening at all (toggled live from the GUI). */
  enabled: () => boolean,
  /**
   * Gesture arbitration with the slingshot: both listen to the same canvas, and
   * a touch ON the Car means "start aiming" to it while here it must mean
   * nothing. Exactly one layer may own a gesture — decided once, at touch-down.
   */
  claimGesture?: (pointerId: number) => boolean,
  releaseGesture?: () => void,
): void {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const el = game.renderer.domElement;
  el.style.touchAction = 'none';

  /** One gesture, or nothing. Dies on release — see the map's 2026-10-11 note. */
  let finger: Finger | null = null;
  let pointerId = -1;
  /** Set the moment contact lands, so one swipe cannot claim two Pushes. */
  let struck = false;
  let strikePoint = new THREE.Vector3();

  function toNDC(e: PointerEvent): void {
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  /**
   * Where the touch meets the plane the Car's chassis lives on. The finger is
   * presented at that height (a knuckle meets the bodywork, not the ground), so
   * the gesture plane has to be the same one the body sits in.
   */
  function fingerPoint(e: PointerEvent): THREE.Vector3 | null {
    toNDC(e);
    raycaster.setFromCamera(ndc, game.camera);
    const car = getCar();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -car.position.y);
    const out = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, out) ? out : null;
  }

  /** Is this touch down ON the aimed Car? Then it is not the start of a flick. */
  function touchesCar(e: PointerEvent): boolean {
    toNDC(e);
    raycaster.setFromCamera(ndc, game.camera);
    return raycaster.intersectObjects(getCar().group.children, true).length > 0;
  }

  el.addEventListener('pointerdown', (e) => {
    if (!params.on || !enabled()) return;
    if (finger || pointerId >= 0) return; // first pointer owns the gesture
    if (claimGesture && !claimGesture(e.pointerId)) return; // another layer owns it
    /**
     * Started ON the Car: not a flick (the strike must come in from outside).
     * It is not a selection change either — that is the slingshot's job, and it
     * only gets the gesture if we hand the claim back.
     */
    if (touchesCar(e)) {
      releaseGesture?.();
      return;
    }
    const at = fingerPoint(e);
    if (!at) {
      releaseGesture?.();
      return;
    }
    const car = getCar();
    if (!car.atRest()) {
      onRefused(`${car.params.name} must be at rest before the next Push`);
      releaseGesture?.();
      return;
    }
    if (!canPush()) {
      onRefused(`Turn over — ${car.params.name} is out of Pushes (Next Turn)`);
      releaseGesture?.();
      return;
    }
    struck = false;
    pointerId = e.pointerId;
    // Aims at the aimed Car ONLY: every other Car, the Terrain and the Surface
    // pads are ghosts to it, so a swipe across the Track disturbs nothing else.
    finger = Finger.begin(world, at, car, params);
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Some synthetic pointers can't be captured; the swipe still tracks.
    }
  });

  el.addEventListener('pointermove', (e) => {
    if (!finger || e.pointerId !== pointerId) return;
    const at = fingerPoint(e);
    if (at) nextTarget = at;
  });

  el.addEventListener('pointerup', endGesture);
  el.addEventListener('pointercancel', endGesture);

  /** Where the touch wants the finger this frame; drive owns the permission. */
  let nextTarget = new THREE.Vector3();

  function endGesture(): void {
    if (!finger) return;
    finger.end();
    finger = null;
    pointerId = -1;
    nextTarget.set(0, 0, 0);
    releaseGesture?.();
  }

  perStep(() => {
    if (!finger) return;
    // Driven every STEP, not every frame: the physics runs 4 steps per frame,
    // and a finger that only moved once per frame would teleport 8 mm at a
    // swipe while asking contact to be resolved in between.
    finger.drive(nextTarget, true, 1 / 240);
    if (struck) return;
    // First contact on this gesture IS the strike. Where it lands is decided by
    // contact, not by us: the weighted centre of the contact points, on the
    // body, at the height the finger met it.
    const report = finger.contactReport();
    const live = report.filter((c) => c.impulse > 0);
    if (live.length === 0) return;
    let total = 0;
    const sum = new THREE.Vector3();
    for (const c of live) {
      total += c.impulse;
      sum.addScaledVector(c.point, c.impulse);
    }
    struck = true;
    strikePoint = sum.divideScalar(total);
    onStrike(strikePoint);
    onPush();
  });
}

export { MARKER_LINGER };
