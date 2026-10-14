import { CONFIG } from '../model/config';
import type { GameEvent, GameState } from '../model/types';
import { ACHIEVEMENTS, type AchievementDef } from '../content/milestones';

export function levelForXp(xp: number): number {
  const levels = CONFIG.progression.levels;
  let lv = 1;
  for (let i = 0; i < levels.length; i++) if (xp >= levels[i]) lv = i + 1;
  return lv;
}

export function nextLevelXp(xp: number): number | null {
  const levels = CONFIG.progression.levels;
  for (const t of levels) if (t > xp) return t;
  return null;
}

export function hasAchievement(state: GameState, id: string): boolean {
  return state.achievements.includes(id);
}

/** Idempotent: grants XP/materials only the first time an achievement id is earned. */
export function grantAchievement(state: GameState, id: string, events: GameEvent[]): boolean {
  if (hasAchievement(state, id)) return false;
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def) return false;
  const before = levelForXp(state.resources.xp);
  state.achievements.push(id);
  state.resources.xp += def.xp;
  state.resources.materials += def.materials;
  events.push({ type: 'achievement', id, xp: def.xp, materials: def.materials });
  const after = levelForXp(state.resources.xp);
  if (after > before) events.push({ type: 'levelUp', level: after });
  return true;
}

export function addXp(state: GameState, xp: number, events: GameEvent[]): void {
  const before = levelForXp(state.resources.xp);
  state.resources.xp += xp;
  const after = levelForXp(state.resources.xp);
  if (after > before) events.push({ type: 'levelUp', level: after });
}

/** Checks state-derived achievements. Called every tick (cheap). */
export function checkProgression(state: GameState, events: GameEvent[]): void {
  for (const def of ACHIEVEMENTS as AchievementDef[]) {
    if (!def.check || hasAchievement(state, def.id)) continue;
    if (def.check(state)) grantAchievement(state, def.id, events);
  }
  const P = CONFIG.progression;
  if (state.resources.materials < P.regenFloor) {
    state.regenTimer += 1;
    if (state.regenTimer >= P.regenEveryTicks) {
      state.regenTimer = 0;
      state.resources.materials += 1;
    }
  } else {
    state.regenTimer = 0;
  }
}

export function ecosystemScore(state: GameState): { score: number; living: string[] } {
  const living: string[] = [];
  const g = state.grid;
  let wetCanals = 0;
  for (let i = 0; i < g.canal.length; i++) if (g.canal[i] && g.water[i] > 0.2) wetCanals++;
  if (wetCanals > 0) living.push(`${wetCanals} flowing canal tiles`);
  const fields = state.buildings.filter((b) => b.type === 'field' && b.active).length;
  if (fields) living.push(`${fields} irrigated paddy${fields > 1 ? 's' : ''}`);
  const fish = state.buildings.filter((b) => b.type === 'fishpond' && b.stocked).length;
  if (fish) living.push(`fish in ${fish} pond${fish > 1 ? 's' : ''}`);
  const wet = state.buildings.filter((b) => b.type === 'wetland' && b.progress > 0.3).length;
  if (wet) living.push('reeds, shāpla, frogs and birds');
  const homes = state.buildings.filter((b) => b.type === 'house' && b.supplied).length;
  if (homes) living.push(`${homes} home${homes > 1 ? 's' : ''} with clean water`);
  const lit = state.buildings.filter((b) => b.type === 'house' && b.lit).length;
  if (lit) living.push(`${lit} lit home${lit > 1 ? 's' : ''}`);
  const gardens = state.buildings.filter((b) => b.type === 'floating' && b.active).length;
  if (gardens) living.push(`${gardens} floating garden${gardens > 1 ? 's' : ''}`);
  const score = Math.min(100, wetCanals + fields * 8 + fish * 12 + wet * 12 + homes * 8 + lit * 4 + gardens * 6);
  return { score, living };
}
