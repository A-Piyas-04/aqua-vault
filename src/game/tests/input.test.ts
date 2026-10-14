import { describe, expect, it } from 'vitest';
import { lineCells } from '../input/bresenham';
import { canvasToCell, clientToCanvas, computeView } from '../input/coordinateMapping';
import { mix, shade, noise2, fbm2 } from '../render/palette';

describe('palette', () => {
  it('chains mix/shade without collapsing to black', () => {
    const c = shade(mix('#CDA66F', '#8DB86B', 0.5), 0.1);
    expect(c).not.toContain('NaN');
    expect(c).not.toBe('rgb(0,0,0)');
  });

  it('noise is deterministic and smooth in [0,1]', () => {
    expect(noise2(1.5, 2.25, 3)).toBe(noise2(1.5, 2.25, 3));
    const a = fbm2(4, 5, 1);
    const b = fbm2(4.05, 5, 1);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(Math.abs(a - b)).toBeLessThan(0.2);
  });
});

describe('pointer interpolation', () => {
  it('fills every intervening cell on a fast drag, 4-connected', () => {
    const cells = lineCells(0, 0, 9, 4);
    expect(cells[0]).toEqual([0, 0]);
    expect(cells[cells.length - 1]).toEqual([9, 4]);
    // Manhattan path length: dx + dy + 1 cells.
    expect(cells.length).toBe(9 + 4 + 1);
    for (let k = 1; k < cells.length; k++) {
      const [ax, ay] = cells[k - 1];
      const [bx, by] = cells[k];
      expect(Math.abs(ax - bx) + Math.abs(ay - by)).toBe(1);
    }
  });

  it('handles reverse and vertical lines', () => {
    expect(lineCells(5, 5, 5, 1).length).toBe(5);
    const back = lineCells(6, 3, 1, 0);
    expect(back[back.length - 1]).toEqual([1, 0]);
    expect(back.length).toBe(5 + 3 + 1);
  });

  it('single point', () => {
    expect(lineCells(2, 2, 2, 2)).toEqual([[2, 2]]);
  });
});

describe('coordinate mapping', () => {
  it('maps client coordinates through CSS scaling to cells', () => {
    const view = computeView(560, 360, 28, 18, { zoom: 1, panX: 0, panY: 0 });
    expect(view.ts).toBe(20);
    // Canvas displayed at half size (e.g. CSS transform); rect is 280x180.
    const p = clientToCanvas(100 + 140, 50 + 90, { left: 100, top: 50, width: 280, height: 180 }, 560, 360);
    expect(p).toEqual({ x: 280, y: 180 });
    const c = canvasToCell(p.x, p.y, view, 28, 18);
    expect(c).toEqual({ cx: 14, cy: 9, inside: true });
  });

  it('letterboxes and reports outside clicks', () => {
    const view = computeView(400, 400, 28, 18, { zoom: 1, panX: 0, panY: 0 });
    expect(view.oy).toBeGreaterThan(0);
    expect(canvasToCell(5, 2, view, 28, 18).inside).toBe(false);
  });
});
