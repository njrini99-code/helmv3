import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchSloDashboard } from '@/lib/admin/slo/fetch';
import type { FeatureErrorBudget } from '@/lib/reliability/error-budget';
import type { JourneyHealth } from '@/lib/admin/slo/golden-path-health';
import type { FeatureSilence } from '@/lib/admin/slo/silence-detection';
import type { WorkflowFunnel } from '@/lib/admin/slo/trace-funnels';
import { Surface, StatusPill, Badge, InlineNotice, Eyebrow, type FwStatusTone } from '@/components/fairway';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelPageSkeleton } from '../_components/PanelSkeletons';
import { PanelNoData } from '../_components/PanelStates';
import { AutoRefresh } from '../_components/AutoRefresh';
import { LocalTime } from '../_components/LocalTime';

export const dynamic = 'force-dynamic';

/**
 * Helm Bridge — SLO / Error Budget Center (Bridge Control Plane Phase D).
 *
 * Four independent read models, one page: rolling-window error budgets per
 * feature (`error-budget.ts`), golden-path health rolled up from the same
 * budgets (`golden-path-health.ts`), silence detection over
 * `get_feature_health()`'s own heartbeat signal (`silence-detection.ts`),
 * and trace funnels over the flight recorder (`trace-funnels.ts`). None of
 * the four recomputes another's read — see `fetch.ts`'s orchestration
 * comment. A source failing degrades ONLY its own section; the others keep
 * rendering.
 *
 * Executable invariants render on `/admin/health`'s Invariant Lattice
 * (Bridge Premium Phase 3), not duplicated here — this page links to it.
 */

const STATE_TONE: Record<'ok' | 'amber' | 'red' | 'unknown', FwStatusTone> = {
  ok: 'success',
  amber: 'warning',
  red: 'danger',
  unknown: 'neutral',
};

const SILENCE_TONE: Record<FeatureSilence['state'], FwStatusTone> = {
  healthy_quiet: 'success',
  stale: 'warning',
  no_heartbeat_signal: 'neutral',
  unknown: 'neutral',
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
      {children}
    </h2>
  );
}

function ErrorBudgetRow({ row }: { row: FeatureErrorBudget }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-sm text-warm-800">{row.featureId}</p>
        <p className="truncate text-caption text-warm-500">
          {row.state === 'unknown'
            ? `no readable collector window in the last ${row.windowsConsidered}`
            : `${row.observedCount.toLocaleString()}${row.observedIsFloor ? '+' : ''} observed / ${row.allowedCount?.toLocaleString()} allowed over ${row.windowsReadable} window${row.windowsReadable === 1 ? '' : 's'} (${row.tier} tier)`}
        </p>
      </div>
      <StatusPill tone={STATE_TONE[row.state]} dot size="sm" className="shrink-0">
        {row.state === 'unknown' ? 'unknown' : `${Math.round((row.burnRate ?? 0) * 100)}% budget`}
      </StatusPill>
    </div>
  );
}

async function ErrorBudgetBody() {
  const dashboard = await fetchSloDashboard();
  const { errorBudget, errorBudgetError } = dashboard;

  const worst = errorBudget.features.filter((f) => f.state !== 'ok');
  const shown = worst.slice(0, 15);

  return (
    <div>
      {errorBudgetError ? (
        <InlineNotice tone="warning" title="Reliability collector history unavailable">
          {errorBudgetError} — every feature below reads unknown, not a fabricated pass.
        </InlineNotice>
      ) : null}
      <p className="mt-2 text-xs text-warm-500">
        Cumulative observed fingerprint count against the tier&apos;s allowed count, over the
        last {errorBudget.windowsConsidered} collector window{errorBudget.windowsConsidered === 1 ? '' : 's'} (
        {errorBudget.windowsReadable} readable). Not a request-success SLO — the collector carries no traffic
        denominator.
      </p>
      <p className="mt-1 font-fw-mono text-xs tabular-nums text-warm-400">
        generated <LocalTime iso={errorBudget.generatedAt} variant="datetime" />
      </p>
      <div className="mt-3">
        {shown.length === 0 ? (
          <PanelNoData
            label={errorBudget.fullyBlind ? 'No readable collector windows' : 'Every tracked feature is inside its budget'}
            description={
              errorBudget.fullyBlind
                ? 'Every considered window was blind or unreadable — this is not evidence of health.'
                : `${errorBudget.features.length} features checked, none over budget this window.`
            }
          />
        ) : (
          <div className="divide-y divide-warm-100">
            {shown.map((row) => (
              <ErrorBudgetRow key={row.featureId} row={row} />
            ))}
          </div>
        )}
      </div>
      {worst.length > shown.length ? (
        <p className="mt-2 text-xs text-warm-500">+{worst.length - shown.length} more feature(s) not shown</p>
      ) : null}
    </div>
  );
}

function JourneyRow({ journey }: { journey: JourneyHealth }) {
  return (
    <details className="rounded-lg border-b border-warm-100 py-1.5">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-warm-800">{journey.name}</p>
          <p className="truncate text-caption text-warm-500">
            {journey.role} · {journey.criticality} criticality
            {journey.status === 'collecting' ? ' · registry status: collecting' : ''}
          </p>
        </div>
        <StatusPill tone={STATE_TONE[journey.state]} dot size="sm" className="shrink-0">
          {journey.state}
        </StatusPill>
      </summary>
      <ul className="mt-2 space-y-1 pl-2">
        {journey.stages.map((s) => (
          <li key={s.stageId} className="text-xs text-warm-600">
            <span className="font-fw-mono">{s.stageId}</span> ({s.featureId}
            {s.resolvedFeatureKey ? ` → ${s.resolvedFeatureKey}` : ''}) — <StatusPill tone={STATE_TONE[s.state]} size="sm">{s.state}</StatusPill>{' '}
            {s.reason}
          </li>
        ))}
      </ul>
    </details>
  );
}

async function GoldenPathBody() {
  const dashboard = await fetchSloDashboard();
  return (
    <div>
      <p className="text-xs text-warm-500">
        The 8 seeded journeys in <span className="font-fw-mono">memory/journeys/golden-paths.yml</span>, rolled up
        from the same error budget above. A stage whose feature_id has no tracked error-budget signal reads unknown,
        not healthy — see each row&apos;s own reason.
      </p>
      <div className="mt-3 space-y-1">
        {dashboard.goldenPathHealth.journeys.map((j) => (
          <JourneyRow key={j.journeyId} journey={j} />
        ))}
      </div>
    </div>
  );
}

function SilenceRow({ row }: { row: FeatureSilence }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-sm text-warm-800">{row.label}</p>
        <p className="truncate text-caption text-warm-500">{row.reason}</p>
      </div>
      <StatusPill tone={SILENCE_TONE[row.state]} dot size="sm" className="shrink-0">
        {row.state.replace(/_/g, ' ')}
      </StatusPill>
    </div>
  );
}

async function SilenceBody() {
  const dashboard = await fetchSloDashboard();
  const { silence, silenceError } = dashboard;
  const stale = silence.features.filter((f) => f.state === 'stale');
  const other = silence.features.filter((f) => f.state !== 'stale' && f.state !== 'healthy_quiet');

  return (
    <div>
      {silenceError ? (
        <InlineNotice tone="warning" title="Feature health unavailable">
          {silenceError} — every feature below reads unknown, not a fabricated healthy quiet.
        </InlineNotice>
      ) : null}
      <p className="mt-2 text-xs text-warm-500">
        &ldquo;Quiet&rdquo; alone is never a fault — each feature is judged against its OWN heartbeat-staleness
        window (tier default or its <span className="font-fw-mono">heartbeatStaleHoursOverride</span>), so
        <span className="font-fw-mono"> qualifiers</span>&apos; normal weekly rhythm never reads as dead.
      </p>
      {stale.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-fw-warning-ink">
            Stale — possibly-dead emitters ({stale.length})
          </p>
          <div className="mt-1 divide-y divide-warm-100">
            {stale.map((r) => (
              <SilenceRow key={r.featureId} row={r} />
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <PanelNoData label="No stale heartbeats" description="Every tracked feature is within its own allowed quiet window." />
        </div>
      )}
      {other.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-warm-500 underline decoration-dotted">
            {other.length} feature{other.length === 1 ? '' : 's'} unknown / no heartbeat signal
          </summary>
          <div className="mt-1 divide-y divide-warm-100">
            {other.map((r) => (
              <SilenceRow key={r.featureId} row={r} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function FunnelCard({ funnel }: { funnel: WorkflowFunnel }) {
  const total = Object.values(funnel.statusCounts).reduce((a, b) => a + b, 0);
  return (
    <Surface padding="sm">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-fw-mono text-xs text-warm-800">{funnel.workflow}</p>
        {funnel.status === 'error' ? (
          <StatusPill tone="warning" dot size="sm">
            unreadable
          </StatusPill>
        ) : (
          <StatusPill tone={funnel.missingRequiredStepRuns > 0 ? 'warning' : 'success'} dot size="sm">
            {funnel.sampledRuns} run{funnel.sampledRuns === 1 ? '' : 's'}
            {funnel.hitCeiling ? '+' : ''}
          </StatusPill>
        )}
      </div>
      {funnel.status === 'error' ? (
        <p className="mt-2 text-xs text-warm-500">{funnel.error}</p>
      ) : total === 0 ? (
        <p className="mt-2 text-xs text-warm-500">No traces recorded for this workflow yet.</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(funnel.statusCounts).map(([status, count]) => (
              <Badge key={status} tone={status === 'success' ? 'success' : status === 'failure' ? 'danger' : 'neutral'} numeric size="sm">
                {status}: {count}
              </Badge>
            ))}
          </div>
          {funnel.missingRequiredStepRuns > 0 ? (
            <p className="mt-1 text-xs text-fw-warning-ink">
              {funnel.missingRequiredStepRuns} run{funnel.missingRequiredStepRuns === 1 ? '' : 's'} completed with a
              missing required step.
            </p>
          ) : null}
          {funnel.dropoffs.length > 0 ? (
            <ul className="mt-2 space-y-0.5">
              {funnel.dropoffs.map((d) => (
                <li key={d.step} className="flex items-center justify-between text-xs text-warm-600">
                  <span className="font-fw-mono">{d.step}</span>
                  <span className="tabular-nums">{d.failedCount}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </Surface>
  );
}

async function TraceFunnelsBody() {
  const dashboard = await fetchSloDashboard();
  const { traceFunnels, traceFunnelsError } = dashboard;

  if (!traceFunnels) {
    return (
      <InlineNotice tone="danger" title="Trace funnels unavailable">
        {traceFunnelsError ?? 'unknown error'} — rendering nothing rather than a fabricated funnel.
      </InlineNotice>
    );
  }

  return (
    <div>
      <p className="text-xs text-warm-500">
        Last {100} runs per golf-round workflow, from the same{' '}
        <span className="font-fw-mono">helm_debug_list_traces</span> RPC{' '}
        <Link href="/admin/traces" className="underline decoration-dotted">
          the Flight Recorder
        </Link>{' '}
        opens one trace at a time from — this asks the fleet question instead: where does attrition concentrate.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {traceFunnels.funnels.map((f) => (
          <FunnelCard key={f.workflow} funnel={f} />
        ))}
      </div>
    </div>
  );
}

export default async function SloPage() {
  await requireSuperAdmin();

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={60_000} />
      <div>
        <Eyebrow as="p" tone="accent">
          SLO / Error Budget Center
        </Eyebrow>
        <h1 className="mt-1 text-h3 font-semibold text-warm-900 md:text-2xl">
          Error budgets, golden-path health, silence detection, trace funnels
        </h1>
        <p className="mt-1 hidden max-w-2xl text-sm text-warm-500 md:block">
          Four independent read models over the reliability collector, feature health, and the flight recorder — see{' '}
          <Link href="/admin/health" className="underline decoration-dotted">
            Feature Health
          </Link>{' '}
          for the Invariant Lattice and Heartbeat Matrix, and{' '}
          <Link href="/admin/reliability" className="underline decoration-dotted">
            Reliability
          </Link>{' '}
          for the underlying correlated signal feed.
        </p>
      </div>

      <Surface padding="sm">
        <SectionLabel>Error budget</SectionLabel>
        <PanelBoundary title="Error budget" skeleton={<PanelPageSkeleton stats={0} rows={6} />}>
          <ErrorBudgetBody />
        </PanelBoundary>
      </Surface>

      <Surface padding="sm">
        <SectionLabel>Golden-path health</SectionLabel>
        <PanelBoundary title="Golden-path health" skeleton={<PanelPageSkeleton stats={0} rows={8} />}>
          <GoldenPathBody />
        </PanelBoundary>
      </Surface>

      <Surface padding="sm">
        <SectionLabel>Silence detection</SectionLabel>
        <PanelBoundary title="Silence detection" skeleton={<PanelPageSkeleton stats={0} rows={6} />}>
          <SilenceBody />
        </PanelBoundary>
      </Surface>

      <Surface padding="sm">
        <SectionLabel>Trace funnels</SectionLabel>
        <PanelBoundary title="Trace funnels" skeleton={<PanelPageSkeleton stats={0} rows={4} />}>
          <TraceFunnelsBody />
        </PanelBoundary>
      </Surface>
    </div>
  );
}
