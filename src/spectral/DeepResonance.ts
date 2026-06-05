import * as THREE from "three";
import { pastel, spectralGhost } from "../world/Materials";
import { Palette, SpectralBands } from "../world/Palette";
import { softBox, noise3 } from "../world/Geometry";

/**
 * The Deep Resonance set piece: the apartment decomposed into frequency
 * architecture — floating pastel planes, impossible stairs, low-poly crystals,
 * and ribbon arcs. Fades in as reality dissolves. Purely set dressing.
 */
export class DeepResonance {
  readonly group = new THREE.Group();
  private mats: (THREE.Material & { opacity: number })[] = [];
  private crystals: THREE.Object3D[] = [];

  constructor(center: THREE.Vector3) {
    this.group.position.copy(center);

    // floating abstract walls / planes
    for (let i = 0; i < 16; i++) {
      const w = 1.2 + Math.abs(noise3(i, 1, 2)) * 3;
      const h = 1.2 + Math.abs(noise3(i, 3, 4)) * 3;
      const geo = softBox(w, h, 0.12, 0.01);
      const color = [Palette.powderBlue, Palette.lavenderGray, Palette.dustyRose, Palette.sageGreen][i % 4];
      const mat = spectralGhost(color, 0.6) as THREE.Material & { opacity: number };
      const plane = new THREE.Mesh(geo, mat);
      plane.position.set(noise3(i, 5, 6) * 10, 1 + Math.abs(noise3(i, 7, 8)) * 6, noise3(i, 9, 10) * 10);
      plane.rotation.set(noise3(i, 11, 1) * 0.6, noise3(i, 2, 12) * Math.PI, noise3(i, 13, 3) * 0.4);
      this.mats.push(mat);
      this.group.add(plane);
    }

    // impossible floating stairs
    for (let s = 0; s < 3; s++) {
      const stair = new THREE.Group();
      const baseDir = new THREE.Vector3(noise3(s, 20, 1), 0, noise3(s, 21, 2)).normalize();
      for (let i = 0; i < 9; i++) {
        const geo = softBox(0.9, 0.18, 0.4, 0.008);
        const mat = spectralGhost(Palette.lavenderGray, 0.7) as THREE.Material & { opacity: number };
        const step = new THREE.Mesh(geo, mat);
        step.position.set(baseDir.x * 0.4 * i, 0.3 * i, baseDir.z * 0.4 * i);
        this.mats.push(mat);
        stair.add(step);
      }
      stair.position.set(noise3(s, 30, 1) * 8, 0.5, noise3(s, 31, 2) * 8 - 5);
      this.group.add(stair);
    }

    // low-poly resonance crystals (floating, slowly rotating)
    for (let i = 0; i < 10; i++) {
      const r = 0.4 + Math.abs(noise3(i, 40, 1)) * 0.7;
      const geo = new THREE.OctahedronGeometry(r, 0);
      const color = SpectralBands[i % SpectralBands.length];
      const mat = spectralGhost(color, 0.55) as THREE.Material & { opacity: number };
      const crystal = new THREE.Mesh(geo, mat);
      crystal.position.set(noise3(i, 50, 1) * 11, 1.5 + Math.abs(noise3(i, 51, 2)) * 5, noise3(i, 52, 3) * 11 - 4);
      this.mats.push(mat);
      this.crystals.push(crystal);
      this.group.add(crystal);
    }

    // a large abstract pastel floor plane under it all
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40, 1, 1),
      pastel(Palette.lavenderGray, { opacity: 0.5 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    this.mats.push((floor.material as THREE.Material & { opacity: number }));
    this.group.add(floor);

    this.setVisibility(0);
  }

  setVisibility(dissolve: number): void {
    this.group.visible = dissolve > 0.02;
    for (const m of this.mats) {
      const base = (m.userData.base ??= m.opacity) as number;
      m.opacity = base * dissolve;
    }
  }

  update(time: number): void {
    for (let i = 0; i < this.crystals.length; i++) {
      const c = this.crystals[i];
      c.rotation.y = time * 0.2 + i;
      c.rotation.x = Math.sin(time * 0.3 + i) * 0.4;
      c.position.y += Math.sin(time + i) * 0.0008;
    }
  }
}
