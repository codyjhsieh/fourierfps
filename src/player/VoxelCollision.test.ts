import { describe, it, expect } from "vitest";
import { groundHeight, bodyBlocked, embedded, unstick, type Solid } from "./VoxelCollision";

// A world with a floor (y < 1 everywhere) and a wall slab at x in [2, 2.4].
const world: Solid = (x, y) => y < 1 || (x >= 2 && x <= 2.4);

describe("VoxelCollision", () => {
  it("groundHeight finds the floor top", () => {
    const g = groundHeight(world, 0, 0, 3, 0.1, -2);
    expect(g).toBeGreaterThan(0.9);
    expect(g).toBeLessThan(1.2);
  });

  it("groundHeight returns minY (floor of last resort) over a hole", () => {
    const air: Solid = () => false;
    expect(groundHeight(air, 0, 0, 5, 0.1, 0)).toBe(0);
  });

  it("bodyBlocked: blocked at the wall, clear in the open", () => {
    // standing on the floor (feet at 1), wall is at x≈2.2
    expect(bodyBlocked(world, 1.8, 0, 1, 0.32, 0.5, 1.5)).toBe(true); // ring reaches x≈2.12
    expect(bodyBlocked(world, 0, 0, 1, 0.32, 0.5, 1.5)).toBe(false);
  });

  it("bodyBlocked ignores a small step (climbable ledge)", () => {
    // a low ledge only up to y=1.4; samples start above feet+stepUp so it shouldn't block
    const ledge: Solid = (_x, y) => y < 1.4;
    expect(bodyBlocked(ledge, 0, 0, 1.0, 0.32, 0.5, 1.5)).toBe(false);
  });

  it("unstick lifts an embedded body out of solid", () => {
    expect(embedded(world, 0, 0.2, 0, 1.5)).toBe(true); // feet inside floor
    const f = unstick(world, 0, 0.2, 0, 1.5, 0.1, 4);
    expect(f).toBeGreaterThan(0.2); // lifted upward
    expect(embedded(world, 0, f, 0, 1.5)).toBe(false); // body no longer in solid
  });
});
