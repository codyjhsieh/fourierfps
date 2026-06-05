export type ToolMode = "hidden" | "tune" | "phase" | "reconstruct";

export interface HudCallbacks {
  onScanToggle: (on: boolean) => void;
  onTune: (delta: number) => void;
  onPhase: (value01: number) => void;
  onReconstruct: () => void;
  onMenu: () => void;
  onToggleSound?: () => void;
}

/**
 * Extreme-minimalist mobile HUD. Chrome is only: state + one-line objective
 * (top-left), a menu glyph (bottom-left), and the scan ring (bottom-center) —
 * exactly matching the reference. A single contextual "tool" pill appears above
 * the ring only while scanning, and changes mode (tune → phase → reconstruct).
 */
export class MobileHUD {
  readonly root: HTMLElement;
  private stateEl: HTMLElement;
  private objectiveEl: HTMLElement;
  private scanEl: HTMLElement;
  private menuEl: HTMLElement;
  private toolEl: HTMLElement;
  private toolLabel: HTMLElement;
  private reticleEl: HTMLElement;
  private menuPanel: HTMLElement;
  private soundBtn?: HTMLElement;
  private titleEl?: HTMLElement;
  private titleTimer = 0;
  private cb: HudCallbacks;

  private scanning = false;
  private toolMode: ToolMode = "hidden";
  private toolEnabled = true;

  constructor(parent: HTMLElement, cb: HudCallbacks) {
    this.cb = cb;
    this.injectStyles();

    this.root = el("div", "hud");
    parent.appendChild(this.root);

    // top-left: state + objective
    const topLeft = el("div", "hud-topleft hud-el");
    this.stateEl = el("div", "hud-state");
    this.objectiveEl = el("div", "hud-objective");
    topLeft.append(this.stateEl, this.objectiveEl);

    // center reticle
    this.reticleEl = el("div", "hud-reticle");

    // bottom-left: menu glyph (≡)
    this.menuEl = el("button", "hud-menu hud-el");
    this.menuEl.innerHTML = "<span></span><span></span><span></span>";
    this.menuEl.addEventListener("click", () => this.toggleMenu());

    // bottom-center: scan ring
    this.scanEl = el("button", "hud-scan hud-el");
    this.scanEl.innerHTML = "<div class='hud-scan-inner'></div>";
    this.bindScan();

    // contextual tool pill (above ring)
    this.toolEl = el("div", "hud-tool hud-el");
    this.toolLabel = el("div", "hud-tool-label");
    const minus = el("button", "hud-tool-btn");
    minus.textContent = "‹";
    minus.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.onToolMinus();
    });
    const plus = el("button", "hud-tool-btn");
    plus.textContent = "›";
    plus.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.onToolPlus();
    });
    this.toolEl.append(minus, this.toolLabel, plus);
    this.bindToolDrag();

    // menu panel (hidden)
    this.menuPanel = el("div", "hud-panel");
    this.menuPanel.innerHTML = `
      <h2>The House That Remembers</h2>
      <p class="hud-hint">Scan to listen. Each room sings in its own band — match it, then feel for where it steadies. When all three agree, reconstruct.</p>
      <p class="hud-keys">Desktop · WASD move · drag look · E scan · Q/R tune · Z/X shift · F reconstruct</p>
      <p class="hud-keys">Mobile · left half drag: move · drag elsewhere: look · tap ring: scan · then tune / drag to shift / tap to reconstruct</p>
      <button class="hud-sound">Sound: On</button>
      <button class="hud-resume">Resume</button>
    `;
    this.menuPanel.querySelector(".hud-resume")!.addEventListener("click", () => this.toggleMenu(false));
    this.soundBtn = this.menuPanel.querySelector(".hud-sound") as HTMLElement;
    this.soundBtn.addEventListener("click", () => this.cb.onToggleSound?.());
    this.menuPanel.style.display = "none";

    // establishing-shot title card (centered, fades)
    this.titleEl = el("div", "hud-title");
    this.root.append(topLeft, this.reticleEl, this.menuEl, this.scanEl, this.toolEl, this.titleEl, this.menuPanel);
    this.setToolMode("hidden");
  }

  /** Used by Input to ignore touches that start on HUD widgets. */
  isHudTarget = (target: EventTarget | null): boolean => {
    return target instanceof Node && this.root.contains(target) && target !== this.reticleEl;
  };

  setState(label: string, objective: string): void {
    this.stateEl.textContent = label;
    this.objectiveEl.textContent = objective;
  }

  setScanVisual(on: boolean): void {
    this.scanning = on;
    this.scanEl.classList.toggle("active", on);
  }

  setSoundOn(on: boolean): void {
    if (this.soundBtn) this.soundBtn.textContent = on ? "Sound: On" : "Sound: Off";
  }

  /** Large centered establishing-shot title that fades in then out. */
  showTitleCard(name: string, subtitle = ""): void {
    if (!this.titleEl) return;
    this.titleEl.innerHTML = `<div class="hud-title-name">${name}</div><div class="hud-title-sub">${subtitle}</div>`;
    this.titleEl.classList.add("show");
    window.clearTimeout(this.titleTimer);
    this.titleTimer = window.setTimeout(() => this.titleEl?.classList.remove("show"), 1900);
  }

  setToolMode(mode: ToolMode, bandLabel = "MID", enabled = true): void {
    this.toolMode = mode;
    this.toolEnabled = enabled;
    this.toolEl.classList.toggle("show", mode !== "hidden" && this.scanning);
    this.toolEl.classList.toggle("disabled", mode === "reconstruct" && !enabled);
    this.toolEl.dataset.mode = mode;
    if (mode === "tune") this.toolLabel.textContent = bandLabel;
    else if (mode === "phase") this.toolLabel.textContent = "SHIFT";
    else if (mode === "reconstruct") this.toolLabel.textContent = "RECONSTRUCT";
  }

  // ---------------- interactions ----------------
  private bindScan(): void {
    const press = (e: Event) => {
      e.preventDefault();
      this.scanning = !this.scanning; // tap toggles (latched scan)
      this.cb.onScanToggle(this.scanning);
    };
    this.scanEl.addEventListener("pointerdown", press);
  }

  private onToolMinus(): void {
    if (this.toolMode === "tune") this.cb.onTune(-1);
  }
  private onToolPlus(): void {
    if (this.toolMode === "tune") this.cb.onTune(+1);
    else if (this.toolMode === "reconstruct") {
      if (this.toolMode === "reconstruct" && !this.toolEnabled) return;
      this.cb.onReconstruct();
    }
  }

  private bindToolDrag(): void {
    let dragging = false;
    const setFromX = (clientX: number) => {
      const r = this.toolEl.getBoundingClientRect();
      const v = (clientX - r.left) / r.width;
      this.cb.onPhase(Math.max(0, Math.min(1, v)));
    };
    this.toolLabel.addEventListener("pointerdown", (e) => {
      if (this.toolMode === "phase") {
        dragging = true;
        (e.target as HTMLElement).setPointerCapture?.((e as PointerEvent).pointerId);
        setFromX((e as PointerEvent).clientX);
      } else if (this.toolMode === "reconstruct") {
        if (this.toolMode === "reconstruct" && !this.toolEnabled) return;
        this.cb.onReconstruct();
      }
      e.preventDefault();
    });
    this.toolLabel.addEventListener("pointermove", (e) => {
      if (dragging && this.toolMode === "phase") setFromX((e as PointerEvent).clientX);
    });
    const end = () => {
      dragging = false;
    };
    this.toolLabel.addEventListener("pointerup", end);
    this.toolLabel.addEventListener("pointercancel", end);
  }

  private toggleMenu(force?: boolean): void {
    const show = force ?? this.menuPanel.style.display === "none";
    this.menuPanel.style.display = show ? "flex" : "none";
    this.cb.onMenu();
  }

  // ---------------- styles ----------------
  private injectStyles(): void {
    const css = `
    .hud { position: fixed; inset: 0; pointer-events: none; z-index: 10;
      font-family: "Helvetica Neue", system-ui, sans-serif; color: #f3eee4;
      text-shadow: 0 1px 6px rgba(80,70,60,0.35); }
    .hud-el { pointer-events: auto; }
    .hud-topleft { position: absolute; top: max(18px, env(safe-area-inset-top)); left: 20px;
      pointer-events: none; max-width: 70vw; }
    .hud-state { font-size: 12px; letter-spacing: 0.28em; font-weight: 300; opacity: 0.9;
      text-transform: uppercase; }
    .hud-objective { font-size: 14px; font-weight: 300; opacity: 0.7; margin-top: 4px;
      letter-spacing: 0.04em; }
    .hud-reticle { position: absolute; left: 50%; top: 50%; width: 5px; height: 5px;
      margin: -2.5px 0 0 -2.5px; border-radius: 50%; background: rgba(243,238,228,0.6);
      pointer-events: none; }
    .hud-menu { position: absolute; bottom: max(26px, env(safe-area-inset-bottom)); left: 24px;
      width: 30px; height: 26px; min-width: 44px; min-height: 44px; box-sizing: border-box;
      background: none; border: none; cursor: pointer;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 0; }
    .hud-menu span { display: block; height: 1.5px; width: 26px; background: #f3eee4; opacity: 0.85; }
    .hud-scan { position: absolute; bottom: max(20px, env(safe-area-inset-bottom)); left: 50%;
      transform: translateX(-50%); width: 60px; height: 60px; border-radius: 50%;
      border: 1.5px solid rgba(243,238,228,0.85); background: rgba(255,255,255,0.04);
      cursor: pointer; transition: transform 0.12s ease, border-color 0.2s ease; }
    .hud-scan:active { transform: translateX(-50%) scale(0.94); }
    .hud-scan-inner { position: absolute; inset: 14px; border-radius: 50%;
      background: rgba(243,238,228,0); transition: background 0.25s ease; }
    .hud-scan.active { border-color: #9dd8c0; }
    .hud-scan.active .hud-scan-inner { background: rgba(157,216,192,0.55); }
    .hud-tool { position: absolute; bottom: calc(max(20px, env(safe-area-inset-bottom)) + 76px);
      left: 50%; transform: translateX(-50%) translateY(10px); display: none;
      align-items: center; gap: 14px; padding: 8px 14px; border-radius: 999px;
      background: rgba(40,38,42,0.42); backdrop-filter: blur(8px);
      border: 1px solid rgba(243,238,228,0.18); opacity: 0; transition: opacity 0.25s ease, transform 0.25s ease; }
    .hud-tool.show { display: flex; opacity: 1; transform: translateX(-50%) translateY(0); }
    .hud-tool-label { min-width: 120px; text-align: center; font-size: 13px; letter-spacing: 0.22em;
      font-weight: 300; cursor: pointer; user-select: none; }
    .hud-tool[data-mode="phase"] .hud-tool-label { background: linear-gradient(90deg, rgba(185,161,230,0.5), rgba(185,161,230,0.15));
      border-radius: 8px; padding: 4px 0; touch-action: none; }
    .hud-tool[data-mode="reconstruct"] .hud-tool-label { color: #9dd8c0; }
    .hud-tool.disabled { opacity: 0.4; }
    .hud-tool.disabled .hud-tool-label { color: rgba(243,238,228,0.5); }
    .hud-tool-btn { background: none; border: none; color: #f3eee4; font-size: 20px;
      cursor: pointer; opacity: 0.8; padding: 0; line-height: 1;
      min-width: 44px; min-height: 44px; box-sizing: border-box;
      display: flex; align-items: center; justify-content: center; }
    .hud-tool[data-mode="phase"] .hud-tool-btn,
    .hud-tool[data-mode="reconstruct"] .hud-tool-btn { display: none; }
    .hud-title { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
      justify-content: center; pointer-events: none; opacity: 0; transition: opacity 0.8s ease; gap: 10px; }
    .hud-title.show { opacity: 1; }
    .hud-title-name { font-weight: 200; letter-spacing: 0.42em; text-transform: uppercase;
      font-size: clamp(1.4rem, 6vw, 2.6rem); }
    .hud-title-sub { font-weight: 300; letter-spacing: 0.2em; text-transform: uppercase;
      font-size: 0.72rem; opacity: 0.7; }
    .hud-panel { position: absolute; inset: 0; background: rgba(239,232,220,0.94); color: #5f5a55;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 18px; text-align: center; padding: 32px; pointer-events: auto; }
    .hud-panel h2 { font-weight: 300; letter-spacing: 0.3em; text-transform: uppercase; font-size: 1.1rem; margin: 0; }
    .hud-panel p { max-width: 420px; font-weight: 300; line-height: 1.6; opacity: 0.8; margin: 0; }
    .hud-keys { font-size: 12px; letter-spacing: 0.06em; opacity: 0.55 !important; }
    .hud-resume, .hud-sound { margin-top: 8px; padding: 0.7rem 2.2rem; border: 1px solid rgba(95,90,85,0.4);
      border-radius: 999px; background: none; color: #5f5a55; font: inherit; letter-spacing: 0.25em;
      text-transform: uppercase; font-size: 0.72rem; cursor: pointer; }
    `;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }
}

function el(tag: string, className: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}
