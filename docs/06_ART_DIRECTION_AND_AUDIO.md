# Art Direction, Motion and Sound

## Look
Cozy **low-poly 3D miniature diorama** (Three.js): a tilted orthographic camera over terrain blocks extruded by elevation, flat-shaded procedural models, soft shadows and a shader water surface that shows flow. Not photoreal; no imported meshes or textures (everything is generated in code). A classic top-down Canvas 2D renderer remains as the automatic fallback and as the "Classic 2D" setting. Single coherent palette below.

## Palette
Rain #77BFD4, deep water #237E90, fresh green #5FAB67, rice gold #D8B65A, dark soil #78624E, clay #BE8060, sky #DCEEF0, night navy #25394D, warm home glow #FFD38A. Ensure UI text contrast independently of scenic colors.

## Visual priority
Water movement first; everything else second. Canals have legible connection endpoints; directional ripples communicate flow. Full reservoirs gradually change shoreline. Gates visibly open/close. Waterwheels spin only during valid power generation. A crop changes stage visually, not via only a progress meter.

## Animations
- Canal digging: short dusty sweep / soft click.
- Water arrival: sparkly ripple spreading along path, not an instant global recolor.
- Plant growth: staged sprouting with gentle overshoot, not violent popping.
- Turbine: rotation speed proportional to calculated power.
- Clean water: flowing pale-blue visual only after actual treatment.
- Fish: subtle looping swimming within pond bounds.
- Time change: gradual sky palette.
- Milestones: 1–2 second celebratory bloom, no intrusive modal cascade.

## Audio
Opt-in audio; ambient rainfall / birds / frogs / soft canal babble; quiet plunks on water connection; muted wooden clicks for buildings; soft chime for milestones. Use procedural Web Audio where possible, with volume/mute toggles. Browser audio only starts on interaction. Respect reduced motion and mute.

## Asset approach
Prefer SVG vectors and procedural Canvas detail. If external assets are required, use legally licensed assets with attribution. Avoid relying on live remote image services at runtime. No user photos needed.

## Performance budget
Keep total images small (<3MB aspirational); animate via requestAnimationFrame and avoid excessive DOM nodes per tile. Particle count capped. Mobile should remain responsive even after long sessions.
