'use client';

/**
 * MyStatsClient
 * 
 * Player's personal stats dashboard showing their own performance data.
 * Reuses existing player-stats components for consistent UI.
 */

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { PageLoading } from '@/components/ui/loading';
import {
  IconChart,
  IconTrendingUp,
  IconUser,
  IconRefresh,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  StatsOverviewCards,
  GameVsPracticeChart,
  TrendChart,
  SessionHistory,
} from '@/components/baseball/player-stats';
import { MySeasonStats } from '@/components/baseball/season-stats/MySeasonStats';
import { getMyStats, getMyAggregates } from '@/app/baseball/actions/stats';
import type { BaseballPlayerStats, BaseballPlayerAggregates } from '@/lib/types';

interface PlayerInfo {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  primary_position: string | null;
  secondary_position: string | null;
  grad_year: number | null;
  jersey_number: string | null;
}

export function MyStatsClient() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<BaseballPlayerStats[]>([]);
  const [aggregates, setAggregates] = useState<BaseballPlayerAggregates | null>(null);
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);

  async function fetchData(showRefreshing = false) {
    if (showRefreshing) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const [statsResult, aggregatesResult] = await Promise.all([
        getMyStats(),
        getMyAggregates(),
      ]);

      if (statsResult.error) {
        setError(statsResult.error);
        return;
      }

      if (aggregatesResult.error) {
        setError(aggregatesResult.error);
        return;
      }

      setStats(statsResult.data || []);
      setAggregates(aggregatesResult.data);
      setPlayer(aggregatesResult.player as PlayerInfo);
      setTeamName(aggregatesResult.teamName);
    } catch (err) {
      console.error('Error fetching stats:', err);
      setError('Failed to load your stats. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return <PageLoading />;
  }

  if (error) {
    return (
      <div className="min-h-dvh bg-cream-100 flex items-center justify-center p-4">
        <div className="glass-standard rounded-2xl p-8 text-center max-w-md w-full">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <IconChart size={24} className="text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-warm-900 mb-2">Unable to Load Stats</h2>
          <p className="text-warm-500 mb-6">{error}</p>
          <Button onClick={() => fetchData()}>Try Again</Button>
        </div>
      </div>
    );
  }

  const fullName = player
    ? `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Player'
    : 'Player';
  const positions = player
    ? [player.primary_position, player.secondary_position].filter(Boolean).join(' / ')
    : '';

  return (
    <div className="min-h-dvh bg-cream-100">
      <Header
        title="My Stats"
        subtitle="Track your performance and progress"
      />

      <div className="max-w-[1536px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Player Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Player Avatar */}
            <div className="w-16 h-16 rounded-full bg-warm-100 flex items-center justify-center overflow-hidden flex-shrink-0">
              {player?.avatar_url ? (
                <img
                  src={player.avatar_url}
                  alt={fullName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <IconUser size={24} className="text-warm-400" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-warm-900">
                  {fullName}
                </h1>
                {player?.jersey_number && (
                  <span className="text-lg text-warm-400">#{player.jersey_number}</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-warm-500">
                {positions && <span>{positions}</span>}
                {positions && player?.grad_year && <span>•</span>}
                {player?.grad_year && <span>Class of {player.grad_year}</span>}
                {teamName && (
                  <>
                    <span>•</span>
                    <span>{teamName}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-2"
          >
            <IconRefresh size={16} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>

        {/* Season Stats from Box Scores (new system) */}
        <div className="mb-6">
          <MySeasonStats />
        </div>

        {/* Quick Stats Summary */}
        {aggregates && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="glass-standard rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                <IconChart size={18} className="text-primary-600" />
              </div>
              <div>
                <p className="text-micro text-warm-500 uppercase">Sessions</p>
                <p className="text-lg font-bold text-warm-900">{aggregates.total_sessions}</p>
              </div>
            </div>
            <div className="glass-standard rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <IconTrendingUp size={18} className="text-blue-600" />
              </div>
              <div>
                <p className="text-micro text-warm-500 uppercase">Trend</p>
                <p className="text-lg font-bold text-warm-900 capitalize">
                  {aggregates.recent_trend || 'N/A'}
                </p>
              </div>
            </div>
            <div className="glass-standard rounded-xl p-4">
              <p className="text-micro text-warm-500 uppercase">Practice AVG</p>
              <p className="text-lg font-bold text-warm-900">
                {aggregates.practice_avg?.toFixed(3) || '---'}
              </p>
            </div>
            <div className="glass-standard rounded-xl p-4">
              <p className="text-micro text-warm-500 uppercase">Game AVG</p>
              <p className="text-lg font-bold text-warm-900">
                {aggregates.game_avg?.toFixed(3) || '---'}
              </p>
            </div>
          </div>
        )}

        {/* Empty State */}
        {stats.length === 0 && !aggregates && (
          <div className="glass-standard rounded-2xl p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-4">
              <IconChart size={28} className="text-warm-400" />
            </div>
            <h2 className="text-xl font-bold text-warm-900 mb-2">No Stats Yet</h2>
            <p className="text-warm-500 max-w-md mx-auto">
              Your stats will appear here once your coach uploads session data.
              Check back after your next practice or game!
            </p>
          </div>
        )}

        {/* Stats Overview Cards */}
        {(stats.length > 0 || aggregates) && (
          <section aria-label="Key Statistics" className="mb-8">
            <h2 className="sr-only">Key Statistics</h2>
            <StatsOverviewCards aggregates={aggregates} />
          </section>
        )}

        {/* Charts Grid */}
        {stats.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <section aria-label="Performance Trend">
              <TrendChart stats={stats} />
            </section>
            <section aria-label="Game vs Practice Comparison">
              <GameVsPracticeChart stats={stats} />
            </section>
          </div>
        )}

        {/* Session History */}
        {stats.length > 0 && (
          <section aria-label="Session History">
            <SessionHistory stats={stats} />
          </section>
        )}
      </div>
    </div>
  );
}
