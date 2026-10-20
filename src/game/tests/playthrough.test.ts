import { describe, expect, it } from 'vitest';
import { createInitialState, idx } from '../model/world';
import type { BuildingTypePlaceable, Command, GameEvent, GameState } from '../model/types';
import { stepGame, massTolerance } from '../sim/tick';
import { isRipe } from '../sim/consumers';
import { allFinite } from './helpers';

/**
 * Scripted player on the real starter map: proves every milestone A..G is reachable
 * through physical connections (no cheats), and reports rough timings.
 */
describe('integrated playthrough', () => {
  it('reaches every milestone from rain to Village in Bloom', () => {
    const s = createInitialState(1527);
    const g = s.grid;
    const at = (x: number, y: number) => idx(g, x, y);
    const log: Record<string, number> = {};
    const allEvents: GameEvent[] = [];

    const run = (cmds: Command[] = []) => {
      const r = stepGame(s, cmds);
      expect(Math.abs(r.residual)).toBeLessThan(massTolerance(s.ledger.total));
      for (const e of r.events) {
        allEvents.push(e);
        if (e.type === 'achievement') log[e.id] = s.tick;
        if (e.type === 'error') throw new Error(`Command error at tick ${s.tick}: ${e.message}`);
      }
    };
    const until = (pred: (s: GameState) => boolean, max: number, label: string) => {
      for (let k = 0; k < max; k++) {
        if (pred(s)) return;
        run();
      }
      throw new Error(`Timed out waiting for ${label} at tick ${s.tick}`);
    };
    const canal = (cells: [number, number][]) => run([{ type: 'drawCanal', cells: cells.map(([x, y]) => at(x, y)) }]);
    const place = (building: BuildingTypePlaceable, x: number, y: number) => run([{ type: 'place', building, x, y }]);
    const byType = (t: string) => s.buildings.filter((b) => b.type === t);
    const has = (id: string) => s.achievements.includes(id);
    const harvestRipe = () => {
      for (const b of s.buildings) if (isRipe(b)) run([{ type: 'harvest', buildingId: b.id }]);
    };

    // A: First Stream.
    canal([[2, 3], [3, 3], [4, 3], [5, 3], [5, 4], [6, 4], [7, 4], [7, 5]]);
    until(() => has('first-irrigation'), 3000, 'first irrigation');
    until(() => byType('field').some(isRipe), 3000, 'ripe rice');
    harvestRipe();
    expect(has('first-harvest')).toBe(true);

    // B: Save the Rain. Divert the stream into the east basin.
    place('reservoir', 18, 4);
    canal([[19, 2], [19, 3]]);
    until(() => has('reservoir-filled'), 8000, 'reservoir filled');

    // C: Let it Spin. The stream steps down two levels on the east edge.
    place('turbine', 25, 11);
    until(() => has('turbine-power'), 4000, 'turbine power');

    // D: Light the Village.
    place('battery', 23, 10);
    until(() => has('village-lit'), 4000, 'village lit');

    // E: Every Drop Counts. Raw water from the plateau down to a plant by the village.
    canal([[7, 6], [7, 7], [7, 8], [7, 9]]);
    place('treatment', 6, 10);
    until(() => has('clean-water'), 6000, 'clean water');
    place('connector', 3, 12);
    until(() => has('house-supplied'), 6000, 'house supplied');

    // F: Living Pond. Drain the reservoir south through the open basin side into a pond.
    place('fishpond', 18, 10);
    canal([[19, 7], [19, 8], [19, 9]]);
    canal([[17, 11], [16, 11], [16, 12], [16, 13], [16, 14]]);
    until(() => byType('fishpond')[0].water >= 65, 8000, 'pond fill');
    run([{ type: 'stock', buildingId: byType('fishpond')[0].id }]);
    let harvestGuard = 0;
    until(
      () => {
        harvestGuard++;
        if (harvestGuard % 50 === 0) harvestRipe();
        return has('fish-harvest');
      },
      20000,
      'fish harvest',
    );

    // G: wetland on the marsh fed by the pond outflow, floating garden, then bloom.
    place('wetland', 14, 14);
    place('floating', 19, 11);
    until(
      () => {
        harvestGuard++;
        if (harvestGuard % 50 === 0) harvestRipe();
        if (byType('fishpond')[0] && !byType('fishpond')[0].stocked && byType('fishpond')[0].water >= 65 && s.resources.materials >= 10) {
          run([{ type: 'stock', buildingId: byType('fishpond')[0].id }]);
        }
        return has('village-bloom');
      },
      30000,
      'village bloom',
    );

    expect(allFinite(s)).toBe(true);
    // Timings in seconds, for tuning.
    const secs = Object.fromEntries(Object.entries(log).map(([k, v]) => [k, Math.round(v / 10)]));
    console.log('milestone seconds', secs, 'materials', Math.floor(s.resources.materials), 'spent', s.stats.spent);
    expect(has('village-bloom')).toBe(true);
    // Every village objective latched; keep tending the village until bloom holds for 10 s.
    until(
      () => {
        harvestGuard++;
        if (harvestGuard % 50 === 0) harvestRipe();
        const pond = byType('fishpond')[0];
        if (pond && !pond.stocked && pond.water >= 65 && s.resources.materials >= 10) run([{ type: 'stock', buildingId: pond.id }]);
        return s.objectives.completedTick !== null;
      },
      20000,
      'sustained bloom',
    );
    console.log('village complete at', Math.round((s.objectives.completedTick ?? 0) / 10), 's, stars', s.objectives.stars);
    expect(s.objectives.completedTick).not.toBeNull();
    expect(allEvents.filter((e) => e.type === 'levelComplete').length).toBe(1);
  });
});
