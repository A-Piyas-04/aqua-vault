export type Terrain =
  | 'soil'
  | 'rock'
  | 'source'
  | 'river'
  | 'outlet'
  | 'basin'
  | 'marsh'
  | 'foundation'
  | 'path';

export type BuildingType =
  | 'field'
  | 'reservoir'
  | 'turbine'
  | 'battery'
  | 'treatment'
  | 'connector'
  | 'fishpond'
  | 'wetland'
  | 'floating'
  | 'pump'
  | 'house'
  | 'fountain';

export type ToolId =
  | 'inspect'
  | 'canal'
  | 'erase'
  | 'gate'
  | 'bridge'
  | BuildingTypePlaceable;

export type BuildingTypePlaceable = Exclude<BuildingType, 'house'>;

export type WeatherMode = 'drizzle' | 'rain' | 'heavy' | 'dry';

export const GATE_NONE = 0;
export const GATE_OPEN = 1;
export const GATE_CLOSED = 2;

export interface Grid {
  w: number;
  h: number;
  terrain: Terrain[];
  elevation: number[];
  /** Small authored bed offset (<= 0) tilting flat stream runs; flux heads only. */
  bed: number[];
  /** 1 when a canal is dug on the tile. */
  canal: number[];
  /** GATE_NONE / GATE_OPEN / GATE_CLOSED. Gates only exist on canals. */
  gate: number[];
  /** Decorative bamboo footbridge (sanko) over a canal. */
  bridge: number[];
  /** Free surface water volume on the tile (game units). */
  water: number[];
  /** Soil moisture fraction 0..1; volume = saturation * SATURATION_CAPACITY. */
  saturation: number[];
  /** Net flow vector of the last tick, for rendering only. */
  flowX: number[];
  flowY: number[];
  /** Building id occupying the tile, or -1. */
  structure: number[];
}

export interface Building {
  id: number;
  type: BuildingType;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Built into the starter world; cannot be erased. */
  builtin: boolean;
  /** Stored water: reservoir/pond/wetland level, field moisture, treatment raw buffer. */
  water: number;
  /** Treatment plant protected clean-water tank. */
  clean: number;
  /** Crop wet ticks, fish growth, wetland ecology, floating garden growth (type dependent). */
  progress: number;
  stocked: boolean;
  /** Fish pond ecological water-quality score 0..1 (not potable quality). */
  quality: number;
  /** Smoothed recent inflow per tick (pond quality, diagnostics). */
  inflowAvg: number;
  /** Pump direction 0=N 1=E 2=S 3=W. */
  dir: number;
  /** Floating garden host building id. */
  hostId: number;
  /** Per-tick derived output (turbine power, clean production, pump moved volume...). */
  rate: number;
  /** Per-tick derived throughput (turbine water flow, consumed clean water...). */
  flow: number;
  /** Head used by the turbine during the last tick. */
  head: number;
  active: boolean;
  /** Diagnostic key into strings (e.g. 'needsFlow'), '' when fine. */
  status: string;
  /** Lights on (houses). */
  lit: boolean;
  /** Clean water supply satisfied this tick (houses). */
  supplied: boolean;
}

export interface Weather {
  mode: WeatherMode;
  /** Ticks remaining in current mode. */
  remaining: number;
  /** Total duration of the current mode in ticks. */
  duration: number;
}

export interface Resources {
  materials: number;
  xp: number;
  /** Electricity stored in the battery bank (game units). */
  energy: number;
  /** Remaining free starter canal segments. */
  freeCanals: number;
}

export interface Ledger {
  rainAdded: number;
  evaporation: number;
  cropUptake: number;
  householdUse: number;
  discharged: number;
  treatmentLoss: number;
  spill: number;
  /** Total water volume after the tick. */
  total: number;
  energyGenerated: number;
  energyUsed: number;
}

export type HistoryEntry =
  | { kind: 'canal'; cells: number[]; paid: number; freeUsed: number; stroke?: number }
  | { kind: 'eraseCanal'; cells: { i: number; gate: number; bridge: number }[]; refund: number; stroke?: number }
  | { kind: 'place'; buildingId: number; paid: number }
  | { kind: 'eraseBuilding'; building: Building; refund: number }
  | { kind: 'gate'; cell: number; paid: number }
  | { kind: 'bridge'; cell: number; paid: number };

export interface Settings {
  sound: boolean;
  reducedMotion: boolean;
  speed: 1 | 2;
  tutorialDone: boolean;
}

export interface GameState {
  version: number;
  seed: number;
  rngState: number;
  tick: number;
  grid: Grid;
  buildings: Building[];
  nextBuildingId: number;
  resources: Resources;
  achievements: string[];
  weather: Weather;
  ledger: Ledger;
  history: HistoryEntry[];
  /** Tick of the last repeatable harvest XP grant (anti-exploit cooldown). */
  lastHarvestXpTick: number;
  /** Ticks since materials regen (anti-softlock). */
  regenTimer: number;
  /** Tick of last successful treatment output, for bloom checks. */
  lastCleanTick: number;
  settings: Settings;
  /** Sandbox options for tests / dev; persisted. */
  flags: { rain: boolean; sinks: boolean };
}

export type Command =
  | { type: 'drawCanal'; cells: number[]; stroke?: number }
  | { type: 'erase'; cells: number[]; stroke?: number; includeBuildings?: boolean }
  | { type: 'place'; building: BuildingTypePlaceable; x: number; y: number }
  | { type: 'gate'; cell: number }
  | { type: 'toggleGate'; cell: number }
  | { type: 'bridge'; cell: number }
  | { type: 'harvest'; buildingId: number }
  | { type: 'stock'; buildingId: number }
  | { type: 'rotate'; buildingId: number }
  | { type: 'undo' };

export type GameEvent =
  | { type: 'achievement'; id: string; xp: number; materials: number }
  | { type: 'levelUp'; level: number }
  | { type: 'error'; message: string; cell?: number }
  | { type: 'built'; what: string; cell: number }
  | { type: 'erased'; cell: number }
  | { type: 'harvest'; buildingId: number; materials: number; xp: number }
  | { type: 'stocked'; buildingId: number }
  | { type: 'undo'; ok: boolean };
