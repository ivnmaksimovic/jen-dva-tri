/**
 * THROWAWAY PROTOTYPE CHECK — the KNUCKLE'S TRACKING (ticket 18, option C).
 *
 * `check:finger` measures the strike; this one measures what happens BEFORE
 * there is anything to strike — the knuckle simply following the touch. That
 * is where the desktop bug lived: on a click with no movement the knuckle flew
 * off toward the world origin (`flick.ts` drove it toward a target nobody had
 * ever set), and once it was chasing a real target it overshot, swung back and
 * orbited the pointer like a thing on an elastic rope. A player cannot aim with
 * a knuckle that is somewhere else, so this is measured, not eyeballed.
 *
 * Every case here is the FLAT control — nothing in the way — because that is
 * the only place a tracking law can be judged on its own. The last case puts a
 * Car back in the way, for the opposite reason: a fix that made tracking perfect
 * by making the knuckle a bulldozer would pass every case above it.
 *
 * Run: node scripts/headless-check.mjs src/game/proto/checks/knuckle.ts
 */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GRAVITY, buildTerrainPhysics, initPhysics, terrainY } from '../world.js';
import { SurfaceField, uniformAssignment } from '../surfaces.js';
import { Car, STARTING_GRID } from '../car.js';
import { Finger, DEFAULT_FINGER_PARAMS, type FingerParams } from '../finger.js';

const FRAME = 1 / 60;
const DT = 1 / 240;
const STEPS = 4;

interface Rig {
  world: RAPIER.World;
  scene: THREE.Scene;
  car: Car;
}

function frame(rig: Rig, frames = 1): void {
  for (let n = 0; n < frames; n++) {
    for (let i = 0; i < STEPS; i++) rig.world.step();
    rig.car.sync(FRAME);
  }
}

async function makeRig(): Promise<Rig> {
  await initPhysics();
  const scene = new THREE.Scene();
  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  world.timestep = DT;
  world.integrationParameters.numSolverIterations = 8;
  const field = new SurfaceField(uniformAssignment('concrete'));
  buildTerrainPhysics(world, field);
  const car = new Car(world, scene, STARTING_GRID[0], field);
  car.reset(new THREE.Vector3(0, terrainY(0, 0), 0), 0);
  return { world, scene, car };
}

/** Real-world units, because everyone argues about scale: 1 unit = 10 cm. */
const cm = (units: number): string => `${(units * 10).toFixed(2)} cm`;
const mm = (units: number): string => `${(units * 100).toFixed(1)} mm`;

const results: { name: string; ok: boolean; detail: string }[] = [];
function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`);
}

/** Aimed at the parked Car for honest mass, but nowhere near it: no contact. */
function looseFinger(rig: Rig, at: THREE.Vector3, params: FingerParams): Finger {
  return Finger.begin(rig.world, at, rig.car, params);
}

/** The aimed Car's own height — the gesture plane the app really uses. */
function gestureHeight(rig: Rig): number {
  return rig.car.position.y;
}

/**
 * 1. HOLDING STILL. Nothing is moving and nothing is in the way, so a knuckle
 *    held at a point must STAY at that point. This is the bug the user saw on
 *    the desktop: click, do not move, and watch it leave.
 */
async function check1_holdingStillGoesNowhere(): Promise<void> {
  const rig = await makeRig();
  frame(rig, 120);
  const at = new THREE.Vector3(1.5, gestureHeight(rig), 1.5);
  const target = at.clone();
  const finger = looseFinger(rig, at, DEFAULT_FINGER_PARAMS);
  let worst = 0;
  let worstY = 0;
  for (let n = 0; n < 120; n++) {
    for (let i = 0; i < STEPS; i++) {
      finger.drive(target, true, DT);
      rig.world.step();
    }
    rig.car.sync(FRAME);
    worst = Math.max(worst, finger.position.distanceTo(target));
    worstY = Math.max(worstY, Math.abs(finger.position.y - at.y));
  }
  record(
    'a knuckle held still stays where it was put (2 s, 60 fps)',
    worst < 0.001 && worstY < 1e-6,
    `worst drift ${mm(worst)} (budget 1.0 mm), worst Y drift ${mm(worstY)}`,
  );
  finger.end();
}

/**
 * 2. STEP AND STOP. The touch jumps 20 cm away and stops: the knuckle has to
 *    arrive, and then be done. No ringing, no swinging back through the target.
 */
async function check2_arrivesWithoutOvershooting(): Promise<void> {
  const rig = await makeRig();
  frame(rig, 120);
  const start = new THREE.Vector3(1.5, gestureHeight(rig), 1.5);
  const target = start.clone().add(new THREE.Vector3(2, 0, 0)); // 20 cm
  const finger = looseFinger(rig, start, DEFAULT_FINGER_PARAMS);
  const axis = new THREE.Vector3(1, 0, 0);
  let maxBeyond = 0; // how far PAST the target it ever got
  let framesToArrive = -1;
  let worstAfter = 0;
  const trace: string[] = [];
  for (let n = 0; n < 180; n++) {
    for (let i = 0; i < STEPS; i++) {
      finger.drive(target, true, DT);
      rig.world.step();
    }
    rig.car.sync(FRAME);
    const rel = finger.position.clone().sub(target);
    maxBeyond = Math.max(maxBeyond, rel.dot(axis));
    if (framesToArrive < 0 && rel.length() < 0.001) framesToArrive = n + 1;
    if (framesToArrive > 0) worstAfter = Math.max(worstAfter, rel.length());
    if (n < 3 || (n < 40 && n % 4 === 0)) trace.push(`${((n + 1) / 60).toFixed(3)}s ${mm(rel.length())}`);
  }
  console.log(`        trace: ${trace.join(' | ')}`);
  record(
    'a 20 cm jump arrives and stops there — no overshoot, no ringing',
    framesToArrive > 0 && maxBeyond < 0.002 && worstAfter < 0.002,
    `arrived in ${framesToArrive} frames (${(framesToArrive / 60).toFixed(2)} s), ` +
      `worst overshoot past the target ${mm(maxBeyond)}, worst distance after arriving ${mm(worstAfter)} (budget 2.0 mm)`,
  );
  finger.end();
}

/**
 * 3. SMALL CIRCLES. The complaint: "moving in small circles it starts orbiting
 *    a few centimetres from the pointer". A 2 cm circle at 1 Hz is a gentle
 *    motion a hand makes without thinking; the knuckle has to stay under it.
 */
async function check3_staysUnderACirclingPointer(): Promise<void> {
  const rig = await makeRig();
  frame(rig, 120);
  const centre = new THREE.Vector3(1.5, gestureHeight(rig), 1.5);
  const radius = 0.2; // 2 cm
  const period = 1.0; // s — one lap per second, unhurried
  const finger = looseFinger(rig, centre.clone().add(new THREE.Vector3(radius, 0, 0)), DEFAULT_FINGER_PARAMS);
  let worst = 0;
  let sum = 0;
  let samples = 0;
  const trace: string[] = [];
  const target = new THREE.Vector3();
  for (let n = 0; n < 180; n++) {
    for (let i = 0; i < STEPS; i++) {
      // Sampling every frame here would alias the step loop into looking calm:
      // the target is per frame, the drive is per step, same as the app.
      const t = (n * FRAME + 0) as number;
      const a = (t / period) * Math.PI * 2;
      target.copy(centre).add(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
      finger.drive(target, true, DT);
      rig.world.step();
    }
    rig.car.sync(FRAME);
    const d = finger.position.distanceTo(target);
    worst = Math.max(worst, d);
    sum += d;
    samples++;
    if (n >= 60 && n < 70) trace.push(`${mm(d)}`);
  }
  console.log(`        trace (10 consecutive frames): ${trace.join(' | ')}`);
  record(
    'a pointer circling 2 cm keeps the knuckle under it, not orbiting',
    worst < 0.02 && sum / samples < 0.01,
    `worst lag ${mm(worst)} (budget 20 mm), mean ${mm(sum / samples)}`,
  );
  finger.end();
}

/**
 * 4. THE PLANE. Nothing — not contact, not a moving Car, not the sweep — may
 *    move the knuckle up or down. It is a hoverboard above the Track.
 */
async function check4_theKnuckleNeverLeavesItsPlane(): Promise<void> {
  const rig = await makeRig();
  frame(rig, 120);
  const carY = gestureHeight(rig);
  const at = rig.car.position.clone().add(new THREE.Vector3(-2.5, 0, 0));
  at.y = carY;
  const through = rig.car.position.clone().add(new THREE.Vector3(2.5, 0, 0));
  through.y = carY;
  const finger = Finger.begin(rig.world, at, rig.car, DEFAULT_FINGER_PARAMS);
  const startY = finger.position.y;
  let worstY = 0;
  let rolled = 0;
  const before = rig.car.position.clone();
  const target = at.clone();
  // Sweep clean through the Car at a speed a hand makes, then hold still.
  for (let n = 0; n < 240; n++) {
    if (n < 30) target.lerp(through, 1 / 6);
    for (let i = 0; i < STEPS; i++) {
      finger.drive(target, true, DT);
      rig.world.step();
    }
    rig.car.sync(FRAME);
    worstY = Math.max(worstY, Math.abs(finger.position.y - startY));
  }
  rolled = rig.car.position.distanceTo(before);
  record(
    'contact moves the Car, never the knuckle up or down',
    worstY < 1e-6,
    `worst Y drift through a whole strike ${mm(worstY)} (budget 0.0 mm)`,
  );
  // The other half of the same promise: a fix that glued the knuckle to the
  // pointer so hard that nothing could resist it would pass 1–4 and ruin the
  // game. The Car still has to take a finite shove and come to rest.
  frame(rig, 600);
  let restFrames = 0;
  for (let n = 0; n < 900 && !rig.car.atRest(); n++) {
    frame(rig);
    restFrames = n + 1;
  }
  record(
    'the Car is still shoved, and still stops (the strike did not disappear)',
    rolled > 0.02 && rig.car.atRest(),
    `Car moved ${cm(rolled)}, came to rest after ${(restFrames / 60).toFixed(2)} s more`,
  );
  finger.end();
}

export async function run(): Promise<boolean> {
  console.log('the knuckle tracks the touch (flat control first)\n');
  await check1_holdingStillGoesNowhere();
  await check2_arrivesWithoutOvershooting();
  await check3_staysUnderACirclingPointer();
  await check4_theKnuckleNeverLeavesItsPlane();
  const failed = results.filter((r) => !r.ok).length;
  console.log(
    `\n${results.length - failed}/${results.length} checks passed` +
      (failed ? ' — read above: the knuckle is somewhere the pointer is not' : ''),
  );
  return failed > 0;
}
