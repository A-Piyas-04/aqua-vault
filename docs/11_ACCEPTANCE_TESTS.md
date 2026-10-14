# Definition of Done and Test Scenarios

## Core acceptance journey
1. Load a new map on desktop and 390px mobile: attractive functioning world, no errors.
2. Observe rain add water at source, see water travel downhill.
3. Draw a continuous path from rainwater to a dry field with mouse or touch. Field becomes wet and visibly grows, +XP milestone once.
4. Erase a link: flow stops downstream; reconnect restores it.
5. Place reservoir in basin, observe finite fill and overflow behavior; outlet can supply downstream.
6. Build turbine with head drop, observe nonzero generated power only while water is moving; removing drop or stopping flow stops energy.
7. Give treatment facility both raw water and electricity; see clean water accumulate. Disconnect power: clean-water production stops.
8. Supply household from clean-water store, observe meaningful visual transformation. Raw untreated water alone cannot satisfy household drinking supply.
9. Fill fish pond, stock fish and see fish swimming and growth/harvest.
10. Level unlocks occur only when thresholds met; achievements do not grant XP repeatedly.
11. Reload browser: world, resources, placed buildings and XP persist.
12. New World confirmation resets, while Reset View does not reset.

## Technical unit tests
- Flood water budget conserved under zero external input/loss.
- Flux cannot exceed source volume; all amounts finite and nonnegative.
- Disabled gate breaks channel path.
- No power from stationary water or zero head.
- Pump obeys water/power conservation.
- Treatment cannot output without raw input + required power.
- Crop cannot advance without wet supply.
- Fixed seed yields deterministic weather/events.
- Save migration rejects future unknown major versions gracefully.
- Pointer interpolation fills intervening grid cells at fast cursor speed.

## UX QA
- No primary tool hidden under hover.
- Canvas not stretched or blurry at high DPI.
- Scrollable menus do not block canvas interaction.
- On small screens, bottom dock never covers active map actions.
- Functional undo, mute, pause and settings.
- Legible Bangla glyphs and contrast; reduced-motion option.
- No autoplay audio, no paid API calls or network requirement once assets loaded.

## Review gates
Must pass `npm run build`, `npm run test` (if configured), manual integrated gameplay, mobile responsive inspection, and accessibility checks. In README note any real limitations or deferred features, never mark incomplete capabilities as shipped.
