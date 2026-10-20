# Prototype — design grilling map

## Notes

Design-tree grilling session for the v0 controls prototype. The game is a
digital adaptation of a folk game ("1-2-3"): turn-based finger-push racing
with 1:64 model cars on chalk-drawn tracks outdoors, played on real Terrain.
The v0 prototype is throwaway code whose purpose is to answer control-feel
questions on a real phone, not to become the product.

Test target: Android phone browser via `pnpm dev` on LAN over **HTTPS**
(`@vitejs/plugin-basic-ssl`). Desktop is the fallback for fast iteration.
Native Android (Capacitor) build deferred until controls feel right.

Architecture requirements surfaced during grilling:

- Hazards (name, texture, rule) must be cheap to change — rules are only
  partially remembered and details will resurface while building.
- Deliberate no-YAGNI zones: camera experimentation, car presets/licensed
  models, hazard variants.

Build notes (v0 slingshot slice + feel passes, 2026-10-05):

- Car v1 (4 jointed wheel bodies) REJECTED: at 1:64 scale the solver
  ratcheted rim-edge contacts into vibration, sideways creep and endless
  rolling. Car v2: ONE rigid body (chassis box + 4 wheel spheres compound),
  wheels are visual meshes spun procedurally. ADR-0001 (full 3D physics)
  intact; per-wheel joints NOT permanently dismissed (user's call) —
  revisit only if the game feel demands it.
- Feel pass 1 (5475802): strikes clamp to the Car's outer frame
  (clampToFrame: nearest edge point at side height — a finger never strikes
  the middle); curveFactor interpolates the strike toward center, default
  1 = OFF (arrow == physics strike point); wheel visuals fixed (axle along
  local Z, spin about Z); tuning persists per browser (localStorage
  'jdt-v0-tuning'; testField excluded; GUI has a Reset tuning button).
- curveFactor REMOVED (2026-10-08, user's call): it interpolated the strike
  point toward the Car centre to tame the curve Push. Wrong kind of thing —
  declaring torque to come from where the finger did NOT land is authored
  behaviour, not simulation, which is exactly what ADR-0001 rejects. It
  defaulted to 1 (OFF), so removing it changed nothing about play; what it did
  cost was exceptions: the strike marker could not be drawn where the point
  actually was (ticket 11), and the no-pull rule had to be asked against a
  different point than the visible one (ticket 15). Curve already falls out of
  roll vs side friction. NOTE: the strike is now raw, so aim accuracy matters
  more — if it ever feels brutally curvy again, fix how taps map onto the
  frame (clampToFrame), not by moving where the impulse is said to land.
- **VERDICT (2026-10-08, user): glancing strikes keep the FULL impulse.** We
  know that is not what a real finger does (it skids off). Left that way on
  purpose — revisit only if it turns into a gameplay exploit, i.e. if someone
  farms a decent shove out of a barely-touching graze. Do not "fix" it as
  realism before then.
- **VERDICT (2026-10-08, user): the strike marker is legible on the phone**
  ("I can easily see the marker on the phone"). Ticket 11's fallback — a
  marker hovering above the roof with depth left honest — is DROPPED, not
  parked. Size and contrast both confirmed good on the device — nothing left
  open here.
- Ticket 15 (no pulling, 2026-10-08): a Push must go INTO the Car — a bent
  index finger presses, it cannot grip, so pulling is impossible
  (`Car.pushesFrom`: step 0.1 mm along the strike and you must be inside the
  chassis footprint; wheels excluded, they stick out past it). Legal
  directions form a clean 180° half-plane off every face, backwards strikes
  included. A rejected swing applies NO impulse and spends NO Push, and the
  aim arrow turns red while it is still gesture-time, so the rule is visible
  before release rather than discovered by nothing happening.
- **BUG FIXED (2026-10-11, reported by the user): tapping another Car Pushed
  it.** Aim state survived the gesture — `dragVec` in `slingshot.ts` was
  written only on pointermove, so a tap with no movement released the
  PREVIOUS drag: old length, old direction, struck on whichever Car the tap
  selected (a no-pull refusal instead, when the stale direction did not go
  into that Car's body — one bug, two symptoms). Fix: every touch-down starts
  the drag at zero. The general form worth carrying: gesture state belongs to
  the gesture and has to die with it — there will be far more per-gesture
  state in the push-the-phone gesture window (tickets 07/13), including a
  release time, and leaking THAT one is harder to see than a phantom Push.
  Guarded by `pnpm check:gesture`: it drives the real control scheme with
  synthetic pointer events and measures what happened — a tap selects without
  moving anything, spending a Push, or complaining.
- The refusal copy now states the rule the player broke, not its mechanism:
  "A Car can only be pushed, never pulled — strike into the body" (was "A
  finger can only press", which explained the physics and left the player
  guessing what to do differently).
- Ticket 11 (strike point, 2026-10-08): aiming now reads through ONE overlay
  drawn over the Car — a bullseye sprite at the exact strike point + the aim
  arrow, both `transparent` + depthTest/depthWrite off with renderOrder
  (marker 20 > arrow 10) so the overlay pass draws them last. Both are fed by
  a single `strikePoint()` in `slingshot.ts`, which is also what
  `applyImpulseAtPoint` receives — the visible point CANNOT drift from the
  physics point. Marker shows on touch-down (before any drag).
  NOTE for later: a strike on the FAR frame edge is genuinely occluded by the
  roof at the default camera (camera ~19° off vertical; the sight line exits
  through the top face) — verified by pixel readback, not assumed.
- VERIFICATION TECHNIQUE (reusable, no screenshot needed): read pixels with
  `gl.readPixels` from the existing WebGL canvas (`canvas.getContext('webgl2')`
  returns the live context), diff two frames, and print an ASCII map of the
  changed region. Beats eyeballing screenshots and is deterministic.
- Feel pass 2 (c7fa5e1): distributed Coulomb friction at the FOUR wheel
  contact points (side grip + rolling resistance; impulses capped by
  μ·(m/4)·G·dt and limited by each point's effective mass so they never
  overshoot). Surfaces = grip presets (rubber-on-concrete μ ≈ 0.7–1.0).
  angularDamping = bearing level (~0.2). Verified: roll decel == μ·G.
- Physics stability: timestep 1/240 (4 steps/frame) — at 1/60 bodies sink
  g·dt² ≈ 36% of a wheel radius per step and the correction impulse
  launches them (scale-invariant; only the timestep fixes it).
  numSolverIterations = 8.
- LESSON (cost ~1h): persisted user GUI tuning masqueraded as a physics
  bug (the "2.3× mystery brake" was the user's saved rollFriction).
  Read localStorage / __jdt params BEFORE theorizing about measurement
  anomalies.
- Known limitation: a Car parked HEADING DOWN a sidewalk ramp creeps
  (forward gravity component beats rollFriction); parked ACROSS the ramp
  it holds (sideFriction ≫ slope). A real free-rolling car would roll too —
  acceptable for v0.
- **FINDING (2026-10-06, user): grip is not a property of the Car.** v0 keeps
  sideFriction/rollFriction/angularDamping on `CarParams` — one set per Car,
  global for the whole run. Wrong shape: grip is a property of the **contact**
  (Surface × tire), and a single Track crosses surfaces (tiled balcony →
  concrete path → sidewalk), so each wheel can sit on a different Surface at
  the same time. Consequence for v1: friction must be resolved per wheel from
  what is under it, not read from the Car. Recorded as ADR-0002.
- **AGREED (2026-10-06, user): a side Push on a very sticky Surface may make a
  Car roll over. Do NOT spend effort making that happen — run honest physics
  and it will emerge. No authored roll/tumble behaviour, ever: it is a target
  of the simulation, not a feature to implement.
- **Curve Push (slingshot): do not invest further.** Current play is fine, and
  usable curve already falls out of roll vs side friction. The gesture-window
  refinement stays push-the-phone work (ticket 07); nothing needed here for
  now.
- **Friction mechanism (as built, feel pass 2):** all Car colliders set
  friction 0 with combine rule Min — Rapier contact friction never grips the
  Car. Grip is hand-rolled: for each of the 4 wheel points, its contact
  velocity `v + ω × ρ`, then a side-grip impulse (along local Z) and a roll
  resistance impulse (along local X), each capped at μ·(m/4)·G·dt and limited
  by the point's effective mass `1/(1/m + τ·I⁻¹·τ)`. Note what this means:
  **four contact points sampled on ONE body, not four tyres** — there is no
  tyre-vs-ground distinction anywhere, and the point is sampled whether or not
  the wheel is loaded or even airborne. See ADR-0002 for where this must go.
- Ticket 12 (multiple Cars, 2026-10-09): **several Cars behave — after a real
  fix to the single-body Car.** Before it, a three-Car chain left the struck Car
  in a frame-locked limit cycle (angular velocity ±0.44 rad/s flipping sign
  EVERY frame, creeping 0.5 mm/s, `atRest()` never true → **that Car could never
  be Pushed again**). One Car never triggered it, which is why it was never
  seen. Three things in `Car.applyWheelFriction`, each found by measuring:
  1. all 8 impulses were computed from ONE stale velocity read; the four wheels
     are one rigid body, so every impulse changes what the next one is measured
     against → they overshot several-fold and FLIPPED the residual. Now read
     fresh inside the relaxation loop.
  2. the Coulomb cap was per IMPULSE, so every extra relaxation sweep spent the
     grip budget again (same strike: 149 cm on 1 sweep, 28 cm on 6). Now one
     **frame budget** μ·m·G·dt per direction, shared by the four wheels.
  3. one Gauss-Seidel pass is ORDER-BIASED: it turned a dead-centre Push into
     an 8°/667 mm systematic curve — invented behaviour, the same sin
     `curveFactor` was removed for. Now **4 alternating sweeps** (forward,
     backward, …), so a symmetric input gives a symmetric result.
  Straight-line feel measured IDENTICAL before/after (149.0 cm roll at impulse
  8; 0.7 mm drift; 0° turn), so nothing needs re-tuning — but re-feel it on the
  phone anyway. Guarded by `pnpm check:cars` (check 6: centre stays <2° and
  <20 mm, corner strike still turns >15°, measured 68.6°).
- HEADLESS-CHECK TECHNIQUE (added 2026-10-09, reusable): prototype TS runs in
  Node through Vite's SSR pipeline — `scripts/headless-check.mjs` loads any
  module exporting `run()`, so a check imports the REAL `Car`, the real world
  settings and even the real no-pull rule (see
  `src/game/proto/checks/multi-car.ts`). Two traps learned the hard way: Cars
  that are not placed still spawn at the origin and overlap whatever you are
  testing (create only the Cars you place), and sampling every 30th frame
  ALIASES a frame-rate limit cycle into looking rock steady — always print
  consecutive frames before believing a constant.
- Several Cars (ticket 12): the **aimed Car is the one you TOUCH** (one raycast
  over all Cars), and there is ONE selection concept — touch, GUI selector,
  camera, HUD Turn counter and tuning panel all move together, so the panel can
  never be editing a Car you are not pushing. A **Turn belongs to a Car** (each
  Car has its own Pushes / lap progress in `Rules`), matching one owner = one
  Car. Car-to-car contact needed NO new physics: only the collision FILTER had
  to gain `CAR_GROUP` — Cars previously passed straight through each other.

- Ticket 16 (spatial Surfaces, **RESOLVED 2026-10-10**): **grip IS a contact
  now.** `CarParams` lost `sideFriction`/`rollFriction` and gained the TIRE's
  half of the pair (`tireGrip`, `tireRoll`); `angularDamping` stayed on the
  Car, because bearing loss is not a Surface property at all. Each of the four
  wheel points casts straight down once per frame and reads its own Surface,
  combined as `surface.grip × tire.grip` — no notion of crossing, no notion of
  "current Surface". Defaults chosen so a default tire on **Concrete
  reproduces exactly what the old numbers did** (0.7 × 0.5 = 0.35 side,
  1.0 × 0.03 roll), so today's feel is preserved and every other Surface is a
  measured departure from it.
  **Cost of per-wheel grip: essentially nothing.** Same single rigid body, same
  four points, same relaxation loop; the four extra casts measured 0.138 ms per
  frame including the rest of the physics. Cheap things are worth being honest
  about before assuming.
  **What a straddle actually does (measured, guides future work):** the grip
  pool is shared by the four contact points of ONE rigid body, so the available
  deceleration comes from the *mean* of the μ under the wheels — a Car half on
  Asphalt and half on Glass rolls like the average of them, strictly between,
  with no line of code picking one. It does NOT produce a big yaw from
  left/right differences: with four points on one mass, impulses distribute by
  demand, not by μ. Real per-tyre torque would need wheels that are separate
  bodies carrying their own load — that is Car v1, already rejected for its own
  reasons. If the game ever wants that, it is a wheel-joint decision, not a
  Surface one.
  **Wheels that are not touching contribute nothing** (user's call: no feel
  hacks). Measured: 14 frames of free flight keep 98.8% of their speed while
  the same 14 frames rolling on Asphalt keep 79.9%. This is also what will make
  bumpy ground (ticket 17) readable later.
  **LESSON — four ground slabs laid edge to edge give every joint a vertical
  face, and a 1:64 wheel finds it.** Measured: a Car crossing a flat joint rode
  up 1 mm and lost half its speed in ONE frame (a 17× deceleration spike); the
  roll went 61 mm inside one square vs 45 mm across a joint, plus 9.5 mm of
  sideways kick. Buried seams with overlapping colliders did NOT fix it — the
  ball meets the neighbour's top *corner* before its centre crosses, whatever
  the overlap. **The fix was structural: two layers.** `groundPieces()` is what
  you ROLL ON (ONE seamless flat slab + the raised square + the two ramps) and
  `surfacePads()` is what you are STANDING ON (one thin pad per square, in a
  separate collision group that nothing collides with, found only by the
  downward cast). Pads can meet at exact boundaries because they never make
  contact — the crossing roll became byte-identical to the inside-one-square
  roll. This is also the honest place for material regions generally: physics
  wants continuous surfaces, materials want regions.
  **Load follows the contacts that are down:** the body's weight (Σ Nᵢ = m·G)
  is shared evenly between touching wheels, so a Car hanging half over a curb
  does NOT lose half its grip — the wheels still down carry it. This corrects
  what was assumed while grilling this ticket (that the pool would halve);
  check 6 in `src/game/proto/checks/surfaces.ts` is what settled it.
- Test ground (ticket 16): the ground under the same Track loop is now **four
  joined squares meeting at one point** near the loop's centre, one Surface
  each — **Asphalt, Concrete, Tiles, Glass** — and one of them is raised **2 cm
  as a sidewalk** (it was 4 cm; at 1:64 even 2 cm is a full wheel DIAMETER, so
  a model car cannot climb a curb at all — the Track gets up over the two worn
  ramps and every other edge stays a hard curb). Each square's material is
  **swappable from the GUI**, so any two can be compared along the same stretch
  of ground, and the HUD names the Surface under each wheel (the only way to
  watch a straddle rather than believe it). Two consequences worth knowing: the
  Bridge moved wholly inside the raised square (chalk is drawn at one height;
  straddling the height step drew half of it buried), and the Test-field row
  now starts inside ONE square, so comparisons start on the same Surface.

- Ticket 17 (roughness bet, **RESOLVED 2026-10-10 — ships limited**): bumpy
  ground IS felt by 1:64 wheels (38 mm → 10 mm rolled, wheels airborne on 9 of
  420 frames), but the first implementation did not prove it: making the
  rolling surface itself bumpy (a heightfield of mm relief) braked the Car
  **just as much when geometrically flat** as when bumpy — a control run at
  ±0.0001 mm was indistinguishable from ±2 mm at every grid spacing tried, and
  10% of downward probes found NO collider over the heightfield at all. So the
  effect was the representation, not the bumps; it is deleted. What ships
  instead is **gravel**: real stones (~3 mm radius, ~1.2 mm proud) lying in the
  Surface, and nothing anywhere claims a shape. Two surprises worth carrying
  forward: **always measure the flat control first**, and the effect is NOT
  monotonic — 1 stone/unit² does nothing, ~4/unit² (5 cm spacing) is where a
  6–10 mm wheel can no longer go around a stone, and finer than that it rides
  the tops and feels smoother again. Cost is the second half: ~0.45 ms per
  frame per thousand stones (desktop), so it is confined to the Track corridor
  (+0.6 ms for 1344 stones) and a whole-Surface version is unaffordable, while
  a bounded bad spot (69 stones) costs nothing measurable. Whether it FEELS
  right is the user's call on the phone.

- Ticket 18 — **the flick control scheme (option C)**, grilled 2026-10-19 over
  6 rounds; the ticket holds everything. The decisions that matter most:
  - **The Push is a REAL CONTACT, not a computed impulse.** The finger is a
    kinematic horizontal cuboid (the middle knuckle; all half-extents tunable)
    driven by the touch, collision-filtered so **only the aimed Car sees it**,
    and **clamped at the contact** so it cannot pass through the Car. Infinite
    effective mass is honest here (a real finger vastly outweighs a 1:64 Car);
    the clamp is what prevents a shove-through, not a mass fudge. It also gives
    the multi-impulse "slow, then accelerate within the window" Push for free
    — never write an "impulses per window" mechanism.
  - **A gesture is one sweep:** touch anywhere → move → a Push happens iff the
    finger reaches the aimed Car; touching down ON the Car does nothing (same
    reason the slingshot must enter from outside); **selection is tap-only** —
    a flick never changes it and never touches another Car; extra fingers are
    ignored; pointer capture so running off the glass mid-sweep still counts.
  - **Riding is not auto-corrected.** Exceeding the ~300 ms window (one shared
    number with scheme B; it now starts at the first solver contact, which the
    finger body gives for free) is only **measured and shown** — no penalty, no
    refusal, because the real game works that way: other players flag it. What
    riding COSTS is a v1 rules question.
  - Feedback: **strike point visible ~2 s after the hit** is normal player
    feedback (with no aiming pause it is the only thing that teaches); the
    synthetic aim arrow stays debug-only, as in the slingshot.
- Ticket 18 step 1 (**the headless spike**) landed and is COMMITTED — `check:finger`
  + `src/game/proto/finger.ts`. Findings worth carrying:
  - **The finger is a SERVO (finite mass, bounded acceleration), not a kinematic
    body — that was a measurement, not a taste.** Kinematic (infinite mass +
    hard stop at the surface) does not strike: it follows the Car along its
    whole follow-through and drags it metres sideways. The servo version loses
    ground when it hits something, which is what ends a strike. Both models are
    kept in `finger.ts` so the comparison can be re-run.
  - **Strength follows how fast the finger ARRIVES, not how fast the swipe is.**
    √(2·maxAccel·run-up) decides it: over 6 cm of run-up the finger caps out at
    12.4 u/s however hard the swipe. Measured transfer: arrival 2.5/8.1/24.8
    u/s → 27/109/374 cm rolled (today's impulse 2/4/6 → 10/39/86 cm).
  - **OPEN: the heading is deterministic but knife-edge** — a centred flick
    leaves +2° to -18° depending only on the run-up, and finger width (0.4–2.4
    cm) does not explain it. User judgement next: real scatter, or too random
    to aim with.
  - **OPEN: at 24.8 u/s the finger punches 7 mm deep against a 1 mm budget**
    (soft guard reacts a step late; the kinematic path already has the
    predictive `castAhead` that would fix it).
  - Side finding, NOT this ticket's problem: **today's model already explodes at
    impulse 16** (Car ends up at y = -5 170 m). High-energy strikes are unsafe
    in the existing Car too.
  - Reusable technique added: `Finger.contactReport()` reports every solver
    contact point, its normal and its impulse — how you AUDIT where a strike
    landed instead of believing where you aimed.

- Ticket 18 is **PLAYABLE**: `pnpm dev` → GUI → Control scheme (A / C) → Flick.
  Tunables exposed live (maxAccel = strength, finger mass, penetration budget,
  knuckle dimensions), strike marked for 2 s, and `pnpm check:flick` guards the
  scheme's promises headlessly. Two things learned wiring it up:
  - **Both schemes listen to one canvas → ONE owner per gesture.** Added claim/
    release arbitration; without it whichever layer declined a touch still heard
    everything after it (caught by `check:flick` check 3). Same shape as the old
    tap-to-select bug: two listeners, one canvas, no arbiter.
  - **The finger must be driven per physics STEP, not per frame** — 4 steps per
    frame, and a once-per-frame finger teleports 8 mm through its own contacts.
    `proto.ts` now has `stepHooks` for exactly this.

- Ticket 19 — **the camera is now controllable** (deliberately small grilling
  ticket). The early "fixed near-top view" decision is **VOID — the user does
  not care about it**: early testing showed everyone expects zoom/rotate/pan,
  including the user. Default stays the birdseye that follows the aimed Car;
  **the first manual gesture turns follow off, Recentre restores it**;
  zoom/rotate are offsets that survive pushing; **Recentre = default birdseye
  framing over the selected Car** (the same thing as "last pushed", since
  selection follows the pushed Car). **Conflict rule for every scheme: one
  finger = the game, two fingers = the camera.** Push-the-phone (B) keeps its
  own behind-the-Car camera.

**Session state: v0 slingshot slice BUILT and feel-tuned through two feel
passes (commits a2d276b → 5475802 → c7fa5e1; onboarding docs d1a8334), several
Cars on the Track (ticket 12, RESOLVED 2026-10-09), and now spatial Surfaces
with the grip resolved per wheel (ticket 16, RESOLVED 2026-10-10).
Current phase: the user Judges whether the four Surfaces feel different on
  the phone, then push-the-phone (see Roadmap).**

User verdict 2026-10-06: **the prototype still does not feel great** — but it
may be a matter of settings rather than model. So: the model is not yet
proven wrong; never change feel constants"by judgment" — the user owns the
numbers, and any unexplained feel change should be checked against the saved
tuning before being treated as physics (see the tuning LESSON above).

## Roadmap (what's next)

1. **Feel tuning** (current phase — USER-held, not an agent task) — the
   user dials in Surfaces (GUI → `Surfaces (the world)`, including each
   Surface's `gravel`) and tire params on
   their phone; tuning persists per browser (lil-gui → localStorage, now v4:
   per-Car roll/side numbers no longer exist, Surface `rough` is gravel now).
   Agents: physics feel numbers are the user's domain.
2. **Push-the-phone** — the user's main-bet control scheme: ticket 13 (open)
   — build it per the settled design in ticket 07. HTTPS dev server already
   in place.

   **The camera is open too** (ticket 19, deliberately small): it becomes
   user-controllable (zoom/rotate/pan) with the birdseye as default. It is a
   camera MODEL question, so it is not folded into the flick ticket — only the
   one-finger/two-finger conflict rule lives there.

   **But first: more experiments.** The user wants these in the prototype
   before push-the-phone (all open, unblocked, user-relevant):

   - ticket 11 — **show where the strike lands** (the aim arrow ran through
     the middle of the Car, hiding the one thing aiming must show) — BUILT and
     confirmed legible on the phone; the hovering-marker fallback is dropped
   - ticket 12 — **multiple Cars** — RESOLVED 2026-10-09: several Cars behave
     once the wheel-friction bugs above were fixed, and that fix is the
     ticket's real output. Remaining (user's): phone check of frame pacing and
     of reading three Cars at arm's length
   - surfaces along a Track + roughness — SPLIT 2026-10-10 into two tickets
     (grip vs shape are different bets with different risk; the original 14 was
     deleted, its content folded into these two):
     - **16 — spatial Surfaces, grip per wheel** — RESOLVED 2026-10-10 (four-
       square test ground, grip read per wheel, per `pnpm check:surfaces`).
       Remaining (user's, on the phone): does the difference between the four
       Surfaces READ? Numbers are the user's.
     - **17 — roughness bet** — open, its own decision gate, now the frontier

   Ordering note: 11, 12 and 16 are done, so the frontier scan now picks 17
   (roughness). Say the word if push-the-phone should jump ahead.
3. **Flick (option C)** — the third control scheme, ticket 18 (open,
   unblocked). Grilled and ready to build; ordering vs push-the-phone is the
   user's call. In v1 it is the likely **default**, with A and B both kept
   selectable.
4. **v1: stop throwing away** — once the controls feel right, grill the
   real game's design (multiplayer rules: car-to-car contact, turn order,
   race start, the penalise mode, Mines; Track Building / track editor;
   car presets) and rebuild on a real architecture. The prototype informs
   the design; it is NOT the seed of the codebase.

"Do the next thing": run the frontier scan (docs/agents/issue-tracker.md)
→ currently ticket 16 (open): spatial Surfaces, grip per wheel.

## Decisions so far

Round 1:

- The game: folk "1-2-3" finger-push car racing (1:64 cars, chalk tracks,
  turn-based, 3 Pushes per Turn). Not slot cars, RC, or Micro Machines.
- Prototype is throwaway.
- First test device: phone browser on LAN (HTTPS).
- Multiplayer is the real game, but v0 prototype is solo.

Round 2 (rules — settled language lives in GLOSSARY.md):

- Push: quick strike only; riding illegal; curve Push legal; Car fully at
  rest before the next Push.
- Out of Track: 3+ wheels fully beyond a Boundary; any wheel part touching
  the line is in.
- Reset: closest Checkpoint behind the Car; owner's choice of placement
  (any spot behind the line, any orientation).
- Bridge: full-width strip, diagonals both directions, cross in one Push;
  stopping on it → back to the Start.
- Car-to-car: plain physics, pushing legal (default); penalise mode may
  follow as a rules variant.
- Hazards optional per Track.

Round 2 (prototype shaping):

- Control schemes: slingshot-aim (permanent baseline), direct flick (maybe,
  later), push-the-phone (main bet). Tilt-gyro skipped.
- Camera: fixed near-top view, slightly angled, whole Track NOT visible.
- Full 3D physics — ADR-0001 (2D rejected; pebbles/potholes/flips/drops).
- Cars runtime-adjustable; presets saveable; licensed cars possible later.
- Two modes: Sandbox (unlimited Pushes) + Lap Challenge (3-Push Turns,
  rules live, lap timer).

Round 3 (frontier cleared):

- Physics engine: **Rapier** (`@dimforge/rapier3d-compat`) — CCD decisive
  for thin chalk lines at flick speeds; determinism helps later. (ticket 06)
- Push-the-phone mapping: screen shows top-down game view; camera in this
  mode rotates to top-down **behind the Car** so phone heading aligns with
  the Car; local axes = Car axes; one strike = one Push. REFINEMENT (pre-
  build): a legal phone-push is a bounded gesture window (~300 ms, tunable)
  — sensor data is integrated over the window (direction may change within
  it — the curve Push), not read as one sample. Full details: ticket 07.
  Phone displacement ignored; thresholds tuned in Sandbox.
  Behind-the-car alignment is push-the-phone only — slingshot mode does
  NOT need or prefer it. (ticket 07)
- Secure context: HTTPS dev server via `@vitejs/plugin-basic-ssl`; web-first
  testing continues (incl. push controls); native Android later. (ticket 08)
- v0 Track: mostly flat; one section runs on the raised sidewalk (with
  transitions/drops); no pebbles/potholes. (ticket 09)
- Build order: slingshot slice → push-the-phone once the basic game works →
  flick much later, maybe. (ticket 10)

## Fog

Nothing blocking. Deferred by agreement (not part of the grilling scope):

- Bridge reset semantics (placed behind Starting Line like race start?).
- "Mines" Hazard — user half-remembers; collect fragments as they surface.
- Car-to-car penalise mode — what counts as "pushing" another Car?
- More half-remembered obstacles / improvised hazards.
- Multiplayer specifics (turn order, race start placement).
- Camera experimentation (post-v0).
- Car presets as saved entities; licensed real cars (e.g. Majorette).
- Track Building / track editor as a feature (the creative half of the
  original game).
- Aesthetics (chalk look, concrete texture, sound).
