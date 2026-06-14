/**
 * ============================================================================
 * Fairway · controls · Eyebrow — the ONE overline recipe
 * ----------------------------------------------------------------------------
 * The eyebrow/overline is the most-repeated small element in the system and it
 * functions as a typographic fingerprint — it must look identical EVERYWHERE.
 * Today it's drawn ~8 different ways (a spread of inline `tracking-[...]` and
 * `font-*` overrides). This is the single source of truth.
 *
 * Size / line-height / letter-spacing / weight all live in the `text-eyebrow`
 * token (11px / 16px / 0.06em / 600). This component adds ONLY `uppercase` +
 * the tone — NEVER co-class an inline `tracking-*` or `font-*`; the token owns
 * them, so every eyebrow renders pixel-identical.
 *
 *   <Eyebrow>Stats</Eyebrow>                neutral meta overline (default)
 *   <Eyebrow tone="accent">Signal</Eyebrow> the green focal overline
 *
 * ADDITIVE — renders inside a `.fairway-ds` scope. Migrating the inline-styled
 * eyebrows onto it is a mechanical follow-up.
 * ========================================================================== */
import { forwardRef, type ElementType, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Overline tone. `tertiary` (default) for quiet meta; `accent` for the green
 *  focal flourish; `secondary` for a slightly stronger neutral. */
export type EyebrowTone = 'tertiary' | 'secondary' | 'accent';

const TONE: Record<EyebrowTone, string> = {
  tertiary: 'text-text-tertiary',
  secondary: 'text-text-secondary',
  accent: 'text-accent-700',
};

export interface EyebrowProps extends HTMLAttributes<HTMLElement> {
  tone?: EyebrowTone;
  /** Render as another element (e.g. `'p'`, `'div'`). Defaults to `span`. */
  as?: ElementType;
}

export const Eyebrow = forwardRef<HTMLElement, EyebrowProps>(function Eyebrow(
  { tone = 'tertiary', as, className, children, ...props },
  ref,
) {
  const Comp = (as ?? 'span') as ElementType;
  return (
    <Comp
      ref={ref}
      data-slot="eyebrow"
      // font-fw-sans + the text-eyebrow token (size/tracking/weight 600) + tone.
      // No inline tracking/weight — that is the whole point of the primitive.
      className={cn('font-fw-sans text-eyebrow uppercase', TONE[tone], className)}
      {...props}
    >
      {children}
    </Comp>
  );
});
