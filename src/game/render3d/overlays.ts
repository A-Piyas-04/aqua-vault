import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { GATE_CLOSED } from '../model/types';
import type { GameState } from '../model/types';
import type { RenderUi } from '../render/types';
import { box, mat } from './kit';
import { BANK, channelDepth, isChannel, topY } from './units';

const MAX_CELLS = 64;
const MAX_BARS = 96;
const MAX_DOTS = 80;

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _c = new Color();

const C = {
  ok: new Color(0.35, 0.86, 0.5),
  bad: new Color(0.95, 0.38, 0.28),
  coach: new Color(1.0, 0.86, 0.35),
  hover: new Color(1, 1, 1),
  select: new Color(1, 1, 1),
  keyboard: new Color(1.0, 0.85, 0.2),
};

function digitTexture(text: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(20,30,34,0.72)';
  g.beginPath();
  g.arc(32, 32, 26, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.font = '700 38px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 32, 34);
  return new CanvasTexture(c);
}

export class OverlayLayer {
  readonly group = new Group();
  private cells: InstancedMesh;
  private bars: InstancedMesh;
  private dots: InstancedMesh;
  private nCells = 0;
  private nBars = 0;
  private digitMats: SpriteMaterial[] = [];
  private labels: Sprite[] = [];
  private labelsKey = '';

  constructor() {
    const cellMat = new MeshBasicMaterial({ transparent: true, opacity: 0.42, depthWrite: false, depthTest: false });
    this.cells = new InstancedMesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), cellMat, MAX_CELLS);
    const barMat = new MeshBasicMaterial({ depthWrite: false, depthTest: false, transparent: true, opacity: 0.95 });
    this.bars = new InstancedMesh(new BoxGeometry(1, 1, 1), barMat, MAX_BARS);
    const dotMat = new MeshBasicMaterial({ color: C.coach, depthWrite: false, depthTest: false, transparent: true, opacity: 0.95 });
    this.dots = new InstancedMesh(new SphereGeometry(0.07, 8, 6), dotMat, MAX_DOTS);
    for (const m of [this.cells, this.bars, this.dots]) {
      m.frustumCulled = false;
      m.renderOrder = 10;
      m.count = 0;
      this.group.add(m);
    }
    for (let d = 0; d <= 9; d++) this.digitMats.push(new SpriteMaterial({ map: digitTexture(String(d)), depthTest: false, depthWrite: false, transparent: true }));
  }

  private cell(state: GameState, i: number, color: Color, lift = 0.03) {
    if (this.nCells >= MAX_CELLS) return;
    const g = state.grid;
    const x = i % g.w;
    const z = Math.floor(i / g.w);
    _m.compose(_p.set(x + 0.5, topY(g, i) + lift, z + 0.5), _q.identity(), _s.set(0.94, 1, 0.94));
    this.cells.setMatrixAt(this.nCells, _m);
    this.cells.setColorAt(this.nCells, color);
    this.nCells++;
  }

  private bar(x0: number, z0: number, x1: number, z1: number, y: number, color: Color, t = 0.06) {
    if (this.nBars >= MAX_BARS) return;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    _m.compose(_p.set(cx, y, cz), _q.identity(), _s.set(Math.abs(x1 - x0) + t, t * 0.6, Math.abs(z1 - z0) + t));
    this.bars.setMatrixAt(this.nBars, _m);
    this.bars.setColorAt(this.nBars, color);
    this.nBars++;
  }

  private rect(state: GameState, x: number, z: number, w: number, h: number, color: Color, t = 0.06, lift = 0.05) {
    const g = state.grid;
    let y = -Infinity;
    for (let yy = z; yy < z + h; yy++) for (let xx = x; xx < x + w; xx++) if (xx >= 0 && yy >= 0 && xx < g.w && yy < g.h) y = Math.max(y, topY(g, yy * g.w + xx));
    if (!Number.isFinite(y)) return;
    y += lift;
    this.bar(x, z, x + w, z, y, color, t);
    this.bar(x, z + h, x + w, z + h, y, color, t);
    this.bar(x, z, x, z + h, y, color, t);
    this.bar(x + w, z, x + w, z + h, y, color, t);
  }

  update(state: GameState, ui: RenderUi, time: number) {
    this.nCells = 0;
    this.nBars = 0;
    const g = state.grid;
    const pulse = ui.reducedMotion ? 0.75 : 0.55 + 0.45 * Math.sin(time * 3.2);

    // Coach highlights.
    if (ui.highlightCells) {
      _c.copy(C.coach).multiplyScalar(0.6 + pulse * 0.4);
      for (const c of ui.highlightCells) if (c.x >= 0 && c.y >= 0 && c.x < g.w && c.y < g.h) this.cell(state, c.y * g.w + c.x, _c, 0.04);
    }
    if (ui.highlightZone) {
      const z = ui.highlightZone;
      this.rect(state, z.x, z.y, z.w, z.h, _c.copy(C.coach).multiplyScalar(0.55 + pulse * 0.45), 0.09, 0.08 + pulse * 0.04);
    }

    // Placement preview, hover, selection, keyboard cursor.
    if (ui.preview && ui.preview.cells.length) {
      ui.preview.cells.forEach((c, k) => {
        const uphill = ui.preview!.climb?.[k];
        this.cell(state, c, ui.preview!.ok && !uphill ? C.ok : C.bad);
      });
      const xs = ui.preview.cells.map((c) => c % g.w);
      const zs = ui.preview.cells.map((c) => Math.floor(c / g.w));
      const x0 = Math.min(...xs);
      const z0 = Math.min(...zs);
      this.rect(state, x0, z0, Math.max(...xs) - x0 + 1, Math.max(...zs) - z0 + 1, ui.preview.ok ? C.ok : C.bad, 0.05, 0.06);
    } else if (ui.hoverCell >= 0) {
      this.rect(state, ui.hoverCell % g.w, Math.floor(ui.hoverCell / g.w), 1, 1, C.hover, 0.035, 0.04);
    }
    const sel = ui.selectedId >= 0 ? state.buildings.find((b) => b.id === ui.selectedId) : undefined;
    if (sel) this.rect(state, sel.x, sel.y, sel.w, sel.h, C.select, 0.07, sel.type === 'house' ? 0.9 : 0.42);
    else if (ui.selectedCell >= 0) this.rect(state, ui.selectedCell % g.w, Math.floor(ui.selectedCell / g.w), 1, 1, C.select, 0.07, 0.06);
    if (ui.keyboardCell >= 0) this.rect(state, ui.keyboardCell % g.w, Math.floor(ui.keyboardCell / g.w), 1, 1, C.keyboard, 0.08, 0.07);

    // "Follow the dots" path.
    let nd = 0;
    const path = ui.tutorialPath;
    if (path && path.length > 1) {
      const pts = path.filter((p) => p.x >= 0 && p.y >= 0 && p.x < g.w && p.y < g.h).map((p) => new Vector3(p.x + 0.5, topY(g, p.y * g.w + p.x) + 0.16, p.y + 0.5));
      const segs: number[] = [0];
      for (let k = 1; k < pts.length; k++) segs.push(segs[k - 1] + pts[k].distanceTo(pts[k - 1]));
      const total = segs[segs.length - 1];
      const spacing = 0.33;
      const offset = ui.reducedMotion ? 0 : (time * 0.9) % spacing;
      for (let d = offset; d <= total && nd < MAX_DOTS; d += spacing) {
        let k = 1;
        while (k < segs.length - 1 && segs[k] < d) k++;
        const t = (d - segs[k - 1]) / Math.max(1e-6, segs[k] - segs[k - 1]);
        _p.copy(pts[k - 1]).lerp(pts[k], Math.min(1, t));
        const s = 0.7 + 0.5 * Math.sin((d / total) * Math.PI);
        _m.compose(_p, _q.identity(), _s.set(s, s, s));
        this.dots.setMatrixAt(nd++, _m);
      }
    }

    this.cells.count = this.nCells;
    this.bars.count = this.nBars;
    this.dots.count = nd;
    for (const m of [this.cells, this.bars, this.dots]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    // Height numbers.
    const key = ui.showHeights ? `${state.levelId}|${g.w}x${g.h}` : '';
    if (key !== this.labelsKey) {
      this.labelsKey = key;
      for (const l of this.labels) this.group.remove(l);
      this.labels = [];
      if (ui.showHeights) {
        for (let i = 0; i < g.w * g.h; i++) {
          if (g.terrain[i] === 'rock') continue;
          const s = new Sprite(this.digitMats[Math.max(0, Math.min(9, g.elevation[i]))]);
          s.position.set((i % g.w) + 0.5, topY(g, i) + 0.25, Math.floor(i / g.w) + 0.5);
          s.scale.set(0.42, 0.42, 1);
          s.renderOrder = 11;
          this.labels.push(s);
          this.group.add(s);
        }
      }
    }
  }

  dispose() {
    this.cells.dispose();
    this.bars.dispose();
    this.dots.dispose();
    for (const m of this.digitMats) {
      m.map?.dispose();
      m.dispose();
    }
  }
}

/** Gates (boards that drop when closed) and bamboo bridges on canal tiles. */
export class FeatureLayer {
  readonly group = new Group();
  private boards = new Map<number, { mesh: Mesh; open: number }>();
  private key = '';

  sync(state: GameState) {
    const g = state.grid;
    let key = state.levelId;
    for (let i = 0; i < g.w * g.h; i++) if (g.gate[i] || g.bridge[i]) key += `|${i}:${g.gate[i] ? 1 : 0}${g.bridge[i]}`;
    if (key === this.key) return;
    this.key = key;
    this.group.clear();
    this.boards.clear();
    const wood = mat('#7B5534');
    const dark = mat('#5A3C24');
    const bamboo = mat('#C9A86A');
    for (let i = 0; i < g.w * g.h; i++) {
      if (!g.gate[i] && !g.bridge[i]) continue;
      const x = i % g.w;
      const z = Math.floor(i / g.w);
      const alongX = (x > 0 && isChannel(state, i - 1)) || (x + 1 < g.w && isChannel(state, i + 1));
      const holder = new Group();
      holder.position.set(x + 0.5, topY(g, i), z + 0.5);
      if (alongX) holder.rotation.y = Math.PI / 2;
      // Local frame: the channel runs along z; the structure spans x.
      const span = 1 - 2 * BANK + 0.12;
      const depth = channelDepth(g, i);
      if (g.gate[i]) {
        holder.add(box(0.08, 0.42 + depth, 0.08, dark, -span / 2 - 0.02, -depth, 0));
        holder.add(box(0.08, 0.42 + depth, 0.08, dark, span / 2 + 0.02, -depth, 0));
        holder.add(box(span + 0.2, 0.06, 0.1, dark, 0, 0.42, 0));
        const board = box(span, depth + 0.06, 0.06, wood, 0, -depth, 0);
        holder.add(board);
        this.boards.set(i, { mesh: board, open: g.gate[i] === GATE_CLOSED ? 0 : 1 });
      }
      if (g.bridge[i]) {
        for (let k = 0; k < 4; k++) holder.add(box(1 - 2 * BANK + 0.5, 0.04, 0.12, bamboo, 0, 0.06 + Math.sin(((k + 0.5) / 4) * Math.PI) * 0.02, -0.21 + k * 0.14));
        holder.add(box(0.04, 0.22, 0.04, bamboo, -0.4, 0.06, -0.28));
        holder.add(box(0.04, 0.22, 0.04, bamboo, 0.4, 0.06, -0.28));
        holder.add(box(0.84, 0.03, 0.03, bamboo, 0, 0.26, -0.28));
      }
      this.group.add(holder);
    }
  }

  update(state: GameState, dt: number) {
    const g = state.grid;
    for (const [i, b] of this.boards) {
      const target = g.gate[i] === GATE_CLOSED ? 0 : 1;
      b.open += (target - b.open) * (1 - Math.exp(-8 * dt));
      const depth = channelDepth(g, i);
      b.mesh.position.y = -depth + (depth + 0.06) / 2 + b.open * (depth + 0.18);
    }
  }
}
