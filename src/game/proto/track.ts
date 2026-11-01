import * as THREE from 'three';
import { terrainY } from './world.js';
import {
  CHALK_LIFT,
  chalkFillGeometry,
  chalkMaterial,
  ribbonGeometry,
  segmentRibbon,
  wobblePath,
} from './chalk.js';

/**
 * THROWAWAY PROTOTYPE CODE — chalk Track: a rounded-rect loop 26×22 units
 * (≈2.6×2.2 m real), width 3 units, with checkpoints, a Rock, a Lake and a
 * Bridge on the sidewalk section. All chalk is white, some millimetres thick.
 *
 * Chalk used to be `LineBasicMaterial`, which is one PIXEL wide however far you
 * zoom: a hairline, not chalk. Lines here are `Line2` in `worldUnits`, so the
 * band has the same real width at any zoom (ticket 20).
 *
 * Ticket 20's `Line2` bands were the right WIDTH but still vector art: pure
 * white, mathematically smooth. They are now ribbons with chalk grain, a
 * hand's wobble in the path, and a width that breathes along the mark.
 *
 * IMPORTANT: the wobble is applied to `this.path` itself, so the RULES and the
 * DRAWING read the same line. A mark that disagreed with the rules by more
 * than the chalk's own width would be a bug, not a texture.
 */

export interface Vec2 {
  x: number;
  z: number;
}

export interface PathPoint {
  x: number;
  y: number;
  z: number;
  /** Unit tangent of the path (direction of travel) at this point. */
  dx: number;
  dz: number;
  s: number;
}

export const TRACK_HALF_WIDTH = 1.5; // chalk lines 1.5 units from centerline
/**
 * The RULE half-width of a Boundary: how far past the chalk a wheel must be
 * before it counts as Out of Track. Deliberately separate from the chalk's
 * drawn width — the mark can be repainted without changing the rules.
 */
export const CHALK_WIDTH = 0.05; // ~5 mm real chalk line width

/** How wide the chalk is DRAWN, world units (half-width of the band). */
const CHALK_HALF_WIDTH = 0.035;

function roundedRectPath(): Vec2[] {
  // Rectangle x∈[0,26] z∈[0,22], corner radius 6, sampled every ~6°.
  const corners: { cx: number; cz: number; from: number; to: number }[] = [
    { cx: 20, cz: 6, from: -Math.PI / 2, to: 0 },
    { cx: 20, cz: 16, from: 0, to: Math.PI / 2 },
    { cx: 6, cz: 16, from: Math.PI / 2, to: Math.PI },
    { cx: 6, cz: 6, from: Math.PI, to: (3 * Math.PI) / 2 },
  ];
  const pts: Vec2[] = [{ x: 6, z: 0 }, { x: 20, z: 0 }]; // bottom straight, heading +X
  const STEPS = 15;
  for (const c of corners) {
    for (let i = 1; i <= STEPS; i++) {
      const a = c.from + ((c.to - c.from) * i) / STEPS;
      pts.push({ x: c.cx + 6 * Math.cos(a), z: c.cz + 6 * Math.sin(a) });
    }
  }
  // Remove duplicate of the start point that the last corner lands on.
  const last = pts[pts.length - 1];
  if (Math.hypot(last.x - 6, last.z) < 1e-6) pts.pop();
  return pts;
}

/** Offsets a closed polyline sideways by `d` (positive = left of travel). */
function offsetPolyline(pts: Vec2[], d: number): Vec2[] {
  const n = pts.length;
  return pts.map((p, i) => {
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const t = { x: next.x - prev.x, z: next.z - prev.z };
    const len = Math.hypot(t.x, t.z) || 1;
    // left normal of the travel direction
    return { x: p.x + (-t.z / len) * d, z: p.z + (t.x / len) * d };
  });
}

/**
 * A stroke drawn ACROSS the track.
 *
 * A checkpoint line is two points and a straight line between them — which
 * is exactly what a renderer draws and exactly what a hand does not. This
 * subdivides the stroke and lets it wander a little, the same way the
 * boundary line's path does.
 */
function drawnStroke(
  a: THREE.Vector3,
  b: THREE.Vector3,
  wobble: number,
  seed: number,
): THREE.Vector3[] {
  const dir = b.clone().sub(a);
  const len = dir.length();
  if (len < 1e-6) return [a, b];
  const nx = -dir.z / len;
  const nz = dir.x / len;
  const n = 14;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    // A single lazy S, plus a little noise: the line drifts off true and
    // comes back, the way a wrist does it.
    const off =
      (Math.sin(u * Math.PI * 1.6 + seed) * 0.7 + Math.sin(u * Math.PI * 4.3 + seed * 2.1) * 0.3) *
      wobble;
    pts.push(
      new THREE.Vector3(
        a.x + dir.x * u + nx * off,
        a.y + (b.y - a.y) * u,
        a.z + dir.z * u + nz * off,
      ),
    );
  }
  return pts;
}

export class Track {
  readonly path: Vec2[];
  readonly length: number;
  /** All chalk drawings (boundaries, checkpoints, hazards) — toggleable. */
  readonly chalk = new THREE.Group();
  /** Cumulative arc length at the start of each segment (segments close the loop). */
  private readonly cum: number[] = [];
  /** Checkpoint arc lengths, sorted ascending, starting with the start line (s=0). */
  readonly checkpointS: number[] = [];

  /** Half-width of the drawn chalk band, world units. */
  private chalkHalf = CHALK_HALF_WIDTH;

  // Hazard geometry (flat chalk drawings — rules, not colliders):
  readonly rock: Vec2[] = [
    { x: 16.6, z: 0.6 },
    { x: 15.4, z: 0.6 },
    { x: 16, z: -0.7 },
  ];
  readonly lake = { cx: 26, cz: 12.5, rx: 1.0, rz: 1.3 };
  /**
   * The Bridge sits wholly INSIDE the raised square (ticket 16 moved it from
   * x 12.25–13.75, which straddled the square's edge and its ramp). Chalk is
   * drawn at one height for the whole shape, so an offset across a height
   * step drew half of it buried and half of it floating.
   */
  readonly bridge = { x1: 10.4, x2: 11.9, z1: 20.5, z2: 23.5 };

  constructor(scene: THREE.Scene) {
    // The hand's wobble lives in the PATH, so the rules and the drawing
    // cannot disagree. 1.5 mm of wander is visible up close and invisible to
    // the rules.
    this.path = wobblePath(roundedRectPath(), 0.015, 0.35);
    let s = 0;
    for (let i = 0; i < this.path.length; i++) {
      this.cum.push(s);
      const a = this.path[i];
      const b = this.path[(i + 1) % this.path.length];
      s += Math.hypot(b.x - a.x, b.z - a.z);
    }
    this.length = s;

    // Checkpoints: start/finish at (6,0) [s=0], then three lines.
    this.checkpointS = [
      0,
      this.progressOf({ x: 12, z: 0 }).s,
      this.progressOf({ x: 26, z: 12 }).s,
      this.progressOf({ x: 10, z: 22 }).s,
    ];

    this.drawChalk();
    scene.add(this.chalk);
  }

  /** Repaint the chalk at a new width (a GUI knob). Cheap: ~13 small meshes. */
  setChalkWidth(halfWidth: number): void {
    if (Math.abs(halfWidth - this.chalkHalf) < 1e-4) return;
    this.chalkHalf = halfWidth;
    for (const child of [...this.chalk.children]) {
      this.chalk.remove(child);
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
    }
    this.drawChalk();
  }

  private drawChalk(): void {
    const lift = CHALK_LIFT; // above the concrete to avoid z-fighting
    const hw = this.chalkHalf;
    const mat = chalkMaterial();

    const addRibbon = (
      pts: THREE.Vector3[],
      closed = false,
      pressure = 0.4,
      seed = 0,
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(
        ribbonGeometry(pts, { halfWidth: hw, closed, pressure, seed }),
        mat,
      );
      mesh.receiveShadow = true;
      mesh.renderOrder = 1;
      this.chalk.add(mesh);
      return mesh;
    };

    // Boundary lines, following terrain height (sidewalk/ramps).
    for (const [side, seed] of [[-TRACK_HALF_WIDTH, 1], [TRACK_HALF_WIDTH, 2]] as const) {
      const off = offsetPolyline(this.path, side);
      // Sampled finely so the sidewalk/ramp height profile is followed.
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < off.length; i++) {
        const a = off[i];
        const b = off[(i + 1) % off.length];
        const segLen = Math.hypot(b.x - a.x, b.z - a.z);
        const steps = Math.max(1, Math.ceil(segLen / 0.2));
        for (let k = 0; k < steps; k++) {
          const x = a.x + ((b.x - a.x) * k) / steps;
          const z = a.z + ((b.z - a.z) * k) / steps;
          pts.push(new THREE.Vector3(x, terrainY(x, z) + lift, z));
        }
      }
      addRibbon(pts, true, 0.42, seed);
    }

    // Checkpoints: lines across the track (perpendicular to the path).
    this.checkpointS.forEach((cs, i) => {
      const p = this.pointAt(cs);
      const px = -p.dz;
      const pz = p.dx; // left normal
      addRibbon(
        drawnStroke(
          new THREE.Vector3(p.x + px * TRACK_HALF_WIDTH, p.y + lift, p.z + pz * TRACK_HALF_WIDTH),
          new THREE.Vector3(p.x - px * TRACK_HALF_WIDTH, p.y + lift, p.z - pz * TRACK_HALF_WIDTH),
          0.014,
          i,
        ),
        false,
        0.45,
        10 + i,
      );
    });

    // Start/finish: double line just behind the start checkpoint.
    {
      const lines = [this.pointAt(this.length - 0.15), this.pointAt(this.length - 0.3)];
      lines.forEach((q, i) => {
        const px = -q.dz;
        const pz = q.dx;
        addRibbon(
          drawnStroke(
            new THREE.Vector3(q.x + px * TRACK_HALF_WIDTH, q.y + lift, q.z + pz * TRACK_HALF_WIDTH),
            new THREE.Vector3(q.x - px * TRACK_HALF_WIDTH, q.y + lift, q.z - pz * TRACK_HALF_WIDTH),
            0.012,
            20 + i,
          ),
          false,
          0.45,
          20 + i,
        );
      });
    }

    // Rock: a chalk triangle — a rim and a scribbled inside, both the same
    // stroke as every other chalk line (not a flat white polygon).
    {
      const outline = this.rock.map((v) => new THREE.Vector3(v.x, lift, v.z));
      const mesh = new THREE.Mesh(
        chalkFillGeometry(outline, hw, { pressure: 0.42, seed: 61 }),
        mat,
      );
      mesh.renderOrder = 1;
      this.chalk.add(mesh);
    }

    // Lake: ellipse outline + 45° diagonal hatch.
    {
      const { cx, cz, rx, rz } = this.lake;
      const y = terrainY(cx, cz) + lift;
      const outline: THREE.Vector3[] = [];
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        // Not a perfect ellipse: nobody draws one with a stick.
        const wob = 1 + Math.sin(a * 3.1 + 0.7) * 0.035 + Math.sin(a * 5.7 + 2.2) * 0.022;
        outline.push(
          new THREE.Vector3(cx + rx * Math.cos(a) * wob, y, cz + rz * Math.sin(a) * wob),
        );
      }
      addRibbon(outline, true, 0.4, 31);
      const hatched: [THREE.Vector3, THREE.Vector3][] = [];
      const SQ2 = Math.SQRT1_2;
      for (let c = -(rx + rz); c <= rx + rz; c += 0.45) {
        // Line {p : p·n = c}, n=(1,-1)/√2, along d=(1,1)/√2, clipped to the ellipse.
        const nx = SQ2 * c;
        const nz = -SQ2 * c;
        const A = (SQ2 / rx) ** 2 + (SQ2 / rz) ** 2;
        const B = 2 * ((nx * SQ2) / (rx * rx) - (nz * SQ2) / (rz * rz));
        const C = (nx / rx) ** 2 + (nz / rz) ** 2 - 1;
        const disc = B * B - 4 * A * C;
        if (disc <= 0) continue;
        const t = Math.sqrt(disc);
        for (const sign of [-1, 1]) {
          const tt = (-B + sign * t) / (2 * A);
          hatched.push([
            new THREE.Vector3(cx + nx + SQ2 * tt, y, cz + nz + SQ2 * tt),
            new THREE.Vector3(cx + nx - SQ2 * tt, y, cz + nz - SQ2 * tt),
          ]);
        }
      }
      const mesh = new THREE.Mesh(segmentRibbon(hatched, hw * 0.8, 1 / 6, 0.7, 41), mat);
      mesh.renderOrder = 1;
      this.chalk.add(mesh);
    }

    // Bridge: rectangle outline + diagonals in BOTH directions, on the sidewalk.
    {
      const { x1, x2, z1, z2 } = this.bridge;
      const y = terrainY((x1 + x2) / 2, (z1 + z2) / 2) + lift;
      addRibbon(
        [
          new THREE.Vector3(x1, y, z1),
          new THREE.Vector3(x2, y, z1),
          new THREE.Vector3(x2, y, z2),
          new THREE.Vector3(x1, y, z2),
          new THREE.Vector3(x1, y, z1),
        ],
        false,
        0.3,
      );
      const segs: [THREE.Vector3, THREE.Vector3][] = [];
      for (let c = x1 - z2; c <= x2 - z1; c += 0.4) {
        // line x = z + c, clipped to the rect
        const za = Math.max(z1, x1 - c);
        const zb = Math.min(z2, x2 - c);
        if (za < zb) {
          segs.push([
            new THREE.Vector3(za + c, y, za),
            new THREE.Vector3(zb + c, y, zb),
          ]);
        }
        // line x = -z + c
        const zc = Math.max(z1, c - x2);
        const zd = Math.min(z2, c - x1);
        if (zc < zd) {
          segs.push([
            new THREE.Vector3(c - zc, y, zc),
            new THREE.Vector3(c - zd, y, zd),
          ]);
        }
      }
      const mesh = new THREE.Mesh(segmentRibbon(segs, hw * 0.8, 1 / 6, 0.7, 51), mat);
      mesh.renderOrder = 1;
      this.chalk.add(mesh);
    }
  }

  /** Closest point on the loop; returns arc length s and distance from centerline. */
  progressOf(p: Vec2): { s: number; dist: number } {
    let best = { s: 0, dist: Infinity };
    const n = this.path.length;
    for (let i = 0; i < n; i++) {
      const a = this.path[i];
      const b = this.path[(i + 1) % n];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const len2 = abx * abx + abz * abz || 1;
      let t = ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2;
      t = Math.max(0, Math.min(1, t));
      const cx = a.x + abx * t;
      const cz = a.z + abz * t;
      const d = Math.hypot(p.x - cx, p.z - cz);
      if (d < best.dist) {
        best = { s: this.cum[i] + t * Math.sqrt(len2), dist: d };
      }
    }
    return best;
  }

  /** Point slightly above the surface at arc length s, with travel direction. */
  pointAt(s: number): PathPoint {
    const L = this.length;
    let ss = ((s % L) + L) % L;
    const n = this.path.length;
    for (let i = 0; i < n; i++) {
      const a = this.path[i];
      const b = this.path[(i + 1) % n];
      const segLen = Math.hypot(b.x - a.x, b.z - a.z);
      if (ss <= segLen || i === n - 1) {
        const t = segLen > 0 ? ss / segLen : 0;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        return {
          x,
          y: terrainY(x, z),
          z,
          dx: (b.x - a.x) / segLen,
          dz: (b.z - a.z) / segLen,
          s,
        };
      }
      ss -= segLen;
    }
    // unreachable: loop closes
    const a = this.path[0];
    return { x: a.x, y: 0, z: a.z, dx: 1, dz: 0, s };
  }

  /** A wheel is out only when NO part of it touches the boundary chalk line. */
  isWheelOff(wheel: Vec2, wheelRadius: number): boolean {
    const { dist } = this.progressOf(wheel);
    return dist - wheelRadius > TRACK_HALF_WIDTH + CHALK_WIDTH;
  }

  /** Largest checkpoint arc length strictly behind `s` (start line at 0 counts). */
  checkpointBehind(s: number): number {
    let best = 0;
    for (const cs of this.checkpointS) {
      if (cs <= s - 0.3 && cs > best) best = cs;
    }
    return best;
  }

  /** The checkpoint `count` lines back (2 for the Lake); start line as floor. */
  checkpointsBack(s: number, count: number): number {
    const behind = this.checkpointS.filter((cs) => cs <= s - 0.3).sort((a, b) => a - b);
    if (behind.length === 0) return 0;
    return behind[Math.max(0, behind.length - count)];
  }

  wheelOnRock(wheel: Vec2): boolean {
    return pointInTriangle(wheel, this.rock[0], this.rock[1], this.rock[2]);
  }

  wheelOnLake(wheel: Vec2): boolean {
    const { cx, cz, rx, rz } = this.lake;
    const nx = (wheel.x - cx) / rx;
    const nz = (wheel.z - cz) / rz;
    return nx * nx + nz * nz < 1;
  }

  carOnBridge(pos: Vec2): boolean {
    const b = this.bridge;
    return pos.x > b.x1 && pos.x < b.x2 && pos.z > b.z1 && pos.z < b.z2;
  }
}

function pointInTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const d1 = cross(p, a, b);
  const d2 = cross(p, b, c);
  const d3 = cross(p, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function cross(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}
