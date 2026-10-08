# 03: Grill — Track Building on a phone

Type: grilling
Status: needs-info
Blocked by: None (can start immediately)

## What to build

Answers, not code. **Track Building — drawing a Track and placing Hazards —
is a core part of the original game's fun, not setup.** That makes it the
biggest ungrilled feature in v1: the editor (ticket 09) is decided by whatever
we decide here, and an editor is one of the most expensive things to redo.

The prototype's Track is a hard-coded rounded-rectangle loop. v1 has to let a
player draw one — on a phone, with a finger, presumably while standing on the
surface they are imagining.

Questions to settle:

- **Where does the drawing happen?** On a blank top-down view (abstract
  canvas) or over the actual 3D Terrain/scene the player will race on?
- **How is a Track drawn?** Freehand stroke → smoothed centerline with
  Boundaries offset from it? Or connect waypoints? Or snap together shape
  primitives (straights, arcs)? Freehand is the most faithful to chalk and the
  hardest to make legible.
- **Scale:** is the Track drawn in real-world units on a fixed-size canvas,
  or does the player pan/zoom an infinite surface? Does a Track have a
  maximum extent (what fits on a driveway / a balcony)?
- **Closing:** must a Track be a closed loop, or are A-to-B Tracks supported
  (glossary allows both)? What if the player's stroke crosses itself?
- **What does the player place, and how?** Starting Line, Finish Line,
  Checkpoints, Hazards (Rock, Lake, Bridge), Terrain features (pebbles,
  potholes, the sidewalk drop). Tap to place, drag to size/rotate?
- **Legality:** what makes a Track invalid (too narrow, self-crossing, no
  Finish Line) and what does the editor do about it — block, warn, or allow?
- **Persistence:** are Tracks saved locally, named, shareable (export/import,
  a link)? Is there a "random Track" for players who just want to race?
- **Minimum lovable editor:** what is the smallest thing that still counts as
  Track Building? (This answer decides how ticket 09 gets split.)

## Acceptance criteria

- [ ] Each question above has a recorded answer under `## Answer`
- [ ] The "minimum lovable editor" is named explicitly — it becomes the
      first slice of ticket 09, with the rest split into follow-ups
- [ ] A concrete draw-a-Track flow is described end to end (first touch to
      "Start race") well enough that ticket 09 needs no further design
- [ ] Anything that contradicts `GLOSSARY.md` updates the glossary instead
