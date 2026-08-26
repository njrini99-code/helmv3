/**
 * 7-day occurrence trend for one fingerprint — a small inline bar strip.
 * Hand-rolled divs, tabular-nums, no chart library: this is 7 numbers, not a
 * dataset that needs an axis, a tooltip, or a legend.
 *
 * Plain function component (no 'use client', no hooks) so it renders
 * synchronously from the fingerprint page's Server Component tree and is
 * trivially unit-testable with React Testing Library without a browser API
 * shim. `buckets` is oldest → newest, matching @/lib/admin/data/errors's
 * computeDailyTrend.
 */

export interface TrendStripProps {
  /** Daily counts, oldest → newest. */
  buckets: readonly number[];
  /** True when the underlying row fetch hit its cap — the counts are a lower
   *  bound for at least one day in the window, not necessarily every day. */
  truncated: boolean;
  /** The trend query failed. Renders as an explicit "unavailable" line rather
   *  than a flat week of zeros, which would read as "this stopped happening". */
  unavailable: boolean;
  className?: string;
}

function dayLabel(index: number, total: number): string {
  const daysAgo = total - 1 - index;
  if (daysAgo === 0) return 'today';
  if (daysAgo === 1) return '1 day ago';
  return `${daysAgo} days ago`;
}

export function TrendStrip({ buckets, truncated, unavailable, className }: TrendStripProps) {
  const max = Math.max(1, ...buckets);
  const total = buckets.reduce((sum, n) => sum + n, 0);

  // A failed trend query is not a quiet week. Say which one it is.
  if (unavailable) {
    return (
      <p className={`text-caption text-warm-500${className ? ` ${className}` : ''}`}>
        7-day trend unavailable — the occurrence query failed. Counts above are unaffected.
      </p>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-end justify-between gap-3">
        {buckets.map((count, i) => {
          const heightPct = Math.round((count / max) * 100);
          return (
            <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div
                className="flex h-12 w-full items-end"
                role="img"
                aria-label={`${count} occurrence${count === 1 ? '' : 's'}, ${dayLabel(i, buckets.length)}`}
              >
                <div
                  className="w-full rounded-t-sm bg-accent-500/70"
                  style={{ height: count > 0 ? `${Math.max(6, heightPct)}%` : '2px' }}
                  aria-hidden="true"
                />
              </div>
              <p className="font-fw-mono text-caption tabular-nums text-warm-500">{count}</p>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-caption text-warm-500">
        {truncated
          ? `at least ${total} occurrences over the last 7 days — capped, true count may be higher`
          : `${total} occurrence${total === 1 ? '' : 's'} over the last 7 days`}
      </p>
    </div>
  );
}
