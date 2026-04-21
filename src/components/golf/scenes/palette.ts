/**
 * Scene design tokens. Every painterly scene (Course/Coastal/future Desert/Alpine)
 * should pull flag red, sand cream, trunk brown, etc. from here so a brand
 * change touches one file.
 */
export const SCENE_PALETTE = {
  // Base cream gradient (sky / canvas)
  cream1: '#FFFEFA',
  cream2: '#FFF7E0',
  cream3: '#FDEAC0',
  // Warm sun halo
  glow: 'rgba(255, 214, 168, 0.55)',
  // Grass + shadow
  grass: '#c2c681',
  grassShadow: '#a2ad62',
  // Tree foliage (lightest → darkest)
  treeTones: ['#a9bf86', '#88a06d', '#5f7d45', '#3f5930'] as const,
  trunk: '#6a503a',
  // Bunker
  sand: '#f2e0bc',
  sandShadow: '#d6bb90',
  // Pin flag — brand accent
  flag: '#b83a29',
  flagShadow: '#7a2418',
} as const;

export type ScenePalette = typeof SCENE_PALETTE;
