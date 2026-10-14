# Interconnected Water Systems and Buildings

All structures have footprint, cost, unlock level, required inputs, production, visual states, inspect panel and placement rules. Each is connected to **actual nearby tile/storage water**, not a global water counter.

| Structure | Input / condition | Output / visual reward | Failure / recovery |
|---|---|---|---|
| Canal | excavatable soil | faster gravity-driven flow; blue moving stream | disconnect/erase and reroute |
| Junction/gate | canal adjacency | split or redirect flow | rotate / open / close |
| Rice paddy | adjacent wet cell, periodic supply | soil→seedlings→lush green→gold rice; materials on harvest | dries and stalls; re-water |
| Reservoir | inlet, finite capacity | stored water with rising surface; supplies outlets | full overflow routes safely |
| Waterwheel/turbine | flow + height drop | spinning wheel, electricity, downstream water | no flow/head: idle |
| Battery | turbine electricity | stores power, dusk windows glow | exhaustion dims lights |
| Treatment plant | raw intake + electricity | staged filter/heat/covered storage; clean water | displays missing input |
| Village homes | clean supply + optionally electricity | smoke-free cozy lights, plants, residents visit | lights dim / supply pauses |
| Fish pond | water minimum and stable level | visible fish, ripples, stock/growth/harvest | low water slows growth; no animal suffering imagery |
| Wetland | sustained shallow water | reeds, lotus, birds, frogs | dries and can recover |
| Floating garden (advanced) | sufficiently stable pond/wetland | vegetables on floating beds | follows water level |
| Pump (advanced) | battery + intake + destination | moves water uphill | power loss stops |
| Bridge / fountain | adjacent water + optional power | aesthetic completion | no gameplay-critical lock |

## Fish farm logic
Fish `growth` increases only with adequate water volume and a simplified `waterQualityScore`. Stocking costs materials; harvest returns materials + XP first time. Avoid simulation of disease or death in MVP. Include visual fishes on a pond. Clean potable water is **not** a requirement for fish; ecology has its own water-quality state.

## Farm logic
Growth stages 0–3 tied to cumulative wet ticks; drought pauses, doesn't erase stages immediately. Harvest is a clickable event; replant supported. Use wet input from an adjacent water tile or inlet gate; draw a clear drip/wave visual when irrigating.

## Hydropower logic
Place at a channel drop or reservoir outlet with a detectable one-cell or greater upstream/downstream elevation difference. Only flowing water yields power. Turbine is not a mythical rain battery. Make the wheel rotation speed reflect power.

## Treatment sequence
Raw-water intake → particle filtration → energy-powered disinfection/heat in a fictional compact plant → protected clean-water storage → home delivery. Show per-stage indicators. Acknowledge actual rainwater quality varies, and some contaminants cannot be removed simply by boiling.

## Buildings must interact
Example chain: Rain fills reservoir → outlet drives turbine → generated energy powers treatment → separate branch supplies raw treatment intake → clean water serves homes; overflow irrigates rice and sustains fish pond. If turbine steals all flow and the village dries, player can change gate allocation. This is the design's principal puzzle.

## Expansion candidates
Duck pond, bamboo water bridge, rain garden, water mill, textile dye garden (safe fictional colors), mangrove nursery (region-appropriate maps only), rooftop rain-harvesting, groundwater recharge basins, water-powered grain mill, micro-fountain, nighttime bioluminescence strictly labeled fantasy, flood-retention garden. Build later, not in first playable slice.
