import { describe, it, expect } from "vitest";
import { surfaceNets } from "./SurfaceNets";

function sphereField(n: number, r: number): Float32Array {
  const f = new Float32Array(n * n * n);
  const c = (n - 1) / 2;
  for (let z = 0; z < n; z++)
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const d = Math.hypot(x - c, y - c, z - c);
        f[x + y * n + z * n * n] = d <= r ? 1 : 0;
      }
  return f;
}

describe("surfaceNets", () => {
  it("extracts a closed surface from a sphere field", () => {
    const { positions, indices } = surfaceNets(sphereField(16, 5), 16, 0.5);
    expect(positions.length).toBeGreaterThan(0);
    expect(indices.length).toBeGreaterThan(0);
    expect(indices.length % 3).toBe(0);
  });

  it("produces nothing for an empty field", () => {
    const { positions, indices } = surfaceNets(new Float32Array(16 * 16 * 16), 16, 0.5);
    expect(positions.length).toBe(0);
    expect(indices.length).toBe(0);
  });

  it("a bigger sphere yields more surface than a tiny one", () => {
    const small = surfaceNets(sphereField(24, 3), 24, 0.5);
    const big = surfaceNets(sphereField(24, 9), 24, 0.5);
    expect(big.positions.length).toBeGreaterThan(small.positions.length);
  });
});
