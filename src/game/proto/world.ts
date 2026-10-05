import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

/**
 * THROWAWAY PROTOTYPE CODE — v0 slingshot vertical slice.
 * World scale: 1 unit = 10 real centimetres (a 1:64 car is ~0.45 units long,
 * the sidewalk curb is 0.4 units = 4 cm). Gravity matches: 98.1 units/s².
 */

export const GRAVITY = 98.1;

let physicsReady: Promise<void> | null = null;

/** One-time async WASM init for Rapier (compat build, no external wasm file). */
export function initPhysics(): Promise<void> {
  if (!physicsReady) physicsReady = RAPIER.init();
  return physicsReady;
}

/** Height of the raised sidewalk surface (the "curb drop" Terrain payoff). */
export const SIDEWALK_TOP = 0.4;

const SIDEWALK_X1 = 9;
const SIDEWALK_X2 = 17;
const RAMP_UP_X1 = SIDEWALK_X2; // 17 — rises toward +X end (car comes from +X)
const RAMP_UP_X2 = 19.5;
const RAMP_DOWN_X1 = 6.5;
const RAMP_DOWN_X2 = SIDEWALK_X1; // 9
const WALK_Z1 = 20.2;
const WALK_Z2 = 23.8;
const RAMP_LEN = RAMP_UP_X2 - RAMP_UP_X1; // 2.5
const SLOPE_ANGLE = Math.atan2(SIDEWALK_TOP, RAMP_LEN);

/**
 * Ground height at any (x, z) — used for chalk drawing, checkpoint lines and
 * car placement so chalk on the sidewalk sits on the sidewalk.
 */
export function terrainY(x: number, z: number): number {
  if (z < WALK_Z1 || z > WALK_Z2) return 0;
  if (x >= RAMP_UP_X1 && x <= RAMP_UP_X2) {
    // Car travels -X: high at x=17 (side), low at x=19.5 (ground).
    return SIDEWALK_TOP * (RAMP_UP_X2 - x) / RAMP_LEN;
  }
  if (x >= SIDEWALK_X1 && x <= SIDEWALK_X2) return SIDEWALK_TOP;
  if (x >= RAMP_DOWN_X1 && x <= RAMP_DOWN_X2) {
    // high at x=9 (side), low at x=6.5 (ground)
    return SIDEWALK_TOP * (x - RAMP_DOWN_X1) / RAMP_LEN;
  }
  return 0;
}

function concrete(hex: string, rough = 0.95): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: hex,
    roughness: rough,
    metalness: 0,
    map: speckleTexture(),
  });
}

/**
 * Speckled concrete: a grayscale speckle/blotch canvas texture, one tile per
 * world unit (10 cm real). Motion is readable against it (a flat color would
 * hide movement), and it reads as worn concrete. Generated once, shared.
 */
function speckleTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const g = 150 + Math.floor(Math.random() * 105);
    ctx.fillStyle = `rgba(${g},${g},${g},${0.25 + Math.random() * 0.3})`;
    const s = Math.random() < 0.9 ? 1 : 2;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, s, s);
  }
  for (let i = 0; i < 24; i++) {
    const g = 200 + Math.floor(Math.random() * 40);
    ctx.fillStyle = `rgba(${g},${g},${g},0.12)`;
    ctx.beginPath();
    ctx.arc(Math.random() * 256, Math.random() * 256, 8 + Math.random() * 22, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(80, 80); // 80 units of ground → one tile per unit
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function addFixedBox(
  world: RAPIER.World,
  scene: THREE.Scene,
  size: [number, number, number],
  center: [number, number, number],
  rotZ: number,
  mat: THREE.Material,
): void {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  body.setRotation({ x: 0, y: 0, z: Math.sin(rotZ / 2), w: Math.cos(rotZ / 2) }, true);
  body.setTranslation({ x: center[0], y: center[1], z: center[2] }, true);
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2)
      .setFriction(0.95)
      .setCollisionGroups(0x0001_0000 | 0xffff), // environment: collide with everything
    body,
  );
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
  mesh.position.set(center[0], center[1], center[2]);
  mesh.rotation.z = rotZ;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

/** Concrete ground, the raised sidewalk slab and the two worn ramp edges. */
export function buildEnvironment(world: RAPIER.World, scene: THREE.Scene): void {
  const groundMat = concrete('#8f9189');
  const slabMat = concrete('#a2a49c');
  const rampMat = concrete('#96988f');

  // Ground slab: top surface at y = 0.
  addFixedBox(world, scene, [80, 0.5, 80], [13, -0.25, 11], 0, groundMat);

  // Sidewalk slab: top at y = SIDEWALK_TOP, under the top straight of the loop.
  addFixedBox(
    world,
    scene,
    [SIDEWALK_X2 - SIDEWALK_X1, SIDEWALK_TOP + 0.05, WALK_Z2 - WALK_Z1],
    [(SIDEWALK_X1 + SIDEWALK_X2) / 2, (SIDEWALK_TOP - 0.05) / 2, (WALK_Z1 + WALK_Z2) / 2],
    0,
    slabMat,
  );

  // Ramp up (car enters travelling -X): ground at x=19.5 → sidewalk at x=17.
  // Thin rotated box whose TOP face exactly spans (19.5, 0) → (17, SIDEWALK_TOP).
  const rampLenHyp = Math.hypot(RAMP_LEN, SIDEWALK_TOP);
  const rampThick = 0.06;
  // Face normal of the tilted top surface (unit), used to sink the box under the face.
  const nUp = { x: SIDEWALK_TOP / rampLenHyp, y: RAMP_LEN / rampLenHyp };
  addFixedBox(
    world,
    scene,
    [rampLenHyp, rampThick, WALK_Z2 - WALK_Z1],
    [
      (RAMP_UP_X1 + RAMP_UP_X2) / 2 - nUp.x * (rampThick / 2),
      SIDEWALK_TOP / 2 - nUp.y * (rampThick / 2),
      (WALK_Z1 + WALK_Z2) / 2,
    ],
    -SLOPE_ANGLE,
    rampMat,
  );
  // Ramp down: sidewalk at x=9 → ground at x=6.5.
  addFixedBox(
    world,
    scene,
    [rampLenHyp, rampThick, WALK_Z2 - WALK_Z1],
    [
      (RAMP_DOWN_X1 + RAMP_DOWN_X2) / 2 + nUp.x * (rampThick / 2),
      SIDEWALK_TOP / 2 - nUp.y * (rampThick / 2),
      (WALK_Z1 + WALK_Z2) / 2,
    ],
    SLOPE_ANGLE,
    rampMat,
  );
}
