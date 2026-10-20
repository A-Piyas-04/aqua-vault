import { CONFIG } from '../model/config';
import type { BuildingType, GameState, LevelId, Terrain, ToolId, Weather, WeatherMode } from '../model/types';
import { authorWorld } from './worldSeed';
import { isVillageInBloom } from './milestones';

/**
 * The campaign: ten short levels, each introducing one mechanic, then the open sandbox.
 * Every objective is a pure check on serializable state, so progress is deterministic,
 * saved with the level, and latched by the simulation (it can never go backwards).
 */

export interface Coach {
  /** Tool button to pulse. */
  tool?: ToolId;
  /** Dashed path to follow (canal routes). */
  path?: { x: number; y: number }[];
  /** Glowing rectangle (build sites). */
  zone?: { x: number; y: number; w: number; h: number };
  /** Individual glowing tiles. */
  cells?: { x: number; y: number }[];
  /** Show the height numbers while this objective is current. */
  heights?: boolean;
}

export interface ObjectiveDef {
  id: string;
  icon: string;
  /** One action, imperative, at most ~12 words. */
  text: string;
  /** One extra line of help shown while the objective is current. */
  hint?: string;
  check: (s: GameState) => boolean;
  /** When set, `check` must hold for this many consecutive ticks. */
  sustainTicks?: number;
  progress?: (s: GameState) => { value: number; goal: number };
  /** In unordered levels, only evaluated once every other objective is done. */
  final?: boolean;
  coach?: Coach;
}

export interface StarterBuilding {
  type: BuildingType;
  x: number;
  y: number;
  builtin: boolean;
  progress?: number;
  water?: number;
  dir?: number;
}

export interface LevelMap {
  w: number;
  h: number;
  terrain: Terrain[];
  elevation: number[];
  bed: number[];
  houses: { x: number; y: number }[];
  starterBuildings: StarterBuilding[];
  canals: { x: number; y: number }[];
  startMaterials: number;
  freeCanals: number;
  weather: Weather;
  sourceWater: number;
}

export interface WeatherStep {
  mode: WeatherMode;
  /** Fixed duration in ticks. */
  ticks?: number;
  /** Hold this mode until the objective with this id has latched. */
  until?: string;
}

export type HudItem = 'freeCanals' | 'materials' | 'heights' | 'stored' | 'speed' | 'energy' | 'clean' | 'ecosystem' | 'journal' | 'rank';

export interface JournalPage {
  title: string;
  text: string;
  careful?: string[];
}

export interface LevelDef {
  id: LevelId;
  /** 1-based campaign number; 0 for the sandbox. */
  num: number;
  title: string;
  bn: string;
  /** One sentence shown when the level opens. */
  intro: string;
  /** Tools usable here, besides inspect and erase. */
  tools: ToolId[];
  /** Tools introduced by this level (tool intro cards). */
  newTools: ToolId[];
  build: () => LevelMap;
  objectives: ObjectiveDef[];
  /** Objectives latch in order (true) or in any order with a final one (false). */
  ordered: boolean;
  /** Star pars: net materials spent, and seconds of game time to finish. */
  par: { materials: number; seconds: number };
  xp: number;
  weatherScript?: { steps: WeatherStep[]; loop: number };
  dayOffset?: number;
  hud: HudItem[];
  journal: JournalPage[];
}

// ---------- map painting helpers ----------

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

function paint(w: number, h: number, base: number): MapPaint {
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

/** Tilt each flat run of a stream slightly downstream so it keeps moving. */
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

/** Paint a river along cells with the given elevations; returns the cell list. */
function river(m: MapPaint, pts: [number, number, number][]): number[] {
  const cells: number[] = [];
  for (const [x, y, e] of pts) {
    const i = m.idx(x, y);
    m.terrain[i] = 'river';
    m.elevation[i] = e;
    cells.push(i);
  }
  return cells;
}

const flat = (m: MapPaint) => new Array(m.w * m.h).fill(0);
const rain = (ticks: number): Weather => ({ mode: 'rain', remaining: ticks, duration: ticks });

function baseMap(m: MapPaint, extra: Partial<LevelMap>): LevelMap {
  return {
    w: m.w,
    h: m.h,
    terrain: m.terrain,
    elevation: m.elevation,
    bed: flat(m),
    houses: [],
    starterBuildings: [],
    canals: [],
    startMaterials: 40,
    freeCanals: 10,
    weather: rain(4000),
    sourceWater: 8,
    ...extra,
  };
}

// ---------- shared checks ----------

const ofType = (s: GameState, t: string) => s.buildings.filter((b) => b.type === t);
const has = (s: GameState, t: string) => s.buildings.some((b) => b.type === t);
const wetCanal = (s: GameState) => s.grid.canal.some((c, i) => c === 1 && s.grid.water[i] > 0.3);
const fieldWet = (s: GameState) => s.buildings.some((b) => b.type === 'field' && b.water >= CONFIG.field.wetMoisture);
const maxField = (s: GameState) => Math.max(0, ...ofType(s, 'field').map((b) => b.water));
const maxWater = (s: GameState, t: string) => Math.max(0, ...ofType(s, t).map((b) => b.water));
const maxProgress = (s: GameState, t: string) => Math.max(0, ...ofType(s, t).map((b) => b.progress));
const sustained = (s: GameState, id: string) => s.objectives.sustain[id] ?? 0;

const drinkProgress = (s: GameState) => ({ value: Math.min(maxField(s), CONFIG.field.wetMoisture), goal: CONFIG.field.wetMoisture });

// ---------- levels ----------

function mapFirstCanal(): LevelMap {
  const m = paint(12, 8, 3);
  m.elev(0, 0, 4, 1, 4);
  m.elev(0, 2, 11, 3, 3);
  m.elev(0, 4, 11, 7, 2);
  m.terr(1, 1, 2, 1, 'source');
  m.elev(1, 1, 2, 1, 4);
  m.rock([6, 0], [10, 0], [0, 7], [11, 7], [5, 7]);
  return baseMap(m, { starterBuildings: [{ type: 'field', x: 8, y: 4, builtin: true }], startMaterials: 20, freeCanals: 12 });
}

function mapDownhill(): LevelMap {
  const m = paint(12, 8, 3);
  m.elev(0, 0, 3, 7, 3);
  m.elev(4, 0, 6, 4, 5);
  m.elev(4, 5, 11, 7, 2);
  m.elev(7, 0, 11, 4, 2);
  m.terr(1, 2, 1, 3, 'source');
  m.elev(1, 2, 1, 3, 3);
  m.rock([5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [4, 2], [6, 2]);
  return baseMap(m, { starterBuildings: [{ type: 'field', x: 9, y: 1, builtin: true }], startMaterials: 20, freeCanals: 18 });
}

function mapGates(): LevelMap {
  const m = paint(14, 9, 3);
  m.elev(0, 0, 13, 1, 4);
  m.elev(0, 2, 13, 4, 3);
  m.elev(0, 5, 13, 8, 2);
  m.terr(1, 1, 2, 1, 'source');
  m.elev(1, 1, 2, 1, 4);
  m.rock([13, 0], [0, 8], [13, 8], [7, 8]);
  const canals: [number, number][] = [
    [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [6, 3], [6, 4], [5, 4], [4, 4], [4, 5], [7, 4], [8, 4], [8, 5],
  ];
  const almostRipe = 3 * CONFIG.field.ticksPerStage - 25;
  return baseMap(m, {
    starterBuildings: [
      { type: 'field', x: 2, y: 5, builtin: true, progress: almostRipe },
      { type: 'field', x: 9, y: 5, builtin: true, progress: almostRipe },
    ],
    canals: canals.map(([x, y]) => ({ x, y })),
    startMaterials: 20,
    freeCanals: 8,
  });
}

function mapSaveRain(): LevelMap {
  const m = paint(14, 10, 3);
  m.elev(0, 0, 13, 1, 4);
  m.elev(0, 2, 13, 3, 3);
  m.elev(5, 3, 10, 7, 3);
  m.elev(6, 4, 9, 6, 2);
  // The starter paddy sits flat beside the basin.
  m.elev(10, 4, 10, 5, 2);
  m.elev(0, 8, 13, 9, 2);
  m.terr(1, 1, 2, 1, 'source');
  m.elev(1, 1, 2, 1, 4);
  const stream = river(m, [3, 4, 5, 6, 7, 8].map((x) => [x, 1, 4] as [number, number, number]));
  m.terr(6, 4, 9, 6, 'basin');
  m.rock([13, 0], [0, 9], [12, 9]);
  return baseMap(m, {
    bed: bedAlong(m, stream),
    starterBuildings: [{ type: 'field', x: 9, y: 4, builtin: true }],
    startMaterials: 40,
    freeCanals: 12,
  });
}

function mapWheelLight(): LevelMap {
  const m = paint(14, 10, 3);
  m.elev(0, 0, 5, 9, 4);
  m.elev(6, 0, 13, 9, 2);
  m.terr(1, 3, 1, 3, 'source');
  m.elev(1, 3, 1, 3, 4);
  const pts: [number, number, number][] = [];
  for (let x = 2; x <= 5; x++) pts.push([x, 3, 4]);
  for (let x = 6; x <= 11; x++) pts.push([x, 3, 2]);
  const stream = river(m, pts);
  m.terr(12, 3, 13, 3, 'outlet');
  m.elev(12, 3, 13, 3, 1);
  m.terr(2, 6, 5, 8, 'foundation');
  m.terr(2, 7, 5, 7, 'path');
  m.rock([0, 0], [13, 9], [0, 9]);
  return baseMap(m, { bed: bedAlong(m, stream), houses: [{ x: 3, y: 6 }], startMaterials: 60, freeCanals: 6, sourceWater: 10 });
}

function mapCleanWater(): LevelMap {
  const m = paint(16, 10, 2);
  m.elev(0, 0, 7, 4, 4);
  m.terr(1, 2, 1, 2, 'source');
  const pts: [number, number, number][] = [];
  for (let x = 2; x <= 7; x++) pts.push([x, 2, 4]);
  for (let x = 8; x <= 13; x++) pts.push([x, 2, 2]);
  const stream = river(m, pts);
  m.terr(14, 2, 15, 2, 'outlet');
  m.elev(14, 2, 15, 2, 1);
  m.terr(9, 6, 14, 9, 'foundation');
  m.terr(9, 8, 14, 8, 'path');
  m.rock([0, 9], [15, 9], [3, 7], [0, 0], [15, 0]);
  return baseMap(m, {
    bed: bedAlong(m, stream),
    houses: [
      { x: 10, y: 7 },
      { x: 13, y: 7 },
    ],
    starterBuildings: [
      { type: 'turbine', x: 7, y: 2, builtin: true },
      { type: 'battery', x: 4, y: 6, builtin: true },
    ],
    startMaterials: 70,
    freeCanals: 6,
    sourceWater: 10,
  });
}

function mapFishPond(): LevelMap {
  const m = paint(14, 10, 3);
  m.elev(0, 0, 13, 1, 4);
  m.terr(1, 1, 1, 1, 'source');
  const pts: [number, number, number][] = [];
  for (let x = 2; x <= 11; x++) pts.push([x, 1, 4]);
  const stream = river(m, pts);
  m.terr(12, 1, 13, 1, 'outlet');
  m.elev(12, 1, 13, 1, 3);
  m.elev(5, 4, 9, 6, 2);
  m.terr(5, 4, 9, 6, 'basin');
  m.elev(0, 8, 13, 9, 2);
  const drainPts: [number, number, number][] = [];
  for (let x = 0; x <= 11; x++) drainPts.push([x, 9, 1]);
  const drain = river(m, drainPts);
  m.terr(12, 9, 13, 9, 'outlet');
  m.elev(12, 9, 13, 9, 0);
  m.rock([0, 0], [13, 0], [2, 5], [11, 6], [12, 4]);
  const bedA = bedAlong(m, stream);
  const bedB = bedAlong(m, drain);
  return baseMap(m, {
    bed: bedA.map((v, i) => v + bedB[i]),
    startMaterials: 55,
    freeCanals: 6,
    sourceWater: 10,
  });
}

function mapWetland(): LevelMap {
  const m = paint(16, 10, 3);
  m.elev(0, 0, 1, 2, 4);
  m.terr(1, 1, 1, 1, 'source');
  const pts: [number, number, number][] = [];
  for (let x = 2; x <= 9; x++) pts.push([x, 1, 3]);
  for (let x = 10; x <= 13; x++) pts.push([x, 1, 2]);
  const stream = river(m, pts);
  m.terr(14, 1, 15, 1, 'outlet');
  m.elev(14, 1, 15, 1, 1);
  // The ground just below the stream sits one step lower, so a canal can draw from it.
  m.elev(0, 3, 15, 5, 2);
  m.elev(2, 2, 15, 2, 2);
  m.elev(2, 6, 13, 9, 1);
  m.terr(2, 6, 13, 9, 'marsh');
  m.rock([0, 9], [15, 9], [14, 6], [1, 6], [9, 3]);
  return baseMap(m, { bed: bedAlong(m, stream), startMaterials: 60, freeCanals: 6, sourceWater: 10 });
}

function mapLiftWater(): LevelMap {
  const m = paint(14, 10, 2);
  m.elev(0, 5, 3, 7, 4);
  m.terr(1, 6, 1, 6, 'source');
  const pts: [number, number, number][] = [
    [2, 6, 4],
    [3, 6, 4],
  ];
  for (let x = 4; x <= 12; x++) pts.push([x, 6, 2]);
  const stream = river(m, pts);
  m.terr(13, 6, 13, 6, 'outlet');
  m.elev(13, 6, 13, 6, 1);
  m.elev(7, 0, 13, 4, 4);
  m.rock([0, 0], [0, 9], [13, 9], [6, 2], [5, 9]);
  return baseMap(m, {
    bed: bedAlong(m, stream),
    starterBuildings: [
      { type: 'field', x: 10, y: 1, builtin: true },
      { type: 'turbine', x: 3, y: 6, builtin: true },
      { type: 'battery', x: 2, y: 8, builtin: true },
    ],
    startMaterials: 60,
    freeCanals: 6,
    sourceWater: 10,
  });
}

function mapVillage(materials: number, freeCanals: number): LevelMap {
  const world = authorWorld(CONFIG.grid.w, CONFIG.grid.h, CONFIG.water.streamRunTilt);
  return {
    w: world.w,
    h: world.h,
    terrain: world.terrain,
    elevation: world.elevation,
    bed: world.bed,
    houses: world.houses,
    starterBuildings: [{ type: 'field', x: world.starterField.x, y: world.starterField.y, builtin: true }],
    canals: [],
    startMaterials: materials,
    freeCanals,
    weather: rain(1200),
    sourceWater: 6,
  };
}

const CAMPAIGN_TOOLS: ToolId[] = ['canal', 'gate', 'field', 'reservoir', 'turbine', 'battery', 'treatment', 'connector', 'fishpond', 'wetland', 'floating', 'pump'];

/** HUD items appear cumulatively as levels introduce them. */
const HUD_BY_LEVEL: HudItem[][] = [
  ['freeCanals'],
  ['heights', 'journal'],
  ['materials'],
  ['stored', 'speed'],
  ['energy'],
  ['clean'],
  ['ecosystem'],
  [],
  [],
  ['rank'],
];
function hudUpTo(num: number): HudItem[] {
  const out: HudItem[] = [];
  for (let i = 0; i < num && i < HUD_BY_LEVEL.length; i++) out.push(...HUD_BY_LEVEL[i]);
  return out;
}

export const LEVELS: LevelDef[] = [
  {
    id: 'first-canal',
    num: 1,
    title: 'First Canal',
    bn: 'প্রথম খাল',
    intro: 'Rain is filling the spring. The rice paddy below is dry.',
    tools: ['canal'],
    newTools: ['canal'],
    build: mapFirstCanal,
    ordered: true,
    par: { materials: 0, seconds: 60 },
    xp: 40,
    hud: hudUpTo(1),
    objectives: [
      {
        id: 'flow',
        icon: 'canal',
        text: 'Dig a canal from the spring toward the paddy',
        hint: 'Pick Canal, then drag along the glowing path.',
        check: wetCanal,
        coach: {
          tool: 'canal',
          cells: [
            { x: 1, y: 1 },
            { x: 2, y: 1 },
          ],
          path: [
            { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }, { x: 5, y: 2 },
            { x: 6, y: 2 }, { x: 7, y: 2 }, { x: 8, y: 2 }, { x: 8, y: 3 },
          ],
        },
      },
      {
        id: 'drink',
        icon: 'field',
        text: 'Connect the canal to the dry paddy',
        hint: 'A paddy drinks from any wet tile that touches it.',
        check: fieldWet,
        progress: drinkProgress,
        coach: { zone: { x: 8, y: 4, w: 2, h: 2 } },
      },
    ],
    journal: [
      { title: 'Rain gathers at the spring', text: 'Rain only collects in the catchment (the spring pool). From there it can only travel through connected tiles.' },
      {
        title: 'Canals carry water',
        text: 'Drag with the Canal tool to dig a channel. Water moves through canals far faster than over soil.',
        careful: [
          'Canals cannot cross rock. Go around the stones.',
          'A gap of dry soil stops the flow.',
          'Your first canal tiles are free. After that, digging costs materials.',
        ],
      },
      { title: 'Mistakes are cheap', text: 'Undo takes back a whole stroke. Erase removes canal tiles and gives them back to your free canals.' },
    ],
  },
  {
    id: 'downhill',
    num: 2,
    title: 'Water Flows Downhill',
    bn: 'ঢাল বেয়ে',
    intro: 'A stony ridge stands between the spring and the paddy.',
    tools: ['canal'],
    newTools: [],
    build: mapDownhill,
    ordered: true,
    par: { materials: 0, seconds: 90 },
    xp: 40,
    hud: hudUpTo(2),
    objectives: [
      {
        id: 'around',
        icon: 'canal',
        text: 'Dig around the ridge on the low southern ground',
        hint: 'Water cannot climb. Uphill tiles turn red while you dig.',
        check: (s) => s.grid.canal.some((c, i) => c === 1 && s.grid.elevation[i] === 2 && s.grid.water[i] > 0.3),
        coach: {
          tool: 'canal',
          heights: true,
          zone: { x: 4, y: 0, w: 3, h: 5 },
          path: [
            { x: 2, y: 3 }, { x: 2, y: 4 }, { x: 2, y: 5 }, { x: 2, y: 6 }, { x: 3, y: 6 }, { x: 4, y: 6 }, { x: 5, y: 6 },
            { x: 6, y: 6 }, { x: 7, y: 6 }, { x: 8, y: 6 }, { x: 8, y: 5 }, { x: 8, y: 4 }, { x: 8, y: 3 }, { x: 8, y: 2 },
          ],
        },
      },
      {
        id: 'drink',
        icon: 'field',
        text: 'Lead the water on to the far paddy',
        hint: 'Stay on low ground until the canal touches the paddy.',
        check: fieldWet,
        progress: drinkProgress,
        coach: { tool: 'canal', zone: { x: 9, y: 1, w: 2, h: 2 } },
      },
    ],
    journal: [
      {
        title: 'Heights decide everything',
        text: 'Every tile has a height. Water only moves from higher to lower ground. Press H to show the numbers.',
        careful: [
          'A canal that runs uphill stays dry.',
          'Overflow spills onto soil and soaks in. It never jumps a ridge.',
        ],
      },
    ],
  },
  {
    id: 'gates-harvest',
    num: 3,
    title: 'Gates and Harvest',
    bn: 'গেট ও ফসল',
    intro: 'One canal feeds two paddies. You choose which one drinks.',
    tools: ['canal', 'gate', 'field'],
    newTools: ['gate'],
    build: mapGates,
    ordered: true,
    par: { materials: 3, seconds: 90 },
    xp: 50,
    hud: hudUpTo(3),
    objectives: [
      {
        id: 'gate',
        icon: 'gate',
        text: 'Place a gate on the left branch',
        hint: 'Pick Gate, then tap the glowing canal tile.',
        check: (s) => s.grid.gate.some((v) => v > 0),
        coach: { tool: 'gate', cells: [{ x: 4, y: 4 }] },
      },
      {
        id: 'close',
        icon: 'gate',
        text: 'Close the gate to send water right',
        hint: 'Pick Inspect, tap the gate, then press Close gate.',
        check: (s) => s.grid.gate.some((v) => v === 2),
        coach: { tool: 'inspect' },
      },
      {
        id: 'harvest',
        icon: 'field',
        text: 'Harvest the golden rice',
        hint: 'When a paddy turns gold, Inspect it and press Harvest.',
        check: (s) => s.stats.harvestRice >= 1,
        progress: (s) => ({ value: Math.min(maxProgress(s, 'field'), 3 * CONFIG.field.ticksPerStage), goal: 3 * CONFIG.field.ticksPerStage }),
        coach: { tool: 'inspect', zone: { x: 9, y: 5, w: 2, h: 2 } },
      },
    ],
    journal: [
      {
        title: 'Gates share the water',
        text: 'A gate sits on a canal tile. Closed, it stops all flow through that tile in both directions. Tap it with Inspect to open or close it.',
      },
      {
        title: 'Rice grows while it drinks',
        text: 'A paddy grows through four stages only while its soil stays wet. Golden rice can be harvested for materials.',
        careful: ['A paddy that dries out pauses. Re-water it to continue.'],
      },
    ],
  },
  {
    id: 'save-rain',
    num: 4,
    title: 'Save the Rain',
    bn: 'বৃষ্টি রাখো',
    intro: 'A dry spell is coming. Store monsoon water before it starts.',
    tools: ['canal', 'gate', 'field', 'reservoir'],
    newTools: ['reservoir'],
    build: mapSaveRain,
    ordered: true,
    par: { materials: 25, seconds: 220 },
    xp: 60,
    hud: hudUpTo(4),
    weatherScript: {
      steps: [
        { mode: 'rain', until: 'fill' },
        { mode: 'dry', ticks: 1000 },
        { mode: 'rain', ticks: 500 },
      ],
      loop: 1,
    },
    objectives: [
      {
        id: 'build',
        icon: 'reservoir',
        text: 'Build a reservoir in the glowing basin',
        hint: 'A basin is a hollow whose rim holds water in.',
        check: (s) => has(s, 'reservoir'),
        coach: { tool: 'reservoir', zone: { x: 6, y: 4, w: 4, h: 3 } },
      },
      {
        id: 'fill',
        icon: 'drop',
        text: 'Dig from the stream and fill the reservoir to 60%',
        hint: 'The dry spell begins once it is 60% full.',
        check: (s) => maxWater(s, 'reservoir') >= CONFIG.reservoir.capacity * 0.6,
        progress: (s) => ({ value: Math.min(maxWater(s, 'reservoir'), CONFIG.reservoir.capacity * 0.6), goal: CONFIG.reservoir.capacity * 0.6 }),
        coach: {
          tool: 'canal',
          path: [
            { x: 7, y: 2 },
            { x: 7, y: 3 },
          ],
        },
      },
      {
        id: 'survive',
        icon: 'sun',
        text: 'Keep the paddy moist through the dry spell',
        hint: 'The paddy drinks from the reservoir beside it.',
        sustainTicks: 900,
        check: (s) => s.weather.mode === 'dry' && maxField(s) >= 4,
        progress: (s) => ({ value: sustained(s, 'survive'), goal: 900 }),
      },
    ],
    journal: [
      {
        title: 'Reservoirs store water',
        text: 'A reservoir fills from higher neighbours and drains to lower ones. When it is full, extra water overflows downstream.',
        careful: ['Build in a basin so the rim holds the water.', 'In a dry spell, no rain falls and water evaporates faster.'],
      },
    ],
  },
  {
    id: 'wheel-light',
    num: 5,
    title: 'Power and Light',
    bn: 'আলো জ্বালো',
    intro: 'Night is falling. A drop in the stream can light a home.',
    tools: ['canal', 'gate', 'field', 'reservoir', 'turbine', 'battery'],
    newTools: ['turbine', 'battery'],
    build: mapWheelLight,
    ordered: true,
    par: { materials: 48, seconds: 120 },
    xp: 70,
    dayOffset: Math.round(CONFIG.weather.dayLengthTicks * 0.42),
    hud: hudUpTo(5),
    objectives: [
      {
        id: 'spin',
        icon: 'turbine',
        text: 'Place a waterwheel where the stream steps down',
        hint: 'A wheel needs moving water and a lower tile next to it.',
        check: (s) => s.buildings.some((b) => b.type === 'turbine' && b.rate > 0),
        coach: { tool: 'turbine', cells: [{ x: 5, y: 3 }] },
      },
      {
        id: 'charge',
        icon: 'battery',
        text: 'Build a battery and charge it to 30',
        hint: 'Batteries store the wheel’s power for the home.',
        check: (s) => has(s, 'battery') && s.resources.energy >= 30,
        progress: (s) => ({ value: has(s, 'battery') ? Math.min(30, s.resources.energy) : 0, goal: 30 }),
        coach: { tool: 'battery', zone: { x: 2, y: 6, w: 4, h: 3 } },
      },
      {
        id: 'lit',
        icon: 'house',
        text: 'Keep the home lit for 30 seconds',
        check: (s) => s.buildings.some((b) => b.type === 'house' && b.lit),
        sustainTicks: 300,
        progress: (s) => ({ value: sustained(s, 'lit'), goal: 300 }),
      },
    ],
    journal: [
      {
        title: 'Waterwheels make power',
        text: 'Power = flow × drop. A wheel on a canal or stream that steps downhill spins while water passes through it. The water carries on downstream.',
        careful: ['No drop, or no flow, means no power.', 'A still reservoir alone makes no power.'],
      },
      { title: 'Batteries', text: 'Each battery stores 120 units. Homes use a little power to keep their lights on.' },
    ],
  },
  {
    id: 'clean-water',
    num: 6,
    title: 'Clean Water',
    bn: 'বিশুদ্ধ পানি',
    intro: 'The wheel already turns. Homes need water that is safe to drink.',
    tools: ['canal', 'gate', 'field', 'reservoir', 'turbine', 'battery', 'treatment', 'connector'],
    newTools: ['treatment', 'connector'],
    build: mapCleanWater,
    ordered: true,
    par: { materials: 55, seconds: 120 },
    xp: 80,
    hud: hudUpTo(6),
    objectives: [
      {
        id: 'clean',
        icon: 'treatment',
        text: 'Build a treatment plant beside flowing water',
        hint: 'It needs raw water next to it and power from the wheel.',
        check: (s) => s.buildings.some((b) => b.type === 'treatment' && b.rate > 0),
        coach: { tool: 'treatment', zone: { x: 9, y: 3, w: 4, h: 2 } },
      },
      {
        id: 'tap',
        icon: 'connector',
        text: 'Place a home tap right beside a house',
        hint: 'Taps draw clean water from plants up to 10 tiles away.',
        check: (s) => has(s, 'connector'),
        coach: {
          tool: 'connector',
          cells: [
            { x: 10, y: 6 },
            { x: 13, y: 6 },
          ],
        },
      },
      {
        id: 'supplied',
        icon: 'house',
        text: 'Keep clean water flowing to a home for 20 seconds',
        check: (s) => s.buildings.some((b) => b.type === 'house' && b.supplied),
        sustainTicks: 200,
        progress: (s) => ({ value: sustained(s, 'supplied'), goal: 200 }),
      },
    ],
    journal: [
      {
        title: 'Treatment plants',
        text: 'A treatment plant takes raw water from a wet tile beside it, plus electricity. It filters and disinfects the water into a covered clean tank.',
        careful: [
          'Raw stream or rain water is never piped to homes.',
          'In real life, boiling kills many germs but does not remove chemicals. This game is not drinking-water advice.',
        ],
      },
      { title: 'Home taps', text: 'A home tap goes right beside a house. Sealed pipes bring clean water from the nearest plant within 10 tiles.' },
    ],
  },
  {
    id: 'fish-pond',
    num: 7,
    title: 'Living Pond',
    bn: 'পুকুরে মাছ',
    intro: 'A basin waits below the stream. Fish need fresh, moving water.',
    tools: ['canal', 'gate', 'field', 'reservoir', 'turbine', 'battery', 'treatment', 'connector', 'fishpond'],
    newTools: ['fishpond'],
    build: mapFishPond,
    ordered: true,
    par: { materials: 45, seconds: 220 },
    xp: 80,
    hud: hudUpTo(7),
    objectives: [
      {
        id: 'fill',
        icon: 'fishpond',
        text: 'Build a fish pond and fill it past 65',
        hint: 'Put it in the basin, then dig a canal in from the stream.',
        check: (s) => maxWater(s, 'fishpond') >= CONFIG.fishpond.minFill,
        progress: (s) => ({ value: Math.min(maxWater(s, 'fishpond'), CONFIG.fishpond.minFill), goal: CONFIG.fishpond.minFill }),
        coach: {
          tool: 'fishpond',
          zone: { x: 5, y: 4, w: 5, h: 3 },
          path: [
            { x: 7, y: 2 },
            { x: 7, y: 3 },
          ],
        },
      },
      {
        id: 'stock',
        icon: 'fish',
        text: 'Stock the pond with fish',
        hint: 'Inspect the pond and press Stock fish.',
        check: (s) => s.stats.stocked >= 1,
        coach: { tool: 'inspect' },
      },
      {
        id: 'harvest',
        icon: 'fish',
        text: 'Keep the water fresh, then harvest the fish',
        hint: 'Still water goes stale. Dig an outlet down to the lower stream.',
        check: (s) => s.stats.harvestFish >= 1,
        progress: (s) => ({ value: maxProgress(s, 'fishpond'), goal: 1 }),
        coach: {
          tool: 'canal',
          path: [
            { x: 7, y: 7 },
            { x: 7, y: 8 },
          ],
        },
      },
    ],
    journal: [
      {
        title: 'Fresh water for fish',
        text: 'Fish grow only while the pond is full enough and fresh. Freshness comes from water flowing in and on out again.',
        careful: ['A full but still pond goes stagnant.', 'An outlet one step above the pond floor lets it overflow gently.', 'Pond water is not drinking water.'],
      },
    ],
  },
  {
    id: 'wetland-garden',
    num: 8,
    title: 'Wetland & Floating Garden',
    bn: 'শাপলা ও ধাপ চাষ',
    intro: 'The low marsh can come alive with reeds, shāpla and floating beds.',
    tools: ['canal', 'gate', 'field', 'reservoir', 'turbine', 'battery', 'treatment', 'connector', 'fishpond', 'wetland', 'floating'],
    newTools: ['wetland', 'floating'],
    build: mapWetland,
    ordered: true,
    par: { materials: 45, seconds: 240 },
    xp: 90,
    hud: hudUpTo(8),
    objectives: [
      {
        id: 'thrive',
        icon: 'wetland',
        text: 'Grow a thriving wetland on the low marsh',
        hint: 'Wetlands need steady shallow water at height 2 or lower.',
        check: (s) => maxProgress(s, 'wetland') >= CONFIG.wetland.thriveEcology,
        progress: (s) => ({ value: Math.min(maxProgress(s, 'wetland'), CONFIG.wetland.thriveEcology), goal: CONFIG.wetland.thriveEcology }),
        coach: {
          tool: 'wetland',
          zone: { x: 5, y: 6, w: 4, h: 3 },
          path: [
            { x: 6, y: 2 },
            { x: 6, y: 3 },
            { x: 6, y: 4 },
            { x: 6, y: 5 },
          ],
        },
      },
      {
        id: 'float',
        icon: 'floating',
        text: 'Float a garden on the wetland',
        hint: 'Pick Floating garden, then tap the wetland.',
        check: (s) => has(s, 'floating'),
        coach: { tool: 'floating' },
      },
      {
        id: 'harvest',
        icon: 'leaf',
        text: 'Harvest the floating garden',
        hint: 'Vegetables grow while the wetland stays wet.',
        check: (s) => s.stats.harvestGarden >= 1,
        progress: (s) => ({ value: maxProgress(s, 'floating'), goal: 1 }),
        coach: { tool: 'inspect' },
      },
    ],
    journal: [
      { title: 'Wetlands', text: 'Shallow, steady water on low ground lets reeds, shāpla, frogs and birds return.', careful: ['A dry wetland withers. Keep a little water flowing in.'] },
      { title: 'Floating gardens (ধাপ)', text: 'Floating beds of plants are a real farming heritage of Bangladesh’s waterlogged south. They rise and fall with the water.' },
    ],
  },
  {
    id: 'lift-water',
    num: 9,
    title: 'Lift the Water',
    bn: 'পানি তোলো',
    intro: 'This paddy sits on a high terrace. Water cannot climb on its own.',
    tools: ['canal', 'gate', 'field', 'reservoir', 'turbine', 'battery', 'treatment', 'connector', 'fishpond', 'wetland', 'floating', 'pump'],
    newTools: ['pump'],
    build: mapLiftWater,
    ordered: true,
    par: { materials: 45, seconds: 120 },
    xp: 100,
    hud: hudUpTo(9),
    objectives: [
      {
        id: 'pump',
        icon: 'pump',
        text: 'Place a pump between the stream and the terrace',
        hint: 'It takes water from behind and pushes it forward.',
        check: (s) => has(s, 'pump'),
        coach: { tool: 'pump', cells: [{ x: 9, y: 5 }] },
      },
      {
        id: 'lift',
        icon: 'pump',
        text: 'Turn the pump to face the terrace',
        hint: 'Inspect the pump and press Rotate until water rises.',
        check: (s) => s.buildings.some((b) => b.type === 'pump' && b.active && b.head > 0),
        coach: { tool: 'inspect' },
      },
      {
        id: 'drink',
        icon: 'field',
        text: 'Dig a canal on the terrace to the paddy',
        check: fieldWet,
        progress: drinkProgress,
        coach: {
          tool: 'canal',
          path: [
            { x: 9, y: 4 },
            { x: 9, y: 3 },
            { x: 9, y: 2 },
          ],
        },
      },
    ],
    journal: [
      {
        title: 'Pumps',
        text: 'A pump uses electricity to move water from the tile behind it to the tile it faces, even uphill.',
        careful: ['Lifting water always costs more energy than a wheel could win back from it.'],
      },
    ],
  },
  {
    id: 'village',
    num: 10,
    title: 'The Village',
    bn: 'গ্রাম',
    intro: 'Everything you have learned, together. Bring the whole village to bloom.',
    tools: CAMPAIGN_TOOLS,
    newTools: [],
    build: () => mapVillage(CONFIG.progression.startMaterials, CONFIG.progression.freeCanals),
    ordered: false,
    par: { materials: 400, seconds: 1500 },
    xp: 200,
    hud: hudUpTo(10),
    objectives: [
      {
        id: 'rice',
        icon: 'field',
        text: 'Harvest rice from the village paddy',
        hint: 'The spring is at the top left. The paddy is in the middle.',
        check: (s) => s.stats.harvestRice >= 1,
        coach: {
          path: [
            { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 },
            { x: 5, y: 4 }, { x: 6, y: 4 }, { x: 7, y: 4 }, { x: 7, y: 5 },
          ],
        },
      },
      {
        id: 'store',
        icon: 'reservoir',
        text: 'Fill a reservoir to 75%',
        hint: 'The east basin is shaped for one.',
        check: (s) => maxWater(s, 'reservoir') >= CONFIG.reservoir.capacity * 0.75,
        progress: (s) => ({ value: Math.min(maxWater(s, 'reservoir'), CONFIG.reservoir.capacity * 0.75), goal: CONFIG.reservoir.capacity * 0.75 }),
        coach: { zone: { x: 17, y: 3, w: 5, h: 5 } },
      },
      {
        id: 'light',
        icon: 'house',
        text: 'Light a home with waterwheel power',
        hint: 'The stream drops two steps on the east edge.',
        check: (s) => s.buildings.some((b) => b.type === 'house' && b.lit),
      },
      {
        id: 'clean',
        icon: 'treatment',
        text: 'Bring clean drinking water to a home',
        check: (s) => s.buildings.some((b) => b.type === 'house' && b.supplied),
      },
      {
        id: 'fish',
        icon: 'fishpond',
        text: 'Keep a stocked, fresh fish pond',
        hint: 'The lower basin, below the reservoir, suits a pond.',
        check: (s) =>
          s.buildings.some((b) => b.type === 'fishpond' && b.stocked && b.water >= CONFIG.fishpond.minFill && b.quality >= CONFIG.fishpond.minQuality),
      },
      {
        id: 'wetland',
        icon: 'wetland',
        text: 'Grow a thriving wetland in the south marsh',
        check: (s) => maxProgress(s, 'wetland') >= CONFIG.wetland.thriveEcology,
      },
      {
        id: 'bloom',
        icon: 'star',
        text: 'Keep it all alive together for 10 seconds',
        hint: 'Farm, fish, a lit home with clean water, and the wetland.',
        final: true,
        check: isVillageInBloom,
        sustainTicks: 100,
        progress: (s) => ({ value: sustained(s, 'bloom'), goal: 100 }),
      },
    ],
    journal: [
      {
        title: 'Village in Bloom',
        text: 'The village blooms when rice, fish, a lit home with clean water, treatment and a thriving wetland all work at once.',
        careful: ['Every building only works when it is really connected. Inspect shows what is missing.'],
      },
    ],
  },
];

export const SANDBOX: LevelDef = {
  id: 'sandbox',
  num: 0,
  title: 'Open Village',
  bn: 'মুক্ত গ্রাম',
  intro: 'No goals, plenty of materials. Build the village you imagine.',
  tools: [...CAMPAIGN_TOOLS, 'fountain', 'bridge'],
  newTools: ['fountain', 'bridge'],
  build: () => mapVillage(400, 30),
  ordered: false,
  par: { materials: 0, seconds: 0 },
  xp: 0,
  hud: hudUpTo(10),
  objectives: [],
  journal: [
    { title: 'Fountains', text: 'A powered fountain beside a fish pond aerates it, keeping the water fresher.' },
    { title: 'Bamboo bridges (সাঁকো)', text: 'A sanko is a bamboo footbridge over a canal. Purely for beauty.' },
  ],
};

const ALL_LEVELS: LevelDef[] = [...LEVELS, SANDBOX];
const BY_ID = new Map<LevelId, LevelDef>(ALL_LEVELS.map((l) => [l.id, l]));

export const LEVEL_ORDER: LevelId[] = LEVELS.map((l) => l.id);
export const ALL_TOOLS: ToolId[] = ['inspect', 'canal', 'erase', ...SANDBOX.tools];

export function isLevelId(v: unknown): v is LevelId {
  return typeof v === 'string' && BY_ID.has(v as LevelId);
}

export function getLevel(id: LevelId): LevelDef {
  return BY_ID.get(id) ?? LEVELS[0];
}

export function nextLevel(id: LevelId): LevelId | null {
  const i = LEVEL_ORDER.indexOf(id);
  if (i < 0) return null;
  return i < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[i + 1] : 'sandbox';
}

/** Ids of objectives that must latch to finish the level (all of them). */
export function requiredObjectives(level: LevelDef): string[] {
  return level.objectives.map((o) => o.id);
}
