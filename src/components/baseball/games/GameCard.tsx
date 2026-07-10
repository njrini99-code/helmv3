'use client';

import Link from 'next/link';
import type { BaseballGame } from '@/lib/types';
import { IconCalendar, IconMapPin, IconTrendingUp } from '@/components/icons';
import { formatDate } from '@/lib/baseball/format-date';
import { PaperCard, InkBadge } from '@/components/baseball/living-annual';
import type { InkBadgeProps } from '@/components/baseball/living-annual';

interface GameCardProps {
  game: BaseballGame;
}

/** Result stamp tone — mirrors BoxScoreView's `resultTone`: a win reads
 *  team-green, everything else (loss or tie) stays quiet neutral graphite —
 *  never the old win-green/loss-red/tie-amber rainbow. */
function getResultInfo(game: BaseballGame): { label: string; tone: NonNullable<InkBadgeProps['tone']> } | null {
  if (game.status !== 'completed' || game.our_score == null || game.opponent_score == null) {
    return null;
  }
  if (game.our_score > game.opponent_score) return { label: 'W', tone: 'team' };
  if (game.our_score < game.opponent_score) return { label: 'L', tone: 'neutral' };
  return { label: 'T', tone: 'neutral' };
}

/** Status tag tone — `in_progress` is the one genuinely-live moment (the
 *  only sanctioned `sodium` use, per InkBadge's own doctrine); `postponed`
 *  still needs the coach's action, so it takes the same `pursuit` clay lane
 *  every other "needs attention" tag in the kit uses; everything else is
 *  quiet neutral graphite. Never the old gray/blue/red/amber rainbow. */
const STATUS_TONE: Record<string, NonNullable<InkBadgeProps['tone']>> = {
  scheduled: 'neutral',
  in_progress: 'sodium',
  completed: 'neutral',
  cancelled: 'neutral',
  postponed: 'pursuit',
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
  // formatDate() anchors bare YYYY-MM-DD strings at local midnight
  // internally, so a date-only string never shifts a day west of UTC; short
  // date + near-term relative ("Today"/"Tomorrow") is the one house grammar
  // shared with the other stats/schedule surfaces.
  const formattedDate = formatDate(game.game_date);
  const detailHref = `/baseball/dashboard/stats/games/${game.id}`;
  const opponentLabel = game.opponent_name ? `vs ${game.opponent_name}` : 'TBD Opponent';

  return (
    <Link
      href={detailHref}
      data-testid="game-card"
      aria-label={`Open ${game.game_type === 'scrimmage' ? 'scrimmage' : 'game'} ${opponentLabel}`}
      className="group block rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grade-plus focus-visible:ring-offset-2"
    >
      <PaperCard className="p-4 transition-shadow duration-200 hover:shadow-card-hover">
        <div className="flex items-start justify-between gap-3">
          {/* Left: game info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              {/* Game type badge */}
              <InkBadge
                label={game.game_type === 'scrimmage' ? 'Scrimmage' : 'Game'}
                tone={game.game_type === 'scrimmage' ? 'neutral' : 'team'}
              />
              {/* Home/Away */}
              {game.home_away && (
                <span className="text-xs text-warm-400 uppercase tracking-wide font-medium">
                  {game.home_away === 'home' ? 'Home' : game.home_away === 'away' ? 'Away' : 'Neutral'}
                </span>
              )}
            </div>

            <h3 className="text-base font-semibold text-warm-900 truncate">{opponentLabel}</h3>

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
                {result && <InkBadge label={result.label} tone={result.tone} variant="solid" />}
                <span className="text-xl font-bold text-warm-900 tabular-nums">
                  {game.our_score}-{game.opponent_score}
                </span>
              </div>
            ) : (
              <InkBadge
                label={STATUS_LABELS[game.status] ?? game.status}
                tone={STATUS_TONE[game.status] ?? STATUS_TONE.scheduled}
              />
            )}

            {/* Stats links */}
            <div className="flex items-center gap-1.5">
              {game.status === 'completed' && (Number(game.batting_count) > 0 || Number(game.pitching_count) > 0) ? (
                <span className="inline-flex items-center gap-1 text-xs text-primary-600 font-medium">
                  <IconTrendingUp size={12} />
                  Box Score
                </span>
              ) : game.status !== 'cancelled' ? (
                <span className="inline-flex items-center gap-1 text-xs text-warm-400 group-hover:text-primary-600 font-medium transition-colors">
                  Enter Results
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Stats counts for completed games */}
        {game.status === 'completed' && (
          <div className="mt-3 pt-3 border-t border-[color:var(--hairline)] flex items-center gap-3 text-xs text-warm-400">
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
      </PaperCard>
    </Link>
  );
}
