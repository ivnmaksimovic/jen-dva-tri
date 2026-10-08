# 01: Controls verdict — pick the Push scheme

Type: task
Status: ready-for-human
Blocked by: prototype ticket 11 (`.scratch/prototype/issues/11-build-push-the-phone.md`), and the user's own feel tuning of the slingshot model

## What to build

Nothing — this ticket produces a **decision**, not code. The v0 prototype
exists to answer one question: which control scheme feels like pushing a 1:64
Car with a finger? Both schemes (slingshot-aim, push-the-phone) must be
playable on the user's real phone, toggled live, and then the user calls it.

Everything in v1 downstream of the input layer reads this decision, which is
why it is ticket 01 and not an afterthought.

## Acceptance criteria

- [ ] Both schemes are playable on the target Android phone over HTTPS and can
      be toggled live without a reload
- [ ] The user has pushed a Car with each scheme for at least one full session
      on real Terrain, not on a desktop approximation
- [ ] The winner is recorded here under `## Answer`, with one line on *why*
      (feel, precision, discoverability, or "neither — flick instead")
- [ ] The losing scheme's fate is recorded: kept as a second option, or dropped
- [ ] If the answer is "neither", a follow-up grilling ticket is opened for
      the flick scheme (`.scratch/prototype/issues/01-control-scheme.md`)
- [ ] `.scratch/v1/spec.md` is marked active (rename `spec.md` → keep, add
      `map.md` wayfinding entry) — until this lands, the prototype owns the
      frontier
