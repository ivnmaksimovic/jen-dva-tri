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
  parked. Only direct sunlight remains untested.
- Ticket 15 (no pulling, 2026-10-08): a Push must go INTO the Car — a bent
  index finger presses, it cannot grip, so pulling is impossible
  (`Car.pushesFrom`: step 0.1 mm along the strike and you must be inside the
  chassis footprint; wheels excluded, they stick out past it). Legal
  directions form a clean 180° half-plane off every face, backwards strikes
  included. A rejected swing applies NO impulse and spends NO Push, and the
  aim arrow turns red while it is still gesture-time, so the rule is visible
  before release rather than discovered by nothing happening.
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

**Session state: v0 slingshot slice BUILT and feel-tuned through two feel
passes (commits a2d276b → 5475802 → c7fa5e1; onboarding docs d1a8334).
Current phase: feel tuning, then push-the-phone (see Roadmap).**

User verdict 2026-10-06: **the prototype still does not feel great** — but it
may be a matter of settings rather than model. So: the model is not yet
proven wrong; never change feel constants"by judgment" — the user owns the
numbers, and any unexplained feel change should be checked against the saved
tuning before being treated as physics (see the tuning LESSON above).

## Roadmap (what's next)

1. **Feel tuning** (current phase — USER-held, not an agent task) — the
   user dials in Surfaces and car params on their phone; tuning persists
   per browser (lil-gui → localStorage). Agents: physics feel params are
   the user's domain.
2. **Push-the-phone** — the user's main-bet control scheme: ticket 13 (open)
   — build it per the settled design in ticket 07. HTTPS dev server already
   in place.

   **But first: more experiments.** The user wants these in the prototype
   before push-the-phone (all open, unblocked, user-relevant):

   - ticket 11 — **show where the strike lands** (the aim arrow ran through
     the middle of the Car, hiding the one thing aiming must show) — BUILT and
     confirmed legible on the phone; the hovering-marker fallback is dropped
   - ticket 12 — **multiple Cars** (two Cars have never touched; every 1:64
     solver problem so far showed up where small bodies meet at rest, and
     multiplayer depends on the answer)
   - ticket 14 — **surfaces along a Track + roughness** (spatial grip per
     ADR-0002, plus the open bet: does bumpy/bad concrete that small wheels
     feel earn its complexity, or do we drop it?)

   Ordering note: these sit *after* 11 by number and 11 is done, so the
   frontier scan now picks 12. Say the word if they should jump ahead of
   push-the-phone.
3. **Flick** — maybe, much later (ticket 01).
4. **v1: stop throwing away** — once the controls feel right, grill the
   real game's design (multiplayer rules: car-to-car contact, turn order,
   race start, the penalise mode, Mines; Track Building / track editor;
   car presets) and rebuild on a real architecture. The prototype informs
   the design; it is NOT the seed of the codebase.

"Do the next thing": run the frontier scan (docs/agents/issue-tracker.md)
→ currently ticket 12 (open): multiple Cars.

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
