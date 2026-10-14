# Water Simulation — Algorithmic Contract

## Design choice
Use a **deterministic 2D grid and discrete fixed-timestep fluid approximation**, not Navier–Stokes / expensive particle physics. Visual particles are overlays; the authoritative water quantity remains in grid/storage state. Start with a 28 × 18 logical grid and fixed `dt = 0.1s`; tune later. Render at 60 fps when possible, simulate at 10 ticks/sec. When tab is hidden, pause or cap catch-up steps.

## Terrain and cell state
Each tile: `{terrain: soil|rock|source|pond|river|field|foundation, elevation: integer 0..6, canal: boolean, surfaceWater: number >=0, saturation: 0..1, flowVisual: vector2}`. `structureId` optional. Rain source(s) have tile ID and volumetric rainRate; natural outlets are explicit.

## Water model
Define water-surface height `H_i = elevation_i * HEIGHT_SCALE + surfaceWater_i / CELL_CAPACITY`. For adjacent accessible cells j, compute nonnegative desired transfer `q_ij = conductance_ij * max(0,H_i - H_j) * dt`, bounded by available water in i and receiving capacity in j. Canal tiles increase conductance. Flat terrain may need small directed gradient from a source or a canal slope control so water visibly advances; don't create water on flat tiles. Compute fluxes from a snapshot, proportionally scale all outflows per source to its available water, then apply simultaneously. No negative water.

Permitted edges: N/S/E/W only; enforce obstacles, gates, banks, construction masks. Reservoirs and ponds use explicit capacities with fill/drain rate; no instant teleportation. Building intake and output appear in the same mass ledger.

## Explicit mass balance
At every tick: `newTotal ≈ previousTotal + rainAdded - evaporation - cropUptake - householdUse - dischargedAtOutlet - otherDocumentedSinks`; transferring between tiles/storage never creates or destroys water. Treatment converts raw→clean, not water→electricity. Record per-tick budget metrics in dev mode. Tolerance for floating-point error 1e-5 × max(1, total). Keep volume bounds and finite numbers.

## Power
Toy hydropower: `power = efficiency * k * actualFlowThroughTurbine * max(0, upstreamHydraulicHead - downstreamHead)`; no power without sustained flux or elevation drop. Turbine passes water downstream; it does **not** consume it. Power bank stores electricity within capacity; consumers draw power per tick. Player may choose fictional ultra-efficient micro-turbines but never perpetual energy.

## Pump
Pump consumes energy and moves actual water from inlet to outlet against a modest height difference, subject to capacity. For example energyCost = fixedPowerPerVolume * movedVolume * (1 + liftFactor * elevationGain). Without energy, pump stops.

## Water quality
Track `quality` by category (`raw`, `treated`) instead of complex chemistry. Treatment consumes energy and a filtered raw supply, with output efficiency <=1; produces clean water only if configured as complete multi-barrier treatment. Boiling stage is depicted as disinfecting, not removing chemical contaminants. The game must include a science note that unsafe real-world water cannot be made safe by boiling alone.

## Weather and environment
Gentle rain, heavy rain, drizzle, dry interval. Rain is finite, weather evolves with a seeded random generator; player can influence strategy, not summon unlimited water. Long dry intervals should not cause unrecoverable locks.

## Rendering
Canvas or layered SVG renders terrain, channels, moving stream highlights, rain, fish, ripples and particles. Keep all game logic independent of rendering and React state. Use interpolation for visual smoothness. Touch draws logical cells using pointer capture; sample intervening cells on fast drags (Bresenham line rasterization).

## Testable invariants
1. Rain disabled + sinks disabled: total water conserved under network transfers.
2. No cell below zero / reservoir above capacity.
3. Blocked channel stops flux.
4. Unconnected canal cannot feed a structure.
5. Turbine output exactly zero with zero flow or zero head.
6. Pump cannot output with no power / no input water.
7. Clean water cannot increase without treatment inflow (except explicitly granted tutorial stock).
8. Same seed + actions + timestep yields reproducible state.
9. Extreme rain never creates NaN or broken array bounds.

## Performance fallback
If grid/rendering slow: fewer visuals, cap particles, batch draw calls, use memoized static background canvas, 10Hz simulation / 30fps visuals. Never degrade simulation correctness before visual polish.
