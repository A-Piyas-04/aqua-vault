/**
 * Pure pointer-gesture state machine. The controller feeds it pointer events and turns
 * the returned actions into commands and camera moves. Pure so it can be unit-tested.
 *
 *  - Stroke tools (canal, erase, or the right mouse button) start a stroke only after the
 *    pointer moves a little or is held briefly, so a quick two-finger pinch never digs.
 *  - Other tools: a short press is a tap; dragging pans the view.
 *  - Two pointers pinch-zoom, pan and twist. A pending stroke is cancelled.
 *  - A long touch press with a tap tool inspects instead.
 */

export type ToolKind = 'stroke' | 'tap';

export interface PointerIn {
  id: number;
  x: number;
  y: number;
  t: number;
  /** 0 primary, 1 middle, 2 right. */
  button?: number;
  touch?: boolean;
}

export type GestureAction =
  | { type: 'strokeStart'; mode: 'canal' | 'erase'; x: number; y: number }
  | { type: 'strokeTo'; x: number; y: number }
  | { type: 'strokeEnd'; moved: boolean }
  | { type: 'tap'; x: number; y: number; erase: boolean }
  | { type: 'longPress'; x: number; y: number }
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'pinch'; scale: number; cx: number; cy: number; dx: number; dy: number; twist: number }
  | { type: 'hover'; x: number; y: number };

type Pt = { x: number; y: number };

export type GestureState =
  | { kind: 'idle' }
  | { kind: 'pending'; id: number; start: Pt; last: Pt; t0: number; mode: 'canal' | 'erase' | null; touch: boolean }
  | { kind: 'stroke'; id: number; mode: 'canal' | 'erase'; moved: boolean }
  | { kind: 'pan'; id: number; last: Pt }
  | { kind: 'pinch'; a: number; b: number; pts: Map<number, Pt>; d: number; mid: Pt; angle: number }
  | { kind: 'ended'; ids: Set<number> };

export const STROKE_SLOP_PX = 6;
export const STROKE_HOLD_MS = 120;
export const PAN_SLOP_PX = 8;
export const LONG_PRESS_MS = 500;

export interface GestureConfig {
  tool: ToolKind;
  /** Mode used by the stroke tool (canal or erase). */
  strokeMode: 'canal' | 'erase';
}

export class GestureMachine {
  state: GestureState = { kind: 'idle' };
  /** Every pointer currently down, for pinch detection. */
  private down = new Map<number, Pt>();

  get pointerCount(): number {
    return this.down.size;
  }

  pointerDown(p: PointerIn, cfg: GestureConfig): GestureAction[] {
    this.down.set(p.id, { x: p.x, y: p.y });
    const out: GestureAction[] = [];
    if (this.down.size >= 2) {
      if (this.state.kind === 'stroke') out.push({ type: 'strokeEnd', moved: this.state.moved });
      const [a, b] = [...this.down.keys()].slice(0, 2);
      const pa = this.down.get(a)!;
      const pb = this.down.get(b)!;
      this.state = {
        kind: 'pinch',
        a,
        b,
        pts: new Map([
          [a, { ...pa }],
          [b, { ...pb }],
        ]),
        d: Math.max(1, Math.hypot(pa.x - pb.x, pa.y - pb.y)),
        mid: { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 },
        angle: Math.atan2(pb.y - pa.y, pb.x - pa.x),
      };
      return out;
    }
    if (p.button === 1) {
      this.state = { kind: 'pan', id: p.id, last: { x: p.x, y: p.y } };
      return out;
    }
    const right = p.button === 2;
    const mode = right ? 'erase' : cfg.tool === 'stroke' ? cfg.strokeMode : null;
    this.state = { kind: 'pending', id: p.id, start: { x: p.x, y: p.y }, last: { x: p.x, y: p.y }, t0: p.t, mode, touch: !!p.touch };
    return out;
  }

  pointerMove(p: PointerIn): GestureAction[] {
    if (this.down.has(p.id)) this.down.set(p.id, { x: p.x, y: p.y });
    const st = this.state;
    switch (st.kind) {
      case 'idle':
      case 'ended':
        return this.down.size === 0 ? [{ type: 'hover', x: p.x, y: p.y }] : [];
      case 'pending': {
        if (p.id !== st.id) return [];
        st.last = { x: p.x, y: p.y };
        const dist = Math.hypot(p.x - st.start.x, p.y - st.start.y);
        if (st.mode) {
          if (dist > STROKE_SLOP_PX || p.t - st.t0 >= STROKE_HOLD_MS) return this.beginStroke(st, p);
          return [{ type: 'hover', x: p.x, y: p.y }];
        }
        if (dist > PAN_SLOP_PX) {
          this.state = { kind: 'pan', id: st.id, last: { x: p.x, y: p.y } };
          return [{ type: 'pan', dx: p.x - st.start.x, dy: p.y - st.start.y }];
        }
        return [];
      }
      case 'stroke':
        if (p.id !== st.id) return [];
        st.moved = true;
        return [{ type: 'strokeTo', x: p.x, y: p.y }];
      case 'pan': {
        if (p.id !== st.id) return [];
        const dx = p.x - st.last.x;
        const dy = p.y - st.last.y;
        st.last = { x: p.x, y: p.y };
        return dx || dy ? [{ type: 'pan', dx, dy }] : [];
      }
      case 'pinch': {
        if (!st.pts.has(p.id)) return [];
        st.pts.set(p.id, { x: p.x, y: p.y });
        const pa = st.pts.get(st.a)!;
        const pb = st.pts.get(st.b)!;
        const d = Math.max(1, Math.hypot(pa.x - pb.x, pa.y - pb.y));
        const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
        const angle = Math.atan2(pb.y - pa.y, pb.x - pa.x);
        let twist = angle - st.angle;
        if (twist > Math.PI) twist -= 2 * Math.PI;
        if (twist < -Math.PI) twist += 2 * Math.PI;
        const action: GestureAction = { type: 'pinch', scale: d / st.d, cx: mid.x, cy: mid.y, dx: mid.x - st.mid.x, dy: mid.y - st.mid.y, twist };
        st.d = d;
        st.mid = mid;
        st.angle = angle;
        return [action];
      }
    }
  }

  /** Time-based transitions (hold-to-stroke, long press). Call every frame while down. */
  tick(t: number): GestureAction[] {
    const st = this.state;
    if (st.kind !== 'pending') return [];
    if (st.mode && t - st.t0 >= STROKE_HOLD_MS && !st.touch) return this.beginStroke(st, { id: st.id, x: st.last.x, y: st.last.y, t });
    if (st.mode && st.touch && t - st.t0 >= STROKE_HOLD_MS * 1.5) return this.beginStroke(st, { id: st.id, x: st.last.x, y: st.last.y, t });
    if (!st.mode && st.touch && t - st.t0 >= LONG_PRESS_MS) {
      this.state = { kind: 'ended', ids: new Set([st.id]) };
      return [{ type: 'longPress', x: st.start.x, y: st.start.y }];
    }
    return [];
  }

  pointerUp(p: PointerIn): GestureAction[] {
    this.down.delete(p.id);
    const st = this.state;
    const out: GestureAction[] = [];
    switch (st.kind) {
      case 'pending':
        if (p.id === st.id) {
          out.push({ type: 'tap', x: st.start.x, y: st.start.y, erase: st.mode === 'erase' });
          this.state = { kind: 'idle' };
        }
        break;
      case 'stroke':
        if (p.id === st.id) {
          out.push({ type: 'strokeEnd', moved: st.moved });
          this.state = { kind: 'idle' };
        }
        break;
      case 'pan':
        if (p.id === st.id) this.state = { kind: 'idle' };
        break;
      case 'pinch':
        // Lifting one finger ends the pinch; the remaining finger does nothing until lifted.
        this.state = this.down.size ? { kind: 'ended', ids: new Set(this.down.keys()) } : { kind: 'idle' };
        break;
      case 'ended':
        if (this.down.size === 0) this.state = { kind: 'idle' };
        break;
      default:
        break;
    }
    return out;
  }

  cancel(id: number): GestureAction[] {
    this.down.delete(id);
    const out: GestureAction[] = [];
    if (this.state.kind === 'stroke') out.push({ type: 'strokeEnd', moved: this.state.moved });
    this.state = this.down.size ? { kind: 'ended', ids: new Set(this.down.keys()) } : { kind: 'idle' };
    return out;
  }

  private beginStroke(st: Extract<GestureState, { kind: 'pending' }>, p: PointerIn): GestureAction[] {
    const mode = st.mode ?? 'canal';
    this.state = { kind: 'stroke', id: st.id, mode, moved: false };
    const out: GestureAction[] = [{ type: 'strokeStart', mode, x: st.start.x, y: st.start.y }];
    if (p.x !== st.start.x || p.y !== st.start.y) {
      (this.state as { moved: boolean }).moved = true;
      out.push({ type: 'strokeTo', x: p.x, y: p.y });
    }
    return out;
  }
}
