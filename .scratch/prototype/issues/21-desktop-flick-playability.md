# 21: Make the flick playable with a mouse (desktop)

Type: task
Status: claimed
Blocked by: (none)

The flick (C) became the default scheme, and the user's first report from the
desktop: **it is really difficult**, and the knuckle visibly misbehaves —
press without moving and it flies away from the pointer, then comes back,
rings for about half a second, and when the pointer moves in small circles it
orbits a few centimetres away "like it is attached with an elastic rope".

Both are defects, not feel. Fixed 2026-11-01 (branch `fix/knuckle-tracking`):

- **The target was never set at touch-down.** `flick.ts` drove the finger at a
  `nextTarget` initialised to the world origin, so every gesture started by
  chasing `(0,0,0)` until a `pointermove` arrived. Guarded in `check:flick`
  ("pressing and holding moves nothing"), which measured 19 cm of departure and
  4.5 mm of bob before the fix. (There was already a guard for it in the tap
  maths — `nextTarget.lengthSq() > 0 ? …` — which patched the symptom of one
  reader and left the finger driving at the origin. That is the lesson: fix the
  state, not each reader of it.)
- **The tracking law was an undamped bang-bang controller.** It asked for the
  velocity that arrives within one step; `maxAccel` refuses that request, and
  what is left overshoots by roughly the distance it came from and rings. Now
  it asks for `min(maxSpeed, √(2·0.7·maxAccel·distance), distance/dt)` — the
  fastest speed it can still brake from. Overshoot went 183 mm → 0.1 mm.

Rules stated by this work, both at the user's request:

- **The knuckle is a hoverboard.** `restrictTranslations(x, false, z)` locks it
  to the gesture plane: no contact, no sweep and no Car may move it up or down.
  Consequence to remember: if the aimed Car climbs a kerb mid-Push, the knuckle
  stays at the height it was summoned at and can miss it.
- **One gesture, one height.** The gesture plane is frozen at touch-down, so the
  Car's own ride height cannot drag it around while the Car is being shoved.

## Open — the user's judgement, not ours

- **`maxSpeed` (new tuning slider, default 30 u/s ≈ 3 m/s).** The cruise cap is
  what keeps a mouse honest: a flick of the wrist asks the knuckle to be metres
  away between two steps, and before this the only thing limiting that was how
  far it had already overshot. 3 m/s is about what a real finger manages, but
  whether desktop wants 10 or 40 is a hands question. Same slider is the answer
  to "flicks launch the Car too far".
- **Strength now follows how fast the pointer is actually moving** (capped),
  where it used to follow √(2·maxAccel·run-up) — the old lag was doing part of
  the limiting. `check:finger` before/after: roll 44/103/71 cm → 28/98/45 cm
  for commanded 0.3/0.6/1.0 m/s, and a centred flick stopped scattering
  sideways (‑14 mm, ‑0.0° → 0 mm, 0.01°). Whether the new mapping reads as
  control on the phone is still the phone's to answer.
