import { CONFIG } from '../model/config';
import type { Building, GameState, HistoryEntry, LevelId, WeatherMode } from '../model/types';
import { createBuilding, createInitialState } from '../model/world';
import { getLevel, isLevelId } from '../content/campaign';
import { levelIdFromV2 } from './profile';

export type LoadResult =
  | { ok: true; state: GameState; repaired: boolean; legacySettings?: unknown }
  | { ok: false; reason: 'empty' | 'corrupt' | 'future'; message: string };

const ARRAY_KEYS = ['elevation', 'bed', 'canal', 'gate', 'bridge', 'water', 'saturation', 'flowX', 'flowY', 'structure'] as const;
const WEATHER_MODES: WeatherMode[] = ['drizzle', 'rain', 'heavy', 'dry'];
const HISTORY_KINDS = new Set(['canal', 'eraseCanal', 'place', 'eraseBuilding', 'gate', 'bridge']);

function finiteOr(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function resolveLevelId(data: Record<string, unknown>): LevelId {
  if (isLevelId(data.levelId)) return data.levelId;
  return levelIdFromV2(data.scenarioId) ?? 'village';
}

/**
 * Validate a parsed save, migrate older versions (v1/v2 scenario saves) and repair
 * recoverable corruption. Unknown future versions are rejected rather than guessed at.
 * Authored data (terrain, heights, tool list) always comes from the current level.
 */
export function migrateSave(raw: unknown): LoadResult {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'corrupt', message: 'Save is not an object' };
  const data = raw as Record<string, unknown>;
  const version = data.version;
  if (typeof version !== 'number' || !Number.isFinite(version)) {
    return { ok: false, reason: 'corrupt', message: 'Save has no version' };
  }
  if (Math.floor(version) > CONFIG.saveVersion) {
    return { ok: false, reason: 'future', message: `Save is from a newer version (${version}) of the game` };
  }

  const levelId = resolveLevelId(data);
  const level = getLevel(levelId);
  const fresh = createInitialState(typeof data.seed === 'number' ? data.seed : undefined, levelId);
  let repaired = false;
  const s = data as unknown as GameState;
  const legacySettings = 'settings' in data ? data.settings : undefined;
  if (!isLevelId(data.levelId) && version >= 3) repaired = true;

  if (!s.grid || typeof s.grid !== 'object') return { ok: false, reason: 'corrupt', message: 'Save has no map' };
  const n = fresh.grid.w * fresh.grid.h;
  if (s.grid.w !== fresh.grid.w || s.grid.h !== fresh.grid.h || !Array.isArray(s.grid.terrain) || s.grid.terrain.length !== n) {
    return { ok: false, reason: 'corrupt', message: 'Map size mismatch' };
  }

  s.grid.terrain = fresh.grid.terrain;
  s.grid.elevation = fresh.grid.elevation;
  s.grid.bed = fresh.grid.bed;

  for (const key of ARRAY_KEYS) {
    const arr = (s.grid as unknown as Record<string, unknown>)[key];
    if (!Array.isArray(arr) || arr.length !== n) {
      (s.grid as unknown as Record<string, number[]>)[key] = (fresh.grid as unknown as Record<string, number[]>)[key].slice();
      repaired = true;
      continue;
    }
    for (let i = 0; i < n; i++) {
      const v = arr[i];
      const fixed = finiteOr(v, key === 'structure' ? -1 : 0, key === 'water' || key === 'saturation' ? 0 : -Infinity);
      if (fixed !== v) {
        arr[i] = fixed;
        repaired = true;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    if (s.grid.saturation[i] > 1) {
      s.grid.saturation[i] = 1;
      repaired = true;
    }
    if (s.grid.water[i] > CONFIG.water.maxCellWater) {
      s.grid.water[i] = CONFIG.water.maxCellWater;
      repaired = true;
    }
  }

  const buildings: Building[] = [];
  if (Array.isArray(s.buildings)) {
    for (const b of s.buildings as Partial<Building>[]) {
      if (!b || typeof b.id !== 'number' || typeof b.type !== 'string' || !(b.type in CONFIG.footprint)) {
        repaired = true;
        continue;
      }
      const base = createBuilding(b.id, b.type as Building['type'], finiteOr(b.x, 0), finiteOr(b.y, 0));
      const merged: Building = { ...base, ...b } as Building;
      // Footprints are authored: never trust a saved size.
      merged.w = base.w;
      merged.h = base.h;
      merged.water = finiteOr(merged.water, 0, 0);
      merged.clean = finiteOr(merged.clean, 0, 0);
      merged.progress = finiteOr(merged.progress, 0, 0);
      merged.quality = finiteOr(merged.quality, 0.6, 0, 1);
      merged.dir = Math.floor(finiteOr(merged.dir, 1, 0, 3));
      buildings.push(merged);
    }
  } else {
    repaired = true;
  }
  s.buildings = buildings.length ? buildings : fresh.buildings;

  // Rebuild the structure index from buildings so the two can never disagree.
  s.grid.structure = new Array(n).fill(-1);
  for (const b of s.buildings) {
    if (b.type === 'floating') continue;
    for (let y = b.y; y < b.y + b.h; y++) {
      for (let x = b.x; x < b.x + b.w; x++) {
        if (x < 0 || y < 0 || x >= fresh.grid.w || y >= fresh.grid.h) continue;
        s.grid.structure[y * fresh.grid.w + x] = b.id;
      }
    }
  }

  const res = (s.resources ?? {}) as Partial<GameState['resources']>;
  const freeMax = fresh.resources.freeCanalsMax;
  s.resources = {
    materials: finiteOr(res.materials, fresh.resources.materials, 0),
    energy: finiteOr(res.energy, 0, 0),
    freeCanals: finiteOr(res.freeCanals, 0, 0, freeMax),
    freeCanalsMax: freeMax,
  };
  s.achievements = Array.isArray(s.achievements) ? s.achievements.filter((a) => typeof a === 'string') : [];
  s.nextBuildingId = Math.max(finiteOr(s.nextBuildingId, 1), ...s.buildings.map((b) => b.id + 1));
  s.tick = Math.floor(finiteOr(s.tick, 0, 0));
  s.rngState = finiteOr(s.rngState, fresh.rngState) >>> 0;
  s.seed = finiteOr(s.seed, fresh.seed);
  if (!s.weather || !WEATHER_MODES.includes(s.weather.mode) || !(finiteOr(s.weather.remaining, 0) > 0)) {
    s.weather = fresh.weather;
    repaired = true;
  } else {
    s.weather = { mode: s.weather.mode, remaining: finiteOr(s.weather.remaining, 1, 1), duration: finiteOr(s.weather.duration, 1, 1) };
  }
  const steps = level.weatherScript?.steps.length ?? 0;
  const ws = finiteOr(s.weatherStep, fresh.weatherStep);
  s.weatherStep = steps > 0 && Number.isInteger(ws) && ws >= 0 && ws < steps ? ws : steps > 0 ? fresh.weatherStep : -1;
  s.dayOffset = finiteOr(s.dayOffset, fresh.dayOffset);
  s.ledger = { ...fresh.ledger, ...(s.ledger ?? {}) };
  s.history = Array.isArray(s.history)
    ? (s.history as unknown[]).filter((h): h is HistoryEntry => !!h && typeof h === 'object' && HISTORY_KINDS.has((h as { kind?: string }).kind ?? ''))
    : [];
  for (const h of s.history) if (h.kind === 'eraseCanal') h.freeReturned = finiteOr(h.freeReturned, 0, 0);
  s.regenTimer = finiteOr(s.regenTimer, 0);
  s.lastCleanTick = finiteOr(s.lastCleanTick, -1e9);
  s.flags = { rain: true, sinks: true };
  s.levelId = levelId;
  s.allowedTools = [...level.tools];

  const valid = new Set(level.objectives.map((o) => o.id));
  const obj = (s.objectives ?? {}) as Partial<GameState['objectives']>;
  const sustain: Record<string, number> = {};
  if (obj.sustain && typeof obj.sustain === 'object') {
    for (const [k, v] of Object.entries(obj.sustain)) if (valid.has(k)) sustain[k] = finiteOr(v, 0, 0);
  }
  s.objectives = {
    done: Array.isArray(obj.done) ? obj.done.filter((d): d is string => typeof d === 'string' && valid.has(d)) : [],
    sustain,
    completedTick: typeof obj.completedTick === 'number' && Number.isFinite(obj.completedTick) ? obj.completedTick : null,
    stars: finiteOr(obj.stars, 0, 0, 3),
  };
  const st = (s.stats ?? {}) as Partial<GameState['stats']>;
  const had = (id: string) => (s.achievements.includes(id) ? 1 : 0);
  s.stats = {
    spent: finiteOr(st.spent, 0),
    harvestRice: finiteOr(st.harvestRice, had('first-harvest'), 0),
    harvestFish: finiteOr(st.harvestFish, had('fish-harvest'), 0),
    harvestGarden: finiteOr(st.harvestGarden, had('floating-harvest'), 0),
    stocked: finiteOr(st.stocked, had('fish-stocked'), 0),
  };

  // Fields that no longer exist in v3.
  const legacy = s as unknown as Record<string, unknown>;
  delete legacy.settings;
  delete legacy.scenarioId;
  delete legacy.lastHarvestXpTick;
  delete (s.resources as unknown as Record<string, unknown>).xp;

  s.version = CONFIG.saveVersion;
  return { ok: true, state: s, repaired, legacySettings };
}
