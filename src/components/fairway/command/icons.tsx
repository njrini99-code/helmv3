/**
 * ============================================================================
 * Fairway · command · local icons (SELF-CONTAINED)
 * ----------------------------------------------------------------------------
 * Tiny inline SVG glyphs used as sensible defaults by SearchField / CommandMenu
 * so this primitive group has ZERO cross-folder dependencies. Consumers can
 * always override any icon by passing their own `ReactNode` via props.
 *
 * Every icon:
 *  - is `currentColor` (inherits text color so warm tokens drive it),
 *  - has `aria-hidden` (decorative; the control owns the accessible name),
 *  - takes an optional `className` for sizing/positioning.
 * ============================================================================
 */

import type { SVGProps } from 'react';

type GlyphProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

export function SearchGlyph({ className, ...props }: GlyphProps) {
  return (
    <svg {...base} className={className} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  );
}

/** Up/down arrow pair used in the keyboard-hint footer. */
export function ArrowUpDownGlyph({ className, ...props }: GlyphProps) {
  return (
    <svg {...base} className={className} {...props}>
      <path d="M8 17V7m0 0L5 10m3-3 3 3" />
      <path d="M16 7v10m0 0 3-3m-3 3-3-3" />
    </svg>
  );
}

/** Enter / return key glyph. */
export function ReturnGlyph({ className, ...props }: GlyphProps) {
  return (
    <svg {...base} className={className} {...props}>
      <path d="M9 10 5 14l4 4" />
      <path d="M5 14h11a3 3 0 0 0 3-3V6" />
    </svg>
  );
}

/** Clock — recent items. */
export function ClockGlyph({ className, ...props }: GlyphProps) {
  return (
    <svg {...base} className={className} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

/** Sparkle — suggestions / zero-state. */
export function SparkleGlyph({ className, ...props }: GlyphProps) {
  return (
    <svg {...base} className={className} {...props}>
      <path d="M12 3.5c.6 3.7 1.8 4.9 5.5 5.5-3.7.6-4.9 1.8-5.5 5.5-.6-3.7-1.8-4.9-5.5-5.5 3.7-.6 4.9-1.8 5.5-5.5Z" />
      <path d="M18.5 14.5c.3 1.6.8 2.1 2.5 2.4-1.7.3-2.2.8-2.5 2.5-.3-1.7-.8-2.2-2.5-2.5 1.7-.3 2.2-.8 2.5-2.4Z" />
    </svg>
  );
}

/** A right-pointing chevron — "go" affordance on a hovered/selected row. */
export function GoGlyph({ className, ...props }: GlyphProps) {
  return (
    <svg {...base} className={className} {...props}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
