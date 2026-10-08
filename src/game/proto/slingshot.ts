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
   * The exact point the Push will be applied at: the frame strike, pulled
   * toward the centre by curveFactor. ONE source of truth — the marker is
   * drawn here and the impulse lands here, so what you see is what gets
   * struck. At curveFactor 1 (default) this IS the frame contact.
   */
  function strikePoint(): THREE.Vector3 {
    const c = getCar().position;
    return new THREE.Vector3(
      c.x + (contact.x - c.x) * params.curveFactor,
      c.y,
      c.z + (contact.z - c.z) * params.curveFactor,
    );
  }

  // Tracks the Car every frame while aiming: a Car parked on a slope can creep
  // mid-drag, and the marker must stay on the point the release will strike.
  game.onUpdate(() => {
    if (!dragging) return;
    marker.position.copy(strikePoint());
    marker.visible = true;
  });

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
    // A finger strikes the outer frame, never the middle — clamp the hit.
    contact = car.clampToFrame(hit);
    start = g;
    // Show the strike point on touch-down, before any drag: the player must
    // see where they caught the frame while deciding the push direction —
    // and can lift and re-strike instead of committing blind.
    marker.position.copy(strikePoint());
    marker.visible = true;
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
    // Strike at the Car's side height (a finger strikes the side, not the
    // roof). The horizontal contact offset is the curve Push torque — scaled
    // by curveFactor because a 4.5 cm car makes raw offsets brutally curvy
    // (even a "center" tap from a tilted camera strikes ~2 mm off).
    // Same function the marker is drawn at: no way for the two to disagree.
    getCar().chassis.applyImpulseAtPoint(impulse, strikePoint(), true);
    onPush();
  }

  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', () => {
    dragging = false;
    arrow.visible = false;
    marker.visible = false;
  });
}
