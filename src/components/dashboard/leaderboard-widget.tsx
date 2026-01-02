import { TrendingUp, TrendingDown, Minus, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Player {
  rank: number;
  name: string;
  avatarUrl?: string;
  handicap: number;
  change: number; // Negative = improved (good)
}

export function LeaderboardWidget({ players }: { players: Player[] }) {
  const rankStyles: Record<number, string> = {
    1: 'bg-amber-400 text-amber-900', // Gold
    2: 'bg-warm-300 text-warm-700', // Silver
    3: 'bg-amber-600/70 text-amber-100', // Bronze
  };

  return (
    <div className="space-y-2">
      {players.map((player) => {
        const isTop3 = player.rank <= 3;
        const improved = player.change < 0;
        const declined = player.change > 0;

        const TrendIcon = improved
          ? TrendingDown
          : declined
          ? TrendingUp
          : Minus;

        return (
          <div
            key={player.rank}
            className={cn(
              'flex items-center gap-3',
              'p-3 rounded-[12px]',
              // Tier 3 glass
              'bg-white/40 backdrop-blur-[4px]',
              'border border-white/20',
              'transition-all duration-200',
              'hover:bg-white/60',
              isTop3 && 'bg-white/60'
            )}
          >
            {/* Rank badge */}
            <div
              className={cn(
                'w-8 h-8 rounded-[8px] flex-shrink-0',
                'flex items-center justify-center',
                'font-bold text-sm',
                isTop3 ? rankStyles[player.rank] : 'bg-warm-100 text-warm-500'
              )}
            >
              {player.rank === 1 ? <Crown className="w-4 h-4" /> : player.rank}
            </div>

            {/* Avatar + Name */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div
                className="
                w-8 h-8 rounded-[8px] flex-shrink-0
                bg-warm-100 overflow-hidden
                flex items-center justify-center
                text-warm-500 text-xs font-medium
              "
              >
                {player.avatarUrl ? (
                  <img
                    src={player.avatarUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  player.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                )}
              </div>
              <span className="font-medium text-sm text-warm-900 truncate">
                {player.name}
              </span>
            </div>

            {/* Handicap + Trend */}
            <div className="text-right flex-shrink-0">
              <div className="font-bold text-warm-900">
                {player.handicap > 0 ? '+' : ''}
                {player.handicap.toFixed(1)}
              </div>
              <div
                className={cn(
                  'flex items-center justify-end gap-0.5 mt-0.5',
                  improved && 'text-primary-600',
                  declined && 'text-red-500',
                  !improved && !declined && 'text-warm-400'
                )}
              >
                <TrendIcon className="w-3 h-3" />
                <span className="text-xs font-medium">
                  {Math.abs(player.change).toFixed(1)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
