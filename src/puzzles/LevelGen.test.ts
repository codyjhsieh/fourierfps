import { describe, it, expect } from "vitest";
import { generateLevel, difficulty, solutionPhases, mulberry32 } from "./LevelGen";

describe("LevelGen", () => {
  it("is deterministic for the same (level, seed)", () => {
    const a = generateLevel(4, 12345);
    const b = generateLevel(4, 12345);
    expect(a).toEqual(b);
  });

  it("differs across seeds and levels", () => {
    expect(generateLevel(4, 1)).not.toEqual(generateLevel(4, 2));
    expect(generateLevel(3, 7)).not.toEqual(generateLevel(4, 7));
  });

  it("escalates difficulty with depth", () => {
    const d1 = difficulty(1);
    const d9 = difficulty(9);
    expect(d1.realCount).toBe(2);
    expect(d1.decoyCount).toBe(0);
    expect(d1.depCount).toBe(0);
    expect(d9.realCount).toBeGreaterThan(d1.realCount);
    expect(d9.decoyCount).toBeGreaterThan(d1.decoyCount);
    expect(d9.tolerance).toBeLessThan(d1.tolerance);
  });

  it("dependencies form a DAG (parent id always lower, and real)", () => {
    for (let lvl = 1; lvl <= 12; lvl++) {
      const spec = generateLevel(lvl, 99);
      const realSet = new Set(spec.realIds);
      for (const n of spec.nodes) {
        if (n.parent >= 0) {
          expect(n.parent).toBeLessThan(n.id);
          expect(realSet.has(n.parent)).toBe(true);
          expect(n.decoy).toBe(false); // only real nodes carry dependencies
        }
      }
    }
  });

  it("solutionPhases covers every real node within [0,1)", () => {
    const spec = generateLevel(8, 4);
    const sol = solutionPhases(spec);
    expect(sol.size).toBe(spec.realIds.length);
    for (const p of sol.values()) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
  });

  it("mulberry32 is stable and in range", () => {
    const r = mulberry32(42);
    const v = [r(), r(), r()];
    expect(v.every((x) => x >= 0 && x < 1)).toBe(true);
    const r2 = mulberry32(42);
    expect([r2(), r2(), r2()]).toEqual(v);
  });
});
