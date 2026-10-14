import { CONFIG } from '../model/config';
import type { Building, GameState } from '../model/types';
import { storageCapacity } from '../model/buildings';
import { fieldStage, isRipe } from '../sim/consumers';
import { energyCapacity } from '../sim/power';
import { hash01, mix, PALETTE, shade } from './palette';

export interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  ts: number;
  ox: number;
  oy: number;
  time: number;
  reducedMotion: boolean;
  state: GameState;
  /** Visual-only accumulated wheel angles keyed by building id. */
  angles: Map<number, number>;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function shadow(d: DrawCtx, x: number, y: number, w: number, h: number) {
  const { ctx, ts } = d;
  ctx.fillStyle = 'rgba(40,25,10,0.22)';
  roundRect(ctx, x + ts * 0.06, y + ts * 0.1, w, h, ts * 0.18);
  ctx.fill();
}

function waterColor(level: number, murk = 0): string {
  return mix(mix(PALETTE.rain, PALETTE.deepWater, Math.min(1, level * 1.2)), '#6E7F3E', murk);
}

export function drawBuilding(d: DrawCtx, b: Building): void {
  const { ts, ox, oy } = d;
  const x = ox + b.x * ts;
  const y = oy + b.y * ts;
  const w = b.w * ts;
  const h = b.h * ts;
  switch (b.type) {
    case 'field':
      return drawField(d, b, x, y, w, h);
    case 'reservoir':
      return drawReservoir(d, b, x, y, w, h);
    case 'fishpond':
      return drawPond(d, b, x, y, w, h);
    case 'wetland':
      return drawWetland(d, b, x, y, w, h);
    case 'turbine':
      return drawTurbine(d, b, x, y);
    case 'battery':
      return drawBattery(d, x, y);
    case 'treatment':
      return drawTreatment(d, b, x, y, w, h);
    case 'connector':
      return drawConnector(d, b, x, y);
    case 'house':
      return drawHouse(d, b, x, y);
    case 'floating':
      return drawFloating(d, b, x, y);
    case 'pump':
      return drawPump(d, b, x, y);
    case 'fountain':
      return drawFountain(d, b, x, y);
  }
}

function drawField(d: DrawCtx, b: Building, x: number, y: number, w: number, h: number) {
  const { ctx, ts, time } = d;
  const moist = Math.min(1, b.water / CONFIG.field.moistureCap);
  const stage = fieldStage(b);
  // Bund: outer shadow, packed earth, inner highlight so the paddy reads as a raised bed.
  ctx.fillStyle = 'rgba(40,25,10,0.22)';
  roundRect(ctx, x + ts * 0.06, y + ts * 0.1, w - ts * 0.08, h - ts * 0.1, ts * 0.18);
  ctx.fill();
  ctx.fillStyle = mix('#C9A07A', '#A87850', 0.25);
  roundRect(ctx, x + ts * 0.03, y + ts * 0.03, w - ts * 0.06, h - ts * 0.06, ts * 0.16);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,236,210,0.35)';
  ctx.fillRect(x + ts * 0.08, y + ts * 0.05, w - ts * 0.16, ts * 0.05);
  const ix = x + ts * 0.16;
  const iy = y + ts * 0.16;
  const iw = w - ts * 0.32;
  const ih = h - ts * 0.32;
  const dry = mix('#C9A062', '#8A6840', 0.35);
  const wet = mix('#5A4634', '#3E4A38', 0.4);
  const g = ctx.createLinearGradient(ix, iy, ix, iy + ih);
  g.addColorStop(0, mix(dry, wet, moist * 0.7));
  g.addColorStop(1, mix(dry, wet, Math.min(1, moist * 1.1)));
  ctx.fillStyle = g;
  roundRect(ctx, ix, iy, iw, ih, ts * 0.08);
  ctx.fill();
  if (moist > 0.12) {
    ctx.fillStyle = `rgba(90,170,190,${0.12 + moist * 0.38})`;
    roundRect(ctx, ix, iy, iw, ih, ts * 0.08);
    ctx.fill();
    ctx.strokeStyle = `rgba(210,235,245,${0.15 + moist * 0.25})`;
    ctx.lineWidth = Math.max(1, ts * 0.03);
    roundRect(ctx, ix + 1, iy + 1, iw - 2, ih - 2, ts * 0.08);
    ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(90,60,30,0.4)';
    ctx.lineWidth = Math.max(0.7, ts * 0.025);
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const sx = ix + hash01(b.id, k) * iw;
      const sy = iy + hash01(b.id, k + 9) * ih;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + ts * 0.15, sy + ts * 0.08);
      ctx.lineTo(sx + ts * 0.2, sy - ts * 0.06);
    }
    ctx.stroke();
  }
  const progressInStage = (b.progress % CONFIG.field.ticksPerStage) / CONFIG.field.ticksPerStage;
  const grow = stage >= 3 ? 3 : stage + Math.min(1, progressInStage * 1.15);
  if (grow > 0.12) {
    const rows = 4;
    const cols = 5;
    const color = stage >= 3 ? PALETTE.riceGold : stage >= 2 ? PALETTE.freshGreen : '#9CCB6E';
    const height = ts * (0.1 + Math.min(grow, 3) * 0.11);
    ctx.lineCap = 'round';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const px = ix + ((c + 0.5) / cols) * iw;
        const py = iy + ((r + 0.82) / rows) * ih;
        const sway = d.reducedMotion ? 0 : Math.sin(time * 1.5 + b.id + r * 0.4 + c * 0.3) * ts * (0.02 + Math.min(grow, 3) * 0.012);
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, ts * (0.035 + Math.min(grow, 3) * 0.012));
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.quadraticCurveTo(px - ts * 0.02 + sway * 0.4, py - height * 0.5, px - ts * 0.05 + sway, py - height);
        ctx.moveTo(px, py);
        ctx.quadraticCurveTo(px + ts * 0.02 + sway * 0.4, py - height * 0.45, px + ts * 0.05 + sway, py - height * 0.92);
        ctx.stroke();
        if (stage >= 3) {
          ctx.fillStyle = '#E9CB73';
          ctx.beginPath();
          ctx.ellipse(px + sway + ts * 0.02, py - height, ts * 0.04, ts * 0.07, 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.lineCap = 'butt';
  }
  if (isRipe(b)) badge(d, x + w - ts * 0.25, y + ts * 0.2, PALETTE.riceGold, 'sickle');
}

function badge(d: DrawCtx, cx: number, cy: number, color: string, kind: 'sickle' | 'fish' | 'leaf') {
  const { ctx, ts, time } = d;
  const bob = d.reducedMotion ? 0 : Math.sin(time * 3) * ts * 0.05;
  const r = Math.max(7, ts * 0.24);
  ctx.fillStyle = 'rgba(30,30,30,0.25)';
  ctx.beginPath();
  ctx.arc(cx + 1, cy + 2 + bob, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFF8E6';
  ctx.beginPath();
  ctx.arc(cx, cy + bob, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, r * 0.22);
  ctx.stroke();
  ctx.strokeStyle = '#5B4630';
  ctx.lineWidth = Math.max(1.2, r * 0.18);
  ctx.beginPath();
  if (kind === 'sickle') {
    ctx.arc(cx + r * 0.1, cy + bob - r * 0.05, r * 0.45, Math.PI * 0.9, Math.PI * 2.1);
    ctx.moveTo(cx - r * 0.35, cy + bob);
    ctx.lineTo(cx - r * 0.5, cy + bob + r * 0.5);
  } else if (kind === 'fish') {
    ctx.ellipse(cx - r * 0.1, cy + bob, r * 0.4, r * 0.22, 0, 0, Math.PI * 2);
    ctx.moveTo(cx + r * 0.3, cy + bob);
    ctx.lineTo(cx + r * 0.55, cy + bob - r * 0.25);
    ctx.lineTo(cx + r * 0.55, cy + bob + r * 0.25);
    ctx.closePath();
  } else {
    ctx.ellipse(cx, cy + bob, r * 0.25, r * 0.45, 0.6, 0, Math.PI * 2);
  }
  ctx.stroke();
}

function drawReservoir(d: DrawCtx, b: Building, x: number, y: number, w: number, h: number) {
  const { ctx, ts, time } = d;
  const level = b.water / storageCapacity('reservoir');
  shadow(d, x + ts * 0.05, y + ts * 0.05, w - ts * 0.1, h - ts * 0.1);
  ctx.fillStyle = '#A59A8C';
  roundRect(ctx, x + ts * 0.05, y + ts * 0.05, w - ts * 0.1, h - ts * 0.1, ts * 0.35);
  ctx.fill();
  // Stone texture.
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(x + w / 2 + Math.cos(a) * (w / 2 - ts * 0.15), y + h / 2 + Math.sin(a) * (h / 2 - ts * 0.15), ts * 0.09, ts * 0.06, a, 0, Math.PI * 2);
    ctx.fill();
  }
  const inset = ts * 0.24;
  ctx.fillStyle = '#6B5643';
  roundRect(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2, ts * 0.25);
  ctx.fill();
  if (level > 0.005) {
    const shore = (1 - Math.min(1, level)) * ts * 0.35;
    const wx = x + inset + shore;
    const wy = y + inset + shore;
    const ww = w - (inset + shore) * 2;
    const wh = h - (inset + shore) * 2;
    const grad = ctx.createRadialGradient(wx + ww * 0.45, wy + wh * 0.4, ts * 0.1, wx + ww * 0.5, wy + wh * 0.55, Math.max(ww, wh) * 0.7);
    grad.addColorStop(0, mix(PALETTE.rain, PALETTE.cleanWater, 0.35));
    grad.addColorStop(0.55, waterColor(level));
    grad.addColorStop(1, PALETTE.deepWater);
    ctx.fillStyle = grad;
    roundRect(ctx, wx, wy, ww, wh, ts * 0.22);
    ctx.fill();
    ctx.fillStyle = 'rgba(220,238,245,0.22)';
    roundRect(ctx, wx + ww * 0.08, wy + wh * 0.08, ww * 0.45, wh * 0.22, ts * 0.12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = Math.max(1, ts * 0.04);
    roundRect(ctx, wx + 1, wy + 1, ww - 2, wh - 2, ts * 0.2);
    ctx.stroke();
    waves(d, wx, wy, ww, wh, b.id, Math.min(1, b.flow + 0.2));
  }
  // Level gauge on the rim.
  ctx.fillStyle = 'rgba(30,30,30,0.35)';
  ctx.fillRect(x + w - ts * 0.2, y + ts * 0.35, ts * 0.08, h - ts * 0.7);
  ctx.fillStyle = PALETTE.cleanWater;
  const gh = (h - ts * 0.7) * Math.min(1, level);
  ctx.fillRect(x + w - ts * 0.2, y + h - ts * 0.35 - gh, ts * 0.08, gh);
  void time;
}

function waves(d: DrawCtx, x: number, y: number, w: number, h: number, seed: number, intensity: number) {
  if (w <= 2 || h <= 2) return;
  const { ctx, ts, time } = d;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = `rgba(255,255,255,${0.18 + 0.2 * intensity})`;
  ctx.lineWidth = Math.max(1, ts * 0.04);
  const n = Math.max(2, Math.floor((w * h) / (ts * ts * 1.2)));
  for (let k = 0; k < n; k++) {
    const t = d.reducedMotion ? 0 : time * 0.25 + hash01(seed, k);
    const px = x + ((hash01(seed, k + 40) * w + t * ts * 0.6) % w);
    const py = y + hash01(seed, k + 80) * h;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px + ts * 0.12, py - ts * 0.06, px + ts * 0.24, py);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPond(d: DrawCtx, b: Building, x: number, y: number, w: number, h: number) {
  const { ctx, ts, time } = d;
  const cap = storageCapacity('fishpond');
  const level = b.water / cap;
  shadow(d, x + ts * 0.08, y + ts * 0.08, w - ts * 0.16, h - ts * 0.16);
  ctx.fillStyle = '#8A6B4C';
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2, w / 2 - ts * 0.06, h / 2 - ts * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5D4A37';
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2, w / 2 - ts * 0.22, h / 2 - ts * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  if (level > 0.005) {
    const shrink = (1 - Math.min(1, level)) * ts * 0.4;
    const rx = w / 2 - ts * 0.22 - shrink;
    const ry = h / 2 - ts * 0.22 - shrink;
    const murk = Math.max(0, 0.6 - b.quality) * 0.9;
    const grad = ctx.createRadialGradient(x + w * 0.42, y + h * 0.38, ts * 0.15, x + w / 2, y + h / 2, Math.max(rx, ry));
    grad.addColorStop(0, mix(PALETTE.rain, PALETTE.cleanWater, 0.4));
    grad.addColorStop(0.55, waterColor(level, murk));
    grad.addColorStop(1, mix(PALETTE.deepWater, '#1A4A58', 0.3));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(220,238,245,0.2)';
    ctx.beginPath();
    ctx.ellipse(x + w * 0.42, y + h * 0.38, rx * 0.45, ry * 0.22, -0.4, 0, Math.PI * 2);
    ctx.fill();
    if (level > 0.3) {
      for (let k = 0; k < 5; k++) {
        const a = hash01(b.id, k) * Math.PI * 2;
        const px = x + w / 2 + Math.cos(a) * rx * 0.72;
        const py = y + h / 2 + Math.sin(a) * ry * 0.72;
        ctx.fillStyle = mix('#4E8A48', '#6FB45A', hash01(b.id, k + 2));
        ctx.beginPath();
        ctx.arc(px, py, ts * 0.14, 0.28, Math.PI * 2 - 0.18);
        ctx.lineTo(px, py);
        ctx.fill();
        if (hash01(b.id, k + 3) < 0.45) {
          ctx.fillStyle = PALETTE.shapla;
          ctx.beginPath();
          ctx.arc(px + ts * 0.02, py - ts * 0.02, ts * 0.04, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    if (b.stocked) {
      const n = 6;
      const size = ts * (0.08 + b.progress * 0.1);
      for (let k = 0; k < n; k++) {
        const speed = 0.35 + hash01(b.id, k + 10) * 0.35;
        const t = d.reducedMotion ? hash01(b.id, k) * 6 : time * speed + hash01(b.id, k) * 6;
        const fx = x + w / 2 + Math.cos(t) * rx * 0.55;
        const fy = y + h / 2 + Math.sin(t * 1.3) * ry * 0.5;
        const heading = Math.atan2(Math.cos(t * 1.3) * 1.3 * ry * 0.5, -Math.sin(t) * rx * 0.55);
        ctx.save();
        ctx.translate(fx, fy);
        ctx.rotate(heading);
        ctx.fillStyle = k % 3 === 0 ? '#E58B4A' : k % 3 === 1 ? '#C9CED3' : '#E2B45A';
        ctx.beginPath();
        ctx.ellipse(0, 0, size, size * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-size * 0.9, 0);
        ctx.lineTo(-size * 1.5, -size * 0.45);
        ctx.lineTo(-size * 1.5, size * 0.45);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    waves(d, x + w / 2 - rx * 0.7, y + h / 2 - ry * 0.7, rx * 1.4, ry * 1.4, b.id, Math.min(1, b.inflowAvg));
  }
  if (isRipe(b)) badge(d, x + w - ts * 0.3, y + ts * 0.3, '#E58B4A', 'fish');
  void time;
}

function drawWetland(d: DrawCtx, b: Building, x: number, y: number, w: number, h: number) {
  const { ctx, ts, time } = d;
  const level = b.water / storageCapacity('wetland');
  const eco = b.progress;
  ctx.fillStyle = mix('#7E8A4E', '#4F7D4A', eco);
  roundRect(ctx, x + ts * 0.06, y + ts * 0.06, w - ts * 0.12, h - ts * 0.12, ts * 0.4);
  ctx.fill();
  if (level > 0.02) {
    ctx.fillStyle = `rgba(90,170,190,${0.25 + Math.min(1, level) * 0.5})`;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.ellipse(
        x + w * (0.25 + hash01(b.id, k) * 0.5),
        y + h * (0.25 + hash01(b.id, k + 5) * 0.5),
        ts * (0.3 + level * 0.35),
        ts * (0.2 + level * 0.25),
        hash01(b.id, k + 7) * 3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  const reeds = Math.round(3 + eco * 14);
  ctx.strokeStyle = '#3F6B35';
  ctx.lineWidth = Math.max(1, ts * 0.04);
  const sway = d.reducedMotion ? 0 : Math.sin(time * 1.3 + b.id) * ts * 0.04;
  ctx.beginPath();
  for (let k = 0; k < reeds; k++) {
    const px = x + ts * 0.2 + hash01(b.id, k + 20) * (w - ts * 0.4);
    const py = y + ts * 0.3 + hash01(b.id, k + 40) * (h - ts * 0.4);
    ctx.moveTo(px, py);
    ctx.lineTo(px + sway, py - ts * (0.25 + hash01(b.id, k + 60) * 0.2));
  }
  ctx.stroke();
  const flowers = Math.round(eco * 6);
  for (let k = 0; k < flowers; k++) {
    const px = x + ts * 0.3 + hash01(b.id, k + 90) * (w - ts * 0.6);
    const py = y + ts * 0.3 + hash01(b.id, k + 110) * (h - ts * 0.6);
    ctx.fillStyle = '#5E9F55';
    ctx.beginPath();
    ctx.arc(px, py + ts * 0.04, ts * 0.11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.shapla;
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(px + Math.cos(a) * ts * 0.05, py + Math.sin(a) * ts * 0.05, ts * 0.06, ts * 0.03, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#FFF2A8';
    ctx.beginPath();
    ctx.arc(px, py, ts * 0.025, 0, Math.PI * 2);
    ctx.fill();
  }
  if (eco > 0.6) {
    ctx.fillStyle = '#3E7F3A';
    const hop = d.reducedMotion ? 0 : Math.max(0, Math.sin(time * 2 + b.id)) * ts * 0.08;
    ctx.beginPath();
    ctx.ellipse(x + w * 0.7, y + h * 0.7 - hop, ts * 0.08, ts * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (eco > 0.8 && !d.reducedMotion) {
    ctx.strokeStyle = '#2F3B44';
    ctx.lineWidth = Math.max(1, ts * 0.035);
    const bx = x + w * 0.5 + Math.sin(time * 0.4 + b.id) * w * 0.4;
    const by = y + h * 0.2 + Math.cos(time * 0.6) * ts * 0.2;
    const flap = Math.sin(time * 8) * ts * 0.06;
    ctx.beginPath();
    ctx.moveTo(bx - ts * 0.14, by - flap);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx + ts * 0.14, by - flap);
    ctx.stroke();
  }
}

function drawTurbine(d: DrawCtx, b: Building, x: number, y: number) {
  const { ctx, ts } = d;
  const cx = x + ts / 2;
  const cy = y + ts / 2;
  const r = ts * 0.42;
  const angle = d.angles.get(b.id) ?? 0;
  ctx.fillStyle = 'rgba(40,25,10,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx + ts * 0.05, cy + ts * 0.1, r, r * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.strokeStyle = '#7A5532';
  ctx.lineWidth = Math.max(1.5, ts * 0.08);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, ts * 0.05);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.stroke();
    ctx.fillStyle = '#A27A4E';
    ctx.fillRect(Math.cos(a) * r - ts * 0.05, Math.sin(a) * r - ts * 0.05, ts * 0.1, ts * 0.1);
  }
  ctx.restore();
  ctx.fillStyle = b.active ? '#FFD38A' : '#6B6B6B';
  ctx.beginPath();
  ctx.arc(cx, cy, ts * 0.09, 0, Math.PI * 2);
  ctx.fill();
  if (b.active && !d.reducedMotion) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let k = 0; k < 3; k++) {
      const a = d.time * 6 + k * 2;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r * 1.05, cy + r * 0.6 + Math.abs(Math.sin(a)) * ts * 0.1, ts * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawBattery(d: DrawCtx, x: number, y: number) {
  const { ctx, ts, state } = d;
  const frac = state.resources.energy / energyCapacity(state);
  shadow(d, x + ts * 0.15, y + ts * 0.15, ts * 0.7, ts * 0.72);
  ctx.fillStyle = '#4C5B66';
  roundRect(ctx, x + ts * 0.15, y + ts * 0.18, ts * 0.7, ts * 0.68, ts * 0.1);
  ctx.fill();
  ctx.fillStyle = '#C9B26A';
  ctx.fillRect(x + ts * 0.3, y + ts * 0.1, ts * 0.12, ts * 0.1);
  ctx.fillRect(x + ts * 0.58, y + ts * 0.1, ts * 0.12, ts * 0.1);
  for (let k = 0; k < 4; k++) {
    const on = frac > k / 4 + 0.01;
    ctx.fillStyle = on ? '#FFD38A' : 'rgba(255,255,255,0.15)';
    ctx.fillRect(x + ts * 0.25, y + ts * (0.72 - k * 0.13), ts * 0.5, ts * 0.09);
  }
}

function drawTreatment(d: DrawCtx, b: Building, x: number, y: number, w: number, h: number) {
  const { ctx, ts, time } = d;
  const T = CONFIG.treatment;
  shadow(d, x + ts * 0.08, y + ts * 0.1, w - ts * 0.16, h - ts * 0.16);
  ctx.fillStyle = '#D9D4CB';
  roundRect(ctx, x + ts * 0.08, y + ts * 0.1, w - ts * 0.16, h - ts * 0.18, ts * 0.15);
  ctx.fill();
  // Stage 1: filter (sand and gravel layers).
  const fx = x + ts * 0.2;
  const fy = y + ts * 0.25;
  const colors = ['#E7D5A8', '#C8AD7A', '#9A8268', '#6E6156'];
  colors.forEach((c, k) => {
    ctx.fillStyle = c;
    ctx.fillRect(fx, fy + k * ts * 0.14, ts * 0.5, ts * 0.14);
  });
  const rawFrac = Math.min(1, b.water / T.rawCap);
  ctx.fillStyle = 'rgba(119,191,212,0.65)';
  ctx.fillRect(fx, fy - ts * 0.08, ts * 0.5 * rawFrac, ts * 0.06);
  // Stage 2: disinfection chamber (heat glow when active).
  const dx = x + ts * 0.85;
  const dy = y + ts * 0.25;
  ctx.fillStyle = '#7D8790';
  roundRect(ctx, dx, dy, ts * 0.45, ts * 0.56, ts * 0.08);
  ctx.fill();
  if (b.active) {
    const pulse = d.reducedMotion ? 0.7 : 0.55 + 0.35 * Math.sin(time * 5);
    ctx.fillStyle = `rgba(255,150,70,${pulse})`;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      ctx.moveTo(dx + ts * 0.08, dy + ts * (0.15 + k * 0.14));
      ctx.lineTo(dx + ts * 0.37, dy + ts * (0.15 + k * 0.14));
    }
    ctx.strokeStyle = `rgba(255,150,70,${pulse})`;
    ctx.lineWidth = Math.max(1, ts * 0.05);
    ctx.stroke();
  }
  // Stage 3: protected clean-water tank.
  const tx = x + ts * 1.45;
  const ty = y + ts * 0.2;
  const tw = ts * 0.4;
  const th = ts * 1.45;
  ctx.fillStyle = '#E9F1F4';
  roundRect(ctx, tx, ty, tw, th, ts * 0.18);
  ctx.fill();
  const cleanFrac = Math.min(1, b.clean / T.cleanCap);
  ctx.fillStyle = PALETTE.cleanWater;
  ctx.save();
  roundRect(ctx, tx, ty, tw, th, ts * 0.18);
  ctx.clip();
  ctx.fillRect(tx, ty + th * (1 - cleanFrac), tw, th * cleanFrac);
  ctx.restore();
  ctx.strokeStyle = '#8FA3AD';
  ctx.lineWidth = Math.max(1, ts * 0.04);
  roundRect(ctx, tx, ty, tw, th, ts * 0.18);
  ctx.stroke();
  // Stage indicators: raw (drop), power (bolt), clean (check). Shape + colour.
  const iy = y + h - ts * 0.38;
  indicator(d, x + ts * 0.35, iy, b.water >= T.rawPerTick, 'drop');
  indicator(d, x + ts * 0.75, iy, b.status !== 'treatNoPower' && b.active, 'bolt');
  indicator(d, x + ts * 1.15, iy, b.active, 'check');
}

function indicator(d: DrawCtx, cx: number, cy: number, on: boolean, kind: 'drop' | 'bolt' | 'check') {
  const { ctx, ts } = d;
  const r = ts * 0.14;
  ctx.fillStyle = on ? (kind === 'bolt' ? '#FFD38A' : kind === 'drop' ? '#77BFD4' : '#9BE3B0') : '#5C6168';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = on ? '#2B3A44' : '#A8ADB3';
  ctx.lineWidth = Math.max(1, ts * 0.035);
  ctx.beginPath();
  if (kind === 'drop') {
    ctx.moveTo(cx, cy - r * 0.6);
    ctx.quadraticCurveTo(cx + r * 0.55, cy + r * 0.1, cx, cy + r * 0.5);
    ctx.quadraticCurveTo(cx - r * 0.55, cy + r * 0.1, cx, cy - r * 0.6);
  } else if (kind === 'bolt') {
    ctx.moveTo(cx + r * 0.15, cy - r * 0.6);
    ctx.lineTo(cx - r * 0.25, cy + r * 0.05);
    ctx.lineTo(cx + r * 0.15, cy + r * 0.05);
    ctx.lineTo(cx - r * 0.15, cy + r * 0.6);
  } else {
    ctx.moveTo(cx - r * 0.45, cy);
    ctx.lineTo(cx - r * 0.1, cy + r * 0.4);
    ctx.lineTo(cx + r * 0.5, cy - r * 0.4);
  }
  ctx.stroke();
}

function drawConnector(d: DrawCtx, b: Building, x: number, y: number) {
  const { ctx, ts, time } = d;
  ctx.fillStyle = '#7F8C93';
  ctx.fillRect(x + ts * 0.42, y + ts * 0.25, ts * 0.16, ts * 0.6);
  ctx.fillRect(x + ts * 0.42, y + ts * 0.25, ts * 0.32, ts * 0.12);
  ctx.fillStyle = '#B8C4CA';
  ctx.beginPath();
  ctx.arc(x + ts * 0.5, y + ts * 0.85, ts * 0.18, Math.PI, 0);
  ctx.fill();
  if (b.active) {
    const t = d.reducedMotion ? 0.5 : (time * 1.5) % 1;
    ctx.fillStyle = PALETTE.cleanWater;
    ctx.beginPath();
    ctx.arc(x + ts * 0.7, y + ts * (0.42 + t * 0.35), ts * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
}

const WALLS = ['#7FC4B8', '#F2B5A0', '#F4D58D', '#A9C5E8'];

function drawHouse(d: DrawCtx, b: Building, x: number, y: number) {
  const { ctx, ts } = d;
  const wall = WALLS[b.id % WALLS.length];
  shadow(d, x + ts * 0.1, y + ts * 0.25, ts * 0.85, ts * 0.7);
  ctx.fillStyle = shade(wall, -0.05);
  ctx.fillRect(x + ts * 0.14, y + ts * 0.42, ts * 0.72, ts * 0.48);
  // Tin roof (corrugated).
  ctx.fillStyle = '#9AACB5';
  ctx.beginPath();
  ctx.moveTo(x + ts * 0.02, y + ts * 0.48);
  ctx.lineTo(x + ts * 0.22, y + ts * 0.1);
  ctx.lineTo(x + ts * 0.78, y + ts * 0.1);
  ctx.lineTo(x + ts * 0.98, y + ts * 0.48);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,75,85,0.45)';
  ctx.lineWidth = Math.max(0.6, ts * 0.025);
  ctx.beginPath();
  for (let k = 1; k < 7; k++) {
    const t = k / 7;
    ctx.moveTo(x + ts * (0.22 + 0.56 * t), y + ts * 0.1);
    ctx.lineTo(x + ts * (0.02 + 0.96 * t), y + ts * 0.48);
  }
  ctx.stroke();
  ctx.fillStyle = '#6B4A33';
  ctx.fillRect(x + ts * 0.44, y + ts * 0.6, ts * 0.16, ts * 0.3);
  ctx.fillStyle = b.lit ? PALETTE.homeGlow : '#4E4740';
  ctx.fillRect(x + ts * 0.2, y + ts * 0.55, ts * 0.16, ts * 0.14);
  ctx.fillRect(x + ts * 0.66, y + ts * 0.55, ts * 0.14, ts * 0.14);
  if (b.supplied || b.progress > 0) {
    // Clean water pot (kolshi) by the door.
    ctx.fillStyle = '#4FA3C7';
    ctx.beginPath();
    ctx.arc(x + ts * 0.86, y + ts * 0.86, ts * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
  if (b.progress > 200) {
    ctx.fillStyle = '#5FAB67';
    ctx.beginPath();
    ctx.arc(x + ts * 0.12, y + ts * 0.86, ts * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F28FB1';
    ctx.beginPath();
    ctx.arc(x + ts * 0.12, y + ts * 0.8, ts * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawHouseGlow(d: DrawCtx, b: Building, darkness: number) {
  if (!b.lit || darkness <= 0.05) return;
  const { ctx, ts, ox, oy } = d;
  const cx = ox + b.x * ts + ts * 0.5;
  const cy = oy + b.y * ts + ts * 0.62;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, ts * 1.1);
  g.addColorStop(0, `rgba(255,211,138,${0.55 * darkness * 2})`);
  g.addColorStop(1, 'rgba(255,211,138,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - ts * 1.2, cy - ts * 1.2, ts * 2.4, ts * 2.4);
  ctx.fillStyle = PALETTE.homeGlow;
  ctx.fillRect(ox + b.x * ts + ts * 0.2, oy + b.y * ts + ts * 0.55, ts * 0.16, ts * 0.14);
  ctx.fillRect(ox + b.x * ts + ts * 0.66, oy + b.y * ts + ts * 0.55, ts * 0.14, ts * 0.14);
}

function drawFloating(d: DrawCtx, b: Building, x: number, y: number) {
  const { ctx, ts, time } = d;
  const bob = d.reducedMotion ? 0 : Math.sin(time * 1.2 + b.id) * ts * 0.04;
  ctx.fillStyle = '#8B6A3E';
  roundRect(ctx, x + ts * 0.12, y + ts * 0.25 + bob, ts * 0.76, ts * 0.5, ts * 0.12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,230,180,0.4)';
  ctx.lineWidth = Math.max(0.6, ts * 0.02);
  ctx.beginPath();
  for (let k = 1; k < 5; k++) {
    ctx.moveTo(x + ts * (0.12 + k * 0.15), y + ts * 0.25 + bob);
    ctx.lineTo(x + ts * (0.12 + k * 0.15), y + ts * 0.75 + bob);
  }
  ctx.stroke();
  const leaves = 3 + Math.round(b.progress * 5);
  for (let k = 0; k < leaves; k++) {
    ctx.fillStyle = '#5FAB67';
    const px = x + ts * (0.22 + hash01(b.id, k) * 0.56);
    const py = y + ts * (0.35 + hash01(b.id, k + 9) * 0.3) + bob;
    ctx.beginPath();
    ctx.ellipse(px, py, ts * 0.07, ts * 0.04, hash01(b.id, k + 3) * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (b.progress > 0.5) {
    ctx.fillStyle = b.progress >= 1 ? '#E2563E' : '#E9A23B';
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(x + ts * (0.3 + k * 0.2), y + ts * 0.48 + bob, ts * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (isRipe(b)) badge(d, x + ts * 0.8, y + ts * 0.15, '#5FAB67', 'leaf');
}

function drawPump(d: DrawCtx, b: Building, x: number, y: number) {
  const { ctx, ts } = d;
  shadow(d, x + ts * 0.15, y + ts * 0.15, ts * 0.7, ts * 0.7);
  ctx.fillStyle = '#5E7380';
  roundRect(ctx, x + ts * 0.15, y + ts * 0.15, ts * 0.7, ts * 0.7, ts * 0.12);
  ctx.fill();
  const angle = (b.dir * Math.PI) / 2 - Math.PI / 2;
  ctx.save();
  ctx.translate(x + ts / 2, y + ts / 2);
  ctx.rotate(angle);
  ctx.fillStyle = b.active ? '#BFE9F5' : '#C9CED3';
  ctx.beginPath();
  ctx.moveTo(ts * 0.3, 0);
  ctx.lineTo(-ts * 0.05, -ts * 0.2);
  ctx.lineTo(-ts * 0.05, ts * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(-ts * 0.3, -ts * 0.06, ts * 0.28, ts * 0.12);
  ctx.restore();
  const spin = d.angles.get(b.id) ?? 0;
  ctx.strokeStyle = '#2E3A42';
  ctx.lineWidth = Math.max(1, ts * 0.04);
  ctx.beginPath();
  ctx.arc(x + ts * 0.25, y + ts * 0.25, ts * 0.07, spin, spin + Math.PI * 1.5);
  ctx.stroke();
}

function drawFountain(d: DrawCtx, b: Building, x: number, y: number) {
  const { ctx, ts, time } = d;
  ctx.fillStyle = '#BDB3A6';
  ctx.beginPath();
  ctx.ellipse(x + ts / 2, y + ts * 0.65, ts * 0.38, ts * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = b.active ? PALETTE.rain : '#8B8378';
  ctx.beginPath();
  ctx.ellipse(x + ts / 2, y + ts * 0.65, ts * 0.28, ts * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#A59A8C';
  ctx.fillRect(x + ts * 0.45, y + ts * 0.3, ts * 0.1, ts * 0.35);
  if (b.active) {
    ctx.strokeStyle = 'rgba(220,240,250,0.85)';
    ctx.lineWidth = Math.max(1, ts * 0.035);
    for (let k = -2; k <= 2; k++) {
      const h = d.reducedMotion ? 0.3 : 0.28 + Math.sin(time * 6 + k) * 0.04;
      ctx.beginPath();
      ctx.moveTo(x + ts * 0.5, y + ts * 0.3);
      ctx.quadraticCurveTo(x + ts * (0.5 + k * 0.08), y + ts * (0.3 - h), x + ts * (0.5 + k * 0.14), y + ts * 0.6);
      ctx.stroke();
    }
  }
}
