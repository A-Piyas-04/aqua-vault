import { describe, expect, it } from 'vitest';
import { GestureMachine, type GestureAction } from '../input/gestures';
import { pickHeightfield } from '../input/pick';

const canal = { tool: 'stroke' as const, strokeMode: 'canal' as const };
const tap = { tool: 'tap' as const, strokeMode: 'canal' as const };
const types = (a: GestureAction[]) => a.map((x) => x.type);

describe('gesture machine', () => {
  it('a quick tap with the canal tool digs nothing until it moves or is held', () => {
    const g = new GestureMachine();
    expect(g.pointerDown({ id: 1, x: 10, y: 10, t: 0, touch: true }, canal)).toEqual([]);
    // Released quickly: a tap, never a stroke.
    expect(types(g.pointerUp({ id: 1, x: 10, y: 10, t: 40 }))).toEqual(['tap']);
  });

  it('a second finger cancels a pending stroke so a pinch never digs a stray tile', () => {
    const g = new GestureMachine();
    g.pointerDown({ id: 1, x: 10, y: 10, t: 0, touch: true }, canal);
    const second = g.pointerDown({ id: 2, x: 60, y: 10, t: 30, touch: true }, canal);
    expect(types(second)).not.toContain('strokeStart');
    const moved = g.pointerMove({ id: 2, x: 120, y: 10, t: 60 });
    expect(moved[0]).toMatchObject({ type: 'pinch' });
    expect((moved[0] as Extract<GestureAction, { type: 'pinch' }>).scale).toBeGreaterThan(1);
    expect(g.pointerUp({ id: 2, x: 120, y: 10, t: 90 })).toEqual([]);
    expect(g.pointerUp({ id: 1, x: 10, y: 10, t: 95 })).toEqual([]);
  });

  it('moving past the slop starts a stroke at the original point, then follows', () => {
    const g = new GestureMachine();
    g.pointerDown({ id: 1, x: 10, y: 10, t: 0 }, canal);
    const a = g.pointerMove({ id: 1, x: 30, y: 10, t: 20 });
    expect(types(a)).toEqual(['strokeStart', 'strokeTo']);
    expect(types(g.pointerMove({ id: 1, x: 50, y: 10, t: 30 }))).toEqual(['strokeTo']);
    expect(g.pointerUp({ id: 1, x: 50, y: 10, t: 40 })).toEqual([{ type: 'strokeEnd', moved: true }]);
  });

  it('holding a mouse button starts a stroke even without moving', () => {
    const g = new GestureMachine();
    g.pointerDown({ id: 1, x: 10, y: 10, t: 0 }, canal);
    expect(types(g.tick(200))).toEqual(['strokeStart']);
  });

  it('building tools: a short press taps, a drag pans, a long touch inspects', () => {
    const g = new GestureMachine();
    g.pointerDown({ id: 1, x: 10, y: 10, t: 0 }, tap);
    expect(types(g.pointerUp({ id: 1, x: 11, y: 10, t: 50 }))).toEqual(['tap']);
    g.pointerDown({ id: 1, x: 10, y: 10, t: 0 }, tap);
    expect(types(g.pointerMove({ id: 1, x: 40, y: 10, t: 20 }))).toEqual(['pan']);
    expect(g.pointerUp({ id: 1, x: 40, y: 10, t: 30 })).toEqual([]);
    g.pointerDown({ id: 1, x: 10, y: 10, t: 0, touch: true }, tap);
    expect(types(g.tick(600))).toEqual(['longPress']);
  });

  it('the right mouse button erases', () => {
    const g = new GestureMachine();
    g.pointerDown({ id: 1, x: 5, y: 5, t: 0, button: 2 }, tap);
    expect(g.pointerUp({ id: 1, x: 5, y: 5, t: 20 })).toEqual([{ type: 'tap', x: 5, y: 5, erase: true }]);
  });
});

describe('heightfield picking', () => {
  // 4 columns along x, one row. A tall block at x=1 hides the low tile behind it.
  const tops = [0.4, 1.6, 0.4, 0.4];
  const top = (i: number) => tops[i];

  it('hits the tile whose top the ray lands on', () => {
    // Straight down onto column 2.
    expect(pickHeightfield({ x: 2.5, y: 5, z: 0.5 }, { x: 0, y: -1, z: 0 }, 4, 1, top, -1, 2)).toBe(2);
  });

  it('a raised block occludes the lower tile behind it', () => {
    // Camera at -x looking +x and down: the ray crosses the tall block's side before reaching x=2.
    const o = { x: -3, y: 3.2, z: 0.5 };
    const d = { x: 1, y: -0.45, z: 0 };
    const len = Math.hypot(d.x, d.y);
    const hit = pickHeightfield(o, { x: d.x / len, y: d.y / len, z: 0 }, 4, 1, top, -1, 2);
    expect(hit).toBe(1);
  });

  it('misses outside the map and for rays pointing up', () => {
    expect(pickHeightfield({ x: 9, y: 5, z: 0.5 }, { x: 0, y: -1, z: 0 }, 4, 1, top, -1, 2)).toBe(-1);
    expect(pickHeightfield({ x: 1.5, y: 5, z: 0.5 }, { x: 0, y: 1, z: 0 }, 4, 1, top, -1, 2)).toBe(-1);
  });
});
