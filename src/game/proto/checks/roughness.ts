/**
 * THROWAWAY PROTOTYPE CHECK — ticket 17 (roughness bet).
 *
 * The bet: relief at the scale a 1:64 wheel can fall into changes how the Car
 * behaves, and is worth its complexity. Nobody gets to answer that by feeling
 * strongly about it, so this measures both halves of the question:
 *
 * 1. **Does anything change?** Same Car, same Surface, only the relief moves.
 *    Rolling distance, how often a wheel leaves the ground, and how much the
 *    body gets thrown about.
 * 2. **What does it cost?** Per-frame time with the heightfield that replaces
 *    the flat slab, against the slab it replaces — on the desktop, which is a
 *    ceiling for what the phone sees, not a promise.
 *
 * Run: node scripts/headless-check.mjs src/game/proto/checks/roughness.ts
 */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GRAVITY, buildTerrainPhysics, initPhysics, stonesIn, terrainY } from '../world.js';
import { Track } from '../track.js';
import { SURFACES, SurfaceField, uniformAssignment } from '../surfaces.js';
import { Car, STARTING_GRID } from '../car.js';

const FRAME = 1 / 60;

interface Metrics {
  rolled: number;
  /** Frames in which at least one wheel had nothing under it. */
  leftGround: number;
  /** Peak vertical speed — how much the body is thrown about. */
  peakVy: number;
  /** Peak sideways wander, which nothing asked the Car to do. */
  lateral: number;
  framesRolling: number;
}

interface Rig {
  world: RAPIER.World;
  car: Car;
}

interface Rig {
  world: RAPIER.World;
  car: Car;
  track: Track;
  field: SurfaceField;
  keep: (x: number, z: number) => boolean;
}

async function makeRig(keepGravel?: (track: Track, x: number, z: number) => boolean): Promise<Rig> {
  await initPhysics();
  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  world.timestep = 1 / 240;
  world.integrationParameters.numSolverIterations = 8;
  const field = new SurfaceField(uniformAssignment('asphalt'));
  // Same rule the app uses unless the caller asks for another shape of it:
  // stones only go where a car can actually drive over them.
  const track = new Track(new THREE.Scene());
  const keep = keepGravel
    ? (x: number, z: number) => keepGravel(track, x, z)
    : (x: number, z: number) => track.progressOf({ x, z }).dist < 2.2;
  buildTerrainPhysics(world, field, keep);
  const car = new Car(world, new THREE.Scene(), STARTING_GRID[1], field);
  return { world, car, track, field, keep };
}

/** Roll the middle-of-the-road Car over ground with `gravel` stones per unit². */
async function roll(gravel: number, frames = 420): Promise<Metrics> {
  SURFACES.asphalt.gravel = gravel;
  const rig = await makeRig();
  const car = rig.car;
  // On the Track, which is where the stones are: the bottom straight, heading
  // along it. Rolling out there instead would be rolling on clean concrete.
  const p = rig.track.pointAt(rig.track.progressOf({ x: 18, z: 5 }).s);
  car.reset(new THREE.Vector3(p.x, terrainY(p.x, p.z), p.z), Math.atan2(-p.dz, p.dx));
  for (let n = 0; n < 40; n++) {
    for (let i = 0; i < 4; i++) rig.world.step();
    car.sync(FRAME);
  }
  const start = car.position.clone();
  const dir = new THREE.Vector3(p.dx, 0, p.dz).normalize();
  const point = car
    .clampToFrame(car.position.clone().add(dir.clone().multiplyScalar(-1)))
    .setY(car.position.y);
  car.chassis.applyImpulseAtPoint(dir.clone().multiplyScalar(5), point, true);

  let leftGround = 0;
  let peakVy = 0;
  let lateral = 0;
  let framesRolling = 0;
  for (let n = 0; n < frames; n++) {
    for (let i = 0; i < 4; i++) rig.world.step();
    car.sync(FRAME);
    if (car.wheelSurfaces().some((s) => s === null)) leftGround++;
    if (Math.hypot(car.chassis.linvel().x, car.chassis.linvel().z) > 0.05) framesRolling++;
    peakVy = Math.max(peakVy, Math.abs(car.chassis.linvel().y));
    lateral = Math.max(lateral, Math.abs(car.position.z - start.z));
  }
  return {
    rolled: car.position.distanceTo(start),
    leftGround,
    peakVy,
    lateral,
    framesRolling,
  };
}

const results: { name: string; ok: boolean }[] = [];
function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`);
}

/**
 * 1. The bet itself: does relief CHANGE anything that can be measured? If a
 * 2 mm relief does not move a single number, the answer to ticket 17 is no and
 * stopping here is the right thing to do.
 */
async function check1_reliefChangesTheRoll(): Promise<void> {
  // Fine steps at the bottom of the range on purpose: if even a tenth of a
  // millimetre changes the roll, then a useful knob has to be very fine — and
  // if it takes a millimetre to move anything, the whole idea needs rethinking.
  // The FIRST two rows are the control nobody would think to ask for: a
  // heightfield with essentially NO relief. If that already brakes the Car,
  // then every number below is the cost of using a heightfield at all and not
  // the cost of bumps — and the whole measurement is an artifact.
  const steps = [0, 1, 4, 9, 16, 25];
  const runs: Metrics[] = [];
  for (const step of steps) runs.push(await roll(step));
  const rows = runs.map(
    (m, i) =>
      `${String(steps[i]).padStart(3)} stones/unit²:`.padEnd(22) +
      `${(m.rolled * 10).toFixed(0)} mm real rolled, ${String(m.leftGround).padStart(3)} frames airborne,`
      + ` peak |vy| ${m.peakVy.toFixed(3)}, wander ${(m.lateral * 1000).toFixed(1)} mm`,
  );
  const flat = runs[0];
  const two = runs[runs.length - 1];
  // "Felt" means: something a number can see. Distance OR how often a wheel is
  // genuinely in the air OR how much the body is shaken.
  const rolledChange = Math.abs(two.rolled - flat.rolled) / flat.rolled > 0.05;
  const airborne = two.leftGround > flat.leftGround + 5;
  const shaken = two.peakVy > flat.peakVy * 2;
  record(
    'small wheels feel the stones (measured, not asserted)',
    rolledChange || airborne || shaken,
    `${rows.join('\n        ')}\n        changed: distance ${rolledChange}, airborne ${airborne}, vertical motion ${shaken}`,
  );
}

/**
 * 2. The mechanism has to be the honest one: a wheel over a dip should genuinely
 * leave the ground, which is the only thing about bumps this model can do
 * (ticket 16 made an unloaded wheel grip nothing). If instead the numbers moved
 * through some other channel, it would be authored behaviour.
 */
async function check2_wheelsActuallyLeaveTheGround(): Promise<void> {
  const flat = await roll(0);
  const rough = await roll(16);
  record(
    'the bumps act through contact being LOST, not through any extra force',
    rough.leftGround > flat.leftGround,
    `clean ground lost a wheel on ${flat.leftGround} of 420 frames; gravelly on ${rough.leftGround}`
      + ` — a wheel that is genuinely in the air grips nothing (ticket 16)`,
  );
}

/**
 * 3. Cost, which is the other half of the bet. One stone is nearly free; a
 * whole loop full of them is not, so this measures three shapes of it and lets
 * the numbers make the argument.
 */
async function check3_whatItCosts(): Promise<void> {
  /** One short stretch of Track, ~4 units long: a bad patch, not a whole Surface. */
  const patchOnly =
    (track: Track, x: number, z: number): boolean => {
      const p = track.progressOf({ x, z });
      const centre = track.progressOf({ x: 18, z: 5 }).s;
      return p.dist < 2.2 && Math.abs(p.s - centre) < 2;
    };

  async function cost(
    gravel: number,
    keepGravel?: (track: Track, x: number, z: number) => boolean,
  ): Promise<{ ms: number; stones: number }> {
    SURFACES.asphalt.gravel = gravel;
    const rig = await makeRig(keepGravel);
    rig.car.reset(new THREE.Vector3(18, terrainY(18, 5), 5), 0);
    for (let n = 0; n < 20; n++) {
      for (let i = 0; i < 4; i++) rig.world.step();
      rig.car.sync(FRAME);
    }
    const t0 = performance.now();
    for (let n = 0; n < 300; n++) {
      for (let i = 0; i < 4; i++) rig.world.step();
      rig.car.sync(FRAME);
    }
    const ms = (performance.now() - t0) / 300;
    return { ms, stones: stonesIn(rig.field, rig.keep).length };
  }

  const clean = await cost(0);
  const loop = await cost(4);
  const more = await cost(25);
  const patch = await cost(4, patchOnly);
  record(
    'what it costs scales with how much ground is gravelled, not with the Surface',
    patch.ms - clean.ms < (loop.ms - clean.ms) / 8,
    [
      `clean ground:                ${clean.ms.toFixed(3)} ms/frame (${clean.stones} stones)`,
      `whole Track at 4 per unit²:  ${loop.ms.toFixed(3)} ms/frame (${loop.stones} stones)`,
      `whole Track at 25 per unit²: ${more.ms.toFixed(3)} ms/frame (${more.stones} stones)`,
      `one 4-unit patch at 4/unit²: ${patch.ms.toFixed(3)} ms/frame (${patch.stones} stones)`,
      `— desktop; the phone is the real test, and it is slower than this`,
    ].join('\n        '),
  );
}

/**
 * 4. Whatever the bumps do to movement, they must not break stillness: a Car
 * parked on relief has to settle and stay (every prior ticket's stability
 * guard, and the thing a bumpy surface could quietly destroy).
 */
async function check4_stillRestOnRelief(): Promise<void> {
  SURFACES.asphalt.gravel = 25;
  const rig = await makeRig();
  const car = rig.car;
  // On the Track, which is where the stones are: the bottom straight, heading
  // along it. Rolling out there instead would be rolling on clean concrete.
  const p = rig.track.pointAt(rig.track.progressOf({ x: 18, z: 5 }).s);
  car.reset(new THREE.Vector3(p.x, terrainY(p.x, p.z), p.z), Math.atan2(-p.dz, p.dx));
  // Let it find its own resting place first: among stones, "settling" includes
  // rolling into whatever dip it happened to land beside. What has to be true
  // is that once it has settled it STAYS — the prior tickets' guard.
  for (let n = 0; n < 240; n++) {
    for (let i = 0; i < 4; i++) rig.world.step();
    car.sync(FRAME);
  }
  const settled = car.position.clone();
  let maxV = 0;
  let maxW = 0;
  let step = 0;
  let prev = settled.clone();
  for (let n = 0; n < 360; n++) {
    for (let i = 0; i < 4; i++) rig.world.step();
    car.sync(FRAME);
    const v = car.chassis.linvel();
    const w = car.chassis.angvel();
    maxV = Math.max(maxV, Math.hypot(v.x, v.y, v.z));
    maxW = Math.max(maxW, Math.hypot(w.x, w.y, w.z));
    step = Math.max(step, car.position.distanceTo(prev));
    prev = car.position.clone();
  }
  const drift = car.position.distanceTo(settled);
  record(
    'a Car parked among stones still settles and stays put',
    drift < 0.01 && step < 0.0002 && maxV < 0.02 && maxW < 0.06 && car.atRest(),
    `after finding its dip: drift over 6 s ${(drift * 100).toFixed(2)} mm real, largest single move ${(step * 100).toFixed(3)} mm;`
      + ` max |v| ${maxV.toFixed(4)}, max |ω| ${maxW.toFixed(4)}; at rest ${car.atRest()}`,
  );
}

export async function run(): Promise<boolean> {
  console.log('roughness bet — headless check (ticket 17)\n');
  try {
    await check1_reliefChangesTheRoll();
    await check2_wheelsActuallyLeaveTheGround();
    await check3_whatItCosts();
    await check4_stillRestOnRelief();
  } finally {
    SURFACES.asphalt.gravel = 0; // leave the world as we found it
  }
  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed`
      + (failed.length ? ` — FAILED: ${failed.map((f) => f.name).join('; ')}` : ''),
  );
  return failed.length > 0;
}
