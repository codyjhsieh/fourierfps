import * as THREE from "three";
import { Palette } from "./Palette";
import { pastel } from "./Materials";
import { softBox, inkOutline } from "./Geometry";

export const WALL_HEIGHT = 2.7;
const WALL_THICKNESS = 0.12;

/**
 * Builds apartment shell geometry (floors, walls, ceilings, openings) and
 * accumulates axis-aligned wall colliders for the player controller.
 */
export class RoomKit {
  readonly group = new THREE.Group();
  /** World-space AABB colliders (walls). XZ blocking, full height. */
  readonly colliders: THREE.Box3[] = [];

  floor(cx: number, cz: number, w: number, d: number, color: number = Palette.floorWood): void {
    const geo = new THREE.PlaneGeometry(w, d, 1, 1);
    const mesh = new THREE.Mesh(geo, pastel(color));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(cx, 0, cz);
    this.group.add(mesh);
  }

  ceiling(cx: number, cz: number, w: number, d: number, color: number = Palette.ceiling): void {
    const geo = new THREE.PlaneGeometry(w, d, 1, 1);
    const mesh = new THREE.Mesh(geo, pastel(color));
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(cx, WALL_HEIGHT, cz);
    this.group.add(mesh);
  }

  /** A solid wall segment. `axis` "x" runs along X (length is X), "z" runs along Z. */
  private segment(
    axis: "x" | "z",
    cx: number,
    cz: number,
    length: number,
    height = WALL_HEIGHT,
    yCenter = WALL_HEIGHT / 2,
    color: number = Palette.wall,
    collide = true
  ): void {
    const w = axis === "x" ? length : WALL_THICKNESS;
    const d = axis === "x" ? WALL_THICKNESS : length;
    const geo = softBox(w, height, d, 0.006);
    const mesh = new THREE.Mesh(geo, pastel(color));
    mesh.position.set(cx, yCenter, cz);
    mesh.add(inkOutline(geo, Palette.ink, 0.18));
    this.group.add(mesh);
    if (collide) {
      const box = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(cx, WALL_HEIGHT / 2, cz),
        new THREE.Vector3(w, WALL_HEIGHT, d)
      );
      this.colliders.push(box);
    }
  }

  /** Full wall, no opening. center + length along axis. */
  wall(axis: "x" | "z", cx: number, cz: number, length: number, color: number = Palette.wall): void {
    this.segment(axis, cx, cz, length, WALL_HEIGHT, WALL_HEIGHT / 2, color);
  }

  /**
   * Wall with a doorway opening. `gapCenter` is the offset (along axis) of the
   * door center from the wall center; `gapWidth` is the opening width.
   * Produces two side segments + a lintel above the opening.
   */
  wallWithDoor(
    axis: "x" | "z",
    cx: number,
    cz: number,
    length: number,
    gapCenter: number,
    gapWidth: number,
    color: number = Palette.wall
  ): void {
    const doorHeight = 2.1;
    const half = length / 2;
    const gapStart = gapCenter - gapWidth / 2;
    const gapEnd = gapCenter + gapWidth / 2;

    const segA = gapStart - -half; // left segment length
    const segB = half - gapEnd; // right segment length

    if (segA > 0.02) {
      const segCenter = -half + segA / 2;
      this.placeAlong(axis, cx, cz, segCenter, segA, WALL_HEIGHT, WALL_HEIGHT / 2, color);
    }
    if (segB > 0.02) {
      const segCenter = gapEnd + segB / 2;
      this.placeAlong(axis, cx, cz, segCenter, segB, WALL_HEIGHT, WALL_HEIGHT / 2, color);
    }
    // lintel above doorway (non-colliding visually, but we skip collider so player passes)
    const lintelH = WALL_HEIGHT - doorHeight;
    this.placeAlong(axis, cx, cz, gapCenter, gapWidth, lintelH, doorHeight + lintelH / 2, color, false);
  }

  /** Place a segment offset `offset` along the wall axis from (cx,cz). */
  private placeAlong(
    axis: "x" | "z",
    cx: number,
    cz: number,
    offset: number,
    length: number,
    height: number,
    yCenter: number,
    color: number,
    collide = true
  ): void {
    const px = axis === "x" ? cx + offset : cx;
    const pz = axis === "z" ? cz + offset : cz;
    this.segment(axis, px, pz, length, height, yCenter, color, collide);
  }

  /** Decorative window frame on a wall (no opening through it). */
  window(axis: "x" | "z", cx: number, cz: number, w = 1.4, h = 1.4, sill = 0.9): void {
    const frameColor = 0xece3d2;
    const t = 0.08;
    const mk = (sx: number, sy: number, sw: number, sh: number) => {
      const geo = softBox(axis === "x" ? sw : t, sh, axis === "x" ? t : sw, 0.004);
      const mesh = new THREE.Mesh(geo, pastel(frameColor));
      const px = axis === "x" ? cx + sx : cx;
      const pz = axis === "z" ? cz + sx : cz;
      mesh.position.set(px, sill + h / 2 + sy, pz);
      this.group.add(mesh);
    };
    mk(0, h / 2, w, t); // top
    mk(0, -h / 2, w, t); // bottom
    mk(-w / 2, 0, t, h); // left
    mk(w / 2, 0, t, h); // right
    mk(0, 0, t, h); // mullion
    // sky pane (bright)
    const paneGeo = new THREE.PlaneGeometry(w - t, h - t);
    const pane = new THREE.Mesh(
      paneGeo,
      new THREE.MeshBasicMaterial({ color: 0xdfeaf2 })
    );
    if (axis === "x") {
      pane.position.set(cx, sill + h / 2, cz + 0.01);
    } else {
      pane.rotation.y = Math.PI / 2;
      pane.position.set(cx + 0.01, sill + h / 2, cz);
    }
    this.group.add(pane);
  }
}
