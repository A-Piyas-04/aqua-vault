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

## Progressive disclosure and writing rules (supersedes the fixed side panels above)
The map fills the screen; UI floats over it. A slim top bar, an objective card (top-left), a bottom tool bar of **unlocked tools only**, and a popover inspector (a bottom sheet under 720 px).

Each level declares which stats appear (`hud` in `campaign.ts`): L1 free canals; L2 + heights toggle and Journal; L3 + materials; L4 + stored water and speed; L5 + power; L6 + clean water; L7 + life; L10 + rank and stars. A new tool gets a one-time card (what it does, where it goes, what it needs) and a "New" badge.

Instruction writing: one action per objective, imperative, at most 12 words, starting with a verb; always icon + text; name tools exactly as on the tool bar; put the "why" in the Journal, not on the card; Bangla subtitles on titles only. Dialogs trap focus, restore it on close and close on Esc. Keys: 1-0 tools, X erase, Q/E turn the view, F speed, M level map, J journal, P pause, H heights.
