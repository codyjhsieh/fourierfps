import { fft3d, idx3, radialFrequency } from "./Fourier3D";
import { surfaceNets } from "./SurfaceNets";
import { withAnomaly, voxelizeScenePlan } from "./Voxelizer";
import { archetypeForLevel } from "../world/Archetypes";
import type { PlacedObject, CreatureSpec, EstablishingShot } from "../world/ScenePlan";
import { mulberry32 } from "../puzzles/LevelGen";

export interface Marker {
  center: [number, number, number];
  radius: number;
}

/** Number of decoy anomalies for a level (0 at first, grows, capped). */
export function decoyCountForLevel(level: number): number {
  return Math.min(Math.max(0, level - 1), 5);
}

/** Number of Fourier bands to navigate for a level (more = finer/harder). */
export function bandCountForLevel(level: number): number {
  return Math.min(6 + Math.floor((level - 1) / 2), 12);
}

/**
 * Pure, worker-serializable Fourier decomposition of one corrupted world.
 * Voxelizes the house, adds the anomaly (broadband noise), forward-transforms it,
 * and builds a stack of band-limited inverse reconstructions as isosurface mesh
 * arrays — the navigable Fourier partial-sum series. Also returns the clean
 * restored surface and where the anomaly resolves. Returns plain typed arrays so
 * it can run in a Web Worker and transfer results with zero copies.
 */

export interface MeshArrays {
  positions: Float32Array;
  indices: Uint32Array;
}

export interface SpectralResult {
  n: number;
  bands: MeshArrays[];
  clean: MeshArrays;
  anomaly: Marker;
  decoys: Marker[];
  anomalyBand: number;
  scale: [number, number, number];
  origin: [number, number, number];
  spawn: { x: number; z: number };
  look: { yaw: number; pitch: number };
  name: string;
  /** source density field (the true structure) — used for collision/physics */
  solid: Float32Array;
  /** Reality population: instanceable objects placed by the scene plan. */
  population: PlacedObject[];
  /** Reality creatures: individually animated, not voxelized nor collided. */
  creatures: CreatureSpec[];
  /** Optional cinematic establishing framing from the plan. */
  establishing?: EstablishingShot;
}

function toComplex(real: Float32Array): Float32Array {
  const out = new Float32Array(real.length * 2);
  for (let i = 0; i < real.length; i++) out[i * 2] = real[i];
  return out;
}

function inverseLowPass(spectrum: Float32Array, n: number, cutoff: number): Float32Array {
  const s = spectrum.slice();
  for (let z = 0; z < n; z++)
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        if (radialFrequency(x, y, z, n) > cutoff) {
          const i = idx3(x, y, z, n);
          s[i] = 0;
          s[i + 1] = 0;
        }
      }
  fft3d(s, n, true);
  const re = new Float32Array(n * n * n);
  for (let i = 0; i < re.length; i++) re[i] = s[i * 2];
  return re;
}

function maxOf(a: Float32Array): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i];
  return m;
}

export function computeSpectralWorld(level: number, seed: number, n = 64, K = 8): SpectralResult {
  const plan = archetypeForLevel(level).build(level, seed, n);
  const src = plan.structuralField;
  const rng = mulberry32((seed >>> 0) ^ Math.imul(level + 7, 0xc2b2ae35));
  const anchors = src.anchors.length ? src.anchors : ([[0, 1.2, 0]] as [number, number, number][]);

  // the true anomaly + decoys, placed at interior anchors of this environment
  const aIdx = Math.floor(rng() * anchors.length);
  const anomaly: Marker = { center: anchors[aIdx], radius: Math.max(0.32, 0.7 - level * 0.05) };
  const free = anchors.map((_, i) => i).filter((i) => i !== aIdx);
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [free[i], free[j]] = [free[j], free[i]];
  }
  const decoys: Marker[] = free
    .slice(0, decoyCountForLevel(level))
    .map((i) => ({ center: anchors[i], radius: Math.max(0.3, 0.5 - level * 0.02) }));

  // Merge every solid placed object into the structural shell, so the bands now
  // resolve recognizable silhouettes (furniture/trees/consoles), not a bare shell.
  const data = voxelizeScenePlan(plan, n);
  const field = { n, data, voxel: src.voxel, origin: src.origin };
  const noisy = withAnomaly(field, anomaly);

  const spectrum = toComplex(noisy);
  fft3d(spectrum, n, false);

  const bands: MeshArrays[] = [];
  for (let k = 0; k < K; k++) {
    const cutoff = ((k + 1) / K) * 1.05;
    const recon = inverseLowPass(spectrum, n, cutoff);
    const iso = Math.max(0.04, 0.45 * maxOf(recon));
    bands.push(surfaceNets(recon, n, iso, 1, [0, 0, 0]));
  }

  const cleanSpectrum = toComplex(field.data);
  fft3d(cleanSpectrum, n, false);
  const cleanRecon = inverseLowPass(cleanSpectrum, n, 3);
  const clean = surfaceNets(cleanRecon, n, Math.max(0.04, 0.45 * maxOf(cleanRecon)), 1, [0, 0, 0]);

  const frac = 1 - Math.min(1, anomaly.radius / 0.8);
  const anomalyBand = Math.min(K - 1, Math.max(1, Math.round(frac * (K - 1))));

  return {
    n,
    bands,
    clean,
    anomaly,
    decoys,
    anomalyBand,
    scale: src.voxel,
    origin: src.origin,
    spawn: src.spawn,
    look: src.look,
    name: src.name,
    solid: data,
    population: plan.objects,
    creatures: plan.creatures,
    establishing: plan.establishing
  };
}

/** All transferable ArrayBuffers in a result (for postMessage zero-copy). */
export function resultTransferables(r: SpectralResult): ArrayBuffer[] {
  const t: ArrayBuffer[] = [];
  for (const b of r.bands) {
    t.push(b.positions.buffer as ArrayBuffer, b.indices.buffer as ArrayBuffer);
  }
  t.push(r.clean.positions.buffer as ArrayBuffer, r.clean.indices.buffer as ArrayBuffer);
  t.push(r.solid.buffer as ArrayBuffer);
  return t;
}
