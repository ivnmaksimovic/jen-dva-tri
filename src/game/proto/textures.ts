import * as THREE from 'three';
import { CHALK, CHALK_GROOVE, GROUND, SKY } from './palette.js';

/**
 * THROWAWAY PROTOTYPE CODE — procedural textures.
 *
 * Everything here is generated into a `DataTexture`: no canvas, no DOM, no
 * image files. Two reasons, and both matter:
 *
 *  1. **The textures have to be the right SIZE.** The old ground textures were
 *     256px spread over an 80-unit slab, so one pixel covered 3 mm of
 *     concrete and the "speckle" was sub-pixel — the ground rendered as a flat
 *     colour field. A DataTexture lets the texel density be chosen in real
 *     millimetres, and the geometry's UVs scaled to match (see `worldUV`).
 *  2. **It has to run in the headless checks.** `pnpm check:look` builds the
 *     whole world in Node, where `document` is a stub. No canvas, no problem.
 *
 * Everything is deterministic: the same noise seed every run, so the ground
 * does not shimmer between reloads.
 */

/* ------------------------------------------------------------------ noise -- */

/**
 * A 32-bit integer hash, 0..1.
 *
 * The usual `Math.sin(i * 127.1 + j * 311.7)` trick is fine for a shader
 * but CORRELATES at the indices this code uses. Multiplied up (as it is for
 * per-texel noise), adjacent texels land about 0.16 of a cycle apart, so
 * "white" noise developed a beat every six or seven texels — and that beat
 * showed up as horizontal BANDS running along every chalk line, and as a
 * regular comb in the ground textures.
 *
 * A hash has to actually hash. This is xorshift-multiply: three integer
 * rounds, no trigonometry, no correlation.
 */
export function hash2(i: number, j: number): number {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263)) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** Bilinear value noise. */
function valueNoise(x: number, y: number, periodY = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const wrap = (j: number): number => (periodY > 0 ? ((j % periodY) + periodY) % periodY : j);
  const a = hash2(xi, wrap(yi));
  const b = hash2(xi + 1, wrap(yi));
  const c = hash2(xi, wrap(yi + 1));
  const d = hash2(xi + 1, wrap(yi + 1));
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal noise in 0..1. `periodY` keeps it tileable along the texture's V. */
function fbm(x: number, y: number, octaves: number, periodY = 0, gain = 0.5): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(fx, fy, periodY);
    norm += amp;
    amp *= gain;
    fx *= 2;
    fy *= 2;
  }
  return sum / norm;
}

/* --------------------------------------------------------------- helpers -- */

function makeTexture(
  width: number,
  height: number,
  fill: (u: number, v: number, i: number) => [number, number, number, number],
  { srgb = true, repeat = 1, aniso = 8 }: { srgb?: boolean; repeat?: number; aniso?: number } = {},
): THREE.DataTexture {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fill(x / width, y / height, y * width + x);
      const i = (y * width + x) * 4;
      data[i] = r * 255;
      data[i + 1] = g * 255;
      data[i + 2] = b * 255;
      data[i + 3] = a * 255;
    }
  }
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = aniso;
  // Mipmaps matter here: without them the ground aliases into a shimmering
  // mess as soon as the camera pulls back, and the far ground reads as
  // noise rather than as distance.
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Linear blend between two 0xRRGGBB colours. */
function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** Scale a colour's brightness (0 = black, 1 = unchanged). */
function shade(hex: number, k: number): number {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * k));
  const b = Math.min(255, Math.round((hex & 255) * k));
  return (r << 16) | (g << 8) | b;
}

/* ----------------------------------------------------------------- chalk -- */

/**
 * THE hero texture: a chalk mark.
 *
 * Across the width (U): a ragged edge that WANDERS ALONG THE MARK, then a
 * feathered rim, then the dark groove, then the packed-powder core.
 * Along the length (V): the grain of the powder, and the places where the
 * stick lifted and left nothing.
 *
 * The imperfection lives HERE, in the texture, because that is where surface
 * detail belongs — and because a texture's detail is what the eye reads as
 * "a material" rather than "a shape with a pattern on it". The geometry's
 * job is only the slow swell of the stroke, which a tiling texture cannot
 * do (see `chalk.ts`).
 *
 * The first version of this texture had a perfectly smooth edge and grain at
 * 2% — measured on the rendered frame, not guessed — and the result read as
 * a printed stripe with a texture laid over it. The edge is what the eye
 * actually notices: a chalk mark's edge is bitten and ragged, and each side
 * is bitten differently, because the stick was held at an angle and not held
 * still.
 */
export function chalkTexture(): THREE.DataTexture {
  // **The chalk texture is ANISOTROPIC on purpose.**
  //
  // The chalk mark is a thin band — about 7 mm — that runs for metres. On
  // screen, at the default framing, that band is roughly 26 pixels across
  // and thousands of pixels long. A square texture mapped onto it is
  // therefore minified about twenty times ACROSS the band (which blurs the
  // edge into mush) while it is magnified along it.
  //
  // So: 64 texels across the band (about 1:1 on screen — the edge stays
  // crisp) and 1024 texels along it (plenty of grain). The two axes then
  // carry different amounts of detail, which is correct: across a 7 mm band
  // there is very little to see, and along a metre of mark there is a great
  // deal.
  const W = 32;
  const H = 2048;
  // One repeat covers 60 cm of mark (see `uvPerUnit` in chalk.ts).
  //
  // The two axes are sized so that a texel is about the SAME physical size
  // in both: 32 across the 7 mm band is 0.22 mm, and 2048 along 600 mm is
  // 0.29 mm. That is the whole trick, and it took a complaint to see it: with
  // mismatched texels, per-texel noise is not static — it is thin STRINGS
  // running along the line, because the noise only changes every 0.6 mm
  // along it and every 0.1 mm across it.
  //
  // Matched, it is the "TV no signal" the mark wants to be.
  //
  // At one repeat per 10 cm a texel was 0.4 mm, i.e. ONE pixel, and every
  // bit of the chalk's structure was finer than the screen could show.
  //
  // **A noise lattice finer than about four texels shows as a COMB.** The
  // value noise interpolates linearly between lattice points, so at two or
  // three texels per cell the interpolation itself becomes a visible
  // triangle wave. So the rule here is:
  //
  //   - anything SMOOTH uses cells of eight texels or more, two octaves;
  //   - anything FINE is per-texel white noise, which has no lattice to
  //     show.
  const WANDER = 86; // cells along the mark, for the edge's slow wander
  const CLUMP = 60; // ...for the powder's clumps
  return makeTexture(W, H, (u, v) => {
    const tx = Math.floor(u * W);
    const ty = Math.floor(v * H);

    // --- The edge of the mark ------------------------------------------
    // A slow wander (the hand drifting) plus a per-texel tooth (the stick's
    // own roughness). Each side wanders on its own: the stick was held at
    // an angle, and it was not held still.
    const wanderL = (fbm(3.1, v * WANDER, 2, WANDER) - 0.5) * 0.07;
    const wanderR = (fbm(71.3, v * WANDER, 2, WANDER) - 0.5) * 0.07;
    const toothL = (hash2(ty * 13 + 3, 7) - 0.5) * 0.07;
    const toothR = (hash2(ty * 13 + 91, 53) - 0.5) * 0.07;
    const l = Math.max(0, 0.04 + wanderL + toothL);
    const r = Math.min(0.96, 0.96 - wanderR - toothR);
    if (u <= l || u >= r) return [0, 0, 0, 0];

    // Position across the mark: 0 at the ragged edge, 1 in the core.
    const t = (u - l) / (r - l);
    const e = Math.min(t, 1 - t) * 2;

    // --- The powder ------------------------------------------------------
    // Clumps (smooth) mixed with per-texel speckle (the finest grain).
    // `spread` pushes the distribution out to its extremes, which is what
    // turns a faint tint into visible grain.
    const clump = fbm(11.3 + u * 2, v * CLUMP, 2, CLUMP);
    const speck = hash2(tx * 5 + 17, ty * 3 + 29);
    const dust = spread(clump * 0.62 + speck * 0.38, 2.1);

    // --- Where the stick lifted -----------------------------------------
    // Soft-edged, because a lifted stick leaves a feathered edge rather than
    // a cut. The OLD formula fired on 0.8% of the mark, which is to say it
    // never fired at all — and the next one had its threshold sitting ON the
    // mean of the distribution, which punched out HALF the mark in 4 mm
    // dashes and turned the chalk into a dotted line.
    //
    // So: the threshold goes ABOVE the mean, and only the bottom tail
    // thins out. The mark stays SOLID, because a chalk line is opaque and a
    // translucent one loses its contrast against the ground.
    const cover = 0.62 + 0.3 * clump + 0.18 * dust;
    const hole = smoothstep(0.7, 0.82, cover);

    // The edge feathers out over a band whose WIDTH varies, so the powder
    // ends unevenly instead of along a ruler.
    const feather = 0.1 + 0.14 * fbm(23.9, v * 40, 2, 40);
    const soft = smoothstep(0, feather, e);
    // The groove rim sits just inside the edge, and it is narrow: a wide
    // rim eats the mark and turns it into a dark stripe.
    const rim = 1 - smoothstep(0, 0.16, e);

    const body = soft * hole * (0.9 + 0.1 * dust);
    // The COLOUR carries the grain, not the alpha: chalk is warm white, but
    // not evenly warm white, and darkening the colour keeps the mark's
    // peak brightness — and therefore its contrast against the ground —
    // exactly where it was.
    const powder = mix(CHALK, 0xb8b2a1, (1 - dust) * 0.62);
    const rgb = mix(powder, CHALK_GROOVE, rim * 0.85);
    const a = body * (0.88 + 0.12 * smoothstep(0.12, 0.6, e));
    return [
      ((rgb >> 16) & 255) / 255,
      ((rgb >> 8) & 255) / 255,
      (rgb & 255) / 255,
      a,
    ];
  });
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a || 1)));
  return t * t * (3 - 2 * t);
}

/**
 * Push a noise's distribution out to use the full 0..1 range.
 *
 * fbm is smooth, so its output bunches around the middle and the extremes
 * are rare. For a chalk mark that is wrong: the grain has to REACH the
 * extremes, or the mark comes out as a flat band with a faint texture over
 * it. This is the difference between "there is noise in here" and "this is
 * a material".
 */
function spread(v: number, k: number): number {
  return Math.max(0, Math.min(1, (v - 0.5) * k + 0.5));
}

/* ---------------------------------------------------------------- ground -- */

/**
 * Concrete: warm grey paving with aggregate, a slow patchy wear pattern and
 * SCORE JOINTS — the dark lines a concrete slab is cut into. The joints are
 * the single most valuable detail here: they give the ground a scale (you can
 * read "eighty centimetres"), a direction, and the sense that the cars are
 * tiny. Without them the ground is an infinite grey plane and the cars look
 * like they are the size of the world.
 *
 * One texture tile covers 8 world units (80 cm), so the joints land every
 * 80 cm — about nine car-lengths, which is about right for a patio slab.
 */
export function concreteTexture(): THREE.DataTexture {
  const SIZE = 512;
  const base = GROUND.concrete;
  // A NARROW value range. The first version spread the concrete from 0.72×
  // to 1.16× of its base, and when magnified on the phone that read as
  // CLOUDS on a wet floor rather than as concrete.
  const dark = shade(base, 0.84);
  const light = shade(base, 1.08);
  return makeTexture(SIZE, SIZE, (u, v) => {
    const aggregate = fbm(u * 110, (v * 110) % 32, 2, 32);
    const patch = fbm(u * 5, (v * 5) % 5, 4, 5);
    const stain = fbm(u * 13 + 40, (v * 13) % 13, 3, 13);
    // The patchiness is gentle. At full strength the concrete looked like a
    // wet, mouldy floor; worn paving has a fine even tooth and only a
    // whisper of larger variation.
    let c = mix(dark, light, 0.3 + patch * 0.14 + aggregate * 0.56);
    // Damp patches: a little darker and cooler.
    c = mix(c, shade(base, 0.88), smoothstep(0.72, 0.97, stain) * 0.22);

    // The score joint: a narrow groove at the tile edge, wandering a little
    // the way a real cut does. It is a CUT, not a line of paint — a few
    // millimetres wide and only a little darker than the concrete. (The
    // first version was 13 mm wide and nearly black, which turned the
    // ground into a bathroom floor.)
    const jx = Math.min(u, 1 - u);
    const jy = Math.min(v, 1 - v);
    const wander = (fbm(u * 7, (v * 7) % 7, 2, 7) - 0.5) * 0.005;
    const edge = Math.min(jx + wander, jy + wander);
    const groove = 1 - smoothstep(0.0012, 0.0035, edge);
    c = mix(c, shade(base, 0.7), groove * 0.72);
    // Dust and grit collecting in the groove.
    c = mix(c, shade(base, 0.82), groove * fbm(u * 40, (v * 40) % 40, 2, 40) * 0.5);

    const rgb = c;
    return [((rgb >> 16) & 255) / 255, ((rgb >> 8) & 255) / 255, (rgb & 255) / 255, 1];
  });
}

/**
 * The roughness map for concrete: the worn patches are smoother than the
 * aggregate, so the sun picks them out. This is what stops the ground from
 * reading as painted cardboard.
 */
export function concreteRoughness(): THREE.DataTexture {
  const SIZE = 256;
  return makeTexture(
    SIZE,
    SIZE,
    (u, v) => {
      const wear = fbm(u * 5, (v * 5) % 5, 4, 5);
      const grit = fbm(u * 60, (v * 60) % 60, 2, 60);
      const r = 0.72 + 0.26 * grit - 0.3 * wear;
      return [r, r, r, 1];
    },
    { srgb: false },
  );
}

/** Asphalt: coarse chip, darker, with lighter worn tracks. */
export function asphaltTexture(): THREE.DataTexture {
  const SIZE = 256;
  const base = GROUND.asphalt;
  const chip = shade(base, 1.24);
  const dark = shade(base, 0.86);
  return makeTexture(SIZE, SIZE, (u, v) => {
    const grit = fbm(u * 90, (v * 90) % 45, 2, 45);
    const wear = fbm(u * 4, (v * 4) % 4, 4, 4);
    let c = mix(dark, base, grit * 0.85 + 0.15);
    // Exposed aggregate: sparse bright chips, NOT stars. At the first pass
    // these were near-white and read as noise on a night sky.
    c = mix(c, chip, smoothstep(0.82, 0.97, grit) * 0.34);
    // Worn strips where feet have polished it.
    c = mix(c, shade(base, 1.14), smoothstep(0.58, 0.95, wear) * 0.4);
    const rgb = c;
    return [((rgb >> 16) & 255) / 255, ((rgb >> 8) & 255) / 255, (rgb & 255) / 255, 1];
  });
}

/** Paving tiles: ochre slabs, grout lines, per-slab tonal variation, chips. */
export function tilesTexture(): THREE.DataTexture {
  const SIZE = 256;
  const base = GROUND.tiles;
  const grout = shade(base, 0.68);
  const light = shade(base, 1.08);
  const dark = shade(base, 0.9);
  const SLABS = 2; // slabs per texture tile (a tile covers 4 units = 40 cm)
  return makeTexture(SIZE, SIZE, (u, v) => {
    const gx = u * SLABS;
    const gy = v * SLABS;
    const fx = gx - Math.floor(gx);
    const fy = gy - Math.floor(gy);
    // Grout: a narrow band at every slab edge — a joint, not a border. The
    // first version was wide and dark and the paving read as a bathroom.
    const edge = Math.min(fx, 1 - fx, fy, 1 - fy);
    const joint = 1 - smoothstep(0.005, 0.016, edge);
    // Per-slab tone: each tile was a different batch, and weather got to
    // them differently.
    const slabTone = hash2(Math.floor(gx) + 17, Math.floor(gy) + 43);
    const grain = fbm(u * 80, (v * 80) % 80, 2, 80);
    let c = mix(dark, light, slabTone * 0.6 + grain * 0.4);
    c = mix(c, grout, joint * 0.6);
    // Chipped corners: a little of the darker body under the joint.
    const chip = fbm(u * 22, (v * 22) % 22, 3, 22);
    c = mix(c, grout, smoothstep(0.86, 0.99, chip) * joint * 0.5);
    const rgb = c;
    return [((rgb >> 16) & 255) / 255, ((rgb >> 8) & 255) / 255, (rgb & 255) / 255, 1];
  });
}

/**
 * Glass: a FRAMED pane, not a mirror.
 *
 * A flat glass sheet seen from above under an open sky is just the sky —
 * it disappeared into the background completely. Real glass in the world
 * (a patio roof, a skylight, a greenhouse) is framed: the frame is what
 * you actually SEE, and it is what tells the player this Surface is glass
 * rather than a hole in the world.
 */
export function glassTexture(): THREE.DataTexture {
  const SIZE = 256;
  const base = GROUND.glass;
  const frame = 0x3d474b;
  const PANES = 2; // panes per texture tile (a tile covers 4 units = 40 cm)
  return makeTexture(SIZE, SIZE, (u, v) => {
    const gx = u * PANES;
    const gy = v * PANES;
    const fx = gx - Math.floor(gx);
    const fy = gy - Math.floor(gy);
    const edge = Math.min(fx, 1 - fx, fy, 1 - fy);
    // The frame: a 12 mm bar around every pane.
    const bar = 1 - smoothstep(0.012, 0.03, edge);
    // The pane: cool, with a slow smear of reflected sky and a little dust.
    const smear = fbm(u * 7, (v * 7) % 7, 3, 7);
    const dust = fbm(u * 40, (v * 40) % 40, 2, 40);
    let c = mix(shade(base, 0.82), shade(base, 1.08), smear);
    c = mix(c, shade(base, 0.95), dust * 0.18);
    c = mix(c, frame, bar);
    const rgb = c;
    return [((rgb >> 16) & 255) / 255, ((rgb >> 8) & 255) / 255, (rgb & 255) / 255, 1];
  });
}

/* ------------------------------------------------------------------- sky -- */

/**
 * The sky, as an equirectangular strip: zenith at the top, horizon in the
 * middle, ground bounce below. The sun is baked in, so the sky and the
 * directional light agree by construction.
 *
 * This replaces a flat `scene.background` colour, which was the reason the
 * horizon read as a razor line: the fog and the background were the same
 * colour everywhere, so the ground ran into a flat wall.
 */
export function skyTexture(): THREE.DataTexture {
  // 512 × 256: the dome is 180° tall and a 128-row strip quantised the
  // smooth gradient into visible horizontal BANDS across the sky.
  const W = 512;
  const H = 256;
  const data = new Uint8Array(W * H * 4);
  // The sun's direction, matching the directional light in `look.ts`.
  const sunAz = Math.atan2(9, 20); // azimuth around Y, from +X
  const sunEl = Math.atan2(24, Math.hypot(20, 9)); // elevation
  for (let y = 0; y < H; y++) {
    // A DataTexture's first row is the BOTTOM in GL terms (flipY is false),
    // so the rows are written upside down on purpose: row 0 is the nadir and
    // the last row is the zenith. Written the other way round, the sky came
    // out with its blue zenith BELOW the horizon — which is why the first
    // version looked like a flat pale sheet with no gradient in it.
    const v = 1 - y / (H - 1);
    // v: 0 = zenith, 0.5 = horizon, 1 = nadir
    const el = (0.5 - v) * Math.PI; // radians, +up
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1);
      const az = u * Math.PI * 2;
      let rgb: number;
      if (el >= 0) {
        const t = Math.pow(Math.min(1, el / (Math.PI / 2)), 0.75);
        // Pale at the horizon, light blue, then the deep zenith. No blue
        // BAND just above the horizon — the first version had one, and it
        // drew a hard blue line across the sky exactly where the ground
        // meets it. The blue starts close to the horizon, because a player
        // looking at a track never sees the zenith.
        rgb = mix(SKY.horizon, SKY.upper, smoothstep(0, 0.2, t));
        rgb = mix(rgb, SKY.zenith, smoothstep(0.16, 0.85, t));
      } else {
        rgb = mix(SKY.horizon, 0x5f5d55, Math.min(1, -el / (Math.PI / 2)));
      }
      // The sun: a small bright core inside a broad glow.
      const d = angularDistance(az, el, sunAz, sunEl);
      const glow = Math.exp(-(d * d) / 0.06);
      const core = Math.exp(-(d * d) / 0.0018);
      rgb = mix(rgb, SKY.sunGlow, Math.min(1, glow * 0.85));
      rgb = mix(rgb, SKY.sunCore, Math.min(1, core));
      // Break up the banding an 8-bit gradient always shows.
      const dither = (hash2(x * 7, y * 13) - 0.5) * (3 / 255);
      const i = (y * W + x) * 4;
      data[i] = Math.max(0, Math.min(255, (((rgb >> 16) & 255) / 255 + dither) * 255));
      data[i + 1] = Math.max(0, Math.min(255, (((rgb >> 8) & 255) / 255 + dither) * 255));
      data[i + 2] = Math.max(0, Math.min(255, ((rgb & 255) / 255 + dither) * 255));
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Angle between two directions on the sphere, in radians. */
function angularDistance(az1: number, el1: number, az2: number, el2: number): number {
  const dot =
    Math.cos(el1) * Math.cos(el2) * Math.cos(az1 - az2) + Math.sin(el1) * Math.sin(el2);
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

/* ---------------------------------------------------------------- shadow -- */

/**
 * A soft contact shadow: the dark smudge under a toy car. A shadow map at
 * this scale cannot resolve a 4.5 cm car (the shadow camera has to cover
 * 30 m of ground), so this decal is what actually grounds the car.
 */
export function contactShadowTexture(): THREE.DataTexture {
  const SIZE = 128;
  return makeTexture(SIZE, SIZE, (u, v) => {
    const dx = (u - 0.5) * 2;
    const dy = (v - 0.5) * 2;
    const r = Math.min(1, Math.hypot(dx, dy));
    const a = Math.pow(1 - r, 2.1);
    return [0, 0, 0, a * 0.62];
  });
}
