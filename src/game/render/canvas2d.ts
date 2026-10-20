import type { GameState } from '../model/types';
import { canvasToCell, clampCamera, computeView, type Camera, type ViewMetrics } from '../input/coordinateMapping';
import { Renderer } from './renderer';
import type { CameraControl, FxKind, GameRenderer, RenderFrame } from './types';

/**
 * Classic top-down Canvas 2D renderer behind the GameRenderer interface. Used when WebGL
 * is unavailable, or when the player picks "Classic 2D" in Settings.
 */
export class Canvas2DRenderer implements GameRenderer {
  readonly kind = 'canvas2d' as const;
  private r: Renderer;
  private cam: Camera = { zoom: 1, panX: 0, panY: 0 };
  private cssW = 1;
  private cssH = 1;
  private gw = 1;
  private gh = 1;
  private view: ViewMetrics = { ts: 20, ox: 0, oy: 0, cssW: 1, cssH: 1 };

  constructor(canvas: HTMLCanvasElement) {
    this.r = new Renderer(canvas);
  }

  readonly camera: CameraControl = {
    panByScreen: (dx, dy) => {
      this.cam = clampCamera({ ...this.cam, panX: this.cam.panX + dx, panY: this.cam.panY + dy }, this.cssW, this.cssH, this.gw, this.gh);
    },
    zoomAt: (factor, cx, cy) => {
      const before = this.computeView();
      const cam = clampCamera({ ...this.cam, zoom: this.cam.zoom * factor }, this.cssW, this.cssH, this.gw, this.gh);
      const worldX = (cx - before.ox) / before.ts;
      const worldY = (cy - before.oy) / before.ts;
      const after = computeView(this.cssW, this.cssH, this.gw, this.gh, { ...cam, panX: 0, panY: 0 });
      cam.panX = cx - worldX * after.ts - after.ox;
      cam.panY = cy - worldY * after.ts - after.oy;
      this.cam = clampCamera(cam, this.cssW, this.cssH, this.gw, this.gh);
    },
    rotate: () => {},
    twist: () => {},
    reset: () => {
      this.cam = { zoom: 1, panX: 0, panY: 0 };
    },
    focus: () => {
      this.cam = { zoom: 1, panX: 0, panY: 0 };
    },
  };

  private computeView(): ViewMetrics {
    return computeView(this.cssW, this.cssH, this.gw, this.gh, this.cam);
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = cssW;
    this.cssH = cssH;
    this.r.resize(cssW, cssH, dpr);
    this.cam = clampCamera(this.cam, cssW, cssH, this.gw, this.gh);
  }

  render(f: RenderFrame): void {
    this.gw = f.state.grid.w;
    this.gh = f.state.grid.h;
    this.view = this.computeView();
    this.r.draw(f.state, f.prevWater, f.alpha, f.time, this.view, f.ui);
  }

  pick(cssX: number, cssY: number): number {
    const c = canvasToCell(cssX, cssY, this.view, this.gw, this.gh);
    return c.inside ? c.cy * this.gw + c.cx : -1;
  }

  cellToScreen(_state: GameState, x: number, y: number) {
    const v = this.view;
    const sx = v.ox + (x + 0.5) * v.ts;
    const sy = v.oy + (y + 0.5) * v.ts;
    if (sx < -20 || sy < -20 || sx > this.cssW + 20 || sy > this.cssH + 20) return null;
    return { x: sx, y: sy };
  }

  fx(state: GameState, kind: FxKind, cell: number): void {
    if (kind === 'celebrate') this.r.celebrate(state, cell, this.view, false);
    else if (kind === 'dust') this.r.dust(state, cell, this.view);
  }

  structureChanged(state: GameState, newLevel: boolean): void {
    if (newLevel) {
      this.gw = state.grid.w;
      this.gh = state.grid.h;
      this.cam = { zoom: 1, panX: 0, panY: 0 };
      this.r.invalidate();
    }
  }

  dispose(): void {}
}
