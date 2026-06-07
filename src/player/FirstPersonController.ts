import * as THREE from "three";
import type { Input } from "../engine/Input";
import type { CollisionField } from "../spectral/CollisionField";
import { groundHeight, bodyBlocked, unstick } from "./VoxelCollision";

const EYE_OFFSET = 1.6; // eye height above the feet
const RADIUS = 0.32;
const SPEED = 2.6;
const ACCEL = 12;
const LOOK_SENS = 0.0022;
const PITCH_LIMIT = THREE.MathUtils.degToRad(82);
const GRAVITY = -20;
const TERMINAL = -34;
const JUMP_V = 6.2;
const STEP_UP = 0.55;
const BODY_TOP = 1.5;
const START_SCAN = 2.0; // place-at: scan from just below a second storey

/**
 * First-person controller with real voxel physics: gravity, ground-follow,
 * step-up over small ledges, wall blocking + slide, head-bump, sub-stepped to
 * avoid tunneling, and an unstick pass so the player can never get trapped in
 * geometry. Collides against the world's source density field (not the mesh).
 */
export class FirstPersonController {
  private yaw = 0;
  private pitch = 0;
  private velocity = new THREE.Vector3();
  private velY = 0;
  private feetY = 0;
  private onGround = false;
  private lookDelta = new THREE.Vector2();
  private tmp = new THREE.Vector2();
  private collider?: CollisionField;
  private cinematic = false;
  readonly lastLook = new THREE.Vector2();
  controlsEnabled = true;

  constructor(
    private pivot: THREE.Object3D,
    private camera: THREE.Object3D,
    private input: Input,
    spawn: THREE.Vector3
  ) {
    this.pivot.position.set(spawn.x, EYE_OFFSET, spawn.z);
    this.pivot.rotation.set(0, this.yaw, 0);
    this.input.on("jump", () => {
      if (this.onGround) {
        this.velY = JUMP_V;
        this.onGround = false;
      }
    });
  }

  setCollider(c?: CollisionField): void {
    this.collider = c;
  }

  /** Fixed cinematic pose framing `target` from `pos` (establishing shot). */
  setCinematic(pos: THREE.Vector3, target: THREE.Vector3): void {
    this.cinematic = true;
    this.pivot.position.copy(pos);
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    const dz = target.z - pos.z;
    const horiz = Math.max(1e-3, Math.hypot(dx, dz));
    this.yaw = Math.atan2(-dx, -dz);
    this.pitch = THREE.MathUtils.clamp(Math.atan2(dy, horiz), -PITCH_LIMIT, PITCH_LIMIT);
    this.pivot.rotation.set(0, this.yaw, 0);
    this.camera.rotation.set(this.pitch, 0, 0);
  }

  /** Move to (x,z), drop onto the ground, and optionally set look direction. */
  placeAt(x: number, z: number, yaw?: number, pitch?: number): void {
    this.cinematic = false;
    this.velocity.set(0, 0, 0);
    this.velY = 0;
    if (yaw !== undefined) this.yaw = yaw;
    if (pitch !== undefined) this.pitch = pitch;
    let px = x;
    let pz = z;
    if (this.collider) {
      const s = this.collider.solid;
      const step = this.collider.voxelY * 0.5;
      const groundAt = (gx: number, gz: number): number =>
        Math.max(0, unstick(s, gx, groundHeight(s, gx, gz, START_SCAN, step, 0), gz, BODY_TOP, step, 6));
      let feet = groundAt(x, z);
      // never spawn embedded: if the body column is blocked, spiral outward for
      // the nearest open standing spot (covers furniture, hull walls, etc.)
      if (bodyBlocked(s, x, z, feet, RADIUS, STEP_UP, BODY_TOP)) {
        search: for (let r = 0.6; r <= 8; r += 0.6) {
          for (let a = 0; a < 16; a++) {
            const ang = (a / 16) * Math.PI * 2;
            const nx = x + Math.cos(ang) * r;
            const nz = z + Math.sin(ang) * r;
            const nf = groundAt(nx, nz);
            if (!bodyBlocked(s, nx, nz, nf, RADIUS, STEP_UP, BODY_TOP)) {
              px = nx;
              pz = nz;
              feet = nf;
              break search;
            }
          }
        }
      }
      this.feetY = feet;
    } else {
      this.feetY = 0;
    }
    this.pivot.position.set(px, this.feetY + EYE_OFFSET, pz);
    this.pivot.rotation.set(0, this.yaw, 0);
    this.camera.rotation.set(this.pitch, 0, 0);
  }

  update(dt: number): void {
    if (this.cinematic) return; // fixed establishing pose
    if (this.controlsEnabled) {
      this.input.updateKeyboardMove();
      this.applyLook();
    }
    this.applyMove(dt);
  }

  private applyLook(): void {
    const d = this.input.consumeLook(this.lookDelta);
    this.lastLook.copy(d);
    this.yaw -= d.x * LOOK_SENS;
    this.pitch -= d.y * LOOK_SENS;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -PITCH_LIMIT, PITCH_LIMIT);
    this.pivot.rotation.set(0, this.yaw, 0);
    this.camera.rotation.set(this.pitch, 0, 0);
  }

  private applyMove(dt: number): void {
    const input = this.controlsEnabled ? this.input.move : this.tmp.set(0, 0);
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const targetX = (cos * input.x + -sin * input.y) * SPEED;
    const targetZ = (-sin * input.x + -cos * input.y) * SPEED;
    const t = 1 - Math.exp(-ACCEL * dt);
    this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, targetX, t);
    this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, targetZ, t);

    const f = this.collider;
    if (!f) {
      // no field yet (loading): planar move at fixed eye height
      this.pivot.position.x += this.velocity.x * dt;
      this.pivot.position.z += this.velocity.z * dt;
      this.pivot.position.y = EYE_OFFSET;
      return;
    }

    const s = f.solid;
    let x = this.pivot.position.x;
    let z = this.pivot.position.z;
    let feetY = this.feetY;

    // ---- horizontal: sub-stepped, axis-separated slide ----
    const moveX = this.velocity.x * dt;
    const moveZ = this.velocity.z * dt;
    const dist = Math.hypot(moveX, moveZ);
    const steps = Math.max(1, Math.ceil(dist / (f.minVoxel * 0.5)));
    for (let i = 0; i < steps; i++) {
      const sx = moveX / steps;
      const sz = moveZ / steps;
      if (!bodyBlocked(s, x + sx, z, feetY, RADIUS, STEP_UP, BODY_TOP)) x += sx;
      if (!bodyBlocked(s, x, z + sz, feetY, RADIUS, STEP_UP, BODY_TOP)) z += sz;
    }

    // ---- vertical: gravity + swept ground ----
    this.velY = Math.max(TERMINAL, this.velY + GRAVITY * dt);
    let newFeet = feetY + this.velY * dt;
    const ground = groundHeight(s, x, z, feetY + STEP_UP, f.voxelY * 0.5, 0);
    if (newFeet <= ground) {
      newFeet = ground;
      this.velY = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
    if (this.velY > 0 && s(x, newFeet + BODY_TOP, z)) {
      this.velY = 0;
      newFeet = feetY;
    }
    newFeet = unstick(s, x, newFeet, z, BODY_TOP, f.voxelY * 0.5, 6);
    if (newFeet < 0) newFeet = 0;

    this.feetY = newFeet;
    this.pivot.position.set(x, newFeet + EYE_OFFSET, z);
  }
}
