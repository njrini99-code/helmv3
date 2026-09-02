import Link from 'next/link';
import { StatusPill } from '@/components/fairway';
import type { FeatureHealthSummary as FeatureHealthSummaryData } from '@/lib/admin/data/feature-health';

/**
 * ONE red/amber/neutral vocabulary for feature-health counts, rendered in two
 * shapes from the SAME `FeatureHealthSummary` produced by
 * `summarizeFeatureHealth()` (src/lib/admin/data/feature-health.ts) — no
 * caller re-derives red/amber/neutral counts by hand, and no two renderings
 * of the same counts can drift apart.
 *
 * - `variant="compact"` — the Overview/golf/baseball banner: one summary
 *   line + up to 4 red/amber chips deep-linking to `/admin/errors?feature=`,
 *   + an overflow link to `/admin/health`. This is what `FeatureHealthRollup`
 *   renders — that component stays a thin, prop-source-compatible wrapper
 *   around this one (admin/page.tsx depends on its exact `{ summary }` shape
 *   and is not touched here).
 * - `variant="full"` — the Health board's per-app-group header line ("N red
 *   · M amber" / "N healthy · M no data" / "N healthy"), used by
 *   `FeatureDotGrid`'s `FeatureGroup` in place of a locally re-derived tally.
 *
 * Banner discipline (Noise-Discipline Charter N6) applies to BOTH variants:
 * never a celebration wall — the all-green case renders one quiet line,
 * nothing more — and a degraded pipeline always renders "unavailable", never
 * a fabricated count.
 */
export type FeatureHealthSummaryVariant = 'compact' | 'full';

export function FeatureHealthSummary({
  variant,
  summary,
}: {
  variant: FeatureHealthSummaryVariant;
  summary: FeatureHealthSummaryData;
}) {
  if (summary.degraded) {
    return (
      <p className="text-xs text-warm-600">
        {variant === 'compact'
          ? 'Feature health unavailable this refresh — showing last-known Overview data, not a fabricated state.'
          : 'Feature health unavailable this refresh — showing last-known state, not a fabricated status.'}
      </p>
    );
  }

  if (variant === 'full') {
    const needsEyes = summary.red + summary.amber;
    return (
      <p className="font-fw-mono text-xs tabular-nums text-warm-500">
        {needsEyes > 0 ? (
          <>
            {summary.red > 0 ? <span className="font-semibold text-fw-danger-ink">{summary.red} red</span> : null}
            {summary.red > 0 && summary.amber > 0 ? ' · ' : null}
            {summary.amber > 0 ? (
              <span className="font-semibold text-fw-warning-ink">{summary.amber} amber</span>
            ) : null}
          </>
        ) : summary.neutral > 0 ? (
          // Neutral (no feature-tagged data yet) is never relabeled
          // "healthy" — same honesty rule the Health page's own copy states.
          <span>
            {summary.green} healthy · {summary.neutral} no data
          </span>
        ) : (
          <span className="text-accent-700">{summary.green} healthy</span>
        )}
      </p>
    );
  }

  const flagged = [
    ...summary.redFeatures.map((f) => ({ ...f, tone: 'danger' as const })),
    ...summary.amberFeatures.map((f) => ({ ...f, tone: 'warning' as const })),
  ];
  const chips = flagged.slice(0, 4);
  const overflow = flagged.length - chips.length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href="/admin/health" className="font-fw-mono text-xs tabular-nums text-warm-700 hover:underline">
        Features: {summary.green} green · {summary.amber} amber · {summary.red} red · {summary.neutral} neutral
      </Link>
      {chips.map((c) => (
        <Link
          key={c.key}
          href={`/admin/errors?feature=${c.key}`}
          className="inline-flex min-h-11 items-center rounded-full transition-opacity hover:opacity-80"
        >
          <StatusPill tone={c.tone} dot size="sm">
            {c.label}
          </StatusPill>
        </Link>
      ))}
      {overflow > 0 ? (
        <Link href="/admin/health" className="text-xs font-medium text-accent-700 underline underline-offset-2">
          +{overflow} more → Health
        </Link>
      ) : null}
    </div>
  );
}
