import { CONFIG } from '../model/config';
import { NEIGHBORS, storageCapacity, STORAGE_TYPES } from '../model/buildings';
import type { Building, GameState } from '../model/types';
import { getBuilding, idx, inBounds } from '../model/world';
import { drawEnergy, hasBattery } from './power';
import { perimeterCells, storageHead, type TileFlags } from './water';

const F = CONFIG.field;

export function fieldStage(b: Building): number {
  return Math.min(3, Math.floor(b.progress / F.ticksPerStage));
}

export function isRipe(b: Building): boolean {
  if (b.type === 'field') return b.progress >= 3 * F.ticksPerStage;
  if (b.type === 'fishpond') return b.stocked && b.progress >= 1;
  if (b.type === 'floating') return b.progress >= 1;
  return false;
}

/**
 * Gravity intake: pull water from adjacent wet tiles (or storage buildings) whose
 * surface is at least as high as this building's floor. Pure transfer.
 */
function gravityIntake(state: GameState, b: Building, flags: TileFlags, maxTotal: number, fraction: number): number {
  const g = state.grid;
  const floor = g.elevation[idx(g, b.x, b.y)];
  let taken = 0;
  const seen = new Set<number>();
  for (const t of perimeterCells(g, b)) {
    if (taken >= maxTotal) break;
    if (flags.passable[t]) {
      const w = g.water[t];
      if (w <= 0 || g.elevation[t] < floor) continue;
      const a = Math.min(w * fraction, maxTotal - taken);
      if (a <= 0) continue;
      g.water[t] = w - a;
      taken += a;
    } else {
      const sid = g.structure[t];
      if (sid < 0 || seen.has(sid)) continue;
      seen.add(sid);
      const s = getBuilding(state, sid);
      if (!s || !STORAGE_TYPES.has(s.type) || s.water <= 0) continue;
      if (storageHead(g, s) < floor) continue;
      const a = Math.min(s.water * fraction * 0.25, maxTotal - taken);
      if (a <= 0) continue;
      s.water -= a;
      taken += a;
    }
  }
  return taken;
}

/** Taps beside a house (4-neighbourhood), in deterministic order. */
export function houseTaps(state: GameState, house: Building): Building[] {
  const g = state.grid;
  const out: Building[] = [];
  for (const [dx, dy] of NEIGHBORS) {
    const x = house.x + dx;
    const y = house.y + dy;
    if (!inBounds(g, x, y)) continue;
    const s = getBuilding(state, g.structure[idx(g, x, y)]);
    if (s && s.type === 'connector') out.push(s);
  }
  return out;
}

export function houseHasTap(state: GameState, house: Building): boolean {
  return houseTaps(state, house).length > 0;
}

/** Manhattan distance from a tile to the nearest tile of a building footprint. */
export function distanceToFootprint(x: number, y: number, b: Building): number {
  const dx = x < b.x ? b.x - x : x >= b.x + b.w ? x - (b.x + b.w - 1) : 0;
  const dy = y < b.y ? b.y - y : y >= b.y + b.h ? y - (b.y + b.h - 1) : 0;
  return dx + dy;
}

/** Treatment plants a tap can reach through its sealed pipe, nearest first. */
export function plantsInReach(state: GameState, tap: Building): Building[] {
  const range = CONFIG.connector.pipeRange;
  return state.buildings
    .filter((p) => p.type === 'treatment' && distanceToFootprint(tap.x, tap.y, p) <= range)
    .sort((a, b) => distanceToFootprint(tap.x, tap.y, a) - distanceToFootprint(tap.x, tap.y, b) || a.id - b.id);
}

/** Fish ponds next to a fountain that ran last tick (fountains are evaluated after ponds). */
function aeratedPonds(state: GameState): Set<number> {
  const g = state.grid;
  const out = new Set<number>();
  for (const f of state.buildings) {
    if (f.type !== 'fountain' || !f.active) continue;
    for (const [dx, dy] of NEIGHBORS) {
      const x = f.x + dx;
      const y = f.y + dy;
      if (!inBounds(g, x, y)) continue;
      const p = getBuilding(state, g.structure[idx(g, x, y)]);
      if (p && p.type === 'fishpond') out.add(p.id);
    }
  }
  return out;
}

export function stepConsumers(state: GameState, flags: TileFlags, storageIn: Map<number, number>, evapMult: number): void {
  const L = state.ledger;
  const sinks = state.flags.sinks;
  const g = state.grid;
  const aerated = aeratedPonds(state);

  for (const b of state.buildings) {
    switch (b.type) {
      case 'field': {
        const room = Math.max(0, F.moistureCap - b.water);
        const intake = room > 0 ? gravityIntake(state, b, flags, Math.min(room, F.intakePerNeighbor * 2), F.intakeFraction) : 0;
        b.water += intake;
        b.flow = intake;
        if (sinks && b.water > 0) {
          const u = Math.min(b.water, F.uptakePerTick);
          b.water -= u;
          L.cropUptake += u;
          const e = Math.min(b.water, F.evaporationPerTick * evapMult);
          b.water -= e;
          L.evaporation += e;
        }
        const wet = b.water >= F.wetMoisture;
        b.active = wet;
        if (wet && b.progress < 3 * F.ticksPerStage) b.progress += 1;
        if (isRipe(b)) b.status = 'ripe';
        else if (wet) b.status = '';
        else if (b.water > 0.5) b.status = 'drying';
        else b.status = 'dry';
        break;
      }
      case 'reservoir':
      case 'fishpond':
      case 'wetland': {
        const inflow = storageIn.get(b.id) ?? 0;
        b.inflowAvg = b.inflowAvg * 0.98 + inflow * 0.02;
        b.flow = inflow;
        if (sinks && b.water > 0) {
          const rate =
            b.type === 'reservoir'
              ? CONFIG.reservoir.evaporationPerTick
              : b.type === 'fishpond'
                ? CONFIG.fishpond.evaporationPerTick
                : CONFIG.wetland.evaporationPerTick;
          const e = Math.min(b.water, rate * evapMult);
          b.water -= e;
          L.evaporation += e;
        }
        if (b.type === 'reservoir') {
          b.active = b.water > 1;
          b.status = b.water >= storageCapacity('reservoir') - 0.5 ? 'full' : b.water < 1 ? 'noWater' : '';
        } else if (b.type === 'fishpond') {
          const P = CONFIG.fishpond;
          const target = Math.min(1, 0.3 + b.inflowAvg * 1.2 + (aerated.has(b.id) ? CONFIG.fountain.aeration : 0));
          b.quality += Math.sign(target - b.quality) * Math.min(Math.abs(target - b.quality), 0.002);
          const enough = b.water >= P.minFill;
          const healthy = b.quality >= P.minQuality;
          b.active = b.stocked && enough && healthy;
          if (b.active && b.progress < 1) b.progress = Math.min(1, b.progress + P.growthPerTick);
          if (!enough) b.status = 'pondLow';
          else if (!healthy) b.status = 'pondStagnant';
          else if (!b.stocked) b.status = 'notStocked';
          else b.status = isRipe(b) ? 'ripe' : '';
        } else {
          const Wl = CONFIG.wetland;
          const thriving = b.water >= Wl.thriveLevel;
          b.active = thriving;
          b.progress = thriving
            ? Math.min(1, b.progress + Wl.ecologyGainPerTick)
            : Math.max(0, b.progress - Wl.ecologyLossPerTick);
          b.status = thriving ? '' : 'wetlandDry';
        }
        break;
      }
      case 'floating': {
        const host = getBuilding(state, b.hostId);
        const cap = host ? storageCapacity(host.type) : 0;
        const ok = !!host && cap > 0 && host.water / cap >= CONFIG.floating.minHostFill;
        b.active = ok;
        if (ok && host) {
          if (sinks) {
            const u = Math.min(host.water, CONFIG.floating.uptakePerTick);
            host.water -= u;
            L.cropUptake += u;
          }
          if (b.progress < 1) b.progress = Math.min(1, b.progress + CONFIG.floating.growthPerTick);
        }
        b.status = !ok ? 'hostLow' : isRipe(b) ? 'ripe' : '';
        break;
      }
      case 'treatment': {
        const T = CONFIG.treatment;
        const room = Math.max(0, T.rawCap - b.water);
        const intake = room > 0 ? gravityIntake(state, b, flags, Math.min(room, T.intakePerTick), 0.5) : 0;
        b.water += intake;
        b.flow = intake;
        b.rate = 0;
        b.active = false;
        const hasRaw = b.water >= T.rawPerTick - 1e-9;
        const hasRoom = b.clean + T.cleanPerTick <= T.cleanCap + 1e-9;
        if (!hasRaw) b.status = 'treatNoRaw';
        else if (!hasRoom) b.status = 'treatFull';
        else if (!drawEnergy(state, T.energyPerTick)) b.status = 'treatNoPower';
        else {
          const raw = Math.min(b.water, T.rawPerTick);
          const clean = sinks ? T.cleanPerTick : raw;
          b.water -= raw;
          b.clean += clean;
          L.treatmentLoss += raw - clean;
          b.rate = clean;
          b.active = true;
          b.status = '';
          state.lastCleanTick = state.tick;
        }
        break;
      }
      case 'pump':
        stepPump(state, b, flags);
        break;
      default:
        break;
    }
  }

  // Homes: taps refill each home's clean-water pot from treatment plants within reach;
  // the home drinks from its pot, so a brief gap in production does not cut it off.
  const battery = hasBattery(state);
  const H = CONFIG.house;
  for (const b of state.buildings) {
    if (b.type !== 'house') continue;
    const taps = houseTaps(state, b);
    b.supplied = false;
    b.flow = 0;
    let reachable = false;
    if (sinks) {
      let room = Math.min(H.refillPerTick, Math.max(0, H.potCap - b.water));
      for (const tap of taps) {
        const plants = plantsInReach(state, tap);
        if (plants.length) reachable = true;
        for (const p of plants) {
          if (room <= 1e-12) break;
          const a = Math.min(p.clean, room);
          p.clean -= a;
          b.water += a;
          room -= a;
        }
      }
      if (taps.length && b.water >= H.cleanPerTick - 1e-9) {
        const use = Math.min(b.water, H.cleanPerTick);
        b.water -= use;
        L.householdUse += use;
        b.supplied = true;
        b.flow = use;
      }
    }
    b.lit = battery && drawEnergy(state, CONFIG.house.energyPerTick);
    if (b.supplied) b.progress = Math.min(600, b.progress + 1);
    b.active = b.supplied;
    b.status = !taps.length ? 'noTap' : !b.supplied ? (reachable || !sinks ? 'noClean' : 'tooFar') : !b.lit ? 'noBattery' : '';
  }
  for (const b of state.buildings) {
    if (b.type === 'connector') {
      let served = false;
      for (const [dx, dy] of NEIGHBORS) {
        const x = b.x + dx;
        const y = b.y + dy;
        if (!inBounds(g, x, y)) continue;
        const h = getBuilding(state, g.structure[idx(g, x, y)]);
        if (h && h.type === 'house' && h.supplied) served = true;
      }
      const plants = plantsInReach(state, b);
      b.hostId = plants.length ? plants[0].id : -1;
      b.active = served;
      b.status = served ? '' : plants.length === 0 ? 'tooFar' : 'noClean';
    } else if (b.type === 'fountain') {
      let wet = false;
      for (const [dx, dy] of NEIGHBORS) {
        const x = b.x + dx;
        const y = b.y + dy;
        if (!inBounds(g, x, y)) continue;
        const t = idx(g, x, y);
        if (flags.passable[t] && g.water[t] >= CONFIG.fountain.minWater) wet = true;
        const s = getBuilding(state, g.structure[t]);
        if (s && STORAGE_TYPES.has(s.type) && s.water >= CONFIG.fountain.minWater) wet = true;
      }
      b.active = wet && drawEnergy(state, CONFIG.fountain.energyPerTick);
      b.status = !wet ? 'noWater' : b.active ? '' : 'needsPower';
    } else if (b.type === 'battery') {
      b.active = state.resources.energy > 0.01;
      b.status = b.active ? '' : 'needsPower';
    }
  }
}

function dirVec(dir: number): [number, number] {
  return NEIGHBORS[((dir % 4) + 4) % 4];
}

interface WaterEnd {
  get: () => number;
  room: () => number;
  add: (v: number) => void;
  elev: number;
}

function waterEnd(state: GameState, flags: TileFlags, x: number, y: number): WaterEnd | null {
  const g = state.grid;
  if (!inBounds(g, x, y)) return null;
  const t = idx(g, x, y);
  if (flags.passable[t]) {
    return {
      get: () => g.water[t],
      room: () => Math.max(0, CONFIG.water.maxCellWater - g.water[t]),
      add: (v) => {
        g.water[t] = Math.max(0, g.water[t] + v);
      },
      elev: g.elevation[t],
    };
  }
  const s = getBuilding(state, g.structure[t]);
  if (s && STORAGE_TYPES.has(s.type)) {
    return {
      get: () => s.water,
      room: () => Math.max(0, storageCapacity(s.type) - s.water),
      add: (v) => {
        s.water = Math.max(0, s.water + v);
      },
      elev: g.elevation[t],
    };
  }
  return null;
}

/** Pump: energy moves real water from the tile behind it to the tile it faces. */
export function stepPump(state: GameState, b: Building, flags: TileFlags): void {
  const P = CONFIG.pump;
  const [dx, dy] = dirVec(b.dir);
  const out = waterEnd(state, flags, b.x + dx, b.y + dy);
  const inn = waterEnd(state, flags, b.x - dx, b.y - dy);
  b.rate = 0;
  b.flow = 0;
  b.head = 0;
  b.active = false;
  if (!inn || inn.get() <= 1e-6) {
    b.status = 'pumpNoWater';
    return;
  }
  if (!out || out.room() <= 1e-6) {
    b.status = 'pumpBlocked';
    return;
  }
  const lift = Math.max(0, out.elev - inn.elev);
  b.head = lift;
  const costPerVol = P.energyPerVolume * (1 + P.liftFactor * lift);
  let vol = Math.min(P.maxPerTick, inn.get(), out.room());
  vol = Math.min(vol, state.resources.energy / costPerVol);
  if (vol <= 1e-6) {
    b.status = 'pumpNoPower';
    return;
  }
  const cost = vol * costPerVol;
  if (!drawEnergy(state, cost)) {
    b.status = 'pumpNoPower';
    return;
  }
  inn.add(-vol);
  out.add(vol);
  b.flow = vol;
  b.rate = cost;
  b.active = true;
  b.status = '';
}
