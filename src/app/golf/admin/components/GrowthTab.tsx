'use client';

import { cn } from '@/lib/utils';
import { Activity, Sparkles, TrendingUp, BarChart3 } from 'lucide-react';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { AdminStatCard } from './AdminStatCard';
import { GrowthCard } from './GrowthCard';
import { EngagementCard } from './EngagementCard';
import CohortRetentionMatrix from './CohortRetentionMatrix';
import SessionHeatmap from './SessionHeatmap';
import { InsightCallout } from './InsightCallout';
import { SectionHeader } from '@/components/golf/dashboard/premium-components';

interface Props {
  data: AdminDashboardData;
}

export function GrowthTab({ data }: Props) {
  return (
    <div className="space-y-6">
      {/* Insight callout */}
      <InsightCallout data={data} tab="growth" />

      {/* 4 KPI cards (reduced from 6) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <AdminStatCard
          label="Health Score"
          value={data.growth.platformHealthScore}
          suffix="/100"
          icon={<Activity size={20} />}
          accentColor={data.growth.platformHealthScore >= 50 ? 'green' : 'red'}
        />
        <AdminStatCard
          label="Power Users"
          value={`${data.growth.npsProxy}`}
          suffix="%"
          icon={<Sparkles size={20} />}
          detail="coaches fully engaged"
          accentColor={data.growth.npsProxy > 30 ? 'green' : 'amber'}
        />
        <AdminStatCard
          label="Weekly Active"
          value={`${data.engagement.weeklyRetention}`}
          suffix="%"
          icon={<TrendingUp size={20} />}
          accentColor={data.engagement.weeklyRetention > 30 ? 'green' : 'amber'}
        />
        <AdminStatCard
          label="Stickiness"
          value={`${data.stickiness.dauMauRatio}`}
          suffix="%"
          icon={<BarChart3 size={20} />}
          detail={`DAU/MAU · ${data.stickiness.dau}/${data.stickiness.mau}`}
          accentColor={data.stickiness.dauMauRatio > 20 ? 'green' : 'amber'}
        />
      </div>

      {/* Engagement Funnel — Horizontal bars */}
      <div>
        <SectionHeader title="Engagement Funnel" />
        <EngagementFunnel funnel={data.playerFunnel.funnel} />
      </div>

      {/* Growth + Engagement side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        <div>
          <SectionHeader title="Growth Metrics" />
          <GrowthCard
            growth={data.growth}
            users={data.users}
            usage={data.usage}
            coachhelm={data.coachhelm}
            userJourney={data.userJourney}
            stickiness={data.stickiness}
          />
        </div>
        <div>
          <SectionHeader title="Engagement" />
          <EngagementCard
            engagement={data.engagement}
            totalPlayers={data.users.totalPlayers}
            totalCoaches={data.users.totalCoaches}
            playerEngagement={data.playerEngagement}
            stickiness={data.stickiness}
          />
        </div>
      </div>

      {/* Cohort Retention Heatmap */}
      <div>
        <SectionHeader title="Cohort Retention" />
        <CohortRetentionMatrix cohorts={data.cohortMatrix} />
      </div>

      {/* AI ROI Metrics */}
      <div>
        <SectionHeader title="AI ROI" />
        <AIROICard roi={data.coachhelmRoi} coachhelm={data.coachhelm} />
      </div>

      {/* Session Analytics */}
      <div>
        <SectionHeader title="Session Analytics" />
        <SessionHeatmap
          pageViews={data.sessionHeatmap.pageViews}
          featureUsage={data.sessionHeatmap.featureUsage}
          sessionStats={data.sessionHeatmap.sessionStats}
          deadFeatures={data.sessionHeatmap.deadFeatures}
        />
      </div>
    </div>
  );
}

// Engagement Funnel - Horizontal bars
function EngagementFunnel({ funnel }: { funnel: AdminDashboardData['playerFunnel']['funnel'] }) {
  if (funnel.length === 0) return null;
  const maxCount = funnel[0]?.count ?? 1;

  return (
    <div className={cn(
      'bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-5 md:p-6'
    )}>
      <div className="space-y-3">
        {funnel.map((step, i) => {
          const widthPercent = maxCount > 0 ? (step.count / maxCount) * 100 : 0;

          return (
            <div key={step.stage} className="flex items-center gap-4">
              {/* Label */}
              <div className="w-36 text-right flex-shrink-0">
                <p className="text-sm font-medium text-warm-700">{step.stage}</p>
              </div>
              {/* Bar */}
              <div className="flex-1 relative">
                <div className="h-8 rounded-lg bg-warm-50 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-lg transition-all duration-700',
                      i === 0
                        ? 'bg-gradient-to-r from-primary-500 to-primary-400'
                        : widthPercent >= 50
                          ? 'bg-gradient-to-r from-primary-500 to-primary-400'
                          : widthPercent >= 25
                            ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                            : 'bg-gradient-to-r from-red-500 to-red-400'
                    )}
                    style={{ width: `${Math.max(widthPercent, 5)}%` }}
                  />
                </div>
              </div>
              {/* Count + percent */}
              <div className="w-20 text-right flex-shrink-0">
                <span className="text-sm font-bold text-warm-900 tabular-nums">{step.count}</span>
                <span className="text-xs text-warm-400 ml-1">({step.percentage}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// AI ROI Card
function AIROICard({ roi, coachhelm }: { roi: AdminDashboardData['coachhelmRoi']; coachhelm: AdminDashboardData['coachhelm'] }) {
  return (
    <div className={cn(
      'bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-5 md:p-6'
    )}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <div className="bg-white/50 rounded-xl p-4 text-center border border-white/30">
          <p className="text-2xl font-bold text-warm-900 tabular-nums">{roi.coachesUsingAI}</p>
          <p className="text-[11px] text-warm-400 uppercase tracking-wider mt-1">AI Coaches</p>
        </div>
        <div className="bg-white/50 rounded-xl p-4 text-center border border-white/30">
          <p className="text-2xl font-bold text-warm-900 tabular-nums">{roi.coachesNotUsingAI}</p>
          <p className="text-[11px] text-warm-400 uppercase tracking-wider mt-1">Non-AI Coaches</p>
        </div>
        <div className="bg-white/50 rounded-xl p-4 text-center border border-white/30">
          <p className="text-2xl font-bold text-warm-900 tabular-nums">
            {roi.avgScoreAICoachPlayers !== null ? roi.avgScoreAICoachPlayers.toFixed(1) : <span className="text-warm-400">—</span>}
          </p>
          <p className="text-[11px] text-warm-400 uppercase tracking-wider mt-1">AI Avg Score</p>
        </div>
        <div className="bg-white/50 rounded-xl p-4 text-center border border-white/30">
          <p className={cn(
            'text-2xl font-bold tabular-nums',
            roi.scoreDifference !== null && roi.scoreDifference > 0 ? 'text-primary-600' : 'text-warm-900'
          )}>
            {roi.scoreDifference !== null ? (roi.scoreDifference > 0 ? `+${roi.scoreDifference.toFixed(1)}` : roi.scoreDifference.toFixed(1)) : <span className="text-warm-400">—</span>}
          </p>
          <p className="text-[11px] text-warm-400 uppercase tracking-wider mt-1">AI Advantage</p>
        </div>
      </div>

      {/* AI Activity summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="flex items-center justify-between p-3 rounded-xl bg-white/50 border border-white/30">
          <span className="text-xs text-warm-600">Total Reviews</span>
          <span className="text-sm font-semibold text-warm-900 tabular-nums">{coachhelm.totalReviewsAllTime}</span>
        </div>
        <div className="flex items-center justify-between p-3 rounded-xl bg-white/50 border border-white/30">
          <span className="text-xs text-warm-600">Philosophy Adoption</span>
          <span className="text-sm font-semibold text-warm-900 tabular-nums">{coachhelm.coachPhilosophyAdoption}%</span>
        </div>
        <div className="flex items-center justify-between p-3 rounded-xl bg-white/50 border border-white/30">
          <span className="text-xs text-warm-600">Avg per Generation</span>
          <span className="text-sm font-semibold text-warm-900 tabular-nums">{coachhelm.avgInsightsPerGeneration}</span>
        </div>
      </div>
    </div>
  );
}
