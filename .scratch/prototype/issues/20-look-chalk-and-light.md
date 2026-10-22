# 20: Make it look like the thing it is — chalk on real ground, in daylight

Type: task
Status: resolved
Blocked by: (none) — chosen by the agent while the user slept (2026-10-22).

The user's brief: "we are working on making this game great… it does not look
great compared to awesome 3D mobile games; that could be your theme, or choose
something completely different." Chosen theme: the LOOK, because the game's whole
identity is a folk game drawn in chalk on real concrete outdoors, and because it
is the cheapest of the big wins to carry into v1 even though this code is
throwaway.

## Assumptions I made (all revisable; none were asked for)

1. **Chalk must have WIDTH.** It was drawn with `LineBasicMaterial`, which is one
   pixel wide however close you zoom — a hairline, not chalk. Real chalk for this
   scale is a band roughly a centimetre across. This is the single change most
   likely to make the screen read as "a track drawn on the ground".
2. **Lighting needs tone mapping and something to reflect.** There was a sun and
   a hemisphere light but no tone mapping (so highlights clip flat) and no
   environment map (so metalness and the glass Surface have nothing to reflect
   and read as grey plastic). Both are standard, cheap, and renderer-level.
3. **Fog has to follow the camera.** Fog was fixed at 40–90 world units, fine at
   the default framing but once zoom-out was opened to x60 (ticket 19) the whole
   world sits beyond `far` when you zoom out — i.e. the Track fades to nothing
   exactly when you zoom out to look at it.
4. **Nothing may be unmeasurable.** The README warns about mobile draw calls, so
   every change here is either O(1) in draw calls or reported by `check:look`.
5. The user owns the numbers. Every knob (exposure, chalk width, how strong the
   reflections are, whether shadows exist) is in the GUI, and the defaults are
   deliberately CONSERVATIVE because I cannot see the result on a phone.

## What survived vs what is decoration

- Survives to v1 regardless of code: chalk has width in world units and a nominal
  centimetre scale; index of refraction-ish look comes from an environment, not
  from hand-tuned colours; tone mapping belongs on the renderer, not in every
  material; fog must be relative to the camera when the camera is free.
- Throwaway: this file's wiring, the GUI folder, the module layout.

## Measured (`pnpm check:look`, new)

36 drawable objects, 18 distinct materials, all 13 chalk pieces sharing one
material — a phone-sized budget, and now guarded so it cannot creep silently.

## Known risks, stated rather than hidden

- I cannot see the screen. Chalk width and exposure are guesses sized from the
  world scale (1 unit = 10 cm); expect to retune them by eye.
- The environment map is built by PMREM at startup, which needs a real WebGL
  renderer — so unlike everything else here it is NOT covered by a headless
  check. If it misbehaves on the device, `environment` to 0 in the Look folder
  turns it off.
- Environment map costs one-time PMREM work and a little memory; it is one draw
  call's worth of nothing thereafter, but it is a real cost on old phones, hence
  the toggle.
- `Line2`/`LineMaterial` need `resolution` updated on resize or the lines are
  wrong on some GPUs. Handled in `look.ts`, which owns the resize hook.
