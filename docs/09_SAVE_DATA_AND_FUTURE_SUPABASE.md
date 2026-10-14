# Persistence and Future Backend

## MVP
Save serialized `GameState` locally. Use localStorage for small ~28x18 maps; IndexedDB can be introduced if snapshots become large. Autosave throttled (e.g. every 15 seconds or on important actions), save on pagehide best effort; keep two generations or backup snapshot. Loading validates schema/version and repairs recoverable corruption or offers 'New World'. Never assume private browsing allows writes.

## Save schema example
```json
{"version":1,"worldSeed":1527,"simTime":1234,"weather":{"mode":"rain","phase":0.4},"grid":[],"buildings":[],"resources":{"xp":120,"materials":90,"cleanWater":0,"energyStored":0},"achievements":["first-irrigation"],"settings":{"sound":false,"reducedMotion":false}}
```
Actual serialized format may use compact tile arrays. Save explicit `prngState` for deterministic continuation. Never store frame-only particles.

## Save operations
New world (confirmation), Reset view, Save now, Import/Export JSON (future), error recovery. Warn that clearing browser data or switching devices loses local saves unless exported or sync exists.

## Future Supabase (do not implement until explicitly requested)
Optional auth and cloud sync of compressed, versioned snapshots by user ID; never centralize every simulation tick. Enforce Row Level Security so users only access their own saves. Use anon/publishable browser keys only; never expose service-role secret. Server timestamps for conflict detection; manual resolve if local is newer. Offline-first remains authoritative until successful merge. Use migration and debounced save uploads.

## Free hosting reality
Frontend-only Next.js/static hosting is compatible with free-tier deployment subject to platform rules and resource quotas. Supabase also has a Free plan but quotas and project lifecycle rules can change; a backend is **not automatically paid**. A database integration is optional, not justified for v1. No free tier is an unconditional lifetime uptime guarantee.
