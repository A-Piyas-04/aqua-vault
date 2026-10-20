import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { isChannelTerrain } from '../model/buildings';
import type { GameState } from '../model/types';
import { hash01 } from '../render/palette';
import { col, topY } from './units';

/**
 * Deterministic decoration (trees, bamboo, grass, reeds, flowers, boulders) as a handful
 * of instanced meshes. Wind sway runs in the vertex shader.
 */

interface Placed {
  x: number;
  y: number;
  z: number;
  s: number;
  rot: number;
  color: Color;
}

const wind = { value: 0 };
const windAmt = { value: 1 };

function swayMaterial(color: string, rough = 0.85, strength = 1): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: col(color), roughness: rough, flatShading: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind;
    shader.uniforms.uWindAmt = windAmt;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind;\nuniform float uWindAmt;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float h = max(position.y, 0.0);
        float ph = ip.x * 1.7 + ip.z * 1.3;
        transformed.x += sin(uWind * 1.4 + ph) * 0.06 * h * uWindAmt * ${strength.toFixed(2)};
        transformed.z += cos(uWind * 1.1 + ph * 0.7) * 0.04 * h * uWindAmt * ${strength.toFixed(2)};`,
      );
  };
  return m;
}

function instanced(geo: BufferGeometry, material: MeshStandardMaterial, items: Placed[], cast = true): InstancedMesh {
  const mesh = new InstancedMesh(geo, material, Math.max(1, items.length));
  const m = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  items.forEach((it, k) => {
    q.setFromAxisAngle(up, it.rot);
    m.compose(new Vector3(it.x, it.y, it.z), q, new Vector3(it.s, it.s, it.s));
    mesh.setMatrixAt(k, m);
    mesh.setColorAt(k, it.color);
  });
  mesh.count = items.length;
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

const TRUNK = new CylinderGeometry(0.03, 0.05, 0.36, 5).translate(0, 0.18, 0);
const CROWN = new IcosahedronGeometry(0.24, 0).translate(0, 0.5, 0);
const PALM_TRUNK = new CylinderGeometry(0.022, 0.035, 0.72, 5).translate(0, 0.36, 0);
const PALM_CROWN = new ConeGeometry(0.3, 0.14, 7).rotateX(Math.PI).translate(0, 0.74, 0);
const BAMBOO = new CylinderGeometry(0.018, 0.022, 0.8, 4).translate(0, 0.4, 0);
const GRASS = new ConeGeometry(0.035, 0.16, 3).translate(0, 0.08, 0);
const REED = new CylinderGeometry(0.01, 0.016, 0.36, 3).translate(0, 0.18, 0);
const FLOWER = new SphereGeometry(0.035, 5, 4).translate(0, 0.07, 0);
const ROCK = new DodecahedronGeometry(0.2, 0);

export class VegetationLayer {
  readonly group = new Group();
  private key = '';
  private mats = {
    trunk: new MeshStandardMaterial({ color: col('#6E4B31'), roughness: 0.9, flatShading: true }),
    crown: swayMaterial('#FFFFFF', 0.85, 0.6),
    palm: swayMaterial('#FFFFFF', 0.8, 1.2),
    bamboo: swayMaterial('#FFFFFF', 0.7, 1.4),
    grass: swayMaterial('#FFFFFF', 0.9, 2.2),
    reed: swayMaterial('#FFFFFF', 0.9, 2),
    flower: swayMaterial('#FFFFFF', 0.6, 1.6),
    rock: new MeshStandardMaterial({ color: col('#FFFFFF'), roughness: 0.95, flatShading: true }),
  };

  constructor() {
    for (const m of Object.values(this.mats)) m.vertexColors = false;
  }

  setWind(time: number, amount: number) {
    wind.value = time;
    windAmt.value = amount;
  }

  /** Rebuild when the map's shape or greenness bucket changes. */
  sync(state: GameState, green: number, density: number, avoid: Set<number>) {
    const g = state.grid;
    const occupied = new Set<number>();
    for (const b of state.buildings) {
      if (b.type === 'floating') continue;
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) occupied.add(y * g.w + x);
    }
    let canals = 0;
    for (let i = 0; i < g.canal.length; i++) if (g.canal[i]) canals += i * 31;
    const key = `${state.levelId}|${Math.round(green * 5)}|${density}|${canals}|${[...occupied].join(',')}|${[...avoid].join(',')}`;
    if (key === this.key) return;
    this.key = key;
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      (c as InstancedMesh).dispose();
    }
    const trunks: Placed[] = [];
    const crowns: Placed[] = [];
    const palmT: Placed[] = [];
    const palmC: Placed[] = [];
    const bamboo: Placed[] = [];
    const grass: Placed[] = [];
    const reeds: Placed[] = [];
    const flowers: Placed[] = [];
    const rocks: Placed[] = [];
    const near = (i: number, pred: (j: number) => boolean) => {
      const x = i % g.w;
      const z = Math.floor(i / g.w);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx >= 0 && nz >= 0 && nx < g.w && nz < g.h && pred(nz * g.w + nx)) return true;
      }
      return false;
    };
    const edgeDist = (x: number, z: number) => Math.min(x, z, g.w - 1 - x, g.h - 1 - z);
    for (let i = 0; i < g.w * g.h; i++) {
      const x = i % g.w;
      const z = Math.floor(i / g.w);
      const t = g.terrain[i];
      const y = topY(g, i);
      const r = (k: number) => hash01(i, k);
      if (t === 'rock') {
        const n = 1 + Math.floor(r(1) * 2);
        for (let k = 0; k < n; k++) {
          rocks.push({ x: x + 0.3 + r(k + 2) * 0.4, y: y + 0.08, z: z + 0.3 + r(k + 5) * 0.4, s: 0.8 + r(k + 8) * 0.9, rot: r(k + 9) * 6, color: col(r(k) > 0.5 ? '#8C8782' : '#9C968E') });
        }
        continue;
      }
      if (g.canal[i] || isChannelTerrain(t) || occupied.has(i) || avoid.has(i)) continue;
      const green1 = Math.min(1, green + (t === 'marsh' ? 0.4 : 0));
      // Trees: mostly near the map edges or beside rocks, never in the middle of play.
      const treeChance = (edgeDist(x, z) <= 0 ? 0.42 : edgeDist(x, z) === 1 ? 0.14 : 0.03) + (near(i, (j) => g.terrain[j] === 'rock') ? 0.15 : 0);
      if (t !== 'foundation' && t !== 'path' && t !== 'basin' && r(11) < treeChance * density) {
        const kind = r(12);
        const tx = x + 0.3 + r(13) * 0.4;
        const tz = z + 0.3 + r(14) * 0.4;
        const s = 0.8 + r(15) * 0.5;
        if (kind < 0.45) {
          trunks.push({ x: tx, y, z: tz, s, rot: r(16) * 6, color: col('#FFFFFF') });
          crowns.push({ x: tx, y, z: tz, s, rot: r(16) * 6, color: col(r(17) > 0.5 ? '#4E8F3E' : '#5FA048').clone().lerp(col('#7E9B4A'), 1 - green1) });
        } else if (kind < 0.75) {
          palmT.push({ x: tx, y, z: tz, s, rot: r(16) * 6, color: col('#8A6A48') });
          palmC.push({ x: tx, y, z: tz, s, rot: r(16) * 6, color: col('#3F7F3A').clone().lerp(col('#6E8E3E'), 1 - green1) });
        } else {
          for (let k = 0; k < 3; k++) bamboo.push({ x: tx + (r(20 + k) - 0.5) * 0.18, y, z: tz + (r(23 + k) - 0.5) * 0.18, s: s * (0.7 + r(26 + k) * 0.5), rot: 0, color: col('#7FA448') });
        }
      }
      // Grass tufts and wildflowers grow as the village greens.
      if (t === 'soil' || t === 'marsh' || t === 'basin') {
        const nGrass = Math.round((1 + green1 * 4) * density * (r(30) * 0.6 + 0.6));
        for (let k = 0; k < nGrass; k++) {
          grass.push({
            x: x + 0.08 + r(31 + k) * 0.84,
            y,
            z: z + 0.08 + r(41 + k) * 0.84,
            s: 0.7 + r(51 + k) * 0.8,
            rot: r(61 + k) * 6,
            color: col('#6E9A3E').clone().lerp(col('#B59A5A'), Math.max(0, 0.75 - green1)),
          });
        }
        if (green1 > 0.35 && r(70) < (green1 - 0.3) * 0.7 * density) {
          for (let k = 0; k < 2; k++) {
            flowers.push({ x: x + 0.15 + r(71 + k) * 0.7, y, z: z + 0.15 + r(73 + k) * 0.7, s: 1, rot: 0, color: col(r(75 + k) > 0.5 ? '#F2A6C2' : '#F4D35E') });
          }
        }
      }
      // Reeds along streams, canals and marsh.
      if (near(i, (j) => isChannelTerrain(g.terrain[j]) || g.canal[j] === 1) || t === 'marsh') {
        const nReed = Math.round((t === 'marsh' ? 3 : 1.5) * density * (0.5 + green1));
        for (let k = 0; k < nReed; k++) {
          reeds.push({ x: x + 0.1 + r(81 + k) * 0.8, y, z: z + 0.1 + r(91 + k) * 0.8, s: 0.7 + r(95 + k) * 0.7, rot: 0, color: col('#6B8E3A') });
        }
      }
    }
    const add = (geo: BufferGeometry, m: MeshStandardMaterial, items: Placed[], cast = true) => {
      if (items.length) this.group.add(instanced(geo, m, items, cast));
    };
    add(TRUNK, this.mats.trunk, trunks);
    add(CROWN, this.mats.crown, crowns);
    add(PALM_TRUNK, this.mats.trunk, palmT);
    add(PALM_CROWN, this.mats.palm, palmC);
    add(BAMBOO, this.mats.bamboo, bamboo);
    add(GRASS, this.mats.grass, grass, false);
    add(REED, this.mats.reed, reeds, false);
    add(FLOWER, this.mats.flower, flowers, false);
    add(ROCK, this.mats.rock, rocks);
  }

  dispose() {
    for (const c of this.group.children) (c as InstancedMesh).dispose();
    for (const m of Object.values(this.mats)) m.dispose();
  }
}
