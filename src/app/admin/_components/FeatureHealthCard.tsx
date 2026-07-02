import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Surface, Eyebrow, StatusPill } from '@/components/fairway';
import type { FeatureHealth } from '@/lib/admin/data/feature-health';

/**
 * Per-feature summarization card (W16 Task 3). Presentational + static —
 * mounted by the client `FeatureDotGrid` when a chip is selected. Renders
 * the healthSignal sentence, state + reason, the §4 summary template, the
 * top-3 grouped signatures (ONE line per fingerprint with a count — never N
 * rows, N4), drill-in-only warning/RLS counts, a heartbeat-age chip, and any
 * annotated known-gaps so pre-existing drift is never misread as an outage.
 */

function relTime(iso: string): string {
  const ageMs = Date.now() - new Date(iso).getTime();
  const hours = ageMs / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(ageMs / 60_000))}m ago`;
  if (hours < 48) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function FeatureHealthCard({ feature }: { feature: FeatureHealth }) {
  return (
    <Surface elevation="border" padding="md" className="mt-3" aria-label={`${feature.label} detail`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow as="h3" tone="secondary">
            {feature.app === 'golfhelm' ? 'GolfHelm' : 'CoachHelm'} · {feature.label}
          </Eyebrow>
          <p className="mt-1 text-sm text-warm-700">{feature.healthSignal}</p>
        </div>
        <Link
          href={`/admin/errors?feature=${encodeURIComponent(feature.key)}`}
          className="whitespace-nowrap text-xs font-medium text-accent-700 underline underline-offset-2"
        >
          View in Errors →
        </Link>
      </div>

      <p className="mt-3 text-sm text-warm-900">{feature.reason}</p>
      <p className="mt-1 text-xs text-warm-500">{feature.summary}</p>

      {feature.topSignatures.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {feature.topSignatures.slice(0, 3).map((sig) => (
            <li key={sig.fingerprint} className="truncate text-xs text-warm-700">
              <StatusPill tone={sig.severity === 'critical' ? 'danger' : 'warning'} size="sm" dot>
                {sig.severity}
              </StatusPill>{' '}
              <span className="font-medium text-warm-900">&ldquo;{sig.title}&rdquo;</span>{' '}
              <span className="font-fw-mono tabular-nums text-warm-500">
                ({sig.count}×, last seen {relTime(sig.lastSeen)})
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-warm-500">No error-fingerprinted incidents in the lookback window.</p>
      )}

      <dl className="mt-4 flex flex-wrap gap-4 text-xs text-warm-600">
        <div>
          <dt className="text-warm-400">Warnings 24h (drill-in only)</dt>
          <dd className="font-fw-mono tabular-nums text-warm-800">{feature.drillIn.warnings24h}</dd>
        </div>
        <div>
          <dt className="text-warm-400">RLS denials 24h (drill-in only)</dt>
          <dd className="font-fw-mono tabular-nums text-warm-800">{feature.drillIn.rlsDenials24h}</dd>
        </div>
        <div>
          <dt className="text-warm-400">Heartbeat</dt>
          <dd className="font-fw-mono tabular-nums text-warm-800">
            {feature.drillIn.heartbeatAgeHours === null ? 'no data' : `${feature.drillIn.heartbeatAgeHours}h ago`}
          </dd>
        </div>
      </dl>

      {feature.knownGaps.length > 0 ? (
        <ul className="mt-4 space-y-1 border-t border-border-subtle pt-3">
          {feature.knownGaps.map((gap) => (
            <li key={gap} className="flex items-start gap-1.5 text-xs text-warm-500">
              <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" aria-hidden />
              <span><span className="font-medium text-warm-600">known gap — not an outage:</span> {gap}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Surface>
  );
}
