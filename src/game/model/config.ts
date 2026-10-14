import type { BuildingTypePlaceable, WeatherMode } from './types';

/**
 * Every tunable number lives here (game units, not real-world units).
 * See docs/13_BALANCING_DATA.md.
 */
export const CONFIG = {
  saveVersion: 2,
  grid: { w: 28, h: 18 },
  dt: 0.1,
  ticksPerSecond: 10,
  /** Max catch-up ticks per animation frame. */
  maxCatchUpTicks: 5,

  water: {
    /** Water volume that raises a tile's surface by one elevation step. */
    cellCapacity: 20,
    /** Hard cap on free surface water per tile. */
    maxCellWater: 20,
    /** Flux sub-steps per tick; conductances below are per sub-step. Keep 4*c < 1 for stability. */
    substeps: 4,
    conductance: {
      channel: 0.2,
      soil: 0.01,
      building: 0.15,
      buildingSoil: 0.02,
    },
    /** Canal / stream banks: water spills onto neighbouring soil only above this depth (in elevation steps). */
    bankHeight: 0.6,
    /** Authored micro-tilt across each flat run of the natural stream (elevation steps). */
    streamRunTilt: 0.45,
    saturationCapacity: 2,
    infiltrationPerTick: 0.08,
    /** Doc starting value was 0.01; halved so the stream is not mostly lost to evaporation. */
    evaporationPerTick: 0.005,
    soilEvaporationPerTick: 0.002,
    dryEvaporationMultiplier: 1.6,
    outletDischargeFraction: 0.5,
    /** Minimum water on a tile to count as "wet" for visuals and diagnostics. */
    wetThreshold: 0.05,
  },

  rain: {
    perTick: { dry: 0, drizzle: 1, rain: 2, heavy: 4 } as Record<WeatherMode, number>,
  },

  weather: {
    minTicks: 900,
    maxTicks: 1800,
    dryMinTicks: 500,
    dryMaxTicks: 900,
    /** Weighted odds for the next phase (dry never follows dry). */
    weights: { drizzle: 3, rain: 4, heavy: 2, dry: 2 } as Record<WeatherMode, number>,
    dayLengthTicks: 2400,
  },

  field: {
    moistureCap: 40,
    intakePerNeighbor: 0.8,
    intakeFraction: 0.3,
    uptakePerTick: 0.06,
    evaporationPerTick: 0.01,
    wetMoisture: 8,
    ticksPerStage: 150,
    harvestMaterials: 15,
  },

  /** depth = elevation steps the stored surface rises from empty to full. */
  reservoir: { capacity: 220, depth: 1.25, evaporationPerTick: 0.01 },
  fishpond: {
    capacity: 140,
    depth: 1.25,
    evaporationPerTick: 0.01,
    minFill: 65,
    stockCost: 10,
    growthPerTick: 1 / 1500,
    minQuality: 0.45,
    harvestMaterials: 20,
  },
  wetland: {
    capacity: 30,
    depth: 0.5,
    evaporationPerTick: 0.02,
    thriveLevel: 6,
    ecologyGainPerTick: 1 / 600,
    ecologyLossPerTick: 1 / 1800,
    thriveEcology: 0.7,
  },
  floating: {
    minHostFill: 0.4,
    growthPerTick: 1 / 900,
    uptakePerTick: 0.02,
    harvestMaterials: 12,
  },

  turbine: {
    efficiency: 0.8,
    k: 1,
    /** Throughput below this (per tick) yields no power: avoids trickle noise. */
    minFlow: 0.2,
    minHead: 0.5,
  },
  energy: { baseBuffer: 10, batteryCapacity: 120 },
  treatment: {
    rawCap: 20,
    cleanCap: 40,
    intakePerTick: 0.8,
    rawPerTick: 0.5,
    cleanPerTick: 0.4,
    energyPerTick: 1,
  },
  house: { cleanPerTick: 0.1, energyPerTick: 0.05 },
  pump: { maxPerTick: 1, energyPerVolume: 0.4, liftFactor: 0.5 },
  fountain: { energyPerTick: 0.1, minWater: 0.5 },

  costs: {
    canal: 1,
    gate: 3,
    bridge: 5,
    field: 12,
    reservoir: 25,
    turbine: 30,
    battery: 18,
    treatment: 40,
    connector: 15,
    fishpond: 35,
    wetland: 20,
    floating: 25,
    pump: 45,
    fountain: 20,
  } as Record<BuildingTypePlaceable | 'canal' | 'gate' | 'bridge', number>,
  eraseRefund: 0.5,

  unlockLevel: {
    canal: 1,
    gate: 1,
    field: 1,
    bridge: 2,
    reservoir: 2,
    turbine: 3,
    battery: 3,
    treatment: 4,
    connector: 4,
    fishpond: 5,
    wetland: 6,
    floating: 6,
    pump: 7,
    fountain: 7,
  } as Record<BuildingTypePlaceable | 'canal' | 'gate' | 'bridge', number>,

  footprint: {
    field: [2, 2],
    reservoir: [3, 3],
    turbine: [1, 1],
    battery: [1, 1],
    treatment: [2, 2],
    connector: [1, 1],
    fishpond: [3, 3],
    wetland: [2, 2],
    floating: [1, 1],
    pump: [1, 1],
    house: [1, 1],
    fountain: [1, 1],
  } as Record<string, [number, number]>,

  progression: {
    /**
     * Cumulative XP thresholds for Lv1..Lv7. Lv5+ tuned down from the doc starting
     * values so every unlock is reachable through one-time achievements.
     */
    levels: [0, 50, 120, 220, 330, 410, 600],
    startMaterials: 120,
    freeCanals: 10,
    repeatHarvestXp: 3,
    repeatHarvestCooldownTicks: 600,
    /** Anti-softlock: below this, materials slowly regenerate. */
    regenFloor: 20,
    regenEveryTicks: 100,
  },

  historyLimit: 30,
  autosaveMs: 15000,
} as const;

export type CostKey = keyof typeof CONFIG.costs;
