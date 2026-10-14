import { CONFIG } from './model/config';
import { canDigCanal, STORAGE_TYPES, storageCapacity, validatePlacement, isUnlocked } from './model/buildings';
import type { BuildingTypePlaceable, Command, GameEvent, GameState, ToolId } from './model/types';
import { createInitialState, getBuilding, idx } from './model/world';
import { applyCommand } from './sim/commands';
import { stepGame, massTolerance } from './sim/tick';
import { ecosystemScore, levelForXp, nextLevelXp } from './sim/progression';
import { energyCapacity } from './sim/power';
import { dayPhase } from './sim/weather';
import { ACHIEVEMENTS, MILESTONES } from './content/milestones';
import { TOOL_INFO } from './content/strings';
import { authorWorld } from './content/worldSeed';
import { Renderer, type Preview } from './render/renderer';
import { lineCells } from './input/bresenham';
import { canvasToCell, clampCamera, clientToCanvas, computeView, type Camera, type ViewMetrics } from './input/coordinateMapping';
import { LocalSaveRepository, type SaveRepository } from './persistence/storage';
import { SoundEngine } from './audio/sound';
import { inspectBuilding, inspectTile, type InspectAction, type InspectInfo } from './inspect';

export interface Toast {
  id: number;
  kind: 'achievement' | 'level' | 'error' | 'info' | 'harvest';
  title: string;
  sub?: string;
  at: number;
}

export interface HudSnapshot {
  version: number;
  level: number;
  xp: number;
  levelFloor: number;
  levelNext: number | null;
  materials: number;
  freeCanals: number;
  weather: GameState['weather']['mode'];
  storedWater: number;
  storageCap: number;
  energy: number;
  energyCap: number;
  generation: number;
  clean: number;
  ecosystem: { score: number; living: string[] };
  paused: boolean;
  speed: 1 | 2;
  tool: ToolId;
  inspect: InspectInfo | null;
  achievements: string[];
  toasts: Toast[];
  tutorial: { step: number; text: string; bn?: string } | null;
  settings: GameState['settings'];
  showHeights: boolean;
  canUndo: boolean;
  night: boolean;
  hint: string;
  savedAt: number;
  saveError: string;
  milestonesDone: number;
  loadMessage: string;
}

const TICK_MS = 1000 / CONFIG.ticksPerSecond;
const DEV = process.env.NODE_ENV !== 'production';

type Gesture =
  | { kind: 'none' }
  | { kind: 'stroke'; mode: 'canal' | 'erase'; last: [number, number]; startCell: number; moved: boolean; pointerId: number }
  | { kind: 'place'; pointerId: number }
  | { kind: 'tap'; pointerId: number; sx: number; sy: number; panning: boolean; cam: Camera }
  | { kind: 'pinch'; d0: number; mx: number; my: number; cam: Camera };

export class GameController {
  state: GameState;
  private renderer: Renderer | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private raf = 0;
  private lastFrame = 0;
  private acc = 0;
  private prevWater: Float64Array | null = null;
  private listeners = new Set<() => void>();
  private snapshot: HudSnapshot;
  private version = 0;
  private lastEmit = 0;
  private lastSave = 0;
  private repo: SaveRepository = new LocalSaveRepository();
  sound = new SoundEngine();
  private toasts: Toast[] = [];
  private toastId = 1;
  private errorTimes = new Map<string, number>();
  private camera: Camera = { zoom: 1, panX: 0, panY: 0 };
  private view: ViewMetrics = { ts: 20, ox: 0, oy: 0, cssW: 560, cssH: 360 };
  private cssW = 560;
  private cssH = 360;
  private dpr = 1;
  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: Gesture = { kind: 'none' };
  private strokeId = 1;
  private hoverCell = -1;
  private preview: Preview | null = null;
  private hint = '';
  tool: ToolId = 'canal';
  paused = false;
  private selectedId = -1;
  private selectedCell = -1;
  keyboardCell = -1;
  showHeights = false;
  private wetCanals = 0;
  private savedAt = 0;
  private saveError = '';
  private loadMessage = '';
  private ambientTimer = 0;
  private cleanup: (() => void)[] = [];
  private readonly tutorialPath = authorWorld().tutorialPath;

  constructor() {
    const loaded = this.repo.load();
    if (loaded.ok) {
      this.state = loaded.state;
      this.loadMessage = loaded.repaired ? 'Your saved village was repaired after a small problem.' : '';
    } else {
      this.state = createInitialState();
      if (loaded.reason === 'future') this.loadMessage = `${loaded.message}. Started a new world; the newer save is untouched until you save.`;
      else if (loaded.reason === 'corrupt') this.loadMessage = 'The saved village could not be read, so a new world was started.';
    }
    if (this.state.settings.tutorialDone) this.tool = 'inspect';
    this.sound.setEnabled(false);
    this.snapshot = this.buildSnapshot();
  }

  // ---------- React store ----------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snapshot;

  private emit() {
    this.version++;
    this.snapshot = this.buildSnapshot();
    for (const l of this.listeners) l();
  }

  // ---------- lifecycle ----------
  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    const ro = new ResizeObserver(() => this.handleResize());
    ro.observe(canvas);
    this.cleanup.push(() => ro.disconnect());
    this.handleResize();
    this.bindPointer(canvas);
    const onHide = () => {
      if (document.visibilityState === 'hidden') this.save();
    };
    const onPageHide = () => this.save();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    this.cleanup.push(() => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
    });
    this.lastFrame = performance.now();
    this.lastSave = this.lastFrame;
    this.raf = requestAnimationFrame(this.frame);
  }

  detach() {
    cancelAnimationFrame(this.raf);
    for (const c of this.cleanup) c();
    this.cleanup = [];
    this.renderer = null;
    this.canvas = null;
  }

  private handleResize() {
    if (!this.canvas || !this.renderer) return;
    const rect = this.canvas.getBoundingClientRect();
    this.cssW = Math.max(1, rect.width);
    this.cssH = Math.max(1, rect.height);
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.renderer.resize(this.cssW, this.cssH, this.dpr);
    this.camera = clampCamera(this.camera, this.cssW, this.cssH, this.state.grid.w, this.state.grid.h);
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(250, now - this.lastFrame);
    this.lastFrame = now;
    const hidden = typeof document !== 'undefined' && document.hidden;
    if (!this.paused && !hidden) this.acc += dt * this.state.settings.speed;
    let steps = 0;
    const maxSteps = CONFIG.maxCatchUpTicks * this.state.settings.speed;
    while (this.acc >= TICK_MS && steps < maxSteps) {
      this.tickOnce();
      this.acc -= TICK_MS;
      steps++;
    }
    if (steps >= maxSteps) this.acc = 0;
    const alpha = this.paused ? 1 : Math.min(1, this.acc / TICK_MS);

    this.view = computeView(this.cssW, this.cssH, this.state.grid.w, this.state.grid.h, this.camera);
    if (this.renderer) {
      this.renderer.draw(this.state, this.prevWater, alpha, now / 1000, this.view, {
        hoverCell: this.hoverCell,
        preview: this.preview,
        selectedId: this.selectedId,
        selectedCell: this.selectedCell,
        keyboardCell: this.keyboardCell,
        showHeights: this.showHeights,
        reducedMotion: this.state.settings.reducedMotion,
        tutorialPath: this.tutorialStep() === 0 ? this.tutorialPath : null,
        highlightZone: this.tutorialStep() === 3 ? { x: 17, y: 3, w: 5, h: 5 } : null,
      });
    }

    this.ambientTimer += dt;
    if (this.ambientTimer > 300) {
      const rain = { dry: 0, drizzle: 0.35, rain: 0.65, heavy: 1 }[this.state.weather.mode];
      this.sound.ambient(this.paused ? 0 : rain, Math.min(1, this.snapshot.ecosystem.score / 60), this.ambientTimer / 1000);
      this.ambientTimer = 0;
    }
    if (now - this.lastEmit > 250) {
      this.lastEmit = now;
      this.expireToasts(now);
      this.emit();
    }
    if (now - this.lastSave > CONFIG.autosaveMs) {
      this.lastSave = now;
      this.save();
    }
  };

  private tickOnce() {
    const g = this.state.grid;
    if (!this.prevWater || this.prevWater.length !== g.water.length) this.prevWater = new Float64Array(g.water.length);
    this.prevWater.set(g.water);
    const res = stepGame(this.state);
    if (DEV && Math.abs(res.residual) > massTolerance(this.state.ledger.total)) {
      console.warn('[aqua-vault] water ledger residual', res.residual, this.state.ledger);
    }
    this.handleEvents(res.events);
    let wet = 0;
    for (let i = 0; i < g.canal.length; i++) if (g.canal[i] && g.water[i] > 0.15) wet++;
    if (wet > this.wetCanals) this.sound.play('plunk');
    this.wetCanals = wet;
  }

  // ---------- commands ----------
  dispatch(cmd: Command) {
    const events: GameEvent[] = [];
    applyCommand(this.state, cmd, events);
    this.handleEvents(events);
    this.refreshPreview();
    this.emit();
  }

  private handleEvents(events: GameEvent[]) {
    const now = performance.now();
    for (const e of events) {
      switch (e.type) {
        case 'achievement': {
          const def = ACHIEVEMENTS.find((a) => a.id === e.id);
          this.toast('achievement', def?.bn ? `${def.bn} · ${def.title}` : def?.title ?? e.id, `+${e.xp} XP${e.materials ? ` · +${e.materials} materials` : ''}`);
          this.sound.play('chime');
          this.celebrateFor(e.id);
          this.save();
          break;
        }
        case 'levelUp': {
          const unlocked = (Object.keys(CONFIG.unlockLevel) as (keyof typeof CONFIG.unlockLevel)[])
            .filter((k) => CONFIG.unlockLevel[k] === e.level)
            .map((k) => TOOL_INFO[k as ToolId]?.name ?? k);
          this.toast('level', `Level ${e.level}`, unlocked.length ? `Unlocked: ${unlocked.join(', ')}` : 'The village grows');
          break;
        }
        case 'error': {
          const last = this.errorTimes.get(e.message) ?? 0;
          if (now - last > 1500) {
            this.errorTimes.set(e.message, now);
            this.toast('error', e.message);
            this.sound.play('error');
          }
          break;
        }
        case 'built':
          if (this.renderer && e.what === 'canal') this.renderer.dust(this.state, e.cell, this.view);
          this.sound.play(e.what === 'canal' ? 'dig' : 'build');
          break;
        case 'erased':
          this.sound.play('erase');
          break;
        case 'harvest':
          this.toast('harvest', `Harvest +${e.materials} materials`, e.xp ? `+${e.xp} XP` : undefined);
          this.sound.play('harvest');
          {
            const b = getBuilding(this.state, e.buildingId);
            if (b && this.renderer) this.renderer.celebrate(this.state, idx(this.state.grid, b.x, b.y), this.view, this.state.settings.reducedMotion);
          }
          break;
        case 'stocked':
          this.toast('info', 'Fish released into the pond', 'Keep a gentle inflow so they grow');
          break;
        case 'undo':
          if (!e.ok) this.toast('info', 'Nothing to undo');
          break;
      }
    }
  }

  private celebrateFor(id: string) {
    if (!this.renderer) return;
    const typeFor: Record<string, string> = {
      'first-irrigation': 'field',
      'first-harvest': 'field',
      'reservoir-filled': 'reservoir',
      'turbine-power': 'turbine',
      'village-lit': 'house',
      'clean-water': 'treatment',
      'house-supplied': 'house',
      'fish-stocked': 'fishpond',
      'fish-harvest': 'fishpond',
      'wetland-thrives': 'wetland',
      'floating-harvest': 'floating',
      'village-bloom': 'house',
    };
    const g = this.state.grid;
    const b = this.state.buildings.find((x) => x.type === typeFor[id]);
    let cell = b ? idx(g, b.x + Math.floor(b.w / 2), b.y + Math.floor(b.h / 2)) : -1;
    if (cell < 0) {
      const c = g.canal.findIndex((v, i) => v === 1 && g.water[i] > 0.3);
      cell = c >= 0 ? c : idx(g, 8, 5);
    }
    this.renderer.celebrate(this.state, cell, this.view, this.state.settings.reducedMotion);
    if (id === 'village-bloom') {
      for (const h of this.state.buildings) if (h.type === 'house') this.renderer.celebrate(this.state, idx(g, h.x, h.y), this.view, this.state.settings.reducedMotion);
    }
  }

  toast(kind: Toast['kind'], title: string, sub?: string) {
    this.toasts.push({ id: this.toastId++, kind, title, sub, at: performance.now() });
    if (this.toasts.length > 4) this.toasts.shift();
    this.emit();
  }

  dismissToast(id: number) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.emit();
  }

  private expireToasts(now: number) {
    const life = (t: Toast) => (t.kind === 'achievement' || t.kind === 'level' ? 5000 : 2800);
    this.toasts = this.toasts.filter((t) => now - t.at < life(t));
  }

  // ---------- UI actions ----------
  setTool(tool: ToolId) {
    this.tool = tool;
    this.preview = null;
    if (tool !== 'inspect') {
      this.selectedId = -1;
      this.selectedCell = -1;
    }
    this.refreshPreview();
    this.emit();
  }

  toolLocked(tool: ToolId): number {
    if (tool === 'inspect' || tool === 'erase') return 0;
    const key = tool as keyof typeof CONFIG.unlockLevel;
    if (!(key in CONFIG.unlockLevel)) return 0;
    return isUnlocked(this.state, key) ? 0 : CONFIG.unlockLevel[key];
  }

  togglePause() {
    this.paused = !this.paused;
    this.emit();
  }

  setSpeed(speed: 1 | 2) {
    this.state.settings.speed = speed;
    this.emit();
  }

  undo() {
    this.dispatch({ type: 'undo' });
  }

  inspectAction(a: { id: InspectAction; buildingId?: number; cell?: number }) {
    if (a.id === 'harvest' && a.buildingId !== undefined) this.dispatch({ type: 'harvest', buildingId: a.buildingId });
    else if (a.id === 'stock' && a.buildingId !== undefined) this.dispatch({ type: 'stock', buildingId: a.buildingId });
    else if (a.id === 'rotate' && a.buildingId !== undefined) this.dispatch({ type: 'rotate', buildingId: a.buildingId });
    else if (a.id === 'toggleGate' && a.cell !== undefined) this.dispatch({ type: 'toggleGate', cell: a.cell });
    else if (a.id === 'remove' && a.buildingId !== undefined) {
      const b = getBuilding(this.state, a.buildingId);
      if (b) {
        this.dispatch({ type: 'erase', cells: [idx(this.state.grid, b.x, b.y)], includeBuildings: true });
        this.selectedId = -1;
        this.emit();
      }
    }
  }

  clearSelection() {
    this.selectedId = -1;
    this.selectedCell = -1;
    this.emit();
  }

  setSetting<K extends keyof GameState['settings']>(key: K, value: GameState['settings'][K]) {
    this.state.settings[key] = value;
    if (key === 'sound') this.sound.setEnabled(Boolean(value));
    this.save();
    this.emit();
  }

  toggleHeights() {
    this.showHeights = !this.showHeights;
    this.emit();
  }

  skipTutorial() {
    this.state.settings.tutorialDone = true;
    this.save();
    this.emit();
  }

  zoomBy(factor: number, cx = this.cssW / 2, cy = this.cssH / 2) {
    const before = this.view;
    const cam = { ...this.camera, zoom: this.camera.zoom * factor };
    const clamped = clampCamera(cam, this.cssW, this.cssH, this.state.grid.w, this.state.grid.h);
    // Keep the point under the cursor fixed.
    const worldX = (cx - before.ox) / before.ts;
    const worldY = (cy - before.oy) / before.ts;
    const after = computeView(this.cssW, this.cssH, this.state.grid.w, this.state.grid.h, { ...clamped, panX: 0, panY: 0 });
    clamped.panX = cx - worldX * after.ts - after.ox;
    clamped.panY = cy - worldY * after.ts - after.oy;
    this.camera = clampCamera(clamped, this.cssW, this.cssH, this.state.grid.w, this.state.grid.h);
    this.emit();
  }

  panBy(dx: number, dy: number) {
    this.camera = clampCamera({ ...this.camera, panX: this.camera.panX + dx, panY: this.camera.panY + dy }, this.cssW, this.cssH, this.state.grid.w, this.state.grid.h);
  }

  resetView() {
    this.camera = { zoom: 1, panX: 0, panY: 0 };
    this.emit();
  }

  newWorld() {
    const settings = { ...this.state.settings, tutorialDone: false };
    this.repo.clear();
    this.state = createInitialState(this.state.seed);
    this.state.settings = settings;
    this.prevWater = null;
    this.selectedId = -1;
    this.selectedCell = -1;
    this.tool = 'canal';
    this.paused = false;
    this.toasts = [];
    this.save();
    this.toast('info', 'A new monsoon begins', 'The village is waiting for water');
  }

  save(): boolean {
    const ok = this.repo.save(this.state);
    if (ok) {
      this.savedAt = Date.now();
      this.saveError = '';
    } else {
      this.saveError = 'Could not save in this browser (private mode or storage full).';
    }
    return ok;
  }

  saveNow() {
    if (this.save()) this.toast('info', 'Village saved', 'Stored in this browser only');
    else this.toast('error', this.saveError);
  }

  // ---------- keyboard grid mode ----------
  keyboardMove(dx: number, dy: number, dig: boolean) {
    const g = this.state.grid;
    if (this.keyboardCell < 0) this.keyboardCell = idx(g, 2, 3);
    const x = Math.max(0, Math.min(g.w - 1, (this.keyboardCell % g.w) + dx));
    const y = Math.max(0, Math.min(g.h - 1, Math.floor(this.keyboardCell / g.w) + dy));
    const next = idx(g, x, y);
    if (dig && (this.tool === 'canal' || this.tool === 'erase')) {
      const cells = this.keyboardCell === next ? [next] : [this.keyboardCell, next];
      if (this.tool === 'canal') this.dispatch({ type: 'drawCanal', cells, stroke: this.strokeId });
      else this.dispatch({ type: 'erase', cells, stroke: this.strokeId });
    }
    this.keyboardCell = next;
    this.hoverCell = next;
    this.refreshPreview();
    this.emit();
  }

  keyboardActivate() {
    if (this.keyboardCell < 0) this.keyboardCell = idx(this.state.grid, 2, 3);
    this.strokeId++;
    this.tapCell(this.keyboardCell, true);
  }

  keyboardEnd() {
    this.strokeId++;
  }

  // ---------- pointer input ----------
  private bindPointer(canvas: HTMLCanvasElement) {
    const toCanvas = (e: PointerEvent | WheelEvent) => clientToCanvas(e.clientX, e.clientY, canvas.getBoundingClientRect(), this.cssW, this.cssH);
    const cellAt = (x: number, y: number) => canvasToCell(x, y, this.view, this.state.grid.w, this.state.grid.h);

    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const p = toCanvas(e);
      this.pointers.set(e.pointerId, p);
      this.keyboardCell = -1;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.gesture = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cam: { ...this.camera } };
        this.preview = null;
        return;
      }
      if (this.pointers.size > 2) return;
      const c = cellAt(p.x, p.y);
      const right = e.button === 2;
      if (right || this.tool === 'canal' || this.tool === 'erase') {
        const mode = right || this.tool === 'erase' ? 'erase' : 'canal';
        this.strokeId++;
        this.gesture = { kind: 'stroke', mode, last: [c.cx, c.cy], startCell: c.inside ? idx(this.state.grid, c.cx, c.cy) : -1, moved: false, pointerId: e.pointerId };
        if (c.inside && mode === 'canal') this.dispatch({ type: 'drawCanal', cells: [idx(this.state.grid, c.cx, c.cy)], stroke: this.strokeId });
        return;
      }
      if (this.tool === 'inspect') {
        this.gesture = { kind: 'tap', pointerId: e.pointerId, sx: p.x, sy: p.y, panning: false, cam: { ...this.camera } };
        return;
      }
      this.gesture = { kind: 'place', pointerId: e.pointerId };
      this.hoverCell = c.inside ? idx(this.state.grid, c.cx, c.cy) : -1;
      this.refreshPreview();
    };

    const move = (e: PointerEvent) => {
      const p = toCanvas(e);
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
      const gst = this.gesture;
      if (gst.kind === 'pinch' && this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        this.camera = clampCamera(
          { zoom: gst.cam.zoom * (d / Math.max(1, gst.d0)), panX: gst.cam.panX + (mx - gst.mx), panY: gst.cam.panY + (my - gst.my) },
          this.cssW,
          this.cssH,
          this.state.grid.w,
          this.state.grid.h,
        );
        return;
      }
      const c = cellAt(p.x, p.y);
      const cell = c.inside ? idx(this.state.grid, c.cx, c.cy) : -1;
      if (gst.kind === 'stroke' && gst.pointerId === e.pointerId) {
        if (c.cx === gst.last[0] && c.cy === gst.last[1]) return;
        const pts = lineCells(gst.last[0], gst.last[1], c.cx, c.cy).slice(1);
        gst.last = [c.cx, c.cy];
        gst.moved = true;
        const g = this.state.grid;
        const cells = pts.filter(([x, y]) => x >= 0 && y >= 0 && x < g.w && y < g.h).map(([x, y]) => idx(g, x, y));
        if (cells.length) {
          if (gst.mode === 'canal') this.dispatch({ type: 'drawCanal', cells, stroke: this.strokeId });
          else this.dispatch({ type: 'erase', cells, stroke: this.strokeId });
        }
        this.hoverCell = cell;
        return;
      }
      if (gst.kind === 'tap' && gst.pointerId === e.pointerId) {
        const dist = Math.hypot(p.x - gst.sx, p.y - gst.sy);
        if (gst.panning || dist > 8) {
          gst.panning = true;
          this.camera = clampCamera({ ...gst.cam, panX: gst.cam.panX + (p.x - gst.sx), panY: gst.cam.panY + (p.y - gst.sy) }, this.cssW, this.cssH, this.state.grid.w, this.state.grid.h);
        }
        return;
      }
      if (cell !== this.hoverCell) {
        this.hoverCell = cell;
        this.refreshPreview();
        this.emit();
      }
    };

    const up = (e: PointerEvent) => {
      const p = toCanvas(e);
      this.pointers.delete(e.pointerId);
      const gst = this.gesture;
      if (gst.kind === 'pinch') {
        if (this.pointers.size === 0) this.gesture = { kind: 'none' };
        return;
      }
      const c = cellAt(p.x, p.y);
      const cell = c.inside ? idx(this.state.grid, c.cx, c.cy) : -1;
      if (gst.kind === 'stroke' && gst.pointerId === e.pointerId) {
        if (gst.mode === 'erase' && !gst.moved && gst.startCell >= 0) {
          this.dispatch({ type: 'erase', cells: [gst.startCell], includeBuildings: true, stroke: this.strokeId });
        }
        this.strokeId++;
      } else if (gst.kind === 'tap' && gst.pointerId === e.pointerId) {
        if (!gst.panning && cell >= 0) this.tapCell(cell, false);
      } else if (gst.kind === 'place' && gst.pointerId === e.pointerId) {
        if (cell >= 0) this.tapCell(cell, false);
        if (e.pointerType !== 'mouse') {
          this.hoverCell = -1;
          this.preview = null;
        }
      }
      this.gesture = { kind: 'none' };
      this.emit();
    };

    const cancel = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      this.gesture = { kind: 'none' };
      this.strokeId++;
    };

    const leave = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && this.gesture.kind === 'none') {
        this.hoverCell = -1;
        this.preview = null;
        this.hint = '';
        this.emit();
      }
    };

    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toCanvas(e);
      this.zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
    };
    const ctxMenu = (e: Event) => e.preventDefault();

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', cancel);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('contextmenu', ctxMenu);
    this.cleanup.push(() => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('contextmenu', ctxMenu);
    });
  }

  private anchorFor(type: BuildingTypePlaceable, cell: number): [number, number] {
    const g = this.state.grid;
    const [w, h] = CONFIG.footprint[type];
    return [(cell % g.w) - Math.floor((w - 1) / 2), Math.floor(cell / g.w) - Math.floor((h - 1) / 2)];
  }

  /** A tap / Enter on a cell with the current tool. */
  private tapCell(cell: number, keyboard: boolean) {
    const g = this.state.grid;
    const tool = this.tool;
    if (tool === 'inspect') {
      const x = cell % g.w;
      const y = Math.floor(cell / g.w);
      const floating = this.state.buildings.find((b) => b.type === 'floating' && b.x === x && b.y === y);
      const b = floating ?? getBuilding(this.state, g.structure[cell]);
      if (b) {
        this.selectedId = b.id;
        this.selectedCell = -1;
      } else {
        this.selectedId = -1;
        this.selectedCell = cell;
      }
      this.emit();
      return;
    }
    if (tool === 'canal') {
      this.dispatch({ type: 'drawCanal', cells: [cell], stroke: this.strokeId });
      return;
    }
    if (tool === 'erase') {
      this.dispatch({ type: 'erase', cells: [cell], includeBuildings: true });
      return;
    }
    if (tool === 'gate') {
      this.dispatch({ type: 'gate', cell });
      return;
    }
    if (tool === 'bridge') {
      this.dispatch({ type: 'bridge', cell });
      return;
    }
    const [x, y] = this.anchorFor(tool, cell);
    const before = this.state.buildings.length;
    this.dispatch({ type: 'place', building: tool, x, y });
    if (this.state.buildings.length > before) {
      const nb = this.state.buildings[this.state.buildings.length - 1];
      this.selectedId = nb.id;
      if (nb.type === 'reservoir' && !this.state.settings.tutorialDone) {
        this.state.settings.tutorialDone = true;
        this.toast('info', 'Tips complete', 'Open Goals for the next milestones');
      }
    }
    void keyboard;
  }

  private refreshPreview() {
    const cell = this.hoverCell;
    const tool = this.tool;
    this.hint = '';
    if (cell < 0 || tool === 'inspect') {
      this.preview = null;
      return;
    }
    const g = this.state.grid;
    if (tool === 'canal') {
      const c = canDigCanal(this.state, cell);
      const silent = c.reason.startsWith('Already');
      this.preview = { cells: [cell], ok: c.ok || silent, reason: c.reason };
      if (!c.ok && !silent) this.hint = c.reason;
      return;
    }
    if (tool === 'erase') {
      this.preview = { cells: [cell], ok: true, reason: '' };
      return;
    }
    if (tool === 'gate' || tool === 'bridge') {
      const ok = g.canal[cell] === 1 && g.structure[cell] < 0;
      this.preview = { cells: [cell], ok, reason: ok ? '' : 'Needs an open canal' };
      if (!ok) this.hint = 'Place on a canal';
      return;
    }
    const [x, y] = this.anchorFor(tool, cell);
    const [w, h] = CONFIG.footprint[tool];
    const cells: number[] = [];
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (xx >= 0 && yy >= 0 && xx < g.w && yy < g.h) cells.push(idx(g, xx, yy));
    const check = validatePlacement(this.state, tool, x, y);
    this.preview = { cells, ok: check.ok, reason: check.reason };
    this.hint = check.ok ? `${TOOL_INFO[tool].name}: ${check.cost} materials` : check.reason;
  }

  // ---------- derived ----------
  tutorialStep(): number {
    const s = this.state;
    if (s.settings.tutorialDone) return -1;
    const has = (id: string) => s.achievements.includes(id);
    if (!has('canal-delivered')) return 0;
    if (!has('first-irrigation')) return 1;
    if (!has('first-harvest')) return 2;
    if (!s.buildings.some((b) => b.type === 'reservoir')) return 3;
    return -1;
  }

  private buildSnapshot(): HudSnapshot {
    const s = this.state;
    const level = levelForXp(s.resources.xp);
    let stored = 0;
    let storageCap = 0;
    let clean = 0;
    for (const b of s.buildings) {
      if (STORAGE_TYPES.has(b.type)) {
        stored += b.water;
        storageCap += storageCapacity(b.type);
      }
      clean += b.clean;
    }
    const step = this.tutorialStep();
    const tutorialText: Record<number, { text: string; bn?: string }> = {
      0: { text: 'Rain is filling the catchment (top-left). Drag along the glowing arrow to dig a canal to the dry rice paddy.', bn: 'বৃষ্টি' },
      1: { text: 'Water only flows downhill. Watch it travel along your canal to the paddy.' },
      2: { text: 'First irrigation! When the rice turns gold, pick Inspect and tap the paddy to harvest.', bn: 'প্রথম সেচ' },
      3: { text: 'Level 2: the east basin glows. Build a Reservoir there, then dig a short canal from the stream into it.' },
    };
    let inspect: InspectInfo | null = null;
    if (this.selectedId >= 0) {
      const b = getBuilding(s, this.selectedId);
      if (b) inspect = inspectBuilding(s, b);
      else this.selectedId = -1;
    } else if (this.selectedCell >= 0) {
      inspect = inspectTile(s, this.selectedCell);
    }
    const phase = dayPhase(s.tick);
    return {
      version: this.version,
      level,
      xp: s.resources.xp,
      levelFloor: CONFIG.progression.levels[level - 1] ?? 0,
      levelNext: nextLevelXp(s.resources.xp),
      materials: Math.floor(s.resources.materials),
      freeCanals: s.resources.freeCanals,
      weather: s.weather.mode,
      storedWater: stored,
      storageCap,
      energy: s.resources.energy,
      energyCap: energyCapacity(s),
      generation: s.ledger.energyGenerated * CONFIG.ticksPerSecond,
      clean,
      ecosystem: ecosystemScore(s),
      paused: this.paused,
      speed: s.settings.speed,
      tool: this.tool,
      inspect,
      achievements: [...s.achievements],
      toasts: [...this.toasts],
      tutorial: step >= 0 ? { step, ...tutorialText[step] } : null,
      settings: { ...s.settings },
      showHeights: this.showHeights,
      canUndo: s.history.length > 0,
      night: phase > 0.55 && phase < 0.95,
      hint: this.hint,
      savedAt: this.savedAt,
      saveError: this.saveError,
      milestonesDone: MILESTONES.filter((m) => s.achievements.includes(m.achievement)).length,
      loadMessage: this.loadMessage,
    };
  }

  dismissLoadMessage() {
    this.loadMessage = '';
    this.emit();
  }
}
