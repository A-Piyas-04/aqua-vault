# Interface and Controls — Mobile and Desktop

## Layout
The game scene occupies 70–85% of visible area. Desktop: left utility/tool strip, scene center, small collapsible inspector right. Mobile: scene above a bottom tool dock; compact top status row; inspector as bottom sheet. Avoid lengthy paragraphs or crowded HUDs.

## Input model
Use Pointer Events with `pointerdown/move/up`, pointer capture and correct `touch-action` on the play surface. Canvas coordinates must map through actual `getBoundingClientRect()` and device pixel ratio. Drawing interpolates skipped tiles. Mouse left drag = draw; right click optional erase but always offer visible erase button. Mobile drag = draw, tap = select/inspect, two-finger pan / pinch optional; provide explicit camera controls if pinch omitted. Minimum touch target 44×44 CSS px.

## Tools
Canal, erase, place field, reservoir, turbine, treatment plant, fish pond, home connector, inspect, undo. Build options locked by XP show future names and clear unlock levels, not disappearing.

## Information design
Top: XP level, rain status, stored water, power and clean water. Select an asset to display input→output and diagnostic statuses. An 'Ecosystem' panel shows what lives now; avoid hidden math puzzles. Tutorial prompts are short and dismissible.

## Feedback
Valid placement green preview; invalid placement red/amber with reason; no silent failures. Connection changes trigger small flow cue. Auto-save marker periodically but not every frame. A Pause button and Restart World confirmation.

## Accessibility
Color isn't the sole signal; shape/pattern plus labels for clean/raw, powered/unpowered, wet/dry. Keyboard focus and semantic HTML for all menus; canvas interactions need alternative tile selection controls or accessible grid mode. Support English labels with selected Bangla terms; font includes Bangla glyph support with sensible fallback. Reduced motion mode suppresses particles and rapid movement. Sound off by default.

## Device tests
320px wide phone portrait, 390px phone portrait, tablet, 1366px desktop. No sideways page scrolling; browser pinch/scroll conflicts prevented only on actual game canvas, not menus. Restart, build, play, save all work on touch without hover.
