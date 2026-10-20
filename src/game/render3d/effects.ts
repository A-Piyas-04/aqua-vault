import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  RingGeometry,
  type Group,
} from 'three';
import type { GameState } from '../model/types';
import { col, topY } from './units';

/** Rain streaks, world-space particles (petals, dust, sparkles) and arrival ripples. */

const MAX_PARTICLES = 320;
const MAX_DROPS = 900;
const RING_POOL = 24;

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  r: number;
  g: number;
  b: number;
  gravity: number;
}

function dotTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new CanvasTexture(c);
}

export class EffectsLayer {
  private particles: Particle[] = [];
  private pGeo = new BufferGeometry();
  private pPos = new Float32Array(MAX_PARTICLES * 3);
  private pCol = new Float32Array(MAX_PARTICLES * 3);
  private points: Points;
  private rain: LineSegments;
  private rainPos = new Float32Array(MAX_DROPS * 6);
  private drops: { x: number; y: number; z: number; v: number }[] = [];
  private rainMat: LineBasicMaterial;
  private rings: { mesh: Mesh; mat: MeshBasicMaterial; life: number }[] = [];
  private wetPrev: Uint8Array | null = null;
  private bounds = { w: 1, h: 1 };
  private texture = dotTexture();

  constructor(private root: Group) {
    this.pGeo.setAttribute('position', new BufferAttribute(this.pPos, 3));
    this.pGeo.setAttribute('color', new BufferAttribute(this.pCol, 3));
    this.points = new Points(
      this.pGeo,
      new PointsMaterial({ size: 9, sizeAttenuation: false, vertexColors: true, map: this.texture, transparent: true, depthWrite: false, alphaTest: 0.05 }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    root.add(this.points);

    const rg = new BufferGeometry();
    rg.setAttribute('position', new BufferAttribute(this.rainPos, 3));
    this.rainMat = new LineBasicMaterial({ color: new Color(0.82, 0.9, 0.98), transparent: true, opacity: 0.45, depthWrite: false });
    this.rain = new LineSegments(rg, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 7;
    root.add(this.rain);

    const ringGeo = new RingGeometry(0.3, 0.38, 20).rotateX(-Math.PI / 2);
    for (let k = 0; k < RING_POOL; k++) {
      const mat = new MeshBasicMaterial({ color: new Color(1, 1, 1), transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });
      const mesh = new Mesh(ringGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 4;
      root.add(mesh);
      this.rings.push({ mesh, mat, life: 1 });
    }
  }

  setMap(w: number, h: number) {
    this.bounds = { w, h };
    this.drops = [];
    this.particles = [];
    this.wetPrev = null;
    for (const r of this.rings) r.mesh.visible = false;
  }

  private spawn(p: Particle) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(p);
  }

  celebrate(x: number, y: number, z: number, reduced: boolean) {
    const colors = [col('#F2A6C2'), col('#FFFFFF'), col('#F4C542'), col('#F7C6D9'), col('#9FE0B0')];
    const n = reduced ? 8 : 34;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.6 + Math.random() * 1.4;
      const c = colors[k % colors.length];
      this.spawn({ x, y, z, vx: Math.cos(a) * sp, vy: 2 + Math.random() * 1.6, vz: Math.sin(a) * sp, life: 0, max: 1.4 + Math.random() * 0.6, r: c.r, g: c.g, b: c.b, gravity: 3.2 });
    }
  }

  dust(x: number, y: number, z: number) {
    for (let k = 0; k < 6; k++) {
      this.spawn({ x: x + (Math.random() - 0.5) * 0.4, y, z: z + (Math.random() - 0.5) * 0.4, vx: (Math.random() - 0.5) * 1.2, vy: 0.6 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 1.2, life: 0, max: 0.5, r: 0.55, g: 0.42, b: 0.28, gravity: 4 });
    }
  }

  splash(x: number, y: number, z: number) {
    const r = this.rings.find((q) => !q.mesh.visible) ?? this.rings[0];
    r.mesh.visible = true;
    r.mesh.position.set(x, y + 0.01, z);
    r.life = 0;
    for (let k = 0; k < 5; k++) {
      this.spawn({ x, y, z, vx: (Math.random() - 0.5) * 0.8, vy: 0.9 + Math.random() * 0.7, vz: (Math.random() - 0.5) * 0.8, life: 0, max: 0.55, r: 0.85, g: 0.95, b: 1, gravity: 5 });
    }
  }

  /** Detect canal tiles that just became wet, for a ripple. */
  watchWater(state: GameState, surfaceY: (i: number) => number, reduced: boolean) {
    const g = state.grid;
    const n = g.w * g.h;
    if (!this.wetPrev || this.wetPrev.length !== n) {
      this.wetPrev = new Uint8Array(n);
      for (let i = 0; i < n; i++) this.wetPrev[i] = g.water[i] > 0.15 ? 1 : 0;
      return;
    }
    for (let i = 0; i < n; i++) {
      const wet = g.water[i] > 0.15 ? 1 : 0;
      if (wet && !this.wetPrev[i] && g.canal[i] && !reduced) this.splash((i % g.w) + 0.5, surfaceY(i), Math.floor(i / g.w) + 0.5);
      this.wetPrev[i] = wet;
    }
  }

  update(state: GameState, dt: number, reduced: boolean, night: number) {
    // Particles.
    let k = 0;
    this.particles = this.particles.filter((p) => (p.life += dt) < p.max);
    for (const p of this.particles) {
      p.vy -= p.gravity * dt;
      p.vx *= 0.985;
      p.vz *= 0.985;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const fade = 1 - p.life / p.max;
      this.pPos[k * 3] = p.x;
      this.pPos[k * 3 + 1] = p.y;
      this.pPos[k * 3 + 2] = p.z;
      this.pCol[k * 3] = p.r * fade;
      this.pCol[k * 3 + 1] = p.g * fade;
      this.pCol[k * 3 + 2] = p.b * fade;
      k++;
    }
    (this.pGeo.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.pGeo.getAttribute('color') as BufferAttribute).needsUpdate = true;
    this.pGeo.setDrawRange(0, k);

    // Ripple rings.
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.life += dt;
      const t = r.life / 0.9;
      if (t >= 1) {
        r.mesh.visible = false;
        continue;
      }
      r.mesh.scale.setScalar(0.4 + t * 1.4);
      r.mat.opacity = (1 - t) * 0.55;
    }

    // Rain.
    const mode = state.weather.mode;
    const intensity = mode === 'heavy' ? 1 : mode === 'rain' ? 0.6 : mode === 'drizzle' ? 0.25 : 0;
    const target = reduced ? 0 : Math.round(MAX_DROPS * intensity);
    const { w, h } = this.bounds;
    const g = state.grid;
    while (this.drops.length < target) this.drops.push({ x: Math.random() * w, y: Math.random() * 6, z: Math.random() * h, v: 9 + Math.random() * 4 });
    if (this.drops.length > target) this.drops.length = target;
    const len = 0.22 + intensity * 0.18;
    const slant = 0.12;
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];
      d.y -= d.v * dt;
      d.x += slant * d.v * dt * 0.2;
      const tx = Math.min(g.w - 1, Math.max(0, Math.floor(d.x)));
      const tz = Math.min(g.h - 1, Math.max(0, Math.floor(d.z)));
      if (d.y < topY(g, tz * g.w + tx) || d.x > w) {
        d.x = Math.random() * w;
        d.z = Math.random() * h;
        d.y = 4 + Math.random() * 2.5;
      }
      const o = i * 6;
      this.rainPos[o] = d.x;
      this.rainPos[o + 1] = d.y;
      this.rainPos[o + 2] = d.z;
      this.rainPos[o + 3] = d.x - slant * len;
      this.rainPos[o + 4] = d.y + len;
      this.rainPos[o + 5] = d.z;
    }
    const rg = this.rain.geometry;
    (rg.getAttribute('position') as BufferAttribute).needsUpdate = true;
    rg.setDrawRange(0, this.drops.length * 2);
    this.rainMat.opacity = 0.32 + intensity * 0.25 - night * 0.12;
  }

  dispose() {
    this.pGeo.dispose();
    this.rain.geometry.dispose();
    this.rainMat.dispose();
    this.texture.dispose();
    for (const r of this.rings) r.mat.dispose();
    this.root.remove(this.points, this.rain, ...this.rings.map((r) => r.mesh));
  }
}
