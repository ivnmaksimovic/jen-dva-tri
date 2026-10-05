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

Build notes (v0 slingshot slice, 2026-10-05):

- Car v1 (4 jointed wheel bodies) REJECTED: at 1:64 scale the solver ratcheted
  rim-edge contacts into vibration, sideways creep and endless rolling.
  Car v2: ONE rigid body (chassis box + 4 wheel spheres compound), wheels
  are visual meshes spun procedurally. Rolling resistance = linearDamping,
  grip = slideFriction — both live-tunable. ADR-0001 (full 3D physics)
  intact; per-wheel joints may be revisited only if the game feel demands it.
- Physics stability: timestep 1/240 (4 steps/frame) — at 1/60 bodies sink
  g·dt² ≈ 36% of a wheel radius per step and the correction impulse
  launches them (scale-invariant; only the timestep fixes it).
  numSolverIterations = 8.
- Known limitation: with slideFriction low, cars may slowly slide down the
  sidewalk ramps when parked (a real car would roll too — acceptable for v0,
  tune slideFriction if it bothers).

**Session state: v0 slingshot slice is BUILT, committed and feel-tuned
(commits a2d276b → c7fa5e1); feel-pass iterations are in the build notes
below. Current phase: feel tuning, then push-the-phone (see Roadmap).**

## Roadmap (what's next)

1. **Feel tuning** (current phase) — dial in Surfaces and car params on the
   slingshot model; tuning persists per browser (lil-gui → localStorage).
2. **Push-the-phone** — the user's main-bet control scheme. Full design:
   ticket 07 (sensor mapping, ~300 ms gesture window, behind-the-car camera
   alignment in that mode). The HTTPS dev server is already in place.
3. **Flick** — maybe, much later (ticket 01).
4. **v1: stop throwing away** — once the controls feel right, grill the
   real game's design (multiplayer rules: car-to-car contact, turn order,
   race start, the penalise mode, Mines; Track Building / track editor;
   car presets) and rebuild on a real architecture. The prototype informs
   the design; it is NOT the seed of the codebase.

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
  the Car; local axes = Car axes; `rotationRate` → curve Push; one strike =
  one impulse; phone displacement ignored; thresholds tuned in Sandbox.
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
