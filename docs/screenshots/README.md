# Environment screenshots

A minimalist reference set for each procedural environment, in two views:

- **`birdseye-*`** — the bird's-eye *establishing shot*: the populated place
  (walls/floor/terrain shell + thousands of instanced objects) framed from above
  so the layout reads at a glance.
- **`planning-*`** — the *spectral planning* view: the same world after the
  Fourier transform, navigated as a band-limited inverse-FFT isosurface (where
  the hidden anomaly is hunted).

| # | Environment | Bird's-eye | Planning (spectral) |
|---|-------------|-----------|---------------------|
| 1 | Apartment   | ![](birdseye-1-apartment.png)   | ![](planning-1-apartment.png)   |
| 2 | Office Tower | ![](birdseye-2-office-tower.png) | ![](planning-2-office-tower.png) |
| 3 | Landscape   | ![](birdseye-3-landscape.png)   | ![](planning-3-landscape.png)   |
| 4 | Starship    | ![](birdseye-4-starship.png)    | ![](planning-4-starship.png)    |
| 5 | Planet      | ![](birdseye-5-planet.png)      | ![](planning-5-planet.png)      |

Regenerate with `node tools/envshots.mjs` (needs the dev server running).
