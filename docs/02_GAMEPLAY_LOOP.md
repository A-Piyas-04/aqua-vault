# Gameplay Loop, Economy and XP

## Core loop
Rain gathers → player draws a connected channel → gravity carries water → a destination receives water → the destination transforms and produces a resource → XP/unlocks enable a new way to direct or use water → player redesigns the network.

## Interaction verbs
- **Draw** a canal by mouse drag or finger drag over buildable cells.
- **Erase** canals deliberately (eraser tool / long press context alternative), never accidentally.
- **Place** a building on valid terrain or its own foundation.
- **Rotate** a gate, junction or turbine inlet if implemented.
- **Inspect** water quality, storage, crop progress, power, fish health.
- **Pause / change speed**: 1x and 2x; pause must not reset simulation.
- **Undo** the last building/canal edit, not time rewind of the whole simulation.

## Resources, independent accounting
- `waterVolume`: abstract units of water physically present on cells and in storage.
- `rawWater`: volume entering treatment; separate from cleanWater.
- `cleanWater`: treated volume reserved for household use; cannot be substituted by rawWater.
- `energy`: generated and consumed in abstract units per tick.
- `materials`: soft construction allowance; renewable gradually through milestones/harvest; avoid deadlocks.
- `xp`: cumulative earned, monotonic, never spent.
- `level`: derived from XP thresholds, not a separate source of truth.
- `ecosystemScore`: displayed qualitative wellbeing, not a competitive rank.

## XP events: award on meaningful transitions, not continuous tick spam
First canal delivered: +25 (once); first irrigated field: +35; first harvest: +30; reservoir first filled: +30; turbine first produces energy: +50; treatment first produces clean water: +60; first house supplied: +50; fish pond stocked: +45; first fish harvest: +40; wetland habitat thrives: +40; village-bloom milestone: +150. Milestone rewards idempotent via achievement IDs.

## Suggested progression
Lv1: canals + rice field + rain, Lv2: reservoir, Lv3: turbine + energy store, Lv4: treatment + household, Lv5: fish pond, Lv6: wetland + floating garden, Lv7+: cosmetic/aesthetic sandbox. See `13_BALANCING_DATA.md` for precise tuning.

## Sustainability
Water belongs to the landscape. Storing upstream starves downstream. Turbines need **moving water and a head drop**, not merely a full container. Farms consume irrigation water; reservoirs lose some to evaporation; homes consume clean water. Players can reconnect and recover after bad choices.

## Player-friendly errors
Tooltips: 'Needs a connection to flowing water'; 'Needs elevation drop'; 'Pump needs electricity'; 'Treatment needs raw water and energy'; 'Pond needs more water'; 'Water is flowing away from this field'. Prefer visually highlighting broken links.

## Optional replay hooks
Landscape seeds, aesthetic palettes, seasonal weather, alternate canal designs and small secrets. No addiction pressure or artificial streak punishment.
