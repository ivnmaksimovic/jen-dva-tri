# Physics seam: 2D simulation with 3D rendering?

Type: grilling
Status: resolved
Blocked by: (none)

Gameplay is physically a flat plane (cars roll on concrete). Full 3D
physics, or 2D rigid-body physics with 3D presentation on top?

## Answer

Resolved 2026-10-05: **full 3D physics — ADR-0001.** The game should be
almost a simulation of the real one: pebbles, potholes, road bumps, cars
flipping were not uncommon; tracks could even run down a 4 cm drop from
sidewalk to road. 2D was rejected despite being simpler.

Consequence: physics engine choice is now a real decision — ticket 06.
