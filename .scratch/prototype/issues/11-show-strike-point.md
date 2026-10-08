# 11: Show where the strike lands

Type: task
Status: resolved
Blocked by: None (can start immediately)

## What to build

Make it **visible where the Push will land on the Car.** Today the aim arrow
starts at the contact point on the Car's frame, but the arrow's origin sits
inside/through the middle of the 4.5 cm body, so the thing you are aiming — the
exact spot your finger will strike — is hidden by the Car itself. The Onc thing
that must be legible during aiming is currently the thing you cannot see.

The strike point already exists and is already meaningful: it is clamped to the
Car's outer frame (a finger strikes the frame, never the middle), and its
offset from the centre is what becomes the curve Push. It just needs to read.

Small, self-contained, no physics change.

Non-goal: changing where the point clamps to, changing the curve Push mapping,
restyling the rest of the HUD.

## Acceptance criteria

- [x] On aim, the exact strike point is unambiguously visible from the usual
      play camera — not occluded by the Car body, even at oblique angles
- [x] The visible point moves to exactly where the strike will be applied, and
      no longer reads as starting from the middle of the Car
- [x] Aiming still shows direction and strength clearly at the same time (the
      point is a new read, not a replacement for the arrow)
- [ ] Readable on the target phone outdoors — **open, yours to close:** verified
      on desktop only (see Answer → how it was measured)
- [x] No change to the Push itself: identical aim produces identical motion
      before and after

## Answer

Built 2026-10-08 in `src/game/proto/slingshot.ts` — visuals only, no physics
change and no new dependency.

**What reads now (all in the overlay pass, drawn over the Car):**

- **Strike bullseye** (`THREE.Sprite`, canvas texture: dark rim, white ring,
  dark centre pip): `depthTest: false`, `depthWrite: false`, `renderOrder` 20.
  ~1.3 cm across on a 4.5 cm Car, world-sized so it stays put when the camera
  pulls back. Present from **touch-down**, before any drag, so you can see
  where you caught the frame and lift/re-strike instead of committing blind.
- **Aim arrow** now shares the same treatment (`transparent` + depth off,
  `renderOrder` 10) and **starts at the strike point**, so the gesture reads as
  one thing instead of growing out of the middle of the body.

**Structural guarantee for "no change to the Push":** one function,
`strikePoint()`, computes the point the impulse lands at; the marker is drawn
at its result and `applyImpulseAtPoint` receives its result. They cannot drift
apart.

**Superseded 2026-10-08:** at your call this originally returned the
*effective* point (the frame strike pulled toward the centre by
`curveFactor`), so the marker doubled as a readout for that knob.
`curveFactor` has since been REMOVED — it was authored torque pretending to
be physics, and it forced exceptions everywhere downstream (see ticket 15).
`strikePoint()` now returns the frame contact itself, which is what the marker
has always shown to be honest. Everything above still holds; the
`curveFactor: 0.5` measurement below is the only part that no longer applies. It re-evaluates every frame
while aiming, since a Car parked on a slope can creep mid-drag.

No GUI controls added (hardcoded size/colour) per your call.

**How it was verified (desktop, `gl.readPixels` — no picture-trust required):**

- Car parked at yaw 0 so its local −Z frame edge is the far edge — the one the
  roof hides from this camera. Same picture *before* aiming: that pixel is car
  bodywork `[70,106,171]`. While aiming: `[20,20,20]`, the bullseye pip.
- Marker pixel box 26×26 device px (≈13 css px, matches the 0.13 world-unit
  size); centroid sits 9.2 css px above the Car centre = exactly the far frame
  edge (half-width 0.1 units at that camera).
- Impulse interception: exactly one Push-scale impulse, applied at offset
  `(0, 0, −0.1)` — the far edge at Car-centre height. Its screen projection
  `(168.00, 309.56)` vs the visible marker centroid `(167.74, 309.83)`: within
  antialiasing noise of identical.
- `curveFactor: 0.5`: marker centroid moves to y 314.5 vs predicted halfway
  point 314.27 (centre 319.0, frame edge 309.6) — follows the effective point.
- Arrow dragged back across the body: 228 pure-white arrow pixels land on
  pixels that were Car bodywork before; previously that shaft was eaten by the
  Car. After `pointercancel` the region is pixel-identical to baseline (0
  changed pixels) — the overlay hides cleanly on release.

**Open (not for an agent):** the outdoor phone pass. Watch specifically for
(a) whether 1.3 cm reads against sunlit concrete — if not, raise
`MARKER_SIZE` in `slingshot.ts`; (b) whether the dark rim is enough to keep it
looking *seated on the frame* rather than floating. Option (b) from the design
round — a marker hovering above the roof, with depth left honest — is still
unbuilt and is the fallback if the through-the-Car draw reads oddly in play.

## Comments

None beyond the build above.
