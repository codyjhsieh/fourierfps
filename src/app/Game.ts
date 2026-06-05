import * as THREE from "three";
import { Renderer } from "../engine/Renderer";
import { Camera } from "../engine/Camera";
import { Input } from "../engine/Input";
import { Time } from "../engine/Time";
import { PostFX } from "../engine/PostFX";
import { FirstPersonController } from "../player/FirstPersonController";
import { ResonanceLens } from "../lens/ResonanceLens";
import { WorldState, WorldStateManager } from "../spectral/WorldState";
import { SpectralCore } from "../spectral/SpectralCore";
import { MobileHUD, ToolMode } from "../ui/MobileHUD";
import { Soundscape } from "../audio/Soundscape";
import { pastel } from "../world/Materials";
import { Palette } from "../world/Palette";

/**
 * Orchestrator for the Fourier-decomposition game: the world is corrupted by a
 * hidden anomaly; transform it, navigate the band reconstructions to find the
 * anomaly, eliminate it, restore the world, descend to the next harder world.
 * Worlds build off-thread (64³) in a worker, so the loop gates on `core.ready`.
 */
export class Game {
  private renderer: Renderer;
  private cameraRig: Camera;
  private input: Input;
  private time = new Time();

  private controller: FirstPersonController;
  private lens: ResonanceLens;
  private world = new WorldStateManager();
  private core: SpectralCore;
  private hud: MobileHUD;
  private sound = new Soundscape();
  private postfx!: PostFX;

  private raycaster = new THREE.Raycaster();
  private screenCenter = new THREE.Vector2(0, 0);
  private bgColor = new THREE.Color(Palette.warmCream);

  private level = 1;
  private scanning = false;
  private running = false;
  private flashTimer = 0;
  private establishTimer = 0;
  private awaitingWorld = false;
  private loadStarted = false;
  private hintTimer = 0;
  private prevAnomalyVisible = false;
  private prevSolved = false;

  constructor(container: HTMLElement) {
    this.renderer = new Renderer(container);
    this.cameraRig = new Camera();
    this.renderer.scene.add(this.cameraRig.pivot);
    this.input = new Input(this.renderer.gl.domElement);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), pastel(Palette.lavenderGray));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    this.renderer.scene.add(floor);

    const seed = (Math.floor(performance.now()) ^ 0x5f3759df) >>> 0;
    this.core = new SpectralCore(seed);
    this.renderer.scene.add(this.core.group);
    this.core.setSolvedCallback((lvl) => this.onLevelSolved(lvl));

    // start building world 1; show the deep-resonance veil until it's ready
    this.core.load(1);
    this.world.set(WorldState.DeepResonance);
    this.awaitingWorld = true;
    this.loadStarted = true;

    this.controller = new FirstPersonController(
      this.cameraRig.pivot,
      this.cameraRig.camera,
      this.input,
      new THREE.Vector3(0, 1.6, 0)
    );

    this.lens = new ResonanceLens();
    this.lens.attachTo(this.cameraRig.camera);

    this.postfx = new PostFX(this.renderer.gl, this.renderer.scene, this.cameraRig.camera);

    this.hud = new MobileHUD(container, {
      onScanToggle: (on) => this.setScanning(on),
      onTune: (d) => this.core.stepBand(d),
      onPhase: () => {},
      onReconstruct: () => this.tryEliminate(),
      onMenu: () => {},
      onToggleSound: () => this.hud.setSoundOn(!this.sound.toggleMuted())
    });
    this.input.isHudTarget = this.hud.isHudTarget;

    this.bindActions();
    if (import.meta.env.DEV) (window as unknown as { __house: Game }).__house = this;
  }

  private bindActions(): void {
    this.input.on("scan", () => this.setScanning(true));
    this.input.onUp("scan", () => {
      if (this.world.current !== WorldState.DeepResonance) this.setScanning(false);
    });
    this.input.on("tuneDown", () => this.core.stepBand(-1));
    this.input.on("tuneUp", () => this.core.stepBand(+1));
    this.input.on("phaseLeft", () => this.core.stepBand(-1));
    this.input.on("phaseRight", () => this.core.stepBand(+1));
    this.input.on("reconstruct", () => this.tryEliminate());
    if (import.meta.env.DEV) {
      this.input.on("state1", () => this.world.set(WorldState.Reality));
      this.input.on("state2", () => this.world.set(WorldState.FrequencyGhosts));
      this.input.on("state3", () => this.world.set(WorldState.DeepResonance));
    }
  }

  private setScanning(on: boolean): void {
    if (!this.core.ready || this.awaitingWorld || this.core.state === "establishing") return;
    this.scanning = on;
    this.hud.setScanVisual(on);
    if (on) {
      this.core.enterSpectral();
      if (this.world.current === WorldState.Reality) this.world.set(WorldState.FrequencyGhosts);
    } else {
      this.core.exitToReality();
      if (this.world.current === WorldState.FrequencyGhosts) this.world.set(WorldState.Reality);
    }
  }

  private tryEliminate(): void {
    const r = this.core.eliminate();
    if (r === "decoy") {
      this.sound.dissonance();
      this.hintTimer = 2.4;
    }
  }

  private onLevelSolved(level: number): void {
    this.sound.resolveChord();
    this.postfx.pulseReveal();
    this.world.set(WorldState.DeepResonance);
    this.level = level + 1;
    this.flashTimer = 1.8;
    this.awaitingWorld = true;
    this.loadStarted = false; // start building mid-flash
    this.prevAnomalyVisible = false;
    this.prevSolved = false;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loop();
  }
  unlockAudio(): void {
    this.sound.unlock();
  }

  private loop = (): void => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    this.time.tick();
    const dt = this.time.delta;
    const t = this.time.elapsed;

    if (this.awaitingWorld) {
      if (this.flashTimer > 0) this.flashTimer -= dt;
      if (!this.loadStarted && this.flashTimer <= 1.0) {
        this.core.load(this.level);
        this.loadStarted = true;
      }
      if (this.flashTimer <= 0 && this.loadStarted && this.core.ready) {
        // establishing shot: frame the whole clean structure from a pulled-back
        // vantage so it's obvious what the environment is, then drop into play
        // frame along the THINNEST axis so the largest silhouette is revealed
        // (flat apartment/landscape → top-down; long starship → side profile)
        const { center, size } = this.core.bounds();
        const m = Math.min(size.x, size.y, size.z);
        let framePos: THREE.Vector3;
        if (m === size.y) {
          const span = Math.max(size.x, size.z);
          framePos = new THREE.Vector3(center.x, center.y + size.y * 0.5 + span * 0.6, center.z + span * 0.42);
        } else if (m === size.x) {
          framePos = new THREE.Vector3(center.x + size.x * 0.5 + Math.max(size.y, size.z) * 0.55, center.y + size.y * 0.12, center.z);
        } else {
          framePos = new THREE.Vector3(center.x, center.y + size.y * 0.12, center.z + size.z * 0.5 + Math.max(size.x, size.y) * 0.55);
        }
        this.controller.setCinematic(framePos, center);
        this.scanning = false;
        this.hud.setScanVisual(false);
        this.world.set(WorldState.Reality); // clears the deep veil; core stays in "establishing"
        this.hud.showTitleCard(this.core.name);
        this.establishTimer = 2.6;
        this.awaitingWorld = false;
      }
    }

    // establishing shot → corrupt into reality, then drop the player in
    if (this.establishTimer > 0) {
      this.establishTimer -= dt;
      if (this.establishTimer <= 0) {
        this.core.beginReality();
        this.controller.setCollider(this.core.collision);
        const sp = this.core.spawn;
        const lk = this.core.spawnLook;
        this.controller.placeAt(sp.x, sp.z, lk.yaw, lk.pitch);
      }
    }

    this.controller.update(dt);
    this.world.update(dt);

    this.updateFocus();
    this.core.update(dt, t);

    this.lens.updateSway(this.controller.lastLook, t, dt);
    this.updateLensScreen();
    this.updateToolMode();
    this.updateAudio();
    if (this.hintTimer > 0) this.hintTimer -= dt;
    this.refreshHud();

    // animated palette/fog + corruption grade, then post-processed render
    this.bgColor.lerp(new THREE.Color(this.targetBg()), 1 - Math.exp(-3 * dt));
    (this.renderer.scene.background as THREE.Color).copy(this.bgColor);
    if (this.renderer.scene.fog) (this.renderer.scene.fog as THREE.Fog).color.copy(this.bgColor);
    this.postfx.setCorruption(this.corruptionLevel());
    this.postfx.setVignette(this.vignetteLevel());
    this.postfx.render(dt, t);
  };

  private updateFocus(): void {
    const targets = this.core.hitTargets();
    if (!targets.length) {
      this.core.setFocus(null);
      return;
    }
    this.raycaster.setFromCamera(this.screenCenter, this.cameraRig.camera);
    const hits = this.raycaster.intersectObjects(targets, false);
    this.core.setFocus(hits.length ? hits[0].object : null);
  }

  private targetBg(): number {
    return this.core.backgroundColor();
  }

  private corruptionLevel(): number {
    if (!this.core.ready || this.awaitingWorld) return 0.25;
    switch (this.core.state) {
      case "establishing":
        return 0.05;
      case "reality":
        return 0.8;
      case "spectral":
        return 0.12;
      case "eliminating":
        return 0.2;
      default:
        return 0; // restored
    }
  }

  private vignetteLevel(): number {
    switch (this.core.state) {
      case "reality":
        return 0.55;
      case "spectral":
        return 0.28;
      case "establishing":
        return 0.16;
      default:
        return 0.1;
    }
  }

  private updateLensScreen(): void {
    const frac = this.core.bandCount > 1 ? this.core.band / (this.core.bandCount - 1) : 0;
    const bars = [0, 1, 2].map((i) => Math.max(0, Math.min(1, frac * 3 - i)));
    const near = Math.max(0, 1 - Math.abs(this.core.band - this.core.anomalyBand) / Math.max(1, this.core.bandCount));
    this.lens.drawScreen({
      world: this.world.current,
      bands: bars,
      selectedBand: Math.min(2, Math.floor(frac * 3)),
      phase: frac,
      shimmer: this.core.anomalyVisible ? (this.core.targeted ? 1 : 0.7) : near * 0.5,
      carried: [this.core.anomalyVisible, this.core.solved, false],
      reconstruct: this.core.eliminationAmount,
      chordReady: this.core.targeted && this.core.anomalyVisible
    });
  }

  private updateToolMode(): void {
    let mode: ToolMode = "hidden";
    if (this.scanning && this.core.ready && !this.awaitingWorld && this.core.state === "spectral") {
      mode = this.core.anomalyVisible && this.core.targeted ? "reconstruct" : "tune";
    }
    this.hud.setToolMode(
      mode,
      `BAND ${this.core.band + 1}/${this.core.bandCount}`,
      this.core.anomalyVisible && this.core.targeted
    );
  }

  private updateAudio(): void {
    this.sound.update({
      world: this.world.current,
      ghostBlend: this.world.ghostBlend,
      dissolve: this.world.dissolve,
      room: this.core.band % 3,
      bandCorrect: this.core.anomalyVisible,
      shimmer: this.core.anomalyVisible ? (this.core.targeted ? 1 : 0.6) : 0
    });
    if (this.core.anomalyVisible && !this.prevAnomalyVisible) this.sound.lockVoice(this.core.band % 3);
    this.prevAnomalyVisible = this.core.anomalyVisible;
    if (this.core.solved && !this.prevSolved) this.sound.resolveChord();
    this.prevSolved = this.core.solved;
  }

  private refreshHud(): void {
    const name = this.core.name;
    this.hud.setState(name ? `WORLD ${this.level} · ${name}` : `WORLD ${this.level}`, this.objective());
  }

  private objective(): string {
    if (!this.core.ready || this.awaitingWorld) return "Transforming the world…";
    if (this.core.state === "establishing") return "";
    if (this.core.state === "eliminating" || this.core.state === "restored") return "The world remembers itself.";
    if (this.hintTimer > 0) return "Not the source — find the unstable one.";
    if (this.core.state === "reality") return "Reality is corrupted. Hold scan to see its frequencies.";
    if (!this.core.anomalyVisible) return "Navigate the bands — find the frequency that doesn't belong.";
    if (!this.core.targeted) {
      return this.core.decoyCount > 0
        ? "Several resonances — aim at the one that flickers."
        : "Something foreign resonates here — aim at it.";
    }
    return "Eliminate it to restore the world.";
  }
}
