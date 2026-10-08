# 02: Grill — the race skeleton (players, Turn order, start, finish)

Type: grilling
Status: needs-info
Blocked by: None (can start immediately — the frontier of this effort)

## What to build

Answers, not code. The prototype is solo: one Car, one Track, no opponent, no
race. The real game is multiplayer, and the shape of a race is unsettled. This
grilling session settles the skeleton that the session engine (ticket 05) is
built around. These questions are cheap to answer now and expensive to
reverse later — a Turn/Turn-order model baked into the core is a wide blast
radius change afterwards.

Questions to settle (the user's memory of the folk game is the source of
truth; the agent's job is to press for the specific cases):

- **How many players?** Minimum 2? A fixed max (4?)? One device passed around
  (hot-seat) for v1, or networked/online? Hot-seat is the smallest real
  multiplayer; online is a much later question and should be named as such.
- **Who pushes first?** Youngest, agreed order, rock-paper-scissors, order
  of arrival at the Start? Is the order fixed for the whole race?
- **Race start placement:** all Cars on the Starting Line at once, or does
  each Car start from the Starting Line on its own first Turn (so player 1
  is ahead when player 2 starts)? Where along the line, and does the owner
  choose (as with a Reset)?
- **What is the race?** One lap to the Finish Line, or N laps? A-to-B Track
  vs loop — both in `GLOSSARY.md`; do we ship both?
- **Turn handover:** strictly alternating, or does a player get to keep
  pushing after a penalty? What happens to the remaining Pushes when a Car is
  **Reset** mid-Turn (Out of Track on Push 2 of 3) — does the Turn end
  immediately, or continue with the remaining Pushes?
- **Car-to-car:** plain physics contact is the default (pushing another Car
  is legal). Does v1 need the penalise mode, or is that a rules variant for
  later?
- **Winning:** first across the Finish Line. What breaks ties / what if a Car
  is Reset past the Finish Line?

## Acceptance criteria

- [ ] Each question above has a recorded answer under `## Answer`
- [ ] Unanswerable ones are explicitly deferred with a note on why, and land
      in `.scratch/v1/spec.md`'s deferred list (or the prototype's Fog if they
      are rules fragments still half-remembered)
- [ ] The answers read as **state**, not prose: enough for ticket 05 to
      implement a Turn state machine without re-asking ("whose Turn",
      "Pushes left", "when a Push is legal", "who has won")
- [ ] Anything that contradicts `GLOSSARY.md` updates the glossary instead of
      the answer
