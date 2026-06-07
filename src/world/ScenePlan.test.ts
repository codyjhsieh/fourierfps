import { describe, it, expect } from "vitest";
import { emptyPlan } from "./ScenePlan";
import type { SourceField } from "./ScenePlan";

function makeField(): SourceField {
  return {
    n: 4,
    data: new Float32Array(4 * 4 * 4),
    voxel: [1, 1, 1],
    origin: [0, 0, 0],
    spawn: { x: 1, z: 2 },
    look: { yaw: 0, pitch: 0 },
    anchors: [
      [1, 1, 1],
      [2, 2, 2]
    ],
    name: "TEST"
  };
}

describe("ScenePlan", () => {
  it("emptyPlan carries the field through with no objects or creatures", () => {
    const field = makeField();
    const plan = emptyPlan(field);
    expect(plan.objects).toEqual([]);
    expect(plan.creatures).toEqual([]);
    expect(plan.structuralField).toBe(field);
    expect(plan.anchors).toBe(field.anchors);
    expect(plan.establishing).toBeUndefined();
  });

  it("re-exports SourceField usable as a structural field", () => {
    const plan = emptyPlan(makeField());
    expect(plan.structuralField.name).toBe("TEST");
    expect(plan.structuralField.n).toBe(4);
  });
});
