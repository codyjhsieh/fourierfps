import { generateLayout } from "./LayoutGen";
import { voxelizeLayout } from "../spectral/Voxelizer";
import { mulberry32 } from "../puzzles/LevelGen";

/**
 * Procedural environment archetypes. Each builds a 3D density field (1 = solid)
 * for a different kind of place, scaling its complexity with `level`, plus a
 * spawn + signature look direction + interior "anchors" for anomaly/decoys.
 * The endless descent cycles through them, so every world is a distinct place
 * the Fourier decomposition reconstructs band by band — denser and more
 * intricate the deeper you go.
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
  build(level: number, seed: number, n: number): SourceField;
}

const idx = (x: number, y: number, z: number, n: number): number => x + y * n + z * n * n;

function cubeField(
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

function smooth2(x: number, z: number, seed: number): number {
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
function yawToOrigin(sx: number, sz: number): number {
  return Math.atan2(sx, sz);
}

const apartment: Archetype = {
  name: "APARTMENT",
  build(level, seed, n) {
    const spec = generateLayout(level, seed); // rooms already grow with level
    const vf = voxelizeLayout(spec, n);
    const anchors: V3[] = spec.rooms.map((r) => [(r.x0 + r.x1) / 2, 1.2, (r.z0 + r.z1) / 2]);
    return {
      n,
      data: vf.data,
      voxel: vf.voxel,
      origin: vf.origin,
      spawn: spec.spawn,
      look: { yaw: Math.PI, pitch: -0.05 },
      anchors,
      name: "APARTMENT"
    };
  }
};

const office: Archetype = {
  name: "OFFICE TOWER",
  build(level, seed, n) {
    const rng = mulberry32((seed >>> 0) ^ Math.imul(level + 3, 0x9e3779b1));
    const floorH = 2.6;
    const slab = 0.26;
    const ext: V3 = [14, 14 + Math.min(level, 6) * 2, 14]; // grows taller with depth
    const colSpace = Math.max(2.3, 3.5 - level * 0.18); // tighter column grid deeper
    const colR = 0.22;
    // partition walls (more with depth) — vertical slabs cutting the floors
    const parts = Array.from({ length: Math.min(level, 6) }, () => ({
      axis: rng() < 0.5 ? 0 : 1,
      at: (rng() * 2 - 1) * (ext[0] / 2 - 1.5)
    }));
    const f = cubeField(n, ext, 0, (x, y, z) => {
      const inFoot = Math.abs(x) < ext[0] / 2 - 0.3 && Math.abs(z) < ext[2] / 2 - 0.3;
      for (let k = 0; k * floorH <= ext[1]; k++) if (inFoot && Math.abs(y - k * floorH) < slab) return true;
      const gx = Math.round(x / colSpace) * colSpace;
      const gz = Math.round(z / colSpace) * colSpace;
      if (Math.abs(x - gx) < colR && Math.abs(z - gz) < colR && Math.abs(gx) < ext[0] / 2 && Math.abs(gz) < ext[2] / 2) return true;
      if (Math.abs(x) < 1.2 && Math.abs(z) < 1.2) return true; // service core
      for (const p of parts) {
        const d = p.axis === 0 ? Math.abs(x - p.at) : Math.abs(z - p.at);
        const along = p.axis === 0 ? Math.abs(z) : Math.abs(x);
        if (d < 0.12 && along < ext[0] / 2 - 1.5 && inFoot) return true;
      }
      return false;
    });
    return {
      n,
      ...f,
      spawn: { x: colSpace, z: colSpace },
      look: { yaw: yawToOrigin(colSpace, colSpace), pitch: 0.22 }, // look up the core
      anchors: [1, 2, 3, 4].map((k) => [colSpace * 1.4, k * floorH + 1.0, 0] as V3),
      name: "OFFICE TOWER"
    };
  }
};

const landscape: Archetype = {
  name: "LANDSCAPE",
  build(level, seed, n) {
    const rng = mulberry32((seed >>> 0) ^ Math.imul(level + 11, 0x85ebca6b));
    const ext: V3 = [24, 8, 24];
    const octaves = 2 + Math.min(level - 1, 4); // more fractal detail with depth
    const height = (x: number, z: number): number => {
      let a = 1.8;
      let f = 0.14;
      let sum = 0.4;
      for (let o = 0; o < octaves; o++) {
        sum += smooth2(x * f + seed, z * f, seed + o * 7) * a;
        a *= 0.5;
        f *= 2;
      }
      return sum;
    };
    // spires grow in number with depth
    const spires = Array.from({ length: Math.min(level, 6) }, () => ({
      x: (rng() * 2 - 1) * 9,
      z: (rng() * 2 - 1) * 9,
      r: 0.4 + rng() * 0.4
    }));
    const f = cubeField(n, ext, 0, (x, y, z) => {
      if (y < height(x, z)) return true;
      for (const s of spires) if (Math.hypot(x - s.x, z - s.z) < s.r && y < height(s.x, s.z) + 3) return true;
      return false;
    });
    return {
      n,
      ...f,
      spawn: { x: 0, z: 9 },
      look: { yaw: 0, pitch: -0.12 }, // look -Z out across the full terrain
      anchors: Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        const x = Math.cos(a) * 6;
        const z = Math.sin(a) * 6;
        return [x, height(x, z) + 1.5, z] as V3;
      }),
      name: "LANDSCAPE"
    };
  }
};

const starship: Archetype = {
  name: "STARSHIP",
  build(level, seed, n) {
    const rng = mulberry32((seed >>> 0) ^ Math.imul(level + 17, 0xc2b2ae35));
    const ext: V3 = [10, 10, 18 + Math.min(level, 6) * 3]; // longer ship with depth
    const cyY = ext[1] / 2;
    const R = 4;
    const shell = 0.5;
    const coreR = 2.2;
    const ringSpace = Math.max(1.8, 3 - level * 0.15); // denser ring frames deeper
    const modules = Array.from({ length: Math.min(level, 5) }, () => ({
      z: (rng() * 2 - 1) * (ext[2] / 2 - 2),
      s: 0.6 + rng() * 0.6
    }));
    const f = cubeField(n, ext, 0, (x, y, z) => {
      const rr = Math.hypot(x, y - cyY);
      if (rr > R - shell && rr < R && Math.abs(z) < ext[2] / 2 - 0.4) return true; // hull
      if (Math.abs(z - Math.round(z / ringSpace) * ringSpace) < 0.2 && rr < R && rr > coreR - 0.4) return true; // rings
      if (Math.abs(Math.abs(z) - (ext[2] / 2 - 0.5)) < 0.4 && rr < R) return true; // end caps
      for (const m of modules) if (Math.abs(z - m.z) < m.s && rr < coreR && rr > coreR - 0.5) return true; // core modules
      return false;
    });
    return {
      n,
      ...f,
      spawn: { x: 0, z: 0 },
      look: { yaw: 0, pitch: 0.02 }, // down the corridor
      anchors: Array.from({ length: 8 }, (_, i) => [0, cyY, -ext[2] / 2 + 2 + i * (ext[2] - 4) / 7] as V3),
      name: "STARSHIP"
    };
  }
};

const planet: Archetype = {
  name: "PLANET",
  build(level, seed, n) {
    const ext: V3 = [16, 16, 16];
    const center: V3 = [0, 8, 0];
    const R = 5;
    const octaves = 2 + Math.min(level - 1, 4); // fractal crust deepens with level
    const hasRing = level >= 3;
    const f = cubeField(n, ext, 0, (x, y, z) => {
      const dx = x - center[0];
      const dy = y - center[1];
      const dz = z - center[2];
      const d = Math.hypot(dx, dy, dz);
      let bump = 0;
      let a = 0.9;
      let fr = 0.5;
      for (let o = 0; o < octaves; o++) {
        bump += (smooth2(dx * fr + seed, dz * fr + dy * fr, seed + o * 5) - 0.5) * a;
        a *= 0.5;
        fr *= 2;
      }
      if (d < R + bump) return true;
      if (hasRing) {
        const ringR = Math.hypot(dx, dz);
        if (Math.abs(dy) < 0.25 && ringR > R + 1.5 && ringR < R + 3) return true; // orbital ring
      }
      return false;
    });
    return {
      n,
      ...f,
      spawn: { x: 0, z: 0 },
      look: { yaw: 0, pitch: 0.42 }, // look up at the planet overhead
      anchors: Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return [center[0] + Math.cos(a) * (R + 1.6), center[1] + Math.sin(a * 1.7) * 2, center[2] + Math.sin(a) * (R + 1.6)] as V3;
      }),
      name: "PLANET"
    };
  }
};

export const ARCHETYPES: Archetype[] = [apartment, office, landscape, starship, planet];

export function archetypeForLevel(level: number): Archetype {
  return ARCHETYPES[(level - 1 + ARCHETYPES.length) % ARCHETYPES.length];
}
