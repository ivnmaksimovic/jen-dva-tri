import * as THREE from 'three';
import { chalkTexture } from './textures.js';

/**
 * THROWAWAY PROTOTYPE CODE — chalk as a thing a hand made.
 *
 * The old chalk was `LineBasicMaterial`: ONE PIXEL wide at every zoom, pure
 * white, mathematically smooth. It read as vector art, not as chalk, and it
 * was the single reason the screen looked like a wireframe rather than a
 * playground.
 *
 * Three things make a mark read as chalk:
 *
 *  1. **Width, in the world.** A chalk line for this game is a centimetre
 *     across at 1:1, so it is a BAND on the ground, and it stays that band
 *     however far you zoom. (Ticket 20 got the width; this gets the rest.)
 *  2. **Grain and skips.** The stick deposits unevenly: there are dusty
 *     patches, thin spots, and places where it lifted. That lives in the
 *     texture, so it survives at any zoom instead of being a fixed pixel
 *     pattern.
 *  3. **A hand is not a machine.** The line wobbles. A low-frequency
 *     perturbation of the centreline, and a width that breathes with the
 *     pressure of the hand, turn a mathematically perfect path into a drawn
 *     one. The wobble is small enough (1.5 mm real) that it cannot disagree
 *     with the rules — the rules read the SAME path.
 *
 * The stroke is ONE width end to end. It used to taper off at both ends the
 * way a stick lifts off the ground, and every open mark came out thin at the
 * tips; on these marks that reads as a rendering effect rather than as chalk
 * (see change 44 in `docs/visual-direction.md`). The width still breathes
 * along the stroke — that is what keeps it from looking extruded — but it
 * does not thin at the ends.
 *
 * Implementation: a ribbon (a triangle strip) laid on the ground, with UVs
 * that run 0..1 across the width and 0..N along the length in world units,
 * so one chalk texture tile is a fixed length of chalk and the grain never
 * stretches.
 */

const texture = chalkTexture();

/** One material for every chalk mark in the game. */
let material: THREE.MeshStandardMaterial | null = null;

/**
 * The chalk material.
 *
 * `MeshStandardMaterial`, not `MeshBasicMaterial`: chalk in the shadow of a
 * car should be duller than chalk in the sun, and the mark should receive the
 * car's shadow. The emissive floor keeps it legible when it IS in shadow —
 * chalk on concrete is a bright mark, and the Boundary lines are gameplay.
 */
export function chalkMaterial(): THREE.MeshStandardMaterial {
  if (material) return material;
  material = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    roughness: 0.94,
    metalness: 0,
    emissive: new THREE.Color(0xf6f1e2),
    emissiveIntensity: 1.05,
    emissiveMap: texture,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -8,
    side: THREE.DoubleSide,
  });
  return material;
}

/** How far the chalk sits off the ground, world units (1.2 mm real). */
export const CHALK_LIFT = 0.012;

export interface RibbonOptions {
  /** Half-width of the band, world units (0.025 = 5 mm real band). */
  halfWidth: number;
  /** Closed loop? */
  closed?: boolean;
  /**
   * How much the width SWELLS along the mark (0 = a perfectly even band).
   *
   * This is the one thing the texture cannot do. The chalk texture carries
   * the ragged edge, the powder grain and the holes — high-frequency detail,
   * which tiles invisibly — but a stroke's slow swell happens over tens of
   * centimetres, and a texture that repeats every 10 cm cannot hold it
   * without the repeat showing. So the swell lives here, in world space,
   * where it does not tile at all.
   *
   * Keep this LOW. The texture is doing the fine work; this is only the
   * slow breath of the hand.
   */
  pressure?: number;
  /**
   * UV repeats per world unit along the mark.
   *
   * One tile covers 1/uvPerUnit world units — 60 cm at the default of 1/6.
   * That number is a QUALITY dial, not a technical one: the chalk texture's
   * features are sized in world millimetres by this, and the default framing
   * puts 266 screen pixels on a world unit. At one tile per 10 cm a texel
   * was 0.4 mm — ONE pixel — and every bit of the chalk's structure was
   * finer than the screen could show, so it had to be zoomed into to be seen
   * at all. At one tile per 60 cm the same texture's features are six times
   * bigger in the world and roughly three pixels each, which is where the
   * eye can actually read them.
   */
  uvPerUnit?: number;
  /**
   * Where in the texture this mark starts (in tiles).
   *
   * Used when several marks are meant to read as one scribbled area: without
   * it every stroke begins at the same point in the grain and the tile's
   * features line up across them into a comb.
   */
  uvShift?: number;
  /** Seed, so two marks on the same path are not the same mark. */
  seed?: number;
}

/** Deterministic 0..1 from one integer and a seed — a real hash, not a sine. */
function hash1(i: number, seed: number): number {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(seed | 0, 668265263)) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** Smooth 1D value noise in 0..1. */
function noise1(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash1(i, seed);
  const b = hash1(i + 1, seed);
  return a + (b - a) * u;
}

/** Two octaves of it, still smooth — a pressure that drifts, not a wobble. */
function fbm1(x: number, seed: number): number {
  return noise1(x, seed) * 0.66 + noise1(x * 2.7 + 11.3, seed + 1) * 0.34;
}

/**
 * Build a ribbon along a polyline.
 *
 * The polyline is resampled so the texture's along-length coordinate stays
 * even (a long segment and a short one must not get the same amount of
 * grain), and the WIDTH swells slowly the way a hand's pressure does.
 *
 * The FINE imperfection — the ragged edge, the powder, the holes — is in the
 * texture, where surface detail belongs. What is here is only the slow
 * breath of the stroke, because that is the part a tiling texture cannot
 * hold without the repeat showing.
 */
export function ribbonGeometry(
  points: THREE.Vector3[],
  options: RibbonOptions,
): THREE.BufferGeometry {
  const {
    halfWidth,
    closed = false,
    pressure = 0.35,
    uvPerUnit = 1 / 6,
    uvShift = 0,
    seed = 0,
  } = options;
  const n = points.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  // Distance travelled, for even grain and even UVs. A CLOSED loop includes
  // its closing segment, or the last stretch of every closed mark collapses
  // onto the final point.
  const segCount = closed ? n : n - 1;
  const dist: number[] = [0];
  for (let i = 1; i <= segCount; i++) {
    dist.push(dist[i - 1] + points[i % n].distanceTo(points[(i - 1) % n]));
  }
  const total = dist[segCount];

  // Resample at a fixed step so long segments do not get less grain.
  const STEP = 0.06; // 6 mm real
  const count = Math.max(2, Math.ceil(total / STEP) + 1);
  const samples: { p: THREE.Vector3; t: THREE.Vector3; s: number }[] = [];
  let seg = 0;
  // A closed loop EXCLUDES the duplicated end point: the wrap-around quad is
  // built from the last sample back to the first, so a repeated endpoint
  // would make one degenerate (zero-area) quad at the seam.
  const sMax = closed ? (total * (count - 1)) / count : total;
  for (let k = 0; k < count; k++) {
    const s = (k / (count - 1)) * sMax;
    while (seg < segCount - 1 && dist[seg + 1] < s) seg++;
    const a = points[seg % n];
    const b = points[(seg + 1) % n];
    const segLen = Math.max(1e-6, dist[seg + 1] - dist[seg]);
    const t = Math.min(1, Math.max(0, (s - dist[seg]) / segLen));
    const p = a.clone().lerp(b, t);
    const dir = b.clone().sub(a).setY(0).normalize();
    samples.push({ p, t: dir, s });
  }

  for (let k = 0; k < samples.length; k++) {
    const { p, t, s } = samples[k];
    // Left normal of travel.
    const nx = -t.z;
    const nz = t.x;

    // The hand's pressure: a slow drift in WORLD space, plus a few changes
    // along the stroke itself so a short mark is not exempt from it. This
    // is the SLOW swell only — the ragged edge is in the texture.
    const drift = fbm1(s * 0.26 + seed * 3.1, seed + 1) - 0.5;
    const along = fbm1((total > 0 ? s / total : 0) * 3.4 + seed * 1.7, seed + 2) - 0.5;
    // One width, end to end: no taper. The pressure drift above is the only
    // thing that changes the width along the mark.
    // Clamped only so the mark can never pinch shut — it is still a band.
    const width = Math.max(0.5, 1 + pressure * (drift * 0.95 + along * 0.75));

    const w = halfWidth * width;

    positions.push(p.x + nx * w, p.y, p.z + nz * w);
    normals.push(0, 1, 0);
    uvs.push(0, s * uvPerUnit + uvShift);

    positions.push(p.x + nx * -w, p.y, p.z + nz * -w);
    normals.push(0, 1, 0);
    uvs.push(1, s * uvPerUnit + uvShift);
  }

  const pairs = closed ? samples.length : samples.length - 1;
  for (let k = 0; k < pairs; k++) {
    const i0 = k * 2;
    const i1 = i0 + 1;
    const i2 = ((k + 1) % samples.length) * 2;
    const i3 = i2 + 1;
    indices.push(i0, i2, i1, i1, i2, i3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

/**
 * A hand-drawn wobble, applied to a 2D path.
 *
 * A low-frequency perturbation of the centreline: the mark wanders by about
 * a millimetre and a half, which is what a stick on rough concrete does. The
 * amplitude is deliberately tiny — the rules measure against the SAME path,
 * and a mark that disagreed with the rules by more than the chalk's own
 * width would be a bug, not a texture.
 */
export function wobblePath<T extends { x: number; z: number }>(
  points: T[],
  amplitude = 0.015,
  frequency = 0.35,
): T[] {
  return points.map((p, i) => {
    const s = i * frequency;
    const dx = Math.sin(s * 1.7) * 0.6 + Math.sin(s * 0.53 + 1.3) * 0.4;
    const dz = Math.cos(s * 1.3 + 0.7) * 0.6 + Math.cos(s * 0.41 + 2.1) * 0.4;
    // Direction of travel at this point, so the wobble is ACROSS the mark.
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    const nx = -tz / len;
    const nz = tx / len;
    return { ...p, x: p.x + nx * dx * amplitude, z: p.z + nz * dz * amplitude };
  });
}

/**
 * A chalk mark made of segments (the Lake's hatching, the Bridge's
 * diagonals) — one mesh for all of them, so the hatching costs one draw
 * call rather than forty.
 */
export function segmentRibbon(
  segments: [THREE.Vector3, THREE.Vector3][],
  halfWidth: number,
  uvPerUnit = 1 / 6,
  pressure = 0.6,
  seed = 0,
): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  segments.forEach(([a, b], i) => {
    const len = a.distanceTo(b);
    if (len < 1e-4) return;
    const steps = Math.max(2, Math.ceil(len / 0.06));
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= steps; k++) {
      pts.push(a.clone().lerp(b, k / steps));
    }
    geos.push(
      ribbonGeometry(pts, {
        halfWidth,
        uvPerUnit,
        pressure,
        uvShift: hash1(i, seed + 5) * 8,
        seed: seed * 31 + i,
      }),
    );
  });
  if (geos.length === 0) return new THREE.BufferGeometry();
  // Merge by hand: the geometries are small and this avoids an extra import.
  return mergeSimple(geos);
}

/** Merge position/normal/uv geometries that share an index layout. */
function mergeSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vCount = 0;
  let iCount = 0;
  for (const g of geos) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : 0;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of geos) {
    const p = g.attributes.position.array as ArrayLike<number>;
    const n = g.attributes.normal.array as ArrayLike<number>;
    const t = g.attributes.uv.array as ArrayLike<number>;
    pos.set(p, vo * 3);
    nor.set(n, vo * 3);
    uv.set(t, vo * 2);
    const gi = g.index!.array as ArrayLike<number>;
    for (let k = 0; k < gi.length; k++) idx[io + k] = gi[k] + vo;
    vo += g.attributes.position.count;
    io += gi.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/**
 * A FILLED chalk shape (the Rock): a rim stroke around a scribbled interior,
 * and the interior is made of the SAME strokes the rim is.
 *
 * The old fill was a triangle fan with UVs invented for it — 0.5 plus 0.2 ×
 * the distance from the centroid, which put one texture tile across five
 * units of ground. That is a 15 mm texel where a line gets 0.25 mm, so while
 * a line showed its powder the triangle showed the texture's ragged EDGES
 * smeared over decimetres. Same material, a different material to the eye.
 *
 * Better UVs cannot fix it, because of what this texture IS: across its
 * width, `u` means "how far from the edge of the stroke you are". That is a
 * band's question, and a filled area cannot answer it — map it across an
 * area and you get stripes, one band's worth of edge and core repeated.
 *
 * So the area is built out of bands: scan lines at `spacing`, drawn by the
 * same `ribbonGeometry`, at the same `halfWidth` and `uvPerUnit`. The fill is
 * then literally the line, and the rim covers where the strokes were cut off
 * at the boundary. Which is also how a triangle actually gets filled in
 * chalk: you scribble it in.
 */
export function chalkFillGeometry(
  outline: THREE.Vector3[],
  halfWidth: number,
  options: {
    /** Distance between scan lines. Below `2 × halfWidth` the bands overlap. */
    spacing?: number;
    /** How far each scan line wanders, world units. Default: a third of the band. */
    wobble?: number;
    uvPerUnit?: number;
    pressure?: number;
    seed?: number;
  } = {},
): THREE.BufferGeometry {
  const n = outline.length;
  if (n < 3) return new THREE.BufferGeometry();
  const {
    spacing = halfWidth * 1.4,
    wobble = halfWidth / 3,
    uvPerUnit = 1 / 6,
    pressure = 0.35,
    seed = 0,
  } = options;

  // Chalk is drawn at ONE height for the whole shape: a fill crossing a
  // height step would draw half of it buried and half of it floating.
  let y = 0;
  for (const p of outline) y += p.y;
  y /= n;

  const geos: THREE.BufferGeometry[] = [];

  // The rim first: it bounds the shape with the same stroke a Boundary line
  // is made of, and the scan lines' cut ends hide underneath it.
  geos.push(
    ribbonGeometry(outline.map((p) => new THREE.Vector3(p.x, y, p.z)), {
      halfWidth,
      closed: true,
      pressure,
      uvPerUnit,
      seed,
    }),
  );

  // Scan lines. One crossing per edge, half-open, so a vertex shared by two
  // edges is not counted twice.
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const p of outline) {
    zMin = Math.min(zMin, p.z);
    zMax = Math.max(zMax, p.z);
  }
  const rows = Math.max(1, Math.ceil((zMax - zMin) / spacing));
  for (let r = 1; r < rows; r++) {
    const z = zMin + ((zMax - zMin) * r) / rows;
    const xs: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % n];
      if ((a.z <= z && b.z > z) || (b.z <= z && a.z > z)) {
        xs.push(a.x + ((b.x - a.x) * (z - a.z)) / (b.z - a.z));
      }
    }
    xs.sort((u, v) => u - v);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const len = xs[k + 1] - xs[k];
      // A sliver shorter than the band already lies inside the rim.
      if (len < halfWidth * 1.2) continue;
      const steps = Math.max(2, Math.ceil(len / 0.06));
      const straight: { x: number; z: number }[] = [];
      for (let i = 0; i <= steps; i++) {
        straight.push({ x: xs[k] + (len * i) / steps, z });
      }
      // The same wobble every other hand-drawn path gets, so a scan line is
      // not a raster line.
      const drawn = wobblePath(straight, wobble, 0.35).map(
        (p) => new THREE.Vector3(p.x, y, p.z),
      );
      geos.push(
        ribbonGeometry(drawn, {
          halfWidth,
          pressure,
          uvPerUnit,
          // Each stroke starts somewhere else in the grain, or the tile's
          // features line up across the rows into a comb.
          uvShift: hash1(r * 31 + k, seed + 7) * 8,
          seed: seed * 13 + r * 7 + k,
        }),
      );
    }
  }

  if (geos.length === 0) return new THREE.BufferGeometry();
  return mergeSimple(geos);
}
