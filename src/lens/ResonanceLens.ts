import * as THREE from "three";
import { Palette, SpectralBands } from "../world/Palette";
import { pastel } from "../world/Materials";
import { softBox, inkOutline } from "../world/Geometry";
import { WorldState } from "../spectral/WorldState";

export interface LensScreenState {
  world: WorldState;
  /** Real per-band FFT energy for the current room, normalized 0..1, drawn as 3 vertical bars. */
  bands: number[];
  /** Index (0..2) of the currently tuned band — its bar gets a brighter outline. */
  selectedBand: number;
  /** 0..1 phase value of the current room's node (positions the shimmer ring). */
  phase: number;
  /** 0..1 nearness-to-lock; intensifies a shimmer ring WITHOUT a drawn target. */
  shimmer: number;
  /** Per-node already-locked flags; drawn as faint mint chord dots in a top row. */
  carried: boolean[];
  /** 0..1 reconstruction progress (drives screen crystal). */
  reconstruct: number;
  /** All nodes phase-locked — tints the screen edge / shimmer mint for commit. */
  chordReady: boolean;
}

/**
 * The handheld Resonance Lens — a procedural phone/scanner held lower-right.
 * Its screen is a live CanvasTexture (the game's only "UI surface in world").
 */
export class ResonanceLens {
  readonly group = new THREE.Group();

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private sway = new THREE.Vector2();
  private restPos = new THREE.Vector3(0.2, -0.34, -0.78);
  private restRot = new THREE.Euler(-0.3, -0.2, 0.05);

  constructor() {
    // ---- body ----
    const bodyGeo = softBox(0.3, 0.56, 0.035, 0.004);
    const body = new THREE.Mesh(bodyGeo, pastel(0x3b3a3c));
    body.add(inkOutline(bodyGeo, Palette.ink, 0.4));
    this.group.add(body);

    // lower bezel (the rounded grip area in the screenshot)
    const grip = new THREE.Mesh(softBox(0.3, 0.16, 0.04, 0.004), pastel(0x2c2b2d));
    grip.position.set(0, -0.22, 0.002);
    this.group.add(grip);

    // home button
    const btn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.028, 0.02, 16),
      pastel(0x55545a)
    );
    btn.rotation.x = Math.PI / 2;
    btn.position.set(0, -0.225, 0.03);
    this.group.add(btn);

    // ---- screen (canvas texture) ----
    this.canvas = document.createElement("canvas");
    this.canvas.width = 256;
    this.canvas.height = 320;
    this.ctx = this.canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    // 256x320 is non-power-of-two; mipmaps on NPOT textures flash black on iOS.
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.26, 0.36),
      new THREE.MeshBasicMaterial({ map: this.texture })
    );
    screen.position.set(0, 0.06, 0.021);
    this.group.add(screen);

    this.group.position.copy(this.restPos);
    this.group.rotation.copy(this.restRot);

    this.drawScreen({
      world: WorldState.Reality,
      bands: [0, 0, 0],
      selectedBand: 1,
      phase: 0,
      shimmer: 0,
      carried: [false, false, false],
      reconstruct: 0,
      chordReady: false
    });
  }

  /** Attach as a child of the camera so it's always held in view. */
  attachTo(camera: THREE.Object3D): void {
    camera.add(this.group);
  }

  /** Gentle handheld sway driven by look + a slow idle bob. */
  updateSway(lookDelta: THREE.Vector2, time: number, dt: number): void {
    const targetX = THREE.MathUtils.clamp(-lookDelta.x * 0.0006, -0.05, 0.05);
    const targetY = THREE.MathUtils.clamp(lookDelta.y * 0.0006, -0.05, 0.05);
    this.sway.x = THREE.MathUtils.lerp(this.sway.x, targetX, 1 - Math.exp(-6 * dt));
    this.sway.y = THREE.MathUtils.lerp(this.sway.y, targetY, 1 - Math.exp(-6 * dt));
    const bob = Math.sin(time * 1.6) * 0.004;
    this.group.position.set(
      this.restPos.x + this.sway.x,
      this.restPos.y + this.sway.y + bob,
      this.restPos.z
    );
    this.group.rotation.set(
      this.restRot.x + this.sway.y * 0.5,
      this.restRot.y + this.sway.x * 0.6,
      this.restRot.z
    );
  }

  // ---------------- screen rendering ----------------
  drawScreen(s: LensScreenState): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // screen background tints by state
    const bg =
      s.world === WorldState.Reality
        ? "#e9e3d7"
        : s.world === WorldState.FrequencyGhosts
          ? "#e7e2da"
          : "#d9d4e4";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;

    if (s.world === WorldState.DeepResonance || s.reconstruct > 0.01) {
      this.drawCrystal(cx, cy, s.reconstruct || 1);
      this.drawScatter(w, h);
      this.texture.needsUpdate = true;
      return;
    }

    // reticle ring
    ctx.strokeStyle = "rgba(95,90,85,0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 56, 0, Math.PI * 2);
    ctx.stroke();

    if (s.world === WorldState.Reality) {
      // single calm central dot
      this.dot(cx, cy, 4, hex(Palette.spectralMint));
    } else {
      // ---- carried chord dots (top row) ----
      // one faint mint dot per already-locked node, left→right.
      for (let i = 0; i < 3; i++) {
        const dx = cx + (i - 1) * 22;
        const dy = 26;
        if (s.carried[i]) {
          this.dot(dx, dy, 4, "rgba(157,216,192,0.85)");
        } else {
          ctx.strokeStyle = "rgba(95,90,85,0.3)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(dx, dy, 4, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // ---- three vertical band bars: brightness == real FFT energy ----
      const barW = 22;
      const baseY = cy + 70; // bottom edge of the bars
      for (let i = 0; i < 3; i++) {
        const energy = clamp01(s.bands[i] ?? 0);
        const bx = cx + (i - 1) * 36;
        const barH = 30 + energy * 90;
        const color = SpectralBands[i % SpectralBands.length];
        const alpha = 0.35 + 0.6 * energy;
        ctx.fillStyle = rgba(color, alpha);
        roundedRect(ctx, bx - barW / 2, baseY - barH, barW, barH, 5);
        ctx.fill();
        if (i === s.selectedBand) {
          ctx.strokeStyle = rgba(color, 0.95);
          ctx.lineWidth = 2;
          roundedRect(ctx, bx - barW / 2, baseY - barH, barW, barH, 5);
          ctx.stroke();
        }
      }

      // band indicator label (Low/Mid/High) — words, never numbers
      ctx.fillStyle = "rgba(95,90,85,0.6)";
      ctx.font = "300 13px Helvetica, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(["LOW", "MID", "HIGH"][s.selectedBand] ?? "MID", cx, h - 22);

      // ---- phase track + shimmer ring (no target, no tick) ----
      const trackY = h - 40;
      const span = w - 56;
      const px = 28 + s.phase * span;
      ctx.strokeStyle = "rgba(95,90,85,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(28, trackY);
      ctx.lineTo(w - 28, trackY);
      ctx.stroke();
      // soft glow ring at the phase position; nearness == shimmer growth.
      const ringR = 10 + s.shimmer * 22;
      const ringA = 0.2 + 0.7 * s.shimmer;
      const ringColor = s.chordReady ? Palette.spectralMint : Palette.spectralViolet;
      ctx.strokeStyle = rgba(ringColor, ringA);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, trackY, ringR, 0, Math.PI * 2);
      ctx.stroke();
      this.dot(px, trackY, 3, rgba(ringColor, Math.min(1, 0.4 + s.shimmer)));
    }

    // chord-ready: tint the screen edge mint to signal commit availability.
    if (s.chordReady && s.world !== WorldState.Reality) {
      ctx.strokeStyle = rgba(Palette.spectralMint, 0.7);
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, w - 4, h - 4);
    }
    this.texture.needsUpdate = true;
  }

  private drawCrystal(cx: number, cy: number, amt: number): void {
    const ctx = this.ctx;
    const r = 34 * (0.4 + 0.6 * amt);
    ctx.strokeStyle = hex(Palette.spectralBlue);
    ctx.fillStyle = "rgba(142,186,217,0.25)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.7, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r * 0.7, cy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.moveTo(cx - r * 0.7, cy);
    ctx.lineTo(cx + r * 0.7, cy);
    ctx.stroke();
  }

  private drawScatter(w: number, h: number): void {
    for (let i = 0; i < 12; i++) {
      const x = (Math.sin(i * 91.3) * 0.5 + 0.5) * w;
      const y = (Math.cos(i * 47.7) * 0.5 + 0.5) * h;
      this.dot(x, y, 2, "rgba(185,161,230,0.7)");
    }
  }

  private dot(x: number, y: number, r: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.fill();
  }
}

function hex(c: number): string {
  return "#" + c.toString(16).padStart(6, "0");
}

function rgba(c: number, a: number): string {
  const r = (c >> 16) & 0xff;
  const g = (c >> 8) & 0xff;
  const b = c & 0xff;
  return `rgba(${r},${g},${b},${a})`;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
