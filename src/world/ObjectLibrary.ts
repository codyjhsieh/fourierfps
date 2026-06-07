import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Palette } from "./Palette";
import { softBox, inkOutline } from "./Geometry";
import {
  makeSofa,
  makeTable,
  makeLamp,
  makePlant,
  makeBookshelf,
  makeSideboard,
  makeChair,
  makeRug,
  makeBed,
  makeKitchenCounter,
  makePictureFrame
} from "./ProceduralProps";

/**
 * Type registry + geometry cache for the populated Reality scene.
 *
 * Every prop type owns a `makeGeo(variant, seed)` that builds a throwaway
 * THREE.Group from primitives (reusing the existing ProceduralProps makers
 * where possible) and then `flatten`s it into ONE vertex-colored BufferGeometry
 * suitable for THREE.InstancedMesh. Geometry is built once and memoized by
 * `id|variant`, so re-loading the same seed/level is allocation-free.
 *
 * No materials live here: RealityScene owns the single shared
 * MeshToonMaterial({ vertexColors:true }) per type. The library returns
 * geometry only.
 */

export type V3 = [number, number, number];

/** Axis-aligned bounding box in local prop space (for voxelization + culling). */
export interface AABB {
  /** half-extents on x/y/z */
  half: V3;
  /** center offset from the prop origin */
  center: V3;
}

export interface PropType {
  /** stable id, also a member of PROP_IDS */
  id: string;
  /** build a fresh, throwaway Group for the given variant + seed */
  makeGeo: (variant: number, seed: number) => THREE.Group;
  /** local bounding box used by the voxelizer + distance culling */
  aabb: AABB;
  /** does this object rasterize into the solid spectral field / block movement */
  solid: boolean;
  /** optional cheap far-LOD proxy geometry (already flattened) */
  far?: () => THREE.BufferGeometry;
  /** does this object sway gently in the wind (grass, foliage) */
  sway: boolean;
}

// ---------------------------------------------------------------------------
// flatten: Group -> one vertex-colored, non-indexed, normal'd BufferGeometry
// ---------------------------------------------------------------------------

const WHITE = new THREE.Color(0xffffff);

/**
 * Bake a Group's mesh children into a single merged BufferGeometry, writing
 * each child's material color into a per-vertex color attribute. Ink outlines
 * (LineSegments) and any object whose name contains "ink" are skipped — they
 * are a Reality-only cosmetic and would corrupt the merged solid.
 */
export function flatten(group: THREE.Group): THREE.BufferGeometry {
  group.updateWorldMatrix(true, true);
  const root = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const parts: THREE.BufferGeometry[] = [];
  const c = new THREE.Color();

  group.traverse((obj) => {
    if ((obj as THREE.LineSegments).isLineSegments) return;
    if (obj.name && obj.name.toLowerCase().includes("ink")) return;
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;

    mesh.updateWorldMatrix(true, false);
    // child transform relative to the group root
    const local = new THREE.Matrix4().multiplyMatrices(root, mesh.matrixWorld);

    let geo = mesh.geometry.clone();
    if (geo.index) geo = geo.toNonIndexed();
    geo.applyMatrix4(local);
    geo.deleteAttribute("uv");
    geo.deleteAttribute("uv2");
    geo.deleteAttribute("normal");

    // resolve a single representative color for this child
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const matColor = (mat as THREE.MeshStandardMaterial | undefined)?.color;
    c.copy(matColor ?? WHITE);

    const count = geo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3 + 0] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    parts.push(geo);
  });

  let merged: THREE.BufferGeometry | null = null;
  if (parts.length === 1) {
    merged = parts[0];
  } else if (parts.length > 1) {
    merged = mergeGeometries(parts, false);
  }
  if (!merged) {
    // degenerate: empty group → tiny placeholder so InstancedMesh stays valid
    merged = new THREE.BoxGeometry(0.001, 0.001, 0.001);
    const cnt = merged.attributes.position.count;
    merged.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(cnt * 3).fill(1), 3)
    );
  }
  merged.computeVertexNormals();
  return merged;
}

// ---------------------------------------------------------------------------
// small deterministic helpers for the NEW (non-apartment) geometry makers
// ---------------------------------------------------------------------------

function rngFrom(variant: number, seed: number): () => number {
  let s = (Math.imul(variant + 1, 0x9e3779b1) ^ Math.imul(seed + 7, 0x85ebca6b)) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pBox(
  w: number,
  h: number,
  d: number,
  color: number,
  outline = false
): THREE.Mesh {
  const geo = softBox(w, h, d);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
  if (outline) mesh.add(inkOutline(geo));
  return mesh;
}

function pCyl(
  rt: number,
  rb: number,
  h: number,
  color: number,
  seg = 12
): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(rt, rb, h, seg);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
}

function pCone(r: number, h: number, color: number, seg = 10): THREE.Mesh {
  const geo = new THREE.ConeGeometry(r, h, seg);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
}

function pIcosa(r: number, color: number, detail = 0): THREE.Mesh {
  const geo = new THREE.IcosahedronGeometry(r, detail);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
}

/** A solid colored box proxy for far-LOD. */
function boxProxy(w: number, h: number, d: number, color: number): THREE.BufferGeometry {
  const g = new THREE.Group();
  g.add(pBox(w, h, d, color));
  return flatten(g);
}

/** A solid colored cone proxy for far-LOD (trees etc.). */
function coneProxy(r: number, h: number, color: number): THREE.BufferGeometry {
  const g = new THREE.Group();
  const c = pCone(r, h, color, 7);
  c.position.y = h / 2;
  g.add(c);
  return flatten(g);
}

// ---------------------------------------------------------------------------
// NEW geometry makers — OFFICE
// ---------------------------------------------------------------------------

function makeDeskCluster(variant: number, seed: number): THREE.Group {
  const r = rngFrom(variant, seed);
  const g = new THREE.Group();
  const top = pBox(1.4, 0.06, 0.7, Palette.sandstone, true);
  top.position.y = 0.74;
  g.add(top);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const leg = pBox(0.05, 0.74, 0.05, Palette.ink);
      leg.position.set(sx * 0.65, 0.37, sz * 0.3);
      g.add(leg);
    }
  // monitor
  const mon = pBox(0.5, 0.32, 0.04, Palette.lavenderGray, true);
  mon.position.set(0, 1.0, -0.18);
  const stand = pBox(0.05, 0.18, 0.05, Palette.ink);
  stand.position.set(0, 0.83, -0.18);
  g.add(mon, stand);
  // chair behind
  const seat = pBox(0.42, 0.06, 0.42, Palette.powderBlue, true);
  seat.position.set(0, 0.46, 0.5);
  const back = pBox(0.42, 0.46, 0.05, Palette.powderBlue, true);
  back.position.set(0, 0.72, 0.7);
  g.add(seat, back);
  // a couple of clutter boxes
  const n = 1 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const cl = pBox(0.16, 0.1, 0.12, Palette.dustyRose);
    cl.position.set((r() - 0.5) * 0.9, 0.82, (r() - 0.5) * 0.4);
    g.add(cl);
  }
  return g;
}

function makeCubiclePartition(variant: number, seed: number): THREE.Group {
  const r = rngFrom(variant, seed);
  const g = new THREE.Group();
  const h = 1.2 + r() * 0.3;
  const panel = pBox(1.6, h, 0.06, Palette.sageGreen, true);
  panel.position.y = h / 2;
  g.add(panel);
  return g;
}

function makeFiles(variant: number, seed: number): THREE.Group {
  const r = rngFrom(variant, seed);
  const g = new THREE.Group();
  const drawers = 3 + Math.floor(r() * 2);
  const h = drawers * 0.32;
  const body = pBox(0.5, h, 0.55, Palette.lavenderGray, true);
  body.position.y = h / 2;
  g.add(body);
  for (let i = 0; i < drawers; i++) {
    const handle = pBox(0.18, 0.02, 0.02, Palette.ink);
    handle.position.set(0, 0.16 + i * 0.32, 0.29);
    g.add(handle);
  }
  return g;
}

function makeWaterCooler(_variant: number, _seed: number): THREE.Group {
  const g = new THREE.Group();
  const base = pBox(0.32, 0.9, 0.32, Palette.warmCream, true);
  base.position.y = 0.45;
  g.add(base);
  const bottle = pCyl(0.16, 0.18, 0.4, Palette.powderBlue, 12);
  bottle.position.y = 1.1;
  g.add(bottle);
  return g;
}

function makeOfficePlant(variant: number, seed: number): THREE.Group {
  const r = rngFrom(variant, seed);
  const g = new THREE.Group();
  const pot = pCyl(0.18, 0.14, 0.34, Palette.dustyRose, 10);
  pot.position.y = 0.17;
  g.add(pot);
  const leaves = 5 + Math.floor(r() * 4);
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2;
    const leaf = pCone(0.08, 0.6 + r() * 0.4, Palette.sageGreen, 4);
    leaf.position.set(Math.cos(a) * 0.06, 0.6, Math.sin(a) * 0.06);
    leaf.rotation.set(Math.cos(a) * 0.4, a, Math.sin(a) * 0.4);
    g.add(leaf);
  }
  return g;
}

// ---------------------------------------------------------------------------
// NEW geometry makers — LANDSCAPE
// ---------------------------------------------------------------------------

function makeTree(variant: number, seed: number): THREE.Group {
  const r = rngFrom(variant, seed);
  const g = new THREE.Group();
  const th = 1.6 + r() * 1.4;
  const trunk = pCyl(0.12, 0.2, th, Palette.sandstone, 6);
  trunk.position.y = th / 2;
  g.add(trunk);
  const tiers = 2 + Math.floor(r() * 2);
  for (let i = 0; i < tiers; i++) {
    const f = i / Math.max(1, tiers - 1);
    const blob = pIcosa(0.7 - f * 0.28 + r() * 0.1, Palette.sageGreen, 0);
    blob.position.y = th + 0.2 + i * 0.55;
    blob.scale.set(1, 0.85, 1);
    g.add(blob);
  }
  return g;
}

function makeRockPillar(variant: number, seed: number): THREE.Group {
  const r = rngFrom(variant, seed);
  const g = new THREE.Group();
  const h = 1.0 + r() * 2.2;
  const base = pIcosa(0.6 + r() * 0.5, Palette.shadow, 0);
  base.scale.set(1, h, 1);
  base.position.y = h * 0.5;
  base.rotation.y = r() * Math.PI;
  g.add(base);
  if (r() > 0.5) {
    const cap = pIcosa(0.4 + r() * 0.3, Palette.lavenderGray, 0);
    cap.position.y = h + 0.2;
    g.add(cap);
  }
  return g;
}

function makeBush(variant: number, seed: number): THREE.Group {
  const r = rngFrom(variant, seed);
  const g = new THREE.Group();
  const blobs = 2 + Math.floor(r() * 3);
  for (let i = 0; i < blobs; i++) {
    const b = pIcosa(0.3 + r() * 0.25, Palette.sageGreen, 0);
    b.position.set((r() - 0.5) * 0.6, 0.25 + r() * 0.2, (r() - 0.5) * 0.6);
    g.add(b);
  }
  return g;
}

function makeGrass(variant: number, seed: number): THREE.Group {
  const r = rngFrom(variant, seed);
  const g = new THREE.Group();
  const blades = 3 + Math.floor(r() * 3);
  for (let i = 0; i < blades; i++) {
    const h = 0.3 + r() * 0.4;
    const blade = pCone(0.03, h, Palette.spectralMint, 3);
    blade.position.set((r() - 0.5) * 0.18, h / 2, (r() - 0.5) * 0.18);
    blade.rotation.z = (r() - 0.5) * 0.5;
    g.add(blade);
  }
  return g;
}

function makeBoulder(variant: number, seed: number): THREE.Group {
  const r = rngFrom(variant, seed);
  const g = new THREE.Group();
  const b = pIcosa(0.5 + r() * 0.6, Palette.shadow, 0);
  b.scale.set(1 + r() * 0.4, 0.7 + r() * 0.3, 1 + r() * 0.4);
  b.position.y = 0.3;
  b.rotation.set(r(), r() * Math.PI, r());
  g.add(b);
  return g;
}

// ---------------------------------------------------------------------------
// NEW geometry makers — STARSHIP
// ---------------------------------------------------------------------------

function makeConsole(variant: number, seed: number): THREE.Group {
  const r = rngFrom(variant, seed);
  const g = new THREE.Group();
  const body = pBox(1.1, 0.9, 0.5, Palette.lavenderGray, true);
  body.position.y = 0.45;
  g.add(body);
  const screen = pBox(0.9, 0.5, 0.05, Palette.spectralBlue, true);
  screen.position.set(0, 0.7, 0.26);
  screen.rotation.x = -0.4;
  g.add(screen);
  const lights = 3 + Math.floor(r() * 3);
  for (let i = 0; i < lights; i++) {
    const led = pBox(0.06, 0.06, 0.02, r() > 0.5 ? Palette.spectralPink : Palette.spectralMint);
    led.position.set(-0.4 + i * 0.18, 0.3, 0.26);
    g.add(led);
  }
  return g;
}

function makeCrate(variant: number, seed: number): THREE.Group {
  const r = rngFrom(variant, seed);
  const g = new THREE.Group();
  const s = 0.5 + r() * 0.4;
  const body = pBox(s, s, s, Palette.sandstone, true);
  body.position.y = s / 2;
  g.add(body);
  // ribbing
  for (const sx of [-1, 1]) {
    const rib = pBox(0.04, s * 0.9, s * 0.95, Palette.ink);
    rib.position.set(sx * s * 0.46, s / 2, 0);
    g.add(rib);
  }
  return g;
}

function makePipe(variant: number, seed: number): THREE.Group {
  const r = rngFrom(variant, seed);
  const g = new THREE.Group();
  const len = 1.5 + r() * 1.5;
  const pipe = pCyl(0.1, 0.1, len, Palette.spectralBlue, 8);
  pipe.rotation.z = Math.PI / 2;
  pipe.position.y = 1.6 + r() * 0.6;
  g.add(pipe);
  for (const sx of [-1, 1]) {
    const flange = pCyl(0.14, 0.14, 0.08, Palette.lavenderGray, 8);
    flange.rotation.z = Math.PI / 2;
    flange.position.set(sx * len * 0.4, pipe.position.y, 0);
    g.add(flange);
  }
  return g;
}

function makePod(variant: number, seed: number): THREE.Group {
  const r = rngFrom(variant, seed);
  const g = new THREE.Group();
  const shell = pIcosa(0.55 + r() * 0.15, Palette.warmCream, 1);
  shell.scale.set(1, 1.3, 1);
  shell.position.y = 0.8;
  g.add(shell);
  const ring = pCyl(0.4, 0.4, 0.1, Palette.spectralViolet, 12);
  ring.position.y = 0.1;
  g.add(ring);
  return g;
}

function makeBulkhead(variant: number, seed: number): THREE.Group {
  const r = rngFrom(variant, seed);
  const g = new THREE.Group();
  const h = 2.4;
  const frame = pBox(1.6, h, 0.18, Palette.shadow, true);
  frame.position.y = h / 2;
  g.add(frame);
  const doorway = pBox(0.8, 1.6, 0.22, Palette.lavenderGray);
  doorway.position.y = 0.8;
  g.add(doorway);
  if (r() > 0.5) {
    const panel = pBox(0.2, 0.3, 0.04, Palette.spectralMint);
    panel.position.set(0.55, 1.3, 0.1);
    g.add(panel);
  }
  return g;
}

// ---------------------------------------------------------------------------
// NEW geometry makers — PLANET
// ---------------------------------------------------------------------------

function makeAlienFlora(variant: number, seed: number): THREE.Group {
  const r = rngFrom(variant, seed);
  const g = new THREE.Group();
  const th = 0.8 + r() * 1.2;
  const stalk = pCyl(0.05, 0.09, th, Palette.spectralViolet, 6);
  stalk.position.y = th / 2;
  g.add(stalk);
  const bulb = pIcosa(0.25 + r() * 0.2, Palette.spectralPink, 0);
  bulb.position.y = th + 0.1;
  g.add(bulb);
  const fronds = 3 + Math.floor(r() * 3);
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2;
    const fr = pCone(0.05, 0.4 + r() * 0.3, Palette.spectralMint, 3);
    fr.position.set(Math.cos(a) * 0.18, th * 0.6, Math.sin(a) * 0.18);
    fr.rotation.set(Math.cos(a), a, Math.sin(a));
    g.add(fr);
  }
  return g;
}

function makeCrystal(variant: number, seed: number): THREE.Group {
  const r = rngFrom(variant, seed);
  const g = new THREE.Group();
  const shards = 2 + Math.floor(r() * 3);
  for (let i = 0; i < shards; i++) {
    const h = 0.6 + r() * 1.4;
    const sh = pCone(0.18 + r() * 0.12, h, Palette.spectralBlue, 5);
    sh.position.set((r() - 0.5) * 0.4, h / 2, (r() - 0.5) * 0.4);
    sh.rotation.set((r() - 0.5) * 0.4, r() * Math.PI, (r() - 0.5) * 0.4);
    g.add(sh);
  }
  return g;
}

function makeAlienRock(variant: number, seed: number): THREE.Group {
  const r = rngFrom(variant, seed);
  const g = new THREE.Group();
  const b = pIcosa(0.5 + r() * 0.7, Palette.lavenderGray, 0);
  b.scale.set(1 + r() * 0.3, 0.8 + r() * 0.4, 1 + r() * 0.3);
  b.position.y = 0.35;
  b.rotation.set(r(), r() * Math.PI, r());
  g.add(b);
  return g;
}

function makeMonolith(variant: number, seed: number): THREE.Group {
  const r = rngFrom(variant, seed);
  const g = new THREE.Group();
  const h = 2.0 + r() * 1.5;
  const slab = pBox(0.6 + r() * 0.3, h, 0.3, Palette.ink, true);
  slab.position.y = h / 2;
  slab.rotation.y = r() * 0.4;
  g.add(slab);
  const glow = pBox(0.15, h * 0.6, 0.05, Palette.spectralViolet);
  glow.position.set(0, h * 0.5, 0.16);
  g.add(glow);
  return g;
}

function makeAlienStructure(variant: number, seed: number): THREE.Group {
  const r = rngFrom(variant, seed);
  const g = new THREE.Group();
  const base = pCyl(0.7, 0.9, 0.6, Palette.warmCream, 8);
  base.position.y = 0.3;
  g.add(base);
  const dome = pIcosa(0.6 + r() * 0.2, Palette.spectralMint, 1);
  dome.scale.y = 0.6;
  dome.position.y = 0.8;
  g.add(dome);
  const spire = pCone(0.12, 1.0 + r() * 0.6, Palette.spectralPink, 6);
  spire.position.y = 1.5;
  g.add(spire);
  return g;
}

function makeDebris(variant: number, seed: number): THREE.Group {
  const r = rngFrom(variant, seed);
  const g = new THREE.Group();
  const chunks = 2 + Math.floor(r() * 3);
  for (let i = 0; i < chunks; i++) {
    const ch = pBox(0.15 + r() * 0.25, 0.1 + r() * 0.2, 0.15 + r() * 0.25, Palette.shadow);
    ch.position.set((r() - 0.5) * 0.6, 0.1 + r() * 0.2, (r() - 0.5) * 0.6);
    ch.rotation.set(r(), r() * Math.PI, r());
    g.add(ch);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const registry = new Map<string, PropType>();
/** geometry cache keyed by `id|variant` */
const geoCache = new Map<string, THREE.BufferGeometry>();
const farCache = new Map<string, THREE.BufferGeometry>();

export function registerType(t: PropType): void {
  registry.set(t.id, t);
}

const warnedMissing = new Set<string>();
export function getType(id: string): PropType {
  const t = registry.get(id);
  if (t) return t;
  // Resilience: never crash a world on a name-drifted prop id — fall back.
  if (!warnedMissing.has(id)) {
    warnedMissing.add(id);
    if (typeof console !== "undefined") console.warn(`ObjectLibrary: unknown PropType "${id}", using fallback`);
  }
  return registry.get("crate") ?? registry.get("table") ?? registry.values().next().value!;
}

/** Flattened, vertex-colored geometry for an id+variant. Built once, cached. */
export function geoFor(id: string, variant: number, seed: number): THREE.BufferGeometry {
  const key = `${id}|${variant}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const t = getType(id);
  const geo = flatten(t.makeGeo(variant, seed));
  geoCache.set(key, geo);
  return geo;
}

/** Far-LOD proxy geometry for an id (or undefined if the type has no proxy). */
export function farGeoFor(id: string): THREE.BufferGeometry | undefined {
  const t = getType(id);
  if (!t.far) return undefined;
  const hit = farCache.get(id);
  if (hit) return hit;
  const geo = t.far();
  farCache.set(id, geo);
  return geo;
}

export function aabbFor(id: string): AABB {
  return getType(id).aabb;
}

export function isSolid(id: string): boolean {
  return getType(id).solid;
}

const aabb = (hx: number, hy: number, hz: number, cy = hy): AABB => ({
  half: [hx, hy, hz],
  center: [0, cy, 0]
});

// ---- APARTMENT (reuses ProceduralProps makers) ----------------------------

registerType({
  id: "sofa",
  makeGeo: () => makeSofa(),
  aabb: aabb(0.95, 0.5, 0.5, 0.5),
  solid: true,
  sway: false
});
registerType({
  id: "table",
  makeGeo: (v) => makeTable(1.0 + v * 0.2, 0.42, 0.6),
  aabb: aabb(0.6, 0.25, 0.35, 0.25),
  solid: true,
  sway: false
});
registerType({
  id: "chair",
  makeGeo: () => makeChair(),
  aabb: aabb(0.24, 0.4, 0.24, 0.4),
  solid: true,
  sway: false
});
registerType({
  id: "lamp",
  makeGeo: () => makeLamp(),
  aabb: aabb(0.22, 0.55, 0.22, 0.55),
  solid: false,
  sway: false
});
registerType({
  id: "plant",
  makeGeo: () => makePlant(),
  aabb: aabb(0.2, 0.3, 0.2, 0.3),
  solid: false,
  sway: true
});
registerType({
  id: "bookshelf",
  makeGeo: () => makeBookshelf(),
  aabb: aabb(0.5, 0.7, 0.16, 0.7),
  solid: true,
  far: () => boxProxy(1.0, 1.4, 0.32, Palette.sandstone),
  sway: false
});
registerType({
  id: "sideboard",
  makeGeo: () => makeSideboard(),
  aabb: aabb(0.8, 0.35, 0.23, 0.35),
  solid: true,
  sway: false
});
registerType({
  id: "rugProp",
  makeGeo: () => {
    const g = new THREE.Group();
    g.add(pBox(2.2, 0.04, 1.5, Palette.dustyRose));
    return g;
  },
  aabb: aabb(1.1, 0.02, 0.75, 0.02),
  solid: false,
  sway: false
});
// Aliases the apartment planner references (reuse the existing makers).
registerType({
  id: "rug",
  makeGeo: () => {
    const g = new THREE.Group();
    g.add(makeRug());
    return g;
  },
  aabb: aabb(1.2, 0.02, 0.8, 0.02),
  solid: false,
  sway: false
});
registerType({
  id: "bed",
  makeGeo: () => makeBed(),
  aabb: aabb(0.85, 0.32, 1.1, 0.32),
  solid: true,
  sway: false
});
registerType({
  id: "kitchenCounter",
  makeGeo: () => makeKitchenCounter(),
  aabb: aabb(1.0, 0.45, 0.32, 0.45),
  solid: true,
  sway: false
});
registerType({
  id: "pictureFrame",
  makeGeo: () => makePictureFrame(),
  aabb: aabb(0.22, 0.28, 0.03, 1.3),
  solid: false,
  sway: false
});

// ---- OFFICE ---------------------------------------------------------------

registerType({
  id: "deskCluster",
  makeGeo: (v, s) => makeDeskCluster(v, s),
  aabb: aabb(0.75, 0.55, 0.6, 0.55),
  solid: true,
  far: () => boxProxy(1.4, 1.0, 1.2, Palette.lavenderGray),
  sway: false
});
registerType({
  id: "cubiclePartition",
  makeGeo: (v, s) => makeCubiclePartition(v, s),
  aabb: aabb(0.8, 0.75, 0.05, 0.75),
  solid: true,
  sway: false
});
registerType({
  id: "fileCabinet",
  makeGeo: (v, s) => makeFiles(v, s),
  aabb: aabb(0.27, 0.6, 0.3, 0.6),
  solid: true,
  sway: false
});
registerType({
  id: "waterCooler",
  makeGeo: (v, s) => makeWaterCooler(v, s),
  aabb: aabb(0.18, 0.65, 0.18, 0.65),
  solid: true,
  sway: false
});
registerType({
  id: "officePlant",
  makeGeo: (v, s) => makeOfficePlant(v, s),
  aabb: aabb(0.4, 0.55, 0.4, 0.55),
  solid: false,
  sway: true
});

// ---- LANDSCAPE ------------------------------------------------------------

registerType({
  id: "tree",
  makeGeo: (v, s) => makeTree(v, s),
  aabb: aabb(0.8, 1.6, 0.8, 1.6),
  solid: true,
  far: () => coneProxy(0.9, 3.4, Palette.sageGreen),
  sway: true
});
registerType({
  id: "rockPillar",
  makeGeo: (v, s) => makeRockPillar(v, s),
  aabb: aabb(0.7, 1.5, 0.7, 1.5),
  solid: true,
  far: () => boxProxy(1.0, 3.0, 1.0, Palette.shadow),
  sway: false
});
registerType({
  id: "bush",
  makeGeo: (v, s) => makeBush(v, s),
  aabb: aabb(0.5, 0.4, 0.5, 0.35),
  solid: false,
  sway: true
});
registerType({
  id: "grass",
  makeGeo: (v, s) => makeGrass(v, s),
  aabb: aabb(0.2, 0.35, 0.2, 0.2),
  solid: false,
  sway: true
});
registerType({
  id: "boulder",
  makeGeo: (v, s) => makeBoulder(v, s),
  aabb: aabb(0.7, 0.4, 0.7, 0.3),
  solid: true,
  sway: false
});

// ---- STARSHIP -------------------------------------------------------------

registerType({
  id: "console",
  makeGeo: (v, s) => makeConsole(v, s),
  aabb: aabb(0.55, 0.5, 0.3, 0.5),
  solid: true,
  sway: false
});
registerType({
  id: "crate",
  makeGeo: (v, s) => makeCrate(v, s),
  aabb: aabb(0.45, 0.45, 0.45, 0.4),
  solid: true,
  sway: false
});
registerType({
  id: "pipe",
  makeGeo: (v, s) => makePipe(v, s),
  aabb: aabb(1.2, 0.14, 0.14, 1.9),
  solid: false,
  sway: false
});
registerType({
  id: "pod",
  makeGeo: (v, s) => makePod(v, s),
  aabb: aabb(0.55, 0.8, 0.55, 0.8),
  solid: true,
  sway: false
});
registerType({
  id: "bulkhead",
  makeGeo: (v, s) => makeBulkhead(v, s),
  aabb: aabb(0.8, 1.2, 0.11, 1.2),
  solid: true,
  far: () => boxProxy(1.6, 2.4, 0.18, Palette.shadow),
  sway: false
});

// ---- PLANET ---------------------------------------------------------------

registerType({
  id: "alienFlora",
  makeGeo: (v, s) => makeAlienFlora(v, s),
  aabb: aabb(0.35, 0.7, 0.35, 0.7),
  solid: false,
  sway: true
});
registerType({
  id: "crystal",
  makeGeo: (v, s) => makeCrystal(v, s),
  aabb: aabb(0.4, 0.8, 0.4, 0.8),
  solid: true,
  sway: false
});
registerType({
  id: "alienRock",
  makeGeo: (v, s) => makeAlienRock(v, s),
  aabb: aabb(0.65, 0.45, 0.65, 0.35),
  solid: true,
  sway: false
});
registerType({
  id: "monolith",
  makeGeo: (v, s) => makeMonolith(v, s),
  aabb: aabb(0.45, 1.5, 0.2, 1.5),
  solid: true,
  far: () => boxProxy(0.7, 3.0, 0.3, Palette.ink),
  sway: false
});
registerType({
  id: "alienStructure",
  makeGeo: (v, s) => makeAlienStructure(v, s),
  aabb: aabb(0.7, 1.0, 0.7, 1.0),
  solid: true,
  sway: false
});
registerType({
  id: "debris",
  makeGeo: (v, s) => makeDebris(v, s),
  aabb: aabb(0.4, 0.25, 0.4, 0.2),
  solid: false,
  sway: false
});

/** All registered prop ids, in registration order. */
export const PROP_IDS: readonly string[] = Array.from(registry.keys());
