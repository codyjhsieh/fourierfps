import { describe, it, expect } from "vitest";
import {
  generateApartmentPlan,
  generateOfficePlan,
  generateLandscapePlan,
  generateStarshipPlan,
  generatePlanetPlan
} from "./ScenePlanners";
import type { PlanFn } from "./ScenePlan";

/**
 * Pure determinism + shape checks for the five planners. No DOM / WebGL:
 * planners emit plain data (object/creature lists + the existing SourceField).
 */

const PLANNERS: { name: string; fn: PlanFn; min: number; max: number }[] = [
  { name: "apartment", fn: generateApartmentPlan, min: 60, max: 150 },
  { name: "office", fn: generateOfficePlan, min: 1, max: 600 },
  { name: "landscape", fn: generateLandscapePlan, min: 800, max: 2500 },
  { name: "starship", fn: generateStarshipPlan, min: 1, max: 400 },
  { name: "planet", fn: generatePlanetPlan, min: 300, max: 900 }
];

const N = 16; // small grid keeps the test fast; field shape is N³

describe("ScenePlanners", () => {
  for (const { name, fn, min, max } of PLANNERS) {
    describe(name, () => {
      it("is deterministic in (level, seed)", () => {
        const a = fn(2, 12345, N);
        const b = fn(2, 12345, N);
        expect(a.objects.length).toBe(b.objects.length);
        expect(a.creatures.length).toBe(b.creatures.length);
        expect(Array.from(a.structuralField.data)).toEqual(Array.from(b.structuralField.data));
        if (a.objects.length) {
          expect(a.objects[0].pos).toEqual(b.objects[0].pos);
          expect(a.objects[0].type).toBe(b.objects[0].type);
        }
      });

      it("emits a populated, well-formed plan", () => {
        const plan = fn(3, 777, N);
        expect(plan.objects.length).toBeGreaterThanOrEqual(min);
        expect(plan.objects.length).toBeLessThanOrEqual(max);
        // SourceField shape preserved exactly
        expect(plan.structuralField.n).toBe(N);
        expect(plan.structuralField.data.length).toBe(N * N * N);
        expect(plan.structuralField.voxel).toHaveLength(3);
        expect(plan.structuralField.origin).toHaveLength(3);
        expect(typeof plan.structuralField.name).toBe("string");
        expect(plan.anchors.length).toBeGreaterThan(0);
        // every placed object is finite & typed
        for (const o of plan.objects) {
          expect(typeof o.type).toBe("string");
          expect(Number.isFinite(o.pos[0]) && Number.isFinite(o.pos[1]) && Number.isFinite(o.pos[2])).toBe(true);
          expect(Number.isFinite(o.rot)).toBe(true);
          expect(o.scale).toBeGreaterThan(0);
          expect(typeof o.solid).toBe("boolean");
        }
        for (const c of plan.creatures) {
          expect(typeof c.kind).toBe("string");
          expect(Number.isFinite(c.phase)).toBe(true);
        }
      });

      it("scales object count up with level", () => {
        const lo = fn(1, 999, N).objects.length;
        const hi = fn(6, 999, N).objects.length;
        expect(hi).toBeGreaterThanOrEqual(lo);
      });
    });
  }
});
