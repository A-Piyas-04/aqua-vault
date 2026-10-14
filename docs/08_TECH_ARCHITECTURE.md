# Technical Architecture — Static-First Next.js

## Selection
Next.js (App Router) + TypeScript + React for shell/UI, **HTML Canvas 2D or optimized SVG** for game world. Avoid engines, massive physics libs and custom hosted backend. This is a deliberate change from the earlier vanilla-only concept: the user explicitly approved Next.js for expansion.

## Client-side boundaries
Use `'use client'` for game renderer and controls. The canonical simulation is framework-agnostic pure TypeScript. React displays derived snapshots / panels; never store all 500 tile objects in React state at 60fps. Avoid server actions, remote auth or API calls in MVP. `output: 'export'` can be used if compatible with project setup; do not import Node-only modules into client bundles.

## Suggested directories
```
app/page.tsx
app/layout.tsx
app/globals.css
src/game/model/{types,config,world,buildings}.ts
src/game/sim/{tick,water,weather,power,consumers,progression}.ts
src/game/render/{renderer,terrain,water,particles}.ts
src/game/input/{pointer,tools,coordinateMapping}.ts
src/game/persistence/{storage,migrations}.ts
src/game/content/{milestones,strings,worldSeed}.ts
src/components/{GameCanvas,GameHUD,ToolDock,Inspector,Tutorial,Settings}.tsx
src/game/tests/*.test.ts
public/{sprites,sounds}/
```

## Model boundaries
`GameState` is serializable and contains version, seed, grid, buildings, resources, unlocked achievement IDs, XP and weather phase. No HTML elements, Canvas contexts, Date or class instances in saved state. `stepGame(state, dt, commands)` yields next state and events; renderer reads state but never mutates it. Input emits validated commands. Rendering interpolates presentation positions only.

## Determinism
Use explicit seeded PRNG state instead of `Math.random()` inside simulation. Same initial seed + commands yields same outcome. Run simulation at fixed 100ms timestep; use accumulated `requestAnimationFrame` and clamp frame deltas.

## Modules
Water mass ledger, structure producer/consumer ledger, resource accounting, progression events and serialization migrations should be separately unit-testable.

## Libraries
Minimal dependencies preferred. Native Canvas/Pointer/Web Audio enough. Testing with Vitest; browser automation optional Playwright if available. If an asset library is used, document license and size.

## Progressive delivery
Initial pure frontend can be deployed as static export. Supabase integration belongs behind optional `SaveRepository` interface; its absence must not alter gameplay. A database is not required for any game mechanics.
