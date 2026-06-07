import * as THREE from "three";
import { Palette } from "../world/Palette";
import { geoFor, farGeoFor, aabbFor } from "../world/ObjectLibrary";
import {
  makeCreature,
  animateCreature,
  type CreatureKind,
  type CreatureRig
} from "../world/ProceduralCreatures";
import { pastel } from "../world/Materials";
import type { PlacedObject, CreatureSpec, EstablishingShot } from "../world/ScenePlan";

/**
 * RealityScene — the populated, walk-through Reality view of one world.
 *
 * Reality is materialized from a {@link ScenePlan} as InstancedMesh POOLS: one
 * shared MeshToonMaterial({ vertexColors:true }) per `type|variant`, one
 * InstancedMesh per pool (capped at 512 instances; overflow splits into extra
 * meshes reusing the SAME cached geometry). Each instance differs only by a
 * matrix (position + yaw + uniform scale) and a per-instance palette tint, so
 * thousands of objects cost only a handful of draw calls.
 *
 * High-vertex types keep a cheap far-LOD proxy InstancedMesh; per frame, only
 * instances inside frustum-visible 8³ cells are distance-tested — beyond the
 * fade distance they get a zero-scale matrix (sort-free cull), and beyond the
 * LOD swap distance they move from the near pool to the far proxy pool.
 *
 * A small, capped set of individually animated creature Groups (NOT instanced,
 * NOT voxelized, NOT collided) is added for cosmetic life.
 *
 * This group is shown ONLY in the `reality` and `establishing` states; the
 * Fourier isosurface mesh takes over in `spectral`/`restored`. The voxel solid
 * field (collision) is identical in both views, so movement stays registered.
 */

/** Resolver from a plan's `colorKey` string to a concrete tint. */
export interface RealityPalette {
  colorFor(key: string): THREE.Color;
}

/**
 * Default palette resolver: maps a `colorKey` to its entry in the central
 * pastel {@link Palette}, falling back to warm cream for unknown keys.
 */
export const defaultRealityPalette: RealityPalette = {
  colorFor(key: string): THREE.Color {
    const hex = (Palette as Record<string, number>)[key];
    return new THREE.Color(hex ?? Palette.warmCream);
  }
};

/** Per-InstancedMesh cap; overflow spills into another mesh of the same geo. */
const INSTANCE_CAP = 512;
/** Spatial-bin resolution (matches the core bounds; 8³ cells). */
const BINS = 8;
/** LOD swap distance: near geo within, far proxy beyond. */
const LOD_SWAP = 20;
/** Distance fades (zero-scale beyond). */
const FADE_DESKTOP = 40;
const FADE_MOBILE = 28;
/** Visible-instance caps from the PERF BUDGET. */
const MAX_VISIBLE_DESKTOP = 2000;
const MAX_VISIBLE_MOBILE = 1200;
/** Individual creature caps. */
const MAX_CREATURES_DESKTOP = 40;
const MAX_CREATURES_MOBILE = 24;

const ZERO_SCALE = new THREE.Matrix4().makeScale(0, 0, 0);

/** A pool of one geometry rendered across one or more capped InstancedMeshes. */
interface Pool {
  /** the cached geometry (NOT owned — never disposed here) */
  geo: THREE.BufferGeometry;
  /** shared material (owned — disposed here) */
  mat: THREE.MeshToonMaterial;
  /** the capped InstancedMeshes (owned — disposed here) */
  meshes: THREE.InstancedMesh[];
}

/** Per-instance immutable transform + which pools host it. */
interface Inst {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  scale: number;
  color: THREE.Color;
  /** key into `nearPools` */
  nearKey: string;
  /** slot within the near pool (which mesh + which instance index) */
  nearMesh: number;
  nearIndex: number;
  /** far proxy slot, or -1 if this type has no far proxy */
  farKey: string | null;
  farMesh: number;
  farIndex: number;
  /** which cell this instance lives in (flattened 8³ index) */
  cell: number;
}

/** One 8³ spatial cell: the instances it holds + its world-space AABB. */
interface Cell {
  indices: number[];
  box: THREE.Box3;
  /** last applied visibility, so we only rewrite matrices on change */
  lastVisible: number; // -1 unknown, 0 hidden, 1 near, mix handled per-instance
}

const _m = new THREE.Matrix4();
const _scaleVec = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _frustum = new THREE.Frustum();
const _projScreen = new THREE.Matrix4();

/** Coerce a plan's free-form creature kind string to a known CreatureKind. */
function asCreatureKind(kind: string): CreatureKind {
  switch (kind) {
    case "cat":
    case "goldfish":
    case "deer":
    case "bird":
    case "squirrel":
    case "alienGrazer":
    case "drone":
      return kind;
    default:
      return "drone";
  }
}

export class RealityScene {
  readonly group = new THREE.Group();

  /** near-geo pools keyed by `type|variant` */
  private nearPools = new Map<string, Pool>();
  /** far-proxy pools keyed by `type` */
  private farPools = new Map<string, Pool>();
  private instances: Inst[] = [];
  private cells: Cell[] = [];
  private creatures: CreatureRig[] = [];

  private fade = FADE_DESKTOP;
  private boundsMin = new THREE.Vector3();
  private cellSize = new THREE.Vector3(1, 1, 1);

  /**
   * Materialize a plan into instanced pools + creature rigs. Replaces any prior
   * build (disposes owned GPU resources first).
   */
  build(
    population: PlacedObject[],
    creatures: CreatureSpec[],
    _establishing: EstablishingShot | undefined,
    palette: RealityPalette,
    mobile: boolean
  ): void {
    this.disposeContents();
    this.fade = mobile ? FADE_MOBILE : FADE_DESKTOP;

    const objects = this.capObjects(population, mobile);
    this.computeBounds(objects);
    this.initCells();

    // Tally how many instances each near/far pool needs so we can pre-size.
    const nearCount = new Map<string, number>();
    const farCount = new Map<string, number>();
    for (const o of objects) {
      const nk = `${o.type}|${o.variant}`;
      nearCount.set(nk, (nearCount.get(nk) ?? 0) + 1);
      if (farGeoFor(o.type)) {
        farCount.set(o.type, (farCount.get(o.type) ?? 0) + 1);
      }
    }

    // Allocate the pools (one or more capped InstancedMeshes each).
    for (const [nk, count] of nearCount) {
      const [type, variantStr] = nk.split("|");
      const variant = Number(variantStr);
      const geo = geoFor(type, variant, 1);
      this.nearPools.set(nk, this.makePool(geo, count));
    }
    for (const [type, count] of farCount) {
      const geo = farGeoFor(type);
      if (geo) this.farPools.set(type, this.makePool(geo, count));
    }

    // Per-pool running fill cursor.
    const nearCursor = new Map<string, number>();
    const farCursor = new Map<string, number>();

    for (const o of objects) {
      const nk = `${o.type}|${o.variant}`;
      const nearSlot = nearCursor.get(nk) ?? 0;
      nearCursor.set(nk, nearSlot + 1);

      let farKey: string | null = null;
      let farMesh = -1;
      let farIndex = -1;
      if (this.farPools.has(o.type)) {
        farKey = o.type;
        const farSlot = farCursor.get(o.type) ?? 0;
        farCursor.set(o.type, farSlot + 1);
        farMesh = Math.floor(farSlot / INSTANCE_CAP);
        farIndex = farSlot % INSTANCE_CAP;
      }

      const pos = new THREE.Vector3(o.pos[0], o.pos[1], o.pos[2]);
      const quat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        o.rot
      );
      const color = palette.colorFor(o.colorKey);

      const inst: Inst = {
        pos,
        quat,
        scale: o.scale,
        color,
        nearKey: nk,
        nearMesh: Math.floor(nearSlot / INSTANCE_CAP),
        nearIndex: nearSlot % INSTANCE_CAP,
        farKey,
        farMesh,
        farIndex,
        cell: this.cellIndexFor(pos)
      };
      this.instances.push(inst);
      this.cells[inst.cell].indices.push(this.instances.length - 1);

      // Seed colors once (matrices are filled by the first update()).
      const near = this.nearPools.get(nk)!.meshes[inst.nearMesh];
      near.setColorAt(inst.nearIndex, color);
      if (farKey) {
        const far = this.farPools.get(farKey)!.meshes[farMesh];
        far.setColorAt(farIndex, color);
      }
    }

    // Push color attributes once; matrices update per frame.
    for (const pool of this.nearPools.values())
      for (const mesh of pool.meshes)
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    for (const pool of this.farPools.values())
      for (const mesh of pool.meshes)
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // Creatures: capped, individually animated Groups.
    this.buildCreatures(this.capCreatures(creatures, mobile), palette);

    // Give every pool a world-covering boundingSphere so three's whole-mesh
    // frustum cull never drops a pool: instances start zero-scaled at the
    // origin, so the auto-computed sphere would be wrong. Per-instance culling
    // (zero-scale by cell/distance) does the real work each frame.
    const center = this.boundsMin
      .clone()
      .addScaledVector(this.cellSize, BINS * 0.5);
    const radius = this.cellSize.length() * BINS * 0.5 + 1;
    const sphere = new THREE.Sphere(center, radius);
    for (const pool of this.nearPools.values())
      for (const mesh of pool.meshes) mesh.boundingSphere = sphere.clone();
    for (const pool of this.farPools.values())
      for (const mesh of pool.meshes) mesh.boundingSphere = sphere.clone();
  }

  /** Trim the object list to the visible-instance cap, keeping order stable. */
  private capObjects(objects: PlacedObject[], mobile: boolean): PlacedObject[] {
    const cap = mobile ? MAX_VISIBLE_MOBILE : MAX_VISIBLE_DESKTOP;
    return objects.length > cap ? objects.slice(0, cap) : objects;
  }

  private capCreatures(creatures: CreatureSpec[], mobile: boolean): CreatureSpec[] {
    const cap = mobile ? MAX_CREATURES_MOBILE : MAX_CREATURES_DESKTOP;
    return creatures.length > cap ? creatures.slice(0, cap) : creatures;
  }

  /** Build N capped InstancedMeshes sharing one geometry + one toon material. */
  private makePool(geo: THREE.BufferGeometry, count: number): Pool {
    // White-based toon material; the per-instance + per-vertex colors tint it,
    // so one shared material covers a whole pool (one draw call per mesh).
    const mat = pastel(0xffffff) as THREE.MeshToonMaterial;
    mat.vertexColors = true;
    const meshCount = Math.max(1, Math.ceil(count / INSTANCE_CAP));
    const meshes: THREE.InstancedMesh[] = [];
    for (let i = 0; i < meshCount; i++) {
      const remaining = count - i * INSTANCE_CAP;
      const cap = Math.min(INSTANCE_CAP, remaining);
      const mesh = new THREE.InstancedMesh(geo, mat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = true;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      // start fully culled; update() fills visible instances each frame
      for (let k = 0; k < cap; k++) mesh.setMatrixAt(k, ZERO_SCALE);
      mesh.instanceMatrix.needsUpdate = true;
      meshes.push(mesh);
      this.group.add(mesh);
    }
    return { geo, mat, meshes };
  }

  // ---------------- spatial binning ----------------

  private computeBounds(objects: PlacedObject[]): void {
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const o of objects) {
      const ext = aabbFor(o.type);
      const r = (Math.max(ext.half[0], ext.half[1], ext.half[2]) + 1) * o.scale;
      min.min(new THREE.Vector3(o.pos[0] - r, o.pos[1] - r, o.pos[2] - r));
      max.max(new THREE.Vector3(o.pos[0] + r, o.pos[1] + r, o.pos[2] + r));
    }
    if (!Number.isFinite(min.x)) {
      min.set(-1, -1, -1);
      max.set(1, 1, 1);
    }
    this.boundsMin.copy(min);
    this.cellSize.set(
      Math.max(1e-3, (max.x - min.x) / BINS),
      Math.max(1e-3, (max.y - min.y) / BINS),
      Math.max(1e-3, (max.z - min.z) / BINS)
    );
  }

  private initCells(): void {
    this.cells = [];
    for (let z = 0; z < BINS; z++)
      for (let y = 0; y < BINS; y++)
        for (let x = 0; x < BINS; x++) {
          const bmin = new THREE.Vector3(
            this.boundsMin.x + x * this.cellSize.x,
            this.boundsMin.y + y * this.cellSize.y,
            this.boundsMin.z + z * this.cellSize.z
          );
          const bmax = bmin.clone().add(this.cellSize);
          this.cells.push({
            indices: [],
            box: new THREE.Box3(bmin, bmax),
            lastVisible: -1
          });
        }
  }

  private cellIndexFor(p: THREE.Vector3): number {
    const cx = THREE.MathUtils.clamp(
      Math.floor((p.x - this.boundsMin.x) / this.cellSize.x),
      0,
      BINS - 1
    );
    const cy = THREE.MathUtils.clamp(
      Math.floor((p.y - this.boundsMin.y) / this.cellSize.y),
      0,
      BINS - 1
    );
    const cz = THREE.MathUtils.clamp(
      Math.floor((p.z - this.boundsMin.z) / this.cellSize.z),
      0,
      BINS - 1
    );
    return cx + cy * BINS + cz * BINS * BINS;
  }

  // ---------------- creatures ----------------

  private buildCreatures(specs: CreatureSpec[], palette: RealityPalette): void {
    const keys = [
      "sageGreen",
      "dustyRose",
      "powderBlue",
      "lavenderGray",
      "sandstone"
    ] as const;
    let i = 0;
    for (const spec of specs) {
      // deterministic pastel key per creature (default palette tints the rig)
      const colorKey = keys[i % keys.length];
      const rig = makeCreature(asCreatureKind(spec.kind), colorKey);
      const tint = palette.colorFor(colorKey);
      applyTint(rig, tint);
      rig.phase = spec.phase;
      rig.wander.origin.set(spec.pos[0], spec.pos[1], spec.pos[2]);
      rig.wander.radius = Math.max(0, spec.wander);
      rig.group.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
      this.creatures.push(rig);
      this.group.add(rig.group);
      i++;
    }
  }

  // ---------------- per-frame update ----------------

  /**
   * Per frame: frustum-cull cells, distance-test instances in visible cells
   * (zero-scale beyond fade, swap near/far at the LOD distance), then animate
   * creatures. Hidden cells are zeroed once and skipped until they reappear.
   */
  update(camera: THREE.Camera, time: number): void {
    camera.getWorldPosition(_camPos);
    _projScreen.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    _frustum.setFromProjectionMatrix(_projScreen);

    const dirtyNear = new Set<THREE.InstancedMesh>();
    const dirtyFar = new Set<THREE.InstancedMesh>();
    const fade2 = this.fade * this.fade;
    const swap2 = LOD_SWAP * LOD_SWAP;

    for (const cell of this.cells) {
      if (cell.indices.length === 0) continue;
      const visible = _frustum.intersectsBox(cell.box) ? 1 : 0;

      if (visible === 0) {
        // hide once, then skip until it re-enters the frustum
        if (cell.lastVisible === 0) continue;
        for (const idx of cell.indices) {
          const inst = this.instances[idx];
          this.setInstance(inst, false, false, dirtyNear, dirtyFar);
        }
        cell.lastVisible = 0;
        continue;
      }

      // visible: distance-test every instance in the cell
      for (const idx of cell.indices) {
        const inst = this.instances[idx];
        const d2 = inst.pos.distanceToSquared(_camPos);
        if (d2 > fade2) {
          this.setInstance(inst, false, false, dirtyNear, dirtyFar);
        } else if (inst.farKey && d2 > swap2) {
          this.setInstance(inst, false, true, dirtyNear, dirtyFar);
        } else {
          this.setInstance(inst, true, false, dirtyNear, dirtyFar);
        }
      }
      // mark "visible/mixed" so we re-test next frame (never short-circuit)
      cell.lastVisible = 1;
    }

    for (const mesh of dirtyNear) mesh.instanceMatrix.needsUpdate = true;
    for (const mesh of dirtyFar) mesh.instanceMatrix.needsUpdate = true;

    // creatures: distance-driven LOD + procedural motion
    for (const rig of this.creatures) {
      const dist = rig.group.position.distanceTo(_camPos);
      animateCreature(rig, time, dist);
    }
  }

  /**
   * Drive one instance's two pool slots. `near` shows the detailed geometry,
   * `far` shows the proxy; both false zero-scales it out. Exactly one of
   * near/far should be true (or neither).
   */
  private setInstance(
    inst: Inst,
    near: boolean,
    far: boolean,
    dirtyNear: Set<THREE.InstancedMesh>,
    dirtyFar: Set<THREE.InstancedMesh>
  ): void {
    const nearMesh = this.nearPools.get(inst.nearKey)!.meshes[inst.nearMesh];
    if (near) {
      _scaleVec.setScalar(inst.scale);
      _m.compose(inst.pos, inst.quat, _scaleVec);
      nearMesh.setMatrixAt(inst.nearIndex, _m);
    } else {
      nearMesh.setMatrixAt(inst.nearIndex, ZERO_SCALE);
    }
    dirtyNear.add(nearMesh);

    if (inst.farKey) {
      const farMesh = this.farPools.get(inst.farKey)!.meshes[inst.farMesh];
      if (far) {
        _scaleVec.setScalar(inst.scale);
        _m.compose(inst.pos, inst.quat, _scaleVec);
        farMesh.setMatrixAt(inst.farIndex, _m);
      } else {
        farMesh.setMatrixAt(inst.farIndex, ZERO_SCALE);
      }
      dirtyFar.add(farMesh);
    }
  }

  // ---------------- teardown ----------------

  /** Dispose owned materials + InstancedMeshes + creature geometries. Cached
   *  prop geometries (owned by ObjectLibrary) are NEVER disposed here. */
  dispose(): void {
    this.disposeContents();
  }

  private disposeContents(): void {
    for (const pool of this.nearPools.values()) {
      for (const mesh of pool.meshes) {
        this.group.remove(mesh);
        mesh.dispose();
      }
      pool.mat.dispose();
    }
    for (const pool of this.farPools.values()) {
      for (const mesh of pool.meshes) {
        this.group.remove(mesh);
        mesh.dispose();
      }
      pool.mat.dispose();
    }
    for (const rig of this.creatures) {
      this.group.remove(rig.group);
      disposeRig(rig.group);
    }
    this.nearPools.clear();
    this.farPools.clear();
    this.instances = [];
    this.cells = [];
    this.creatures = [];
  }
}

/** Re-tint every mesh part of a creature rig toward a world-matched pastel.
 *  Lerps in place so the procedural creature still reads as itself. */
function applyTint(rig: CreatureRig, tint: THREE.Color): void {
  rig.group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const c = (mat as THREE.MeshToonMaterial | undefined)?.color;
    if (c) c.lerp(tint, 0.5);
  });
}

/** Dispose all geometries + materials under a creature Group. */
function disposeRig(group: THREE.Group): void {
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) m?.dispose();
  });
}
