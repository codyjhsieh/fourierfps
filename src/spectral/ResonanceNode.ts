import * as THREE from "three";
import { spectralGhost, spectralWire } from "../world/Materials";
import { SpectralBands } from "../world/Palette";

/** A floating low-poly spectral object the player tunes to and phase-shifts. */
export class ResonanceNode {
  readonly group = new THREE.Group();
  readonly hitMesh: THREE.Mesh; // invisible, generous raycast target
  private fill: THREE.Mesh;
  private wire: THREE.Mesh;
  private fillMat: THREE.Material & { opacity: number };
  private wireMat: THREE.Material & { opacity: number };

  nodeId: string;
  /** band index this node resonates in (0..3). */
  band: number;
  phase = 0; // 0..1
  isAligned = false;
  private baseScale: number;
  /** 0..1 visibility set by the lens fade; aligned brighten composes on top of it. */
  private visibility = 1;
  /** Tracks isAligned edges so the confirm pulse can ease in over ~0.3s. */
  private prevAligned = false;
  private alignTransitionAt = -1;

  constructor(nodeId: string, band: number, radius = 0.28) {
    this.nodeId = nodeId;
    this.band = band;
    this.baseScale = radius;

    const color = SpectralBands[band % SpectralBands.length];
    const geo = new THREE.IcosahedronGeometry(radius, 1);
    this.fillMat = spectralGhost(color, 0.32) as THREE.Material & { opacity: number };
    this.fill = new THREE.Mesh(geo, this.fillMat);
    this.wireMat = spectralWire(color, 0.7) as THREE.Material & { opacity: number };
    this.wire = new THREE.Mesh(geo, this.wireMat);
    this.group.add(this.fill, this.wire);

    this.hitMesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.6, 8, 6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.group.add(this.hitMesh);
  }

  setVisibility(v: number): void {
    this.visibility = v;
    this.group.visible = v > 0.02;
    // base idle opacities; update() may brighten these further when aligned.
    this.fillMat.opacity = 0.32 * v;
    this.wireMat.opacity = 0.7 * v;
  }

  update(time: number): void {
    // Detect the lock edge and remember when it happened so we can ease in.
    if (this.isAligned !== this.prevAligned) {
      this.alignTransitionAt = time;
      this.prevAligned = this.isAligned;
    }

    // ease 0..1 over ~0.3s from the most recent transition (in or out of lock).
    const elapsed = this.alignTransitionAt < 0 ? 1 : time - this.alignTransitionAt;
    const raw = THREE.MathUtils.clamp(elapsed / 0.3, 0, 1);
    const ease = raw * raw * (3 - 2 * raw); // smoothstep
    const lock = this.isAligned ? ease : 1 - ease; // 0 idle .. 1 fully locked

    // When locked the node settles: a touch larger, with a slower, gentler wobble.
    const wobbleAmp = 0.06 * (1 - 0.6 * lock);
    const wobbleRate = 2 - 0.7 * lock;
    const settle = 0.1 * lock; // steady-state size bump on lock
    const pulse =
      1 +
      Math.sin(time * wobbleRate + this.band) * wobbleAmp +
      settle;
    this.group.scale.setScalar(this.baseScale * pulse * (1 / 0.28));
    this.group.rotation.y = time * 0.4 * (1 - 0.5 * lock);
    this.group.rotation.x = Math.sin(time * 0.3) * 0.3 * (1 - 0.5 * lock);

    // Brighten toward the confirm opacities on lock; keep band color untouched.
    const baseWire = 0.7 * this.visibility;
    const baseFill = 0.32 * this.visibility;
    const lockWire = 0.95 * this.visibility;
    const lockFill = 0.5 * this.visibility;
    this.wireMat.opacity = THREE.MathUtils.lerp(baseWire, lockWire, lock);
    this.fillMat.opacity = THREE.MathUtils.lerp(baseFill, lockFill, lock);
  }
}
