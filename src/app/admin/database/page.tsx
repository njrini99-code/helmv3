import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchDatabaseMissionControl, type CollectorHealth } from '@/lib/admin/database/overview';
import { fetchDatabaseErrors, type DbErrorFingerprintGroup } from '@/lib/admin/database/errors';
import { fetchQueryPerformance, type StatDeltaRow } from '@/lib/admin/database/performance';
import { fetchLockIncidents, type LockIncidentRow } from '@/lib/admin/database/locks';
import { fetchTableHealth } from '@/lib/admin/database/tables';
import { fetchJobsHealth, type CronJobDisplayRow } from '@/lib/admin/database/jobs';
import { fetchTelemetryHealth, type TelemetrySourceRow } from '@/lib/admin/database/telemetry';
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
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border-subtle px-3 py-2.5">
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
      </div>
    </div>
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
          {row.callsDelta ?? 0} calls · mean {row.meanExecMsWindow ? row.meanExecMsWindow.toFixed(1) : '—'}ms · max{' '}
          {row.maxExecMsObserved ? row.maxExecMsObserved.toFixed(0) : '—'}ms
        </p>
      </div>
      <p className="shrink-0 font-fw-mono text-sm font-medium text-warm-800">
        {row.totalExecMsDelta ? Math.round(row.totalExecMsDelta).toLocaleString() : 0}ms
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


export default async function DatabasePage() {
  await requireSuperAdmin();

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
