import { CONFIG } from '../model/config';
import { isChannelTerrain, storageCapacity, storageDepth, STORAGE_TYPES } from '../model/buildings';
import type { Building, GameState, Grid } from '../model/types';
import { GATE_CLOSED } from '../model/types';

const W = CONFIG.water;

export interface TileFlags {
  /** Tile can hold and pass surface water. */
  passable: Uint8Array;
  /** Tile is a lined channel (canal, stream, turbine) with high conductance. */
  channel: Uint8Array;
}

export interface FlowReport {
  /** Total inflow / outflow per tile this tick. */
  tileIn: Float64Array;
  tileOut: Float64Array;
  /** Flux-weighted head sums per tile (for turbines): sum(q * H_neighbor). */
  inHeadSum: Float64Array;
  outHeadSum: Float64Array;
  /** Inflow into storage buildings by building id. */
  storageIn: Map<number, number>;
}

export function computeTileFlags(state: GameState): TileFlags {
  const g = state.grid;
  const n = g.terrain.length;
  const passable = new Uint8Array(n);
  const channel = new Uint8Array(n);
  const typeById = new Map<number, string>();
  for (const b of state.buildings) typeById.set(b.id, b.type);
  for (let i = 0; i < n; i++) {
    if (g.terrain[i] === 'rock') continue;
    const sid = g.structure[i];
    const st = sid >= 0 ? typeById.get(sid) : undefined;
    if (st && st !== 'turbine') continue;
    passable[i] = 1;
    if (g.canal[i] || isChannelTerrain(g.terrain[i]) || st === 'turbine') channel[i] = 1;
  }
  return { passable, channel };
}

export function tileHead(g: Grid, i: number): number {
  return g.elevation[i] + g.bed[i] + g.water[i] / W.cellCapacity;
}

export function storageFloor(g: Grid, b: Building): number {
  return g.elevation[b.y * g.w + b.x];
}

export function storageHead(g: Grid, b: Building): number {
  const cap = storageCapacity(b.type);
  return storageFloor(g, b) + (cap > 0 ? (b.water / cap) * storageDepth(b.type) : 0);
}

/** Perimeter tiles (4-neighbourhood) of a building footprint, in deterministic order. */
export function perimeterCells(g: Grid, b: { x: number; y: number; w: number; h: number }): number[] {
  const out: number[] = [];
  for (let x = b.x; x < b.x + b.w; x++) {
    if (b.y - 1 >= 0) out.push((b.y - 1) * g.w + x);
    if (b.y + b.h < g.h) out.push((b.y + b.h) * g.w + x);
  }
  for (let y = b.y; y < b.y + b.h; y++) {
    if (b.x - 1 >= 0) out.push(y * g.w + b.x - 1);
    if (b.x + b.w < g.w) out.push(y * g.w + b.x + b.w);
  }
  return out;
}

/** Runs the configured number of flux sub-steps for one tick and merges their reports. */
export function stepFlux(state: GameState, flags: TileFlags): FlowReport {
  const g = state.grid;
  const n = g.terrain.length;
  const report: FlowReport = {
    tileIn: new Float64Array(n),
    tileOut: new Float64Array(n),
    inHeadSum: new Float64Array(n),
    outHeadSum: new Float64Array(n),
    storageIn: new Map(),
  };
  const fx = new Float64Array(n);
  const fy = new Float64Array(n);
  for (let k = 0; k < W.substeps; k++) fluxSubstep(state, flags, report, fx, fy);
  for (let i = 0; i < n; i++) {
    g.flowX[i] = fx[i] * 0.5;
    g.flowY[i] = fy[i] * 0.5;
  }
  return report;
}

/**
 * One conservative, simultaneous flux sub-step. Fluxes are computed from a snapshot,
 * outflows scaled to available water per source, inflows scaled to receiver room,
 * then applied together. Pure transfer: total water is unchanged.
 * Channels and storages only spill onto plain soil above their bank height.
 */
function fluxSubstep(state: GameState, flags: TileFlags, report: FlowReport, fx: Float64Array, fy: Float64Array): void {
  const g = state.grid;
  const n = g.terrain.length;
  const { passable, channel } = flags;
  const cap = W.cellCapacity;

  const storages = state.buildings.filter((b) => STORAGE_TYPES.has(b.type));
  // Node ids: tiles 0..n-1, storages n..n+k-1.
  const nodeCount = n + storages.length;
  const avail = new Float64Array(nodeCount);
  const room = new Float64Array(nodeCount);
  const head = new Float64Array(nodeCount);
  for (let i = 0; i < n; i++) {
    avail[i] = passable[i] ? g.water[i] : 0;
    room[i] = passable[i] ? Math.max(0, W.maxCellWater - g.water[i]) : 0;
    head[i] = tileHead(g, i);
  }
  storages.forEach((b, k) => {
    avail[n + k] = b.water;
    room[n + k] = Math.max(0, storageCapacity(b.type) - b.water);
    head[n + k] = storageHead(g, b);
  });

  const from: number[] = [];
  const to: number[] = [];
  const q: number[] = [];

  /** Lowest head at which node `a` may push water toward node `b` (bank tops). */
  const bankFloor = new Float64Array(nodeCount).fill(-Infinity);
  for (let i = 0; i < n; i++) if (channel[i]) bankFloor[i] = g.elevation[i] + W.bankHeight;

  // a -> b allowed down to max(head[b], banked ? bankFloor[a] : -inf).
  const push = (a: number, b: number, c: number, banked: boolean) => {
    const floor = banked ? Math.max(head[b], bankFloor[a]) : head[b];
    const dh = head[a] - floor;
    if (dh <= 0 || avail[a] <= 0) return;
    from.push(a);
    to.push(b);
    q.push(c * dh * cap);
  };

  const gateClosed = (i: number) => g.gate[i] === GATE_CLOSED;

  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const i = y * g.w + x;
      if (!passable[i]) continue;
      const neigh = [x + 1 < g.w ? i + 1 : -1, y + 1 < g.h ? i + g.w : -1];
      for (const j of neigh) {
        if (j < 0 || !passable[j]) continue;
        if (gateClosed(i) || gateClosed(j)) continue;
        const both = channel[i] && channel[j];
        const c = both ? W.conductance.channel : W.conductance.soil;
        if (head[i] > head[j]) push(i, j, c, !both && !!channel[i]);
        else if (head[j] > head[i]) push(j, i, c, !both && !!channel[j]);
      }
    }
  }

  storages.forEach((b, k) => {
    const s = n + k;
    for (const t of perimeterCells(g, b)) {
      if (!passable[t] || gateClosed(t)) continue;
      const c = channel[t] ? W.conductance.building : W.conductance.buildingSoil;
      if (head[s] > head[t]) {
        if (channel[t]) push(s, t, c, false);
      } else if (head[t] > head[s]) {
        push(t, s, c, false);
      }
    }
  });

  // Scale outflows per source to available water.
  const outTotal = new Float64Array(nodeCount);
  for (let e = 0; e < q.length; e++) outTotal[from[e]] += q[e];
  for (let e = 0; e < q.length; e++) {
    const s = from[e];
    if (outTotal[s] > avail[s]) q[e] *= avail[s] / outTotal[s];
  }
  // Scale inflows per receiver to its free room.
  const inTotal = new Float64Array(nodeCount);
  for (let e = 0; e < q.length; e++) inTotal[to[e]] += q[e];
  for (let e = 0; e < q.length; e++) {
    const r = to[e];
    if (inTotal[r] > room[r]) q[e] *= room[r] / inTotal[r];
  }

  const delta = new Float64Array(nodeCount);
  for (let e = 0; e < q.length; e++) {
    const amt = q[e];
    if (!(amt > 0)) continue;
    const a = from[e];
    const b = to[e];
    delta[a] -= amt;
    delta[b] += amt;
    if (a < n) {
      report.tileOut[a] += amt;
      report.outHeadSum[a] += amt * head[b];
    }
    if (b < n) {
      report.tileIn[b] += amt;
      report.inHeadSum[b] += amt * head[a];
    } else {
      const sb = storages[b - n];
      report.storageIn.set(sb.id, (report.storageIn.get(sb.id) ?? 0) + amt);
    }
    if (a < n && b < n) {
      const dx = (b % g.w) - (a % g.w);
      const dy = Math.floor(b / g.w) - Math.floor(a / g.w);
      fx[a] += dx * amt;
      fy[a] += dy * amt;
      fx[b] += dx * amt;
      fy[b] += dy * amt;
    }
  }

  for (let i = 0; i < n; i++) {
    if (delta[i] !== 0) {
      const v = g.water[i] + delta[i];
      g.water[i] = v > 0 ? v : 0;
    }
  }
  storages.forEach((b, k) => {
    const v = b.water + delta[n + k];
    b.water = v > 0 ? v : 0;
  });
}

/** Sum of every place water can physically be: tiles, soil, buildings, clean tanks. */
export function totalWater(state: GameState): number {
  const g = state.grid;
  let t = 0;
  for (let i = 0; i < g.water.length; i++) t += g.water[i] + g.saturation[i] * W.saturationCapacity;
  for (const b of state.buildings) t += b.water + b.clean;
  return t;
}

/** Add rain to source tiles; returns the volume actually added. */
export function addRain(state: GameState, amount: number): number {
  if (amount <= 0) return 0;
  const g = state.grid;
  const sources: number[] = [];
  for (let i = 0; i < g.terrain.length; i++) if (g.terrain[i] === 'source') sources.push(i);
  if (sources.length === 0) return 0;
  const per = amount / sources.length;
  let added = 0;
  for (const i of sources) {
    const a = Math.min(per, Math.max(0, W.maxCellWater - g.water[i]));
    g.water[i] += a;
    added += a;
  }
  return added;
}

/** Soil absorbs some surface water (pure transfer). */
export function infiltrate(state: GameState, flags: TileFlags): void {
  const g = state.grid;
  const satCap = W.saturationCapacity;
  for (let i = 0; i < g.water.length; i++) {
    if (!flags.passable[i] || flags.channel[i]) continue;
    const w = g.water[i];
    if (w <= 0) continue;
    const roomVol = (1 - g.saturation[i]) * satCap;
    const a = Math.min(w, W.infiltrationPerTick, roomVol);
    if (a <= 0) continue;
    g.water[i] = w - a;
    g.saturation[i] = Math.min(1, g.saturation[i] + a / satCap);
  }
}

/** Evaporation from tiles and soil, and outlet discharge. Returns sink volumes. */
export function applyTileSinks(state: GameState, dryMultiplier: number): { evaporation: number; discharged: number } {
  const g = state.grid;
  let evaporation = 0;
  let discharged = 0;
  const satCap = W.saturationCapacity;
  for (let i = 0; i < g.water.length; i++) {
    const w = g.water[i];
    if (g.terrain[i] === 'outlet' && w > 0) {
      const d = w * W.outletDischargeFraction;
      g.water[i] = w - d;
      discharged += d;
      continue;
    }
    if (w > 0) {
      const e = Math.min(w, W.evaporationPerTick * dryMultiplier);
      g.water[i] = w - e;
      evaporation += e;
    } else if (g.saturation[i] > 0) {
      const vol = g.saturation[i] * satCap;
      const e = Math.min(vol, W.soilEvaporationPerTick * dryMultiplier);
      g.saturation[i] = Math.max(0, (vol - e) / satCap);
      evaporation += e;
    }
  }
  return { evaporation, discharged };
}
