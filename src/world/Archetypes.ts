import type { ScenePlan } from "./ScenePlan";
import {
  generateApartmentPlan,
  generateOfficePlan,
  generateLandscapePlan,
  generateStarshipPlan,
  generatePlanetPlan
} from "./ScenePlanners";

/**
 * Procedural environment archetypes. Each one delegates to a bird's-eye-view
 * SCENE PLANNER (see ScenePlanners.ts) that emits a {@link ScenePlan}: a list of
 * thousands of discrete, intentionally placed objects (and a few animated
 * creatures) for the populated Reality view, PLUS the structural density field
 * (a {@link SourceField}) that the Fourier pipeline voxelizes and transforms for
 * the spectral hunt. The endless descent cycles through them, so every world is
 * a distinct place — busy and recognizable in Reality, and resolved band by band
 * in the frequency domain.
 *
 * The shell builders (`cubeField`, `smooth2`, `yawToOrigin`) live here and are
 * exported so the planners can reuse the EXACT same structural geometry that the
 * spectral view depends on, keeping Reality and the Fourier reconstruction
 * registered to one another.
 */

export type V3 = [number, number, number];

export interface SourceField {
  n: number;
  data: Float32Array;
  voxel: V3;
  origin: V3;
  spawn: { x: number; z: number };
  /** signature framing at spawn so the environment reads immediately */
  look: { yaw: number; pitch: number };
  anchors: V3[];
  name: string;
}

export interface Archetype {
  name: string;
  build(level: number, seed: number, n: number): ScenePlan;
}

export const idx = (x: number, y: number, z: number, n: number): number => x + y * n + z * n * n;

/**
 * Rasterize a solidity predicate into an N³ density field with a centered,
 * one-voxel-padded grid. Returns the field plus the voxel size and world origin
 * so callers can map between grid and world space. Exported for the scene
 * planners, which build their structural shells from the very same predicate the
 * spectral voxelizer reads.
 */
export function cubeField(
  n: number,
  ext: V3,
  yBase: number,
  predicate: (x: number, y: number, z: number) => boolean
): { data: Float32Array; voxel: V3; origin: V3 } {
  const voxel: V3 = [ext[0] / (n - 2), ext[1] / (n - 2), ext[2] / (n - 2)];
  const origin: V3 = [-ext[0] / 2 - voxel[0], yBase - voxel[1], -ext[2] / 2 - voxel[2]];
  const data = new Float32Array(n * n * n);
  for (let zi = 0; zi < n; zi++) {
    const wz = origin[2] + (zi + 0.5) * voxel[2];
    for (let yi = 0; yi < n; yi++) {
      const wy = origin[1] + (yi + 0.5) * voxel[1];
      for (let xi = 0; xi < n; xi++) {
        const wx = origin[0] + (xi + 0.5) * voxel[0];
        if (predicate(wx, wy, wz)) data[idx(xi, yi, zi, n)] = 1;
      }
    }
  }
  return { data, voxel, origin };
}

/** Seeded value-noise (bilinear-smoothed) sampled at world (x, z). */
export function smooth2(x: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const h = (a: number, b: number): number => {
    const v = Math.sin(a * 127.1 + b * 311.7 + seed * 13.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const n00 = h(xi, zi);
  const n10 = h(xi + 1, zi);
  const n01 = h(xi, zi + 1);
  const n11 = h(xi + 1, zi + 1);
  return (n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v;
}

/** Look yaw so "forward" points toward world origin from a spawn point. */
export function yawToOrigin(sx: number, sz: number): number {
  return Math.atan2(sx, sz);
}

const apartment: Archetype = {
  name: "APARTMENT",
  build(level, seed, n) {
    return generateApartmentPlan(level, seed, n);
  }
};

const office: Archetype = {
  name: "OFFICE TOWER",
  build(level, seed, n) {
    return generateOfficePlan(level, seed, n);
  }
};

const landscape: Archetype = {
  name: "LANDSCAPE",
  build(level, seed, n) {
    return generateLandscapePlan(level, seed, n);
  }
};

const starship: Archetype = {
  name: "STARSHIP",
  build(level, seed, n) {
    return generateStarshipPlan(level, seed, n);
  }
};

const planet: Archetype = {
  name: "PLANET",
  build(level, seed, n) {
    return generatePlanetPlan(level, seed, n);
  }
};

export const ARCHETYPES: Archetype[] = [apartment, office, landscape, starship, planet];

export function archetypeForLevel(level: number): Archetype {
  return ARCHETYPES[(level - 1 + ARCHETYPES.length) % ARCHETYPES.length];
}
