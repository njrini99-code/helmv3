'use client';

import { cn } from '@/lib/utils';
import { AlertTriangle, Activity, ShieldAlert, Lock } from 'lucide-react';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { AdminStatCard } from './AdminStatCard';
import { HealthCheckGrid } from './HealthCheckGrid';
import { CoachHelmHealthCard } from './CoachHelmHealthCard';
import InfraHealthCard from './InfraHealthCard';
import { SectionHeader } from '@/components/golf/dashboard/premium-components';
import { timeAgo } from './admin-utils';

interface Props {
  data: AdminDashboardData;
}

export function SystemTab({ data }: Props) {
  const { errorLogs, dataQuality, usage } = data;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <AdminStatCard
          label="Total Errors (7d)"
          value={errorLogs.totalErrors7d}
          icon={<AlertTriangle size={20} />}
          accentColor={errorLogs.totalErrors7d > 10 ? 'red' : errorLogs.totalErrors7d > 0 ? 'amber' : 'green'}
        />
        <AdminStatCard
          label="Critical Errors"
          value={errorLogs.criticalErrors7d}
          icon={<ShieldAlert size={20} />}
          accentColor={errorLogs.criticalErrors7d > 0 ? 'red' : 'green'}
          detail={errorLogs.criticalErrors7d > 0 ? 'Immediate attention needed' : 'All clear'}
        />
        <AdminStatCard
          label="Failed Logins (7d)"
          value={data.loginSecurity.failedLogins7d}
          icon={<Activity size={20} />}
          accentColor={data.loginSecurity.failedLogins7d > 5 ? 'amber' : 'green'}
        />
        <AdminStatCard
          label="Locked Accounts"
          value={data.loginSecurity.lockedAccounts}
          icon={<Lock size={20} />}
          accentColor={data.loginSecurity.lockedAccounts > 0 ? 'red' : 'green'}
        />
      </div>

      {/* Error Timeline + Health Diagnostics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        <div>
          <SectionHeader title="Health Diagnostics" />
          <HealthCheckGrid
            health={data.health}
            errorLogs={data.errorLogs}
            loginSecurity={data.loginSecurity}
          />
        </div>
        <div>
          <SectionHeader title="Error Timeline" />
          <ErrorTimeline errors={errorLogs.recentErrors} />
        </div>
      </div>

      {/* Data Quality Ring + Feature Adoption */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        <div>
          <SectionHeader title="Data Quality" />
          <DataQualityRing quality={dataQuality} />
        </div>
        <div>
          <SectionHeader title="Feature Adoption" />
          <FeatureAdoptionGrid features={usage.featureAdoption} />
        </div>
      </div>

      {/* CoachHelm AI Health */}
      <div>
        <SectionHeader title="CoachHelm AI Health" />
        <CoachHelmHealthCard coachhelm={data.coachhelm} coachhelmRoi={data.coachhelmRoi} />
      </div>

      {/* Infrastructure */}
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

// Error Timeline Component
function ErrorTimeline({ errors }: { errors: AdminDashboardData['errorLogs']['recentErrors'] }) {
  if (errors.length === 0) {
    return (
      <div className={cn(
        'glass-standard rounded-2xl p-6',
        'flex flex-col items-center justify-center py-10 text-center'
      )}>
        <div className="w-12 h-12 rounded-2xl bg-primary-50 flex items-center justify-center mb-3">
          <Activity size={24} className="text-primary-500" />
        </div>
        <p className="text-sm font-medium text-primary-700">No Errors</p>
        <p className="text-xs text-warm-400 mt-1">Clean error log — all systems operational</p>
      </div>
    );
  }

  return (
    <div className={cn(
      'glass-standard rounded-2xl p-5 md:p-6',
      'max-h-[500px] overflow-y-auto'
    )}>
      <div className="space-y-0">
        {errors.slice(0, 20).map((error, i) => (
          <div key={error.id} className="relative pl-6 pb-4 last:pb-0">
            {/* Timeline line */}
            {i < Math.min(errors.length, 20) - 1 && (
              <div className="absolute left-[9px] top-5 bottom-0 w-px bg-warm-200" />
            )}
            {/* Timeline dot */}
            <div className={cn(
              'absolute left-0 top-1.5 w-[18px] h-[18px] rounded-full border-2 border-white flex items-center justify-center',
              error.severity === 'critical' ? 'bg-red-500' :
              error.severity === 'warning' ? 'bg-amber-500' :
              'bg-warm-300'
            )}>
              <div className="w-1.5 h-1.5 rounded-full bg-white" />
            </div>
            {/* Content */}
            <div className="ml-2">
              <p className="text-sm font-medium text-warm-900 leading-tight line-clamp-2">{error.message}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn(
                  'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                  error.severity === 'critical' ? 'bg-red-50 text-red-600' :
                  error.severity === 'warning' ? 'bg-amber-50 text-amber-600' :
                  'bg-warm-100 text-warm-500'
                )}>
                  {error.severity}
                </span>
                <span className="text-xs text-warm-400">{timeAgo(error.createdAt)}</span>
                {error.userEmail && (
                  <span className="text-xs text-warm-400 truncate max-w-[120px]">{error.userEmail}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Data Quality Ring Component
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
    <div className={cn(
      'glass-standard rounded-2xl p-5 md:p-6'
    )}>
      <div className="flex items-center gap-5 mb-5">
        {/* Ring */}
        <div className="relative w-24 h-24 flex-shrink-0">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" className="text-warm-100" />
            <circle
              cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8"
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
            <span className="text-[10px] text-warm-400 font-medium uppercase tracking-wider">/100</span>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-warm-900">Shot Data Quality</p>
          <p className="text-xs text-warm-400 mt-0.5">{quality.totalShots.toLocaleString()} total shots tracked</p>
        </div>
      </div>

      {/* Metric bars */}
      <div className="space-y-3">
        {metrics.map((m) => (
          <div key={m.label}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-warm-700">{m.label}</span>
              <span className={cn(
                'text-xs font-bold tabular-nums',
                m.pct >= 80 ? 'text-primary-600' : m.pct >= 50 ? 'text-amber-600' : 'text-red-600'
              )}>{m.pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-warm-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${m.pct}%`, backgroundColor: m.color }}
              />
            </div>
            <p className="text-[10px] text-warm-400 mt-0.5">{m.count.toLocaleString()} of {quality.totalShots.toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Feature Adoption Grid Component
function FeatureAdoptionGrid({ features }: { features: AdminDashboardData['usage']['featureAdoption'] }) {
  const maxCount = Math.max(...features.map(f => f.count), 1);

  return (
    <div className={cn(
      'glass-standard rounded-2xl p-5 md:p-6'
    )}>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {features.map((feature) => {
          const status = feature.count > 5 ? 'active' : feature.count > 0 ? 'low' : 'dead';

          return (
            <div
              key={feature.feature}
              className={cn(
                'p-4 rounded-xl transition-colors',
                'bg-white/50 border border-white/30',
                'hover:bg-white/60'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-warm-900">{feature.feature}</span>
                <span className={cn(
                  'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                  status === 'active' ? 'bg-primary-50 text-primary-700' :
                  status === 'low' ? 'bg-amber-50 text-amber-700' :
                  'bg-red-50 text-red-600'
                )}>
                  {status}
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 rounded-full bg-warm-100 overflow-hidden">
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
              <p className="text-[11px] text-warm-400 mt-1.5 tabular-nums">{feature.count} total</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
