# Full 3D physics simulation

The game is a near-simulation of a physical folk game played on real terrain:
pebbles, potholes, bumps, and drops between surfaces at different heights
(e.g. sidewalk → road), on which 1:64 cars bounce and even flip. We rejected
the simpler "2D physics + 3D presentation" architecture in favour of a full
3D rigid-body simulation because the terrain's vertical dimension is core to
the original game's feel, not decoration.

## Considered Options

- 2D rigid-body physics with 3D rendering — rejected: cannot express flipping
  Cars, potholes, or multi-level Terrain.
- Full 3D rigid-body physics — accepted.
