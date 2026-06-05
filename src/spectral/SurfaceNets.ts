import * as THREE from "three";

/**
 * Naive Surface Nets (after Mikola Lysenko, public domain) — extracts a smooth
 * watertight isosurface from a 3D scalar field. We use it to turn each
 * band-limited Fourier reconstruction of the world into a navigable mesh: low
 * bands give blobby surfaces, high bands sharpen toward the real geometry.
 */

const cubeEdges = new Int32Array(24);
const edgeTable = new Int32Array(256);
(function init() {
  let k = 0;
  for (let i = 0; i < 8; ++i) {
    for (let j = 1; j <= 4; j <<= 1) {
      const p = i ^ j;
      if (i <= p) {
        cubeEdges[k++] = i;
        cubeEdges[k++] = p;
      }
    }
  }
  for (let i = 0; i < 256; ++i) {
    let em = 0;
    for (let j = 0; j < 24; j += 2) {
      const a = !!(i & (1 << cubeEdges[j]));
      const b = !!(i & (1 << cubeEdges[j + 1]));
      em |= a !== b ? 1 << (j >> 1) : 0;
    }
    edgeTable[i] = em;
  }
})();

export interface MeshData {
  positions: Float32Array;
  indices: Uint32Array;
}

/**
 * @param values N³ scalar field (idx = x + y*N + z*N*N)
 * @param n grid resolution
 * @param iso isolevel; cells where value > iso are "inside"
 * @param scale world size of one cell
 * @param origin world position of voxel (0,0,0)
 */
export function surfaceNets(
  values: Float32Array,
  n: number,
  iso: number,
  scale = 1,
  origin: [number, number, number] = [0, 0, 0]
): MeshData {
  const dims = [n, n, n];
  const sdf = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) sdf[i] = iso - values[i]; // <0 inside

  const vertices: number[] = [];
  const faces: number[] = [];
  const R = [1, n + 1, (n + 1) * (n + 1)];
  const grid = new Float32Array(8);
  let bufNo = 1;
  const buffer = new Int32Array(R[2] * 2);
  let nPtr = 0;
  const x = [0, 0, 0];

  for (x[2] = 0; x[2] < dims[2] - 1; ++x[2], nPtr += dims[0], bufNo ^= 1, R[2] = -R[2]) {
    let m = 1 + (dims[0] + 1) * (1 + bufNo * (dims[1] + 1));
    for (x[1] = 0; x[1] < dims[1] - 1; ++x[1], ++nPtr, m += 2) {
      for (x[0] = 0; x[0] < dims[0] - 1; ++x[0], ++nPtr, ++m) {
        let mask = 0;
        let g = 0;
        let idx = nPtr;
        for (let k = 0; k < 2; ++k, idx += dims[0] * (dims[1] - 2)) {
          for (let j = 0; j < 2; ++j, idx += dims[0] - 2) {
            for (let i = 0; i < 2; ++i, ++g, ++idx) {
              const p = sdf[idx];
              grid[g] = p;
              mask |= p < 0 ? 1 << g : 0;
            }
          }
        }
        if (mask === 0 || mask === 255) continue;
        const edgeMask = edgeTable[mask];
        const v = [0, 0, 0];
        let eCount = 0;
        for (let i = 0; i < 12; ++i) {
          if (!(edgeMask & (1 << i))) continue;
          ++eCount;
          const e0 = cubeEdges[i << 1];
          const e1 = cubeEdges[(i << 1) + 1];
          const g0 = grid[e0];
          const g1 = grid[e1];
          let t = g0 - g1;
          if (Math.abs(t) > 1e-6) t = g0 / t;
          else continue;
          for (let j = 0, kk = 1; j < 3; ++j, kk <<= 1) {
            const a = e0 & kk;
            const b = e1 & kk;
            if (a !== b) v[j] += a ? 1.0 - t : t;
            else v[j] += a ? 1.0 : 0;
          }
        }
        const s = 1.0 / eCount;
        for (let i = 0; i < 3; ++i) v[i] = origin[i] + (x[i] + s * v[i]) * scale;
        buffer[m] = vertices.length / 3;
        vertices.push(v[0], v[1], v[2]);
        for (let i = 0; i < 3; ++i) {
          if (!(edgeMask & (1 << i))) continue;
          const iu = (i + 1) % 3;
          const iv = (i + 2) % 3;
          if (x[iu] === 0 || x[iv] === 0) continue;
          const du = R[iu];
          const dv = R[iv];
          const a = buffer[m];
          const b = buffer[m - du];
          const c = buffer[m - du - dv];
          const d = buffer[m - dv];
          if (mask & 1) {
            faces.push(a, b, c, a, c, d);
          } else {
            faces.push(a, d, c, a, c, b);
          }
        }
      }
    }
  }

  return { positions: new Float32Array(vertices), indices: new Uint32Array(faces) };
}

/** Build a Three BufferGeometry (with normals) from a scalar field. */
export function fieldToGeometry(
  values: Float32Array,
  n: number,
  iso: number,
  scale: number,
  origin: [number, number, number]
): THREE.BufferGeometry {
  const { positions, indices } = surfaceNets(values, n, iso, scale, origin);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  return geo;
}
