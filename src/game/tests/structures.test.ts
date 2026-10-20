import { describe, expect, it } from 'vitest';
import { CONFIG } from '../model/config';
import { validatePlacement } from '../model/buildings';
import { createBuilding, createInitialState, idx, stampBuilding } from '../model/world';
import type { GameState } from '../model/types';
import { stepGame, massTolerance } from '../sim/tick';
import { turbinePower } from '../sim/power';
import { totalWater } from '../sim/water';
import { allFinite, makeSandbox } from './helpers';

function place(s: GameState, type: Parameters<typeof createBuilding>[1], x: number, y: number) {
  const b = createBuilding(s.nextBuildingId++, type, x, y);
  s.buildings.push(b);
  stampBuilding(s.grid, b);
  return b;
}

function cleanTotal(s: GameState) {
  return s.buildings.reduce((a, b) => a + b.clean, 0);
}

describe('turbine', () => {
  it('produces exactly zero with zero flow or zero head', () => {
    expect(turbinePower(0, 3)).toBe(0);
    expect(turbinePower(5, 0)).toBe(0);
    expect(turbinePower(5, 2)).toBeGreaterThan(0);
  });

  it('generates only while water moves through a drop, and passes water downstream', () => {
    // Channel: elev 3 for x<4, elev 1 for x>=4. Turbine at x=3 (drop to x=4).
    const s = makeSandbox(10, 3, (x) => (x < 4 ? 3 : 1), (x, y) => (y === 1 ? 'soil' : 'rock'));
    const g = s.grid;
    for (let x = 0; x < 10; x++) g.canal[idx(g, x, 1)] = 1;
    const t = place(s, 'turbine', 3, 1);
    place(s, 'battery', 0, 0);
    g.terrain[idx(g, 0, 0)] = 'soil';
    const before = totalWater(s);
    g.water[idx(g, 0, 1)] = 20;
    g.water[idx(g, 1, 1)] = 20;
    const start = before + 40;
    let maxPower = 0;
    for (let k = 0; k < 40; k++) {
      stepGame(s);
      maxPower = Math.max(maxPower, t.rate);
    }
    expect(maxPower).toBeGreaterThan(0);
    expect(s.resources.energy).toBeGreaterThan(0);
    // Water is passed, not consumed.
    expect(Math.abs(totalWater(s) - start)).toBeLessThan(massTolerance(start));
    let downstream = 0;
    for (let x = 4; x < 10; x++) downstream += g.water[idx(g, x, 1)];
    expect(downstream).toBeGreaterThan(1);
    // Stop the flow: all water drained; power returns to zero.
    for (let k = 0; k < 2000; k++) stepGame(s);
    expect(t.rate).toBe(0);
  });

  it('no power on a flat canal even with flow', () => {
    const s = makeSandbox(10, 3, () => 2, (x, y) => (y === 1 ? 'soil' : 'rock'));
    const g = s.grid;
    for (let x = 0; x < 10; x++) g.canal[idx(g, x, 1)] = 1;
    const t = place(s, 'turbine', 4, 1);
    g.water[idx(g, 0, 1)] = 20;
    let maxPower = 0;
    for (let k = 0; k < 200; k++) {
      stepGame(s);
      maxPower = Math.max(maxPower, t.rate);
    }
    expect(maxPower).toBe(0);
  });

  it('placement requires an elevation drop', () => {
    const s = makeSandbox(6, 3, () => 2);
    const g = s.grid;
    for (let x = 0; x < 6; x++) g.canal[idx(g, x, 1)] = 1;
    expect(validatePlacement(s, 'turbine', 2, 1).ok).toBe(false);
    g.elevation[idx(g, 3, 1)] = 1;
    expect(validatePlacement(s, 'turbine', 2, 1).ok).toBe(true);
  });
});

describe('treatment and homes', () => {
  function plantSetup(withPower: boolean) {
    const s = makeSandbox(8, 6, () => 2);
    const g = s.grid;
    s.flags.sinks = true;
    const plant = place(s, 'treatment', 2, 2);
    // Raw water next to the plant.
    for (let y = 0; y < 6; y++) g.canal[idx(g, 1, y)] = 1;
    for (let y = 0; y < 6; y++) g.water[idx(g, 1, y)] = 15;
    if (withPower) {
      place(s, 'battery', 6, 0);
      s.resources.energy = 100;
    }
    return { s, plant };
  }

  it('cannot output clean water without power', () => {
    const { s, plant } = plantSetup(false);
    for (let k = 0; k < 100; k++) stepGame(s);
    expect(plant.clean).toBe(0);
    expect(plant.status).toBe('treatNoPower');
    expect(plant.water).toBeGreaterThan(0);
  });

  it('cannot output clean water without raw input', () => {
    const s = makeSandbox(8, 6, () => 2);
    const plant = place(s, 'treatment', 2, 2);
    place(s, 'battery', 6, 0);
    s.resources.energy = 100;
    for (let k = 0; k < 100; k++) stepGame(s);
    expect(plant.clean).toBe(0);
    expect(s.resources.energy).toBe(100);
  });

  it('converts raw water + energy into clean water (efficiency <= 1), and stops when power is cut', () => {
    const { s, plant } = plantSetup(true);
    const e0 = s.resources.energy;
    for (let k = 0; k < 30; k++) stepGame(s);
    expect(plant.clean).toBeGreaterThan(0);
    expect(s.resources.energy).toBeLessThan(e0);
    s.resources.energy = 0;
    stepGame(s);
    const c = plant.clean;
    for (let k = 0; k < 30; k++) stepGame(s);
    expect(plant.clean).toBe(c);
  });

  it('clean water never increases without treatment inflow', () => {
    const s = createInitialState(1);
    let prev = cleanTotal(s);
    for (let k = 0; k < 500; k++) {
      stepGame(s);
      const now = cleanTotal(s);
      expect(now).toBeLessThanOrEqual(prev + 1e-12);
      prev = now;
    }
  });

  it('a home pot rides out a short gap in clean water, then runs dry', () => {
    const s = makeSandbox(8, 6, () => 2);
    s.flags.sinks = true;
    const house = place(s, 'house', 5, 4);
    place(s, 'connector', 4, 4);
    const plant = place(s, 'treatment', 0, 0);
    plant.clean = CONFIG.house.potCap;
    for (let k = 0; k < 20; k++) stepGame(s);
    expect(plant.clean).toBe(0);
    let suppliedTicks = 0;
    for (let k = 0; k < 200; k++) {
      stepGame(s);
      if (house.supplied) suppliedTicks++;
    }
    expect(suppliedTicks).toBeGreaterThan(20);
    expect(house.supplied).toBe(false);
  });

  it('homes need a tap and clean water; raw water alone cannot supply them', () => {
    const s = makeSandbox(8, 6, () => 2);
    s.flags.sinks = true;
    const g = s.grid;
    const house = place(s, 'house', 5, 4);
    place(s, 'connector', 4, 4);
    // Lots of raw water right beside the house.
    for (let y = 0; y < 6; y++) {
      g.canal[idx(g, 6, y)] = 1;
      g.water[idx(g, 6, y)] = 15;
    }
    for (let k = 0; k < 50; k++) stepGame(s);
    expect(house.supplied).toBe(false);
    const plant = place(s, 'treatment', 0, 0);
    plant.clean = 5;
    stepGame(s);
    expect(house.supplied).toBe(true);
    // Clean water moved into the home's pot; only what the home drank left the system.
    expect(plant.clean).toBeCloseTo(5 - CONFIG.house.refillPerTick, 9);
    expect(plant.clean + house.water).toBeCloseTo(5 - CONFIG.house.cleanPerTick, 9);
  });

  it('home lights need a battery with charge', () => {
    const s = makeSandbox(6, 4, () => 2);
    const house = place(s, 'house', 2, 2);
    s.resources.energy = 5;
    stepGame(s);
    expect(house.lit).toBe(false);
    place(s, 'battery', 0, 0);
    stepGame(s);
    expect(house.lit).toBe(true);
  });
});

describe('fields', () => {
  it('crop cannot advance without wet supply', () => {
    const s = makeSandbox(6, 6, () => 2);
    s.flags.sinks = true;
    const f = place(s, 'field', 2, 2);
    for (let k = 0; k < 1000; k++) stepGame(s);
    expect(f.progress).toBe(0);
  });

  it('grows when irrigated, pauses (not resets) in drought', () => {
    const s = makeSandbox(6, 6, () => 2);
    s.flags.sinks = true;
    const g = s.grid;
    const f = place(s, 'field', 2, 2);
    for (let y = 0; y < 6; y++) g.canal[idx(g, 1, y)] = 1;
    for (let k = 0; k < 400; k++) {
      for (let y = 0; y < 6; y++) g.water[idx(g, 1, y)] = 10;
      stepGame(s);
    }
    expect(f.progress).toBeGreaterThan(CONFIG.field.ticksPerStage);
    for (let y = 0; y < 6; y++) g.water[idx(g, 1, y)] = 0;
    for (let y = 0; y < 6; y++) g.canal[idx(g, 1, y)] = 0;
    for (let k = 0; k < 2000; k++) stepGame(s);
    const p = f.progress;
    expect(p).toBeGreaterThan(CONFIG.field.ticksPerStage);
    for (let k = 0; k < 200; k++) stepGame(s);
    expect(f.progress).toBe(p);
  });
});

describe('reservoir', () => {
  it('fills to a finite capacity and overflows downstream', () => {
    const s = makeSandbox(9, 7, (x, y) => (x >= 3 && x <= 5 && y >= 2 && y <= 4 ? 2 : 3));
    s.flags.rain = true;
    s.weather = { mode: 'heavy', remaining: 1e9, duration: 1e9 };
    const g = s.grid;
    g.terrain[idx(g, 0, 3)] = 'source';
    const r = place(s, 'reservoir', 3, 2);
    for (let x = 0; x < 3; x++) g.canal[idx(g, x, 3)] = 1;
    for (let x = 6; x < 9; x++) g.canal[idx(g, x, 3)] = 1;
    g.elevation[idx(g, 8, 3)] = 0;
    g.terrain[idx(g, 8, 3)] = 'outlet';
    s.flags.sinks = true;
    let maxFill = 0;
    let discharged = 0;
    for (let k = 0; k < 4000; k++) {
      const res = stepGame(s);
      maxFill = Math.max(maxFill, r.water);
      discharged += s.ledger.discharged;
      expect(Math.abs(res.residual)).toBeLessThan(massTolerance(s.ledger.total));
    }
    expect(maxFill).toBeLessThanOrEqual(CONFIG.reservoir.capacity + 1e-9);
    expect(maxFill).toBeGreaterThan(CONFIG.reservoir.capacity * 0.75);
    expect(discharged).toBeGreaterThan(0);
    expect(allFinite(s)).toBe(true);
  });
});

describe('pump', () => {
  it('needs power and input water; conserves water and spends energy', () => {
    const s = makeSandbox(5, 3, (x) => (x === 4 ? 4 : 1), () => 'soil');
    const g = s.grid;
    const p = place(s, 'pump', 2, 1);
    p.dir = 1; // faces east: inlet (1,1), outlet (3,1)
    g.elevation[idx(g, 3, 1)] = 3;
    g.water[idx(g, 1, 1)] = 10;
    const start = totalWater(s);
    stepGame(s);
    expect(p.flow).toBe(0);
    expect(p.status).toBe('pumpNoPower');
    place(s, 'battery', 0, 0);
    s.resources.energy = 50;
    stepGame(s);
    expect(p.flow).toBeGreaterThan(0);
    expect(s.resources.energy).toBeLessThan(50);
    expect(Math.abs(totalWater(s) - start)).toBeLessThan(massTolerance(start));
    // Energy spent >= base cost per volume (lift adds more).
    expect(50 - s.resources.energy).toBeGreaterThanOrEqual(p.flow * CONFIG.pump.energyPerVolume - 1e-9);
    // Dry intake: no output.
    g.water[idx(g, 1, 1)] = 0;
    g.saturation[idx(g, 1, 1)] = 0;
    stepGame(s);
    expect(p.flow).toBe(0);
  });
});

describe('pipes and aeration', () => {
  it('a tap only reaches treatment plants within the pipe range', () => {
    const s = makeSandbox(30, 4, () => 2);
    s.flags.sinks = true;
    const house = place(s, 'house', 1, 1);
    place(s, 'connector', 2, 1);
    const far = place(s, 'treatment', 2 + CONFIG.connector.pipeRange + 2, 1);
    far.clean = 10;
    stepGame(s);
    expect(house.supplied).toBe(false);
    expect(house.status).toBe('tooFar');
    expect(far.clean).toBe(10);
    const near = place(s, 'treatment', 4, 1);
    near.clean = 5;
    stepGame(s);
    expect(house.supplied).toBe(true);
    expect(near.clean + house.water).toBeCloseTo(5 - CONFIG.house.cleanPerTick, 9);
    expect(far.clean).toBe(10);
  });

  it('a running fountain beside a still pond keeps it fresher', () => {
    const run = (withFountain: boolean) => {
      const s = makeSandbox(8, 6, () => 2);
      const pond = place(s, 'fishpond', 1, 1);
      pond.water = 100;
      pond.quality = 0.4;
      if (withFountain) {
        place(s, 'fountain', 4, 2);
        place(s, 'battery', 6, 5);
        s.resources.energy = 100;
      }
      for (let k = 0; k < 400; k++) stepGame(s);
      return pond.quality;
    };
    const still = run(false);
    const aerated = run(true);
    expect(still).toBeLessThan(CONFIG.fishpond.minQuality);
    expect(aerated).toBeGreaterThan(CONFIG.fishpond.minQuality);
  });
});
