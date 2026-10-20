import { Color } from 'three';
import { CONFIG } from '../model/config';
import { isChannelTerrain } from '../model/buildings';
import type { GameState, Grid } from '../model/types';
import { hexToRgb } from '../render/palette';

/** World units per elevation step (one tile is 1 x 1). */
export const H = 0.42;
/** How far canals and stream beds are carved below the ground. */
export const CANAL_DEPTH = 0.2;
export const RIVER_DEPTH = 0.24;
/** Bottom of the diorama slab. */
export const BASE_Y = -1.1;
/** Width of a channel bank strip, as a fraction of a tile. */
export const BANK = 0.22;

export function topY(g: Grid, i: number): number {
  return g.elevation[i] * H;
}

export function isChannel(state: GameState, i: number, turbineCells?: Set<number>): boolean {
  const g = state.grid;
  return g.canal[i] === 1 || isChannelTerrain(g.terrain[i]) || !!turbineCells?.has(i);
}

export function channelDepth(g: Grid, i: number): number {
  return isChannelTerrain(g.terrain[i]) ? RIVER_DEPTH : CANAL_DEPTH;
}

/** Visual water surface on a tile: sim depth (in elevation steps) mapped into the carved bed. */
export function waterSurfaceY(g: Grid, i: number, water: number, channel: boolean): number {
  const steps = water / CONFIG.water.cellCapacity;
  if (channel) return topY(g, i) - channelDepth(g, i) + 0.035 + steps * H * 0.95;
  return topY(g, i) + 0.012 + Math.min(0.09, steps * H * 0.6);
}

const cache = new Map<string, Color>();
/** Linear-space THREE.Color from a palette string ("#rrggbb" or "rgb(...)"). */
export function col(c: string): Color {
  let v = cache.get(c);
  if (!v) {
    const [r, g, b] = hexToRgb(c);
    v = new Color().setRGB(r / 255, g / 255, b / 255, 'srgb');
    cache.set(c, v);
  }
  return v;
}

export function greenness(state: GameState): number {
  let score = 0;
  for (const b of state.buildings) {
    if (b.type === 'field' && b.active) score += 0.12;
    if (b.type === 'wetland') score += b.progress * 0.25;
    if (b.type === 'fishpond' && b.stocked) score += 0.1;
    if (b.type === 'house' && b.supplied) score += 0.05;
  }
  score += Math.min(0.25, state.achievements.length * 0.025) + state.objectives.done.length * 0.03;
  return Math.max(0, Math.min(1, score));
}
