import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { AttentionRow } from '@/lib/admin/incidents/attention';
import { PanelAllClear, PanelNoData } from '@/app/admin/_components/PanelStates';
import { TONE_INK, TONE_RAIL } from './tone';

export interface AttentionStackImpact {
  affectedUsers: number;
  affectedUsersKnown: boolean;
}

/**
 * ATTENTION STACK (brief §10) — the Command Deck's compact, ranked "what
 * needs attention now" column. A deliberately terser sibling of the
 * existing `AttentionQueue` (full detail, further down the page): same
 * ranking, same `AttentionRow`s from the SAME `selectAttention` call (§44 —
 * no second attention model), just a top-N summary with a user-impact badge
 * and one action link per row.
 *
 * `impactByKey` is a presentational join onto `UnifiedIncident.affectedUsers`
 * — passed in rather than re-derived here, and never invents a count of its
 * own: a row absent from the map (a platform check, a source-blind row)
 * renders with no impact badge at all, not a fabricated zero.
 */
export function AttentionStack({
  rows,
  total,
  checkedAt,
  canClaimAllClear,
  impactByKey,
}: {
  rows: readonly AttentionRow[];
  total: number;
  checkedAt: string;
  canClaimAllClear: boolean;
  impactByKey: ReadonlyMap<string, AttentionStackImpact>;
}) {
  if (rows.length === 0) {
    return canClaimAllClear ? (
      <PanelAllClear label="Nothing needs attention" checkedAt={checkedAt} />
    ) : (
      <PanelNoData
        label="Could not fully compute what needs attention"
        description="At least one source could not be read, so this list may be incomplete."
      />
    );
  }

  return (
    <div className="min-w-0">
      <ul className="space-y-1.5">
        {rows.map((row) => {
          const impact = impactByKey.get(row.key);
          return (
            <li key={row.key} className="relative flex min-h-11 min-w-0 gap-2.5 rounded-lg bg-surface-sunken py-2 pr-2">
              <span aria-hidden className={cn('absolute inset-y-1 left-0 w-1 rounded-r-sm', TONE_RAIL[row.tone])} />
              <div className="min-w-0 flex-1 pl-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={cn('text-eyebrow font-bold uppercase tracking-wide', TONE_INK[row.tone])}>
                    {row.state}
                  </span>
                  {impact && impact.affectedUsersKnown ? (
                    <span className="shrink-0 font-fw-mono text-caption tabular-nums text-warm-500">
                      {impact.affectedUsers} {impact.affectedUsers === 1 ? 'user' : 'users'}
                    </span>
                  ) : null}
                </div>
                <p className="truncate text-body-sm font-medium text-warm-900">{row.headline}</p>
              </div>
              {row.href ? (
                <Link
                  href={row.href}
                  className="shrink-0 self-center text-caption text-accent-700 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
                >
                  Open →
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
      {total > rows.length ? (
        <p className="mt-2 text-caption text-warm-500">
          <Link href="/admin/errors" className="text-accent-700 underline">
            {total - rows.length} more needing attention
          </Link>
        </p>
      ) : null}
    </div>
  );
}
