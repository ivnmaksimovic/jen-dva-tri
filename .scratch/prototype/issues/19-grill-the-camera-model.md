# 19: Grill the camera model (small)

Type: grilling
Status: open
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

## Open questions (small set, for after some testing)

- Recentre at all, or is it noise once panning works? (currently "yes, but not
  sure")
- How far may it zoom **out** — ever see the whole Track, and does that break
  reading a strike point?
- May heading rotate freely past 360°, or snap back?
- Should different schemes seed different defaults?
- Should the finger/car markers resize or reposition when zoomed out?

## Done when

The user has played with free controls on the phone and answers the questions
above; the answers land here under `## Answer`.
