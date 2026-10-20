import { CONFIG } from '../model/config';
import type { GameEvent, GameState } from '../model/types';
import { getLevel, type LevelDef, type ObjectiveDef } from '../content/campaign';

function satisfied(state: GameState, o: ObjectiveDef): boolean {
  const ok = o.check(state);
  if (!o.sustainTicks) return ok;
  const n = ok ? (state.objectives.sustain[o.id] ?? 0) + 1 : 0;
  state.objectives.sustain[o.id] = n;
  return n >= o.sustainTicks;
}

function latch(state: GameState, o: ObjectiveDef, events: GameEvent[]): void {
  state.objectives.done.push(o.id);
  delete state.objectives.sustain[o.id];
  events.push({ type: 'objective', id: o.id });
}

/** Objectives still open, in display order. */
export function openObjectives(state: GameState, level: LevelDef = getLevel(state.levelId)): ObjectiveDef[] {
  return level.objectives.filter((o) => !state.objectives.done.includes(o.id));
}

/**
 * The objectives the simulation evaluates this tick. Ordered levels evaluate only the
 * first open one; unordered levels evaluate every open non-final objective, and the
 * final objective once the rest are done.
 */
export function activeObjectives(state: GameState, level: LevelDef = getLevel(state.levelId)): ObjectiveDef[] {
  const open = openObjectives(state, level);
  if (open.length === 0) return [];
  if (level.ordered) return [open[0]];
  const nonFinal = open.filter((o) => !o.final);
  return nonFinal.length ? nonFinal : open;
}

/** Latches objectives (never un-latches) and emits completion exactly once. */
export function evaluateObjectives(state: GameState, events: GameEvent[]): void {
  const level = getLevel(state.levelId);
  if (level.objectives.length === 0 || state.objectives.completedTick !== null) return;
  for (const o of activeObjectives(state, level)) {
    if (satisfied(state, o)) latch(state, o, events);
  }
  if (level.objectives.every((o) => state.objectives.done.includes(o.id))) {
    state.objectives.completedTick = state.tick;
    state.objectives.stars = computeStars(level, state.stats.spent, state.tick + 1);
    events.push({ type: 'levelComplete', stars: state.objectives.stars });
  }
}

/** 1 star for finishing, +1 for spending at most the par, +1 for finishing within the par time. */
export function computeStars(level: LevelDef, spent: number, ticks: number): number {
  let stars = 1;
  if (spent <= level.par.materials + 1e-9) stars++;
  if (ticks <= level.par.seconds * CONFIG.ticksPerSecond) stars++;
  return stars;
}

export function isLevelComplete(state: GameState): boolean {
  return state.objectives.completedTick !== null;
}
