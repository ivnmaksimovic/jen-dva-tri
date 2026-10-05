# Build the push-the-phone control scheme (v0)

Type: task
Status: open
Blocked by: (none)

The next agent task for the v0 prototype. The design was fully grilled and
settled in ticket 07 — read it first. Build it as a second control scheme
next to the slingshot (same throwaway module, `src/game/proto/`),
toggleable, so the two schemes can be A/B compared on a real phone.

## Gate (read before starting)

The current phase is USER feel-tuning of the slingshot model (Surfaces,
car params — on the user's phone). Physics feel params are the user's
tuning domain; agents do not adjust them by feel. Check with the user
before and while working this ticket — their feedback may produce feel
fixes that should land first.

## Build sketch (details in ticket 07)

- `DeviceMotionEvent` listener (secure context required — the dev server
  is already HTTPS via basic-ssl, so sensors work on the phone)
- Gesture window ~300 ms (tunable): integrate acceleration/rotationRate
  over the window — the direction may change within it (that IS the curve
  Push); this is a gesture recorder, not a single-sample spike detector
- Phone local axes = Car local axes (no absolute table calibration);
  `rotationRate` around the phone's vertical axis → torque
- Camera in this mode: top-down **behind the Car** (phone heading aligned
  with the Car, per the user's clarification); slingshot mode keeps the
  current fixed-heading camera
- Toggle in the GUI/HUD next to the slingshot scheme
- Surface friction etc. applies unchanged — the Push is just another way
  to deliver an impulse

## Done when

- Both schemes playable on the phone, toggled live, and the user can say
  which feels better on real hardware.
