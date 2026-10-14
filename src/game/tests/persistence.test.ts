import { describe, expect, it } from 'vitest';
import { CONFIG } from '../model/config';
import { createInitialState, idx } from '../model/world';
import { migrateSave } from '../persistence/migrations';
import { stepGame } from '../sim/tick';
import { grantAchievement, levelForXp } from '../sim/progression';
import type { GameEvent } from '../model/types';
import { clone } from './helpers';

describe('save migration', () => {
  it('round-trips a played world exactly', () => {
    const s = createInitialState(21);
    const g = s.grid;
    stepGame(s, [{ type: 'drawCanal', cells: [idx(g, 2, 3), idx(g, 3, 3)] }]);
    for (let t = 0; t < 300; t++) stepGame(s);
    const res = migrateSave(JSON.parse(JSON.stringify(s)));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.repaired).toBe(false);
    // Deterministic continuation after reload.
    const a = clone(s);
    const b = res.state;
    for (let t = 0; t < 200; t++) {
      stepGame(a);
      stepGame(b);
    }
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('rejects future major versions gracefully', () => {
    const s = createInitialState();
    const raw = { ...clone(s), version: CONFIG.saveVersion + 1 };
    const res = migrateSave(raw);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('future');
  });

  it('treats an old save without scenarioId as the village', () => {
    const s = clone(createInitialState(4, 'village'));
    const raw = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    delete raw.scenarioId;
    delete raw.allowedTools;
    raw.version = 1;
    const res = migrateSave(raw);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.scenarioId).toBe('village');
    expect(res.state.allowedTools).toBeNull();
    expect(res.state.grid.w).toBe(CONFIG.grid.w);
  });

  it('round-trips a lesson map at its own size', () => {
    const s = createInitialState(8, 'lesson-1');
    const g = s.grid;
    stepGame(s, [{ type: 'drawCanal', cells: [idx(g, 2, 2), idx(g, 3, 2)] }]);
    const res = migrateSave(JSON.parse(JSON.stringify(s)));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.scenarioId).toBe('lesson-1');
    expect(res.state.grid.w).toBe(12);
    expect(res.state.grid.h).toBe(8);
    expect(res.state.allowedTools).toContain('canal');
  });

  it('rejects garbage and repairs recoverable corruption', () => {
    expect(migrateSave(null).ok).toBe(false);
    expect(migrateSave({ hello: 1 }).ok).toBe(false);
    const s = clone(createInitialState());
    (s.grid.water as unknown as (number | null)[])[5] = null;
    s.grid.water[6] = -3;
    (s.resources as unknown as Record<string, unknown>).materials = 'lots';
    const res = migrateSave(s);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.repaired).toBe(true);
    expect(res.state.grid.water[5]).toBe(0);
    expect(res.state.grid.water[6]).toBe(0);
    expect(res.state.resources.materials).toBe(CONFIG.progression.startMaterials);
  });
});

describe('progression', () => {
  it('achievements grant XP only once', () => {
    const s = createInitialState();
    const events: GameEvent[] = [];
    expect(grantAchievement(s, 'first-irrigation', events)).toBe(true);
    const xp = s.resources.xp;
    expect(grantAchievement(s, 'first-irrigation', events)).toBe(false);
    expect(s.resources.xp).toBe(xp);
  });

  it('levels unlock only when thresholds are met', () => {
    const L = CONFIG.progression.levels;
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(L[1] - 1)).toBe(1);
    expect(levelForXp(L[1])).toBe(2);
    expect(levelForXp(L[L.length - 1])).toBe(L.length);
  });

  it('locked buildings cannot be placed', () => {
    const s = createInitialState();
    const events: GameEvent[] = [];
    stepGame(s, [{ type: 'place', building: 'reservoir', x: 18, y: 4 }]).events.forEach((e) => events.push(e));
    expect(s.buildings.some((b) => b.type === 'reservoir')).toBe(false);
  });

  it('repeat harvest XP has a cooldown', () => {
    const s = createInitialState();
    const field = s.buildings.find((b) => b.type === 'field')!;
    s.achievements.push('first-harvest');
    field.progress = 3 * CONFIG.field.ticksPerStage;
    stepGame(s, [{ type: 'harvest', buildingId: field.id }]);
    const xp1 = s.resources.xp;
    field.progress = 3 * CONFIG.field.ticksPerStage;
    stepGame(s, [{ type: 'harvest', buildingId: field.id }]);
    expect(s.resources.xp).toBe(xp1);
  });
});

describe('undo', () => {
  it('undoes a whole canal stroke and refunds', () => {
    const s = createInitialState();
    const g = s.grid;
    const m0 = s.resources.materials;
    const f0 = s.resources.freeCanals;
    stepGame(s, [{ type: 'drawCanal', cells: [idx(g, 2, 3)], stroke: 1 }]);
    stepGame(s, [{ type: 'drawCanal', cells: [idx(g, 3, 3), idx(g, 4, 3)], stroke: 1 }]);
    expect(g.canal[idx(g, 4, 3)]).toBe(1);
    stepGame(s, [{ type: 'undo' }]);
    expect(g.canal[idx(g, 2, 3)]).toBe(0);
    expect(g.canal[idx(g, 4, 3)]).toBe(0);
    expect(s.resources.materials).toBe(m0);
    expect(s.resources.freeCanals).toBe(f0);
  });

  it('undoes a placement with full refund, and a removal', () => {
    const s = createInitialState();
    const m0 = s.resources.materials;
    stepGame(s, [{ type: 'place', building: 'field', x: 10, y: 7 }]);
    expect(s.buildings.some((b) => b.type === 'field' && b.x === 10)).toBe(true);
    stepGame(s, [{ type: 'undo' }]);
    expect(s.buildings.some((b) => b.type === 'field' && b.x === 10)).toBe(false);
    expect(s.resources.materials).toBe(m0);
    stepGame(s, [{ type: 'place', building: 'field', x: 10, y: 7 }]);
    const g = s.grid;
    stepGame(s, [{ type: 'erase', cells: [idx(g, 10, 7)], includeBuildings: true }]);
    expect(s.buildings.some((b) => b.type === 'field' && b.x === 10)).toBe(false);
    stepGame(s, [{ type: 'undo' }]);
    expect(s.buildings.some((b) => b.type === 'field' && b.x === 10)).toBe(true);
  });

  it('cannot erase built-in village homes', () => {
    const s = createInitialState();
    const house = s.buildings.find((b) => b.type === 'house')!;
    stepGame(s, [{ type: 'erase', cells: [idx(s.grid, house.x, house.y)], includeBuildings: true }]);
    expect(s.buildings.some((b) => b.id === house.id)).toBe(true);
  });
});
