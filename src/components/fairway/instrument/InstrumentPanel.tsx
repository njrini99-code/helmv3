'use client';

/**
 * ============================================================================
 * Fairway · instrument · InstrumentPanel — the signature flat matte PANEL
 * ----------------------------------------------------------------------------
 * The "instrument cluster" was repointed from a frosted-glass bezel to a
 * calm, content-first matte card (flat & clean Apple, per the co-located
 * `instrument-panel.module.css`): no blur, no specular sheen, no interior
 * glow. A panel is the bezel a hero gauge / ribbon / readout mounts into —
 * depth now comes from a quiet surface + hairline (base), a soft warm drop
 * shadow (raised), or a sunken inner shadow (inset), never from translucency:
 *
 *   • a quiet matte surface (--fw-color-surface) + a single hairline border
 *   • a soft WARM drop shadow (--fw-shadow-raise) on `depth="raised"`        → it floats
 *   • a sunken well (--fw-color-surface-sunken) on `depth="inset"`          → recessed sub-display
 *   • optional green accent hairline on the rim (tone="accent")             → the ONE focal
 *
 * Depth model (the `depth` prop):
 *   base   — a calm seated panel (quiet surface + hairline, no shadow).
 *   raised — the focal instrument: it sits PROUD of the cluster (soft warm
 *            drop shadow).
 *   inset  — a smaller READOUT panel layered INSIDE a larger instrument: a
 *            sunken inner shadow, no drop shadow, so it reads as a recessed
 *            sub-display rather than a second floating card.
 *
 * Honesty / a11y: already opaque, so `forced-colors` just swaps to system
 * Canvas/CanvasText; there is no translucency to collapse. Honors
 * prefers-reduced-motion (the parent owns any sweep; this panel never
 * animates backdrop-filter, which it also never sets).
 *
 * ADDITIVE ONLY — imported by nothing existing. Renders inside a `.fairway-ds`
 * scope on a bg-canvas page. This REPLACES bespoke glass for CoachHelm heroes.
 * ========================================================================== */

import { forwardRef } from 'react';
import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import styles from './instrument-panel.module.css';

/** Rim treatment: a neutral cream bezel, or the ONE green-breath focal panel. */
export type InstrumentPanelTone = 'neutral' | 'accent';

/**
 * Layering depth:
 *   base   — seated panel (floats gently).
 *   raised — the proud focal instrument (soft warm drop shadow).
 *   inset  — a recessed readout panel layered INSIDE a larger instrument.
 */
export type InstrumentPanelDepth = 'base' | 'raised' | 'inset';

const PADDING = {
  none: 'p-0',
  sm: 'p-4', // 16px
  md: 'p-6', // 24px — default
  lg: 'p-8', // 32px — hero bezel
} as const;

export type InstrumentPanelPadding = keyof typeof PADDING;

export interface InstrumentPanelProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Rim treatment. `accent` paints the green focal breath (use on ONE panel). */
  tone?: InstrumentPanelTone;
  /** Layering depth — see the type doc. Default `base`. */
  depth?: InstrumentPanelDepth;
  /** Inner padding rhythm. Default `md` (p-6). Pass `none` for edge-to-edge. */
  padding?: InstrumentPanelPadding;
  /** Tiny uppercase Fraunces overline (the instrument's category). */
  eyebrow?: ReactNode;
  /** The instrument label / headline (Fraunces). String → styled `h3`. */
  header?: ReactNode;
  /** A top-right readout slot (a small Readout, a status pill, a control). */
  readout?: ReactNode;
  /** Render as another element/component (e.g. `'section'`, `'article'`). */
  as?: ElementType;
  children?: ReactNode;
}

/**
 * The flat matte instrument panel. Compose a hero gauge / ribbon as
 * `children`, an `eyebrow` + `header` for the bezel label, and a `readout` for
 * the top-right corner display. Nest a `depth="inset"` panel inside for a
 * recessed sub-readout (a small panel inset on a larger instrument).
 */
export const InstrumentPanel = forwardRef<HTMLDivElement, InstrumentPanelProps>(
  function InstrumentPanel(
    {
      tone = 'neutral',
      depth = 'base',
      padding = 'md',
      eyebrow,
      header,
      readout,
      as,
      className,
      children,
      ...props
    },
    ref,
  ) {
    const Comp = (as ?? 'div') as ElementType;
    const hasBezel = Boolean(eyebrow || header || readout);

    return (
      <Comp
        ref={ref}
        data-slot="instrument-panel"
        data-tone={tone}
        data-depth={depth}
        className={cn(
          styles.panel,
          tone === 'accent' && styles.panelAccent,
          depth === 'raised' && styles.panelRaised,
          depth === 'inset' && styles.panelInset,
          'relative isolate text-text-primary',
          // base panels round at the card radius; inset sub-readouts a touch
          // tighter so a nested panel reads as a recessed sub-display.
          depth === 'inset' ? 'rounded-fw-md' : 'rounded-card',
          PADDING[padding],
          className,
        )}
        {...props}
      >
        {hasBezel ? (
          <div
            data-slot="instrument-bezel"
            className={cn(
              // Phones (< sm): stack eyebrow → heading → readout in one column
              // so a wide readout (e.g. Ribbon's value+delta figure) never
              // crowds the heading into an overlap. `sm:` and up restores the
              // side-by-side bezel row (doctrine rule 11 — stacked, composed,
              // never overlapping at 390px).
              'flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4',
              // only reserve a gap below the bezel when there's an instrument body
              children ? 'mb-5' : undefined,
            )}
          >
            <div className="min-w-0 space-y-1">
              {eyebrow ? (
                <p className="font-fw-display text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
                  {eyebrow}
                </p>
              ) : null}
              {typeof header === 'string' ? (
                <h3 className="truncate font-fw-display text-h3 font-semibold leading-tight text-text-primary">
                  {header}
                </h3>
              ) : (
                header
              )}
            </div>
            {readout ? (
              // `justify-start` at `<sm` — the wrapper above is `flex-col
              // items-start`, so a right-justified full-width child contradicted
              // its own stacking rule: the readout flew to the panel's right
              // edge while the eyebrow and heading stayed left, leaving a wide
              // dead gutter between them. Measured on CoachHelm's team-leak
              // panel at 390px: heading left edge 42px, the health gauge
              // stranded at 190–350px on the line below it. `sm:justify-end`
              // keeps the desktop top-right bezel readout unchanged.
              <div className="flex w-full shrink-0 items-start justify-start sm:w-auto sm:justify-end">
                {readout}
              </div>
            ) : null}
          </div>
        ) : null}
        {children}
      </Comp>
    );
  },
);
