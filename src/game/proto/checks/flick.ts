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
  const rig: Rig = {
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
  };
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
    (picked) => {
      rig.active = cars.indexOf(picked);
      rig.picked.push(picked);
    },
    { impulseScale: 8.0, maxDrag: 2.5 },
    () => {
      rig.pushed += 1;
    },
    (reason) => rig.refused.push(reason),
    () => !rig.flickOn, // the slingshot is deaf while the flick is live
    (id) => claim(id, rig.owner),
    () => release(rig.owner),
  );
  setupFlick(
    host,
    world,
    () => cars[rig.active],
    { ...DEFAULT_FLICK_PARAMS },
    () => {
      rig.pushed += 1;
    },
    (reason) => rig.refused.push(reason),
    () => true,
    () => {},
    (fn) => rig.stepHooks.push(fn),
    () => rig.flickOn,
    (id) => claim(id, rig.owner),
    () => release(rig.owner),
  );

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

export async function run(): Promise<boolean> {
  console.log('the flick — its rules, driven through real events (ticket 18)\n');
  await check1_swipeStillPushes();
  await check2_flickNeverChangesSelection();
  await check3_touchingDownOnTheCarDoesNothing();
  await check4_oneGestureIsOnePush();
  await check5_theOtherSchemeStaysDeaf();
  const failed = results.filter((r) => !r.ok).length;
  console.log(
    `\n${results.length - failed}/${results.length} checks passed` +
      (failed ? ' — read above: these are the scheme’s promises' : ''),
  );
  return failed > 0;
}
