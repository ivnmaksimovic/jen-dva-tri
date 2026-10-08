# Jen Dva Tri

A 3D game built with TypeScript, Three.js, Rapier (physics) and Vite,
packaged for mobile stores with Capacitor. **Android (Play Store) is the
first target**; iOS can follow from the same codebase.

The game is a digital adaptation of a folk game ("1-2-3"): turn-based
finger-push racing with 1:64 model cars on chalk-drawn tracks, played on
real terrain. The game's language lives in `GLOSSARY.md`.

## Current state — v0 throwaway controls prototype

`src/game/proto/` is a **throwaway prototype** for the controls experiments
(slingshot scheme): full 3D physics, one runtime-tunable car, a chalk loop
track with a raised sidewalk section, the game rules (Out of Track, Rock,
Lake, Bridge, 3-Push Turns), Sandbox + Lap Challenge modes, a speckled
test field, and a live tuning panel (persists per browser in localStorage).
It will be **replaced wholesale** once the controls feel right — do not
grow the real game out of it.

Active effort: `.scratch/prototype/map.md` — decisions, open fog, roadmap.
Open prototype experiments before anything else: readable strike point (11),
multiple Cars (12), surfaces and roughness (14) — see the map's Roadmap.
The v1 (real game) roadmap is parked at `.scratch/v1/spec.md` (coarse: only
verdict + two grilling tickets + the core prefactor are ticketed).
**Physical world note:** grip is f(tire, Surface) resolved per wheel contact —
see ADR-0002.
**Next up: the push-the-phone control scheme** (phone on a surface, pushed
like the car; motion sensors capture the Push — ticket 13) — full design in
`.scratch/prototype/issues/07-phone-push-mapping.md`.

## Where things live

| Path | What |
|---|---|
| `GLOSSARY.md` | The game's settled language |
| `docs/adr/` | Recorded hard-to-reverse decisions (0001: full 3D physics) |
| `.scratch/<effort>/` | Design maps + tickets (see `docs/agents/issue-tracker.md`) |
| `.scratch/v1/spec.md` | Parked v1 roadmap + tickets (`.scratch/v1/issues/`) |
| `src/game/Game.ts` | Engine wrapper: renderer, scene, camera, loop |
| `src/game/proto/` | v0 throwaway prototype (world, track, car, slingshot, rules, hud) |
| `android/`, `ios/` | Native Capacitor shells (committed to git) |
| `dist/` | Web build output — what Capacitor loads into the WebView |

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | **HTTPS** dev server (self-signed cert; LAN host so you can test on a phone — motion sensors require a secure context) |
| `pnpm build` | Type-check + production web build into `dist/` |
| `pnpm android` | Web build → sync to `android/` → open in Android Studio |
| `pnpm ios` | Web build → sync to `ios/` → open in Xcode |

## Releasing to Play Store (later)

1. Install **Android Studio** (provides JDK 17+ and the Android SDK) — needed to build the AAB.
2. Change `appId` in `capacitor.config.ts` to a reverse-domain you own — it is **permanent** once published.
3. `pnpm android` → Android Studio → *Build > Generate Signed Bundle*, then upload to Play Console.

## Releasing to the App Store (later)

1. Install **Xcode** (App Store) — needed to build the iOS app.
2. An **Apple Developer account** ($99/year) is required for device testing and App Store submission.
3. `pnpm ios` → Xcode → set your signing team, then *Product > Archive*.
4. The iOS bundle id lives in `ios/App/App/capacitor.config.json` / Xcode project settings — it mirrors `appId`.

## Notes

- Mobile performance: device pixel ratio is clamped to 2 in `Game.ts`; keep an eye on draw calls and texture sizes as the game grows.
- `appId: com.jendvatri.game` is a placeholder — do **not** publish with it.
- Physics scale: 1 world unit = 10 real cm; Rapier steps at 1/240 s (4 steps/frame) — see `.scratch/prototype/map.md` build notes for why.
