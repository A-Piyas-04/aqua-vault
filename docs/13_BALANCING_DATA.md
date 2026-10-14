# Initial Balancing Parameters (Game Units, Not Real Units)

These numbers are **design starting points**; tune after real playtesting. Put them in a single typed config file, never scatter magic numbers.

## World and simulation
Grid 28×18; fixed step 100ms; base rain = 2 water units/tick on source group, heavy rain 4, drizzle 1, dry 0; max per-cell surface 20; canal flow factor x4; field moisture max 100; pond capacity 140; reservoir capacity 220; evaporation 0.01 per wet cell per tick (cap); weather phases cycle roughly every 90–180 simulation seconds (seeded). Display rates for understanding, not physical realism.

## Buildings and gameplay
| Item | Unlock level | Material cost | Input | Output / condition |
|---|---:|---:|---|---|
| Canal segment | 1 | 1 | physical water | raises flow conductivity |
| Rice paddy starter | 1 | 12 | wet neighbor | growth stage ~every 15 wet seconds |
| Reservoir | 2 | 25 | flow inlet | max 220 water units |
| Waterwheel | 3 | 30 | 0.5+/tick flow + >=1 cell elevation head | stored energy proportional to head × flow |
| Battery | 3 | 18 | power | cap 120 energy units |
| Treatment plant | 4 | 40 | >=0.5 raw water/tick + 1 energy/tick | ~0.4 clean water/tick |
| Village house connector | 4 | 15 | >=0.1 clean water/tick | inhabitance/visual progress |
| Fish pond | 5 | 35 | >=65/140 pond fill | slow fish growth; harvest materials |
| Wetland | 6 | 20 | moist shallow cells | ecology + decorative wildlife |
| Floating garden | 6 | 25 | standing water/wetland | slow vegetable growth |
| Pump | 7 | 45 | energy + raw water | moves water uphill, energy cost |

## XP thresholds cumulative
Lv1 0, Lv2 50, Lv3 120, Lv4 220, Lv5 360, Lv6 540, Lv7 760. Achievement XP in `02_GAMEPLAY_LOOP.md`; repeatable harvest can grant a **small** amount with a cooldown, but must not be exploitably looped in seconds.

## Anti-softlock
Start with 120 materials; build/erase grants partial refund; harvest yields +10–20; grants on major milestone +20–30; free essential starter canal allotment (first 10 segments) if needed. Never allow permanently unrepairable mistakes. Every milestone can be reached by player after recovery.

## Balance goals
First irrigated field by minute 2; turbine by minute 5–8; first cleaned supply by minute 8–12; fish by minute 12–18 after onboarding for ordinary play. These are tunable targets, not guaranteed. If test play is too slow, reduce building requirements before adding automatic free resources.
