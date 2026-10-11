# 17: Roughness — does a bumpy Surface earn its complexity?

Type: research
Status: **done — ships in a limited form**
Blocked by: 16 (roughness rides on the per-wheel Surface sampling 16 introduces)

Split out of **14** (2026-10-10) so the grip half (**16**) can ship without
waiting on an open bet.

## What to build — an experiment with a decision gate

Rough concrete that genuinely feels bumpy to a 1:64 wheel: bad concrete, a
coarse patch, small wheels skipping over texture. This may be a big deal for
feel, and it may also complicate everything — so it is an **experiment**, not
a commitment. Build the cheapest honest version, judge it on the phone, and be
willing to answer "not worth it, drop it". **Dropping it is a valid outcome,
not a failure.**

Keep it separate from grip (**16**): **grip** is how strongly the wheel sticks;
**roughness** is the small-scale *shape* the wheel rides over. A Surface in 16
is flat-at-the-scale-of-a-wheel; this ticket asks what happens when it is not.

Non-goals: anything about how hard a Surface grips; audio; looks for their own
sake.

## Acceptance criteria

- [x] A rough variant exists that is *felt* by small wheels — rolling distance
      and behaviour change **measurably** against the flat version of the same
      Surface (`check:roughness` 1: 38 mm → 10 mm rolled, 9 frames airborne)
- [x] The version built is the cheapest one that can answer the question
- [x] **Decision recorded under `## Answer`**
- [x] Rest stability holds with it on (`check:roughness` 4: parks, drifts 0.00 mm
      over 6 s); frame pacing **on the phone is still open** — desktop numbers
      below, the user judges the rest
- [x] The user, not the agent, judges whether any of it feels right

## Answer: ships in a limited form — gravel as objects, confined to where you drive

**The bet is won on feel and lost on cost.** Two implementations were built;
the first was dishonest and deleted, the second is honest and stays small.

### Attempt 1 — bumpy rolling surface (heightfield relief): DELETED, it measured itself

`Surface.rough` in mm of relief; whenever any Surface carried relief the flat
ground slab became a Rapier **heightfield** whose grid held white noise at 2 cm
spacing, its survey pads followed the same grid, and the visible skin and the
chalk were lifted accordingly. It looked like the honest thing: there is no
bump anywhere except as geometry.

It was not honest. A **control** — a heightfield with ±0.0001 mm of relief, i.e.
geometrically flat — braked the Car **exactly as much** as ±2 mm did, and as
±0.1 mm did, at every grid spacing tried (0.1 … 4.0 units): 9/11, 11/10, 13/14,
18/19, 27/27, 26/26 mm rolled, against **38 mm** on the plain slab. The effect
was the *representation*, not the bumps — a faceted heightfield is not the same
surface as a box lid, whatever its heights say. Worse, 10% of downward probes
over it found **no collider at all** (1890/2100 hit, the rest fell through), so
even Stories about wheels touching it were unreliable. Two lessons, both now in
`map.md` build notes: **always run the flat control before believing a
measurement**, and **heightfields by their nature modify even a flat plane.**

### Attempt 2 — stones in the world: HONEST, and this is what ships

Nothing claims a shape. Real little **stones** — spheres of radius ~3 mm (with
jitter), set into the Surface so ~1.2 mm stands proud, on a jittered lattice so
there are no clumps and no bald patches — sit on the flat slab as ordinary
colliders. A Surface now carries `gravel: stones per square unit` instead of
`rough`. Measured, one push (5 N·s, 420 frames, desktop):

| stones/unit² | rolled | frames with a wheel airborne | peak \|vy\| |
|---|---|---|---|
| 0 (clean) | 38 mm | 0 | 0.000 |
| 1 | 38 mm | 0 | 0.000 |
| **4** | **10 mm** | 9 | 1.052 |
| 9 | 20 mm | 4 | 1.248 |
| 16 | 10 mm | 7 | 1.576 |
| 25 | 7 mm | 8 | 2.153 |

The mechanism is the honest one and check 2 asserts it: the wheels genuinely
**leave the ground** (0 frames clean, 7 gravelly), and an unloaded wheel grips
nothing (16's result) — no extra force was authored anywhere. Rest stability
holds: a Car parked among 25/unit² settles and then drifts 0.00 mm over 6 s.

Two things the numbers say that nobody guessed:

- **1 stone per unit² does nothing** (spacing 10 cm is far wider than a 6–10 mm
  wheel; it just rolls between them). The effect turns on between 1 and 4 per
  unit² — i.e. at **~5 cm spacing**, which is where a small wheel can no longer
  go around a stone.
- **The effect is not monotonic**: 9/unit² rolls *further* than 4/unit². Once
  the gaps are finer than the wheel can fall into, it rides the tops instead of
  dropping between them. If the user wants "worst possible concrete", the sweet
  spot is around 4/unit², and finer is *not* rougher.

### Cost — the reason this is limited, not general

Per thousand stones the broadphase pays ~0.45 ms per frame (desktop, 4 physics
steps per frame):

| what is gravelled | stones | ms/frame |
|---|---|---|
| nothing | 0 | 0.120 |
| **whole Track corridor** at 4/unit² | 1344 | 0.717 |
| whole Track corridor at 25/unit² | 8472 | 4.155 |
| **one 4-unit patch** at 4/unit² | 69 | 0.154 |

So the wall is **coverage, not density** — and check 3 asserts exactly that
(the same density over a patch costs less than an eighth of the corridor's
added cost). Whole-square / whole-loop gravel is not affordable on a phone at a
density that is felt; a **bounded bad spot** is free and is also the thing the
game actually wants (a rough stretch, not a rough balcony).

What shipped therefore: `gravel` per Surface, with the stone field **confined
to the Track corridor** (`dist < 2.2` from the centreline — nowhere a car
cannot drive gets objects nobody will ever touch, which is 90% of the squares),
GUI slider per Surface, and `check:roughness` (4 checks).

**Open, and it is the user's call:** whether any of it *feels* right on the
phone, at what density, and whether "bad spots" should become their own
placeable thing rather than a property of a Surface (a patch costs ~0.03 ms, so
a handful of them is nothing — that is the cheap next step if the feel lands).
Frame pacing on the phone is the other half of cost and has not been measured.

## For the agent

- `src/game/proto/surfaces.ts` — `SurfaceDef.gravel`, `STONE_RADIUS`, `STONE_TOP`
- `src/game/proto/world.ts` — `stonesIn()`, one body per square carrying its
  ball colliders; one `InstancedMesh` per square for the looks
- `src/game/proto/checks/roughness.ts` — the four measurements above
- Rapier note: a collider's translation is relative to its own body, so all of
  a square's stones can share one fixed body at the origin.
