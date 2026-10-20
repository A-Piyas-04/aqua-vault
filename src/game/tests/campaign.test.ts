import { describe, expect, it } from 'vitest';
import { createInitialState, idx } from '../model/world';
import type { BuildingTypePlaceable, Command, GameEvent, GameState, LevelId } from '../model/types';
import { GATE_CLOSED } from '../model/types';
import { stepGame, massTolerance } from '../sim/tick';
import { isUnlocked } from '../model/buildings';
import { isRipe } from '../sim/consumers';
import { getLevel, LEVELS, LEVEL_ORDER, nextLevel } from '../content/campaign';
import { allFinite } from './helpers';

/** A scripted player that fails loudly on any rejected command or mass-balance drift. */
function runner(levelId: LevelId, seed = 9) {
  const s = createInitialState(seed, levelId);
  const events: GameEvent[] = [];
  const run = (cmds: Command[] = []) => {
    const r = stepGame(s, cmds);
    expect(Math.abs(r.residual)).toBeLessThan(massTolerance(s.ledger.total));
    for (const e of r.events) {
      events.push(e);
      if (e.type === 'error') throw new Error(`[${levelId}] command error at tick ${s.tick}: ${e.message}`);
    }
  };
  const until = (pred: (s: GameState) => boolean, max: number, label: string) => {
    for (let k = 0; k < max; k++) {
      if (pred(s)) return;
      run();
    }
    throw new Error(`[${levelId}] timed out waiting for ${label} at tick ${s.tick} (done: ${s.objectives.done.join(',')})`);
  };
  const at = (x: number, y: number) => idx(s.grid, x, y);
  const canal = (cells: [number, number][]) => run([{ type: 'drawCanal', cells: cells.map(([x, y]) => at(x, y)) }]);
  const place = (building: BuildingTypePlaceable, x: number, y: number) => {
    run([{ type: 'place', building, x, y }]);
    const b = s.buildings.find((q) => q.type === building && q.x === x && q.y === y);
    if (!b) throw new Error(`[${levelId}] could not place ${building} at ${x},${y}`);
    return b;
  };
  const complete = () => s.objectives.completedTick !== null;
  const harvestRipe = () => {
    for (const b of s.buildings) if (isRipe(b)) run([{ type: 'harvest', buildingId: b.id }]);
  };
  return { s, events, run, until, at, canal, place, complete, harvestRipe };
}

/** Scripted solutions, one per campaign level (the village is covered by playthrough.test.ts). */
const SOLUTIONS: Partial<Record<LevelId, (r: ReturnType<typeof runner>) => void>> = {
  'first-canal': (r) => {
    r.canal([[2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [8, 3]]);
    r.until(r.complete, 3000, 'complete');
  },
  downhill: (r) => {
    r.canal([[2, 3], [2, 4], [2, 5], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [8, 5], [8, 4], [8, 3], [8, 2]]);
    r.until(r.complete, 4000, 'complete');
  },
  'gates-harvest': (r) => {
    r.run([{ type: 'gate', cell: r.at(4, 4) }]);
    r.run([{ type: 'toggleGate', cell: r.at(4, 4) }]);
    expect(r.s.grid.gate[r.at(4, 4)]).toBe(GATE_CLOSED);
    const right = r.s.buildings.find((b) => b.type === 'field' && b.x === 9)!;
    r.until(() => isRipe(right), 3000, 'ripe');
    r.run([{ type: 'harvest', buildingId: right.id }]);
    r.until(r.complete, 50, 'complete');
  },
  'save-rain': (r) => {
    r.place('reservoir', 6, 4);
    r.canal([[7, 2], [7, 3]]);
    r.until(r.complete, 6000, 'complete');
  },
  'wheel-light': (r) => {
    r.place('turbine', 5, 3);
    r.until((s) => s.objectives.done.includes('spin'), 3000, 'wheel spins');
    r.place('battery', 4, 6);
    r.until(r.complete, 4000, 'complete');
  },
  'clean-water': (r) => {
    r.place('treatment', 9, 3);
    r.until((s) => s.objectives.done.includes('clean'), 3000, 'clean water');
    r.place('connector', 10, 6);
    r.until(r.complete, 3000, 'complete');
  },
  'fish-pond': (r) => {
    r.place('fishpond', 6, 4);
    r.canal([[7, 2], [7, 3]]);
    r.canal([[7, 7], [7, 8]]);
    r.until((s) => s.objectives.done.includes('fill'), 3000, 'pond filled');
    const pond = r.s.buildings.find((b) => b.type === 'fishpond')!;
    r.run([{ type: 'stock', buildingId: pond.id }]);
    r.until(() => isRipe(pond), 3000, 'fish grown');
    r.run([{ type: 'harvest', buildingId: pond.id }]);
    r.until(r.complete, 50, 'complete');
  },
  'wetland-garden': (r) => {
    r.place('wetland', 6, 6);
    r.canal([[6, 2], [6, 3], [6, 4], [6, 5]]);
    r.until((s) => s.objectives.done.includes('thrive'), 3000, 'wetland thrives');
    const garden = r.place('floating', 6, 6);
    r.until(() => isRipe(garden), 3000, 'garden grown');
    r.run([{ type: 'harvest', buildingId: garden.id }]);
    r.until(r.complete, 50, 'complete');
  },
  'lift-water': (r) => {
    const pump = r.place('pump', 9, 5);
    // Default facing is east; three turns face it north, toward the terrace.
    for (let k = 0; k < 3; k++) r.run([{ type: 'rotate', buildingId: pump.id }]);
    expect(pump.dir).toBe(0);
    r.canal([[9, 4], [9, 3], [9, 2]]);
    r.until(r.complete, 3000, 'complete');
  },
};

describe('campaign structure', () => {
  it('has ten levels in order, each one leading to the next, then the sandbox', () => {
    expect(LEVELS.length).toBe(10);
    LEVELS.forEach((l, i) => expect(l.num).toBe(i + 1));
    expect(nextLevel('first-canal')).toBe('downhill');
    expect(nextLevel('village')).toBe('sandbox');
  });

  it('introduces tools cumulatively, never removing one', () => {
    for (let i = 1; i < LEVELS.length; i++) {
      for (const t of LEVELS[i - 1].tools) expect(LEVELS[i].tools).toContain(t);
      for (const t of LEVELS[i].newTools) expect(LEVELS[i].tools).toContain(t);
    }
  });

  it('every level has objectives with short imperative text and a par', () => {
    for (const l of LEVELS) {
      expect(l.objectives.length).toBeGreaterThan(0);
      for (const o of l.objectives) expect(o.text.split(' ').length).toBeLessThanOrEqual(12);
      expect(l.par.seconds).toBeGreaterThan(0);
    }
  });

  it('locks tools a level does not teach', () => {
    const s = createInitialState(1, 'first-canal');
    expect(isUnlocked(s, 'canal')).toBe(true);
    expect(isUnlocked(s, 'gate')).toBe(false);
    expect(isUnlocked(s, 'reservoir')).toBe(false);
    const r = stepGame(s, [{ type: 'place', building: 'reservoir', x: 4, y: 4 }]);
    expect(s.buildings.some((b) => b.type === 'reservoir')).toBe(false);
    expect(r.events.some((e) => e.type === 'error')).toBe(true);
    // Gate commands are checked in the simulation, not only in the UI.
    s.grid.canal[idx(s.grid, 3, 2)] = 1;
    stepGame(s, [{ type: 'gate', cell: idx(s.grid, 3, 2) }]);
    expect(s.grid.gate[idx(s.grid, 3, 2)]).toBe(0);
  });
});

describe('every campaign level can be finished with real connections', () => {
  const timings: Record<string, number> = {};
  for (const id of LEVEL_ORDER) {
    const solve = SOLUTIONS[id];
    if (!solve) continue;
    it(`${getLevel(id).num}. ${getLevel(id).title}`, () => {
      const r = runner(id);
      solve(r);
      const level = getLevel(id);
      expect(r.s.objectives.done.sort()).toEqual(level.objectives.map((o) => o.id).sort());
      expect(r.events.filter((e) => e.type === 'levelComplete').length).toBe(1);
      // The scripted solution stays within the materials par, so it earns at least two stars.
      expect(r.s.stats.spent).toBeLessThanOrEqual(level.par.materials);
      expect(r.s.objectives.stars).toBeGreaterThanOrEqual(2);
      expect(allFinite(r.s)).toBe(true);
      timings[id] = Math.round((r.s.objectives.completedTick ?? 0) / 10);
      // Completion fires once: keep running and nothing re-latches.
      for (let k = 0; k < 50; k++) r.run();
      expect(r.events.filter((e) => e.type === 'levelComplete').length).toBe(1);
      console.log(`level ${id}: ${timings[id]}s, spent ${r.s.stats.spent}, stars ${r.s.objectives.stars}`);
    });
  }
});

describe('scripted mechanics really matter', () => {
  it('save-rain: an empty reservoir cannot carry the paddy through the drought', () => {
    const r = runner('save-rain');
    const res = r.place('reservoir', 6, 4);
    r.canal([[7, 2], [7, 3]]);
    r.until((s) => s.objectives.done.includes('fill'), 6000, 'filled');
    // Same layout, but the store is empty when the dry spell starts (emptied between ticks).
    res.water = 0;
    r.run();
    expect(r.s.weather.mode).toBe('dry');
    let dryTicks = 0;
    while (r.s.weather.mode === 'dry' && dryTicks < 2000) {
      r.run();
      dryTicks++;
    }
    expect(dryTicks).toBeGreaterThanOrEqual(900);
    expect(r.s.objectives.done).not.toContain('survive');
  });

  it('save-rain: the drought only begins once the reservoir is 60% full', () => {
    const r = runner('save-rain');
    for (let k = 0; k < 500; k++) r.run();
    expect(r.s.weather.mode).toBe('rain');
  });

  it('fish-pond: a pond with no outlet goes stagnant and the fish stop growing', () => {
    const r = runner('fish-pond');
    const pond = r.place('fishpond', 6, 4);
    r.canal([[7, 2], [7, 3]]);
    r.until((s) => s.objectives.done.includes('fill'), 3000, 'pond filled');
    r.run([{ type: 'stock', buildingId: pond.id }]);
    for (let k = 0; k < 1500; k++) r.run();
    expect(pond.status).toBe('pondStagnant');
    expect(isRipe(pond)).toBe(false);
  });

  it('lift-water: a pump facing the wrong way lifts nothing', () => {
    const r = runner('lift-water');
    const pump = r.place('pump', 9, 5);
    r.canal([[9, 4], [9, 3], [9, 2]]);
    for (let k = 0; k < 400; k++) r.run();
    expect(pump.active).toBe(false);
    expect(r.s.objectives.done).not.toContain('lift');
  });
});
