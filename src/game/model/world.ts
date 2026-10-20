import { CONFIG } from './config';
import type { Building, BuildingType, GameState, Grid, LevelId, Terrain } from './types';
import { getLevel } from '../content/campaign';
import { seedToState } from '../sim/rng';
import { scriptedWeather } from '../sim/weather';

export const DEFAULT_SEED = 1527;

export function idx(grid: { w: number }, x: number, y: number): number {
  return y * grid.w + x;
}

export function inBounds(grid: { w: number; h: number }, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < grid.w && y < grid.h;
}

export function createBuilding(id: number, type: BuildingType, x: number, y: number): Building {
  const [w, h] = CONFIG.footprint[type];
  return {
    id,
    type,
    x,
    y,
    w,
    h,
    builtin: false,
    water: 0,
    clean: 0,
    progress: 0,
    stocked: false,
    quality: 0.6,
    inflowAvg: 0,
    dir: 1,
    hostId: -1,
    rate: 0,
    flow: 0,
    head: 0,
    active: false,
    status: '',
    lit: false,
    supplied: false,
  };
}

export function createGrid(terrain: Terrain[], elevation: number[], w: number, h: number, bed?: number[]): Grid {
  const n = w * h;
  return {
    w,
    h,
    terrain: terrain.slice(),
    elevation: elevation.slice(),
    bed: bed ? bed.slice() : new Array(n).fill(0),
    canal: new Array(n).fill(0),
    gate: new Array(n).fill(0),
    bridge: new Array(n).fill(0),
    water: new Array(n).fill(0),
    saturation: new Array(n).fill(0),
    flowX: new Array(n).fill(0),
    flowY: new Array(n).fill(0),
    structure: new Array(n).fill(-1),
  };
}

export function stampBuilding(grid: Grid, b: Building): void {
  if (b.type === 'floating') return;
  for (let y = b.y; y < b.y + b.h; y++) {
    for (let x = b.x; x < b.x + b.w; x++) grid.structure[idx(grid, x, y)] = b.id;
  }
}

export function unstampBuilding(grid: Grid, b: Building): void {
  if (b.type === 'floating') return;
  for (let y = b.y; y < b.y + b.h; y++) {
    for (let x = b.x; x < b.x + b.w; x++) {
      const i = idx(grid, x, y);
      if (grid.structure[i] === b.id) grid.structure[i] = -1;
    }
  }
}

export function createInitialState(seed = DEFAULT_SEED, levelId: LevelId = 'village'): GameState {
  const level = getLevel(levelId);
  const world = level.build();
  const grid = createGrid(world.terrain, world.elevation, world.w, world.h, world.bed);
  const buildings: Building[] = [];
  let nextId = 1;
  for (const hpos of world.houses) {
    const b = createBuilding(nextId++, 'house', hpos.x, hpos.y);
    b.builtin = true;
    buildings.push(b);
    stampBuilding(grid, b);
  }
  for (const spec of world.starterBuildings) {
    const b = createBuilding(nextId++, spec.type, spec.x, spec.y);
    b.builtin = spec.builtin;
    if (spec.progress !== undefined) b.progress = spec.progress;
    if (spec.water !== undefined) b.water = spec.water;
    if (spec.dir !== undefined) b.dir = spec.dir;
    buildings.push(b);
    stampBuilding(grid, b);
  }
  for (const c of world.canals) {
    const i = idx(grid, c.x, c.y);
    if (i >= 0 && i < grid.canal.length) grid.canal[i] = 1;
  }

  let standing = 0;
  for (let i = 0; i < grid.terrain.length; i++) {
    if (grid.terrain[i] === 'source') {
      grid.water[i] = world.sourceWater;
      standing += world.sourceWater;
    }
  }

  return {
    version: CONFIG.saveVersion,
    seed,
    rngState: seedToState(seed),
    tick: 0,
    grid,
    buildings,
    nextBuildingId: nextId,
    resources: {
      materials: world.startMaterials,
      energy: 0,
      freeCanals: world.freeCanals,
      freeCanalsMax: world.freeCanals,
    },
    achievements: [],
    weather: level.weatherScript ? scriptedWeather(level.weatherScript.steps[0]) : { ...world.weather },
    weatherStep: level.weatherScript ? 0 : -1,
    dayOffset: level.dayOffset ?? 0,
    ledger: {
      rainAdded: 0,
      evaporation: 0,
      cropUptake: 0,
      householdUse: 0,
      discharged: 0,
      treatmentLoss: 0,
      spill: 0,
      total: standing,
      energyGenerated: 0,
      energyUsed: 0,
    },
    history: [],
    regenTimer: 0,
    lastCleanTick: -1e9,
    flags: { rain: true, sinks: true },
    levelId: level.id,
    allowedTools: [...level.tools],
    objectives: { done: [], sustain: {}, completedTick: null, stars: 0 },
    stats: { spent: 0, harvestRice: 0, harvestFish: 0, harvestGarden: 0, stocked: 0 },
  };
}

export function getBuilding(state: GameState, id: number): Building | undefined {
  for (const b of state.buildings) if (b.id === id) return b;
  return undefined;
}

export function buildingAt(state: GameState, cell: number): Building | undefined {
  const id = state.grid.structure[cell];
  if (id < 0) return undefined;
  return getBuilding(state, id);
}
