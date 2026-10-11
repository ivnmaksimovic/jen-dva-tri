import * as THREE from 'three';
import type { Game } from '../Game.js';
import type { Car } from './car.js';

/**
 * THROWAWAY PROTOTYPE CODE — slingshot-aim control scheme (the baseline).
 * Touch the Car where you would strike it → drag on the ground in the push
 * direction → release to Push. Drag length = strength. The off-center contact
 * point provides torque (a crude curve Push — the refined gesture-window
 * version comes with push-the-phone, see ticket 07).
 *
 * With several Cars on the Track (ticket 12) the Car you TOUCH is the Car you
 * Push — no separate selection step that could disagree with the aim.
 *
 * Aiming reads through ONE overlay (ticket 11): a bullseye on the exact point
 * the Push will strike + the direction/strength arrow, both drawn on top of
 * the Car. Nothing here touches the Push physics.
 */

/**
 * Bullseye diameter in world units (1 unit = 10 cm): ~1.3 cm on a 4.5 cm Car.
 * Hardcoded on purpose — the read is legible or it is not; there is nothing
 * here for the player to tune. Sprites are world-sized, so it stays put on the
 * Car and shrinks with it as the camera pulls back.
 */
const MARKER_SIZE = 0.13;
/** Both read over the Car body (depth off). Marker above arrow: at the tail
 * they overlap, and the point is the read that must win. */
const ARROW_ORDER = 10;
const MARKER_ORDER = 20;

/**
 * Aim arrow colours: a strike that bites into the Car vs one that would be a
 * pull (impossible with a finger). The rejection has to be visible BEFORE the
 * release, or it reads as a broken control rather than as physics.
 */
const AIM_OK_COLOR = 0xffffff;
const AIM_PULL_COLOR = 0xff4d4d;

/**
 * Bullseye texture for the strike marker: dark rim, bright ring, dark centre
 * pip. The rim is what makes it readable against chalk, concrete and any Car
 * colour outdoors; the pip marks the exact spot (the ring only helps you find
 * it).
 */
function strikeMarkerTexture(): THREE.CanvasTexture {
  const s = 128;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  const c = s / 2;
  ctx.beginPath();
  ctx.arc(c, c, c - 2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(12,12,12,0.92)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c, c, c - 12, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c, c, c * 0.26, 0, Math.PI * 2);
  ctx.fillStyle = '#141414';
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface PushParams {
  impulseScale: number;
  maxDrag: number;
}

export function setupSlingshot(
  game: Game,
  /** The Car currently being aimed at — which Car that is can change. */
  getCar: () => Car,
  /** Every Car on the Track: which one you TOUCH is which one you Push. */
  getCars: () => Car[],
  onPick: (car: Car) => void,
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
  // The aim read must never be swallowed by the Car it grows out of: draw it
  // last (renderOrder) and ignore depth — the gesture is a UI read, not a
  // thing in the world. transparent puts both parts in the overlay pass.
  arrow.line.renderOrder = ARROW_ORDER;
  arrow.cone.renderOrder = ARROW_ORDER;
  // ArrowHelper types its materials loosely (Material | Material[]); both are
  // single basic materials in practice.
  const shaftMat = arrow.line.material as THREE.LineBasicMaterial;
  const headMat = arrow.cone.material as THREE.MeshBasicMaterial;
  shaftMat.transparent = true;
  shaftMat.depthTest = false;
  shaftMat.depthWrite = false;
  headMat.transparent = true;
  headMat.depthTest = false;
  headMat.depthWrite = false;
  arrow.visible = false;
  game.scene.add(arrow);

  // The strike point itself: a bullseye at the exact spot the finger will
  // land. It existed before (the frame-clamped contact) but was invisible —
  // buried in the silhouette of a 1 cm-tall body.
  const marker = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: strikeMarkerTexture(),
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  marker.scale.setScalar(MARKER_SIZE);
  marker.renderOrder = MARKER_ORDER;
  marker.visible = false;
  game.scene.add(marker);

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

  /**
   * Is this gesture a Push at all? A finger presses, it cannot grip: the
   * strike line has to go INTO the Car (ticket 15). Asked where the finger
   * lands — exactly the point drawn.
   */
  function aimIsPush(dir: THREE.Vector3): boolean {
    return getCar().pushesFrom(contact, dir);
  }

  /**
   * The exact point the Push will be applied at: where the finger strikes the
   * frame, at side height. ONE source of truth — the marker is drawn here and
   * the impulse lands here, so what you see is what gets struck.
   *
   * A `curveFactor` used to live here, pulling the strike toward the centre to
   * tame the curve on a 4.5 cm Car. Removed 2026-10-08: declaring the torque
   * to come from somewhere the finger did not touch is authored behaviour, not
   * simulation, and it forced exceptions downstream — the marker could not sit
   * where it was drawn, and the no-pull rule had to be asked against a
   * different point than the visible one. Curve comes from roll vs side
   * friction instead.
   */
  function strikePoint(): THREE.Vector3 {
    return new THREE.Vector3(contact.x, getCar().position.y, contact.z);
  }

  // Tracks the Car every frame while aiming: a Car parked on a slope can creep
  // mid-drag, and the marker must stay on the point the release will strike.
  game.onUpdate(() => {
    if (!dragging) return;
    marker.position.copy(strikePoint());
    marker.visible = true;
  });

  /**
   * Which Car did the finger land on, and where. Raycast against EVERY Car:
   * with several Cars on the Track, the one under the finger is the one being
   * aimed at — there is no separate "select" step to get wrong.
   */
  function carHit(e: PointerEvent): { car: Car; point: THREE.Vector3 } | null {
    toNDC(e);
    raycaster.setFromCamera(ndc, game.camera);
    let best: { car: Car; point: THREE.Vector3 } | null = null;
    let bestDist = Infinity;
    for (const car of getCars()) {
      const hits = raycaster.intersectObjects(car.group.children, true);
      if (hits.length > 0 && hits[0].distance < bestDist) {
        bestDist = hits[0].distance;
        best = { car, point: hits[0].point.clone() };
      }
    }
    return best;
  }

  el.addEventListener('pointerdown', (e) => {
    const hit = carHit(e);
    if (!hit) return; // touched bare ground — nothing to aim at
    // The touched Car becomes the aimed one (camera, Turn budget and the
    // tuning panel all follow it).
    onPick(hit.car);
    const car = getCar();
    if (!car.atRest()) {
      onRefused(`${car.params.name} must be at rest before the next Push`);
      return;
    }
    if (!canPush()) {
      onRefused(`Turn over — ${car.params.name} is out of Pushes (Next Turn)`);
      return;
    }
    const g = groundPoint(e);
    if (!g) return;
    dragging = true;
    // A finger strikes the outer frame, never the middle — clamp the hit.
    contact = car.clampToFrame(hit.point);
    start = g;
    // The drag is PER GESTURE: it is measured from this touch-down, so it
    // has to start at nothing. Left unreset it kept the previous gesture's
    // drag, and a tap that selected another Car released that stale vector
    // on it — the same strength, the old direction, a Car nobody aimed at.
    dragVec.set(0, 0, 0);
    // Show the strike point on touch-down, before any drag: the player must
    // see where they caught the frame while deciding the push direction —
    // and can lift and re-strike instead of committing blind.
    marker.position.copy(strikePoint());
    marker.visible = true;
    arrow.setColor(AIM_OK_COLOR);
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
    arrow.position.copy(strikePoint());
    arrow.setDirection(dir);
    arrow.setLength(Math.max(len, 0.08), 0.12, 0.07);
    // Red = this gesture could not be a Push (the strike line misses the
    // body) — say so while there is still time to change it.
    arrow.setColor(aimIsPush(dir) ? AIM_OK_COLOR : AIM_PULL_COLOR);
    arrow.visible = true;
  });

  function finish(): void {
    if (!dragging) return;
    dragging = false;
    arrow.visible = false;
    marker.visible = false;
    const len = dragVec.length();
    if (len < 0.12) return; // treat as a tap: no Push
    const impulse = dragVec
      .clone()
      .setY(0)
      .setLength(Math.min(len, params.maxDrag) * params.impulseScale);
    // A finger presses, it cannot grip: the strike line has to go into the
    // Car. Swinging past it is not a Push — no impulse, and no Push spent
    // (you waved in the air, you did not move your Car).
    if (!aimIsPush(impulse)) {
      onRefused('A Car can only be pushed, never pulled — strike into the body');
      return;
    }
    // Strike at the Car's side height and exactly where the finger landed:
    // the offset from the centre IS the curve Push torque, raw. Same function
    // the marker is drawn at — no way for the two to disagree.
    getCar().chassis.applyImpulseAtPoint(impulse, strikePoint(), true);
    onPush();
  }

  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', () => {
    dragging = false;
    dragVec.set(0, 0, 0);
    arrow.visible = false;
    marker.visible = false;
  });
}
