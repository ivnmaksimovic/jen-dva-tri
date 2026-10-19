import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Car } from './car.js';

/**
 * THROWAWAY PROTOTYPE CODE — ticket 18, the flick control scheme (option C).
 *
 * The Push here is NOT a computed impulse. The finger itself is in the world:
 * a kinematic cuboid the shape of a middle knuckle, driven by the touch, and
 * whatever happens to the Car happens because the two bodies met. That is the
 * decision behind option C — see the ticket for why — and it buys three things
 * an impulse cannot:
 *
 *   - nothing about the strike is authored (ADR-0001): no strength formula, no
 *     invented off-centre torque; the Car's own frame decides the curve;
 *   - the experimental multi-impulse Push ("slow, change direction, accelerate,
 *     all inside one window") is not a feature to write later — contact IS a
 *     continuing interaction, so it is already there;
 *   - riding the Car around is PHYSICALLY POSSIBLE, which is what makes it
 *     illegal rather than prevented. The game shows it; nothing fakes it.
 *
 * Infinite effective mass is deliberate and honest: the player's finger really
 * does outweigh a 1:64 Car beyond any meaningful ratio. What keeps it from
 * becoming a shove-through is `maxPenetration`, not a mass fudge — see `drive`.
 *
 * Collision-wise the finger is a GHOST to everything except the aimed Car:
 * same trick as the grip pads in `world.ts` (nothing collides with a thing you
 * only ever want to ask about). "The finger hits whatever it touches" may be
 * right for multiplayer later, but it has to be chosen, not defaulted to.
 */

/** Membership bit nobody else uses: only a Car that is aimed may see a finger. */
export const FINGER_GROUP = 0x0004;
const interaction = (membership: number, filter: number): number => (membership << 16) | filter;

/** Below this, the finger has not actually moved: no direction to face either. */
const MOVE_EPS = 1e-9;

/**
 * Two ways to put a finger in the world. Both exist because `check:finger`
 * measured them against each other:
 *
 * - `'servo'` (default): a DYNAMIC body of limited mass and strength, driven
 *   toward the touch point the way a hand drives a finger. It PAYS for every
 *   transfer, so a fast flick is over the moment the Car outruns it — which is
 *   what makes a strike a strike.
 * - `'kinematic'`: infinite mass, following the touch exactly except for the
 *   penetration cap. Kept only to be compared against: with nothing to pay, a
 *   kinematic finger bulldozes the Car along its whole follow-through (and
 *   sideways with it). That measurement is WHY it is not the default.
 */
export type FingerModel = 'servo' | 'kinematic';

export interface FingerParams {
  /** Half-width ACROSS the knuckle: how much of the Car's side it covers. */
  across: number;
  /** Half-length ALONG the strike direction (the depth of the contact). */
  deep: number;
  /** Half-height of the contact patch, measured from the knuckle's centre. */
  tall: number;
  /**
   * How deep it may sink into the Car before it is held there. This is what
   * makes a flick a STRIKE: past it, the finger cannot advance at all, so the
   * only way to keep pushing is for the Car to leave — exactly like a real
   * finger that has already done its work. The user tunes it.
   */
  maxPenetration: number;
  /**
   * How heavy the finger is, as a multiple of the Car it is aiming at. The real
   * number is not known; the ratio is what matters — a finger outweighs a 1:64
   * Car, but not infinitely.
   */
  massFactor: number;
  /**
   * The most acceleration the hand can give it (world units/s²; 300 = 30 m/s²).
   * THIS IS WHAT MAKES A STRIKE FINITE: the finger can lose ground to the Car
   * it just hit, so a flick pays out its momentum and stops, while a slow
   * deliberate sweep keeps pressing — which is riding, and is the player's
   * doing rather than the engine's.
   */
  maxAccel: number;
}

/**
 * Seed numbers, thrown away the moment they are tuned on the phone. Sized from
 * a real middle knuckle of a bent index finger (~1.5 cm across, ~1.2 cm along),
 * presented horizontally and set down at chassis height so it meets the frame
 * the way a hand meets a Car. Nothing here is known to be right.
 */
export const DEFAULT_FINGER_PARAMS: FingerParams = {
  across: 0.075,
  deep: 0.06,
  tall: 0.05,
  maxPenetration: 0.01, // 1 mm
  massFactor: 5, // five times the Car it is aiming at
  maxAccel: 300, // 30 m/s² — a snap, not a shove
};

/** The finger's box: local +X along the strike, +Y up, +Z across the knuckle. */
export function fingerShape(p: FingerParams): RAPIER.Cuboid {
  return new RAPIER.Cuboid(p.deep, p.tall, p.across);
}

/**
 * Give (or take away) this Car's permission to be struck. Bit-flipped on the
 * Car's own colliders rather than by narrowing the finger's filter, because
 * filtering is per membership-mask and every Car shares one mask — the aimed
 * Car is the only place the difference can live. `end()` always restores it, so
 * a gesture can never leave a Car unable to touch its neighbours again.
 */
export function setFingerTarget(car: Car, on: boolean): void {
  const body = car.chassis;
  for (let i = 0; i < body.numColliders(); i++) {
    const col = body.collider(i);
    const raw = col.collisionGroups();
    const membership = raw >>> 16;
    const filter = raw & 0xffff;
    col.setCollisionGroups(
      interaction(membership, on ? filter | FINGER_GROUP : filter & ~FINGER_GROUP),
    );
  }
}

/** Every collider of a Car — what the finger may touch, and nothing else. */
function collidersOf(car: Car): RAPIER.Collider[] {
  const body = car.chassis;
  const list: RAPIER.Collider[] = [];
  for (let i = 0; i < body.numColliders(); i++) list.push(body.collider(i));
  return list;
}

/**
 * One finger, for the duration of one gesture. It exists when the gesture does
 * and dies with it: there is no `reset`, no idle state to leak into the next
 * swipe (the map's 2026-10-11 note is exactly why — a slingshot drag survived
 * its gesture once and fired a phantom Push).
 */
export class Finger {
  readonly collider: RAPIER.Collider;
  private readonly body: RAPIER.RigidBody;
  private readonly world: RAPIER.World;
  private readonly params: FingerParams;
  /** The Car this gesture may strike, if any. Nothing else can even see us. */
  private readonly aimed: RAPIER.Collider[] = [];
  private readonly aimedCar: Car | null;
  /** Which way the knuckle faces — local +X. It spins with the sweep. */
  private heading = new THREE.Vector3(1, 0, 0);
  /** Solver contact points seen at the last `pressure()` read. */
  private contacts = 0;

  private constructor(
    world: RAPIER.World,
    params: FingerParams,
    at: THREE.Vector3,
    aimedCar?: Car,
    model: FingerModel = 'servo',
  ) {
    this.world = world;
    this.params = { ...params };
    this.model = model;
    this.aimedCar = aimedCar ?? null;
    if (aimedCar) {
      this.aimed = collidersOf(aimedCar);
      setFingerTarget(aimedCar, true);
    }
    // Servo mode: real mass, no gravity (a hand holds it up), no tumbling (a
    // knuckle is presented on purpose), no damping (the servo does that).
    const servo = RAPIER.RigidBodyDesc.dynamic()
      .setAdditionalMass(params.massFactor * (aimedCar ? aimedCar.chassis.mass() : 1))
      .setGravityScale(0)
      .lockRotations()
      .setLinearDamping(0)
      .setAngularDamping(0);
    this.body = world.createRigidBody(
      (model === 'servo' ? servo : RAPIER.RigidBodyDesc.kinematicPositionBased())
        .setCcdEnabled(true)
        .setTranslation(at.x, at.y, at.z),
    );
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(params.deep, params.tall, params.across)
        // Frictionless on purpose: a fingertip skids off more than it grips,
        // and any tangential force here would be us authoring a curve Push —
        // which the ticket leaves to physics.
        .setFriction(0)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setRestitution(0)
        // In servo mode mass comes from `additionalMass` alone: the collider is
        // there to make contact, not to decide how heavy anything is.
        .setDensity(model === 'servo' ? 0 : 1)
        .setCollisionGroups(interaction(FINGER_GROUP, 0xffff)),
      this.body,
    );
  }

  /** Start a gesture: the finger appears at `at`, aiming at `aimedCar` only. */
  static begin(
    world: RAPIER.World,
    at: THREE.Vector3,
    aimedCar?: Car,
    params: FingerParams = DEFAULT_FINGER_PARAMS,
    model: FingerModel = 'servo',
  ): Finger {
    return new Finger(world, params, at, aimedCar, model);
  }

  get position(): THREE.Vector3 {
    const t = this.body.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  /** Which body this is — see `FingerModel`. Readable for the checks. */
  readonly model: FingerModel;

  /** Fastest this body has been seen to travel: it should LOSE ground when it
   *  hits something, if it is paying for the transfer the way a hand does. */
  get maxSpeed(): number {
    const v = this.body.linvel();
    return Math.hypot(v.x, v.y, v.z);
  }

  /** Solver contact points with the aimed Car at the last measurement. */
  get contactPoints(): number {
    return this.contacts;
  }

  /**
   * End the gesture: take away the aimed Car's permission again and leave the
   * world. Everything a gesture owned dies here.
   */
  end(): void {
    if (this.aimedCar) setFingerTarget(this.aimedCar, false);
    this.world.removeRigidBody(this.body);
  }

  /**
   * Every solver contact with the aimed Car right now: where it is, which way
   * it pushes, and how hard. This is how the strike is AUDITED rather than
   * believed — a centre flick that somehow turns the Car has to be visible as
   * an off-centre contact, or it would be us authoring a curve.
   */
  contactReport(): { point: THREE.Vector3; normal: THREE.Vector3; impulse: number }[] {
    const out: { point: THREE.Vector3; normal: THREE.Vector3; impulse: number }[] = [];
    for (const other of this.aimed) {
      this.world.contactPair(this.collider, other, (manifold) => {
        const n = manifold.normal();
        for (let i = 0; i < manifold.numSolverContacts(); i++) {
          const p = manifold.solverContactPoint(i);
          if (!p) continue;
          out.push({
            point: new THREE.Vector3(p.x, p.y, p.z),
            normal: new THREE.Vector3(n.x, n.y, n.z),
            impulse: manifold.contactImpulse(i),
          });
        }
      });
    }
    return out;
  }

  /**
   * How deep the finger currently sits inside the aimed Car (world units; 0 =
   * not touching). Read AFTER a step, since contact manifolds come from the
   * last narrow-phase run — the clamp asks before the next step, so the reading
   * is one frame old, which at 1/240 s is 0.4% of the timescale of a strike.
   */
  pressure(): number {
    let deepest = 0;
    let count = 0;
    for (const other of this.aimed) {
      this.world.contactPair(this.collider, other, (manifold) => {
        for (let i = 0; i < manifold.numSolverContacts(); i++) {
          count++;
          const overlap = -manifold.solverContactDist(i);
          if (overlap > deepest) deepest = overlap;
        }
      });
    }
    this.contacts = count;
    return deepest;
  }

  /**
   * Move toward `target`, stopping at the Car's surface. Returns how far it was
   * allowed to go, so the caller can see the gap between what the finger wanted
   * and what it got — that gap IS the strike happening.
   *
   * With `clamped` off the finger follows the touch exactly. That is what the
   * naive version does, and `check:finger` measures both so the clamp's job is
   * a measurement rather than a suspicion.
   */
  drive(target: THREE.Vector3, clamped = true, dt = 1 / 240): { requested: number; allowed: number } {
    if (this.model === 'servo') return this.driveServo(target, dt);
    const pos = this.position;
    const move = new THREE.Vector3().subVectors(target, pos);
    const requested = move.length();
    if (requested < MOVE_EPS) {
      this.body.setNextKinematicTranslation({ x: pos.x, y: pos.y, z: pos.z });
      return { requested, allowed: 0 };
    }
    const dir = move.clone().divideScalar(requested);
    this.faceInto(dir);

    let allowed = requested;
    if (clamped && this.aimed.length > 0) {
      const overlap = this.pressure();
      if (overlap > 0) {
        // Already touching: it may sink to its budget and no further. When the
        // Car is shoved away the overlap shrinks, and this lets the finger
        // follow — pressing at the surface, never through it.
        allowed = Math.max(0, this.params.maxPenetration - overlap);
      } else {
        // Not touching yet: ASK before moving rather than discovering the
        // overshoot afterwards. At 2 m/s the finger covers 8 mm per step at
        // 1/240 s while the whole budget is 1 mm — the only honest place to
        // stop is before the step that would blow through it.
        const clear = this.castAhead(pos, move);
        if (clear !== null) allowed = clear * requested + this.params.maxPenetration;
      }
    }
    allowed = Math.min(allowed, requested);
    const next = pos.clone().addScaledVector(dir, allowed);
    this.body.setNextKinematicTranslation({ x: next.x, y: next.y, z: next.z });
    return { requested, allowed };
  }

  /**
   * Servo mode: the finger is a REAL body chasing the touch point, with two
   * limits that are the whole reason it behaves like a finger.
   *
   * A velocity servo does the chasing: it wants to be at the touch point by the
   * end of this step, so it wants that velocity, and asks for exactly the
   * acceleration that would get it there — then the answer is CAPPED, because a
   * hand cannot accelerate without limit. Under load (a Car in the way) the cap
   * is what the finger loses: it cannot maintain its speed through the impact,
   * so the Car takes the momentum and leaves. That is a strike. A gentle sweep
   * never hits the cap, so it keeps pressing for as long as the player keeps
   * going — riding, which the game shows rather than prevents (ticket 18).
   *
   * The second limit is the no-passing-through rule, stated softly: once the
   * finger has sunk to its budget it stops receiving force along the strike.
   * It may still press sideways, which is how a Car is turned rather than
   * launched.
   */
  private driveServo(target: THREE.Vector3, dt: number): { requested: number; allowed: number } {
    const pos = this.position;
    const move = new THREE.Vector3().subVectors(target, pos);
    const requested = move.length();
    if (requested > MOVE_EPS) this.faceInto(move.clone().divideScalar(requested));

    const v = this.body.linvel();
    const current = new THREE.Vector3(v.x, v.y, v.z);
    const accel = move.clone().divideScalar(dt).sub(current).divideScalar(dt);

    const overlap = this.pressure();
    if (overlap > this.params.maxPenetration) {
      const inward = accel.dot(this.heading);
      if (inward > 0) accel.addScaledVector(this.heading, -inward);
    }
    if (accel.length() > this.params.maxAccel) accel.setLength(this.params.maxAccel);

    this.body.resetForces(true);
    this.body.addForce(accel.multiplyScalar(this.body.mass()), true);
    return { requested, allowed: requested };
  }

  /**
   * The fraction of this step's displacement the finger can take before it
   * would touch the aimed Car (0 = touching already, null = nothing in the way).
   * A straight shape cast; with `maxToi = 1` the time of impact comes back as a
   * fraction of the displacement, which is exactly what the caller wants.
   */
  private castAhead(from: THREE.Vector3, move: THREE.Vector3): number | null {
    const q = this.quaternion();
    const hit = this.world.castShape(
      { x: from.x, y: from.y, z: from.z },
      { x: q.x, y: q.y, z: q.z, w: q.w },
      { x: move.x, y: move.y, z: move.z },
      fingerShape(this.params),
      0, // stop where the two TOUCH, not earlier
      1, // time of impact therefore comes back as a fraction of `move`
      true, // include pairs that already penetrate
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      interaction(FINGER_GROUP, 0xffff),
      this.collider, // never hit yourself
    );
    return hit ? hit.time_of_impact : null;
  }

  /** Face the knuckle into the sweep: local +X along the motion. */
  private faceInto(dir: THREE.Vector3): void {
    this.heading = dir.clone().setY(0);
    if (this.heading.lengthSq() < MOVE_EPS) this.heading.set(1, 0, 0);
    this.heading.normalize();
    const q = this.quaternion();
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
  }

  /**
   * The finger's attitude: its face stays perpendicular to wherever it is
   * going. The user corrected me here — the knuckle SPINS during a strike, so
   * corner-first hits are real and must stay possible. Only its presentation
   * stays horizontal: the knuckle is not a ball.
   */
  private quaternion(): THREE.Quaternion {
    const up = new THREE.Vector3(0, 1, 0);
    const across = new THREE.Vector3().crossVectors(this.heading, up).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(this.heading, up, across),
    );
  }
}
