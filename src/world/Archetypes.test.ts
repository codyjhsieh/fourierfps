import { describe, it, expect } from "vitest";
import { ARCHETYPES, archetypeForLevel } from "./Archetypes";

describe("Archetypes", () => {
  it("each environment builds a partly-solid field with spawn + anchors", () => {
    for (const a of ARCHETYPES) {
      const plan = a.build(1, 7, 32);
      const sf = plan.structuralField;
      let solid = 0;
      for (let i = 0; i < sf.data.length; i++) if (sf.data[i] > 0.5) solid++;
      expect(solid).toBeGreaterThan(0);
      expect(solid).toBeLessThan(sf.data.length);
      expect(plan.anchors.length).toBeGreaterThan(0);
      expect(sf.name).toBe(a.name);
      expect(Number.isFinite(sf.spawn.x)).toBe(true);
      expect(plan.objects.length).toBeGreaterThan(0); // populated, not a bare shell
    }
  });

  it("cycles archetypes by level", () => {
    expect(archetypeForLevel(1).name).toBe(ARCHETYPES[0].name);
    expect(archetypeForLevel(ARCHETYPES.length + 1).name).toBe(ARCHETYPES[0].name);
    expect(archetypeForLevel(2).name).toBe(ARCHETYPES[1].name);
  });
});
