/**
 * Real Fourier transforms, constrained to small local volumes.
 *
 * Complex data is stored interleaved: [re0, im0, re1, im1, ...].
 * The 3D transform is implemented as separable 1D radix-2 passes.
 * Sizes must be powers of two.
 */

function isPow2(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/** In-place 1D radix-2 Cooley–Tukey FFT on interleaved complex data. */
export function fft1d(data: Float32Array, inverse = false): void {
  const n = data.length / 2;
  if (!isPow2(n)) throw new Error(`fft1d: length/2 must be power of two, got ${n}`);

  // bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const ai = i * 2;
      const aj = j * 2;
      const r = data[ai];
      const im = data[ai + 1];
      data[ai] = data[aj];
      data[ai + 1] = data[aj + 1];
      data[aj] = r;
      data[aj + 1] = im;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wReStep = Math.cos(ang);
    const wImStep = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < half; k++) {
        const a = (i + k) * 2;
        const b = (i + k + half) * 2;
        const aRe = data[a];
        const aIm = data[a + 1];
        const bRe = data[b];
        const bIm = data[b + 1];
        const tRe = wRe * bRe - wIm * bIm;
        const tIm = wRe * bIm + wIm * bRe;
        data[a] = aRe + tRe;
        data[a + 1] = aIm + tIm;
        data[b] = aRe - tRe;
        data[b + 1] = aIm - tIm;
        const nWRe = wRe * wReStep - wIm * wImStep;
        wIm = wRe * wImStep + wIm * wReStep;
        wRe = nWRe;
      }
    }
  }

  if (inverse) {
    const inv = 1 / n;
    for (let i = 0; i < data.length; i++) data[i] *= inv;
  }
}

export function idx3(x: number, y: number, z: number, n: number): number {
  return (z * n * n + y * n + x) * 2;
}

/** In-place separable 3D FFT (size³ interleaved complex). */
export function fft3d(data: Float32Array, size: number, inverse = false): void {
  if (!isPow2(size)) throw new Error(`fft3d: size must be power of two, got ${size}`);
  if (data.length !== size * size * size * 2) {
    throw new Error("fft3d: data length mismatch");
  }
  const line = new Float32Array(size * 2);

  // along X
  for (let z = 0; z < size; z++)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const s = idx3(x, y, z, size);
        line[x * 2] = data[s];
        line[x * 2 + 1] = data[s + 1];
      }
      fft1d(line, inverse);
      for (let x = 0; x < size; x++) {
        const s = idx3(x, y, z, size);
        data[s] = line[x * 2];
        data[s + 1] = line[x * 2 + 1];
      }
    }

  // along Y
  for (let z = 0; z < size; z++)
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        const s = idx3(x, y, z, size);
        line[y * 2] = data[s];
        line[y * 2 + 1] = data[s + 1];
      }
      fft1d(line, inverse);
      for (let y = 0; y < size; y++) {
        const s = idx3(x, y, z, size);
        data[s] = line[y * 2];
        data[s + 1] = line[y * 2 + 1];
      }
    }

  // along Z
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      for (let z = 0; z < size; z++) {
        const s = idx3(x, y, z, size);
        line[z * 2] = data[s];
        line[z * 2 + 1] = data[s + 1];
      }
      fft1d(line, inverse);
      for (let z = 0; z < size; z++) {
        const s = idx3(x, y, z, size);
        data[s] = line[z * 2];
        data[s + 1] = line[z * 2 + 1];
      }
    }
}

/** Smooth band-pass weight in [0,1] for a normalized frequency. */
export function bandWeight(normFreq: number, low: number, high: number): number {
  const fade = 0.06;
  const a = smoothstep(0, 1, (normFreq - low) / fade);
  const b = 1 - smoothstep(0, 1, (normFreq - high) / fade);
  return a * b;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Centered radial frequency (0 at DC, 1 at Nyquist along an axis). */
export function radialFrequency(x: number, y: number, z: number, n: number): number {
  const fx = Math.min(x, n - x);
  const fy = Math.min(y, n - y);
  const fz = Math.min(z, n - z);
  const r = Math.sqrt(fx * fx + fy * fy + fz * fz);
  return r / (n / 2);
}

/** Total magnitude energy within a normalized band of a forward-transformed volume. */
export function bandEnergy(freq: Float32Array, n: number, low: number, high: number): number {
  let sum = 0;
  for (let z = 0; z < n; z++)
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const f = radialFrequency(x, y, z, n);
        const w = bandWeight(f, low, high);
        if (w <= 0) continue;
        const s = idx3(x, y, z, n);
        const mag = Math.hypot(freq[s], freq[s + 1]);
        sum += mag * w;
      }
  return sum;
}

/** Zero out frequency bins outside [low,high] (band-pass) — used by "Tune". */
export function applyBandPass(freq: Float32Array, n: number, low: number, high: number): void {
  for (let z = 0; z < n; z++)
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const w = bandWeight(radialFrequency(x, y, z, n), low, high);
        const s = idx3(x, y, z, n);
        freq[s] *= w;
        freq[s + 1] *= w;
      }
}
