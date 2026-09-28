/**
 * ============================================================================
 * Fairway · identity tint
 * ----------------------------------------------------------------------------
 * The ONE hash that turns a person into one of the eight `--fw-tint-N-{bg,ink}`
 * pastel pairs (design-tokens.css, light + dark blocks). The roster player card,
 * the calendar month grid / agenda rows, and the Avatar `identity` tone all
 * pick through here, so a person keeps the same colour on every surface.
 *
 * Seed with the most stable id you have (a player/member id); fall back to the
 * display name only when no id is in reach.
 *
 * THEME-AWARE BY INDIRECTION: `tintFor` returns `var()` references (consumers
 * apply them as INLINE styles, which no `.dark` rule can reach) so
 * design-tokens.css flips the palette. Keep them as var() references.
 * ========================================================================== */

export const IDENTITY_TINT_COUNT = 8;

/** Stable 1..8 tint slot for a seed (same seed, same slot, everywhere). */
export function identityTintSlot(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return (h % IDENTITY_TINT_COUNT) + 1;
}

/** Inline-style colours for a seed's tint: `{ bg, text }` as `var()` refs. */
export function tintFor(seed: string): { bg: string; text: string } {
  const i = identityTintSlot(seed);
  return { bg: `var(--fw-tint-${i}-bg)`, text: `var(--fw-tint-${i}-ink)` };
}
