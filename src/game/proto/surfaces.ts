import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

/**
 * THROWAWAY PROTOTYPE CODE — Surfaces (ticket 16).
 *
 * A Surface is what a wheel stands on, and it owns HALF of the grip: the
 * other half belongs to the tire. Nothing else lives here. Per **ADR-0002**
 * grip is a property of the CONTACT (Surface × tire) and never of the Car
 * alone, so this module has no notion of "the current Surface" and no notion
 * of crossing from one to another — a wheel asks what is under it, gets an
 * answer, and asking is the whole mechanism.
 *
 * Two things are deliberately absent, both deliberately NOT here:
 * - **roughness** (how bumpy a Surface is at the scale of a 1:64 wheel) —
 *   ticket 17's question, which must stay answerable either way;
 * - any idea that a Surface is a *preset for a Car* — writing into CarParams
 *   is exactly what ADR-0002 rejects.
 *
 * Sampling is a downward cast against whatever environment collider is there,
 * tagged when it was built. That costs one short cast per wheel per frame and
 * buys us this: adding a balcony, a patch or a differently-shaped Surface
 * later needs NO new code here, which is what "no transition code" has to
 * mean to be worth anything.
 */

export const SURFACE_KEYS = ['asphalt', 'concrete', 'tiles', 'glass'] as const;
export type SurfaceKey = (typeof SURFACE_KEYS)[number];

/**
 * A Surface's share of the grip.
 *
 * Both numbers are *factors*, not the final answer: the contact uses
 * `surface.grip × tire.grip` and `surface.roll × tire.roll`. Defaults are set
 * so that a default tire on Concrete reproduces exactly what the single-body
 * model was tuned to before this ticket (effective μ_side 0.35, roll 0.03),
 * so today's feel is preserved on Concrete and everything else is a
 * measured departure from it.
 */
export interface SurfaceDef {
  readonly key: SurfaceKey;
  readonly label: string;
  /** Sideways grip: how hard the Surface holds a wheel that is sliding. */
  grip: number;
  /** Rolling resistance: how much it costs to keep rolling along heading. */
  roll: number;
  /**
   * Gravel: how many little stones lie embedded in one square unit of this
   * Surface (0 = clean). Ticket 17's bet — whether a 1:64 wheel can be made to
   * FEEL broken concrete — and the knob may end up deleted together with
   * everything it touches.
   */
  gravel: number;
  /** Readout colour — the HUD names the Surface under each wheel in this. */
  color: number;
}

export const SURFACES: Record<SurfaceKey, SurfaceDef> = {
  asphalt: { key: 'asphalt', label: 'Asphalt', grip: 1.0, roll: 0.05, gravel: 0, color: 0x4a4d50 },
  // The reference Surface: the numbers everything else was tuned against.
  concrete: { key: 'concrete', label: 'Concrete', grip: 0.7, roll: 0.03, gravel: 0, color: 0x8f9189 },
  tiles: { key: 'tiles', label: 'Tiles', grip: 0.45, roll: 0.02, gravel: 0, color: 0xc2a878 },
  glass: { key: 'glass', label: 'Glass', grip: 0.18, roll: 0.008, gravel: 0, color: 0x9fc6d8 },
};

/**
 * How far a stone stands proud of the ground it is embedded in: 1.2 mm real.
 * The interesting size here is the one a 1:64 wheel (6–10 mm radius) can trip
 * on — much less and it is polish, much more and it is a kerb.
 */
export const STONE_TOP = 0.012;
/** Stone radius, 3 mm real, before jitter. */
export const STONE_RADIUS = 0.03;

/** Deterministic 0..1 from two integers — same stones every run, no state. */
export function hash01(i: number, j: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** The four squares of the test ground, plus everything outside them. */
export type Square = 'nw' | 'ne' | 'sw' | 'se' | 'base';
/** Just the four squares (no 'base') — everything built or asked per square. */
export const SQUARES: Exclude<Square, 'base'>[] = ['nw', 'ne', 'sw', 'se'];
export const SQUARE_LABELS: Record<Square, string> = {
  nw: 'NW (raised 2cm)',
  ne: 'NE',
  sw: 'SW',
  se: 'SE',
  base: 'outside the squares',
};

/** Which Surface is laid in which square (swappable from the GUI). */
export type SquareAssignment = Record<Square, SurfaceKey>;

/**
 * The default layout: start/finish on Concrete (the reference Surface), then
 * Asphalt along the bottom, Glass up the far side, and Tiles carrying the
 * raised square — so one lap crosses all four, twice arriving over a height
 * step (Glass→Tiles up the ramp, Concrete→... over the far curb).
 */
export const DEFAULT_ASSIGNMENT: SquareAssignment = {
  nw: 'tiles',
  ne: 'glass',
  sw: 'concrete',
  se: 'asphalt',
  base: 'concrete',
};

/** Every square gets the same Surface — for checks that must not be about Surfaces. */
export function uniformAssignment(key: SurfaceKey): SquareAssignment {
  return { nw: key, ne: key, sw: key, se: key, base: key };
}

/**
 * Look and feel of each Surface — only as much as the feel test needs: they
 * have to be tellable apart at a glance, which is the difference between
 * "the Car went slower because it was on Tiles" and "it went slower".
 *
 * Materials are shared per Surface key, so repainting a square on a GUI swap
 * costs one assignment and no allocation.
 */
const materials = new Map<SurfaceKey, THREE.MeshStandardMaterial>();

export function surfaceMaterial(key: SurfaceKey): THREE.MeshStandardMaterial {
  const cached = materials.get(key);
  if (cached) return cached;
  const mat = new THREE.MeshStandardMaterial(materialSpec(key));
  materials.set(key, mat);
  return mat;
}

function materialSpec(key: SurfaceKey): THREE.MeshStandardMaterialParameters {
  switch (key) {
    case 'asphalt':
      return { color: 0x3f4245, roughness: 0.98, metalness: 0, map: speckleTexture(0.5) };
    case 'concrete':
      return { color: 0x8f9189, roughness: 0.95, metalness: 0, map: speckleTexture(0.35) };
    case 'tiles':
      return { color: 0xc2a878, roughness: 0.6, metalness: 0, map: tileTexture() };
    case 'glass':
      // No texture: the point of glass is that nothing marks it.
      return { color: 0x9fc6d8, roughness: 0.06, metalness: 0.12 };
  }
}

/**
 * Speckled concrete/asphalt: a grayscale blotch canvas, one tile per world
 * unit (10 cm real). Motion is readable against it (a flat colour hides
 * movement) and it reads as worn paving. Generated once per strength.
 */
function speckleTexture(strength: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const g = 150 + Math.floor(Math.random() * 105);
    ctx.fillStyle = `rgba(${g},${g},${g},${(0.25 + Math.random() * 0.3) * strength})`;
    const s = Math.random() < 0.9 ? 1 : 2;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, s, s);
  }
  for (let i = 0; i < 24; i++) {
    const g = 200 + Math.floor(Math.random() * 40);
    ctx.fillStyle = `rgba(${g},${g},${g},${0.12 * strength})`;
    ctx.beginPath();
    ctx.arc(Math.random() * 256, Math.random() * 256, 8 + Math.random() * 22, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(80, 80); // one tile per unit across the 80-unit slab
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Paving slabs: tiles with grout lines, 4 per world unit (25 cm real tiles). */
function tileTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);
  const step = 64; // 4 tiles per texture repeat
  ctx.strokeStyle = 'rgba(90,75,55,0.55)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 256; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }
  for (let i = 0; i < 200; i++) {
    const g = 170 + Math.floor(Math.random() * 85);
    ctx.fillStyle = `rgba(${g},${g},${g},0.18)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // One texture repeat covers 4 world units, so tiles are 2.5 cm real.
  tex.repeat.set(20, 20);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Membership group of the Surface pads — the things a wheel is STANDING ON.
 * They are collided with by nothing: no Car membership may include this bit,
 * or a Car would feel the seam between two pads instead of rolling over it.
 * Kept clear of `ENV_GROUP` (0x0001) and `CAR_GROUP` (0x0002) in `car.ts` —
 * pick a new bit only.
 */
export const SURVEY_GROUP = 0x0004;

/**
 * The wheel query aims at the pads and ONLY the pads: neither this Car's own
 * colliders, nor another Car's, nor the solid ground underneath can answer
 * "what is under this wheel?".
 */
const SURVEY_QUERY_GROUPS = (SURVEY_GROUP << 16) | SURVEY_GROUP;

/**
 * How far below a wheel we look for a Surface. Comfortably more than any
 * height step in the world (the sidewalk is 2 cm = 0.2 units), small enough
 * that a Car launched into the air simply finds nothing.
 */
const LOOK_DOWN = 3;

/** What `sample` found under a wheel. */
export interface WheelSample {
  surface: SurfaceDef;
  /**
   * Signed distance from the wheel skin to what it found: 0 = exactly
   * touching, positive = this far above it, negative = sunk in. Whether that
   * counts as contact is the Car's call (`CONTACT_TOL`), not here.
   */
  gap: number;
}

export class SurfaceField {
  readonly squares: SquareAssignment;
  /** collider handle → the square that collider is part of. */
  private readonly owner = new Map<number, Square>();

  constructor(squares: SquareAssignment = { ...DEFAULT_ASSIGNMENT }) {
    this.squares = { ...squares };
  }

  surfaceOf(square: Square): SurfaceDef {
    return SURFACES[this.squares[square]];
  }

  put(square: Square, key: SurfaceKey): void {
    this.squares[square] = key;
  }

  /** Record which square a Terrain collider belongs to (called when built). */
  tag(collider: RAPIER.Collider, square: Square): void {
    this.owner.set(collider.handle, square);
  }

  /**
   * What is under this wheel: a straight-down cast from the wheel centre.
   * `null` means nothing is there at all (the wheel is over the void, or far
   * enough above the world that no answer exists) — the caller decides what
   * that means, which today is "no grip from this wheel".
   */
  sample(
    world: RAPIER.World,
    wheelCentre: THREE.Vector3,
    wheelRadius: number,
  ): WheelSample | null {
    const ray = new RAPIER.Ray(
      { x: wheelCentre.x, y: wheelCentre.y, z: wheelCentre.z },
      { x: 0, y: -1, z: 0 },
    );
    const hit = world.castRay(ray, LOOK_DOWN, true, undefined, SURVEY_QUERY_GROUPS);
    if (!hit) return null;
    // An untagged environment collider means somebody added Terrain without
    // going through here; fall back to the outside standard rather than
    // silently gripping nothing.
    const square = this.owner.get(hit.collider.handle) ?? 'base';
    return {
      surface: this.surfaceOf(square),
      gap: hit.timeOfImpact - wheelRadius,
    };
  }
}
