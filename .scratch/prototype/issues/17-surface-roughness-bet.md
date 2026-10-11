# 17: Roughness — does a bumpy Surface earn its complexity?

Type: research
Status: ready-for-agent
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

- [ ] A rough variant exists that is *felt* by small wheels — rolling distance
      and behaviour change **measurably** against the flat version of the same
      Surface (measure, do not assert it "feels different")
- [ ] The version built is the cheapest one that can answer the question — no
      generality bought before the answer is known
- [ ] **Decision recorded under `## Answer`:** roughness ships, ships in a
      limited form, or is dropped — with the reason, and what it cost
      (complexity, frame time, authoring effort)
- [ ] Rest stability and frame pacing on the phone hold with it on
- [ ] The user, not the agent, judges whether any of it feels right
