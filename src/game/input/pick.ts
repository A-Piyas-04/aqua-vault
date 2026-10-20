/**
 * Pure ray vs. tile-heightfield picking for the 3D view. World axes: x = grid column,
 * z = grid row, y = up. Tile (cx, cz) covers [cx, cx+1] x [cz, cz+1] with its top at
 * `top(i)`. A ray that enters a tile's column at or below its top hits that tile (its top
 * or one of its side walls), so a raised block correctly hides the tiles behind it.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function pickHeightfield(
  o: Vec3,
  d: Vec3,
  w: number,
  h: number,
  top: (i: number) => number,
  yMin: number,
  yMax: number,
): number {
  if (d.y >= -1e-9) return -1;
  // March only through the vertical slab that can contain tile tops.
  let t = Math.max(0, (yMax + 1e-6 - o.y) / d.y);
  const tEnd = (yMin - 1e-6 - o.y) / d.y;
  if (tEnd <= t) return -1;

  let px = o.x + d.x * t;
  let pz = o.z + d.z * t;
  let cx = Math.floor(px);
  let cz = Math.floor(pz);
  const stepX = d.x > 0 ? 1 : -1;
  const stepZ = d.z > 0 ? 1 : -1;
  const tDeltaX = Math.abs(d.x) > 1e-12 ? Math.abs(1 / d.x) : Infinity;
  const tDeltaZ = Math.abs(d.z) > 1e-12 ? Math.abs(1 / d.z) : Infinity;
  let tMaxX = Math.abs(d.x) > 1e-12 ? t + ((d.x > 0 ? cx + 1 - px : px - cx) / Math.abs(d.x)) : Infinity;
  let tMaxZ = Math.abs(d.z) > 1e-12 ? t + ((d.z > 0 ? cz + 1 - pz : pz - cz) / Math.abs(d.z)) : Infinity;

  for (let guard = 0; guard < 4 * (w + h) + 8; guard++) {
    const tExit = Math.min(tMaxX, tMaxZ, tEnd);
    if (cx >= 0 && cz >= 0 && cx < w && cz < h) {
      const i = cz * w + cx;
      const yExit = o.y + d.y * tExit;
      if (yExit <= top(i) + 1e-9) return i;
    }
    if (tExit >= tEnd) break;
    if (tMaxX < tMaxZ) {
      cx += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
    } else {
      cz += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
    }
    px = o.x + d.x * t;
    pz = o.z + d.z * t;
  }
  return -1;
}

/** Where a ray meets the horizontal plane y = planeY (or null if parallel / behind). */
export function rayPlaneY(o: Vec3, d: Vec3, planeY: number): { x: number; z: number } | null {
  if (Math.abs(d.y) < 1e-9) return null;
  const t = (planeY - o.y) / d.y;
  if (t < 0) return null;
  return { x: o.x + d.x * t, z: o.z + d.z * t };
}
