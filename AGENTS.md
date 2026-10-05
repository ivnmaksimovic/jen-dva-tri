# Jen Dva Tri — Agent Instructions

A 3D game built with TypeScript, Three.js and Vite, packaged for mobile with
Capacitor. Android (Play Store) is the first target. See `README.md` for
architecture and commands.

## Finding the current work

New to the project? Read in order: `README.md` (state + pointers) →
`GLOSSARY.md` (the game's language) → the newest `.scratch/*/map.md`
(active effort: decisions so far, open fog, roadmap). Build notes in each
map record the engineering lessons (physics scale, timestep, rejected
approaches) — read them before changing physics or controls.

## Agent skills

### Issue tracker

Issues are tracked as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-label vocabulary, label string equal to role name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
