'use client';

import type { BaseballRosterPlayer } from '@/lib/types';
import { IconChartBar } from '@/components/icons';
import {
  TeamBattingOverview,
  TeamBattingOverviewSkeleton,
  GameVsPracticePanel,
  GameVsPracticePanelSkeleton,
  PlayerPerformanceGrid,
  PlayerPerformanceGridSkeleton,
  TrendAnalysisPanel,
  TrendAnalysisPanelSkeleton,
} from '@/components/baseball/command-center/analytics';

// ============================================================================
// PROP TYPES
// ============================================================================

interface AnalyticsCoachViewProps {
  players: BaseballRosterPlayer[];
  teamName: string;
  loading?: boolean;
}

// ============================================================================
// EMPTY STATE
// ============================================================================

function NoRosterState({ teamName }: { teamName: string }) {
  return (
    <div className="p-8">
      <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-12 text-center shadow-glass">
        <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <IconChartBar size={32} className="text-primary-400" />
        </div>
        <h3 className="text-lg font-semibold tracking-tight text-warm-900 mb-2">
          No Player Data Yet
        </h3>
        <p className="text-sm leading-relaxed text-warm-500 max-w-sm mx-auto">
          {teamName
            ? `Add players to ${teamName} and upload stat sessions to see team analytics here.`
            : 'Add players and upload stat sessions to see team analytics here.'}
        </p>
        <a
          href="/baseball/dashboard/roster"
          className="inline-flex items-center mt-6 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white rounded-lg font-medium text-sm transition-colors"
        >
          Manage Roster
        </a>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COACH ANALYTICS VIEW
// ============================================================================

export function AnalyticsCoachView({
  players,
  teamName,
  loading = false,
}: AnalyticsCoachViewProps) {
  // When loading, show skeleton layout
  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-6">
        <TeamBattingOverviewSkeleton />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GameVsPracticePanelSkeleton />
          <TrendAnalysisPanelSkeleton />
        </div>
        <PlayerPerformanceGridSkeleton />
      </div>
    );
  }

  // Honest empty state when no players
  if (players.length === 0) {
    return <NoRosterState teamName={teamName} />;
  }

  // Players with any aggregate data (for panels that require aggregates)
  const playersWithData = players.filter((p) => p.aggregates != null);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Row 1 — Team-wide batting summary (AVG / OBP / SLG / OPS) */}
      <TeamBattingOverview players={players} />

      {/* Row 2 — Game vs Practice pressure panel + Trend analysis side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* GameVsPracticePanel: honest disclosure about career aggregates
            is already rendered inside the component when timeRange !== '30d' */}
        <GameVsPracticePanel players={players} />
        <TrendAnalysisPanel players={players} />
      </div>

      {/* Row 3 — Full sortable heatmap grid (15 players max, then "+N more" footer) */}
      {playersWithData.length > 0 ? (
        <PlayerPerformanceGrid players={players} />
      ) : (
        <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6 text-center shadow-glass">
          <p className="text-sm text-warm-500">
            Performance grid appears once stat sessions are uploaded for roster players.
          </p>
        </div>
      )}

      {/* Footer disclosure: aggregate-only note */}
      <p className="text-xs text-warm-400 text-center pb-2">
        Stats reflect career aggregates from uploaded sessions.
        Per-period breakdowns will appear in a future update.
      </p>
    </div>
  );
}
