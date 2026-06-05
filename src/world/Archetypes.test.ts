import { describe, it, expect } from "vitest";
import { ARCHETYPES, archetypeForLevel } from "./Archetypes";

describe("Archetypes", () => {
  it("each environment builds a partly-solid field with spawn + anchors", () => {
    for (const a of ARCHETYPES) {
      const f = a.build(1, 7, 32);
      let solid = 0;
      for (let i = 0; i < f.data.length; i++) if (f.data[i] > 0.5) solid++;
      expect(solid).toBeGreaterThan(0);
      expect(solid).toBeLessThan(f.data.length);
      expect(f.anchors.length).toBeGreaterThan(0);
      expect(f.name).toBe(a.name);
      expect(Number.isFinite(f.spawn.x)).toBe(true);
    }
  });

  it("cycles archetypes by level", () => {
    expect(archetypeForLevel(1).name).toBe(ARCHETYPES[0].name);
    expect(archetypeForLevel(ARCHETYPES.length + 1).name).toBe(ARCHETYPES[0].name);
    expect(archetypeForLevel(2).name).toBe(ARCHETYPES[1].name);
  });
});
