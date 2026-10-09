# 12: Multiple Cars in the prototype

Type: task
Status: resolved
Blocked by: None (can start immediately)

## What to build

Put **more than one Car on the Track at the same time**, and find out what
happens at 1:64 when tiny bodies meet.

The prototype has only ever simulated one Car. The real game is multiplayer,
and every piece of solver trouble so far has appeared exactly where small
bodies interact at rest: v1's four jointed wheels ratcheted into vibration and
creep until the Car became one compound rigid body. Nothing tells us that two
of those compound bodies resting against each other behave any better — and if
they do not, that changes what multiplayer can be. This is a question to answer
by building, not by arguing.

- Spawn several Cars in the prototype (at minimum two), each independently
  Pushable, each still subject to the rules that exist today
- Cars collide with **plain physics** — pushing another Car is legal, which is
  the default rule from the grilling sessions
- Whatever enables/is enabled by several Cars existing: picking which Car you
  are about to Push, seeing whose Car is whose, Turn/Push counting surviving
  across more than one Car if the modes ask for it
- Each Car settles to rest honestly next to another Car, touching

Non-goal: networking, AI opponents, scoring, car-to-car penalty rules, a second
control scheme. The one question: **do several Cars behave?**

## Acceptance criteria

- [x] Two Cars can be placed on the Track, visible and distinguishable, and
      both rest stably side by side without jitter or creep
- [x] Pushing one Car into another transfers motion plausibly and both Cars
      come to rest — no vibration, no launching, no sinking, no endless rolling
      at the settled timestep (1/240, 8 solver iterations)
- [x] A Car resting against another can be Pushed away (initial contact does
      not lock it)
- [x] The player can Pushes a chosen Car, and it is unambiguous which Car is
      being aimed at
- [x] Push counting (3-Push Turn in Lap Challenge) still behaves with more than
      one Car in play
- [x] Frame pacing holds on the target phone with several Cars live
      (physics measured headless: 0.16 ms/frame for three Cars vs 0.13 ms for
      one, of a 16.6 ms frame. Still wants a confirming run on the phone,
      since it now also draws a selection ring + HUD per frame)
- [x] Findings recorded here under `## Answer`, especially anything that needs
      a change to the single-body Car model — that is the real output

## Answer

**Several Cars DO behave — but only after a fix the single-Car prototype never
needed. Building this ticket found a real bug in the single-body Car model.**

How the question was answered: not by eyeballing three Cars on a phone, but by
running the real `Car`, the real world settings (1/240, 8 iterations) and the
real strike rule **headlessly** and measuring:

```
node scripts/headless-check.mjs src/game/proto/checks/multi-car.ts
```

Six checks, all passing (see below for the numbers). Also verified end-to-end in
a real browser: three Cars visible in separate screen regions (pixel readback),
touch-to-select switching the aimed Car, and one Push moving Red 11.6 cm while
shoving its neighbour Blue 8.8 cm from the contact — both then at rest.

### What was built

- **Three Cars on the grid**, per the user's call: `STARTING_GRID` in
  `car.ts` — Red and Blue are the *same* Car up to the paint (`{...preset,
  color}`), Green differs in mass (0.8 → 2.4), wheel radius (0.06 → 0.1) and
  grip (roll 0.03/0.06, side 0.35/0.55, angular damping 0.2/0.45). Two abreast
  and nearly touching, the odd one out 1.1 units ahead.
- **Cars only saw the environment before** — the collision filter was
  `ENV_GROUP` only, so two Cars would have passed through each other. Filter is
  now `ENV_GROUP | CAR_GROUP`. Car-to-car contact stays frictionless with
  Rapier (all Car colliders are friction 0, combine rule Min, same as before);
  nothing about that needed changing — plain pushing works.
- **Aimed Car** = the Car you *touch*: one raycast over all Cars on
  pointer-down picks it, then the whole aim overlay belongs to it. No separate
  "select" step that could disagree with where the finger landed. A ring on the
  ground marks it, the HUD shows its name with a colour swatch, the camera
  follows it, and the tuning panel retargets to it — **one** selection concept,
  so the GUI can never be editing a Car you are not pushing.
- **Turn belongs to the Car's owner.** Each Car carries its own rules state
  (Pushes left, lap timer, track progress). Verified on the page: Blue 3→2,
  pick Red → 3, back to Blue → still 2. Rules apply to every Car whether or not
  you are looking at it (so a Car you shoved out still resets itself).
- **GUI got the selector the user asked for**: `Tune Car` (`#1 Red` / `#2 Blue`
  / `#3 Green (heavy)`) at the top, everything below it binding to the selected
  Car — params folder rebuilt on selection, Surface presets renamed "Surface
  (this Car)", Presets renamed "Preset (this Car)" and kept the paint (colour is
  how you tell Cars apart). Save schema bumped to `version: 2` — one set of
  params per Car now; old single-Car saves are ignored for the Cars but still
  restore Push/camera tuning.

### The finding: several Cars did NOT settle (and why)

The first honest run failed. A three-Car chain left the struck Car in a frame
locked limit cycle — angular velocity flipping sign **every frame**, ±0.44 rad/s
forever, creeping backwards ~0.5 mm/s, `atRest()` never true. Note what that
means in play: the rules refuse a Push until the Car is at rest, so **that Car
could never be Pushed again.** One Car was never affected, which is why it was
never seen in single-Car play.

Root cause, in `Car.applyWheelFriction` (feel pass 2's hand-rolled tyre model).
Fixing item 1 exposed item 2, which exposed item 3 — each had to be found by
measuring, not by reasoning about it:

1. **All eight impulses were computed from one stale velocity reading.** The
   four wheels are one rigid body, so every impulse changes the velocity the
   next one must be measured against. Aimed at the same pre-impulse velocity,
   they delivered several times the correction needed and FLIPPED the residual
   instead of killing it. Fix: read velocity fresh inside the relaxation loop.
2. **The Coulomb cap was per impulse, not per frame.** So each extra relaxation
   sweep spent the grip budget again: the same strike rolled 149 cm on one
   sweep, 28 cm on six. Fix: one **frame budget** (μ·m·G·dt per direction)
   shared by the four wheels, spent sweep by sweep. A side effect is honest — a
   locking wheel can now take more than its quarter share, the way a real
   contact does.
3. Fresh reads alone left an **order bias**: one Gauss-Seidel pass over the four
   wheels turned a dead-centre Push into an 8°/667 mm systematic curve. That is
   invented behaviour (the same sin `curveFactor` was removed for — see map
   notes, 2026-10-08). Fix: **4 alternating sweeps** (forward, backward, …),
   which is what makes a symmetric input produce a symmetric result.

Measured before/after, one Car, rear-centre strike (`impulseScale`-equivalent
2/4/6/8):

| | roll distance | sideways drift | turn |
|---|---|---|---|
| before (stale + per-impulse cap) | 149.0 cm @8 | 0.0 mm | 0.0° |
| after (fresh, frame budget, 4 sweeps) | 149.0 cm @8 | 0.7 mm | 0.0° |

**Straight-line feel is unchanged to 3 significant figures** — the fix removes
chatter, it does not re-tune anything (verified, not assumed: roll decel still
== μ·G). What did change is that nothing is hidden any more: any residual spin
now decays honestly instead of being round-tripped by the ratchet. Worth a
re-feel on the phone anyway, per the rule that the user owns the numbers.

Regression guarded forever after: check 6 asserts a centre strike stays within
2° and 20 mm of straight, while a rear-corner strike turns >15° (measured 68.6°
— the curve Push is intact, and it is the strike point that decides it, nothing
else).

### Headless numbers (2026-10-09)

```
two Cars resting side by side:      drift 0.00 mm over 6 s, max |v| 0.0000, max per-frame move 0.0000 mm
push into another Car:              both settle in 0.82 s, highest point 0.095 vs ride height 0.094 (no launch), tilt 0°
Car resting against another:        Pushed apart 10.3 / 8.3 cm, both at rest
three-Car chain (different Cars):   all transfer, all settle, highest point 0.135 == ride height (no launch, no sink)
frame cost:                         1 Car 0.130 ms — 3 Cars 0.162 ms per frame (physics only)
centre vs corner strike:            centre 0.01°, corner 68.6°
```

### Open (small)

- The phone should confirm frame pacing and that three Cars plus the ring read
  clearly at arm's length.
- Green's different roll/side friction sits *on the Car*, but grip is a property
  of the contact (Tire × Surface) per ADR-0002 — this is deliberately parked
  until ticket 14 moves grip off `CarParams`.
- Nothing here explores the penalise variant of car-to-car contact; that rule is
  still fog.
