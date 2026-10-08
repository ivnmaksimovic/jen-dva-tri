# 12: Multiple Cars in the prototype

Type: task
Status: ready-for-agent
Blocked by: None (can start immediately)

## What to build

Put **more than one Car on the Track at the same time**, and find out what
happens at 1:64 when tiny bodies meet.

The prototype has only ever simulated one Car. The real game is multiplayer,
and every piece of solver trouble so far has appeared exactly where small
bodies interact at rest: v1's four jointed wheels ratcheted into vibration and
creep until the Car became one compound rigid body. Nothing tells us that two
of those compound bodies resting against each other behave any better — and if
they do not, that changes what multiplayer can be. This is a question to answer
by building, not by arguing.

- Spawn several Cars in the prototype (at minimum two), each independently
  Pushable, each still subject to the rules that exist today
- Cars collide with **plain physics** — pushing another Car is legal, which is
  the default rule from the grilling sessions
- Whatever enables/is enabled by several Cars existing: picking which Car you
  are about to Push, seeing whose Car is whose, Turn/Push counting surviving
  across more than one Car if the modes ask for it
- Each Car settles to rest honestly next to another Car, touching

Non-goal: networking, AI opponents, scoring, car-to-car penalty rules, a second
control scheme. The one question: **do several Cars behave?**

## Acceptance criteria

- [ ] Two Cars can be placed on the Track, visible and distinguishable, and
      both rest stably side by side without jitter or creep
- [ ] Pushing one Car into another transfers motion plausibly and both Cars
      come to rest — no vibration, no launching, no sinking, no endless rolling
      at the settled timestep (1/240, 8 solver iterations)
- [ ] A Car resting against another can be Pushed away (initial contact does
      not lock it)
- [ ] The player can Pushes a chosen Car, and it is unambiguous which Car is
      being aimed at
- [ ] Push counting (3-Push Turn in Lap Challenge) still behaves with more than
      one Car in play
- [ ] Frame pacing holds on the target phone with several Cars live
- [ ] Findings recorded here under `## Answer`, especially anything that needs
      a change to the single-body Car model — that is the real output
