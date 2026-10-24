# Handover: from the v0 prototype to the real game

**This is not a spec, not a plan, and not a ticket.** It exists to be read five
minutes before a grilling session about building the real app, because most of
what matters about this project is currently only stored in people's heads and in
the build notes of a prototype that is about to be thrown away.

Written 2026-10-23 by the agent that built most of v0 alongside the user. Where
this document states something, it is either observable in the repo or it is
labelled as a judgement. Where it is a judgement it says so, because the session
may want to overrule it.

Read next to: `GLOSSARY.md`, `docs/adr/0001-full-3d-physics.md`,
`docs/adr/0002-grip-is-a-contact-property.md`, `.scratch/v1/spec.md`, and if you need history search in `.scratch/prototype/map.md`, whose build notes are the
richest record of *why* anything is the way it is.

---

## 1. What was actually built, honestly

A controls prototype, thrown away by design. Not a game: no session, no win
condition worth the name, no sound, no car models beyond boxes and cylinders, no
shipped build (Play Store path never exercised, iOS never built, `appId` still a
placeholder). What it does have:

- **Real rigid-body physics that survives being watched.** Rapier at 1/240 s, 8
  solver iterations. Three (optionally twelve) 1:64 Cars behave at rest, in
  contact, and in chains. This is the expensive part and it is done.
- **Three control schemes**: slingshot (A, impulse-based, the baseline),
  push-the-phone (B, designed in ticket 07, **never built**), and the flick (C,
  built — this is the one that feels good).
- **Grip resolved per wheel contact** across four Surfaces with real geometry,
  with one Square raised as a sidewalk, plus gravel (stones) on the Track.
- **Rules**: Turn = three Pushes per Car, checkpoints, Out of Track, Rock, Lake,
  Bridge. Sandbox and Lap Challenge modes. All of it in `src/game/proto/rules.ts`,
  which is small, honest, and worth reading before designing v1's Turn engine.

What it does **not** have, which a grilling session will otherwise assume exists:
hot-seat turn ownership between two humans, AI, any persistent progression, any
Track editor, any analytics, any notion of a *session*.

## 2. Decisions already made in play — do not re-grill these

These were settled by building and playing, not by argument. Reopening them is
allowed, but anyone doing so should know what it cost.

- **The flick (C) is the scheme that works.** A and B stay selectable in v1 —
  the user was explicit: all three ship. B is designed (ticket 07) and unbuilt.
- **Option C delivers the Push through a real body in the world, not a computed
  impulse** (ticket 18). The finger-shaped collider costs nothing (0.19 ms/frame)
  and means nothing about the strike is authored. **The user's numbers from real
  play: finger mass 0.5 × the Car, hand strength 100.** Those two replaced my
  seeds (5 and 300), which produced several metres of roll per flick. Do not
  "fix" them from a desktop; they can only be judged on the phone.
- **Riding is illegal but must remain possible**, and the engine must not
  prevent it. What riding *costs* was deliberately left to v1's rules engine. If
  someone "helpfully" adds auto-correction, they will have removed a decision the
  user made on purpose.
- **Selection is tap-only; a flick never changes it.** Given several Cars this is
  load-bearing for the HUD and the tuning panel agreeing with what you're pushing.
- **The camera is free and belongs to the player** (ticket 19), including mouse
  bindings for desktop. The old "fixed near-top view" decision is dead.

### Not yet written down anywhere — candidates for the session to formalise

None of these are recorded as ADRs yet, because nobody asked me to. They are the
first things the session should decide whether to promote:

1. *A legal Push is contact between two bodies, not an impulse.* Currently true
   only for scheme C; A still applies an impulse directly. Either v1 converts A
   and B or it accepts two different Push mechanisms — that asymmetry will
   otherwise leak into feel explanations.
2. *UI refusals state the rule the player broke, not the mechanism.* (e.g. "A Car
   can only be pushed, never pulled" rather than "a finger can only press".)
   Small, but it shaped four separate interactions and nothing records it.
3. *Nothing that can emerge may be authored.* This principle has now deleted two
   features (`curveFactor`, and later the predictive clamp). It is the closest
   thing this project has to a constitution, and it lives only in map.md.

## 3. The graveyard — do not re-attempt these without new information

Every one of these was tried, cost time, and left evidence behind:

- **Jointed wheels (Car v1).** Ratcheted into vibration and endless creep at
  1:64. Replaced by ONE rigid body with four wheel spheres as a compound
  collider. This is why per-wheel load bearing is not available: do not propose
  per-tyre torque without re-opening this.
- **`curveFactor`.** Interpolated the strike point toward the Car's centre to
  tame the curve Push. Deleted: declaring torque to come from where the finger
  did not land is invented behaviour. Curve must fall out of roll vs side
  grip. **This is the precedent to quote** whenever someone proposes a "small
  tweak" that makes outcomes nicer.
- **Bumpy ground as a heightfield.** Braked the Car *identically when flat*.
  Deleted in favour of real stones (gravel). Lesson recorded: **always measure
  the flat control first** — a representation that cannot distinguish the effect
  from itself cannot answer the question.
- **A kinematic finger.** With infinite mass and nothing to pay, it does not
  strike: it bulldozes the Car along its whole follow-through. This is why the
  finger is a *servo* (bounded mass, bounded acceleration).
- **Predicting the servo's aim to guarantee the penetration budget.** Worked, and
  was reverted: it cut every transfer to between a fifth and a half, brought back
  heading scatter, and — decisively — it was not what had been play-tested, so
  shipping it would have invalidated the user's tuning. **Do not harden the model
  for elegance; harden it only when a real setting provably needs it.**

## 4. Traps in this repo

Things a newcomer will trip over that are not written anywhere else:

- **The branch is `main`, not `master`.** `git checkout master` fails.
- **`node`/`pnpm` are only on PATH via nvm** in this workspace:
  `export NVM_DIR=$HOME/.nvm; . $NVM_DIR/nvm.sh`.
- **v1 deliberately has no `map.md`.** Adding one would move which effort wins
  the frontier scan (`docs/agents/issue-tracker.md`). Don't, casually.
- **Tuning persists in the browser** under localStorage (`jdt-v0-tuning`,
  version 5). A surprising result is usually someone's saved tuning, not physics.
  This cost an hour once. **Checks must use explicit parameters** rather than
  whatever default happens to be tuned this week.
- **Nobody checks their own display units.** 1 world unit = 10 cm = 100 mm. Printing
  millimetres as `units × 1000` produced a phantom "metre of sideways drift" that
  took a whole investigation to disprove.
- **Sampling every Nth frame** aliases frame-rate limit cycles into looking rock
  steady. Print consecutive frames before believing a constant.
- **Two input layers share one canvas.** Any new one needs the arbitration
  pattern (`claimGesture`/`releaseGesture`, plus an `enabled` predicate checked
  *before* touching anything). A module that posts an event to shared listeners
  is itself one of those listeners — that bug existed exactly once and it made
  the entire camera look dead.
- **Assert the effect you wanted, not the side effects that came free.** The
  camera was dead while its check was green, because the check asserted
  "unfollowed, no Push" instead of "the camera moved".
- Those layers take ~10 positional arguments with an optional tail. One omitted
  argument silently shifts every later argument onto the wrong parameter. It has
  happened twice. Consider an options object before adding an eleventh.

## 5. Things I know are unfinished or wrong, stated rather than hidden

- **The Car explodes at high energy.** A straight impulse of ~16 sends it to
  y ≈ −5 km. Cause unknown, never investigated, deliberately out of scope for the
  controls prototype. Relevant again now: if the user raises `maxAccel`, the
  flick may reach that energy. Someone should either find it or put a guard on it.
- **Strength is not monotonic once the finger is lighter than the Car.** A
  gentle finger transfers by *duration*, not force. This is a property of the
  model, not a bug — but whether it reads as control is unsettled and it is the
  user's call.
- **A hard swipe can deliver nothing at all**: at a weak `maxAccel` the finger
  cannot be accelerated to that speed within a stroke, so it never arrives.
- **Contact scatter**: with earlier (too strong) settings a dead-centre flick
  could leave up to 18° of heading error; at the tuned settings it is ~0.8°. Nobody
  has decided how much scatter a *precision* game tolerates.
- **Nothing visual is final.** Chalk now has real width and there is tone
  mapping and an environment map, but no device has ever been profiled for frame
  pacing with twelve Cars, and there is no sound at all.

## 6. Questions worth asking in the session

None of these have been asked. Some are load-bearing and unglamorous:

1. **What is the smallest real game that could be shipped?** A vertical slice
   definition would bound everything else; without it, v1 can expand forever.
2. **Who is playing, physically?** Two people hunched over one phone (the folk
   game is hot-seat), one person versus a clock, or asynchronous? Everything
   downstream — turn ownership, camera, even whether free camera is a good idea —
   depends on this, and it has never been settled.
3. **Does the real game keep three control schemes?** The user says yes; that is
   three input layers' worth of feel maintenance. Worth confirming as a cost.
4. **What is Track Building's place?** Calling it "a milestone, not a feature"
   was easy while it was far away. If it is half the fun, it may need to be much
   earlier than the current order.
5. **Where does the physics stop being the simulation and start being a budget?**
   If a phone cannot afford full fidelity at twelve Cars, what gets simplified
   first — and does the game survive that?
6. **How does a precision game handle randomness** that emerges honestly from
   contact? Is scatter skill expression, or unfair?
7. **Does anything only exist because the prototype had to be thrown away** that
   should now deliberately survive? Answer: yes — the ADRs, the glossary, and
   above all the measured numbers (cost per frame, transfer-to-roll tables, the
   strength relationships in `check:finger`). Take those, not the code.)

## 7. If you take nothing else away

- The numbers survive even when the code doesn't: **every build note in
  `.scratch/prototype/map.md` is a measurement, not a taste.** Copy them into
  wherever v1 keeps this kind of thing, or they will be lost with the directory.
- Three habits to carry over: (a) each bug becomes a named headless check
  (`pnpm check:*`), (b) before deciding anything, ask whether a measurement could
  answer it, (c) the user owns the feel numbers; an agent tunes by measurement
  and hands the dials over.
- And the one thing I'd insist on: **`map.md`'s requirement that "do the next
  thing" always resolves to a concrete open ticket.** It is why anything got
  built at all, and it is cheap to lose.
