import { CONFIG } from '../model/config';
import { isChannelTerrain, STORAGE_TYPES } from '../model/buildings';
import type { Building, GameState } from '../model/types';
import { GATE_CLOSED } from '../model/types';
import type { ViewMetrics } from '../input/coordinateMapping';
import { statePhase } from '../sim/weather';
import { drawBuilding, drawHouseGlow, type DrawCtx } from './buildings';
import { hash01, mix, PALETTE } from './palette';
import { buildTerrainCache } from './terrain';
import type { RenderUi } from './types';

export type { Preview, RenderUi } from './types';

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
const MAX_CACHE_PX = 4096;

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
  private caustic: HTMLCanvasElement | null = null;

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

  /** Forget the baked terrain (new level, or the map changed shape). */
  invalidate(): void {
    this.cacheKey = '';
    this.wetPrev = null;
    this.particles = [];
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
    const phase = statePhase(state);
    const brightness = 0.5 + 0.5 * Math.sin(2 * Math.PI * phase);
    const darkness = Math.max(0, 0.5 - brightness) * 0.9;
    const overcast = state.weather.mode === 'heavy' ? 0.35 : state.weather.mode === 'rain' ? 0.22 : state.weather.mode === 'drizzle' ? 0.12 : 0;
    ctx.fillStyle = mix(mix(PALETTE.sky, '#9FB3B8', overcast), PALETTE.night, darkness * 1.4);
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    // Terrain cache keyed by tile size and greenness bucket.
    const greenness = this.greenness(state);
    // Bake at a bucketed tile size (no rebuild on every zoom notch) and never larger than
    // MAX_CACHE_PX on a side (mobile canvas limits); drawImage scales it to the view.
    const cacheTs = Math.min(Math.max(4, Math.round(ts / 6) * 6), MAX_CACHE_PX / (Math.max(g.w, g.h) * this.dpr));
    const key = `${cacheTs.toFixed(2)}|${this.dpr}|${Math.round(greenness * 10)}|${g.w}x${g.h}`;
    if (key !== this.cacheKey || !this.terrainCache) {
      this.terrainCache = buildTerrainCache(g, cacheTs, this.dpr, Math.round(greenness * 10) / 10);
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

    const n = g.w * g.h;
    if (!this.wetPrev || this.wetPrev.length !== n) this.wetPrev = new Uint8Array(n);

    // Wet banks: soil next to water darkens so the shoreline is obvious.
    for (let i = 0; i < n; i++) {
      if (isChan(i) || g.structure[i] >= 0) continue;
      const x = i % g.w;
      const y = Math.floor(i / g.w);
      let wetN = 0;
      if (x > 0 && isChan(i - 1) && water(i - 1) > 0.08) wetN++;
      if (x + 1 < g.w && isChan(i + 1) && water(i + 1) > 0.08) wetN++;
      if (y > 0 && isChan(i - g.w) && water(i - g.w) > 0.08) wetN++;
      if (y + 1 < g.h && isChan(i + g.w) && water(i + g.w) > 0.08) wetN++;
      if (!wetN) continue;
      ctx.fillStyle = `rgba(45,55,48,${0.1 + wetN * 0.08})`;
      ctx.fillRect(ox + x * ts, oy + y * ts, ts, ts);
    }

    // Channel grooves (banks) then water with depth gradient + rim.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        if (!isChan(i)) continue;
        const x = i % g.w;
        const y = Math.floor(i / g.w);
        const natural = isChannelTerrain(g.terrain[i]);
        const inset = natural ? 0.1 : 0.2;
        const w = water(i);
        if (pass === 0) {
          ctx.fillStyle = natural ? '#6A5640' : '#7A5F45';
          this.channelShape(ctx, g.w, g.h, x, y, ox, oy, ts, inset - 0.07, connects);
          ctx.fillStyle = natural ? '#4E3E2E' : '#5A4634';
          this.channelShape(ctx, g.w, g.h, x, y, ox, oy, ts, inset, connects);
        } else if (w > 0.03) {
          const depth = Math.min(1, w / CONFIG.water.cellCapacity);
          const extra = Math.max(0, 0.08 - depth * 0.3);
          const px = ox + x * ts + ts / 2;
          const py = oy + y * ts + ts / 2;
          const r = Math.max(1, ts * (0.5 - inset - extra));
          const grad = ctx.createRadialGradient(px - r * 0.2, py - r * 0.25, r * 0.12, px, py, r * 1.15);
          grad.addColorStop(0, mix(PALETTE.cleanWater, PALETTE.rain, 0.35));
          grad.addColorStop(0.45, mix(PALETTE.rain, PALETTE.deepWater, Math.min(1, depth * 1.2)));
          grad.addColorStop(1, mix(PALETTE.deepWater, '#163844', Math.min(1, depth)));
          ctx.globalAlpha = Math.min(0.96, 0.5 + depth * 1.3);
          ctx.fillStyle = grad;
          this.channelShape(ctx, g.w, g.h, x, y, ox, oy, ts, inset + extra, (j) => connects(j) && (water(j) > 0.03 || !isChan(j)));
          ctx.globalAlpha = 1;
        }
      }
    }

    // Bright shoreline rim on wet channels that meet dry ground.
    ctx.lineWidth = Math.max(1, ts * 0.045);
    ctx.strokeStyle = 'rgba(220,242,248,0.55)';
    for (let i = 0; i < n; i++) {
      if (!isChan(i) || water(i) < 0.08) continue;
      const x = i % g.w;
      const y = Math.floor(i / g.w);
      const px = ox + x * ts;
      const py = oy + y * ts;
      const wet = (j: number) => j >= 0 && j < n && isChan(j) && water(j) > 0.08;
      ctx.beginPath();
      if (y === 0 || !wet(i - g.w)) {
        ctx.moveTo(px + ts * 0.18, py + ts * 0.2);
        ctx.lineTo(px + ts * 0.82, py + ts * 0.2);
      }
      if (y === g.h - 1 || !wet(i + g.w)) {
        ctx.moveTo(px + ts * 0.18, py + ts * 0.8);
        ctx.lineTo(px + ts * 0.82, py + ts * 0.8);
      }
      if (x === 0 || !wet(i - 1)) {
        ctx.moveTo(px + ts * 0.2, py + ts * 0.18);
        ctx.lineTo(px + ts * 0.2, py + ts * 0.82);
      }
      if (x === g.w - 1 || !wet(i + 1)) {
        ctx.moveTo(px + ts * 0.8, py + ts * 0.18);
        ctx.lineTo(px + ts * 0.8, py + ts * 0.82);
      }
      ctx.stroke();
    }

    this.drawCaustics(ctx, g, n, isChan, water, ox, oy, ts, time, ui.reducedMotion);

    // Puddles on plain soil (only from overflow / released storage).
    for (let i = 0; i < n; i++) {
      if (isChan(i) || g.structure[i] >= 0) continue;
      const w = water(i);
      if (w < 0.05) continue;
      const x = i % g.w;
      const y = Math.floor(i / g.w);
      ctx.fillStyle = `rgba(90,170,195,${Math.min(0.78, 0.28 + w / 10)})`;
      ctx.beginPath();
      ctx.ellipse(ox + (x + 0.5) * ts, oy + (y + 0.5) * ts, ts * Math.min(0.5, 0.2 + w / 20), ts * Math.min(0.45, 0.16 + w / 24), hash01(i) * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(220,240,248,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    this.drawSpringAndOutlet(ctx, g, ox, oy, ts, time, ui.reducedMotion);

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
    if (ui.highlightCells?.length) {
      const pulse = ui.reducedMotion ? 0.45 : 0.28 + 0.28 * Math.sin(time * 3);
      ctx.fillStyle = `rgba(255,240,170,${pulse})`;
      for (const c of ui.highlightCells) ctx.fillRect(ox + c.x * ts, oy + c.y * ts, ts, ts);
    }
    if (ui.pointer) {
      const bob = ui.reducedMotion ? 0 : Math.sin(time * 3.2) * ts * 0.12;
      const px = ox + (ui.pointer.x + 0.5) * ts;
      const py = oy + (ui.pointer.y + 0.15) * ts + bob;
      ctx.fillStyle = 'rgba(255,248,214,0.95)';
      ctx.strokeStyle = 'rgba(80,50,20,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - ts * 0.22, py - ts * 0.42);
      ctx.lineTo(px + ts * 0.22, py - ts * 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    if (ui.showGrid && ui.buildTool) {
      ctx.strokeStyle = 'rgba(40,30,20,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= g.w; x++) {
        ctx.moveTo(ox + x * ts, oy);
        ctx.lineTo(ox + x * ts, oy + g.h * ts);
      }
      for (let y = 0; y <= g.h; y++) {
        ctx.moveTo(ox, oy + y * ts);
        ctx.lineTo(ox + g.w * ts, oy + y * ts);
      }
      ctx.stroke();
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
      const climb = ui.preview.climb;
      ctx.lineWidth = 2;
      for (let k = 0; k < ui.preview.cells.length; k++) {
        const c = ui.preview.cells[k];
        const uphill = climb?.[k];
        const ok = ui.preview.ok && !uphill;
        ctx.fillStyle = ok ? 'rgba(90,210,130,0.35)' : 'rgba(235,95,70,0.35)';
        ctx.strokeStyle = ok ? 'rgba(40,140,80,0.95)' : 'rgba(190,60,40,0.95)';
        const x = ox + (c % g.w) * ts;
        const y = oy + Math.floor(c / g.w) * ts;
        ctx.fillRect(x, y, ts, ts);
        if (!ok) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(x, y, ts, ts);
          ctx.clip();
          ctx.beginPath();
          for (let h = -ts; h < ts * 2; h += ts * 0.3) {
            ctx.moveTo(x + h, y);
            ctx.lineTo(x + h - ts, y + ts);
          }
          ctx.stroke();
          ctx.restore();
        }
      }
      if (ui.preview.climb) this.drawCanalSlopeArrows(ctx, g, ui.preview.cells, ox, oy, ts);
      const xs = ui.preview.cells.map((c) => c % g.w);
      const ys = ui.preview.cells.map((c) => Math.floor(c / g.w));
      ctx.strokeStyle = ui.preview.ok ? 'rgba(40,140,80,0.95)' : 'rgba(190,60,40,0.95)';
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

    if (ui.hoverCell >= 0) {
      const hc = ui.hoverCell;
      const hx = ox + ((hc % g.w) + 0.5) * ts;
      const hy = oy + Math.floor(hc / g.w) * ts + ts * 0.18;
      const label = String(g.elevation[hc]);
      ctx.font = `700 ${Math.max(9, ts * 0.28)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(label).width + ts * 0.28;
      const th = ts * 0.28;
      ctx.fillStyle = 'rgba(31,45,51,0.78)';
      ctx.fillRect(hx - tw / 2, hy - th / 2, tw, th);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, hx, hy + 0.5);
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
        const p = plants.find((q) => q.id === c.hostId);
        if (!p) continue;
        const [cx, cy] = center(c);
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

  private drawCaustics(
    ctx: CanvasRenderingContext2D,
    g: GameState['grid'],
    n: number,
    isChan: (i: number) => boolean,
    water: (i: number) => number,
    ox: number,
    oy: number,
    ts: number,
    time: number,
    reduced: boolean,
  ) {
    if (!this.caustic) {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const cx = c.getContext('2d')!;
      cx.fillStyle = 'rgba(255,255,255,0.55)';
      for (let k = 0; k < 28; k++) {
        const px = hash01(k, 1) * 64;
        const py = hash01(k, 2) * 64;
        cx.beginPath();
        cx.ellipse(px, py, 1.2 + hash01(k, 3) * 1.8, 0.6, hash01(k, 4) * 3, 0, Math.PI * 2);
        cx.fill();
      }
      this.caustic = c;
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      if (!isChan(i) || water(i) < 0.08) continue;
      const mag = Math.hypot(g.flowX[i], g.flowY[i]);
      const x = i % g.w;
      const y = Math.floor(i / g.w);
      const scroll = reduced ? 0 : time * (0.15 + Math.min(0.5, mag * 0.2));
      const fx = g.flowX[i];
      const fy = g.flowY[i];
      const oxp = reduced ? 0 : (fx !== 0 || fy !== 0 ? (fx / (mag || 1)) * scroll * ts : 0);
      const oyp = reduced ? 0 : (fy !== 0 ? (fy / (mag || 1)) * scroll * ts : Math.sin(time * 0.4 + hash01(i)) * ts * 0.04);
      ctx.globalAlpha = 0.12 + Math.min(0.18, water(i) / CONFIG.water.cellCapacity);
      ctx.drawImage(this.caustic, ox + x * ts + (oxp % ts) - ts * 0.15, oy + y * ts + (oyp % ts) - ts * 0.15, ts * 1.3, ts * 1.3);
    }
    ctx.restore();
  }

  private drawSpringAndOutlet(ctx: CanvasRenderingContext2D, g: GameState['grid'], ox: number, oy: number, ts: number, time: number, reduced: boolean) {
    for (let i = 0; i < g.terrain.length; i++) {
      const t = g.terrain[i];
      if (t !== 'source' && t !== 'outlet') continue;
      const x = ox + (i % g.w) * ts;
      const y = oy + Math.floor(i / g.w) * ts;
      const bob = reduced ? 0 : Math.sin(time * 2 + i) * ts * 0.04;
      if (t === 'source') {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.ellipse(x + ts * 0.5, y + ts * 0.42 + bob, ts * 0.28, ts * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(180,215,230,0.9)';
        ctx.beginPath();
        ctx.ellipse(x + ts * 0.38, y + ts * 0.32 + bob, ts * 0.16, ts * 0.1, -0.3, 0, Math.PI * 2);
        ctx.ellipse(x + ts * 0.58, y + ts * 0.3 + bob, ts * 0.18, ts * 0.11, 0.2, 0, Math.PI * 2);
        ctx.ellipse(x + ts * 0.5, y + ts * 0.22 + bob, ts * 0.14, ts * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(90,160,190,0.7)';
        ctx.lineWidth = Math.max(1, ts * 0.04);
        ctx.beginPath();
        ctx.moveTo(x + ts * 0.38, y + ts * 0.55);
        ctx.lineTo(x + ts * 0.34, y + ts * 0.7);
        ctx.moveTo(x + ts * 0.5, y + ts * 0.55);
        ctx.lineTo(x + ts * 0.5, y + ts * 0.72);
        ctx.moveTo(x + ts * 0.62, y + ts * 0.55);
        ctx.lineTo(x + ts * 0.66, y + ts * 0.7);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(30,50,60,0.35)';
        ctx.beginPath();
        ctx.moveTo(x + ts * 0.25, y + ts * 0.25);
        ctx.lineTo(x + ts * 0.75, y + ts * 0.45);
        ctx.lineTo(x + ts * 0.25, y + ts * 0.65);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(210,235,245,0.8)';
        ctx.lineWidth = Math.max(1.5, ts * 0.06);
        ctx.beginPath();
        ctx.moveTo(x + ts * 0.28, y + ts * 0.32);
        ctx.lineTo(x + ts * 0.62, y + ts * 0.5);
        ctx.lineTo(x + ts * 0.28, y + ts * 0.68);
        ctx.stroke();
      }
    }
  }

  private drawCanalSlopeArrows(ctx: CanvasRenderingContext2D, g: GameState['grid'], cells: number[], ox: number, oy: number, ts: number) {
    if (cells.length < 1) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const drawArrow = (from: number, to: number) => {
      const ax = ox + ((from % g.w) + 0.5) * ts;
      const ay = oy + (Math.floor(from / g.w) + 0.5) * ts;
      const bx = ox + ((to % g.w) + 0.5) * ts;
      const by = oy + (Math.floor(to / g.w) + 0.5) * ts;
      const climb = g.elevation[to] > g.elevation[from];
      ctx.strokeStyle = climb ? 'rgba(190,60,40,0.95)' : 'rgba(255,248,214,0.95)';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = Math.max(1.5, ts * 0.07);
      const ang = Math.atan2(by - ay, bx - ax);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx + Math.cos(ang) * ts * 0.08, by + Math.sin(ang) * ts * 0.08);
      ctx.lineTo(bx + Math.cos(ang + 2.5) * ts * 0.16, by + Math.sin(ang + 2.5) * ts * 0.16);
      ctx.lineTo(bx + Math.cos(ang - 2.5) * ts * 0.16, by + Math.sin(ang - 2.5) * ts * 0.16);
      ctx.closePath();
      ctx.fill();
    };
    if (cells.length === 1) {
      const i = cells[0];
      const x = i % g.w;
      const y = Math.floor(i / g.w);
      let best = i;
      let bestE = g.elevation[i];
      const tryN = (nx: number, ny: number) => {
        if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) return;
        const j = ny * g.w + nx;
        if (g.elevation[j] < bestE) {
          bestE = g.elevation[j];
          best = j;
        }
      };
      tryN(x + 1, y);
      tryN(x - 1, y);
      tryN(x, y + 1);
      tryN(x, y - 1);
      if (best !== i) drawArrow(i, best);
    } else {
      for (let k = 1; k < cells.length; k++) drawArrow(cells[k - 1], cells[k]);
    }
    ctx.restore();
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
