import { OrthographicCamera, Raycaster, Vector2, Vector3 } from 'three';

/**
 * Tilted orthographic "diorama" camera. Pans and zooms keep the ground point under the
 * pointer fixed; rotation, focus and reset glide (instantly with reduced motion).
 */
export const DEFAULT_YAW = -0.32;
const PITCH = 0.92;
const MIN_ZOOM = 0.85;
const MAX_ZOOM = 4.5;

export class CameraRig {
  readonly camera = new OrthographicCamera(-10, 10, 10, -10, 0.1, 400);
  private w = 1;
  private h = 1;
  private maxY = 2;
  private cssW = 1;
  private cssH = 1;
  // Current and target values.
  tx = 0;
  tz = 0;
  yaw = DEFAULT_YAW;
  zoom = 1;
  private goal: { tx: number; tz: number; yaw: number; zoom: number } | null = null;
  private fitHalf = 10;
  private ray = new Raycaster();
  reducedMotion = false;
  /** Pixels of the screen covered by floating UI; the map is framed in the free area. */
  private inset = { l: 0, r: 0, t: 0, b: 0 };

  setInsets(l: number, r: number, t: number, b: number) {
    this.inset = { l, r, t, b };
    this.apply();
  }

  setMap(w: number, h: number, maxY: number) {
    this.w = w;
    this.h = h;
    this.maxY = maxY;
    this.reset(true);
  }

  resize(cssW: number, cssH: number) {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    this.apply();
  }

  reset(instant = false) {
    const g = { tx: this.w / 2, tz: this.h / 2 + 0.4, yaw: DEFAULT_YAW, zoom: 1 };
    if (instant || this.reducedMotion) {
      Object.assign(this, g);
      this.goal = null;
      this.apply();
    } else this.goal = g;
  }

  /** Frame a rectangle of cells. */
  focus(x: number, y: number, w: number, h: number) {
    const span = Math.max(w + 2.5, (h + 2.5) * 1.3);
    const mapSpan = Math.max(this.w, this.h * 1.3);
    const zoom = Math.max(1, Math.min(2.6, (mapSpan / span) * 0.7));
    const g = { tx: x + w / 2, tz: y + h / 2, yaw: this.goal?.yaw ?? this.yaw, zoom };
    if (this.reducedMotion) {
      Object.assign(this, g);
      this.clampTarget();
      this.apply();
    } else this.goal = g;
  }

  rotate(quarterTurns: number) {
    const base = this.goal?.yaw ?? this.yaw;
    const snapped = Math.round((base - DEFAULT_YAW) / (Math.PI / 2)) * (Math.PI / 2) + DEFAULT_YAW;
    const g = { tx: this.tx, tz: this.tz, zoom: this.goal?.zoom ?? this.zoom, yaw: snapped + quarterTurns * (Math.PI / 2) };
    if (this.reducedMotion) {
      this.yaw = g.yaw;
      this.goal = null;
      this.apply();
    } else this.goal = g;
  }

  twist(rad: number) {
    this.goal = null;
    this.yaw -= rad;
    this.apply();
  }

  panByScreen(dx: number, dy: number) {
    this.goal = null;
    const upp = (2 * this.halfHeight()) / this.cssH;
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    // Screen right on the ground, and screen up (away from the camera) on the ground.
    const rx = cy, rz = -sy;
    const fx = -sy, fz = -cy;
    const k = upp / Math.sin(this.pitch());
    this.tx += -dx * upp * rx + dy * k * fx;
    this.tz += -dx * upp * rz + dy * k * fz;
    this.clampTarget();
    this.apply();
  }

  zoomAt(factor: number, cssX: number, cssY: number) {
    this.goal = null;
    const before = this.groundAt(cssX, cssY);
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom * factor));
    this.apply();
    const after = this.groundAt(cssX, cssY);
    if (before && after) {
      this.tx += before.x - after.x;
      this.tz += before.z - after.z;
      this.clampTarget();
      this.apply();
    }
  }

  /** Ease toward any pending goal. Returns true while moving. */
  update(dt: number): boolean {
    if (!this.goal) return false;
    const k = 1 - Math.exp(-7 * dt);
    const g = this.goal;
    this.tx += (g.tx - this.tx) * k;
    this.tz += (g.tz - this.tz) * k;
    this.yaw += (g.yaw - this.yaw) * k;
    this.zoom += (g.zoom - this.zoom) * k;
    if (Math.abs(g.tx - this.tx) + Math.abs(g.tz - this.tz) + Math.abs(g.yaw - this.yaw) * 4 + Math.abs(g.zoom - this.zoom) < 0.002) {
      Object.assign(this, g);
      this.goal = null;
    }
    this.clampTarget();
    this.apply();
    return true;
  }

  ray01(cssX: number, cssY: number): { origin: Vector3; dir: Vector3 } {
    const ndc = new Vector2((cssX / this.cssW) * 2 - 1, -(cssY / this.cssH) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    return { origin: this.ray.ray.origin.clone(), dir: this.ray.ray.direction.clone() };
  }

  private groundAt(cssX: number, cssY: number): { x: number; z: number } | null {
    const { origin, dir } = this.ray01(cssX, cssY);
    const planeY = this.maxY * 0.4;
    if (Math.abs(dir.y) < 1e-6) return null;
    const t = (planeY - origin.y) / dir.y;
    return { x: origin.x + dir.x * t, z: origin.z + dir.z * t };
  }

  private pitch(): number {
    // Look slightly steeper when zoomed out, more of a side view up close.
    return PITCH - Math.min(0.18, (this.zoom - 1) * 0.06);
  }

  private halfHeight(): number {
    return this.fitHalf / this.zoom;
  }

  private clampTarget() {
    this.tx = Math.max(0, Math.min(this.w, this.tx));
    this.tz = Math.max(0, Math.min(this.h + 0.5, this.tz));
  }

  /** Recompute the fit and place the camera. */
  apply() {
    const p = this.pitch();
    const dir = new Vector3(Math.sin(this.yaw) * Math.cos(p), Math.sin(p), Math.cos(this.yaw) * Math.cos(p));
    const dist = 60;
    const target = new Vector3(this.tx, this.maxY * 0.3, this.tz);
    this.camera.position.copy(target).addScaledVector(dir, dist);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
    // Fit: project the map's corners into camera space at zoom 1 around the map centre.
    const aspect = this.cssW / this.cssH;
    const inv = this.camera.matrixWorldInverse;
    const center = new Vector3(this.w / 2, this.maxY * 0.3, this.h / 2).applyMatrix4(inv);
    let maxX = 0;
    let maxYv = 0;
    for (const [x, z] of [
      [0, 0],
      [this.w, 0],
      [0, this.h],
      [this.w, this.h],
    ]) {
      for (const y of [-1.1, this.maxY]) {
        const v = new Vector3(x, y, z).applyMatrix4(inv);
        maxX = Math.max(maxX, Math.abs(v.x - center.x));
        maxYv = Math.max(maxYv, Math.abs(v.y - center.y));
      }
    }
    // Frame the map in the area the floating UI leaves free.
    const { l, r, t, b } = this.inset;
    const availW = Math.max(120, this.cssW - l - r);
    const availH = Math.max(120, this.cssH - t - b);
    this.fitHalf = Math.max((maxYv * this.cssH) / availH, (maxX * this.cssH) / availW) * 1.05;
    const half = this.halfHeight();
    const upp = (2 * half) / this.cssH;
    const dx = (l - r) / 2;
    const dy = (t - b) / 2;
    this.camera.left = -half * aspect - dx * upp;
    this.camera.right = half * aspect - dx * upp;
    this.camera.top = half + dy * upp;
    this.camera.bottom = -half + dy * upp;
    this.camera.updateProjectionMatrix();
  }
}
