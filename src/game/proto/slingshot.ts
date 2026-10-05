import * as THREE from 'three';
import type { Game } from '../Game.js';
import type { Car } from './car.js';

/**
 * THROWAWAY PROTOTYPE CODE — slingshot-aim control scheme (the baseline).
 * Touch the Car where you would strike it → drag on the ground in the push
 * direction → release to Push. Drag length = strength. The off-center contact
 * point provides torque (a crude curve Push — the refined gesture-window
 * version comes with push-the-phone, see ticket 07).
 */

export interface PushParams {
  impulseScale: number;
  maxDrag: number;
  /** Scales the strike's off-center offset → curve torque. 1 = raw physics
   * (brutally sensitive on a 4.5 cm car), 0 = always dead-center. */
  curveFactor: number;
}

export function setupSlingshot(
  game: Game,
  getCar: () => Car,
  params: PushParams,
  onPush: () => void,
  onRefused: (reason: string) => void,
  canPush: () => boolean,
): void {
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // ground plane y=0
  const ndc = new THREE.Vector2();

  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(),
    0.3,
    0xffffff,
    0.12,
    0.07,
  );
  arrow.visible = false;
  game.scene.add(arrow);

  let dragging = false;
  let contact = new THREE.Vector3();
  let start = new THREE.Vector3();
  let dragVec = new THREE.Vector3();

  const el = game.renderer.domElement;
  el.style.touchAction = 'none';

  function toNDC(e: PointerEvent): void {
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  function groundPoint(e: PointerEvent): THREE.Vector3 | null {
    toNDC(e);
    raycaster.setFromCamera(ndc, game.camera);
    const out = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, out) ? out : null;
  }

  function carHit(e: PointerEvent): THREE.Vector3 | null {
    toNDC(e);
    raycaster.setFromCamera(ndc, game.camera);
    const hits = raycaster.intersectObjects(getCar().group.children, true);
    return hits.length > 0 ? hits[0].point.clone() : null;
  }

  el.addEventListener('pointerdown', (e) => {
    const car = getCar();
    if (!car.atRest()) {
      onRefused('The Car must be at rest before the next Push');
      return;
    }
    if (!canPush()) {
      onRefused('Turn over — press Next Turn (Lap Challenge)');
      return;
    }
    const hit = carHit(e);
    if (!hit) return;
    const g = groundPoint(e);
    if (!g) return;
    dragging = true;
    contact = hit;
    start = g;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Some synthetic/edge-case pointers can't be captured; drag still works.
    }
  });

  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const g = groundPoint(e);
    if (!g) return;
    dragVec = g.clone().sub(start);
    const len = Math.min(dragVec.length(), params.maxDrag);
    if (len < 0.02) {
      arrow.visible = false;
      return;
    }
    const dir = dragVec.clone().setY(0).normalize();
    arrow.position.copy(contact);
    arrow.setDirection(dir);
    arrow.setLength(Math.max(len, 0.08), 0.12, 0.07);
    arrow.visible = true;
  });

  function finish(): void {
    if (!dragging) return;
    dragging = false;
    arrow.visible = false;
    const len = dragVec.length();
    if (len < 0.12) return; // treat as a tap: no Push
    const car = getCar();
    const impulse = dragVec
      .clone()
      .setY(0)
      .setLength(Math.min(len, params.maxDrag) * params.impulseScale);
    // Strike at the Car's side height (a finger strikes the side, not the
    // roof). The horizontal contact offset is the curve Push torque — scaled
    // by curveFactor because a 4.5 cm car makes raw offsets brutally curvy
    // (even a "center" tap from a tilted camera strikes ~2 mm off).
    const c = car.position;
    const strike = {
      x: c.x + (contact.x - c.x) * params.curveFactor,
      y: c.y,
      z: c.z + (contact.z - c.z) * params.curveFactor,
    };
    car.chassis.applyImpulseAtPoint(impulse, strike, true);
    onPush();
  }

  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', () => {
    dragging = false;
    arrow.visible = false;
  });
}
