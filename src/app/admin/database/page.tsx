import Link from 'next/link';

import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchDatabaseMissionControl, type CollectorHealth } from '@/lib/admin/database/overview';
import { fetchDatabaseErrors, type DbErrorFingerprintGroup } from '@/lib/admin/database/errors';
import { fetchQueryPerformance, type StatDeltaRow } from '@/lib/admin/database/performance';
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
import { Surface, Inset, StatTile, StatusPill, InlineNotice, Eyebrow, type FwStatusTone } from '@/components/fairway';
import { DatelineRule } from '@/components/ui/card';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelPageSkeleton } from '../_components/PanelSkeletons';
import { PanelNoData, PanelAllClear, PanelStale } from '../_components/PanelStates';
import { AutoRefresh } from '../_components/AutoRefresh';
import { LocalTime } from '../_components/LocalTime';
import { LogEvidenceForm } from './LogEvidenceForm';

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

const COLLECTOR_LABEL: Record<string, string> = {
  'db-health-sampler': 'Health sampler (5m)',
  'db-stat-delta': 'Query delta (15m)',
  'db-observability-prune': 'Retention prune (daily)',
};

function CollectorChip({ collector }: { collector: CollectorHealth }) {
  const tone: FwStatusTone =
    collector.lastStatus === 'completed' ? 'success' : collector.lastStatus === 'failed' ? 'danger' : 'neutral';
  return (
    <div className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2">
      <span className="text-xs font-medium text-warm-700">{COLLECTOR_LABEL[collector.jobType] ?? collector.jobType}</span>
      <div className="flex items-center gap-2">
        {collector.lastRunAt ? (
          <span className="font-fw-mono text-caption text-warm-500">
            <LocalTime iso={collector.lastRunAt} />
          </span>
        ) : null}
        <StatusPill tone={tone} size="sm" dot>
          {collector.lastStatus === 'never_run' ? 'never run' : collector.lastStatus}
        </StatusPill>
      </div>
    </div>
  );
}

async function MissionControlPanel() {
  const result = await fetchDatabaseMissionControl();

  if (result.status === 'unconfigured') {
    return (
      <PanelNoData
        label="Database health sampler not shipped yet"
        description={result.error ?? 'Migration HELD — see supabase/migrations/HELD.md'}
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
        <div className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2">
          <span className="text-xs font-medium text-warm-700">Connection saturation</span>
          <StatusPill tone={saturationTone} size="sm" dot>
            {rules.connectionSaturation.level}
            {rules.connectionSaturation.sustainedHigh ? ' · sustained' : ''}
          </StatusPill>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2">
          <span className="text-xs font-medium text-warm-700">Rollback rate</span>
          {rules.rollbackRate.baselineStatus === 'collecting' ? (
            <StatusPill tone="neutral" size="sm" dot>
              baseline collecting
            </StatusPill>
          ) : (
            <StatusPill tone={rules.rollbackRate.isRegression ? 'danger' : 'success'} size="sm" dot>
              {rules.rollbackRate.isRegression ? 'regression' : 'normal'}
            </StatusPill>
          )}
        </div>
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
  return (
    <Link
      href={`/admin/database?incident=${encodeURIComponent(group.fingerprint)}`}
      className="flex items-start justify-between gap-3 rounded-lg border border-border-subtle px-3 py-2.5 transition-colors hover:border-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <StatusPill tone={SEVERITY_TONE[group.severity] ?? 'neutral'} size="sm">
            {group.severity}
          </StatusPill>
          <span className="truncate font-fw-mono text-xs text-warm-800">{group.errorCode ?? 'unknown'}</span>
        </div>
        <p className="mt-1 truncate text-sm text-warm-700">
          {group.feature} · {group.service}
        </p>
        <p className="mt-0.5 truncate text-xs text-warm-500">{group.latest.normalizedMessage}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-fw-mono text-sm font-medium text-warm-800">{group.totalOccurrences.toLocaleString()}×</p>
        <p className="font-fw-mono text-caption text-warm-500">
          <LocalTime iso={group.lastSeenAt} />
        </p>
        <p className="mt-0.5 text-caption text-warm-500">diagnose →</p>
      </div>
    </Link>
  );
}

async function ErrorsPanel() {
  const result = await fetchDatabaseErrors();

  if (result.status === 'unconfigured') {
    return (
      <PanelNoData
        label="Database error store not shipped yet"
        description={result.error ?? 'Migration HELD — see supabase/migrations/HELD.md'}
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
    <div className="space-y-2">
      {result.data.groups.slice(0, 25).map((group) => (
        <ErrorGroupRow key={group.fingerprint} group={group} />
      ))}
    </div>
  );
}

function StatDeltaRowView({ row }: { row: StatDeltaRow }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-warm-700">{row.safeQueryClass}</span>
          <span className="rounded-md bg-surface-sunken px-1.5 py-0.5 font-fw-mono text-caption text-warm-500">
            {row.sourceClass}
          </span>
          {row.regressionFlags.map((flag) => (
            <StatusPill key={flag} tone="warning" size="sm">
              {flag.replace(/_/g, ' ')}
            </StatusPill>
          ))}
        </div>
        <p className="mt-0.5 font-fw-mono text-caption text-warm-500">
          {/* `?? 0` here said "0 calls" for a window with NO prior state to diff
              against — a first observation rendered as a measured zero. Every
              row on this panel is flagged `new query` on a fresh collector, so
              the whole list read "0 calls · 0ms" beside a max of 26 seconds.
              null means no delta exists; it is not zero activity. */}
          {row.callsDelta === null ? '—' : row.callsDelta} calls · mean{' '}
          {row.meanExecMsWindow ? row.meanExecMsWindow.toFixed(1) : '—'}ms · max{' '}
          {row.maxExecMsObserved ? row.maxExecMsObserved.toFixed(0) : '—'}ms
        </p>
      </div>
      <p className="shrink-0 font-fw-mono text-sm font-medium text-warm-800">
        {/* Truthiness collapsed BOTH null and a genuine 0 into "0ms". A delta of
            exactly zero is a real measurement — the query ran and cost no more
            than last window — and is not the same fact as "no prior window". */}
        {row.totalExecMsDelta === null || row.totalExecMsDelta === undefined
          ? '—'
          : `${Math.round(row.totalExecMsDelta).toLocaleString()}ms`}
      </p>
    </div>
  );
}

async function PerformancePanel() {
  const result = await fetchQueryPerformance();

  if (result.status === 'unconfigured') {
    return (
      <PanelNoData
        label="Query delta engine not shipped yet"
        description={result.error ?? 'Migration HELD — see supabase/migrations/HELD.md'}
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
      {result.data.recentRegressions.length > 0 ? (
        <InlineNotice tone="warning" title="Regressions in the last 24h">
          {result.data.recentRegressions.length} flagged window(s) — shown inline below with their flags.
        </InlineNotice>
      ) : null}
      <div className="space-y-2">
        {result.data.latest.slice(0, 20).map((row) => (
          <StatDeltaRowView key={row.id} row={row} />
        ))}
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
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border-subtle px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <StatusPill tone={incident.severity === 'critical' ? 'danger' : 'warning'} size="sm">
            {incident.kind.replace(/_/g, ' ')}
          </StatusPill>
          <span className="rounded-md bg-surface-sunken px-1.5 py-0.5 font-fw-mono text-caption text-warm-500">
            {incident.roleClass}
          </span>
          {incident.resolvedAt ? (
            <StatusPill tone="success" size="sm">
              resolved
            </StatusPill>
          ) : null}
        </div>
        <p className="mt-1 truncate text-sm text-warm-700">{incident.blockedQueryClass ?? '—'}</p>
        {incident.blockingQueryClass ? (
          <p className="mt-0.5 truncate text-xs text-warm-500">blocked by {incident.blockingQueryClass}</p>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        {incident.waitMs !== null ? (
          <p className="font-fw-mono text-sm font-medium text-warm-800">{(incident.waitMs / 1000).toFixed(1)}s</p>
        ) : null}
        <p className="font-fw-mono text-caption text-warm-500">
          <LocalTime iso={incident.detectedAt} />
        </p>
      </div>
    </div>
  );
}

async function LocksPanel() {
  const result = await fetchLockIncidents();

  if (result.status === 'unconfigured') {
    return (
      <PanelNoData
        label="Lock incident store not shipped yet"
        description={result.error ?? 'Migration HELD — see supabase/migrations/HELD.md'}
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
      <div className="space-y-2">
        {result.data.incidents.slice(0, 25).map((incident) => (
          <LockIncidentRowView key={incident.id} incident={incident} />
        ))}
      </div>
    </div>
  );
}

async function TableHealthPanel() {
  const result = await fetchTableHealth();

  if (result.status === 'unconfigured') {
    return (
      <PanelNoData
        label="Table health collector not shipped yet"
        description={result.error ?? 'Migration HELD — see supabase/migrations/HELD.md'}
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
        <div className="space-y-2">
          {result.data.warnings.map((warning, idx) => (
            <div
              key={`${warning.kind}-${warning.relationName}-${idx}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <StatusPill tone="warning" size="sm">
                    {warning.kind.replace(/_/g, ' ')}
                  </StatusPill>
                  <span className="truncate text-xs font-medium text-warm-700">{warning.relationName}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-warm-500">{warning.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CronJobRowView({ job }: { job: CronJobDisplayRow }) {
  const tone: FwStatusTone = job.findings.length === 0 ? 'success' : job.findings.includes('never_run') ? 'neutral' : 'danger';
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border-subtle px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-warm-800">{job.jobName}</span>
          <span className="rounded-md bg-surface-sunken px-1.5 py-0.5 font-fw-mono text-caption text-warm-500">
            {job.schedule}
          </span>
        </div>
        {job.findings.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {job.findings.map((finding) => (
              <StatusPill key={finding} tone="warning" size="sm">
                {finding.replace(/_/g, ' ')}
              </StatusPill>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-xs text-warm-500">healthy</p>
        )}
      </div>
      <StatusPill tone={tone} size="sm" dot>
        {job.lastRunStatus ?? 'never run'}
      </StatusPill>
    </div>
  );
}

async function JobsPanel() {
  const result = await fetchJobsHealth();

  if (result.status === 'unconfigured') {
    return (
      <PanelNoData
        label="Jobs & webhooks read not shipped yet"
        description={result.error ?? 'Migration HELD — see supabase/migrations/HELD.md'}
      />
    );
  }
  if (result.status === 'error' || !result.data) {
    return <PanelStale label="Jobs & Webhooks" error={result.error} />;
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
        <div className="space-y-2">
          {cronJobs.map((job) => (
            <CronJobRowView key={job.jobId} job={job} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <StatTile
          label="PG_NET QUEUE"
          value={netQueueCapability === 'available' ? (netQueueDepth ?? 0) : undefined}
          tone={netFindings.includes('backlog_anomaly') ? 'accent' : 'neutral'}
          mono
        />
        <div className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2">
          <span className="text-xs font-medium text-warm-700">pg_net responses (24h)</span>
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
        </div>
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
    <div className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2">
      <span className="text-xs font-medium text-warm-700">{source.name}</span>
      <div className="flex items-center gap-2">
        {source.lastSampleAt ? (
          <span className="font-fw-mono text-caption text-warm-500">
            <LocalTime iso={source.lastSampleAt} />
          </span>
        ) : null}
        <StatusPill tone={FRESHNESS_TONE[source.state]} size="sm" dot>
          {source.state}
        </StatusPill>
      </div>
    </div>
  );
}

async function TelemetryHealthPanel() {
  const result = await fetchTelemetryHealth();

  if (result.status === 'unconfigured') {
    return (
      <PanelNoData
        label="Telemetry health not shipped yet"
        description={result.error ?? 'Migration HELD — see supabase/migrations/HELD.md'}
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
      <div className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2.5">
        <span className="text-sm font-medium text-warm-800">Overall telemetry state</span>
        <StatusPill tone={overallTone} size="sm" dot>
          {overall}
        </StatusPill>
      </div>

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
            <div key={size.tableName} className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2">
              <span className="truncate font-fw-mono text-xs text-warm-700">{size.tableName}</span>
              <span className="shrink-0 font-fw-mono text-caption text-warm-500">
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
      <p className="text-xs text-warm-500">
        Allow-list is docs-derived, not live-verified — see{' '}
        <span className="font-fw-mono">src/lib/observability/supabase/metrics-api.ts</span> header. A missing metric
        renders as a blank tile, never a fabricated 0.
      </p>
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

function AdvisorRow({ finding }: { finding: AdvisorFinding }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border-subtle px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <StatusPill tone={ADVISOR_LEVEL_TONE[finding.level] ?? 'neutral'} size="sm">
            {finding.level}
          </StatusPill>
          <span className="rounded-md bg-surface-sunken px-1.5 py-0.5 font-fw-mono text-caption text-warm-500">
            {finding.advisorType}
          </span>
        </div>
        <p className="mt-1 truncate text-sm text-warm-700">{finding.name}</p>
        {finding.object ? <p className="mt-0.5 truncate font-fw-mono text-xs text-warm-500">{finding.object}</p> : null}
      </div>
    </div>
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
    <div className="space-y-2">
      {result.data.findings.slice(0, 25).map((finding, index) => (
        <AdvisorRow key={`${finding.advisorType}-${finding.name}-${finding.object ?? index}`} finding={finding} />
      ))}
    </div>
  );
}

const ALERT_STATE_TONE: Record<EvaluatedAlert['state'], FwStatusTone> = {
  firing: 'danger',
  clear: 'success',
  unknown: 'neutral',
};

function AlertRow({ alert }: { alert: EvaluatedAlert }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-surface-sunken px-1.5 py-0.5 font-fw-mono text-caption text-warm-500">
            {alert.rule.severity}
          </span>
          <span className="truncate text-xs font-medium text-warm-700">{alert.rule.description}</span>
        </div>
        {alert.state !== 'clear' && (alert.evidence || alert.reason) ? (
          <p className="mt-0.5 truncate text-xs text-warm-500">{alert.evidence ?? alert.reason}</p>
        ) : null}
      </div>
      <StatusPill tone={ALERT_STATE_TONE[alert.state]} size="sm">
        {alert.state}
      </StatusPill>
    </div>
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
      <div className="space-y-1.5">
        {alerts.map((alert) => (
          <AlertRow key={alert.rule.id} alert={alert} />
        ))}
      </div>
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
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-warm-700">{title}</span>
        <StatusPill tone={SECTION_STATE_TONE[section.state] ?? 'neutral'} size="sm" dot>
          {SECTION_STATE_LABEL[section.state]}
        </StatusPill>
      </div>
      {section.state === 'ok' && section.data !== null ? (
        <div className="mt-2">{children(section.data)}</div>
      ) : (
        <p className="mt-1.5 text-xs text-warm-600">{section.note ?? 'No detail available.'}</p>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div>
      <p className="text-caption uppercase tracking-wide text-warm-600">{label}</p>
      <p className="font-fw-mono text-xs text-warm-800">{value ?? 'unknown'}</p>
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
          <span className="font-fw-mono text-xs text-warm-800">{identity.primaryClass}</span>
        </div>
        <p className="mt-1 text-sm font-medium text-warm-900">{identity.title}</p>
        <p className="mt-0.5 break-all font-fw-mono text-caption text-warm-600">{identity.fingerprint}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="OCCURRENCES" value={identity.occurrences} tone="neutral" mono />
        <StatTile label="BUCKETS" value={detail.bucketCount} tone="neutral" mono />
        <div className="rounded-lg border border-border-subtle px-3 py-2.5">
          <Field label="SQLSTATE / code" value={identity.sqlstate ?? identity.errorCode} />
        </div>
        <div className="rounded-lg border border-border-subtle px-3 py-2.5">
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
          <div className="flex items-center gap-2">
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
            <li key={reason} className="text-xs text-warm-600">
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
            <div key={stage.stage} className="flex items-start justify-between gap-2">
              <span className="text-xs text-warm-700">{DB_WORKFLOW_STAGE_LABEL[stage.stage]}</span>
              <div className="flex min-w-0 items-center gap-2">
                {stage.detail ? <span className="truncate text-caption text-warm-600">{stage.detail}</span> : null}
                <StatusPill tone={STAGE_TONE[stage.status] ?? 'neutral'} size="sm" dot>
                  {stage.status.replace(/-/g, ' ')}
                </StatusPill>
              </div>
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
          <p className="mt-1.5 text-xs text-warm-600">{detail.authorization.explanation}</p>
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
            <p className="text-xs text-warm-600">{drift.explanation}</p>
            <div className="grid grid-cols-3 gap-2">
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
              <span className="font-fw-mono text-caption text-warm-600">
                {correlation.releaseSha ?? 'no release'} · via {correlation.releaseIdentitySource}
              </span>
            </div>
            <p className="text-xs text-warm-600">{correlation.because}</p>
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
                <li key={`${lock.detectedAt}-${lock.kind}`} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-warm-700">
                    {lock.kind.replace(/_/g, ' ')}
                    {lock.relationName ? ` · ${lock.relationName}` : ''}
                  </span>
                  <span className="font-fw-mono text-caption text-warm-600">
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
              <li key={`${row.sampledAt}-${row.safeQueryClass}`} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs text-warm-700">{row.safeQueryClass}</span>
                <div className="flex shrink-0 items-center gap-2">
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
                  className="font-fw-mono text-caption text-accent-700 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
                >
                  {link.target}
                </Link>
              ) : (
                <span className="font-fw-mono text-caption text-warm-600">{link.target}</span>
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
        label="Database error store not shipped yet"
        description={result.error ?? 'Migration HELD — see supabase/migrations/HELD.md'}
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

  return (
    <div className="space-y-5">
      <AutoRefresh intervalMs={60_000} />
      <div>
        <h1 className="text-lg font-semibold text-warm-900">Database</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-warm-600">
          Postgres health, deduped Supabase/PostgREST failures, and query-performance deltas — read from what the
          collectors already wrote. Zero-cost: no log drain, no new vendor.
        </p>
      </div>

      {incidentFingerprint !== null ? (
        <>
          <Surface>
            <Inset>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Eyebrow as="h2">Incident detail</Eyebrow>
                <Link
                  href="/admin/database"
                  className="text-xs text-accent-700 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
                >
                  ← back to all sections
                </Link>
              </div>
              <p className="mt-1 text-xs text-warm-600">
                One fingerprint, every source that has something to say about it. A section whose source is not shipped
                or cannot be read says so — it never renders a zero.
              </p>
              <div className="mt-3">
                <PanelBoundary title="Incident detail" skeleton={<PanelPageSkeleton rows={8} />}>
                  <IncidentDetailPanel fingerprint={incidentFingerprint} />
                </PanelBoundary>
              </div>
            </Inset>
          </Surface>

          <DatelineRule />
        </>
      ) : null}

      <Surface>
        <Inset>
          <Eyebrow as="h2">Mission Control</Eyebrow>
          <div className="mt-3">
            <PanelBoundary title="Mission Control" skeleton={<PanelPageSkeleton />}>
              <MissionControlPanel />
            </PanelBoundary>
          </div>
        </Inset>
      </Surface>

      <DatelineRule />

      <Surface>
        <Inset>
          <Eyebrow as="h2">Database Errors</Eyebrow>
          <p className="mt-1 text-xs text-warm-500">
            Grouped by fingerprint (service, feature, operation, RPC/relation, code) — not by message.
          </p>
          <div className="mt-3">
            <PanelBoundary title="Database Errors" skeleton={<PanelPageSkeleton rows={5} />}>
              <ErrorsPanel />
            </PanelBoundary>
          </div>
        </Inset>
      </Surface>

      <DatelineRule />

      <Surface>
        <Inset>
          <Eyebrow as="h2">Query Performance</Eyebrow>
          <p className="mt-1 text-xs text-warm-500">
            Most recent 15-minute Top-K window by pg_stat_statements delta. No raw query text is ever stored.
          </p>
          <div className="mt-3">
            <PanelBoundary title="Query Performance" skeleton={<PanelPageSkeleton rows={5} />}>
              <PerformancePanel />
            </PanelBoundary>
          </div>
        </Inset>
      </Surface>

      <DatelineRule />

      <Surface>
        <Inset>
          <Eyebrow as="h2">Locks &amp; Transactions</Eyebrow>
          <p className="mt-1 text-xs text-warm-500">
            Threshold-crossing lock waits, long-active queries, idle-in-transaction, and deadlocks. Never full query text.
          </p>
          <div className="mt-3">
            <PanelBoundary title="Locks & Transactions" skeleton={<PanelPageSkeleton rows={5} />}>
              <LocksPanel />
            </PanelBoundary>
          </div>
        </Inset>
      </Surface>

      <DatelineRule />

      <Surface>
        <Inset>
          <Eyebrow as="h2">Table Health</Eyebrow>
          <p className="mt-1 text-xs text-warm-500">
            Dead tuples, vacuum/analyze recency, scan patterns, and write concentration for the largest relations.
          </p>
          <div className="mt-3">
            <PanelBoundary title="Table Health" skeleton={<PanelPageSkeleton rows={5} />}>
              <TableHealthPanel />
            </PanelBoundary>
          </div>
        </Inset>
      </Surface>

      <DatelineRule />

      <Surface>
        <Inset>
          <Eyebrow as="h2">Jobs &amp; Webhooks</Eyebrow>
          <p className="mt-1 text-xs text-warm-500">
            pg_cron job history and pg_net queue/response health. Counts only — never raw job SQL or response payloads.
          </p>
          <div className="mt-3">
            <PanelBoundary title="Jobs & Webhooks" skeleton={<PanelPageSkeleton rows={5} />}>
              <JobsPanel />
            </PanelBoundary>
          </div>
        </Inset>
      </Surface>

      <DatelineRule />

      <Surface>
        <Inset>
          <Eyebrow as="h2">Telemetry Health</Eyebrow>
          <p className="mt-1 text-xs text-warm-500">
            Is the observability system itself watching? A blind or stale required source caps the overall state below green.
          </p>
          <div className="mt-3">
            <PanelBoundary title="Telemetry Health" skeleton={<PanelPageSkeleton rows={5} />}>
              <TelemetryHealthPanel />
            </PanelBoundary>
          </div>
        </Inset>
      </Surface>

      <DatelineRule />

      <Surface>
        <Inset>
          <Eyebrow as="h2">Platform</Eyebrow>
          <p className="mt-1 text-xs text-warm-500">
            Supabase Metrics API — CPU, memory, connection pool, DB size. $0-cost: read-only, 60s cache.
          </p>
          <div className="mt-3">
            <PanelBoundary title="Platform" skeleton={<PanelPageSkeleton />}>
              <PlatformPanel />
            </PanelBoundary>
          </div>
        </Inset>
      </Surface>

      <DatelineRule />

      <Surface>
        <Inset>
          <Eyebrow as="h2">Advisors</Eyebrow>
          <p className="mt-1 text-xs text-warm-500">
            Supabase Security and Performance Advisors, deduped by (advisor type, name, object). No persistence this
            phase — re-fetched live, 10-minute cache.
          </p>
          <div className="mt-3">
            <PanelBoundary title="Advisors" skeleton={<PanelPageSkeleton rows={5} />}>
              <AdvisorsPanel />
            </PanelBoundary>
          </div>
        </Inset>
      </Surface>

      <DatelineRule />

      <Surface>
        <Inset>
          <Eyebrow as="h2">Alert policy</Eyebrow>
          <p className="mt-1 text-xs text-warm-500">
            Every declared rule, always — a rule with no Bridge-level data source reads &quot;unknown&quot;, never a
            fabricated &quot;clear&quot;.
          </p>
          <div className="mt-3">
            <PanelBoundary title="Alert policy" skeleton={<PanelPageSkeleton rows={8} />}>
              <AlertPolicyPanel />
            </PanelBoundary>
          </div>
        </Inset>
      </Surface>

      <DatelineRule />

      <Surface>
        <Inset>
          <Eyebrow as="h2">Fetch Supabase evidence</Eyebrow>
          <p className="mt-1 text-xs text-warm-500">
            On-demand only, never scheduled. Disabled by default (HELM_SUPABASE_LOG_EVIDENCE_ENABLED). One bounded
            query, sanitized, discarded after a &lt;= 40-line summary.
          </p>
          <div className="mt-3">
            <LogEvidenceForm />
          </div>
        </Inset>
      </Surface>
    </div>
  );
}
