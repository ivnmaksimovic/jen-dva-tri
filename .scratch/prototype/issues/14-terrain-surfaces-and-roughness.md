# 14: Terrain surfaces — spatial grip and the roughness bet

Type: task
Status: ready-for-agent
Blocked by: None (can start immediately)

## What to build

Two things the prototype has never had, and one honest decision attached.

**(a) Surfaces the Track actually crosses.** Today grip comes from numbers on
the Car, so the whole world has one grip setting. Real play crosses surfaces: a
tiled balcony onto a concrete path. Per **ADR-0002** grip is a property of the
contact — the Surface under each wheel × that Car's tire — so give the world
spatial surfaces and have each wheel sample what is under it. Two wheels can be
on two surfaces at once; crossing from one to another must need no transition
code.

**(b) Roughness — an open bet, not a commitment.** Rough concrete that genuinely
feels bumpy to a 1:64 wheel: bad concrete, a coarse patch, small wheels skipping
over texture. This may be a big deal for feel, and it may also complicate
everything — so treat it as an **experiment with a decision gate**: build the
cheapest honest version, judge it on the phone, and be willing to answer
"not worth it, drop it". Dropping it is a valid outcome, not a failure.

Keep grip and roughness separate: **grip** is how strongly the wheel sticks;
**roughness** is the small-scale surface shape the wheel rides over.

Non-goal: a full Track authoring UI; looks and materials beyond what the feel
test needs (no textures-for-beauty pass); surface *audio*.

## Acceptance criteria

- [ ] The world can contain more than one Surface along one Track, and a Car
      crossing from one to another changes grip because of where its wheels are
- [ ] A Car straddling a boundary between two surfaces grips differently on
      each side, with no special-casing anywhere — verified headlessly if at
      all possible, otherwise on-device
- [ ] Grip comes from the contact, not from the Car: the same Car behaves
      differently on two surfaces without its own parameters changing
- [ ] A rough variant exists that is *felt* by small wheels (rolling distance
      and behaviour change measurably against the smooth version)
- [ ] **Decision recorded under `## Answer`:** roughness ships, ships in a
      limited form, or is dropped — with the reason, and what it cost
- [ ] All of it holds rest stability and frame pacing on the target phone
- [ ] The user, not the agent, judges whether any of it feels right
