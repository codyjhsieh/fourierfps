export enum WorldState {
  Reality = 0,
  FrequencyGhosts = 1,
  DeepResonance = 2
}

export const StateLabels: Record<WorldState, string> = {
  [WorldState.Reality]: "STATE 1: REALITY",
  [WorldState.FrequencyGhosts]: "STATE 2: FREQUENCY GHOSTS",
  [WorldState.DeepResonance]: "STATE 3: DEEP RESONANCE"
};

type Handler = (s: WorldState) => void;

/**
 * Holds the discrete world state plus a smoothed 0..1 "ghost blend" the visuals
 * lerp against (so ribbons/props fade rather than pop).
 */
export class WorldStateManager {
  private state = WorldState.Reality;
  private handlers: Handler[] = [];

  /** 0 = pure reality, 1 = ghosts fully revealed. */
  ghostBlend = 0;
  /** 0 = reality intact, 1 = reality fully dissolved (deep resonance). */
  dissolve = 0;

  get current(): WorldState {
    return this.state;
  }

  onChange(h: Handler): void {
    this.handlers.push(h);
  }

  set(state: WorldState): void {
    if (state === this.state) return;
    this.state = state;
    for (const h of this.handlers) h(state);
  }

  /** Smooth the blend factors toward the current state each frame. */
  update(dt: number): void {
    const k = 1 - Math.exp(-3.5 * dt);
    const targetGhost = this.state === WorldState.Reality ? 0 : 1;
    const targetDissolve = this.state === WorldState.DeepResonance ? 1 : 0;
    this.ghostBlend += (targetGhost - this.ghostBlend) * k;
    this.dissolve += (targetDissolve - this.dissolve) * k;
  }
}
