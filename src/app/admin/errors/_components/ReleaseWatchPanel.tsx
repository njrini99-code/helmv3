import { Surface } from '@/components/fairway';
import { ReleaseWatchPosturePill } from '@/components/admin/premium';
import { UnknownInline } from '@/components/admin/premium/UnknownValue';
import type { CurrentReleaseWatch } from '@/lib/admin/incidents/release-watch';
import type { ComparisonMetric } from '@/lib/admin/incidents/release-compare';
import { LocalTime } from '../../_components/LocalTime';

/**
 * Release Watch (brief §9/§12/§28's Phase 1 slice: "post-deploy Release
 * Watch"). Sits on `/admin/errors` because Phase 1 bundles "Incidents +
 * release tracking" together — the full Release Runway (`/admin/deploys`,
 * a later phase's territory) is not built here.
 *
 * Every metric that has no read model yet in this codebase (journey success
 * rate, DB p95, invariant breaches — see `release-compare.ts`'s own header)
 * renders through `UnknownInline`, never a fabricated zero or a blank cell.
 */

function metricRow(label: string, metric: ComparisonMetric, unit: (v: number) => string) {
  const stateWord: Record<ComparisonMetric['state'], string> = {
    unknown: '',
    improved: 'improved',
    worsened: 'worsened',
    unchanged: 'unchanged',
  };
  return (
    <div key={label} className="rounded-fw-md bg-surface-sunken px-3 py-2">
      <p className="text-caption uppercase tracking-widest text-warm-500">{label}</p>
      {/* Gate on metric.current alone, NOT metric.state === 'unknown'. Those
          used to be equivalent for every metric this panel rendered — before
          the defect #2 fix (PR #1789 review), rootIncidents/affectedUsers
          always had baseline and current either both null or both a real,
          equal number (same live board reused for both), so 'unknown' state
          never occurred alongside a real current value. Now that baseline is
          honestly null until this codebase has a reign-scoped incident
          model, compareMetric can return state:'unknown' with a REAL current
          value (we know today's count; we just never measured the
          baseline). Gating on state alone would hide a known number behind
          "no read model yet", which is exactly the false-unknown this panel
          exists to avoid. */}
      {metric.current === null ? (
        <p className="mt-0.5">
          <UnknownInline label="no read model yet" />
        </p>
      ) : (
        <p className="mt-0.5 font-fw-mono text-sm font-semibold tabular-nums text-warm-900">
          {unit(metric.current)}
          {metric.baseline !== null ? (
            <span className="ml-1.5 text-caption font-normal text-warm-500">
              {stateWord[metric.state]} from {unit(metric.baseline)}
            </span>
          ) : null}
        </p>
      )}
    </div>
  );
}

export function ReleaseWatchPanel({ releaseWatch }: { releaseWatch: CurrentReleaseWatch }) {
  const { context, comparison, currentCard, unavailableReason, newFingerprintsTotal } = releaseWatch;
  const triplet = context.runtimeIdentity;

  return (
    <Surface padding="sm" className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-eyebrow uppercase text-warm-500">Release Watch</h2>
        <ReleaseWatchPosturePill state={context.releaseWatch} pulse />
      </div>

      {unavailableReason ? (
        <p className="mt-2 text-body-sm text-warm-600">{unavailableReason}</p>
      ) : (
        <>
          {/* Runtime Identity Triplet — brief §9. */}
          <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-3">
            <div>
              <dt className="text-eyebrow uppercase tracking-wide text-warm-500">App SHA</dt>
              <dd className="break-words font-fw-mono text-caption text-warm-800 [overflow-wrap:anywhere]">
                {triplet.appSha ? triplet.appSha.slice(0, 12) : <UnknownInline label="unknown" />}
                {currentCard ? (
                  <span className="text-warm-500">
                    {' '}
                    · <LocalTime iso={new Date(currentCard.createdAt).toISOString()} />
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-eyebrow uppercase tracking-wide text-warm-500">DB migration head</dt>
              <dd className="break-words font-fw-mono text-caption text-warm-800 [overflow-wrap:anywhere]">
                {triplet.dbMigrationHeadState === 'known' && triplet.dbMigrationHead ? (
                  triplet.dbMigrationHead
                ) : (
                  <UnknownInline label="unread this refresh" />
                )}
              </dd>
            </div>
            <div>
              <dt className="text-eyebrow uppercase tracking-wide text-warm-500">AI config identity</dt>
              <dd className="break-words font-fw-mono text-caption text-warm-800 [overflow-wrap:anywhere]">
                {triplet.aiConfigIdentity}
              </dd>
            </div>
          </dl>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="text-body-sm text-warm-700">
              {/* newFingerprintsTotal is release-ledger.ts's uncapped counter — never
                  context.newFingerprints.length, which is a display sample capped at 5
                  and previously misread as "5" for every release with more new
                  fingerprints than that. regressedFingerprints IS the full count
                  already (derived from the whole relationships map, not a ledger
                  sample), so it needs no equivalent fix. */}
              {newFingerprintsTotal} new fingerprint{newFingerprintsTotal === 1 ? '' : 's'} ·{' '}
              {context.regressedFingerprints.length} regressed fingerprint{context.regressedFingerprints.length === 1 ? '' : 's'}{' '}
              since this release
            </p>
          </div>

          {comparison ? (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {metricRow('Root incidents', comparison.rootIncidents, (v) => String(v))}
              {metricRow('Affected users', comparison.affectedUsers, (v) => String(v))}
              {metricRow('Journey success', comparison.journeySuccessRate, (v) => `${Math.round(v * 100)}%`)}
              {metricRow('DB p95', comparison.dbP95Ms, (v) => `${Math.round(v)}ms`)}
              {metricRow('Invariant breaches', comparison.invariantBreaches, (v) => String(v))}
              <div className="rounded-fw-md bg-surface-sunken px-3 py-2">
                <p className="text-caption uppercase tracking-widest text-warm-500">New SQLSTATEs</p>
                <p className="mt-0.5 font-fw-mono text-sm text-warm-900">
                  {comparison.newSqlstates === null ? (
                    <UnknownInline label="DB source blind this window" />
                  ) : comparison.newSqlstates.length === 0 ? (
                    'none'
                  ) : (
                    comparison.newSqlstates.join(', ')
                  )}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-caption text-warm-500">
              No baseline release to compare against yet — this is the first tracked deploy.
            </p>
          )}

        </>
      )}
    </Surface>
  );
}
