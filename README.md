# aqua-vault

A cozy browser game about a Bangladeshi monsoon village. Dig canals so rain finds its way to the rice paddy, store it in a reservoir, turn falling water into power, clean it for homes, and grow a living pond and wetland, until the village is in bloom.

Static-first Next.js + TypeScript + Canvas 2D. No backend, no accounts, no tracking. Works with mouse, touch and keyboard. The design docs in [`docs/`](docs/00_START_HERE.md) are the source of truth.

## Commands

```bash
npm install
npm run dev      # http://localhost:3000
npm run test     # Vitest: simulation, structures, persistence, input, full playthrough
npm run lint     # tsc --noEmit
npm run build    # static export to out/
npm run start    # serve out/ locally (npx serve)
```

## How to play

A new village starts with five short **lessons** (canal, downhill flow, gates and harvest, reservoir, power and lights). Each step completes only when you actually do the action. Open the **Journal** (book button, or **J**) to re-read any lesson you have seen, including the Careful notes. **Levels** (map button) lists the lessons and the full village.

1. Rain fills the catchment. Choose **Canal** and drag from the water to the dry paddy. Water only flows downhill (press **H** to see ground heights). Uphill tiles glow red while you dig.
2. Wait for the rice to turn gold, then **Inspect** the paddy and **Harvest** it for materials and XP.
3. In the village, level up to unlock the reservoir, water wheel, battery, treatment plant, house taps, fish pond, wetland, floating garden, pump and fountain. Each one only works when it is really connected to water (and power, where needed). The Inspector shows exactly what a building is missing.
4. The goals (flag button) run from **A, First Stream** to **G, Village in Bloom**.

Controls: drag to dig, right-drag or the Erase tool to remove, Ctrl+Z to undo, wheel or pinch to zoom, drag with Inspect to pan. Keys: 1–0 select tools, P pauses, H shows heights, J opens the Journal, Esc cancels. The map is keyboard-operable too (focus it, arrows move a cursor, Enter/Space acts, Shift+arrows draws).

## Progress checklist

- [x] Next.js static export, TypeScript strict, Vitest
- [x] Deterministic water simulation (fixed 10 Hz tick, conservative flux, seeded weather) with a per-tick mass ledger
- [x] Five guided tutorial lessons on small maps, then the hand-authored 28×18 village; Journal to re-read sequential lessons
- [x] Canal / erase / gate / bamboo bridge tools with Bresenham drag fill and undo
- [x] Rice paddy, reservoir, water wheel, battery, treatment plant, house taps
- [x] Fish pond, wetland, floating garden, pump, fountain
- [x] XP, levels, unlocks, achievements, milestones A–G
- [x] Canvas renderer: noise-blended terrain, grass and vegetation, terrace relief, depth-tinted water, rain, day/night, glow, particles, heights overlay
- [x] Responsive UI: HUD, tool dock (locked tools visible), inspector / bottom sheet, tutorial, toasts, settings, goals
- [x] Local saves (two generations, migrations, repair, autosave, New World, Reset View)
- [x] Opt-in procedural audio, reduced motion, favicon and Open Graph metadata
- [x] Browser QA: desktop 1366×800, 390×844 touch, 320×568 touch; no console errors
- [ ] Live production URL tested (do this after your first deploy)

## Deploying for free

The build is a fully static site in `out/`; any static host works.

- **Vercel (Hobby)**: import the repository; Next.js is detected automatically. Check that your use is eligible for the Hobby plan's terms.
- **Netlify (Free)**: build command `npm run build`, publish directory `out`.
- **GitHub Pages**: the site lives under `/<repo-name>/`, so build with the base path set:
  ```bash
  NEXT_PUBLIC_BASE_PATH=/aqua-vault npm run build
  ```
  then publish `out/` (for example with `actions/upload-pages-artifact` + `actions/deploy-pages`). `public/.nojekyll` is included so the `_next/` folder is served.

Free tiers have limits and policies that change; verify them before publishing.

## Saves and privacy

Progress is saved only in this browser's `localStorage` (two alternating slots, so an interrupted write never loses everything). Clearing site data, private windows or a different device mean a fresh village. Nothing is sent anywhere.

## Architecture

- `src/game/sim/`: the pure, deterministic simulation (`stepGame(state, commands)`), independent of rendering.
- `src/game/model/`, `src/game/content/`: types, balancing config, world seed, milestones, text.
- `src/game/render/`: Canvas 2D renderer (reads state, never mutates it).
- `src/game/input/`: pointer math (coordinate mapping, Bresenham).
- `src/game/persistence/`: save repository and migrations (a cloud repository can be added later behind the same interface).
- `src/game/controller.ts`: the fixed-timestep loop, gestures, autosave and a snapshot store for React.
- `src/components/`: React UI around the canvas.

## Deviations from the docs (balancing)

These were tuned so that the full A→G chain is reachable on the real map through real connections, as verified by `playthrough.test.ts`:

- Level thresholds for Lv5–7 are 330 / 410 / 600 XP.
- Evaporation is 0.005 per tick (half the documented starting value); the river had too little throughput otherwise.
- Storage depth is 1.25 for the reservoir and fish pond so they can fill to their inlet head; the east basin's south rim is open.
- Water wheel constant `k = 1`.
- An extra "Village lit" achievement (+50 XP) rewards wiring the first battery to homes.

## Known limitations

- Five tutorial maps plus one hand-authored village; no procedural worlds.
- Clean water reaches homes over a simplified sealed pipe network from treatment tanks to house taps (no pressure simulation).
- Audio is synthesized with Web Audio (no recorded samples) and is off by default.
- `npm audit` reports advisories in dev/build-time dependencies (Vitest, PostCSS via Next). Fixing them needs major upgrades (Next 16, Vitest 5) and was deferred; none of them ship in the static output.

## Credits

Game design, code and all art (drawn procedurally at runtime) are original to this project. Dependencies: Next.js and React (MIT), Vitest (MIT), TypeScript (Apache-2.0). No external fonts, images or audio.
