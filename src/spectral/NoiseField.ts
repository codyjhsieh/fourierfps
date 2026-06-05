import * as THREE from "three";
import { noise3 } from "../world/Geometry";
import { spectralGhost } from "../world/Materials";
import { Palette } from "../world/Palette";

/**
 * Obscuring volume of jittering low-poly triangle fragments (NOT particles).
 * Represents the un-isolated noise that hides the resonance signal. Noise
 * suppression ("Isolate") is modelled as an automatic CONSEQUENCE of tuning into
 * the resonant band — the puzzle drives `noisiness` down as the band is matched
 * and locked, so the field clears smoothly without a separate manual control.
 */
export class NoiseField {
  readonly mesh: THREE.Mesh;
  private mat: THREE.Material & { opacity: number };
  private basePositions: Float32Array;
  private geo: THREE.BufferGeometry;
  private count: number;

  constructor(center: THREE.Vector3, extent = 1.4, count = 60) {
    this.count = count;
    this.geo = new THREE.BufferGeometry();
    const verts = new Float32Array(count * 9); // count triangles
    for (let t = 0; t < count; t++) {
      const cx = center.x + (noise3(t, 1, 2) * extent);
      const cy = center.y + 0.6 + (noise3(t, 3, 4) * extent * 0.6);
      const cz = center.z + (noise3(t, 5, 6) * extent);
      const s = 0.06 + Math.abs(noise3(t, 7, 8)) * 0.08;
      for (let v = 0; v < 3; v++) {
        const o = t * 9 + v * 3;
        verts[o] = cx + noise3(t, v, 9) * s;
        verts[o + 1] = cy + noise3(t, v, 10) * s;
        verts[o + 2] = cz + noise3(t, v, 11) * s;
      }
    }
    this.basePositions = verts.slice();
    this.geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    this.geo.computeVertexNormals();
    this.mat = spectralGhost(Palette.lavenderGray, 0.45) as THREE.Material & { opacity: number };
    (this.mat as THREE.MeshBasicMaterial).side = THREE.DoubleSide;
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.renderOrder = 1;
  }

  /** ghostBlend visibility * isolation suppression (0 isolated → 1 noisy). */
  setVisibility(ghost: number, noisiness: number): void {
    this.mat.opacity = 0.45 * ghost * noisiness;
    this.mesh.visible = this.mat.opacity > 0.01;
  }

  update(time: number): void {
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < this.count * 3; i++) {
      const o = i * 3;
      const j = Math.sin(time * 3 + i) * 0.01;
      arr[o] = this.basePositions[o] + j;
      arr[o + 1] = this.basePositions[o + 1] + Math.cos(time * 2.4 + i) * 0.01;
      arr[o + 2] = this.basePositions[o + 2] + j;
    }
    pos.needsUpdate = true;
  }
}
