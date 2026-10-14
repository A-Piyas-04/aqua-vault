import { describe, expect, it } from 'vitest';
import { CONFIG } from '../model/config';
import { createInitialState, idx } from '../model/world';
import { GATE_CLOSED } from '../model/types';
import { stepGame, massTolerance } from '../sim/tick';
import { computeTileFlags, stepFlux, totalWater } from '../sim/water';
import { allFinite, clone, makeSandbox } from './helpers';

describe('water conservation', () => {
  it('conserves total water with rain and sinks disabled', () => {
    const s = makeSandbox(10, 6, (x) => 4 - Math.floor(x / 3));
    const g = s.grid;
    for (let x = 0; x < 10; x++) g.canal[idx(g, x, 2)] = 1;
    g.water[idx(g, 0, 2)] = 18;
    g.water[idx(g, 5, 4)] = 7;
    const start = totalWater(s);
    for (let t = 0; t < 500; t++) stepGame(s);
    expect(Math.abs(totalWater(s) - start)).toBeLessThan(massTolerance(start));
    expect(allFinite(s)).toBe(true);
  });

  it('balances the per-tick ledger in the full starter world with rain and sinks', () => {
    const s = createInitialState(7);
    const g = s.grid;
    const path = [[2, 3], [3, 3], [4, 3], [5, 3], [5, 4], [6, 4], [7, 4], [7, 5]];
    stepGame(s, [{ type: 'drawCanal', cells: path.map(([x, y]) => idx(g, x, y)) }]);
    for (let t = 0; t < 2000; t++) {
      const r = stepGame(s);
      expect(Math.abs(r.residual)).toBeLessThan(massTolerance(s.ledger.total));
    }
    expect(allFinite(s)).toBe(true);
  });

  it('never lets flux exceed available water or go negative', () => {
    const s = makeSandbox(5, 5, (x, y) => (x === 2 && y === 2 ? 6 : 0));
    const g = s.grid;
    const c = idx(g, 2, 2);
    g.water[c] = 0.5;
    const flags = computeTileFlags(s);
    const report = stepFlux(s, flags);
    expect(report.tileOut[c]).toBeLessThanOrEqual(0.5 + 1e-12);
    expect(g.water[c]).toBeGreaterThanOrEqual(0);
    expect(allFinite(s)).toBe(true);
  });

  it('keeps cells within capacity and finite under extreme rain', () => {
    const s = createInitialState(3);
    s.flags.rain = true;
    s.weather = { mode: 'heavy', remaining: 1e9, duration: 1e9 };
    const g = s.grid;
    const cells: number[] = [];
    for (let x = 2; x < 20; x++) cells.push(idx(g, x, 3));
    stepGame(s, [{ type: 'drawCanal', cells }]);
    for (let t = 0; t < 3000; t++) {
      // Simulate a pathological storm by over-filling sources directly.
      for (let i = 0; i < g.terrain.length; i++) if (g.terrain[i] === 'source') g.water[i] = CONFIG.water.maxCellWater;
      stepGame(s);
    }
    expect(allFinite(s)).toBe(true);
    expect(Math.max(...g.water)).toBeLessThanOrEqual(CONFIG.water.maxCellWater + 1e-9);
  });
});

describe('routing', () => {
  it('a closed gate stops flow through a canal', () => {
    const s = makeSandbox(8, 3, () => 2, (x, y) => (y === 1 ? 'soil' : 'rock'));
    const g = s.grid;
    for (let x = 0; x < 8; x++) g.canal[idx(g, x, 1)] = 1;
    g.gate[idx(g, 3, 1)] = GATE_CLOSED;
    g.water[idx(g, 0, 1)] = 15;
    for (let t = 0; t < 400; t++) stepGame(s);
    for (let x = 4; x < 8; x++) expect(g.water[idx(g, x, 1)]).toBe(0);
    expect(g.water[idx(g, 0, 1)] + g.water[idx(g, 1, 1)] + g.water[idx(g, 2, 1)] + g.water[idx(g, 3, 1)]).toBeCloseTo(15, 6);
  });

  it('opening the gate restores flow', () => {
    const s = makeSandbox(8, 3, () => 2, (x, y) => (y === 1 ? 'soil' : 'rock'));
    const g = s.grid;
    for (let x = 0; x < 8; x++) g.canal[idx(g, x, 1)] = 1;
    g.gate[idx(g, 3, 1)] = GATE_CLOSED;
    g.water[idx(g, 0, 1)] = 15;
    for (let t = 0; t < 50; t++) stepGame(s);
    stepGame(s, [{ type: 'toggleGate', cell: idx(g, 3, 1) }]);
    for (let t = 0; t < 300; t++) stepGame(s);
    expect(g.water[idx(g, 7, 1)]).toBeGreaterThan(0.5);
  });

  it('water flows downhill along a canal much faster than over soil', () => {
    const mk = (canal: boolean) => {
      const s = makeSandbox(10, 3, (x) => 9 - x, (x, y) => (y === 1 ? 'soil' : 'rock'));
      const g = s.grid;
      if (canal) for (let x = 0; x < 10; x++) g.canal[idx(g, x, 1)] = 1;
      g.water[idx(g, 0, 1)] = 10;
      for (let t = 0; t < 30; t++) stepGame(s);
      return g.water[idx(g, 9, 1)];
    };
    expect(mk(true)).toBeGreaterThan(mk(false) + 1);
  });

  it('erasing a canal link stops downstream delivery; reconnecting restores it', () => {
    const s = createInitialState(11);
    const g = s.grid;
    const path = [[2, 3], [3, 3], [4, 3], [5, 3], [5, 4], [6, 4], [7, 4], [7, 5]].map(([x, y]) => idx(g, x, y));
    stepGame(s, [{ type: 'drawCanal', cells: path }]);
    for (let t = 0; t < 300; t++) stepGame(s);
    const field = s.buildings.find((b) => b.type === 'field')!;
    expect(field.flow + field.water).toBeGreaterThan(1);
    stepGame(s, [{ type: 'erase', cells: [idx(g, 5, 4)] }]);
    for (let t = 0; t < 200; t++) stepGame(s);
    expect(g.water[idx(g, 7, 5)]).toBeLessThan(0.2);
    stepGame(s, [{ type: 'drawCanal', cells: [idx(g, 5, 4)] }]);
    for (let t = 0; t < 200; t++) stepGame(s);
    expect(g.water[idx(g, 7, 5)]).toBeGreaterThan(0.3);
  });
});

describe('determinism', () => {
  it('same seed + commands yields identical state', () => {
    const run = () => {
      const s = createInitialState(99);
      const g = s.grid;
      for (let t = 0; t < 6000; t++) {
        const cmds = t === 5 ? [{ type: 'drawCanal' as const, cells: [idx(g, 2, 3), idx(g, 3, 3), idx(g, 4, 3)] }] : [];
        stepGame(s, cmds);
      }
      return s;
    };
    const a = run();
    const b = run();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.rngState).toBe(b.rngState);
  });

  it('seeded weather evolves through several modes', () => {
    const s = createInitialState(5);
    const seen = new Set<string>();
    for (let t = 0; t < 20000; t++) {
      stepGame(s);
      seen.add(s.weather.mode);
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
    const copy = clone(s);
    expect(copy.weather).toEqual(s.weather);
  });
});
