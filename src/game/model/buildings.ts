import { CONFIG } from './config';
import type { BuildingTypePlaceable, GameState, Grid, Terrain, ToolId } from './types';
import { getBuilding, idx, inBounds } from './world';

export const STORAGE_TYPES = new Set(['reservoir', 'fishpond', 'wetland']);

export const CANAL_TERRAIN: ReadonlySet<Terrain> = new Set(['soil', 'basin', 'marsh', 'foundation', 'path']);
const DRY_BUILD_TERRAIN: ReadonlySet<Terrain> = new Set(['soil', 'foundation', 'path', 'marsh']);

export function storageCapacity(type: string): number {
  if (type === 'reservoir') return CONFIG.reservoir.capacity;
  if (type === 'fishpond') return CONFIG.fishpond.capacity;
  if (type === 'wetland') return CONFIG.wetland.capacity;
  return 0;
}

export function storageDepth(type: string): number {
  if (type === 'reservoir') return CONFIG.reservoir.depth;
  if (type === 'fishpond') return CONFIG.fishpond.depth;
  if (type === 'wetland') return CONFIG.wetland.depth;
  return 0;
}

export function isChannelTerrain(t: Terrain): boolean {
  return t === 'source' || t === 'river' || t === 'outlet';
}

export interface PlacementCheck {
  ok: boolean;
  reason: string;
  cost: number;
}

function fail(reason: string, cost = 0): PlacementCheck {
  return { ok: false, reason, cost };
}

export function canDigCanal(state: GameState, cell: number): PlacementCheck {
  const g = state.grid;
  if (cell < 0 || cell >= g.terrain.length) return fail('Outside the map');
  if (g.canal[cell]) return fail('Already a canal');
  if (!CANAL_TERRAIN.has(g.terrain[cell])) {
    if (g.terrain[cell] === 'rock') return fail('Rock cannot be dug');
    return fail('Already natural water');
  }
  if (g.structure[cell] >= 0) return fail('A building is here');
  return { ok: true, reason: '', cost: CONFIG.costs.canal };
}

function footprintCells(g: Grid, x: number, y: number, w: number, h: number): number[] | null {
  const cells: number[] = [];
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (!inBounds(g, xx, yy)) return null;
      cells.push(idx(g, xx, yy));
    }
  }
  return cells;
}

/** True when this level allows the tool. Inspect and erase are always allowed. */
export function isUnlocked(state: GameState, tool: ToolId): boolean {
  if (tool === 'inspect' || tool === 'erase') return true;
  return state.allowedTools.includes(tool);
}

export const NOT_AVAILABLE = 'Not available in this level yet';

export function validatePlacement(
  state: GameState,
  type: BuildingTypePlaceable,
  x: number,
  y: number,
): PlacementCheck {
  const g = state.grid;
  const cost = CONFIG.costs[type];
  if (!isUnlocked(state, type)) return fail(NOT_AVAILABLE, cost);
  const [w, h] = CONFIG.footprint[type];
  const cells = footprintCells(g, x, y, w, h);
  if (!cells) return fail('Does not fit on the map', cost);

  if (type === 'floating') {
    const host = getBuilding(state, g.structure[cells[0]]);
    if (!host || (host.type !== 'fishpond' && host.type !== 'wetland')) {
      return fail('Place on a fish pond or wetland', cost);
    }
    if (state.buildings.some((b) => b.type === 'floating' && b.x === x && b.y === y)) {
      return fail('A garden already floats here', cost);
    }
    if (state.resources.materials < cost) return fail(`Needs ${cost} materials`, cost);
    return { ok: true, reason: '', cost };
  }

  for (const c of cells) if (g.structure[c] >= 0) return fail('Something is already built here', cost);
  const elev0 = g.elevation[cells[0]];
  const flat = cells.every((c) => g.elevation[c] === elev0);

  if (type === 'turbine') {
    const c = cells[0];
    const onChannel = g.canal[c] === 1 || g.terrain[c] === 'river';
    if (!onChannel) return fail('Place on a canal or stream', cost);
    if (g.gate[c]) return fail('Remove the gate first', cost);
    let drop = false;
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(g, nx, ny)) continue;
      const n = idx(g, nx, ny);
      const water = g.canal[n] === 1 || isChannelTerrain(g.terrain[n]);
      if (water && g.elevation[n] <= g.elevation[c] - 1) drop = true;
      const sb = getBuilding(state, g.structure[n]);
      if (sb && STORAGE_TYPES.has(sb.type) && g.elevation[n] < g.elevation[c]) drop = true;
    }
    if (!drop) return fail('Needs elevation drop: put it where the channel steps down', cost);
  } else {
    for (const c of cells) {
      if (g.canal[c]) return fail('Erase the canal here first', cost);
      const t = g.terrain[c];
      if (t === 'rock') return fail('Rock is in the way', cost);
      if (isChannelTerrain(t)) return fail('Cannot build on the stream', cost);
    }
    switch (type) {
      case 'field':
        if (!cells.every((c) => g.terrain[c] === 'soil' || g.terrain[c] === 'marsh')) return fail('Rice needs open soil', cost);
        if (!flat) return fail('Needs flat ground', cost);
        break;
      case 'reservoir':
      case 'fishpond':
        if (!cells.every((c) => g.terrain[c] === 'basin' || g.terrain[c] === 'soil' || g.terrain[c] === 'marsh')) {
          return fail('Needs open ground or a basin', cost);
        }
        if (!flat) return fail('Needs flat ground (basins are ideal)', cost);
        break;
      case 'wetland':
        if (!flat) return fail('Needs flat ground', cost);
        if (elev0 > 2) return fail('Wetlands need low ground (height 2 or less)', cost);
        if (!cells.every((c) => g.terrain[c] !== 'foundation' && g.terrain[c] !== 'path')) return fail('Not in the village', cost);
        break;
      case 'treatment':
        if (!flat) return fail('Needs flat ground', cost);
        if (!cells.every((c) => DRY_BUILD_TERRAIN.has(g.terrain[c]))) return fail('Needs dry ground', cost);
        break;
      case 'connector': {
        if (!DRY_BUILD_TERRAIN.has(g.terrain[cells[0]])) return fail('Needs dry ground', cost);
        let nearHouse = false;
        for (const [dx, dy] of NEIGHBORS) {
          if (!inBounds(g, x + dx, y + dy)) continue;
          const b = getBuilding(state, g.structure[idx(g, x + dx, y + dy)]);
          if (b && b.type === 'house') nearHouse = true;
        }
        if (!nearHouse) return fail('Place right beside a home', cost);
        break;
      }
      default:
        if (!cells.every((c) => DRY_BUILD_TERRAIN.has(g.terrain[c]) || g.terrain[c] === 'basin')) {
          return fail('Needs dry ground', cost);
        }
    }
  }
  if (state.resources.materials < cost) return fail(`Needs ${cost} materials`, cost);
  return { ok: true, reason: '', cost };
}

export const NEIGHBORS: readonly [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
