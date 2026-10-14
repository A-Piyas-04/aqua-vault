/** Mulberry32 step over an explicit, serializable 32-bit state. */
export function nextRandom(state: number): { value: number; state: number } {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: s };
}

export function seedToState(seed: number): number {
  return (seed ^ 0x9e3779b9) >>> 0;
}
