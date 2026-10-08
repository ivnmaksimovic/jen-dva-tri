# 15: A finger can only press — no pulling a Car

Type: task
Status: resolved
Blocked by: (none)

## What to build

You can currently **pull** the Car: touch it, drag away from the body, release —
and it comes toward you. That is impossible in the real game, and nothing about
the controls should teach it.

From `GLOSSARY.md`, a **Push** is *a brief strike against the Car with the side
of a bent index finger*. Such a finger can press; it has no grip. So there is no
pulling, and there never was a reason to allow it.

The rule (user's, and it is the honest one): **if the strike line does not go
into the Car, nothing happened** — you swung your finger past it in the air. The
readable version of that is exactly what the aim arrow already draws: *does the
arrow pass through the Car?*

Consequences agreed before building:

- No impulse. Nothing moves.
- **No Push spent.** In Lap Challenge a wasted air-swing must not cost one of
  the Turn's three Pushes — you did not use one.
- The rejection must be visible **before** release, not discovered by releasing
  and seeing nothing happen (that reads as a broken control, not as physics):
  the aim arrow turns red while the gesture could not be a Push.

Non-goal: changing Push strength or any other feel number.

## Decisions taken while building

- **Legality is asked exactly where the finger lands** — the same point the
  marker draws. This was an explicit carve-out while `curveFactor` existed
  (the marker could sit inside the body, where every arrow visually crosses
  it); with that knob removed the exception disappears on its own.
- **Tested against the chassis footprint only, never the wheels.** Wheels stick
  out past the chassis (WHEEL_Z + r ≈ 0.185 vs 0.1), so pulling outward from a
  side would "hit" a wheel and wrongly count. A finger skating over a wheel has
  not struck the frame.
- **"Goes into the Car" = stepping 0.1 mm along the strike line lands strictly
  inside the footprint** (`Car.pushesFrom`). A line parallel to the frame lands
  ON the outline and so is a skid, not a Push.
- `PUSH_BITE` (that 0.1 mm) is a probe, not a feel number: it exists because the
  strike sits ON the outline where inside/outside are undefined. Sized against
  the only thing it could disagree with — asking at distance zero — i.e. how
  close to a corner the strike can be before the step leaves the footprint
  sideways. Was 2 mm (10% of the Car's width); lowered 2026-10-08.
- **Glancing strikes are left alone** (unresolved by design): a line that
  skims into the body still delivers the full impulse, where a real finger would
  skid off and deliver almost nothing. Scaling impulse by how square the strike
  lands is a feel change and belongs to the user, not an agent.

## Implementation

- `Car.pushesFrom(framePoint, direction)` — next to `clampToFrame`, because the
  two are one idea: where you may strike, and which directions count as a Push.
- Slingshot: arrow colour (white = Push, red = not), plus the release gate.
  Nothing else in the control scheme changes.

## Acceptance criteria

- [x] Dragging away from the Car does not move it, and does not spend a Push
- [x] The aim arrow turns red while the gesture could not be a Push
- [x] Any strike that goes into the body still works — every direction
      (nose-on, sideways, backwards) — with motion unchanged
- [x] A short informational flash explains the rejection on release
- [x] Verified in the browser against synthetic pointer gestures

## Answer

Built 2026-10-08.

**Verified** (synthetic pointer gestures, canvas pixel readback + impulse
interception — no screenshot trust, see the map's verification note):

| | Pull (drag away from the body) | Push (drag into the body) |
|---|---|---|
| arrow while aiming | 160 red px, no white arrow | 418 white px, 0 red |
| impulse applied | **none at all** (not even friction-scale) | 2.23 |
| Car movement | 0 | rolls |
| Lap Challenge counter | **stays 3** | 3 → 2 |

Legitimate strikes are untouched: `Car.pushesFrom` sampled 24 directions off
all four faces and accepts exactly a **180° half-plane** at each — every
strike that presses inward counts, including backwards off the nose.

**Verdict 2026-10-08 (user): glancing strikes deliver the full impulse, full
stop.** Left deliberately unrealistic — a real finger would skid off and
deliver almost nothing. Recorded as a possible gameplay exploit to revisit
LATER, not now: if players ever farm a shove out of a barely-touching graze,
that is the moment to look at it. No code change; the behaviour of today is
the intended behaviour.

## Comments

Raised by the user 2026-10-08 after ticket 11 landed.
