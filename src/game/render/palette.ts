export const PALETTE = {
  rain: '#77BFD4',
  deepWater: '#237E90',
  freshGreen: '#5FAB67',
  riceGold: '#D8B65A',
  darkSoil: '#78624E',
  clay: '#BE8060',
  sky: '#DCEEF0',
  night: '#25394D',
  homeGlow: '#FFD38A',
  cleanWater: '#BFE9F5',
  dryOchre: '#CDA66F',
  rock: '#8C8782',
  shapla: '#F2A6C2',
};

/** Parses `#RRGGBB` or `rgb(r,g,b)` (the output of `mix`, so colours can be chained). */
export function hexToRgb(hex: string): [number, number, number] {
  if (hex.startsWith('rgb')) {
    const m = hex.match(/-?\d+(\.\d+)?/g);
    return m ? [Number(m[0]), Number(m[1]), Number(m[2])] : [0, 0, 0];
  }
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  const r = Math.round(r1 + (r2 - r1) * k);
  const g = Math.round(g1 + (g2 - g1) * k);
  const bl = Math.round(b1 + (b2 - b1) * k);
  return `rgb(${r},${g},${bl})`;
}

export function shade(hex: string, amount: number): string {
  return amount >= 0 ? mix(hex, '#FFFFFF', amount) : mix(hex, '#000000', -amount);
}

/** Deterministic per-tile hash in [0,1) for decorative variation (render only). */
export function hash01(i: number, salt = 0): number {
  let x = (i * 374761393 + salt * 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
