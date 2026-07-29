import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchFingerprintDetail } from '@/lib/admin/data/errors';
import { StatStrip, StatusPill, Surface, type FwStatusTone } from '@/components/fairway';
import type { TriageSeverity } from '@/lib/admin/data/triage';
import { extractActionName, featureLabelFor, resolveActionFilePath } from '@/lib/admin/incident-report';
import { PanelBoundary } from '../../_components/PanelBoundary';
import { PanelNoData } from '../../_components/PanelStates';
import { CopyReportButton } from '../../_components/CopyReportButton';
import { SportBadge, type BridgeSport } from '../../_components/SportBadge';
import { LocalTime } from '../../_components/LocalTime';

export const dynamic = 'force-dynamic';

const SEVERITY_TONE: Record<TriageSeverity, FwStatusTone> = {
  critical: 'danger',
  error: 'danger',
  warning: 'warning',
  info: 'neutral',
};

function severityTone(severity: string): FwStatusTone {
  return SEVERITY_TONE[severity as TriageSeverity] ?? 'neutral';
}

function normalizeSport(raw: string | null | undefined): BridgeSport | null {
  return raw === 'golf' || raw === 'baseball' || raw === 'shared' ? raw : null;
}

/** Mirrors TriageQueue's detailLine() so the same source/feature/action
 *  context an operator sees on the list view is also visible per-event
 *  here, plus the resolveActionFilePath() "where it was" line — previously
 *  computed only for the hidden copy-for-Claude report (incident-report.ts's
 *  own comment calls that "the single highest-value line"), now surfaced
 *  on-screen too. */
function EventDetailLine({
  source,
  feature,
  metadata,
}: {
  source: string | null | undefined;
  feature: string | null | undefined;
  metadata: unknown;
}) {
  const actionName = extractActionName(metadata);
  const featureLabel = featureLabelFor(feature);
  const filePath = resolveActionFilePath(feature, actionName);
  const parts = [
    source ? `source ${source}` : null,
    feature ? `feature ${featureLabel ?? feature} (${feature})` : null,
    actionName ? `action ${actionName}` : null,
  ].filter((p): p is string => p !== null);

  if (parts.length === 0 && !filePath) return null;

  return (
    <div className="mt-1.5 space-y-1">
      {parts.length > 0 ? (
        <p className="break-words font-fw-mono text-caption leading-4 text-warm-500 [overflow-wrap:anywhere]">
          {parts.join(' · ')}
        </p>
      ) : null}
      {filePath ? (
        <p className="break-words font-fw-mono text-caption leading-4 text-accent-700 [overflow-wrap:anywhere]">
          source file: {filePath}
        </p>
      ) : null}
    </div>
  );
}

export default async function FingerprintDetailPage({
  params,
}: {
  params: Promise<{ fingerprint: string }>;
}) {
  await requireSuperAdmin();
  const { fingerprint: rawFingerprint } = await params;
  // Decode for display — the data layer decodes again idempotently.
  const fingerprint = decodeURIComponent(rawFingerprint);

  async function Body() {
    const { events, report, summary } = await fetchFingerprintDetail(rawFingerprint);

    if (events.length === 0) {
      return (
        <PanelNoData
          label="No events for this fingerprint"
          description="Either every event has been resolved or this fingerprint no longer matches any admin_events row."
        />
      );
    }

    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-warm-600">
            {summary.truncated
              ? `${summary.totalCount} occurrences · showing the ${events.length} most recent`
              : `${summary.totalCount} occurrence${summary.totalCount === 1 ? '' : 's'}`}
            {' · affected users link to Users & Teams'}
          </p>
          <CopyReportButton report={report} label="Copy full report" size="md" />
        </div>

        {/* Rollup the data layer already computed but previously discarded —
            an operator had to Copy the report and paste it elsewhere to see
            first-seen, unique users, or which deploys bracket the incident. */}
        <Surface padding="sm" className="mt-3">
          <StatStrip count={4} mdColumns={4} edgeBleedClassName="-mx-4 px-4" ariaLabel="Incident rollup">
            <div className="rounded-fw-md bg-surface-sunken px-3 py-2">
              <p className="text-caption uppercase tracking-widest text-warm-500">Occurrences</p>
              <p className="font-fw-mono text-xl font-semibold tabular-nums text-warm-900">{summary.totalCount}</p>
              <p className="text-caption text-warm-500">
                {summary.truncated ? `${events.length} inspected` : 'all inspected'}
              </p>
            </div>
            <div className="rounded-fw-md bg-surface-sunken px-3 py-2">
              <p className="text-caption uppercase tracking-widest text-warm-500">Affected users</p>
              <p className="font-fw-mono text-xl font-semibold tabular-nums text-warm-900">
                {summary.affectedUserCount}
                {summary.truncated ? '+' : ''}
              </p>
              <p className="text-caption text-warm-500">
                {summary.truncated ? 'lower bound' : 'distinct'}
              </p>
            </div>
            <div className="rounded-fw-md bg-surface-sunken px-3 py-2">
              <p className="text-caption uppercase tracking-widest text-warm-500">First seen</p>
              <p className="font-fw-mono text-sm font-semibold tabular-nums text-warm-900">
                {summary.firstSeen ? <LocalTime iso={summary.firstSeen} variant="datetime" /> : '—'}
              </p>
              <p className="text-caption text-warm-500">exact</p>
            </div>
            <div className="rounded-fw-md bg-surface-sunken px-3 py-2">
              <p className="text-caption uppercase tracking-widest text-warm-500">Last seen</p>
              <p className="font-fw-mono text-sm font-semibold tabular-nums text-warm-900">
                {summary.lastSeen ? <LocalTime iso={summary.lastSeen} variant="datetime" /> : '—'}
              </p>
              <p className="text-caption text-warm-500">
                {summary.nearbyDeploys.length > 0
                  ? `${summary.nearbyDeploys.length} deploy${summary.nearbyDeploys.length === 1 ? '' : 's'} nearby`
                  : 'no nearby deploys'}
              </p>
            </div>
          </StatStrip>
          {summary.nearbyDeploys.length > 0 ? (
            <p className="mt-2 break-words font-fw-mono text-caption text-warm-500 [overflow-wrap:anywhere]">
              Bracketing deploys:{' '}
              {summary.nearbyDeploys.map((d) => d.sha ?? 'unknown-sha').join(' · ')}
            </p>
          ) : null}
        </Surface>

        <ul className="mt-3 space-y-3">
          {events.map((e) => (
            <Surface as="li" key={e.id} padding="sm" className="min-w-0">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <p className="min-w-0 flex-1 break-words text-sm font-medium text-warm-900 [overflow-wrap:anywhere]">{e.title}</p>
                <div className="flex shrink-0 items-center gap-2">
                  <SportBadge sport={normalizeSport(e.sport)} />
                  <StatusPill tone={severityTone(e.severity)} dot size="sm">
                    {e.severity}
                  </StatusPill>
                </div>
              </div>
              <p className="break-words font-fw-mono text-xs tabular-nums text-warm-500 [overflow-wrap:anywhere]">
                {e.created_at ? <LocalTime iso={e.created_at} variant="datetime" /> : 'unknown time'} · {e.url ?? 'no url'}
              </p>
              <EventDetailLine source={e.source} feature={e.feature} metadata={e.metadata} />
              {e.user_id ? (
                <Link href={`/admin/users/${e.user_id}`} className="text-xs text-accent-700 underline">
                  {e.user_email ?? e.user_id}
                </Link>
              ) : null}
              {e.stack_trace ? (
                // Contained CODE block, never a page-level pan: w-full + min-w-0
                // keep it from ever donating its long-line width to an ancestor,
                // overflow-auto gives it its own horizontal+vertical scroller
                // instead (classic min-w offender otherwise — Mobile Doctrine
                // rule 8 territory even though this isn't literally a table).
                <pre className="mt-2 max-h-48 w-full min-w-0 overflow-auto rounded bg-warm-100 p-2 text-caption">{e.stack_trace}</pre>
              ) : null}
            </Surface>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <Link href="/admin/errors" className="text-xs text-warm-500 underline">← Errors</Link>
      <h1 className="break-words font-fw-mono text-lg text-warm-900 [overflow-wrap:anywhere]">fingerprint {fingerprint}</h1>
      <PanelBoundary title="Fingerprint detail">
        <Body />
      </PanelBoundary>
    </div>
  );
}
