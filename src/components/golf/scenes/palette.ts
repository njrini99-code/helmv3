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
  // Grass + shadow: a fresher fairway green than the original olive (OD-15,
  // "more green").
  grass: '#a9c47c',
  grassShadow: '#86a35c',
  // Tree foliage (lightest → darkest)
  treeTones: ['#9fbe7e', '#7c9d62', '#557a3f', '#37562b'] as const,
  trunk: '#6a503a',
  // Bunker
  sand: '#f2e0bc',
  sandShadow: '#d6bb90',
  // Pin flag — brand accent
  flag: '#b83a29',
  flagShadow: '#7a2418',
} as const;

export type ScenePalette = typeof SCENE_PALETTE;
