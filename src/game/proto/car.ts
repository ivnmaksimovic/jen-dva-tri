import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GRAVITY } from './world.js';

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
  rollFriction: number; // decel = rollFriction·G along heading (wheels rolling)
  sideFriction: number; // decel = sideFriction·G sideways (tires gripping)
  angularDamping: number; // how long a spin (curve Push) lasts
}

export const CAR_PRESETS: CarParams[] = [
  {
    name: 'Plastic (small wheels, nimble)',
    color: 0xd94f4f,
    mass: 0.8,
    wheelRadius: 0.06,
    wheelHalfWidth: 0.025,
    rollFriction: 0.05,
    sideFriction: 0.5,
    angularDamping: 2.6,
  },
  {
    name: 'Balanced (medium)',
    color: 0x4f7fd9,
    mass: 1.3,
    wheelRadius: 0.075,
    wheelHalfWidth: 0.03,
    rollFriction: 0.04,
    sideFriction: 0.4,
    angularDamping: 2.0,
  },
  {
    name: 'Metal (big wheels, heavy)',
    color: 0xd8d8e0,
    mass: 2.4,
    wheelRadius: 0.1,
    wheelHalfWidth: 0.035,
    rollFriction: 0.025,
    sideFriction: 0.3,
    angularDamping: 1.5,
  },
];

const WHEEL_X = 0.15; // wheelbase 0.3 (3 cm real)
const WHEEL_Z = 0.11; // track width 0.22
const CHASSIS_HALF = { x: 0.225, y: 0.05, z: 0.1 }; // 4.5 cm long, 2 cm wide
const CHASSIS_LIFT = 0.035; // body origin above wheel axles

const ENV_GROUP = 0x0001;
const CAR_GROUP = 0x0002;
const groups = (membership: number, filter: number) => (membership << 16) | filter;

export class Car {
  readonly group = new THREE.Group();
  chassis: RAPIER.RigidBody;
  readonly params: CarParams;
  private readonly world: RAPIER.World;
  private readonly chassisMesh: THREE.Mesh;
  private readonly wheelMeshes: THREE.Mesh[] = [];
  private readonly wheelLocal: THREE.Vector3[] = [];

  constructor(world: RAPIER.World, scene: THREE.Scene, params: CarParams) {
    this.world = world;
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
        .setCollisionGroups(groups(CAR_GROUP, ENV_GROUP)),
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
            .setCollisionGroups(groups(CAR_GROUP, ENV_GROUP)),
          this.chassis,
        );
        this.wheelLocal.push(local);

        const geom = new THREE.CylinderGeometry(r, r, params.wheelHalfWidth * 2, 14);
        geom.rotateZ(Math.PI / 2); // axle along local X
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

  /**
   * Anisotropic rolling friction: along the heading the wheels ROLL
   * (rollFriction·G decel — a long glide), sideways the tires GRIP
   * (sideFriction·G decel — a short skid). Constant deceleration, so rolls
   * end definitively (no exponential never-quite-stops tail). Vertical
   * velocity is untouched (gravity, bounces). Also snaps near-zero velocities
   * to zero and spins the visual wheels from forward speed.
   */
  sync(dt: number): void {
    const v = this.chassis.linvel();
    const vel = new THREE.Vector3(v.x, v.y, v.z);
    const q = this.quaternion;
    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const side = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    let vf = vel.dot(fwd);
    let vs = vel.dot(side);
    const vu = vel.dot(up);
    const df = this.params.rollFriction * GRAVITY * dt;
    const ds = this.params.sideFriction * GRAVITY * dt;
    vf = Math.abs(vf) <= df ? 0 : vf - Math.sign(vf) * df;
    vs = Math.abs(vs) <= ds ? 0 : vs - Math.sign(vs) * ds;

    const w = this.chassis.angvel();
    const speed = Math.hypot(vf, vs, vu);
    const spinRate = Math.hypot(w.x, w.y, w.z);
    if (speed < 0.08 && spinRate < 0.15) {
      // Fully at rest: zero everything (kills residual solver creep).
      this.chassis.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.chassis.setAngvel({ x: 0, y: 0, z: 0 }, true);
    } else {
      const out = fwd
        .clone()
        .multiplyScalar(vf)
        .add(side.clone().multiplyScalar(vs))
        .add(up.clone().multiplyScalar(vu));
      this.chassis.setLinvel({ x: out.x, y: out.y, z: out.z }, true);
    }

    const t = this.chassis.translation();
    const r = this.chassis.rotation();
    this.group.position.set(t.x, t.y, t.z);
    this.group.quaternion.set(r.x, r.y, r.z, r.w);

    const spin = (vf / this.params.wheelRadius) * dt;
    for (const mesh of this.wheelMeshes) mesh.rotation.x += spin;
  }

  dispose(): void {
    this.world.removeRigidBody(this.chassis);
    this.group.parent?.remove(this.group);
  }
}
