# Physics engine: Rapier, Jolt, or cannon-es?

Type: grilling
Status: resolved
Blocked by: 03

ADR-0001 committed us to full 3D rigid-body physics. Which engine?

## Answer

Resolved 2026-10-05: **Rapier** (`@dimforge/rapier3d-compat`).

Deciding facts: built-in CCD (a flicked Car crossing thin chalk Boundaries is
exactly the tunnelling failure mode cannon-es cannot guard against),
determinism (valuable for replays/ghosts later), trimesh/heightfield support.
Costs accepted: ~500 KB WASM, async `RAPIER.init()`.
