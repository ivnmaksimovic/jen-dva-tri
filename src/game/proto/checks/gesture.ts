/**
 * THROWAWAY PROTOTYPE CHECK — a gesture must die with the gesture.
 *
 * Bug reported by the user 2026-10-11: after Pushing one Car, TAPPING another
 * Car to select it Pushed the tapped Car (or flashed the no-pull refusal for a
 * gesture nobody aimed). Cause: the aim state in `slingshot.ts` survived the
 * gesture — `dragVec` was written only on pointermove, so a tap with no move
 * released the PREVIOUS drag: old length, old direction, new Car.
 *
 * This drives the REAL control scheme (`setupSlingshot`) through synthetic
 * pointer events — real Raycaster, real camera, real Cars, real Car physics —
 * and measures what actually happened: did a Car move, was a Push spent, did
 * selection still work. No screenshot, no peeking at aim internals: the
 * Cars' positions are the read.
 *
 * Run: node scripts/headless-check.mjs src/game/proto/checks/gesture.ts
 */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Game } from '../../Game.js';
import { GRAVITY, buildTerrainPhysics, initPhysics, terrainY } from '../world.js';
import { SurfaceField, uniformAssignment } from '../surfaces.js';
import { Car, STARTING_GRID } from '../car.js';

const FRAME = 1 / 60; // one frame = 4 × 1/240 steps, same as the app
const VIEW = { w: 900, h: 1600 }; // portrait phone — the target device
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
/** Where the Cars sit: apart enough that one Push cannot reach the other. */
const SPOTS: [number, number][] = [
  [-1.2, 0],
  [1.2, 0],
];

// --- Minimal DOM: enough for the aim overlay (a canvas texture) and for
// --- synthetic pointer events. Nothing here is rendered; there is no GL.

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

/** The renderer's canvas as slingshot sees it: an event target with a rect. */
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

  /** Dispatch one pointer event carrying the fields slingshot reads. */
  fire(type: string, clientX: number, clientY: number): void {
    const e = { type, clientX, clientY, pointerId: 1, preventDefault() {}, stopPropagation() {} };
    for (const fn of this.handlers.get(type) ?? []) fn(e);
  }
}

(globalThis as { document?: unknown }).document = {
  createElement: () => canvasStub(),
  createElementNS: () => canvasStub(),
};

interface Rig {
  world: RAPIER.World;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  cars: Car[];
  el: PointerTarget;
  /** Gesture bookkeeping the control scheme reports outward. */
  pushed: number;
  refused: string[];
  picked: Car[];
  active: number;
}

const results: { name: string; ok: boolean; detail: string }[] = [];
function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`);
}

function frame(rig: Rig, frames = 1): void {
  for (let n = 0; n < frames; n++) {
    for (let i = 0; i < 4; i++) rig.world.step();
    for (const car of rig.cars) car.sync(FRAME);
  }
}

/** Client pixels of a world point — how a player aims at something they see. */
function screenOf(rig: Rig, p: THREE.Vector3): { x: number; y: number } {
  const ndc = p.clone().project(rig.camera);
  return { x: ((ndc.x + 1) / 2) * VIEW.w, y: ((1 - ndc.y) / 2) * VIEW.h };
}

/** The inverse: which ground point sits under these client pixels. */
function groundAt(rig: Rig, clientX: number, clientY: number): THREE.Vector3 {
  const ndc = new THREE.Vector2(
    (clientX / VIEW.w) * 2 - 1,
    -(clientY / VIEW.h) * 2 + 1,
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, rig.camera);
  const out = new THREE.Vector3();
  if (!ray.ray.intersectPlane(GROUND, out)) throw new Error('pointer ray missed the ground');
  return out;
}

/** Refresh everything the raycasts read, exactly like a rendered frame does. */
function syncView(rig: Rig): void {
  rig.scene.updateMatrixWorld(true);
  rig.camera.updateMatrixWorld(true);
}

/**
 * One Push, delivered the way the player delivers one: touch the Car, drag
 * along the ground INTO the body (the only legal direction — ticket 15),
 * release. `length` is in world units of ground drag.
 */
function drag(rig: Rig, car: Car, length: number): void {
  syncView(rig);
  const touchdown = screenOf(rig, car.position.clone());
  rig.el.fire('pointerdown', touchdown.x, touchdown.y);
  const from = groundAt(rig, touchdown.x, touchdown.y);
  // Aim at the middle of the body: from a frame point, every direction that
  // goes in is a legal Push, whatever edge the touch clamped to.
  const contact = car.clampToFrame(car.position.clone());
  const into = new THREE.Vector3(car.position.x - contact.x, 0, car.position.z - contact.z)
    .normalize()
    .multiplyScalar(length);
  const to = screenOf(rig, from.clone().add(into));
  rig.el.fire('pointermove', to.x, to.y);
  rig.el.fire('pointerup', to.x, to.y);
}

/** A tap: down and up on the same spot, with no drag in between. */
function tap(rig: Rig, car: Car): void {
  syncView(rig);
  const spot = screenOf(rig, car.position.clone());
  rig.el.fire('pointerdown', spot.x, spot.y);
  rig.el.fire('pointerup', spot.x, spot.y);
}

/** Let everything come to rest, so nothing measured later is leftovers. */
function settle(rig: Rig, maxFrames = 1200): boolean {
  for (let n = 0; n < maxFrames; n++) {
    frame(rig);
    if (rig.cars.every((c) => c.atRest())) return true;
  }
  return false;
}

async function makeRig(): Promise<Rig> {
  await initPhysics();
  // Imported only once `document` exists: the aim overlay builds a texture.
  const { setupSlingshot } = await import('../slingshot.js');

  const scene = new THREE.Scene();
  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  world.timestep = 1 / 240;
  world.integrationParameters.numSolverIterations = 8;
  const field = new SurfaceField(uniformAssignment('concrete'));
  buildTerrainPhysics(world, field);

  const camera = new THREE.PerspectiveCamera(60, VIEW.w / VIEW.h, 0.1, 100);
  camera.position.set(0, 4, 1.2); // near top-down, like the play camera
  camera.lookAt(0, 0, 0);

  const cars = STARTING_GRID.slice(0, 2).map((params) => new Car(world, scene, params, field));
  cars.forEach((car, i) => car.reset(new THREE.Vector3(SPOTS[i][0], terrainY(...SPOTS[i]), SPOTS[i][1]), 0));

  const el = new PointerTarget();
  const rig: Rig = {
    world,
    scene,
    camera,
    cars,
    el,
    pushed: 0,
    refused: [],
    picked: [],
    active: 0,
  };

  setupSlingshot(
    { scene, camera, renderer: { domElement: el }, onUpdate: () => {} } as unknown as Game,
    () => cars[rig.active],
    () => cars,
    (picked) => {
      rig.active = cars.indexOf(picked);
      rig.picked.push(picked);
    },
    { impulseScale: 8.0, maxDrag: 2.5 }, // the prototype's defaults
    () => {
      rig.pushed += 1;
    },
    (reason) => rig.refused.push(reason),
    () => true,
  );

  frame(rig, 2); // Rapier's query pipeline fills on the first step
  return rig;
}

/**
 * 1. The harness itself: a real drag must still Push the Car it aimed at. If
 *    this fails, checks 2–3 prove nothing — maybe nothing can move at all.
 */
async function check1_dragStillPushes(): Promise<void> {
  const rig = await makeRig();
  if (!settle(rig)) throw new Error('Cars never came to rest');

  const before = rig.cars[0].position.clone();
  drag(rig, rig.cars[0], 0.3);
  frame(rig, 120);

  const moved = rig.cars[0].position.distanceTo(before) * 10; // cm real
  record(
    'a real drag still Pushes the Car it aimed at',
    moved > 0.5 && rig.pushed === 1 && rig.refused.length === 0,
    `moved ${moved.toFixed(1)} cm, Pushes spent ${rig.pushed}, refusals ${rig.refused.length}`,
  );
}

/**
 * 2. THE BUG: after a Push, tap the other Car to select it. Selection must
 *    still happen — and it must not carry last gesture's drag onto the Car.
 */
async function check2_tapToSelectDoesNotPush(): Promise<void> {
  const rig = await makeRig();
  if (!settle(rig)) throw new Error('Cars never came to rest');

  drag(rig, rig.cars[0], 0.3); // a Push, to leave a drag behind
  if (!settle(rig)) throw new Error('Cars never came to rest after the Push');

  const before = rig.cars.map((c) => c.position.clone());
  const pushesBefore = rig.pushed;
  tap(rig, rig.cars[1]);
  frame(rig, 120);

  const moved = rig.cars.map((c, i) => c.position.distanceTo(before[i]) * 10);
  const selected = rig.picked[rig.picked.length - 1] === rig.cars[1];
  const spent = rig.pushed - pushesBefore;
  record(
    'tapping another Car selects it and Pushes nothing',
    Math.max(...moved) < 0.1 && spent === 0 && rig.refused.length === 0 && selected,
    `moved ${moved.map((m) => `${m.toFixed(2)} cm`).join(' / ')}, new Pushes ${spent}, `
      + `selected other Car ${selected}, refusals [${rig.refused.join('; ')}]`,
  );
}

/**
 * 3. Same claim after a REFUSED swing (drag away from the body): the rejected
 *    gesture must not survive either, or the next tap fires it somewhere else.
 */
async function check3_tapAfterRefusedSwingDoesNotPush(): Promise<void> {
  const rig = await makeRig();
  if (!settle(rig)) throw new Error('Cars never came to rest');

  // Drag AWAY from the body: legal aiming, refused on release (no-pull rule).
  syncView(rig);
  const td = screenOf(rig, rig.cars[0].position.clone());
  rig.el.fire('pointerdown', td.x, td.y);
  const from = groundAt(rig, td.x, td.y);
  const contact = rig.cars[0].clampToFrame(rig.cars[0].position.clone());
  const away = new THREE.Vector3(contact.x - rig.cars[0].position.x, 0, contact.z - rig.cars[0].position.z)
    .normalize()
    .multiplyScalar(0.5);
  const tp = screenOf(rig, from.clone().add(away));
  rig.el.fire('pointermove', tp.x, tp.y);
  rig.el.fire('pointerup', tp.x, tp.y);
  frame(rig, 120);

  const refused = rig.refused.length;
  const pushedAfterSwing = rig.pushed;

  const before = rig.cars.map((c) => c.position.clone());
  tap(rig, rig.cars[1]);
  frame(rig, 120);

  const moved = rig.cars.map((c, i) => c.position.distanceTo(before[i]) * 10);
  const spent = rig.pushed - pushedAfterSwing;
  // The tap must be silent: not a Push, and not even a new complaint — a
  // player tapping a Car did not aim anywhere.
  const newRefusals = rig.refused.length - refused;
  record(
    'tapping after a refused swing Pushes nothing either',
    refused === 1 && Math.max(...moved) < 0.1 && spent === 0 && newRefusals === 0,
    `swing refused ${refused}/1, then moved ${moved.map((m) => `${m.toFixed(2)} cm`).join(' / ')}, `
      + `new Pushes ${spent}, new refusals ${newRefusals}`,
  );
}

export async function run(): Promise<boolean> {
  console.log('gesture state — every gesture starts from nothing\n');
  await check1_dragStillPushes();
  await check2_tapToSelectDoesNotPush();
  await check3_tapAfterRefusedSwingDoesNotPush();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  return failed > 0;
}
