import type { SourceField, V3 } from "./Archetypes";

/**
 * ScenePlan — the bird's-eye, asset-free description of one environment.
 *
 * It is the SINGLE SOURCE OF TRUTH that decouples the two outputs of a world:
 *   (1) REALITY  — a densely-populated place: thousands of typed `PlacedObject`s
 *       (rendered as THREE.InstancedMesh pools by RealityScene) plus a few
 *       animated `CreatureSpec`s.
 *   (2) SPECTRAL — the existing Fourier view: `structuralField` (the shell) plus
 *       every solid placed object rasterized into the N^3 density field
 *       (`voxelizeScenePlan`), then FFT'd into band isosurfaces.
 *
 * This module is PURE DATA — it imports no THREE, so it is safe to construct and
 * structured-clone across the spectral worker boundary. Planners produce a
 * ScenePlan; the voxelizer, RealityScene, SpectralCompute and SpectralCore all
 * consume it.
 */

/** Re-exported so downstream files can `import { SourceField, V3 } from "./ScenePlan"`. */
export type { SourceField, V3 };

/**
 * One placed, instanceable object in Reality.
 * `type`/`variant` key into ObjectLibrary's cached geometry; `colorKey` picks a
 * pastel palette tint; `solid` controls whether it is rasterized into the
 * spectral density field; `animated` flags light per-instance motion (e.g. sway).
 */
export interface PlacedObject {
  /** ObjectLibrary PropType id (e.g. "sofa", "tree", "console"). */
  type: string;
  /** Geometry variant index within the type (>= 0). */
  variant: number;
  /** World-space position [x, y, z]. */
  pos: V3;
  /** Yaw in radians (objects are placed top-down, so only Y rotation). */
  rot: number;
  /** Uniform scale multiplier. */
  scale: number;
  /** Palette key for the per-instance tint. */
  colorKey: string;
  /** Whether this object's box is rasterized into the spectral density field. */
  solid: boolean;
  /** Whether the instance receives light procedural motion in Reality. */
  animated: boolean;
}

/**
 * One animated creature in Reality. Rendered as an individual `THREE.Group`
 * (capped low) by ProceduralCreatures — NOT instanced, NOT voxelized, and NOT
 * part of collision.
 */
export interface CreatureSpec {
  /** Creature archetype id (e.g. "bird", "critter", "drone"). */
  kind: string;
  /** World-space spawn position [x, y, z]. */
  pos: V3;
  /** Animation phase offset in radians, so a herd doesn't move in lockstep. */
  phase: number;
  /** Wander radius in world units around `pos`. */
  wander: number;
}

/**
 * Optional cinematic framing for the establishing shot. Pure numbers so it
 * survives the worker boundary; the Game orchestrator turns it into a camera move.
 */
export interface EstablishingShot {
  /** Camera position [x, y, z] for the framing. */
  from: V3;
  /** Point the camera looks at [x, y, z]. */
  to: V3;
  /** Seconds the establishing move should take. */
  duration: number;
}

/**
 * A full bird's-eye plan for one environment at a given (level, seed).
 * `structuralField` keeps the EXACT existing `SourceField` shape so no
 * downstream type changes are needed.
 */
export interface ScenePlan {
  /** Thousands of instanceable Reality objects, placed intentionally top-down. */
  objects: PlacedObject[];
  /** A small set of individually animated creatures. */
  creatures: CreatureSpec[];
  /** The structural shell field (walls/terrain/hull) — unchanged SourceField. */
  structuralField: SourceField;
  /** Interior points of interest for anomaly/decoy placement. */
  anchors: V3[];
  /** Optional cinematic framing for the establishing shot. */
  establishing?: EstablishingShot;
}

/** A per-archetype planner: deterministic in (level, seed) for a grid size n. */
export type PlanFn = (level: number, seed: number, n: number) => ScenePlan;

/**
 * Build an empty plan from an existing structural field — no objects, no
 * creatures. Used as a fallback and by planners that only emit a shell.
 */
export function emptyPlan(field: SourceField): ScenePlan {
  return {
    objects: [],
    creatures: [],
    structuralField: field,
    anchors: field.anchors
  };
}
