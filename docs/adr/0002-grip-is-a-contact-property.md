# Grip is a property of the contact, not the Car

Date: 2026-10-06
Status: accepted (supersedes part of the friction model described in the
prototype map's "feel pass 2" build notes; ADR-0001 untouched)

## Context

The v0 prototype (feel pass 2) introduced distributed Coulomb friction at the
four wheel contact points and shipped it as **numbers on the Car**: every Car
carries `rollFriction`, `sideFriction` and `angularDamping`. Surfaces were then
modelled as *presets* — named bundles that overwrite those Car numbers when
picked in the GUI.

That shape is wrong for the game we are building. Terrain and Surface are part
of the folk game's feel, and **a single Track crosses surfaces** — a Track can
run from a tiled balcony onto a concrete path, then onto a sidewalk. Grip is a
property of the **pair** (what the wheel is made of × what it is standing on),
so:

- Two wheels of one Car can be on different Surfaces at the same time.
- The same Car must get grippier the moment it rolls onto concrete.
- Conversely two different Cars on the *same* Surface must differ only by their
  tires, not by a whole friction model.

Keeping friction on the Car cannot express any of that without special-casing
the transitions.

## Decision

**Friction is resolved per wheel at the contact**, from two independent inputs:

- the **Surface** under that wheel — a spatial property of the world, sampled
  per contact point, not a global run setting;
- the **tire** — what the Car contributes (its wheels, per `CarParams`).

The Surface is therefore **not** a preset that writes into the Car, and there is
no single "current Surface" for the whole Track. Grip varies along a Track and
within a single Car's footprint.

This keeps ADR-0001 and the distributed wheel-contact friction intact — it only
relocates where the numbers come from. The existing presets survive as
*authoring convenience* for naming a Surface, never as the mechanism.

## Consequences

- The point where grip is computed is the contact, per wheel, per step — so the
  Car no longer owns a complete friction model.
- Transitioning between surfaces must need **no** transition code: a wheel
  samples what is under it.
- Car-to-Car differences are now only tire differences; comparing two Cars means
  comparing them on the *same* Surface.
- Tuning gets two axes (Surface, tire) where v0 had one — any "which preset is
  the Car on?" debugging must account for position, not just assignment.

## Rejected

- Keeping grip on the Car and adding per-Track-section overrides — reintroduces
  the very coat-rack special cases this removes, and cannot express two wheels
  on two surfaces at once.
- One global Surface per Car (nearest-section wins) — wrong the moment a Car
  straddles a Boundary between two surfaces, which is exactly where the folk
  game gets interesting.
