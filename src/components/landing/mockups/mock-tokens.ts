/**
 * Shared inline-style tokens for the landing product mockups.
 *
 * These mirror the Fairway design tokens (src/styles/design-tokens.css) as
 * literal values because the mockups are self-contained illustrations —
 * they must render identically even if app-level token plumbing shifts.
 * `ink3` intentionally uses the WCAG-darkened tertiary (0.535, not the
 * prototype's 0.585) so axe's contrast pass holds on every warm surface.
 */

import type { CSSProperties } from 'react';

export const M = {
  canvas: 'oklch(0.953 0.022 83)',
  surface: 'oklch(0.984 0.016 86)',
  tint: 'oklch(0.968 0.026 84)',
  sunken: 'oklch(0.963 0.021 84)',
  sunkenDeep: 'oklch(0.955 0.02 84)',
  ink: 'oklch(0.216 0.007 49)',
  ink2: 'oklch(0.444 0.014 65)',
  ink3: 'oklch(0.535 0.015 70)',
  line: 'oklch(0.862 0.013 82 / 0.95)',
  lineSolid: 'oklch(0.882 0.012 82)',
  accent: '#16A34A',
  /** White-text-safe brand green (primary-700): 5.0:1 vs #fff — the locked
   *  #16A34A is only 3.29:1, which fails the axe normal-text audit. */
  accentDeep: '#15803D',
  accent300: 'oklch(0.806 0.105 150)',
  accent700: 'oklch(0.488 0.124 150)',
  accent50: 'oklch(0.971 0.024 150)',
  warn: 'oklch(0.72 0.13 55)',
  warnDeep: 'oklch(0.5 0.13 55)',
  dark: '#0C0A09',
  onAccent: 'oklch(0.994 0.006 95)',
  mono: "var(--font-fairway-mono), ui-monospace, 'SF Mono', Menlo, monospace",
  sans: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Segoe UI', system-ui, sans-serif",
  softShadow:
    'inset 0 1px 0 oklch(1 0 0 / 0.6), 0 1px 2px oklch(0.18 0.01 60 / 0.07), 0 6px 16px oklch(0.18 0.01 60 / 0.1), 0 18px 40px oklch(0.18 0.01 60 / 0.1)',
  cardShadow:
    'inset 0 1px 0 oklch(1 0 0 / 0.6), 0 1px 2px oklch(0.18 0.01 60 / 0.06), 0 8px 20px oklch(0.18 0.01 60 / 0.1), 0 22px 48px oklch(0.18 0.01 60 / 0.11)',
} as const;

/** Mono micro-label style used across every mockup. */
export function monoLabel(size: number, color: string = M.ink3): CSSProperties {
  return {
    fontFamily: M.mono,
    fontSize: size,
    letterSpacing: '0.11em',
    textTransform: 'uppercase',
    color,
  };
}

export const num: CSSProperties = {
  fontFamily: M.mono,
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '-0.01em',
};
