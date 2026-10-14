import type { BuildingType, ScenarioId, Terrain, ToolId, Weather } from '../model/types';
import { CONFIG } from '../model/config';
import { authorWorld } from './worldSeed';

export interface StarterBuilding {
  type: BuildingType;
  x: number;
  y: number;
  builtin: boolean;
  progress?: number;
  water?: number;
}

export interface ScenarioDef {
  id: ScenarioId;
  title: string;
  bn?: string;
  description: string;
  lessonId: string | null;
  w: number;
  h: number;
  terrain: Terrain[];
  elevation: number[];
  bed: number[];
  houses: { x: number; y: number }[];
  starterBuildings: StarterBuilding[];
  canals: { x: number; y: number }[];
  allowedTools: ToolId[] | null;
  startMaterials: number;
  freeCanals: number;
  startXp: number;
  weather: Weather;
  sourceWater: number;
}

const ALL: ScenarioId[] = ['lesson-1', 'lesson-2', 'lesson-3', 'lesson-4', 'lesson-5', 'village'];

export const SCENARIO_ORDER: ScenarioId[] = ALL;

export function isScenarioId(v: unknown): v is ScenarioId {
  return typeof v === 'string' && (ALL as string[]).includes(v);
}

interface MapPaint {
  w: number;
  h: number;
  terrain: Terrain[];
  elevation: number[];
  idx: (x: number, y: number) => number;
  elev: (x0: number, y0: number, x1: number, y1: number, e: number) => void;
  terr: (x0: number, y0: number, x1: number, y1: number, t: Terrain) => void;
  rock: (...pts: [number, number][]) => void;
}

function map(w: number, h: number, base: number): MapPaint {
  const terrain: Terrain[] = new Array(w * h).fill('soil');
  const elevation: number[] = new Array(w * h).fill(base);
  const idx = (x: number, y: number) => y * w + x;
  return {
    w,
    h,
    terrain,
    elevation,
    idx,
    elev: (x0, y0, x1, y1, e) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) elevation[idx(x, y)] = e;
    },
    terr: (x0, y0, x1, y1, t) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) terrain[idx(x, y)] = t;
    },
    rock: (...pts) => {
      for (const [x, y] of pts) terrain[idx(x, y)] = 'rock';
    },
  };
}

function bedAlong(m: MapPaint, cells: number[], tilt = CONFIG.water.streamRunTilt): number[] {
  const bed = new Array(m.w * m.h).fill(0);
  let runStart = 0;
  for (let k = 1; k <= cells.length; k++) {
    if (k === cells.length || m.elevation[cells[k]] !== m.elevation[cells[runStart]]) {
      const len = k - runStart;
      for (let j = 0; j < len; j++) bed[cells[runStart + j]] = -tilt * ((j + 1) / (len + 1));
      runStart = k;
    }
  }
  return bed;
}

function lesson1(): ScenarioDef {
  const m = map(12, 8, 3);
  m.elev(0, 0, 4, 1, 4);
  m.elev(0, 2, 11, 3, 3);
  m.elev(0, 4, 11, 7, 2);
  m.terr(1, 1, 2, 1, 'source');
  m.elev(1, 1, 2, 1, 4);
  m.rock([6, 0], [10, 0], [0, 7], [11, 7], [5, 7]);
  return {
    id: 'lesson-1',
    title: 'First Canal',
    bn: 'প্রথম খাল',
    description: 'Dig a channel so rain can reach the dry rice paddy.',
    lessonId: 'lesson-1',
    w: m.w,
    h: m.h,
    terrain: m.terrain,
    elevation: m.elevation,
    bed: new Array(m.w * m.h).fill(0),
    houses: [],
    starterBuildings: [{ type: 'field', x: 8, y: 4, builtin: true }],
    canals: [],
    allowedTools: ['inspect', 'canal', 'erase'],
    startMaterials: 40,
    freeCanals: 12,
    startXp: 0,
    weather: { mode: 'rain', remaining: 4000, duration: 4000 },
    sourceWater: 8,
  };
}

function lesson2(): ScenarioDef {
  const m = map(12, 8, 3);
  m.elev(0, 0, 3, 7, 3);
  m.elev(4, 0, 6, 4, 5);
  m.elev(4, 5, 11, 7, 2);
  m.elev(7, 0, 11, 4, 2);
  m.terr(1, 2, 1, 3, 'source');
  m.elev(1, 2, 1, 3, 3);
  m.rock([5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [4, 2], [6, 2]);
  return {
    id: 'lesson-2',
    title: 'Water Flows Downhill',
    bn: 'ঢাল বেয়ে',
    description: 'A ridge blocks the short path. Go around — water cannot climb.',
    lessonId: 'lesson-2',
    w: m.w,
    h: m.h,
    terrain: m.terrain,
    elevation: m.elevation,
    bed: new Array(m.w * m.h).fill(0),
    houses: [],
    starterBuildings: [{ type: 'field', x: 9, y: 1, builtin: true }],
    canals: [],
    allowedTools: ['inspect', 'canal', 'erase'],
    startMaterials: 50,
    freeCanals: 18,
    startXp: 0,
    weather: { mode: 'rain', remaining: 4000, duration: 4000 },
    sourceWater: 8,
  };
}

function lesson3(): ScenarioDef {
  const m = map(14, 9, 3);
  m.elev(0, 0, 13, 1, 4);
  m.elev(0, 2, 13, 4, 3);
  m.elev(0, 5, 13, 8, 2);
  m.terr(1, 1, 2, 1, 'source');
  m.elev(1, 1, 2, 1, 4);
  m.rock([13, 0], [0, 8], [13, 8], [7, 8]);
  const canals = [
    { x: 2, y: 2 },
    { x: 3, y: 2 },
    { x: 4, y: 2 },
    { x: 5, y: 2 },
    { x: 6, y: 2 },
    { x: 6, y: 3 },
    { x: 6, y: 4 },
    { x: 4, y: 4 },
    { x: 4, y: 5 },
    { x: 8, y: 4 },
    { x: 8, y: 5 },
  ];
  const almostRipe = 3 * CONFIG.field.ticksPerStage - 25;
  return {
    id: 'lesson-3',
    title: 'Gates and Harvest',
    bn: 'গেট ও ফসল',
    description: 'Close a gate to choose which paddy drinks, then harvest gold rice.',
    lessonId: 'lesson-3',
    w: m.w,
    h: m.h,
    terrain: m.terrain,
    elevation: m.elevation,
    bed: new Array(m.w * m.h).fill(0),
    houses: [],
    starterBuildings: [
      { type: 'field', x: 2, y: 5, builtin: true, progress: almostRipe },
      { type: 'field', x: 9, y: 5, builtin: true, progress: almostRipe },
    ],
    canals,
    allowedTools: ['inspect', 'canal', 'erase', 'gate'],
    startMaterials: 80,
    freeCanals: 8,
    startXp: 0,
    weather: { mode: 'rain', remaining: 4000, duration: 4000 },
    sourceWater: 8,
  };
}

function lesson4(): ScenarioDef {
  const m = map(14, 10, 3);
  m.elev(0, 0, 13, 1, 4);
  m.elev(0, 2, 13, 3, 3);
  m.elev(5, 3, 10, 7, 3);
  m.elev(6, 4, 9, 6, 2);
  m.elev(0, 8, 13, 9, 2);
  m.terr(1, 1, 2, 1, 'source');
  m.elev(1, 1, 2, 1, 4);
  m.terr(3, 1, 8, 1, 'river');
  m.elev(3, 1, 8, 1, 4);
  m.terr(6, 4, 9, 6, 'basin');
  m.rock([13, 0], [0, 9], [12, 9]);
  const stream: number[] = [];
  for (let x = 3; x <= 8; x++) stream.push(m.idx(x, 1));
  return {
    id: 'lesson-4',
    title: 'Save the Rain',
    bn: 'বৃষ্টি রাখো',
    description: 'Store monsoon water in a basin so the paddy survives a dry spell.',
    lessonId: 'lesson-4',
    w: m.w,
    h: m.h,
    terrain: m.terrain,
    elevation: m.elevation,
    bed: bedAlong(m, stream),
    houses: [],
    starterBuildings: [{ type: 'field', x: 10, y: 4, builtin: true }],
    canals: [],
    allowedTools: ['inspect', 'canal', 'erase', 'reservoir'],
    startMaterials: 80,
    freeCanals: 12,
    startXp: CONFIG.progression.levels[1],
    weather: { mode: 'rain', remaining: 2500, duration: 2500 },
    sourceWater: 8,
  };
}

function lesson5(): ScenarioDef {
  const m = map(14, 10, 3);
  m.elev(0, 0, 5, 9, 4);
  m.elev(6, 0, 13, 9, 2);
  m.terr(1, 3, 1, 3, 'source');
  m.elev(1, 3, 1, 3, 4);
  const stream: number[] = [];
  for (let x = 2; x <= 5; x++) {
    m.terrain[m.idx(x, 3)] = 'river';
    m.elevation[m.idx(x, 3)] = 4;
    stream.push(m.idx(x, 3));
  }
  for (let x = 6; x <= 11; x++) {
    m.terrain[m.idx(x, 3)] = 'river';
    m.elevation[m.idx(x, 3)] = 2;
    stream.push(m.idx(x, 3));
  }
  m.terrain[m.idx(12, 3)] = 'outlet';
  m.terrain[m.idx(13, 3)] = 'outlet';
  m.elevation[m.idx(12, 3)] = 1;
  m.elevation[m.idx(13, 3)] = 1;
  m.terr(2, 6, 5, 8, 'foundation');
  m.terr(2, 7, 5, 7, 'path');
  m.rock([0, 0], [13, 9], [0, 9]);
  return {
    id: 'lesson-5',
    title: 'Power and Light',
    bn: 'আলো জ্বালো',
    description: 'A drop in the stream can spin a wheel. Store that power so a home lights up.',
    lessonId: 'lesson-5',
    w: m.w,
    h: m.h,
    terrain: m.terrain,
    elevation: m.elevation,
    bed: bedAlong(m, stream),
    houses: [{ x: 3, y: 6 }],
    starterBuildings: [],
    canals: [],
    allowedTools: ['inspect', 'canal', 'erase', 'turbine', 'battery'],
    startMaterials: 80,
    freeCanals: 6,
    startXp: CONFIG.progression.levels[2],
    weather: { mode: 'rain', remaining: 4000, duration: 4000 },
    sourceWater: 10,
  };
}

function village(): ScenarioDef {
  const world = authorWorld(CONFIG.grid.w, CONFIG.grid.h, CONFIG.water.streamRunTilt);
  return {
    id: 'village',
    title: 'The Village',
    bn: 'গ্রাম',
    description: 'The full monsoon village. Guide rainfall from ridge to bloom.',
    lessonId: 'village',
    w: world.w,
    h: world.h,
    terrain: world.terrain,
    elevation: world.elevation,
    bed: world.bed,
    houses: world.houses,
    starterBuildings: [{ type: 'field', x: world.starterField.x, y: world.starterField.y, builtin: true }],
    canals: [],
    allowedTools: null,
    startMaterials: CONFIG.progression.startMaterials,
    freeCanals: CONFIG.progression.freeCanals,
    startXp: 0,
    weather: { mode: 'rain', remaining: 1200, duration: 1200 },
    sourceWater: 6,
  };
}

const BUILDERS: Record<ScenarioId, () => ScenarioDef> = {
  'lesson-1': lesson1,
  'lesson-2': lesson2,
  'lesson-3': lesson3,
  'lesson-4': lesson4,
  'lesson-5': lesson5,
  village,
};

export function getScenario(id: ScenarioId): ScenarioDef {
  return BUILDERS[id]();
}

export function nextScenario(id: ScenarioId): ScenarioId | null {
  const i = SCENARIO_ORDER.indexOf(id);
  if (i < 0 || i >= SCENARIO_ORDER.length - 1) return null;
  return SCENARIO_ORDER[i + 1];
}

export const LESSON_SCENARIOS: ScenarioId[] = ['lesson-1', 'lesson-2', 'lesson-3', 'lesson-4', 'lesson-5'];
