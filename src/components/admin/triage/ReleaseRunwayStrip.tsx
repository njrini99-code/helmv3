/**
 * Bridge Premium Phase 3 — Release Runway for `/admin/deploys`.
 *
 * `to be replaced by premium/<name>` — no shared `src/components/admin/
 * premium/*` release-timeline primitive existed on `agent/bridge-premium-p1`
 * as of this PR (branch not yet pushed).
 */
import { StatusPill, type FwStatusTone } from '@/components/fairway';
import type { ReleaseRunwayRow, ReleaseRunwayView } from '@/lib/admin/triage/release-runway';
import { RELEASE_WATCH_LABEL, type ReleaseWatchState } from '@/lib/admin/incidents/release-context';
import { LocalTime } from '@/app/admin/_components/LocalTime';

const WATCH_TONE: Record<ReleaseWatchState, FwStatusTone> = {
  observing: 'info',
  'clean-so-far': 'success',
  degraded: 'warning',
  'regression-detected': 'danger',
  'rollback-recommended': 'danger',
  'proven-healthy': 'success',
  unknown: 'neutral',
};

function RunwayRow({ row }: { row: ReleaseRunwayRow }) {
  return (
    <div className={`rounded-fw-md border p-3 ${row.isLive ? 'border-fw-accent-ink bg-surface' : 'border-warm-200 bg-surface'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-fw-mono text-caption text-warm-700" title={row.commitSha ?? undefined}>
            {row.commitSha ? row.commitSha.slice(0, 8) : 'unknown sha'}
          </span>
          {row.isLive ? (
            <StatusPill tone="accent" size="sm">
              live
            </StatusPill>
          ) : null}
        </div>
        <StatusPill tone={WATCH_TONE[row.watchState]} dot size="sm">
          {RELEASE_WATCH_LABEL[row.watchState]}
        </StatusPill>
      </div>

      <p className="mt-1 truncate text-caption text-warm-600" title={row.commitMessage ?? undefined}>
        {row.commitMessage ?? 'no commit message recorded'}
      </p>

      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-caption">
        <div className="flex items-baseline justify-between gap-1">
          <dt className="text-warm-500">App SHA</dt>
          <dd className="truncate font-fw-mono text-warm-700">
            {row.runtimeIdentity.appSha ? row.runtimeIdentity.appSha.slice(0, 8) : 'unknown'}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-1">
          <dt className="text-warm-500">DB migration head</dt>
          <dd className="truncate font-fw-mono text-warm-700">
            {row.runtimeIdentity.dbMigrationHeadState === 'known' && row.runtimeIdentity.dbMigrationHead
              ? row.runtimeIdentity.dbMigrationHead.slice(0, 12)
              : 'unknown'}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-1">
          <dt className="text-warm-500">New fingerprints</dt>
          <dd className="font-fw-mono tabular-nums text-warm-700">{row.newFingerprintsSince}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-1">
          <dt className="text-warm-500">Resolved &amp; quiet</dt>
          <dd className="font-fw-mono tabular-nums text-warm-700">{row.resolvedAndQuietSince}</dd>
        </div>
      </dl>

      <p className="mt-1.5 text-caption text-warm-400">
        <LocalTime iso={new Date(row.createdAt).toISOString()} variant="datetime" />
        {row.gatheringSignal ? ' · still gathering signal' : ''}
      </p>
    </div>
  );
}

export function ReleaseRunwayStrip({ view }: { view: ReleaseRunwayView }) {
  if (view.rows.length === 0) {
    return <p className="text-sm text-warm-500">No deploys recorded yet.</p>;
  }

  return (
    <div>
      {view.deploySource === 'marker-fallback' ? (
        <p className="mb-3 text-caption text-fw-warning-ink">
          Showing recorded deploy markers — the Vercel API is not configured, so every release&rsquo;s source
          coverage reads blind and none can be called proven healthy from silence alone.
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {view.rows.map((row) => (
          <RunwayRow key={row.uid} row={row} />
        ))}
      </div>
      <p className="mt-3 text-caption text-warm-400">
        Rollback intelligence is never shown as a recommendation here — no evidence source in this codebase scores
        that decision yet, so a regression reads as REGRESSION DETECTED and stops there. Never execute a rollback
        from a visual recommendation.
      </p>
    </div>
  );
}
