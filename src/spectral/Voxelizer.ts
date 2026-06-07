import { WALL_HEIGHT } from "../world/ProceduralRoom";
import type { LayoutSpec } from "../world/LayoutGen";
import { mulberry32 } from "../puzzles/LevelGen";
import { aabbFor } from "../world/ObjectLibrary";
import type { ScenePlan } from "../world/ScenePlan";

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

/**
 * Plan → density field.
 *
 * Starts from a copy of the plan's structural shell (`structuralField.data`),
 * then rasterizes every SOLID {@link PlacedObject} as a yaw-rotated box into the
 * same N³ grid. The result is the signal the spectral pipeline FFTs, so the
 * band-limited reconstructions now resolve recognizable furniture / tree /
 * console silhouettes instead of a bare shell. The anomaly is injected AFTER
 * this (see {@link withAnomaly}), so it lives only in the frequency domain among
 * the real silhouettes.
 *
 * Grid geometry (n, voxel, origin) is taken unchanged from `structuralField`, so
 * the produced field stays exactly registered with Reality and with collision.
 */
export function voxelizeScenePlan(plan: ScenePlan, n = 64): Float32Array {
  const field = plan.structuralField;
  const data = field.data.slice();
  const [vx, vy, vz] = field.voxel;
  const [ox, oy, oz] = field.origin;

  for (const obj of plan.objects) {
    if (!obj.solid) continue;

    // AABB.half is already half-extents; scale by the instance scale.
    const ext = aabbFor(obj.type);
    const hx = ext.half[0] * obj.scale;
    const hy = ext.half[1] * obj.scale;
    const hz = ext.half[2] * obj.scale;
    if (hx <= 0 || hy <= 0 || hz <= 0) continue;

    const [px, py, pz] = obj.pos;

    // World bounding sphere of the rotated box: radius = |halfExtents|.
    const r = Math.sqrt(hx * hx + hy * hy + hz * hz);

    // Voxel index range overlapping that sphere (centre-sampled grid).
    let x0 = Math.floor((px - r - ox) / vx - 0.5);
    let x1 = Math.ceil((px + r - ox) / vx - 0.5);
    let y0 = Math.floor((py - r - oy) / vy - 0.5);
    let y1 = Math.ceil((py + r - oy) / vy - 0.5);
    let z0 = Math.floor((pz - r - oz) / vz - 0.5);
    let z1 = Math.ceil((pz + r - oz) / vz - 0.5);
    x0 = Math.max(0, x0);
    y0 = Math.max(0, y0);
    z0 = Math.max(0, z0);
    x1 = Math.min(n - 1, x1);
    y1 = Math.min(n - 1, y1);
    z1 = Math.min(n - 1, z1);
    if (x0 > x1 || y0 > y1 || z0 > z1) continue;

    // Inverse yaw (rotate voxel offset back into object-local space).
    const cos = Math.cos(-obj.rot);
    const sin = Math.sin(-obj.rot);

    for (let zi = z0; zi <= z1; zi++) {
      const wz = oz + (zi + 0.5) * vz;
      const dz = wz - pz;
      for (let yi = y0; yi <= y1; yi++) {
        const wy = oy + (yi + 0.5) * vy;
        const dy = wy - py;
        const ay = Math.abs(dy);
        if (ay > hy) continue; // y is rotation-invariant (yaw only)
        for (let xi = x0; xi <= x1; xi++) {
          const wx = ox + (xi + 0.5) * vx;
          const dx = wx - px;
          // Inverse-rotate the XZ offset about pos.
          const lx = dx * cos - dz * sin;
          const lz = dx * sin + dz * cos;
          if (Math.abs(lx) <= hx && Math.abs(lz) <= hz) {
            data[idx(xi, yi, zi, n)] = 1;
          }
        }
      }
    }
  }

  return data;
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
