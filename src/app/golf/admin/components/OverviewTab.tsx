'use client';

import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import {
  StatusBar,
  OverviewBriefing,
  NeedsAttentionSection,
  RecentActivityFeed,
  DeepDiveAccordion,
} from './overview';
import { UserFunnelViz } from './UserFunnelViz';
import { DailyCharts } from './DailyCharts';
import { PlatformHealthCard } from './PlatformHealthCard';

interface Props {
  data: AdminDashboardData;
  onNavigateTab?: (tab: string) => void;
}

function formatCurrentDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function OverviewTab({ data, onNavigateTab }: Props) {
  // Compute subtitles for deep dives
  const funnel = data.playerFunnel.funnel;
  const signupStage = funnel.find((s) => s.stage.toLowerCase().includes('sign'));
  const activeStage = funnel.find((s) => s.stage.toLowerCase().includes('active'));
  const funnelConversion =
    signupStage && activeStage && signupStage.count > 0
      ? `${Math.round((activeStage.count / signupStage.count) * 100)}% conversion`
      : undefined;

  const healthScore = Number(data.growth.platformHealthScore);
  const healthSubtitle =
    healthScore > 0 ? `Score: ${healthScore}/100` : undefined;

  return (
    <div className="space-y-6">
      {/* Section title */}
      <div>
        <h2 className="text-xl font-bold text-warm-900">Weekly Briefing</h2>
        <p className="text-sm text-warm-400 mt-0.5">{formatCurrentDate()}</p>
      </div>

      <StatusBar
        healthScore={data.growth.platformHealthScore}
        openIncidents={data.errorLogs.incidentCounts.open}
        activeUsersWeek={data.userActivity.summary.activeThisWeek}
        roundsThisWeek={data.health.roundsThisWeek}
      />

      <OverviewBriefing data={data} />

      <NeedsAttentionSection items={data.needsAttention} onNavigateTab={onNavigateTab} />

      <RecentActivityFeed activity={data.activity} />

      {/* Deep Dives */}
      <div className="space-y-3">
        <DeepDiveAccordion title="User Funnel" subtitle={funnelConversion}>
          <UserFunnelViz funnel={data.playerFunnel.funnel} />
        </DeepDiveAccordion>
        <DeepDiveAccordion title="Daily Trends">
          <DailyCharts signupsByDay={data.signupsByDay} visitsByDay={data.visitsByDay} />
        </DeepDiveAccordion>
        <DeepDiveAccordion title="Platform Health" subtitle={healthSubtitle}>
          <PlatformHealthCard health={data.health} infraHealth={data.infraHealth} />
        </DeepDiveAccordion>
      </div>
    </div>
  );
}
