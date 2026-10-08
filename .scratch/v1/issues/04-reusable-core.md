# 04: Reusable core — world, Car, Surface, Push port

Type: task
Status: ready-for-agent
Blocked by: 01

Coarse on purpose — split this once it becomes the active queue and the
prototype has answered what it still owes us.

## What to build

The **prefactor**: lift the hard-won out of the throwaway prototype into the
first real modules of the game, and delete nothing of the prototype until the
new core runs it. "Make the change easy, then make the easy change."

Slices the prototype's pile into four seams, each usable with no renderer, no
GUI and no prototype module imported:

- **World**: Rapier world creation with the settled stepping config
  (1/240 s, `numSolverIterations = 8`, gravity) and the fixed-step frame
  pump. Nothing outside this module knows the timestep.
- **Car**: build a Car from parameters — the single-compound rigid body
  (chassis box + 4 wheel spheres), wheel visuals spun procedurally, `atRest()`,
  `wheelPoints()`, `reset()`. Car parameters are explicit and rebuildable in
  place, and carry the **tire** side of grip and nothing else (**ADR-0002**).
- **Surface**: a spatial property of the world, sampled **per wheel contact**
  and combined with that Car's tire at that point. Because grip is a property
  of the contact, two wheels of one Car can sit on two different Surfaces at
  the same time, and moving from a tiled balcony onto a concrete path needs no
  transition code. Named Surface presets may survive as authoring convenience,
  never as the mechanism.
- **Push port**: the input seam. A **source** records the gesture window and
  emits a validated Push intent — the integrated direction/strength over the
  window plus the curve component from the window's rotation — and something
  applies that intent to a Car at its frame edge. Every control scheme is a
  source behind this port; nothing else in the game knows which scheme won.

Then: the prototype's current game plays identically on the new core. Same
Push → same trajectory, verified, not eyeballed.

Note the interesting seam: today's `applyWheelFriction` computes its two
Coulomb caps once from Car fields, then loops the four points. Moving to
ADR-0002 means computing the caps *inside* the loop from the Surface under
that point — the rest of the machinery (per-point velocity, effective-mass
clamp, `applyImpulseAtPoint`) already works per point.

Non-goal: nothing here is pretty, multiplayer, or shipped. No lil-gui, no
session/Track work (coarse tickets 05/06).

## Acceptance criteria

- [ ] Each of the four seams exists as its own module, importable and
      testable with no Three.js scene, no DOM and no GUI
- [ ] A headless test builds a world + Car, delivers a scripted Push intent,
      and asserts the resulting motion (roll decel ≈ μ·G for the Surface;
      a Car pushed straight does not curve; a Car given an off-centre strike
      does)
- [ ] Grip is provably per wheel: a Car straddling two Surfaces behaves
      differently on each side, and rolling from one Surface onto another
      changes grip with no special-casing anywhere (ADR-0002)
- [ ] Both surviving control schemes are Push sources behind the port; the
      winning one from 01 is the default and the loser is still switchable
- [ ] Equal input produces equal motion before and after the extraction
      (determinism check — Rapier's determinism is why it was chosen)
- [ ] No invisible state: all tuning is seeded from code, readable through one
      call, and resettable through one call (see the localStorage-lesson in
      `.scratch/v1/spec.md`)
- [ ] The prototype's old Car/world code is deleted, not left beside the new
      modules — the extracted track/rules/HUD parts may linger until 05/06
      claim them
- [ ] `pnpm build` clean; the game still runs on the target phone
