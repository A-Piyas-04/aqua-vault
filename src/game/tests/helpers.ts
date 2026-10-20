import type { GameState, Terrain } from '../model/types';
import { createGrid, createInitialState } from '../model/world';
import { ALL_TOOLS } from '../content/campaign';

/** A small custom sandbox: soil everywhere, given elevations, no buildings, sinks/rain off. */
export function makeSandbox(w: number, h: number, elev: (x: number, y: number) => number, terrain?: (x: number, y: number) => Terrain): GameState {
  const base = createInitialState(42);
  const t: Terrain[] = [];
  const e: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      t.push(terrain ? terrain(x, y) : 'soil');
      e.push(elev(x, y));
    }
  }
  base.grid = createGrid(t, e, w, h);
  base.buildings = [];
  base.flags = { rain: false, sinks: false };
  base.resources.materials = 10000;
  base.allowedTools = [...ALL_TOOLS];
  base.weather = { mode: 'dry', remaining: 1e9, duration: 1e9 };
  return base;
}

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function allFinite(state: GameState): boolean {
  const g = state.grid;
  for (let i = 0; i < g.water.length; i++) {
    if (!Number.isFinite(g.water[i]) || g.water[i] < 0) return false;
    if (!Number.isFinite(g.saturation[i]) || g.saturation[i] < 0 || g.saturation[i] > 1 + 1e-9) return false;
  }
  for (const b of state.buildings) {
    if (!Number.isFinite(b.water) || b.water < 0 || !Number.isFinite(b.clean) || b.clean < 0) return false;
  }
  return Number.isFinite(state.resources.energy) && state.resources.energy >= 0;
}
