import { describe, it, expect } from "vitest";
import { generateLayout, roomCount } from "./LayoutGen";

function overlaps(a: { x0: number; z0: number; x1: number; z1: number }, b: typeof a): boolean {
  const eps = 0.01;
  return a.x0 + eps < b.x1 - eps && a.x1 - eps > b.x0 + eps && a.z0 + eps < b.z1 - eps && a.z1 - eps > b.z0 + eps;
}

describe("LayoutGen", () => {
  it("is deterministic and varies by seed/level", () => {
    expect(generateLayout(3, 5)).toEqual(generateLayout(3, 5));
    expect(generateLayout(3, 5)).not.toEqual(generateLayout(3, 6));
  });

  it("room count grows with depth then caps", () => {
    expect(roomCount(1)).toBe(3);
    expect(roomCount(8)).toBe(9);
    expect(roomCount(50)).toBe(9);
  });

  it("rooms never overlap and walls exist", () => {
    for (let lvl = 1; lvl <= 8; lvl++) {
      const spec = generateLayout(lvl, 123);
      for (let i = 0; i < spec.floors.length; i++)
        for (let j = i + 1; j < spec.floors.length; j++)
          expect(overlaps(spec.floors[i], spec.floors[j])).toBe(false);
      expect(spec.walls.length).toBeGreaterThan(0);
    }
  });

  it("every room is reachable (doorways connect the whole layout)", () => {
    const spec = generateLayout(6, 77);
    const n = spec.rooms.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    for (const d of spec.doorways) parent[find(d.a)] = find(d.b);
    const root = find(0);
    for (let i = 0; i < n; i++) expect(find(i)).toBe(root);
  });
});
