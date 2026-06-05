/**
 * Pure, deterministic procedural generator for the endless "Descent" mode.
 * Given a level number + session seed it produces a solvable resonance puzzle
 * whose difficulty escalates: more nodes, more bands, dependency chains, decoys,
 * and a tightening phase tolerance. No Three.js here — just data, so it is
 * cheap to unit-test for determinism and solvability.
 */

/** Deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GenNode {
  id: number;
  room: number; // 0 living, 1 hallway, 2 back
  pos: [number, number, number];
  band: number; // 0..bands-1
  basePhase: number; // 0..1 hidden target before dependency offset
  decoy: boolean;
  /** id of the real node this one depends on, or -1. Always a lower id (DAG). */
  parent: number;
  /** phase offset applied to basePhase once the parent is locked. */
  offset: number;
}

export interface LevelSpec {
  level: number;
  bands: number; // bands in play (2..3)
  tolerance: number; // phase lock half-window
  nodes: GenNode[];
  realIds: number[];
}

/** Room footprints (x range, z range) the generator scatters nodes within. */
const ROOM_BOUNDS = [
  { x: [-2.3, 2.3], z: [-3.2, 2.2] }, // living
  { x: [-0.85, 0.85], z: [-8.4, -4.6] }, // hallway
  { x: [-2.3, 2.3], z: [-12.4, -9.6] } // back
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Difficulty knobs as a function of (1-based) level. */
export function difficulty(level: number) {
  return {
    realCount: Math.min(2 + Math.floor((level - 1) / 2), 6),
    decoyCount: Math.min(Math.floor((level - 1) / 2), 4),
    bands: Math.min(2 + Math.floor((level - 1) / 4), 3),
    depCount: Math.min(Math.floor((level - 1) / 2), 5),
    tolerance: clamp(0.12 - (level - 1) * 0.008, 0.045, 0.12)
  };
}

export function generateLevel(level: number, seed: number): LevelSpec {
  const rng = mulberry32((seed >>> 0) ^ Math.imul(level + 1, 0x9e3779b1));
  const d = difficulty(level);
  const depCount = Math.min(d.depCount, Math.max(0, d.realCount - 1));

  const nodes: GenNode[] = [];
  const place = (id: number, decoy: boolean): GenNode => {
    const room = id % 3;
    const b = ROOM_BOUNDS[room];
    return {
      id,
      room,
      pos: [lerp(b.x[0], b.x[1], rng()), lerp(1.2, 1.85, rng()), lerp(b.z[0], b.z[1], rng())],
      band: Math.floor(rng() * d.bands),
      basePhase: lerp(0.22, 0.78, rng()),
      decoy,
      parent: -1,
      offset: 0
    };
  };

  for (let i = 0; i < d.realCount; i++) nodes.push(place(i, false));
  for (let i = 0; i < d.decoyCount; i++) nodes.push(place(d.realCount + i, true));

  // dependency chain among real nodes: each picked child depends on a lower id,
  // keeping a DAG so a valid solve order (ascending id) always exists.
  const candidates: number[] = [];
  for (let i = 1; i < d.realCount; i++) candidates.push(i);
  for (let k = 0; k < depCount && candidates.length; k++) {
    const ci = Math.floor(rng() * candidates.length);
    const childId = candidates.splice(ci, 1)[0];
    nodes[childId].parent = Math.floor(rng() * childId); // any lower real id
    nodes[childId].offset = (0.12 + rng() * 0.22) * (rng() < 0.5 ? -1 : 1);
  }

  return {
    level,
    bands: d.bands,
    tolerance: d.tolerance,
    nodes,
    realIds: nodes.filter((n) => !n.decoy).map((n) => n.id)
  };
}

/**
 * The deterministic solution: each real node's final required phase, assuming
 * nodes are locked in ascending-id order (parents before children). Used by the
 * runtime, tests, and the headless smoke to drive a guaranteed solve.
 */
export function solutionPhases(spec: LevelSpec): Map<number, number> {
  const out = new Map<number, number>();
  for (const id of spec.realIds) {
    const n = spec.nodes[id];
    const eff = n.parent >= 0 ? n.basePhase + n.offset : n.basePhase;
    out.set(id, ((eff % 1) + 1) % 1); // wrap into 0..1
  }
  return out;
}
