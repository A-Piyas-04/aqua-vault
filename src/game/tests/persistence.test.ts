import { describe, expect, it } from 'vitest';
import { CONFIG } from '../model/config';
import { createInitialState, idx } from '../model/world';
import { migrateSave } from '../persistence/migrations';
import { LocalSaveRepository, MemoryStore } from '../persistence/storage';
import {
  defaultProfile,
  isLevelUnlocked,
  migrateProfileV2,
  recordCompletion,
  recordSkip,
  sanitizeProfile,
} from '../persistence/profile';
import { stepGame } from '../sim/tick';
import { grantAchievement, rankForXp } from '../sim/progression';
import { getLevel, LEVEL_ORDER } from '../content/campaign';
import type { GameEvent } from '../model/types';
import { clone } from './helpers';

/** A v2-shaped save (scenarioId, settings, xp) built from a v3 state. */
function v2Save(levelId: 'village' | 'first-canal', scenarioId: string) {
  const s = clone(createInitialState(4, levelId)) as unknown as Record<string, unknown>;
  delete s.levelId;
  delete s.objectives;
  delete s.stats;
  delete s.weatherStep;
  delete s.dayOffset;
  s.scenarioId = scenarioId;
  s.version = 2;
  s.settings = { sound: true, reducedMotion: true, speed: 2, tutorialDone: true };
  (s.resources as Record<string, unknown>).xp = 300;
  delete (s.resources as Record<string, unknown>).freeCanalsMax;
  s.lastHarvestXpTick = 12;
  s.allowedTools = null;
  return s;
}

describe('save migration', () => {
  it('round-trips a played level exactly and continues deterministically', () => {
    const s = createInitialState(21);
    const g = s.grid;
    stepGame(s, [{ type: 'drawCanal', cells: [idx(g, 2, 3), idx(g, 3, 3)] }]);
    for (let t = 0; t < 300; t++) stepGame(s);
    const res = migrateSave(JSON.parse(JSON.stringify(s)));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.repaired).toBe(false);
    const a = clone(s);
    const b = res.state;
    for (let t = 0; t < 200; t++) {
      stepGame(a);
      stepGame(b);
    }
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('round-trips scripted weather and objectives mid-level', () => {
    const s = createInitialState(3, 'save-rain');
    stepGame(s, [{ type: 'place', building: 'reservoir', x: 6, y: 4 }]);
    for (let t = 0; t < 50; t++) stepGame(s);
    expect(s.objectives.done).toContain('build');
    const res = migrateSave(JSON.parse(JSON.stringify(s)));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.objectives.done).toEqual(['build']);
    expect(res.state.weatherStep).toBe(0);
  });

  it('rejects future versions gracefully', () => {
    const raw = { ...clone(createInitialState()), version: CONFIG.saveVersion + 1 };
    const res = migrateSave(raw);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('future');
  });

  it('upgrades a v2 village save: level id, tools, legacy settings, stats from achievements', () => {
    const raw = v2Save('village', 'village');
    (raw.achievements as string[]).push('first-harvest', 'fish-stocked');
    const res = migrateSave(raw);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.levelId).toBe('village');
    expect(res.state.allowedTools).toEqual(getLevel('village').tools);
    expect(res.state.stats.harvestRice).toBe(1);
    expect(res.state.stats.stocked).toBe(1);
    expect(res.state.resources.freeCanalsMax).toBe(CONFIG.progression.freeCanals);
    expect((res.state as unknown as Record<string, unknown>).settings).toBeUndefined();
    expect((res.state.resources as unknown as Record<string, unknown>).xp).toBeUndefined();
    expect(res.legacySettings).toMatchObject({ sound: true, speed: 2 });
    for (let t = 0; t < 50; t++) stepGame(res.state);
  });

  it('maps an old lesson save onto its campaign level', () => {
    const res = migrateSave(v2Save('first-canal', 'lesson-1'));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.levelId).toBe('first-canal');
    expect(res.state.grid.w).toBe(12);
  });

  it('treats a save without any level id as the village', () => {
    const raw = v2Save('village', 'village');
    delete raw.scenarioId;
    raw.version = 1;
    const res = migrateSave(raw);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.state.levelId).toBe('village');
  });

  it('rejects garbage and repairs recoverable corruption', () => {
    expect(migrateSave(null).ok).toBe(false);
    expect(migrateSave({ hello: 1 }).ok).toBe(false);
    const s = clone(createInitialState());
    (s.grid.water as unknown as (number | null)[])[5] = null;
    s.grid.water[6] = -3;
    (s.resources as unknown as Record<string, unknown>).materials = 'lots';
    (s.buildings[0] as unknown as Record<string, unknown>).w = 99;
    (s as unknown as Record<string, unknown>).history = [{ kind: 'nope' }, null];
    (s.objectives as unknown as Record<string, unknown>).done = ['rice', 'not-an-objective', 7];
    const res = migrateSave(s);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.repaired).toBe(true);
    expect(res.state.grid.water[5]).toBe(0);
    expect(res.state.grid.water[6]).toBe(0);
    expect(res.state.resources.materials).toBe(CONFIG.progression.startMaterials);
    expect(res.state.buildings[0].w).toBe(CONFIG.footprint[res.state.buildings[0].type][0]);
    expect(res.state.history).toEqual([]);
    expect(res.state.objectives.done).toEqual(['rice']);
  });
});

describe('profile', () => {
  it('opens levels one after another; skipping opens the next without stars', () => {
    const p = defaultProfile();
    expect(isLevelUnlocked(p, 'first-canal')).toBe(true);
    expect(isLevelUnlocked(p, 'downhill')).toBe(false);
    recordSkip(p, 'first-canal');
    expect(isLevelUnlocked(p, 'downhill')).toBe(true);
    expect(p.levels['first-canal']?.stars).toBe(0);
    expect(p.xp).toBe(0);
    expect(isLevelUnlocked(p, 'sandbox')).toBe(false);
  });

  it('pays level XP once, and later only star improvements', () => {
    const p = defaultProfile();
    const lv = getLevel('first-canal');
    const a = recordCompletion(p, 'first-canal', 2, 50, 3);
    expect(a.xpGained).toBe(lv.xp + 2 * CONFIG.progression.starXp);
    const b = recordCompletion(p, 'first-canal', 2, 40, 0);
    expect(b.xpGained).toBe(0);
    const c = recordCompletion(p, 'first-canal', 3, 45, 0);
    expect(c.xpGained).toBe(CONFIG.progression.starXp);
    expect(p.levels['first-canal']).toMatchObject({ stars: 3, bestSeconds: 40, bestSpent: 0 });
    // A worse replay never lowers the record.
    recordCompletion(p, 'first-canal', 1, 99, 50);
    expect(p.levels['first-canal']?.stars).toBe(3);
  });

  it('a skip after completing does not erase the completion', () => {
    const p = defaultProfile();
    recordCompletion(p, 'first-canal', 3, 10, 0);
    recordSkip(p, 'first-canal');
    expect(p.levels['first-canal']?.completed).toBe(true);
  });

  it('the sandbox opens after the village', () => {
    const p = defaultProfile();
    for (const id of LEVEL_ORDER) recordCompletion(p, id, 1, 10, 0);
    expect(isLevelUnlocked(p, 'sandbox')).toBe(true);
    expect(rankForXp(p.xp)).toBeGreaterThan(1);
  });

  it('sanitizes garbage and keeps the current level reachable', () => {
    const p = sanitizeProfile({ xp: 'many', currentLevel: 'village', levels: { nope: {}, 'first-canal': { completed: true, stars: 9 } }, settings: { speed: 3, volume: 4 } });
    expect(p.xp).toBe(0);
    expect(p.levels['first-canal']?.stars).toBe(3);
    expect(p.currentLevel).toBe('first-canal');
    expect(p.settings.speed).toBe(1);
    expect(p.settings.volume).toBe(1);
  });

  it('migrates a v2 profile: completed lessons become finished levels', () => {
    const p = migrateProfileV2({ currentScenario: 'lesson-3', completedLessons: ['lesson-1', 'lesson-2'] }, false);
    expect(p.levels['first-canal']?.completed).toBe(true);
    expect(p.levels.downhill?.completed).toBe(true);
    expect(p.currentLevel).toBe('gates-harvest');
    expect(p.xp).toBeGreaterThan(0);
  });

  it('a v2 player who reached the village keeps it open', () => {
    const p = migrateProfileV2({ currentScenario: 'village', completedLessons: [] }, true, { sound: true });
    expect(isLevelUnlocked(p, 'village')).toBe(true);
    expect(p.currentLevel).toBe('village');
    expect(p.levels['clean-water']?.skipped).toBe(true);
    expect(p.settings.sound).toBe(true);
  });
});

describe('local repository', () => {
  it('saves levels separately and keeps two generations', () => {
    const store = new MemoryStore();
    const repo = new LocalSaveRepository(store);
    const a = createInitialState(1, 'first-canal');
    const b = createInitialState(1, 'downhill');
    expect(repo.save(a)).toBe(true);
    expect(repo.save(b)).toBe(true);
    stepGame(a);
    expect(repo.save(a)).toBe(true);
    const la = repo.load('first-canal');
    const lb = repo.load('downhill');
    expect(la.ok && la.state.tick).toBe(1);
    expect(lb.ok && lb.state.levelId).toBe('downhill');
    expect(repo.load('village').ok).toBe(false);
  });

  it('upgrades the v2 layout once and removes old keys only after writing', () => {
    const store = new MemoryStore();
    store.setItem('aqua-vault:profile', JSON.stringify({ currentScenario: 'village', completedLessons: ['lesson-1'] }));
    store.setItem('aqua-vault:save:village:a', JSON.stringify({ savedAt: 5, state: v2Save('village', 'village') }));
    const repo = new LocalSaveRepository(store);
    const { profile, upgraded } = repo.loadProfile();
    expect(upgraded).toBe(true);
    expect(profile.currentLevel).toBe('village');
    expect(profile.settings.reducedMotion).toBe(true);
    expect(store.getItem('aqua-vault:profile')).toBeNull();
    expect(store.getItem('aqua-vault:save:village:a')).toBeNull();
    const village = repo.load('village');
    expect(village.ok).toBe(true);
    // Second launch reads the v3 profile directly.
    expect(new LocalSaveRepository(store).loadProfile().upgraded).toBe(false);
  });

  it('keeps the old keys when the upgrade cannot be written', () => {
    const store = new MemoryStore();
    store.setItem('aqua-vault:profile', JSON.stringify({ currentScenario: 'lesson-2', completedLessons: ['lesson-1'] }));
    store.failWrites = true;
    const repo = new LocalSaveRepository(store);
    const { profile } = repo.loadProfile();
    expect(profile.levels['first-canal']?.completed).toBe(true);
    expect(store.getItem('aqua-vault:profile')).not.toBeNull();
  });

  it('works with no storage at all (private mode)', () => {
    const repo = new LocalSaveRepository(null);
    expect(repo.save(createInitialState())).toBe(false);
    expect(repo.loadProfile().profile.currentLevel).toBe('first-canal');
  });
});

describe('progression and commands', () => {
  it('achievements reward materials only once', () => {
    const s = createInitialState();
    const events: GameEvent[] = [];
    const m0 = s.resources.materials;
    expect(grantAchievement(s, 'first-irrigation', events)).toBe(true);
    const m1 = s.resources.materials;
    expect(m1).toBeGreaterThan(m0);
    expect(grantAchievement(s, 'first-irrigation', events)).toBe(false);
    expect(s.resources.materials).toBe(m1);
  });

  it('village rank thresholds', () => {
    const R = CONFIG.progression.ranks;
    expect(rankForXp(0)).toBe(1);
    expect(rankForXp(R[1] - 1)).toBe(1);
    expect(rankForXp(R[1])).toBe(2);
    expect(rankForXp(R[R.length - 1])).toBe(R.length);
  });

  it('undoes a whole canal stroke and restores free canals up to the level allowance', () => {
    const s = createInitialState(1, 'downhill');
    const g = s.grid;
    const f0 = s.resources.freeCanals;
    expect(f0).toBe(18);
    const cells = [idx(g, 2, 3), idx(g, 2, 4), idx(g, 2, 5), idx(g, 2, 6), idx(g, 3, 6), idx(g, 4, 6), idx(g, 5, 6), idx(g, 6, 6), idx(g, 7, 6), idx(g, 8, 6), idx(g, 8, 5), idx(g, 8, 4)];
    stepGame(s, [{ type: 'drawCanal', cells, stroke: 1 }]);
    expect(s.resources.freeCanals).toBe(f0 - cells.length);
    stepGame(s, [{ type: 'undo' }]);
    expect(s.resources.freeCanals).toBe(f0);
    expect(g.canal[idx(g, 8, 4)]).toBe(0);
  });

  it('erasing a free canal returns the tile to the allowance, never materials', () => {
    const s = createInitialState();
    const g = s.grid;
    const m0 = s.resources.materials;
    const f0 = s.resources.freeCanals;
    stepGame(s, [{ type: 'drawCanal', cells: [idx(g, 2, 3), idx(g, 3, 3)] }]);
    stepGame(s, [{ type: 'erase', cells: [idx(g, 2, 3), idx(g, 3, 3)] }]);
    expect(s.resources.freeCanals).toBe(f0);
    expect(s.resources.materials).toBe(m0);
    // Undo of the erase takes the free tiles again.
    stepGame(s, [{ type: 'undo' }]);
    expect(g.canal[idx(g, 2, 3)]).toBe(1);
    expect(s.resources.freeCanals).toBe(f0 - 2);
  });

  it('undoes a placement with full refund and tracks net spend', () => {
    const s = createInitialState();
    const m0 = s.resources.materials;
    stepGame(s, [{ type: 'place', building: 'field', x: 10, y: 7 }]);
    expect(s.stats.spent).toBe(CONFIG.costs.field);
    stepGame(s, [{ type: 'undo' }]);
    expect(s.buildings.some((b) => b.type === 'field' && b.x === 10)).toBe(false);
    expect(s.resources.materials).toBe(m0);
    expect(s.stats.spent).toBe(0);
  });

  it('removeBuilding removes the chosen building even when a floating garden sits on its corner', () => {
    const s = createInitialState(2, 'sandbox');
    stepGame(s, [{ type: 'place', building: 'wetland', x: 9, y: 14 }]);
    const wet = s.buildings.find((b) => b.type === 'wetland')!;
    s.buildings.find((b) => b.id === wet.id)!.water = 25;
    stepGame(s, [{ type: 'place', building: 'floating', x: 9, y: 14 }]);
    expect(s.buildings.some((b) => b.type === 'floating')).toBe(true);
    stepGame(s, [{ type: 'removeBuilding', buildingId: wet.id }]);
    expect(s.buildings.some((b) => b.id === wet.id)).toBe(false);
    // Its garden goes with it, never instead of it.
    expect(s.buildings.some((b) => b.type === 'floating')).toBe(false);
  });

  it('cannot erase built-in village homes', () => {
    const s = createInitialState();
    const house = s.buildings.find((b) => b.type === 'house')!;
    stepGame(s, [{ type: 'erase', cells: [idx(s.grid, house.x, house.y)], includeBuildings: true }]);
    stepGame(s, [{ type: 'removeBuilding', buildingId: house.id }]);
    expect(s.buildings.some((b) => b.id === house.id)).toBe(true);
  });
});
