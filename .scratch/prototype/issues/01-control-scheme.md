# Which control scheme translates the Push best?

Type: grilling
Status: resolved
Blocked by: (none)

The Push is direction + strength + contact point (which produces spin and
curve Pushes). Which input mappings does the v0 prototype A/B test?

## Answer

Resolved 2026-10-05: more than two schemes will be tested.

- (a) Slingshot-aim — implement and keep permanently as the baseline option
  (also serves to test non-control aspects of the game).
- (b) Direct flick — also to be tried.
- (c) Gyro (tilt-to-aim) — skipped.
- (d) **Push the phone** — the user's main bet: lay the phone on a safe
  surface and physically push it like the Car; motion sensors capture the
  Push. Most unique and most true to the physical game, if implemented well.

Implementation details of (d) tracked in ticket 07. Serving HTTPS to the
phone (sensor APIs need a secure context) tracked in ticket 08.
