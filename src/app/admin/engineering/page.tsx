import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchDecisionInbox, type EngineeringDecisionItem } from '@/lib/admin/engineering/decision-inbox';
import { fetchAgentRuns } from '@/lib/admin/agent-runs/fetch';
import { fetchMutationGateCharter, fetchContractsCharter, fetchJanitorCharter } from '@/lib/admin/engineering/charter';
import { fetchBlastRadius } from '@/lib/admin/engineering/blast-radius';
import { fetchRepairQuality, type RepairStayedFixed } from '@/lib/admin/engineering/work-log';
import { Eyebrow, InlineNotice, StatusPill, Surface, Skeleton, SkeletonList, type FwStatusTone } from '@/components/fairway';
import { DatelineRule } from '@/components/ui/card';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelNoData, PanelAllClear } from '../_components/PanelStates';
import { AutoRefresh } from '../_components/AutoRefresh';
import { LocalTime } from '../_components/LocalTime';

export const dynamic = 'force-dynamic';

const SECTION_SKELETON = (
  <div className="space-y-3">
    <Skeleton className="h-4 w-40" />
    <SkeletonList rows={4} />
  </div>
);

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b border-primary-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
      {children}
    </h2>
  );
}

function KeyPanelRule() {
  return <DatelineRule className="mb-3" />;
}

// ── Decision Inbox ──────────────────────────────────────────────────────

function DecisionItemRow({ item }: { item: EngineeringDecisionItem }) {
  return (
    <li className="rounded-xl border border-warm-200/70 bg-surface px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusPill tone={item.tone} size="sm">{item.state}</StatusPill>
        {item.ageMs != null ? (
          <span className="text-xs text-warm-500">{Math.floor(item.ageMs / 3_600_000)}h old</span>
        ) : null}
      </div>
      <p className="mt-1.5 text-sm font-medium text-text-primary">{item.headline}</p>
      <p className="mt-0.5 text-xs text-warm-500">{item.why}</p>
      <p className="mt-1.5 font-fw-mono text-caption text-text-tertiary">{item.evidenceCommand}</p>
    </li>
  );
}

async function DecisionInboxBody() {
  const result = await fetchDecisionInbox();

  if (result.status === 'unconfigured') {
    return (
      <PanelNoData
        label="No decision sources readable"
        description="Neither supabase/migrations/HELD.md nor docs/generated/janitor-findings.json could be read."
      />
    );
  }
  if (result.status === 'error' || !result.data) {
    return <InlineNotice tone="danger" title="Decision Inbox read failed">{result.error}</InlineNotice>;
  }

  const { items, janitorFindingsRead } = result.data;
  return (
    <div className="space-y-3">
      {!janitorFindingsRead ? (
        <InlineNotice tone="info" title="Janitor findings not generated yet">
          Held-migration decisions still show below. Run <span className="font-fw-mono">npm run janitor</span> to
          surface entropy findings here too.
        </InlineNotice>
      ) : null}
      {items.length === 0 ? (
        <PanelAllClear label="No decisions waiting on you" checkedAt={result.fetchedAt ?? new Date().toISOString()} />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <DecisionItemRow key={item.key} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Agent Flight Recorder ───────────────────────────────────────────────

const RUN_STATUS_TONE: Record<string, FwStatusTone> = {
  started: 'info',
  pending: 'info',
  success: 'success',
  failure: 'danger',
  rejected: 'warning',
};

async function AgentFlightRecorderBody() {
  const result = await fetchAgentRuns({ limit: 25 });

  if (result.status === 'unconfigured') {
    return (
      <PanelNoData
        label="Agent Flight Recorder not yet live"
        description="supabase/migrations/20260903150000_helm_debug_agent_runs.sql is HELD — awaiting owner apply. See HELD.md."
      />
    );
  }
  if (result.status === 'error' || !result.data) {
    return <InlineNotice tone="danger" title="Agent Flight Recorder read failed">{result.error}</InlineNotice>;
  }
  if (result.data.length === 0) {
    return <PanelNoData label="No agent runs recorded yet" description="Runs appear here once the self-heal loop writes through record.ts." />;
  }

  return (
    <ul className="space-y-2">
      {result.data.map((run) => (
        <li key={run.runId} className="rounded-xl border border-warm-200/70 bg-surface px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <StatusPill tone={RUN_STATUS_TONE[run.status] ?? 'neutral'} size="sm">{run.status}</StatusPill>
              <span className="font-fw-mono text-xs text-text-tertiary">{run.workflow}</span>
            </div>
            <LocalTime iso={run.startedAt} variant="datetime" />
          </div>
          {run.charter ? <p className="mt-1.5 text-sm text-text-primary">{run.charter}</p> : null}
          <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-warm-500">
            {run.incidentFingerprint ? <span>incident {run.incidentFingerprint}</span> : null}
            {run.verifierVerdict ? <span>verifier: {run.verifierVerdict}</span> : null}
            {run.productionOutcome ? <span>production: {run.productionOutcome}</span> : null}
            {run.confidence != null ? <span>confidence {Math.round(run.confidence * 100)}%</span> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Charter & verifier visibility ───────────────────────────────────────

async function CharterBody() {
  const [mutationGate, contracts, janitor] = await Promise.all([
    fetchMutationGateCharter(),
    fetchContractsCharter(),
    fetchJanitorCharter(),
  ]);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-xl border border-warm-200/70 bg-surface p-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-warm-500">Mutation gate</p>
        {mutationGate.status === 'ok' && mutationGate.data ? (
          <div className="mt-2 space-y-1 text-sm">
            <p>
              Floor <span className="font-fw-mono">{mutationGate.data.floor}%</span> over{' '}
              <span className="font-fw-mono text-xs">{mutationGate.data.scope}</span>
            </p>
            {mutationGate.data.provisional ? (
              <StatusPill tone="warning" size="sm" dot={false}>PROVISIONAL floor</StatusPill>
            ) : null}
            <p className="font-fw-mono text-caption text-text-tertiary">{mutationGate.data.evidenceCommand}</p>
          </div>
        ) : (
          <p className="mt-2 text-xs text-warm-500">{mutationGate.error ?? 'Not configured.'}</p>
        )}
      </div>

      <div className="rounded-xl border border-warm-200/70 bg-surface p-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-warm-500">Resolved contracts</p>
        {contracts.status === 'ok' && contracts.data && contracts.data.length > 0 ? (
          <ul className="mt-2 space-y-1.5 text-sm">
            {contracts.data.map((c) => (
              <li key={c.featureId}>
                <span className="font-medium">{c.featureId}</span>{' '}
                <span className="text-xs text-warm-500">
                  {c.claimCount} claims{c.supersededCount > 0 ? `, ${c.supersededCount} superseded` : ''} · {c.resolvedVia}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-warm-500">{contracts.error ?? 'No resolved contracts committed yet.'}</p>
        )}
      </div>

      <div className="rounded-xl border border-warm-200/70 bg-surface p-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-warm-500">Janitor findings</p>
        {janitor.status === 'ok' && janitor.data ? (
          <div className="mt-2 space-y-1.5 text-sm">
            {janitor.data.topFindings.slice(0, 5).map((f) => (
              <p key={f.id} className="text-xs">
                <span className="font-fw-mono text-caption text-text-tertiary">{f.confidence}</span> {f.scope}
              </p>
            ))}
            {janitor.data.topFindings.length === 0 ? <p className="text-xs text-warm-500">No open findings.</p> : null}
          </div>
        ) : (
          <p className="mt-2 text-xs text-warm-500">
            {janitor.error ?? 'Not generated. Run '}
            <span className="font-fw-mono">npm run janitor</span> to produce
            <span className="font-fw-mono"> docs/generated/janitor-findings.json</span>.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Blast radius + causal confidence ────────────────────────────────────

async function BlastRadiusBody({ entityId }: { entityId: string }) {
  const result = await fetchBlastRadius(entityId);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-warm-500">
          Blast radius — <span className="font-fw-mono normal-case">{entityId}</span>
        </p>
        {result.status === 'unconfigured' ? (
          <PanelNoData
            label="Helm World Model unreadable"
            description="Run `npm run knowledge:world-model` to regenerate docs/generated/WORLD_MODEL.json."
          />
        ) : result.status === 'error' || !result.data ? (
          <InlineNotice tone="danger" title="Blast radius read failed">{result.error}</InlineNotice>
        ) : !result.data.entityFound ? (
          <PanelNoData label="Entity not in the World Model" description={`No edges reference "${entityId}".`} />
        ) : (
          <div className="mt-2 space-y-1.5">
            {result.data.truncated ? (
              <InlineNotice tone="info" title="Subgraph truncated">
                Capped at the first matches — never the whole graph.
              </InlineNotice>
            ) : null}
            <ul className="space-y-1 text-sm">
              {result.data.nodes.map((node) => (
                <li key={`${node.id}-${node.depth}`} className="flex items-center gap-2">
                  <StatusPill tone={node.weak ? 'neutral' : 'accent'} size="sm" dot={false}>
                    depth {node.depth} · {node.direction}
                    {node.weak ? ' (weak)' : ''}
                  </StatusPill>
                  <span className="font-fw-mono text-xs">{node.id}</span>
                </li>
              ))}
              {result.data.nodes.length === 0 ? <li className="text-xs text-warm-500">No neighbors within 2 hops.</li> : null}
            </ul>
          </div>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-warm-500">Causal confidence</p>
        <p className="mt-1 text-xs text-warm-500">
          <code className="font-fw-mono">formatCausalConfidenceLadder</code> renders an evidence ladder
          (&ldquo;LIKELY CAUSED BY RELEASE … confidence NN%, + evidence, − counter-evidence&rdquo;) from
          `release-context.ts`&apos;s existing <code className="font-fw-mono">classifyReleaseRelationship</code>{' '}
          verdict — confidence is never 1.0 from correlation alone. This panel has no live incident selected to
          run it against yet — per-incident causal confidence renders on the incident detail view once that
          selection exists (Phase 1). No fabricated numbers are shown here in the meantime.
        </p>
      </div>
    </div>
  );
}

// ── Repair quality ───────────────────────────────────────────────────────

const STAYED_FIXED_TONE: Record<RepairStayedFixed, FwStatusTone> = {
  improved: 'success',
  worsened: 'danger',
  unchanged: 'neutral',
  unknown: 'neutral',
  'not-yet-deployed': 'info',
};

const STAYED_FIXED_LABEL: Record<RepairStayedFixed, string> = {
  improved: 'Stayed fixed (release improved)',
  worsened: 'Regressed after shipping',
  unchanged: 'Shipped, no measurable change',
  unknown: 'Unknown (no release match)',
  'not-yet-deployed': 'Not yet deployed',
};

async function RepairQualityBody() {
  const result = await fetchRepairQuality();

  if (result.status === 'unconfigured') {
    return (
      <PanelNoData label="GitHub PR feed not configured" description="Set GITHUB_ISSUES_TOKEN with pull-request read access." />
    );
  }
  if (result.status === 'error' || !result.data) {
    return <InlineNotice tone="danger" title="Repair quality read failed">{result.error}</InlineNotice>;
  }
  if (result.data.rows.length === 0) {
    return <PanelNoData label="No repair PRs found" description="No merged PR in the fetched window claims to repair an incident." />;
  }

  return (
    <div className="space-y-2">
      {!result.data.releaseDataAvailable ? (
        <InlineNotice tone="warning" title="Release ledger unavailable">
          Every repair below reads &ldquo;unknown&rdquo; until the release read succeeds again.
        </InlineNotice>
      ) : null}
      <ul className="space-y-2">
        {result.data.rows.map((row) => (
          <li key={row.number} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warm-200/70 bg-surface px-3 py-2">
            <span className="min-w-0 truncate text-sm">
              #{row.number} {row.title}
            </span>
            <StatusPill tone={STAYED_FIXED_TONE[row.stayedFixed]} size="sm" dot={false}>
              {STAYED_FIXED_LABEL[row.stayedFixed]}
            </StatusPill>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function EngineeringOsPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  await requireSuperAdmin();
  const params = await searchParams;
  const entityId = params.entity?.trim() || 'admin_platform';

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={60_000} />
      <div className="space-y-1">
        <Eyebrow>Bridge Premium — Phase 5</Eyebrow>
        <h1 className="text-h2 font-fw-display text-text-primary">Engineering OS</h1>
        <p className="max-w-2xl text-sm text-warm-500">
          What&apos;s waiting on a human decision, what the autonomous loop has been doing, what the charter and
          verifier gates currently require, blast radius and causal confidence over the World Model, and whether
          shipped repairs stayed fixed.
        </p>
      </div>

      <Surface padding="sm">
        <KeyPanelRule />
        <SectionLabel>Decision Inbox — Engineering OS</SectionLabel>
        <p className="mt-1 text-xs text-warm-500">
          HELD migrations and Janitor findings only — the general operator Decision Inbox lives on the Overview page.
        </p>
        <div className="mt-3">
          <PanelBoundary title="Decision Inbox" skeleton={SECTION_SKELETON}>
            <DecisionInboxBody />
          </PanelBoundary>
        </div>
      </Surface>

      <Surface padding="sm">
        <KeyPanelRule />
        <SectionLabel>Agent Flight Recorder</SectionLabel>
        <p className="mt-1 text-xs text-warm-500">Recent autonomous runs — self-heal Diagnose/Repair today.</p>
        <div className="mt-3">
          <PanelBoundary title="Agent Flight Recorder" skeleton={SECTION_SKELETON}>
            <AgentFlightRecorderBody />
          </PanelBoundary>
        </div>
      </Surface>

      <Surface padding="sm">
        <KeyPanelRule />
        <SectionLabel>Charter &amp; verifier visibility</SectionLabel>
        <p className="mt-1 text-xs text-warm-500">Mutation gate config, contracts resolved per feature, Janitor&apos;s ranked findings.</p>
        <div className="mt-3">
          <PanelBoundary title="Charter and verifier visibility" skeleton={SECTION_SKELETON}>
            <CharterBody />
          </PanelBoundary>
        </div>
      </Surface>

      <Surface padding="sm">
        <KeyPanelRule />
        <SectionLabel>Blast radius &amp; causal confidence</SectionLabel>
        <p className="mt-1 text-xs text-warm-500">
          Bounded 1-2 hop map over the Helm World Model.{' '}
          <span className="font-fw-mono">?entity=&lt;feature_id&gt;</span> to change the selection (default{' '}
          <span className="font-fw-mono">admin_platform</span>).
        </p>
        <div className="mt-3">
          <PanelBoundary title="Blast radius and causal confidence" skeleton={SECTION_SKELETON}>
            <BlastRadiusBody entityId={entityId} />
          </PanelBoundary>
        </div>
      </Surface>

      <Surface padding="sm">
        <KeyPanelRule />
        <SectionLabel>Repair quality</SectionLabel>
        <p className="mt-1 text-xs text-warm-500">Repairs vs. the post-deploy proof of the release they shipped in.</p>
        <div className="mt-3">
          <PanelBoundary title="Repair quality" skeleton={SECTION_SKELETON}>
            <RepairQualityBody />
          </PanelBoundary>
        </div>
      </Surface>
    </div>
  );
}
