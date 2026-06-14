'use client';

import { lazy, Suspense } from 'react';
import type {
  AdminDashboardData,
  AdminDashboardRollup,
} from '@/app/golf/actions/admin-data';
import {
  StatusBar,
  OverviewBriefing,
  NeedsAttentionSection,
  RecentActivityFeed,
  DeepDiveAccordion,
} from './overview';
import { SectionSkeleton } from './SectionSkeleton';

// Each deep-dive accordion body is lazy-loaded so its chunk only downloads
// when the user expands the section. Wrapping each in its own <Suspense>
// boundary means the three sections reveal independently — a slow chunk on
// one (DailyCharts pulls Recharts, ~100KB gz) doesn't block the others, and
// each shows its own SectionSkeleton in the meantime instead of one global
// loader. Default chunk-name comments help debugging in the network panel.
const UserFunnelViz = lazy(() =>
  import(/* webpackChunkName: "admin-user-funnel" */ './UserFunnelViz').then(
    (m) => ({ default: m.UserFunnelViz }),
  ),
);
const DailyCharts = lazy(() =>
  import(/* webpackChunkName: "admin-daily-charts" */ './DailyCharts').then(
    (m) => ({ default: m.DailyCharts }),
  ),
);
const PlatformHealthCard = lazy(() =>
  import(/* webpackChunkName: "admin-platform-health" */ './PlatformHealthCard').then(
    (m) => ({ default: m.PlatformHealthCard }),
  ),
);

interface Props {
  data: AdminDashboardData;
  /** Optional: fast cached rollup (1 RPC). When present we can prefer its
   *  numbers over the legacy fetch. Left optional while tabs are migrated. */
  rollup?: AdminDashboardRollup | null;
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
        className={`text-2xl font-bold tabular-nums ${accent ? 'text-primary-600' : 'text-warm-900'}`}
      >
        {value}
      </span>
      <span className="text-xs font-medium text-warm-400 mt-1 truncate w-full">{label}</span>
    </div>
  );
}

export function OverviewTab({ data, rollup: _rollup, onNavigateTab }: Props) {
  // _rollup: reserved for wave-3 migration away from the 95-query AdminDashboardData.
  // Presence at this layer lets us start swapping KpiCard sources without
  // touching the tab's callers again.
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

      {/* Deep Dives — each body is lazy-loaded and wrapped in its own
          Suspense boundary so the accordions reveal independently. */}
      <div className="space-y-3">
        <DeepDiveAccordion title="User Funnel" subtitle={funnelConversion}>
          <Suspense fallback={<SectionSkeleton height={180} label="Loading user funnel" />}>
            <UserFunnelViz funnel={data.playerFunnel.funnel} />
          </Suspense>
        </DeepDiveAccordion>
        <DeepDiveAccordion title="Daily Trends">
          <Suspense fallback={<SectionSkeleton height={260} label="Loading daily trends" />}>
            <DailyCharts signupsByDay={data.signupsByDay} visitsByDay={data.visitsByDay} />
          </Suspense>
        </DeepDiveAccordion>
        <DeepDiveAccordion title="Platform Health" subtitle={healthSubtitle}>
          <Suspense fallback={<SectionSkeleton height={220} label="Loading platform health" />}>
            <PlatformHealthCard
              health={data.health}
              infraHealth={data.infraHealth}
              healthScore={data.growth.platformHealthScore}
              healthScoreBreakdown={data.growth.platformHealthBreakdown}
            />
          </Suspense>
        </DeepDiveAccordion>
      </div>
    </div>
  );
}
