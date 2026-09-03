import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchDatabaseMissionControl, type CollectorHealth } from '@/lib/admin/database/overview';
import { fetchDatabaseErrors, type DbErrorFingerprintGroup } from '@/lib/admin/database/errors';
import { fetchQueryPerformance, type StatDeltaRow } from '@/lib/admin/database/performance';
import { Surface, Inset, StatTile, StatusPill, InlineNotice, Eyebrow, type FwStatusTone } from '@/components/fairway';
import { DatelineRule } from '@/components/ui/card';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelPageSkeleton } from '../_components/PanelSkeletons';
import { PanelNoData, PanelAllClear, PanelStale } from '../_components/PanelStates';
import { AutoRefresh } from '../_components/AutoRefresh';
import { LocalTime } from '../_components/LocalTime';

export const dynamic = 'force-dynamic';

/**
 * Database Mission Control — brief §35's Bridge database views (A, B, C of
 * A-G; D Locks, E Integrity's full workflow contracts, F Jobs/Webhooks and
 * G Telemetry Health beyond collector freshness are later phases — see
 * docs/observability/SUPABASE_OBSERVABILITY_MEASURED_TRUTH.md §7). Every
 * number on this page is read from what the collectors already wrote —
 * nothing here queries production directly.
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

  const { latestSample, collectors } = result.data;

  if (!latestSample) {
    return <PanelNoData label="No health samples yet" description="The collector has not written its first row." />;
  }

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
    </div>
  );
}
