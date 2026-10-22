/**
 * THROWAWAY PROTOTYPE CHECK — the flick's rules (option C, ticket 18).
 *
 * `check:finger` measures the PHYSICS of a strike; this one measures the
 * promises, driven through synthetic pointer events against the real input
 * layer, the real Cars and real Car physics — the same way the 2026-10-11
 * tap-to-select bug is guarded.
 *
 * BOTH control schemes are wired here over ONE canvas, exactly as the app does.
 * That matters: they mean opposite things about the same touch (a touch ON the
 * Car starts the slingshot's aim, and must mean nothing to the flick), so who
 * owns a gesture has one single answer — decided at touch-down by arbitration,
 * not by each layer hoping the other stays quiet. Check 4 exists because that
 * was once wrong and the symptom was a Car nobody aimed at moving.
 *
 * Run: node scripts/headless-check.mjs src/game/proto/checks/flick.ts
 */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Game } from '../../Game.js';
import { GRAVITY, buildTerrainPhysics, initPhysics, terrainY } from '../world.js';
import { SurfaceField, uniformAssignment } from '../surfaces.js';
import { Car, STARTING_GRID } from '../car.js';
import { DEFAULT_FLICK_PARAMS } from '../flick.js';
import { CameraRig, DEFAULT_CAMERA_PARAMS } from '../camera.js';

const FRAME = 1 / 60; // one frame = 4 × 1/240 steps, same as the app
const VIEW = { w: 900, h: 1600 }; // portrait phone — the target device

function canvasStub(): unknown {
  const ctx = {
    fillStyle: '',
    beginPath() {},
    arc() {},
    fill() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
  };
  return { width: 0, height: 0, style: {}, getContext: () => ctx };
}

/** The renderer's canvas as the input layers see it: events plus a rect. */
class PointerTarget {
  readonly style: Record<string, unknown> = {};
  private readonly handlers = new Map<string, ((e: unknown) => void)[]>();

  addEventListener(type: string, fn: (e: unknown) => void): void {
    const list = this.handlers.get(type) ?? [];
    list.push(fn);
    this.handlers.set(type, list);
  }

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: VIEW.w, height: VIEW.h };
  }

  setPointerCapture(): void {}

  fire(type: string, clientX: number, clientY: number, pointerId = 1): void {
    const e = { type, clientX, clientY, pointerId, preventDefault() {}, stopPropagation() {} };
    for (const fn of this.handlers.get(type) ?? []) fn(e);
  }
}

(globalThis as { document?: unknown }).document = {
  createElement: () => canvasStub(),
  createElementNS: () => canvasStub(),
};

/** Which layer owns the current gesture: one owner, decided once. */
interface Owner {
  id: number;
}
const claim = (id: number, owner: Owner): boolean => {
  if (owner.id !== -1) return false;
  owner.id = id;
  return true;
};
const release = (owner: Owner): void => {
  owner.id = -1;
};

interface Rig {
  world: RAPIER.World;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  cars: Car[];
  el: PointerTarget;
  owner: Owner;
  stepHooks: (() => void)[];
  pushed: number;
  refused: string[];
  picked: Car[];
  active: number;
  /** Which scheme is listening — the GUI's switch, live. */
  flickOn: boolean;
  /** The camera RIG (not the Three camera): two fingers belong to it. */
  cam: CameraRig;
}

const results: { name: string; ok: boolean; detail: string }[] = [];
function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`);
}

function frame(rig: Rig, frames = 1): void {
  for (let n = 0; n < frames; n++) {
    for (let i = 0; i < 4; i++) {
      for (const hook of rig.stepHooks) hook();
      rig.world.step();
    }
    for (const car of rig.cars) car.sync(FRAME);
    rig.cam.update(FRAME, rig.cars[rig.active].position);
  }
}

function syncView(rig: Rig): void {
  rig.scene.updateMatrixWorld(true);
  rig.camera.updateMatrixWorld(true);
}

function screenOf(rig: Rig, p: THREE.Vector3): { x: number; y: number } {
  const ndc = p.clone().project(rig.camera);
  return { x: ((ndc.x + 1) / 2) * VIEW.w, y: ((1 - ndc.y) / 2) * VIEW.h };
}

function settle(rig: Rig, maxFrames = 1500): boolean {
  for (let n = 0; n < maxFrames; n++) {
    frame(rig);
    if (rig.cars.every((c) => c.atRest())) return true;
  }
  return false;
}

async function makeRig(): Promise<Rig> {
  await initPhysics();
  // Imported after `document` exists: the aim overlay builds canvas textures.
  const { setupSlingshot } = await import('../slingshot.js');
  const { setupFlick } = await import('../flick.js');
  let flick: { cancel(): void } | undefined;

  const scene = new THREE.Scene();
  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  world.timestep = 1 / 240;
  world.integrationParameters.numSolverIterations = 8;
  const field = new SurfaceField(uniformAssignment('concrete'));
  buildTerrainPhysics(world, field);

  const camera = new THREE.PerspectiveCamera(60, VIEW.w / VIEW.h, 0.1, 100);
  camera.position.set(0, 4, 1.2); // near top-down, like the play camera
  camera.lookAt(0, 0, 0);

  const spots: [number, number][] = [
    [-1.2, 0],
    [1.2, 0],
  ];
  const cars = STARTING_GRID.slice(0, 2).map((params) => new Car(world, scene, params, field));
  cars.forEach((car, i) => car.reset(new THREE.Vector3(spots[i][0], terrainY(...spots[i]), spots[i][1]), 0));

  const el = new PointerTarget();
  const rig = {
    world,
    scene,
    camera,
    cars,
    el,
    owner: { id: -1 },
    stepHooks: [],
    pushed: 0,
    refused: [],
    picked: [],
    active: 0,
    flickOn: true,
  } as unknown as Rig;
  const host = {
    scene,
    camera,
    renderer: { domElement: el },
    onUpdate: () => {},
  } as unknown as Game;

  // BOTH layers, one canvas, one arbiter — the situation the app is really in.
  setupSlingshot(
    host,
    () => cars[rig.active],
    () => cars,
    (picked: Car) => {
      rig.active = cars.indexOf(picked);
      rig.picked.push(picked);
    },
    { impulseScale: 8.0, maxDrag: 2.5 },
    () => {
      rig.pushed += 1; // onPush
    },
    (reason: string) => rig.refused.push(reason), // onRefused
    () => true, // canPush — the Turn budget is not what these checks are about
    (id: number) => claim(id, rig.owner),
    () => release(rig.owner),
    () => !rig.flickOn, // enabled: hear NOTHING while the flick is live
  );
  flick = setupFlick(
    host,
    world,
    () => cars[rig.active],
    () => cars,
    (picked) => {
      rig.active = cars.indexOf(picked);
      rig.picked.push(picked);
    },
    { ...DEFAULT_FLICK_PARAMS },
    () => {
      rig.pushed += 1;
    },
    (reason: string) => rig.refused.push(reason),
    () => true,
    () => {} /* strike point: nothing to show in a headless run */,
    () => {} /* contact readout: not what these rules check */,
    (fn: () => void) => rig.stepHooks.push(fn),
    () => rig.flickOn,
    (id: number) => claim(id, rig.owner),
    () => release(rig.owner),
  );

  // The camera rides the same canvas (ticket 19). Two fingers are ITS claim,
  // and when it claims, whatever the game thought it owned has to be released.
  rig.cam = new CameraRig(host, { ...DEFAULT_CAMERA_PARAMS }, () => {
    flick?.cancel();
  });

  frame(rig, 2); // Rapier's query pipeline fills on the first step
  return rig;
}

/** One swipe THROUGH the aimed Car, ending off the far side like a real flick. */
function swipeThrough(rig: Rig, car: Car, frames = 14, from = -0.7, to = 0.7): void {
  syncView(rig);
  const a = screenOf(rig, car.position.clone().add(new THREE.Vector3(from, 0, 0)));
  const b = screenOf(rig, car.position.clone().add(new THREE.Vector3(to, 0, 0)));
  rig.el.fire('pointerdown', a.x, a.y);
  for (let i = 1; i <= frames; i++) {
    const t = i / frames;
    rig.el.fire('pointermove', a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    frame(rig, 1); // the player's finger moves with the frame
  }
  rig.el.fire('pointerup', b.x, b.y);
  frame(rig, 2);
}

/** 1. The harness itself: a swipe through the Car has to deliver a Push. */
async function check1_swipeStillPushes(): Promise<void> {
  const rig = await makeRig();
  if (!settle(rig)) throw new Error('Cars never came to rest');
  rig.active = 0;
  const before = rig.cars[0].position.clone();
  swipeThrough(rig, rig.cars[0]);
  frame(rig, 180);
  const moved = rig.cars[0].position.distanceTo(before) * 10;
  record(
    'a swipe through the Car Pushes it (the harness itself)',
    moved > 1 && rig.pushed === 1,
    `moved ${moved.toFixed(1)} cm real, Pushes spent ${rig.pushed}, refusals [${rig.refused.join('; ')}]`,
  );
}

/**
 * 2. Selection is TAP-ONLY. The flick may sweep over other Cars without ever
 *    claiming them, or the HUD could end up editing a Car nobody aimed at.
 */
async function check2_flickNeverChangesSelection(): Promise<void> {
  const rig = await makeRig();
  if (!settle(rig)) throw new Error('Cars never came to rest');
  rig.active = 0;
  swipeThrough(rig, rig.cars[0]);
  frame(rig, 240);
  const pickedOther = rig.picked.some((c) => c === rig.cars[1]);
  record(
    'a flick never changes which Car is aimed (selection is tap-only)',
    rig.active === 0 && !pickedOther && rig.pushed === 1,
    `aim stayed on Car 1: ${rig.active === 0}, picked another Car: ${pickedOther}, Pushes ${rig.pushed}`,
  );
}

/**
 * 3. Touching down ON the Car does nothing. This fails in two ways if you get
 *    it wrong: the flick strikes from inside, or — worse — it swallows a
 *    gesture the slingshot should have had, so drag-aiming silently dies.
 */
async function check3_touchingDownOnTheCarDoesNothing(): Promise<void> {
  const rig = await makeRig();
  if (!settle(rig)) throw new Error('Cars never came to rest');
  const before = rig.cars.map((c) => c.position.clone());
  syncView(rig);
  const on = screenOf(rig, rig.cars[0].position.clone());
  const away = screenOf(rig, rig.cars[0].position.clone().add(new THREE.Vector3(1.0, 0, 0)));
  rig.el.fire('pointerdown', on.x, on.y);
  for (let i = 1; i <= 12; i++) {
    rig.el.fire('pointermove', on.x + ((away.x - on.x) * i) / 12, on.y + ((away.y - on.y) * i) / 12);
    frame(rig, 1);
  }
  rig.el.fire('pointerup', away.x, away.y);
  frame(rig, 180);
  const moved = rig.cars.map((c, i) => c.position.distanceTo(before[i]) * 10);
  record(
    'touching down on the Car does nothing (no Push, and the claim goes back)',
    Math.max(...moved) < 0.1 && rig.pushed === 0 && rig.owner.id === -1,
    `moved ${moved.map((m) => `${m.toFixed(2)} cm`).join(' / ')}, Pushes ${rig.pushed}, refusals [${rig.refused.join('; ')}], owner released ${rig.owner.id === -1}`,
  );
}

/** 4. One gesture, one Push — however long the finger lingers over the body. */
async function check4_oneGestureIsOnePush(): Promise<void> {
  const rig = await makeRig();
  if (!settle(rig)) throw new Error('Cars never came to rest');
  swipeThrough(rig, rig.cars[0], 40); // a long, slow sweep across the Car
  frame(rig, 600);
  record(
    'one gesture is one Push, however long the finger lingers',
    rig.pushed === 1,
    `Pushes spent by one continuous swipe through the Car: ${rig.pushed}`,
  );
}

/**
 * 5. The scheme switch is not cosmetic: whichever scheme is off must be deaf.
 *    Both listen to the same canvas, so a silent layer that still acts is the
 *    classic way to get two controls fighting over one touch.
 */
async function check5_theOtherSchemeStaysDeaf(): Promise<void> {
  const rig = await makeRig();
  if (!settle(rig)) throw new Error('Cars never came to rest');
  rig.flickOn = false; // slingshot mode only
  const before = rig.cars[0].position.clone();
  swipeThrough(rig, rig.cars[0]); // a flick-shaped swipe the slingshot must ignore
  frame(rig, 180);
  const moved = rig.cars[0].position.distanceTo(before) * 10;
  record(
    'with the flick off, swipe-throughs are inert and nothing is spent',
    moved < 0.1 && rig.pushed === 0,
    `moved ${moved.toFixed(2)} cm real, Pushes ${rig.pushed}, refusals [${rig.refused.join('; ')}]`,
  );
}

/**
 * 6. In flick mode nothing must leak OUT of the other scheme: no Push, no aim,
 *    and above all no refusal messages about the other scheme's rules. A lies
 *    ("out of Pushes" when the Pushes are fine) and it reads as a broken game.
 */
async function check6_noLiesFromTheIdleScheme(): Promise<void> {
  const rig = await makeRig();
  if (!settle(rig)) throw new Error('Cars never came to rest');
  // Start ON the Car and drag away: in slingshot mode this would be a legal
  // aim. In flick mode it must be silent — not refused by rules that aren't on.
  syncView(rig);
  const on = screenOf(rig, rig.cars[0].position.clone());
  const away = screenOf(rig, rig.cars[0].position.clone().add(new THREE.Vector3(1.0, 0, 0)));
  rig.el.fire('pointerdown', on.x, on.y);
  for (let i = 1; i <= 12; i++) {
    rig.el.fire('pointermove', on.x + ((away.x - on.x) * i) / 12, on.y + ((away.y - on.y) * i) / 12);
    frame(rig, 1);
  }
  rig.el.fire('pointerup', away.x, away.y);
  frame(rig, 180);
  record(
    'the idle scheme stays silent — no Push, and no refusal about rules it isn’t running',
    rig.pushed === 0 && rig.refused.length === 0,
    `Pushes ${rig.pushed}, refusals [${rig.refused.join('; ')}]`,
  );
}

/** 7. Selection is TAP-ONLY, in flick mode too: a tap must still select. */
async function check7_tapStillSelectsInFlickMode(): Promise<void> {
  const rig = await makeRig();
  if (!settle(rig)) throw new Error('Cars never came to rest');
  rig.active = 0;
  const before = rig.cars.map((c) => c.position.clone());
  syncView(rig);
  const spot = screenOf(rig, rig.cars[1].position.clone());
  rig.el.fire('pointerdown', spot.x, spot.y);
  frame(rig, 2);
  rig.el.fire('pointerup', spot.x, spot.y);
  frame(rig, 120);
  const moved = rig.cars.map((c, i) => c.position.distanceTo(before[i]) * 10);
  record(
    'a tap still selects in flick mode (and Pushes nothing)',
    rig.active === 1 && rig.pushed === 0 && Math.max(...moved) < 0.1,
    `selected Car 2: ${rig.active === 1}, Pushes ${rig.pushed}, moved ${moved.map((m) => `${m.toFixed(2)} cm`).join(' / ')}`,
  );
}

/**
 * 8. Two fingers are the camera's, always (ticket 19). It has to be able to
 *    take the canvas mid-gesture: a pinch aimed at the view must not also drag
 *    the Car the first finger happened to have started on.
 */
async function check8_cameraReallyTakesTheCanvas(): Promise<void> {
  const rig = await makeRig();
  if (!settle(rig)) throw new Error('Cars never came to rest');
  syncView(rig);
  const centre = screenOf(rig, rig.cars[0].position.clone());
  // Two fingers spreading apart: a pinch to zoom OUT from the camera's view.
  const beforeZoom = rig.cam.params.zoom;
  const camBefore = rig.camera.position.clone();
  rig.el.fire('pointerdown', centre.x - 60, centre.y, 1);
  rig.el.fire('pointerdown', centre.x + 60, centre.y, 2);
  for (let i = 1; i <= 8; i++) {
    const spread = 60 + i * 10;
    rig.el.fire('pointermove', centre.x - spread, centre.y, 1);
    rig.el.fire('pointermove', centre.x + spread, centre.y, 2);
    frame(rig, 1);
  }
  const zoomed = rig.cam.params.zoom !== beforeZoom;
  const moved =
    rig.camera.position.distanceTo(camBefore) > 0.05 && !rig.cam.params.following;
  rig.el.fire('pointerup', centre.x - 140, centre.y, 1);
  rig.el.fire('pointerup', centre.x + 140, centre.y, 2);
  frame(rig, 180);
  record(
    'two fingers ACTUALLY move the camera (not merely unfollow it)',
    zoomed && moved && rig.pushed === 0,
    `zoom ${beforeZoom.toFixed(2)} -> ${rig.cam.params.zoom.toFixed(2)}, camera moved ${(rig.camera.position.distanceTo(camBefore) * 10).toFixed(1)} cm, following ${rig.cam.params.following}, Pushes ${rig.pushed}`,
  );
}

/** 8b. The mirror of it: taking the canvas must also end the game's gesture. */
async function check8b_cameraClaimEndsThePushGesture(): Promise<void> {
  const rig = await makeRig();
  if (!settle(rig)) throw new Error('Cars never came to rest');
  syncView(rig);
  const a = screenOf(rig, rig.cars[0].position.clone().add(new THREE.Vector3(-0.7, 0, 0)));
  const b = screenOf(rig, rig.cars[0].position.clone().add(new THREE.Vector3(0.7, 0, 0)));
  rig.el.fire('pointerdown', a.x, a.y, 1);
  frame(rig, 2);
  rig.el.fire('pointerdown', b.x, b.y, 2); // camera claims
  for (let i = 1; i <= 12; i++) {
    rig.el.fire('pointermove', a.x + ((b.x - a.x) * i) / 12, a.y + ((b.y - a.y) * i) / 12, 1);
    frame(rig, 1);
  }
  rig.el.fire('pointerup', b.x, b.y, 1);
  frame(rig, 180);
  record(
    'the camera taking the canvas also ends the Push gesture it interrupted',
    rig.pushed === 0,
    `Pushes ${rig.pushed}, refusals [${rig.refused.join('; ')}]`,
  );
}

async function check9_oneFingerStillPushesAfterwards(): Promise<void> {
  const rig = await makeRig();
  if (!settle(rig)) throw new Error('Cars never came to rest');
  swipeThrough(rig, rig.cars[0]);
  frame(rig, 180);
  record(
    'after a camera gesture, one finger still Pushes',
    rig.pushed === 1,
    `Pushes ${rig.pushed}, refusals [${rig.refused.join('; ')}]`,
  );
}

/**
 * 8c. Three fingers change the TILT — how steeply we look down. Guarded because
 *     the camera as a whole once went dead under green checks; anything here
 *     that has no test is assumed to rot.
 */
async function check8c_threeFingersTiltTheView(): Promise<void> {
  const rig = await makeRig();
  if (!settle(rig)) throw new Error('Cars never came to rest');
  syncView(rig);
  const c = screenOf(rig, rig.cars[0].position.clone());
  const before = rig.cam.params.tilt;
  rig.el.fire('pointerdown', c.x - 60, c.y, 1);
  rig.el.fire('pointerdown', c.x, c.y + 40, 2);
  rig.el.fire('pointerdown', c.x + 60, c.y, 3);
  for (let i = 1; i <= 10; i++) {
    rig.el.fire('pointermove', c.x - 60, c.y + i * 12, 1);
    rig.el.fire('pointermove', c.x, c.y + 40 + i * 12, 2);
    rig.el.fire('pointermove', c.x + 60, c.y + i * 12, 3);
    frame(rig, 1);
  }
  const after = rig.cam.params.tilt;
  record(
    'three fingers tilt the view, and it stays above the ground',
    after !== before && after > 0 && after < Math.PI / 2,
    `tilt ${THREE.MathUtils.radToDeg(before).toFixed(1)}° -> ${THREE.MathUtils.radToDeg(after).toFixed(1)}° from vertical`,
  );
}

export async function run(): Promise<boolean> {
  console.log('the flick — its rules, driven through real events (ticket 18)\n');
  await check1_swipeStillPushes();
  await check2_flickNeverChangesSelection();
  await check3_touchingDownOnTheCarDoesNothing();
  await check4_oneGestureIsOnePush();
  await check5_theOtherSchemeStaysDeaf();
  await check6_noLiesFromTheIdleScheme();
  await check7_tapStillSelectsInFlickMode();
  await check8_cameraReallyTakesTheCanvas();
  await check8b_cameraClaimEndsThePushGesture();
  await check8c_threeFingersTiltTheView();
  await check9_oneFingerStillPushesAfterwards();
  const failed = results.filter((r) => !r.ok).length;
  console.log(
    `\n${results.length - failed}/${results.length} checks passed` +
      (failed ? ' — read above: these are the scheme’s promises' : ''),
  );
  return failed > 0;
}
