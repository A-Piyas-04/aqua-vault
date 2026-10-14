/**
 * 4-connected line rasterization between two grid cells (inclusive). Each step moves
 * along one axis only, so consecutive cells always share an edge: a fast diagonal
 * drag still yields a continuous N/S/E/W canal.
 */
export function lineCells(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = [[x0, y0]];
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let x = x0;
  let y = y0;
  let ix = 0;
  let iy = 0;
  while (ix < dx || iy < dy) {
    // Step along whichever axis's next boundary is crossed first.
    if (iy >= dy || (ix < dx && (0.5 + ix) * dy < (0.5 + iy) * dx)) {
      x += sx;
      ix++;
    } else {
      y += sy;
      iy++;
    }
    out.push([x, y]);
  }
  return out;
}
