# 16: Spatial Surfaces — grip resolved per wheel from what is under it

Type: task
Status: resolved
Blocked by: None (split out of the deleted 14; this was the grip half)

Split out of **14** (2026-10-10) so the two halves can move separately: this
ticket is **grip**; **17** is the roughness bet. Keeps ADR-0002
(grip is a property of the contact).

## What to build

**(a) The world has more than one Surface, and the Track crosses them.**
Today the whole world has one grip setting. Real play crosses surfaces — a
**tiled balcony onto a concrete path** — and that crossing is the interesting
part of the folk game's Terrain. Per **ADR-0002** grip is a property of the
contact: the Surface under each wheel × that Car's tire. So give the world
spatial Surfaces, sample per wheel, and let two wheels of one Car be on two
Surfaces at once. Crossing from one Surface to another must need **no**
transition code — if a transition needs handling anywhere, the model is wrong.
Today grip comes from numbers on the Car (`sideFriction`, `rollFriction`,
`angularDamping` in `CarParams`), so the whole world has one grip setting.
Give the world **spatial Surfaces** and have each wheel sample what is under
it, then combine with what that Car's tires contribute. Two wheels can sit on
two Surfaces at once; crossing a boundary must need **no** transition code.

**(b) A Track worth testing on** (user, 2026-10-10): same loop as today, but
the ground under it is **four joined squares of four different surfaces**.
It does not matter how much of the Track each square covers. One of the four
is raised as a **sidewalk** — and its height drops from today's 4 cm
(`SIDEWALK_TOP`) to **2 cm**, which is the height we test at from now on.
The existing **`testField`** switch in the mini-GUI already hides all chalk,
so it stays the way to look at the bare surfaces alone.

Non-goals (for this ticket): any surface *shape* beyond the height step —
bumps, texture, pebbles belong to **17**; surface *audio*; a full Track /
Surface authoring UI; a textures-for-beauty pass — materials only have to be
tellable apart at a glance, because that is what the feel test needs.

Keep the boundary with **17** sharp: **grip** is how strongly the wheel
sticks; **roughness** is the small-scale *shape* the wheel rides over. A
Surface here is flat at the scale of a wheel.

## Acceptance criteria

- [ ] The world can contain more than one Surface along one Track, and a Car
      crossing from one to another changes grip **because of where its wheels
      are** (not because anything tracked the crossing)
- [ ] The world contains several Surfaces and the Track crosses more than one;
      each wheel samples the Surface **under it**, independently
- [ ] A Car straddling a boundary between two Surfaces grips differently on
      each side, with **no special-casing anywhere** — verified headlessly if
      at all possible (`pnpm check:...`), otherwise on-device
- [ ] Grip comes from the contact, not from the Car: the same Car behaves
      differently on two Surfaces without its own parameters changing
- [ ] Ground under the Track = four joined squares, four different Surfaces,
      visually distinct enough to say which one a wheel is on
- [ ] One square is raised **2 cm** as a sidewalk (was 4 cm); the Track can
      get onto it the way it does today (existing ramps, at the new height)
- [ ] `testField` still gives bare surfaces, no chalk, no rules
- [ ] Rest stability and frame pacing on the phone hold
- [ ] The user, not the agent, judges whether any of it feels right

## Answer

**Built and measured 2026-10-10.** Grip is a property of the contact now: each
of the four wheel points asks what Surface is under it once per frame, and
grips `surface.grip × tire.grip` (and `surface.roll × tire.roll`). Nothing
anywhere remembers a Surface or handles crossing one, which is the entire
mechanism — and check 3/4/5 below show it working rather than assert it.

Numbers, all measured (`pnpm check:surfaces`):

- Same Car, nothing about it changed: **rolls 38 mm real on Asphalt, 63 mm
  half-and-half, 121 mm on Glass** — the grip came from where the wheels were.
- A Car straddling a boundary reports **two Surfaces at once** (`Concrete |
  Concrete | Asphalt | Asphalt`), so there is nothing to transition.
- A wheel with nothing under it grips nothing: 14 frames of free flight keep
  **98.8%** of their speed; the same 14 frames rolling keep **79.9%**.
- Per-wheel grip cost **nothing extra**: ~0.138 ms per frame for physics plus
  four casts. The feared rewrite (four jointed wheels) was never needed.
- The 2 cm sidewalk is climbable over the two worn ramps without launching
  the Car, and `terrainY` (what drawing reads) agrees with the physics to
  **0.02 mm**.

Two corrections to what was said while planning, now recorded in the map:

1. **A straddle does not steer.** The grip pool is shared by four points of one
   rigid body, so the available grip is the MEAN of the Surfaces under the
   wheels — the Car rolls like both, strictly between them. Left/right torque
   would need wheels that are separate bodies carrying their own load (Car v1,
   already rejected). Nothing was faked to make this look otherwise.
2. **A Car hanging half over a curb does NOT lose grip.** The load follows the
   contacts that are down, so the wheels still touching carry the whole weight.

The one thing this ticket cannot answer is whether the four Surfaces *read* on
the phone. That is the user's call, with `testField` on and the per-wheel
readout in the HUD.

Context: see Decisions-so-far in `.scratch/prototype/map.md` (ticket 16 entry,
including the seam artifact and the two-layer fix that ended it).

## Comments

### Settled before building (2026-10-10, user)

1. **Square layout: a 2×2 grid.** The whole ground splits into four quadrants
   meeting at one point near the loop's centre, so the Track crosses all four
   and all four touch at one corner — the cheapest place to park a Car
   straddling two (or four) Surfaces at once. It does not matter that each
   square covers a different amount of Track.
2. **The raised square keeps today's two ramps, at 2 cm; every other edge is a
   hard curb you have to go around.** Real constraint behind this: 1 unit =
   10 cm and the wheels are 0.6–1.0 cm in *radius*, so even 2 cm is a wall
   about one full wheel **diameter** tall — a 1:64 car cannot climb a curb at
   any speed. Today's two worn ramps (x ≈ 6.5 and x ≈ 17, at the ends of the
   stretch where the Track runs along the sidewalk) stay; the rest of the
   edge is genuine Terrain, not a slope.
3. **The four Surfaces: Asphalt, Concrete, Tiles, Glass.** (Replaces the old
   preset names in the GUI — see below.) None of them is "rough": roughness
   is **17**'s question and must not be baked into grip's test setup.

### Still open (2026-10-10) — grilling the user

4. **Where the grip numbers live once Surfaces are real.** The per-Car
   "Surface (this Car)" dropdown has to stop being the mechanism (ADR-0002: a
   Surface is not a preset writing into the Car). What replaces it is a design
   question, not a tidy-up — see the grilling exchange below.
   Filed here when settled; nothing is built against it until then.
