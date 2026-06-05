/** Frame clock. Provides delta time (clamped) and elapsed time in seconds. */
export class Time {
  elapsed = 0;
  delta = 0;
  private last = performance.now() / 1000;

  tick(): void {
    const now = performance.now() / 1000;
    this.delta = Math.min(now - this.last, 1 / 20); // clamp to avoid tunneling on tab refocus
    this.last = now;
    this.elapsed += this.delta;
  }
}
