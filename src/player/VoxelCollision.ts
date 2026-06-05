/**
 * Pure, unit-testable voxel collision helpers. All take a `solid(x,y,z)` world
 * predicate, so they're independent of Three.js and the field representation.
 * These encode the "never get stuck" guarantees: ground follows the surface,
 * walls block (but small ledges step up), and embedded bodies get pushed out.
 */
export type Solid = (x: number, y: number, z: number) => boolean;

/**
 * Highest solid surface at (x,z) at or below `fromY`, scanning down in `step`
 * increments to `minY`. Returns the top of the first solid voxel found, or
 * `minY` (the floor of last resort) if none.
 */
export function groundHeight(solid: Solid, x: number, z: number, fromY: number, step: number, minY: number): number {
  for (let y = fromY; y > minY; y -= step) {
    if (solid(x, y, z)) return y + step;
  }
  return minY;
}

/**
 * Is the player's body column blocked at (x,z)? Samples a ring of `radius`
 * around the column at three heights, all ABOVE `feetY + stepUp` so that ledges
 * up to `stepUp` are climbable rather than blocking.
 */
export function bodyBlocked(
  solid: Solid,
  x: number,
  z: number,
  feetY: number,
  radius: number,
  stepUp: number,
  bodyTop: number
): boolean {
  const ys = [feetY + stepUp + 0.05, feetY + bodyTop * 0.5, feetY + bodyTop];
  const offs = [
    [0, 0],
    [radius, 0],
    [-radius, 0],
    [0, radius],
    [0, -radius]
  ];
  for (let i = 0; i < ys.length; i++) {
    for (let k = 0; k < offs.length; k++) {
      if (solid(x + offs[k][0], ys[i], z + offs[k][1])) return true;
    }
  }
  return false;
}

/** True if the player's body is embedded in solid at this feet position. */
export function embedded(solid: Solid, x: number, feetY: number, z: number, bodyTop: number): boolean {
  return solid(x, feetY + 0.1, z) || solid(x, feetY + bodyTop * 0.5, z);
}

/**
 * If the body is embedded in solid, lift the feet until the column is clear (up
 * to `maxLift`). Guarantees the player is never stuck inside geometry.
 */
export function unstick(
  solid: Solid,
  x: number,
  feetY: number,
  z: number,
  bodyTop: number,
  step: number,
  maxLift: number
): number {
  let f = feetY;
  for (let lifted = 0; lifted <= maxLift; lifted += step) {
    if (!embedded(solid, x, f, z, bodyTop)) return f;
    f += step;
  }
  return f;
}
