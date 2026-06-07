import * as THREE from "three";
import { Palette, type PaletteKey } from "./Palette";
import { pastel } from "./Materials";

/**
 * Small procedural "animals" / creatures. At most ~40 individual animated
 * Group rigs exist at once (see PERF BUDGET); they are NOT part of the voxel
 * field and never contribute to collision — purely cosmetic life in Reality.
 *
 * Each rig is an ellipsoid/cone primitive assembly with NAMED parts so the
 * motion is fully procedural (sin of time + per-rig phase). Beyond the LOD
 * fade distance the detail parts hide and the body is frozen.
 */

export type CreatureKind =
  | "cat"
  | "goldfish"
  | "deer"
  | "bird"
  | "squirrel"
  | "alienGrazer"
  | "drone";

/**
 * A creature instance. `group` is the scene node; `base` snapshots the rest-pose
 * local positions/rotations so per-frame animation is relative (re-derivable and
 * deterministic). `wander` carries a slow drift origin + bounds for seeded roam.
 */
export interface CreatureRig {
  group: THREE.Group;
  kind: CreatureKind;
  /** Per-rig animation phase so a herd doesn't move in lockstep. */
  phase: number;
  /** Seeded slow-wander state: origin, drift radius, angular speed. */
  wander: {
    origin: THREE.Vector3;
    radius: number;
    speed: number;
    /** heading used to derive deterministic drift direction */
    heading: number;
  };
  /** Rest-pose snapshot for relative animation. */
  base: {
    bodyY: number;
    headY: number;
    legY: number;
    tailRotX: number;
  };
  parts: {
    body: THREE.Mesh;
    head: THREE.Mesh;
    legL: THREE.Mesh;
    legR: THREE.Mesh;
    tail: THREE.Mesh;
  };
}

/** Distance (world units) past which detail freezes and hides. */
const LOD_DIST = 40;

/** Deterministic per-rig phase from a creature's spawn-derived value. */
function rng(seed: number): number {
  const h = Math.sin(seed * 91.7 + 13.1) * 43758.5453;
  return h - Math.floor(h);
}

/** Make a scaled sphere (ellipsoid) mesh of the given pastel color. */
function ellipsoid(
  rx: number,
  ry: number,
  rz: number,
  color: number
): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1, 10, 8);
  const mesh = new THREE.Mesh(geo, pastel(color));
  mesh.scale.set(rx, ry, rz);
  return mesh;
}

/** Make a small cone (ears, fins, antlers, snouts, tails). */
function cone(radius: number, height: number, color: number): THREE.Mesh {
  const geo = new THREE.ConeGeometry(radius, height, 7);
  return new THREE.Mesh(geo, pastel(color));
}

/** Resolve a pastel palette key to its 0xRRGGBB value. */
function colorOf(key: PaletteKey): number {
  return Palette[key];
}

/**
 * Build a named-part creature rig. Body/head/legs/tail always exist so the
 * animation contract is uniform; finned/floating kinds (goldfish, drone) simply
 * tuck their "legs" away and pulse instead of stepping.
 */
export function makeCreature(
  kind: CreatureKind,
  colorKey: PaletteKey
): CreatureRig {
  const c = colorOf(colorKey);
  const accent = Palette.ink;
  const group = new THREE.Group();

  let body: THREE.Mesh;
  let head: THREE.Mesh;
  let legL: THREE.Mesh;
  let legR: THREE.Mesh;
  let tail: THREE.Mesh;

  switch (kind) {
    case "cat": {
      body = ellipsoid(0.16, 0.13, 0.3, c);
      body.position.y = 0.22;
      head = ellipsoid(0.13, 0.12, 0.12, c);
      head.position.set(0, 0.28, 0.3);
      const earL = cone(0.05, 0.1, c);
      earL.position.set(-0.07, 0.39, 0.3);
      const earR = earL.clone();
      earR.position.x = 0.07;
      head.add(earL, earR);
      legL = ellipsoid(0.04, 0.12, 0.04, c);
      legL.position.set(-0.1, 0.1, 0.14);
      legR = legL.clone();
      legR.position.x = 0.1;
      tail = ellipsoid(0.04, 0.04, 0.2, c);
      tail.position.set(0, 0.28, -0.32);
      break;
    }
    case "goldfish": {
      body = ellipsoid(0.1, 0.13, 0.22, c);
      body.position.y = 0.0;
      head = ellipsoid(0.09, 0.1, 0.09, c);
      head.position.set(0, 0.0, 0.2);
      // pectoral "legs" double as fins, tucked low
      legL = cone(0.06, 0.12, c);
      legL.rotation.z = Math.PI / 2;
      legL.position.set(-0.1, -0.02, 0.0);
      legR = legL.clone();
      legR.rotation.z = -Math.PI / 2;
      legR.position.x = 0.1;
      tail = cone(0.12, 0.18, c);
      tail.rotation.x = -Math.PI / 2;
      tail.position.set(0, 0, -0.26);
      break;
    }
    case "deer": {
      body = ellipsoid(0.22, 0.26, 0.5, c);
      body.position.y = 0.75;
      head = ellipsoid(0.13, 0.16, 0.22, c);
      head.position.set(0, 1.05, 0.55);
      const antlerL = cone(0.03, 0.22, accent);
      antlerL.position.set(-0.08, 1.25, 0.55);
      const antlerR = antlerL.clone();
      antlerR.position.x = 0.08;
      head.add(antlerL, antlerR);
      legL = ellipsoid(0.05, 0.4, 0.05, c);
      legL.position.set(-0.14, 0.4, 0.3);
      legR = legL.clone();
      legR.position.x = 0.14;
      tail = ellipsoid(0.05, 0.08, 0.1, c);
      tail.position.set(0, 0.85, -0.5);
      break;
    }
    case "bird": {
      body = ellipsoid(0.08, 0.09, 0.14, c);
      body.position.y = 0.4;
      head = ellipsoid(0.06, 0.06, 0.06, c);
      head.position.set(0, 0.46, 0.13);
      const beak = cone(0.02, 0.06, Palette.sandstone);
      beak.rotation.x = Math.PI / 2;
      beak.position.set(0, 0.45, 0.2);
      head.add(beak);
      // wings act as "legs" for the animation rig
      legL = ellipsoid(0.12, 0.02, 0.07, c);
      legL.position.set(-0.1, 0.4, 0);
      legR = legL.clone();
      legR.position.x = 0.1;
      tail = cone(0.05, 0.1, c);
      tail.rotation.x = -Math.PI / 2;
      tail.position.set(0, 0.4, -0.14);
      break;
    }
    case "squirrel": {
      body = ellipsoid(0.1, 0.12, 0.18, c);
      body.position.y = 0.16;
      head = ellipsoid(0.08, 0.08, 0.08, c);
      head.position.set(0, 0.28, 0.16);
      legL = ellipsoid(0.03, 0.08, 0.03, c);
      legL.position.set(-0.06, 0.06, 0.08);
      legR = legL.clone();
      legR.position.x = 0.06;
      tail = ellipsoid(0.07, 0.18, 0.07, c);
      tail.position.set(0, 0.3, -0.18);
      break;
    }
    case "alienGrazer": {
      body = ellipsoid(0.28, 0.2, 0.34, c);
      body.position.y = 0.55;
      head = ellipsoid(0.12, 0.18, 0.12, c);
      head.position.set(0, 0.78, 0.32);
      const stalkL = cone(0.02, 0.16, accent);
      stalkL.position.set(-0.06, 0.95, 0.32);
      const stalkR = stalkL.clone();
      stalkR.position.x = 0.06;
      head.add(stalkL, stalkR);
      legL = ellipsoid(0.06, 0.28, 0.06, c);
      legL.position.set(-0.18, 0.28, 0.1);
      legR = legL.clone();
      legR.position.x = 0.18;
      tail = ellipsoid(0.05, 0.05, 0.18, c);
      tail.position.set(0, 0.55, -0.36);
      break;
    }
    case "drone":
    default: {
      body = ellipsoid(0.16, 0.08, 0.16, c);
      body.position.y = 0.9;
      head = ellipsoid(0.07, 0.07, 0.07, Palette.spectralBlue);
      head.position.set(0, 0.96, 0.1);
      // rotor "legs" splayed; they pulse rather than step
      legL = ellipsoid(0.12, 0.015, 0.04, accent);
      legL.position.set(-0.16, 0.95, 0);
      legR = legL.clone();
      legR.position.x = 0.16;
      tail = ellipsoid(0.04, 0.015, 0.12, accent);
      tail.position.set(0, 0.95, -0.16);
      break;
    }
  }

  group.add(body, head, legL, legR, tail);

  const phase = rng(c + colorKey.length * 7.3) * Math.PI * 2;
  const wander = {
    origin: new THREE.Vector3(),
    radius: kind === "goldfish" || kind === "bird" || kind === "drone" ? 1.6 : 0.9,
    speed: 0.15 + rng(c + 3.1) * 0.2,
    heading: rng(c + 9.7) * Math.PI * 2
  };

  return {
    group,
    kind,
    phase,
    wander,
    base: {
      bodyY: body.position.y,
      headY: head.position.y,
      legY: legL.position.y,
      tailRotX: tail.rotation.x
    },
    parts: { body, head, legL, legR, tail }
  };
}

/**
 * Animate a creature for the current frame. `dist` is camera→creature distance:
 * beyond LOD_DIST the rig freezes and hides detail (head/legs/tail), showing
 * only the body. Within range it bobs, turns its head, swings legs, and slowly
 * wanders within its seeded bounds.
 *
 * No collision and no voxel contribution: this only mutates local transforms.
 */
export function animateCreature(
  rig: CreatureRig,
  time: number,
  dist: number
): void {
  const { parts, base } = rig;

  if (dist > LOD_DIST) {
    // Freeze + low-detail: body only.
    parts.head.visible = false;
    parts.legL.visible = false;
    parts.legR.visible = false;
    parts.tail.visible = false;
    parts.body.position.y = base.bodyY;
    return;
  }

  parts.head.visible = true;
  parts.legL.visible = true;
  parts.legR.visible = true;
  parts.tail.visible = true;

  const t = time * 2 + rig.phase;
  const floating =
    rig.kind === "goldfish" || rig.kind === "drone" || rig.kind === "bird";

  // Body bob (vertical or hover).
  const bob = Math.sin(t) * (floating ? 0.05 : 0.02);
  parts.body.position.y = base.bodyY + bob;
  parts.head.position.y = base.headY + bob;

  // Head turn — gentle look-around.
  parts.head.rotation.y = Math.sin(time * 0.7 + rig.phase) * 0.5;

  if (rig.kind === "goldfish" || rig.kind === "drone") {
    // Pulse fins/rotors instead of stepping.
    const pulse = 1 + Math.sin(t * 3) * 0.4;
    parts.legL.scale.x = pulse;
    parts.legR.scale.x = pulse;
    parts.legL.position.y = base.legY;
    parts.legR.position.y = base.legY;
    // tail sweep
    parts.tail.rotation.x = base.tailRotX + Math.sin(t * 3) * 0.4;
  } else if (rig.kind === "bird") {
    // Wing flap.
    parts.legL.rotation.z = Math.sin(t * 4) * 0.6;
    parts.legR.rotation.z = -Math.sin(t * 4) * 0.6;
    parts.tail.rotation.x = base.tailRotX + Math.sin(t) * 0.2;
  } else {
    // Leg swing (opposed) + tail flick.
    const swing = Math.sin(t) * 0.08;
    parts.legL.position.y = base.legY + Math.max(0, swing);
    parts.legR.position.y = base.legY + Math.max(0, -swing);
    parts.tail.rotation.x = base.tailRotX + Math.sin(t * 1.5) * 0.25;
  }

  // Seeded slow wander with bounds wrap (drift around origin, never escapes).
  const w = rig.wander;
  const a = w.heading + time * w.speed;
  const dx = Math.cos(a) * w.radius * (0.5 + 0.5 * Math.sin(time * 0.3 + rig.phase));
  const dz = Math.sin(a) * w.radius * (0.5 + 0.5 * Math.cos(time * 0.27 + rig.phase));
  rig.group.position.set(w.origin.x + dx, w.origin.y, w.origin.z + dz);
  // Face the direction of travel.
  rig.group.rotation.y = a + Math.PI / 2;
}
