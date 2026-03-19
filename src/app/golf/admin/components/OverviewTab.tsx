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

/** Compact KPI stat card */
function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="glass-premium rounded-2xl p-4 flex flex-col items-center justify-center text-center min-w-0">
      <span
        className={`text-2xl font-bold tabular-nums ${accent ? 'text-green-600' : 'text-warm-900'}`}
      >
        {value}
      </span>
      <span className="text-xs font-medium text-warm-400 mt-1 truncate w-full">{label}</span>
    </div>
  );
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

  const totalUsers =
    Number(data.users.totalCoaches) +
    Number(data.users.totalPlayers) +
    Number(data.users.totalAdmins);
  const activeThisWeek = Number(data.userActivity.summary.activeThisWeek);
  const roundsThisWeek = Number(data.health.roundsThisWeek);
  const openIncidents = Number(data.errorLogs.incidentCounts.open);

  return (
    <div className="space-y-6">
      {/* Section title */}
      <div>
        <h2 className="text-xl font-bold text-warm-900">Weekly Briefing</h2>
        <p className="text-sm text-warm-400 mt-0.5">{formatCurrentDate()}</p>
      </div>

      <StatusBar
        healthScore={data.growth.platformHealthScore}
        openIncidents={openIncidents}
        activeUsersWeek={activeThisWeek}
        roundsThisWeek={roundsThisWeek}
      />

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total Users" value={totalUsers} />
        <KpiCard label="Active This Week" value={activeThisWeek} accent />
        <KpiCard label="Rounds This Week" value={roundsThisWeek} />
        <KpiCard
          label="Health Score"
          value={`${healthScore}/100`}
          accent={healthScore >= 70}
        />
      </div>

      <OverviewBriefing data={data} />

      <NeedsAttentionSection
        items={data.needsAttention}
        openIncidents={openIncidents}
        onNavigateTab={onNavigateTab}
      />

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
