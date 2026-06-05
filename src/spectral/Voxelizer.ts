import { WALL_HEIGHT } from "../world/ProceduralRoom";
import type { LayoutSpec } from "../world/LayoutGen";
import { mulberry32 } from "../puzzles/LevelGen";

/**
 * Turns a procedural house layout into a 3D density field (1 = solid structure,
 * 0 = air) sampled on an N³ grid spanning the house — the signal the game
 * Fourier-transforms. Also injects a compact "anomaly" object whose sharp,
 * broadband spectrum is the noise corrupting the world.
 */

export interface VoxelField {
  n: number;
  data: Float32Array; // N³, idx = x + y*N + z*N*N
  /** world size of one voxel per axis */
  voxel: [number, number, number];
  /** world position of voxel-centre (0,0,0) */
  origin: [number, number, number];
}

export interface Anomaly {
  center: [number, number, number]; // world
  radius: number; // world
}

function idx(x: number, y: number, z: number, n: number): number {
  return x + y * n + z * n * n;
}

/** Solid structure (walls + floor) of the layout rasterised into an N³ field. */
export function voxelizeLayout(spec: LayoutSpec, n = 32): VoxelField {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const f of spec.floors) {
    minX = Math.min(minX, f.x0);
    maxX = Math.max(maxX, f.x1);
    minZ = Math.min(minZ, f.z0);
    maxZ = Math.max(maxZ, f.z1);
  }
  const minY = 0;
  const maxY = WALL_HEIGHT;

  // 1-voxel air border so surfaces close cleanly
  const vx = (maxX - minX) / (n - 2);
  const vy = (maxY - minY) / (n - 2);
  const vz = (maxZ - minZ) / (n - 2);
  const origin: [number, number, number] = [minX - vx, minY - vy, minZ - vz];

  const data = new Float32Array(n * n * n);
  const floorTop = vy * 2; // floor slab ~2 voxels thick
  const wallHalf = Math.max(0.09, vx * 0.9, vz * 0.9); // thicken walls to register on the grid

  for (let zi = 0; zi < n; zi++) {
    const wz = origin[2] + (zi + 0.5) * vz;
    for (let yi = 0; yi < n; yi++) {
      const wy = origin[1] + (yi + 0.5) * vy;
      for (let xi = 0; xi < n; xi++) {
        const wx = origin[0] + (xi + 0.5) * vx;
        let solid = 0;
        // floor slab under any room
        if (wy >= 0 && wy <= floorTop) {
          for (const f of spec.floors) {
            if (wx >= f.x0 && wx <= f.x1 && wz >= f.z0 && wz <= f.z1) {
              solid = 1;
              break;
            }
          }
        }
        // walls (full height)
        if (!solid && wy >= 0 && wy <= maxY) {
          for (const w of spec.walls) {
            if (w.axis === "x") {
              if (Math.abs(wz - w.line) <= wallHalf && wx >= w.a - wallHalf && wx <= w.b + wallHalf) {
                solid = 1;
                break;
              }
            } else {
              if (Math.abs(wx - w.line) <= wallHalf && wz >= w.a - wallHalf && wz <= w.b + wallHalf) {
                solid = 1;
                break;
              }
            }
          }
        }
        if (solid) data[idx(xi, yi, zi, n)] = 1;
      }
    }
  }

  return { n, data, voxel: [vx, vy, vz], origin };
}

/** Pick an anomaly position inside a room; smaller (harder to spot) with depth. */
export function chooseAnomaly(spec: LayoutSpec, level: number, seed: number): Anomaly {
  const rng = mulberry32((seed >>> 0) ^ Math.imul(level + 7, 0xc2b2ae35));
  const room = spec.rooms[Math.floor(rng() * spec.rooms.length)] ?? spec.rooms[0];
  const cx = room.x0 + (room.x1 - room.x0) * (0.3 + rng() * 0.4);
  const cz = room.z0 + (room.z1 - room.z0) * (0.3 + rng() * 0.4);
  const cy = 0.8 + rng() * 1.0;
  const radius = Math.max(0.32, 0.7 - level * 0.05);
  return { center: [cx, cy, cz], radius };
}

/** Decoy objects: look like the anomaly but don't corrupt — red herrings. */
export function chooseDecoys(spec: LayoutSpec, level: number, seed: number, count: number, avoid: Anomaly): Anomaly[] {
  const rng = mulberry32((seed >>> 0) ^ Math.imul(level + 13, 0x27d4eb2f));
  const out: Anomaly[] = [];
  let attempts = 0;
  while (out.length < count && attempts < count * 12) {
    attempts++;
    const room = spec.rooms[Math.floor(rng() * spec.rooms.length)] ?? spec.rooms[0];
    const cx = room.x0 + (room.x1 - room.x0) * (0.2 + rng() * 0.6);
    const cz = room.z0 + (room.z1 - room.z0) * (0.2 + rng() * 0.6);
    const cy = 0.8 + rng() * 1.0;
    const radius = Math.max(0.3, 0.55 - level * 0.03);
    const dx = cx - avoid.center[0];
    const dz = cz - avoid.center[2];
    if (Math.hypot(dx, dz) < (radius + avoid.radius) * 1.6) continue; // not on top of the real one
    if (out.some((d) => Math.hypot(cx - d.center[0], cz - d.center[2]) < (radius + d.radius) * 1.4)) continue;
    out.push({ center: [cx, cy, cz], radius });
  }
  return out;
}

/** Returns a copy of the field with the anomaly object added (the "noise"). */
export function withAnomaly(field: VoxelField, anomaly: Anomaly): Float32Array {
  const out = field.data.slice();
  const { n, origin, voxel } = field;
  const r2 = anomaly.radius * anomaly.radius;
  for (let zi = 0; zi < n; zi++) {
    const wz = origin[2] + (zi + 0.5) * voxel[2];
    for (let yi = 0; yi < n; yi++) {
      const wy = origin[1] + (yi + 0.5) * voxel[1];
      for (let xi = 0; xi < n; xi++) {
        const wx = origin[0] + (xi + 0.5) * voxel[0];
        const dx = wx - anomaly.center[0];
        const dy = wy - anomaly.center[1];
        const dz = wz - anomaly.center[2];
        if (dx * dx + dy * dy + dz * dz <= r2) out[idx(xi, yi, zi, n)] = 1;
      }
    }
  }
  return out;
}
