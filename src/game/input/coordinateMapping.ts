export interface Camera {
  zoom: number;
  panX: number;
  panY: number;
}

export interface ViewMetrics {
  /** Tile size in CSS pixels. */
  ts: number;
  /** Map origin in CSS pixels relative to the canvas. */
  ox: number;
  oy: number;
  cssW: number;
  cssH: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export function computeView(cssW: number, cssH: number, gridW: number, gridH: number, cam: Camera): ViewMetrics {
  const fit = Math.max(4, Math.min(cssW / gridW, cssH / gridH));
  const ts = fit * cam.zoom;
  const mapW = gridW * ts;
  const mapH = gridH * ts;
  let ox = (cssW - mapW) / 2 + cam.panX;
  let oy = (cssH - mapH) / 2 + cam.panY;
  // Keep the map from being dragged fully out of view.
  if (mapW > cssW) ox = Math.min(0, Math.max(cssW - mapW, ox));
  else ox = (cssW - mapW) / 2;
  if (mapH > cssH) oy = Math.min(0, Math.max(cssH - mapH, oy));
  else oy = (cssH - mapH) / 2;
  return { ts, ox, oy, cssW, cssH };
}

/** Client (viewport) coordinates -> canvas CSS coordinates using the real bounding rect. */
export function clientToCanvas(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, cssW: number, cssH: number): { x: number; y: number } {
  const sx = rect.width > 0 ? cssW / rect.width : 1;
  const sy = rect.height > 0 ? cssH / rect.height : 1;
  return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
}

export function canvasToCell(x: number, y: number, v: ViewMetrics, gridW: number, gridH: number): { cx: number; cy: number; inside: boolean } {
  const cx = Math.floor((x - v.ox) / v.ts);
  const cy = Math.floor((y - v.oy) / v.ts);
  return { cx, cy, inside: cx >= 0 && cy >= 0 && cx < gridW && cy < gridH };
}

/** Clamp the camera so that panning keeps the map on screen. */
export function clampCamera(cam: Camera, cssW: number, cssH: number, gridW: number, gridH: number): Camera {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cam.zoom));
  const fit = Math.max(4, Math.min(cssW / gridW, cssH / gridH));
  const mapW = gridW * fit * zoom;
  const mapH = gridH * fit * zoom;
  const maxX = Math.max(0, (mapW - cssW) / 2);
  const maxY = Math.max(0, (mapH - cssH) / 2);
  return {
    zoom,
    panX: Math.max(-maxX, Math.min(maxX, cam.panX)),
    panY: Math.max(-maxY, Math.min(maxY, cam.panY)),
  };
}
