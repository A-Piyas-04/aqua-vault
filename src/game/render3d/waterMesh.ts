import { BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, ShaderMaterial } from 'three';
import { CONFIG } from '../model/config';
import type { GameState } from '../model/types';
import { BANK, col, isChannel, topY, waterSurfaceY } from './units';

/** A still water surface supplied by a building (reservoir, pond, wetland, tanks). */
export interface StillWater {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y: number;
  depth: number;
  clean?: boolean;
}

const VERT = /* glsl */ `
attribute float aDepth;
attribute vec2 aFlow;
attribute float aKind;
varying vec3 vWorld;
varying float vDepth;
varying vec2 vFlow;
varying float vKind;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vDepth = aDepth;
  vFlow = aFlow;
  vKind = aKind;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uMotion;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uSky;
uniform vec3 uLight;
varying vec3 vWorld;
varying float vDepth;
varying vec2 vFlow;
varying float vKind;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  float d = clamp(vDepth, 0.0, 1.0);
  vec3 c = mix(uShallow, uDeep, smoothstep(0.0, 1.0, d));
  float t = uTime * uMotion;
  vec2 p = vWorld.xz;
  float alpha = mix(0.6, 0.9, d);
  if (vKind < 0.5) {
    float m = length(vFlow);
    vec2 dir = m > 0.0001 ? vFlow / m : vec2(0.0);
    float sp = clamp(m, 0.0, 1.6);
    vec2 q = p * vec2(3.2) - dir * t * (0.5 + sp * 1.4);
    // Stretch the noise along the flow so it reads as streaks.
    vec2 across = vec2(-dir.y, dir.x);
    vec2 sq = vec2(dot(q, dir) * 0.55, dot(q, across) * 1.6);
    float n = noise(sq) * 0.6 + noise(sq * 2.1 + 7.0) * 0.4;
    float streak = smoothstep(0.6, 0.82, n) * clamp(sp * 1.6, 0.0, 1.0);
    float cz = noise(p * 5.0 + vec2(t * 0.35, -t * 0.28));
    c += vec3(0.85, 0.95, 1.0) * (streak * 0.4 + smoothstep(0.72, 0.96, cz) * 0.14);
  } else if (vKind < 1.5) {
    float fall = fract(vWorld.y * 5.0 + t * 2.4 + noise(vec2(p.x * 7.0 + p.y * 7.0, 0.0)) * 0.6);
    c = mix(c, vec3(0.93, 0.98, 1.0), 0.4 + 0.4 * smoothstep(0.35, 0.9, fall));
    alpha = 0.88;
  } else {
    float r = noise(p * 2.4 + vec2(t * 0.16, t * 0.11));
    c += vec3(0.8, 0.9, 1.0) * smoothstep(0.66, 0.92, r) * 0.14;
    if (vKind > 2.5) c = mix(c, vec3(0.72, 0.9, 0.97), 0.55);
  }
  c = mix(c, uSky, 0.1);
  gl_FragColor = vec4(c * uLight, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const FLOATS_PER_VERT = { pos: 3, depth: 1, flow: 2, kind: 1 };

export class WaterLayer {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  private geo: BufferGeometry;
  private cap = 0;
  private pos!: Float32Array;
  private depth!: Float32Array;
  private flow!: Float32Array;
  private kind!: Float32Array;
  private n = 0;

  constructor() {
    this.geo = new BufferGeometry();
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uMotion: { value: 1 },
        uShallow: { value: col('#7FC7D9').clone() },
        uDeep: { value: col('#1E6F82').clone() },
        uSky: { value: new Color(0.8, 0.9, 0.95) },
        uLight: { value: new Color(1, 1, 1) },
      },
    });
    this.mesh = new Mesh(this.geo, this.material);
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    this.ensure(1024);
  }

  private ensure(quads: number) {
    if (quads <= this.cap) return;
    this.cap = Math.max(quads, this.cap * 2);
    const v = this.cap * 6;
    this.pos = new Float32Array(v * FLOATS_PER_VERT.pos);
    this.depth = new Float32Array(v);
    this.flow = new Float32Array(v * 2);
    this.kind = new Float32Array(v);
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aDepth', new BufferAttribute(this.depth, 1));
    this.geo.setAttribute('aFlow', new BufferAttribute(this.flow, 2));
    this.geo.setAttribute('aKind', new BufferAttribute(this.kind, 1));
  }

  private quad(p: number[][], depth: number, fx: number, fz: number, kind: number) {
    const order = [0, 1, 2, 0, 2, 3];
    for (const k of order) {
      const v = this.n++;
      this.pos[v * 3] = p[k][0];
      this.pos[v * 3 + 1] = p[k][1];
      this.pos[v * 3 + 2] = p[k][2];
      this.depth[v] = depth;
      this.flow[v * 2] = fx;
      this.flow[v * 2 + 1] = fz;
      this.kind[v] = kind;
    }
  }

  private flat(x0: number, z0: number, x1: number, z1: number, y: number, depth: number, fx: number, fz: number, kind: number) {
    this.quad(
      [
        [x0, y, z0],
        [x0, y, z1],
        [x1, y, z1],
        [x1, y, z0],
      ],
      depth,
      fx,
      fz,
      kind,
    );
  }

  update(state: GameState, prevWater: Float64Array | null, alpha: number, time: number, still: StillWater[], motion: number) {
    const g = state.grid;
    const n = g.w * g.h;
    this.ensure(n * 13 + still.length + 16);
    this.n = 0;
    const turbineCells = new Set<number>();
    const structType = new Map<number, string>();
    for (const b of state.buildings) {
      if (b.type === 'turbine') turbineCells.add(b.y * g.w + b.x);
      if (b.type !== 'floating') for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) structType.set(y * g.w + x, b.type);
    }
    const water = (i: number) => (prevWater && prevWater.length === n ? prevWater[i] + (g.water[i] - prevWater[i]) * alpha : g.water[i]);
    const chan = new Uint8Array(n);
    const surf = new Float32Array(n).fill(-1e9);
    const wet = new Uint8Array(n);
    const thr = CONFIG.water.wetThreshold;
    for (let i = 0; i < n; i++) {
      chan[i] = isChannel(state, i, turbineCells) ? 1 : 0;
      const w = water(i);
      const blocked = structType.has(i) && !turbineCells.has(i);
      if (w > thr * 0.6 && !blocked && g.terrain[i] !== 'rock') {
        wet[i] = 1;
        surf[i] = waterSurfaceY(g, i, w, chan[i] === 1);
      }
    }
    const tile = (x: number, z: number) => (x < 0 || z < 0 || x >= g.w || z >= g.h ? -1 : z * g.w + x);
    const lo = BANK;
    const hi = 1 - BANK;
    for (let z = 0; z < g.h; z++) {
      for (let x = 0; x < g.w; x++) {
        const i = z * g.w + x;
        if (!wet[i]) continue;
        const w = water(i);
        const depth = Math.min(1, w / (CONFIG.water.cellCapacity * 0.45));
        const fx = g.flowX[i];
        const fz = g.flowY[i];
        const y = surf[i];
        if (!chan[i]) {
          // Shallow sheet / puddle on open ground.
          const r = Math.min(0.5, 0.18 + w * 0.08);
          this.flat(x + 0.5 - r, z + 0.5 - r, x + 0.5 + r, z + 0.5 + r, y, Math.min(0.35, depth), fx, fz, 0);
          continue;
        }
        const overBanks = y > topY(g, i) + 0.005;
        if (overBanks) {
          this.flat(x, z, x + 1, z + 1, y, depth, fx, fz, 0);
        } else {
          this.flat(x + lo, z + lo, x + hi, z + hi, y, depth, fx, fz, 0);
          const nb = [tile(x, z - 1), tile(x + 1, z), tile(x, z + 1), tile(x - 1, z)];
          const opens = nb.map((j) => j >= 0 && (chan[j] === 1 || ['reservoir', 'fishpond', 'wetland', 'field', 'treatment'].includes(structType.get(j) ?? '')));
          if (opens[0]) this.flat(x + lo, z, x + hi, z + lo, y, depth, fx, fz, 0);
          if (opens[2]) this.flat(x + lo, z + hi, x + hi, z + 1, y, depth, fx, fz, 0);
          if (opens[1]) this.flat(x + hi, z + lo, x + 1, z + hi, y, depth, fx, fz, 0);
          if (opens[3]) this.flat(x, z + lo, x + lo, z + hi, y, depth, fx, fz, 0);
        }
        // Waterfalls toward lower wet channels (east and south edges, and west/north).
        const dirs: [number, number, number, number, number, number][] = [
          [1, 0, x + 1, z + lo, x + 1, z + hi],
          [0, 1, x + lo, z + 1, x + hi, z + 1],
          [-1, 0, x, z + lo, x, z + hi],
          [0, -1, x + lo, z, x + hi, z],
        ];
        for (const [dx, dz, ax, az, bx, bz] of dirs) {
          const j = tile(x + dx, z + dz);
          if (j < 0 || !wet[j] || !chan[j]) continue;
          if (y - surf[j] < 0.06) continue;
          this.quad(
            [
              [ax, surf[j], az],
              [ax, y, az],
              [bx, y, bz],
              [bx, surf[j], bz],
            ],
            0.6,
            0,
            0,
            1,
          );
        }
      }
    }
    for (const s of still) this.flat(s.x0, s.z0, s.x1, s.z1, s.y, s.depth, 0, 0, s.clean ? 3 : 2);

    for (const name of ['position', 'aDepth', 'aFlow', 'aKind']) (this.geo.getAttribute(name) as BufferAttribute).needsUpdate = true;
    this.geo.setDrawRange(0, this.n);
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uMotion.value = motion;
  }

  dispose() {
    this.geo.dispose();
    this.material.dispose();
  }
}
