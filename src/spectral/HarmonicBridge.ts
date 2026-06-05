import * as THREE from "three";
import { pastel, spectralGhost } from "../world/Materials";
import { Palette } from "../world/Palette";
import { softBox } from "../world/Geometry";

/**
 * A staircase created by "constructive interference". It exists first
 * as a ghost (translucent, non-colliding), then becomes solid (visual only;
 * descent is handled by the Deep Resonance state transition, not by walkable
 * physics) after reconstruction.
 */
export class HarmonicBridge {
  readonly group = new THREE.Group();
  private ghostMats: (THREE.Material & { opacity: number })[] = [];
  private solidMeshes: THREE.Mesh[] = [];
  private solid = false;

  /**
   * @param origin world position of the bottom step
   * @param steps number of steps
   * @param dir horizontal direction the stair climbs (normalized in XZ)
   */
  constructor(origin: THREE.Vector3, steps = 8, dir = new THREE.Vector3(0, 0, -1)) {
    const stepRise = 0.22;
    const stepRun = 0.34;
    const width = 1.1;
    for (let i = 0; i < steps; i++) {
      const pos = new THREE.Vector3(
        origin.x + dir.x * stepRun * i,
        origin.y + stepRise * (i + 0.5),
        origin.z + dir.z * stepRun * i
      );
      const size = new THREE.Vector3(
        Math.abs(dir.z) > 0.5 ? width : stepRun,
        stepRise,
        Math.abs(dir.z) > 0.5 ? stepRun : width
      );
      const geo = softBox(size.x, size.y, size.z, 0.006);
      const ghostMat = spectralGhost(Palette.spectralViolet, 0.28) as THREE.Material & {
        opacity: number;
      };
      const ghost = new THREE.Mesh(geo, ghostMat);
      ghost.position.copy(pos);
      this.ghostMats.push(ghostMat);
      this.group.add(ghost);

      const solid = new THREE.Mesh(geo.clone(), pastel(Palette.lavenderGray));
      solid.position.copy(pos);
      solid.visible = false;
      this.solidMeshes.push(solid);
      this.group.add(solid);
    }
  }

  setGhostVisibility(v: number): void {
    if (this.solid) return;
    for (const m of this.ghostMats) m.opacity = 0.28 * v;
    this.group.visible = v > 0.01 || this.solid;
  }

  /** Commit: ghost → solid (visual only; descent is a state transition). */
  makeSolid(): void {
    if (this.solid) return;
    this.solid = true;
    this.group.visible = true;
    for (const m of this.ghostMats) m.opacity = 0;
    for (const mesh of this.solidMeshes) mesh.visible = true;
  }

  get isSolid(): boolean {
    return this.solid;
  }
}
