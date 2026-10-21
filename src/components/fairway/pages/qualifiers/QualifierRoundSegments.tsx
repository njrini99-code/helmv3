/**
 * ============================================================================
 * Fairway · Qualifiers · QualifierRoundSegments — round progress as bars
 * ----------------------------------------------------------------------------
 * One bar per qualifier round, filled by the share of the field through it
 * (`fieldProgress().perRound`), labelled R1..Rn, with a spoken summary. An
 * ink fill on a recessed track: no green, and final on mount apart from a
 * width transition when a live round lands (off under reduced motion).
 * Shared by the detail page's status card and the list page's hero, whose
 * bars sit in a sunken well and so take a surface-coloured track.
 * ========================================================================== */

import { cn } from '@/lib/utils';

export function QualifierRoundSegments({
  perRound,
  numRounds,
  entrants,
  track = 'sunken',
  className,
}: {
  /** Share of the field through each round (0–1); null while loading. */
  perRound: number[] | null;
  numRounds: number;
  entrants: number;
  /** The track fill: `sunken` on a card (default), `surface` inside a sunken well. */
  track?: 'sunken' | 'surface';
  className?: string;
}) {
  const shares = perRound ?? Array.from({ length: Math.max(1, numRounds) }, () => 0);
  return (
    <div className={cn('mt-3', className)}>
      <div aria-hidden className="flex gap-1.5">
        {shares.map((share, i) => (
          <div key={i} className="min-w-0 flex-1">
            <div
              className={cn(
                'h-2 overflow-hidden rounded-full [box-shadow:inset_0_0_0_1px_var(--fw-color-border-subtle)]',
                track === 'surface' ? 'bg-surface' : 'bg-surface-sunken',
              )}
            >
              <div
                className="h-full rounded-full bg-text-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
                style={{ width: `${Math.round(share * 100)}%` }}
              />
            </div>
            <p
              className={cn(
                'mt-1.5 font-fw-sans text-caption tabular-nums',
                share > 0 ? 'text-text-secondary' : 'text-text-tertiary',
              )}
            >
              R{i + 1}
            </p>
          </div>
        ))}
      </div>
      {perRound && entrants > 0 ? (
        <p className="sr-only">
          {perRound
            .map((share, i) => `Round ${i + 1}: ${Math.round(share * entrants)} of ${entrants} players through`)
            .join('. ')}
        </p>
      ) : null}
    </div>
  );
}
