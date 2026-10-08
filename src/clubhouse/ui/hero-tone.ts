/**
 * How the page hero is set (the header lab, owner 2026-10-07). `canopy` is the green fade on the frame; the others are
 * quiet treatments on the ivory workspace inside the green frame: `framed` (the title is part of the paper), `archival`
 * (a lighter mat), `plaque` (a mounted plate with a forest rule), `scorecard` (ruled like a club card), `topo` (framed,
 * with an engraved contour in the far corner) and `board` (a tournament board with the page's numbers in the head).
 */
export type HeroTone = 'canopy' | 'framed' | 'archival' | 'plaque' | 'scorecard' | 'topo' | 'board';
export const HERO_TONES: readonly HeroTone[] = ['framed', 'archival', 'plaque', 'scorecard', 'topo', 'board'];

/** A `?tone=` value from the preview, or the canopy. */
export function heroToneFrom(value: string | undefined): HeroTone {
  return (HERO_TONES as readonly string[]).includes(value ?? '') ? (value as HeroTone) : 'canopy';
}
