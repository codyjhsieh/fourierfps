import { describe, it, expect } from "vitest";
import {
  makeCreature,
  animateCreature,
  type CreatureKind
} from "./ProceduralCreatures";

const KINDS: CreatureKind[] = [
  "cat",
  "goldfish",
  "deer",
  "bird",
  "squirrel",
  "alienGrazer",
  "drone"
];

describe("ProceduralCreatures", () => {
  it("builds a rig with all named parts for every kind", () => {
    for (const kind of KINDS) {
      const rig = makeCreature(kind, "sageGreen");
      expect(rig.kind).toBe(kind);
      expect(rig.parts.body).toBeDefined();
      expect(rig.parts.head).toBeDefined();
      expect(rig.parts.legL).toBeDefined();
      expect(rig.parts.legR).toBeDefined();
      expect(rig.parts.tail).toBeDefined();
      // body/head/legs/tail all parented under the group
      expect(rig.group.children.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("is deterministic: same kind+color yields same phase + wander", () => {
    const a = makeCreature("deer", "dustyRose");
    const b = makeCreature("deer", "dustyRose");
    expect(a.phase).toBe(b.phase);
    expect(a.wander.speed).toBe(b.wander.speed);
    expect(a.wander.heading).toBe(b.wander.heading);
  });

  it("freezes and hides detail beyond LOD distance", () => {
    const rig = makeCreature("cat", "powderBlue");
    animateCreature(rig, 1.23, 99);
    expect(rig.parts.head.visible).toBe(false);
    expect(rig.parts.legL.visible).toBe(false);
    expect(rig.parts.tail.visible).toBe(false);
    // body stays at rest pose
    expect(rig.parts.body.position.y).toBeCloseTo(rig.base.bodyY, 6);
  });

  it("shows detail and stays finite within LOD distance", () => {
    for (const kind of KINDS) {
      const rig = makeCreature(kind, "lavenderGray");
      animateCreature(rig, 2.5, 5);
      expect(rig.parts.head.visible).toBe(true);
      expect(Number.isFinite(rig.group.position.x)).toBe(true);
      expect(Number.isFinite(rig.group.position.z)).toBe(true);
      expect(Number.isFinite(rig.parts.body.position.y)).toBe(true);
    }
  });

  it("wander stays bounded around its origin", () => {
    const rig = makeCreature("squirrel", "sageGreen");
    rig.wander.origin.set(10, 0, -4);
    let maxOffset = 0;
    for (let t = 0; t < 50; t += 0.5) {
      animateCreature(rig, t, 5);
      const dx = rig.group.position.x - rig.wander.origin.x;
      const dz = rig.group.position.z - rig.wander.origin.z;
      maxOffset = Math.max(maxOffset, Math.hypot(dx, dz));
    }
    // never escapes the wander radius
    expect(maxOffset).toBeLessThanOrEqual(rig.wander.radius + 1e-6);
  });
});
