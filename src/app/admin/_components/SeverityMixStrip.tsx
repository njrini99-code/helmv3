import Link from 'next/link';
import { AlertTriangle, CheckCircle2, CloudOff } from 'lucide-react';

export interface SeverityMixCounts {
  critical: number;
  error: number;
  warning: number;
}

/**
 * Pure bucketing — the 24h incident feed (`fetchTriageQueue()`) already
 * excludes `info` (INCIDENT_SEVERITIES, src/lib/admin/severity.ts only ever
 * puts warning/error/critical into the feed), so this only sorts the three
 * severities the feed can actually contain. Anything else (a stray value, a
 * malformed row) is silently dropped rather than crashing the strip — the
 * bar simply reflects less than `items.length`, which is fine since only
 * these three are ever plotted.
 */
export function bucketSeverityMix(items: readonly { severity: string }[]): SeverityMixCounts {
  const counts: SeverityMixCounts = { critical: 0, error: 0, warning: 0 };
  for (const item of items) {
    if (item.severity === 'critical' || item.severity === 'error' || item.severity === 'warning') {
      counts[item.severity] += 1;
    }
  }
  return counts;
}

const SEGMENTS = [
  { key: 'critical', label: 'Critical', colorClass: 'bg-fw-danger' },
  { key: 'error', label: 'Error', colorClass: 'bg-fw-danger/60' },
  { key: 'warning', label: 'Warning', colorClass: 'bg-fw-warning' },
] as const satisfies ReadonlyArray<{ key: keyof SeverityMixCounts; label: string; colorClass: string }>;

/**
 * One slim stacked bar of the 24h incident feed's severity composition —
 * the triage lane's "how bad, not just how many". Hand-rolled divs (no
 * chart lib for three numbers): a decorative proportional strip, plus a row
 * of labelled, deep-linked chips underneath that carry the real counts and
 * the actual click targets (a segment 8-10px tall can't hold a 44px touch
 * target on its own; the chip below it can, via padding — see
 * docs/MOBILE_DOCTRINE.md's touch-target floor).
 *
 * `sentryStatus` gates the all-clear the same way BriefingStrip's does
 * (page.tsx): an all-clear is a CLAIM, only made when every check that
 * feeds this bar actually ran. A Sentry outage or an unconfigured
 * SENTRY_READ_TOKEN both mean Sentry-origin incidents can never appear in
 * `counts` — zero counts under either state is "unknown", not "clean", and
 * is labelled as such rather than silently rendering an all-clear built
 * from a feed that was never whole.
 */
export function SeverityMixStrip({
  counts,
  sentryStatus,
}: {
  counts: SeverityMixCounts;
  /** fetchTriageQueue()'s `sentry.status` — 'ok' | 'unconfigured' | 'error'. */
  sentryStatus: 'ok' | 'unconfigured' | 'error';
}) {
  const total = counts.critical + counts.error + counts.warning;
  const segments = SEGMENTS.map((s) => ({ ...s, value: counts[s.key] })).filter((s) => s.value > 0);
  const degraded = sentryStatus !== 'ok';

  if (total === 0) {
    if (!degraded) {
      return (
        <p className="flex items-center gap-2 text-sm text-accent-700">
          <CheckCircle2 size={14} className="shrink-0" aria-hidden />
          No critical, error, or warning incidents in the last 24h.
        </p>
      );
    }
    return (
      <p className="flex items-center gap-2 text-sm text-fw-warning">
        {sentryStatus === 'error' ? (
          <CloudOff size={14} className="shrink-0" aria-hidden />
        ) : (
          <AlertTriangle size={14} className="shrink-0" aria-hidden />
        )}
        {sentryStatus === 'error'
          ? 'Sentry feed unavailable — 0 in-app incidents shown, this is not an all-clear.'
          : 'Sentry not configured — 0 in-app incidents shown; Sentry-origin incidents are never counted here.'}
      </p>
    );
  }

  return (
    <div>
      {degraded ? (
        <p className="mb-2 flex items-center gap-1.5 text-caption text-fw-warning">
          {sentryStatus === 'error' ? (
            <CloudOff size={12} className="shrink-0" aria-hidden />
          ) : (
            <AlertTriangle size={12} className="shrink-0" aria-hidden />
          )}
          {sentryStatus === 'error'
            ? 'Sentry feed unavailable — counts below are in-app incidents only.'
            : 'Sentry not configured — counts below are in-app incidents only.'}
        </p>
      ) : null}
      <div aria-hidden="true" className="flex h-2.5 w-full overflow-hidden rounded-full bg-warm-100">
        {segments.map((s) => (
          <div key={s.key} className={s.colorClass} style={{ width: `${(s.value / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-2">
        {segments.map((s) => (
          <li key={s.key}>
            <Link
              href={`/admin/errors?window=24&severity=${s.key}`}
              className="flex min-h-11 items-center gap-2 rounded-full border border-warm-200 px-3 text-caption text-warm-700 transition-colors hover:bg-warm-100"
            >
              <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${s.colorClass}`} />
              {s.label}
              <span className="font-fw-mono tabular-nums text-warm-900">{s.value}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
