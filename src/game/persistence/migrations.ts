import { CONFIG } from '../model/config';
import type { Building, GameState } from '../model/types';
import { createBuilding, createInitialState } from '../model/world';

export type LoadResult =
  | { ok: true; state: GameState; repaired: boolean }
  | { ok: false; reason: 'empty' | 'corrupt' | 'future'; message: string };

const ARRAY_KEYS = ['elevation', 'bed', 'canal', 'gate', 'bridge', 'water', 'saturation', 'flowX', 'flowY', 'structure'] as const;

function finiteOr(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

/**
 * Validate a parsed save, migrate older versions and repair recoverable corruption.
 * Unknown future major versions are rejected rather than guessed at.
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

  const fresh = createInitialState(typeof data.seed === 'number' ? data.seed : undefined);
  let repaired = false;
  const s = data as unknown as GameState;
  if (!s.grid || typeof s.grid !== 'object') return { ok: false, reason: 'corrupt', message: 'Save has no map' };
  const n = fresh.grid.w * fresh.grid.h;
  if (s.grid.w !== fresh.grid.w || s.grid.h !== fresh.grid.h || !Array.isArray(s.grid.terrain) || s.grid.terrain.length !== n) {
    return { ok: false, reason: 'corrupt', message: 'Map size mismatch' };
  }

  // Terrain/elevation/bed are authored: always trust the current world definition.
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
      merged.water = finiteOr(merged.water, 0, 0);
      merged.clean = finiteOr(merged.clean, 0, 0);
      merged.progress = finiteOr(merged.progress, 0, 0);
      merged.quality = finiteOr(merged.quality, 0.6, 0, 1);
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
  s.resources = {
    materials: finiteOr(res.materials, fresh.resources.materials, 0),
    xp: finiteOr(res.xp, 0, 0),
    energy: finiteOr(res.energy, 0, 0),
    freeCanals: finiteOr(res.freeCanals, 0, 0, CONFIG.progression.freeCanals),
  };
  s.achievements = Array.isArray(s.achievements) ? s.achievements.filter((a) => typeof a === 'string') : [];
  s.nextBuildingId = Math.max(finiteOr(s.nextBuildingId, 1), ...s.buildings.map((b) => b.id + 1));
  s.tick = finiteOr(s.tick, 0, 0);
  s.rngState = finiteOr(s.rngState, fresh.rngState) >>> 0;
  s.seed = finiteOr(s.seed, fresh.seed);
  if (!s.weather || typeof s.weather.mode !== 'string') {
    s.weather = fresh.weather;
    repaired = true;
  }
  s.ledger = { ...fresh.ledger, ...(s.ledger ?? {}) };
  s.history = Array.isArray(s.history) ? s.history : [];
  s.lastHarvestXpTick = finiteOr(s.lastHarvestXpTick, -1e9);
  s.regenTimer = finiteOr(s.regenTimer, 0);
  s.lastCleanTick = finiteOr(s.lastCleanTick, -1e9);
  s.settings = { ...fresh.settings, ...(s.settings ?? {}) };
  s.flags = { rain: true, sinks: true };
  s.version = CONFIG.saveVersion;
  return { ok: true, state: s, repaired };
}
