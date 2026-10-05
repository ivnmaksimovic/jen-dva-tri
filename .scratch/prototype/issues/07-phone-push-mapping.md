# Push-the-phone: how exactly does phone motion become a Push?

Type: grilling
Status: resolved
Blocked by: (none)

The user's main-bet control scheme: lay the phone on a safe surface, push it
like you'd push the Car, sensors capture the Push.

## Answer

Resolved 2026-10-05: all five accepted, with a camera clarification on (1):

1. Screen shows the fixed top-down game view while pushing — **and in this
   mode the camera must rotate to look top-down from behind the Car, so the
   phone's heading is aligned with the Car on screen** — pushing "forward"
   on the table reads as forward on screen. Natural mapping.
2. Phone's local frame = Car's local frame (rear-edge strike → forward
   lurch; side strike → sideways roll).
3. `rotationRate` around the phone's vertical axis during the strike →
   torque → curve Push.
4. One strike = one impulse; the phone's own sliding displacement is
   ignored; return phone to a comfortable spot between Pushes.
5. Sensitivity/calibration tuned in Sandbox.

Refinement (2026-10-05, before build started): a legal phone-push is a
strike/drive of bounded duration (~300 ms, tunable) — continuously "driving"
the Car is illegal. The Push is therefore sampled and integrated over the
gesture window (direction may change inside it — "forward for a bit, then
turn"), not read as a single instantaneous value. Curve Push falls out of
this naturally. Consequence for architecture: the input layer must record a
short sensor time-series per gesture, not fire one impulse from one sample.
Curve Push in slingshot mode is hard — deferred (at least for slingshot v1).

Camera note: this behind-the-car alignment is specific to push-the-phone. In
slingshot mode it is NOT needed or preferred — the Car seen in varying
orientations is fine there (you push backwards/diagonally anyway).
