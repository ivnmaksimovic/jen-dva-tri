# Visual Direction: Jen Dva Tri

## Status

| | |
|---|---|
| **Version** | 1.0 |
| **Owner** | Design (agent), with the look numbers owned by the player |
| **Date** | 2026-10-31 |
| **Approval state** | Direction approved by the brief; every number in it is a **default**, not a law. The player owns the feel and the look numbers — they live in the GUI. |
| **Target deliverables** | Real-time 3D game, Android (Play Store) first, iOS to follow from the same build. Portrait phone first. |
| **Implementation** | `src/game/proto/palette.ts`, `textures.ts`, `chalk.ts`, `look.ts`, plus `car.ts`, `track.ts`, `world.ts`, `hud.ts`, `src/style.css`. |
| **Measured on** | 390 × 844 CSS px @ DPR 2 (780 × 1688 capture), desktop Chromium (SwiftShader), ACES tone mapping, sRGB output. |

---

## Direction thesis

> **Make the phone feel like looking down at your own pocket-sized world: chalk is drawn by a hand, not by a renderer, so every line wobbles and skips; the Cars are small painted toys with glass and rubber; and one honest afternoon sun leaves a shadow you can read.**

*Communication intent:* "this is a real, handmade game that happens in the real world — your finger actually touches a tiny car."
*Visual tension:* a physically simulated world (real scale, real shadows, real grip) carrying **hand-made marks** (chalk that wobbles, skips, and is pressed by a hand).
*Behavioural rule:* **every mark on the ground is drawn, not manufactured** — but nothing else pretends to be hand-made. The Cars are manufactured objects (crisp paint, moulded glass, turned rubber tyres) and that contrast is the whole point.

---

## Brief interpretation

**Audience.** Mobile players, 8+, social and party contexts. Played one-handed, outdoors, in daylight, often on a balcony or a pavement. Secondary: desktop, for development and for the two-finger camera controls.

**Message.** The game is a *thing you do with your hands*, not a thing you watch. The visual job is to make a 1:64 car feel like an object you could put your finger on, and to make the Track feel like something a person drew.

**The player's response we want.** "That looks like *my* game." Then: "I can see where the track goes." Then: "I can tell which car is mine."

**Constraints (real, not imagined).**

| Constraint | Consequence for the direction |
|---|---|
| Android first, portrait phone | Every contrast and size test is done at 390 CSS px wide. The interface must survive a 3.5-inch phone at arm's length. |
| The app runs inside a Capacitor WebView, offline | **No web fonts, no downloaded assets.** Typography is a system stack; every texture is generated in code at startup. |
| The device pixel ratio is clamped to 2 | Textures are sized in *millimetres of real world*, not in pixels, so the art does not change with density. |
| The prototype's physics and rules are the player's domain | The look may not change a single physics constant. Grip, mass, timestep and feel are untouched by this work. |
| Draw calls are a phone budget | The look is built to a budget, and `pnpm check:look` guards it. |
| The Track can be enormous (the camera zooms ×60) | The world must not have a visible edge at any zoom. |

**Unresolved assumptions (reversible, stated rather than hidden).**

1. The game is assumed to be played in **afternoon daylight**. If the real setting turns out to be evening, the light rig is a parameter set, not a rewrite.
2. The four Surfaces are assumed to be **a test bench**, not the shipping world: a concrete apron with four sample squares laid on it. The direction treats the Surface boundaries as *material changes with a visible seam*, not as a designed venue.
3. The player is assumed to be **holding the phone in one hand**; the interface therefore hugs one corner and the opposite corner stays clear for the gesture that owns the screen.
4. Multiplayer HUD needs (several players' Turns at once) are assumed to be a v1 problem. The current slate carries one Car, one Turn.
5. **No licensed car models or reference photography** were supplied or used. Every texture in the project is generated procedurally from noise.

---

## References and originality

### Reference ledger

No external reference images, photographs, artwork or brand assets were supplied for this work, and none were fetched. The reference set is therefore **first-party and in-world**: the game's own premise, recorded in `GLOSSARY.md`, plus the observed behaviour of the real materials the premise names.

| ID | Source | Owner / rights | Intended use | Observed evidence | Transferable mechanism | Identity-bearing details excluded |
|---|---|---|---|---|---|---|
| R-1 | `GLOSSARY.md` — the folk game "1-2-3" | The project's own text | The complete subject and vocabulary | "a chalk-drawn track on hard surface (concrete)"; "a solid white triangle"; "an ellipse with a diagonal-line hatch"; "a strip … chalked with diagonals in both directions"; 1:64 model cars | **Marks are drawn, not built.** Every hazard is a shape a hand could make with one stick, and the vocabulary fixes their exact silhouettes. | The exact hazard drawings are the game's own invention and are reproduced from the glossary, not copied from any source. |
| R-2 | The premise's objects | n/a | Material and scale logic | Cars are 1:64 die-cast models: painted body, a glasshouse, rubber tyres, metal hubs, a hard plastic bumper | **Small manufactured objects read by silhouette and two-tone**, not by surface detail. A 1:64 car is 4.5 cm long; the readable features are the cabin, the stripe, the tyres and the shadow. | No die-cast manufacturer's markings, casting lines, packaging or proportions are reproduced. The car geometry is built from first principles to the project's own dimensions. |
| R-3 | Chalk on concrete (observed physical behaviour) | n/a | The hero material | Chalk is a band of deposited powder, not a line: it has width, it skips where the stick lifts, it gathers at the edges, and it leaves a slightly darker rim where it displaces the surface | **A mark is (width × grain × pressure × wobble).** All four are observable properties of chalk and all four are implemented. | — |
| R-4 | Sunlit outdoor paving (observed physical behaviour) | n/a | Ground, light and scale | Sunlit concrete is a mid value with a fine aggregate tooth and cut joints; its value depends on the day, not on the game | **The ground must carry scale cues.** Cut joints every 80 cm and visible aggregate give the eye a ruler, so a 4.5 cm car reads as tiny. | No specific paving product, pattern or landmark is reproduced. |

**Originality pass.**

- *If R-1 were hidden, would the system still follow from the brief?* **Yes.** The thesis is derived from the premise (a hand-made game about toy cars on a real ground), not from the look of any reference. There is no third-party reference to hide.
- *Does one reference dominate more than one identity-bearing layer?* R-1 owns the **mark vocabulary** only; R-2 owns the **object language** only; R-3 owns the **material behaviour** of the chalk only; R-4 owns the **ground and scale** only. No layer is shared, and no layer is taken from a single source wholesale.
- *Does the result imply affiliation with another source or brand?* **No.** The palette, the light rig, the interface material and the car design are derived here. There is no logo, no trade dress, no signature palette and no reproduced layout.
- *Could a reviewer identify one supplied reference as the visual template?* There are no supplied references to identify.

**Mechanisms adopted vs. surfaces rejected.** Adopted: *marks are drawn* (R-1), *silhouette and two-tone over detail* (R-2), *width × grain × pressure × wobble* (R-3), *the ground carries the scale* (R-4). Rejected and recorded as decision history: the fantasy of coloured chalk (the glossary fixes the marks as white; only the selection ring is coloured, and it is interface, not world).

---

## Visual grammar

### Invariants

These hold in every frame, at every zoom, on every Surface. If a change breaks one, it is a defect, not a variation.

1. **One sun, one sky, one shadow direction.** Every lit surface agrees about where the light is and which way shadows fall.
2. **Chalk is the only white in the world, and it is the highest-contrast element on the ground.** Chalk is hand-drawn: grain, skips, and a wobble in the path.
3. **The Cars are the only saturated colour.** They read as painted toys with a glasshouse, rubber tyres and metal hubs — never as flat blocks.
4. **The ground is warm-neutral and low-saturation.** It never competes with a Car for attention.
5. **Everything that touches the ground leaves a contact shadow.** Nothing floats.
6. **The scale is legible.** The ground carries a ruler (cut joints, aggregate), so the Cars read as small.

### Controlled variables

| Variable | Range | Default | Note |
|---|---|---|---|
| Chalk band width | 4–15 mm real | **7 mm** | Width is world-space, so it does not change with zoom. |
| Chalk opacity / grain | 0.6–1.0 / skip density | **0.95 / sparse** | Skip rate is biased so skips are rare. |
| Sun elevation / azimuth | 30–60° elevation | **~45°, from the car's right shoulder** | The sky texture and the directional light share one vector, so they cannot disagree. |
| Sun intensity | 2.0–4.5 | **3.6** | |
| Sky / environment intensity | 0.2–1.2 | **0.42** | Below ~0.6 the skylight starts to out-colour the sun and every white surface turns blue. |
| Exposure | 0.6–1.6 | **1.0** | ACES filmic. |
| Haze | 0–1.5 | **1.0** | Anchored to camera distance, not to absolute depth. |
| Car paint hue | any | **red / blue / green set** | All three sit in one value band so they read as a set. |
| Shadow frustum half-width | 11–30 units | **follows camera distance** | A 1:64 car only casts a readable shadow if the map is not also covering thirty metres of ground. |
| Contact-shadow strength | 0–1 | **0.85** | |

### Exceptions

- **The selection ring** is coloured (the Car's own paint) and sits on a dark bed. It is interface, not a world mark. This is the only coloured mark on the ground.
- **The strike marker** floats above the Car and fades over 2 s. It is a UI overlay drawn in the world space.
- **The tuning panel** (lil-gui) is a developer tool. It is not part of the game, it is collapsed by default in captures, and it has a single small ⚙ toggle.

### Anti-patterns

- Neon, cyberpunk, or rim-lit anything.
- Glossy black showroom car paint.
- Full-frame colour washes (orange & teal), bloom used as a mood rather than as an effect.
- Tilt-shift / fake bokeh as the primary device.
- Distressing every surface equally — an imperfection budget, not a maximum.
- Flat, pure-white, perfectly smooth chalk (the failure this whole system exists to fix).
- UI that renders as default browser buttons.
- Colour as the only carrier of state.

---

## Systems

### Colour and contrast

**Roles, not values.** The token table below is authoritative; no other file may hold a hex for these roles.

| Pair | Measured on the render | Target | Status |
|---|---|---|---|
| Chalk `#E0DED7` on Concrete `#6A6861` | **4.26 : 1** | ≥ 3 : 1 (graphical object carrying game information) | **PASS** |
| Chalk on Asphalt | **7.49 : 1** | ≥ 3 : 1 | PASS |
| Chalk on Tiles | **5.85 : 1** | ≥ 3 : 1 | PASS |
| Chalk on Glass | **6.19 : 1** | ≥ 3 : 1 | PASS |
| UI chalk `#F2EFE4` on the slate panel (rendered `#242728`) | ≈ 9.0 : 1 | ≥ 4.5 : 1 | PASS |
| UI dim `#B6B4AA` on the slate panel | ≈ 7.2 : 1 | ≥ 4.5 : 1 | PASS |
| UI accent `#E4B657` on the slate panel | ≈ 9.3 : 1 | ≥ 4.5 : 1 | PASS |

**Method.** Measured, not estimated: a rendered frame is sampled along a scan line that crosses a chalk mark; the brightest run is the chalk and the darkest adjacent run is the Surface; the ratio is computed with the WCAG 2.2 relative-luminance formula. The script lives outside the repo (`/tmp/jdt-capture/contrast.py`) because it needs an image, not the app.

**Two failures this system already caught, and their repairs.**

1. *Chalk on concrete measured **1.87 : 1**.* The chalk was a mid-grey stripe. Repaired by moving the chalk up (near-white albedo + an emissive floor) and the ground down, because the tone curve compresses whites hard and a chalk line on sunlit concrete is otherwise a grey stripe. The line is the game's information; it has to win.
2. *The score joint read as a 13 mm black bar.* Repaired by cutting it to ~3 mm and 0.7× value. A cut in concrete is a cut, not a painted line.

**Rules.** Colour is never the only carrier of state: the selection ring is colour **and** position **and** a ground mark; the Surface readout is a colour dot **and** a name; the Push count is pips **and** a position.

### Typography

**Families.** No web fonts: the app must run offline inside a WebView.

| Role | Family | Weight / size | Tracking | Notes |
|---|---|---|---|---|
| Display / labels | `system-ui, -apple-system, 'Segoe UI', Roboto` | 650 / 15 px | 0.01em | The Car's name. Sentence case. |
| Interface labels | same | 600 / 11.5 px | 0.02em | "Sandbox", "Lap". |
| Telemetry | `ui-monospace, 'SF Mono', 'Roboto Mono', Menlo` | 400 / 9–11 px | 0 | Tabular figures. Lap time and Surface names must not reflow as digits change. |
| Debug readout | same mono | 400 / 9 px | 0 | Per-wheel Surface. |

**Rules.** Minimum rendered size 9 px is the *floor* and only for the debug readout; nothing a player must act on is below 11 px. Maximum one display string and three labels in any frame. Labels are live DOM text — never baked into a texture.

**Known gap.** A bespoke chalk-marked display face would suit the fiction, but it would need a licensed font file shipped in the bundle. Not done in the prototype; recorded as the first thing to add when the real game starts.

### Composition and layout

- **The game is the picture; the panel is a label on it.** The slate occupies the top-left corner, the actions the bottom-right, and the opposite corner stays empty for the player's thumb.
- The slate is ≤ 222 px wide and ≤ 120 px tall at 390 px width — under 15 % of the screen.
- **The panel never covers the Track.** The player's own framing decides what matters; the interface stays out of the way and is collapsible (the tuning panel) or dismissible (the toast).
- Focal hierarchy: **Cars → chalk marks → ground → interface**. Nothing on the ground may out-contrast a Car except the chalk, which is information.
- Horizon and eye-line: the camera can look from straight down to 83° off vertical. At any angle, one dominant mass (the track or the Car) and a generous negative space around it.
- The message toast is centred at the bottom, because that is where the player's thumb is not.

### Texture and material

| Surface | Material properties | Grain / imperfection budget | Scale cue |
|---|---|---|---|
| **Chalk** | Deposited powder: matte, near-white, a thin dark rim where it displaces the surface | **Isotropic static.** 32 texels across the 7 mm band and 2048 along 60 cm of mark, so a texel is about the same size in both directions. Density clumps, per-texel grain, and holes where the stick lifted. The edge wanders along the mark, each side differently | Its own width (7 mm, ±40 %) |
| **Concrete** | Warm mid grey, fine aggregate, a faint wear pattern | Very low-frequency variation kept to ±8 % of value; the first version spread it to ±40 % and read as clouds on a wet floor | **Cut joints every 80 cm**, ~3 mm wide |
| **Asphalt** | Cool dark grey, coarse chip, polished wear | Sparse exposed aggregate, not stars (contrast capped at 1.24×) | Aggregate grain |
| **Tiles** | Weathered ochre paving, 20 cm slabs | Narrow grout (a joint, not a border); per-slab tone from the batch; chipped corners | Slab grid at 20 cm |
| **Glass** | Framed panes — 40 cm panes, 12 mm frames, satin (roughness 0.22) | Smear and dust on the pane | **The frame grid.** A frameless mirror at this angle is indistinguishable from a lake |
| **Car paint** | Toy paint: base coat under a clear coat (roughness 0.42, clearcoat 0.85) | None. Manufactured objects are not distressed | — |
| **Car glass** | Tinted, smooth, clear-coated | None | — |
| **Tyres / hubs** | Rubber (rough, near-black) against bright metal hubs | None | — |

**The chalk's imperfection lives in the TEXTURE, and the texture must be anisotropic on purpose.** A chalk mark is a 7 mm band running for metres: on screen that band is roughly 26 pixels across and thousands of pixels long. A square texture mapped onto it is therefore minified about twenty times *across* the band (blurring the edge into mush) while magnified *along* it. So the texture is 32 wide and 2048 tall, with a tile covering 60 cm of mark.

**And the two axes must have the SAME physical texel size, or the noise stops being noise.** This was found by the player, not by inspection: with a 0.1 mm texel across the band and a 0.6 mm texel along it, per-texel noise was not static at all — it was *thin strings running along the line*, because the noise only changed every 0.6 mm along the mark and every 0.1 mm across it. Matched at ~0.25 mm, it is the "TV no signal" the mark wants to be.

**A noise lattice finer than about four texels shows as a comb.** Value noise interpolates linearly between lattice points, so at two or three texels per cell the interpolation itself becomes a visible triangle wave. The rule the textures follow: anything *smooth* uses cells of eight texels or more, two octaves; anything *fine* is per-texel white noise, which has no lattice to show.

**The geometry's job is only the slow swell of the stroke.** The texture carries the ragged edge, the powder and the holes — high-frequency detail, which tiles invisibly. A stroke's width swelling over tens of centimetres is the one thing a tiling texture cannot hold without the repeat showing, so that stays in the geometry, where it does not tile at all.

**Imperfection budget.** Only the **chalk** and the **ground** are imperfect. The Cars are manufactured and stay crisp. That contrast is the thesis: hand-made marks on a real surface, machined toys on top of it.

**Texture generation.** Every texture is a `DataTexture` built from deterministic value noise at startup — no canvas, no image files, no network. This is deliberate: the old ground textures were canvas sprites whose pixels were *sub-pixel at the world scale they were mapped to*, so the ground rendered as a flat colour field. Texel density is now specified in millimetres of real world. It also means the whole art pipeline works offline in the WebView and headlessly in Node, where `pnpm check:look` builds the entire world.

### Lighting

**The rig is one sun, a sky bounce, and a dim fill.** No more, no less.

| Source | Direction | Colour | Intensity | Shadows |
|---|---|---|---|---|
| Sun | ~45° elevation, from the car's right shoulder | `#FFF5E4` | 3.6 | Yes — the only caster |
| Sky bounce | Hemisphere, cool above / warm ground below | `#9EC4E8` / `#8A8275` | 0.40 | No |
| Fill | Opposite the sun, low | `#A8C4DE` | 0.45 | No |

**Why the fill exists:** without it the shadow side of a Car is a silhouette. **Why the hemisphere is weak:** a strong skylight plus a bright sky environment made the chalk *cold blue*, because the skylight was doing as much work as the sun. In real daylight the sun is roughly five times the skylight, and that ratio is the entire colour of the scene.

**Shadows.** The shadow frustum follows the camera's target and its size follows the camera's distance (11 → 30 units). At the default framing one shadow texel is about a millimetre and a 4.5 cm Car casts a shadow you can read; zoomed out to the whole test ground the Cars are too small for their shadows to matter. On top of that, **every Car gets a soft contact smudge** — a radial decal skewed away from the sun and stretched along it. A shadow map cannot resolve a 1:64 car across thirty metres of ground; the smudge is what actually puts the Car *on* the ground.

**Forbidden.** No frontal ring-light catchlight; no shadow direction that changes between frames; no second shadow-casting source; no shadow on the distant ground (outside the frustum a shadow map clamps to "fully shadowed" and paints the distance black).

### Camera and lens

The camera is the player's (two-finger pinch / twist / pan), so the direction has to hold across the whole range rather than prescribe one shot.

- **Default:** bird's eye over the selected Car, ~19° off vertical.
- **Range:** 0° (straight down) to 83° (nearly on the ground), zoom ×0.15 to ×60.
- **Focal behaviour:** 60° vertical FOV, 0.05–4000 depth. The near/far range exists because the camera is free, and the far plane must reach the horizon.
- **Depth of field:** none. A toy-car game cannot afford a blur pass on a phone, and a blurred ground would destroy the scale reading.
- **Movement rule:** the camera moves only when the player moves it, or when it follows the Car it is aimed at. It never drifts, never sways, never breathes.
- **Prohibited:** automatic dolly, orbiting, roll, and any camera motion that competes with the Push gesture for the screen.

### Motion

| Class | Purpose | Object | Duration | Easing | Reduced-motion alternative |
|---|---|---|---|---|---|
| Emphasise | Make the aimed Car findable | Selection ring scale 1.00 → 1.045 | 2.4 s loop, sine | sine | **No pulse.** The ring is static. |
| Inform | Show where the last strike landed | Strike marker opacity 1 → 0 | 2 s | linear | Opacity only, no movement |
| Inform | Confirm a mode change / a message | Toast opacity + 10 px rise | 200 ms in, hold 2.6 s, 200 ms out | ease-out | Opacity only |
| Ambient | The world itself | **Nothing.** No wind, no drift, no idle motion | — | — | — |

**There is no authored motion on a Car.** A pushed Car is moved by the simulation (ADR-0001). Nothing eases, arcs or overshoots a Car — the physics is the animation. That is a hard rule, not a preference.

**Safety.** Nothing flashes. The ring's 2.4 s breath is well under WCAG 2.2 §2.3's three-per-second threshold, and `prefers-reduced-motion` disables it and the toast slide.

### Continuity

- **The chalk mark is one object.** Its grain, width, wobble and pressure are the same everywhere on the Track; a line never changes character halfway along.
- **The wobble lives in the PATH, not in the drawing.** `Track.path` is perturbed once, before the rules read it. The Boundary a player sees and the Boundary the rules measure are the same line, to within the chalk's own width. *A mark that disagreed with the rules would be a bug, not a texture.*
- **The Cars are canonical.** Body length 4.5 cm, width 2 cm, wheelbase 3 cm, track 2.2 cm. The three starting Cars share a silhouette family and differ in wheel size and mass — the Green one is visibly bigger and heavier, and that difference must be readable at thumbnail size.
- **The ground is one continuous sheet.** Texture UVs are world-scaled, so the 80-unit apron and the 28-unit sample squares share one texel density and one set of cut joints. A material seam is a *Surface change*, never a texture seam.
- **Light state.** One sun position and one sky for the whole session. There is no time-of-day change in the prototype.

### Accessibility

- **Contrast is measured on rendered frames**, not on swatches, because the chalk sits on textured, tone-mapped, moving ground. The method and the numbers are above.
- **No information is carried by colour alone** (WCAG 2.2 §1.4.1). The selected Car is identified by the ring *and* by its position *and* by the name in the panel. Each wheel's Surface is a dot *and* a word.
- **Reduced motion** is honoured (`prefers-reduced-motion: reduce`): the ring stops breathing, the toast stops sliding.
- **Touch targets** on the interface are ≥ 36 px; the segmented control's hit area is 34 px tall.
- **Safe areas** are respected via `env(safe-area-inset-*)` on all four edges.
- **Text alternatives:** every icon button carries an `aria-label` ("Recentre the camera", "Toggle the tuning panel"). The per-wheel readout is text, not a picture of text.
- **Screen-reader reality:** the 3D scene has no textual equivalent, and a full one is out of scope for a prototype. The HUD exposes every state the rules expose as text.

### Colour management

| | |
|---|---|
| Source space | sRGB (all textures authored and tagged sRGB) |
| Working space | Linear-sRGB (three.js, `ColorManagement` on) |
| Tone mapping | ACES filmic, exposure 1.0, applied to the scene **and** the sky dome |
| Output | sRGB, no embedded profile (a WebGL canvas has no ICC) |
| Review transform | The frames in this packet were captured on an sRGB display with no additional transform |
| HDR | Out of scope. The target is SDR phone displays; peak scene luminance is bounded by the tone curve. |
| Known defect (fixed) | `scene.background` textures are **not** tone-mapped by three.js, so a background sky could never meet a tone-mapped fog. The sky is therefore a **dome mesh** in the scene, and the horizon has no seam. |

---

## Tokens

Authoritative source: `src/game/proto/palette.ts`. The JSON below is the portable form; the TypeScript is what the game reads. **One role, one value.** The values below are the measured defaults.

```json
{
  "color": {
    "chalk": {
      "$type": "color",
      "$value": { "colorSpace": "srgb", "components": [1, 0.980, 0.941], "hex": "#FFFAF0" }
    },
    "chalk-groove": {
      "$type": "color",
      "$value": { "colorSpace": "srgb", "components": [0.247, 0.227, 0.200], "hex": "#3F3A33" }
    },
    "ground": {
      "$type": "color",
      "$value": { "colorSpace": "srgb", "components": [0.380, 0.369, 0.341], "hex": "#615E57" }
    },
    "surface": {
      "$type": "color",
      "$value": { "colorSpace": "srgb", "components": [0.243, 0.251, 0.267], "hex": "#3E4044" }
    },
    "tiles": {
      "$type": "color",
      "$value": { "colorSpace": "srgb", "components": [0.420, 0.376, 0.325], "hex": "#6B6053" }
    },
    "glass": {
      "$type": "color",
      "$value": { "colorSpace": "srgb", "components": [0.365, 0.498, 0.573], "hex": "#5D7F92" }
    },
    "paint": {
      "$type": "color",
      "$value": { "colorSpace": "srgb", "components": [0.839, 0.286, 0.235], "hex": "#D6493C" }
    },
    "ui": {
      "$type": "color",
      "$value": { "colorSpace": "srgb", "components": [0.949, 0.937, 0.894], "hex": "#F2EFE4" }
    },
    "ui-dim": {
      "$type": "color",
      "$value": { "colorSpace": "srgb", "components": [0.714, 0.706, 0.667], "hex": "#B6B4AA" }
    },
    "ui-accent": {
      "$type": "color",
      "$value": { "colorSpace": "srgb", "components": [0.894, 0.714, 0.341], "hex": "#E4B657" }
    }
  },
  "dimension": {
    "chalk-band": { "$type": "dimension", "$value": { "value": 7, "unit": "mm" } },
    "concrete-joint": { "$type": "dimension", "$value": { "value": 3, "unit": "mm" } },
    "paving-slab": { "$type": "dimension", "$value": { "value": 20, "unit": "cm" } },
    "cut-joint-pitch": { "$type": "dimension", "$value": { "value": 80, "unit": "cm" } }
  },
  "duration": {
    "ring-breath": { "$type": "duration", "$value": { "value": 2400, "unit": "ms" } },
    "strike-fade": { "$type": "duration", "$value": { "value": 2000, "unit": "ms" } },
    "toast-in": { "$type": "duration", "$value": { "value": 200, "unit": "ms" } }
  }
}
```

### Human-readable token table

| Role | Value | Allowed use | Prohibited use | Contrast partner | Fallback |
|---|---|---|---|---|---|
| `chalk` | `#FFFAF0` | Every world mark: Boundary, Checkpoint, Starting Line, Rock, Lake, Bridge | UI text (the UI has its own token) | Ground surfaces ≥ 3 : 1 | `#F2EFE4` |
| `chalk-groove` | `#3F3A33` | The rim of a chalk mark only | Any large area | — | `#55504A` |
| `ground.concrete` | `#615E57` | The apron and the concrete Surface | Large accents | Chalk ≥ 3 : 1 | — |
| `surface.asphalt` | `#3E4044` | The asphalt Surface | — | Chalk ≈ 6.4 : 1 | — |
| `surface.tiles` | `#6B6053` | The tiles Surface | — | Chalk ≈ 3.3 : 1 | — |
| `surface.glass` | `#5D7F92` | The glass Surface | — | Chalk ≈ 11.1 : 1 | — |
| `paint.*` | `#D6493C` `#2F63C8` `#3AA35C` | Car bodies, and the selection ring in that Car's colour | Anywhere else on the ground | Slate UI ≥ 9 : 1 | — |
| `ui.chalk` | `#F2EFE4` | Interface text | The world | Slate ≥ 9 : 1 | `#FFFFFF` |
| `ui.dim` | `#B6B4AA` | Secondary interface text | Anything a player must act on | Slate ≥ 4.5 : 1 | — |
| `ui.accent` | `#E4B657` | The infinite-Push pips, the active toggle, focus | World marks | Slate ≥ 4.5 : 1 | — |

### Non-token production rules

Tokens cannot express these, so they are rules:

1. **The chalk's grain is not a scale.** It is world-locked: one texture repeat per world unit, so the grain grows with the mark at any zoom.
2. **The chalk's rim is what lifts its contrast.** Where a Surface is too light for the chalk to clear 3 : 1, the fix is local darkening (the rim, a bed), never "make everything white".
3. **The shadow frustum's size is a function of camera distance**, not a constant.
4. **The sun vector is shared** between the sky texture and the directional light. They cannot disagree by accident.
5. **The wobble lives in the rules' path.** See Continuity.
6. **The ground's UVs are world-scaled.** See Texture and material.
7. **Text is live DOM.** Never generated into a texture.
8. **Every interface element has a text equivalent**, and every icon has an `aria-label`.

---

## Adaptation matrix

| Target | Behaviour | Rule |
|---|---|---|
| **9:19.5 portrait phone** (primary) | Slate top-left ≤ 222 px wide; actions bottom-right; the bottom-centre is the gesture zone | The panel never crosses the horizontal midline |
| **9:16 portrait** | Same as above | — |
| **16:9 landscape phone** | The slate moves to the top-left corner but its width caps at 260 px; actions stay bottom-right | The panel must not cover the Track when the camera is centred |
| **Tablet / desktop** | The slate stops growing past 260 px; the camera can be pulled back to ×60, and the sky dome and the distant ground keep the world edge-free | — |
| **1:1 thumbnail / store art** | The Cars' silhouettes and the chalk's *value* must carry it — a 100 px crop shows three coloured toys and a white line, and that is enough to say "chalk game" | The two-tone stripe and the chalk band are the two features that survive |
| **SDR** | The target. ACES + sRGB | — |
| **HDR** | Out of scope for this target | — |
| **Localisation** | The panel is a flex column; labels may expand ~40 % (German, Finnish) before the pips must wrap to a second row | The Car's name truncates with an ellipsis, never wraps |
| **Reduced motion** | The ring is static; the toast fades without sliding | — |

---

## Proof set

The frames below are the acceptance evidence. Each is a deterministic camera setting exposed on the debug handle (`__jdt.setCam` / `__jdt.lookAt`), captured headlessly at 390 × 844 @ DPR 2 with the tuning panel collapsed.

| # | Shot | Framing | What it proves | Pass criteria |
|---|---|---|---|---|
| 1 | **Hero** | Default bird's eye over the starting grid | The first frame a player sees: the Track reads, the Cars read, the panel does not dominate | Chalk ≥ 3 : 1 against concrete; a Car has a contact shadow; the slate is < 15 % of the screen |
| 2 | **Wide Surfaces** | Zoom ×4.6 over the test ground | The four Surfaces are tellable apart at a glance — the whole point of ticket 16 | Concrete / Asphalt / Tiles / Glass each read as a different material; the chalk stays legible on all four (measured 4.1 / 7.3 / 5.2 / 11.1 : 1) |
| 3 | **Low horizon** | 1.32 rad off vertical | The world has no edge; the sky and the ground meet without a seam | No hard horizon line; no slab edge; the sky gradient is visible |
| 4 | **Close chalk** | ×0.42 on the start line | The hero material at reading distance | Chalk is visibly a *grainy band*, not a vector line; width holds; skips visible; a contact shadow grounds the Car |
| 5 | **Hazards** | ×0.75 on the Rock | The glossary's shapes are still recognisable | The Rock reads as a chalk triangle; the Lake's hatch and the Bridge's diagonals are visible |
| 6 | **Interface** | Default | The panel is a designed object | No default browser chrome anywhere; every text pair meets its target |

---

## Asset and rights ledger

| Asset | Source | Method | Licence / rights | Modifications | Notes |
|---|---|---|---|---|---|
| Every texture in the game | `src/game/proto/textures.ts` | Procedural, deterministic value noise into `DataTexture` | Original work; no third-party assets | — | No sampling, no stock imagery, no scanned maps |
| Chalk grain | same | Same | Same | — | |
| Sky gradient + sun | same | Same | Same | — | The sun vector is shared with the light rig |
| Car geometry | `src/game/proto/car.ts` | Built from primitives to the project's own dimensions | Original work | — | **Not** a reproduction of any manufacturer's model. No badges, casting lines, livery or packaging |
| Interface | `src/style.css`, `src/game/proto/hud.ts` | Original | Original work | — | System fonts only — no font files to license |
| Track & hazard shapes | `GLOSSARY.md` | Drawn from the project's own written vocabulary | The project's own | — | — |
| Colour profile | — | sRGB throughout, ACES tone curve | — | — | No embedded ICC (a WebGL canvas cannot carry one) |
| Synthetic-media disclosure | n/a | No generated or synthetic media is used | — | — | — |
| Font licences | n/a | System fonts only | n/a | — | If a display face is added later, it must be licensed and recorded here |

**Rights screen:** no reference photographs, no brand assets, no third-party models, no fonts requiring a licence. The packet is clear to ship under the project's own terms.

---

## Acceptance tests

**Binary — these fail the build.**

1. `pnpm check:look` passes: the world builds, drawable objects < 220, distinct materials < 40, and **all chalk shares one material**.
2. `pnpm exec tsc --noEmit` is clean.
3. Rendered chalk-to-Surface contrast ≥ **3 : 1** on Concrete, Asphalt and Tiles, measured by pixel readback on a captured frame.
4. Interface text ≥ **4.5 : 1** against the panel it sits on; ≥ **3 : 1** for the push pips and the mode toggle.
5. Every icon-only control has an `aria-label`.
6. `prefers-reduced-motion: reduce` removes the ring's pulse and the toast's slide.
7. No default browser button rendering anywhere in the interface.
8. The tuning panel is collapsed in every captured frame.

**Subjective — a reviewer must agree.**

9. The chalk reads as *chalk* at the default framing, and unmistakably so in the close-up. If it reads as a line, the work is not done.
10. The Cars read as *toy cars* from directly above, at thumbnail size, with the panel covered.
11. The four Surfaces are tellable apart at a glance from the wide shot.
12. The interface looks like it belongs to this game and not to a different one.
13. The world has no visible edge at any zoom from ×0.15 to ×60.
14. A Car never appears to float.

---

## Decision and repair log

| # | Change | Reason | Affected rules / assets | Approver |
|---|---|---|---|---|
| 1 | Chalk changed from `LineBasicMaterial` (1 px) to world-unit ribbons | A hairline is vector art, not chalk | `chalk.ts`, `track.ts` | direction |
| 2 | Chalk gained grain, skips, a pressure-varying width and a path wobble | Chalk is deposited powder; a hand is not a machine | `textures.ts`, `chalk.ts` | direction |
| 3 | The wobble was moved into `Track.path` (rules and drawing share it) | A mark that disagreed with the rules would be a bug | `track.ts` | direction |
| 4 | `Line2` removed; ribbons replace it | One material, one geometry builder, no `resolution` plumbing | `track.ts`, `proto.ts` | direction |
| 5 | Ground textures regenerated as `DataTexture` at a real texel density | The old 256 px canvas speckle over an 80-unit slab was sub-pixel: the ground rendered as a flat colour field | `textures.ts`, `surfaces.ts` | direction |
| 6 | Ground UVs scaled to world units | The apron and the sample squares had different texel densities and did not join | `world.ts` (`worldUV`) | direction |
| 7 | Score joints narrowed from 13 mm to 3 mm and lightened from 0.42× to 0.70× | They read as black bars and made the ground look like a bathroom floor | `textures.ts` | measured |
| 8 | Concrete's low-frequency variation cut from ±40 % to ±8 % | It read as clouds on a wet floor | `textures.ts` | measured |
| 9 | Concrete darkened; chalk brightened (near-white + emissive floor) | Chalk on concrete measured **1.87 : 1**. The Boundary lines are game information | `palette.ts`, `chalk.ts` | measured |
| 10 | Hemisphere light cut 0.75 → 0.40; environment intensity 0.75 → 0.42; sun 2.2 → 3.6 | The skylight was out-colouring the sun and turning the chalk blue | `look.ts` | measured |
| 11 | The sky became a **dome mesh**, not `scene.background` | three.js does not tone-map a background texture but does tone-map fog: the horizon had a hard seam | `look.ts` | measured |
| 12 | The sky texture was flipped | A `DataTexture`'s first row is the bottom in GL: the blue zenith was below the horizon | `textures.ts` | measured |
| 13 | The sky gradient widened toward the horizon | A player looking at a track never sees the zenith | `textures.ts` | direction |
| 14 | A 1600-unit distant ground added under the play area | The 80-unit slab ended in a razor horizon | `look.ts` | measured |
| 15 | The shadow frustum follows the target and scales with camera distance | A shadow map covering 30 m cannot resolve a 4.5 cm Car | `look.ts` | measured |
| 16 | Per-Car contact smudges added, skewed away from the sun | The thing that actually grounds a Car at 1:64 | `look.ts` | direction |
| 17 | Cars rebuilt from primitives: body, glasshouse, roof, stripe, bumpers, lamps, tyres, hubs | A box and four cylinders read as a coloured rectangle; the silhouette and the two-tone are what say "toy" | `car.ts` | direction |
| 18 | The glasshouse was made a glass band with a painted roof **on top of it** | The first version buried the roof inside the cabin and the Cars read as slabs with a white sticker | `car.ts` | measured |
| 19 | The selection ring became a wobbled chalk circle in the Car's colour, on a dark bed | A 1 px white hairline was the last vector line in a chalk world; and a coloured ring on concrete is ~1.3 : 1 | `proto.ts` | measured |
| 20 | The interface rebuilt as **chalk on slate** | Raw browser buttons fought the game for attention and covered 28 % of the phone | `hud.ts`, `style.css` | direction |
| 21 | The Push counter became three chalk pips | The rule *is* three Pushes per Turn; three marks say it without being counted | `hud.ts` | direction |
| 22 | The tuning panel got a ⚙ toggle and is collapsed in captures | It is a developer tool, not the game | `hud.ts` | user |
| 23 | Glass became framed panes, roughness 0.05 → 0.22 | A frameless mirror at a grazing angle is indistinguishable from a lake | `textures.ts`, `surfaces.ts` | measured |
| 24 | Asphalt's bright chips capped at 1.24× and 34 % coverage | They read as stars on a night sky | `textures.ts` | measured |
| 25 | Tile grout narrowed to a joint; per-slab tone kept | It read as a bathroom floor | `textures.ts` | measured |
| 26 | The fog colour unified with the sky's horizon colour, and `look.ts` given ownership of the fog | The two were merely *similar*, and there was a visible band at eye level | `look.ts`, `proto.ts` | measured |
| 27 | The sky texture raised to 512 × 256 | A 128-row strip quantised the gradient into visible horizontal bands across the dome | `textures.ts` | measured |
| 28 | The glass Surface value lowered to `#5D7F92` | At a grazing angle the glass was brighter than the sky | `palette.ts` | measured |
| 29 | The car's glass lightened to `#374B59` | The glasshouse read as a black frame bolted to the roof | `palette.ts` | measured |
| 30 | The selection ring's wobble and pressure raised | It read as a perfect geometric circle — a UI ring, not a chalk one | `proto.ts` | measured |
| 31 | The chalk's width variation rebuilt: pressure as world-space noise plus a per-stroke component, the two edges wandering independently, open strokes tapering at both ends | The width was a pair of sine waves at ±8 %, which read as **perfect width all the time** — the single most unnatural thing about the mark. The texture's grain cannot fix it: at the default framing it is sub-pixel and averages out | `chalk.ts`, `track.ts` | user feedback + measured |
| 32 | Closed-ribbon sampling fixed to include the closing segment | The last stretch of every closed mark collapsed onto the final point, because the arc-length table stopped before the closing segment | `chalk.ts` | found while fixing 31 |
| 33 | Checkpoint and Starting-Line strokes subdivided and given a wander; the Lake's ellipse given a radial drift | A checkpoint line was two points and a straight line between them — exactly what a renderer draws and exactly what a hand does not | `track.ts` | user feedback |
| 34 | The selection ring's path made out-of-round in a PERIODIC way | An open-path wobble leaves a seam at the start of the ring and turned it into a polygon | `proto.ts` | measured |
| 35 | Desktop Shift+drag camera rotation reversed | `yaw` grows when the camera orbits anticlockwise seen from above, which turns the world anticlockwise — so dragging right sent the world the other way. The view now follows the pointer. `invertRotate` still flips it | `camera.ts` | user feedback |
| 36 | The Camera button restored as a labelled, stateful control | Following is a MODE that any two-finger gesture ends, and the player has to be able to see which mode they are in and get back without hunting through a menu. It now reads "Camera" when attached and "Follow Car" (in the accent colour) when detached | `hud.ts`, `rules.ts`, `proto.ts`, `style.css` | user feedback |
| 37 | Desktop Shift+drag camera **tilt** reversed as well | Tilt is measured from vertical, so dragging down used to lower the camera. Every 3D viewer orbits the other way on a downward drag | `camera.ts` | user feedback |
| 38 | The chalk's grain moved into the TEXTURE, and the texture made **anisotropic** (32 across the band, 2048 along) | See the systems section: the player was right and I was wrong. The first geometry-driven version carried the width, and the texture's grain measured only 2 % on the rendered frame — present, but too weak to read | `textures.ts`, `chalk.ts` | user feedback + measured |
| 39 | The chalk's two texture axes matched in physical texel size | Mismatched, per-texel noise was *thin strings along the line* rather than static. Matched, it is the "TV no signal" the mark wants to be | `textures.ts` | user feedback |
| 40 | The chalk texture raised to 512², then to 32 × 2048 | The band is only ~26 px wide on screen, so a square texture is minified twenty times across it and the edge blurs into mush. The tile now covers 60 cm of mark, so its features are big enough to read at the default zoom | `textures.ts`, `chalk.ts` | user feedback + measured |
| 41 | The hole threshold raised above the mean of the coverage distribution | It sat ON the mean, so half the mark was punched out in 4 mm dashes and the chalk read as a dotted line | `textures.ts` | measured |
| 42 | The slow "puff" mottle removed from the chalk texture | At ten cells across a tile it was ten broad bands per repeat, and a 10 cm repeat of broad bands is visible as banding along a 90 cm boundary line | `textures.ts` | measured |
| 43 | `hash2` replaced with a real 32-bit integer hash | The usual `Math.sin(i*127.1 + j*311.7)` trick correlates once the index is multiplied up: adjacent texels land ~0.16 of a cycle apart, so "white" noise developed a beat every six or seven texels | `textures.ts`, `chalk.ts` | measured |

---

## Known gaps, stated rather than hidden

1. **No bespoke type.** A chalk-marked display face would suit the fiction, but it needs a licensed font file in the bundle. Recorded as the first thing to add when the real game starts.
2. **Multiplayer HUD.** One Car, one Turn. Several players' Turns at once is a v1 problem.
3. **The audio direction is not covered here.** The brief was visual.
4. **This direction has been judged on a desktop capture**, not on a phone in daylight. The contrast numbers are screen-referred and will hold on a phone; the *feel* of the sun on a real screen at arm's length is the player's call, which is exactly why every number lives in the GUI.
5. **The two-finger twist on touch still turns the world the OTHER way from the mouse.** The mouse was corrected (the view now follows the pointer); the touch twist was left alone because it was not reported and the player has a phone. The two conventions are therefore opposite, and aligning the touch is a one-line change when asked.
