import { describe, it, expect } from "vitest";
import {
  fft1d,
  fft3d,
  bandWeight,
  bandEnergy,
  idx3,
  radialFrequency
} from "./Fourier3D";

function maxAbsDiff(a: Float32Array, b: Float32Array): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}

describe("fft1d", () => {
  it("transforms a pure cosine into a single frequency bin", () => {
    const n = 8;
    const data = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) data[i * 2] = Math.cos((2 * Math.PI * 2 * i) / n); // freq 2
    fft1d(data, false);
    const mag = (k: number) => Math.hypot(data[k * 2], data[k * 2 + 1]);
    // energy concentrated at bins 2 and n-2
    expect(mag(2)).toBeGreaterThan(3);
    expect(mag(6)).toBeGreaterThan(3);
    expect(mag(1)).toBeLessThan(1e-3);
    expect(mag(3)).toBeLessThan(1e-3);
  });

  it("inverse(forward(x)) == x", () => {
    const n = 16;
    const orig = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      orig[i * 2] = Math.sin(i * 1.3) + 0.5 * Math.cos(i * 0.7);
      orig[i * 2 + 1] = 0;
    }
    const data = orig.slice();
    fft1d(data, false);
    fft1d(data, true);
    expect(maxAbsDiff(data, orig)).toBeLessThan(1e-5);
  });

  it("throws on non-power-of-two", () => {
    expect(() => fft1d(new Float32Array(6))).toThrow();
  });
});

describe("fft3d", () => {
  it("inverse(forward(x)) == x at 16³", () => {
    const n = 16;
    const len = n * n * n * 2;
    const orig = new Float32Array(len);
    for (let z = 0; z < n; z++)
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          orig[idx3(x, y, z, n)] = Math.sin((x + y * 2 + z * 3) * 0.4);
        }
    const data = orig.slice();
    fft3d(data, n, false);
    fft3d(data, n, true);
    expect(maxAbsDiff(data, orig)).toBeLessThan(1e-3);
  });

  it("a low-frequency 3D signal lands in the low band", () => {
    const n = 16;
    const data = new Float32Array(n * n * n * 2);
    for (let z = 0; z < n; z++)
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          data[idx3(x, y, z, n)] = Math.sin((2 * Math.PI * 1 * x) / n);
        }
    fft3d(data, n, false);
    const low = bandEnergy(data, n, 0.0, 0.25);
    const high = bandEnergy(data, n, 0.6, 1.2);
    expect(low).toBeGreaterThan(high);
  });
});

describe("bandWeight", () => {
  it("passes inside the band and rejects outside", () => {
    expect(bandWeight(0.4, 0.2, 0.6)).toBeGreaterThan(0.9);
    expect(bandWeight(0.0, 0.2, 0.6)).toBeLessThan(0.1);
    expect(bandWeight(0.9, 0.2, 0.6)).toBeLessThan(0.1);
  });
});

describe("radialFrequency", () => {
  it("DC is 0 and corner is high", () => {
    const n = 16;
    expect(radialFrequency(0, 0, 0, n)).toBe(0);
    expect(radialFrequency(8, 8, 8, n)).toBeGreaterThan(1);
  });
});
