import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GRAVITY } from './world.js';
import type { SurfaceDef, SurfaceField } from './surfaces.js';

/**
 * THROWAWAY PROTOTYPE CODE — the Car, v2: ONE rigid body.
 *
 * v1 used 4 jointed wheel bodies (real-vehicle-sim style). At 1:64 scale the
 * solver turned resting contacts into a ratchet (vibration + sideways creep +
 * never stopping). v2: chassis box + 4 wheel spheres as ONE compound collider;
 * wheel meshes are visual-only, spun procedurally from forward speed.
 * "Rolling resistance" = linearDamping; "suspension feel" = the damping and
 * friction knobs. A pushed Car glides, spins (curve Push), tumbles on Terrain
 * — ADR-0001 (full 3D rigid body) intact, per-wheel joints dropped.
 *
 * Local frame: forward = +X, up = +Y. Masses in world-consistent units.
 */

export interface CarParams {
  name: string;
  color: number;
  mass: number;
  wheelRadius: number; // collider spheres + visuals + ride height
  wheelHalfWidth: number; // visual only
  /**
   * The tire's SHARE of the side grip. Neither number is a friction on its
   * own — the contact uses `surface.grip × tireGrip` (ADR-0002). Defaults are
   * set so a default tire on Concrete reproduces the single-number model this
   * replaced: 0.7 × 0.5 = 0.35, the μ this Car used to carry.
   */
  tireGrip: number;
  /** The tire's share of the rolling resistance (`surface.roll × tireRoll`). */
  tireRoll: number;
  /**
   * Bearing/hub loss: a Body-level decay of spin, NOT part of any Surface —
   * how long a curve Push keeps turning after the strike. It never touches
   * the grip budget; a low-friction Surface already spins longer by itself.
   */
  angularDamping: number;
}

export const CAR_PRESETS: CarParams[] = [
  {
    name: 'Plastic (small wheels, nimble)',
    color: 0xd94f4f,
    mass: 0.8,
    wheelRadius: 0.06,
    wheelHalfWidth: 0.025,
    tireGrip: 0.5,
    tireRoll: 1.0,
    angularDamping: 0.2,
  },
  {
    name: 'Balanced (medium)',
    color: 0x4f7fd9,
    mass: 1.3,
    wheelRadius: 0.075,
    wheelHalfWidth: 0.03,
    tireGrip: 0.5,
    tireRoll: 1.0,
    angularDamping: 0.2,
  },
  {
    name: 'Metal (big wheels, heavy)',
    color: 0xd8d8e0,
    mass: 2.4,
    wheelRadius: 0.1,
    wheelHalfWidth: 0.035,
    tireGrip: 0.5,
    tireRoll: 1.0,
    angularDamping: 0.2,
  },
];

const WHEEL_X = 0.15; // wheelbase 0.3 (3 cm real)
const WHEEL_Z = 0.11; // track width 0.22
const CHASSIS_HALF = { x: 0.225, y: 0.05, z: 0.1 }; // 4.5 cm long, 2 cm wide
/**
 * Probe distance for "does this strike go into the Car?": 0.1 mm real.
 * Not a gameplay or feel setting — the strike point sits exactly ON the frame
 * outline, where "inside" and "outside" are both undefined, so the question
 * can only be asked a short step along the strike.
 *
 * Sized against the ONLY thing it can disagree with: asking at distance zero.
 * It disagrees when the step walks past a corner and leaves the footprint
 * sideways, which needs the strike to be within PUSH_BITE of a corner and
 * moving nearly parallel to it. The Car is 20 mm wide, so 0.1 mm is 0.5% of
 * its width — that window is essentially unreachable by a finger, while still
 * ~13 orders of magnitude above float noise here. Any direction that presses
 * inward at all stays legal; only an exactly parallel drag still skids off.
 */
const PUSH_BITE = 0.001;
const CHASSIS_LIFT = 0.035; // body origin above wheel axles
/**
 * Sweeps of the wheel-friction relaxation per frame (alternating direction —
 * see applyWheelFriction). More sweeps = closer to solving all four points
 * together; measured cost is negligible next to the draw calls.
 */
const SWEEPS = 4;

/**
 * How far a wheel can be from a Surface and still count as TOUCHING it:
 * 1.5 mm real. Below this nothing knows the difference; above it the wheel is
 * genuinely off the ground (over a curb edge, or off a bump) and contributes
 * no grip at all — which is what makes a wheel hanging in the air honest.
 */
const CONTACT_TOL = 0.015;

const ENV_GROUP = 0x0001;
const CAR_GROUP = 0x0002;
const groups = (membership: number, filter: number) => (membership << 16) | filter;
/**
 * A Car collides with the environment AND with other Cars. Before ticket 12
 * the filter was ENV_GROUP only, so two Cars passed straight through each
 * other; car-to-car contact is plain physics (pushing another Car is legal,
 * settled in grilling round 2), so it has to be on.
 */
const CAR_FILTER = ENV_GROUP | CAR_GROUP;

/**
 * The Cars that start on the Track for the multi-Car experiments (ticket 12).
 * Two twins — same numbers, different colour — and one that differs in mass,
 * wheel size and tires, so "whose Car is whose" is answerable at a glance and
 * every read during play says which Car it came from.
 *
 * NOTE on tireGrip/tireRoll: these are the TIRE's half of the pair. The
 * third Car is the stickier-tyred, draggier one (0.8/2.0 against Concrete:
 * μ 0.56 and roll 0.06 — the numbers it used to carry outright before
 * ticket 16 split grip between Surface and tire, per ADR-0002).
 */
export const STARTING_GRID: CarParams[] = [
  { ...CAR_PRESETS[0], name: 'Red', color: 0xd94f4f },
  { ...CAR_PRESETS[0], name: 'Blue', color: 0x3f6fe0 },
  {
    ...CAR_PRESETS[2],
    name: 'Green (heavy)',
    color: 0x3fbf6a,
    tireGrip: 0.8,
    tireRoll: 2.0,
    angularDamping: 0.45,
  },
];

/**
 * Half-width of the widest thing on the Car — the wheels stick out past the
 * chassis footprint. Used wherever clearance between two Cars matters.
 */
export function carHalfWidth(params: CarParams): number {
  return WHEEL_Z + params.wheelRadius;
}

export class Car {
  readonly group = new THREE.Group();
  chassis: RAPIER.RigidBody;
  readonly params: CarParams;
  private readonly world: RAPIER.World;
  /** Where grip comes from: the Surface under each wheel (ADR-0002). */
  private readonly field: SurfaceField;
  private readonly chassisMesh: THREE.Mesh;
  private readonly wheelMeshes: THREE.Mesh[] = [];
  private readonly wheelLocal: THREE.Vector3[] = [];
  /** What each wheel was standing on last frame (null = nothing there) — HUD. */
  private wheelSamples: (SurfaceDef | null)[] = [];

  constructor(
    world: RAPIER.World,
    scene: THREE.Scene,
    params: CarParams,
    field: SurfaceField,
  ) {
    this.world = world;
    this.field = field;
    this.params = { ...params };
    const r = this.params.wheelRadius;
    const chassisY = r + CHASSIS_LIFT;

    this.chassis = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setCcdEnabled(true)
        .setLinearDamping(0.05)
        .setAngularDamping(params.angularDamping)
        .setAdditionalMass(params.mass)
        .setTranslation(0, chassisY, 0),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(CHASSIS_HALF.x, CHASSIS_HALF.y, CHASSIS_HALF.z)
        .setFriction(0)
        // Min-combine: contact friction must never grip the Car — rolling
        // resistance is the manual anisotropic shaping in sync().
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setRestitution(0)
        .setCollisionGroups(groups(CAR_GROUP, CAR_FILTER)),
      this.chassis,
    );

    // Wheel sphere colliders at the wheel positions (same body, compound).
    const wheelYLocal = -CHASSIS_LIFT;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const local = new THREE.Vector3(WHEEL_X * sx, wheelYLocal, WHEEL_Z * sz);
        world.createCollider(
          RAPIER.ColliderDesc.ball(r)
            .setTranslation(local.x, local.y, local.z)
            .setFriction(0)
            .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
            .setRestitution(0)
            .setCollisionGroups(groups(CAR_GROUP, CAR_FILTER)),
          this.chassis,
        );
        this.wheelLocal.push(local);

        const geom = new THREE.CylinderGeometry(r, r, params.wheelHalfWidth * 2, 14);
        geom.rotateX(Math.PI / 2); // axle along local Z (left-right) — Car drives +X
        const mesh = new THREE.Mesh(
          geom,
          new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 0.9 }),
        );
        mesh.position.copy(local);
        mesh.castShadow = true;
        this.wheelMeshes.push(mesh);
        this.group.add(mesh);
      }
    }

    this.chassisMesh = new THREE.Mesh(
      new THREE.BoxGeometry(CHASSIS_HALF.x * 2, CHASSIS_HALF.y * 2, CHASSIS_HALF.z * 2),
      new THREE.MeshStandardMaterial({ color: params.color, roughness: 0.55, metalness: 0.35 }),
    );
    this.chassisMesh.castShadow = true;
    this.group.add(this.chassisMesh);
    scene.add(this.group);
  }

  get position(): THREE.Vector3 {
    const t = this.chassis.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  get yaw(): number {
    const e = new THREE.Euler().setFromQuaternion(this.quaternion, 'YXZ');
    return e.y;
  }

  get quaternion(): THREE.Quaternion {
    const r = this.chassis.rotation();
    return new THREE.Quaternion(r.x, r.y, r.z, r.w);
  }

  get wheelRadius(): number {
    return this.params.wheelRadius;
  }

  /** World positions of the four wheel centers (rule checks use these). */
  wheelPoints(): THREE.Vector3[] {
    const t = this.chassis.translation();
    const q = this.quaternion;
    const center = new THREE.Vector3(t.x, t.y, t.z);
    return this.wheelLocal.map(
      (l) => center.clone().add(l.clone().applyQuaternion(q)),
    );
  }

  atRest(): boolean {
    const v = this.chassis.linvel();
    const w = this.chassis.angvel();
    return Math.hypot(v.x, v.y, v.z) < 0.02 && Math.hypot(w.x, w.y, w.z) < 0.06;
  }

  /** Place the Car (zero velocities, upright), facing `yaw`. Terrain-aware. */
  reset(pos: THREE.Vector3, yaw: number): void {
    this.resetPose(pos, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
  }

  resetPose(pos: THREE.Vector3, quat: THREE.Quaternion): void {
    const chassisY = this.params.wheelRadius + CHASSIS_LIFT;
    this.chassis.setTranslation(
      { x: pos.x, y: pos.y + chassisY + 0.01, z: pos.z },
      true,
    );
    this.chassis.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }, true);
    this.chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  /** What each wheel is standing on (null = nothing there) — for the readout. */
  wheelSurfaces(): (SurfaceDef | null)[] {
    return this.wheelSamples;
  }

  /**
   * Distributed tire friction: Coulomb side-grip and rolling resistance
   * applied at the FOUR WHEEL contact points. This is what makes a struck
   * Car pivot around its far wheels instead of its center — the Surface grips
   * the tires that aren't sliding — and it is where the Surface meets the
   * tire: nothing here knows or remembers which Surface is "current", each
   * wheel simply asks what is under it, every frame (ADR-0002).
   */
  private applyWheelFriction(dt: number): void {
    if (dt <= 0) return;
    const m = this.chassis.mass();
    if (m <= 0) return;

    const q = this.quaternion;
    const qInv = q.clone().invert();
    const t = this.chassis.translation();
    const center = new THREE.Vector3(t.x, t.y, t.z);

    // Chassis-box inertias (body-frame approximation, diagonal).
    const lx = CHASSIS_HALF.x * 2;
    const ly = CHASSIS_HALF.y * 2;
    const lz = CHASSIS_HALF.z * 2;
    const Ix = (m * (ly * ly + lz * lz)) / 12;
    const Iy = (m * (lx * lx + lz * lz)) / 12;
    const Iz = (m * (lx * lx + ly * ly)) / 12;

    // One sample per wheel per frame: what is this wheel standing on? Nothing
    // about last frame is remembered, so crossing from one Surface to another
    // needs no transition code — the next sample already IS the new answer.
    const wheelRadius = this.params.wheelRadius;
    const tireGrip = this.params.tireGrip;
    const tireRoll = this.params.tireRoll;
    const sampled = this.wheelLocal.map((local) => {
      const p = center.clone().add(local.clone().applyQuaternion(q));
      const hit = this.field.sample(this.world, p, wheelRadius);
      const touching = !!hit && Math.abs(hit.gap) <= CONTACT_TOL;
      return { p, r: p.clone().sub(center), surface: hit?.surface ?? null, touching };
    });
    this.wheelSamples = sampled.map((w) => (w.touching ? w.surface : null));

    // A wheel with nothing under it grips nothing — no exceptions for a Car
    // hanging over a curb or over a bump. The load then sits on the contacts
    // that ARE down (Σ Nᵢ = m·G), shared evenly between them: the pool is the
    // sum of those contacts' Coulomb caps, each carrying its own Surface's μ.
    // All four down on one Surface collapses to exactly the old single-μ
    // budget (μ·m·G·dt), so nothing about today's feel moves to get here.
    const down = sampled.filter((w) => w.touching);
    if (down.length === 0) return; // fully airborne: no grip anywhere
    const load = (m / down.length) * GRAVITY * dt;
    const budget = {
      side: load * down.reduce((sum, w) => sum + (w.surface?.grip ?? 0) * tireGrip, 0),
      roll: load * down.reduce((sum, w) => sum + (w.surface?.roll ?? 0) * tireRoll, 0),
    };

    const wheelPoints = sampled;
    const SIDE = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const ROLL = new THREE.Vector3(1, 0, 0).applyQuaternion(q);

    /** One relaxation sweep over all four wheels, in the given order. */
    const sweep = (order: typeof wheelPoints): void => {
      for (const { p, r, touching } of order) {
        if (!touching) continue; // a wheel in the air receives nothing
        for (const [dir, key] of [
          [SIDE, 'side'],
          [ROLL, 'roll'],
        ] as const) {
          if (budget[key] <= 0) continue; // frame's grip already spent
          // Read the velocity FRESH for every impulse: each one changes the
          // velocity the next one is measured against (applyImpulseAtPoint
          // applies instantly). Computing all eight off one reading made
          // every one of them aim at the SAME pre-impulse velocity, so
          // together they delivered several times what was needed and
          // FLIPPED the residual instead of killing it — a frame-rate
          // chatter that never decayed once two Cars had touched (ticket 12).
          const vN = this.chassis.linvel();
          const wN = this.chassis.angvel();
          const vp = new THREE.Vector3(vN.x, vN.y, vN.z).add(
            new THREE.Vector3(wN.x, wN.y, wN.z).cross(r),
          );
          const vAlong = vp.dot(dir);
          if (Math.abs(vAlong) < 1e-6) continue;
          // Effective mass along `dir` at this point: 1/(1/m + τ·I⁻¹·τ),
          // τ = r×dir in the body frame.
          const tl = r.clone().cross(dir).applyQuaternion(qInv);
          const invEff =
            1 / m + (tl.x * tl.x) / Ix + (tl.y * tl.y) / Iy + (tl.z * tl.z) / Iz;
          const eff = 1 / invEff;
          const j = Math.min(Math.abs(vAlong) * eff, budget[key]);
          if (j <= 0) continue;
          this.chassis.applyImpulseAtPoint(
            dir.clone().multiplyScalar(-Math.sign(vAlong) * j),
            p,
            true,
          );
          budget[key] -= j;
        }
      }
    };

    // The four points are coupled through one rigid body, so a single pass
    // does not satisfy them all — and a single pass is ORDER-BIASED: it turns
    // a dead-centre Push into a systematic curve, which is exactly the kind of
    // invented behaviour ADR-0001 rejects. Alternating sweeps converge (and
    // the reversed second sweep cancels most of the bias).
    const backward = [...wheelPoints].reverse();
    for (let i = 0; i < SWEEPS; i++) {
      sweep(i % 2 === 0 ? wheelPoints : backward);
    }
  }

  /**
   * Per-frame: wheel friction (the feel), then near-zero snap (kills the
   * residual tail + solver creep), then visuals. Wheels spin from forward
   * speed (visual only). Vertical velocity is untouched.
   */
  sync(dt: number): void {
    this.applyWheelFriction(dt);

    const v = this.chassis.linvel();
    const w = this.chassis.angvel();
    if (Math.hypot(v.x, v.y, v.z) < 0.08 && Math.hypot(w.x, w.y, w.z) < 0.15) {
      this.chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }

    const t = this.chassis.translation();
    const r = this.chassis.rotation();
    this.group.position.set(t.x, t.y, t.z);
    this.group.quaternion.set(r.x, r.y, r.z, r.w);

    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(this.group.quaternion);
    const vf = v.x * forward.x + v.y * forward.y + v.z * forward.z;
    const spin = (vf / this.params.wheelRadius) * dt;
    for (const mesh of this.wheelMeshes) mesh.rotation.z -= spin;
  }

  /**
   * Nearest point on the Car's outer frame (chassis rectangle outline), at
   * side-strike height. A finger can only strike the frame — drags that
   * start in the middle snap to the nearest edge, and that is the strike the
   * physics respects.
   */
  clampToFrame(worldPoint: THREE.Vector3): THREE.Vector3 {
    const c = this.position;
    const q = this.quaternion;
    // Accept Vector3 or plain {x,y,z} (tests/debug pass plain objects).
    const local = new THREE.Vector3(worldPoint.x, worldPoint.y, worldPoint.z)
      .sub(c)
      .applyQuaternion(q.clone().invert());
    const hx = CHASSIS_HALF.x;
    const hz = CHASSIS_HALF.z;
    if (Math.abs(local.x) <= hx && Math.abs(local.z) <= hz) {
      // Inside the frame: snap to the nearest edge.
      const dx = hx - Math.abs(local.x);
      const dz = hz - Math.abs(local.z);
      if (dx < dz) local.x = local.x >= 0 ? hx : -hx;
      else local.z = local.z >= 0 ? hz : -hz;
    } else {
      // Outside: clamp onto the outline.
      local.x = Math.max(-hx, Math.min(hx, local.x));
      local.z = Math.max(-hz, Math.min(hz, local.z));
    }
    local.y = 0;
    return local.applyQuaternion(q).add(c).setY(c.y);
  }

  /**
   * Does a strike landing at `framePoint` and travelling along `direction`
   * actually PUSH? A bent index finger can press but cannot grip, so there is
   * no such thing as pulling a Car (GLOSSARY: Push = a strike against the
   * Car). The strike line has to go INTO the body: stepping `PUSH_BITE` along
   * it from the frame point must land inside the chassis footprint. If it does
   * not, the finger swung past the Car and NOTHING happened — no impulse, and
   * no Push spent. Glancing strikes that do bite deliver the FULL impulse
   * (settled 2026-10-08: a real finger would skid off, but that is a feel
   * question and may only matter if it ever turns into a gameplay exploit).
   *
   * Tested against the chassis footprint only, never the wheels: they stick
   * out past it (WHEEL_Z + r), and a finger skating over a wheel has not
   * struck the frame.
   */
  pushesFrom(framePoint: THREE.Vector3, direction: THREE.Vector3): boolean {
    const qInv = this.quaternion.clone().invert();
    const local = new THREE.Vector3(framePoint.x, framePoint.y, framePoint.z)
      .sub(this.position)
      .applyQuaternion(qInv);
    const dir = direction.clone().setY(0).normalize().applyQuaternion(qInv);
    const x = local.x + dir.x * PUSH_BITE;
    const z = local.z + dir.z * PUSH_BITE;
    return Math.abs(x) < CHASSIS_HALF.x && Math.abs(z) < CHASSIS_HALF.z;
  }

  dispose(): void {
    this.world.removeRigidBody(this.chassis);
    this.group.parent?.remove(this.group);
  }
}
