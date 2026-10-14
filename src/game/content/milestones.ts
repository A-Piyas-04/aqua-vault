import { CONFIG } from '../model/config';
import type { GameState } from '../model/types';

export interface AchievementDef {
  id: string;
  title: string;
  bn?: string;
  xp: number;
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
    xp: 25,
    materials: 0,
    check: (s) => s.grid.canal.some((c, i) => c === 1 && s.grid.water[i] > 0.3),
  },
  {
    id: 'first-irrigation',
    title: 'First irrigation',
    bn: 'প্রথম সেচ',
    xp: 35,
    materials: 10,
    check: (s) => any(s, 'field', (b) => b.water >= CONFIG.field.wetMoisture),
  },
  { id: 'first-harvest', title: 'First rice harvest', bn: 'প্রথম ফসল', xp: 30, materials: 0 },
  {
    id: 'reservoir-filled',
    title: 'Reservoir filled',
    xp: 30,
    materials: 25,
    check: (s) => any(s, 'reservoir', (b) => b.water >= CONFIG.reservoir.capacity * 0.75),
  },
  {
    id: 'turbine-power',
    title: 'The wheel spins',
    xp: 50,
    materials: 25,
    check: (s) => any(s, 'turbine', (b) => b.rate > 0),
  },
  {
    id: 'village-lit',
    title: 'Lights in the village',
    bn: 'গ্রামে আলো',
    xp: 50,
    materials: 25,
    check: (s) => any(s, 'house', (b) => b.lit),
  },
  {
    id: 'clean-water',
    title: 'First clean water',
    bn: 'বিশুদ্ধ পানি',
    xp: 60,
    materials: 10,
    check: (s) => any(s, 'treatment', (b) => b.rate > 0),
  },
  {
    id: 'house-supplied',
    title: 'A home receives clean water',
    xp: 50,
    materials: 30,
    check: (s) => any(s, 'house', (b) => b.supplied),
  },
  { id: 'fish-stocked', title: 'Pond stocked with fish', bn: 'পুকুরে মাছ', xp: 45, materials: 0 },
  { id: 'fish-harvest', title: 'First fish harvest', xp: 40, materials: 25 },
  {
    id: 'wetland-thrives',
    title: 'Wetland thrives',
    bn: 'শাপলা ফুটেছে',
    xp: 40,
    materials: 15,
    check: (s) => any(s, 'wetland', (b) => b.progress >= CONFIG.wetland.thriveEcology),
  },
  { id: 'floating-harvest', title: 'Floating garden harvest', bn: 'ধাপ চাষ', xp: 30, materials: 0 },
  {
    id: 'village-bloom',
    title: 'Village in Bloom',
    bn: 'গ্রাম জেগেছে',
    xp: 150,
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

export interface Milestone {
  key: string;
  title: string;
  hint: string;
  achievement: string;
}

export const MILESTONES: Milestone[] = [
  { key: 'A', title: 'First Stream', hint: 'Draw a canal from the rain catchment to the dry rice paddy.', achievement: 'first-irrigation' },
  { key: 'B', title: 'Save the Rain', hint: 'Build a reservoir in the east basin and fill it to 75%.', achievement: 'reservoir-filled' },
  { key: 'C', title: 'Let it Spin', hint: 'Put a waterwheel where flowing water steps downhill.', achievement: 'turbine-power' },
  { key: 'D', title: 'Light the Village', hint: 'Build a battery so waterwheel power lights the homes.', achievement: 'village-lit' },
  { key: 'E', title: 'Every Drop Counts', hint: 'Treat raw water with power and pipe it to a home tap.', achievement: 'house-supplied' },
  { key: 'F', title: 'Living Pond', hint: 'Fill a fish pond, stock it, keep fresh water flowing, then harvest.', achievement: 'fish-harvest' },
  { key: 'G', title: 'Village in Bloom', hint: 'Farm, fish, a lit home with clean water, treatment and a thriving wetland, all at once.', achievement: 'village-bloom' },
];
