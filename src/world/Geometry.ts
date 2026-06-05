import * as THREE from "three";

/** Deterministic hash-based value noise in [-1, 1]. No allocations. */
export function noise3(x: number, y: number, z: number): number {
  let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  h -= Math.floor(h);
  return h * 2 - 1;
}

/** Apply a tiny deterministic per-vertex offset so geometry reads as hand-drawn. */
export function wobbleGeometry(geo: THREE.BufferGeometry, amount = 0.018): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    pos.setXYZ(
      i,
      x + noise3(x, y, z) * amount,
      y + noise3(y + 11, z, x) * amount,
      z + noise3(z + 23, x, y) * amount
    );
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/** Thin ink outline for a mesh's silhouette. Returns a LineSegments to add as child. */
export function inkOutline(
  geo: THREE.BufferGeometry,
  color = 0x5f5a55,
  opacity = 0.32
): THREE.LineSegments {
  const edges = new THREE.EdgesGeometry(geo, 30);
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false
  });
  return new THREE.LineSegments(edges, mat);
}

/** Slightly randomized box geometry (deterministic) with a hand-drawn wobble. */
export function softBox(w: number, h: number, d: number, wobble = 0.012): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
  wobbleGeometry(geo, wobble);
  return geo;
}
