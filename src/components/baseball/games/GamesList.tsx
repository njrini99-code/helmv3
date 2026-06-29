'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { GameCard } from './GameCard';
import { getTeamGames, deleteGame } from '@/app/baseball/actions/games';
import type { BaseballGame, BaseballGameType } from '@/lib/types';
import { IconPlus, IconRefresh } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/sonner';

interface GamesListProps {
  teamId: string;
  title?: string;
  showAddButton?: boolean;
  limit?: number;
}

type TabFilter = 'all' | 'game' | 'scrimmage';

const SEASON_YEARS = (() => {
  const current = new Date().getFullYear();
  return [current, current - 1, current - 2];
})();

export function GamesList({ teamId, title = 'Games & Scrimmages', showAddButton = true, limit }: GamesListProps) {
  const { showToast } = useToast();
  const [games, setGames] = useState<BaseballGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear());
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchGames = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const result = await getTeamGames(teamId, {
        gameType: activeTab === 'all' ? undefined : (activeTab as BaseballGameType),
        seasonYear,
        limit,
      });

      if (result.success) {
        setGames(result.data ?? []);
      } else {
        setError(result.error ?? 'Failed to load games');
      }
      setLoading(false);
      setRefreshing(false);
    },
    [teamId, activeTab, seasonYear, limit]
  );

  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  async function handleDelete(gameId: string) {
    if (!confirm('Delete this game and all its stats? This cannot be undone.')) return;
    setDeletingId(gameId);
    const result = await deleteGame(gameId);
    if (result.success) {
      setGames((prev) => prev.filter((g) => g.id !== gameId));
    } else {
      showToast(result.error ?? 'Failed to delete game', 'error');
    }
    setDeletingId(null);
  }

  const completedGames = games.filter((g) => g.status === 'completed');
  const wins = completedGames.filter(
    (g) => g.our_score != null && g.opponent_score != null && g.our_score > g.opponent_score
  ).length;
  const losses = completedGames.length - wins;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-warm-900">{title}</h2>
          {completedGames.length > 0 && (
            <p className="text-sm text-warm-500 mt-0.5">
              {completedGames.length} played · {wins}W {losses}L
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Season selector */}
          <select
            value={seasonYear}
            onChange={(e) => setSeasonYear(Number(e.target.value))}
            className="text-sm border border-warm-200 rounded-lg px-3 py-1.5 bg-cream-100/75 text-warm-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {SEASON_YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchGames(true)}
            disabled={refreshing}
            className="h-8 w-8 p-0"
            aria-label="Refresh games"
          >
            <IconRefresh size={16} className={refreshing ? 'animate-spin' : ''} />
          </Button>

          {showAddButton && (
            <Link
              href="/baseball/dashboard/stats/games/new"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <IconPlus size={16} />
              Add Game
            </Link>
          )}
        </div>
      </div>

      {/* Type filter tabs */}
      <div className="flex gap-1 p-1 bg-warm-100 rounded-xl w-fit">
        {(['all', 'game', 'scrimmage'] as TabFilter[]).map((tab) => (
          <Button variant="ghost"
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all capitalize ${
              activeTab === tab
                ? 'bg-white text-warm-900 shadow-sm'
                : 'text-warm-500 hover:text-warm-700'
            }`}
          >
            {tab === 'all' ? 'All' : tab === 'scrimmage' ? 'Scrimmages' : 'Games'}
          </Button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="relative h-28 glass-standard rounded-2xl overflow-clip"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
          <p className="text-sm font-medium text-red-700 mb-1">Couldn&apos;t load games</p>
          <p className="text-sm text-red-600/90 mb-4">{error}</p>
          <Button variant="secondary" size="sm" onClick={() => fetchGames()}>
            Try again
          </Button>
        </div>
      ) : games.length === 0 ? (
        <div className="glass-standard rounded-2xl p-10 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center text-primary-600/80 mx-auto mb-5">
            <IconPlus size={28} />
          </div>
          <h3 className="text-body-lg font-semibold text-warm-900 tracking-tight mb-2">No games yet</h3>
          <p className="text-sm leading-relaxed text-warm-500 max-w-sm mx-auto mb-6">
            Add your first game to start tracking box scores and season stats.
          </p>
          {showAddButton && (
            <Link
              href="/baseball/dashboard/stats/games/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl transition-colors"
            >
              <IconPlus size={16} />
              Add First Game
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {games.map((game) => (
            <div key={game.id} className="relative">
              <GameCard game={game} />
              {deletingId === game.id && (
                <div className="absolute inset-0 bg-cream-100/82 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                  <span className="text-sm text-warm-500">Deleting...</span>
                </div>
              )}
              {/* Delete action - accessible via right-click context or small button */}
              <Button variant="danger"
                onClick={() => handleDelete(game.id)}
                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-warm-300 hover:text-red-500 transition-all text-xs hidden"
                aria-label="Delete game"
              >
                ×
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
