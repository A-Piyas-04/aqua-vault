import type { Terrain } from '../model/types';

/**
 * Hand-authored starter landscape (28x18): a fictional lowland Bangladeshi village.
 * Painted with rectangles so every mission-critical route is reachable downhill.
 *
 *  - NW ridge (elev 6) with the rain catchment (source) and a natural stream (khal)
 *    running east along the top and down the east edge to the SE outlet.
 *  - Center plateau (elev 4) with the starter rice field.
 *  - SW village (elev 3) with four homes on foundations.
 *  - East basin (floor 2, rim 3) for a reservoir; lower basin (floor 1, rim 2) for a fish pond.
 *  - South marsh (elev 1) for wetland / floating gardens.
 *  - The stream drops two steps on the east edge (y 11 -> 12): a natural turbine site.
 */
export interface AuthoredWorld {
  w: number;
  h: number;
  terrain: Terrain[];
  elevation: number[];
  bed: number[];
  houses: { x: number; y: number }[];
  starterField: { x: number; y: number };
  tutorialPath: { x: number; y: number }[];
}

export function authorWorld(w = 28, h = 18, tilt = 0.45): AuthoredWorld {
  const terrain: Terrain[] = new Array(w * h).fill('soil');
  const elevation: number[] = new Array(w * h).fill(0);
  const idx = (x: number, y: number) => y * w + x;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const base = Math.round(5 - x * 0.1 - y * 0.15);
      elevation[idx(x, y)] = Math.max(1, Math.min(5, base));
    }
  }

  const paintElev = (x0: number, y0: number, x1: number, y1: number, e: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) elevation[idx(x, y)] = e;
  };
  const paintTerrain = (x0: number, y0: number, x1: number, y1: number, t: Terrain) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) terrain[idx(x, y)] = t;
  };

  for (let y = 0; y <= 4; y++) for (let x = 0; x <= 6; x++) elevation[idx(x, y)] = Math.max(elevation[idx(x, y)], 5);
  paintElev(0, 0, 5, 3, 6);
  paintElev(6, 4, 13, 9, 4);
  paintElev(0, 10, 7, 17, 3);
  paintElev(16, 2, 23, 8, 3);
  paintElev(17, 3, 21, 8, 2);
  paintElev(17, 9, 23, 14, 2);
  paintElev(18, 10, 22, 13, 1);
  paintElev(8, 13, 16, 17, 1);
  paintElev(24, 0, 27, 11, 3);
  paintElev(24, 12, 27, 17, 1);

  // Rain catchment.
  paintTerrain(1, 1, 2, 2, 'source');
  paintElev(1, 1, 2, 2, 6);

  // Natural stream along the north edge, then down the east edge.
  const streamPath: number[] = [];
  for (let x = 3; x <= 24; x++) {
    terrain[idx(x, 1)] = 'river';
    elevation[idx(x, 1)] = x <= 6 ? 5 : x <= 13 ? 4 : 3;
    streamPath.push(idx(x, 1));
  }
  for (let y = 1; y <= 16; y++) {
    terrain[idx(25, y)] = 'river';
    elevation[idx(25, y)] = y <= 11 ? 3 : y <= 15 ? 1 : 0;
    streamPath.push(idx(25, y));
  }
  terrain[idx(26, 16)] = 'outlet';
  terrain[idx(27, 16)] = 'outlet';

  // Tilt each flat run of the stream slightly downstream so it keeps moving.
  const bed: number[] = new Array(w * h).fill(0);
  let runStart = 0;
  for (let k = 1; k <= streamPath.length; k++) {
    if (k === streamPath.length || elevation[streamPath[k]] !== elevation[streamPath[runStart]]) {
      const len = k - runStart;
      for (let j = 0; j < len; j++) bed[streamPath[runStart + j]] = -tilt * ((j + 1) / (len + 1));
      runStart = k;
    }
  }
  elevation[idx(26, 16)] = 0;
  elevation[idx(27, 16)] = 0;
  elevation[idx(26, 17)] = 0;
  elevation[idx(27, 17)] = 0;

  paintTerrain(17, 3, 21, 7, 'basin');
  paintTerrain(18, 10, 22, 13, 'basin');
  paintTerrain(8, 14, 15, 16, 'marsh');

  // Village block.
  paintTerrain(1, 11, 6, 16, 'foundation');
  paintTerrain(1, 13, 6, 13, 'path');
  const houses = [
    { x: 2, y: 12 },
    { x: 5, y: 12 },
    { x: 2, y: 15 },
    { x: 5, y: 15 },
  ];

  const rocks: [number, number][] = [
    [11, 3], [12, 3], [15, 5], [15, 6], [14, 11], [15, 11], [10, 12],
    [0, 8], [1, 8], [22, 15], [23, 16], [20, 0], [21, 0], [27, 5], [16, 17],
  ];
  for (const [x, y] of rocks) terrain[idx(x, y)] = 'rock';

  return {
    w,
    h,
    terrain,
    elevation,
    bed,
    houses,
    starterField: { x: 8, y: 5 },
    tutorialPath: [
      { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 },
      { x: 5, y: 4 }, { x: 6, y: 4 }, { x: 7, y: 4 }, { x: 7, y: 5 },
    ],
  };
}
