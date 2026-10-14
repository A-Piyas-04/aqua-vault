import type { Grid } from '../model/types';
import { hash01, mix, PALETTE, shade } from './palette';

/**
 * Renders the static landscape (terrain colours, elevation shading, cliffs, rocks,
 * grass tufts) into an offscreen canvas. Rebuilt only when tile size or greenness changes.
 */
export function buildTerrainCache(grid: Grid, ts: number, dpr: number, greenness: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.ceil(grid.w * ts * dpr);
  c.height = Math.ceil(grid.h * ts * dpr);
  const ctx = c.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const soilBase = mix(PALETTE.dryOchre, '#8DB86B', greenness);
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const i = y * grid.w + x;
      const t = grid.terrain[i];
      const e = grid.elevation[i];
      const lift = (e - 3) * 0.045;
      let col: string;
      switch (t) {
        case 'rock':
        case 'soil':
          col = shade(soilBase, lift + (hash01(i) - 0.5) * 0.05);
          break;
        case 'basin':
          col = shade(mix('#A88457', '#7FA466', greenness * 0.7), lift - 0.06);
          break;
        case 'marsh':
          col = shade(mix('#9E9A62', '#6F9A5A', greenness), lift);
          break;
        case 'foundation':
          col = shade('#CFA27A', lift);
          break;
        case 'path':
          col = shade(PALETTE.clay, lift + 0.05);
          break;
        case 'source':
        case 'river':
        case 'outlet':
          col = shade(mix('#9C8466', '#6E8F5E', greenness * 0.6), lift - 0.04);
          break;
        default:
          col = soilBase;
      }
      ctx.fillStyle = col;
      ctx.fillRect(x * ts, y * ts, ts + 0.5, ts + 0.5);

      // Subtle texture speckles.
      if (t === 'soil' || t === 'marsh' || t === 'basin') {
        const n = 3;
        for (let k = 0; k < n; k++) {
          const px = x * ts + hash01(i, k * 3 + 1) * ts;
          const py = y * ts + hash01(i, k * 3 + 2) * ts;
          ctx.fillStyle = greenness > 0.35 && hash01(i, k + 50) < greenness ? 'rgba(60,120,60,0.35)' : 'rgba(120,90,50,0.22)';
          ctx.fillRect(px, py, Math.max(1, ts * 0.06), Math.max(1, ts * 0.06));
        }
        if (t === 'soil' && greenness < 0.3 && hash01(i, 9) < 0.18) {
          // Dry cracks.
          ctx.strokeStyle = 'rgba(110,80,45,0.35)';
          ctx.lineWidth = Math.max(0.6, ts * 0.03);
          ctx.beginPath();
          const cx = x * ts + ts * 0.5;
          const cy = y * ts + ts * 0.5;
          ctx.moveTo(cx - ts * 0.25, cy - ts * 0.1);
          ctx.lineTo(cx, cy + ts * 0.05);
          ctx.lineTo(cx + ts * 0.2, cy - ts * 0.15);
          ctx.moveTo(cx, cy + ts * 0.05);
          ctx.lineTo(cx + ts * 0.05, cy + ts * 0.25);
          ctx.stroke();
        }
        if (t === 'marsh' && hash01(i, 11) < 0.5) {
          ctx.strokeStyle = 'rgba(70,110,60,0.6)';
          ctx.lineWidth = Math.max(0.8, ts * 0.04);
          ctx.beginPath();
          const bx = x * ts + ts * (0.2 + hash01(i, 12) * 0.6);
          const by = y * ts + ts * 0.8;
          ctx.moveTo(bx, by);
          ctx.lineTo(bx - ts * 0.08, by - ts * 0.35);
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + ts * 0.06, by - ts * 0.4);
          ctx.stroke();
        }
      }
      if (t === 'path') {
        ctx.fillStyle = 'rgba(255,230,200,0.25)';
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.arc(x * ts + hash01(i, k + 20) * ts, y * ts + hash01(i, k + 30) * ts, ts * 0.05, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // Cliff shading where the ground steps down (2.5D hint): south and east faces.
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const i = y * grid.w + x;
      const e = grid.elevation[i];
      if (y + 1 < grid.h) {
        const d = e - grid.elevation[i + grid.w];
        if (d > 0) {
          ctx.fillStyle = `rgba(70,45,25,${Math.min(0.45, 0.18 + d * 0.1)})`;
          ctx.fillRect(x * ts, (y + 1) * ts - ts * 0.16, ts, ts * 0.16);
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(x * ts, (y + 1) * ts - ts * 0.2, ts, ts * 0.04);
        } else if (d < 0) {
          ctx.fillStyle = 'rgba(70,45,25,0.12)';
          ctx.fillRect(x * ts, (y + 1) * ts - ts * 0.06, ts, ts * 0.06);
        }
      }
      if (x + 1 < grid.w) {
        const d = e - grid.elevation[i + 1];
        if (d > 0) {
          ctx.fillStyle = `rgba(70,45,25,${Math.min(0.35, 0.12 + d * 0.08)})`;
          ctx.fillRect((x + 1) * ts - ts * 0.1, y * ts, ts * 0.1, ts);
        } else if (d < 0) {
          ctx.fillStyle = 'rgba(70,45,25,0.18)';
          ctx.fillRect((x + 1) * ts, y * ts, ts * 0.08, ts);
        }
      }
    }
  }

  // Rocks and boulders.
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const i = y * grid.w + x;
      if (grid.terrain[i] !== 'rock') continue;
      const cx = x * ts + ts * 0.5;
      const cy = y * ts + ts * 0.55;
      ctx.fillStyle = 'rgba(40,30,20,0.25)';
      ctx.beginPath();
      ctx.ellipse(cx + ts * 0.05, cy + ts * 0.2, ts * 0.4, ts * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(PALETTE.rock, (hash01(i) - 0.5) * 0.15);
      ctx.beginPath();
      ctx.ellipse(cx, cy, ts * 0.38, ts * 0.3, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.ellipse(cx - ts * 0.1, cy - ts * 0.1, ts * 0.14, ts * 0.08, -0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Banana plants and bamboo clumps for flavour along the map edges (decorative).
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const i = y * grid.w + x;
      if (grid.terrain[i] !== 'soil') continue;
      const r = hash01(i, 77);
      const edge = x === 0 || y === grid.h - 1 || x === grid.w - 1 || y === 0;
      if (!(edge && r < 0.35) && !(r < 0.025)) continue;
      const cx = x * ts + ts * 0.5;
      const cy = y * ts + ts * 0.7;
      if (hash01(i, 78) < 0.5) {
        // Banana plant.
        ctx.strokeStyle = '#4E7F3A';
        ctx.lineWidth = Math.max(1, ts * 0.06);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx, cy - ts * 0.35);
        ctx.stroke();
        ctx.fillStyle = mix('#7FA950', '#5C9A45', greenness);
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          ctx.ellipse(cx, cy - ts * 0.38, ts * 0.32, ts * 0.09, (k * Math.PI) / 4 + 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Bamboo clump.
        ctx.strokeStyle = '#7E9C49';
        ctx.lineWidth = Math.max(1, ts * 0.05);
        for (let k = -1; k <= 1; k++) {
          ctx.beginPath();
          ctx.moveTo(cx + k * ts * 0.12, cy);
          ctx.lineTo(cx + k * ts * 0.18, cy - ts * 0.55);
          ctx.stroke();
        }
      }
    }
  }
  return c;
}
