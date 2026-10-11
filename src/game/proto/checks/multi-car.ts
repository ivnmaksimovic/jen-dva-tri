/**
 * THROWAWAY PROTOTYPE CHECK — ticket 12 (multiple Cars).
 *
 * The question ticket 12 exists to answer is not "can we draw three Cars" —
 * it is whether several 1:64 bodies behave where they meet. Every solver
 * problem so far showed up exactly there (v1's jointed wheels ratcheted into
 * vibration and creep), so this answers it the same way the rest of the
 * build notes were earned: by running the REAL Car, the REAL world settings
 * and the REAL strike rule headlessly and measuring.
 *
 * Run: node scripts/headless-check.mjs src/game/proto/checks/multi-car.ts
 */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GRAVITY, buildTerrainPhysics, initPhysics } from '../world.js';
import { SurfaceField, uniformAssignment } from '../surfaces.js';
import { STARTING_GRID, Car, carHalfWidth, type CarParams } from '../car.js';

const FRAME = 1 / 60; // one frame = 4 × 1/240 steps, same as the app
const REST_V = 0.02; // Car.atRest() linear threshold
const REST_W = 0.06; // Car.atRest() angular threshold

interface Rig {
  world: RAPIER.World;
  scene: THREE.Scene;
  cars: Car[];
}

/** One 60 fps frame exactly as the prototype runs it. */
function frame(rig: Rig, frames = 1): void {
  for (let n = 0; n < frames; n++) {
    for (let i = 0; i < 4; i++) rig.world.step();
    for (const car of rig.cars) car.sync(FRAME);
  }
}

async function makeRig(params: CarParams[]): Promise<Rig> {
  await initPhysics();
  const scene = new THREE.Scene();
  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  world.timestep = 1 / 240;
  world.integrationParameters.numSolverIterations = 8;

  // The REAL Terrain (four squares, one raised 2 cm, the two ramps) with
  // EVERY square made of Concrete: this check is about whether several bodies
  // behave, not about which Surface they are on, and grip now comes from the
  //Surface under each wheel — so one Surface everywhere is what isolates it.
  // Its collider friction is irrelevant to the Car either way: every Car
  // collider is friction 0 with combine rule Min, so Rapier's contact
  // friction never applies — grip is applied by hand in Car.sync().
  const field = new SurfaceField(uniformAssignment('concrete'));
  buildTerrainPhysics(world, field);

  const cars = params.map((p) => new Car(world, scene, p, field));
  return { world, scene, cars };
}

function place(car: Car, x: number, z: number, yaw = 0): void {
  car.reset(new THREE.Vector3(x, 0, z), yaw);
}

/**
 * A Push exactly the way the player delivers one: the strike lands on the
 * frame (clampToFrame), must go INTO the Car (pushesFrom — the no-pull rule),
 * and the impulse is applied at that point (off-centre = the curve Push).
 * Returns false if that gesture could not be a Push at all.
 */
function strike(car: Car, toward: THREE.Vector3, strength: number): boolean {
  const dir = toward.clone().setY(0).normalize();
  const from = car.position.clone().add(dir.clone().multiplyScalar(-1)); // standing off, behind the strike side
  const point = car.clampToFrame(from).setY(car.position.y);
  if (!car.pushesFrom(point, dir)) return false;
  car.chassis.applyImpulseAtPoint(dir.clone().multiplyScalar(strength), point, true);
  return true;
}

function vel(car: Car): THREE.Vector3 {
  const v = car.chassis.linvel();
  return new THREE.Vector3(v.x, v.y, v.z);
}
function angVel(car: Car): THREE.Vector3 {
  const w = car.chassis.angvel();
  return new THREE.Vector3(w.x, w.y, w.z);
}
function tiltDeg(car: Car): number {
  const up = new THREE.Vector3(0, 1, 0);
  return THREE.MathUtils.radToDeg(up.angleTo(up.clone().applyQuaternion(car.quaternion)));
}

const results: { name: string; ok: boolean; detail: string }[] = [];
function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`);
}

const GRID: CarParams[] = [
  STARTING_GRID[0], // Red   — light
  STARTING_GRID[1], // Blue  — identical to Red except the paint
  STARTING_GRID[2], // Green — heavy, big wheels, stickier
];

/**
 * Use grid defaults, not whatever the browser has saved — a check that picks
 * up someone's phone tuning is not a check.
 */
async function check1_restSideBySide(): Promise<void> {
  const rig = await makeRig([GRID[0], GRID[1]]); // only the two being watched
  // Red and Blue abreast with GRID_GAP (2 mm real) between their wheels —
  // the starting grid the prototype places.
  const gap = 0.02;
  const lat = (carHalfWidth(GRID[0]) + carHalfWidth(GRID[1]) + gap) / 2;
  place(rig.cars[0], 0, -lat);
  place(rig.cars[1], 0, lat);
  const start = rig.cars.map((c) => c.position.clone());

  // Let them drop and settle, then watch for 6 s of doing nothing.
  frame(rig, 60);
  const settled = rig.cars.map((c) => c.position.clone());
  let maxV = 0;
  let maxW = 0;
  let maxStep = 0;
  let prev = rig.cars.map((c) => c.position.clone());
  for (let n = 0; n < 360; n++) {
    frame(rig);
    maxV = Math.max(maxV, ...rig.cars.map((c) => vel(c).length()));
    maxW = Math.max(maxW, ...rig.cars.map((c) => angVel(c).length()));
    rig.cars.forEach((c, i) => {
      maxStep = Math.max(maxStep, c.position.distanceTo(prev[i]));
      prev[i] = c.position.clone();
    });
  }
  const drift = rig.cars.map((c, i) => c.position.distanceTo(settled[i]));
  const dropSettle = rig.cars.map((c, i) => start[i].y - c.position.y);
  const details = [
    `drift over 6 s: ${drift.map((d) => (d * 100).toFixed(2)).join(', ')} mm real`,
    `per-frame move max: ${(maxStep * 100).toFixed(4)} mm real`,
    `max |v| ${maxV.toFixed(4)} (at rest < ${REST_V}), max |ω| ${maxW.toFixed(4)} (< ${REST_W})`,
    `settle drop: ${dropSettle.map((d) => (d * 10).toFixed(2)).join(', ')} mm real`,
  ].join('\n        ');
  record(
    'two Cars resting side by side neither creep nor jitter',
    Math.max(...drift) < 0.01 && maxV < REST_V && maxW < REST_W,
    details,
  );
}

/** Does a Push transfer through contact, and do both Cars come to rest? */
async function check2_pushTransfer(): Promise<void> {
  const rig = await makeRig([GRID[0], GRID[1]]);
  const z = 0;
  place(rig.cars[0], 0, z); // Red: the one being pushed
  place(rig.cars[1], 0.5, z); // Blue: half a unit ahead
  frame(rig, 60);
  const before = rig.cars.map((c) => c.position.clone());

  const okStrike = strike(rig.cars[0], new THREE.Vector3(1, 0, 0), 4);
  let maxY = -Infinity;
  let settleFrame = -1;
  for (let n = 0; n < 600; n++) {
    frame(rig);
    maxY = Math.max(maxY, ...rig.cars.map((c) => c.position.y));
    if (settleFrame < 0 && rig.cars.every((c) => c.atRest())) settleFrame = n;
  }
  const moved = rig.cars.map((c, i) => c.position.distanceTo(before[i]));
  const restY = rig.cars.map((c) => c.position.y);
  const rideY = rig.cars.map((c) => c.params.wheelRadius + 0.035);
  record(
    'pushing one Car into another transfers motion and both settle',
    okStrike && moved[1] > 0.05 && rig.cars.every((c) => c.atRest()),
    [
      `moved: pushed ${(moved[0] * 10).toFixed(1)} cm real, struck ${(moved[1] * 10).toFixed(1)} cm real`,
      `both at rest after ${(settleFrame / 60).toFixed(2)} s`,
      `no launch: highest point ${maxY.toFixed(3)} vs ride height ${restY.map((y, i) => `${y.toFixed(3)}/${rideY[i].toFixed(3)}`).join(', ')}`,
      `no sink: y vs expected ${restY.map((y, i) => (y - rideY[i]).toFixed(4)).join(', ')}`,
      `tilt ${rig.cars.map((c) => tiltDeg(c).toFixed(1)).join(', ')}°`,
    ].join('\n        '),
  );
}

/** Contact must not LOCK: a Car leaning on another can still be Pushed off. */
async function check3_contactDoesNotLock(): Promise<void> {
  const rig = await makeRig([GRID[0], GRID[1]]);
  place(rig.cars[0], 0, 0);
  place(rig.cars[1], 0, carHalfWidth(GRID[0]) + carHalfWidth(GRID[1]) - 0.01); // overlapping → shoved apart by contact
  frame(rig, 120); // let the contact resolve and everyone settle
  const touching = rig.cars[0].position.distanceTo(rig.cars[1].position);
  const before = rig.cars.map((c) => c.position.clone());

  // Push each Car away from the other.
  const okAway = strike(rig.cars[0], new THREE.Vector3(0, 0, -1), 4);
  const okBack = strike(rig.cars[1], new THREE.Vector3(0, 0, 1), 4);
  frame(rig, 300);
  const moved = rig.cars.map((c, i) => c.position.distanceTo(before[i]));
  const apart = rig.cars[0].position.distanceTo(rig.cars[1].position);
  record(
    'a Car resting against another can be Pushed away (contact does not lock)',
    okAway && okBack && moved[0] > 0.1 && moved[1] > 0.1 && apart > touching,
    [
      `centres before ${touching.toFixed(3)} → after ${apart.toFixed(3)}`,
      `each moved ${moved.map((d) => (d * 10).toFixed(1)).join(', ')} cm real away from the contact`,
      `both at rest: ${rig.cars.every((c) => c.atRest())}`,
    ].join('\n        '),
  );
}

/** Three different Cars nose to tail: the worst case for a solver chain. */
async function check4_chainOfDifferentCars(): Promise<void> {
  const rig = await makeRig(GRID);
  // Nose to tail along X — light into identical light into heavy.
  let x = 0;
  for (let i = 0; i < GRID.length; i++) {
    place(rig.cars[i], x, 0);
    x += 0.225 * 2 + 0.02; // chassis length + a hair
  }
  frame(rig, 60);
  const before = rig.cars.map((c) => c.position.clone());
  const okStrike = strike(rig.cars[0], new THREE.Vector3(1, 0, 0), 6);
  let maxY = -Infinity;
  for (let n = 0; n < 600; n++) {
    frame(rig);
    maxY = Math.max(maxY, ...rig.cars.map((c) => c.position.y));
  }
  const moved = rig.cars.map((c, i) => c.position.distanceTo(before[i]));
  const finite = rig.cars.every((c) => Number.isFinite(c.position.length()));
  record(
    'a three-Car chain (different mass/wheels) transfers and settles',
    okStrike &&
      finite &&
      moved.every((d) => d > 0.05) &&
      rig.cars.every((c) => c.atRest()) &&
      maxY < 0.5,
    [
      `moved ${moved.map((d) => (d * 10).toFixed(1)).join(', ')} cm real (light → heavy)`,
      `all at rest: ${rig.cars.every((c) => c.atRest())}`,
      `highest point ${maxY.toFixed(3)} (no launch should keep it ≈ ride height 0.135)`,
      `tilt ${rig.cars.map((c) => tiltDeg(c).toFixed(1)).join(', ')}°`,
    ].join('\n        '),
  );
}

/** Frame cost: does the step budget hold with three bodies in contact? */
async function check5_frameCost(): Promise<void> {
  const one = await makeRig([GRID[0]]);
  const three = await makeRig(GRID);
  place(three.cars[0], 0, 0);
  place(three.cars[1], 0, carHalfWidth(GRID[0]) + carHalfWidth(GRID[1]) + 0.02);
  place(three.cars[2], 0.5, -1.5);
  frame(three, 60);
  const time = (r: Rig, frames: number): number => {
    const t0 = performance.now();
    frame(r, frames);
    return (performance.now() - t0) / frames;
  };
  const msOne = time(one, 600);
  const msThree = time(three, 600);
  record(
    'three Cars stay inside the frame budget (physics only)',
    msThree < 4, // 4 ms would already be 25% of a 16.6 ms frame on the phone
    `per frame (4 steps + wheel friction): 1 Car ${msOne.toFixed(3)} ms, 3 Cars ${msThree.toFixed(3)} ms`,
  );
}

/**
 * Aiming has to survive whatever keeps several Cars still: WHERE the finger
 * lands decides the curve, and nothing else does. A dead-centre strike must
 * roll straight (any turn would be invented behaviour — see ADR-0001), while a
 * strike near a rear corner must still turn the Car. That difference is the
 * game, so it is guarded here.
 */
async function check6_whereYouStrikeDecidesTheCurve(): Promise<void> {
  async function roll(
    offsetZ: number,
    strength = 5,
  ): Promise<{ yaw: number; lateral: number; forward: number }> {
    const r = await makeRig([GRID[0]]);
    place(r.cars[0], 0, 0);
    frame(r, 30);
    const car = r.cars[0];
    const dir = new THREE.Vector3(1, 0, 0);
    const point = car
      .clampToFrame(car.position.clone().add(new THREE.Vector3(-1, 0, offsetZ)))
      .setY(car.position.y);
    car.chassis.applyImpulseAtPoint(dir.clone().multiplyScalar(strength), point, true);
    const start = car.position.clone();
    frame(r, 600);
    const d = car.position.clone().sub(start);
    return { yaw: car.yaw, lateral: d.z, forward: d.x };
  }
  const straight = await roll(0);
  const curve = await roll(0.09); // just in from the rear corner of the frame
  record(
    'a centre strike goes straight, a corner strike curves (aim still decides)',
    Math.abs(straight.yaw) < THREE.MathUtils.degToRad(2) &&
      Math.abs(straight.lateral) < 0.02 &&
      Math.abs(curve.yaw) > THREE.MathUtils.degToRad(15),
    [
      `centre: rolled ${(straight.forward * 10).toFixed(1)} cm real, sideways ${(straight.lateral * 1000).toFixed(1)} mm real, turned ${THREE.MathUtils.radToDeg(straight.yaw).toFixed(2)}°`,
      `corner: rolled ${(curve.forward * 10).toFixed(1)} cm real, sideways ${(curve.lateral * 1000).toFixed(0)} mm real, turned ${THREE.MathUtils.radToDeg(curve.yaw).toFixed(1)}°`,
    ].join('\n        '),
  );
}

export async function run(): Promise<boolean> {
  console.log('multiple Cars — headless check (ticket 12)\n');
  await check1_restSideBySide();
  await check2_pushTransfer();
  await check3_contactDoesNotLock();
  await check4_chainOfDifferentCars();
  await check5_frameCost();
  await check6_whereYouStrikeDecidesTheCurve();
  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed` +
      (failed.length ? ` — FAILED: ${failed.map((f) => f.name).join('; ')}` : ''),
  );
  return failed.length > 0;
}
