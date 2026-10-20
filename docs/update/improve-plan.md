# Aqua-Vault Overhaul Plan

## Context
The game works mechanically: deterministic 10 Hz water sim, 5 lessons plus a 28×18 village, Canvas2D renderer, tests. It falls short on feel and flow:
- **Cluttered from second one.** The desktop is a fixed 3-column layout: a 188px tool sidebar, a 300px inspector, and a HUD with 6 stat chips and 8 buttons. Lesson 1 already shows energy, clean water and village milestones. The village dumps all 16 tools at once, with locks.
- **Level flow is broken.** Lesson steps are re-evaluated live, so they regress (for example, lesson 3's "field ripe" goes false after harvest). Lesson 4's dry spell completes instantly. Skip counts as completion. XP and unlocks don't carry over, so the village restarts at 0 XP. Pump and fountain (Lv7 = 600 XP) are unreachable before the end.
- **Flat top-down visuals.** On top of that:
  - The terrain cache is rebuilt on every zoom step, sized to the whole map × DPR, which risks the iOS canvas limit.
  - Particles drift on pan.
  - Storage fill and crop growth visibly step at 10 Hz.
- **Bugs:**
  - Settings live per scenario. Sound shows "on" but is silent after reload (controller.ts:146).
  - Undo caps free canals at 10 (commands.ts:320).
  - A pinch with the canal tool digs a stray tile (controller.ts:677).
  - Inspector Remove can delete a floating garden instead of the selected building (controller.ts:428).
  - The gate command ignores allowedTools.
  - Erasing a free canal refunds materials (exploit).
  - Houses draw clean water globally (a fake pipe network). The fountain and bridge do nothing.
- **UI and accessibility:**
  - Tutorial and toasts collide below 1290px; mobile bottom overlays stack.
  - Dialogs are duplicated and have no focus trap. The tutorial isn't a live region.
  - Contrast fails in places (#b5502c on #fde5d8 is about 4.2:1).
  - The whole React tree re-renders every 250 ms.

**User decisions:** a Three.js low-poly diorama (tilted ortho camera, extruded elevation, lighting, shadows, shader water); about 10 sequential campaign levels with one new mechanic each, then the village finale, then a sandbox; a full-screen map with progressive disclosure.

**Invariants:** the sim stays pure, deterministic and seeded (no Math.random, no DOM); no fake mechanics; static export (including the GitHub Pages basePath); mouse + touch + keyboard; reduced motion; Bangla glyphs; no loss state; an honest README checklist. Every phase ends with `npm test && npm run lint && npm run build` green and a playable game.

---

## Phase 0: Environment
- Node is **not installed**. Install Node LTS via nvm, then run `npm ci` and the baseline test, lint and build. Record any pre-existing failures.
- Add `three` and `@types/three` at pinned versions, and optionally `@playwright/test` as a dev dependency.

## Phase 1: Sim and progression foundation (current UI and renderer kept)

**Fixes**
- `resources.freeCanalsMax` is set per level, and undo caps to it (`sim/commands.ts`, `model/world.ts`).
- Canal erase refunds 0; building refunds stay at 0.5. In `config.ts`, `eraseRefund` becomes `{canal, building}`.
- New `removeBuilding {buildingId}` command, used by the Inspector.
- `gate`, `toggleGate` and `bridge` check `isUnlocked`.
- **Honest taps:** a tap draws only from treatment plants within `CONFIG.connector.pipeRange` (10). New inspect status `tooFar`. The renderer draws the real pipe to its host (`sim/consumers.ts` house loop).
- **Fountain becomes an aerator:** powered and next to a pond, it raises the pond's quality target. The bridge is labelled "Decoration" and is sandbox-only.
- Add `state.dayOffset` so a level can start at dusk (`sim/weather.ts`).

**Objective system** (new `src/game/sim/objectives.ts`, called in `stepGame` after `checkProgression`)
- `ObjectiveDef { id, icon, title, bn?, text, kind: 'state'|'event'|'sustain', check?, onEvent?, sustainTicks?, progress?, optional?, coach? }`
- New GameState fields:
  - `objectives { done[], sustain{}, completedTick }`
  - `stats { materialsSpent, canalsDug, ticks, harvests }`
  - `script` (for the weather script)
- **Latching:** an objective in `done` never leaves. Required objectives latch in order, except in levels with `ordered: false`. A sustain counter resets gently when its condition breaks.
- **Events:** emits `objective` and `levelComplete {stars}` (exactly once). The pure function `computeStars(level, state)` gives 1 star for completion, +1 for materials at or under par, +1 for time at or under par or the optional objective done.
- Coach hints (tool pulse, dashed path) are UI-only and never gate progress. This replaces the `waitForTool` hack.

**Weather script**
- Each level can define `weatherScript[]` with `mode`, `ticks`, `untilObjective` and `repeatFrom`. `stepWeather` follows it deterministically. This removes the controller's `applyLessonWeather`.
- Lesson 4: rain until the reservoir objective latches, then 900 dry ticks. It repeats if survival fails.

## Phase 2: Campaign, profile and level flow (still the Canvas2D renderer)

**`src/game/content/campaign.ts`** replaces `scenarios.ts`, `lessons.ts` and `milestones.ts`. It reuses the `map()`, `bedAlong()` and `lessonN()` painters and `authorWorld` from `worldSeed.ts`. Tools are cumulative; inspect, erase and undo are always available.

| # | id | New mechanic | Map | Key objectives (latched) | XP |
|---|---|---|---|---|---|
| 1 | first-canal প্রথম খাল | canal | 12×8 | canal carries water → paddy drinks | 40 |
| 2 | downhill ঢাল বেয়ে | heights | 12×8 | reach the low path → far paddy drinks | 40 |
| 3 | gates-harvest গেট ও ফসল | gate + harvest | 14×9 | place gate → close it → harvest (event) | 50 |
| 4 | save-rain বৃষ্টি রাখো | reservoir + real drought | 14×10 | build in basin → fill 60% → paddy stays moist for 900 dry ticks | 60 |
| 5 | wheel-light আলো জ্বালো | waterwheel + battery | 14×10, dusk | wheel spins → battery 30 → house lit 300 ticks | 70 |
| 6 | clean-water বিশুদ্ধ পানি | treatment + tap | 16×10 new | plant makes clean → tap by home → supplied 200 ticks | 80 |
| 7 | fish-pond পুকুরে মাছ | fish pond | 14×10 new | fill >65 → stock → harvest fish | 80 |
| 8 | wetland-garden শাপলা ও ধাপ চাষ | wetland + floating garden | 16×10 new | wetland thrives → float garden → harvest it | 90 |
| 9 | lift-water পানি তোলো | pump (uphill) | 14×10 new: stream at h2, terrace at h4 | place pump → lift > 0 → terrace paddy drinks | 100 |
| 10 | village গ্রাম | all together | 28×18 | unordered: rice, reservoir 75%, lit home, clean-water home, stocked pond, wetland → Village in Bloom sustained 100 ticks | 200 |
| → | sandbox | free play | village | + fountain/aerator, bridge | — |

- Each level has its own star pars (materials, time, or the optional objective), shown on the objective card. Pars are recorded in `docs/13`.
- Unlocks come from completed levels (`profile.unlockedTools`), so the pump and fountain become reachable. XP becomes a cosmetic "Village Rank". `state.allowedTools` is never null.
- Fish growth rises to about 1/1000 so level 7 isn't slow.

**Profile v3** (new `src/game/persistence/profile.ts`)
- Fields:
  - `currentLevel`, `xp`
  - `levels{ completed, skipped, stars, bestTicks, bestMaterials }`
  - `unlockedTools`, `seenToolIntros`, `journal`, `sandboxUnlocked`
  - `settings { sound, volume, reducedMotion, speed 1|2|4, quality, textScale }`
- `settings` is removed from `GameState`.
- Keys are `aqua-vault:v3:profile` and `aqua-vault:v3:level:<id>:a|b`, keeping the existing two-generation pattern from `storage.ts`.
- **Migration v2 → v3** in `migrations.ts`:
  - Old lesson ids map to the new ones. Completed lessons get 1 star.
  - A v2 village save is migrated in place, with objectives pre-latched.
  - Old small-lesson saves are dropped.
  - Old keys are deleted only after the v3 write succeeds.
- **Controller:** `loadLevel` refuses locked levels. "Skip" appears after 3 min; it unlocks the next level but records 0 stars and `skipped`.
  - On `levelComplete`: update the profile, take the star max, award the XP delta, save, and open the modal.
  - Apply the sound setting at startup, resuming audio on the first gesture.

## Phase 3: Renderer interface and input refactor (Canvas2D still active)
- New `src/game/render/types.ts` `GameRenderer`: `resize`, `render(frame)`, `pick(cssX, cssY)`, `cellToScreen(cell)`, `camera{ panByScreen, zoomAt, rotate, fit, focusCell }`, `fx(event)`, `structureChanged()`, `dispose()`.
- Move the current renderer, its terrain and buildings files, and the view math into `src/game/render/canvas2d/` as the fallback. Cap its terrain cache at 4096px.
- `TickSnapshot`: the previous tick's water, flow and per-building water, progress and rate, so the renderer can interpolate everything.
- New `src/game/input/gestures.ts`, a pure state machine:
  - A stroke commits only after more than 6px or 120ms.
  - A second pointer cancels the stroke (fixes the pinch bug).
  - Long-press inspects; two fingers pan, pinch and twist.
- Reuse `bresenham.ts` and `clientToCanvas`.

## Phase 4: Three.js diorama (`src/game/render3d/`, vanilla three)
- **Why not R3F:** the controller already owns the rAF loop, the fixed timestep and interpolation. Three is loaded with `await import()` in `controller.attach()` (client-only) behind an attach token for StrictMode. Shaders are TS strings and assets are procedural, so there are no loaders and no basePath issues.
- **Fallback:** if WebGL fails or the context is lost twice, the Canvas2D renderer takes over. Forced by `?renderer=2d` or Settings → "Classic 2D".
- **Modules:**

| Module | Responsibility |
|---|---|
| `ThreeRenderer.ts` | Orchestrator; no per-frame allocation. |
| `scene.ts` | sRGB, ACES, sky gradient, light fog. |
| `cameraRig.ts` | Ortho camera at pitch 55° (40–65°); 90° yaw snaps on Q/E; zoom 1–4; clamped pan; damped smoothing (instant with reduced motion); `focusCell`. |
| `units.ts` | 1 tile = 1 unit; 1 elevation step = 0.35. |
| `terrainMesh.ts` | 8×8 chunks; beveled tile tops; side walls only toward lower neighbours; canals carved 0.25 with banks; vertex colours from noise and greenness (reuse `hash01`, `mix`, `PALETTE` from `render/palette.ts`); terrace edge darkening; a heights tint mode; only dirty chunks rebuild. |
| `waterMesh.ts` | Prev/current `DataTexture`s (depth, flowX, flowY, wetAge) mixed by `alpha` in the vertex shader. Fragment shader: shallow→deep colour, flow-map streaks, caustics, edge foam, new-water ripples. Storage buildings get eased surface planes; clean water is tinted pale blue. |
| `buildings/*.ts` | One low-poly factory per type, `{ group, update(b, eased, t), dispose }`: instanced rice scaled by growth; wheel angle integrated from eased power; emissive house windows at night; instanced fish; reeds and shāpla; pump arrow; gate board; pipes to their host plant. |
| `vegetation.ts` | Instanced trees, grass and reeds with shader sway. |
| `particles.ts` | World-space pool of at most 300 (petals, dust, sparkles, rings). |
| `rain.ts` | Rain effect. |
| `lighting.ts` | Hemisphere light plus a sun on the day/night palette; shadows update only when the sun moves or structures change. |
| `overlays.ts` | Hover/selection outlines, green/red ghost placement, canal preview with red uphill chevrons, dashed tutorial path, highlight zone, keyboard cursor, height labels. |
| `smoothing.ts` | Exponential easing of fill, growth, wheel speed, lights and greenness. |
| `picking.ts` | Raycast against a hidden per-tile pick mesh. The pure ray↔heightfield math lives in `input/pick.ts` so it can be tested. |
| `quality.ts` | High, Medium and Low tiers (table below). Auto-downgrades if frame time stays above 22ms for 3s. Reduced motion turns off sway, ripples, momentum and bursts. |

- **Quality tiers:**

| Tier | DPR cap | Shadows | Vegetation |
|---|---|---|---|
| High | 2 | 2048 | 100% |
| Medium | 1.5 | 1024 | 60% |
| Low | 1 | baked AO | 30%, simple water |

- **Budget:** under 150 draw calls and 150k triangles in the village; 60 fps on desktop and 30+ fps on a mid-range phone; about +170KB gzipped.

## Phase 5: UI layout and progressive disclosure
`Game.tsx` becomes a full-screen canvas plus an overlay layer, replacing the 3-column grid in `globals.css`. New or rewritten components in `src/components/`:

| Component | What it does |
|---|---|
| `TopBar` | Level chip; only the current level's stats; weather icon with an EN + BN label (mobile too); ⋯ menu with pause, speed 1/2/4, journal, levels, settings. |
| `ObjectiveCard` (top-left) | Current objective as icon + one sentence + progress bar; done items fold into ticks; star criteria; "Show me" (`focusCell` + coach highlight); collapsible; `aria-live`. Replaces `Tutorial.tsx`. |
| `ToolBar` (bottom-centre) | Unlocked tools only, in level order; number keys follow the visible order; "New" badge and pulse; undo and erase on the right. Replaces `ToolDock.tsx`. |
| `InspectorPopover` | Anchored with `cellToScreen` and kept on screen; becomes a bottom sheet under 640px; Remove uses `removeBuilding`. |
| `LevelCompleteModal` | Animated stars; materials and time against par; XP; preview of the unlocked tool; Next / Stay / Replay. |
| `ToolIntroCard` | Shown on first unlock: what it does, where it works, what it needs. |
| `LevelSelect` | A path of 10 nodes plus the sandbox. |
| `Toasts` | At most 2, bottom-centre above the toolbar, live region. |
| `ui/Dialog` | One shared dialog with focus trap, focus restore, Esc and `aria-modal`. Replaces the copies in `Settings.tsx` and `Journal.tsx`. |
| `Settings` | Volume, reduced motion, quality / Classic 2D, text size, reset progress with confirmation. |

**Disclosure:** each level declares `visibleStats`.

| Level | Adds to the HUD |
|---|---|
| L1 | free canals and undo only |
| L2 | heights toggle |
| L3 | materials |
| L4 | stored water and speed control |
| L5 | energy |
| L6 | clean water |
| L7 | ecosystem and journal |
| L10 | rank / XP |

During "waiting" objectives (ripening, filling), the objective card shows a ⏩ chip.

**Writing rules** (recorded in `docs/07`):
- One action per objective, at most 12 words, starting with a verb.
- Always icon + text.
- Tool names exactly as on the toolbar.
- The "why" goes in the Journal.
- Bangla subtitle on titles only.

**React performance:**
- The controller publishes versioned slices (`hud`, `tools`, `objective`, `inspect`, `toasts`, `modal`, `hint`).
- New `useGameSelector` hook; `React.memo` on overlays; hover only touches `hint`.

**Accessibility:**
- All text tokens at 4.5:1 or better (warn becomes about #9a3f1e).
- 44px targets; focus rings.
- Keyboard map cursor kept; Q/E rotate the view.
- Self-host Noto Sans Bengali, with font paths that respect `NEXT_PUBLIC_BASE_PATH`.

## Phase 6: Polish, audio, cleanup, docs
- **Audio** (`audio/sound.ts`):
  - Water babble whose gain follows total canal flow.
  - Master volume GainNode.
  - Plunk when an objective latches; chord on level complete.
  - Still opt-in and gesture-started.
- **Remove dead code:**
  - `currentLessonStep`, `lessonComplete`, `waitForTool`, `LESSON_SCENARIOS`, `MILESTONES`, `hasWaterNearby`
  - duplicate `LEGACY_PREFIX`
  - `nextScenario` identical-branch ternary
  - hardcoded `/7` badge
  - `void keyboard`
- **Docs:**

| Doc | Update |
|---|---|
| 00 | Scope |
| 03 | Rain falls only on catchment tiles |
| 05 | Level table |
| 06 | Diorama art direction |
| 07 | Layout, disclosure, writing rules |
| 08 | `three` allowed, renderer interface, fallback |
| 09 | Profile v3 |
| 10 | Roadmap |
| 11 | One acceptance test per level |
| 13 | Pars, pipeRange, aerator, fish growth |
| 14 | Bundle size |
| README | Honest checklist |

---

## Verification
- **Unit tests (Vitest):**
  - `objectives.test.ts`: latching survives harvest; sustain resets; ordered vs unordered; event latching; levelComplete fires once; star boundaries.
  - `campaign.test.ts`: a scripted solution per level in `tests/campaignSolutions.ts`. Each uses only allowed tools, gets no command errors, keeps the mass residual within tolerance, completes within its tick budget, and a par script earns 3★. Negative case: L4 without a reservoir never latches the drought objective. L9: the pump really wets the terrace.
  - `profile.test.ts`: v2 fixtures migrate to v3; settings persist across levels; locked levels are refused; skip semantics; corrupt or future data handled; old keys kept if the write fails.
  - Command fixes: undo cap, gate gating, removeBuilding with a garden on the corner, canal refund 0, pipeRange, aerator.
  - `gestures.ts`: a pinch cancels the stroke. `pick.ts`: a raised tile is hit before the tile behind it.
  - Render data builders without WebGL: terrain chunk side faces, water texture packing, smoothing convergence.
  - Existing tests stay green; `playthrough.test.ts` moves onto the village level.
- **Gates every phase:** `npm test`, `npm run lint`, `npm run build`, and `NEXT_PUBLIC_BASE_PATH=/aqua-vault npm run build`.
- **Optional Playwright smoke test** against the served `out/`: canvas isn't blank, level 1 completes by keyboard, no console errors.
- **Manual checks:**
  - A fresh profile played through all 10 levels into the sandbox.
  - A v2 save upgrade.
  - Desktop at 1366×800; mobile at 390×844 and 320×568 with pinch, twist and long-press.
  - Reduced motion.
  - `?renderer=2d` fallback.
  - Low quality on a phone.
  - Contrast audit.
