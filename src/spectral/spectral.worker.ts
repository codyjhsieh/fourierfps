import { computeSpectralWorld, resultTransferables } from "./SpectralCompute";

interface BuildMsg {
  id: number;
  level: number;
  seed: number;
  n: number;
  K: number;
}

// Typed locally to avoid pulling in the webworker lib (which conflicts with DOM).
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<BuildMsg>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

ctx.onmessage = (e) => {
  const { id, level, seed, n, K } = e.data;
  const result = computeSpectralWorld(level, seed, n, K);
  ctx.postMessage({ id, result }, resultTransferables(result));
};

export {};
