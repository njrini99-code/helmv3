import { StatusPill, Surface, type FwStatusTone } from '@/components/fairway';
import { LocalTime } from '../../_components/LocalTime';
import { FieldCopy } from '../_components/FieldCopy';
// Extracted from `[fingerprint]/page.tsx` 2026-08-27.
//
// These were exported from page.tsx purely so the sibling __tests__ could
// import them. `admin-gate-coverage.test.ts` correctly failed that: EVERY

import type { ShipStatus } from '@/lib/reliability/resolution';
import type { AdminFetchResult } from '@/lib/admin/fetch-result';
import type { ArchivedResolution, ResolutionArchiveSnapshot } from '@/lib/admin/data/resolutions';
import { AlertTriangle } from 'lucide-react';
const RESOLUTION_SOURCE_TONE: Record<'auto' | 'manual', FwStatusTone> = {
  auto: 'info',
  manual: 'accent',
};
const RESOLUTION_SOURCE_LABEL: Record<'auto' | 'manual', string> = {
  auto: 'auto-resolved (cron)',
  manual: 'resolved by a human',
};
const SHIP_STATUS_TONE: Record<ShipStatus, FwStatusTone> = {
  shipped: 'success',
  pending: 'warning',
  unknown: 'neutral',
};
const SHIP_STATUS_LABEL: Record<ShipStatus, string> = {
  shipped: 'shipped to production',
  pending: 'fix not yet shipped',
  unknown: 'ship status unknown',
};
// export from a page.tsx under src/app/admin must reach requireSuperAdmin(),
// because a page export is reachable. Exporting a helper for testability is
// exactly the hole that rule exists to close. Moving them here keeps the
// tests and satisfies the gate — _components/ is outside its scope.




/**
 * Which resolution row (if any) applies to this fingerprint, and whether the
 * read itself failed — pulled out of `Body` as a pure function so it is
 * directly unit-testable. `Body` is an async Server Component embedded via
 * `<Suspense>`, which this test harness cannot resolve client-side (React 19
 * only supports async components on the server); this function carries none
 * of that and needs no rendering to verify.
 *
 * `archive === null` is the deliberate "we chose not to look" case (a
 * synthetic `row:<id>` key — see the call site) and is NOT a failure: it must
 * not render the "resolution status unavailable" notice.
 */
export function resolveArchivedResolution(
  fingerprint: string,
  archive: AdminFetchResult<ResolutionArchiveSnapshot> | null,
): { resolution: ArchivedResolution | null; resolutionReadFailed: boolean } {
  if (archive === null) return { resolution: null, resolutionReadFailed: false };
  if (archive.status !== 'ok' || !archive.data) {
    return { resolution: null, resolutionReadFailed: true };
  }
  return {
    resolution: archive.data.resolutions.find((r) => r.fingerprint === fingerprint) ?? null,
    resolutionReadFailed: false,
  };
}

/**
 * A fault that was declared fixed and came back. Deliberately louder than the
 * resolution summary below it — "we already fixed this and it broke again"
 * is a different and more urgent fact than plain "this is broken", and an
 * operator scanning the page must not be able to miss it.
 */
export function RegressionBanner({ resolution }: { resolution: ArchivedResolution }) {
  return (
    <Surface padding="sm" className="border-2 border-fw-danger bg-fw-danger-bg">
      <div className="flex flex-wrap items-start gap-3">
        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-fw-danger-ink" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-eyebrow uppercase tracking-widest text-fw-danger-ink">Regressed</p>
          <p className="mt-1 text-sm font-medium text-warm-900">
            This fault was marked fixed and came back
            {resolution.reopenedAt ? (
              <>
                {' '}
                (<LocalTime iso={resolution.reopenedAt} variant="datetime" />)
              </>
            ) : null}
            .
          </p>
          <p className="mt-1 text-caption text-warm-700">
            Reopened{' '}
            <span className="font-fw-mono tabular-nums">{resolution.reopenedCount}</span>{' '}
            time{resolution.reopenedCount === 1 ? '' : 's'}. Previously resolved{' '}
            <LocalTime iso={resolution.resolvedAt} variant="datetime" /> (
            {RESOLUTION_SOURCE_LABEL[resolution.resolutionSource]}).
          </p>
        </div>
      </div>
    </Surface>
  );
}

/** The resolution lifecycle, for an operator who lands on this page not
 *  knowing whether this fingerprint is still open. */
export function ResolutionSummary({ resolution }: { resolution: ArchivedResolution }) {
  return (
    <Surface padding="sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warm-200 pb-2">
        <h2 className="text-eyebrow uppercase text-warm-500">Resolution</h2>
        <StatusPill tone={RESOLUTION_SOURCE_TONE[resolution.resolutionSource]} dot size="sm">
          {RESOLUTION_SOURCE_LABEL[resolution.resolutionSource]}
        </StatusPill>
      </div>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-caption uppercase tracking-widest text-warm-500">Resolved</dt>
          <dd className="font-fw-mono text-sm text-warm-900">
            <LocalTime iso={resolution.resolvedAt} variant="datetime" />
          </dd>
        </div>
        <div>
          <dt className="text-caption uppercase tracking-widest text-warm-500">Ship status</dt>
          <dd>
            <StatusPill tone={SHIP_STATUS_TONE[resolution.shipStatus]} dot size="sm">
              {SHIP_STATUS_LABEL[resolution.shipStatus]}
            </StatusPill>
          </dd>
        </div>
        <div>
          <dt className="text-caption uppercase tracking-widest text-warm-500">Pull request</dt>
          <dd className="text-sm">
            {resolution.prUrl ? (
              <a href={resolution.prUrl} target="_blank" rel="noreferrer" className="text-accent-700 underline">
                {resolution.prNumber ? `PR #${resolution.prNumber}` : 'open PR'}
              </a>
            ) : resolution.prNumber ? (
              <span className="font-fw-mono text-warm-900">PR #{resolution.prNumber}</span>
            ) : (
              <span className="text-warm-500">no PR linked</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-caption uppercase tracking-widest text-warm-500">Fixed in</dt>
          <dd>
            <FieldCopy label="fixed in sha" value={resolution.fixedInSha} className="w-auto" />
          </dd>
        </div>
      </dl>
      {resolution.note ? (
        <p className="mt-3 break-words text-caption text-warm-600 [overflow-wrap:anywhere]">{resolution.note}</p>
      ) : null}
    </Surface>
  );
}

/** Mirrors TriageQueue's detailLine() so the same source/feature/action
 *  context an operator sees on the list view is also visible per-event
 *  here, plus the resolveActionFilePath() "where it was" line — previously
 *  computed only for the hidden copy-for-Claude report (incident-report.ts's
 *  own comment calls that "the single highest-value line"), now surfaced
 *  on-screen too. */
