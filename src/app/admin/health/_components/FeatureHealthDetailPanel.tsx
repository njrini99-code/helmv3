import { AlertTriangle, CheckCircle2, ChevronDown, MinusCircle, Tag, XCircle, type LucideIcon } from 'lucide-react';
import { Badge, Eyebrow, InlineNotice, StatusPill, type FwStatusTone } from '@/components/fairway';
import { cn } from '@/lib/utils';
import {
  DETAIL_ROW_LIMIT,
  type FeatureDetailRow,
  type FeatureHealthDetailResult,
  type RecencyClass,
} from '@/lib/admin/data/feature-health-detail';
import type { FeatureApp } from '@/lib/admin/feature-registry';
import type { FeatureStatus, FeatureTrend } from '@/lib/admin/data/feature-health';
import { PanelAllClear, PanelNoData } from '../../_components/PanelStates';

/**
 * Feature Health — DETAIL rows. Every row here is a `FeatureDetailRow` from
 * `fetchFeatureHealthDetail()`: registered (a FEATURE_REGISTRY key, with
 * tier/app/trend/hysteresis) and UNREGISTERED (a raw `admin_events.feature`
 * tag the registry has no entry for — see that module's doc comment) render
 * side by side, ranked by `rankFeatureDetailRows` so an actively-firing
 * feature always outranks a louder one that has already gone quiet.
 *
 * Progressive disclosure (task point 4, the established Bridge idiom — see
 * `PostureDisclosure.tsx`): red/amber (and any non-green/neutral unregistered
 * tag) render in full, always. Green + neutral fold behind ONE native
 * `<details>` so a healthy majority never pushes what needs eyes below the
 * fold.
 */

const TONE_FOR_STATUS: Record<FeatureStatus, FwStatusTone> = {
  green: 'success',
  amber: 'warning',
  red: 'danger',
  neutral: 'neutral',
};

const ICON_FOR_STATUS: Record<FeatureStatus, LucideIcon> = {
  green: CheckCircle2,
  amber: AlertTriangle,
  red: XCircle,
  neutral: MinusCircle,
};

const APP_LABEL: Record<FeatureApp, string> = {
  golfhelm: 'GolfHelm',
  coachhelm: 'CoachHelm',
  baseballhelm: 'BaseballHelm',
};

const TREND_ARROW: Record<FeatureTrend, string> = { improving: '↓', worsening: '↑', flat: '→' };

const RECENCY_LABEL: Record<RecencyClass, string> = {
  active: 'last event <24h ago',
  recent: 'last event 1–3d ago',
  stale: 'last event >3d ago',
  no_activity: 'no events in window',
};

/** Elapsed-duration text, computed from two known instants — no wall-clock
 *  timezone involved, so (unlike an absolute `toLocaleTimeString()`) this is
 *  safe to render from a Server Component; same convention as
 *  `FeatureHealthCard.tsx`'s `relTime` and `feature-health.ts`'s
 *  `relativeFromNow`, reimplemented locally since neither is exported. */
function relTime(iso: string): string {
  const ageMs = Date.now() - new Date(iso).getTime();
  const hours = ageMs / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(ageMs / 60_000))}m ago`;
  if (hours < 48) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function FeatureDetailRowCard({
  row,
  countsAvailable,
  dense = false,
}: {
  row: FeatureDetailRow;
  /** False when the raw admin_events read failed this refresh — see
   *  `FeatureHealthDetailResult.countsAvailable`'s doc comment. Never
   *  render `row.counts`/`row.lastEventAt`/`row.recency` as real numbers
   *  when this is false: they are `EMPTY_FEATURE_DETAIL_COUNTS`/null in
   *  that case, and printing "0 err / 0 warn" would read as a quiet week
   *  that this refresh has no actual evidence for. */
  countsAvailable: boolean;
  dense?: boolean;
}) {
  const Icon = ICON_FOR_STATUS[row.status];
  return (
    <div className={cn('rounded-xl border border-border-subtle bg-surface p-3', dense && 'py-2')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <StatusPill tone={TONE_FOR_STATUS[row.status]} dot size="sm" className="min-w-0">
            <Icon size={12} aria-hidden />
            <span className="truncate">{row.label}</span>
          </StatusPill>
          {row.app ? (
            <Badge variant="outline" size="sm">
              {APP_LABEL[row.app]}
            </Badge>
          ) : (
            <Badge variant="soft" tone="warning" size="sm" leadingIcon={<Tag size={10} aria-hidden />}>
              unregistered tag
            </Badge>
          )}
          {row.tier ? (
            <Badge variant="outline" size="sm">
              {row.tier} tier
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-3 font-fw-mono text-xs tabular-nums text-warm-500">
          {row.trend ? <span aria-hidden>{TREND_ARROW[row.trend]}</span> : null}
          <span title={row.lastEventAt ?? undefined}>
            {countsAvailable ? RECENCY_LABEL[row.recency] : 'recency unavailable'}
          </span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-4 font-fw-mono text-xs tabular-nums text-warm-600">
        {countsAvailable ? (
          <>
            <span>{row.counts.errors} err (7d)</span>
            <span>{row.counts.warnings} warn (7d)</span>
            <span>{row.counts.total} total (7d)</span>
          </>
        ) : (
          <span className="italic text-warm-400">7d counts unavailable this refresh</span>
        )}
      </div>

      {!dense ? (
        <>
          <p className="mt-2 text-sm text-warm-800">{row.reason}</p>
          {row.topSignatures.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {row.topSignatures.map((sig) => (
                <li key={sig.fingerprint} className="truncate text-xs text-warm-600">
                  <StatusPill tone={sig.severity === 'warning' ? 'warning' : 'danger'} size="sm" dot>
                    {sig.severity}
                  </StatusPill>{' '}
                  <span className="font-medium text-warm-900">&ldquo;{sig.title}&rdquo;</span>{' '}
                  <span className="font-fw-mono tabular-nums text-warm-500">
                    ({sig.count}×, last seen {relTime(sig.lastSeen)})
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {row.knownGaps.length > 0 ? (
            <ul className="mt-2 space-y-1 border-t border-border-subtle pt-2">
              {row.knownGaps.map((gap) => (
                <li key={gap} className="flex items-start gap-1.5 text-xs text-warm-500">
                  <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" aria-hidden />
                  <span>
                    <span className="font-medium text-warm-600">known gap — not an outage:</span> {gap}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function FeatureHealthDetailPanel({ result }: { result: FeatureHealthDetailResult }) {
  const leading = result.rows.filter((r) => r.status === 'red' || r.status === 'amber');
  const folded = result.rows.filter((r) => r.status === 'neutral' || r.status === 'green');
  const healthyCount = folded.filter((r) => r.status === 'green').length;
  const noDataCount = folded.filter((r) => r.status === 'neutral').length;
  const unregisteredCount = result.rows.filter((r) => r.kind === 'unregistered').length;

  // Either degraded source makes "nothing needs attention" unprovable: the RPC
  // being down forces every registered row to neutral, and the raw-event read
  // being down removes the only way an unregistered tag could surface.
  const cannotClaimAllClear = result.degraded || !result.countsAvailable;

  return (
    <div className="space-y-3">
      {result.degraded ? (
        <InlineNotice tone="warning" title="Classifier pipeline degraded">
          get_feature_health() did not respond{result.degradedReason ? `: ${result.degradedReason}.` : '.'}{' '}
          Status/trend below are forced to the neutral fail-soft state for every registered feature — the 7d
          counts and last-event recency are sourced independently from admin_events and are still live.
        </InlineNotice>
      ) : null}
      {!result.countsAvailable ? (
        <InlineNotice tone="warning" title="Per-feature 7d counts unavailable this refresh">
          The raw admin_events read failed — every row below shows its real status/trend from
          get_feature_health() (a separate, still-working query), but not a fabricated zero-error reading for
          this window. Unregistered-tag detection also depends on this same read, so a tag flagged last refresh
          that is silent below now is unconfirmed, not resolved. Refresh to retry.
        </InlineNotice>
      ) : result.rowsTruncated ? (
        <InlineNotice tone="warning" title="Per-feature counts are a lower bound">
          The raw event page hit its {DETAIL_ROW_LIMIT.toLocaleString()}-row cap for this window — counts and
          last-event recency above reflect only the most recent events fetched, not the true total. The
          attribution-coverage percentages above are unaffected (computed from an exact count, not this page).
        </InlineNotice>
      ) : null}

      <p className="font-fw-mono text-xs tabular-nums text-warm-500">
        {leading.length} need attention · {healthyCount} healthy · {noDataCount} no data
        {unregisteredCount > 0 ? ` · ${unregisteredCount} unregistered tag(s)` : ''}
        {cannotClaimAllClear ? ' · from a degraded read' : ''}
      </p>

      {leading.length === 0 ? (
        // NEVER PanelAllClear on a degraded read.
        //
        // When `get_feature_health()` is down, its fail-soft branch forces every
        // registered feature to `neutral` — so `leading` is empty by
        // construction, not by measurement. If the same incident also took out
        // the raw admin_events reads, no unregistered row can be derived either
        // and `leading` is guaranteed empty. The panel would then render a green
        // "No feature needs attention" tick DIRECTLY BENEATH its own two
        // warnings saying the classifier is degraded and the counts are
        // unavailable.
        //
        // That is `unknown → healthy`, which
        // memory/system/golfhelm-engineering-os.md names as a thing this system
        // must never do, and which PanelAllClear's own doc comment exists to
        // prevent ("a dashboard is never mistaken for a healthy system").
        //
        // An empty list means one of two opposite things, and the difference is
        // exactly what an operator opened this page to learn.
        cannotClaimAllClear ? (
          <PanelNoData
            label="Cannot confirm feature health this refresh"
            description="Nothing is listed as needing attention, but that is a consequence of the degraded reads above rather than a measurement: the classifier's fail-soft branch forces every registered feature to neutral, so this list is empty by construction. Refresh to retry."
          />
        ) : (
          <PanelAllClear label="No feature needs attention" checkedAt={result.generatedAt} />
        )
      ) : (
        <div className="space-y-2">
          {leading.map((row) => (
            <FeatureDetailRowCard
              key={`${row.kind}:${row.key}`}
              row={row}
              countsAvailable={result.countsAvailable}
            />
          ))}
        </div>
      )}

      {folded.length > 0 ? (
        <details className="group rounded-xl border border-warm-200 bg-surface">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 [&::-webkit-details-marker]:hidden">
            <Eyebrow as="span" tone="secondary">
              Healthy &amp; no-data features
            </Eyebrow>
            <span className="flex items-center gap-2 text-xs text-warm-500">
              {folded.length} feature{folded.length === 1 ? '' : 's'}
              <ChevronDown
                size={16}
                aria-hidden
                className="shrink-0 motion-safe:transition-transform group-open:rotate-180"
              />
            </span>
          </summary>
          <div className="space-y-2 border-t border-warm-200 px-4 py-3">
            {folded.map((row) => (
              <FeatureDetailRowCard
                key={`${row.kind}:${row.key}`}
                row={row}
                countsAvailable={result.countsAvailable}
                dense
              />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
