import { generateLayout, type LayoutSpec } from "./LayoutGen";
import { voxelizeLayout } from "../spectral/Voxelizer";
import { cubeField, smooth2, yawToOrigin, type V3, type SourceField } from "./Archetypes";
import { aabbFor } from "./ObjectLibrary";
import type { PlacedObject, CreatureSpec, ScenePlan, PlanFn } from "./ScenePlan";

/**
 * Five per-archetype scene planners. Each REUSES the existing shell logic from
 * Archetypes (apartment layout/voxelizer, office column grid, landscape fractal,
 * starship cylinder, planet sphere) to produce the EXACT same SourceField the
 * Fourier pipeline already consumes, then — driving off the same bird's-eye view
 * — scatters thousands of discrete typed PlacedObjects plus a handful of animated
 * creatures across it via a seeded 2D occupancy grid.
 *
 * The plan is the single source of truth: RealityScene materialises the objects
 * as InstancedMesh pools; Voxelizer rasterises every solid object box into the
 * N³ field so the spectral bands resolve recognisable silhouettes. Everything
 * here is pure data (no Three.js) and deterministic in (level, seed).
 */

// --- deterministic PRNG (mulberry32), keyed off seed^imul(level+k) like the shell ---
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- small seeded 2D occupancy grid so footprints don't overlap ----------------
class Occupancy {
  private cells = new Set<string>();
  constructor(private readonly cell: number) {}
  private key(x: number, z: number): string {
    return `${Math.round(x / this.cell)},${Math.round(z / this.cell)}`;
  }
  /** True if every cell the footprint touches is free; marks them when free. */
  claim(x: number, z: number, rx: number, rz: number): boolean {
    const c = this.cell;
    const keys: string[] = [];
    for (let dx = -rx; dx <= rx; dx += c) {
      for (let dz = -rz; dz <= rz; dz += c) {
        const k = this.key(x + dx, z + dz);
        if (this.cells.has(k)) return false;
        keys.push(k);
      }
    }
    for (const k of keys) this.cells.add(k);
    return true;
  }
  has(x: number, z: number): boolean {
    return this.cells.has(this.key(x, z));
  }
}

/** Footprint half-extents in metres for a type+variant from the library AABB. */
function half(type: string, _variant: number): { rx: number; rz: number; h: number } {
  const a = aabbFor(type);
  return { rx: a.half[0], rz: a.half[2], h: a.half[1] * 2 };
}

function place(
  type: string,
  variant: number,
  pos: V3,
  rot: number,
  scale: number,
  colorKey: string,
  solid: boolean,
  animated = false
): PlacedObject {
  return { type, variant, pos, rot, scale, colorKey, solid, animated };
}

/** A solid object only registers in the field if it is tall enough (>0.5 m). */
function solidEnough(type: string, variant: number, scale: number): boolean {
  return half(type, variant).h * scale > 0.5;
}

// ============================================================================ //
//  APARTMENT — furnish each room of the accreted floor-plan                     //
// ============================================================================ //
const APT_ROOM_KITS: { type: string; key: string; against: boolean }[][] = [
  [
    { type: "sofa", key: "sageGreen", against: true },
    { type: "table", key: "sandstone", against: false },
    { type: "rug", key: "dustyRose", against: false },
    { type: "lamp", key: "dustyRose", against: true },
    { type: "plant", key: "sageGreen", against: true }
  ],
  [
    { type: "bed", key: "powderBlue", against: true },
    { type: "sideboard", key: "sandstone", against: true },
    { type: "lamp", key: "lavenderGray", against: true },
    { type: "plant", key: "sageGreen", against: true }
  ],
  [
    { type: "kitchenCounter", key: "sandstone", against: true },
    { type: "table", key: "sandstone", against: false },
    { type: "chair", key: "powderBlue", against: false },
    { type: "chair", key: "powderBlue", against: false }
  ],
  [
    { type: "bookshelf", key: "sandstone", against: true },
    { type: "chair", key: "powderBlue", against: false },
    { type: "plant", key: "sageGreen", against: true },
    { type: "table", key: "sandstone", against: false }
  ]
];

const APT_CLUTTER = ["pictureFrame", "plant", "lamp"];

export const generateApartmentPlan: PlanFn = (level, seed, n): ScenePlan => {
  const spec: LayoutSpec = generateLayout(level, seed);
  const vf = voxelizeLayout(spec, n);
  const anchors: V3[] = spec.rooms.map((r) => [(r.x0 + r.x1) / 2, 1.2, (r.z0 + r.z1) / 2]);
  const structuralField: SourceField = {
    n,
    data: vf.data,
    voxel: vf.voxel,
    origin: vf.origin,
    spawn: spec.spawn,
    look: { yaw: Math.PI, pitch: -0.05 },
    anchors,
    name: "APARTMENT"
  };

  const rng = mulberry32((seed >>> 0) ^ Math.imul(level + 1, 0x85ebca6b));
  const objects: PlacedObject[] = [];
  const occ = new Occupancy(0.4);
  // 60..150 props scaling with room count
  const budget = Math.min(150, 60 + spec.rooms.length * 12);

  spec.rooms.forEach((room, ri) => {
    const kit = APT_ROOM_KITS[ri % APT_ROOM_KITS.length];
    const cx = (room.x0 + room.x1) / 2;
    const cz = (room.z0 + room.z1) / 2;
    const w = room.x1 - room.x0;
    const d = room.z1 - room.z0;
    for (const item of kit) {
      const variant = Math.floor(rng() * 2);
      const { rx, rz } = half(item.type, variant);
      let px: number;
      let pz: number;
      let rot: number;
      if (item.against) {
        // hug a wall, facing into the room
        const wall = Math.floor(rng() * 4);
        const inset = 0.35;
        if (wall === 0) {
          px = room.x0 + rx + inset;
          pz = cz + (rng() - 0.5) * (d - rz * 2 - 0.6);
          rot = Math.PI / 2;
        } else if (wall === 1) {
          px = room.x1 - rx - inset;
          pz = cz + (rng() - 0.5) * (d - rz * 2 - 0.6);
          rot = -Math.PI / 2;
        } else if (wall === 2) {
          px = cx + (rng() - 0.5) * (w - rx * 2 - 0.6);
          pz = room.z0 + rz + inset;
          rot = 0;
        } else {
          px = cx + (rng() - 0.5) * (w - rx * 2 - 0.6);
          pz = room.z1 - rz - inset;
          rot = Math.PI;
        }
      } else {
        px = cx + (rng() - 0.5) * (w - rx * 2 - 0.8);
        pz = cz + (rng() - 0.5) * (d - rz * 2 - 0.8);
        rot = rng() * Math.PI * 2;
      }
      if (!occ.claim(px, pz, rx + 0.1, rz + 0.1)) continue;
      const scale = 0.92 + rng() * 0.16;
      objects.push(
        place(item.type, variant, [px, 0, pz], rot, scale, item.key, solidEnough(item.type, variant, scale))
      );
      if (objects.length >= budget) break;
    }
  });

  // scatter clutter until budget is hit
  let guard = 0;
  while (objects.length < budget && guard++ < budget * 6) {
    const room = spec.rooms[Math.floor(rng() * spec.rooms.length)];
    const px = room.x0 + 0.4 + rng() * (room.x1 - room.x0 - 0.8);
    const pz = room.z0 + 0.4 + rng() * (room.z1 - room.z0 - 0.8);
    const type = APT_CLUTTER[Math.floor(rng() * APT_CLUTTER.length)];
    const variant = Math.floor(rng() * 2);
    const { rx, rz } = half(type, variant);
    if (!occ.claim(px, pz, rx, rz)) continue;
    const scale = 0.85 + rng() * 0.2;
    objects.push(place(type, variant, [px, 0, pz], rng() * Math.PI * 2, scale, "lavenderGray", false));
  }

  // a cat + a goldfish wandering the home
  const creatures: CreatureSpec[] = [];
  const r0 = spec.rooms[0];
  creatures.push({
    kind: "cat",
    pos: [(r0.x0 + r0.x1) / 2, 0, (r0.z0 + r0.z1) / 2],
    phase: rng() * Math.PI * 2,
    wander: 1.2
  });
  const rf = spec.rooms[spec.rooms.length - 1];
  creatures.push({
    kind: "goldfish",
    pos: [(rf.x0 + rf.x1) / 2, 0.6, (rf.z0 + rf.z1) / 2],
    phase: rng() * Math.PI * 2,
    wander: 0.3
  });

  return {
    objects,
    creatures,
    structuralField,
    anchors,  };
};

// ============================================================================ //
//  OFFICE TOWER — desk grids + plants across each floor slab                    //
// ============================================================================ //
export const generateOfficePlan: PlanFn = (level, seed, n): ScenePlan => {
  const rng = mulberry32((seed >>> 0) ^ Math.imul(level + 3, 0x9e3779b1));
  const floorH = 2.6;
  const slab = 0.26;
  const ext: V3 = [14, 14 + Math.min(level, 6) * 2, 14];
  const colSpace = Math.max(2.3, 3.5 - level * 0.18);
  const colR = 0.22;
  const parts = Array.from({ length: Math.min(level, 6) }, () => ({
    axis: rng() < 0.5 ? 0 : 1,
    at: (rng() * 2 - 1) * (ext[0] / 2 - 1.5)
  }));
  const f = cubeField(n, ext, 0, (x, y, z) => {
    const inFoot = Math.abs(x) < ext[0] / 2 - 0.3 && Math.abs(z) < ext[2] / 2 - 0.3;
    for (let k = 0; k * floorH <= ext[1]; k++) if (inFoot && Math.abs(y - k * floorH) < slab) return true;
    const gx = Math.round(x / colSpace) * colSpace;
    const gz = Math.round(z / colSpace) * colSpace;
    if (
      Math.abs(x - gx) < colR &&
      Math.abs(z - gz) < colR &&
      Math.abs(gx) < ext[0] / 2 &&
      Math.abs(gz) < ext[2] / 2
    )
      return true;
    if (Math.abs(x) < 1.2 && Math.abs(z) < 1.2) return true;
    for (const p of parts) {
      const d = p.axis === 0 ? Math.abs(x - p.at) : Math.abs(z - p.at);
      const along = p.axis === 0 ? Math.abs(z) : Math.abs(x);
      if (d < 0.12 && along < ext[0] / 2 - 1.5 && inFoot) return true;
    }
    return false;
  });
  const structuralField: SourceField = {
    n,
    ...f,
    spawn: { x: colSpace, z: colSpace },
    look: { yaw: yawToOrigin(colSpace, colSpace), pitch: 0.22 },
    anchors: [1, 2, 3, 4].map((k) => [colSpace * 1.4, k * floorH + 1.0, 0] as V3),
    name: "OFFICE TOWER"
  };

  const objects: PlacedObject[] = [];
  const floors = Math.max(1, Math.floor(ext[1] / floorH));
  const halfX = ext[0] / 2 - 1.0;
  const halfZ = ext[2] / 2 - 1.0;
  // 200..600 desks/chairs/plants scaling with floors and depth
  const budget = Math.min(600, 200 + floors * 60 + level * 20);
  const occ = new Occupancy(0.5);

  for (let fl = 0; fl < floors && objects.length < budget; fl++) {
    const y = fl * floorH + slab;
    const step = 2.0;
    // offset this floor's occupancy footprints so floors never collide with each other
    const floorOff = fl * 1000;
    for (let gx = -halfX; gx <= halfX && objects.length < budget; gx += step) {
      for (let gz = -halfZ; gz <= halfZ && objects.length < budget; gz += step) {
        // skip the service core
        if (Math.abs(gx) < 1.6 && Math.abs(gz) < 1.6) continue;
        if (rng() < 0.12) continue; // aisles / gaps
        const px = gx + (rng() - 0.5) * 0.3;
        const pz = gz + (rng() - 0.5) * 0.3;
        const variant = Math.floor(rng() * 2);
        const { rx, rz } = half("deskCluster", variant);
        if (!occ.claim(px + floorOff, pz, rx, rz)) continue;
        const rot = Math.floor(rng() * 4) * (Math.PI / 2);
        const scale = 0.95 + rng() * 0.1;
        objects.push(place("deskCluster", variant, [px, y, pz], rot, scale, "powderBlue", true));
        // an office chair tucked in
        objects.push(
          place("chair", Math.floor(rng() * 2), [px, y, pz + 0.6], rot + Math.PI, 0.95, "lavenderGray", false)
        );
        // occasional plant accent
        if (rng() < 0.25 && objects.length < budget) {
          objects.push(place("plant", 0, [px + 0.9, y, pz], 0, 1, "sageGreen", false));
        }
      }
    }
  }

  // a cleaning drone gliding the atrium (treated as creature)
  const creatures: CreatureSpec[] = [
    { kind: "drone", pos: [0, floorH * 0.6, 0], phase: rng() * Math.PI * 2, wander: 2.0 }
  ];

  return {
    objects,
    creatures,
    structuralField,
    anchors: structuralField.anchors,  };
};

// ============================================================================ //
//  LANDSCAPE — forests, rocks, grass + animal herds over fractal terrain        //
// ============================================================================ //
export const generateLandscapePlan: PlanFn = (level, seed, n): ScenePlan => {
  const rng = mulberry32((seed >>> 0) ^ Math.imul(level + 11, 0x85ebca6b));
  const ext: V3 = [24, 8, 24];
  const octaves = 2 + Math.min(level - 1, 4);
  const height = (x: number, z: number): number => {
    let a = 1.8;
    let fr = 0.14;
    let sum = 0.4;
    for (let o = 0; o < octaves; o++) {
      sum += smooth2(x * fr + seed, z * fr, seed + o * 7) * a;
      a *= 0.5;
      fr *= 2;
    }
    return sum;
  };
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
  const structuralField: SourceField = {
    n,
    ...f,
    spawn: { x: 0, z: 9 },
    look: { yaw: 0, pitch: -0.12 },
    anchors: Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2;
      const x = Math.cos(a) * 6;
      const z = Math.sin(a) * 6;
      return [x, height(x, z) + 1.5, z] as V3;
    }),
    name: "LANDSCAPE"
  };

  const objects: PlacedObject[] = [];
  const halfW = ext[0] / 2 - 0.5;
  // 800..2500, grass-dominated
  const budget = Math.min(2500, 800 + level * 200);
  const grassCount = Math.floor(budget * 0.7);
  const treeCount = Math.min(120, 40 + level * 12);
  const rockCount = Math.min(80, 30 + level * 8);

  // trees (solid) clustered away from spawn corridor
  let placed = 0;
  let guard = 0;
  while (placed < treeCount && guard++ < treeCount * 6) {
    const x = (rng() * 2 - 1) * halfW;
    const z = (rng() * 2 - 1) * halfW;
    if (Math.hypot(x, z - 9) < 2.5) continue; // keep spawn clear
    const variant = Math.floor(rng() * 3);
    const scale = 0.8 + rng() * 0.9;
    objects.push(place("tree", variant, [x, height(x, z) - 0.1, z], rng() * Math.PI * 2, scale, "sageGreen", true));
    placed++;
  }
  // rock pillars (solid)
  for (let i = 0; i < rockCount; i++) {
    const x = (rng() * 2 - 1) * halfW;
    const z = (rng() * 2 - 1) * halfW;
    const variant = Math.floor(rng() * 2);
    const scale = 0.6 + rng() * 1.1;
    objects.push(place("rockPillar", variant, [x, height(x, z) - 0.1, z], rng() * Math.PI * 2, scale, "shadow", scale > 0.7));
  }
  // grass clutter (non-solid) — the bulk, lives in 1-2 instanced meshes downstream
  for (let i = 0; i < grassCount; i++) {
    const x = (rng() * 2 - 1) * halfW;
    const z = (rng() * 2 - 1) * halfW;
    objects.push(place("grass", Math.floor(rng() * 2), [x, height(x, z) - 0.05, z], rng() * Math.PI * 2, 0.7 + rng() * 0.6, "sageGreen", false));
  }

  // herds: deer + birds + squirrels (a few, animated)
  const creatures: CreatureSpec[] = [];
  const herd = Math.min(18, 6 + level * 2);
  for (let i = 0; i < herd; i++) {
    const x = (rng() * 2 - 1) * (halfW - 2);
    const z = (rng() * 2 - 1) * (halfW - 2);
    const roll = rng();
    const kind = roll < 0.4 ? "deer" : roll < 0.75 ? "bird" : "squirrel";
    const y = kind === "bird" ? height(x, z) + 2 + rng() * 2 : height(x, z);
    creatures.push({ kind, pos: [x, y, z], phase: rng() * Math.PI * 2, wander: kind === "bird" ? 3 : 1.6 });
  }

  return {
    objects,
    creatures,
    structuralField,
    anchors: structuralField.anchors,  };
};

// ============================================================================ //
//  STARSHIP — consoles, crates, pipes lining the cylindrical hull               //
// ============================================================================ //
export const generateStarshipPlan: PlanFn = (level, seed, n): ScenePlan => {
  const rng = mulberry32((seed >>> 0) ^ Math.imul(level + 17, 0xc2b2ae35));
  const ext: V3 = [10, 10, 18 + Math.min(level, 6) * 3];
  const cyY = ext[1] / 2;
  const R = 4;
  const shell = 0.5;
  const coreR = 2.2;
  const ringSpace = Math.max(1.8, 3 - level * 0.15);
  const modules = Array.from({ length: Math.min(level, 5) }, () => ({
    z: (rng() * 2 - 1) * (ext[2] / 2 - 2),
    s: 0.6 + rng() * 0.6
  }));
  const f = cubeField(n, ext, 0, (x, y, z) => {
    const rr = Math.hypot(x, y - cyY);
    if (rr > R - shell && rr < R && Math.abs(z) < ext[2] / 2 - 0.4) return true;
    if (Math.abs(z - Math.round(z / ringSpace) * ringSpace) < 0.2 && rr < R && rr > coreR - 0.4) return true;
    if (Math.abs(Math.abs(z) - (ext[2] / 2 - 0.5)) < 0.4 && rr < R) return true;
    for (const m of modules) if (Math.abs(z - m.z) < m.s && rr < coreR && rr > coreR - 0.5) return true;
    return false;
  });
  const structuralField: SourceField = {
    n,
    ...f,
    spawn: { x: 0, z: 0 },
    look: { yaw: 0, pitch: 0.02 },
    anchors: Array.from({ length: 8 }, (_, i) => [0, cyY, -ext[2] / 2 + 2 + i * (ext[2] - 4) / 7] as V3),
    name: "STARSHIP"
  };

  const objects: PlacedObject[] = [];
  const zLen = ext[2] - 2;
  const z0 = -ext[2] / 2 + 1;
  // 150..400 consoles/crates/pipes along the corridor walls
  const budget = Math.min(400, 150 + level * 40);
  const rows = Math.floor(zLen / 1.4);

  for (let r = 0; r < rows && objects.length < budget; r++) {
    const z = z0 + r * 1.4 + (rng() - 0.5) * 0.3;
    // a console on each side, against the hull at floor level (y ~ floor of cyl)
    for (const side of [-1, 1]) {
      if (rng() < 0.2) continue;
      const x = side * (R - shell - 0.6);
      const variant = Math.floor(rng() * 2);
      const rot = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      const roll = rng();
      const type = roll < 0.55 ? "console" : roll < 0.85 ? "crate" : "pipe";
      const yFloor = cyY - (R - shell) + 0.05;
      const scale = 0.9 + rng() * 0.2;
      objects.push(place(type, variant, [x, yFloor, z], rot, scale, "powderBlue", true));
      if (objects.length >= budget) break;
    }
    // ceiling pipes running along the top of the hull
    if (rng() < 0.5 && objects.length < budget) {
      objects.push(place("pipe", 0, [(rng() - 0.5) * 1.5, cyY + R - shell - 0.4, z], 0, 1, "lavenderGray", false));
    }
  }

  // optional maintenance drone deeper in
  const creatures: CreatureSpec[] = [];
  if (level >= 2) {
    creatures.push({ kind: "drone", pos: [0, cyY, 0], phase: rng() * Math.PI * 2, wander: 2.5 });
  }

  return {
    objects,
    creatures,
    structuralField,
    anchors: structuralField.anchors,  };
};

// ============================================================================ //
//  PLANET — surface flora, rocks, structures hugging the sphere                 //
// ============================================================================ //
export const generatePlanetPlan: PlanFn = (level, seed, n): ScenePlan => {
  const rng = mulberry32((seed >>> 0) ^ Math.imul(level + 23, 0x27d4eb2f));
  const ext: V3 = [16, 16, 16];
  const center: V3 = [0, 8, 0];
  const R = 5;
  const octaves = 2 + Math.min(level - 1, 4);
  const hasRing = level >= 3;
  const bumpAt = (dx: number, dy: number, dz: number): number => {
    let bump = 0;
    let a = 0.9;
    let fr = 0.5;
    for (let o = 0; o < octaves; o++) {
      bump += (smooth2(dx * fr + seed, dz * fr + dy * fr, seed + o * 5) - 0.5) * a;
      a *= 0.5;
      fr *= 2;
    }
    return bump;
  };
  const f = cubeField(n, ext, 0, (x, y, z) => {
    const dx = x - center[0];
    const dy = y - center[1];
    const dz = z - center[2];
    const d = Math.hypot(dx, dy, dz);
    if (d < R + bumpAt(dx, dy, dz)) return true;
    if (hasRing) {
      const ringR = Math.hypot(dx, dz);
      if (Math.abs(dy) < 0.25 && ringR > R + 1.5 && ringR < R + 3) return true;
    }
    return false;
  });
  const structuralField: SourceField = {
    n,
    ...f,
    spawn: { x: 0, z: 0 },
    look: { yaw: 0, pitch: 0.42 },
    anchors: Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2;
      return [
        center[0] + Math.cos(a) * (R + 1.6),
        center[1] + Math.sin(a * 1.7) * 2,
        center[2] + Math.sin(a) * (R + 1.6)
      ] as V3;
    }),
    name: "PLANET"
  };

  const objects: PlacedObject[] = [];
  // 300..900 surface flora/rocks/structures distributed on the sphere shell
  const budget = Math.min(900, 300 + level * 120);
  // Fibonacci-sphere sampling for an even, deterministic spread.
  const gv = (Math.sqrt(5) - 1) / 2; // golden ratio fraction
  for (let i = 0; i < budget; i++) {
    const t = (i + 0.5) / budget;
    const phi = Math.acos(1 - 2 * t); // polar
    const theta = 2 * Math.PI * gv * i; // azimuth
    const ux = Math.sin(phi) * Math.cos(theta);
    const uy = Math.cos(phi);
    const uz = Math.sin(phi) * Math.sin(theta);
    const surfR = R + bumpAt(ux * R, uy * R, uz * R);
    const px = center[0] + ux * surfR;
    const py = center[1] + uy * surfR;
    const pz = center[2] + uz * surfR;
    // orient "up" away from the planet centre (yaw only; planners stay 2-DOF)
    const rot = Math.atan2(ux, uz);
    const roll = rng();
    let type: string;
    let key: string;
    let solid: boolean;
    if (roll < 0.5) {
      type = "alienFlora";
      key = "spectralMint";
      solid = false;
    } else if (roll < 0.85) {
      type = "rockPillar";
      key = "shadow";
      solid = true;
    } else {
      type = "planetStructure";
      key = "spectralViolet";
      solid = true;
    }
    const scale = 0.6 + rng() * 0.8;
    objects.push(place(type, Math.floor(rng() * 2), [px, py, pz], rot, scale, key, solid));
  }

  // alien grazers crawling the upper hemisphere
  const creatures: CreatureSpec[] = [];
  const grazers = Math.min(14, 4 + level * 2);
  for (let i = 0; i < grazers; i++) {
    const t = (i + 0.5) / grazers;
    const phi = Math.acos(1 - 2 * t * 0.5); // upper hemisphere
    const theta = 2 * Math.PI * gv * i;
    const ux = Math.sin(phi) * Math.cos(theta);
    const uy = Math.cos(phi);
    const uz = Math.sin(phi) * Math.sin(theta);
    const surfR = R + bumpAt(ux * R, uy * R, uz * R) + 0.3;
    creatures.push({
      kind: "alienGrazer",
      pos: [center[0] + ux * surfR, center[1] + uy * surfR, center[2] + uz * surfR],
      phase: rng() * Math.PI * 2,
      wander: 1.0
    });
  }

  return {
    objects,
    creatures,
    structuralField,
    anchors: structuralField.anchors,  };
};
