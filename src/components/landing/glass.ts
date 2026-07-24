import type { CSSProperties } from 'react';

/**
 * Shared warm-glass treatments for the landing's framed surfaces.
 *
 * GLASS_BEZEL wraps each product embed in a translucent hardware-like rim —
 * layered depth (three shadow distances + top inner light) over the linen
 * canvas. Matches the header nav lens recipe so all glass on the page reads
 * as one material.
 */

export const GLASS_BEZEL: CSSProperties = {
  background:
    'linear-gradient(180deg, oklch(1 0 0 / 0.28), oklch(1 0 0 / 0.08)), color-mix(in srgb, var(--fw-color-surface) 55%, transparent)',
  border: '1px solid oklch(1 0 0 / 0.55)',
  boxShadow:
    'inset 0 1px 0 oklch(1 0 0 / 0.5), 0 2px 4px oklch(0.18 0.01 60 / 0.08), 0 18px 44px oklch(0.18 0.01 60 / 0.16), 0 42px 90px oklch(0.18 0.01 60 / 0.14)',
  backdropFilter: 'blur(20px) saturate(1.15)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.15)',
};

/** Glass card for chrome-level stat tiles (deeper than the bezel — smaller surface). */
export const GLASS_CARD: CSSProperties = {
  background:
    'linear-gradient(180deg, oklch(1 0 0 / 0.3), oklch(1 0 0 / 0.1)), color-mix(in srgb, var(--fw-color-surface) 60%, transparent)',
  border: '1px solid oklch(1 0 0 / 0.55)',
  boxShadow:
    'inset 0 1px 0 oklch(1 0 0 / 0.55), 0 1px 2px oklch(0.18 0.01 60 / 0.07), 0 10px 24px oklch(0.18 0.01 60 / 0.12), 0 26px 56px oklch(0.18 0.01 60 / 0.14)',
  backdropFilter: 'blur(18px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(18px) saturate(1.2)',
};
