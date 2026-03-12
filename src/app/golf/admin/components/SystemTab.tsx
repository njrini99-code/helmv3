'use client';

import { cn } from '@/lib/utils';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  Lock,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { AdminStatCard } from './AdminStatCard';
import { HealthCheckGrid } from './HealthCheckGrid';
import { CoachHelmHealthCard } from './CoachHelmHealthCard';
import InfraHealthCard from './InfraHealthCard';
import { ErrorFeed } from './ErrorFeed';
import { SectionHeader } from '@/components/golf/dashboard/premium-components';

interface Props {
  data: AdminDashboardData;
}

type CommandStatus = 'healthy' | 'warning' | 'critical';

const commandStatusLabel: Record<CommandStatus, string> = {
  healthy: 'Stable',
  warning: 'Watch Closely',
  critical: 'Response Needed',
};

const commandStatusClasses: Record<CommandStatus, string> = {
  healthy: 'border-primary-200 bg-primary-50/80 text-primary-700',
  warning: 'border-amber-200 bg-amber-50/80 text-amber-700',
  critical: 'border-red-200 bg-red-50/80 text-red-700',
};

function getCommandStatus(data: AdminDashboardData): CommandStatus {
  if (data.errorLogs.incidentCounts.openCritical > 0 || data.errorLogs.incidentCounts.open > 0) {
    return data.errorLogs.incidentCounts.openCritical > 0 ? 'critical' : 'warning';
  }
  if (data.loginSecurity.lockedAccounts > 0 || data.health.avgResponseTimeMs > 3000) {
    return 'warning';
  }
  return 'healthy';
}

function formatDateTime(value: string | null): string {
  if (!value) return 'No recent event';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function SystemCommandCenter({ data }: { data: AdminDashboardData }) {
  const commandStatus = getCommandStatus(data);
  const qualityScore = Math.round(
    (data.dataQuality.distancePercentage + data.dataQuality.liePercentage + data.dataQuality.clubPercentage) / 3
  );
  const openIncident = data.errorLogs.recentErrors.find((incident) => incident.status === 'open') ?? null;
  const newestIncident = data.errorLogs.recentErrors[0] ?? null;
  const leadIncident = openIncident ?? newestIncident;
  const recoveryMessage = data.errorLogs.incidentCounts.resolvedRecently > 0
    ? `${data.errorLogs.incidentCounts.resolvedRecently} incident${data.errorLogs.incidentCounts.resolvedRecently === 1 ? '' : 's'} resolved in the last 24h`
    : data.errorLogs.incidentCounts.open > 0
      ? 'No recent resolutions recorded while incidents are still open'
      : 'No live incident backlog right now';

  const commandTiles = [
    {
      label: 'Incident queue',
      value: `${data.errorLogs.incidentCounts.open}`,
      detail: `${data.errorLogs.incidentCounts.active} active · ${data.errorLogs.incidentCounts.historical} backlog`,
      tone: data.errorLogs.incidentCounts.open > 0 ? 'danger' : 'default',
    },
    {
      label: 'Recovery velocity',
      value: `${data.errorLogs.incidentCounts.resolvedRecently}`,
      detail: 'resolved in 24h',
      tone: data.errorLogs.incidentCounts.resolvedRecently > 0 ? 'success' : 'default',
    },
    {
      label: 'Telemetry quality',
      value: `${qualityScore}%`,
      detail: `${data.dataQuality.totalShots.toLocaleString()} tracked shots`,
      tone: qualityScore >= 92 ? 'success' : qualityScore >= 75 ? 'default' : 'danger',
    },
    {
      label: 'API latency',
      value: `${data.health.avgResponseTimeMs}ms`,
      detail: `${data.health.activeSessions} live sessions`,
      tone: data.health.avgResponseTimeMs > 3000 ? 'danger' : 'default',
    },
  ] as const;

  return (
    <div className="glass-standard overflow-hidden rounded-3xl p-5 md:p-6">
      <div className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.14),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(22,163,74,0.12),transparent_35%)]" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 text-warm-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                <Sparkles size={18} />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-warm-500">System Command</p>
                <h2 className="text-xl font-semibold tracking-tight text-warm-950">Health, incident pressure, and recovery in one view</h2>
              </div>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-warm-600">
              This panel tracks whether the platform is failing right now, how quickly issues are getting closed, and whether the underlying golf telemetry is trustworthy enough to support the rest of the dashboard.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={cn('inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium', commandStatusClasses[commandStatus])}>
                {commandStatusLabel[commandStatus]}
              </span>
              <span className="inline-flex items-center rounded-full border border-white/40 bg-white/75 px-3 py-1 text-sm font-medium text-warm-700">
                Last round {formatDateTime(data.health.lastRoundSubmitted)}
              </span>
              <span className="inline-flex items-center rounded-full border border-white/40 bg-white/75 px-3 py-1 text-sm font-medium text-warm-700">
                Last insight {formatDateTime(data.health.lastInsightGenerated)}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/40 bg-white/70 p-4 xl:max-w-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-warm-500">Lead diagnostic</p>
            {leadIncident ? (
              <>
                <p className="mt-2 text-base font-semibold text-warm-900">{leadIncident.title}</p>
                <p className="mt-1 text-sm leading-6 text-warm-600">{leadIncident.summary}</p>
                <p className="mt-3 text-xs leading-5 text-warm-500">
                  {leadIncident.status === 'open' ? 'Open now' : 'Most recent signal'} · {leadIncident.diagnosisBasis}
                </p>
              </>
            ) : (
              <>
                <p className="mt-2 text-base font-semibold text-primary-700">No live incident signal</p>
                <p className="mt-1 text-sm leading-6 text-warm-600">The dashboard has not grouped any recent server-side incidents.</p>
              </>
            )}
            <div className="mt-4 rounded-2xl border border-white/40 bg-white/80 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-400">Recovery signal</p>
              <p className="mt-1 text-sm text-warm-700">{recoveryMessage}</p>
            </div>
          </div>
        </div>

        <div className="relative mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {commandTiles.map((tile) => (
            <div
              key={tile.label}
              className={cn(
                'rounded-2xl border px-4 py-3',
                tile.tone === 'danger'
                  ? 'border-red-100 bg-red-50/70'
                  : tile.tone === 'success'
                    ? 'border-primary-100 bg-primary-50/70'
                    : 'border-white/40 bg-white/70'
              )}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-warm-500">{tile.label}</p>
              <div className="mt-1 flex items-end gap-2">
                <p className="text-xl font-semibold tracking-tight text-warm-900 tabular-nums">{tile.value}</p>
                <p className="pb-1 text-xs text-warm-500">{tile.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SystemTab({ data }: Props) {
  const { errorLogs, dataQuality, usage } = data;

  return (
    <div className="space-y-6">
      <SystemCommandCenter data={data} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <AdminStatCard
          label="Open Incidents"
          value={errorLogs.incidentCounts.open}
          icon={<AlertTriangle size={20} />}
          accentColor={errorLogs.incidentCounts.open > 0 ? 'red' : 'green'}
          detail={errorLogs.incidentCounts.open > 0 ? `${errorLogs.incidentCounts.openCritical} critical` : 'No unresolved incident backlog'}
        />
        <AdminStatCard
          label="Active Signals"
          value={errorLogs.incidentCounts.active}
          icon={<ShieldAlert size={20} />}
          accentColor={errorLogs.incidentCounts.active > 0 ? 'amber' : 'green'}
          detail={`${errorLogs.incidentCounts.historical} backlog`}
        />
        <AdminStatCard
          label="Resolved (24h)"
          value={errorLogs.incidentCounts.resolvedRecently}
          icon={<CheckCircle2 size={20} />}
          accentColor={errorLogs.incidentCounts.resolvedRecently > 0 ? 'green' : 'blue'}
          detail={`${errorLogs.incidentCounts.resolved} total resolved`}
        />
        <AdminStatCard
          label="API Response"
          value={data.health.avgResponseTimeMs}
          suffix="ms"
          icon={<Gauge size={20} />}
          accentColor={data.health.avgResponseTimeMs > 3000 ? 'amber' : 'green'}
          detail={`${data.health.activeSessions} active sessions`}
        />
      </div>

      <div>
        <SectionHeader title="Incident Feed" />
        <ErrorFeed errorLogs={errorLogs} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <div>
          <SectionHeader title="Health Diagnostics" />
          <HealthCheckGrid
            health={data.health}
            errorLogs={data.errorLogs}
            loginSecurity={data.loginSecurity}
            dataQuality={dataQuality}
          />
        </div>
        <div className="space-y-4">
          <div>
            <SectionHeader title="Data Quality" />
            <DataQualityRing quality={dataQuality} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <AdminStatCard
              label="Critical Rows (7d)"
              value={errorLogs.criticalErrors7d}
              icon={<Activity size={20} />}
              accentColor={errorLogs.criticalErrors7d > 0 ? 'red' : 'green'}
              detail={`${errorLogs.totalErrors7d} error log rows`}
            />
            <AdminStatCard
              label="Locked Accounts"
              value={data.loginSecurity.lockedAccounts}
              icon={<Lock size={20} />}
              accentColor={data.loginSecurity.lockedAccounts > 0 ? 'red' : 'green'}
              detail={data.loginSecurity.failedLogins7d > 0 ? `${data.loginSecurity.failedLogins7d} failed attempts` : 'No lockouts'}
            />
          </div>
        </div>
      </div>

      <div>
        <SectionHeader title="Feature Adoption" />
        <FeatureAdoptionGrid features={usage.featureAdoption} />
      </div>

      <div>
        <SectionHeader title="CoachHelm AI Health" />
        <CoachHelmHealthCard coachhelm={data.coachhelm} coachhelmRoi={data.coachhelmRoi} />
      </div>

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
    <div className="glass-standard rounded-2xl p-5 md:p-6">
      <div className="mb-5 flex items-center gap-5">
        <div className="relative h-24 w-24 flex-shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" className="text-warm-100" />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
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
            <span className="text-2xl font-bold text-warm-900 tabular-nums">{overallScore}</span>
            <span className="text-micro font-medium uppercase tracking-wider text-warm-400">/100</span>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-warm-900">Shot Data Quality</p>
          <p className="mt-0.5 text-xs text-warm-400">{quality.totalShots.toLocaleString()} total shots tracked</p>
        </div>
      </div>

      <div className="space-y-3">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-warm-700">{metric.label}</span>
              <span className={cn(
                'text-xs font-bold tabular-nums',
                metric.pct >= 80 ? 'text-primary-600' : metric.pct >= 50 ? 'text-amber-600' : 'text-red-600'
              )}>
                {metric.pct}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-warm-100">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${metric.pct}%`, backgroundColor: metric.color }}
              />
            </div>
            <p className="mt-0.5 text-micro text-warm-400">
              {metric.count.toLocaleString()} of {quality.totalShots.toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeatureAdoptionGrid({ features }: { features: AdminDashboardData['usage']['featureAdoption'] }) {
  const maxCount = Math.max(...features.map((feature) => feature.count), 1);

  return (
    <div className="glass-standard rounded-2xl p-5 md:p-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
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
                  'rounded px-1.5 py-0.5 text-micro font-bold uppercase',
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
              <p className="mt-1.5 text-label tabular-nums text-warm-400">{feature.count} total</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
