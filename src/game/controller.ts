import { CONFIG } from './model/config';
import { canDigCanal, isUnlocked, STORAGE_TYPES, storageCapacity, validatePlacement } from './model/buildings';
import type { BuildingTypePlaceable, Command, GameEvent, GameState, LevelId, ToolId } from './model/types';
import { createInitialState, getBuilding, idx } from './model/world';
import { applyCommand } from './sim/commands';
import { stepGame, massTolerance } from './sim/tick';
import { ecosystemScore, nextRankXp, RANK_NAMES, rankForXp } from './sim/progression';
import { energyCapacity } from './sim/power';
import { isNight, statePhase } from './sim/weather';
import { activeObjectives, openObjectives } from './sim/objectives';
import { ACHIEVEMENTS } from './content/milestones';
import { TOOL_INFO, TOOL_ORDER } from './content/strings';
import { getLevel, isLevelId, LEVEL_ORDER, LEVELS, nextLevel, SANDBOX, type Coach, type HudItem, type LevelDef } from './content/campaign';
import { lineCells } from './input/bresenham';
import { clientToCanvas } from './input/coordinateMapping';
import { GestureMachine, type GestureAction } from './input/gestures';
import { LocalSaveRepository, type SaveRepository } from './persistence/storage';
import { isLevelUnlocked, recordCompletion, recordSkip, totalStars, type Profile, type ProfileSettings } from './persistence/profile';
import { SoundEngine } from './audio/sound';
import { inspectBuilding, inspectTile, type InspectAction, type InspectInfo } from './inspect';
import { Canvas2DRenderer } from './render/canvas2d';
import type { GameRenderer, Preview } from './render/types';

// ---------- UI slices (each re-renders only its own React subtree) ----------

export interface Toast {
  id: number;
  kind: 'achievement' | 'objective' | 'error' | 'info' | 'harvest';
  title: string;
  sub?: string;
  at: number;
}

export interface HudSlice {
  levelId: LevelId;
  levelNum: number;
  levelTitle: string;
  levelBn: string;
  hud: HudItem[];
  materials: number;
  freeCanals: number;
  weather: GameState['weather']['mode'];
  stored: number;
  storageCap: number;
  energy: number;
  energyCap: number;
  generation: number;
  clean: number;
  ecosystem: number;
  living: string[];
  paused: boolean;
  speed: 1 | 2 | 4;
  night: boolean;
  showHeights: boolean;
  sound: boolean;
  rank: number;
  rankName: string;
  xp: number;
  xpFloor: number;
  xpNext: number | null;
  totalStars: number;
}

export interface ObjectiveItem {
  id: string;
  icon: string;
  text: string;
  hint?: string;
  done: boolean;
  current: boolean;
  progress: number | null;
}

export interface ObjectivesSlice {
  levelId: LevelId;
  num: number;
  title: string;
  bn: string;
  ordered: boolean;
  items: ObjectiveItem[];
  complete: boolean;
  stars: number;
  spent: number;
  parMaterials: number;
  parSeconds: number;
  elapsed: number;
  canSkip: boolean;
  /** The current objective is mostly waiting (fill, grow, sustain): offer fast-forward. */
  waiting: boolean;
  hasCoach: boolean;
  sandbox: boolean;
}

export interface ToolButton {
  id: ToolId;
  name: string;
  short: string;
  icon: string;
  cost: number;
  isNew: boolean;
  pulse: boolean;
  key: string;
}

export interface ToolsSlice {
  tool: ToolId;
  tools: ToolButton[];
  canUndo: boolean;
  description: string;
  cost: number;
}

export interface InspectSlice {
  info: InspectInfo | null;
  /** Building footprint (or tile) being inspected, in grid units. */
  anchor: { x: number; y: number; w: number; h: number } | null;
}

export type Overlay =
  | { kind: 'none' }
  | { kind: 'intro'; levelId: LevelId; num: number; title: string; bn: string; intro: string; objectives: string[]; tools: ToolId[] }
  | { kind: 'tool'; tool: ToolId; more: number }
  | {
      kind: 'complete';
      levelId: LevelId;
      num: number;
      title: string;
      stars: number;
      previousStars: number;
      xpGained: number;
      seconds: number;
      spent: number;
      parMaterials: number;
      parSeconds: number;
      next: LevelId | null;
      nextTitle: string;
      nextTools: ToolId[];
      rankUp: string | null;
    };

export interface LevelEntry {
  id: LevelId;
  num: number;
  title: string;
  bn: string;
  unlocked: boolean;
  completed: boolean;
  skipped: boolean;
  stars: number;
  current: boolean;
  tools: ToolId[];
}

export interface JournalEntryView {
  id: LevelId;
  num: number;
  title: string;
  bn: string;
  locked: boolean;
  pages: LevelDef['journal'];
}

export interface MetaSlice {
  levels: LevelEntry[];
  sandbox: LevelEntry;
  journal: JournalEntryView[];
  settings: ProfileSettings;
  loadMessage: string;
  rendererKind: 'webgl' | 'canvas2d' | 'none';
  savedAt: number;
  saveError: string;
}

export interface Slices {
  hud: HudSlice;
  objectives: ObjectivesSlice;
  tools: ToolsSlice;
  inspect: InspectSlice;
  toasts: Toast[];
  overlay: Overlay;
  hint: string;
  meta: MetaSlice;
}
export type SliceName = keyof Slices;

/** Tiny store: a slice only notifies its listeners when its content actually changed. */
class SliceStore {
  private values = {} as Slices;
  private keys = {} as Record<SliceName, string>;
  private listeners = {} as Record<SliceName, Set<() => void>>;

  set<K extends SliceName>(name: K, value: Slices[K]): void {
    const key = JSON.stringify(value);
    if (key === this.keys[name]) return;
    this.keys[name] = key;
    this.values[name] = value;
    for (const fn of this.listeners[name] ?? []) fn();
  }

  get<K extends SliceName>(name: K): Slices[K] {
    return this.values[name];
  }

  subscribe(name: SliceName, fn: () => void): () => void {
    (this.listeners[name] ??= new Set()).add(fn);
    return () => this.listeners[name].delete(fn);
  }
}

const TICK_MS = 1000 / CONFIG.ticksPerSecond;
const DEV = process.env.NODE_ENV !== 'production';
const SKIP_AFTER_TICKS = 180 * CONFIG.ticksPerSecond;

const ICON_BUILDING: Record<string, string> = {
  field: 'field',
  reservoir: 'reservoir',
  drop: 'reservoir',
  sun: 'field',
  turbine: 'turbine',
  battery: 'battery',
  house: 'house',
  treatment: 'treatment',
  connector: 'connector',
  fishpond: 'fishpond',
  fish: 'fishpond',
  wetland: 'wetland',
  floating: 'floating',
  leaf: 'floating',
  pump: 'pump',
  star: 'house',
};

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export class GameController {
  state: GameState;
  level: LevelDef;
  profile: Profile;
  readonly store = new SliceStore();
  readonly sound = new SoundEngine();

  private repo: SaveRepository;
  private renderer: GameRenderer | null = null;
  private container: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private attachToken = 0;
  private raf = 0;
  private lastFrame = 0;
  private acc = 0;
  private prevWater: Float64Array | null = null;
  private lastEmit = 0;
  private lastSave = 0;
  private toasts: Toast[] = [];
  private toastId = 1;
  private errorTimes = new Map<string, number>();
  private cssW = 1;
  private cssH = 1;
  private gestures = new GestureMachine();
  private strokeId = 1;
  private strokeMode: 'canal' | 'erase' = 'canal';
  private strokeLast = -1;
  private strokeStart = -1;
  private hoverCell = -1;
  private preview: Preview | null = null;
  private hint = '';
  tool: ToolId = 'inspect';
  private userPaused = false;
  private overlay: Overlay = { kind: 'none' };
  private overlayQueue: Overlay[] = [];
  private selectedId = -1;
  private selectedCell = -1;
  keyboardCell = -1;
  private heightsToggle = false;
  private wetCanals = 0;
  private savedAt = 0;
  private saveError = '';
  private loadMessage = '';
  private ambientTimer = 0;
  private usedTools = new Set<ToolId>();
  private cleanup: (() => void)[] = [];
  private canvasCleanup: (() => void)[] = [];

  constructor(repo: SaveRepository = new LocalSaveRepository()) {
    this.repo = repo;
    const { profile, upgraded } = this.repo.loadProfile();
    this.profile = profile;
    if (upgraded) this.loadMessage = 'Your saved progress was carried over to the new campaign.';
    const id = isLevelUnlocked(profile, profile.currentLevel) ? profile.currentLevel : LEVEL_ORDER[0];
    this.level = getLevel(id);
    const loaded = this.repo.load(id);
    if (loaded.ok) {
      this.state = loaded.state;
      if (loaded.repaired) this.loadMessage = 'Your saved level was repaired after a small problem.';
    } else {
      this.state = createInitialState(undefined, id);
      if (loaded.reason === 'future') this.loadMessage = `${loaded.message}. Started fresh; the newer save is untouched until you save.`;
      else if (loaded.reason === 'corrupt') this.loadMessage = 'The saved level could not be read, so it was started fresh.';
      this.queueLevelIntro();
    }
    this.tool = this.defaultTool();
    this.applySettings();
    this.publishAll();
  }

  // ---------- lifecycle ----------

  /** Mount into a container. The controller owns its canvas so it can swap renderers. */
  attach(container: HTMLElement) {
    this.container = container;
    const ro = new ResizeObserver(() => this.handleResize());
    ro.observe(container);
    this.cleanup.push(() => ro.disconnect());
    const onHide = () => {
      if (document.visibilityState === 'hidden') this.save();
    };
    const onPageHide = () => this.save();
    const unlockAudio = () => {
      if (this.profile.settings.sound) this.sound.setEnabled(true);
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    this.cleanup.push(() => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    });
    void this.mountRenderer();
    this.lastFrame = performance.now();
    this.lastSave = this.lastFrame;
    this.raf = requestAnimationFrame(this.frame);
  }

  detach() {
    this.attachToken++;
    cancelAnimationFrame(this.raf);
    for (const c of this.cleanup) c();
    this.cleanup = [];
    this.unmountRenderer();
    this.container = null;
  }

  private unmountRenderer() {
    for (const c of this.canvasCleanup) c();
    this.canvasCleanup = [];
    this.renderer?.dispose();
    this.renderer = null;
    this.canvas?.remove();
    this.canvas = null;
  }

  private async mountRenderer() {
    const token = ++this.attachToken;
    this.unmountRenderer();
    if (!this.container) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'game-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    this.container.appendChild(canvas);
    this.canvas = canvas;
    const forced2d = typeof location !== 'undefined' && /[?&]renderer=2d/.test(location.search);
    let r: GameRenderer | null = null;
    if (!forced2d && this.profile.settings.quality !== 'classic' && webglAvailable()) {
      try {
        const mod = await import('./render3d/ThreeRenderer');
        if (token !== this.attachToken) return;
        r = new mod.ThreeRenderer(canvas, {
          quality: this.profile.settings.quality,
          reducedMotion: this.profile.settings.reducedMotion,
          onContextLost: () => this.fallbackTo2d(),
        });
      } catch (err) {
        console.warn('[aqua-vault] 3D renderer unavailable, using classic 2D', err);
        r = null;
        // A canvas that has tried WebGL cannot provide a 2D context: start over with a fresh one.
        if (token !== this.attachToken) return;
        canvas.remove();
        const fresh = document.createElement('canvas');
        fresh.className = 'game-canvas';
        fresh.setAttribute('aria-hidden', 'true');
        this.container.appendChild(fresh);
        this.canvas = fresh;
      }
    }
    if (token !== this.attachToken || !this.canvas) return;
    if (!r) r = new Canvas2DRenderer(this.canvas);
    this.renderer = r;
    this.bindPointer(this.canvas);
    this.handleResize();
    r.structureChanged(this.state, true);
    this.publish('meta');
  }

  private fallbackTo2d() {
    if (this.profile.settings.quality === 'classic') return;
    this.toast('info', 'Switched to classic 2D view', 'The 3D view stopped responding on this device.');
    this.profile.settings.quality = 'classic';
    this.persistProfile();
    void this.mountRenderer();
  }

  private handleResize() {
    if (!this.container || !this.renderer) return;
    const rect = this.container.getBoundingClientRect();
    this.cssW = Math.max(1, rect.width);
    this.cssH = Math.max(1, rect.height);
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.renderer.resize(this.cssW, this.cssH, dpr);
  }

  get paused(): boolean {
    return this.userPaused || this.overlay.kind !== 'none';
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(250, now - this.lastFrame);
    this.lastFrame = now;
    const hidden = typeof document !== 'undefined' && document.hidden;
    const speed = this.profile.settings.speed;
    if (!this.paused && !hidden) this.acc += dt * speed;
    let steps = 0;
    const maxSteps = CONFIG.maxCatchUpTicks * speed;
    while (this.acc >= TICK_MS && steps < maxSteps) {
      this.tickOnce();
      this.acc -= TICK_MS;
      steps++;
    }
    if (steps >= maxSteps) this.acc = 0;
    const alpha = this.paused ? 1 : Math.min(1, this.acc / TICK_MS);

    this.processGestures(this.gestures.tick(now));

    if (this.renderer) {
      const coach = this.coach();
      this.renderer.render({
        state: this.state,
        prevWater: this.prevWater,
        alpha,
        time: now / 1000,
        ui: {
          hoverCell: this.hoverCell,
          preview: this.preview,
          placing: this.placingType(),
          selectedId: this.selectedId,
          selectedCell: this.selectedCell,
          keyboardCell: this.keyboardCell,
          showHeights: this.heightsToggle || !!coach?.heights,
          reducedMotion: this.profile.settings.reducedMotion,
          tutorialPath: coach?.path ?? null,
          highlightZone: coach?.zone ?? null,
          highlightCells: coach?.cells,
          pointer: null,
          showGrid: this.tool !== 'inspect',
          buildTool: this.tool !== 'inspect',
        },
      });
    }

    this.ambientTimer += dt;
    if (this.ambientTimer > 300) {
      const rain = { dry: 0, drizzle: 0.35, rain: 0.65, heavy: 1 }[this.state.weather.mode];
      const eco = this.store.get('hud')?.ecosystem ?? 0;
      this.sound.ambient(this.paused ? 0 : rain, Math.min(1, eco / 60), this.ambientTimer / 1000, this.paused ? 0 : this.canalFlow());
      this.ambientTimer = 0;
    }
    if (now - this.lastEmit > 250) {
      this.lastEmit = now;
      this.expireToasts(now);
      this.publishAll();
    }
    if (now - this.lastSave > CONFIG.autosaveMs) {
      this.lastSave = now;
      this.save();
    }
  };

  private canalFlow(): number {
    const g = this.state.grid;
    let f = 0;
    for (let i = 0; i < g.canal.length; i++) if (g.canal[i]) f += Math.hypot(g.flowX[i], g.flowY[i]);
    return f / 6;
  }

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
    if (events.some((e) => e.type === 'built' || e.type === 'erased' || (e.type === 'undo' && e.ok))) {
      this.renderer?.structureChanged(this.state, false);
    }
    this.refreshPreview();
    this.publish('hud');
    this.publish('tools');
    this.publish('inspect');
    this.publish('hint');
  }

  private handleEvents(events: GameEvent[]) {
    const now = performance.now();
    for (const e of events) {
      switch (e.type) {
        case 'achievement': {
          if (e.materials <= 0) break;
          const def = ACHIEVEMENTS.find((a) => a.id === e.id);
          this.toast('achievement', `+${e.materials} materials`, def ? `${def.title}${def.bn ? ` · ${def.bn}` : ''}` : undefined);
          break;
        }
        case 'objective': {
          const o = this.level.objectives.find((x) => x.id === e.id);
          this.toast('objective', 'Done!', o?.text);
          this.sound.play('objective');
          this.celebrateFor(o?.icon ?? '');
          this.save();
          break;
        }
        case 'levelComplete':
          this.onLevelComplete(e.stars);
          break;
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
          if (e.what === 'canal') this.renderer?.fx(this.state, 'dust', e.cell);
          this.sound.play(e.what === 'canal' ? 'dig' : 'build');
          break;
        case 'erased':
          this.sound.play('erase');
          break;
        case 'harvest': {
          this.toast('harvest', `Harvest +${e.materials} materials`);
          this.sound.play('harvest');
          const b = getBuilding(this.state, e.buildingId);
          if (b) this.renderer?.fx(this.state, 'celebrate', idx(this.state.grid, b.x, b.y));
          break;
        }
        case 'stocked':
          this.toast('info', 'Fish released into the pond', 'Keep fresh water flowing through it');
          break;
        case 'undo':
          if (!e.ok) this.toast('info', 'Nothing to undo');
          break;
      }
    }
  }

  private celebrateFor(icon: string) {
    if (!this.renderer) return;
    const g = this.state.grid;
    const type = ICON_BUILDING[icon];
    const targets = this.state.buildings.filter((b) => b.type === type);
    if (icon === 'star') {
      for (const h of targets) this.renderer.fx(this.state, 'celebrate', idx(g, h.x, h.y));
      return;
    }
    const b = targets[targets.length - 1];
    let cell = b ? idx(g, b.x + Math.floor(b.w / 2), b.y + Math.floor(b.h / 2)) : -1;
    if (cell < 0) {
      const c = g.canal.findIndex((v, i) => v === 1 && g.water[i] > 0.3);
      cell = c >= 0 ? c : idx(g, Math.floor(g.w / 2), Math.floor(g.h / 2));
    }
    this.renderer.fx(this.state, 'celebrate', cell);
  }

  toast(kind: Toast['kind'], title: string, sub?: string) {
    this.toasts.push({ id: this.toastId++, kind, title, sub, at: performance.now() });
    if (this.toasts.length > 3) this.toasts.shift();
    this.publish('toasts');
  }

  dismissToast(id: number) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.publish('toasts');
  }

  private expireToasts(now: number) {
    const life = (t: Toast) => (t.kind === 'error' ? 2600 : t.kind === 'objective' ? 3200 : 3600);
    const before = this.toasts.length;
    this.toasts = this.toasts.filter((t) => now - t.at < life(t));
    if (this.toasts.length !== before) this.publish('toasts');
  }

  // ---------- levels ----------

  private defaultTool(): ToolId {
    const t = this.pickDefaultTool();
    if (t !== 'inspect') this.usedTools.add(t);
    return t;
  }

  private pickDefaultTool(): ToolId {
    const first = openObjectives(this.state, this.level)[0];
    const t = first?.coach?.tool;
    return t && isUnlocked(this.state, t) && t !== 'inspect' && (t === 'canal' || t === 'gate') ? t : 'inspect';
  }

  private queueLevelIntro() {
    const lv = this.level;
    if (lv.id === 'sandbox' && this.profile.seenToolIntros.includes('fountain')) return;
    this.overlayQueue = [];
    this.overlayQueue.push({
      kind: 'intro',
      levelId: lv.id,
      num: lv.num,
      title: lv.title,
      bn: lv.bn,
      intro: lv.intro,
      objectives: lv.objectives.map((o) => o.text),
      tools: lv.newTools,
    });
    const intros = lv.newTools.filter((t) => !this.profile.seenToolIntros.includes(t) && TOOL_INFO[t].intro);
    intros.forEach((t, k) => this.overlayQueue.push({ kind: 'tool', tool: t, more: intros.length - k - 1 }));
    this.overlay = this.overlayQueue.shift() ?? { kind: 'none' };
  }

  /** Close the current card; the next queued card (if any) appears. */
  dismissOverlay() {
    const cur = this.overlay;
    if (cur.kind === 'tool' && !this.profile.seenToolIntros.includes(cur.tool)) {
      this.profile.seenToolIntros.push(cur.tool);
      this.persistProfile();
    }
    this.overlay = this.overlayQueue.shift() ?? { kind: 'none' };
    this.sound.play('click');
    this.publishAll();
  }

  startLevel(id: LevelId, fresh = false) {
    if (!isLevelUnlocked(this.profile, id)) {
      this.toast('info', 'That level is still locked', 'Finish or skip the level before it.');
      return;
    }
    this.save();
    this.profile.currentLevel = id;
    this.persistProfile();
    if (fresh) this.repo.clear(id);
    const loaded = fresh ? null : this.repo.load(id);
    this.level = getLevel(id);
    let firstVisit = false;
    if (loaded && loaded.ok) {
      this.state = loaded.state;
    } else if (id === 'sandbox' && !fresh) {
      this.state = this.sandboxFromVillage();
      firstVisit = true;
    } else {
      this.state = createInitialState(this.state.seed, id);
      firstVisit = true;
    }
    this.prevWater = null;
    this.selectedId = -1;
    this.selectedCell = -1;
    this.hoverCell = -1;
    this.preview = null;
    this.userPaused = false;
    this.usedTools.clear();
    this.wetCanals = 0;
    this.overlay = { kind: 'none' };
    this.overlayQueue = [];
    if (firstVisit) this.queueLevelIntro();
    else this.toast('info', `${this.level.num ? `Level ${this.level.num}: ` : ''}${this.level.title}`, 'Welcome back.');
    this.tool = this.defaultTool();
    this.renderer?.structureChanged(this.state, true);
    this.save();
    this.publishAll();
  }

  /** The sandbox starts from your finished village when there is one. */
  private sandboxFromVillage(): GameState {
    const v = this.repo.load('village');
    const s = createInitialState(this.state.seed, 'sandbox');
    if (!v.ok) return s;
    const village = v.state;
    village.levelId = 'sandbox';
    village.allowedTools = [...SANDBOX.tools];
    village.objectives = { done: [], sustain: {}, completedTick: null, stars: 0 };
    village.resources.materials = Math.max(village.resources.materials, 200);
    village.resources.freeCanalsMax = s.resources.freeCanalsMax;
    village.resources.freeCanals = s.resources.freeCanals;
    village.history = [];
    return village;
  }

  restartLevel() {
    this.startLevel(this.state.levelId, true);
  }

  goNextLevel() {
    const next = nextLevel(this.state.levelId);
    if (next && isLevelUnlocked(this.profile, next)) this.startLevel(next);
    else this.dismissOverlay();
  }

  skipLevel() {
    const id = this.state.levelId;
    if (id === 'sandbox' || this.state.objectives.completedTick !== null) return;
    recordSkip(this.profile, id);
    this.persistProfile();
    const next = nextLevel(id);
    this.toast('info', 'Level skipped', 'You can come back for stars any time.');
    if (next) this.startLevel(next);
  }

  private onLevelComplete(stars: number) {
    const lv = this.level;
    const seconds = Math.round((this.state.objectives.completedTick ?? this.state.tick) / CONFIG.ticksPerSecond);
    const rankBefore = rankForXp(this.profile.xp);
    const res = recordCompletion(this.profile, lv.id, stars, seconds, Math.max(0, this.state.stats.spent));
    const rankAfter = rankForXp(this.profile.xp);
    this.persistProfile();
    this.save();
    const next = nextLevel(lv.id);
    const nextDef = next ? getLevel(next) : null;
    this.sound.play('complete');
    for (const h of this.state.buildings) if (h.type === 'house' || h.type === 'field') this.renderer?.fx(this.state, 'celebrate', idx(this.state.grid, h.x, h.y));
    this.overlayQueue = [];
    this.overlay = {
      kind: 'complete',
      levelId: lv.id,
      num: lv.num,
      title: lv.title,
      stars,
      previousStars: res.previousStars,
      xpGained: res.xpGained,
      seconds,
      spent: Math.max(0, Math.round(this.state.stats.spent)),
      parMaterials: lv.par.materials,
      parSeconds: lv.par.seconds,
      next,
      nextTitle: nextDef ? nextDef.title : '',
      nextTools: nextDef ? nextDef.newTools : [],
      rankUp: rankAfter > rankBefore ? RANK_NAMES[rankAfter - 1] : null,
    };
    this.publishAll();
  }

  // ---------- tools & settings ----------

  setTool(tool: ToolId) {
    if (!isUnlocked(this.state, tool)) return;
    this.tool = tool;
    this.usedTools.add(tool);
    this.preview = null;
    if (tool !== 'inspect') {
      this.selectedId = -1;
      this.selectedCell = -1;
    }
    this.sound.play('click');
    this.refreshPreview();
    this.publish('tools');
    this.publish('inspect');
    this.publish('hint');
  }

  visibleTools(): ToolId[] {
    return TOOL_ORDER.filter((t) => isUnlocked(this.state, t));
  }

  togglePause() {
    this.userPaused = !this.userPaused;
    this.publish('hud');
  }

  setSpeed(speed: 1 | 2 | 4) {
    this.setSetting('speed', speed);
  }

  cycleSpeed() {
    const s = this.profile.settings.speed;
    this.setSpeed(s === 1 ? 2 : s === 2 ? 4 : 1);
  }

  undo() {
    this.dispatch({ type: 'undo' });
  }

  setSetting<K extends keyof ProfileSettings>(key: K, value: ProfileSettings[K]) {
    const prevQuality = this.profile.settings.quality;
    const prevMotion = this.profile.settings.reducedMotion;
    this.profile.settings[key] = value;
    this.persistProfile();
    this.applySettings();
    if (key === 'quality' && value !== prevQuality && this.container) void this.mountRenderer();
    else if (key === 'reducedMotion' && value !== prevMotion && this.container && this.renderer?.kind === 'webgl') void this.mountRenderer();
    this.publishAll();
  }

  private applySettings() {
    const st = this.profile.settings;
    this.sound.setVolume(st.volume);
    this.sound.setEnabled(st.sound && typeof navigator !== 'undefined' && (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive !== false);
  }

  toggleHeights() {
    this.heightsToggle = !this.heightsToggle;
    this.publish('hud');
  }

  // ---------- camera ----------

  zoomBy(factor: number) {
    this.renderer?.camera.zoomAt(factor, this.cssW / 2, this.cssH / 2);
  }

  rotateView(quarterTurns: number) {
    this.renderer?.camera.rotate(quarterTurns);
  }

  resetView() {
    this.renderer?.camera.reset();
  }

  /** "Show me": frame the current objective's highlight. */
  showCoach() {
    const c = this.coach();
    if (!c || !this.renderer) return;
    const pts: { x: number; y: number }[] = [...(c.path ?? []), ...(c.cells ?? [])];
    if (c.zone) pts.push({ x: c.zone.x, y: c.zone.y }, { x: c.zone.x + c.zone.w - 1, y: c.zone.y + c.zone.h - 1 });
    if (c.tool && isUnlocked(this.state, c.tool)) this.setTool(c.tool);
    if (!pts.length) return;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    this.renderer.camera.focus(x0, y0, Math.max(...xs) - x0 + 1, Math.max(...ys) - y0 + 1);
  }

  /** Canvas CSS position above the inspected thing, for anchoring the popover. */
  inspectAnchor(): { x: number; y: number } | null {
    const a = this.store.get('inspect')?.anchor;
    if (!a || !this.renderer) return null;
    return this.renderer.cellToScreen(this.state, a.x + a.w / 2 - 0.5, a.y - 0.5);
  }

  // ---------- inspector ----------

  inspectAction(a: { id: InspectAction; buildingId?: number; cell?: number }) {
    if (a.id === 'harvest' && a.buildingId !== undefined) this.dispatch({ type: 'harvest', buildingId: a.buildingId });
    else if (a.id === 'stock' && a.buildingId !== undefined) this.dispatch({ type: 'stock', buildingId: a.buildingId });
    else if (a.id === 'rotate' && a.buildingId !== undefined) this.dispatch({ type: 'rotate', buildingId: a.buildingId });
    else if (a.id === 'toggleGate' && a.cell !== undefined) this.dispatch({ type: 'toggleGate', cell: a.cell });
    else if (a.id === 'remove' && a.buildingId !== undefined) {
      this.dispatch({ type: 'removeBuilding', buildingId: a.buildingId });
      this.selectedId = -1;
      this.publish('inspect');
    }
  }

  clearSelection() {
    this.selectedId = -1;
    this.selectedCell = -1;
    this.publish('inspect');
  }

  // ---------- saving ----------

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
    if (this.save() && this.persistProfile()) this.toast('info', 'Saved', 'Stored in this browser only');
    else this.toast('error', this.saveError || 'Could not save');
    this.publish('meta');
  }

  private persistProfile(): boolean {
    return this.repo.saveProfile(this.profile);
  }

  /** Wipe every level and the profile, keeping settings. */
  resetProgress() {
    const settings = { ...this.profile.settings };
    this.repo.clear();
    this.profile = { version: 3, currentLevel: LEVEL_ORDER[0], xp: 0, levels: {}, seenToolIntros: [], settings };
    this.persistProfile();
    this.state = createInitialState(undefined, LEVEL_ORDER[0]);
    this.startLevel(LEVEL_ORDER[0], true);
  }

  dismissLoadMessage() {
    this.loadMessage = '';
    this.publish('meta');
  }

  // ---------- keyboard grid mode ----------

  keyboardMove(dx: number, dy: number, dig: boolean) {
    const g = this.state.grid;
    if (this.keyboardCell < 0) this.keyboardCell = idx(g, Math.floor(g.w / 2), Math.floor(g.h / 2));
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
    this.publish('hint');
  }

  keyboardActivate() {
    if (this.keyboardCell < 0) this.keyboardCell = idx(this.state.grid, Math.floor(this.state.grid.w / 2), Math.floor(this.state.grid.h / 2));
    this.strokeId++;
    this.tapCell(this.keyboardCell);
  }

  keyboardEnd() {
    this.strokeId++;
  }

  clearKeyboardCursor() {
    this.keyboardCell = -1;
  }

  // ---------- pointer input ----------

  private bindPointer(canvas: HTMLCanvasElement) {
    const toCanvas = (e: PointerEvent | WheelEvent) => clientToCanvas(e.clientX, e.clientY, canvas.getBoundingClientRect(), this.cssW, this.cssH);
    const toolKind = () => (this.tool === 'canal' || this.tool === 'erase' ? 'stroke' : 'tap') as 'stroke' | 'tap';

    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      this.keyboardCell = -1;
      const p = toCanvas(e);
      this.processGestures(
        this.gestures.pointerDown(
          { id: e.pointerId, x: p.x, y: p.y, t: performance.now(), button: e.button, touch: e.pointerType !== 'mouse' },
          { tool: toolKind(), strokeMode: this.tool === 'erase' ? 'erase' : 'canal' },
        ),
      );
      if (this.gestures.pointerCount >= 2) {
        this.preview = null;
        this.hoverCell = -1;
      }
    };
    const move = (e: PointerEvent) => {
      const p = toCanvas(e);
      this.processGestures(this.gestures.pointerMove({ id: e.pointerId, x: p.x, y: p.y, t: performance.now() }));
    };
    const up = (e: PointerEvent) => {
      const p = toCanvas(e);
      this.processGestures(this.gestures.pointerUp({ id: e.pointerId, x: p.x, y: p.y, t: performance.now() }));
      if (e.pointerType !== 'mouse') {
        this.hoverCell = -1;
        this.preview = null;
        this.publish('hint');
      }
    };
    const cancel = (e: PointerEvent) => this.processGestures(this.gestures.cancel(e.pointerId));
    const leave = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && this.gestures.pointerCount === 0) {
        this.hoverCell = -1;
        this.preview = null;
        this.hint = '';
        this.publish('hint');
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toCanvas(e);
      const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
      this.renderer?.camera.zoomAt(Math.exp(-Math.max(-300, Math.min(300, dy)) * 0.0016), p.x, p.y);
    };
    const ctxMenu = (e: Event) => e.preventDefault();

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', cancel);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('contextmenu', ctxMenu);
    this.canvasCleanup.push(() => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('contextmenu', ctxMenu);
    });
  }

  private processGestures(actions: GestureAction[]) {
    if (!actions.length || !this.renderer) return;
    const r = this.renderer;
    const g = this.state.grid;
    for (const a of actions) {
      switch (a.type) {
        case 'hover': {
          const cell = r.pick(a.x, a.y);
          if (cell !== this.hoverCell) {
            this.hoverCell = cell;
            this.refreshPreview();
            this.publish('hint');
          }
          break;
        }
        case 'strokeStart': {
          this.strokeId++;
          this.strokeMode = a.mode;
          const cell = r.pick(a.x, a.y);
          this.strokeStart = cell;
          this.strokeLast = cell;
          if (cell >= 0) {
            if (a.mode === 'canal') this.dispatch({ type: 'drawCanal', cells: [cell], stroke: this.strokeId });
            else this.dispatch({ type: 'erase', cells: [cell], stroke: this.strokeId });
          }
          this.hoverCell = cell;
          break;
        }
        case 'strokeTo': {
          const cell = r.pick(a.x, a.y);
          if (cell < 0 || cell === this.strokeLast) break;
          let cells: number[];
          if (this.strokeLast < 0) cells = [cell];
          else {
            const pts = lineCells(this.strokeLast % g.w, Math.floor(this.strokeLast / g.w), cell % g.w, Math.floor(cell / g.w)).slice(1);
            cells = pts.filter(([x, y]) => x >= 0 && y >= 0 && x < g.w && y < g.h).map(([x, y]) => idx(g, x, y));
          }
          this.strokeLast = cell;
          this.hoverCell = cell;
          if (cells.length) {
            if (this.strokeMode === 'canal') this.dispatch({ type: 'drawCanal', cells, stroke: this.strokeId });
            else this.dispatch({ type: 'erase', cells, stroke: this.strokeId });
          }
          break;
        }
        case 'strokeEnd':
          if (this.strokeMode === 'erase' && !a.moved && this.strokeStart >= 0) {
            this.dispatch({ type: 'erase', cells: [this.strokeStart], includeBuildings: true, stroke: this.strokeId });
          }
          this.strokeId++;
          this.strokeLast = -1;
          break;
        case 'tap': {
          const cell = r.pick(a.x, a.y);
          if (cell < 0) {
            this.clearSelection();
            break;
          }
          if (a.erase) this.dispatch({ type: 'erase', cells: [cell], includeBuildings: true });
          else this.tapCell(cell);
          break;
        }
        case 'longPress': {
          const cell = r.pick(a.x, a.y);
          if (cell >= 0) this.inspectCell(cell);
          break;
        }
        case 'pan':
          r.camera.panByScreen(a.dx, a.dy);
          break;
        case 'pinch':
          r.camera.zoomAt(a.scale, a.cx, a.cy);
          r.camera.panByScreen(a.dx, a.dy);
          if (Math.abs(a.twist) > 1e-4) r.camera.twist(a.twist);
          break;
      }
    }
  }

  private anchorFor(type: BuildingTypePlaceable, cell: number): [number, number] {
    const g = this.state.grid;
    const [w, h] = CONFIG.footprint[type];
    return [(cell % g.w) - Math.floor((w - 1) / 2), Math.floor(cell / g.w) - Math.floor((h - 1) / 2)];
  }

  private inspectCell(cell: number) {
    const g = this.state.grid;
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
    this.sound.play('click');
    this.publish('inspect');
  }

  /** A tap / Enter on a cell with the current tool. */
  private tapCell(cell: number) {
    const tool = this.tool;
    if (tool === 'inspect') return this.inspectCell(cell);
    if (tool === 'canal') return this.dispatch({ type: 'drawCanal', cells: [cell], stroke: this.strokeId });
    if (tool === 'erase') return this.dispatch({ type: 'erase', cells: [cell], includeBuildings: true });
    if (tool === 'gate') {
      // Tapping an existing gate with the Gate tool opens or closes it.
      if (this.state.grid.gate[cell]) return this.dispatch({ type: 'toggleGate', cell });
      return this.dispatch({ type: 'gate', cell });
    }
    if (tool === 'bridge') return this.dispatch({ type: 'bridge', cell });
    const [x, y] = this.anchorFor(tool, cell);
    const before = this.state.buildings.length;
    this.dispatch({ type: 'place', building: tool, x, y });
    if (this.state.buildings.length > before) {
      const nb = this.state.buildings[this.state.buildings.length - 1];
      // Show what the new building needs, but stay on the tool for quick repeats.
      this.selectedId = nb.id;
      this.publish('inspect');
    }
  }

  private placingType(): BuildingTypePlaceable | null {
    const t = this.tool;
    if (t === 'inspect' || t === 'canal' || t === 'erase' || t === 'gate' || t === 'bridge') return null;
    return t;
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
      const climb = this.canalClimbFlags([cell]);
      const uphill = climb[0];
      this.preview = { cells: [cell], ok: (c.ok || silent) && !uphill, reason: uphill ? "Water can't climb here" : c.reason, climb };
      if (uphill) this.hint = "Uphill from the water: it can't flow here";
      else if (!c.ok && !silent) this.hint = c.reason;
      else if (c.ok) this.hint = this.state.resources.freeCanals > 0 ? `Canal: free (${this.state.resources.freeCanals} left)` : `Canal: ${CONFIG.costs.canal} material`;
      return;
    }
    if (tool === 'erase') {
      this.preview = { cells: [cell], ok: true, reason: '' };
      return;
    }
    if (tool === 'gate' || tool === 'bridge') {
      const ok = g.canal[cell] === 1 && g.structure[cell] < 0;
      this.preview = { cells: [cell], ok, reason: ok ? '' : 'Needs an open canal' };
      this.hint = !ok ? 'Place on a canal tile' : tool === 'gate' && g.gate[cell] ? 'Tap to open or close this gate' : `${TOOL_INFO[tool].name}: ${CONFIG.costs[tool]} materials`;
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

  private canalClimbFlags(cells: number[]): boolean[] {
    const g = this.state.grid;
    const isWater = (i: number) => g.canal[i] === 1 || g.terrain[i] === 'source' || g.terrain[i] === 'river' || g.terrain[i] === 'outlet';
    return cells.map((cell) => {
      const e = g.elevation[cell];
      const x = cell % g.w;
      const y = Math.floor(cell / g.w);
      let higherThanWet = false;
      let sawWet = false;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
        const n = idx(g, nx, ny);
        if (isWater(n) && g.water[n] > 0.08) {
          sawWet = true;
          if (e > g.elevation[n]) higherThanWet = true;
          else return false;
        }
      }
      return sawWet && higherThanWet;
    });
  }

  // ---------- derived slices ----------

  private coach(): Coach | undefined {
    if (this.state.objectives.completedTick !== null) return undefined;
    const active = activeObjectives(this.state, this.level);
    const withCoach = active.find((o) => o.coach) ?? openObjectives(this.state, this.level).find((o) => o.coach);
    return withCoach?.coach;
  }

  private publish(name: SliceName) {
    switch (name) {
      case 'hud':
        return this.store.set('hud', this.buildHud());
      case 'objectives':
        return this.store.set('objectives', this.buildObjectives());
      case 'tools':
        return this.store.set('tools', this.buildTools());
      case 'inspect':
        return this.store.set('inspect', this.buildInspect());
      case 'toasts':
        return this.store.set('toasts', [...this.toasts]);
      case 'overlay':
        return this.store.set('overlay', this.overlay);
      case 'hint':
        return this.store.set('hint', this.hint);
      case 'meta':
        return this.store.set('meta', this.buildMeta());
    }
  }

  private publishAll() {
    for (const n of ['hud', 'objectives', 'tools', 'inspect', 'toasts', 'overlay', 'hint', 'meta'] as SliceName[]) this.publish(n);
  }

  private buildHud(): HudSlice {
    const s = this.state;
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
    const eco = ecosystemScore(s);
    const rank = rankForXp(this.profile.xp);
    return {
      levelId: s.levelId,
      levelNum: this.level.num,
      levelTitle: this.level.title,
      levelBn: this.level.bn,
      hud: this.level.hud,
      materials: Math.floor(s.resources.materials),
      freeCanals: s.resources.freeCanals,
      weather: s.weather.mode,
      stored: Math.floor(stored),
      storageCap,
      energy: Math.floor(s.resources.energy),
      energyCap: energyCapacity(s),
      generation: Math.round(s.ledger.energyGenerated * CONFIG.ticksPerSecond * 10) / 10,
      clean: Math.round(clean * 10) / 10,
      ecosystem: eco.score,
      living: eco.living,
      paused: this.userPaused,
      speed: this.profile.settings.speed,
      night: isNight(statePhase(s)),
      showHeights: this.heightsToggle,
      sound: this.profile.settings.sound,
      rank,
      rankName: RANK_NAMES[rank - 1] ?? '',
      xp: this.profile.xp,
      xpFloor: CONFIG.progression.ranks[rank - 1] ?? 0,
      xpNext: nextRankXp(this.profile.xp),
      totalStars: totalStars(this.profile),
    };
  }

  private buildObjectives(): ObjectivesSlice {
    const s = this.state;
    const lv = this.level;
    const active = new Set(activeObjectives(s, lv).map((o) => o.id));
    const items: ObjectiveItem[] = lv.objectives.map((o) => {
      const done = s.objectives.done.includes(o.id);
      const current = !done && active.has(o.id);
      let progress: number | null = null;
      if (current && o.progress) {
        const p = o.progress(s);
        progress = p.goal > 0 ? Math.max(0, Math.min(1, p.value / p.goal)) : null;
        if (progress !== null) progress = Math.round(progress * 100) / 100;
      }
      return { id: o.id, icon: o.icon, text: o.text, hint: current ? o.hint : undefined, done, current, progress };
    });
    const cur = lv.objectives.find((o) => active.has(o.id));
    const waiting = !!cur && (!!cur.sustainTicks || (!!cur.progress && (items.find((i) => i.id === cur.id)?.progress ?? 0) > 0));
    const complete = s.objectives.completedTick !== null;
    return {
      levelId: lv.id,
      num: lv.num,
      title: lv.title,
      bn: lv.bn,
      ordered: lv.ordered,
      items,
      complete,
      stars: s.objectives.stars,
      spent: Math.max(0, Math.round(s.stats.spent)),
      parMaterials: lv.par.materials,
      parSeconds: lv.par.seconds,
      elapsed: Math.floor((complete ? (s.objectives.completedTick ?? s.tick) : s.tick) / CONFIG.ticksPerSecond),
      canSkip: !complete && lv.id !== 'sandbox' && s.tick >= SKIP_AFTER_TICKS && !this.profile.levels[lv.id]?.completed,
      waiting: waiting && lv.hud.includes('speed'),
      hasCoach: !!this.coach(),
      sandbox: lv.id === 'sandbox',
    };
  }

  private buildTools(): ToolsSlice {
    const coachTool = this.coach()?.tool;
    const tools = this.visibleTools();
    const keyed: ToolId[] = tools.filter((t) => t !== 'erase');
    const buttons: ToolButton[] = tools.map((id) => {
      const info = TOOL_INFO[id];
      const k = keyed.indexOf(id);
      return {
        id,
        name: info.name,
        short: info.short,
        icon: info.icon,
        cost: id in CONFIG.costs ? CONFIG.costs[id as keyof typeof CONFIG.costs] : 0,
        isNew: this.level.newTools.includes(id) && !this.usedTools.has(id),
        pulse: coachTool === id && this.tool !== id,
        key: id === 'erase' ? 'X' : k >= 0 && k < 10 ? String((k + 1) % 10) : '',
      };
    });
    const info = TOOL_INFO[this.tool];
    return {
      tool: this.tool,
      tools: buttons,
      canUndo: this.state.history.length > 0,
      description: info.description,
      cost: this.tool in CONFIG.costs ? CONFIG.costs[this.tool as keyof typeof CONFIG.costs] : 0,
    };
  }

  private buildInspect(): InspectSlice {
    const s = this.state;
    if (this.selectedId >= 0) {
      const b = getBuilding(s, this.selectedId);
      if (b) return { info: inspectBuilding(s, b), anchor: { x: b.x, y: b.y, w: b.w, h: b.h } };
      this.selectedId = -1;
    } else if (this.selectedCell >= 0) {
      const g = s.grid;
      return { info: inspectTile(s, this.selectedCell), anchor: { x: this.selectedCell % g.w, y: Math.floor(this.selectedCell / g.w), w: 1, h: 1 } };
    }
    return { info: null, anchor: null };
  }

  private buildMeta(): MetaSlice {
    const p = this.profile;
    const entry = (lv: LevelDef): LevelEntry => {
      const rec = p.levels[lv.id];
      return {
        id: lv.id,
        num: lv.num,
        title: lv.title,
        bn: lv.bn,
        unlocked: isLevelUnlocked(p, lv.id),
        completed: !!rec?.completed,
        skipped: !!rec?.skipped,
        stars: rec?.completed ? rec.stars : 0,
        current: this.state.levelId === lv.id,
        tools: lv.newTools,
      };
    };
    const levels = LEVELS.map(entry);
    return {
      levels,
      sandbox: entry(SANDBOX),
      journal: [...LEVELS, SANDBOX].map((lv) => ({
        id: lv.id,
        num: lv.num,
        title: lv.title,
        bn: lv.bn,
        locked: !(p.levels[lv.id]?.completed || p.levels[lv.id]?.skipped || this.state.levelId === lv.id),
        pages: lv.journal,
      })),
      settings: { ...p.settings },
      loadMessage: this.loadMessage,
      rendererKind: this.renderer ? this.renderer.kind : 'none',
      savedAt: this.savedAt,
      saveError: this.saveError,
    };
  }

  /** For tests and the level map. */
  levelUnlocked(id: LevelId): boolean {
    return isLevelId(id) && isLevelUnlocked(this.profile, id);
  }
}
