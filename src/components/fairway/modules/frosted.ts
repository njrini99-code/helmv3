/**
 * ============================================================================
 * frosted.ts — THE frosted light card surface for golf hero/summary cards
 * ----------------------------------------------------------------------------
 * One definition of the owner's "frost and modern premium" look (2026-09),
 * replacing the dark accent-900→800 gradient slabs: a translucent
 * `bg-surface` with a backdrop blur, a hairline `border-border-subtle`, a
 * soft shadow, and a faint `accent-wash` tint fading down from the top edge
 * (a gradient on the card itself, so it needs no overflow clipping). Text is
 * dark (`text-text-primary`); green is only an accent inside the card. Where
 * `backdrop-filter` is unsupported it falls back to the opaque `bg-surface`
 * card (same pattern as `ChartTooltip`). Every colour is a token, so the
 * card follows the light/dark theme.
 *
 * Used by `Spine`, StandingDrill's SG instrument, the ReviewHero unit,
 * BriefBand, and the loading skeletons that shape-match them. Padding and
 * layout stay with each caller; this is only the surface.
 * ========================================================================== */

/** The frosted surface classes. Compose with padding/layout via `cn`. */
export const FROSTED_CARD_CLASS = [
  'rounded-fw-lg border border-border-subtle text-text-primary shadow-soft',
  'bg-gradient-to-b from-accent-wash/40 via-surface/70 via-35% to-surface/70',
  'backdrop-blur-xl backdrop-saturate-150',
  'supports-[not(backdrop-filter:blur(0))]:bg-surface',
].join(' ');
