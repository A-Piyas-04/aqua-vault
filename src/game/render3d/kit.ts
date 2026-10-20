import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  type Material,
} from 'three';
import { col } from './units';

/** Shared low-poly building blocks: cached geometries and materials, flat shaded. */

const matCache = new Map<string, MeshStandardMaterial>();

export interface MatOpts {
  emissive?: string;
  emissiveIntensity?: number;
  rough?: number;
  metal?: number;
  opacity?: number;
}

export function mat(color: string, o: MatOpts = {}): MeshStandardMaterial {
  const key = `${color}|${o.emissive ?? ''}|${o.emissiveIntensity ?? ''}|${o.rough ?? ''}|${o.metal ?? ''}|${o.opacity ?? ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new MeshStandardMaterial({
      color: col(color),
      roughness: o.rough ?? 0.85,
      metalness: o.metal ?? 0,
      flatShading: true,
      transparent: o.opacity !== undefined && o.opacity < 1,
      opacity: o.opacity ?? 1,
    });
    if (o.emissive) {
      m.emissive = col(o.emissive).clone();
      m.emissiveIntensity = o.emissiveIntensity ?? 1;
    }
    if (m.transparent) m.depthWrite = false;
    matCache.set(key, m);
  }
  return m;
}

/** A private (non-shared) material, for per-building animated values. */
export function ownMat(color: string, o: MatOpts = {}): MeshStandardMaterial {
  return mat(color, o).clone();
}

const UNIT_BOX = new BoxGeometry(1, 1, 1);
const geoCache = new Map<string, BufferGeometry>();

function cached(key: string, make: () => BufferGeometry): BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

function shadowy<T extends Mesh>(m: T, cast = true): T {
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

export function box(w: number, h: number, d: number, material: Material, x = 0, y = 0, z = 0, cast = true): Mesh {
  const m = shadowy(new Mesh(UNIT_BOX, material), cast);
  m.scale.set(w, h, d);
  m.position.set(x, y + h / 2, z);
  return m;
}

export function cyl(rTop: number, rBot: number, h: number, seg: number, material: Material, x = 0, y = 0, z = 0, cast = true): Mesh {
  const g = cached(`cyl${rTop}|${rBot}|${h}|${seg}`, () => new CylinderGeometry(rTop, rBot, h, seg));
  const m = shadowy(new Mesh(g, material), cast);
  m.position.set(x, y + h / 2, z);
  return m;
}

export function cone(r: number, h: number, seg: number, material: Material, x = 0, y = 0, z = 0): Mesh {
  const g = cached(`cone${r}|${h}|${seg}`, () => new ConeGeometry(r, h, seg));
  const m = shadowy(new Mesh(g, material));
  m.position.set(x, y + h / 2, z);
  return m;
}

export function ball(r: number, material: Material, x = 0, y = 0, z = 0, detail = 0): Mesh {
  const g = cached(`ball${r}|${detail}`, () => new SphereGeometry(r, detail ? 10 : 6, detail ? 8 : 5));
  const m = shadowy(new Mesh(g, material));
  m.position.set(x, y, z);
  return m;
}

/** Gabled roof: a triangular prism running along x, ridge on top. */
export function roofGeometry(w: number, d: number, h: number, overhang = 0.06): BufferGeometry {
  return cached(`roof${w}|${d}|${h}|${overhang}`, () => {
    const x0 = -w / 2 - overhang, x1 = w / 2 + overhang;
    const z0 = -d / 2 - overhang, z1 = d / 2 + overhang;
    const p = [
      // south slope
      x0, 0, z1, x1, 0, z1, x1, h, 0, x0, 0, z1, x1, h, 0, x0, h, 0,
      // north slope
      x1, 0, z0, x0, 0, z0, x0, h, 0, x1, 0, z0, x0, h, 0, x1, h, 0,
      // gables
      x0, 0, z0, x0, 0, z1, x0, h, 0,
      x1, 0, z1, x1, 0, z0, x1, h, 0,
      // underside
      x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z0, x1, 0, z1, x0, 0, z1,
    ];
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(p, 3));
    g.computeVertexNormals();
    return g;
  });
}

export function roof(w: number, d: number, h: number, material: Material, x = 0, y = 0, z = 0): Mesh {
  const m = shadowy(new Mesh(roofGeometry(w, d, h), material));
  m.position.set(x, y, z);
  return m;
}

const MARKER_GEO = new OctahedronGeometry(0.11, 0);
/** Bobbing gold diamond shown over anything ready to harvest. */
export function readyMarker(): Mesh {
  const m = new Mesh(MARKER_GEO, mat('#F4C542', { emissive: '#F4B000', emissiveIntensity: 0.9, rough: 0.4 }));
  m.castShadow = false;
  return m;
}

let glowTex: CanvasTexture | null = null;
function glowTexture(): CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,220,150,1)');
  grad.addColorStop(0.35, 'rgba(255,190,110,0.45)');
  grad.addColorStop(1, 'rgba(255,170,90,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new CanvasTexture(c);
  return glowTex;
}

/** Warm additive halo for lit windows and lamps. */
export function glowSprite(size: number): Sprite {
  const s = new Sprite(new SpriteMaterial({ map: glowTexture(), blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  s.scale.set(size, size, 1);
  s.renderOrder = 5;
  return s;
}

export function disposeKit() {
  for (const m of matCache.values()) m.dispose();
  matCache.clear();
  for (const g of geoCache.values()) g.dispose();
  geoCache.clear();
}
