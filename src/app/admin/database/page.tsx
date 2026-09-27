import Link from 'next/link';

import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchDatabaseMissionControl, type CollectorHealth } from '@/lib/admin/database/overview';
import { fetchDatabaseErrors, type DbErrorFingerprintGroup } from '@/lib/admin/database/errors';
import { fetchQueryPerformance, type StatDeltaRow } from '@/lib/admin/database/performance';

/** How many of the newest sampled windows the panel renders. Named so the
 *  disclosure below and the slice cannot drift apart. */
const LATEST_SAMPLE_CAP = 20;
import { fetchLockIncidents, type LockIncidentRow } from '@/lib/admin/database/locks';
import { fetchTableHealth } from '@/lib/admin/database/tables';
import { fetchJobsHealth, type CronJobDisplayRow } from '@/lib/admin/database/jobs';
import { fetchTelemetryHealth, type TelemetrySourceRow } from '@/lib/admin/database/telemetry';
import {
  fetchDatabaseIncidentDetail,
  DB_WORKFLOW_STAGE_LABEL,
  SECTION_STATE_LABEL,
  type DatabaseIncidentDetail,
  type Section,
} from '@/lib/admin/database/incident-detail';
import { SCHEMA_DRIFT_VERDICT_LABEL } from '@/lib/observability/supabase/schema-drift';
import { AUTHORIZATION_VERDICT_LABEL } from '@/lib/observability/supabase/authorization-diagnosis';
import { CAUSAL_CONFIDENCE_LABEL } from '@/lib/observability/supabase/release-correlation';
import { SERVICE_LAYER_LABEL } from '@/lib/observability/supabase/service-layers';
import { fetchPlatformHealth } from '@/lib/admin/database/platform';
import { fetchDatabaseAdvisors, type AdvisorFinding } from '@/lib/admin/database/advisors';
import { fetchAlertPolicy } from '@/lib/admin/database/alerts';
import type { EvaluatedAlert } from '@/lib/observability/supabase/alert-policy';
import { Surface, StatTile, StatusPill, InlineNotice, type FwStatusTone } from '@/components/fairway';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelPageSkeleton } from '../_components/PanelSkeletons';
import { PanelNoData, PanelAllClear, PanelStale } from '../_components/PanelStates';
import { AutoRefresh } from '../_components/AutoRefresh';
import { LocalTime } from '../_components/LocalTime';
import { SectionLabel } from '../_components/SectionLabel';
import { DetailsDisclosure, TabHeader } from '../_components/TabHeader';
import { RailRow, RowHead, FactLine, RowFoot, StateChip, type RowSeverity } from '../_components/Row';
import { LogEvidenceForm } from './LogEvidenceForm';
import { ViewRail } from '../_components/ViewRail';
import { parseView, hrefForView, type AdminViewOf } from '@/lib/admin/views';
import {
  SlowStatementsPanel,
  IndexSuggestionsPanel,
  UnusedIndexesPanel,
  BloatPanel,
  CoveragePanel,
  DriftPanel,
  ChangedSinceYesterdayStrip,
} from './DatabaseTabPanels';

export const dynamic = 'force-dynamic';

/**
 * Database Mission Control — brief §35's Bridge database views.
 *
 * Phase 1 shipped A (Mission Control), B (Database Errors) and C (Query
 * Performance). Phase 2 Track A added D (Locks & Transactions), Table
 * Health, F (Jobs & Webhooks) and G (Telemetry Health) — see
 * docs/observability/SUPABASE_OBSERVABILITY_MEASURED_TRUTH.md §7. Phase 2
 * Track C added Platform (Metrics API), Advisors, Alert policy and
 * on-demand log evidence — see
 * docs/observability/SUPABASE_PLATFORM_OBSERVABILITY.md. E (Integrity's
 * full workflow contracts) remains a later phase.
 *
 * Every number on this page is read from what the collectors already wrote,
 * or from a server-only, credential-gated on-demand fetch. Nothing here
 * queries production directly from the page render except the Metrics API
 * and Advisors reads, which are themselves read-only and cached.
 */

const SEVERITY_TONE: Record<string, FwStatusTone> = {
  info: 'neutral',
  warning: 'warning',
  error: 'danger',
  critical: 'danger',
};

/** An error-store severity word as a row rail. Anything unrecognised is
 *  `info` — never promoted to a louder rail than the data claims. */
function rowSeverity(severity: string): RowSeverity {
  return severity === 'critical' || severity === 'error' || severity === 'warning' ? severity : 'info';
}

/** A StatusPill tone as a row rail, for the status lines below that already
 *  compute a tone. Colour still means severity: success is `ok`, danger is
 *  `error`, and everything without a severity (neutral/accent/info) is the
 *  quiet `info` rail. */
function toneSeverity(tone: FwStatusTone): RowSeverity {
  if (tone === 'danger') return 'error';
  if (tone === 'warning') return 'warning';
  if (tone === 'success') return 'ok';
  return 'info';
}

/**
 * One section of a Database view. Replaces Surface > Inset (p-6 + p-4: 40px a
 * side, which left ~255px for rows on a 375px phone) with one `sm` surface,
 * and moves each section's methodology note — every one of them "how this is
 * read", none of them data — behind the shared Details disclosure.
 */
function DbSection({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Surface as="section" padding="sm" className="min-w-0">
      <SectionLabel>{title}</SectionLabel>
      {note ? (
        <DetailsDisclosure className="mt-1">
          <p>{note}</p>
        </DetailsDisclosure>
      ) : null}
      <div className="mt-3">{children}</div>
    </Surface>
  );
}

/**
 * A label with one state on the right — collector runs, saturation, telemetry
 * sources. Wraps rather than squeezing: at 375px a long label beside a
 * timestamp and a pill pushed the pill past the card edge.
 */
function StatusLine({ label, meta, children }: { label: React.ReactNode; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-border-subtle px-3 py-2">
      <span className="min-w-0 break-words text-xs font-medium text-warm-700 [overflow-wrap:anywhere]">{label}</span>
      <span className="flex shrink-0 items-center gap-2">
        {meta ? <span className="whitespace-nowrap font-fw-mono text-caption text-warm-500">{meta}</span> : null}
        {children}
      </span>
    </div>
  );
}

const COLLECTOR_LABEL: Record<string, string> = {
  'db-health-sampler': 'Health sampler (5m)',
  'db-stat-delta': 'Query delta (15m)',
  'db-observability-prune': 'Retention prune (daily)',
};

function CollectorChip({ collector }: { collector: CollectorHealth }) {
  const tone: FwStatusTone =
    collector.lastStatus === 'completed'
      ? 'success'
      : collector.lastStatus === 'failed'
        ? 'danger'
        : collector.lastStatus === 'unknown'
          ? 'warning'
          : 'neutral'
  return (
    <StatusLine
      label={COLLECTOR_LABEL[collector.jobType] ?? collector.jobType}
      meta={collector.lastRunAt ? <LocalTime iso={collector.lastRunAt} /> : null}
    >
      <StatusPill tone={tone} size="sm" dot>
        {collector.lastStatus === 'never_run'
          ? 'never run'
          : collector.lastStatus === 'unknown'
            ? 'unknown — job log unreadable'
            : collector.lastStatus}
      </StatusPill>
    </StatusLine>
  );
}

async function MissionControlPanel() {
  const result = await fetchDatabaseMissionControl();

  if (result.status === 'unconfigured') {
    // The health-sampler migration (20260903180100) is applied and
    // catalog-verified live (supabase/migrations/HELD.md) — an
    // `unconfigured` result today means the read genuinely failed, not a
    // migration still awaiting apply.
    return (
      <PanelNoData
        label="Could not read database health sampler"
        description={result.error ?? 'This read failed this refresh for an unknown reason.'}
      />
    );
  }
  if (result.status === 'error' || !result.data) {
    return <PanelStale label="Database Mission Control" error={result.error} />;
  }

  const { latestSample, collectors, rules } = result.data;

  if (!latestSample) {
    return <PanelNoData label="No health samples yet" description="The collector has not written its first row." />;
  }

  const saturationTone: FwStatusTone =
    rules.connectionSaturation.level === 'critical'
      ? 'danger'
      : rules.connectionSaturation.level === 'high'
        ? 'danger'
        : rules.connectionSaturation.level === 'warning'
          ? 'warning'
          : 'success';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="CONNECTIONS"
          value={latestSample.connectionsPctMax ?? 0}
          format={{ style: 'percent', maximumFractionDigits: 0 }}
          tone="neutral"
        />
        <StatTile
          label="CACHE HIT"
          value={latestSample.cacheHitRatio ?? undefined}
          format={{ style: 'percent', maximumFractionDigits: 1 }}
          tone="neutral"
        />
        <StatTile label="ROLLBACKS (window)" value={latestSample.xactRollbackDelta ?? 0} tone="neutral" mono />
        <StatTile
          label="DB SIZE"
          value={Math.round(latestSample.dbSizeBytes / (1024 * 1024))}
          suffix=" MB"
          tone="neutral"
          mono
        />
      </div>

      {/* Connection-saturation / rollback-rate rules (brief §19, §23, Phase 2 A2) */}
      <div className="grid gap-2 sm:grid-cols-2">
        <StatusLine label="Connection saturation">
          <StatusPill tone={saturationTone} size="sm" dot>
            {rules.connectionSaturation.level}
            {rules.connectionSaturation.sustainedHigh ? ' · sustained' : ''}
          </StatusPill>
        </StatusLine>
        <StatusLine label="Rollback rate">
          {rules.rollbackRate.baselineStatus === 'collecting' ? (
            <StatusPill tone="neutral" size="sm" dot>
              baseline collecting
            </StatusPill>
          ) : (
            <StatusPill tone={rules.rollbackRate.isRegression ? 'danger' : 'success'} size="sm" dot>
              {rules.rollbackRate.isRegression ? 'regression' : 'normal'}
            </StatusPill>
          )}
        </StatusLine>
      </div>

      {latestSample.collectorStatus !== 'ok' ? (
        <InlineNotice tone="warning" title="Collector status">
          Latest sample: <span className="font-fw-mono">{latestSample.collectorStatus}</span> — deltas from this
          window are withheld rather than shown as zero.
        </InlineNotice>
      ) : null}

      <p className="font-fw-mono text-xs text-warm-500">
        sampled <LocalTime iso={latestSample.sampledAt} />
      </p>

      <div className="grid gap-2 sm:grid-cols-3">
        {collectors.map((collector) => (
          <CollectorChip key={collector.jobType} collector={collector} />
        ))}
      </div>
    </div>
  );
}

function ErrorGroupRow({ group }: { group: DbErrorFingerprintGroup }) {
  const occurrences = group.totalOccurrences.toLocaleString();
  return (
    <RailRow severity={rowSeverity(group.severity)}>
      {/* The whole row is the link to its diagnosis. The message leads (it is
          the fault); severity (the raw value, so one the rail folds into `info`
          is still readable), code, feature and service are the fact line; last-seen
          and the "diagnose" affordance sit at the lowest weight. Nothing is
          truncated — at 375px a one-line ellipsis kept three words of it. */}
      <Link
        href={`/admin/database?incident=${encodeURIComponent(group.fingerprint)}`}
        className="block rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
      >
        <RowHead value={`${occurrences}×`} valueLabel={`${occurrences} occurrences`}>
          {group.latest.normalizedMessage}
        </RowHead>
        <FactLine emphasizeFirst items={[group.severity, group.errorCode ?? 'unknown', group.feature, group.service]} />
        <RowFoot meta={<LocalTime iso={group.lastSeenAt} />}>
          <span className="text-caption font-medium text-accent-700">diagnose →</span>
        </RowFoot>
      </Link>
    </RailRow>
  );
}

async function ErrorsPanel() {
  const result = await fetchDatabaseErrors();

  if (result.status === 'unconfigured') {
    return (
      <PanelNoData
        label="Could not read database error store"
        description={result.error ?? 'This read failed this refresh for an unknown reason.'}
      />
    );
  }
  if (result.status === 'error' || !result.data) {
    return <PanelStale label="Database Errors" error={result.error} />;
  }
  if (result.data.groups.length === 0) {
    return <PanelAllClear label="No database errors recorded" checkedAt={new Date().toISOString()} />;
  }

  return (
    <ul className="divide-y divide-warm-200/60">
      {result.data.groups.slice(0, 25).map((group) => (
        <ErrorGroupRow key={group.fingerprint} group={group} />
      ))}
    </ul>
  );
}

function StatDeltaRowView({ row }: { row: StatDeltaRow }) {
  return (
    <RailRow severity={row.regressionFlags.length > 0 ? 'warning' : 'info'}>
      {/* Truthiness collapsed BOTH null and a genuine 0 into "0ms". A delta of
          exactly zero is a real measurement — the query ran and cost no more
          than last window — and is not the same fact as "no prior window". */}
      <RowHead
        value={
          row.totalExecMsDelta === null || row.totalExecMsDelta === undefined
            ? '—'
            : `${Math.round(row.totalExecMsDelta).toLocaleString()}ms`
        }
        valueLabel="total execution time this window"
      >
        {row.safeQueryClass}
      </RowHead>
      <FactLine
        items={[
          row.sourceClass,
          // `?? 0` here said "0 calls" for a window with NO prior state to diff
          // against — a first observation rendered as a measured zero. Every
          // row on this panel is flagged `new query` on a fresh collector, so
          // the whole list read "0 calls · 0ms" beside a max of 26 seconds.
          // null means no delta exists; it is not zero activity.
          `${row.callsDelta === null ? '—' : row.callsDelta} calls · mean ${
            row.meanExecMsWindow ? row.meanExecMsWindow.toFixed(1) : '—'
          }ms · max ${row.maxExecMsObserved ? row.maxExecMsObserved.toFixed(0) : '—'}ms`,
        ]}
      />
      {row.regressionFlags.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {row.regressionFlags.map((flag) => (
            <StateChip key={flag} tone="warning">
              {flag.replace(/_/g, ' ')}
            </StateChip>
          ))}
        </div>
      ) : null}
    </RailRow>
  );
}

async function PerformancePanel() {
  const result = await fetchQueryPerformance();

  if (result.status === 'unconfigured') {
    return (
      <PanelNoData
        label="Could not read query delta engine"
        description={result.error ?? 'This read failed this refresh for an unknown reason.'}
      />
    );
  }
  if (result.status === 'error' || !result.data) {
    return <PanelStale label="Query Performance" error={result.error} />;
  }
  if (result.data.latest.length === 0) {
    return <PanelNoData label="No query samples yet" description="The collector has not written its first window." />;
  }

  return (
    <div className="space-y-4">
      {/* The regressions are rendered from `recentRegressions`, NOT from the
          `latest` slice below. Until 2026-09-03 this notice said the flagged
          windows were "shown inline below with their flags" while the list
          underneath rendered `latest.slice(0, 20)` — a different set entirely.
          A regression outside the newest twenty samples was counted in the
          headline and then invisible, which is worse than not counting it. */}
      {result.data.recentRegressions.length > 0 ? (
        <div className="space-y-2">
          <InlineNotice tone="warning" title="Regressions in the last 24h">
            {result.data.recentRegressions.length} flagged window(s), listed below.
          </InlineNotice>
          <ul className="divide-y divide-warm-200/60">
            {result.data.recentRegressions.map((row) => (
              <StatDeltaRowView key={`regression-${row.id}`} row={row} />
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-caption text-warm-500">
          Most recent {Math.min(LATEST_SAMPLE_CAP, result.data.latest.length)} of{' '}
          {result.data.latest.length} sampled window(s).
          {result.data.latest.length > LATEST_SAMPLE_CAP
            ? ' Older windows are not shown here — regressions among them appear in the list above.'
            : ''}
        </p>
        <ul className="divide-y divide-warm-200/60">
          {result.data.latest.slice(0, LATEST_SAMPLE_CAP).map((row) => (
            <StatDeltaRowView key={row.id} row={row} />
          ))}
        </ul>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- *
 * Phase 2 track A7 — the four new Bridge sections: Locks & Transactions,
 * Table Health, Jobs & Webhooks, Telemetry Health (brief §35D/F/G, §29).
 * Same structure and tokens as the three panels above; every one renders
 * an explicit unconfigured/stale state rather than a blank or fabricated
 * green when its reader has nothing.
 * -------------------------------------------------------------------- */

function LockIncidentRowView({ incident }: { incident: LockIncidentRow }) {
  return (
    <RailRow severity={incident.resolvedAt ? 'ok' : incident.severity === 'critical' ? 'critical' : 'warning'}>
      <RowHead
        value={incident.waitMs !== null ? `${(incident.waitMs / 1000).toFixed(1)}s` : undefined}
        valueLabel="lock wait"
      >
        {incident.blockedQueryClass ?? '—'}
      </RowHead>
      <FactLine
        emphasizeFirst
        items={[
          incident.kind.replace(/_/g, ' '),
          incident.severity,
          incident.roleClass,
          incident.blockingQueryClass ? `blocked by ${incident.blockingQueryClass}` : null,
        ]}
      />
      <RowFoot meta={<LocalTime iso={incident.detectedAt} />}>
        {incident.resolvedAt ? <StateChip>resolved</StateChip> : null}
      </RowFoot>
    </RailRow>
  );
}

async function LocksPanel() {
  const result = await fetchLockIncidents();

  if (result.status === 'unconfigured') {
    return (
      <PanelNoData
        label="Could not read lock incident store"
        description={result.error ?? 'This read failed this refresh for an unknown reason.'}
      />
    );
  }
  if (result.status === 'error' || !result.data) {
    return <PanelStale label="Locks & Transactions" error={result.error} />;
  }
  if (result.data.incidents.length === 0) {
    return <PanelAllClear label="No lock incidents recorded" checkedAt={new Date().toISOString()} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <StatTile
          label={result.data.openCountIsFloor ? 'OPEN INCIDENTS (AT LEAST)' : 'OPEN INCIDENTS'}
          value={result.data.openCount}
          tone={result.data.openCount > 0 ? 'accent' : 'neutral'}
          mono
        />
        <StatTile
          label={result.data.openCountIsFloor ? 'CRITICAL OPEN (AT LEAST)' : 'CRITICAL OPEN'}
          value={result.data.criticalOpenCount}
          tone={result.data.criticalOpenCount > 0 ? 'accent' : 'neutral'}
          mono
        />
      </div>
      {result.data.openCountIsFloor ? (
        <p className="text-xs text-warm-600">
          The reader hit its page ceiling, so these are lower bounds, not totals. Nothing resolves a lock incident yet,
          so an open count that reaches the ceiling stays there.
        </p>
      ) : null}
      <ul className="divide-y divide-warm-200/60">
        {result.data.incidents.slice(0, 25).map((incident) => (
          <LockIncidentRowView key={incident.id} incident={incident} />
        ))}
      </ul>
    </div>
  );
}

async function TableHealthPanel() {
  const result = await fetchTableHealth();

  if (result.status === 'unconfigured') {
    return (
      <PanelNoData
        label="Could not read table health collector"
        description={result.error ?? 'This read failed this refresh for an unknown reason.'}
      />
    );
  }
  if (result.status === 'error' || !result.data) {
    return <PanelStale label="Table Health" error={result.error} />;
  }
  if (result.data.tables.length === 0) {
    return <PanelNoData label="No table samples yet" description="The collector has not written its first hourly window." />;
  }

  return (
    <div className="space-y-4">
      {result.data.warnings.length === 0 ? (
        <PanelAllClear label="No table-health warnings" checkedAt={result.data.latestSampledAt ?? new Date().toISOString()} />
      ) : (
        <ul className="divide-y divide-warm-200/60">
          {result.data.warnings.map((warning, idx) => (
            <RailRow key={`${warning.kind}-${warning.relationName}-${idx}`} severity="warning">
              <RowHead>{warning.relationName}</RowHead>
              <FactLine emphasizeFirst items={[warning.kind.replace(/_/g, ' '), warning.detail]} />
            </RailRow>
          ))}
        </ul>
      )}
    </div>
  );
}

function CronJobRowView({ job }: { job: CronJobDisplayRow }) {
  const tone: FwStatusTone = job.findings.length === 0 ? 'success' : job.findings.includes('never_run') ? 'neutral' : 'danger';
  return (
    <RailRow severity={toneSeverity(tone)}>
      <RowHead value={job.lastRunStatus ?? 'never run'} valueLabel="last run status">
        {job.jobName}
      </RowHead>
      <FactLine items={[job.schedule, job.findings.length === 0 ? 'healthy' : null]} />
      {job.findings.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {job.findings.map((finding) => (
            <StateChip key={finding} tone="warning">
              {finding.replace(/_/g, ' ')}
            </StateChip>
          ))}
        </div>
      ) : null}
    </RailRow>
  );
}

async function JobsPanel() {
  const result = await fetchJobsHealth();

  if (result.status === 'unconfigured') {
    return (
      <PanelNoData
        label="Could not read pg_cron / pg_net"
        description={result.error ?? 'The read failed this refresh — see the error above for the specific cause.'}
      />
    );
  }
  if (result.status === 'error' || !result.data) {
    return <PanelStale label="Postgres scheduled jobs" error={result.error} />;
  }

  const { cronCapability, cronJobs, netQueueDepth, netQueueCapability, netResponsesCapability, netFindings } = result.data;

  return (
    <div className="space-y-4">
      {cronCapability === 'unavailable' ? (
        <InlineNotice tone="info" title="pg_cron unreadable">
          cron.job could not be read this refresh — capability unavailable, not zero jobs.
        </InlineNotice>
      ) : cronJobs.length === 0 ? (
        <PanelNoData label="No pg_cron jobs registered" description="cron.job is empty in this database." />
      ) : (
        <ul className="divide-y divide-warm-200/60">
          {cronJobs.map((job) => (
            <CronJobRowView key={job.jobId} job={job} />
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <StatTile
          label="PG_NET QUEUE"
          value={netQueueCapability === 'available' ? (netQueueDepth ?? 0) : undefined}
          tone={netFindings.includes('backlog_anomaly') ? 'accent' : 'neutral'}
          mono
        />
        <StatusLine label="pg_net responses (24h)">
          <StatusPill
            tone={netResponsesCapability === 'unavailable' ? 'neutral' : netFindings.includes('elevated_error_rate') ? 'danger' : 'success'}
            size="sm"
            dot
          >
            {netResponsesCapability === 'unavailable'
              ? 'unavailable'
              : netFindings.includes('elevated_error_rate')
                ? 'elevated errors'
                : 'normal'}
          </StatusPill>
        </StatusLine>
      </div>
    </div>
  );
}

const FRESHNESS_TONE: Record<TelemetrySourceRow['state'], FwStatusTone> = {
  healthy: 'success',
  degraded: 'warning',
  stale: 'danger',
  blind: 'danger',
  unknown: 'neutral',
};

function TelemetrySourceRowView({ source }: { source: TelemetrySourceRow }) {
  return (
    <StatusLine label={source.name} meta={source.lastSampleAt ? <LocalTime iso={source.lastSampleAt} /> : null}>
      <StatusPill tone={FRESHNESS_TONE[source.state]} size="sm" dot>
        {source.state}
      </StatusPill>
    </StatusLine>
  );
}

async function TelemetryHealthPanel() {
  const result = await fetchTelemetryHealth();

  if (result.status === 'unconfigured') {
    return (
      <PanelNoData
        label="Could not read telemetry health"
        description={result.error ?? 'This read failed this refresh for an unknown reason.'}
      />
    );
  }
  if (result.status === 'error' || !result.data) {
    return <PanelStale label="Telemetry Health" error={result.error} />;
  }

  const { overall, sources, tableSizes, sizesCapability } = result.data;
  const overallTone: FwStatusTone =
    overall === 'green' ? 'success' : overall === 'degraded' ? 'warning' : overall === 'red' ? 'danger' : 'neutral';

  return (
    <div className="space-y-4">
      <StatusLine label="Overall telemetry state">
        <StatusPill tone={overallTone} size="sm" dot>
          {overall}
        </StatusPill>
      </StatusLine>

      <div className="space-y-2">
        {sources.map((source) => (
          <TelemetrySourceRowView key={source.name} source={source} />
        ))}
      </div>

      {sizesCapability === 'unavailable' ? (
        <InlineNotice tone="info" title="Table sizes unavailable">
          The sizes facade could not be read this refresh — retention windows above may be operating without this view.
        </InlineNotice>
      ) : tableSizes.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {tableSizes.map((size) => (
            <div
              key={size.tableName}
              className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-lg border border-border-subtle px-3 py-2"
            >
              <span className="min-w-0 break-all font-fw-mono text-xs text-warm-700">{size.tableName}</span>
              <span className="shrink-0 whitespace-nowrap font-fw-mono text-caption text-warm-500">
                {Math.round(size.totalBytes / 1024)} KB · {size.rowsLast24h}/24h
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function dbUpTone(dbUp: number | null): FwStatusTone {
  if (dbUp === 1) return 'success';
  if (dbUp === 0) return 'danger';
  return 'neutral';
}

async function PlatformPanel() {
  const result = await fetchPlatformHealth();

  if (result.status === 'unconfigured') {
    return (
      <PanelNoData
        label="Supabase Metrics API not configured"
        description={result.error ?? 'SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL required — an intentional $0-cost default, not a defect.'}
      />
    );
  }
  if (result.status === 'error' || !result.data) {
    return <PanelStale label="Platform metrics" error={result.error} />;
  }

  const m = result.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={dbUpTone(m.dbUp)} size="sm" dot>
          {m.dbUp === 1 ? 'db up' : m.dbUp === 0 ? 'db down' : 'db status unknown'}
        </StatusPill>
        <span className="font-fw-mono text-xs text-warm-500">
          sampled <LocalTime iso={m.sampledAt} />
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="CPU" value={m.cpuPct ?? undefined} suffix="%" tone="neutral" mono />
        <StatTile label="MEMORY" value={m.memoryPct ?? undefined} suffix="%" tone="neutral" mono />
        <StatTile label="CONN. POOL" value={m.poolSaturationPct ?? undefined} suffix="%" tone="neutral" mono />
        <StatTile
          label="DB SIZE"
          value={m.dbSizeBytes !== null ? Math.round(m.dbSizeBytes / (1024 * 1024)) : undefined}
          suffix=" MB"
          tone="neutral"
          mono
        />
      </div>
      <DetailsDisclosure>
        <p>
          Allow-list is docs-derived, not live-verified — see{' '}
          <span className="font-fw-mono">src/lib/observability/supabase/metrics-api.ts</span> header. A missing metric
          renders as a blank tile, never a fabricated 0.
        </p>
      </DetailsDisclosure>
    </div>
  );
}

const ADVISOR_LEVEL_TONE: Record<string, FwStatusTone> = {
  ERROR: 'danger',
  WARN: 'warning',
  WARNING: 'warning',
  INFO: 'neutral',
  UNKNOWN: 'neutral',
};

/** Advisor levels as rails: ERROR is an error, WARN a warning, the rest info. */
function advisorSeverity(level: string): RowSeverity {
  const tone = ADVISOR_LEVEL_TONE[level] ?? 'neutral';
  return tone === 'danger' ? 'error' : tone === 'warning' ? 'warning' : 'info';
}

function AdvisorRow({ finding }: { finding: AdvisorFinding }) {
  return (
    <RailRow severity={advisorSeverity(finding.level)}>
      <RowHead>{finding.name}</RowHead>
      <FactLine emphasizeFirst items={[finding.level, finding.advisorType, finding.object]} />
    </RailRow>
  );
}

async function AdvisorsPanel() {
  const result = await fetchDatabaseAdvisors();

  if (result.status === 'unconfigured') {
    return (
      <PanelNoData
        label="Supabase Advisors not configured"
        description={result.error ?? 'SUPABASE_ACCESS_TOKEN required — an intentional $0-cost default, not a defect.'}
      />
    );
  }
  if (result.status === 'error' || !result.data) {
    return <PanelStale label="Advisors" error={result.error} />;
  }
  if (result.data.findings.length === 0) {
    return <PanelAllClear label="No advisor findings" checkedAt={new Date().toISOString()} />;
  }

  return (
    <ul className="divide-y divide-warm-200/60">
      {result.data.findings.slice(0, 25).map((finding, index) => (
        <AdvisorRow key={`${finding.advisorType}-${finding.name}-${finding.object ?? index}`} finding={finding} />
      ))}
    </ul>
  );
}

const ALERT_STATE_TONE: Record<EvaluatedAlert['state'], FwStatusTone> = {
  firing: 'danger',
  clear: 'success',
  unknown: 'neutral',
};

function AlertRow({ alert }: { alert: EvaluatedAlert }) {
  return (
    <RailRow severity={toneSeverity(ALERT_STATE_TONE[alert.state])}>
      <RowHead value={alert.state} valueLabel="alert state">
        {alert.rule.description}
      </RowHead>
      <FactLine
        items={[
          alert.rule.severity,
          alert.state !== 'clear' ? (alert.evidence ?? alert.reason ?? null) : null,
        ]}
      />
    </RailRow>
  );
}

async function AlertPolicyPanel() {
  const result = await fetchAlertPolicy();

  if (result.status !== 'ok' || !result.data) {
    return <PanelStale label="Alert policy" error={result.error} />;
  }

  const { alerts, baselineStatus, firingCount, unknownCount } = result.data;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={baselineStatus === 'ready' ? 'success' : 'neutral'} size="sm">
          baseline {baselineStatus}
        </StatusPill>
        <span className="text-xs text-warm-500">
          {firingCount} firing · {unknownCount} unknown of {alerts.length} rules
        </span>
      </div>
      <ul className="divide-y divide-warm-200/60">
        {alerts.map((alert) => (
          <AlertRow key={alert.rule.id} alert={alert} />
        ))}
      </ul>
    </div>
  );
}



// ---------------------------------------------------------------------------
// Incident detail (brief §34) — rendered only when ?incident=<fingerprint>
// ---------------------------------------------------------------------------

const SECTION_STATE_TONE: Record<string, FwStatusTone> = {
  ok: 'success',
  empty: 'neutral',
  'not-applicable': 'neutral',
  unconfigured: 'neutral',
  blind: 'warning',
};

/** One labelled block whose body is replaced by an explicit state chip when
 *  its source is empty, not shipped, or unreadable. Never a fabricated zero. */
function DetailSection<T>({
  title,
  section,
  children,
}: {
  title: string;
  section: Section<T>;
  children: (data: T) => React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border-subtle px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 text-xs font-medium text-warm-700">{title}</span>
        <StatusPill tone={SECTION_STATE_TONE[section.state] ?? 'neutral'} size="sm" dot>
          {SECTION_STATE_LABEL[section.state]}
        </StatusPill>
      </div>
      {section.state === 'ok' && section.data !== null ? (
        <div className="mt-2">{children(section.data)}</div>
      ) : (
        <p className="mt-1.5 break-words text-xs text-warm-600 [overflow-wrap:anywhere]">{section.note ?? 'No detail available.'}</p>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number | null }) {
  return (
    // min-w-0 + anywhere-wrap: a release SHA, relation or trace id is one
    // unbroken token, and in a half-width phone cell it ran past the card.
    <div className="min-w-0">
      <p className="text-caption uppercase tracking-wide text-warm-600">{label}</p>
      <p className="break-words font-fw-mono text-xs text-warm-800 [overflow-wrap:anywhere]">{value ?? 'unknown'}</p>
    </div>
  );
}

const STAGE_TONE: Record<string, FwStatusTone> = {
  reached: 'success',
  'failed-here': 'danger',
  'not-reached': 'neutral',
  unknown: 'neutral',
};

function IncidentDetailBody({ detail }: { detail: DatabaseIncidentDetail }) {
  const { identity } = detail;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={SEVERITY_TONE[identity.severity] ?? 'neutral'} size="sm">
            {identity.severity}
          </StatusPill>
          <span className="min-w-0 break-all font-fw-mono text-xs text-warm-800">{identity.primaryClass}</span>
        </div>
        <p className="mt-1 break-words text-sm font-medium text-warm-900 [overflow-wrap:anywhere]">{identity.title}</p>
        <p className="mt-0.5 break-all font-fw-mono text-caption text-warm-600">{identity.fingerprint}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="OCCURRENCES" value={identity.occurrences} tone="neutral" mono />
        <StatTile label="BUCKETS" value={detail.bucketCount} tone="neutral" mono />
        <div className="min-w-0 rounded-lg border border-border-subtle px-3 py-2.5">
          <Field label="SQLSTATE / code" value={identity.sqlstate ?? identity.errorCode} />
        </div>
        <div className="min-w-0 rounded-lg border border-border-subtle px-3 py-2.5">
          {/* The error store has no HTTP column — an explicit "not captured", never a 0. */}
          <Field label="HTTP status" value={identity.httpStatus ?? 'not captured'} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border-subtle px-3 py-2.5 sm:grid-cols-4">
        <Field label="Feature" value={identity.feature} />
        <Field label="Action" value={identity.action} />
        <Field label="Service" value={identity.service} />
        <Field label="Operation" value={identity.operation} />
        <Field label="RPC" value={identity.rpc} />
        <Field label="Relation" value={identity.relation} />
        <Field label="Release" value={identity.releaseSha} />
        <Field label="Environment" value={identity.environment} />
      </div>

      <div className="grid gap-3 text-xs sm:grid-cols-2">
        <div className="rounded-lg border border-border-subtle px-3 py-2.5">
          <p className="text-caption uppercase tracking-wide text-warm-600">First seen</p>
          <p className="font-fw-mono text-xs text-warm-800">
            <LocalTime iso={identity.firstSeenAt} />
          </p>
        </div>
        <div className="rounded-lg border border-border-subtle px-3 py-2.5">
          <p className="text-caption uppercase tracking-wide text-warm-600">Last seen</p>
          <p className="font-fw-mono text-xs text-warm-800">
            <LocalTime iso={identity.lastSeenAt} />
          </p>
        </div>
      </div>

      {/* Service layers (brief §48) */}
      <div className="rounded-lg border border-border-subtle px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-warm-700">Service layer</span>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="neutral" size="sm">
              observed {SERVICE_LAYER_LABEL[detail.serviceLayer.observedLayer]}
            </StatusPill>
            <StatusPill tone={detail.serviceLayer.ambiguous ? 'warning' : 'success'} size="sm" dot>
              origin {SERVICE_LAYER_LABEL[detail.serviceLayer.likelyOriginLayer]} ·{' '}
              {detail.serviceLayer.originConfidence}
            </StatusPill>
          </div>
        </div>
        <ul className="mt-1.5 space-y-1">
          {detail.serviceLayer.reasons.map((reason) => (
            <li key={reason} className="break-words text-xs text-warm-600 [overflow-wrap:anywhere]">
              {reason}
            </li>
          ))}
        </ul>
      </div>

      {/* Workflow stages (brief §34) */}
      <div className="rounded-lg border border-border-subtle px-3 py-2.5">
        <span className="text-xs font-medium text-warm-700">Database workflow</span>
        <div className="mt-2 space-y-1.5">
          {detail.workflowStages.map((stage) => (
            // Label + state on one line, the detail wrapping beneath: the detail
            // used to truncate between them, which at 375px left a few letters.
            <div key={stage.stage}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 text-xs text-warm-700">{DB_WORKFLOW_STAGE_LABEL[stage.stage]}</span>
                <StatusPill tone={STAGE_TONE[stage.status] ?? 'neutral'} size="sm" dot>
                  {stage.status.replace(/-/g, ' ')}
                </StatusPill>
              </div>
              {stage.detail ? (
                <p className="mt-0.5 break-words text-caption text-warm-600 [overflow-wrap:anywhere]">{stage.detail}</p>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* Authorization (brief §41 / §68) */}
      {detail.authorization.applies ? (
        <div className="rounded-lg border border-border-subtle px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-warm-700">Authorization</span>
            <StatusPill
              tone={
                detail.authorization.verdict === 'EXPECTED_SECURITY_DENIAL'
                  ? 'success'
                  : detail.authorization.verdict === 'UNEXPECTED_PRODUCT_FAILURE'
                    ? 'danger'
                    : 'warning'
              }
              size="sm"
              dot
            >
              {AUTHORIZATION_VERDICT_LABEL[detail.authorization.verdict]}
            </StatusPill>
          </div>
          <p className="mt-1.5 break-words text-xs text-warm-600">{detail.authorization.explanation}</p>
          {detail.authorization.runbook.length > 0 ? (
            <ol className="mt-2 space-y-1.5">
              {detail.authorization.runbook.map((step, index) => (
                <li key={step.id} className="text-xs text-warm-700">
                  <span className="font-fw-mono text-warm-600">{index + 1}.</span> {step.question}
                  <span className="mt-0.5 block text-caption text-warm-600">{step.why}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}

      {/* Schema / types / migration drift (brief §40-41) */}
      <DetailSection title="Schema, types and migration drift" section={detail.schemaDrift}>
        {(drift) => (
          <div className="space-y-1.5">
            <StatusPill tone={drift.verdict === 'not-applicable' ? 'neutral' : 'warning'} size="sm" dot>
              {SCHEMA_DRIFT_VERDICT_LABEL[drift.verdict]}
            </StatusPill>
            <p className="break-words text-xs text-warm-600">{drift.explanation}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Field label="Migration file" value={drift.migrationFile} />
              <Field label="Ledger row" value={drift.ledgerRow} />
              <Field label="Generated types" value={drift.generatedTypes} />
            </div>
            {drift.nextSteps.length > 0 ? (
              <ul className="space-y-1">
                {drift.nextSteps.map((step) => (
                  <li key={step} className="text-caption text-warm-600">
                    {step}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </DetailSection>

      {/* Release correlation + causal confidence (brief §42-43) */}
      <DetailSection title="Release correlation" section={detail.releaseCorrelation}>
        {(correlation) => (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill
                tone={
                  correlation.confidence === 'reproduced-cause'
                    ? 'danger'
                    : correlation.confidence === 'likely'
                      ? 'warning'
                      : 'neutral'
                }
                size="sm"
                dot
              >
                {CAUSAL_CONFIDENCE_LABEL[correlation.confidence]}
              </StatusPill>
              <span className="min-w-0 break-all font-fw-mono text-caption text-warm-600">
                {correlation.releaseSha ?? 'no release'} · via {correlation.releaseIdentitySource}
              </span>
            </div>
            <p className="break-words text-xs text-warm-600">{correlation.because}</p>
            {correlation.corroborating.length > 0 ? (
              <div>
                <p className="text-caption uppercase tracking-wide text-warm-600">Corroborating</p>
                <ul className="space-y-1">
                  {correlation.corroborating.map((line) => (
                    <li key={line} className="text-caption text-warm-700">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {correlation.notCorroborating.length > 0 ? (
              <div>
                <p className="text-caption uppercase tracking-wide text-warm-600">Considered, not counted</p>
                <ul className="space-y-1">
                  {correlation.notCorroborating.map((line) => (
                    <li key={line} className="text-caption text-warm-600">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {correlation.exculpatory.length > 0 ? (
              <div>
                <p className="text-caption uppercase tracking-wide text-warm-600">Arguing against</p>
                <ul className="space-y-1">
                  {correlation.exculpatory.map((line) => (
                    <li key={line} className="text-caption text-warm-700">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </DetailSection>

      <div className="grid gap-3 sm:grid-cols-2">
        <DetailSection title="Database health at the time" section={detail.healthAtTheTime}>
          {(health) => (
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="Connections"
                value={health.connectionsPctMax === null ? null : `${Math.round(health.connectionsPctMax * 100)}%`}
              />
              <Field
                label="Cache hit"
                value={health.cacheHitRatio === null ? null : `${(health.cacheHitRatio * 100).toFixed(1)}%`}
              />
              <Field label="Rollbacks" value={health.xactRollbackDelta} />
              <Field label="Deadlocks" value={health.deadlocksDelta} />
              <Field label="Longest lock wait" value={health.longestLockWaitMs === null ? null : `${health.longestLockWaitMs}ms`} />
              <Field label="Sample offset" value={`${health.offsetMinutes} min`} />
            </div>
          )}
        </DetailSection>

        <DetailSection title="Locks at the time" section={detail.locksAtTheTime}>
          {(locks) => (
            <ul className="space-y-1.5">
              {locks.map((lock) => (
                <li key={`${lock.detectedAt}-${lock.kind}`} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 break-words text-xs text-warm-700 [overflow-wrap:anywhere]">
                    {lock.kind.replace(/_/g, ' ')}
                    {lock.relationName ? ` · ${lock.relationName}` : ''}
                  </span>
                  <span className="shrink-0 font-fw-mono text-caption text-warm-600">
                    {lock.waitMs === null ? '—' : `${lock.waitMs}ms`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DetailSection>
      </div>

      <DetailSection title="Query health versus baseline" section={detail.queryHealth}>
        {(rows) => (
          <ul className="space-y-1.5">
            {rows.map((row) => (
              <li
                key={`${row.sampledAt}-${row.safeQueryClass}`}
                className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1"
              >
                <span className="min-w-0 break-words text-xs text-warm-700 [overflow-wrap:anywhere]">{row.safeQueryClass}</span>
                <div className="flex flex-wrap items-center gap-2">
                  {row.regressionFlags.map((flag) => (
                    <StatusPill key={flag} tone="warning" size="sm">
                      {flag.replace(/_/g, ' ')}
                    </StatusPill>
                  ))}
                  <span className="font-fw-mono text-caption text-warm-600">
                    {row.meanExecMsWindow === null ? '—' : `${row.meanExecMsWindow.toFixed(1)}ms`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DetailSection>

      <div className="grid gap-3 sm:grid-cols-2">
        <DetailSection title="Recent change" section={detail.recentChange}>
          {(change) => (
            <ul className="space-y-1">
              {change.migrationFilenames.map((filename) => (
                <li key={filename} className="break-all font-fw-mono text-caption text-warm-700">
                  {filename}
                </li>
              ))}
            </ul>
          )}
        </DetailSection>

        <DetailSection title="Data invariant" section={detail.dataInvariant}>
          {() => null}
        </DetailSection>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <DetailSection title="Sentry issue" section={detail.sentryIssue}>
          {() => null}
        </DetailSection>

        <div className="rounded-lg border border-border-subtle px-3 py-2.5">
          <span className="text-xs font-medium text-warm-700">Trace correlation</span>
          <div className="mt-2 grid grid-cols-1 gap-2">
            <Field label="Helm trace" value={identity.helmTraceId} />
            <Field label="Sentry trace" value={identity.sentryTraceId} />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border-subtle px-3 py-2.5">
        <span className="text-xs font-medium text-warm-700">Repair</span>
        <ul className="mt-2 space-y-1.5">
          {detail.repairLinks.map((link) => (
            <li key={`${link.kind}-${link.target}`} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-warm-700">{link.label}</span>
              {link.kind === 'href' ? (
                <Link
                  href={link.target}
                  className="inline-flex min-w-0 items-center break-all font-fw-mono text-caption text-accent-700 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 [@media(pointer:coarse)]:min-h-11"
                >
                  {link.target}
                </Link>
              ) : (
                <span className="min-w-0 break-all font-fw-mono text-caption text-warm-600">{link.target}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

async function IncidentDetailPanel({ fingerprint }: { fingerprint: string }) {
  const result = await fetchDatabaseIncidentDetail(fingerprint);

  if (result.status === 'unconfigured') {
    return (
      <PanelNoData
        label="Could not read database error store"
        description={result.error ?? 'This read failed this refresh for an unknown reason.'}
      />
    );
  }
  if (result.status === 'error' || !result.data) {
    return <PanelStale label="Incident detail" error={result.error} />;
  }

  return <IncidentDetailBody detail={result.data} />;
}

export default async function DatabasePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The admin gate runs before ANY data access, including reading the query
  // string — same order every other Bridge page uses.
  await requireSuperAdmin();

  const params = await searchParams;
  const rawIncident = params.incident;
  const incidentFingerprint = typeof rawIncident === 'string' && rawIncident.length > 0 ? rawIncident : null;
  const view = parseView('/admin/database', params.view);

  return (
    <div className="space-y-5">
      <AutoRefresh intervalMs={60_000} />
      {/* Title only: the view rail below carries each view's one line, and
          "zero-cost, no new vendor" is a build note, not something an operator
          reads on every visit. */}
      <TabHeader title="Database" />

      {/* A deep link carries `?incident=<fingerprint>` — from an alert, a
          Slack paste, another Bridge surface. It is the thing the operator
          asked for, so it renders above the rail under EVERY view rather than
          being reachable only from `posture`: a link that resolves to a page
          where its subject is invisible is a broken link with extra steps. */}
      {incidentFingerprint !== null ? (
        <>
          <Surface as="section" padding="sm" className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionLabel rule={false}>Incident detail</SectionLabel>
                {/* Drops `?incident=` and keeps the view — a hardcoded
                    /admin/database here would silently throw the operator back
                    to Posture from whichever view they were reading. */}
                <Link
                  href={hrefForView('/admin/database', view, { ...params, incident: undefined })}
                  className="inline-flex items-center text-xs text-accent-700 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 [@media(pointer:coarse)]:min-h-11"
                >
                  ← back to all sections
                </Link>
              </div>
              <DetailsDisclosure className="mt-1">
                <p>
                  One fingerprint, every source that has something to say about it. A section whose source is not
                  shipped or cannot be read says so — it never renders a zero.
                </p>
              </DetailsDisclosure>
              <div className="mt-3">
                <PanelBoundary title="Incident detail" skeleton={<PanelPageSkeleton rows={8} />}>
                  <IncidentDetailPanel fingerprint={incidentFingerprint} />
                </PanelBoundary>
              </div>
          </Surface>
        </>
      ) : null}

      <ViewRail
        host="/admin/database"
        active={view}
        ariaLabel="Database view"
        searchParams={params}
        labels={{ posture: 'Posture', performance: 'Performance', schema: 'Schema' }}
        descriptions={{
          posture: 'Is the database healthy right now — Mission Control, deduped failures, telemetry, locks, platform metrics, alert policy.',
          performance: 'What is slow and why — query deltas, slow statements, index suggestions, unused indexes, bloat, table health, jobs.',
          schema: 'Shape and safety — RLS/SECURITY DEFINER coverage, migration drift, Supabase advisors, on-demand log evidence.',
        }}
      />

      {renderView()}
    </div>
  );

  /**
   * One branch per registered view. This page was a nineteen-section scroll:
   * every section always mounted, so reaching "is anything slow" meant
   * scrolling past Mission Control, deduped errors and telemetry health first,
   * and the three questions it answers — is it healthy, is it slow, is it safe
   * — had no boundary between them. Same sections, same reads, three framings.
   */
  function renderView() {
    switch (view as AdminViewOf<'/admin/database'>) {
      case 'posture':
        return (
          <div className="space-y-4">
            <DbSection title="Changed since yesterday">
              <PanelBoundary title="Changed since yesterday" skeleton={<PanelPageSkeleton rows={1} />}>
                <ChangedSinceYesterdayStrip />
              </PanelBoundary>
            </DbSection>

            <DbSection title="Mission Control">
              <PanelBoundary title="Mission Control" skeleton={<PanelPageSkeleton />}>
                <MissionControlPanel />
              </PanelBoundary>
            </DbSection>

            <DbSection
              title="Database Errors"
              note={
                <>
                  Grouped by fingerprint (service, feature, operation, RPC/relation, code) — not by message.
                </>
              }
            >
              <PanelBoundary title="Database Errors" skeleton={<PanelPageSkeleton rows={5} />}>
                <ErrorsPanel />
              </PanelBoundary>
            </DbSection>

            <DbSection
              title="Telemetry Health"
              note={
                <>
                  Is the observability system itself watching? A blind or stale required source caps the overall state below green.
                </>
              }
            >
              <PanelBoundary title="Telemetry Health" skeleton={<PanelPageSkeleton rows={5} />}>
                <TelemetryHealthPanel />
              </PanelBoundary>
            </DbSection>

            <DbSection
              title="Locks & Transactions"
              note={
                <>
                  Threshold-crossing lock waits, long-active queries, idle-in-transaction, and deadlocks. Never full query text.
                </>
              }
            >
              <PanelBoundary title="Locks & Transactions" skeleton={<PanelPageSkeleton rows={5} />}>
                <LocksPanel />
              </PanelBoundary>
            </DbSection>

            <DbSection
              title="Platform"
              note={
                <>
                  Supabase Metrics API — CPU, memory, connection pool, DB size. $0-cost: read-only, 60s cache.
                </>
              }
            >
              <PanelBoundary title="Platform" skeleton={<PanelPageSkeleton />}>
                <PlatformPanel />
              </PanelBoundary>
            </DbSection>

            <DbSection
              title="Alert policy"
              note={
                <>
                  Every declared rule, always — a rule with no Bridge-level data source reads &quot;unknown&quot;, never a
                  fabricated &quot;clear&quot;.
                </>
              }
            >
              <PanelBoundary title="Alert policy" skeleton={<PanelPageSkeleton rows={8} />}>
                <AlertPolicyPanel />
              </PanelBoundary>
            </DbSection>
          </div>
        );
      case 'performance':
        return (
          <div className="space-y-4">
            <DbSection
              title="Query Performance"
              note={
                <>
                  Most recent 15-minute Top-K window by pg_stat_statements delta. No raw query text is ever stored.
                </>
              }
            >
              <PanelBoundary title="Query Performance" skeleton={<PanelPageSkeleton rows={5} />}>
                <PerformancePanel />
              </PanelBoundary>
            </DbSection>

            <DbSection
              title="Slow statements"
              note={
                <>
                  Top 10 by mean time and top 10 by total time (of the stored top 25), with a 7-day mean-time sparkline per
                  fingerprint. A statement over 500ms mean pages Sentry once per day.
                </>
              }
            >
              <PanelBoundary title="Slow statements" skeleton={<PanelPageSkeleton rows={5} />}>
                <SlowStatementsPanel />
              </PanelBoundary>
            </DbSection>

            <DbSection
              title="Index suggestions"
              note={
                <>
                  index_advisor (via hypopg) run against the latest captured statements. Skipped, never CREATE EXTENSION'd,
                  when the extension is not installed.
                </>
              }
            >
              <PanelBoundary title="Index suggestions" skeleton={<PanelPageSkeleton rows={5} />}>
                <IndexSuggestionsPanel />
              </PanelBoundary>
            </DbSection>

            <DbSection
              title="Unused indexes"
              note={
                <>
                  Zero scans since stats reset, excluding primary-key and unique-constraint indexes.
                </>
              }
            >
              <PanelBoundary title="Unused indexes" skeleton={<PanelPageSkeleton rows={5} />}>
                <UnusedIndexesPanel />
              </PanelBoundary>
            </DbSection>

            <DbSection
              title="Bloat"
              note={
                <>
                  pgstattuple_approx over the 20 largest tables. Skipped, never CREATE EXTENSION'd, when pgstattuple is not
                  installed.
                </>
              }
            >
              <PanelBoundary title="Bloat" skeleton={<PanelPageSkeleton rows={5} />}>
                <BloatPanel />
              </PanelBoundary>
            </DbSection>

            <DbSection
              title="Table Health"
              note={
                <>
                  Dead tuples, vacuum/analyze recency, scan patterns, and write concentration for the largest relations.
                </>
              }
            >
              <PanelBoundary title="Table Health" skeleton={<PanelPageSkeleton rows={5} />}>
                <TableHealthPanel />
              </PanelBoundary>
            </DbSection>

            <DbSection
              title="Postgres scheduled jobs"
              note={
                <>
                  pg_cron job history and pg_net queue/response health. Counts only — never raw job SQL or response
                  payloads. This is Postgres-level scheduling only (1 job today: purge-admin-event-telemetry) —
                  application job queues (pgmq, Inngest) live on{' '}
                  <Link href="/admin/jobs" className="text-accent-700 underline">
                    Jobs &amp; Integrity →
                  </Link>
                  .
                </>
              }
            >
              <PanelBoundary title="Postgres scheduled jobs" skeleton={<PanelPageSkeleton rows={5} />}>
                <JobsPanel />
              </PanelBoundary>
            </DbSection>
          </div>
        );
      case 'schema':
        return (
          <div className="space-y-4">
            <DbSection
              title="Coverage"
              note={
                <>
                  RLS-enabled tables with zero policies, and public SECURITY DEFINER functions still executable by
                  anon/authenticated.
                </>
              }
            >
              <PanelBoundary title="Coverage" skeleton={<PanelPageSkeleton rows={5} />}>
                <CoveragePanel />
              </PanelBoundary>
            </DbSection>

            <DbSection
              title="Drift"
              note={
                <>
                  Migration ledger count and last health-sample time — the fallback view when no live schema/types/ledger
                  drift verdict is reachable from this Bridge deployment.
                </>
              }
            >
              <PanelBoundary title="Drift" skeleton={<PanelPageSkeleton rows={3} />}>
                <DriftPanel />
              </PanelBoundary>
            </DbSection>

            <DbSection
              title="Advisors"
              note={
                <>
                  Supabase Security and Performance Advisors, deduped by (advisor type, name, object). No persistence this
                  phase — re-fetched live, 10-minute cache.
                </>
              }
            >
              <PanelBoundary title="Advisors" skeleton={<PanelPageSkeleton rows={5} />}>
                <AdvisorsPanel />
              </PanelBoundary>
            </DbSection>

            <DbSection
              title="Fetch Supabase evidence"
              note={
                <>
                  On-demand only, never scheduled. Disabled by default (HELM_SUPABASE_LOG_EVIDENCE_ENABLED). One bounded
                  query, sanitized, discarded after a &lt;= 40-line summary.
                </>
              }
            >
              <LogEvidenceForm />
            </DbSection>
          </div>
        );
    }
  }
}
