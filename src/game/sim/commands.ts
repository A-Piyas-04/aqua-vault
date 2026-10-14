import { CONFIG } from '../model/config';
import {
  canDigCanal,
  CANAL_TERRAIN,
  isUnlocked,
  storageCapacity,
  STORAGE_TYPES,
  validatePlacement,
} from '../model/buildings';
import type { Building, Command, GameEvent, GameState, HistoryEntry } from '../model/types';
import { GATE_CLOSED, GATE_NONE, GATE_OPEN } from '../model/types';
import { createBuilding, getBuilding, idx, stampBuilding, unstampBuilding } from '../model/world';
import { isRipe } from './consumers';
import { addXp, grantAchievement, hasAchievement } from './progression';
import { perimeterCells } from './water';

const W = CONFIG.water;

function pushHistory(state: GameState, entry: HistoryEntry): void {
  state.history.push(entry);
  if (state.history.length > CONFIG.historyLimit) state.history.shift();
}

function footprint(state: GameState, b: { x: number; y: number; w: number; h: number }): number[] {
  const cells: number[] = [];
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) cells.push(idx(state.grid, x, y));
  return cells;
}

/** Return stored water to the landscape; whatever cannot fit is recorded as spill. */
function releaseWater(state: GameState, b: Building, amount: number): void {
  if (amount <= 0) return;
  const g = state.grid;
  let left = amount;
  const targets = [...footprint(state, b), ...perimeterCells(g, b)];
  for (const t of targets) {
    if (left <= 0) break;
    if (g.terrain[t] === 'rock' || g.structure[t] >= 0) continue;
    const a = Math.min(left, Math.max(0, W.maxCellWater - g.water[t]));
    g.water[t] += a;
    left -= a;
  }
  if (left > 0) state.ledger.spill += left;
}

function absorbFootprintWater(state: GameState, b: Building, cap: number): void {
  const g = state.grid;
  for (const c of footprint(state, b)) {
    const take = Math.min(g.water[c], Math.max(0, cap - b.water));
    g.water[c] -= take;
    b.water += take;
  }
}

function removeBuilding(state: GameState, b: Building): void {
  unstampBuilding(state.grid, b);
  state.buildings = state.buildings.filter((x) => x.id !== b.id);
  if (b.type === 'floating') return;
  releaseWater(state, b, b.water + b.clean);
  b.water = 0;
  b.clean = 0;
  // Floating gardens cannot outlive their host water body.
  const children = state.buildings.filter((x) => x.type === 'floating' && x.hostId === b.id);
  if (children.length) state.buildings = state.buildings.filter((x) => !(x.type === 'floating' && x.hostId === b.id));
}

function snapshotBuilding(b: Building): Building {
  return { ...b, water: 0, clean: 0 };
}

function eraseCell(state: GameState, cell: number, includeBuildings: boolean, events: GameEvent[], erasedCanals: { i: number; gate: number; bridge: number }[]): number {
  const g = state.grid;
  let refund = 0;
  if (includeBuildings) {
    const x = cell % g.w;
    const y = Math.floor(cell / g.w);
    const floating = state.buildings.find((b) => b.type === 'floating' && b.x === x && b.y === y);
    const target = floating ?? getBuilding(state, g.structure[cell]);
    if (target) {
      if (target.builtin) {
        events.push({ type: 'error', message: 'Part of the village: cannot be removed', cell });
        return 0;
      }
      const r = Math.floor(CONFIG.costs[target.type as keyof typeof CONFIG.costs] * CONFIG.eraseRefund);
      const snap = snapshotBuilding(target);
      removeBuilding(state, target);
      state.resources.materials += r;
      pushHistory(state, { kind: 'eraseBuilding', building: snap, refund: r });
      events.push({ type: 'erased', cell });
      return 0;
    }
  }
  if (g.canal[cell] && g.structure[cell] < 0) {
    erasedCanals.push({ i: cell, gate: g.gate[cell], bridge: g.bridge[cell] });
    refund += CONFIG.costs.canal * CONFIG.eraseRefund;
    if (g.gate[cell]) refund += Math.floor(CONFIG.costs.gate * CONFIG.eraseRefund);
    if (g.bridge[cell]) refund += Math.floor(CONFIG.costs.bridge * CONFIG.eraseRefund);
    g.canal[cell] = 0;
    g.gate[cell] = GATE_NONE;
    g.bridge[cell] = 0;
    events.push({ type: 'erased', cell });
  }
  return refund;
}

export function applyCommand(state: GameState, cmd: Command, events: GameEvent[]): void {
  const g = state.grid;
  const R = state.resources;
  switch (cmd.type) {
    case 'drawCanal': {
      if (!isUnlocked(state, 'canal')) return;
      const dug: number[] = [];
      let paid = 0;
      let freeUsed = 0;
      for (const c of cmd.cells) {
        const check = canDigCanal(state, c);
        if (!check.ok) {
          if (!check.reason.startsWith('Already')) events.push({ type: 'error', message: check.reason, cell: c });
          continue;
        }
        if (R.freeCanals > 0) {
          R.freeCanals -= 1;
          freeUsed += 1;
        } else if (R.materials >= check.cost) {
          R.materials -= check.cost;
          paid += check.cost;
        } else {
          events.push({ type: 'error', message: 'Not enough materials: harvest crops to earn more', cell: c });
          break;
        }
        g.canal[c] = 1;
        dug.push(c);
        events.push({ type: 'built', what: 'canal', cell: c });
      }
      if (dug.length === 0) return;
      const last = state.history[state.history.length - 1];
      if (cmd.stroke !== undefined && last && last.kind === 'canal' && last.stroke === cmd.stroke) {
        last.cells.push(...dug);
        last.paid += paid;
        last.freeUsed += freeUsed;
      } else {
        pushHistory(state, { kind: 'canal', cells: dug, paid, freeUsed, stroke: cmd.stroke });
      }
      return;
    }
    case 'erase': {
      const erased: { i: number; gate: number; bridge: number }[] = [];
      let refund = 0;
      for (const c of cmd.cells) {
        if (c < 0 || c >= g.terrain.length) continue;
        refund += eraseCell(state, c, !!cmd.includeBuildings, events, erased);
      }
      if (erased.length === 0) return;
      const canalRefund = refund;
      R.materials += canalRefund;
      const last = state.history[state.history.length - 1];
      if (cmd.stroke !== undefined && last && last.kind === 'eraseCanal' && last.stroke === cmd.stroke) {
        last.cells.push(...erased);
        last.refund += canalRefund;
      } else {
        pushHistory(state, { kind: 'eraseCanal', cells: erased, refund: canalRefund, stroke: cmd.stroke });
      }
      return;
    }
    case 'place': {
      const check = validatePlacement(state, cmd.building, cmd.x, cmd.y);
      if (!check.ok) {
        events.push({ type: 'error', message: check.reason, cell: idx(g, cmd.x, cmd.y) });
        return;
      }
      const b = createBuilding(state.nextBuildingId++, cmd.building, cmd.x, cmd.y);
      if (b.type === 'floating') b.hostId = g.structure[idx(g, cmd.x, cmd.y)];
      R.materials -= check.cost;
      state.buildings.push(b);
      stampBuilding(g, b);
      if (STORAGE_TYPES.has(b.type)) absorbFootprintWater(state, b, storageCapacity(b.type));
      else if (b.type === 'field') absorbFootprintWater(state, b, CONFIG.field.moistureCap);
      else if (b.type === 'treatment') absorbFootprintWater(state, b, CONFIG.treatment.rawCap);
      pushHistory(state, { kind: 'place', buildingId: b.id, paid: check.cost });
      events.push({ type: 'built', what: b.type, cell: idx(g, cmd.x, cmd.y) });
      return;
    }
    case 'gate': {
      const c = cmd.cell;
      if (!g.canal[c] || g.structure[c] >= 0) {
        events.push({ type: 'error', message: 'Gates go on canals', cell: c });
        return;
      }
      if (g.gate[c]) {
        g.gate[c] = g.gate[c] === GATE_OPEN ? GATE_CLOSED : GATE_OPEN;
        events.push({ type: 'built', what: 'gate-toggle', cell: c });
        return;
      }
      if (R.materials < CONFIG.costs.gate) {
        events.push({ type: 'error', message: `Needs ${CONFIG.costs.gate} materials`, cell: c });
        return;
      }
      R.materials -= CONFIG.costs.gate;
      g.gate[c] = GATE_OPEN;
      pushHistory(state, { kind: 'gate', cell: c, paid: CONFIG.costs.gate });
      events.push({ type: 'built', what: 'gate', cell: c });
      return;
    }
    case 'toggleGate': {
      const c = cmd.cell;
      if (!g.gate[c]) return;
      g.gate[c] = g.gate[c] === GATE_OPEN ? GATE_CLOSED : GATE_OPEN;
      events.push({ type: 'built', what: 'gate-toggle', cell: c });
      return;
    }
    case 'bridge': {
      const c = cmd.cell;
      if (!isUnlocked(state, 'bridge')) {
        events.push({ type: 'error', message: `Unlocks at level ${CONFIG.unlockLevel.bridge}`, cell: c });
        return;
      }
      if (!g.canal[c] || g.bridge[c] || g.structure[c] >= 0) {
        events.push({ type: 'error', message: 'Bridges span an open canal', cell: c });
        return;
      }
      if (R.materials < CONFIG.costs.bridge) {
        events.push({ type: 'error', message: `Needs ${CONFIG.costs.bridge} materials`, cell: c });
        return;
      }
      R.materials -= CONFIG.costs.bridge;
      g.bridge[c] = 1;
      pushHistory(state, { kind: 'bridge', cell: c, paid: CONFIG.costs.bridge });
      events.push({ type: 'built', what: 'bridge', cell: c });
      return;
    }
    case 'harvest': {
      const b = getBuilding(state, cmd.buildingId);
      if (!b || !isRipe(b)) {
        events.push({ type: 'error', message: 'Not ready to harvest yet' });
        return;
      }
      let materials = 0;
      let firstId = '';
      if (b.type === 'field') {
        materials = CONFIG.field.harvestMaterials;
        b.progress = 0;
        firstId = 'first-harvest';
      } else if (b.type === 'fishpond') {
        materials = CONFIG.fishpond.harvestMaterials;
        b.progress = 0;
        b.stocked = false;
        firstId = 'fish-harvest';
      } else if (b.type === 'floating') {
        materials = CONFIG.floating.harvestMaterials;
        b.progress = 0;
        firstId = 'floating-harvest';
      }
      R.materials += materials;
      let xp = 0;
      if (!hasAchievement(state, firstId)) {
        grantAchievement(state, firstId, events);
      } else if (state.tick - state.lastHarvestXpTick >= CONFIG.progression.repeatHarvestCooldownTicks) {
        xp = CONFIG.progression.repeatHarvestXp;
        state.lastHarvestXpTick = state.tick;
        addXp(state, xp, events);
      }
      events.push({ type: 'harvest', buildingId: b.id, materials, xp });
      return;
    }
    case 'stock': {
      const b = getBuilding(state, cmd.buildingId);
      if (!b || b.type !== 'fishpond') return;
      if (b.stocked) {
        events.push({ type: 'error', message: 'Already stocked' });
        return;
      }
      if (b.water < CONFIG.fishpond.minFill) {
        events.push({ type: 'error', message: `Pond needs more water (${Math.floor(b.water)}/${CONFIG.fishpond.minFill})` });
        return;
      }
      if (R.materials < CONFIG.fishpond.stockCost) {
        events.push({ type: 'error', message: `Needs ${CONFIG.fishpond.stockCost} materials` });
        return;
      }
      R.materials -= CONFIG.fishpond.stockCost;
      b.stocked = true;
      b.progress = 0;
      grantAchievement(state, 'fish-stocked', events);
      events.push({ type: 'stocked', buildingId: b.id });
      return;
    }
    case 'rotate': {
      const b = getBuilding(state, cmd.buildingId);
      if (b && b.type === 'pump') b.dir = (b.dir + 1) % 4;
      return;
    }
    case 'undo':
      undo(state, events);
      return;
  }
}

function undo(state: GameState, events: GameEvent[]): void {
  const g = state.grid;
  const R = state.resources;
  const entry = state.history.pop();
  if (!entry) {
    events.push({ type: 'undo', ok: false });
    return;
  }
  const failUndo = (msg: string) => {
    state.history.push(entry);
    events.push({ type: 'error', message: msg });
    events.push({ type: 'undo', ok: false });
  };
  switch (entry.kind) {
    case 'canal': {
      for (const c of entry.cells) {
        if (g.structure[c] >= 0) continue;
        g.canal[c] = 0;
        g.gate[c] = GATE_NONE;
        g.bridge[c] = 0;
      }
      R.materials += entry.paid;
      R.freeCanals = Math.min(CONFIG.progression.freeCanals, R.freeCanals + entry.freeUsed);
      break;
    }
    case 'eraseCanal': {
      if (R.materials < entry.refund) return failUndo('Not enough materials to undo');
      R.materials -= entry.refund;
      for (const c of entry.cells) {
        if (g.structure[c.i] >= 0 || !CANAL_TERRAIN.has(g.terrain[c.i])) continue;
        g.canal[c.i] = 1;
      }
      for (const c of entry.cells) {
        if (!g.canal[c.i]) continue;
        g.gate[c.i] = c.gate;
        g.bridge[c.i] = c.bridge;
      }
      break;
    }
    case 'place': {
      const b = getBuilding(state, entry.buildingId);
      if (b) removeBuilding(state, b);
      R.materials += entry.paid;
      break;
    }
    case 'eraseBuilding': {
      const b = entry.building;
      if (R.materials < entry.refund) return failUndo('Not enough materials to undo');
      if (b.type === 'floating') {
        if (!getBuilding(state, b.hostId)) return failUndo('Its pond is gone');
      } else {
        for (const c of footprint(state, b)) {
          if (g.structure[c] >= 0) return failUndo('Something else is built there now');
          if (b.type !== 'turbine' && g.canal[c]) return failUndo('A canal is there now');
        }
      }
      R.materials -= entry.refund;
      const restored: Building = { ...b, water: 0, clean: 0 };
      state.buildings.push(restored);
      state.buildings.sort((a, c) => a.id - c.id);
      stampBuilding(g, restored);
      break;
    }
    case 'gate': {
      if (g.gate[entry.cell]) {
        g.gate[entry.cell] = GATE_NONE;
        R.materials += entry.paid;
      }
      break;
    }
    case 'bridge': {
      if (g.bridge[entry.cell]) {
        g.bridge[entry.cell] = 0;
        R.materials += entry.paid;
      }
      break;
    }
  }
  events.push({ type: 'undo', ok: true });
}
