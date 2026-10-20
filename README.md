# aqua-vault

A cozy browser game about a Bangladeshi monsoon village. Dig canals so rain finds its way to the rice paddy, store it in a reservoir, turn falling water into power, clean it for homes, and grow a living pond and wetland, until the village is in bloom.

Static-first Next.js + TypeScript + Three.js (with a Canvas 2D fallback). No backend, no accounts, no tracking. Works with mouse, touch and keyboard. The design docs in [`docs/`](docs/00_START_HERE.md) are the source of truth.

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

Ten short levels, each teaching one idea, then an open village. You start with just the Canal tool and two goals; new tools, stats and ideas appear level by level.

1. **First Canal**: drag a canal from the spring to the dry paddy. 2. **Downhill**: water cannot climb, so go around the ridge. 3. **Gates & Harvest**. 4. **Save the Rain**: store water through a real dry spell. 5. **Power & Light**: a waterwheel and battery at dusk. 6. **Clean Water**: treatment plant and home taps. 7. **Living Pond**: fresh water for fish. 8. **Wetland & Floating Garden**. 9. **Lift the Water**: a pump. 10. **The Village**: bring everything to bloom, then play freely.

Earn up to 3 stars per level (finish, spend little, be quick). Drag to dig, tap to build, **Inspect** anything to see exactly what it is missing. Camera: drag with Inspect or two fingers, wheel/pinch to zoom, **Q/E** or a two-finger twist to turn. Keys: 1-0 tools, X erase, Ctrl+Z undo, P pause, F speed, H heights, M level map, J journal. The map is keyboard-operable (focus it; arrows move a cursor, Enter acts, Shift+arrows draws).

## Progress checklist

- [x] Next.js static export, TypeScript strict, Vitest (86 tests), Playwright available for browser smoke runs
- [x] Deterministic water simulation (fixed 10 Hz, conservative flux, seeded and scripted weather) with a per-tick mass ledger
- [x] Ten-level campaign + sandbox; latched objectives, stars, per-level save, cross-level profile, v2 save upgrade; every level proven solvable by test
- [x] Three.js low-poly diorama: tilted camera, terrain extruded by height, shadows, shader water with flow, procedural models, day/night, rain, instanced vegetation; Canvas 2D fallback
- [x] Full-screen UI with progressive disclosure: objective card, unlocked-only tool bar, tool intro cards, popover inspector, level-complete card, level map, Journal, shared accessible dialog
- [x] Honest mechanics: taps pipe from plants within 10 tiles, fountain aerates ponds, pump lifts uphill, gates/commands enforce the level's tool list
- [x] Input: pure gesture machine (a pinch never digs), ray-vs-heightfield picking, mouse/touch/keyboard
- [x] Procedural audio (rain, brook, birds, chimes) with volume, opt-in; reduced motion; text size; Bengali-capable self-hosted fonts
- [x] Browser-checked in headless Chromium: level 1 played end to end (dig, flow, stars), village on 1366x800 and 390x844, no console errors
- [ ] Tested on a real phone GPU and a live deployed URL (do this after your first deploy)
- [ ] Full 10-level hands-on playtest for feel (the tests prove solvability, not fun)

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

## Deviations from the original docs

The docs were updated to match: a 3D renderer (`three`) replaces "Canvas 2D only", the five tutorials plus village became a ten-level campaign, unlocks come from levels instead of XP, and save format v3 splits profile from level state (docs 05, 06, 07, 08, 09, 13).

## Known limitations

- Procedural worlds are not included; levels are hand-authored.
- The pipe network is a range check (10 tiles), not a pressure simulation; electricity is one shared pool.
- Audio is synthesized (no samples) and off by default.
- The 3D view has been verified only in software-rendered headless Chromium; tune quality on real devices (Settings → Graphics).
- `npm audit` reports advisories in dev/build-time dependencies; none ship in the static output.

## Credits

Game design, code and all art (drawn procedurally at runtime) are original to this project. Dependencies: Next.js and React (MIT), three.js (MIT), Vitest (MIT), Playwright (Apache-2.0), TypeScript (Apache-2.0). Fonts Hind Siliguri and Baloo Da 2 (SIL OFL), bundled at build time. No external images or audio, and no network requests while playing.
