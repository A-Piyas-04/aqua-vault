import { CONFIG } from '../model/config';
import type { GameState } from '../model/types';

/**
 * In-level achievements: one-time material rewards that keep the economy moving.
 * Campaign XP comes only from finishing levels (see content/campaign.ts).
 */
export interface AchievementDef {
  id: string;
  title: string;
  bn?: string;
  materials: number;
  /** State-derived trigger; omitted for action-triggered achievements (harvest, stock). */
  check?: (s: GameState) => boolean;
}

const any = (s: GameState, type: string, f: (b: GameState['buildings'][number]) => boolean) =>
  s.buildings.some((b) => b.type === type && f(b));

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'canal-delivered',
    title: 'First canal delivers water',
    bn: 'প্রথম খাল',
    materials: 0,
    check: (s) => s.grid.canal.some((c, i) => c === 1 && s.grid.water[i] > 0.3),
  },
  {
    id: 'first-irrigation',
    title: 'First irrigation',
    bn: 'প্রথম সেচ',
    materials: 10,
    check: (s) => any(s, 'field', (b) => b.water >= CONFIG.field.wetMoisture),
  },
  { id: 'first-harvest', title: 'First rice harvest', bn: 'প্রথম ফসল', materials: 0 },
  {
    id: 'reservoir-filled',
    title: 'Reservoir filled',
    materials: 25,
    check: (s) => any(s, 'reservoir', (b) => b.water >= CONFIG.reservoir.capacity * 0.75),
  },
  {
    id: 'turbine-power',
    title: 'The wheel spins',
    materials: 25,
    check: (s) => any(s, 'turbine', (b) => b.rate > 0),
  },
  {
    id: 'village-lit',
    title: 'Lights in the village',
    bn: 'গ্রামে আলো',
    materials: 25,
    check: (s) => any(s, 'house', (b) => b.lit),
  },
  {
    id: 'clean-water',
    title: 'First clean water',
    bn: 'বিশুদ্ধ পানি',
    materials: 10,
    check: (s) => any(s, 'treatment', (b) => b.rate > 0),
  },
  {
    id: 'house-supplied',
    title: 'A home receives clean water',
    materials: 30,
    check: (s) => any(s, 'house', (b) => b.supplied),
  },
  { id: 'fish-stocked', title: 'Pond stocked with fish', bn: 'পুকুরে মাছ', materials: 0 },
  { id: 'fish-harvest', title: 'First fish harvest', materials: 25 },
  {
    id: 'wetland-thrives',
    title: 'Wetland thrives',
    bn: 'শাপলা ফুটেছে',
    materials: 15,
    check: (s) => any(s, 'wetland', (b) => b.progress >= CONFIG.wetland.thriveEcology),
  },
  { id: 'floating-harvest', title: 'Floating garden harvest', bn: 'ধাপ চাষ', materials: 0 },
  {
    id: 'village-bloom',
    title: 'Village in Bloom',
    bn: 'গ্রাম জেগেছে',
    materials: 30,
    check: (s) => isVillageInBloom(s),
  },
];

export function isVillageInBloom(s: GameState): boolean {
  const farm = any(s, 'field', (b) => b.active);
  const fish = any(s, 'fishpond', (b) => b.stocked && b.water >= CONFIG.fishpond.minFill);
  const home = any(s, 'house', (b) => b.supplied && b.lit);
  const treated = s.tick - s.lastCleanTick <= 100;
  const wetland = any(s, 'wetland', (b) => b.progress >= CONFIG.wetland.thriveEcology);
  return farm && fish && home && treated && wetland;
}
