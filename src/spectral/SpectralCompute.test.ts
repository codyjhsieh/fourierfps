import { describe, it, expect } from "vitest";
import { computeSpectralWorld, decoyCountForLevel, bandCountForLevel } from "./SpectralCompute";

describe("computeSpectralWorld", () => {
  it("builds a band stack, anomaly band, clean surface, spawn and a name", () => {
    const r = computeSpectralWorld(1, 1, 16, 6);
    expect(r.bands.length).toBe(6);
    expect(r.anomalyBand).toBeGreaterThanOrEqual(1);
    expect(r.anomalyBand).toBeLessThan(6);
    expect(r.bands[5].positions.length).toBeGreaterThan(0);
    expect(r.bands[5].indices.length % 3).toBe(0);
    expect(r.clean.positions.length).toBeGreaterThan(0);
    expect(r.name.length).toBeGreaterThan(0);
    expect(typeof r.spawn.x).toBe("number");
  });

  it("is deterministic for a given (level, seed)", () => {
    const a = computeSpectralWorld(3, 42, 16, 6);
    const b = computeSpectralWorld(3, 42, 16, 6);
    expect(a.anomaly.center).toEqual(b.anomaly.center);
    expect(a.name).toBe(b.name);
    expect(a.bands[2].positions.length).toBe(b.bands[2].positions.length);
  });

  it("scales difficulty and cycles through distinct environments", () => {
    expect(bandCountForLevel(1)).toBe(6);
    expect(bandCountForLevel(5)).toBeGreaterThan(bandCountForLevel(1));
    expect(decoyCountForLevel(1)).toBe(0);
    expect(decoyCountForLevel(4)).toBe(3);
    expect(computeSpectralWorld(4, 2, 16, 6).decoys.length).toBe(3);

    const names = [1, 2, 3, 4, 5].map((l) => computeSpectralWorld(l, 2, 16, 6).name);
    expect(new Set(names).size).toBe(5); // five distinct archetypes
  });
});
