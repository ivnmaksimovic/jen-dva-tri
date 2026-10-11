/**
 * THROWAWAY PROTOTYPE CHECK — ticket 16 (spatial Surfaces, grip per wheel).
 *
 * The claim of ticket 16 is not "the Car can be on a Surface" — it is that
 * **each wheel** gets its grip from what is under **it**, and that crossing
 * from one Surface to another needs no code of its own. Both are claims about
 * behaviour, so both get measured against the REAL Car, the REAL Terrain and
 * the REAL default Surface numbers.
 *
 * Run: node scripts/headless-check.mjs src/game/proto/checks/surfaces.ts
 */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GRAVITY, RAISED_TOP, buildTerrainPhysics, initPhysics, terrainY } from '../world.js';
import {
  DEFAULT_ASSIGNMENT,
  SURFACES,
  SurfaceField,
  uniformAssignment,
  type SurfaceKey,
} from '../surfaces.js';
import { Car, carHalfWidth, STARTING_GRID, type CarParams } from '../car.js';

const FRAME = 1 / 60; // one frame = 4 × 1/240 steps, same as the app

interface Rig {
  world: RAPIER.World;
  scene: THREE.Scene;
  car: Car;
  chassisCap?: never;
}

/** One 60 fps frame exactly as the prototype runs it. */
function frame(rig: Rig, frames = 1): void {
  for (let n = 0; n < frames; n++) {
    for (let i = 0; i < 4; i++) rig.world.step();
    rig.car.sync(FRAME);
  }
}

/**
 * The REAL Terrain with either the real four-Surface layout or one Surface
 * everywhere (for the checks that must isolate something else).
 */
async function makeRig(
  squares = { ...DEFAULT_ASSIGNMENT },
  params: CarParams = STARTING_GRID[1], // Blue: the middle-of-the-road Car
): Promise<Rig> {
  await initPhysics();
  const scene = new THREE.Scene();
  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  world.timestep = 1 / 240;
  world.integrationParameters.numSolverIterations = 8;
  const field = new SurfaceField(squares);
  buildTerrainPhysics(world, field);
  const car = new Car(world, scene, params, field);
  return { world, scene, car };
}

/** Drop the Car at (x, z) facing `yaw`, then let it settle. */
function place(rig: Rig, x: number, z: number, yaw = 0, settleFrames = 40): void {
  const y = terrainY(x, z);
  rig.car.reset(new THREE.Vector3(x, y, z), yaw);
  frame(rig, settleFrames);
}

/**
 * A Push exactly the way the player delivers one (same rule as multi-car's):
 * lands on the frame, must go INTO the Car, applied at that point.
 */
function strike(car: Car, toward: THREE.Vector3, strength: number): boolean {
  const dir = toward.clone().setY(0).normalize();
  const from = car.position.clone().add(dir.clone().multiplyScalar(-1));
  const point = car.clampToFrame(from).setY(car.position.y);
  if (!car.pushesFrom(point, dir)) return false;
  car.chassis.applyImpulseAtPoint(dir.clone().multiplyScalar(strength), point, true);
  return true;
}

/** Straight-line roll distance from a centre strike (cm real). */
function rollDistance(rig: Rig, strength = 5, maxFrames = 900): number {
  const car = rig.car;
  const start = car.position.clone();
  const ok = strike(car, new THREE.Vector3(1, 0, 0), strength);
  if (!ok) throw new Error('the strike was not a Push (no-pull rule rejected it)');
  frame(rig, maxFrames);
  return car.position.distanceTo(start) * 10;
}

const results: { name: string; ok: boolean; detail: string }[] = [];
function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`);
}

/** Height the wheels actually find under them, via the same cast the Car uses. */
function groundHeightUnder(rig: Rig, x: number, z: number): number {
  const ray = new RAPIER.Ray({ x, y: 2, z }, { x: 0, y: -1, z: 0 });
  const hit = rig.world.castRay(ray, 5, true, undefined, (0x0001 << 16) | 0x0001);
  return hit ? 2 - hit.timeOfImpact : NaN;
}

/**
 * 1. The world is what `terrainY` says it is. Chalk, the aim ring and camera
 * height all read `terrainY`; the wheels read the actual colliders. If those
 * two disagree, everything drawn lies — and nothing else here can be trusted.
 */
async function check1_terrainIsWhereTheDrawingSays(): Promise<void> {
  const rig = await makeRig();
  frame(rig, 2); // Rapier's query pipeline fills on the first step
  const probes: [number, number, string][] = [
    [6, 5, 'flat square (SW)'],
    [18, 5, 'flat square (SE)'],
    [6, 18, 'raised square'],
    [14.25, 22, 'middle of the top ramp'],
    [13.05, 22, 'just past the ramp joint'],
    [6, 20, 'beside the ramp, still raised'],
    [0, 9.75, 'middle of the left ramp'],
    [0, 8.6, 'bottom of the left ramp'],
    [0, 20, 'hard curb ground side'],
    [-2, 5, 'outside the squares'],
  ];
  const rows: string[] = [];
  let worst = 0;
  for (const [x, z, what] of probes) {
    const drawn = terrainY(x, z);
    const real = groundHeightUnder(rig, x, z);
    const off = Math.abs(drawn - real);
    worst = Math.max(worst, off);
    rows.push(
      `${what.padEnd(28)} drawn ${(drawn * 10).toFixed(2)} cm real, physics ${(real * 10).toFixed(2)} cm real`,
    );
  }
  // 0.5 mm of disagreement is invisible; more than that means a ramp deck was
  // built with its top face off the line it was supposed to follow.
  record(
    'the drawn Terrain and the Terrain the wheels find are the same world',
    worst < 0.005,
    `${rows.join('\n        ')}\n        worst disagreement ${(worst * 10).toFixed(3)} mm real`,
  );
}

/**
 * 2. Grip comes from the contact: the SAME Car, nothing about it changed,
 * rolls measurably differently on different Surfaces. Numbers must differ, not
 * "feel" differently (ticket 16's acceptance criterion).
 */
async function check2_sameCarDifferentSurface(): Promise<void> {
  const rolls: Partial<Record<SurfaceKey, number>> = {};
  for (const key of ['asphalt', 'concrete', 'tiles', 'glass'] as const) {
    const rig = await makeRig(uniformAssignment(key));
    place(rig, 18, 5); // flat square, nothing else near
    rolls[key] = rollDistance(rig, 6);
  }
  const d = rolls as Record<SurfaceKey, number>;
  record(
    'one Car, unchanged, rolls differently on each Surface (grip is the contact)',
    d.glass > d.tiles && d.tiles > d.concrete && d.concrete > d.asphalt,
    [
      `rolled from the same strike: Asphalt ${(d.asphalt * 10).toFixed(1)} mm real, `
        + `Concrete ${(d.concrete * 10).toFixed(1)} mm, Tiles ${(d.tiles * 10).toFixed(1)} mm, `
        + `Glass ${(d.glass * 10).toFixed(1)} mm`,
      `grip/roll pairs: AS ${SURFACES.asphalt.grip}/${SURFACES.asphalt.roll}, `
        + `CO ${SURFACES.concrete.grip}/${SURFACES.concrete.roll}, `
        + `TI ${SURFACES.tiles.grip}/${SURFACES.tiles.roll}, `
        + `GL ${SURFACES.glass.grip}/${SURFACES.glass.roll}`,
    ].join('\n        '),
  );
}

/**
 * 3. A Car straddling a boundary is standing on two Surfaces at once — every
 * wheel reads its own. No code anywhere knows a crossing is happening, so this
 * is the whole mechanism, observed.
 */
async function check3_straddlingWheelOwnSurfaces(): Promise<void> {
  const rig = await makeRig();
  // South half of x = MEET_X: Concrete west, Asphalt east. Heading +X puts the
  // FRONT wheels on Asphalt and the REAR wheels on Concrete.
  place(rig, 13, 5, 0);
  const reads = rig.car.wheelSurfaces();
  const names = reads.map((s) => s?.label ?? 'air');
  record(
    'each wheel reads its OWN Surface while straddling a boundary',
    names.join(',') === 'Concrete,Concrete,Asphalt,Asphalt',
    `wheels (RL, RR, FL, FR): ${names.join(' | ')}`,
  );
}

/**
 * 4. What does a Car split across two Surfaces DO? Whatever the four contacts
 * add up to, and nothing else: with the whole body on one rigid mass the grip
 * pool is shared, so two wheels on each of two Surfaces roll like the average
 * of them — strictly between either extreme, with no line of code deciding
 * which hand to favour. (Real left/right TORQUE differences would need wheels
 * that are separate bodies carrying their own load — Car v1, rejected in the
 * build notes — so none appears here, and none should be expected.)
 */
async function check4_straddlingRollsLikeBoth(): Promise<void> {
  /** Roll straight ahead from (18, z) and report how far it got. */
  async function roll(z: number): Promise<{
    rolled: number;
    still: string[];
    turn: number;
  }> {
    const rig = await makeRig();
    place(rig, 18, z);
    const start = rig.car.position.clone();
    const before = rig.car.yaw;
    strike(rig.car, new THREE.Vector3(1, 0, 0), 5);
    frame(rig, 420);
    let d = rig.car.yaw - before;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return {
      rolled: rig.car.position.distanceTo(start),
      still: rig.car.wheelSurfaces().map((s) => s?.label ?? 'air'),
      turn: d,
    };
  }
  // Same stretch of ground every time, so only the Surfaces differ:
  // z = 5 sits wholly on Asphalt, z = 15 wholly on Glass, z = 11 straddles.
  const onAsphalt = await roll(5);
  const split = await roll(11);
  const onGlass = await roll(15);
  const straddled =
    new Set(split.still).size === 2 &&
    split.still.includes('Asphalt') &&
    split.still.includes('Glass');
  const between = split.rolled > onAsphalt.rolled * 1.1 && split.rolled < onGlass.rolled * 0.9;
  record(
    'a Car across two Surfaces rolls like BOTH, with nothing picking one',
    straddled && between,
    [
      `wholly on Asphalt (roll 0.05): ${(onAsphalt.rolled * 10).toFixed(0)} mm real`,
      `half and half:                 ${(split.rolled * 10).toFixed(0)} mm real, wheels ${split.still.join('|')}, turned ${THREE.MathUtils.radToDeg(split.turn).toFixed(2)}°`,
      `wholly on Glass (roll 0.008):  ${(onGlass.rolled * 10).toFixed(0)} mm real`,
      `not either extreme, but between them: ${between} (the mean of the two is what the four contacts add up to)`,
    ].join('\n        '),
  );
}

/**
 * 5. Left and right on two Surfaces at once: the other axis of "two wheels on
 * two surfaces", across the width instead of along the length.
 */
async function check5_leftAndRightToo(): Promise<void> {
  const rig = await makeRig();
  // Between SE (Asphalt) and NE (Glass): both flat, so this is two wheels
  // abreast on two Surfaces with no height step to confuse it. Facing +X puts
  // the LEFT wheels on one and the RIGHT wheels on the other.
  place(rig, 18, 11, 0);
  const names = rig.car.wheelSurfaces().map((s) => s?.label ?? 'air');
  record(
    'two wheels abreast can be on two Surfaces at once as well',
    new Set(names).size === 2 && !names.includes('air'),
    `wheels (RL, RR, FL, FR): ${names.join(' | ')}`,
  );
}

/**
 * 6. A wheel with nothing under it grips nothing (settled with the user before
 * building: no feel hacks). Airborne ⇒ forward speed is untouched by grip.
 */
async function check6_airborneWheelsGripNothing(): Promise<void> {
  const rig = await makeRig();
  const car = rig.car;
  car.reset(new THREE.Vector3(18, 0, 5), 0);
  // Dropped from well above the world with a steady horizontal speed: for the
  // whole fall no wheel has anything under it, so nothing GRIPS. Some loss is
  // expected — the body's own linear damping (Rapier, a Car property, not
  // part of any Surface) — and it is what sets the bar below.
  car.chassis.setTranslation(
    { x: 18, y: 3 + car.params.wheelRadius + 0.035, z: 5 },
    true,
  );
  car.chassis.setLinvel({ x: 6, y: 0, z: 0 }, true);
  car.chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
  let frames = 0;
  let v0 = 6;
  for (let n = 0; n < 120; n++) {
    frame(rig);
    // Stop the moment anything is under a wheel: past here it is not flight.
    if (car.wheelSurfaces().some((s) => s !== null)) break;
    const v = car.chassis.linvel();
    v0 = Math.hypot(v.x, v.z);
    if (car.position.y < car.params.wheelRadius + 0.06) break;
    frames++;
  }
  const vAfterFreeFlight = v0;
  const airborne = Math.abs(vAfterFreeFlight - 6) / 6;

  const grounded = await makeRig();
  const g = grounded.car;
  g.reset(new THREE.Vector3(18, 0, 5), 0);
  frame(grounded, 10);
  g.chassis.setLinvel({ x: 6, y: 0, z: 0 }, true);
  frame(grounded, frames);
  const gv = g.chassis.linvel();
  const rolling = Math.abs(Math.hypot(gv.x, gv.z) - 6) / 6;
  record(
    'a wheel with nothing under it contributes no grip (airborne ≠ rolling)',
    frames > 5 && airborne < 0.035 && rolling > airborne * 4,
    [
      `free flight for ${frames} frames with nothing under any wheel: kept ${((1 - airborne) * 100).toFixed(2)}% of its speed`,
      `the same ${frames} frames rolling on Asphalt kept ${((1 - rolling) * 100).toFixed(2)}%`,
      `rolling bleeds ${(rolling / Math.max(airborne, 1e-6)).toFixed(0)}× more speed than being airborne`,
    ].join('\n        '),
  );
}

/**
 * 7. The two added casts per wheel must not cost anything visible, and the
 * seam between two boxes must not be a bump: a roll straight across a joint
 * has to be as straight as one inside a single square.
 */
async function check7_seamAndCost(): Promise<void> {
  /** Roll on one Surface and report how straight it stayed. */
  async function rollStraight(startX: number): Promise<{
    lateral: number;
    droppedWheels: number;
    travelled: number;
  }> {
    const rig = await makeRig(uniformAssignment('concrete'));
    place(rig, startX, 5);
    const start = rig.car.position.clone();
    strike(rig.car, new THREE.Vector3(1, 0, 0), 5);
    let lateral = 0;
    let droppedWheels = 0;
    for (let n = 0; n < 420; n++) {
      frame(rig);
      if (rig.car.wheelSurfaces().some((s) => s === null)) droppedWheels++;
      lateral = Math.max(lateral, Math.abs(rig.car.position.z - start.z));
    }
    return { lateral, droppedWheels, travelled: rig.car.position.x - start.x };
  }
  // x = 10 → crosses the joint at x = 13. x = 17 → stays inside one square.
  // Same distance, same Surface everywhere: whatever the joint does shows up
  // as a difference, which is far more honest than a magic threshold.
  const overJoint = await rollStraight(10);
  const insideOne = await rollStraight(17);
  const t0 = performance.now();
  const rig = await makeRig();
  place(rig, 10, 5);
  frame(rig, 300);
  const msPerFrame = (performance.now() - t0) / 300;
  record(
    'the joint between two squares is invisible to a rolling Car, and the cost holds',
    overJoint.travelled > 4 &&
      overJoint.droppedWheels === 0 &&
      overJoint.lateral < insideOne.lateral + 0.002 &&
      msPerFrame < 2.5,
    [
      `crossing the joint: travelled ${(overJoint.travelled * 10).toFixed(0)} mm real, drift ${(overJoint.lateral * 1000).toFixed(2)} mm real`,
      `same roll inside one square: travelled ${(insideOne.travelled * 10).toFixed(0)} mm real, drift ${(insideOne.lateral * 1000).toFixed(2)} mm real`,
      `frames with a wheel airborne: crossing ${overJoint.droppedWheels}, inside ${insideOne.droppedWheels} (of 420)`,
      `per frame with four wheels casting: ${msPerFrame.toFixed(3)} ms (physics + Surface sampling)`,
    ].join('\n        '),
  );
  void carHalfWidth;
}

/**
 * 8. The sidewalk is reachable at its new height. 2 cm instead of 4 cm is the
 * whole point of this ticket's Track change, so the Car must get up there over
 * the worn ramp without being launched by it.
 */
async function check8_twoCentimetreCurbIsClimbable(): Promise<void> {
  const rig = await makeRig();
  // Top straight: the ramp runs from x = 15.5 (ground) up to x = 13 (raised).
  place(rig, 17.5, 22, Math.PI); // heading -X, facing the ramp
  const ok = strike(rig.car, new THREE.Vector3(-1, 0, 0), 8);
  let maxY = -Infinity;
  let maxVy = 0;
  for (let n = 0; n < 600; n++) {
    frame(rig);
    maxY = Math.max(maxY, rig.car.position.y);
    maxVy = Math.max(maxVy, Math.abs(rig.car.chassis.linvel().y));
  }
  const car = rig.car;
  const onTop = car.position.x < 13 && car.position.y > RAISED_TOP + car.params.wheelRadius * 0.5;
  record(
    'a Car can climb the 2 cm sidewalk over the ramp without being launched',
    ok && onTop && maxVy < 2.5,
    [
      `ended at x = ${car.position.x.toFixed(2)}, y = ${(car.position.y * 10).toFixed(1)} mm real (raised square is at ${(RAISED_TOP * 10).toFixed(0)} mm)`,
      `highest point ${(maxY * 10).toFixed(1)} mm real, peak vertical speed ${maxVy.toFixed(2)} (a launch would be several units/s)`,
      `standing on: ${car.wheelSurfaces().map((s) => s?.label ?? 'air').join(', ')}`,
      `at rest: ${car.atRest()}`,
    ].join('\n        '),
  );
}

export async function run(): Promise<boolean> {
  console.log('spatial Surfaces — headless check (ticket 16)\n');
  await check1_terrainIsWhereTheDrawingSays();
  await check2_sameCarDifferentSurface();
  await check3_straddlingWheelOwnSurfaces();
  await check4_straddlingRollsLikeBoth();
  await check5_leftAndRightToo();
  await check6_airborneWheelsGripNothing();
  await check7_seamAndCost();
  await check8_twoCentimetreCurbIsClimbable();
  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed`
      + (failed.length ? ` — FAILED: ${failed.map((f) => f.name).join('; ')}` : ''),
  );
  return failed.length > 0;
}
