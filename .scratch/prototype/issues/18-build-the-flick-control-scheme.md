# 18: Build the flick control scheme (option C)

Type: task
Status: open
Blocked by: (none)

The third control scheme for the v0 prototype, next to the slingshot (A) and
push-the-phone (B, ticket 13). Same throwaway module (`src/game/proto/`), same
rules, toggleable live so all three can be compared on a real phone.

**Design fully grilled 2026-10-19 (6 rounds) — do not re-grill, do build.**
C is the favourite to become the default mode in v1; tickets 18 and 19 record
what was settled for it.

## Gate (read before starting)

- Physics feel numbers are the **user's** tuning domain (Surfaces, tires, any
  strength multiplier). Do not tune by feel; expose and hand over.
- The camera also changed underneath this work — see ticket 19. If 19 is still
  open, do not invent camera behaviour: implement only the **conflict rule**
  below and leave the rest alone.
- Ordering against ticket 13 (push-the-phone) is the **user's call** — this
  ticket is unblocked and may be built either first or second. Ask if it
  matters for the current session.

## The gesture

One continuous sweep. Touch down anywhere → move → a Push happens **if and only
if** the finger reaches the aimed Car.

- Touching **down on the Car does nothing** — no Push, no selection change.
  (Same reason the slingshot requires entering from outside.)
- **One gesture = one Push.**
- **Selection is tap-only** (plus the GUI selector). A flick never changes it,
  and a flick that passes over other Cars never touches them.
- Extra fingers landing mid-sweep are **ignored**; the first pointer owns the
  gesture until it lifts. Keep tracking past the screen edge (pointer capture),
  so a flick that leaves the glass still counts.
- Gesture state belongs to the gesture and dies with it — see the map's
  2026-10-11 note (a stale drag once fired a phantom Push in the slingshot).

## The Push is a real contact, not a computed impulse

This is the decision that makes C different. Rather than deriving an impulse
from the swipe, we give the finger a **body in the world** for the duration of
the gesture and let the solver resolve the strike.

- **A kinematic cuboid** (`RigidBodyDesc.kinematicPositionBased` +
  `setNextKinematicTranslation`), driven by the touch position projected onto
  the ground plane, at chassis centre height. Shape is one **horizontal
  cuboid** = the middle knuckle of a bent index finger; all three half-extents
  **runtime-tunable** — we do not know the right dimensions yet.
- Its **collision group is filtered so only the aimed Car sees it** (same trick
  as `surfacePads()`: a ghost to everything else). "The finger hits whatever it
  touches" is a later knob — arguably right for multiplayer — but it must be a
  choice, not a default.
- **No passing through.** The finger's advance is clamped at the contacted
  surface (max penetration ~1–2 mm, tunable), so it stops where a real finger
  would and only follows as the Car leaves. Without the clamp, an infinite-mass
  body shoves the Car along the whole path — driving, not striking — and the
  strike point stops meaning anything.
- Infinite effective mass is **deliberate and honest**: the user's finger really
  is almost infinitely massive next to a 1:64 Car. The clamp is what keeps that
  from being exploitable, not a mass fudge.
- Orientation: the knuckle's face stays **perpendicular to the finger's current
  velocity, recomputed continuously** — the user says the knuckle spins, so
  corner-first hits are real. Implementation detail (mine): at near-zero speed
  the velocity direction is noise, so hold the last good heading until the
  sweep has a direction.

## Legality, riding, and the window

- A legal Push is a **bounded strike** (~300 ms, tunable — one shared number
  with scheme B, same meaning). The clock starts at the **first solver contact
  between finger and Car**, which we get for free now that the finger is a
  body: no separate footprint test to keep in sync.
- **Overrunning the window is not auto-corrected.** The finger keeps delivering
  force, because in the real game nothing stops you either — other players
  shout at you. We only **measure it and show it**: contact time on the HUD /
  debug line, flagged when past the window. **No penalty in the prototype** —
  what riding costs is a v1 rules question (penalise mode is still parked).
- The multi-impulse / sustained-force variant ("slow, change direction, then
  accelerate, all inside the window") **falls out of contact for free** — that
  is why we are building the collider instead of tuning impulse curves. Do not
  write the "impulses per window" machinery: there isn't one.

## Feedback

- **Strike point stays visible ~2 s after contact**, fading or replaced by the
  next Push — this is **normal player feedback, not debug-only**. With no
  aiming pause, it is the only thing that teaches where you actually hit.
- The synthetic **aim arrow stays behind the debug toggle**, as it is in the
  slingshot: it is instrumentation, not comprehension.
- Reuse `clampToFrame` / `pushesFrom` thinking where it still applies (a strike
  lands on the outer frame, never the middle; must be entering). With real
  contact these mostly stop being code and become physics.

## Camera

Shares the slingshot's default birdseye (**ticket 19 owns the camera model**).
Only the conflict rule belongs here:

> **One finger belongs to the game; two fingers belong to the camera.**

Testers expect pinch-zoom and rotate (ticket 19 exists because of that).

## Build order (suggested)

1. **`check:finger` headless spike first.** Same harness as `check:cars`
   (`scripts/headless-check.mjs`): sweep a synthetic kinematic cuboid through
   the real parked Car at three speeds, print roll distance, contact count and
   peak penetration. Confirms a driven body behaves at 1:64 before any real
   thumb touches it. At 1 m/s the finger crosses the 4.5 cm Car in ~45 ms ≈ 11
   physics steps at 1/240 s, so there is room for contact to resolve — but
   measure it.
2. Wire the touch gesture into `src/game/proto/`, reusable `Finger` body,
   filtered to the aimed Car only.
3. Contact clamping + touch following.
4. The window clock (from first contact) and the "illegal riding" readout — the
   number on screen, no enforcement.
5. Strike-point feedback (2 s), then the live toggle next to A (and B when 13
   lands).
6. Extend `pnpm check:gesture` so it drives the flick too: **a tap selects and
   does not Push**, a flick pushes once, a flick that misses does not spend a
   Push. The slingshot already lost a bug this way — make it impossible to come
   back.

## Done when

- C is playable on the phone alongside A, toggled live, and pushing with it
  reads as striking a Car rather than dragging it.
- `check:finger` and the extended `check:gesture` are green, i.e. no phantom
  Pushes from taps, one Push per gesture, including when the finger runs off
  the screen edge.
- The user can tune it: gesture window, cuboid half-extents, max penetration,
  strength scaling if any — all exposed, none tuned by an agent.

## What the headless spike found (`check:finger`, 2026-10-19 — step 1 done)

The check runs the REAL Car, the REAL world and a synthetic swipe, and prints
roll distance, contact steps, deepest penetration and where the impulse landed.
Read it before touching the numbers: `pnpm check:finger` (add `JDT_TRACE=1` for
a per-step trace of one strike).

**Mechanics work, and cost nothing.** Transfer rises with how fast the finger
actually ARRIVES: 2.5 / 8.1 / 24.8 u/s → 27 / 109 / 374 cm rolled, against
today's slingshot impulse of 2/4/6 → 10 / 39 / 86 cm. Nothing launches (hop
under 2 mm), every Car settles afterwards, and a driven finger costs 0.19 ms per
frame against 0.12 ms without one. **No prior fixing known needed.**

**Why the finger is a SERVO, not a kinematic body — measured, not assumed.**
`src/game/proto/finger.ts` keeps both. The kinematic version (infinite mass,
hard stop at the surface) does not strike: with nothing to pay it follows the
Car along the whole follow-through, dragging it 3 m and a metre sideways with
it. The servo — a dynamic body of bounded mass (`massFactor`, default 5× the
aimed Car) and bounded acceleration (`maxAccel`, default 30 m/s²) chasing the
touch point — loses ground when it hits something, so a flick pays out momentum
and stops while a slow sweep keeps pressing. That difference IS riding, and it
comes out of the model rather than being enforced.

**Two things it pays to know before tuning anything:**

- **Arrival speed is the strength, not swipe speed.** The finger starts at rest
  and is cap-limited, so √(2·maxAccel·run-up) decides how fast it actually
  lands: over 6 cm of run-up it could not exceed 12.4 u/s whatever the swipe.
  `maxAccel` is the strength knob (`massFactor` barely moves it: 2/5/20 × the
  Car → takeoff 12.8/14.2/15.2). Both are the user's numbers.
- Side fact worth carrying, unrelated to this ticket: **today's model already
  explodes at impulse 16** (the Car ends at y = -5 170 m). Found while building
  a reference table; nothing here depends on it, but high-energy strikes are not
  safe territory in the existing Car either.

**OPEN — the heading is a knife-edge.** A dead-centre flick leaves anywhere from
+2° to -18° depending on the run-up, deterministically (the same inputs give the
same answer every time) and independent of how wide the knuckle is (0.4–2.4 cm
tested). The linear transfer is solid; the ANGULAR one is not. Whether this is
"real scatter, like a finger on a 1:64 Car" or "too random to aim with" is a
USER judgement, and it is the first thing to look at next — candidates to test:
letting the fingertip be compliant (bigger `maxPenetration`, contact skin),
stiffening the servo sideways, or deciding the scatter is part of the game.

**OPEN — the clamp leaks at speed.** At 24.8 u/s arrival the finger punched
7 mm into the Car against a 1 mm budget; the soft guard reacts a step too late.
Predicting the step (as the kinematic path already does with `castAhead`) should
close it, and is the obvious next build step.

Note this ticket carries **no go/no-go verdict** (unlike ticket 13's role): the
user has already decided C stays, so what remains is tuning and experimenting,
not judging.
