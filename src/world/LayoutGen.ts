import { mulberry32 } from "../puzzles/LevelGen";

/**
 * Pure procedural floor-plan generator for the endless house. Rooms are grown by
 * accretion on an integer cell grid (each new room attaches flush to an existing
 * one with a doorway), guaranteeing a connected, non-overlapping layout. Wall
 * segments are derived from cell-edges (interior edges deduped, doorways left
 * open) and merged into runs. No Three.js here — just data, so it's unit-testable.
 */

export const CELL = 1.7; // metres per grid cell

export interface RoomRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface WallSeg {
  axis: "x" | "z"; // 'x' = wall runs along X at a fixed Z; 'z' = along Z at fixed X
  line: number; // the fixed coordinate (world)
  a: number; // span start (world)
  b: number; // span end (world)
}

export interface LayoutSpec {
  level: number;
  rooms: RoomRect[]; // interior rects (inset from walls) — node placement + bounds
  floors: RoomRect[]; // full cell rects — floor/ceiling planes
  walls: WallSeg[];
  doorways: { a: number; b: number }[]; // connected room-index pairs
  spawn: { x: number; z: number };
}

interface CellRoom {
  cx: number;
  cz: number;
  cw: number;
  ch: number;
}

/** Room count grows with depth, then caps. */
export function roomCount(level: number): number {
  return Math.min(3 + Math.floor((level - 1) / 1), 9);
}

const INSET = 0.5;

export function generateLayout(level: number, seed: number): LayoutSpec {
  const rng = mulberry32((seed >>> 0) ^ Math.imul(level + 1, 0x85ebca6b));
  const ri = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

  const count = roomCount(level);
  const rooms: CellRoom[] = [];
  const occ = new Map<string, number>();
  const ck = (x: number, z: number) => `${x},${z}`;
  const doorwaySet = new Set<string>();
  const doorways: { a: number; b: number }[] = [];

  const occupy = (r: CellRoom, idx: number): boolean => {
    for (let x = r.cx; x < r.cx + r.cw; x++)
      for (let z = r.cz; z < r.cz + r.ch; z++) if (occ.has(ck(x, z))) return false;
    for (let x = r.cx; x < r.cx + r.cw; x++) for (let z = r.cz; z < r.cz + r.ch; z++) occ.set(ck(x, z), idx);
    return true;
  };

  // spawn room
  const r0: CellRoom = { cx: 0, cz: 0, cw: ri(3, 4), ch: ri(3, 4) };
  occupy(r0, 0);
  rooms.push(r0);

  for (let i = 1; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 80 && !placed; attempt++) {
      const pIdx = ri(0, rooms.length - 1);
      const p = rooms[pIdx];
      const side = ri(0, 3); // 0 N(+z) 1 S(-z) 2 E(+x) 3 W(-x)
      const cw = ri(3, 5);
      const ch = ri(3, 5);
      let cx = 0;
      let cz = 0;
      if (side === 0 || side === 1) {
        cz = side === 0 ? p.cz + p.ch : p.cz - ch;
        cx = ri(p.cx - (cw - 2), p.cx + p.cw - 2); // ensure >=2 cells of x-overlap
      } else {
        cx = side === 2 ? p.cx + p.cw : p.cx - cw;
        cz = ri(p.cz - (ch - 2), p.cz + p.ch - 2);
      }
      const cand: CellRoom = { cx, cz, cw, ch };
      if (!occupy(cand, i)) continue;
      rooms.push(cand);

      // doorway on the shared border, in the overlap region
      if (side === 0 || side === 1) {
        const line = side === 0 ? p.cz + p.ch : p.cz; // shared z-line
        const ox0 = Math.max(p.cx, cx);
        const ox1 = Math.min(p.cx + p.cw, cx + cw);
        const dcx = ri(ox0, ox1 - 1);
        doorwaySet.add(`h:${line}:${dcx}`);
      } else {
        const line = side === 2 ? p.cx + p.cw : p.cx; // shared x-line
        const oz0 = Math.max(p.cz, cz);
        const oz1 = Math.min(p.cz + p.ch, cz + ch);
        const dcz = ri(oz0, oz1 - 1);
        doorwaySet.add(`v:${line}:${dcz}`);
      }
      doorways.push({ a: pIdx, b: i });
      placed = true;
    }
  }

  // ---- derive wall edges from cell sides (deduped via canonical keys) ----
  const edges = new Set<string>();
  for (const [k] of occ) {
    const [cx, cz] = k.split(",").map(Number);
    edges.add(`h:${cz}:${cx}`);
    edges.add(`h:${cz + 1}:${cx}`);
    edges.add(`v:${cx}:${cz}`);
    edges.add(`v:${cx + 1}:${cz}`);
  }
  const unit: WallSeg[] = [];
  for (const e of edges) {
    if (doorwaySet.has(e)) continue;
    const [type, lineS, cellS] = e.split(":");
    const line = Number(lineS);
    const cell = Number(cellS);
    if (type === "h") {
      const a = occ.get(ck(cell, line - 1)) ?? -1;
      const b = occ.get(ck(cell, line)) ?? -1;
      if (a === b) continue;
      unit.push({ axis: "x", line: line * CELL, a: cell * CELL, b: (cell + 1) * CELL });
    } else {
      const a = occ.get(ck(line - 1, cell)) ?? -1;
      const b = occ.get(ck(line, cell)) ?? -1;
      if (a === b) continue;
      unit.push({ axis: "z", line: line * CELL, a: cell * CELL, b: (cell + 1) * CELL });
    }
  }

  return {
    level,
    rooms: rooms.map((r) => ({
      x0: r.cx * CELL + INSET,
      z0: r.cz * CELL + INSET,
      x1: (r.cx + r.cw) * CELL - INSET,
      z1: (r.cz + r.ch) * CELL - INSET
    })),
    floors: rooms.map((r) => ({
      x0: r.cx * CELL,
      z0: r.cz * CELL,
      x1: (r.cx + r.cw) * CELL,
      z1: (r.cz + r.ch) * CELL
    })),
    walls: mergeWalls(unit),
    doorways,
    spawn: {
      x: (r0.cx + r0.cw / 2) * CELL,
      z: (r0.cz + r0.ch / 2) * CELL
    }
  };
}

/** Merge unit wall edges into long runs (fewer meshes). */
function mergeWalls(unit: WallSeg[]): WallSeg[] {
  const groups = new Map<string, WallSeg[]>();
  for (const w of unit) {
    const key = `${w.axis}:${w.line.toFixed(3)}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(w);
  }
  const out: WallSeg[] = [];
  for (const segs of groups.values()) {
    segs.sort((p, q) => p.a - q.a);
    let cur = { ...segs[0] };
    for (let i = 1; i < segs.length; i++) {
      if (Math.abs(segs[i].a - cur.b) < 1e-6) cur.b = segs[i].b;
      else {
        out.push(cur);
        cur = { ...segs[i] };
      }
    }
    out.push(cur);
  }
  return out;
}

/** Centre point of all rooms (used to place ambient set-dressing). */
export function layoutCenter(spec: LayoutSpec): { x: number; z: number } {
  let x = 0;
  let z = 0;
  for (const r of spec.rooms) {
    x += (r.x0 + r.x1) / 2;
    z += (r.z0 + r.z1) / 2;
  }
  const n = Math.max(1, spec.rooms.length);
  return { x: x / n, z: z / n };
}
