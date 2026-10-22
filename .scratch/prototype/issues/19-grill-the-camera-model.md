# 19: Grill the camera model (small)

Type: grilling
Status: resolved
Blocked by: (none)

The camera needs its own home, but it does **not** need a big grilling
session yet. Keep this ticket small on purpose: the user wants to play with
free controls first and decide later.

## What changed
The early decision "fixed near-top view, slightly angled" is **void — the user
does not care about it.** Early user testing showed **everyone expects zoom,
rotate and pan**, including the user. So the camera becomes **controllable**,
with a birdseye default.

Already settled elsewhere (do not re-ask):

- Default framing is birdseye and **follows the aimed Car** (`follow: 5`, height
  ~5.2, back ~1.8).
- The first manual gesture **turns follow off**; Recentre turns it back on.
  (Otherwise follow fights the pan and drags the view back within a second.)
- Zoom and rotate survive manual mode — they are offsets you do not want reset
  by pushing a Car.
- **Recentre = snap back to the default birdseye framing over the selected Car**
  and re-enable follow. Nothing else: there is only one selection concept
  (touch, GUI selector, camera and HUD move together), so "recenter on the last
  pushed Car" and "recenter on the selected Car" are the same thing.
- Scheme-specific behaviour survives: **push-the-phone (B) still wants its
  top-down-behind-the-Car camera** in ticket 13. A (slingshot) and C (flick)
  share the default birdseye.
- **One finger belongs to the game; two fingers belong to the camera** — pinch
  = zoom, twist = rotate, two-finger drag = pan. That rule lives in ticket 18
  because it defines the flick gesture, not here.

## Answer (what shipped)

- **Two fingers belong to the camera, one finger to the game.** Pinch = zoom,
  twist = rotate, two-finger drag = pan. Enforced in `camera.ts`, and guarded
  headlessly in `check:flick`: when the camera claims a second finger, whatever
  Push gesture thought it owned the canvas is cancelled, and afterwards one
  finger still Pushes.
- **Following is a MODE, not a property**: the camera follows the aimed Car
  until the first two-finger touch, then stays put. Recentre (GUI button)
  restores it and resets zoom/rotation.
- **Recentre targets the SELECTED Car**, which is also the last Car pushed,
  since selection follows whatever you push. That answered the old question
  "recentre where?" — it needed no new concept.
- Zoom limits are deliberately wide (0.4x–2.5x): at the far end the whole Track
  loop is visible. Whether being able to see everything changes how the game
  reads is one of the questions left for playing.

## Bugs the first phone test found (2026-10-20)

- **The camera did nothing but stop following.** It told the game to let go by
  posting a `pointercancel` to the canvas — and then its OWN listener heard that
  same event, deleted both fingers, and ended the gesture before it began. So
  the visible effect was exactly "following stopped, camera frozen". Cancelling
  must be a CALL to the layer that owns the gesture (`setupSlingshot` and
  `setupFlick` now return a cancel handle), never a broadcast message: a module
  that posts to everyone has to remember it is one of the listeners.
- **Recentre was in the wrong place**: buried in the GUI, unusable mid-play. It
  is now a button on the main HUD beside Next Turn. Camera control is part of
  play, not set-up.
- **The headless check had the same blind spot**: it asserted "stopped following
  and Pushed nothing" instead of "the camera moved", so it went green while the
  feature was dead. It now drives a real pinch and demands that zoom AND camera
  position change. Worth carrying generally: assert the effect you wanted, not
  whatever side effects came free with it.

## Second round of phone feedback (2026-10-20)

- **Rotation was backwards.** it spun the map against the fingers. Now the MAP
  follows the fingers, as maps apps do (`yaw += dAngle`). An "invert rotation"
  switch exists so getting this wrong is one click, not one round trip.
- **Tilt is now controllable** — two fingers were already twist+pan+pinch, so a
  third finger drags tilt: down lowers the camera toward the horizon, up stands
  it back overhead. Internally two distances became ONE distance plus ONE angle
  off vertical, which is what made tilt expressible at all. Default reproduces
  the previous framing exactly (19.1 deg off vertical).
- Wiring it up also answered one of the ticket's open questions by doing it: yes,
  you can see the whole Track at max zoom out. Whether that changes how the game
  reads is still open, and is a playing question rather than a building one.

## Knuckle visibility (ticket 18 side-quest, same reason)

The flick can draw the finger: **wire** (see through it to the Car) or **solid**.
Default off, in the Flick folder as "show the knuckle". It exists so questions
like "why does catching the side turn it easily but a rear-corner flick not much"
can be answered by LOOKING at contact rather than reasoning about it. Drawn from
the body's own pose, and it dies with the gesture like everything else does.

## Open questions (still small, still for after testing)

- Recentre at all, or is it noise once panning works? (currently "yes, but not
  sure")
- How far may it zoom **out** — ever see the whole Track, and does that break
  reading a strike point?
- May heading rotate freely past 360°, or snap back?
- Should different schemes seed different defaults?
- Should the finger/car markers resize or reposition when zoomed out?

## Done when

The user has played with free controls on the phone and answers the questions
above; the answers land here under `## Answer

Resolved by building it (2026-10-20) rather than grilling further — the user's
line was that more camera decisions could wait until free controls had been
played with, so the conclusions below are what shipped and are open to revision.`.
