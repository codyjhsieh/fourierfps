import * as THREE from "three";

export type GameAction =
  | "scan"
  | "tuneUp"
  | "tuneDown"
  | "phaseLeft"
  | "phaseRight"
  | "reconstruct"
  | "jump"
  | "state1"
  | "state2"
  | "state3";

type Listener = () => void;

/**
 * Unified desktop + touch input.
 * - Desktop: WASD/arrows move, pointer-lock mouse looks, keys fire actions.
 * - Mobile: left-half touch is a relative move joystick, elsewhere drag looks.
 *   Discrete actions are driven by the HUD (DOM) via fireAction()/setScanHeld().
 */
export class Input {
  readonly move = new THREE.Vector2(); // x = strafe (+right), y = forward (+fwd)
  private look = new THREE.Vector2(); // accumulated, consumed each frame
  scanHeld = false;

  private keys = new Set<string>();
  private downListeners = new Map<GameAction, Listener[]>();
  private upListeners = new Map<GameAction, Listener[]>();

  private readonly el: HTMLElement;
  private moveTouchId = -1;
  private moveOrigin = new THREE.Vector2();
  private lookTouchId = -1;
  private lookLast = new THREE.Vector2();
  private pointerLocked = false;

  /** Predicate so touches that begin on HUD widgets are ignored by look/move. */
  isHudTarget: (target: EventTarget | null) => boolean = () => false;

  constructor(el: HTMLElement) {
    this.el = el;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);

    el.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    window.addEventListener("mousemove", this.onMouseMove);

    el.addEventListener("touchstart", this.onTouchStart, { passive: false });
    el.addEventListener("touchmove", this.onTouchMove, { passive: false });
    el.addEventListener("touchend", this.onTouchEnd);
    el.addEventListener("touchcancel", this.onTouchEnd);
  }

  on(action: GameAction, cb: Listener): void {
    const list = this.downListeners.get(action) ?? [];
    list.push(cb);
    this.downListeners.set(action, list);
  }

  onUp(action: GameAction, cb: Listener): void {
    const list = this.upListeners.get(action) ?? [];
    list.push(cb);
    this.upListeners.set(action, list);
  }

  fireAction(action: GameAction): void {
    for (const cb of this.downListeners.get(action) ?? []) cb();
  }

  private fireUp(action: GameAction): void {
    for (const cb of this.upListeners.get(action) ?? []) cb();
  }

  setScanHeld(held: boolean): void {
    if (held === this.scanHeld) return;
    this.scanHeld = held;
    if (held) this.fireAction("scan");
    else this.fireUp("scan");
  }

  /** Returns accumulated look delta (radians-ish, scaled by controller) and resets. */
  consumeLook(out: THREE.Vector2): THREE.Vector2 {
    out.copy(this.look);
    this.look.set(0, 0);
    return out;
  }

  /** Recompute the keyboard-driven move vector each frame. */
  updateKeyboardMove(): void {
    if (this.lookTouchId !== -1 || this.moveTouchId !== -1) return; // touch owns move
    const f = (this.keys.has("w") || this.keys.has("arrowup") ? 1 : 0) -
      (this.keys.has("s") || this.keys.has("arrowdown") ? 1 : 0);
    const s = (this.keys.has("d") || this.keys.has("arrowright") ? 1 : 0) -
      (this.keys.has("a") || this.keys.has("arrowleft") ? 1 : 0);
    this.move.set(s, f);
    if (this.move.lengthSq() > 1) this.move.normalize();
  }

  // ---- keyboard ----
  private onKeyDown = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if (this.keys.has(k)) return;
    this.keys.add(k);
    switch (k) {
      case "e": this.setScanHeld(true); break;
      case "q": this.fireAction("tuneDown"); break;
      case "r": this.fireAction("tuneUp"); break;
      case "z": this.fireAction("phaseLeft"); break;
      case "x": this.fireAction("phaseRight"); break;
      case "f": this.fireAction("reconstruct"); break;
      case " ": this.fireAction("jump"); break;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    this.keys.delete(k);
    if (k === "e") this.setScanHeld(false);
  };

  // ---- desktop pointer lock look ----
  private onMouseDown = (e: MouseEvent): void => {
    if (this.isHudTarget(e.target)) return;
    if (!this.pointerLocked) this.el.requestPointerLock?.();
  };

  private onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.el;
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.pointerLocked) return;
    this.look.x += e.movementX;
    this.look.y += e.movementY;
  };

  // ---- touch ----
  private onTouchStart = (e: TouchEvent): void => {
    for (const t of Array.from(e.changedTouches)) {
      if (this.isHudTarget(t.target)) continue;
      const leftHalf = t.clientX < window.innerWidth * 0.45;
      if (leftHalf && this.moveTouchId === -1) {
        this.moveTouchId = t.identifier;
        this.moveOrigin.set(t.clientX, t.clientY);
        this.move.set(0, 0);
      } else if (this.lookTouchId === -1) {
        this.lookTouchId = t.identifier;
        this.lookLast.set(t.clientX, t.clientY);
      }
    }
    if (e.cancelable) e.preventDefault();
  };

  private onTouchMove = (e: TouchEvent): void => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.moveTouchId) {
        const dx = t.clientX - this.moveOrigin.x;
        const dy = t.clientY - this.moveOrigin.y;
        const radius = 64;
        this.move.set(
          THREE.MathUtils.clamp(dx / radius, -1, 1),
          THREE.MathUtils.clamp(-dy / radius, -1, 1)
        );
        if (this.move.lengthSq() > 1) this.move.normalize();
      } else if (t.identifier === this.lookTouchId) {
        this.look.x += (t.clientX - this.lookLast.x) * 1.8;
        this.look.y += (t.clientY - this.lookLast.y) * 1.8;
        this.lookLast.set(t.clientX, t.clientY);
      }
    }
    if (e.cancelable) e.preventDefault();
  };

  private onTouchEnd = (e: TouchEvent): void => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.moveTouchId) {
        this.moveTouchId = -1;
        this.move.set(0, 0);
      } else if (t.identifier === this.lookTouchId) {
        this.lookTouchId = -1;
      }
    }
  };
}
