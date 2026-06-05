import * as THREE from "three";
import { spectralRibbon } from "../world/Materials";

/** A smooth translucent ribbon flowing through space (navigation + story cue). */
export class MemoryVein {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor(points: THREE.Vector3[], color: number, radius = 0.08) {
    const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.5);
    const geo = new THREE.TubeGeometry(curve, 80, radius, 8, false);
    this.mat = spectralRibbon(color);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = 2;
  }

  setVisibility(v: number): void {
    this.mat.uniforms.uVisibility.value = v;
    this.mesh.visible = v > 0.01;
  }

  update(time: number): void {
    this.mat.uniforms.uTime.value = time;
  }
}
