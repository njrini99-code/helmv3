'use client';

/**
 * PlayerStatsClient
 * 
 * Main client component for individual player stats page.
 * Orchestrates the display of stats overview, charts, and session history.
 */

import { IconArrowLeft, IconUser, IconChart, IconTrendingUp } from '@/components/icons';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { StatsOverviewCards } from './StatsOverviewCards';
import { GameVsPracticeChart } from './GameVsPracticeChart';
import { TrendChart } from './TrendChart';
import { SessionHistory } from './SessionHistory';
import type { BaseballPlayerStats, BaseballPlayerAggregates } from '@/lib/types';

interface PlayerInfo {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  primary_position: string | null;
  secondary_position: string | null;
  grad_year: number | null;
  jersey_number?: string | null;
}

interface PlayerStatsClientProps {
  player: PlayerInfo;
  stats: BaseballPlayerStats[];
  aggregates: BaseballPlayerAggregates | null;
  teamName: string;
}

function PlayerStatsClient({
  player,
  stats,
  aggregates,
  teamName,
}: PlayerStatsClientProps) {
  const fullName = `${player.first_name} ${player.last_name}`;
  const positions = [player.primary_position, player.secondary_position].filter(Boolean).join(' / ');

  return (
    <div className="min-h-dvh bg-[#FFFEFA]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6">
          <Link href={`/baseball/dashboard/players/${player.id}`}>
            <Button variant="ghost" size="sm" className="mb-4 -ml-2">
              <IconArrowLeft size={16} />
              Back to Profile
            </Button>
          </Link>

          <div className="flex items-center gap-4">
            {/* Player Avatar */}
            <div className="w-16 h-16 rounded-full bg-warm-100 flex items-center justify-center overflow-hidden flex-shrink-0">
              {player.avatar_url ? (
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
                {player.jersey_number && (
                  <span className="text-lg text-warm-400">#{player.jersey_number}</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-warm-500">
                {positions && <span>{positions}</span>}
                {positions && player.grad_year && <span>•</span>}
                {player.grad_year && <span>Class of {player.grad_year}</span>}
                <span>•</span>
                <span>{teamName}</span>
              </div>
            </div>
          </div>
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

        {/* Stats Overview Cards */}
        <section aria-label="Key Statistics" className="mb-8">
          <h2 className="sr-only">Key Statistics</h2>
          <StatsOverviewCards aggregates={aggregates} />
        </section>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <section aria-label="Performance Trend">
            <TrendChart stats={stats} />
          </section>
          <section aria-label="Game vs Practice Comparison">
            <GameVsPracticeChart stats={stats} />
          </section>
        </div>

        {/* Session History */}
        <section aria-label="Session History">
          <SessionHistory stats={stats} />
        </section>
      </div>
    </div>
  );
}
