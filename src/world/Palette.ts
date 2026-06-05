/** Central pastel palette for the whole game. Values are 0xRRGGBB. */
export const Palette = {
  // Reality
  warmCream: 0xf6f1e8,
  dustyRose: 0xd9b7b0,
  sageGreen: 0xb8c8b4,
  powderBlue: 0xb7cfe3,
  lavenderGray: 0xc8c2d6,
  sandstone: 0xdcc9a8,

  // Spectral (more saturated)
  spectralBlue: 0x8ebad9,
  spectralPink: 0xe6a8c7,
  spectralMint: 0x9dd8c0,
  spectralViolet: 0xb9a1e6,

  ink: 0x5f5a55,
  shadow: 0xc9beb0,

  // Surfaces
  floorWood: 0xe7d8bf,
  wall: 0xf2ece1,
  ceiling: 0xf6f1ea
} as const;

export type PaletteKey = keyof typeof Palette;

/** Ordered spectral colors used for resonance bands (low → high). */
export const SpectralBands = [
  Palette.spectralMint,
  Palette.spectralPink,
  Palette.spectralViolet,
  Palette.spectralBlue
] as const;
