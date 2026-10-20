import type { Grid, Terrain } from '../model/types';
import { fbm2, hash01, mix, PALETTE, shade } from './palette';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function soilColor(t: Terrain, elev: number, greenness: number, i: number, x: number, y: number): string {
  const n = fbm2(x * 0.55, y * 0.55, 3);
  const n2 = noisePatch(x, y, i);
  const lift = (elev - 3) * 0.05 + (n - 0.5) * 0.16;
  switch (t) {
    case 'rock':
      return shade(mix('#7A756F', PALETTE.rock, 0.55 + n * 0.2), lift * 0.4);
    case 'basin':
      return shade(mix('#A07A4C', mix('#6F9A54', '#8DB86B', n), greenness * 0.55), lift - 0.08 + n2 * 0.06);
    case 'marsh':
      return shade(mix('#8F8A4E', mix('#4F7D4A', '#6FA85A', n), 0.35 + greenness * 0.65), lift + (n - 0.5) * 0.08);
    case 'foundation':
      return shade(mix('#C9A07A', '#B88862', n), lift + 0.04);
    case 'path':
      return shade(mix(PALETTE.clay, '#D4A07A', n * 0.4), lift + 0.06);
    case 'source':
    case 'river':
    case 'outlet':
      return shade(mix('#8A6E50', '#5E7A4A', greenness * 0.45 + n * 0.1), lift - 0.06);
    default:
      return shade(mix(mix(PALETTE.dryOchre, '#B8894E', n2 * 0.35), mix('#7FB056', PALETTE.freshGreen, n), greenness), lift);
  }
}

function noisePatch(x: number, y: number, i: number): number {
  return fbm2(x * 0.9 + 4, y * 0.9, 9 + (i % 7));
}

function isWaterish(t: Terrain): boolean {
  return t === 'source' || t === 'river' || t === 'outlet' || t === 'marsh' || t === 'basin';
}

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

  const idx = (x: number, y: number) => y * grid.w + x;

  // Smooth colour field sampled inside each tile so edges don't form a grid.
  const samples = 3;
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const i = idx(x, y);
      const t = grid.terrain[i];
      const e = grid.elevation[i];
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = x + (sx + 0.5) / samples;
          const py = y + (sy + 0.5) / samples;
          ctx.fillStyle = soilColor(t, e, greenness, i, px, py);
          ctx.fillRect(x * ts + (sx * ts) / samples, y * ts + (sy * ts) / samples, ts / samples + 0.4, ts / samples + 0.4);
        }
      }
    }
  }

  // Grass blades, clover, wildflowers, dry cracks — baked, so frame cost stays flat.
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const i = idx(x, y);
      const t = grid.terrain[i];
      if (t === 'rock' || t === 'path' || t === 'foundation' || t === 'source' || t === 'river' || t === 'outlet') continue;
      const n = fbm2(x * 0.7, y * 0.7, 21);
      const grassAmt = t === 'marsh' ? 0.85 : t === 'basin' ? 0.35 + greenness * 0.4 : greenness * (0.45 + n * 0.55);
      drawGrassPatch(ctx, x, y, ts, i, grassAmt, t === 'marsh');
      if (grassAmt < 0.28 && t === 'soil' && hash01(i, 9) < 0.22) drawCracks(ctx, x, y, ts, i);
      if (t === 'marsh' || (isWaterish(t) && hash01(i, 44) < 0.35)) drawShapla(ctx, x, y, ts, i, greenness);
      if (t === 'soil' && grassAmt > 0.4 && hash01(i, 51) < 0.12) drawClover(ctx, x, y, ts, i);
      if (t === 'soil' && grassAmt > 0.35 && hash01(i, 62) < 0.08) drawWildflower(ctx, x, y, ts, i);
    }
  }

  // Packed-earth paths with pebbles and worn edges.
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const i = idx(x, y);
      if (grid.terrain[i] !== 'path') continue;
      const px = x * ts;
      const py = y * ts;
      ctx.strokeStyle = 'rgba(90,60,35,0.18)';
      ctx.lineWidth = Math.max(1, ts * 0.04);
      roundRect(ctx, px + ts * 0.08, py + ts * 0.1, ts * 0.84, ts * 0.8, ts * 0.18);
      ctx.stroke();
      for (let k = 0; k < 5; k++) {
        ctx.fillStyle = hash01(i, k + 20) < 0.5 ? 'rgba(255,230,200,0.35)' : 'rgba(90,60,35,0.28)';
        ctx.beginPath();
        ctx.ellipse(px + hash01(i, k + 30) * ts, py + hash01(i, k + 40) * ts, ts * (0.04 + hash01(i, k) * 0.04), ts * 0.03, hash01(i, k + 5), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawTerraces(ctx, grid, ts);
  drawRocks(ctx, grid, ts);
  drawReeds(ctx, grid, ts, greenness);
  drawVegetation(ctx, grid, ts, greenness);
  return c;
}

function drawGrassPatch(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number, i: number, amount: number, lush: boolean) {
  if (amount < 0.05) return;
  const blades = lush ? 10 : Math.round(3 + amount * 9);
  const ox = x * ts;
  const oy = y * ts;
  for (let k = 0; k < blades; k++) {
    const gx = ox + hash01(i, k * 3 + 1) * ts;
    const gy = oy + ts * (0.45 + hash01(i, k * 3 + 2) * 0.5);
    const h = ts * (0.12 + hash01(i, k + 70) * 0.22) * (0.55 + amount);
    const lean = (hash01(i, k + 90) - 0.5) * ts * 0.12;
    const gcol = lush ? mix('#3F7A38', '#6FB45A', hash01(i, k + 4)) : mix('#6A8F3E', '#8FBE5A', hash01(i, k + 4));
    ctx.strokeStyle = gcol;
    ctx.globalAlpha = 0.55 + amount * 0.4;
    ctx.lineWidth = Math.max(0.8, ts * 0.035);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.quadraticCurveTo(gx + lean * 0.4, gy - h * 0.55, gx + lean, gy - h);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
  // Soft tuft bases so grass reads as clumps, not specks.
  if (amount > 0.25) {
    ctx.fillStyle = `rgba(70,120,50,${0.08 + amount * 0.12})`;
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      ctx.ellipse(ox + hash01(i, k + 110) * ts, oy + ts * 0.7 + hash01(i, k + 120) * ts * 0.2, ts * 0.16, ts * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawCracks(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number, i: number) {
  ctx.strokeStyle = 'rgba(110,80,45,0.38)';
  ctx.lineWidth = Math.max(0.6, ts * 0.028);
  ctx.beginPath();
  const cx = x * ts + ts * 0.5;
  const cy = y * ts + ts * 0.5;
  ctx.moveTo(cx - ts * 0.28, cy - ts * 0.08);
  ctx.lineTo(cx - ts * 0.04, cy + ts * 0.06);
  ctx.lineTo(cx + ts * 0.22, cy - ts * 0.14);
  ctx.moveTo(cx - ts * 0.04, cy + ts * 0.06);
  ctx.lineTo(cx + ts * 0.02, cy + ts * 0.28);
  if (hash01(i, 8) < 0.5) {
    ctx.moveTo(cx + ts * 0.1, cy + ts * 0.02);
    ctx.lineTo(cx + ts * 0.3, cy + ts * 0.18);
  }
  ctx.stroke();
}

function drawClover(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number, i: number) {
  const cx = x * ts + hash01(i, 2) * ts;
  const cy = y * ts + hash01(i, 3) * ts;
  ctx.fillStyle = '#4E9A4A';
  for (let p = 0; p < 3; p++) {
    const a = (p / 3) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * ts * 0.05, cy + Math.sin(a) * ts * 0.05, ts * 0.045, ts * 0.028, a, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWildflower(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number, i: number) {
  const cx = x * ts + hash01(i, 5) * ts;
  const cy = y * ts + hash01(i, 6) * ts;
  ctx.strokeStyle = '#4A7A38';
  ctx.lineWidth = Math.max(0.8, ts * 0.03);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + ts * 0.02, cy - ts * 0.16);
  ctx.stroke();
  ctx.fillStyle = hash01(i, 7) < 0.5 ? '#E8C75A' : '#D9786A';
  ctx.beginPath();
  ctx.arc(cx + ts * 0.02, cy - ts * 0.18, ts * 0.045, 0, Math.PI * 2);
  ctx.fill();
}

function drawShapla(ctx: CanvasRenderingContext2D, x: number, y: number, ts: number, i: number, greenness: number) {
  if (greenness < 0.15 && hash01(i, 45) > 0.4) return;
  const cx = x * ts + ts * (0.3 + hash01(i, 46) * 0.4);
  const cy = y * ts + ts * (0.35 + hash01(i, 47) * 0.4);
  ctx.fillStyle = '#5E9F55';
  ctx.beginPath();
  ctx.arc(cx, cy + ts * 0.04, ts * 0.12, 0.25, Math.PI * 2 - 0.15);
  ctx.lineTo(cx, cy + ts * 0.04);
  ctx.fill();
  ctx.fillStyle = PALETTE.shapla;
  for (let p = 0; p < 5; p++) {
    const a = (p / 5) * Math.PI * 2 + hash01(i, 48);
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * ts * 0.05, cy + Math.sin(a) * ts * 0.05, ts * 0.055, ts * 0.028, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#FFF2A8';
  ctx.beginPath();
  ctx.arc(cx, cy, ts * 0.022, 0, Math.PI * 2);
  ctx.fill();
}

function drawTerraces(ctx: CanvasRenderingContext2D, grid: Grid, ts: number) {
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const i = y * grid.w + x;
      const e = grid.elevation[i];
      if (y + 1 < grid.h) {
        const d = e - grid.elevation[i + grid.w];
        if (d > 0) {
          const py = (y + 1) * ts;
          const h = Math.min(ts * 0.28, ts * (0.1 + d * 0.08));
          ctx.fillStyle = `rgba(62,40,22,${Math.min(0.42, 0.16 + d * 0.09)})`;
          ctx.beginPath();
          ctx.moveTo(x * ts, py - h);
          ctx.quadraticCurveTo(x * ts + ts * 0.5, py - h * 0.55, (x + 1) * ts, py - h);
          ctx.lineTo((x + 1) * ts, py);
          ctx.lineTo(x * ts, py);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(255,248,230,0.22)';
          ctx.fillRect(x * ts, py - h - ts * 0.035, ts, ts * 0.035);
        } else if (d < 0) {
          ctx.fillStyle = 'rgba(255,248,230,0.14)';
          ctx.fillRect(x * ts, (y + 1) * ts - ts * 0.05, ts, ts * 0.05);
        }
      }
      if (x + 1 < grid.w) {
        const d = e - grid.elevation[i + 1];
        if (d > 0) {
          ctx.fillStyle = `rgba(50,32,16,${Math.min(0.32, 0.1 + d * 0.07)})`;
          ctx.fillRect((x + 1) * ts - ts * 0.08, y * ts, ts * 0.08, ts);
        } else if (d < 0) {
          ctx.fillStyle = 'rgba(255,248,230,0.1)';
          ctx.fillRect((x + 1) * ts, y * ts, ts * 0.06, ts);
        }
      }
    }
  }
}

function drawRocks(ctx: CanvasRenderingContext2D, grid: Grid, ts: number) {
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const i = y * grid.w + x;
      if (grid.terrain[i] !== 'rock') continue;
      const cx = x * ts + ts * 0.5;
      const cy = y * ts + ts * 0.56;
      ctx.fillStyle = 'rgba(40,30,20,0.28)';
      ctx.beginPath();
      ctx.ellipse(cx + ts * 0.06, cy + ts * 0.22, ts * 0.42, ts * 0.14, 0.1, 0, Math.PI * 2);
      ctx.fill();
      const lobes = 2 + (hash01(i, 2) > 0.5 ? 1 : 0);
      for (let k = 0; k < lobes; k++) {
        const ox = (hash01(i, k + 3) - 0.5) * ts * 0.22;
        const oy = (hash01(i, k + 6) - 0.5) * ts * 0.12;
        ctx.fillStyle = shade(PALETTE.rock, (hash01(i, k) - 0.5) * 0.22);
        ctx.beginPath();
        ctx.ellipse(cx + ox, cy + oy, ts * (0.22 + hash01(i, k + 8) * 0.16), ts * (0.16 + hash01(i, k + 9) * 0.1), -0.25 + k * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.ellipse(cx - ts * 0.12, cy - ts * 0.1, ts * 0.12, ts * 0.06, -0.4, 0, Math.PI * 2);
      ctx.fill();
      if (hash01(i, 12) < 0.55) {
        ctx.fillStyle = 'rgba(70,110,55,0.45)';
        ctx.beginPath();
        ctx.ellipse(cx + ts * 0.08, cy + ts * 0.04, ts * 0.1, ts * 0.05, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawReeds(ctx: CanvasRenderingContext2D, grid: Grid, ts: number, greenness: number) {
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const i = y * grid.w + x;
      const t = grid.terrain[i];
      const nearWater = t === 'river' || t === 'marsh' || t === 'source' || t === 'outlet' || t === 'basin';
      if (!nearWater && t !== 'soil') continue;
      if (!nearWater) {
        const n = (x > 0 && isWaterish(grid.terrain[i - 1])) || (x + 1 < grid.w && isWaterish(grid.terrain[i + 1])) || (y > 0 && isWaterish(grid.terrain[i - grid.w])) || (y + 1 < grid.h && isWaterish(grid.terrain[i + grid.w]));
        if (!n || hash01(i, 14) > 0.45) continue;
      } else if (t !== 'marsh' && hash01(i, 14) > 0.55) continue;
      const bx = x * ts + ts * (0.2 + hash01(i, 15) * 0.6);
      const by = y * ts + ts * 0.82;
      ctx.strokeStyle = mix('#4A6E38', '#6F9A45', greenness);
      ctx.lineWidth = Math.max(0.9, ts * 0.04);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - ts * 0.06, by - ts * 0.42);
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + ts * 0.05, by - ts * 0.48);
      ctx.moveTo(bx + ts * 0.04, by);
      ctx.lineTo(bx + ts * 0.12, by - ts * 0.36);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
  }
}

function dropShadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) {
  ctx.fillStyle = 'rgba(40,25,10,0.22)';
  ctx.beginPath();
  ctx.ellipse(cx + rx * 0.15, cy + ry * 0.55, rx, ry * 0.45, 0.1, 0, Math.PI * 2);
  ctx.fill();
}

function drawVegetation(ctx: CanvasRenderingContext2D, grid: Grid, ts: number, greenness: number) {
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const i = y * grid.w + x;
      if (grid.terrain[i] !== 'soil' && grid.terrain[i] !== 'foundation') continue;
      const r = hash01(i, 77);
      const edge = x === 0 || y === grid.h - 1 || x === grid.w - 1 || y === 0;
      const village = grid.terrain[i] === 'foundation';
      if (village && r > 0.22) continue;
      if (!village && !(edge && r < 0.42) && r >= 0.03) continue;
      const cx = x * ts + ts * 0.5;
      const cy = y * ts + ts * 0.72;
      const kind = hash01(i, 78);
      if (kind < 0.34) {
        dropShadow(ctx, cx, cy, ts * 0.28, ts * 0.14);
        ctx.strokeStyle = '#5A3E22';
        ctx.lineWidth = Math.max(1.2, ts * 0.07);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx, cy - ts * 0.38);
        ctx.stroke();
        ctx.fillStyle = mix('#7FA950', '#4E8A3A', greenness);
        for (let k = 0; k < 5; k++) {
          const a = -0.9 + k * 0.45;
          ctx.beginPath();
          ctx.ellipse(cx + Math.sin(a) * ts * 0.08, cy - ts * 0.42, ts * 0.28, ts * 0.08, a, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (kind < 0.62) {
        dropShadow(ctx, cx, cy, ts * 0.18, ts * 0.1);
        ctx.strokeStyle = mix('#7E9C49', '#5C7A32', greenness);
        ctx.lineWidth = Math.max(1, ts * 0.045);
        for (let k = -1; k <= 1; k++) {
          ctx.beginPath();
          ctx.moveTo(cx + k * ts * 0.1, cy);
          ctx.lineTo(cx + k * ts * 0.16, cy - ts * 0.58);
          ctx.stroke();
          ctx.fillStyle = 'rgba(200,220,140,0.55)';
          ctx.fillRect(cx + k * ts * 0.14, cy - ts * 0.4, ts * 0.04, ts * 0.035);
        }
      } else if (kind < 0.82) {
        dropShadow(ctx, cx, cy, ts * 0.16, ts * 0.1);
        ctx.strokeStyle = '#4A3320';
        ctx.lineWidth = Math.max(1.1, ts * 0.06);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx, cy - ts * 0.55);
        ctx.stroke();
        ctx.fillStyle = mix('#3F7A38', '#2F5E2C', greenness);
        for (let k = 0; k < 5; k++) {
          const py = cy - ts * (0.22 + k * 0.08);
          ctx.beginPath();
          ctx.ellipse(cx, py, ts * (0.16 - k * 0.018), ts * 0.05, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        dropShadow(ctx, cx, cy, ts * 0.22, ts * 0.12);
        ctx.fillStyle = mix('#5C8A40', '#3E6A32', greenness);
        ctx.beginPath();
        ctx.ellipse(cx, cy - ts * 0.18, ts * 0.28, ts * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = mix('#6FA052', '#4E8038', greenness);
        ctx.beginPath();
        ctx.ellipse(cx - ts * 0.08, cy - ts * 0.22, ts * 0.16, ts * 0.14, -0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
