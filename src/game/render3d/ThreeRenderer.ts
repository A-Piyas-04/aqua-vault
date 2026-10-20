import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { GameState } from '../model/types';
import { isNight, statePhase } from '../sim/weather';
import { pickHeightfield } from '../input/pick';
import type { Quality } from '../persistence/profile';
import type { CameraControl, FxKind, GameRenderer, RenderFrame } from '../render/types';
import { BuildingLayer, baseY } from './buildings3d';
import { CameraRig } from './cameraRig';
import { EffectsLayer } from './effects';
import { disposeKit } from './kit';
import { FeatureLayer, OverlayLayer } from './overlays';
import { TerrainBuilder } from './terrainMesh';
import { BASE_Y, greenness, H, isChannel, topY, waterSurfaceY } from './units';
import { VegetationLayer } from './vegetation';
import { WaterLayer, type StillWater } from './waterMesh';

export interface ThreeOptions {
  quality: Quality;
  reducedMotion: boolean;
  onContextLost: () => void;
}

type Tier = 'high' | 'medium' | 'low';

const TIERS: Record<Tier, { dpr: number; shadow: number; veg: number; shadowEvery: number }> = {
  high: { dpr: 2, shadow: 2048, veg: 1, shadowEvery: 2 },
  medium: { dpr: 1.5, shadow: 1024, veg: 0.7, shadowEvery: 3 },
  low: { dpr: 1, shadow: 0, veg: 0.4, shadowEvery: 0 },
};

function resolveTier(q: Quality): Tier {
  if (q === 'high' || q === 'medium' || q === 'low') return q;
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 4 : 4;
  return coarse || cores <= 4 ? 'medium' : 'high';
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export class ThreeRenderer implements GameRenderer {
  readonly kind = 'webgl' as const;
  private gl: WebGLRenderer;
  private scene = new Scene();
  private rig = new CameraRig();
  private world = new Group();
  private hemi = new HemisphereLight(0xdfefff, 0x6b5a40, 1.0);
  private sun = new DirectionalLight(0xfff2dc, 2.2);
  private terrainBuilder = new TerrainBuilder();
  private terrain: Mesh;
  private water = new WaterLayer();
  private buildings = new BuildingLayer();
  private vegetation = new VegetationLayer();
  private features = new FeatureLayer();
  private overlays = new OverlayLayer();
  private effects: EffectsLayer;
  private tier: Tier;
  private auto: boolean;
  private reduced: boolean;
  private dirty = true;
  private greenBucket = -1;
  private lastTime = 0;
  private frameNo = 0;
  private slowFrames = 0;
  private cssW = 1;
  private cssH = 1;
  private dpr = 1;
  private skyKey = '';
  private lost = 0;
  private gw = 1;
  private gh = 1;
  private maxTop = 1;
  private canvas: HTMLCanvasElement;
  private onLost: (e: Event) => void;
  private onRestored: () => void;

  constructor(canvas: HTMLCanvasElement, private opts: ThreeOptions) {
    this.canvas = canvas;
    this.tier = resolveTier(opts.quality);
    this.auto = opts.quality === 'auto';
    this.reduced = opts.reducedMotion;
    this.rig.reducedMotion = opts.reducedMotion;
    this.gl = new WebGLRenderer({ canvas, antialias: this.tier !== 'low', alpha: true, powerPreference: 'high-performance' });
    this.gl.outputColorSpace = SRGBColorSpace;
    this.gl.toneMapping = ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.08;
    this.gl.setClearColor(0x000000, 0);
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = PCFShadowMap;
    this.gl.shadowMap.autoUpdate = false;

    this.scene.add(this.world);
    this.scene.add(this.hemi);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.applyTier();

    this.terrain = new Mesh(undefined, new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true }));
    this.terrain.receiveShadow = true;
    this.terrain.castShadow = true;
    this.world.add(this.terrain);
    this.world.add(this.buildings.group, this.vegetation.group, this.features.group, this.water.mesh, this.overlays.group);
    this.effects = new EffectsLayer(this.world);

    this.onLost = (e: Event) => {
      e.preventDefault();
      this.lost++;
      if (this.lost >= 2) this.opts.onContextLost();
    };
    this.onRestored = () => {
      this.dirty = true;
      this.gl.shadowMap.needsUpdate = true;
    };
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
  }

  private applyTier() {
    const t = TIERS[this.tier];
    this.sun.castShadow = t.shadow > 0;
    if (t.shadow > 0) {
      this.sun.shadow.mapSize.set(t.shadow, t.shadow);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.sun.shadow.bias = -0.0008;
      this.sun.shadow.normalBias = 0.03;
    }
    this.gl.setPixelRatio(Math.min(this.dpr, t.dpr));
    this.gl.setSize(this.cssW, this.cssH, false);
    this.gl.shadowMap.needsUpdate = true;
    this.dirty = true;
  }

  readonly camera: CameraControl = {
    panByScreen: (dx, dy) => this.rig.panByScreen(dx, dy),
    zoomAt: (f, x, y) => this.rig.zoomAt(f, x, y),
    rotate: (q) => this.rig.rotate(q),
    twist: (r) => this.rig.twist(r),
    reset: () => this.rig.reset(),
    focus: (x, y, w, h) => this.rig.focus(x, y, w, h),
  };

  resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    this.gl.setPixelRatio(Math.min(dpr, TIERS[this.tier].dpr));
    this.gl.setSize(cssW, cssH, false);
    const wide = cssW >= 900;
    const phone = cssW < 720;
    this.rig.setInsets(wide ? 360 : 0, wide ? 70 : 0, phone ? 200 : 76, phone ? 130 : 136);
    this.rig.resize(cssW, cssH);
  }

  structureChanged(state: GameState, newLevel: boolean): void {
    this.dirty = true;
    if (newLevel) {
      const g = state.grid;
      this.gw = g.w;
      this.gh = g.h;
      let maxE = 0;
      for (let i = 0; i < g.w * g.h; i++) maxE = Math.max(maxE, g.elevation[i]);
      this.maxTop = maxE * H;
      this.rig.setMap(g.w, g.h, this.maxTop);
      this.effects.setMap(g.w, g.h);
      this.buildings.clear();
      this.setupSun(g.w, g.h);
    }
  }

  private setupSun(w: number, h: number) {
    const r = Math.hypot(w, h) / 2 + 2;
    const cam = this.sun.shadow.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 1;
    cam.far = 120;
    cam.updateProjectionMatrix();
    this.sun.target.position.set(w / 2, 0, h / 2);
    this.gl.shadowMap.needsUpdate = true;
  }

  private rebuild(state: GameState, green: number, avoid: Set<number>) {
    const old = this.terrain.geometry;
    this.terrain.geometry = this.terrainBuilder.build(state, green);
    old?.dispose();
    this.buildings.sync(state);
    this.features.sync(state);
    this.vegetation.sync(state, green, TIERS[this.tier].veg, avoid);
    this.gl.shadowMap.needsUpdate = true;
  }

  private lighting(state: GameState) {
    const phase = statePhase(state);
    const b = 0.5 + 0.5 * Math.sin(2 * Math.PI * phase);
    const night = clamp01((0.42 - b) / 0.32);
    const dusk = clamp01(1 - Math.abs(b - 0.42) / 0.22) * (1 - night);
    const mode = state.weather.mode;
    const overcast = mode === 'heavy' ? 0.55 : mode === 'rain' ? 0.38 : mode === 'drizzle' ? 0.2 : 0;

    // Sun swings slightly over the day; light comes from the upper left of the screen.
    const az = -2.2 + (phase - 0.25) * 0.8;
    const el = lerp(0.35, 1.05, clamp01(b));
    const dir = new Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    this.sun.position.set(this.gw / 2, 0, this.gh / 2).addScaledVector(dir, 50);
    const sunCol = new Color(1, 0.95, 0.86).lerp(new Color(1, 0.72, 0.48), dusk).lerp(new Color(0.55, 0.65, 0.95), night);
    this.sun.color.copy(sunCol);
    this.sun.intensity = lerp(2.5, 0.35, night) * (1 - overcast * 0.55);
    this.hemi.color.copy(new Color(0.86, 0.93, 1).lerp(new Color(0.75, 0.78, 0.82), overcast).lerp(new Color(0.3, 0.38, 0.62), night));
    this.hemi.groundColor.copy(new Color(0.45, 0.37, 0.26).lerp(new Color(0.12, 0.12, 0.2), night));
    this.hemi.intensity = lerp(1.15, 0.55, night) * (1 - overcast * 0.15) + overcast * 0.2;
    this.gl.toneMappingExposure = lerp(1.08, 0.9, night);
    const light = new Color(1, 1, 1).lerp(new Color(0.92, 0.95, 1), overcast).lerp(new Color(0.42, 0.5, 0.72), night);
    this.water.material.uniforms.uLight.value.copy(light);

    // Sky gradient behind the diorama (CSS, so it is free to draw).
    const top = new Color('#9fd3e0').lerp(new Color('#7a89b0'), dusk).lerp(new Color('#a9b8bf'), overcast).lerp(new Color('#14203a'), night);
    const bottom = new Color('#f4ecd8').lerp(new Color('#f4b582'), dusk).lerp(new Color('#d9dcd6'), overcast).lerp(new Color('#2c4260'), night);
    this.water.material.uniforms.uSky.value.copy(top).lerp(bottom, 0.5).convertSRGBToLinear();
    const key = `${top.getHexString()}|${bottom.getHexString()}`;
    if (key !== this.skyKey && this.canvas.parentElement) {
      this.skyKey = key;
      this.canvas.parentElement.style.background = `linear-gradient(180deg, #${top.getHexString()} 0%, #${bottom.getHexString()} 100%)`;
    }
    return { night: Math.max(night, isNight(phase) ? 0.6 : 0), shadowsMove: true };
  }

  render(f: RenderFrame): void {
    const { state, ui, time } = f;
    const dt = this.lastTime ? Math.min(0.1, Math.max(0, time - this.lastTime)) : 1 / 60;
    this.lastTime = time;
    this.frameNo++;
    this.pickState = state;
    if (state.grid.w !== this.gw || state.grid.h !== this.gh) this.structureChanged(state, true);

    const green = greenness(state);
    const bucket = Math.round(green * 10);
    if (bucket !== this.greenBucket) {
      this.greenBucket = bucket;
      this.dirty = true;
    }
    const avoid = new Set<number>();
    const g = state.grid;
    if (ui.highlightZone) for (let y = ui.highlightZone.y; y < ui.highlightZone.y + ui.highlightZone.h; y++) for (let x = ui.highlightZone.x; x < ui.highlightZone.x + ui.highlightZone.w; x++) avoid.add(y * g.w + x);
    for (const p of ui.tutorialPath ?? []) avoid.add(p.y * g.w + p.x);
    for (const p of ui.highlightCells ?? []) avoid.add(p.y * g.w + p.x);
    if (this.dirty) {
      this.dirty = false;
      this.rebuild(state, green, avoid);
    } else {
      this.vegetation.sync(state, green, TIERS[this.tier].veg, avoid);
    }

    this.rig.update(dt);
    const { night } = this.lighting(state);
    const motion = this.reduced ? 0 : 1;
    const still: StillWater[] = [];
    this.buildings.update({ state, dt, time, motion, night, still });
    this.water.update(state, f.prevWater, f.alpha, time, still, this.reduced ? 0.12 : 1);
    this.vegetation.setWind(time, motion);
    this.features.update(state, dt);
    this.overlays.update(state, ui, time);
    this.effects.watchWater(state, (i) => waterSurfaceY(g, i, g.water[i], isChannel(state, i)), this.reduced);
    this.effects.update(state, dt, this.reduced, night);

    const every = TIERS[this.tier].shadowEvery;
    if (every && this.frameNo % every === 0) this.gl.shadowMap.needsUpdate = true;
    this.gl.render(this.scene, this.rig.camera);
    this.watchPerformance(dt);
  }

  /** Auto quality: step down when frames stay slow for a few seconds. */
  private watchPerformance(dt: number) {
    if (!this.auto || this.tier === 'low' || (typeof document !== 'undefined' && document.hidden)) return;
    if (dt > 0.03) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 2);
    if (this.slowFrames > 150) {
      this.slowFrames = 0;
      this.tier = this.tier === 'high' ? 'medium' : 'low';
      this.applyTier();
    }
  }

  pick(cssX: number, cssY: number): number {
    const { origin, dir } = this.rig.ray01(cssX, cssY);
    return pickHeightfield(origin, dir, this.gw, this.gh, (i) => this.topForPick(i), BASE_Y, this.maxTop + 0.3);
  }

  /** Picking uses the state that was last rendered, so hits match what the player sees. */
  private pickState: GameState | null = null;
  private topForPick(i: number): number {
    const s = this.pickState;
    return s ? topY(s.grid, i) : 0;
  }

  cellToScreen(state: GameState, x: number, y: number): { x: number; y: number } | null {
    const g = state.grid;
    const cx = Math.max(0, Math.min(g.w - 1, Math.round(x)));
    const cy = Math.max(0, Math.min(g.h - 1, Math.round(y)));
    const v = new Vector3(x + 0.5, topY(g, cy * g.w + cx) + 0.5, y + 0.5).project(this.rig.camera);
    if (v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) return null;
    return { x: ((v.x + 1) / 2) * this.cssW, y: ((1 - v.y) / 2) * this.cssH };
  }

  fx(state: GameState, kind: FxKind, cell: number): void {
    const g = state.grid;
    if (cell < 0 || cell >= g.w * g.h) return;
    const x = (cell % g.w) + 0.5;
    const z = Math.floor(cell / g.w) + 0.5;
    const b = state.buildings.find((q) => q.id === g.structure[cell]);
    const y = b ? baseY(state, b) + 0.4 : topY(g, cell) + 0.1;
    if (kind === 'celebrate') this.effects.celebrate(x, y, z, this.reduced);
    else if (kind === 'dust') this.effects.dust(x, topY(g, cell), z);
    else this.effects.splash(x, topY(g, cell), z);
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    this.terrain.geometry?.dispose();
    (this.terrain.material as MeshStandardMaterial).dispose();
    this.water.dispose();
    this.buildings.clear();
    this.vegetation.dispose();
    this.overlays.dispose();
    this.effects.dispose();
    disposeKit();
    this.sun.shadow.map?.dispose();
    this.gl.dispose();
    if (this.canvas.parentElement) this.canvas.parentElement.style.background = '';
  }
}
