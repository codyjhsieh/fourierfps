# The House That Remembers

A first-person, **fully procedural** browser puzzle game. You explore a pastel
hand-drawn apartment and use a **Resonance Lens** to reveal and manipulate hidden
Fourier-derived spectral structures across three visual states:

1. **Reality** — the world as it appears
2. **Frequency Ghosts** — spectral ribbons and resonance nodes emerge; reality remains
3. **Deep Resonance** — reality dissolves; you are inside the frequency

Everything — the room, props, lens, spectral structures, UI — is generated in
code. No Unity, no downloaded 3D assets, no image textures. Real Fourier
transforms power the puzzle logic, exposed through physical actions:

| Action      | Fourier operation     |
|-------------|-----------------------|
| Tune        | band-pass filter      |
| Isolate     | noise suppression     |
| Shift       | phase alignment       |
| Reconstruct | inverse transform     |

## Run it

> Requires **Node 18+** (this repo was verified on Node 22).

```bash
npm install
npm run dev      # → http://localhost:5173
```

Click **Enter**, then play.

```bash
npm run build    # typecheck + production bundle → dist/
npm run preview  # serve the production build
npm test         # Vitest unit tests (FFT + puzzle state machine)
```

## Controls

**Desktop**

| Key            | Action                                  |
|----------------|-----------------------------------------|
| `W A S D`      | move                                    |
| drag mouse     | look (click to pointer-lock)            |
| `E` (hold)     | scan → enter Frequency Ghosts           |
| `Q` / `R`      | tune band down / up (Low·Mid·High)      |
| `Z` / `X`      | phase shift the current room's node      |
| `F`            | reconstruct                             |
| `1` / `2` / `3`| jump to Reality / Ghosts / Deep Resonance (debug) |

**Mobile (extreme-minimalist nav)**

The only chrome is the **state label + one-line objective** (top-left), a **menu
glyph** (bottom-left), and the **scan ring** (bottom-center) — matching the
reference. Tap the ring to scan. While scanning, a single contextual *tool* pill
appears above the ring and changes mode automatically: **Tune** (‹ ›) →
**Shift** (drag) → **Reconstruct** (tap). Left half of the screen is a relative
move joystick; dragging elsewhere looks around.

## The puzzle — Chord of Rooms

Each of the three rooms hides a resonance, and **each room is dominated by a
different real FFT band** (LOW / MID / HIGH), derived from
[`SpectralVolume`](src/spectral/SpectralVolume.ts) — not hard-coded. The lens
shows the live per-band energy at your position as three bars, so you *read the
room*.

1. **Scan** → spectral structures fade in; obscuring **noise** hides each node.
2. **Walk** into a room and read which band is alive there. **Tune** to it — the
   right band clears the noise and sharpens the node; a wrong band keeps it
   buried (no-op tuning is impossible — the answer differs per room).
3. **Shift** to *feel* for the hidden phase. There is **no drawn target**: a
   shimmer ring on the lens grows as you near the true value, snapping to a lock
   inside a generous (per-room) tolerance.
4. Lock all three rooms → the **chord** is ready.
5. **Reconstruct**. The first commit is usually **dissonant** — the most
   phase-drifted node *shatters back*, scarred, marking the room to revisit.
   Re-align it tighter; when the three phases resolve into one chord the
   staircase blooms and reality dissolves into Deep Resonance.

The required band is the FFT-derived dominant band per room; consonance is a real
numeric test over the three locked phases. There are no numbers or graphs on
screen — only bars, shimmer, and lock.

## Architecture

```
src/
  app/        Game.ts            orchestrator + frame loop
  engine/     Renderer Camera Input Time
  world/      Palette Materials Geometry ProceduralRoom ProceduralProps Apartment
  player/     FirstPersonController Interaction
  lens/       ResonanceLens (held device; its screen is a live CanvasTexture)
  spectral/   WorldState SpectralVolume Fourier3D
              MemoryVein ResonanceNode HarmonicBridge NoiseField
              DeepResonance Reconstruction
  puzzles/    HiddenStairPuzzle  (state machine wired to lens actions)
  ui/         MobileHUD          (DOM overlay, extreme-minimalist)
```

### Fourier core ([`src/spectral/Fourier3D.ts`](src/spectral/Fourier3D.ts))

- `fft1d` — in-place radix-2 Cooley–Tukey on interleaved complex data
- `fft3d` — separable 3D FFT (X then Y then Z passes), 16³ default
- `bandWeight`, `bandEnergy`, `applyBandPass`, `radialFrequency` — the band-pass
  primitives the gameplay reads through
- Unit-tested: forward→inverse round-trips, single-frequency localization, and
  band-energy ordering.

## Verification

- `npm test` — 11 passing unit tests (FFT correctness + full puzzle progression).
- `tools/smoke.mjs` — a headless Chromium (Playwright) smoke test that boots the
  real WebGL app, plays the puzzle end-to-end (Reality → Ghosts → phase-lock →
  reconstruct → Deep Resonance), asserts **zero runtime errors**, and writes
  screenshots to `tools/shots/`. It exposes `window.__house` as an automation
  hook and force-pumps `requestAnimationFrame` because headless Chromium
  throttles RAF on hidden pages.

  ```bash
  npm run dev &           # in one shell
  node tools/smoke.mjs    # paths are machine-specific; see the file header
  ```

## Performance notes

Geometry is low-poly with a hand-drawn vertex wobble; lighting is a hemisphere +
two directional lights with toon-banded pastel materials (no shadows, no heavy
post). Spectral meshes fade by world state and are hidden in Reality. Pixel ratio
is capped at 2. Production bundle is a single static app — deploy `dist/` anywhere.
