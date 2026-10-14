import { describe, expect, it } from 'vitest';
import { createInitialState, idx } from '../model/world';
import type { BuildingTypePlaceable, Command, GameState } from '../model/types';
import { GATE_CLOSED } from '../model/types';
import { stepGame, massTolerance } from '../sim/tick';
import { isUnlocked } from '../model/buildings';
import { isRipe } from '../sim/consumers';
import { lessonComplete, journalUnlockedIds, JOURNAL, currentLessonStep } from '../content/lessons';
import { allFinite } from './helpers';

function play(s: GameState, cmds: Command[] = []) {
  const r = stepGame(s, cmds);
  expect(Math.abs(r.residual)).toBeLessThan(massTolerance(s.ledger.total));
  return r;
}

function until(s: GameState, pred: (s: GameState) => boolean, max: number, label: string) {
  for (let k = 0; k < max; k++) {
    if (pred(s)) return;
    play(s);
  }
  throw new Error(`Timed out waiting for ${label} at tick ${s.tick}`);
}

function canal(s: GameState, cells: [number, number][]) {
  play(s, [{ type: 'drawCanal', cells: cells.map(([x, y]) => idx(s.grid, x, y)) }]);
}

function place(s: GameState, building: BuildingTypePlaceable, x: number, y: number) {
  play(s, [{ type: 'place', building, x, y }]);
}

describe('tutorial lessons', () => {
  it('lesson 1: a downhill canal irrigates the paddy; other tools stay locked', () => {
    const s = createInitialState(9, 'lesson-1');
    expect(isUnlocked(s, 'canal')).toBe(true);
    expect(isUnlocked(s, 'reservoir')).toBe(false);
    expect(isUnlocked(s, 'turbine')).toBe(false);
    play(s, [{ type: 'place', building: 'reservoir', x: 4, y: 4 }]);
    expect(s.buildings.some((b) => b.type === 'reservoir')).toBe(false);

    canal(s, [
      [2, 2],
      [3, 2],
      [4, 2],
      [5, 2],
      [6, 2],
      [7, 2],
      [8, 2],
      [8, 3],
    ]);
    until(s, () => lessonComplete(s, 'canal'), 4000, 'lesson 1 complete');
    expect(s.buildings.some((b) => b.type === 'field' && b.water > 0)).toBe(true);
    expect(allFinite(s)).toBe(true);
  });

  it('lesson 2: the ridge is a trap; the long downhill path irrigates', () => {
    const s = createInitialState(9, 'lesson-2');
    canal(s, [
      [2, 2],
      [3, 2],
      [3, 3],
      [3, 4],
    ]);
    for (let t = 0; t < 400; t++) play(s);
    expect(s.buildings.some((b) => b.type === 'field' && b.water >= 8)).toBe(false);

    canal(s, [
      [2, 3],
      [2, 4],
      [2, 5],
      [2, 6],
      [3, 6],
      [4, 6],
      [5, 6],
      [6, 6],
      [7, 6],
      [8, 6],
      [8, 5],
      [8, 4],
      [8, 3],
      [8, 2],
    ]);
    until(s, () => lessonComplete(s, 'canal'), 5000, 'lesson 2 complete');
    expect(allFinite(s)).toBe(true);
  });

  it('lesson 3: a closed gate sends water to one paddy; harvest works', () => {
    const s = createInitialState(9, 'lesson-3');
    const gateCell = idx(s.grid, 4, 4);
    play(s, [{ type: 'gate', cell: gateCell }]);
    play(s, [{ type: 'toggleGate', cell: gateCell }]);
    expect(s.grid.gate[gateCell]).toBe(GATE_CLOSED);

    const right = s.buildings.find((b) => b.type === 'field' && b.x === 9)!;
    until(s, () => isRipe(right), 4000, 'right paddy ripe');
    play(s, [{ type: 'harvest', buildingId: right.id }]);
    expect(s.achievements).toContain('first-harvest');
    until(s, () => lessonComplete(s, 'inspect'), 200, 'lesson 3 complete');
    expect(allFinite(s)).toBe(true);
  });

  it('lesson 4: a reservoir in the basin fills from the stream', () => {
    const s = createInitialState(9, 'lesson-4');
    expect(isUnlocked(s, 'reservoir')).toBe(true);
    place(s, 'reservoir', 6, 4);
    expect(s.buildings.some((b) => b.type === 'reservoir')).toBe(true);
    canal(s, [
      [7, 2],
      [7, 3],
    ]);
    until(s, () => lessonComplete(s, 'canal'), 8000, 'lesson 4 complete');
    const r = s.buildings.find((b) => b.type === 'reservoir')!;
    expect(r.water).toBeGreaterThan(15);
    expect(allFinite(s)).toBe(true);
  });

  it('lesson 5: a wheel on the drop plus a battery lights the house', () => {
    const s = createInitialState(9, 'lesson-5');
    expect(isUnlocked(s, 'turbine')).toBe(true);
    expect(isUnlocked(s, 'battery')).toBe(true);
    expect(isUnlocked(s, 'treatment')).toBe(false);
    place(s, 'turbine', 5, 3);
    until(s, () => s.buildings.some((b) => b.type === 'turbine' && b.rate > 0), 4000, 'wheel spins');
    place(s, 'battery', 4, 6);
    until(s, () => s.buildings.some((b) => b.type === 'house' && b.lit), 4000, 'house lit');
    expect(lessonComplete(s, 'battery')).toBe(true);
    expect(allFinite(s)).toBe(true);
  });
});

describe('journal unlock order', () => {
  it('unlocks lessons in sequence, then village systems from achievements', () => {
    expect(journalUnlockedIds([], []).length).toBe(0);
    expect(journalUnlockedIds(['lesson-1'], [])).toEqual(['lesson-1']);
    const four = journalUnlockedIds(['lesson-1', 'lesson-2', 'lesson-3', 'lesson-4'], []);
    expect(four).toEqual(['lesson-1', 'lesson-2', 'lesson-3', 'lesson-4']);
    const withVillage = journalUnlockedIds(['lesson-1', 'lesson-2', 'lesson-3', 'lesson-4', 'lesson-5', 'village'], ['clean-water']);
    expect(withVillage).toContain('village');
    expect(withVillage).toContain('treatment');
    expect(withVillage).not.toContain('taps');
    expect(JOURNAL.map((e) => e.order)).toEqual([...JOURNAL].map((e) => e.order).sort((a, b) => a - b));
  });

  it('does not skip wait-for-tool until the canal tool is chosen or a later step is done', () => {
    const s = createInitialState(1, 'lesson-1');
    for (let i = 0; i < 45; i++) play(s);
    const waiting = currentLessonStep(s, false, 'inspect');
    expect(waiting?.index).toBe(1);
    const picked = currentLessonStep(s, false, 'canal');
    expect(picked?.index).toBe(2);
  });
});
