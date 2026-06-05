import * as THREE from "three";
import { RoomKit, WALL_HEIGHT } from "./ProceduralRoom";
import { Palette } from "./Palette";
import {
  makeSofa,
  makeTable,
  makeLamp,
  makePendantLamp,
  makePlant,
  makeBookshelf,
  makeSideboard,
  makePictureFrame,
  makeChair,
  makeRug
} from "./ProceduralProps";

function setOpacity(obj: THREE.Object3D, opacity: number): void {
  obj.traverse((c) => {
    const mesh = c as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const mat = m as THREE.Material & { opacity: number; transparent: boolean };
      if (mat.userData.baseOpacity === undefined) {
        mat.userData.baseOpacity = mat.opacity ?? 1;
      }
      mat.transparent = opacity < 0.999 || mat.userData.baseOpacity < 1;
      mat.opacity = mat.userData.baseOpacity * opacity;
      mat.depthWrite = opacity > 0.5 && mat.userData.baseOpacity >= 1;
    }
  });
}

/**
 * The procedural apartment: living room, hallway and back room, fully built
 * from primitives. Exposes colliders, the player spawn, and the hallway anchor
 * where the hidden-stair puzzle lives.
 */
export class Apartment {
  readonly group = new THREE.Group();
  readonly colliders: THREE.Box3[];
  readonly spawn = new THREE.Vector3(0, 1.62, 1.4);
  /** World-space anchor in the living room where its resonance node centers. */
  readonly livingAnchor = new THREE.Vector3(0, 0, 0);
  /** World-space anchor in the hallway where spectral structures center. */
  readonly hallwayAnchor = new THREE.Vector3(0, 0, -6.3);
  /** World-space anchor in the back room where its resonance node centers. */
  readonly backAnchor = new THREE.Vector3(0, 0, -11);
  /** Per-room anchors sampled by the puzzle/lens, indexed living/hallway/back. */
  readonly roomAnchors: THREE.Vector3[] = [this.livingAnchor, this.hallwayAnchor, this.backAnchor];

  private furniture = new THREE.Group();
  private shell: RoomKit;

  constructor() {
    const kit = new RoomKit();
    this.shell = kit;

    // ---- Living room: x[-3,3], z[-4,3] ----
    kit.floor(0, -0.5, 6, 7);
    kit.ceiling(0, -0.5, 6, 7);
    kit.wall("x", 0, 3, 6); // back wall (behind player)
    kit.window("x", -1.4, 3, 1.6, 1.5, 0.9); // window behind-left (catches light)
    kit.wall("z", -3, -0.5, 7); // left wall
    kit.window("z", -3, 1.0, 1.8, 1.6, 0.85); // big left window (screenshot)
    kit.wall("z", 3, -0.5, 7); // right wall
    kit.wallWithDoor("x", 0, -4, 6, 0, 1.3); // front wall → hallway doorway

    // ---- Hallway: x[-1.2,1.2], z[-9,-4] ----
    kit.floor(0, -6.5, 2.4, 5);
    kit.ceiling(0, -6.5, 2.4, 5);
    kit.wall("z", -1.2, -6.5, 5);
    kit.wall("z", 1.2, -6.5, 5);
    kit.wallWithDoor("x", 0, -9, 2.4, 0, 1.2); // hallway → back room

    // ---- Back room: x[-3,3], z[-13,-9] ----
    kit.floor(0, -11, 6, 4);
    kit.ceiling(0, -11, 6, 4);
    kit.wall("x", 0, -13, 6);
    kit.window("x", 0, -13, 2.0, 1.6, 0.85);
    kit.wall("z", -3, -11, 4);
    kit.wall("z", 3, -11, 4);

    this.colliders = kit.colliders;
    this.group.add(kit.group);
    this.group.add(this.furniture);

    this.placeFurniture();
  }

  private placeFurniture(): void {
    const solids: THREE.Object3D[] = [];
    const add = (obj: THREE.Object3D, x: number, y: number, z: number, ry = 0, collide = false) => {
      obj.position.set(x, y, z);
      obj.rotation.y = ry;
      this.furniture.add(obj);
      if (collide) solids.push(obj);
    };

    // Living room. The rug sits a couple cm above the floor to avoid z-fighting.
    add(makeRug(2.8, 1.9, Palette.dustyRose), 0, 0.02, 0.2);
    add(makeSofa(), -2.0, 0, 0.6, Math.PI / 2, true); // against left wall, facing in
    add(makeTable(1.2, 0.42, 0.66), 0, 0, 0.3, 0, true); // coffee table center
    add(makeSideboard(), 2.3, 0, -0.6, -Math.PI / 2, true); // right wall
    add(makeBookshelf(), -2.6, 0, -2.6, Math.PI / 2, true); // far corner
    add(makeLamp(), 2.2, 0.72, -1.6, 0); // lamp on sideboard side
    add(makePlant(), 1.0, 0, 0.9);
    add(makePlant(), -1.4, 0, -1.0);
    add(makePendantLamp(), 0, WALL_HEIGHT, -1.2); // hanging pendant (focal)

    // picture frames on right wall (x≈3)
    const f1 = makePictureFrame(0.42, 0.52, Palette.powderBlue);
    f1.rotation.y = -Math.PI / 2;
    add(f1, 2.93, 1.5, 0.2, -Math.PI / 2);
    const f2 = makePictureFrame(0.34, 0.42, Palette.lavenderGray);
    add(f2, 2.93, 1.2, 1.0, -Math.PI / 2);

    // Back room (visible through hallway): table + chairs (kitchen/dining)
    add(makeTable(1.1, 0.74, 0.7), 0, 0, -11, 0, true);
    add(makeChair(), -0.7, 0, -11, Math.PI / 2);
    add(makeChair(), 0.7, 0, -11, -Math.PI / 2);
    add(makePlant(), -2.2, 0, -12.2);

    // Solid furniture gets an XZ collider so the player can't walk through it.
    this.group.updateMatrixWorld(true);
    for (const obj of solids) {
      const box = new THREE.Box3().setFromObject(obj);
      box.expandByScalar(-0.06); // let the player get close before blocking
      if (box.min.x < box.max.x && box.min.z < box.max.z) this.colliders.push(box);
    }
  }

  /**
   * Maps an XZ world position to a room index: 0=living (z>=-4),
   * 1=hallway (-9<z<-4), 2=back (-13.2<=z<=-9), or -1 if outside.
   * x is ignored because the rooms are stacked along z.
   */
  roomAt(x: number, z: number): number {
    void x;
    if (z >= -4) return 0;
    if (z > -9) return 1;
    if (z >= -13.2) return 2;
    return -1;
  }

  /** 1 = fully real furniture, 0 = furniture gone (Deep Resonance). */
  setRealityFade(v: number): void {
    setOpacity(this.furniture, v);
    this.furniture.visible = v > 0.02;
    // tint the shell toward abstract pastel as reality dissolves
    const tint = THREE.MathUtils.clamp(v, 0.35, 1);
    setOpacity(this.shell.group, tint);
  }
}
