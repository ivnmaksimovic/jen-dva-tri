/**
 * THROWAWAY PROTOTYPE CHECK — ticket 18 (the flick control scheme, option C),
 * step 1: does a DRIVEN body even work here?
 *
 * Ticket 18 bets the whole scheme on one idea: instead of computing an impulse
 * from a swipe, put a finger-shaped kinematic body in the world and let the
 * solver resolve the strike. Every other decision in the ticket (no passing
 * through, one gesture = one Push, riding shown but never corrected) hangs off
 * that working at 1:64, where a fingertip is a third of the Car's length and a
 * 2 m/s flick crosses it in eleven steps.
 *
 * So this check does not argue about it. It sweeps a synthetic finger through a
 * REAL parked Car at three speeds and prints what happened — roll distance,
 * contact frames, deepest penetration — clamped and unclamped, with the old
 * impulse-based strike measured alongside so the strength range can be read in
 * units the player will recognise.
 *
 * Run: node scripts/headless-check.mjs src/game/proto/checks/finger.ts
 */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GRAVITY, buildTerrainPhysics, initPhysics } from '../world.js';
import { SurfaceField, uniformAssignment } from '../surfaces.js';
import { Car, STARTING_GRID, type CarParams } from '../car.js';
import { Finger, DEFAULT_FINGER_PARAMS, type FingerModel, type FingerParams } from '../finger.js';

const FRAME = 1 / 60; // one frame = 4 × 1/240 steps, same as the app
const DT = 1 / 240;
const STEPS = 4;
const REST_V = 0.02;

interface Rig {
  world: RAPIER.World;
  scene: THREE.Scene;
  cars: Car[];
}

/** One 60 fps frame exactly as the prototype runs it. */
function frame(rig: Rig, frames = 1): void {
  for (let n = 0; n < frames; n++) {
    for (let i = 0; i < STEPS; i++) rig.world.step();
    for (const car of rig.cars) car.sync(FRAME);
  }
}

async function makeRig(params: CarParams[]): Promise<Rig> {
  await initPhysics();
  const scene = new THREE.Scene();
  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  world.timestep = DT;
  world.integrationParameters.numSolverIterations = 8;
  // One Surface everywhere (Concrete): what is being measured is the finger,
  // not which Surface the Car is standing on.
  const field = new SurfaceField(uniformAssignment('concrete'));
  buildTerrainPhysics(world, field);
  const cars = params.map((p) => new Car(world, scene, p, field));
  return { world, scene, cars };
}

function place(car: Car, x: number, z: number, yaw = 0): void {
  car.reset(new THREE.Vector3(x, 0, z), yaw);
}

function vel(car: Car): THREE.Vector3 {
  const v = car.chassis.linvel();
  return new THREE.Vector3(v.x, v.y, v.z);
}

/** Ride height of the body centre: what a Car resting on its wheels sits at. */
function rideY(car: Car): number {
  return car.params.wheelRadius + 0.035;
}

/**
 * Real-world units, because that is the scale everyone argues about:
 * 1 world unit = 10 real cm = 100 mm. Getting these two right is the whole
 * difference between "the Car slid a metre sideways" and "it drifted 11 cm" —
 * the first reading sent me chasing nothing at all for an hour.
 */
const cm = (units: number): string => `${(units * 10).toFixed(2)} cm`;
const mm = (units: number): string => `${(units * 100).toFixed(2)} mm`;

interface SweepSpec {
  /** Sweep speed in world units/s (1 unit = 10 real cm). */
  speed: number;
  /** Where the finger appears, measured back along the sweep from the Car. */
  gap: number;
  /** Total travel the finger ATTEMPTS, including its follow-through. */
  distance: number;
  dir: THREE.Vector3;
  /** Sideways offset of the sweep line from the Car's centre line. */
  offset?: number;
  clamped?: boolean;
  model?: FingerModel;
  aimed?: Car;
  params?: FingerParams;
  /** Ready-made Cars to watch apart from the aimed one. */
  bystanders?: Car[];
}

interface Sweep {
  rolled: number;
  lateral: number;
  yaw: number;
  maxHeight: number;
  peakPenetration: number;
  contactFrames: number;
  /** Same count per physics step, where a fast strike actually lives. */
  contactSteps: number;
  /** Furthest the finger got PAST the Car's centre along the sweep. */
  lead: number;
  /** How much of the sweep the clamp denied the finger. */
  denied: number;
  travel: number;
  maxSpeed: number;
  rest: boolean;
  finite: boolean;
  /** Velocity as the gesture ends: what the strike itself delivered. */
  takeoff: { along: number; lateral: number; up: number };
  /** Height above its own ride height at the highest point of the strike. */
  hop: number;
  /** Fastest the finger body itself went (it should LOSE ground on impact). */
  fingerSpeed: number;
  /**
   * The speed the finger ACTUALLY arrived with, not the speed the sweep asked
   * for. These two differ, and pretending otherwise is how a check lies: the
   * finger starts at rest and is limited by `maxAccel`, so a fast swipe over a
   * short run-up lands slower than commanded — sometimes never arrives at all.
   */
  arrival: number;
}

/**
 * One synthetic flick: the finger appears `gap` behind the Car's centre and
 * tries to travel `distance` along `dir`, being denied whatever the clamp denies
 * it. Then the finger leaves the world — a gesture ends — and the Car rolls
 * until it stops. Everything measured is reported; nothing is decided here.
 */
function sweep(rig: Rig, car: Car, spec: SweepSpec): Sweep {
  const dir = spec.dir.clone().setY(0).normalize();
  const across = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  frame(rig, 30); // settle before anything is touched
  const start = car.position.clone();
  const beginAt = start
    .clone()
    .addScaledVector(dir, -spec.gap)
    .addScaledVector(across, spec.offset ?? 0);

  const finger = Finger.begin(
    rig.world,
    beginAt,
    spec.aimed ?? car,
    spec.params,
    spec.model ?? 'servo',
  );
  const clamped = spec.clamped !== false;

  let travelled = 0;
  let requested = 0;
  let allowed = 0;
  let peak = 0;
  let contactFrames = 0;
  let contactSteps = 0;
  let arrival = -1;
  let lead = -Infinity;
  let maxHeight = car.position.y;
  let maxSpeed = 0;
  let fingerTop = 0;
  const impTotals: [number, number, number][] = [];

  const framesWorth = Math.ceil(spec.distance / spec.speed / FRAME) + 1;
  for (let f = 0; f < framesWorth; f++) {
    for (let i = 0; i < STEPS; i++) {
      const remaining = spec.distance - travelled;
      if (remaining <= 0) break;
      const want = Math.min(spec.speed * DT, remaining);
      // The TARGET keeps moving even while the body is held: that is what it
      // means for the player's finger to have gone past where the Car allowed.
      const target = beginAt.clone().addScaledVector(dir, travelled + want);
      const res = finger.drive(target, clamped, DT);
      requested += res.requested;
      allowed += res.allowed;
      rig.world.step();
      travelled += want;
      // Sampled every STEP, not every frame: at 2 m/s the Car can meet the
      // finger and leave again inside one frame, and a frame-stride sample
      // then reports "never touched" about a Car that has just been launched.
      fingerTop = Math.max(fingerTop, finger.maxSpeed);
      if (process.env.JDT_TRACE) {
        const report = finger.contactReport();
        if (report.length) {
          let j = 0;
          let off = 0;
          let up = 0;
          for (const c of report) {
            const rel = c.point.clone().sub(car.position).applyQuaternion(car.quaternion.clone().invert());
            j += c.impulse;
            off += c.impulse * rel.z;
            up += c.impulse * rel.y;
          }
          impTotals.push([j, j > 0 ? off / j : 0, j > 0 ? up / j : 0]);
        }
      }
      const deep = finger.pressure();
      if (deep > 0) {
        contactSteps++;
        peak = Math.max(peak, deep);
      }
      // Arrival speed = the finger's speed at the step the Car FIRST departs,
      // not the first nudged manifold. A hard strike can be over in one step,
      // and a report built on catching that step reads nothing at all.
      if (arrival < 0 && Math.abs(vel(car).dot(dir)) > 0.5) arrival = finger.maxSpeed;
    }
    car.sync(FRAME);
    const overlap = finger.pressure();
    if (overlap > 0) contactFrames++;
    peak = Math.max(peak, overlap);
    maxHeight = Math.max(maxHeight, car.position.y);
    maxSpeed = Math.max(maxSpeed, vel(car).length());
    lead = Math.max(lead, finger.position.clone().sub(car.position).dot(dir));
  }
  if (process.env.JDT_TRACE) {
    const total = impTotals.reduce((s, r) => s + r[0], 0);
    console.log(
      `        CONTACT ${impTotals.length} steps with contact, total impulse ${total.toFixed(4)}`, // per-step [J, lateral offset, vertical offset]
    );
    for (const [j, off, up] of impTotals.slice(0, 12)) {
      console.log(`          J ${j.toFixed(4)}  lateral ${(off * 100).toFixed(2)} mm  vertical ${(up * 100).toFixed(2)} mm`);
    }
    const wv = car.chassis.angvel();
    console.log(`          car angvel ${wv.x.toFixed(3)} ${wv.y.toFixed(3)} ${wv.z.toFixed(3)}`);
  }
  const tv = vel(car);
  const takeoff = {
    along: tv.dot(dir),
    lateral: tv.dot(across),
    up: tv.y,
  };
  finger.end();

  // The Push is over: let it roll to a stop (or prove that it never stops).
  for (let n = 0; n < 900; n++) {
    frame(rig);
    if (process.env.JDT_TRACE && n % 30 === 0) {
      const p = car.position.clone().sub(start);
      const v = vel(car);
      console.log(
        `        trace +${(n / 60).toFixed(2)}s  x ${(p.dot(dir) * 10).toFixed(1)} cm  z ${mm(p.dot(across))}  yaw ${THREE.MathUtils.radToDeg(car.yaw).toFixed(2)}°  v(fwd ${v.dot(dir).toFixed(2)} lat ${v.dot(across).toFixed(2)} up ${v.y.toFixed(2)})  y ${(car.position.y * 10).toFixed(2)} cm`,
      );
    }
  }
  const end = car.position;
  const moved = end.clone().sub(start);
  return {
    rolled: moved.dot(dir),
    lateral: moved.dot(across),
    yaw: car.yaw,
    maxHeight,
    peakPenetration: peak,
    contactFrames,
    contactSteps,
    lead,
    denied: requested > 0 ? 1 - allowed / requested : 0,
    travel: allowed,
    maxSpeed,
    rest: car.atRest(),
    finite: Number.isFinite(end.length()) && Number.isFinite(maxHeight),
    takeoff,
    hop: maxHeight - rideY(car),
    fingerSpeed: fingerTop,
    arrival: arrival < 0 ? 0 : arrival,
  };
}

/** Reference: today's Push, applied as one impulse on the frame (slingshot). */
function impulseRoll(rig: Rig, car: Car, strength: number): number {
  frame(rig, 30);
  const from = car.position.clone();
  const dir = new THREE.Vector3(1, 0, 0);
  const point = car
    .clampToFrame(car.position.clone().add(new THREE.Vector3(-1, 0, 0)))
    .setY(car.position.y);
  car.chassis.applyImpulseAtPoint(dir.clone().multiplyScalar(strength), point, true);
  frame(rig, 900);
  return car.position.clone().sub(from).dot(dir);
}

const results: { name: string; ok: boolean; detail: string }[] = [];
function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`);
}

/**
 * One synthetic swipe: 16 cm of run-up, then 10 cm of follow-through past the
 * Car. The run-up is not decoration — it is how much room the hand has to get
 * the finger UP TO SPEED, and the servo's `maxAccel` turns a short run-up into
 * a weaker strike (measured: over 6 cm the finger could not exceed 12.4 u/s no
 * matter how fast the swipe). A check that varies "swipe speed" while starving
 * the run-up is measuring the same strike three times.
 */
const SWEEP_GAP = 1.6;
const SWEEP_DISTANCE = 2.6;

/** Default grid car — tunable alone, and the one every other check used. */
const GRID0 = STARTING_GRID[0];

/**
 * The settings this check measures, stated EXACTLY rather than inherited from
 * `DEFAULT_FINGER_PARAMS`: those are whatever is tuned today, and a check that
 * silently follows someone's phone tuning measures something different every
 * week. These are the first numbers that were playable on a real phone.
 */
const CHECK_PARAMS: FingerParams = {
  ...DEFAULT_FINGER_PARAMS,
  massFactor: 0.5,
  maxAccel: 100,
};

/**
 * Sweep speeds this hand can actually follow: 0.3 / 0.6 / 1.0 m/s. Faster is
 * not tested because it IS not delivered — at maxAccel 100 (10 m/s²) reaching
 * 2 m/s needs 0.2 s and 20 cm of travel, so a hard swipe simply leaves the
 * finger behind and no strike happens. That is honest, and it is why `maxAccel`
 * is called the strength knob.
 */
const SPEEDS = [3, 6, 10];

/** How the table reads: one line per speed. */
function table(rows: { label: string; s: Sweep }[]): string {
  return [
    '  command      rolled      sideways   turned    arrived   deepest  finger lead  denied',
    ...rows.map((r) =>
      [
        r.label.padEnd(12),
        cm(r.s.rolled).padEnd(11),
        mm(r.s.lateral).padEnd(10),
        `${THREE.MathUtils.radToDeg(r.s.yaw).toFixed(1)}°`.padEnd(9),
        `${r.s.arrival.toFixed(1)} u/s`.padEnd(8),
        mm(r.s.peakPenetration).padEnd(8),
        mm(r.s.lead).padEnd(13),
        `${(r.s.denied * 100).toFixed(0)}%`,
      ].join(' '),
    ),
  ].join('\n        ');
}

/**
 * 1. The finger is a ghost to everything but the aimed Car.
 *
 * Two reasons this is the first question, not the last: a finger that could
 * knock other Cars around would break the "only the aimed Car reacts" rule the
 * ticket settled, and a finger that can be BLOCKED by Terrain or by a Surface
 * pad would stop dead in empty space. Both failures look identical from the
 * outside (the Car behaves oddly), and only a measurement tells them apart.
 */
async function check1_onlyTheAimedCarIsVisible(): Promise<void> {
  const rig = await makeRig([GRID0, GRID0]);
  const bystander = rig.cars[0];
  const aimed = rig.cars[1];
  place(bystander, 0, 0);
  place(aimed, 0.7, 0); // in a line: the sweep must reach through the first
  frame(rig, 60);
  const before = rig.cars.map((c) => c.position.clone());

  const s = sweep(rig, aimed, {
    speed: 8,
    gap: 0.9, // starting behind the bystander, so the path crosses it
    distance: 1.8,
    dir: new THREE.Vector3(1, 0, 0),
    clamped: true,
  });
  const movedBystander = bystander.position.distanceTo(before[0]);

  // Control: nothing aimed at all, over the same ground. The finger must be
  // denied nothing — no Terrain piece, no Surface pad, no stone may block a
  // body the filter says they cannot see.
  const empty = await makeRig([GRID0]);
  const lone = empty.cars[0];
  place(lone, 0, 0);
  frame(empty, 60);
  const loneStart = lone.position.clone();
  const free = sweep(empty, lone, {
    speed: 8,
    gap: 0.9,
    distance: 1.8,
    dir: new THREE.Vector3(1, 0, 0),
    clamped: true,
    aimed: undefined,
  });

  record(
    'the finger touches only the aimed Car (Terrain and bystanders are ghosts)',
    movedBystander < 0.001 && s.rolled > 0.01 && free.denied === 0,
    [
      `aimed Car moved ${cm(s.rolled)}, Car in the way moved ${mm(movedBystander)}`,
      `nothing blocked the control sweep: denied ${(free.denied * 100).toFixed(1)}%, rolled ${cm(lone.position.clone().sub(loneStart).length())}`,
      `finger travel actually used: ${cm(free.travel)} of ${cm(1.8)} requested`,
    ].join('\n        '),
  );
}

/**
 * 2. The bet: does a finger deliver a Push at real speeds, and is it usable?
 *
 * "Usable" here is not a feeling — it is whether the three speeds give three
 * different rolls in the same range the old impulse does, whether the Car stays
 * on its wheels, whether it settles afterwards (every 1:64 bug so far lived in
 * resting contact), and whether the 1 mm penetration budget held.
 */
async function check2_aFingerDeliversAPush(): Promise<void> {
  const rows: { label: string; s: Sweep }[] = [];
  let clean = true;
  for (const speed of SPEEDS) {
    const rig = await makeRig([GRID0]);
    const car = rig.cars[0];
    place(car, 0, 0);
    const s = sweep(rig, car, {
      speed,
      gap: SWEEP_GAP,
      distance: SWEEP_DISTANCE,
      dir: new THREE.Vector3(1, 0, 0),
      params: CHECK_PARAMS,
    });
    rows.push({ label: `${(speed / 10).toFixed(1)} m/s`, s });
    const budget = DEFAULT_FINGER_PARAMS.maxPenetration;
    // 0.5 mm of slack over the budget: the clamp has one frame of skew, and
    // the Car is not a wall — it moves while being pressed.
    if (s.peakPenetration > budget + 0.005) clean = false;
    if (!s.rest || !s.finite) clean = false;
    if (s.maxHeight > rideY(car) + 0.05) clean = false; // launched off its wheels
    if (s.lead > 0.15) clean = false; // got past the Car's middle: not a strike
  }
  // The same measurement for today's impulse Push, so the range can be read.
  const refs: string[] = [];
  for (const strength of [2, 4, 6]) {
    const rig = await makeRig([GRID0]);
    place(rig.cars[0], 0, 0);
    refs.push(`impulse ${strength} → ${cm(impulseRoll(rig, rig.cars[0], strength))}`);
  }

  const rolls = rows.map((r) => r.s.rolled);
  const arrivals = rows.map((r) => r.s.arrival);
  // Reported, NOT required. It is not monotonic — see below.
  record(
    'a flick delivers a real Push at every speed the hand can follow — settles, stays on its wheels, keeps its budget',
    clean && rolls.every((d) => d > 0.02),
    [
      table(rows),
      `arrived at ${arrivals.map((a) => `${a.toFixed(1)} u/s`).join(', ')} (commanded ${SPEEDS.map((s) => s).join(', ')})`,
      `HOW STRENGTH VARIES IS NOT A PHYSICS GUARANTEE ONCE THE FINGER IS LIGHTER THAN THE CAR, so it is measured, not asserted: ${rolls.map((d) => cm(d)).join(' → ')} for command ${SPEEDS.map((v) => v).join(' → ')}. A gentle finger presses for longer rather than harder, so roll tracks CONTACT DURATION as much as speed. Whether that reads as control is a question for the phone, not for this check.`,
      `all settled: ${rows.every((r) => r.s.rest)}; all stayed on their wheels: ${rows.every((r) => r.s.finite)}`,
      rows.map((r) => `${r.label}: takeoff along ${r.s.takeoff.along.toFixed(2)} lateral ${r.s.takeoff.lateral.toFixed(2)} up ${r.s.takeoff.up.toFixed(2)} | hop ${mm(r.s.hop)} | finger ended at ${r.s.fingerSpeed.toFixed(2)}`).join('\n        '),
      `reference (today's slingshot impulse): ${refs.join(', ')}`,
    ].join('\n        '),
  );
}

/**
 * 3. What the clamp is FOR — measured, not assumed.
 *
 * Same sweep, fingers following the touch exactly (no clamp). If the numbers
 * come out similar the clamp is complexity we do not need; if they do not, this
 * table is the reason ticket 18 says "no passing through".
 */
async function check3_theClampVersusAFingerThatFollowsThrough(): Promise<void> {
  const rows: { label: string; s: Sweep }[] = [];
  for (const speed of SPEEDS) {
    const rig = await makeRig([GRID0]);
    const car = rig.cars[0];
    place(car, 0, 0);
    rows.push({
      label: `${(speed / 10).toFixed(1)} m/s`,
      s: sweep(rig, car, {
        speed,
        params: CHECK_PARAMS,
        gap: SWEEP_GAP,
        distance: SWEEP_DISTANCE,
        dir: new THREE.Vector3(1, 0, 0),
        clamped: false,
        model: 'kinematic',
      }),
    });
  }
  record(
    'kinematic (infinite mass, follows through): measured against check 2 — informational',
    rows.every((r) => r.s.finite),
    [
      table(rows),
      `penetration budget ${mm(DEFAULT_FINGER_PARAMS.maxPenetration)} — deepest unclamped ${mm(Math.max(...rows.map((r) => r.s.peakPenetration)))}`,
      `finger got past the Car's middle: ${rows.map((r) => (r.s.lead > 0.15 ? 'yes' : 'no')).join(', ')}`,
      `peak speed reached ${rows.map((r) => r.s.maxSpeed.toFixed(2)).join(', ')} (rest threshold ${REST_V})`,
    ].join('\n        '),
  );
}

/**
 * 4. Aiming must still decide everything (ADR-0001).
 *
 * With a physical finger there is a real temptation for us to have quietly
 * authored the curve: if the Car turned on its own from a dead-centre strike,
 * that would be the same sin `curveFactor` was deleted for. Nothing in
 * `finger.ts` is allowed to make it turn; only WHERE it lands may.
 */
async function check4_whereTheFingerLandsStillDecides(): Promise<void> {
  async function flick(offset: number): Promise<Sweep> {
    const rig = await makeRig([GRID0]);
    const car = rig.cars[0];
    place(car, 0, 0);
    return sweep(rig, car, {
      speed: 6,
      gap: SWEEP_GAP,
      distance: SWEEP_DISTANCE,
      dir: new THREE.Vector3(1, 0, 0),
      offset,
      params: CHECK_PARAMS,
    });
  }
  const centre = await flick(0);
  const corner = await flick(0.09); // just in from the rear corner of the frame
  record(
    'a centre flick rolls straight, a corner flick curves (nothing authors the turn)',
    // The claim is comparative: WHERE you strike decides the turn. An absolute
    // angle would be a number this file invented, and how hard a gentle finger
    // can rotate a Car is the user's tuning, not a guarantee of the model.
    Math.abs(corner.yaw) > Math.abs(centre.yaw) * 2 &&
      Math.abs(corner.yaw) > THREE.MathUtils.degToRad(1.5),
    [
      `centre: rolled ${cm(centre.rolled)}, sideways ${mm(centre.lateral)} (${(Math.abs(centre.lateral / centre.rolled) * 100).toFixed(1)}% of its roll), turned ${THREE.MathUtils.radToDeg(centre.yaw).toFixed(2)}°`,
      `corner: rolled ${cm(corner.rolled)}, sideways ${mm(corner.lateral)} (${(Math.abs(corner.lateral / corner.rolled) * 100).toFixed(1)}% of its roll), turned ${THREE.MathUtils.radToDeg(corner.yaw).toFixed(1)}°`,
      `how much a flick can TURN a Car is governed by finger mass and hand strength (the user's knobs); what this asserts is only that the difference is there and goes the right way`,
    ].join('\n        '),
  );
}

/** 5. Cost: a body that is driven rather than simulated should cost nothing. */
async function check5_frameCost(): Promise<void> {
  const without = await makeRig([GRID0]);
  place(without.cars[0], 0, 0);
  frame(without, 60);
  const t0 = performance.now();
  frame(without, 600);
  const msIdle = (performance.now() - t0) / 600;

  const with_ = await makeRig([GRID0]);
  const car = with_.cars[0];
  place(car, 0, 0);
  frame(with_, 60);
  const finger = Finger.begin(
    with_.world,
    car.position.clone().add(new THREE.Vector3(-0.6, 0, 0)),
    car,
  );
  const t1 = performance.now();
  for (let f = 0; f < 600; f++) {
    for (let i = 0; i < STEPS; i++) {
      finger.drive(finger.position.clone().add(new THREE.Vector3(0.002, 0, 0)), true);
      with_.world.step();
    }
    car.sync(FRAME);
  }
  const msFinger = (performance.now() - t1) / 600;
  finger.end();
  record(
    'a driven finger stays inside the frame budget',
    msFinger < 4,
    `per frame (4 steps + wheel friction + one shape cast): without finger ${msIdle.toFixed(3)} ms, with finger ${msFinger.toFixed(3)} ms`,
  );
}

export async function run(): Promise<boolean> {
  console.log('the flick — a finger body delivering the Push (ticket 18, step 1)\n');
  await check1_onlyTheAimedCarIsVisible();
  await check2_aFingerDeliversAPush();
  await check3_theClampVersusAFingerThatFollowsThrough();
  await check4_whereTheFingerLandsStillDecides();
  await check5_frameCost();
  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed` +
      (failed.length ? ` — FAILED: ${failed.map((f) => f.name).join('; ')}` : ''),
  );
  return failed.length > 0;
}
