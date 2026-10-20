import { Color, ConeGeometry, Group, InstancedMesh, Matrix4, Mesh, Object3D, Quaternion, SphereGeometry, Vector3, CylinderGeometry, type MeshStandardMaterial } from 'three';
import { CONFIG } from '../model/config';
import { storageCapacity } from '../model/buildings';
import type { Building, GameState } from '../model/types';
import { fieldStage, isRipe } from '../sim/consumers';
import { energyCapacity } from '../sim/power';
import { hash01 } from '../render/palette';
import { ball, box, cone, cyl, glowSprite, mat, ownMat, readyMarker, roof } from './kit';
import { channelDepth, col, isChannel, topY } from './units';
import type { StillWater } from './waterMesh';

export interface UpdateCtx {
  state: GameState;
  dt: number;
  time: number;
  /** 0 with reduced motion, 1 otherwise. */
  motion: number;
  /** 0 by day .. 1 at night. */
  night: number;
  still: StillWater[];
}

interface View {
  group: Group;
  update(b: Building, c: UpdateCtx): void;
  dispose?(): void;
}

const ease = (cur: number, target: number, dt: number, rate = 4) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

/** Ground height under a footprint (the highest tile, so models never sink into terrain). */
export function baseY(state: GameState, b: { x: number; y: number; w: number; h: number }): number {
  const g = state.grid;
  let top = -Infinity;
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) top = Math.max(top, topY(g, y * g.w + x));
  return top;
}

function lowestY(state: GameState, b: { x: number; y: number; w: number; h: number }): number {
  const g = state.grid;
  let low = Infinity;
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) low = Math.min(low, topY(g, y * g.w + x));
  return low;
}

/** Surface height of a storage building's water, shared by the water layer and floating gardens. */
export function storageSurface(state: GameState, b: Building, fill: number): number {
  const base = baseY(state, b);
  const rim = b.type === 'reservoir' ? 0.32 : b.type === 'fishpond' ? 0.18 : 0.1;
  const floor = base - (b.type === 'wetland' ? 0.03 : 0.08);
  return floor + 0.02 + Math.max(0, Math.min(1, fill)) * (rim + base - floor - 0.05);
}

const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _p = new Vector3();
const _c = new Color();
const UP = new Vector3(0, 1, 0);

function plinth(state: GameState, b: Building, g: Group, color: string) {
  const base = baseY(state, b);
  const low = lowestY(state, b);
  if (base - low > 0.01) g.add(box(b.w, base - low + 0.02, b.h, mat(color), b.w / 2, low - base - 0.02, b.h / 2));
}

// ---------- individual models (local space: footprint from (0,0) to (w,h), y = 0 at base) ----------

const TUFT = new ConeGeometry(0.06, 0.36, 5).translate(0, 0.18, 0);
const RICE_GREEN = [col('#7FB65A'), col('#4F9A45'), col('#3F8A3C'), col('#D8B65A')];

function fieldView(state: GameState, b: Building): View {
  const group = new Group();
  plinth(state, b, group, '#8E6E4E');
  const earth = mat('#A47E58');
  const t = 0.1;
  group.add(box(b.w, 0.1, t, earth, b.w / 2, 0, t / 2));
  group.add(box(b.w, 0.1, t, earth, b.w / 2, 0, b.h - t / 2));
  group.add(box(t, 0.1, b.h - 2 * t, earth, t / 2, 0, b.h / 2));
  group.add(box(t, 0.1, b.h - 2 * t, earth, b.w - t / 2, 0, b.h / 2));
  group.add(box(t * 0.8, 0.07, b.h - 2 * t, earth, b.w / 2, 0, b.h / 2));
  const floorMat = ownMat('#6E5A3E');
  const floor = box(b.w - 2 * t, 0.02, b.h - 2 * t, floorMat, b.w / 2, 0, b.h / 2, false);
  group.add(floor);
  const filmMat = ownMat('#6FA9B0', { opacity: 0.0, rough: 0.2 });
  const film = box(b.w - 2 * t, 0.01, b.h - 2 * t, filmMat, b.w / 2, 0.03, b.h / 2, false);
  group.add(film);
  const n = 7;
  const tufts = new InstancedMesh(TUFT, mat('#FFFFFF', { rough: 0.7 }), n * n);
  tufts.castShadow = true;
  tufts.receiveShadow = true;
  const spots: { x: number; z: number; ph: number }[] = [];
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const k = iz * n + ix;
      spots.push({
        x: t + 0.08 + ((ix + 0.5) / n) * (b.w - 2 * t - 0.16) + (hash01(b.id * 97 + k, 1) - 0.5) * 0.06,
        z: t + 0.08 + ((iz + 0.5) / n) * (b.h - 2 * t - 0.16) + (hash01(b.id * 97 + k, 2) - 0.5) * 0.06,
        ph: hash01(b.id * 97 + k, 3) * 6.28,
      });
    }
  }
  group.add(tufts);
  const marker = readyMarker();
  marker.position.set(b.w / 2, 0.9, b.h / 2);
  group.add(marker);
  let growth = b.progress;
  let wet = 0;
  return {
    group,
    update(bb, c) {
      growth = ease(growth, bb.progress, c.dt, 3);
      wet = ease(wet, Math.min(1, bb.water / CONFIG.field.wetMoisture), c.dt, 2);
      const frac = Math.min(1, growth / (3 * CONFIG.field.ticksPerStage));
      const stage = fieldStage(bb);
      filmMat.opacity = 0.45 * wet;
      floorMat.color.copy(col('#6E5A3E')).lerp(col('#4E5A3C'), wet);
      const target = RICE_GREEN[stage];
      const prev = RICE_GREEN[Math.max(0, stage - 1)];
      const within = (growth % CONFIG.field.ticksPerStage) / CONFIG.field.ticksPerStage;
      _c.copy(prev).lerp(target, stage === 3 ? 1 : Math.min(1, within * 1.5));
      const scaleY = frac < 0.02 ? 0.001 : 0.18 + frac * 0.82;
      for (let k = 0; k < spots.length; k++) {
        const s = spots[k];
        const sway = Math.sin(c.time * 1.6 + s.ph) * 0.09 * c.motion * frac;
        _q.setFromAxisAngle(_p.set(1, 0, 0.4).normalize(), sway);
        _s.set(0.7 + frac * 0.5, scaleY, 0.7 + frac * 0.5);
        _m.compose(_p.set(s.x, 0.02, s.z), _q, _s);
        tufts.setMatrixAt(k, _m);
        tufts.setColorAt(k, _c);
      }
      tufts.instanceMatrix.needsUpdate = true;
      if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;
      const ripe = isRipe(bb);
      marker.visible = ripe;
      if (ripe) {
        marker.position.y = 0.85 + Math.sin(c.time * 2.4) * 0.07 * c.motion;
        marker.rotation.y += c.dt * 1.5 * c.motion;
      }
    },
  };
}

function storageView(state: GameState, b: Building): View {
  const group = new Group();
  const base = baseY(state, b);
  const isRes = b.type === 'reservoir';
  const isPond = b.type === 'fishpond';
  const rimH = isRes ? 0.32 : isPond ? 0.18 : 0.06;
  const rimT = isRes ? 0.16 : 0.14;
  const rimMat = mat(isRes ? '#B9B1A2' : isPond ? '#8A7550' : '#6E6A44');
  const capMat = mat(isRes ? '#D8D2C4' : isPond ? '#6F9550' : '#5E7E44');
  plinth(state, b, group, '#7E6448');
  const floorY = isRes || isPond ? -0.08 : -0.03;
  group.add(box(b.w - 0.04, 0.04, b.h - 0.04, mat(isRes ? '#7C766B' : '#5A5038'), b.w / 2, floorY - 0.04, b.h / 2, false));
  if (b.type !== 'wetland') {
    const rim = (w: number, d: number, x: number, z: number) => {
      group.add(box(w, rimH, d, rimMat, x, floorY, z));
      group.add(box(w, 0.03, d, capMat, x, floorY + rimH, z, false));
    };
    rim(b.w, rimT, b.w / 2, rimT / 2);
    rim(b.w, rimT, b.w / 2, b.h - rimT / 2);
    rim(rimT, b.h - 2 * rimT, rimT / 2, b.h / 2);
    rim(rimT, b.h - 2 * rimT, b.w - rimT / 2, b.h / 2);
  }
  if (isRes) {
    // A little sluice on the south rim.
    group.add(box(0.36, 0.36, 0.08, mat('#7B5A3A'), b.w / 2, floorY + rimH - 0.05, b.h - 0.02));
  }
  // Fish (pond) and reeds / lilies (wetland).
  const fishN = 6;
  const fish = isPond ? new InstancedMesh(new SphereGeometry(0.1, 6, 4).scale(1, 0.4, 0.42), mat('#E89A4E', { rough: 0.5 }), fishN) : null;
  if (fish) {
    fish.castShadow = false;
    group.add(fish);
  }
  const reedsN = b.type === 'wetland' ? 22 : isPond ? 6 : 0;
  const reeds = reedsN ? new InstancedMesh(new CylinderGeometry(0.012, 0.018, 0.42, 3).translate(0, 0.21, 0), mat('#6E8F3A'), reedsN) : null;
  const reedSpots: { x: number; z: number; ph: number; t: number }[] = [];
  if (reeds) {
    reeds.castShadow = true;
    for (let k = 0; k < reedsN; k++) {
      const edge = isPond;
      const a = hash01(b.id * 31 + k, 5);
      const r = hash01(b.id * 31 + k, 6);
      reedSpots.push({
        x: edge ? (k % 2 ? 0.2 : b.w - 0.2) + (a - 0.5) * 0.15 : 0.15 + a * (b.w - 0.3),
        z: edge ? (k < 3 ? 0.22 : b.h - 0.22) + (r - 0.5) * 0.15 : 0.15 + r * (b.h - 0.3),
        ph: hash01(b.id * 31 + k, 7) * 6.28,
        t: hash01(b.id * 31 + k, 8),
      });
    }
    group.add(reeds);
  }
  const lilies: Mesh[] = [];
  if (b.type === 'wetland') {
    for (let k = 0; k < 6; k++) {
      const pad = cyl(0.11, 0.11, 0.012, 7, mat('#4F8F45'), 0.3 + hash01(b.id + k, 9) * (b.w - 0.6), 0, 0.3 + hash01(b.id + k, 10) * (b.h - 0.6), false);
      if (k % 2 === 0) pad.add(ball(0.045, mat('#F2A6C2', { emissive: '#F2A6C2', emissiveIntensity: 0.15 }), 0, 0.04, 0));
      lilies.push(pad);
      group.add(pad);
    }
  }
  const marker = readyMarker();
  marker.position.set(b.w / 2, 0.95, b.h / 2);
  group.add(marker);
  let fill = b.water / storageCapacity(b.type);
  let grow = b.progress;
  return {
    group,
    update(bb, c) {
      fill = ease(fill, bb.water / storageCapacity(bb.type), c.dt, 2.5);
      grow = ease(grow, bb.progress, c.dt, 2);
      const surfaceWorld = storageSurface(c.state, bb, fill);
      const local = surfaceWorld - base;
      if (fill > 0.01) {
        const inset = b.type === 'wetland' ? 0.04 : rimT;
        c.still.push({
          x0: bb.x + inset,
          z0: bb.y + inset,
          x1: bb.x + bb.w - inset,
          z1: bb.y + bb.h - inset,
          y: surfaceWorld,
          depth: b.type === 'wetland' ? 0.2 + fill * 0.2 : 0.35 + fill * 0.6,
        });
      }
      if (fish) {
        const shown = bb.stocked ? fishN : 0;
        for (let k = 0; k < fishN; k++) {
          const a = c.time * (0.35 + k * 0.05) * (c.motion || 0.2) + k * 1.05;
          const r = 0.45 + (k % 3) * 0.22;
          const sc = k < shown ? 0.6 + grow * 0.7 : 0.0001;
          _p.set(b.w / 2 + Math.cos(a) * r, local - 0.05 - (k % 2) * 0.04, b.h / 2 + Math.sin(a) * r);
          _q.setFromAxisAngle(UP, -a);
          _s.set(sc, sc, sc);
          _m.compose(_p, _q, _s);
          fish.setMatrixAt(k, _m);
          fish.setColorAt(k, _c.copy(col(k % 2 ? '#E89A4E' : '#C9D3D8')));
        }
        fish.instanceMatrix.needsUpdate = true;
        if (fish.instanceColor) fish.instanceColor.needsUpdate = true;
      }
      if (reeds) {
        const eco = b.type === 'wetland' ? grow : 1;
        for (let k = 0; k < reedSpots.length; k++) {
          const s = reedSpots[k];
          const visible = b.type === 'wetland' ? s.t < eco * 1.1 : true;
          const sway = Math.sin(c.time * 1.3 + s.ph) * 0.12 * c.motion;
          _q.setFromAxisAngle(_p.set(1, 0, 0.5).normalize(), sway);
          const sc = visible ? 0.6 + s.t * 0.6 : 0.0001;
          _s.set(1, sc, 1);
          _m.compose(_p.set(s.x, floorY, s.z), _q, _s);
          reeds.setMatrixAt(k, _m);
        }
        reeds.instanceMatrix.needsUpdate = true;
      }
      lilies.forEach((l, k) => {
        l.visible = grow > 0.2 + k * 0.08 && fill > 0.05;
        l.position.y = local + 0.005 + Math.sin(c.time + k) * 0.006 * c.motion;
      });
      const ripe = isRipe(bb);
      marker.visible = ripe;
      if (ripe) marker.position.y = 0.95 + Math.sin(c.time * 2.4) * 0.07 * c.motion;
    },
  };
}

function floatingView(_state: GameState, b: Building): View {
  const group = new Group();
  const raft = new Group();
  const bamboo = mat('#C9A86A');
  for (let k = 0; k < 5; k++) raft.add(box(0.12, 0.05, 0.78, bamboo, 0.22 + k * 0.14, 0, 0.5));
  raft.add(box(0.74, 0.03, 0.66, mat('#5F4A32'), 0.5, 0.05, 0.5, false));
  const veg: Mesh[] = [];
  for (let k = 0; k < 5; k++) {
    const m = ball(0.09, mat(k % 2 ? '#6FB05A' : '#4F9A45'), 0.25 + (k % 3) * 0.25, 0.12, 0.3 + Math.floor(k / 3) * 0.38);
    veg.push(m);
    raft.add(m);
  }
  group.add(raft);
  const marker = readyMarker();
  marker.position.set(0.5, 0.75, 0.5);
  group.add(marker);
  let grow = b.progress;
  return {
    group,
    update(bb, c) {
      grow = ease(grow, bb.progress, c.dt, 2);
      const host = c.state.buildings.find((h) => h.id === bb.hostId);
      const fill = host ? host.water / storageCapacity(host.type) : 0;
      const y = host ? storageSurface(c.state, host, fill) - baseY(c.state, bb) : 0;
      raft.position.y = y + Math.sin(c.time * 1.2 + bb.id) * 0.012 * c.motion;
      veg.forEach((m) => m.scale.setScalar(0.4 + grow * 0.9));
      marker.visible = isRipe(bb);
      marker.position.y = y + 0.6 + Math.sin(c.time * 2.4) * 0.06 * c.motion;
    },
  };
}

function turbineView(state: GameState, b: Building): View {
  const group = new Group();
  const g = state.grid;
  const i = b.y * g.w + b.x;
  const sink = -channelDepth(g, i);
  const alongX = (b.x > 0 && isChannel(state, i - 1)) || (b.x + 1 < g.w && isChannel(state, i + 1));
  const wheel = new Group();
  const wood = mat('#8A5A34');
  const dark = mat('#5E3E26');
  const rim = new Mesh(new CylinderGeometry(0.34, 0.34, 0.2, 12, 1, true), wood);
  rim.rotation.x = Math.PI / 2;
  rim.castShadow = true;
  wheel.add(rim);
  for (let k = 0; k < 8; k++) {
    const p = box(0.06, 0.2, 0.22, dark, 0, -0.1, 0);
    const a = (k / 8) * Math.PI * 2;
    const holder = new Object3D();
    holder.rotation.z = a;
    p.position.set(0.31, 0, 0);
    p.rotation.z = 0;
    holder.add(p);
    wheel.add(holder);
  }
  const hub = new Mesh(new CylinderGeometry(0.06, 0.06, 0.32, 8), dark);
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);
  const axle = new Group();
  axle.add(wheel);
  axle.position.set(0.5, sink + 0.34, 0.5);
  if (!alongX) axle.rotation.y = Math.PI / 2;
  group.add(axle);
  const post = (dz: number) => {
    const m = box(0.08, 0.5 - sink, 0.08, wood, 0, sink, dz);
    const holder = new Group();
    holder.add(m);
    holder.position.set(0.5, 0, 0.5);
    if (!alongX) holder.rotation.y = Math.PI / 2;
    group.add(holder);
  };
  post(-0.42);
  post(0.42);
  // Tiny generator hut on the bank.
  const hut = box(0.26, 0.2, 0.22, mat('#C9B38E'), alongX ? 0.5 : 0.16, 0.02, alongX ? 0.14 : 0.5);
  group.add(hut);
  let speed = 0;
  return {
    group,
    update(bb, c) {
      speed = ease(speed, Math.min(7, bb.rate * 2.4), c.dt, 2);
      wheel.rotation.z -= speed * c.dt * (c.motion ? 1 : 0.35);
    },
  };
}

function batteryView(_state: GameState, b: Building): View {
  const group = new Group();
  group.add(box(0.7, 0.06, 0.7, mat('#8C8577'), 0.5, 0, 0.5));
  group.add(box(0.56, 0.46, 0.5, mat('#3F6F6B', { rough: 0.6 }), 0.5, 0.06, 0.5));
  group.add(box(0.62, 0.05, 0.56, mat('#2E504D'), 0.5, 0.52, 0.5));
  group.add(box(0.14, 0.38, 0.03, mat('#1E2A2A'), 0.5, 0.1, 0.76));
  const barMat = ownMat('#7CE38B', { emissive: '#56D26A', emissiveIntensity: 1.1 });
  const bar = box(0.1, 0.34, 0.02, barMat, 0.5, 0.12, 0.775, false);
  group.add(bar);
  let charge = 0;
  void b;
  return {
    group,
    update(_bb, c) {
      const cap = energyCapacity(c.state);
      charge = ease(charge, cap > 0 ? c.state.resources.energy / cap : 0, c.dt, 3);
      bar.scale.y = Math.max(0.001, 0.34 * charge);
      barMat.emissiveIntensity = 0.4 + charge * 1.0;
    },
  };
}

function treatmentView(state: GameState, b: Building): View {
  const group = new Group();
  plinth(state, b, group, '#8E7A62');
  group.add(box(b.w - 0.1, 0.06, b.h - 0.1, mat('#A9A496'), b.w / 2, 0, b.h / 2));
  group.add(cyl(0.3, 0.32, 0.5, 10, mat('#8D7A5A'), 0.5, 0.06, 0.55));
  group.add(cyl(0.33, 0.33, 0.04, 10, mat('#6E5E44'), 0.5, 0.56, 0.55));
  const cleanTank = cyl(0.33, 0.35, 0.62, 10, mat('#E9EEF0', { rough: 0.5 }), 1.45, 0.06, 0.55);
  group.add(cleanTank);
  const capMat = ownMat('#BFE9F5', { emissive: '#7FD3EC', emissiveIntensity: 0.0 });
  group.add(cyl(0.34, 0.34, 0.04, 10, capMat, 1.45, 0.68, 0.55));
  group.add(box(0.8, 0.42, 0.55, mat('#E7DCC7'), 1.0, 0.06, 1.42));
  group.add(roof(0.8, 0.55, 0.22, mat('#3E7F8F', { metal: 0.2, rough: 0.6 }), 1.0, 0.48, 1.42));
  group.add(box(0.5, 0.06, 0.06, mat('#9AA4A8', { metal: 0.4 }), 1.0, 0.36, 0.55));
  const lampMat = ownMat('#8C8C8C', { emissive: '#5BE36E', emissiveIntensity: 0 });
  group.add(ball(0.05, lampMat, 1.42, 0.62, 1.7));
  let clean = 0;
  return {
    group,
    update(bb, c) {
      clean = ease(clean, bb.clean / CONFIG.treatment.cleanCap, c.dt, 3);
      capMat.emissiveIntensity = 0.15 + clean * 0.8;
      const blink = bb.active ? (c.motion ? 0.6 + 0.4 * Math.sin(c.time * 5) : 1) : 0;
      lampMat.emissiveIntensity = blink * 1.6;
      lampMat.emissive.copy(col(bb.active ? '#5BE36E' : '#E3A35B'));
      if (!bb.active) lampMat.emissiveIntensity = 0.5;
    },
  };
}

function connectorView(state: GameState, b: Building): View {
  const group = new Group();
  group.add(box(0.3, 0.04, 0.3, mat('#A9A496'), 0.5, 0, 0.5));
  group.add(box(0.07, 0.38, 0.07, mat('#8FA2AA', { metal: 0.5, rough: 0.4 }), 0.5, 0.04, 0.5));
  group.add(box(0.18, 0.05, 0.05, mat('#8FA2AA', { metal: 0.5, rough: 0.4 }), 0.58, 0.36, 0.5));
  group.add(cyl(0.08, 0.06, 0.12, 8, mat('#B5643C'), 0.66, 0.04, 0.5));
  const pipeMat = ownMat('#BFE9F5', { emissive: '#7FD3EC', emissiveIntensity: 0 });
  const pipe = new Group();
  group.add(pipe);
  let pipeFor = -2;
  let flowing = 0;
  const buildPipe = (hostId: number) => {
    pipe.clear();
    pipeFor = hostId;
    const host = state.buildings.find((h) => h.id === hostId);
    if (!host) return;
    const hx = host.x + host.w / 2 - b.x;
    const hz = host.y + host.h / 2 - b.y;
    const y = 0.05 - (baseY(state, b) - Math.min(baseY(state, b), baseY(state, host)));
    const seg = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.01) return;
      const m = box(Math.abs(x1 - x0) + 0.07, 0.06, Math.abs(z1 - z0) + 0.07, pipeMat, (x0 + x1) / 2, y, (z0 + z1) / 2, false);
      pipe.add(m);
    };
    seg(0.5, 0.5, 0.5, hz);
    seg(0.5, hz, hx, hz);
  };
  return {
    group,
    update(bb, c) {
      if (bb.hostId !== pipeFor) buildPipe(bb.hostId);
      flowing = ease(flowing, bb.active ? 1 : 0, c.dt, 3);
      pipeMat.emissiveIntensity = 0.1 + flowing * (0.5 + (c.motion ? 0.3 * Math.sin(c.time * 4) : 0));
    },
  };
}

function houseView(state: GameState, b: Building): View {
  const group = new Group();
  const v = hash01(b.id, 21);
  const wall = mat(v < 0.5 ? '#D6A57C' : '#CFAE86');
  group.add(box(0.86, 0.06, 0.78, mat('#A88B6A'), 0.5, 0, 0.5));
  group.add(box(0.7, 0.4, 0.56, wall, 0.5, 0.06, 0.48));
  const tin = v < 0.66;
  group.add(roof(0.7, 0.56, 0.3, mat(tin ? '#9DAFB7' : '#C8A55A', { metal: tin ? 0.45 : 0, rough: tin ? 0.45 : 0.9 }), 0.5, 0.46, 0.48));
  group.add(box(0.16, 0.26, 0.02, mat('#5B3B28'), 0.5, 0.06, 0.77));
  const winMat = ownMat('#3A3A3A', { emissive: '#FFC56E', emissiveIntensity: 0 });
  group.add(box(0.12, 0.1, 0.02, winMat, 0.27, 0.22, 0.77, false));
  group.add(box(0.12, 0.1, 0.02, winMat, 0.73, 0.22, 0.77, false));
  // Water pot (kolshi) by the door.
  const pot = ball(0.07, mat('#B5643C'), 0.85, 0.12, 0.84);
  group.add(pot);
  const glow = glowSprite(1.3);
  glow.position.set(0.5, 0.35, 0.85);
  group.add(glow);
  let light = 0;
  void state;
  return {
    group,
    update(bb, c) {
      light = ease(light, bb.lit ? 1 : 0, c.dt, 3);
      const on = light * (0.25 + 0.75 * c.night);
      winMat.emissiveIntensity = on * 2.2;
      winMat.color.copy(col('#3A3A3A')).lerp(col('#FFE2A8'), on * 0.6);
      (glow.material as { opacity: number }).opacity = on * c.night * 0.85;
      pot.scale.setScalar(bb.supplied ? 1.1 : 0.9);
    },
  };
}

function pumpView(_state: GameState, b: Building): View {
  const group = new Group();
  group.add(box(0.7, 0.05, 0.7, mat('#8C8577'), 0.5, 0, 0.5));
  group.add(box(0.46, 0.3, 0.46, mat('#5E7C88', { metal: 0.3, rough: 0.5 }), 0.5, 0.05, 0.5));
  const fly = new Mesh(new CylinderGeometry(0.15, 0.15, 0.05, 10), mat('#34474E', { metal: 0.4 }));
  fly.rotation.z = Math.PI / 2;
  fly.position.set(0.25, 0.28, 0.5);
  group.add(fly);
  const arrowHolder = new Group();
  arrowHolder.position.set(0.5, 0.42, 0.5);
  const arrow = new Mesh(new ConeGeometry(0.1, 0.24, 6), mat('#F2C14E', { emissive: '#F2A900', emissiveIntensity: 0.3 }));
  arrow.rotation.x = Math.PI / 2;
  arrow.position.z = 0.16;
  arrowHolder.add(arrow);
  group.add(arrowHolder);
  const spout = box(0.1, 0.1, 0.3, mat('#8FA2AA', { metal: 0.5 }), 0, -0.05, 0.3);
  arrowHolder.add(spout);
  let spin = 0;
  void b;
  return {
    group,
    update(bb, c) {
      // dir 0=N(-z) 1=E(+x) 2=S(+z) 3=W(-x); arrow points along +z at rotation 0.
      const target = [Math.PI, Math.PI / 2, 0, -Math.PI / 2][bb.dir % 4];
      let d = target - arrowHolder.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      arrowHolder.rotation.y += d * (1 - Math.exp(-10 * c.dt));
      spin = ease(spin, bb.active ? 8 : 0, c.dt, 2);
      fly.rotation.x += spin * c.dt * (c.motion ? 1 : 0.3);
    },
  };
}

function fountainView(_state: GameState, b: Building): View {
  const group = new Group();
  group.add(cyl(0.4, 0.42, 0.14, 12, mat('#C9C2B4'), 0.5, 0, 0.5));
  group.add(cyl(0.32, 0.32, 0.02, 12, mat('#6FB8CC', { rough: 0.2 }), 0.5, 0.12, 0.5, false));
  group.add(cyl(0.05, 0.07, 0.25, 8, mat('#B7AFA0'), 0.5, 0.12, 0.5));
  const jetMat = ownMat('#DDF3FA', { emissive: '#BFE9F5', emissiveIntensity: 0.4, opacity: 0.75 });
  const jet = cone(0.08, 0.5, 8, jetMat, 0.5, 0.36, 0.5);
  jet.castShadow = false;
  group.add(jet);
  let on = 0;
  void b;
  return {
    group,
    update(bb, c) {
      on = ease(on, bb.active ? 1 : 0, c.dt, 3);
      jet.visible = on > 0.03;
      jet.scale.set(1, Math.max(0.01, on * (0.85 + (c.motion ? 0.15 * Math.sin(c.time * 7) : 0))), 1);
    },
  };
}

const FACTORY: Record<string, (s: GameState, b: Building) => View> = {
  field: fieldView,
  reservoir: storageView,
  fishpond: storageView,
  wetland: storageView,
  floating: floatingView,
  turbine: turbineView,
  battery: batteryView,
  treatment: treatmentView,
  connector: connectorView,
  house: houseView,
  pump: pumpView,
  fountain: fountainView,
};

/** Keeps one model per building, in sync with the simulation's building list. */
export class BuildingLayer {
  readonly group = new Group();
  private views = new Map<number, { view: View; sig: string }>();

  /** Rebuild models whose identity or footprint changed. */
  sync(state: GameState) {
    const seen = new Set<number>();
    for (const b of state.buildings) {
      seen.add(b.id);
      const sig = `${b.type}|${b.x}|${b.y}|${state.levelId}`;
      const cur = this.views.get(b.id);
      if (cur && cur.sig === sig) continue;
      if (cur) this.remove(b.id);
      const make = FACTORY[b.type];
      if (!make) continue;
      const view = make(state, b);
      view.group.position.set(b.x, baseY(state, b), b.y);
      view.group.userData.buildingId = b.id;
      this.group.add(view.group);
      this.views.set(b.id, { view, sig });
    }
    for (const id of [...this.views.keys()]) if (!seen.has(id)) this.remove(id);
  }

  private remove(id: number) {
    const v = this.views.get(id);
    if (!v) return;
    this.group.remove(v.view.group);
    v.view.group.traverse((o) => {
      const m = o as Mesh;
      if ((m as InstancedMesh).isInstancedMesh) (m as InstancedMesh).dispose();
      const mm = m.material as MeshStandardMaterial | undefined;
      // Private animated materials are cloned per building; shared ones live in the kit cache.
      if (mm && mm.userData?.own) mm.dispose();
    });
    v.view.dispose?.();
    this.views.delete(id);
  }

  update(c: UpdateCtx) {
    for (const b of c.state.buildings) this.views.get(b.id)?.view.update(b, c);
  }

  clear() {
    for (const id of [...this.views.keys()]) this.remove(id);
  }
}
