'use client';

import Link from 'next/link';
import type { BaseballGame } from '@/lib/types';
import { IconCalendar, IconMapPin, IconTrendingUp } from '@/components/icons';

interface GameCardProps {
  game: BaseballGame;
  onDelete?: (gameId: string) => void;
}

function getResultInfo(game: BaseballGame) {
  if (game.status !== 'completed' || game.our_score == null || game.opponent_score == null) {
    return null;
  }
  if (game.our_score > game.opponent_score) return { label: 'W', color: 'text-primary-600 bg-primary-50' };
  if (game.our_score < game.opponent_score) return { label: 'L', color: 'text-red-600 bg-red-50' };
  return { label: 'T', color: 'text-amber-600 bg-amber-50' };
}

const STATUS_STYLES: Record<string, string> = {
  scheduled: 'text-warm-500 bg-warm-100',
  in_progress: 'text-blue-600 bg-blue-50',
  completed: 'text-warm-600 bg-warm-100',
  cancelled: 'text-red-500 bg-red-50',
  postponed: 'text-amber-500 bg-amber-50',
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Final',
  cancelled: 'Cancelled',
  postponed: 'Postponed',
};

export function GameCard({ game }: GameCardProps) {
  const result = getResultInfo(game);
  const gameDate = new Date(game.game_date + 'T00:00:00');
  const formattedDate = gameDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200 group">
      <div className="flex items-start justify-between gap-3">
        {/* Left: game info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            {/* Game type badge */}
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wide ${
                game.game_type === 'scrimmage'
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-primary-100 text-primary-700'
              }`}
            >
              {game.game_type === 'scrimmage' ? 'Scrimmage' : 'Game'}
            </span>
            {/* Home/Away */}
            {game.home_away && (
              <span className="text-xs text-warm-400 uppercase tracking-wide font-medium">
                {game.home_away === 'home' ? 'Home' : game.home_away === 'away' ? 'Away' : 'Neutral'}
              </span>
            )}
          </div>

          <h3 className="text-base font-semibold text-warm-900 truncate">
            {game.opponent_name ? `vs ${game.opponent_name}` : 'TBD Opponent'}
          </h3>

          <div className="flex items-center gap-3 mt-1.5 text-xs text-warm-500">
            <span className="flex items-center gap-1">
              <IconCalendar size={12} />
              {formattedDate}
            </span>
            {game.location && (
              <span className="flex items-center gap-1 truncate">
                <IconMapPin size={12} />
                <span className="truncate">{game.location}</span>
              </span>
            )}
          </div>
        </div>

        {/* Right: result/score */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          {game.status === 'completed' && game.our_score != null && game.opponent_score != null ? (
            <div className="flex items-center gap-2">
              {result && (
                <span className={`px-2 py-0.5 rounded-md text-sm font-bold ${result.color}`}>
                  {result.label}
                </span>
              )}
              <span className="text-xl font-bold text-warm-900 tabular-nums">
                {game.our_score}-{game.opponent_score}
              </span>
            </div>
          ) : (
            <span
              className={`px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_STYLES[game.status] ?? STATUS_STYLES.scheduled}`}
            >
              {STATUS_LABELS[game.status] ?? game.status}
            </span>
          )}

          {/* Stats links */}
          <div className="flex items-center gap-1.5">
            {game.status === 'completed' && (Number(game.batting_count) > 0 || Number(game.pitching_count) > 0) ? (
              <Link
                href={`/baseball/dashboard/stats/games/${game.id}`}
                className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium"
              >
                <IconTrendingUp size={12} />
                Box Score
              </Link>
            ) : game.status !== 'cancelled' ? (
              <Link
                href={`/baseball/dashboard/stats/games/${game.id}`}
                className="inline-flex items-center gap-1 text-xs text-warm-400 hover:text-primary-600 font-medium transition-colors"
              >
                Enter Results
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      {/* Stats counts for completed games */}
      {game.status === 'completed' && (
        <div className="mt-3 pt-3 border-t border-warm-100 flex items-center gap-3 text-xs text-warm-400">
          <span>{game.batting_count ?? 0} batting lines</span>
          <span>·</span>
          <span>{game.pitching_count ?? 0} pitching lines</span>
          {game.innings_played && game.innings_played !== 9 && (
            <>
              <span>·</span>
              <span>{game.innings_played} innings</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
