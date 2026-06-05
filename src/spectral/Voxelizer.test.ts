import { describe, it, expect } from "vitest";
import { voxelizeLayout, withAnomaly, chooseAnomaly } from "./Voxelizer";
import { generateLayout } from "../world/LayoutGen";

describe("Voxelizer", () => {
  it("rasterises the house into a partly-solid field", () => {
    const field = voxelizeLayout(generateLayout(1, 1), 32);
    let solid = 0;
    for (let i = 0; i < field.data.length; i++) if (field.data[i] > 0.5) solid++;
    expect(solid).toBeGreaterThan(0);
    expect(solid).toBeLessThan(field.data.length); // not entirely filled
  });

  it("the anomaly adds solid voxels", () => {
    const spec = generateLayout(2, 9);
    const field = voxelizeLayout(spec, 32);
    const a = chooseAnomaly(spec, 2, 9);
    const noisy = withAnomaly(field, a);
    let base = 0;
    let with_ = 0;
    for (let i = 0; i < field.data.length; i++) {
      if (field.data[i] > 0.5) base++;
      if (noisy[i] > 0.5) with_++;
    }
    expect(with_).toBeGreaterThanOrEqual(base);
    expect(a.radius).toBeGreaterThan(0);
    expect(a.center.every((c) => Number.isFinite(c))).toBe(true);
  });
});
