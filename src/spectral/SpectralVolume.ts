import { fft3d, bandEnergy, applyBandPass, idx3 } from "./Fourier3D";

export interface Band {
  low: number;
  high: number;
}

/** The four gameplay bands (Low / Mid / High / Fine). */
export const GAMEPLAY_BANDS: Band[] = [
  { low: 0.0, high: 0.28 },
  { low: 0.22, high: 0.55 },
  { low: 0.5, high: 0.82 },
  { low: 0.78, high: 1.2 }
];

/** Number of rooms / resonance nodes; shared so puzzle and Game agree. */
export const ROOM_COUNT = 3;

/**
 * Per-room dominant spatial frequency, in cycles along X over the volume span.
 * A wave of k cycles lands at radial frequency k/(size/2). At size=16 that is
 * 1→0.125 (LOW band0), 3→0.375 (MID band1), 6→0.75 (HIGH band2) — so each room
 * is dominated by a different gameplay band BY CONSTRUCTION, and the puzzle
 * derives the band from the FFT rather than hard-coding it.
 */
const ROOM_DOMINANT_CYCLES = [1, 3, 6];
/** Off-band companion cycles per room so band bars are never pure 1/0. */
const ROOM_COMPANION_CYCLES = [
  [3, 7],
  [1, 7],
  [1, 3]
];
/** Positional offset buckets precomputed per room (0 / mid / 1). */
const OFFSET_BUCKETS = [0, 0.5, 1];

/**
 * A small local spectral volume backed by a real 3D FFT. We synthesize a
 * spatial field with a few known sinusoidal components, transform it, and use
 * the resulting spectrum to drive gameplay.
 *
 * The legacy global field (spatial/frequency, dominant MID) is retained for
 * back-compat and the Fourier3D/puzzle tests. In addition we build one
 * forward-transformed volume per room, each with a clearly dominant band, plus
 * a few precomputed positional-offset variants so that moving within a room
 * visibly shifts the band-bar brightness without a per-frame FFT.
 */
export class SpectralVolume {
  readonly size: number;
  readonly spatial: Float32Array;
  readonly frequency: Float32Array;

  /** Forward-transformed volume per room (index 0..ROOM_COUNT-1). */
  private roomFreq: Float32Array[] = [];
  /** Per-room, per-offset-bucket precomputed band energies (first 3 bands). */
  private roomBandsByBucket: number[][][] = [];

  constructor(size = 16) {
    this.size = size;
    const len = size * size * size * 2;
    this.spatial = new Float32Array(len);
    this.frequency = new Float32Array(len);
    this.synthesize();
    this.forward();
    this.buildRooms();
  }

  /**
   * Deterministic legacy spatial signal. The dominant component is a single-axis
   * wave at 3 cycles → radial frequency 0.375, landing in the MID band (index 1).
   * Kept so dominantBand()/bandEnergies() stay stable for existing tests.
   */
  private synthesize(): void {
    const n = this.size;
    for (let z = 0; z < n; z++)
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const s = idx3(x, y, z, n);
          const mid = 1.0 * Math.sin((2 * Math.PI * 3 * x) / n);
          const low = 0.35 * Math.sin((2 * Math.PI * 1 * z) / n);
          const high = 0.18 * Math.sin((2 * Math.PI * 7 * y) / n);
          this.spatial[s] = mid + low + high;
          this.spatial[s + 1] = 0;
        }
  }

  private forward(): void {
    this.frequency.set(this.spatial);
    fft3d(this.frequency, this.size, false);
  }

  /**
   * Build one forward-transformed volume per room, each dominated by a distinct
   * band, plus precomputed band energies for a few positional-offset buckets so
   * movement re-samples a position-shifted window (modeled here as a phase shift
   * of the dominant component, which changes how energy distributes across bins).
   */
  private buildRooms(): void {
    const n = this.size;
    for (let room = 0; room < ROOM_COUNT; room++) {
      // Canonical room volume (offset 0) is the one used for residual/dominant.
      const freq = this.synthesizeRoom(room, 0);
      this.roomFreq.push(freq);

      const buckets: number[][] = [];
      for (const off of OFFSET_BUCKETS) {
        const f = off === 0 ? freq : this.synthesizeRoom(room, off);
        buckets.push(GAMEPLAY_BANDS.slice(0, 3).map((b) => bandEnergy(f, n, b.low, b.high)));
      }
      this.roomBandsByBucket.push(buckets);
    }
  }

  /**
   * Synthesize a single room's spatial field and return its forward transform.
   * The dominant component is a wave at ROOM_DOMINANT_CYCLES[room] cycles along
   * X; two weaker companion components on other bands keep bars from being pure.
   * `offset01` (0..1) applies a spatial phase shift to the dominant wave so the
   * sampled band energy genuinely shifts as the player moves within the room.
   * Magnitude (not phase) drives band energy, so the offset modulates the
   * dominant component's amplitude: brightest at the room's resonant center,
   * dimmer toward its edges, which makes the lens bar visibly respond to motion.
   */
  private synthesizeRoom(room: number, offset01: number): Float32Array {
    const n = this.size;
    const len = n * n * n * 2;
    const field = new Float32Array(len);
    const dom = ROOM_DOMINANT_CYCLES[room];
    const [cA, cB] = ROOM_COMPANION_CYCLES[room];
    // Amplitude envelope across the room: peaks near offset 0.5, falls toward the
    // edges (range ~0.6..1.0). Changes magnitude, hence band energy, with motion.
    const domAmp = 1.0 - 0.4 * Math.abs(offset01 - 0.5) * 2;
    for (let z = 0; z < n; z++)
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const s = idx3(x, y, z, n);
          const dominant = domAmp * Math.sin((2 * Math.PI * dom * x) / n);
          const compA = 0.3 * Math.sin((2 * Math.PI * cA * y) / n);
          const compB = 0.18 * Math.sin((2 * Math.PI * cB * z) / n);
          field[s] = dominant + compA + compB;
          field[s + 1] = 0;
        }
    fft3d(field, n, false);
    return field;
  }

  /** Energy per gameplay band — legacy global field. Unchanged for tests. */
  bandEnergies(): number[] {
    return GAMEPLAY_BANDS.map((b) => bandEnergy(this.frequency, this.size, b.low, b.high));
  }

  /** Index of the band carrying the most energy (legacy global field). */
  dominantBand(): number {
    const e = this.bandEnergies();
    let best = 0;
    for (let i = 1; i < e.length; i++) if (e[i] > e[best]) best = i;
    return best;
  }

  /**
   * Per-gameplay-band energy (first 3 bands) for a room, sampled at a positional
   * offset 0..1 within the room. Lerps between precomputed offset buckets so the
   * lens band-bars shift smoothly as the player moves, without per-frame FFTs.
   */
  bandEnergiesAt(roomIndex: number, offset01 = 0): number[] {
    const buckets = this.roomBandsByBucket[roomIndex];
    const t = Math.max(0, Math.min(1, offset01)) * (buckets.length - 1);
    const i0 = Math.floor(t);
    const i1 = Math.min(buckets.length - 1, i0 + 1);
    const f = t - i0;
    const a = buckets[i0];
    const b = buckets[i1];
    return a.map((v, k) => v + (b[k] - v) * f);
  }

  /**
   * FFT-derived dominant band for a room: argmax of bandEnergiesAt(roomIndex, 0)
   * over the first three bands. Living=0, hallway=1, back=2 by construction.
   */
  dominantBandFor(roomIndex: number): number {
    const e = this.bandEnergiesAt(roomIndex, 0);
    let best = 0;
    for (let i = 1; i < e.length; i++) if (e[i] > e[best]) best = i;
    return best;
  }

  /**
   * Inverse-transform residue ratio (0..1) for a band in a room: band-pass a
   * copy of the room's spectrum to `band`, then return the surviving magnitude
   * as a fraction of the room's total magnitude. High when band == dominant
   * (the room's energy survives the filter), low for a wrong band. Drives node
   * visibility and noise.
   */
  residualEnergy(roomIndex: number, band: number): number {
    const n = this.size;
    const src = this.roomFreq[roomIndex];
    let total = 0;
    for (let i = 0; i < src.length; i += 2) total += Math.hypot(src[i], src[i + 1]);
    if (total <= 0) return 0;
    const copy = src.slice();
    const b = GAMEPLAY_BANDS[band];
    applyBandPass(copy, n, b.low, b.high);
    let kept = 0;
    for (let i = 0; i < copy.length; i += 2) kept += Math.hypot(copy[i], copy[i + 1]);
    return kept / total;
  }
}
