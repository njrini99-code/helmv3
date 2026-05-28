'use client';

import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { AdminAreaChart, AdminFunnelChart, AdminProgressBar } from './AdminChart';
import { cn } from '@/lib/utils';
import { IconTrendingUp, IconTrendingDown, IconWarning, IconSparkles } from '@/components/icons';

interface Props {
  growth: AdminDashboardData['growth'];
  users: AdminDashboardData['users'];
  usage: AdminDashboardData['usage'];
  coachhelm: AdminDashboardData['coachhelm'];
  userJourney?: AdminDashboardData['userJourney'];
  stickiness?: AdminDashboardData['stickiness'];
}

const HEALTH_LABELS: Record<string, { label: string; color: string }> = {
  excellent: { label: 'Excellent', color: 'text-primary-700' },
  good: { label: 'Good', color: 'text-primary-600' },
  fair: { label: 'Fair', color: 'text-amber-600' },
  poor: { label: 'Needs Work', color: 'text-red-600' },
};

function getHealthLevel(score: number) {
  if (score >= 75) return 'excellent';
  if (score >= 50) return 'good';
  if (score >= 25) return 'fair';
  return 'poor';
}

function HealthScoreRing({ score }: { score: number }) {
  const level = getHealthLevel(score);
  const entry = HEALTH_LABELS[level] ?? { label: 'Unknown', color: 'text-warm-500' };
  const { label, color } = entry;
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (score / 100) * circumference;
  const strokeColor =
    level === 'excellent' ? 'var(--color-primary-600)' : level === 'good' ? '#22C55E' : level === 'fair' ? '#F59E0B' : '#EF4444';

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r="40" fill="none" stroke="#F5F5F0" strokeWidth="6" />
          <circle
            cx="48"
            cy="48"
            r="40"
            fill="none"
            stroke={strokeColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-warm-900 tabular-nums">{score}</span>
        </div>
      </div>
      <span className={cn('text-xs font-medium mt-1.5', color)}>{label}</span>
    </div>
  );
}

export function GrowthCard({ growth, users, usage, coachhelm, userJourney, stickiness }: Props) {
  const signupChartData = users.signupsByWeek.slice(-12).map((w) => ({
    label: w.week.slice(5),
    value: w.count,
  }));

  const sortedFeatures = [...usage.featureAdoption].sort((a, b) => b.count - a.count);
  const maxFeatureCount = sortedFeatures[0]?.count || 1;

  // User journey funnel
  const journeyStages = userJourney ? [
    { label: 'Signups', value: userJourney.totalSignups, color: '#3B82F6' },
    { label: 'Onboarded', value: userJourney.completedOnboarding, color: '#2563EB' },
    { label: '1st Round', value: userJourney.submittedFirstRound, color: 'var(--color-primary-600)' },
    { label: 'Active (7d)', value: userJourney.activeThisWeek, color: '#8B5CF6' },
  ] : [];

  return (
    <div className="glass-standard rounded-2xl p-6 transition-all duration-200 hover:bg-white/80 active:bg-white/90 hover:shadow-card-hover">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-white/50 rounded-lg text-warm-500">
            <IconTrendingUp size={18} />
          </div>
          <h3 className="text-lg font-semibold text-warm-900">Business Intelligence</h3>
        </div>
      </div>

      {/* Platform Health Score + Key Metrics */}
      <div className="flex items-start gap-5 mb-6">
        <HealthScoreRing score={growth.platformHealthScore} />
        <div className="flex-1 grid grid-cols-2 gap-2.5">
          <div className="bg-white/50 rounded-xl p-3">
            <p className="text-xs text-warm-500 mb-0.5">User Growth</p>
            <div className="flex items-center gap-1">
              {growth.userGrowthRate >= 0 ? (
                <IconTrendingUp size={14} className="text-primary-600" />
              ) : (
                <IconTrendingDown size={14} className="text-red-500" />
              )}
              <span className={cn(
                'text-lg font-semibold tabular-nums',
                growth.userGrowthRate >= 0 ? 'text-primary-700' : 'text-red-600'
              )}>
                {growth.userGrowthRate > 0 ? '+' : ''}{growth.userGrowthRate}%
              </span>
            </div>
          </div>
          <div className="bg-white/50 rounded-xl p-3">
            <p className="text-xs text-warm-500 mb-0.5">Round Growth</p>
            <div className="flex items-center gap-1">
              {growth.roundGrowthRate >= 0 ? (
                <IconTrendingUp size={14} className="text-primary-600" />
              ) : (
                <IconTrendingDown size={14} className="text-red-500" />
              )}
              <span className={cn(
                'text-lg font-semibold tabular-nums',
                growth.roundGrowthRate >= 0 ? 'text-primary-700' : 'text-red-600'
              )}>
                {growth.roundGrowthRate > 0 ? '+' : ''}{growth.roundGrowthRate}%
              </span>
            </div>
          </div>
          <div className="bg-white/50 rounded-xl p-3">
            <p className="text-xs text-warm-500 mb-0.5">Churned (30d)</p>
            <div className="flex items-center gap-1">
              {growth.churnedPlayers30d > 0 && <IconWarning size={14} className="text-amber-500" />}
              <span className={cn(
                'text-lg font-semibold tabular-nums',
                growth.churnedPlayers30d > 0 ? 'text-amber-600' : 'text-warm-900'
              )}>
                {growth.churnedPlayers30d}
              </span>
            </div>
          </div>
          <div className="bg-white/50 rounded-xl p-3">
            <p className="text-xs text-warm-500 mb-0.5">
              {stickiness ? 'DAU/MAU' : 'Power Users'}
            </p>
            <div className="flex items-center gap-1">
              <IconSparkles size={14} className="text-primary-500" />
              <span className="text-lg font-semibold text-warm-900 tabular-nums">
                {stickiness ? `${stickiness.dauMauRatio}%` : `${growth.npsProxy}%`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* User Journey Funnel */}
      {journeyStages.length > 0 && journeyStages[0]!.value > 0 && (
        <div className="mb-5">
          <h4 className="text-sm font-medium text-warm-500 mb-2.5">User Journey Funnel</h4>
          <AdminFunnelChart stages={journeyStages} height={160} />
        </div>
      )}

      {/* DAU/WAU/MAU stickiness */}
      {stickiness && stickiness.mau > 0 && (
        <div className="mb-5">
          <h4 className="text-sm font-medium text-warm-500 mb-2.5">Engagement Stickiness</h4>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white/50 rounded-xl p-2.5 text-center">
              <p className="text-lg font-semibold text-warm-900 tabular-nums">{stickiness.dau}</p>
              <p className="text-micro text-warm-400">DAU</p>
            </div>
            <div className="bg-white/50 rounded-xl p-2.5 text-center">
              <p className="text-lg font-semibold text-warm-900 tabular-nums">{stickiness.wau}</p>
              <p className="text-micro text-warm-400">WAU</p>
            </div>
            <div className="bg-white/50 rounded-xl p-2.5 text-center">
              <p className="text-lg font-semibold text-warm-900 tabular-nums">{stickiness.mau}</p>
              <p className="text-micro text-warm-400">MAU</p>
            </div>
          </div>
        </div>
      )}

      {/* Cohort Retention */}
      <div className="mb-5">
        <p className="text-sm font-medium text-warm-500 mb-2.5">Cohort Retention</p>
        <div className="grid grid-cols-4 gap-2">
          {growth.retentionCohorts.map((c) => (
            <div key={c.week} className="bg-white/50 rounded-xl p-2.5 text-center">
              <p className="text-micro text-warm-400 uppercase tracking-wide">Week {c.week}</p>
              <p className={cn(
                'text-xl font-bold tabular-nums mt-0.5',
                c.rate >= 50 ? 'text-primary-600' : c.rate >= 25 ? 'text-amber-600' : 'text-red-500'
              )}>
                {c.rate}%
              </p>
              <p className="text-micro text-warm-400 tabular-nums">{c.retained}/{c.total}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Signup Trend - area chart */}
      {signupChartData.length > 0 && (
        <div className="mb-5">
          <AdminAreaChart data={signupChartData} title="Signups (12 Weeks)" color="var(--color-primary-600)" height={100} />
        </div>
      )}

      {/* Feature Adoption Ranking */}
      <div>
        <p className="text-sm font-medium text-warm-500 mb-2.5">Feature Adoption</p>
        <div className="space-y-2">
          {sortedFeatures.map((f) => (
            <AdminProgressBar
              key={f.feature}
              label={f.feature}
              value={f.count}
              max={maxFeatureCount}
              color={f.feature === growth.topFeatureByAdoption ? 'var(--color-primary-600)' : undefined}
            />
          ))}
        </div>
      </div>

      {/* Quick stats footer */}
      <div className="mt-5 pt-4 border-t border-warm-100 grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-xs text-warm-400">New Teams (30d)</p>
          <p className="text-lg font-semibold text-warm-900 tabular-nums">{growth.teamGrowthThisMonth}</p>
        </div>
        <div>
          <p className="text-xs text-warm-400">Rounds/Active Player</p>
          <p className="text-lg font-semibold text-warm-900 tabular-nums">{growth.avgRoundsPerActivePlayer}</p>
        </div>
        <div>
          <p className="text-xs text-warm-400">AI Adoption</p>
          <p className="text-lg font-semibold text-warm-900 tabular-nums">{coachhelm.coachPhilosophyAdoption}%</p>
        </div>
      </div>
    </div>
  );
}
