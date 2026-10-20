import type { BuildingTypePlaceable, GameState } from '../model/types';

export interface Preview {
  cells: number[];
  ok: boolean;
  reason: string;
  /** Per-cell climb flags for canal strokes (true = uphill). */
  climb?: boolean[];
}

/** UI state the renderer draws on top of the world. Read-only for the renderer. */
export interface RenderUi {
  hoverCell: number;
  preview: Preview | null;
  /** Building type being placed (ghost model), if any. */
  placing: BuildingTypePlaceable | null;
  selectedId: number;
  selectedCell: number;
  keyboardCell: number;
  showHeights: boolean;
  reducedMotion: boolean;
  tutorialPath: { x: number; y: number }[] | null;
  highlightZone: { x: number; y: number; w: number; h: number } | null;
  highlightCells?: { x: number; y: number }[];
  pointer?: { x: number; y: number } | null;
  showGrid?: boolean;
  buildTool?: boolean;
}

export interface RenderFrame {
  state: GameState;
  /** Surface water before the last tick, for interpolation. */
  prevWater: Float64Array | null;
  /** 0..1 progress from the previous tick to the next. */
  alpha: number;
  /** Seconds (monotonic). */
  time: number;
  ui: RenderUi;
}

export type FxKind = 'celebrate' | 'dust' | 'splash';

export interface CameraControl {
  panByScreen(dx: number, dy: number): void;
  /** Zoom by a factor, keeping the point under (cssX, cssY) fixed. */
  zoomAt(factor: number, cssX: number, cssY: number): void;
  /** Rotate the view by quarter turns (3D only; no-op in 2D). */
  rotate(quarterTurns: number): void;
  /** Continuous twist in radians (touch). */
  twist(radians: number): void;
  reset(): void;
  /** Smoothly frame a rectangle of cells. */
  focus(x: number, y: number, w: number, h: number): void;
}

export interface GameRenderer {
  readonly kind: 'webgl' | 'canvas2d';
  readonly camera: CameraControl;
  resize(cssW: number, cssH: number, dpr: number): void;
  render(frame: RenderFrame): void;
  /** Cell under a canvas CSS point, or -1. */
  pick(cssX: number, cssY: number): number;
  /** Canvas CSS position of a cell's top centre, or null when off screen. */
  cellToScreen(state: GameState, x: number, y: number): { x: number; y: number } | null;
  fx(state: GameState, kind: FxKind, cell: number): void;
  /** The map changed shape (canals, buildings, gates) or a new level loaded. */
  structureChanged(state: GameState, newLevel: boolean): void;
  dispose(): void;
}
