'use client';

import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { cn } from '@/lib/utils';

interface Props {
  baseball: AdminDashboardData['baseball'];
}

const PIPELINE_LABELS: Record<string, string> = {
  watchlist: 'Watchlist',
  high_priority: 'Priority',
  offer_extended: 'Offer',
  committed: 'Committed',
  uninterested: 'Uninterested',
};

const PIPELINE_COLORS: Record<string, string> = {
  watchlist: 'bg-warm-400',
  high_priority: 'bg-amber-400',
  offer_extended: 'bg-primary-400',
  committed: 'bg-primary-600',
  uninterested: 'bg-warm-300',
};

export function BaseballOps({ baseball }: Props) {
  const totalPipeline = Object.values(baseball.watchlistStages).reduce((s, v) => s + v, 0);
  const bbTotalUsers = baseball.totalPlayers + baseball.totalCoaches;
  const bbOnboardingRate = bbTotalUsers > 0
    ? Math.round(((baseball.playersOnboarded + baseball.coachesOnboarded) / bbTotalUsers) * 100)
    : 0;

  return (
    <div className="glass-standard rounded-2xl p-6 transition-all duration-200 hover:bg-white/80 active:bg-white/90 hover:shadow-card-hover">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-white/50 rounded-lg">
            <span className="text-lg">&#9918;</span>
          </div>
          <h3 className="text-lg font-semibold text-warm-900">Baseball Operations</h3>
        </div>
        <span className="text-xs text-warm-400">{bbTotalUsers} total users</span>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        <div className="bg-white/50 rounded-xl p-3 text-center">
          <p className="text-xl font-semibold text-warm-900 tabular-nums">{baseball.totalPlayers}</p>
          <p className="text-micro text-warm-400 mt-0.5">Players</p>
        </div>
        <div className="bg-white/50 rounded-xl p-3 text-center">
          <p className="text-xl font-semibold text-warm-900 tabular-nums">{baseball.totalCoaches}</p>
          <p className="text-micro text-warm-400 mt-0.5">Coaches</p>
        </div>
        <div className="bg-white/50 rounded-xl p-3 text-center">
          <p className="text-xl font-semibold text-warm-900 tabular-nums">{baseball.commitments}</p>
          <p className="text-micro text-warm-400 mt-0.5">Commitments</p>
        </div>
        <div className="bg-white/50 rounded-xl p-3 text-center">
          <p className={cn(
            'text-xl font-semibold tabular-nums',
            bbOnboardingRate > 60 ? 'text-primary-700' : 'text-amber-600'
          )}>{bbOnboardingRate}%</p>
          <p className="text-micro text-warm-400 mt-0.5">Onboarded</p>
        </div>
      </div>

      {/* Recruiting Pipeline */}
      {totalPipeline > 0 && (
        <div className="mb-5">
          <span className="text-micro text-warm-400 uppercase tracking-wider font-medium">Recruiting Pipeline</span>
          <div className="mt-2 space-y-2">
            {Object.entries(baseball.watchlistStages)
              .sort(([, a], [, b]) => b - a)
              .map(([stage, count]) => {
                const pct = totalPipeline > 0 ? (count / totalPipeline) * 100 : 0;
                return (
                  <div key={stage} className="flex items-center gap-2">
                    <span className="text-xs text-warm-500 w-20 truncate">
                      {PIPELINE_LABELS[stage] || stage.replace(/_/g, ' ')}
                    </span>
                    <div className="flex-1 h-2 bg-warm-100 rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all duration-300', PIPELINE_COLORS[stage] || 'bg-warm-400')}
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-warm-700 tabular-nums w-8 text-right">{count}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Platform stats */}
      <div className="pt-4 border-t border-warm-100">
        <span className="text-micro text-warm-400 uppercase tracking-wider font-medium">Platform</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2.5">
          <div className="bg-white/40 rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-warm-500">Teams</span>
            <span className="text-xs font-medium text-warm-700 tabular-nums">{baseball.totalTeams}</span>
          </div>
          <div className="bg-white/40 rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-warm-500">Events</span>
            <span className="text-xs font-medium text-warm-700 tabular-nums">{baseball.totalEvents}</span>
          </div>
          <div className="bg-white/40 rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-warm-500">Camps</span>
            <span className="text-xs font-medium text-warm-700 tabular-nums">{baseball.totalCamps}</span>
          </div>
          <div className="bg-white/40 rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-warm-500">Recruiting</span>
            <span className="text-xs font-medium text-warm-700 tabular-nums">{baseball.recruitingActivatedPlayers}</span>
          </div>
        </div>
      </div>

      {/* Activity stats */}
      <div className="pt-4 border-t border-warm-100">
        <span className="text-micro text-warm-400 uppercase tracking-wider font-medium">Activity (30d)</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2.5">
          <div className="bg-white/40 rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-warm-500">Videos</span>
            <span className="text-xs font-medium text-warm-700 tabular-nums">{baseball.videos30d}</span>
          </div>
          <div className="bg-white/40 rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-warm-500">Messages</span>
            <span className="text-xs font-medium text-warm-700 tabular-nums">{baseball.messages30d}</span>
          </div>
          <div className="bg-white/40 rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-warm-500">Engagement</span>
            <span className="text-xs font-medium text-warm-700 tabular-nums">{baseball.engagementEvents30d}</span>
          </div>
          <div className="bg-white/40 rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-warm-500">Convos</span>
            <span className="text-xs font-medium text-warm-700 tabular-nums">{baseball.conversations30d}</span>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {bbTotalUsers === 0 && (
        <div className="text-center py-8">
          <p className="text-sm text-warm-400">No baseball users yet</p>
        </div>
      )}
    </div>
  );
}
