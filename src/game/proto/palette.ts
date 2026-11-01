/**
 * THROWAWAY PROTOTYPE CODE — the visual token layer.
 *
 * Every colour in the game comes from here, so the direction is one table and
 * not a scattering of hex literals. The names are ROLES, not values: when a
 * value changes, the role keeps its name and every consumer keeps working.
 *
 * See `docs/visual-direction.md` for the packet these tokens come from.
 *
 * Working space: sRGB in, sRGB out (the renderer works in linear and tone
 * maps to sRGB). Target: SDR displays, phone-first.
 */

/**
 * Warm near-white. The chalk is the brightest thing in the game and has to
 * stay that way: it is the Boundary, the Checkpoints and the Hazards, and
 * every one of them is game information. The tone curve compresses whites
 * hard, so the mark needs a near-white albedo AND an emissive floor to
 * clear 3:1 against sunlit concrete.
 */
export const CHALK = 0xfffaf0;
/** The dark rim of a chalk mark — the groove shadow that lifts its contrast. */
export const CHALK_GROOVE = 0x3f3a33;

/**
 * The three ground Surfaces, plus the apron beyond the test squares.
 *
 * These are DARKER than a photograph of sunlit concrete, and that is
 * deliberate: the chalk is the game's signature and it has to be the
 * brightest thing on the ground. Measured on the first pass, chalk on this
 * concrete was 1.9:1 — a grey stripe, not chalk. Bringing the ground down
 * and the chalk up takes the Boundary lines past 3:1, which is the minimum
 * for a graphical object that carries game information.
 */
export const GROUND = {
  concrete: 0x615e57,
  asphalt: 0x3e4044,
  tiles: 0x6b6053,
  glass: 0x5d7f92,
  apron: 0x5d5a54,
} as const;

/** Distant ground beyond the play area — desaturated, slightly cooler. */
export const DISTANT_GROUND = 0x6f6d66;

/** Sky: zenith → horizon, and the sun that sits in it. */
export const SKY = {
  zenith: 0x3f74ad,
  upper: 0x86add4,
  horizon: 0xd6dee0,
  haze: 0xd6dee0,
  sunCore: 0xfff6de,
  sunGlow: 0xffe3a8,
} as const;

/** Light rig: one warm sun, a cool sky bounce, a dim cool fill. */
export const LIGHT = {
  sun: 0xfff5e4,
  sky: 0x9ec4e8,
  bounce: 0x8a8275,
  fill: 0xa8c4de,
} as const;

/** The UI is a slate with chalk on it — the game's own material. */
export const UI = {
  slate: 0x16191d,
  slateRaised: 0x22262b,
  chalk: 0xf2efe4,
  chalkDim: 0xa8a69d,
  accent: 0xe4b657,
  danger: 0xe0654f,
} as const;

/** Car paint, tuned as a SET: same value band, so all three read as toys. */
export const PAINT = {
  red: 0xd6493c,
  blue: 0x2f63c8,
  green: 0x3aa35c,
} as const;

/** The dark bed under a coloured chalk ring, so it reads on any Surface. */
export const RING_BED = 0x2a2724;

/** Car sub-materials: rubber, glass, hub metal, lamps. */
export const CAR = {
  rubber: 0x1a1a1d,
  // Tinted, not black. At 0x243038 the glasshouse read as a black frame
  // bolted to the roof; a toy car's glass is a dark blue-grey that catches
  // the sky.
  glass: 0x374b59,
  hub: 0xb9bcc0,
  headlight: 0xfff3d8,
  taillight: 0xb8322a,
  underside: 0x24262a,
} as const;

/**
 * The ground Surfaces, as the HUD reads them (a swatch and a word).
 * Kept here so the readout can never drift from the paint.
 */
export const SURFACE_SWATCH = {
  asphalt: 0x55585c,
  concrete: 0x999489,
  tiles: 0xc2a87e,
  glass: 0x9cc2d6,
} as const;
