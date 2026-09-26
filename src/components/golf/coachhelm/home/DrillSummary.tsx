/**
 * ============================================================================
 * DrillSummary: the summary card that opens every player CoachHelm drill
 * ----------------------------------------------------------------------------
 * Same idiom as the root map's `RootSummary` (summary first, detail on tap):
 * one card with the key number, one line of takeaway, one visual, a quiet
 * basis line (sample size, window, last update) and at most one action.
 * Everything else on the drill sits below it behind a `Disclosure`.
 * ========================================================================== */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Eyebrow } from '@/components/fairway';

export interface DrillSummaryProps {
  eyebrow: string;
  /** The key number, already formatted. Mono digits (house style). */
  value: ReactNode;
  /** Small unit / qualifier printed after the value. */
  unit?: ReactNode;
  /** One sentence: what the number means for the player. */
  takeaway?: ReactNode;
  /** The one visual. */
  visual?: ReactNode;
  /** Sample size / window / last update, in one quiet line. */
  basis?: ReactNode;
  /** The drill's one primary action (or a quiet secondary one). */
  action?: ReactNode;
  className?: string;
  slot?: string;
}

export function DrillSummary({
  eyebrow,
  value,
  unit,
  takeaway,
  visual,
  basis,
  action,
  className,
  slot = 'drill-summary',
}: DrillSummaryProps) {
  return (
    <section
      aria-label="Summary"
      data-slot={slot}
      className={cn('flex flex-col gap-4 rounded-fw-lg border border-border-subtle bg-surface p-5 md:p-6', className)}
    >
      <div className="flex flex-col gap-1">
        <Eyebrow as="p">{eyebrow}</Eyebrow>
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-fw-mono text-display tabular-nums text-text-primary" data-slot="summary-value">
            {value}
          </span>
          {unit ? <span className="text-body-sm text-text-secondary">{unit}</span> : null}
        </p>
        {takeaway ? (
          <p className="text-body text-text-secondary" data-slot="summary-takeaway">
            {takeaway}
          </p>
        ) : null}
      </div>
      {visual ? <div className="min-w-0">{visual}</div> : null}
      {basis ? (
        <p className="text-caption text-text-tertiary" data-slot="summary-basis">
          {basis}
        </p>
      ) : null}
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </section>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "Sep 24" from an ISO timestamp's UTC calendar day. Formatted by hand, not
 * with the runtime locale/time zone, so server and client print the same
 * text (no hydration mismatch). Null for a missing or unparseable value.
 */
export function shortDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return null;
  return `${month} ${Number(m[3])}`;
}
