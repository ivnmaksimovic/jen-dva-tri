# v1 — the real game

Roadmap for **v1: stop throwing away**. Everything under
`.scratch/prototype/` is throwaway controls research; this effort is the game
that ships. The language lives in `GLOSSARY.md`.

**Status: parked behind the prototype.** Nothing here is active while the
prototype still owes us experiments. This effort has `spec.md` + `issues/`,
deliberately **no `map.md`**, so it never wins the "newest map" frontier scan
while parked.

**Granularity: coarse by choice.** Only the immediate chunk exists as ticket
files; everything further out is a one line stub below, to be grilled and split
when it comes due. (Track Building in particular may become three tickets or
thirty — we find out when we get there.)

## What v1 is

The digital adaptation of the folk game: **turn-based finger-push racing with
1:64 Cars on chalk-drawn Tracks over real Terrain**. Multiplayer, precision
over speed. Android → Play Store first.

## Decisions carried over from the prototype

Settled — do not re-litigate in v1 tickets (sources: prototype map build notes,
`docs/adr/0001-full-3d-physics.md`, `docs/adr/0002-grip-is-a-contact-property.md`).

- **ADR-0001: full 3D rigid-body physics.** Flipping Cars, potholes, drops are
  core, not decoration. Rapier (`@dimforge/rapier3d-compat`).
- **The Car is ONE rigid body** (chassis cuboid + 4 wheel spheres as one
  compound collider; wheels are visuals). Per-wheel joints rejected at 1:64
  (solver ratchets). Not permanently dismissed, but do not reintroduce without
  a feel reason.
- **Friction is hand-rolled at four wheel contact points**, not Rapier contact
  friction: colliders set friction 0 / combine-rule Min, and side grip + roll
  resistance are applied as impulses at the wheel points, capped at
  μ·(m/4)·G·dt and limited by each point's effective mass. Each of the four
  points already "knows" how its own corner is moving (`v + ω × ρ`) — which is
  why per-contact Surface lookup is a local change.
- **ADR-0002: grip is a property of the contact** — the Surface sampled under a
  wheel × that Car's tire. Never a Car field, never one global Surface per
  Track: one Track crosses surfaces (tiled balcony → concrete path → sidewalk).
  Note the gap it opens: today μ is read from `CarParams` for all four points,
  so expressing "this patch is tiled" currently means overwriting the Car.
- **Physics step 1/240 s, `numSolverIterations = 8`.** Scale-invariant problem;
  only the timestep fixes it.
- **A legal Push is a bounded gesture window (~300 ms), integrated over the
  window** — direction may change inside it. That IS the curve Push.
- **A Push strikes the Car's outer frame**, never the middle.
- **Nothing that can emerge is authored.** A side Push on a sticky Surface may
  roll a Car over: that is a target of honest physics, not a feature to build.
  No authored roll/tumble ever. (User's call, 2026-10-06.)
- **Test the web build on a real phone over HTTPS first**; Capacitor later.
- **Tuning is explicit** — seeded, readable, resettable. (Once cost an hour:
  persisted GUI tuning masqueraded as a physics bug.)

## Prototype still owes us answers

Open prototype experiments — each should answer a v1 question by building, not
by arguing (prototype tickets 12, 13, 14):

- **Two Cars have never touched.** v0 is single-Car. Every 1:64 solver problem
  so far appeared where tiny bodies meet at rest, and **multiplayer needs this**
  → prototype ticket 12, gates anything multiplayer.
- **Terrain barely exists**, and neither do multiple materials. Two questions
  inside this: (a) spatial grip across surfaces (ADR-0002), (b) **roughness —
  bumpy/bad concrete that small wheels actually feel**. Roughness is a genuine
  open bet: if it complicates everything we may decide not to ship it at all
  → prototype ticket 13 carries that decision gate.
- **Feel tuning is unfinished**, and the user still wants to experiment with
  settings. Agents do not tune by feel — it is the user's domain.

## Shape of the road ahead (coarse)

```
  proto: multi-car, materials/roughness, aim readability   ← active now
        │
        ▼
  prototype ticket 11 (push-the-phone) → 01 verdict
        │
        ├── 02 grill: race skeleton  ─┐
        ├── 03 grill: Track Building ─┤
        │                             ▼
        └────────────────────► 04 reusable core ──► 05 session & first race ──► 09 Android
                                        │
                                        ▼
                              06 data-driven Track ─┬─► 07 Hazards
                                                    ├─► 08 Terrain & surfaces
                                                    └─► 11 look & camera
                                      10 Car presets
                              ── much later ──► TRACK BUILDING MILESTONE
```

Later, kept deliberately coarse (each gets grilled and split when it arrives):

- **05 Session & Turn engine + first hot-seat race** — whose Turn, 3 Pushes,
  Reset on Out of Track, first across the Finish Line wins. Headless-testable
  state machine first, then playable.
- **06 Data-driven Track model** — Track as serialisable data (Boundaries,
  Checkpoints, Start/Finish), instead of hard-coded geometry. Prefactor for the
  rest.
- **07 Hazards as declarative features** — Rock, Lake, Bridge as table entries
  (name, chalk shape, rule), because the rules are only half-remembered.
- **08 Terrain & surfaces** — drops, pebbles, potholes, and per-wheel Surfaces
  per ADR-0002.
- **09 Android ship path** — first real Capacitor build, perf budget, permanent
  app id. Never been exercised.
- **10 Car presets** — each model handles differently (tires, mass, wheels).
- **11 Look & camera** — chalk on concrete, outdoor light, the camera the
  winning Push scheme needs.

**TRACK BUILDING (a milestone, not a feature).** Drawing a Track and placing
Hazards was necessary *and* fun as kids — the creative half of the game. v1
starts from a single hard-coded Track; Track Building arrives later as its own
milestone and will fan out into its own tickets. Everything about Checkpoints
being drawn rather than generated belongs to that milestone, not to the core.

## Deferred / half-remembered

- **Reset with owner's choice** — placing a Car anywhere behind the Checkpoint
  line, in any orientation the owner picks. Not prototype material; a later
  feature ticket (the prototype always drops it centred, facing forward).
- Bridge **Reset** semantics. **Penalise mode** (what counts as pushing another
  Car? — depends on 12's answer). Car-to-car rules beyond plain physics.
  "Mines" and other half-remembered Hazards. Licensed real cars. Camera
  experimentation beyond what ships. Sound.

## Active tickets

| NN | Ticket | Type | Status | Blocked by |
|----|--------|------|--------|------------|
| 01 | Controls verdict: pick the Push scheme | task | ready-for-human | prototype 11 |
| 02 | Grill: race skeleton — players, Turn order, start, finish | grilling | needs-info | — |
| 03 | Grill: Track Building on a phone | grilling | needs-info | — |
| 04 | Reusable core — world, Car, Surface/tire, Push port | task | ready-for-agent | 01 |

Everything else lives as the coarse list above.
