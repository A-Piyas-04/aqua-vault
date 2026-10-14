# Build Roadmap — Agent Execution Sequence

## General rule
Do not scaffold all systems as placeholders. Get each phase playable and tested before building the next. If time is limited, complete fewer systems at higher quality and record the remaining items in README.

### Phase 0 — foundation (target ~15–25 min)
- Inspect repository, create Next.js/TS shell only if absent.
- Full-screen adaptive scene, mock map with valid elevations, overlay toolbar.
- Render world, source, field, houses, rocks, tile hover/tap preview.
- Verify mouse/touch coordinates against CSS scaling.

### Phase 1 — satisfying water toy (~25–40 min)
- Grid water sim, falling rain, gravity, canal draw/erase, undo.
- Animated water motion and saturation visual.
- Show valid/invalid drag previews and flow diagnostics.
- Water mass-conservation unit tests.
- Milestone: player draws canal and a field visibly greens.

### Phase 2 — connected resources (~30–45 min)
- Field irrigates/grows; reservoir stores/discharges water.
- Turbine at a drop produces measured energy; animated wheel.
- Treatment consumes raw water and power, produces clean reserve.
- House receives treated water, optionally lights up with energy.
- Show resources and clear tooltips; unit tests for chains.

### Phase 3 — life and progression (~20–35 min)
- Fish pond with stock/grow visuals.
- XP unlocks, milestone events, gentle feedback.
- Soft weather pattern and pond/rice graphics.
- Save/load versioned local snapshot.

### Phase 4 — polish and release (~25–45 min)
- Mobile UI and touch QA, sounds optional, reduced motion.
- Visible fish / butterflies / shāpla with low particle budget.
- Tutorials, first-run progression, tooltips and empty states.
- Build, unit tests, test complete integrated loop.
- Publish-ready README and free static hosting instructions.

## Realistic scheduling note
The earlier **1–2 hour idea applies to the original small water toy**, not a fully polished six-system economy. This expanded MVP is several hours of AI-assisted implementation and iteration; Cursor should prioritize a coherent playable vertical slice over rushing. No deadline promise.

## Autonomous completion behavior
At the end of each phase, run tests/build, fix failures, and advance. If blocked by a dependency or external service, replace only that integration with a documented local solution while preserving game features. Do not fabricate implemented mechanics in a changelog.
