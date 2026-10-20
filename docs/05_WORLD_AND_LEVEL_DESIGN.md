# World, Level and Environmental Storytelling

## World
A stylized fictional lowland Bangladesh village, not a geographically exact town. A stream enters higher ground at top-left; an outlet lies bottom-right; homes, fields and an empty pond sit beyond dry land. Rich greens, rain-washed teal, terracotta paths, tin roofs, banana leaves, bamboo, shāpla flowers. Friendly understated details.

## Starter map logical zones (28x18)
- Northwest elevated ridge: rain catchment and initial trickle.
- Center: dry rice field and first canal corridor.
- Southwest: village homes; drinking-water receiving point.
- East: basin for reservoir and fish pond.
- Southeast lower channel: suitable turbine drop and outlet.
- South: future wetland and floating-bed extension.
- All mission-critical tiles reachable without impossible elevation routes. Pre-author elevations rather than generate random unsolvable terrain.

## Campaign: ten short levels, then an open village
Each level is a small hand-authored map that teaches ONE new idea, with 2 to 3 latched objectives (once an objective is done it never un-does). A level ends with a card showing 1 to 3 stars: 1 for finishing, +1 for spending at most the par materials, +1 for finishing within the par time. XP is paid once per level plus 10 per star improvement; it only drives a cosmetic Village Rank. Tools are unlocked by finishing levels, not by XP, and only unlocked tools appear on screen.

| # | Level | New idea | Tools added |
|---|---|---|---|
| 1 | First Canal (প্রথম খাল) | canals carry water | Canal |
| 2 | Water Flows Downhill (ঢাল বেয়ে) | heights; water cannot climb | (heights overlay) |
| 3 | Gates and Harvest (গেট ও ফসল) | gates; rice grows and is harvested | Gate, Rice paddy |
| 4 | Save the Rain (বৃষ্টি রাখো) | storage; a real, scripted dry spell | Reservoir |
| 5 | Power and Light (আলো জ্বালো) | flow x drop = power; starts at dusk | Waterwheel, Battery |
| 6 | Clean Water (বিশুদ্ধ পানি) | treatment; sealed pipes (10-tile range) | Treatment plant, Home tap |
| 7 | Living Pond (পুকুরে মাছ) | fish need fresh, moving water | Fish pond |
| 8 | Wetland & Floating Garden | shallow water, ecology | Wetland, Floating garden |
| 9 | Lift the Water (পানি তোলো) | pumps lift water uphill for power | Pump |
| 10 | The Village (গ্রাম) | everything together, then Village in Bloom | (all) |
| + | Open Village | free play | Fountain (aerates ponds), Bamboo bridge (decoration) |

The weather in a level can be scripted (level 4: rain until the reservoir is 60% full, then 1000 dry ticks). Pars live in `src/game/content/campaign.ts` and every level is proven solvable by `src/game/tests/campaign.test.ts`. Players can skip a level after 3 minutes of play (no stars, no XP); the Journal keeps every level's notes.

## Milestone progression (not rigid quest forcing)
A. First Stream: link rainfall to field.
B. Save the Rain: fill reservoir.
C. Let it Spin: position drop turbine.
D. Light the Village: supply battery / household electricity.
E. Every Drop Counts: treat raw water and supply a home.
F. Living Pond: sustain a fish habitat.
G. Village in Bloom: simultaneous operating farm, fish, powered home, treated supply and flowering wetland.

## Weather
Drizzle, sustained monsoon rain, brief sunshine, light nightfall, dry spells. Transition time is in-game, not real-time weather. Science-inspired water cycle; never treat extreme flooding as a comedic disaster.

## World-state art
Fields: cracked ochre→dark moist soil→sprouts→rice green→golden. Pond: empty depression→water line→lily pads→fish. Houses: dull windows→warm evening windows; plants and tiny figures appear. Channels: brown grooves→teal flow→ripple highlights.

## Camera
A fixed map initially, with responsive fit and optional zoom/pan on smaller screens. Never make text too small; icons/hit areas remain screen-space readable. Reserve UI safe area from notches.
