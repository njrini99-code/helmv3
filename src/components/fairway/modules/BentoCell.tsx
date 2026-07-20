'use client';

/**
 * ============================================================================
 * Fairway · modules · BentoCell — one gapless bento tile (mockup `.cell`)
 * ----------------------------------------------------------------------------
 * A whole-cell `<button>` when `onOpen` is provided (hover → `surface-tint`,
 * a "→" exit affordance pinned bottom-right); a plain `<div>` when it's
 * display-only. `span`/`rows` map straight onto `col-span-2`/`row-span-2` so
 * the caller composes the mockup's asymmetric grid (Putting = 2×2, Team
 * standing / Last 10 rounds = 2×1) from `Bento` + `BentoCell` alone.
 * ========================================================================== */

import type { ElementType } from 'react';
import { cn } from '@/lib/utils';
import type { BentoCellProps, CellChipTone } from './types';

/** Statchip tones (mockup `.statchip.s-leak` / `.s-strong`) — reuse the
 *  existing app-wide amber-warning + green-success chip pairings rather than
 *  introducing new raw color literals. */
const CHIP_TONE: Record<CellChipTone, string> = {
  leak: 'bg-fw-warning-bg text-fw-warning-ink',
  strength: 'bg-accent-50 text-accent-700',
  neutral: 'bg-surface-sunken text-text-tertiary',
};

/**
 * A single tile inside a `Bento` grid. Pass `onOpen` to make the whole cell
 * a click target (opens a drill/stage view); omit it for a display-only
 * summary tile.
 */
export function BentoCell({
  label,
  chip,
  headline,
  sentence,
  span = 1,
  rows = 1,
  exitLabel = '→',
  onOpen,
  children,
}: BentoCellProps) {
  const interactive = Boolean(onOpen);
  const Comp = (interactive ? 'button' : 'div') as ElementType;
  const interactiveProps = interactive
    ? { type: 'button' as const, onClick: onOpen, 'aria-label': `Open ${label}` }
    : {};

  return (
    <Comp
      data-slot="bento-cell"
      {...interactiveProps}
      className={cn(
        'relative flex flex-col gap-2 bg-surface px-[18px] py-4 text-left',
        span === 2 && 'col-span-2',
        rows === 2 && 'row-span-2',
        interactive && [
          'cursor-pointer transition-colors duration-150 hover:bg-surface-tint',
          'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          'motion-reduce:transition-none',
        ],
      )}
    >
      <span className="flex items-center justify-between gap-2 font-fw-display text-eyebrow font-bold uppercase tracking-[0.11em] text-text-tertiary">
        {label}
        {chip ? (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-eyebrow font-bold normal-case tracking-[0.02em]',
              CHIP_TONE[chip.tone],
            )}
          >
            {chip.text}
          </span>
        ) : null}
      </span>

      {headline ? (
        <span className="flex items-baseline gap-1.5 font-fw-mono text-h2 tracking-[-0.02em] text-text-primary tabular-nums">
          {headline.value}
          {headline.unit ? (
            <small className="font-fw-sans text-caption font-normal normal-case tracking-normal text-text-tertiary">
              {headline.unit}
            </small>
          ) : null}
        </span>
      ) : null}

      {children}

      {sentence ? (
        <p className="m-0 font-fw-sans text-caption text-text-secondary">{sentence}</p>
      ) : null}

      {interactive ? (
        <span
          aria-hidden="true"
          className="absolute bottom-3 right-3.5 font-fw-sans text-caption font-bold text-accent-700"
        >
          {exitLabel}
        </span>
      ) : null}
    </Comp>
  );
}
