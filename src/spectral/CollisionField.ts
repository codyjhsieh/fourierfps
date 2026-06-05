import { groundHeight, type Solid } from "../player/VoxelCollision";

/**
 * Maps world coordinates onto the source density grid (the true structure) for
 * collision. The visual band reconstruction shares the same origin/voxel
 * transform, so physics stays registered with what you see.
 */
export class CollisionField {
  readonly solid: Solid;
  readonly minVoxel: number;
  readonly voxelY: number;

  constructor(
    private data: Float32Array,
    private n: number,
    private origin: [number, number, number],
    private voxel: [number, number, number]
  ) {
    this.minVoxel = Math.min(voxel[0], voxel[1], voxel[2]);
    this.voxelY = voxel[1];
    this.solid = (x, y, z) => this.solidAt(x, y, z);
  }

  solidAt(wx: number, wy: number, wz: number): boolean {
    const xi = Math.floor((wx - this.origin[0]) / this.voxel[0]);
    const yi = Math.floor((wy - this.origin[1]) / this.voxel[1]);
    const zi = Math.floor((wz - this.origin[2]) / this.voxel[2]);
    if (xi < 0 || yi < 0 || zi < 0 || xi >= this.n || yi >= this.n || zi >= this.n) return false;
    return this.data[xi + yi * this.n + zi * this.n * this.n] >= 0.5;
  }

  /** Ground height at (x,z) starting the search from `fromY` down to the floor (0). */
  groundYAt(x: number, z: number, fromY: number): number {
    return groundHeight(this.solid, x, z, fromY, this.voxelY * 0.5, 0);
  }
}
