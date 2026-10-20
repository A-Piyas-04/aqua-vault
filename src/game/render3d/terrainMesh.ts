import { BufferAttribute, BufferGeometry } from 'three';
import type { GameState } from '../model/types';
import { soilColor } from '../render/terrain';
import { BANK, BASE_Y, channelDepth, col, isChannel, topY } from './units';

/**
 * Builds the diorama ground. Each tile is split into 3 x 3 sub-cells (bank strips plus a
 * centre). Channel tiles carve their centre, and the strips toward connected channels,
 * down into a bed. Walls are emitted wherever two neighbouring sub-cells differ in height,
 * which yields terrace cliffs, canal banks and the slab's outer skirt with one rule.
 */

const EDGES = [0, BANK, 1 - BANK, 1];
const ACCEPTS_WATER = new Set(['reservoir', 'fishpond', 'wetland', 'field', 'treatment']);

export class TerrainBuilder {
  private colorKey = '';
  /** Per tile, a 4 x 4 grid of top-surface colours (linear RGB). */
  private topColors: Float32Array = new Float32Array(0);

  private ensureColors(state: GameState, green: number) {
    const g = state.grid;
    const key = `${state.levelId}|${g.w}x${g.h}|${Math.round(green * 10)}`;
    if (key === this.colorKey) return;
    this.colorKey = key;
    this.topColors = new Float32Array(g.w * g.h * 16 * 3);
    const gb = Math.round(green * 10) / 10;
    for (let i = 0; i < g.w * g.h; i++) {
      const tx = i % g.w;
      const tz = Math.floor(i / g.w);
      for (let cv = 0; cv < 4; cv++) {
        for (let cu = 0; cu < 4; cu++) {
          const c = col(soilColor(g.terrain[i], g.elevation[i], gb, i, tx + EDGES[cu], tz + EDGES[cv]));
          const o = (i * 16 + cv * 4 + cu) * 3;
          this.topColors[o] = c.r;
          this.topColors[o + 1] = c.g;
          this.topColors[o + 2] = c.b;
        }
      }
    }
  }

  build(state: GameState, green: number): BufferGeometry {
    this.ensureColors(state, green);
    const g = state.grid;
    const W = g.w * 3;
    const D = g.h * 3;
    const turbineCells = new Set<number>();
    const typeAt = new Map<number, string>();
    for (const b of state.buildings) {
      if (b.type === 'turbine') turbineCells.add(b.y * g.w + b.x);
      if (b.type === 'floating') continue;
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) typeAt.set(y * g.w + x, b.type);
    }
    const chan = new Uint8Array(g.w * g.h);
    for (let i = 0; i < chan.length; i++) chan[i] = isChannel(state, i, turbineCells) ? 1 : 0;
    const tileAt = (x: number, z: number) => (x < 0 || z < 0 || x >= g.w || z >= g.h ? -1 : z * g.w + x);
    const opensTo = (j: number) => j >= 0 && (chan[j] === 1 || ACCEPTS_WATER.has(typeAt.get(j) ?? ''));

    // Sub-cell heights and "bed" flags.
    const hgt = new Float32Array(W * D);
    const bed = new Uint8Array(W * D);
    for (let z = 0; z < g.h; z++) {
      for (let x = 0; x < g.w; x++) {
        const i = z * g.w + x;
        const top = topY(g, i) + (g.terrain[i] === 'rock' ? 0.04 : g.terrain[i] === 'marsh' ? -0.02 : 0);
        const floor = top - channelDepth(g, i);
        const open = [opensTo(tileAt(x, z - 1)), opensTo(tileAt(x + 1, z)), opensTo(tileAt(x, z + 1)), opensTo(tileAt(x - 1, z))];
        for (let pz = 0; pz < 3; pz++) {
          for (let px = 0; px < 3; px++) {
            let carved = false;
            if (chan[i]) {
              const n = pz === 0 && open[0];
              const s = pz === 2 && open[2];
              const e = px === 2 && open[1];
              const w = px === 0 && open[3];
              if (px === 1 && pz === 1) carved = true;
              else if (px === 1) carved = n || s;
              else if (pz === 1) carved = e || w;
              else {
                // Corner: open only when both sides and the diagonal are channels (wide water).
                const dx = px === 0 ? -1 : 1;
                const dz = pz === 0 ? -1 : 1;
                const side1 = (dz < 0 ? open[0] : open[2]) && chan[tileAt(x, z + dz)] === 1;
                const side2 = (dx < 0 ? open[3] : open[1]) && chan[tileAt(x + dx, z)] === 1;
                const diag = tileAt(x + dx, z + dz);
                carved = side1 && side2 && diag >= 0 && chan[diag] === 1;
              }
            }
            const k = (z * 3 + pz) * W + (x * 3 + px);
            hgt[k] = carved ? floor : top;
            bed[k] = carved ? 1 : 0;
          }
        }
      }
    }

    const pos: number[] = [];
    const clr: number[] = [];
    const subX = (sx: number) => Math.floor(sx / 3) + EDGES[sx % 3];
    const subX1 = (sx: number) => Math.floor(sx / 3) + EDGES[(sx % 3) + 1];
    const BED = col('#4F3D2D');
    const BED_WET = col('#3E5A55');
    const BANK_TINT = col('#8A6B4C');

    const push = (p: number[][], c: number[][], want: [number, number, number]) => {
      // Orient the quad so its face normal points along `want`.
      const [a, b, d] = [p[0], p[1], p[2]];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const flip = nx * want[0] + ny * want[1] + nz * want[2] < 0;
      const order = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
      for (const k of order) {
        pos.push(p[k][0], p[k][1], p[k][2]);
        clr.push(c[k][0], c[k][1], c[k][2]);
      }
    };

    const topColor = (i: number, cu: number, cv: number, out: number[], isBed: boolean, isBankOfChannel: boolean, water: number) => {
      const o = (i * 16 + cv * 4 + cu) * 3;
      let r = this.topColors[o], gg = this.topColors[o + 1], b = this.topColors[o + 2];
      if (isBed) {
        const wet = Math.min(1, water / 3);
        r = BED.r + (BED_WET.r - BED.r) * wet;
        gg = BED.g + (BED_WET.g - BED.g) * wet;
        b = BED.b + (BED_WET.b - BED.b) * wet;
      } else if (isBankOfChannel) {
        r = r * 0.7 + BANK_TINT.r * 0.3;
        gg = gg * 0.7 + BANK_TINT.g * 0.3;
        b = b * 0.7 + BANK_TINT.b * 0.3;
      }
      out[0] = r;
      out[1] = gg;
      out[2] = b;
      return out;
    };

    // Top faces with simple ambient occlusion at the foot of taller neighbours.
    const c0 = [0, 0, 0], c1 = [0, 0, 0], c2 = [0, 0, 0], c3 = [0, 0, 0];
    const aoAt = (sx: number, sz: number, h: number) => {
      let occ = 0;
      const nb = [
        [sx - 1, sz],
        [sx + 1, sz],
        [sx, sz - 1],
        [sx, sz + 1],
      ];
      for (const [ax, az] of nb) {
        if (ax < 0 || az < 0 || ax >= W || az >= D) continue;
        const dh = hgt[az * W + ax] - h;
        if (dh > 0.05) occ += Math.min(1, dh / 0.4);
      }
      return 1 - Math.min(0.35, occ * 0.14);
    };
    for (let sz = 0; sz < D; sz++) {
      for (let sx = 0; sx < W; sx++) {
        const k = sz * W + sx;
        const h = hgt[k];
        const tx = Math.floor(sx / 3);
        const tz = Math.floor(sz / 3);
        const i = tz * g.w + tx;
        const px = sx % 3;
        const pz = sz % 3;
        const x0 = subX(sx), x1 = subX1(sx), z0 = subX(sz), z1 = subX1(sz);
        const isBed = bed[k] === 1;
        const bank = !isBed && chan[i] === 1;
        const water = g.water[i];
        topColor(i, px, pz, c0, isBed, bank, water);
        topColor(i, px, pz + 1, c1, isBed, bank, water);
        topColor(i, px + 1, pz + 1, c2, isBed, bank, water);
        topColor(i, px + 1, pz, c3, isBed, bank, water);
        const ao = aoAt(sx, sz, h);
        for (const c of [c0, c1, c2, c3]) {
          c[0] *= ao;
          c[1] *= ao;
          c[2] *= ao;
        }
        push(
          [
            [x0, h, z0],
            [x0, h, z1],
            [x1, h, z1],
            [x1, h, z0],
          ],
          [c0.slice(), c1.slice(), c2.slice(), c3.slice()],
          [0, 1, 0],
        );
      }
    }

    // Walls between sub-cells (and down to the slab base at the map edge).
    const wallColor = (y: number, upper: number, isBedWall: boolean, out: number[]) => {
      // Earthy strata, darker toward the bottom (fake ambient occlusion).
      const band = (Math.sin(y * 13.0) * 0.5 + 0.5) * 0.06;
      const t = Math.max(0, Math.min(1, (upper - y) / 1.2));
      const top = isBedWall ? [0.32, 0.22, 0.14] : [0.42, 0.29, 0.18];
      const bottom = [0.14, 0.09, 0.06];
      for (let q = 0; q < 3; q++) out[q] = (top[q] + (bottom[q] - top[q]) * t) * (0.94 + band);
      return out;
    };
    const wall = (ax: number, az: number, bx: number, bz: number, lo: number, hi: number, want: [number, number, number], isBedWall: boolean) => {
      if (hi - lo < 1e-4) return;
      push(
        [
          [ax, lo, az],
          [ax, hi, az],
          [bx, hi, bz],
          [bx, lo, bz],
        ],
        [wallColor(lo, hi, isBedWall, [0, 0, 0]), wallColor(hi, hi, isBedWall, [0, 0, 0]), wallColor(hi, hi, isBedWall, [0, 0, 0]), wallColor(lo, hi, isBedWall, [0, 0, 0])],
        want,
      );
    };
    for (let sz = 0; sz < D; sz++) {
      for (let sx = 0; sx < W; sx++) {
        const k = sz * W + sx;
        const h = hgt[k];
        const x0 = subX(sx), x1 = subX1(sx), z0 = subX(sz), z1 = subX1(sz);
        // East neighbour.
        const he = sx + 1 < W ? hgt[k + 1] : BASE_Y;
        if (h > he) wall(x1, z0, x1, z1, he, h, [1, 0, 0], bed[k] === 1 || (sx + 1 < W && bed[k + 1] === 1));
        else if (he > h && sx + 1 < W) wall(x1, z0, x1, z1, h, he, [-1, 0, 0], bed[k] === 1 || bed[k + 1] === 1);
        // South neighbour.
        const hs = sz + 1 < D ? hgt[k + W] : BASE_Y;
        if (h > hs) wall(x0, z1, x1, z1, hs, h, [0, 0, 1], bed[k] === 1 || (sz + 1 < D && bed[k + W] === 1));
        else if (hs > h && sz + 1 < D) wall(x0, z1, x1, z1, h, hs, [0, 0, -1], bed[k] === 1 || bed[k + W] === 1);
        // Map edges on the west and north.
        if (sx === 0) wall(x0, z0, x0, z1, BASE_Y, h, [-1, 0, 0], false);
        if (sz === 0) wall(x0, z0, x1, z0, BASE_Y, h, [0, 0, -1], false);
      }
    }
    // Slab underside so the diorama reads as a solid block from any angle.
    push(
      [
        [0, BASE_Y, 0],
        [g.w, BASE_Y, 0],
        [g.w, BASE_Y, g.h],
        [0, BASE_Y, g.h],
      ],
      [
        [0.1, 0.07, 0.05],
        [0.1, 0.07, 0.05],
        [0.1, 0.07, 0.05],
        [0.1, 0.07, 0.05],
      ],
      [0, -1, 0],
    );

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(clr), 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }
}
