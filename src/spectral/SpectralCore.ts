import * as THREE from "three";
import { Reconstruction } from "./Reconstruction";
import { noise3 } from "../world/Geometry";
import { CollisionField } from "./CollisionField";
import { RealityScene, defaultRealityPalette } from "./RealityScene";
import {
  computeSpectralWorld,
  bandCountForLevel,
  type Marker,
  type MeshArrays,
  type SpectralResult
} from "./SpectralCompute";

export type CoreState = "loading" | "establishing" | "reality" | "spectral" | "eliminating" | "restored";
export type ElimResult = "solved" | "decoy" | "none";

const GRID = 64;

interface Look {
  a: number; // colorA
  b: number; // colorB (height gradient top)
  sky: number;
  ground: number;
  rim: number;
}
interface ArchPalette {
  reality: Look;
  spectral: Look;
  restored: Look;
  bg: { reality: number; spectral: number; restored: number; establishing: number };
}

/** Per-environment colour + lighting identity so each world reads distinctly. */
const PALETTES: Record<string, ArchPalette> = {
  APARTMENT: {
    reality: { a: 0xd9b7b0, b: 0xc8c2d6, sky: 0xe6d6cf, ground: 0x8f8593, rim: 0xd98a8a },
    spectral: { a: 0xb7cfe3, b: 0x9dd8c0, sky: 0xdfeaf2, ground: 0x9fb0c0, rim: 0xb9a1e6 },
    restored: { a: 0xf6f1e8, b: 0xb8c8b4, sky: 0xfff4e6, ground: 0xcbb48f, rim: 0x9dd8c0 },
    bg: { reality: 0xddc8c0, spectral: 0xe9eef2, restored: 0xf6f1e8, establishing: 0xf6f1e8 }
  },
  "OFFICE TOWER": {
    reality: { a: 0x9aa3ad, b: 0x6f7780, sky: 0xc7ccd2, ground: 0x55595f, rim: 0x7fd0e6 },
    spectral: { a: 0x8ec5e6, b: 0xbfe0ef, sky: 0xdfeefa, ground: 0x8aa0b0, rim: 0x9fe0ff },
    restored: { a: 0xcfe0ea, b: 0xa9c2d4, sky: 0xeef4fa, ground: 0x9bb0c0, rim: 0xbfeeff },
    bg: { reality: 0xb4bcc4, spectral: 0xdfeefa, restored: 0xeef4fa, establishing: 0xeef4fa }
  },
  LANDSCAPE: {
    reality: { a: 0x8a9a6a, b: 0x6b7a4a, sky: 0xbfd0c0, ground: 0x4f5d38, rim: 0xd0e08a },
    spectral: { a: 0x9dd8c0, b: 0xc8e8d0, sky: 0xdfeede, ground: 0x9fb88f, rim: 0xbfeec0 },
    restored: { a: 0xb8c8a4, b: 0x88a86a, sky: 0xdfeeda, ground: 0xa8b888, rim: 0xd8e8a0 },
    bg: { reality: 0xbecdb0, spectral: 0xdfeede, restored: 0xe6efda, establishing: 0xe6efda }
  },
  STARSHIP: {
    reality: { a: 0x3a4a52, b: 0x2a363c, sky: 0x47565e, ground: 0x12181c, rim: 0x4ff0e0 },
    spectral: { a: 0x4fd0e0, b: 0x80e8f0, sky: 0x2a3a42, ground: 0x16202a, rim: 0x9ff8ff },
    restored: { a: 0x7fd0d8, b: 0x4fa0b0, sky: 0x3a4a52, ground: 0x202a30, rim: 0xaff8ff },
    bg: { reality: 0x0e1418, spectral: 0x16242c, restored: 0x1a2a32, establishing: 0x16242c }
  },
  PLANET: {
    reality: { a: 0x6a5a7a, b: 0x4a3a5a, sky: 0x2a2238, ground: 0x100c18, rim: 0xe66fb5 },
    spectral: { a: 0x9a8ad0, b: 0xc0b0f0, sky: 0x1e1830, ground: 0x100a1c, rim: 0xc0a0ff },
    restored: { a: 0xd8c8a8, b: 0xb89878, sky: 0x2a2238, ground: 0x16101e, rim: 0xffd0a0 },
    bg: { reality: 0x080610, spectral: 0x12101f, restored: 0x17131f, establishing: 0x12101f }
  }
};
const DEFAULT_PALETTE = PALETTES.APARTMENT;

interface Candidate {
  center: THREE.Vector3;
  radius: number;
  isReal: boolean;
  dead: boolean;
  mesh: THREE.Mesh;
  halo: THREE.Mesh;
  hit: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  haloMat: THREE.ShaderMaterial;
}

function col(hex: number): THREE.Color {
  return new THREE.Color(hex);
}

/** Cheap UA/touch probe so RealityScene can pull its instance caps in on mobile. */
function detectMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const touch = typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 0;
  const narrow = typeof window !== "undefined" && window.innerWidth <= 900;
  return /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(ua) || (touch && !/Mac/i.test(ua) && narrow);
}

function geomFromArrays(m: MeshArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeVertexNormals();
  return g;
}

/**
 * Owns one corrupted world's Fourier decomposition (built off-thread at 64³) and
 * the player loop. Among the candidates that resolve in the anomaly band, exactly
 * one is the true noise source (it jitters erratically); the rest are steady
 * decoys. Eliminate the real one to restore the world and descend.
 */
export class SpectralCore {
  readonly group = new THREE.Group();
  level = 1;
  state: CoreState = "loading";
  band = 0;
  ready = false;

  private seed: number;
  private worker?: Worker;
  private loadId = 0;

  private bandGeoms: THREE.BufferGeometry[] = [];
  private cleanGeom?: THREE.BufferGeometry;
  private bandCountVal = 0;
  private anomalyBandVal = 1;
  private archName = "";
  private pal: ArchPalette = DEFAULT_PALETTE;
  collisionField?: CollisionField;
  private originVec = new THREE.Vector3();
  private sizeVec = new THREE.Vector3();

  private mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private realityScene = new RealityScene();
  private mobile = detectMobile();
  private candidateGroup = new THREE.Group();
  private candidates: Candidate[] = [];
  private focusedIndex = -1;

  private elimination = new Reconstruction(1.3);
  private onSolved?: (level: number) => void;
  private lastSpawn = { x: 0, z: 0 };
  private lastLook = { yaw: 0, pitch: 0 };

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.mat = this.makeSurfaceMaterial();
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.group.add(this.mesh);
    this.group.add(this.realityScene.group);
    this.group.add(this.candidateGroup);

    try {
      this.worker = new Worker(new URL("./spectral.worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (e: MessageEvent<{ id: number; result: SpectralResult }>) => {
        if (e.data.id === this.loadId) this.applyResult(e.data.result);
      };
    } catch {
      this.worker = undefined;
    }
  }

  setSolvedCallback(cb: (level: number) => void): void {
    this.onSolved = cb;
  }

  load(level: number): void {
    this.level = level;
    this.ready = false;
    this.state = "loading";
    this.band = 0;
    this.focusedIndex = -1;
    this.elimination = new Reconstruction(1.3);
    const id = ++this.loadId;
    this.mesh.geometry = new THREE.BufferGeometry();
    this.clearCandidates();

    const K = bandCountForLevel(level);
    if (this.worker) {
      this.worker.postMessage({ id, level, seed: this.seed, n: GRID, K });
    } else {
      this.applyResult(computeSpectralWorld(level, this.seed, GRID, K));
    }
  }

  private applyResult(res: SpectralResult): void {
    for (const g of this.bandGeoms) g.dispose();
    this.cleanGeom?.dispose();
    this.bandGeoms = res.bands.map(geomFromArrays);
    this.cleanGeom = geomFromArrays(res.clean);
    this.bandCountVal = this.bandGeoms.length;
    this.anomalyBandVal = res.anomalyBand;
    this.lastSpawn = res.spawn;
    this.lastLook = res.look;
    this.archName = res.name;
    this.pal = PALETTES[res.name] ?? DEFAULT_PALETTE;
    this.collisionField = new CollisionField(res.solid, res.n, res.origin, res.scale);

    this.mesh.scale.set(res.scale[0], res.scale[1], res.scale[2]);
    this.mesh.position.set(res.origin[0], res.origin[1], res.origin[2]);
    this.originVec.set(res.origin[0], res.origin[1], res.origin[2]);
    this.sizeVec.set(res.scale[0] * GRID, res.scale[1] * GRID, res.scale[2] * GRID);

    this.clearCandidates();
    this.candidates.push(this.makeCandidate(res.anomaly, true));
    for (const d of res.decoys) this.candidates.push(this.makeCandidate(d, false));

    // Materialize the populated Reality (InstancedMesh pools + creature rigs) from
    // the same plan that drove the spectral field, so Reality and the bands agree.
    this.realityScene.build(res.population, res.creatures, res.establishing, defaultRealityPalette, this.mobile);

    this.ready = true;
    this.state = "establishing"; // show the clean, recognizable place first
    this.refreshMesh();
  }

  /** End the establishing shot — the world "corrupts" into reality. */
  beginReality(): void {
    if (this.state === "establishing") {
      this.state = "reality";
      this.refreshMesh();
    }
  }

  get collision(): CollisionField | undefined {
    return this.collisionField;
  }
  groundYAt(x: number, z: number): number {
    return this.collisionField ? this.collisionField.groundYAt(x, z, 24) : 0;
  }
  /** World-space AABB of the structure — used to frame the establishing shot. */
  bounds(): { center: THREE.Vector3; size: THREE.Vector3 } {
    return { center: this.originVec.clone().addScaledVector(this.sizeVec, 0.5), size: this.sizeVec.clone() };
  }
  /** Per-state, per-archetype background/fog colour. */
  backgroundColor(): number {
    if (!this.ready || this.state === "loading") return this.pal.bg.establishing;
    if (this.state === "establishing") return this.pal.bg.establishing;
    if (this.state === "restored" || this.state === "eliminating") return this.pal.bg.restored;
    if (this.state === "spectral") return this.pal.bg.spectral;
    return this.pal.bg.reality;
  }

  // ---------------- player-driven ----------------
  enterSpectral(): void {
    if (this.ready && this.state === "reality") {
      this.state = "spectral";
      this.refreshMesh();
    }
  }
  exitToReality(): void {
    if (this.state === "spectral") {
      this.state = "reality";
      this.refreshMesh();
    }
  }
  stepBand(d: number): void {
    if (this.state !== "spectral") return;
    this.band = Math.max(0, Math.min(this.bandCountVal - 1, this.band + d));
    this.refreshMesh();
  }

  /** Game feeds the raycast hit (or null) each frame. */
  setFocus(obj: THREE.Object3D | null): void {
    this.focusedIndex = obj ? this.candidates.findIndex((c) => !c.dead && c.hit === obj) : -1;
  }
  get targeted(): boolean {
    return this.focusedIndex >= 0 && this.anomalyVisible;
  }
  get anomalyVisible(): boolean {
    return this.ready && this.state === "spectral" && this.band >= this.anomalyBandVal;
  }
  hitTargets(): THREE.Object3D[] {
    return this.anomalyVisible ? this.candidates.filter((c) => !c.dead).map((c) => c.hit) : [];
  }

  eliminate(): ElimResult {
    if (this.state !== "spectral" || !this.anomalyVisible || this.focusedIndex < 0) return "none";
    const c = this.candidates[this.focusedIndex];
    if (c.isReal) {
      this.state = "eliminating";
      this.elimination.start(undefined, () => {
        this.state = "restored";
        this.refreshMesh();
        this.onSolved?.(this.level);
      });
      return "solved";
    }
    // decoy: clear it harmlessly; keep searching
    c.dead = true;
    c.mesh.visible = false;
    this.focusedIndex = -1;
    return "decoy";
  }

  /** Test-only: aim at the true anomaly (used by the headless smoke). */
  debugFocusReal(): void {
    this.focusedIndex = this.candidates.findIndex((c) => c.isReal && !c.dead);
  }

  get bandCount(): number {
    return Math.max(1, this.bandCountVal);
  }
  get anomalyBand(): number {
    return this.anomalyBandVal;
  }
  get decoyCount(): number {
    return this.candidates.filter((c) => !c.isReal).length;
  }
  get eliminationAmount(): number {
    return this.elimination.amount;
  }
  get solved(): boolean {
    return this.state === "restored";
  }
  get spawn(): { x: number; z: number } {
    return this.lastSpawn;
  }
  get spawnLook(): { yaw: number; pitch: number } {
    return this.lastLook;
  }
  get name(): string {
    return this.archName;
  }

  private applyLook(look: Look): void {
    const u = this.mat.uniforms;
    u.uColorA.value.setHex(look.a);
    u.uColorB.value.setHex(look.b);
    u.uSky.value.setHex(look.sky);
    u.uGround.value.setHex(look.ground);
    u.uRim.value.setHex(look.rim);
  }

  private refreshMesh(): void {
    const u = this.mat.uniforms;
    // Reality + the establishing shot show the populated InstancedMesh scene; the
    // isosurface mesh is hidden. Every other state shows the Fourier isosurface and
    // hides the population. The discrete state machine gates the swap (no crossfade).
    const populated = this.state === "reality" || this.state === "establishing";
    this.realityScene.group.visible = populated;
    this.mesh.visible = !populated;

    if (this.state === "restored") {
      this.mesh.geometry = this.cleanGeom ?? this.mesh.geometry;
      this.applyLook(this.pal.restored);
      u.uChaos.value = 0;
    } else if (this.state === "establishing") {
      // the clean, recognizable place — no corruption (population drives the visuals)
      this.mesh.geometry = this.cleanGeom ?? this.mesh.geometry;
      this.applyLook(this.pal.restored);
      u.uChaos.value = 0;
    } else if (this.state === "reality" || this.state === "loading") {
      this.mesh.geometry = this.bandGeoms[this.bandCountVal - 1] ?? this.mesh.geometry;
      this.applyLook(this.pal.reality);
      u.uChaos.value = 1;
    } else {
      this.mesh.geometry = this.bandGeoms[this.band] ?? this.mesh.geometry;
      this.applyLook(this.pal.spectral);
      u.uChaos.value = 0;
    }
  }

  update(dt: number, time: number): void {
    this.elimination.update(dt);
    this.mat.uniforms.uTime.value = time;

    const eliminating = this.state === "eliminating";
    const base = this.anomalyVisible || eliminating;
    for (const c of this.candidates) {
      if (c.dead) {
        c.mesh.visible = false;
        continue;
      }
      let vis = base ? 1 : 0;
      if (eliminating) vis = c.isReal ? 1 - this.eliminationAmount : 0;
      c.mesh.visible = vis > 0.01;
      const focused = this.candidates[this.focusedIndex] === c;
      c.mat.uniforms.uOpacity.value = (c.isReal ? 0.95 : 0.7) * vis;
      c.haloMat.uniforms.uOpacity.value = (c.isReal ? 0.3 : 0.16) * vis;
      c.mat.uniforms.uTime.value = time;
      c.haloMat.uniforms.uTime.value = time;

      // motion tell: the real source jitters erratically; decoys hold steady
      if (c.isReal) {
        const j = 0.14 * c.radius;
        c.mesh.position.set(
          c.center.x + noise3(time * 3.1, c.center.x, 1) * j,
          c.center.y + noise3(time * 2.7, c.center.y, 2) * j,
          c.center.z + noise3(time * 3.4, c.center.z, 3) * j
        );
        const flick = 0.85 + 0.15 * Math.sin(time * 22 + c.center.x);
        c.mat.uniforms.uOpacity.value *= flick;
      } else {
        c.mesh.position.copy(c.center);
      }
      c.hit.position.copy(c.mesh.position);

      const pulse = 1 + Math.sin(time * (c.isReal ? 4 : 2) + c.center.x) * (c.isReal ? 0.18 : 0.08) + (focused ? 0.25 : 0);
      const shrink = eliminating && c.isReal ? 1 - this.eliminationAmount : 1;
      c.mesh.scale.setScalar(Math.max(0.001, c.radius * pulse * shrink));
      c.mesh.rotation.y = time * (c.isReal ? 0.9 : 0.4);
      c.mesh.rotation.x = Math.sin(time * 0.5) * 0.5;
    }
  }

  /**
   * Per-frame Reality tick — frustum culling, distance LOD swaps, zero-scale fade
   * and creature animation. Only runs while the populated scene is on screen
   * (reality/establishing); skipped entirely in the spectral/isosurface states so
   * the heavy populated draw load never coexists with the FFT-band frame.
   */
  updateReality(camera: THREE.PerspectiveCamera, time: number): void {
    if (this.realityScene.group.visible) this.realityScene.update(camera, time);
  }

  dispose(): void {
    for (const g of this.bandGeoms) g.dispose();
    this.cleanGeom?.dispose();
    this.clearCandidates();
    this.realityScene.dispose();
    this.worker?.terminate();
  }

  // ---------------- candidates ----------------
  private makeCandidate(m: Marker, isReal: boolean): Candidate {
    const center = new THREE.Vector3(m.center[0], m.center[1], m.center[2]);
    const mat = this.makeGlowMaterial(isReal ? 0xff6fb5 : 0xb9a1e6);
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), mat);
    const haloMat = this.makeGlowMaterial(isReal ? 0xff9ccb : 0xcdbcf0, 0.25);
    const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8, 0), haloMat);
    mesh.add(halo);
    mesh.position.copy(center);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.scale.setScalar(m.radius * 1.8);
    hit.position.copy(center);
    mesh.visible = false;
    this.candidateGroup.add(mesh, hit);
    return { center, radius: m.radius, isReal, dead: false, mesh, halo, hit, mat, haloMat };
  }

  private clearCandidates(): void {
    for (const c of this.candidates) {
      c.mesh.geometry.dispose();
      c.halo.geometry.dispose();
      c.hit.geometry.dispose();
      this.candidateGroup.remove(c.mesh, c.hit);
    }
    this.candidates = [];
    this.focusedIndex = -1;
  }

  // ---------------- materials ----------------
  private makeSurfaceMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uChaos: { value: 1 },
        uColorA: { value: col(0xd9b7b0) },
        uColorB: { value: col(0xc8c2d6) },
        uSky: { value: col(0xe6d6cf) },
        uGround: { value: col(0x8f8593) },
        uRim: { value: col(0xd98a8a) }
      },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uChaos;
        varying vec3 vN; varying vec3 vWN; varying vec3 vVP; varying float vWY;
        void main(){
          vec3 p = position;
          // a subtle slow shimmer when corrupted — NOT a heave
          float j = sin(p.x*0.7+uTime*1.0)*cos(p.y*0.7+uTime*0.7)*sin(p.z*0.7+uTime*0.9);
          p += normal * (j * uChaos * 0.3);
          vec4 wp = modelMatrix * vec4(p,1.0);
          vWY = clamp(wp.y / 2.7, 0.0, 1.0);
          vWN = normalize(mat3(modelMatrix) * normal);
          vec4 mv = modelViewMatrix * vec4(p,1.0);
          vVP = mv.xyz;
          vN = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColorA; uniform vec3 uColorB; uniform vec3 uSky; uniform vec3 uGround; uniform vec3 uRim;
        varying vec3 vN; varying vec3 vWN; varying vec3 vVP; varying float vWY;
        void main(){
          vec3 N = normalize(vN);
          vec3 V = normalize(-vVP);
          vec3 L = normalize(vec3(0.45,0.85,0.35));
          vec3 L2 = normalize(vec3(-0.4,0.35,-0.5));
          float diff = max(0.0, dot(N, L)) + 0.35 * max(0.0, dot(N, L2));
          vec3 H = normalize(L + V);
          float spec = pow(max(0.0, dot(N, H)), 40.0) * 0.35;
          vec3 amb = mix(uGround, uSky, vWN.y*0.5+0.5);
          vec3 base = mix(uColorA, uColorB, vWY);
          float fres = pow(1.0 - max(0.0, dot(N, V)), 3.0);
          vec3 c = base*(0.35+0.55*diff) + amb*0.22 + uRim*fres*0.55 + vec3(spec);
          gl_FragColor = vec4(c, 0.95);
        }`
    });
  }

  private makeGlowMaterial(hex: number, opacity = 0.95): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uColor: { value: col(hex) }, uOpacity: { value: opacity } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vVP;
        void main(){
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          vVP = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uOpacity; uniform float uTime;
        varying vec3 vN; varying vec3 vVP;
        void main(){
          vec3 N = normalize(vN); vec3 V = normalize(-vVP);
          float fres = pow(1.0 - max(0.0, dot(N, V)), 1.6);
          float pulse = 0.8 + 0.2*sin(uTime*6.0);
          gl_FragColor = vec4(uColor * (0.5 + fres*1.4) * pulse, uOpacity*(0.45 + 0.55*fres));
        }`
    });
  }
}
