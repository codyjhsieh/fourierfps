import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  flatten,
  geoFor,
  farGeoFor,
  aabbFor,
  isSolid,
  getType,
  PROP_IDS
} from "./ObjectLibrary";

describe("ObjectLibrary.flatten", () => {
  it("merges mesh children into one vertex-colored geometry and bakes transforms", () => {
    const g = new THREE.Group();
    const a = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    a.position.set(2, 0, 0);
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x0000ff })
    );
    g.add(a, b);

    const geo = flatten(g);
    expect(geo.attributes.position).toBeDefined();
    expect(geo.attributes.color).toBeDefined();
    expect(geo.attributes.normal).toBeDefined();
    // no uvs leak through
    expect(geo.attributes.uv).toBeUndefined();
    // color attribute matches position count
    expect(geo.attributes.color.count).toBe(geo.attributes.position.count);
    // baked transform: some vertex pushed out to x≈2.5
    const pos = geo.attributes.position;
    let maxX = -Infinity;
    for (let i = 0; i < pos.count; i++) maxX = Math.max(maxX, pos.getX(i));
    expect(maxX).toBeGreaterThan(2);
  });

  it("skips ink outlines and line segments", () => {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    const lines = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial()
    );
    const inkMesh = new THREE.Mesh(
      new THREE.BoxGeometry(5, 5, 5),
      new THREE.MeshBasicMaterial()
    );
    inkMesh.name = "inkOutline";
    g.add(mesh, lines, inkMesh);

    const onlyBox = flatten(g);
    // 12 tris * 3 verts = 36 for a single non-indexed box
    expect(onlyBox.attributes.position.count).toBe(36);
  });

  it("produces a valid placeholder for an empty group", () => {
    const geo = flatten(new THREE.Group());
    expect(geo.attributes.position.count).toBeGreaterThan(0);
    expect(geo.attributes.color).toBeDefined();
  });
});

describe("ObjectLibrary registry", () => {
  it("registers about 36 prop types across five environments", () => {
    expect(PROP_IDS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(PROP_IDS).size).toBe(PROP_IDS.length); // unique ids
    for (const id of ["sofa", "deskCluster", "tree", "console", "monolith"]) {
      expect(PROP_IDS).toContain(id);
    }
  });

  it("geoFor is deterministic + cached (same instance) per id|variant", () => {
    for (const id of PROP_IDS) {
      const g1 = geoFor(id, 0, 5);
      const g2 = geoFor(id, 0, 5);
      expect(g1).toBe(g2); // memoized
      expect(g1.attributes.position.count).toBeGreaterThan(0);
      expect(g1.attributes.color).toBeDefined();
      // different variant → different cache entry
      const gv = geoFor(id, 1, 5);
      expect(gv.attributes.color).toBeDefined();
    }
  });

  it("aabb / isSolid are consistent and finite", () => {
    for (const id of PROP_IDS) {
      const box = aabbFor(id);
      expect(box.half.every((h) => Number.isFinite(h) && h >= 0)).toBe(true);
      expect(box.center.every(Number.isFinite)).toBe(true);
      expect(typeof isSolid(id)).toBe("boolean");
      expect(getType(id).id).toBe(id);
    }
  });

  it("high-vert types expose a cached far proxy", () => {
    for (const id of ["bookshelf", "deskCluster", "tree", "rockPillar", "bulkhead", "monolith"]) {
      const f1 = farGeoFor(id);
      expect(f1).toBeDefined();
      expect(f1!.attributes.position.count).toBeGreaterThan(0);
      expect(farGeoFor(id)).toBe(f1); // cached
    }
  });

  it("throws on unknown type", () => {
    expect(() => getType("nope")).toThrow();
  });
});
