# Jen Dva Tri

A 3D game built with TypeScript, Three.js and Vite, packaged for mobile
stores with Capacitor. **Android (Play Store) is the first target**;
iOS can follow from the same codebase.

## Architecture

```
src/
  main.ts          Web entry point — boots the Game
  game/
    Game.ts        Engine wrapper: renderer, scene, camera, main loop, resize
    demo.ts        Placeholder scene (spinning, draggable icosahedron) — replace me
android/           Native Android shell (Capacitor), committed to git
ios/               Native iOS shell (Capacitor), committed to git
dist/              Web build output — what Capacitor loads into the WebView
```

The engine (`Game.ts`) is decoupled from content: modules register
per-frame updaters and input handlers against the running game.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server with hot reload (open on your LAN IP to test on a phone) |
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
