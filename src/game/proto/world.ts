import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  SQUARES,
  STONE_RADIUS,
  STONE_TOP,
  SURFACES,
  SURVEY_GROUP,
  hash01,
  surfaceMaterial,
  type Square,
  type SurfaceField,
} from './surfaces.js';

/**
 * THROWAWAY PROTOTYPE CODE — v0 slingshot vertical slice.
 * World scale: 1 unit = 10 real centimetres (a 1:64 car is ~0.45 units long,
 * the sidewalk curb is 0.2 units = 2 cm). Gravity matches: 98.1 units/s².
 *
 * The Terrain is a TEST GROUND for Surfaces: the ground under the Track is four
 * joined squares, and one of them is raised as a sidewalk. Which square is made
 * of WHAT is decided by `SurfaceField` (swappable from the GUI); which square is
 * RAISED is a property of the place, not the paint.
 *
 * There are two layers here, and the split is the point:
 *
 *   **What you roll on** (`groundPieces`, plus `stonesIn` for ticket 17) — one
 *   seamless flat slab, the raised square and its two ramps, and whatever
 *   stones a Surface carries. ONE slab for all flat ground, because four slabs
 *   laid edge to edge gave every joint a vertical face, and a 1:64 wheel met
 *   it: it rode up 1 mm and lost half its speed in a single frame.
 *
 *   **What you are standing on** (`surfacePads`) — one thin pad per square,
 *   asked about by a straight-down cast from each wheel, and collided with by
 *   NOTHING (its own collision group). Because they never make contact, they
 *   can meet at exact boundaries with no artifacts at all: which pad a wheel
 *   finds is decided purely by where it is.
 */
export const GRAVITY = 98.1;

let physicsReady: Promise<void> | null = null;

/** One-time async WASM init for Rapier (compat build, no external wasm file). */
export function initPhysics(): Promise<void> {
  if (!physicsReady) physicsReady = RAPIER.init();
  return physicsReady;
}

/** Height of the raised sidewalk square: 2 cm real (was 4 cm — too tall here). */
export const RAISED_TOP = 0.2;
/** Compatibility name: the raised square IS the sidewalk. */
export const SIDEWALK_TOP = RAISED_TOP;

/**
 * The four squares meet at one point near the middle of the Track loop, so
 * every square is crossed by the Track and all four touch at one corner —
 * the cheapest place to park a Car with two wheels on each of two Surfaces.
 * Each square is HALF*2 across (1.4 m real), comfortably wider than the loop.
 */
export const MEET_X = 13;
export const MEET_Z = 11;
export const HALF = 14;

/** Which square carries the sidewalk: the north-west one, ramps and all. */
export const RAISED: Exclude<Square, 'base'> = 'nw';

/**
 * A 1:64 wheel is 0.6–1.0 cm in radius, so even a 2 cm curb is a wall about
 * one full wheel DIAMETER tall — a model car cannot climb it at any speed.
 * The Track therefore gets onto the raised square over two worn ramps, at the
 * two places it crosses the boundary; every other part of the edge stays a
 * hard curb you have to go around (that is Terrain, not a slope).
 */
const RAMP_LEN = 2.5;
interface RampSpec {
  axis: 'x' | 'z';
  /** Along `axis`: the end level with the raised square. */
  high: number;
  /** Along `axis`: the end level with the ground. */
  low: number;
  /** Across the ramp: wide enough for the Track there, plus a margin. */
  cross: [number, number];
}
const RAMPS: RampSpec[] = [
  // Top straight (z ≈ 22), where the Track crosses x = MEET_X.
  { axis: 'x', high: MEET_X, low: MEET_X + RAMP_LEN, cross: [20.2, 23.8] },
  // Left straight (x ≈ 0), where the Track crosses z = MEET_Z.
  { axis: 'z', high: MEET_Z, low: MEET_Z - RAMP_LEN, cross: [-1.8, 1.8] },
];

/** Footprint of one of the four squares on the ground plane. */
function spanOf(q: Exclude<Square, 'base'>): { x: [number, number]; z: [number, number] } {
  const west = q === 'nw' || q === 'sw';
  const south = q === 'sw' || q === 'se';
  return {
    x: west ? [MEET_X - HALF, MEET_X] : [MEET_X, MEET_X + HALF],
    z: south ? [MEET_Z - HALF, MEET_Z] : [MEET_Z, MEET_Z + HALF],
  };
}

/** Top of the flat ground inside a square ('base' is the world beyond them). */
function surfaceHeight(q: Square): number {
  if (q === 'nw') return RAISED_TOP; // the raised one
  if (q === 'base') return -0.001; // everything beyond the four squares
  return 0;
}

/** Which square a point belongs to, or null outside all four. */
function squareAt(x: number, z: number): Exclude<Square, 'base'> | null {
  for (const q of SQUARES) {
    const { x: sx, z: sz } = spanOf(q);
    if (x >= sx[0] && x <= sx[1] && z >= sz[0] && z <= sz[1]) return q;
  }
  return null;
}

const SLAB_THICKNESS = 0.5;
const RAMP_THICKNESS = 0.06;
/** Survey pads are thin: they only ever have to be found by a downward cast. */
const PAD_THICKNESS = 0.02;

/** One piece of the world: size, place, attitude, and which square it is. */
export interface TerrainPiece {
  /** Which square's Surface this belongs to ('base' outside the four). */
  square: Square;
  kind: 'slab' | 'ramp';
  size: [number, number, number];
  center: [number, number, number];
  rotation: THREE.Quaternion;
}

/** One stone embedded in a square's surface (ticket 17). */
export interface Stone {
  square: Square;
  x: number;
  z: number;
  radius: number;
  /** How far it stands proud of the surface it is set into. */
  top: number;
}

/**
 * What the wheels ROLL ON. One flat slab carries all flat ground (no joints in
 * it at all), then the raised square and the two ramps sit on top of it.
 */
export function groundPieces(): TerrainPiece[] {
  const pieces: TerrainPiece[] = [
    {
      square: 'base',
      kind: 'slab',
      size: [80, SLAB_THICKNESS, 80],
      center: [MEET_X, -SLAB_THICKNESS / 2, MEET_Z],
      rotation: new THREE.Quaternion(),
    },
  ];
  const raised = spanOf(RAISED);
  const thickness = RAISED_TOP + 0.05;
  pieces.push({
    square: RAISED,
    kind: 'slab',
    size: [raised.x[1] - raised.x[0], thickness, raised.z[1] - raised.z[0]],
    center: [
      (raised.x[0] + raised.x[1]) / 2,
      RAISED_TOP - thickness / 2,
      (raised.z[0] + raised.z[1]) / 2,
    ],
    rotation: new THREE.Quaternion(),
  });
  for (const r of RAMPS) pieces.push(rampDeck(r));
  return pieces;
}

/**
 * Stones set into whichever squares carry gravel: a jittered lattice, so the
 * spacing is even (no clumps, no bald patches) while every stone sits a little
 * off its mark. Deterministic — the same world every run — and REAL GEOMETRY on
 * purpose.
 *
 * Ticket 17 first tried making the rolling surface itself bumpy (a heightfield
 * of millimetre relief) and that failed on its own measurement: a FLAT
 * heightfield braked the Car exactly as much as a bumpy one, and 10% of probes
 * found no collider beneath at all. Anything that cannot tell bumps apart from
 * its own representation cannot answer the question, so relief left and stones
 * came in — nothing claims the shape, a solid object just sits there.
 */
export function stonesIn(field: SurfaceField, keep?: (x: number, z: number) => boolean): Stone[] {
  const stones: Stone[] = [];
  for (const q of SQUARES) {
    const density = SURFACES[field.squares[q]].gravel;
    if (density <= 0) continue;
    const { x, z } = spanOf(q);
    const spacing = 1 / Math.sqrt(density);
    const cols = Math.floor((x[1] - x[0]) / spacing);
    const rows = Math.floor((z[1] - z[0]) / spacing);
    for (let j = 0; j < cols; j++) {
      for (let i = 0; i < rows; i++) {
        const jitter = hash01(j * 7 + i, i * 13 + j);
        const jitter2 = hash01(i * 31 + j, j * 17 + i);
        const px = x[0] + (j + 0.15 + 0.7 * jitter) * spacing;
        const pz = z[0] + (i + 0.15 + 0.7 * jitter2) * spacing;
        // Off the Track nothing drives over it, so nothing pays for it.
        if (keep && !keep(px, pz)) continue;
        stones.push({
          square: q,
          x: px,
          z: pz,
          radius: STONE_RADIUS * (0.7 + 0.6 * jitter),
          top: STONE_TOP * (0.6 + 0.8 * jitter2),
        });
      }
    }
  }
  return stones;
}

/**
 * What a wheel is STANDING ON. One pad per square with EXACTLY the square's
 * footprint — nothing to collide with, so nothing to catch on. The base pad is
 * sunk 0.1 mm so that inside a square the answer is always that square, and
 * the readout can never disagree with the paint it is standing next to.
 */
export function surfacePads(): TerrainPiece[] {
  const pads: TerrainPiece[] = [];
  for (const q of [...SQUARES, 'base' as Square]) {
    const span =
      q === 'base'
        ? {
            x: [MEET_X - 40, MEET_X + 40] as [number, number],
            z: [MEET_Z - 40, MEET_Z + 40] as [number, number],
          }
        : spanOf(q);
    pads.push({
      square: q,
      kind: 'slab',
      size: [span.x[1] - span.x[0], PAD_THICKNESS, span.z[1] - span.z[0]],
      center: [
        (span.x[0] + span.x[1]) / 2,
        surfaceHeight(q) - PAD_THICKNESS / 2,
        (span.z[0] + span.z[1]) / 2,
      ],
      rotation: new THREE.Quaternion(),
    });
  }
  // A ramp is part of the raised square: standing on it is standing on tiles.
  for (const r of RAMPS) {
    const deck = rampDeck(r);
    pads.push(
      liftToTopFace(
        {
          square: deck.square,
          kind: 'slab',
          size: [deck.size[0], PAD_THICKNESS, deck.size[2]],
          center: [...deck.center] as [number, number, number],
          rotation: deck.rotation.clone(),
        },
        deck.size[1],
      ),
    );
  }
  return pads;
}

/** Slide a thin piece so its TOP FACE sits where the deck's does. */
function liftToTopFace(piece: TerrainPiece, deckThickness: number): TerrainPiece {
  const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(piece.rotation);
  const center = new THREE.Vector3(...piece.center)
    .addScaledVector(normal, deckThickness / 2)
    .addScaledVector(normal, -piece.size[1] / 2);
  return { ...piece, center: [center.x, center.y, center.z] };
}

/**
 * A thin tilted deck whose TOP FACE runs exactly from (low, y = 0) to
 * (high, y = RAISED_TOP) — that precision is the whole trick: a careless ramp
 * reads as a jolt every time a wheel crosses onto it.
 */
function rampDeck(piece: RampSpec): TerrainPiece {
  const len = Math.abs(piece.high - piece.low);
  const hyp = Math.hypot(len, RAISED_TOP);
  const slope = Math.atan2(RAISED_TOP, len);
  const k = Math.sign(piece.high - piece.low) || 1; // +1: the high end is "up-axis"

  // Rotate so one horizontal local axis lies along the slope and local Y is
  // that slope's up-normal. Both signs come out of `k`, so adding a third
  // ramp needs no new case here.
  const rotation =
    piece.axis === 'x'
      ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), k * slope)
      : new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -k * slope);
  const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);

  const alongMid = (piece.high + piece.low) / 2;
  const crossMid = (piece.cross[0] + piece.cross[1]) / 2;
  const crossLen = piece.cross[1] - piece.cross[0];
  // Midpoint of the deck's top face (half way along it, half way up), then
  // down the normal by half the thickness, so the face itself lands there.
  const mid =
    piece.axis === 'x'
      ? new THREE.Vector3(alongMid, RAISED_TOP / 2, crossMid)
      : new THREE.Vector3(crossMid, RAISED_TOP / 2, alongMid);
  const center = mid.addScaledVector(normal, -RAMP_THICKNESS / 2);

  return {
    square: RAISED,
    kind: 'ramp',
    size: piece.axis === 'x' ? [hyp, RAMP_THICKNESS, crossLen] : [crossLen, RAMP_THICKNESS, hyp],
    center: [center.x, center.y, center.z],
    rotation,
  };
}

/**
 * Ground height at (x, z) — chalk drawing, checkpoint lines and the aim ring
 * all read this, so the drawing can never disagree with what the wheels roll
 * on. Analytic, and derived from the same numbers the pieces come from.
 *
 * It is the MEAN plane, deliberately: stones are things lying on the ground,
 * not the ground's shape.
 */
export function terrainY(x: number, z: number): number {
  // Ramps FIRST: they lie on top of whatever is beneath them, so asking the
  // flat ground first would answer for the ground under the ramp instead of
  // for the ramp the wheels ride.
  for (const r of RAMPS) {
    const along = r.axis === 'x' ? x : z;
    const across = r.axis === 'x' ? z : x;
    if (across < r.cross[0] || across > r.cross[1]) continue;
    if (along < Math.min(r.high, r.low) || along > Math.max(r.high, r.low)) continue;
    // Straight line from the low end (y = 0) up to the high end (raised).
    return (RAISED_TOP * (along - r.low)) / (r.high - r.low);
  }
  const square = squareAt(x, z);
  return square ? surfaceHeight(square) : 0;
}

/** Environment membership: every Terrain collider a Car can actually touch. */
const ENV_GROUP = 0x0001;
const groups = (membership: number, filter: number): number => (membership << 16) | filter;

/** Handle for the one thing in the world the GUI can reshape. */
export interface TerrainHandle {
  /** Rebuild everything a change of gravel can affect (called by the GUI). */
  reground(): void;
}

/**
 * Physics only — no meshes, no textures, so it runs headlessly in Node
 * (`pnpm check:surfaces`). Ground pieces collide with everything; Surface pads
 * are tagged with their square, which is the whole answer to "what is under
 * this wheel?".
 */
export function buildTerrainPhysics(
  world: RAPIER.World,
  field: SurfaceField,
  keep?: (x: number, z: number) => boolean,
): TerrainHandle {
  /** Every body this built, so `reground` can replace exactly those. */
  const built: RAPIER.RigidBody[] = [];

  const addPiece = (p: TerrainPiece, square: Square, group: number, tag: boolean): void => {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    body.setRotation({ x: p.rotation.x, y: p.rotation.y, z: p.rotation.z, w: p.rotation.w }, true);
    body.setTranslation({ x: p.center[0], y: p.center[1], z: p.center[2] }, true);
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(p.size[0] / 2, p.size[1] / 2, p.size[2] / 2)
        .setFriction(0.95)
        .setCollisionGroups(group),
      body,
    );
    if (tag) field.tag(collider, square);
    built.push(body);
  };

  /** One body per square carries its stones: many ball colliders, one object. */
  const addStones = (): void => {
    const bySquare = new Map<Square, Stone[]>();
    for (const stone of stonesIn(field, keep)) {
      const list = bySquare.get(stone.square) ?? [];
      list.push(stone);
      bySquare.set(stone.square, list);
    }
    for (const list of bySquare.values()) {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      for (const stone of list) {
        world.createCollider(
          RAPIER.ColliderDesc.ball(stone.radius)
            .setTranslation(stone.x, stone.top - stone.radius, stone.z)
            .setFriction(0.95)
            .setCollisionGroups(groups(ENV_GROUP, 0xffff)),
          body,
        );
      }
      built.push(body);
    }
  };

  const build = (): void => {
    for (const body of [...built]) {
      built.splice(built.indexOf(body), 1);
      world.removeRigidBody(body);
    }
    // Rolling surface: solid, collides with the Cars, carries no material.
    for (const p of groundPieces()) addPiece(p, p.square, groups(ENV_GROUP, 0xffff), false);
    addStones();
    // Standing-on surface: never collides, only answers casts.
    for (const p of surfacePads()) addPiece(p, p.square, groups(SURVEY_GROUP, SURVEY_GROUP), true);
  };
  build();
  return { reground: build };
}

/**
 * Visual meshes. Two layers of them, because there are two things to see:
 * the solid ground (what you roll on) and, painted on top of it at 0.1 mm,
 * each square's own material (what you are standing on). Both are keyed by
 * square, so moving Surfaces around in the GUI repaints both together.
 */
export function buildTerrainMeshes(
  scene: THREE.Scene,
  field: SurfaceField,
  keep?: (x: number, z: number) => boolean,
): Map<Square, THREE.Mesh[]> {
  const bySquare = new Map<Square, THREE.Mesh[]>();
  const addMesh = (p: TerrainPiece, square: Square): void => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...p.size),
      surfaceMaterial(field.squares[square]),
    );
    mesh.position.set(...p.center);
    mesh.quaternion.copy(p.rotation);
    mesh.receiveShadow = true;
    scene.add(mesh);
    const list = bySquare.get(square) ?? [];
    list.push(mesh);
    bySquare.set(square, list);
  };
  for (const p of groundPieces()) addMesh(p, p.square);
  // Each square's own material, painted 0.1 mm proud of the solid ground so it
  // never z-fights with it (and 0.1 mm is far below what a 1:64 wheel can
  // feel). `userData.square` marks these so `refreshTerrain` can repaint them.
  for (const q of SQUARES) {
    const { x, z } = spanOf(q);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(x[1] - x[0], 0.002, z[1] - z[0]),
      surfaceMaterial(field.squares[q]),
    );
    mesh.position.set((x[0] + x[1]) / 2, surfaceHeight(q) + 0.001, (z[0] + z[1]) / 2);
    mesh.receiveShadow = true;
    mesh.userData.square = q;
    scene.add(mesh);
    const list = bySquare.get(q) ?? [];
    list.push(mesh);
    bySquare.set(q, list);
  }
  addStoneMeshes(scene, field, bySquare, keep);
  return bySquare;
}

/**
 * The stones, drawn as one instanced mesh per square — a busy dam asked for one
 * draw call, not a thousand, and it is the same list the colliders were built
 * from, so what you see is what you hit.
 */
function addStoneMeshes(
  scene: THREE.Scene,
  field: SurfaceField,
  bySquare: Map<Square, THREE.Mesh[]>,
  keep?: (x: number, z: number) => boolean,
): void {
  const perSquare = new Map<Square, Stone[]>();
  for (const stone of stonesIn(field, keep)) {
    const list = perSquare.get(stone.square) ?? [];
    list.push(stone);
    perSquare.set(stone.square, list);
  }
  for (const [square, list] of perSquare) {
    if (list.length === 0) continue;
    const mesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 8, 6),
      surfaceMaterial(field.squares[square]),
      list.length,
    );
    const m = new THREE.Matrix4();
    list.forEach((stone, i) => {
      m.makeScale(stone.radius, stone.radius, stone.radius);
      m.setPosition(stone.x, stone.top - stone.radius, stone.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.userData.stones = square;
    scene.add(mesh);
    const list2 = bySquare.get(square) ?? [];
    list2.push(mesh);
    bySquare.set(square, list2);
  }
}

/** Bring every mesh back in line with the field after ANY change. */
export function refreshTerrain(meshes: Map<Square, THREE.Mesh[]>, field: SurfaceField): void {
  for (const [square, list] of meshes) {
    for (const mesh of list) mesh.material = surfaceMaterial(field.squares[square]);
  }
}

/**
 * Replace the stone meshes: their number can change, so unlike the slabs these
 * cannot simply be repainted. One draw call per square either way.
 */
export function rebuildStoneMeshes(
  scene: THREE.Scene,
  meshes: Map<Square, THREE.Mesh[]>,
  field: SurfaceField,
  keep?: (x: number, z: number) => boolean,
): void {
  for (const [square, list] of [...meshes]) {
    const survivors = list.filter((mesh) => {
      if (mesh.userData.stones === undefined) return true;
      scene.remove(mesh);
      (mesh as THREE.InstancedMesh).dispose();
      return false;
    });
    meshes.set(square, survivors);
  }
  addStoneMeshes(scene, field, meshes, keep);
}

/** The whole environment: physics plus its looks, and the handle to reshape it. */
export function buildEnvironment(
  world: RAPIER.World,
  scene: THREE.Scene,
  field: SurfaceField,
  keep?: (x: number, z: number) => boolean,
): { terrain: TerrainHandle; terrainMeshes: Map<Square, THREE.Mesh[]>; refresh(): void } {
  const terrain = buildTerrainPhysics(world, field, keep);
  const terrainMeshes = buildTerrainMeshes(scene, field, keep);
  return {
    terrain,
    terrainMeshes,
    /** After the GUI moved Surfaces, or changed how much gravel they carry. */
    refresh(): void {
      refreshTerrain(terrainMeshes, field);
      rebuildStoneMeshes(scene, terrainMeshes, field, keep);
    },
  };
}
