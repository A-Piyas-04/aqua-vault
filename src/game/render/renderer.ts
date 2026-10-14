import { CONFIG } from '../model/config';
import { isChannelTerrain, STORAGE_TYPES } from '../model/buildings';
import type { Building, GameState } from '../model/types';
import { GATE_CLOSED } from '../model/types';
import type { ViewMetrics } from '../input/coordinateMapping';
import { dayPhase } from '../sim/weather';
import { drawBuilding, drawHouseGlow, type DrawCtx } from './buildings';
import { hash01, mix, PALETTE } from './palette';
import { buildTerrainCache } from './terrain';

export interface Preview {
  cells: number[];
  ok: boolean;
  reason: string;
}

export interface RenderUi {
  hoverCell: number;
  preview: Preview | null;
  selectedId: number;
  selectedCell: number;
  keyboardCell: number;
  showHeights: boolean;
  reducedMotion: boolean;
  tutorialPath: { x: number; y: number }[] | null;
  highlightZone: { x: number; y: number; w: number; h: number } | null;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  kind: 'petal' | 'dust' | 'ripple' | 'spark';
}

interface Drop {
  x: number;
  y: number;
  v: number;
  len: number;
}

const MAX_PARTICLES = 220;

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private cssW = 1;
  private cssH = 1;
  private terrainCache: HTMLCanvasElement | null = null;
  private cacheKey = '';
  private particles: Particle[] = [];
  private drops: Drop[] = [];
  private angles = new Map<number, number>();
  private wetPrev: Uint8Array | null = null;
  private lastTime = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.cssW * dpr);
    this.canvas.height = Math.round(this.cssH * dpr);
    this.cacheKey = '';
  }

  /** Celebration bloom of petals at a cell (1-2 s). */
  celebrate(state: GameState, cell: number, view: ViewMetrics, reducedMotion: boolean): void {
    const g = state.grid;
    const cx = view.ox + ((cell % g.w) + 0.5) * view.ts;
    const cy = view.oy + (Math.floor(cell / g.w) + 0.5) * view.ts;
    const n = reducedMotion ? 6 : 26;
    const colors = [PALETTE.shapla, '#FFFFFF', PALETTE.riceGold, '#F7C6D9'];
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = view.ts * (0.6 + Math.random() * 1.6);
      this.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - view.ts * 1.5,
        life: 0,
        max: 1.4 + Math.random() * 0.5,
        color: colors[k % colors.length],
        size: view.ts * (0.08 + Math.random() * 0.06),
        kind: 'petal',
      });
    }
  }

  dust(state: GameState, cell: number, view: ViewMetrics): void {
    const g = state.grid;
    const cx = view.ox + ((cell % g.w) + 0.5) * view.ts;
    const cy = view.oy + (Math.floor(cell / g.w) + 0.5) * view.ts;
    for (let k = 0; k < 4; k++) {
      this.push({
        x: cx,
        y: cy,
        vx: (Math.random() - 0.5) * view.ts * 2,
        vy: -Math.random() * view.ts * 1.2,
        life: 0,
        max: 0.45,
        color: 'rgba(140,105,70,0.8)',
        size: view.ts * 0.07,
        kind: 'dust',
      });
    }
  }

  private push(p: Particle) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(p);
  }

  draw(state: GameState, prevWater: Float64Array | null, alpha: number, time: number, view: ViewMetrics, ui: RenderUi): void {
    const ctx = this.ctx;
    const dt = Math.min(0.1, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    const g = state.grid;
    const { ts, ox, oy } = view;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Sky / backdrop.
    const phase = dayPhase(state.tick);
    const brightness = 0.5 + 0.5 * Math.sin(2 * Math.PI * phase);
    const darkness = Math.max(0, 0.5 - brightness) * 0.9;
    const overcast = state.weather.mode === 'heavy' ? 0.35 : state.weather.mode === 'rain' ? 0.22 : state.weather.mode === 'drizzle' ? 0.12 : 0;
    ctx.fillStyle = mix(mix(PALETTE.sky, '#9FB3B8', overcast), PALETTE.night, darkness * 1.4);
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    // Terrain cache keyed by tile size and greenness bucket.
    const greenness = this.greenness(state);
    const key = `${ts.toFixed(2)}|${this.dpr}|${Math.round(greenness * 10)}`;
    if (key !== this.cacheKey || !this.terrainCache) {
      this.terrainCache = buildTerrainCache(g, ts, this.dpr, Math.round(greenness * 10) / 10);
      this.cacheKey = key;
    }
    ctx.drawImage(this.terrainCache, ox, oy, g.w * ts, g.h * ts);

    const typeById = new Map<number, Building>();
    for (const b of state.buildings) typeById.set(b.id, b);
    const isChan = (i: number) => {
      if (g.canal[i] || isChannelTerrain(g.terrain[i])) return true;
      const b = g.structure[i] >= 0 ? typeById.get(g.structure[i]) : undefined;
      return !!b && b.type === 'turbine';
    };
    const connects = (i: number) => {
      if (isChan(i)) return true;
      const b = g.structure[i] >= 0 ? typeById.get(g.structure[i]) : undefined;
      return !!b && (STORAGE_TYPES.has(b.type) || b.type === 'field' || b.type === 'treatment');
    };

    // Soil moisture darkening.
    for (let i = 0; i < g.saturation.length; i++) {
      const s = g.saturation[i];
      if (s <= 0.02) continue;
      ctx.fillStyle = `rgba(80,60,40,${Math.min(0.4, s * 0.4)})`;
      ctx.fillRect(ox + (i % g.w) * ts, oy + Math.floor(i / g.w) * ts, ts, ts);
    }

    const water = (i: number) => (prevWater ? prevWater[i] + (g.water[i] - prevWater[i]) * alpha : g.water[i]);

    // Channel grooves (banks) then water.
    const n = g.w * g.h;
    if (!this.wetPrev || this.wetPrev.length !== n) this.wetPrev = new Uint8Array(n);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        if (!isChan(i)) continue;
        const x = i % g.w;
        const y = Math.floor(i / g.w);
        const natural = isChannelTerrain(g.terrain[i]);
        const inset = natural ? 0.12 : 0.22;
        const w = water(i);
        if (pass === 0) {
          ctx.fillStyle = natural ? '#6E5A44' : '#7A5F45';
          this.channelShape(ctx, g.w, g.h, x, y, ox, oy, ts, inset - 0.06, connects);
          ctx.fillStyle = natural ? '#5A4836' : '#5F4936';
          this.channelShape(ctx, g.w, g.h, x, y, ox, oy, ts, inset, connects);
        } else if (w > 0.03) {
          const depth = Math.min(1, w / CONFIG.water.cellCapacity);
          const a = Math.min(0.95, 0.45 + depth * 1.4);
          ctx.globalAlpha = a;
          ctx.fillStyle = mix(PALETTE.rain, PALETTE.deepWater, Math.min(1, depth * 2.2));
          const extra = Math.max(0, 0.08 - depth * 0.3);
          this.channelShape(ctx, g.w, g.h, x, y, ox, oy, ts, inset + extra, (j) => connects(j) && (water(j) > 0.03 || !isChan(j)));
          ctx.globalAlpha = 1;
        }
      }
    }

    // Puddles on plain soil (only from overflow / released storage).
    for (let i = 0; i < n; i++) {
      if (isChan(i) || g.structure[i] >= 0) continue;
      const w = water(i);
      if (w < 0.05) continue;
      const x = i % g.w;
      const y = Math.floor(i / g.w);
      ctx.fillStyle = `rgba(119,191,212,${Math.min(0.75, 0.25 + w / 10)})`;
      ctx.beginPath();
      ctx.ellipse(ox + (x + 0.5) * ts, oy + (y + 0.5) * ts, ts * Math.min(0.5, 0.2 + w / 20), ts * Math.min(0.45, 0.16 + w / 24), hash01(i) * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Flow streaks and arrival ripples.
    for (let i = 0; i < n; i++) {
      const w = g.water[i];
      const wet = w > 0.15 ? 1 : 0;
      if (wet && !this.wetPrev[i] && isChan(i) && !isChannelTerrain(g.terrain[i]) && !ui.reducedMotion) {
        this.push({
          x: ox + ((i % g.w) + 0.5) * ts,
          y: oy + (Math.floor(i / g.w) + 0.5) * ts,
          vx: 0,
          vy: 0,
          life: 0,
          max: 0.9,
          color: 'rgba(255,255,255,0.9)',
          size: ts * 0.5,
          kind: 'ripple',
        });
      }
      this.wetPrev[i] = wet;
      if (!isChan(i) || w < 0.05) continue;
      const fx = g.flowX[i];
      const fy = g.flowY[i];
      const mag = Math.hypot(fx, fy);
      if (mag < 0.02) continue;
      const ux = fx / mag;
      const uy = fy / mag;
      const cx = ox + ((i % g.w) + 0.5) * ts;
      const cy = oy + (Math.floor(i / g.w) + 0.5) * ts;
      ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.75, 0.25 + mag * 0.25)})`;
      ctx.lineWidth = Math.max(1, ts * 0.05);
      ctx.lineCap = 'round';
      if (ui.reducedMotion) {
        ctx.beginPath();
        ctx.moveTo(cx - ux * ts * 0.18 - uy * ts * 0.1, cy - uy * ts * 0.18 + ux * ts * 0.1);
        ctx.lineTo(cx + ux * ts * 0.05, cy + uy * ts * 0.05);
        ctx.lineTo(cx - ux * ts * 0.18 + uy * ts * 0.1, cy - uy * ts * 0.18 - ux * ts * 0.1);
        ctx.stroke();
      } else {
        const speed = 0.6 + Math.min(2.2, mag * 0.5);
        for (let k = 0; k < 2; k++) {
          const p = (time * speed + hash01(i, k)) % 1;
          const off = (k === 0 ? -1 : 1) * ts * 0.1;
          const px = cx + ux * (p - 0.5) * ts * 0.9 - uy * off;
          const py = cy + uy * (p - 0.5) * ts * 0.9 + ux * off;
          ctx.beginPath();
          ctx.moveTo(px - ux * ts * 0.12, py - uy * ts * 0.12);
          ctx.lineTo(px + ux * ts * 0.06, py + uy * ts * 0.06);
          ctx.stroke();
        }
      }
    }
    ctx.lineCap = 'butt';

    // Gates and bridges.
    for (let i = 0; i < n; i++) {
      if (g.gate[i]) this.drawGate(ctx, g, i, ox, oy, ts, isChan);
      if (g.bridge[i]) this.drawBridge(ctx, g, i, ox, oy, ts, isChan);
    }

    // Wires (turbine -> nearest battery) and sealed clean-water pipes (plant -> taps).
    this.drawNetworks(ctx, state, ox, oy, ts, time, ui.reducedMotion);

    // Visual wheel rotation proportional to power.
    for (const b of state.buildings) {
      if (b.type === 'turbine' || b.type === 'pump') {
        const speed = b.type === 'turbine' ? b.rate * 2.2 : b.active ? 6 : 0;
        this.angles.set(b.id, ((this.angles.get(b.id) ?? 0) + speed * dt * (ui.reducedMotion ? 0.35 : 1)) % (Math.PI * 2));
      }
    }

    const dctx: DrawCtx = { ctx, ts, ox, oy, time, reducedMotion: ui.reducedMotion, state, angles: this.angles };
    const order = [...state.buildings].sort((a, b) => (a.type === 'floating' ? 1 : 0) - (b.type === 'floating' ? 1 : 0) || a.y - b.y);
    for (const b of order) drawBuilding(dctx, b);

    // Tutorial hints.
    if (ui.tutorialPath && ui.tutorialPath.length > 1) this.drawTutorialPath(ctx, ui.tutorialPath, ox, oy, ts, time, ui.reducedMotion);
    if (ui.highlightZone) {
      const z = ui.highlightZone;
      const pulse = ui.reducedMotion ? 0.7 : 0.5 + 0.4 * Math.sin(time * 3);
      ctx.strokeStyle = `rgba(255,240,170,${pulse})`;
      ctx.lineWidth = Math.max(2, ts * 0.1);
      ctx.setLineDash([ts * 0.3, ts * 0.2]);
      ctx.strokeRect(ox + z.x * ts, oy + z.y * ts, z.w * ts, z.h * ts);
      ctx.setLineDash([]);
    }

    // Rain.
    this.drawRain(ctx, state, dt, ui.reducedMotion);

    // Night + weather tint, then warm glows.
    const tint = darkness * 0.75;
    if (tint > 0.01) {
      ctx.fillStyle = `rgba(37,57,77,${tint})`;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
    }
    if (overcast > 0) {
      ctx.fillStyle = `rgba(90,110,125,${overcast * 0.35})`;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
    }
    for (const b of state.buildings) if (b.type === 'house') drawHouseGlow(dctx, b, darkness);

    // Particles.
    this.drawParticles(ctx, dt);

    // Heights overlay.
    if (ui.showHeights) {
      ctx.font = `600 ${Math.max(8, ts * 0.32)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < n; i++) {
        if (g.terrain[i] === 'rock') continue;
        const x = ox + ((i % g.w) + 0.5) * ts;
        const y = oy + (Math.floor(i / g.w) + 0.5) * ts;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillText(String(g.elevation[i]), x + 1, y + 1);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(String(g.elevation[i]), x, y);
      }
    }

    // Placement preview, hover, selection, keyboard cursor.
    if (ui.preview && ui.preview.cells.length) {
      ctx.fillStyle = ui.preview.ok ? 'rgba(90,210,130,0.35)' : 'rgba(235,95,70,0.35)';
      ctx.strokeStyle = ui.preview.ok ? 'rgba(40,140,80,0.95)' : 'rgba(190,60,40,0.95)';
      ctx.lineWidth = 2;
      for (const c of ui.preview.cells) {
        const x = ox + (c % g.w) * ts;
        const y = oy + Math.floor(c / g.w) * ts;
        ctx.fillRect(x, y, ts, ts);
        if (!ui.preview.ok) {
          // Hatching so validity does not rely on colour alone.
          ctx.save();
          ctx.beginPath();
          ctx.rect(x, y, ts, ts);
          ctx.clip();
          ctx.beginPath();
          for (let k = -ts; k < ts * 2; k += ts * 0.3) {
            ctx.moveTo(x + k, y);
            ctx.lineTo(x + k - ts, y + ts);
          }
          ctx.stroke();
          ctx.restore();
        }
      }
      const xs = ui.preview.cells.map((c) => c % g.w);
      const ys = ui.preview.cells.map((c) => Math.floor(c / g.w));
      ctx.strokeRect(ox + Math.min(...xs) * ts, oy + Math.min(...ys) * ts, (Math.max(...xs) - Math.min(...xs) + 1) * ts, (Math.max(...ys) - Math.min(...ys) + 1) * ts);
    } else if (ui.hoverCell >= 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ox + (ui.hoverCell % g.w) * ts + 1, oy + Math.floor(ui.hoverCell / g.w) * ts + 1, ts - 2, ts - 2);
    }
    const sel = ui.selectedId >= 0 ? typeById.get(ui.selectedId) : undefined;
    if (sel || ui.selectedCell >= 0) {
      const sx = sel ? sel.x : ui.selectedCell % g.w;
      const sy = sel ? sel.y : Math.floor(ui.selectedCell / g.w);
      const sw = sel ? sel.w : 1;
      const sh = sel ? sel.h : 1;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = ui.reducedMotion ? 0 : -time * 12;
      ctx.strokeRect(ox + sx * ts + 1, oy + sy * ts + 1, sw * ts - 2, sh * ts - 2);
      ctx.setLineDash([]);
    }
    if (ui.keyboardCell >= 0) {
      ctx.strokeStyle = '#FFE066';
      ctx.lineWidth = 3;
      ctx.strokeRect(ox + (ui.keyboardCell % g.w) * ts + 1.5, oy + Math.floor(ui.keyboardCell / g.w) * ts + 1.5, ts - 3, ts - 3);
    }
  }

  private greenness(state: GameState): number {
    let score = 0;
    for (const b of state.buildings) {
      if (b.type === 'field' && b.active) score += 0.12;
      if (b.type === 'wetland') score += b.progress * 0.25;
      if (b.type === 'fishpond' && b.stocked) score += 0.1;
      if (b.type === 'house' && b.supplied) score += 0.05;
    }
    score += Math.min(0.25, state.achievements.length * 0.025);
    return Math.max(0, Math.min(1, score));
  }

  private channelShape(
    ctx: CanvasRenderingContext2D,
    gw: number,
    gh: number,
    x: number,
    y: number,
    ox: number,
    oy: number,
    ts: number,
    inset: number,
    connects: (i: number) => boolean,
  ) {
    const px = ox + x * ts;
    const py = oy + y * ts;
    const a = ts * inset;
    const r = Math.max(1, ts * 0.5 - a);
    ctx.beginPath();
    ctx.arc(px + ts / 2, py + ts / 2, r, 0, Math.PI * 2);
    ctx.fill();
    const i = y * gw + x;
    if (y > 0 && connects(i - gw)) ctx.fillRect(px + a, py, ts - a * 2, ts / 2);
    if (y < gh - 1 && connects(i + gw)) ctx.fillRect(px + a, py + ts / 2, ts - a * 2, ts / 2);
    if (x > 0 && connects(i - 1)) ctx.fillRect(px, py + a, ts / 2, ts - a * 2);
    if (x < gw - 1 && connects(i + 1)) ctx.fillRect(px + ts / 2, py + a, ts / 2, ts - a * 2);
  }

  private axisVertical(g: GameState['grid'], i: number, isChan: (i: number) => boolean): boolean {
    const x = i % g.w;
    const y = Math.floor(i / g.w);
    const v = (y > 0 && isChan(i - g.w) ? 1 : 0) + (y < g.h - 1 && isChan(i + g.w) ? 1 : 0);
    const h = (x > 0 && isChan(i - 1) ? 1 : 0) + (x < g.w - 1 && isChan(i + 1) ? 1 : 0);
    return v >= h;
  }

  private drawGate(ctx: CanvasRenderingContext2D, g: GameState['grid'], i: number, ox: number, oy: number, ts: number, isChan: (i: number) => boolean) {
    const vertical = this.axisVertical(g, i, isChan);
    const x = ox + (i % g.w) * ts;
    const y = oy + Math.floor(i / g.w) * ts;
    const closed = g.gate[i] === GATE_CLOSED;
    ctx.fillStyle = '#5A3E26';
    // Posts on both banks.
    if (vertical) {
      ctx.fillRect(x + ts * 0.08, y + ts * 0.4, ts * 0.14, ts * 0.2);
      ctx.fillRect(x + ts * 0.78, y + ts * 0.4, ts * 0.14, ts * 0.2);
    } else {
      ctx.fillRect(x + ts * 0.4, y + ts * 0.08, ts * 0.2, ts * 0.14);
      ctx.fillRect(x + ts * 0.4, y + ts * 0.78, ts * 0.2, ts * 0.14);
    }
    ctx.fillStyle = closed ? '#9C6B3C' : 'rgba(156,107,60,0.55)';
    if (closed) {
      if (vertical) ctx.fillRect(x + ts * 0.15, y + ts * 0.42, ts * 0.7, ts * 0.16);
      else ctx.fillRect(x + ts * 0.42, y + ts * 0.15, ts * 0.16, ts * 0.7);
      ctx.strokeStyle = '#3B2716';
      ctx.lineWidth = Math.max(1, ts * 0.04);
      ctx.beginPath();
      ctx.moveTo(x + ts * 0.35, y + ts * 0.35);
      ctx.lineTo(x + ts * 0.65, y + ts * 0.65);
      ctx.moveTo(x + ts * 0.65, y + ts * 0.35);
      ctx.lineTo(x + ts * 0.35, y + ts * 0.65);
      ctx.stroke();
    } else {
      // Raised board shown above the channel.
      if (vertical) ctx.fillRect(x + ts * 0.15, y + ts * 0.18, ts * 0.7, ts * 0.1);
      else ctx.fillRect(x + ts * 0.18, y + ts * 0.15, ts * 0.1, ts * 0.7);
    }
  }

  private drawBridge(ctx: CanvasRenderingContext2D, g: GameState['grid'], i: number, ox: number, oy: number, ts: number, isChan: (i: number) => boolean) {
    const vertical = this.axisVertical(g, i, isChan);
    const x = ox + (i % g.w) * ts;
    const y = oy + Math.floor(i / g.w) * ts;
    ctx.strokeStyle = '#C9A55A';
    ctx.lineWidth = Math.max(1.5, ts * 0.08);
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const t = 0.25 + k * 0.17;
      if (vertical) {
        ctx.moveTo(x - ts * 0.05, y + ts * t);
        ctx.lineTo(x + ts * 1.05, y + ts * t);
      } else {
        ctx.moveTo(x + ts * t, y - ts * 0.05);
        ctx.lineTo(x + ts * t, y + ts * 1.05);
      }
    }
    ctx.stroke();
    ctx.strokeStyle = '#8A6A30';
    ctx.lineWidth = Math.max(1, ts * 0.04);
    ctx.beginPath();
    if (vertical) {
      ctx.moveTo(x - ts * 0.05, y + ts * 0.18);
      ctx.lineTo(x + ts * 1.05, y + ts * 0.18);
      ctx.moveTo(x - ts * 0.05, y + ts * 0.84);
      ctx.lineTo(x + ts * 1.05, y + ts * 0.84);
    } else {
      ctx.moveTo(x + ts * 0.18, y - ts * 0.05);
      ctx.lineTo(x + ts * 0.18, y + ts * 1.05);
      ctx.moveTo(x + ts * 0.84, y - ts * 0.05);
      ctx.lineTo(x + ts * 0.84, y + ts * 1.05);
    }
    ctx.stroke();
  }

  private drawNetworks(ctx: CanvasRenderingContext2D, state: GameState, ox: number, oy: number, ts: number, time: number, reduced: boolean) {
    const center = (b: Building) => [ox + (b.x + b.w / 2) * ts, oy + (b.y + b.h / 2) * ts] as const;
    const batteries = state.buildings.filter((b) => b.type === 'battery');
    if (batteries.length) {
      ctx.strokeStyle = 'rgba(50,45,40,0.55)';
      ctx.lineWidth = Math.max(1, ts * 0.04);
      for (const t of state.buildings) {
        if (t.type !== 'turbine') continue;
        const [tx, ty] = center(t);
        let best = batteries[0];
        let bd = Infinity;
        for (const b of batteries) {
          const d = Math.hypot(b.x - t.x, b.y - t.y);
          if (d < bd) {
            bd = d;
            best = b;
          }
        }
        const [bx, by] = center(best);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.quadraticCurveTo((tx + bx) / 2, Math.min(ty, by) - ts * 0.8, bx, by);
        ctx.stroke();
      }
    }
    const plants = state.buildings.filter((b) => b.type === 'treatment');
    if (plants.length) {
      ctx.strokeStyle = 'rgba(191,233,245,0.85)';
      ctx.lineWidth = Math.max(1.5, ts * 0.07);
      ctx.setLineDash([ts * 0.25, ts * 0.15]);
      ctx.lineDashOffset = reduced ? 0 : -time * ts * 0.6;
      for (const c of state.buildings) {
        if (c.type !== 'connector') continue;
        const [cx, cy] = center(c);
        const p = plants[0];
        const [px, py] = center(p);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px, cy);
        ctx.lineTo(cx, cy);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }

  private drawTutorialPath(ctx: CanvasRenderingContext2D, path: { x: number; y: number }[], ox: number, oy: number, ts: number, time: number, reduced: boolean) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,248,214,0.9)';
    ctx.lineWidth = Math.max(2, ts * 0.12);
    ctx.lineCap = 'round';
    ctx.setLineDash([ts * 0.25, ts * 0.25]);
    ctx.lineDashOffset = reduced ? 0 : -time * ts * 1.2;
    ctx.beginPath();
    path.forEach((p, k) => {
      const x = ox + (p.x + 0.5) * ts;
      const y = oy + (p.y + 0.5) * ts;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    const a = path[path.length - 2];
    const b = path[path.length - 1];
    const ex = ox + (b.x + 0.5) * ts;
    const ey = oy + (b.y + 0.5) * ts;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.fillStyle = 'rgba(255,248,214,0.95)';
    ctx.beginPath();
    ctx.moveTo(ex + Math.cos(ang) * ts * 0.45, ey + Math.sin(ang) * ts * 0.45);
    ctx.lineTo(ex + Math.cos(ang + 2.4) * ts * 0.35, ey + Math.sin(ang + 2.4) * ts * 0.35);
    ctx.lineTo(ex + Math.cos(ang - 2.4) * ts * 0.35, ey + Math.sin(ang - 2.4) * ts * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawRain(ctx: CanvasRenderingContext2D, state: GameState, dt: number, reduced: boolean) {
    const target = reduced ? 0 : { dry: 0, drizzle: 45, rain: 100, heavy: 170 }[state.weather.mode];
    while (this.drops.length < target) {
      this.drops.push({ x: Math.random() * this.cssW, y: Math.random() * this.cssH, v: 380 + Math.random() * 260, len: 8 + Math.random() * 10 });
    }
    if (this.drops.length > target) this.drops.length = target;
    if (!this.drops.length) {
      if (reduced && state.weather.mode !== 'dry') {
        ctx.fillStyle = 'rgba(119,191,212,0.08)';
        ctx.fillRect(0, 0, this.cssW, this.cssH);
      }
      return;
    }
    ctx.strokeStyle = 'rgba(210,235,245,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of this.drops) {
      d.y += d.v * dt;
      d.x -= d.v * dt * 0.15;
      if (d.y > this.cssH) {
        d.y = -d.len;
        d.x = Math.random() * (this.cssW + 60);
      }
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.len * 0.15, d.y + d.len);
    }
    ctx.stroke();
  }

  private drawParticles(ctx: CanvasRenderingContext2D, dt: number) {
    const alive: Particle[] = [];
    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.max) continue;
      alive.push(p);
      const t = p.life / p.max;
      if (p.kind === 'ripple') {
        ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - t)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.3 + t), 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'petal') {
        p.vy += 40 * dt;
        p.vx *= 0.98;
      }
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.size, p.size * 0.6, p.life * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    this.particles = alive;
  }
}
