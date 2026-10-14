# AQUA-VAULT — Cursor Implementation Entry Point

## Mission
Implement **aqua-vault**, a polished, cozy, Bangladesh-inspired browser ecosystem game. The player **draws canals**, sends rainfall through a miniature landscape, stores water, irrigates crops, builds ponds, powers turbines, purifies drinking water, raises fish, and gradually revives a small village. The landscape is the main character.

## Instructions for the coding agent
1. Read **all `docs/*.md`**, especially the requirements and acceptance tests, before writing code.
2. Inspect the actual repository first; preserve existing work unless it conflicts with these requirements.
3. Implement a complete playable **vertical slice** first; then expand in the phase order of `10_IMPLEMENTATION_ROADMAP.md`. Do not substitute static mockups for a functioning simulation.
4. Work autonomously; choose reasonable implementation details from these documents and don't stop for ordinary clarification.
5. Do not claim a subsystem works without testing it. Report what was actually implemented and what is deferred.
6. Prioritize a beautiful, tactile, responsive game over quantity of decorative menus.

## Document map
- `01_PRODUCT_VISION.md` — goals, principles, scope
- `02_GAMEPLAY_LOOP.md` — actions, progression, resources and XP
- `03_WATER_SIMULATION.md` — deterministic water algorithm and invariants
- `04_SYSTEMS_AND_BUILDINGS.md` — farms, fish, electricity, clean water and expansion
- `05_WORLD_AND_LEVEL_DESIGN.md` — map, environment, onboarding, seasons
- `06_ART_DIRECTION_AND_AUDIO.md` — presentation and feedback
- `07_UI_CONTROLS_AND_ACCESSIBILITY.md` — mouse/touch controls and responsive HUD
- `08_TECH_ARCHITECTURE.md` — Next.js browser-first engineering
- `09_SAVE_DATA_AND_FUTURE_SUPABASE.md` — local save and optional cloud
- `10_IMPLEMENTATION_ROADMAP.md` — prioritized build phases
- `11_ACCEPTANCE_TESTS.md` — functional success criteria
- `12_SCIENCE_AND_CULTURE.md` — scientific boundaries and Bangladesh details
- `13_BALANCING_DATA.md` — tunable configuration tables
- `14_RELEASE_AND_DEPLOYMENT.md` — free hosting, build and QA
- `15_BACKLOG_AND_CREATIVE_EXPANSIONS.md` — optional future gameplay
- `16_SOURCE_NOTES.md` — researched sources and citations

## Scope contract
**Required shipping experience:** rainfall → draw canal → water flows downhill → irrigation → crop growth → storage reservoir → waterwheel electricity → treatment facility → household water → fish pond → XP/unlocks → save/load. Each must be connected mechanically, not merely represented as a decorative button.

**Not required in first release:** accounts, multiplayer, leaderboards, server database, real-world accurate engineering, procedural infinite worlds, real payment or monetization.

## Run command target
`npm install && npm run dev` must launch a working game. `npm run build` must pass. Provide README with commands and known limitations.
