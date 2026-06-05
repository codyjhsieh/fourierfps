/**
 * Drives a 0..1 reconstruction amount over time (the "inverse transform"
 * commit). Geometry fades from ghost to solid as the amount climbs.
 */
export class Reconstruction {
  amount = 0;
  active = false;
  private duration: number;
  private onComplete?: () => void;
  private onProgress?: (a: number) => void;

  constructor(duration = 1.6) {
    this.duration = duration;
  }

  start(onProgress?: (a: number) => void, onComplete?: () => void): void {
    if (this.active || this.amount >= 1) return;
    this.active = true;
    this.onProgress = onProgress;
    this.onComplete = onComplete;
  }

  update(dt: number): void {
    if (!this.active) return;
    this.amount = Math.min(1, this.amount + dt / this.duration);
    this.onProgress?.(this.amount);
    if (this.amount >= 1) {
      this.active = false;
      this.onComplete?.();
    }
  }
}
