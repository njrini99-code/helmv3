'use client';

import { cn } from '@/lib/utils';
import {
  IconActivity,
  IconBrain,
  IconDatabase,
  IconGauge,
  IconLock,
  IconWarning,
  IconChartBar,
  IconCheckCircle2,
  IconClock,
  IconGlobe,
  IconRefresh,
  IconRocket,
  IconSparkles,
  IconZap,
} from '@/components/icons';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { HealthCheckGrid } from './HealthCheckGrid';
import { CoachHelmHealthCard } from './CoachHelmHealthCard';
import InfraHealthCard from './InfraHealthCard';
import { ErrorFeed } from './ErrorFeed';
import { SectionHeader } from '@/components/golf/dashboard/premium-components';

interface Props {
  data: AdminDashboardData;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

type HealthStatus = 'stable' | 'watch' | 'critical';

function getOverallStatus(data: AdminDashboardData): HealthStatus {
  if (data.errorLogs.incidentCounts.openCritical > 0) return 'critical';
  if (
    data.errorLogs.incidentCounts.open > 0 ||
    data.loginSecurity.lockedAccounts > 0 ||
    (data.infraHealth?.totals?.avgResponseMs ?? 0) > 3000
  ) {
    return 'watch';
  }
  return 'stable';
}

function formatRelativeTime(value: string | null): string {
  if (!value) return 'Never';
  const diffMin = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

// ─── Section 1: System Overview ─────────────────────────────────────────────

const statusConfig: Record<HealthStatus, { label: string; dotClass: string; badgeClass: string }> = {
  stable: {
    label: 'Stable',
    dotClass: 'bg-primary-500',
    badgeClass: 'border-primary-200 bg-primary-50/80 text-primary-700',
  },
  watch: {
    label: 'Watch',
    dotClass: 'bg-amber-500',
    badgeClass: 'border-amber-200 bg-amber-50/80 text-amber-700',
  },
  critical: {
    label: 'Critical',
    dotClass: 'bg-red-500',
    badgeClass: 'border-red-200 bg-red-50/80 text-red-700',
  },
};

interface StatTileProps {
  label: string;
  value: string | number;
  tone?: 'default' | 'ok' | 'warn' | 'danger';
  icon?: React.ReactNode;
  tooltip?: string;
}

function StatTile({ label, value, tone = 'default', icon, tooltip }: StatTileProps) {
  return (
    <div
      title={tooltip}
      className={cn(
        'flex min-w-0 flex-col gap-0.5 rounded-xl border px-3 py-2.5',
        tone === 'danger'
          ? 'border-red-100 bg-red-50/60'
          : tone === 'warn'
            ? 'border-amber-100 bg-amber-50/60'
            : tone === 'ok'
              ? 'border-primary-100 bg-primary-50/60'
              : 'border-white/30 bg-white/55'
      )}
    >
      <p className="text-eyebrow sm:text-eyebrow font-semibold uppercase tracking-[0.16em] text-warm-400">{label}</p>
      <div className="flex items-center gap-1.5">
        {icon && (
          <span
            className={cn(
              tone === 'danger'
                ? 'text-red-500'
                : tone === 'warn'
                  ? 'text-amber-500'
                  : tone === 'ok'
                    ? 'text-primary-500'
                    : 'text-warm-400'
            )}
          >
            {icon}
          </span>
        )}
        <p
          className={cn(
            'text-base font-semibold tabular-nums leading-none',
            tone === 'danger'
              ? 'text-red-700'
              : tone === 'warn'
                ? 'text-amber-700'
                : tone === 'ok'
                  ? 'text-primary-700'
                  : 'text-warm-900'
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function SystemOverviewBar({ data }: { data: AdminDashboardData }) {
  const status = getOverallStatus(data);
  const cfg = statusConfig[status];

  const qualityScore = Math.round(
    (data.dataQuality.distancePercentage + data.dataQuality.liePercentage + data.dataQuality.clubPercentage) / 3
  );

  return (
    <div className="bg-white/65 backdrop-blur-[16px] border border-white/20 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-3">
        {/* Overall health badge — anchors the row */}
        <div
          className={cn(
            'inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold',
            cfg.badgeClass
          )}
        >
          <span className={cn('h-2 w-2 rounded-full', cfg.dotClass)} />
          {cfg.label}
        </div>

        {/* Divider */}
        <div className="hidden h-6 w-px bg-warm-200 sm:block" />

        {/* Stat tiles */}
        <div className="grid grid-cols-2 sm:flex sm:flex-1 sm:flex-wrap gap-2">
          <StatTile
            label="Open Incidents"
            value={data.errorLogs.incidentCounts.open}
            tone={data.errorLogs.incidentCounts.open > 0 ? (data.errorLogs.incidentCounts.openCritical > 0 ? 'danger' : 'warn') : 'ok'}
            icon={<IconWarning size={12} />}
          />
          <StatTile
            label="Resolved 24h"
            value={data.errorLogs.incidentCounts.resolvedRecently}
            tone={data.errorLogs.incidentCounts.resolvedRecently > 0 ? 'ok' : 'default'}
            icon={<IconCheckCircle2 size={12} />}
          />
          <StatTile
            label="API Latency"
            value={`${Math.round(data.infraHealth?.totals?.avgResponseMs ?? 0)}ms`}
            tone={(data.infraHealth?.totals?.avgResponseMs ?? 0) > 3000 ? 'warn' : 'ok'}
            icon={<IconGauge size={12} />}
          />
          <StatTile
            label="Data Quality"
            value={`${qualityScore}%`}
            tone={qualityScore >= 80 ? 'ok' : qualityScore >= 50 ? 'warn' : 'danger'}
            icon={<IconActivity size={12} />}
          />
          <StatTile
            label="Active Sessions"
            value={data.health.activeSessions}
            icon={<IconZap size={12} />}
          />
          <StatTile
            label="Last Round"
            value={formatRelativeTime(data.health.lastRoundSubmitted)}
            icon={<IconClock size={12} />}
            tooltip={data.health.lastRoundSubmitted
              ? new Date(data.health.lastRoundSubmitted).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
              : undefined}
          />
          <StatTile
            label="Locked Accounts"
            value={data.loginSecurity.lockedAccounts}
            tone={data.loginSecurity.lockedAccounts > 0 ? 'danger' : 'ok'}
            icon={<IconLock size={12} />}
          />
          <StatTile
            label="DB Size"
            icon={<IconDatabase size={12} />}
            value={(() => {
              const b = data.health.dbSizeBytes;
              if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
              if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
              return `${(b / 1073741824).toFixed(1)} GB`;
            })()}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Section 3: Platform Health ──────────────────────────────────────────────

function DataQualityRing({ quality }: { quality: AdminDashboardData['dataQuality'] }) {
  const overallScore = Math.round(
    (quality.distancePercentage + quality.liePercentage + quality.clubPercentage) / 3
  );

  const metrics = [
    { label: 'Club Data', pct: quality.clubPercentage, count: quality.shotsWithClub, color: '#16A34A' },
    { label: 'Lie Type', pct: quality.liePercentage, count: quality.shotsWithLie, color: '#2563EB' },
    { label: 'Distance', pct: quality.distancePercentage, count: quality.shotsWithDistance, color: '#F59E0B' },
  ];

  return (
    <div className="rounded-2xl border border-white/35 bg-white/55 p-4">
      <p className="text-eyebrow font-semibold uppercase tracking-[0.18em] text-warm-500">Data Quality</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <div className="relative h-20 w-20 flex-shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="9" className="text-warm-100" />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="currentColor"
              strokeWidth="9"
              strokeDasharray={`${overallScore * 2.64} 264`}
              strokeLinecap="round"
              className={cn(
                overallScore >= 80 ? 'text-primary-500' :
                overallScore >= 50 ? 'text-amber-500' :
                'text-red-500'
              )}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold text-warm-900 tabular-nums">{overallScore}</span>
            <span className="text-eyebrow font-medium uppercase tracking-wider text-warm-400">/100</span>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          {metrics.map((metric) => (
            <div key={metric.label}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-warm-700">{metric.label}</span>
                <span className={cn(
                  'text-xs font-bold tabular-nums',
                  metric.pct >= 80 ? 'text-primary-600' : metric.pct >= 50 ? 'text-amber-600' : 'text-red-600'
                )}>
                  {metric.pct}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-warm-100">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${metric.pct}%`, backgroundColor: metric.color }}
                />
              </div>
            </div>
          ))}
          <p className="text-eyebrow text-warm-400">{quality.totalShots.toLocaleString()} shots tracked</p>
        </div>
      </div>
    </div>
  );
}

// ─── Section 4: Feature Adoption Grid ────────────────────────────────────────

function FeatureAdoptionGrid({ features }: { features: AdminDashboardData['usage']['featureAdoption'] }) {
  const maxCount = Math.max(...features.map((feature) => feature.count), 1);

  return (
    <div className="glass-standard rounded-2xl p-5 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-white/50 rounded-lg text-warm-500">
          <IconSparkles size={16} />
        </div>
        <h3 className="text-lg font-semibold text-warm-900">Feature Adoption</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:grid-cols-3">
        {features.map((feature) => {
          const status = feature.count > 5 ? 'active' : feature.count > 0 ? 'low' : 'dead';

          return (
            <div
              key={feature.feature}
              className="rounded-xl border border-white/30 bg-white/50 p-4 transition-colors hover:bg-white/60"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-warm-900">{feature.feature}</span>
                <span className={cn(
                  'rounded px-1.5 py-0.5 text-eyebrow font-bold uppercase',
                  status === 'active' ? 'bg-primary-50 text-primary-700' :
                  status === 'low' ? 'bg-amber-50 text-amber-700' :
                  'bg-red-50 text-red-600'
                )}>
                  {status}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-warm-100">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    status === 'active' ? 'bg-primary-500' :
                    status === 'low' ? 'bg-amber-500' :
                    'bg-red-400'
                  )}
                  style={{ width: `${Math.max((feature.count / maxCount) * 100, 3)}%` }}
                />
              </div>
              <p className="mt-1.5 text-eyebrow tabular-nums text-warm-400">{feature.count} total</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Background Jobs Config ─────────────────────────────────────────────────

interface SystemJobConfig {
  name: string;
  expectedInterval: string;
  expectedIntervalMs: number;
  icon: typeof IconRefresh;
  getLastRun: (data: AdminDashboardData) => string | null;
}

const SYSTEM_JOBS: SystemJobConfig[] = [
  {
    name: 'Stats Cache Refresh',
    expectedInterval: '1h',
    expectedIntervalMs: 60 * 60 * 1000,
    icon: IconRefresh,
    getLastRun: (data) => data.statsCacheLastUpdated ?? null,
  },
  {
    name: 'CoachHelm Insight Generation',
    expectedInterval: '24h',
    expectedIntervalMs: 24 * 60 * 60 * 1000,
    icon: IconBrain,
    getLastRun: (data) => data.health.lastInsightGenerated ?? null,
  },
  {
    name: 'Platform Metrics Snapshot',
    expectedInterval: '24h',
    expectedIntervalMs: 24 * 60 * 60 * 1000,
    icon: IconChartBar,
    getLastRun: (data) => data.health.lastRoundSubmitted ?? null,
  },
];

function getJobStatus(lastRun: string | null, expectedIntervalMs: number): {
  status: 'ok' | 'warn' | 'stale';
  label: string;
  dotClass: string;
} {
  if (!lastRun) return { status: 'stale', label: 'No data', dotClass: 'bg-warm-300' };
  const elapsed = Date.now() - new Date(lastRun).getTime();
  if (elapsed <= expectedIntervalMs * 1.5) {
    return { status: 'ok', label: formatRelativeTime(lastRun), dotClass: 'bg-primary-500' };
  }
  if (elapsed <= expectedIntervalMs * 3) {
    return { status: 'warn', label: formatRelativeTime(lastRun), dotClass: 'bg-amber-400' };
  }
  return { status: 'stale', label: formatRelativeTime(lastRun), dotClass: 'bg-red-400' };
}

// ─── External Services Config ───────────────────────────────────────────────

const SERVICES = [
  { name: 'Supabase', status: 'operational' },
  { name: 'Vercel', status: 'operational' },
  { name: 'Sentry', status: 'operational' },
];

// ─── Root Export ─────────────────────────────────────────────────────────────

export function SystemTab({ data }: Props) {
  const { errorLogs, dataQuality, usage } = data;

  // Storage quota calculations
  const dbSizeGb = (data.health?.dbSizeBytes || 0) / (1024 * 1024 * 1024);
  const quotaGb = 8; // Supabase free tier default
  const usagePct = Math.min((dbSizeGb / quotaGb) * 100, 100);

  return (
    <div className="space-y-6">
      {/* ── Deployment Info ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-white/30 bg-white/65 backdrop-blur-[16px] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-50">
            <IconRocket size={16} className="text-primary-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-warm-900 truncate">Production</p>
            <p className="text-xs text-warm-500 truncate">Next.js &middot; Vercel &middot; Supabase</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-warm-400">Environment healthy</p>
        </div>
      </div>

      {/* ── Section 1: System Overview ── */}
      <div>
        <SectionHeader title="System Overview" />
        <SystemOverviewBar data={data} />
      </div>

      {/* ── Section 2: Incident Feed ── */}
      <div>
        <SectionHeader title="Incident Feed" />
        <ErrorFeed errorLogs={errorLogs} />
      </div>

      {/* ── Section 3: Background Jobs ── */}
      <div>
        <SectionHeader title="Background Jobs" />
        <div className="rounded-2xl border border-white/30 bg-white/65 backdrop-blur-[16px] p-5">
          <div className="space-y-3">
            {SYSTEM_JOBS.map((job) => {
              const JobIcon = job.icon;
              const lastRun = job.getLastRun(data);
              const jobStatus = getJobStatus(lastRun, job.expectedIntervalMs);
              return (
                <div
                  key={job.name}
                  className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-white/30 bg-white/50 px-3 py-2.5 sm:px-4 sm:py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/70">
                      <JobIcon size={14} className="text-warm-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-warm-900 truncate">{job.name}</p>
                      <p className="text-eyebrow text-warm-400">Every {job.expectedInterval}</p>
                    </div>
                  </div>
                  <div
                    className="flex items-center gap-2 shrink-0 pl-11 sm:pl-0"
                    title={lastRun ? new Date(lastRun).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : undefined}
                  >
                    <span className={cn('h-2 w-2 rounded-full', jobStatus.dotClass)} />
                    <span className={cn(
                      'text-xs tabular-nums',
                      jobStatus.status === 'ok' ? 'text-primary-600' :
                      jobStatus.status === 'warn' ? 'text-amber-600' :
                      'text-warm-400'
                    )}>
                      {jobStatus.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Section 4: Platform Health ── */}
      <div>
        <SectionHeader title="Platform Health" />
        <div className="grid grid-cols-1 gap-4 md:gap-5 xl:grid-cols-[1.35fr_0.65fr]">
          {/* Left: Ranked health checks (summary tiles removed) */}
          <HealthCheckGrid
            health={data.health}
            errorLogs={data.errorLogs}
            loginSecurity={data.loginSecurity}
            dataQuality={dataQuality}
          />

          {/* Right: Data quality ring + infra snapshot + storage quota */}
          <div className="glass-standard rounded-2xl p-5 md:p-6 space-y-4">
            <DataQualityRing quality={dataQuality} />
            <InfraSnapshotPanel health={data.health} infraHealth={data.infraHealth} />

            {/* Storage Quota */}
            <div className="rounded-2xl border border-white/35 bg-white/55 p-4">
              <p className="text-eyebrow font-semibold uppercase tracking-[0.18em] text-warm-500">
                Storage Quota
              </p>
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-warm-700">Database</span>
                  <span
                    className={cn(
                      'text-xs font-bold tabular-nums',
                      usagePct > 80
                        ? 'text-red-600'
                        : usagePct > 60
                          ? 'text-amber-600'
                          : 'text-primary-600'
                    )}
                  >
                    {dbSizeGb.toFixed(1)} GB / {quotaGb} GB
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-warm-100">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      usagePct > 80
                        ? 'bg-red-500'
                        : usagePct > 60
                          ? 'bg-amber-500'
                          : 'bg-primary-500'
                    )}
                    style={{ width: `${Math.max(usagePct, 1)}%` }}
                  />
                </div>
                <p className="mt-1.5 text-eyebrow text-warm-400">
                  {usagePct.toFixed(1)}% of {quotaGb} GB quota used
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 5: External Services ── */}
      <div>
        <SectionHeader title="External Services" />
        <div className="rounded-2xl border border-white/30 bg-white/65 backdrop-blur-[16px] p-5">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {SERVICES.map((service) => (
              <div
                key={service.name}
                className="flex items-center gap-3 rounded-xl border border-white/30 bg-white/50 px-3 py-2.5 sm:px-4 sm:py-3"
              >
                <IconGlobe size={14} className="text-warm-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-warm-900 truncate">{service.name}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="h-2 w-2 rounded-full bg-primary-500" />
                  <span className="text-xs text-primary-600 font-medium">Operational</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Section 6: Feature & AI Health ── */}
      <div>
        <SectionHeader title="Feature & AI Health" />
        <div className="grid grid-cols-1 gap-4 md:gap-5 xl:grid-cols-2">
          <FeatureAdoptionGrid features={usage.featureAdoption} />
          <CoachHelmHealthCard coachhelm={data.coachhelm} coachhelmRoi={data.coachhelmRoi} />
        </div>
      </div>

      {/* ── Section 7: Infrastructure Detail ── */}
      <div>
        <SectionHeader title="Infrastructure" />
        <InfraHealthCard
          apiPerf={data.infraHealth.apiPerf}
          clientErrors={data.infraHealth.clientErrors}
          dbHealth={data.infraHealth.dbHealth}
          totals={data.infraHealth.totals}
        />
      </div>
    </div>
  );
}

// ─── Infra Snapshot (compact, lives inside Platform Health right column) ─────

function InfraSnapshotPanel({ health, infraHealth }: { health: AdminDashboardData['health']; infraHealth: AdminDashboardData['infraHealth'] }) {
  const { formatBytes } = {
    formatBytes: (bytes: number) => {
      if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
      if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
      return `${(bytes / 1073741824).toFixed(1)} GB`;
    },
  };

  const apiLatencyMs = Math.round(infraHealth?.totals?.avgResponseMs ?? 0);

  const tiles = [
    { label: 'DB Size', value: formatBytes(health.dbSizeBytes) },
    { label: 'DB Conns', value: health.activeConnections + health.idleConnections },
    { label: 'Sessions', value: health.activeSessions },
    {
      label: 'Avg Latency',
      value: `${apiLatencyMs}ms`,
      warn: apiLatencyMs > 3000,
    },
  ];

  return (
    <div className="rounded-2xl border border-white/35 bg-white/55 p-4">
      <p className="text-eyebrow font-semibold uppercase tracking-[0.18em] text-warm-500">Infra Snapshot</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-xl bg-white/70 p-3 text-center">
            <p className={cn(
              'text-base font-semibold tabular-nums',
              tile.warn ? 'text-amber-600' : 'text-warm-900'
            )}>
              {tile.value}
            </p>
            <p className="mt-0.5 text-eyebrow text-warm-400">{tile.label}</p>
          </div>
        ))}
      </div>

      {health.largestTables.length > 0 && (
        <div className="mt-3">
          <p className="text-eyebrow font-semibold uppercase tracking-[0.16em] text-warm-400 mb-2">Storage</p>
          <div className="space-y-1.5">
            {health.largestTables.slice(0, 4).map((table) => {
              const pct = health.dbSizeBytes > 0 ? (table.size_bytes / health.dbSizeBytes) * 100 : 0;
              return (
                <div key={table.table_name}>
                  <div className="flex items-center justify-between gap-2 text-eyebrow">
                    <span className="truncate font-medium text-warm-700">
                      {table.table_name.replace(/^(golf_|baseball_)/, '')}
                    </span>
                    <span className="tabular-nums text-warm-400 shrink-0">{formatBytes(table.size_bytes)}</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-warm-100">
                    <div
                      className="h-full rounded-full bg-primary-400"
                      style={{ width: `${Math.max(pct, 1)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
