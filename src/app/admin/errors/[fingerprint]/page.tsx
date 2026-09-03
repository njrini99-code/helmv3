import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchFingerprintDetail } from '@/lib/admin/data/errors';
import { InlineNotice, StatStrip, StatusPill, Surface, type FwStatusTone } from '@/components/fairway';
import type { TriageSeverity } from '@/lib/admin/data/triage';
import { extractActionName, featureLabelFor, resolveActionFilePath } from '@/lib/admin/incident-report';
import { PanelBoundary } from '../../_components/PanelBoundary';
import { PanelPageSkeleton } from '../../_components/PanelSkeletons';
import { PanelNoData } from '../../_components/PanelStates';
import { CopyReportButton } from '../../_components/CopyReportButton';
import { ResolveErrorButton } from '../../_components/ResolveErrorButton';
import { SportBadge, type BridgeSport } from '../../_components/SportBadge';
import { LocalTime } from '../../_components/LocalTime';
import { ForensicsHeader } from '../_components/ForensicsHeader';
import { TrendStrip } from '../_components/TrendStrip';
import { RcaPanel } from '../_components/RcaPanel';
import { LifecycleSpine, LifecycleWhy } from '../_components/LifecycleSpine';
import {
  DeploymentProofCard,
  EvidenceWall,
  RepairCard,
  RootCauseCard,
} from '../_components/EvidenceWall';
import {
  EvidenceCoverageStrip,
  ProofDots,
  ProofGapList,
  ProofLegend,
} from '../../_components/ProofDots';
import { fetchIncidentById, type IncidentBoard } from '@/lib/admin/incidents/fetch';
import type { UnifiedIncident } from '@/lib/admin/incidents/types';
import { RcaAnalysisView } from '../_components/RcaAnalysisView';
import { FieldCopy } from '../_components/FieldCopy';
import { fetchResolutionArchive } from '@/lib/admin/data/resolutions';
import { resolveArchivedResolution, RegressionBanner, ResolutionSummary } from '../_components/ResolutionPanels';
import { buildBoardAliasGroups, buildIncidentGenome } from '@/lib/admin/incidents/genome';
import { fetchCurrentReleaseWatch } from '@/lib/admin/incidents/release-watch';
import { ReleaseRelationshipLabel } from '@/components/admin/premium';
import { IncidentGenomePanel } from '../_components/IncidentGenomePanel';
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

  /**
   * THE STORY, above the forensics.
   *
   * Everything below this section is evidence an operator reads when they
   * already know what they are looking at: raw occurrences, stack traces,
   * bracketing deploys. This section is what they are looking at — first
   * seen, which sources saw it, what caused it, what is being done, whether
   * it shipped, and what remains unproven. Reaching that story previously
   * meant joining four surfaces by hand.
   *
   * `incident` is null when the fault falls outside even the detail page's
   * wider 7-day window. That is a real state, not an error: the forensics
   * below still render, and claiming a lifecycle we cannot compute would be
   * worse than showing none.
   */
  async function IncidentCommand({ incident, board }: { incident: UnifiedIncident; board: IncidentBoard }) {
    const presentation = board.presentations[incident.id];
    const aliasGroups = buildBoardAliasGroups(board.incidents);
    const genome = buildIncidentGenome(incident, board.incidents, aliasGroups);
    // A second, independent read from the same board this render already
    // has — see release-watch.ts's own header for why this is not a second
    // authority for deploy history (it reuses release-ledger.ts, never
    // re-derives it). Fails soft to `unavailableReason` on the panel; never
    // takes the rest of the page down.
    const releaseWatch = await fetchCurrentReleaseWatch(board).catch(() => null);
    const releaseRelationship = releaseWatch?.relationships.get(incident.id) ?? null;

    return (
      <section aria-label="Incident command" className="space-y-3">
        {presentation ? (
          <Surface padding="sm" className="min-w-0">
            {/* Not the page's <h1> — that stays the raw fingerprint further
                down, the one stable identifier every deep link/RCA row/repair
                artefact actually keys on. This is the human-readable Phase 0
                title (present.ts), prominent but a step below it in the
                heading hierarchy. */}
            <h2 className="break-words text-h3 font-medium text-warm-900 [overflow-wrap:anywhere]">{presentation.title}</h2>
            {presentation.operationContext ? (
              <p className="mt-0.5 text-body-sm text-warm-600">{presentation.operationContext}</p>
            ) : null}
            <p className="mt-1 break-words font-fw-mono text-caption text-warm-500 [overflow-wrap:anywhere]">
              {presentation.technicalSignature}
            </p>
            <div className="mt-2">
              <ReleaseRelationshipLabel
                verdict={
                  releaseRelationship ?? {
                    relationship: 'unknown',
                    confidence: 0,
                    evidenceFor: [],
                    evidenceAgainst: [releaseWatch === null ? 'Release watch could not be computed.' : 'No release context for this incident.'],
                  }
                }
                showConfidence
              />
            </div>
          </Surface>
        ) : null}

        <Surface padding="sm" className="min-w-0">
          <LifecycleSpine incident={incident} />
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-warm-200 pt-3">
            <ProofDots proof={incident.proof} size="md" />
            <ProofLegend />
          </div>
          <div className="mt-2">
            <ProofGapList gaps={incident.proofGaps} />
          </div>
        </Surface>

        <Surface padding="sm" className="min-w-0">
          <LifecycleWhy verdict={incident.lifecycle} />
        </Surface>

        <IncidentGenomePanel genome={genome} />

        <EvidenceWall sources={incident.sources} />

        <div className="grid gap-3 lg:grid-cols-2">
          <RootCauseCard analysis={incident.analysis} />
          <RepairCard repair={incident.repair} />
        </div>

        <DeploymentProofCard proof={incident.deployProof} resolution={incident.resolution} />

        <Surface padding="sm" className="min-w-0">
          <h2 className="text-eyebrow uppercase text-warm-500">Evidence coverage</h2>
          <div className="mt-2">
            <EvidenceCoverageStrip coverage={incident.evidenceCoverage} />
          </div>
        </Surface>
      </section>
    );
  }

  async function Body() {
    // The unified incident is fetched ALONGSIDE the forensics, not instead of
    // them: this page is the one surface where the raw occurrences still
    // matter, and a lifecycle read that fails must not take them down with it.
    const [{ events, report, summary, forensics, trend, storedRca }, unified] = await Promise.all([
      fetchFingerprintDetail(rawFingerprint),
      fetchIncidentById(fingerprint).catch(() => null),
    ]);

    if (events.length === 0 || !forensics) {
      // A reliability-sourced fingerprint (`rel:<signature>`, from the nightly
      // triage of Sentry/Vercel signals) has a stored analysis but no
      // `admin_events` error rows — so there are no occurrences to render, but
      // there IS a root-cause analysis, and it must not vanish behind a blank
      // "no events" state (the exact bug fixed 2026-08-28). Show it.
      if (storedRca) {
        return (
          <div className="space-y-4">
            <InlineNotice tone="info">
              This is a correlated reliability signal (Sentry / Vercel / Supabase), not an
              application error logged directly. Its occurrences live on the{' '}
              <Link href="/admin/reliability" className="underline">
                Reliability tab
              </Link>
              ; what follows is the root-cause analysis the nightly triage wrote for it.
            </InlineNotice>
            {unified ? <IncidentCommand incident={unified.incident} board={unified.board} /> : null}
            <Surface padding="sm" className="min-w-0">
              <h2 className="border-b border-warm-200 pb-2 text-eyebrow uppercase text-warm-500">
                Root-cause analysis
              </h2>
              <div className="mt-3">
                <RcaAnalysisView analysis={storedRca} />
              </div>
            </Surface>
          </div>
        );
      }
      return (
        <PanelNoData
          label="No events for this fingerprint"
          description="Either every event has been resolved or this fingerprint no longer matches any admin_events row."
        />
      );
    }

    // Resolution lifecycle: has this fingerprint ever been marked fixed, and
    // has it come back? Synthetic `row:<id>` keys (pre-fingerprinting legacy
    // rows — see fetchFingerprintDetail's own scoped() branch) never carry a
    // resolution row, since admin_auto_resolve_error_fingerprint is only ever
    // called with a real `fingerprint` column value — skip the read outright
    // rather than querying a key that can never match.
    //
    // fetchResolutionArchive() reads the whole table (it is the Archive
    // panel's data source, with no per-fingerprint variant — see that
    // module's doc comment) — one extra bounded read on an admin page, traded
    // for reusing its already-computed shipStatus/regressed rather than
    // re-deriving them here.
    const isRowKey = fingerprint.startsWith('row:');
    const archive = isRowKey ? null : await fetchResolutionArchive();
    // A FAILED read is not evidence this fingerprint was never resolved —
    // collapsing the two would be exactly the error→[] shape the engineering
    // OS forbids. Render the failure honestly instead of silently falling
    // through to "never resolved". See resolveArchivedResolution's own doc
    // comment for why this is a separate, directly-testable pure function.
    const { resolution, resolutionReadFailed } = resolveArchivedResolution(fingerprint, archive);

    return (
      <div className="space-y-3">
        {resolutionReadFailed ? (
          <Surface padding="sm" className="border border-fw-warning/30 bg-fw-warning/5">
            <p className="text-body-sm text-warm-800">
              Resolution status unavailable —{' '}
              <span className="font-fw-mono text-caption">{archive?.error ?? 'unknown error'}</span>. This does not
              mean the fault was never resolved; it means the resolution record could not be read.
            </p>
          </Surface>
        ) : null}

        {/* Regression, above everything else: a fault that was already
            declared fixed and came back is a more urgent fact than "this is
            broken", and must not be missable. */}
        {resolution?.regressed ? <RegressionBanner resolution={resolution} /> : null}

        {resolution ? <ResolutionSummary resolution={resolution} /> : null}

        {unified ? <IncidentCommand incident={unified.incident} board={unified.board} /> : null}

        {/* Suspect deploy, elevated: the first thing an operator should read —
            "what shipped right before this started" — not buried in the
            bracketing-deploy list further down. */}
        {forensics.suspectDeploy ? (
          <Surface padding="sm" className="border border-fw-warning/30 bg-fw-warning/5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-warm-800">
                First seen after deploy{' '}
                <span className="font-fw-mono">
                  {(forensics.suspectDeploy.sha ?? 'unknown-sha').slice(0, 7)}
                </span>{' '}
                (<LocalTime iso={forensics.suspectDeploy.time} variant="datetime" />)
              </p>
              <FieldCopy label="suspect deploy sha" value={forensics.suspectDeploy.sha} className="w-auto" />
            </div>
          </Surface>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-warm-600">
            {summary.truncated
              ? `${summary.totalCount} occurrences · showing the ${events.length} most recent`
              : `${summary.totalCount} occurrence${summary.totalCount === 1 ? '' : 's'}`}
            {' · affected users link to Users & Teams'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <CopyReportButton report={report} label="Copy full report" size="md" />
            {/* The write this surface never had — see ResolveErrorButton. */}
            <ResolveErrorButton fingerprint={fingerprint} />
          </div>
        </div>

        <ForensicsHeader forensics={forensics} />

        {/* Rollup the data layer already computed but previously discarded —
            an operator had to Copy the report and paste it elsewhere to see
            first-seen, unique users, or which deploys bracket the incident. */}
        <Surface padding="sm">
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
                {forensics.hasUnknownAffectedUsers
                  ? 'unknown — no identity captured'
                  : summary.truncated
                    ? 'lower bound'
                    : 'distinct'}
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

        <Surface padding="sm">
          <h2 className="text-eyebrow uppercase text-warm-500">7-day trend</h2>
          <TrendStrip
            buckets={trend.buckets}
            truncated={trend.truncated}
            unavailable={trend.unavailable}
            className="mt-2"
          />
        </Surface>

        <RcaPanel fingerprint={fingerprint} initialAnalysis={forensics.storedRca} />

        <ul className="space-y-3">
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
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link href="/admin/errors" className="text-xs text-warm-500 underline">← Errors</Link>
      <h1 className="break-words font-fw-mono text-lg text-warm-900 [overflow-wrap:anywhere]">fingerprint {fingerprint}</h1>
      <PanelBoundary title="Fingerprint detail" skeleton={<PanelPageSkeleton stats={3} rows={4} />}>
        <Body />
      </PanelBoundary>
    </div>
  );
}
