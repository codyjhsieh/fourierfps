import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { RealityScene, defaultRealityPalette } from "./RealityScene";
import type { ScenePlan, PlacedObject, SourceField } from "../world/ScenePlan";

/** Minimal structural field — RealityScene only reads `n` from it. */
function field(): SourceField {
  return {
    n: 16,
    data: new Float32Array(16 * 16 * 16),
    voxel: [0.5, 0.5, 0.5],
    origin: [0, 0, 0],
    spawn: { x: 0, z: 0 },
    look: { yaw: 0, pitch: 0 },
    anchors: [],
    name: "TEST"
  };
}

function obj(type: string, x: number, z: number, variant = 0): PlacedObject {
  return {
    type,
    variant,
    pos: [x, 0, z],
    rot: 0.3,
    scale: 1,
    colorKey: "sageGreen",
    solid: true,
    animated: false
  };
}

function plan(objects: PlacedObject[], creatures = 0): ScenePlan {
  return {
    objects,
    creatures: Array.from({ length: creatures }, (_, i) => ({
      kind: i % 2 ? "bird" : "cat",
      pos: [i, 0, 0] as [number, number, number],
      phase: i,
      wander: 1
    })),
    structuralField: field(),
    anchors: []
  };
}

/** Build the scene from a plan (mirrors how SpectralCore feeds RealityScene). */
function build(s: RealityScene, p: ScenePlan, mobile = false): void {
  s.build(p.objects, p.creatures, p.establishing, defaultRealityPalette, mobile);
}

/** Count InstancedMeshes in the scene group (a proxy for draw calls). */
function instancedMeshes(scene: RealityScene): THREE.InstancedMesh[] {
  return scene.group.children.filter(
    (c): c is THREE.InstancedMesh => (c as THREE.InstancedMesh).isInstancedMesh
  );
}

describe("RealityScene", () => {
  it("groups objects into one InstancedMesh per type|variant", () => {
    const s = new RealityScene();
    build(s, plan([obj("chair", 0, 0), obj("chair", 1, 0), obj("table", 2, 0)]));
    expect(instancedMeshes(s).length).toBe(2);
    s.dispose();
  });

  it("splits overflow beyond the 512 cap into extra meshes of the same geo", () => {
    const s = new RealityScene();
    const many: PlacedObject[] = [];
    for (let i = 0; i < 700; i++) many.push(obj("chair", (i % 25) - 12, Math.floor(i / 25) - 14));
    build(s, plan(many));
    const meshes = instancedMeshes(s);
    expect(meshes.length).toBe(2);
    const total = meshes.reduce((n, m) => n + m.count, 0);
    expect(total).toBe(700);
    expect(meshes[0].geometry).toBe(meshes[1].geometry);
    s.dispose();
  });

  it("caps the visible object count on mobile", () => {
    const s = new RealityScene();
    const many: PlacedObject[] = [];
    for (let i = 0; i < 1500; i++) many.push(obj("crate", (i % 30) - 15, Math.floor(i / 30) - 25));
    build(s, plan(many), true);
    const total = instancedMeshes(s).reduce((n, m) => n + m.count, 0);
    expect(total).toBeLessThanOrEqual(1200);
    s.dispose();
  });

  it("zero-scales instances that are far behind the camera, keeps near ones", () => {
    const s = new RealityScene();
    build(s, plan([obj("chair", 0, 2), obj("chair", 0, 500)]));
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    cam.position.set(0, 1, 0);
    cam.lookAt(0, 1, 10);
    cam.updateMatrixWorld(true);

    s.update(cam, 0);

    const mesh = instancedMeshes(s)[0];
    const m = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    let nonZero = 0;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      m.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      if (scale.length() > 1e-4) nonZero++;
    }
    expect(nonZero).toBe(1);
    s.dispose();
  });

  it("adds capped, individually animated creature groups", () => {
    const s = new RealityScene();
    build(s, plan([obj("chair", 0, 0)], 60));
    const groups = s.group.children.filter((c) => (c as THREE.Group).isGroup);
    expect(groups.length).toBe(40);
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    cam.position.set(0, 1, -5);
    cam.updateMatrixWorld(true);
    expect(() => s.update(cam, 1.5)).not.toThrow();
    s.dispose();
  });

  it("dispose clears the group and is re-buildable", () => {
    const s = new RealityScene();
    build(s, plan([obj("chair", 0, 0)]));
    s.dispose();
    expect(s.group.children.length).toBe(0);
    build(s, plan([obj("table", 0, 0)]));
    expect(instancedMeshes(s).length).toBe(1);
    s.dispose();
  });

  it("stays well under the 60 draw-call budget for a busy scene", () => {
    const s = new RealityScene();
    const objs: PlacedObject[] = [];
    const types = ["chair", "table", "crate", "console", "plant"];
    for (let i = 0; i < 800; i++) {
      const t = types[i % types.length];
      objs.push(obj(t, (i % 20) - 10, Math.floor(i / 20) - 20, i % 2));
    }
    build(s, plan(objs));
    expect(instancedMeshes(s).length).toBeLessThan(60);
    s.dispose();
  });
});
