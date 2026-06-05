import { describe, it, expect } from "vitest";
import { SpectralVolume } from "./SpectralVolume";

describe("SpectralVolume rooms", () => {
  it("derives a DISTINCT dominant band per room from the FFT (LOW/MID/HIGH)", () => {
    const v = new SpectralVolume(16);
    expect(v.dominantBandFor(0)).toBe(0);
    expect(v.dominantBandFor(1)).toBe(1);
    expect(v.dominantBandFor(2)).toBe(2);
    expect(new Set([0, 1, 2].map((r) => v.dominantBandFor(r))).size).toBe(3);
  });

  it("the dominant band survives its band-pass more than a wrong band", () => {
    const v = new SpectralVolume(16);
    for (let r = 0; r < 3; r++) {
      const dom = v.dominantBandFor(r);
      const wrong = (dom + 1) % 3;
      expect(v.residualEnergy(r, dom)).toBeGreaterThan(v.residualEnergy(r, wrong));
    }
  });
});
