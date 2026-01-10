'use client';

import { XIcon, DownloadIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GolfPlayerCard } from '@/components/cards/golf-player-card';
import { BaseballPlayerCard } from '@/components/cards/baseball-player-card';
import type { GolfPlayer, BaseballPlayer } from '@/lib/types/player-cards';

// ============================================
// TYPES
// ============================================

interface PlayerComparisonProps {
  players: (GolfPlayer | BaseballPlayer)[];
  sport: 'baseball' | 'golf';
  onRemove: (playerId: string) => void;
  onClear: () => void;
}

// ============================================
// HELPERS
// ============================================

type StatValue = number | string | null | undefined;

// Get nested value from object by path
function getValue(obj: Record<string, unknown>, path: string): StatValue {
  return path.split('.').reduce<StatValue>((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) {
      return (acc as Record<string, unknown>)[key] as StatValue;
    }
    return undefined;
  }, obj as StatValue);
}

// ============================================
// COMPONENT
// ============================================

export function PlayerComparison({
  players,
  sport,
  onRemove,
  onClear,
}: PlayerComparisonProps) {
  if (players.length < 2) return null;

  // Get comparison stats based on sport
  const getComparisonStats = () => {
    if (sport === 'golf') {
      return [
        {
          key: 'handicap',
          label: 'Handicap',
          format: (v: StatValue) => (typeof v === 'number' ? v.toFixed(1) : '—'),
          lowerBetter: true,
        },
        {
          key: 'stats.avg_score',
          label: 'Avg Score',
          format: (v: StatValue) => (typeof v === 'number' ? v.toFixed(1) : '—'),
          lowerBetter: true,
        },
        {
          key: 'stats.fairways_hit_pct',
          label: 'FIR %',
          format: (v: StatValue) => (typeof v === 'number' ? `${(v * 100).toFixed(0)}%` : '—'),
          lowerBetter: false,
        },
        {
          key: 'stats.gir_pct',
          label: 'GIR %',
          format: (v: StatValue) => (typeof v === 'number' ? `${(v * 100).toFixed(0)}%` : '—'),
          lowerBetter: false,
        },
        {
          key: 'stats.avg_putts',
          label: 'Putts/Round',
          format: (v: StatValue) => (typeof v === 'number' ? v.toFixed(1) : '—'),
          lowerBetter: true,
        },
      ];
    }

    // Baseball stats (pitcher vs hitter stats)
    return [
      {
        key: 'stats.batting_avg',
        label: 'AVG',
        format: (v: StatValue) => (typeof v === 'number' ? v.toFixed(3).replace(/^0/, '') : '—'),
        lowerBetter: false,
      },
      {
        key: 'stats.era',
        label: 'ERA',
        format: (v: StatValue) => (typeof v === 'number' ? v.toFixed(2) : '—'),
        lowerBetter: true,
      },
      {
        key: 'stats.home_runs',
        label: 'HR',
        format: (v: StatValue) => (v !== null && v !== undefined ? String(v) : '—'),
        lowerBetter: false,
      },
      {
        key: 'stats.rbi',
        label: 'RBI',
        format: (v: StatValue) => (v !== null && v !== undefined ? String(v) : '—'),
        lowerBetter: false,
      },
      {
        key: 'stats.whip',
        label: 'WHIP',
        format: (v: StatValue) => (typeof v === 'number' ? v.toFixed(3).replace(/^0/, '') : '—'),
        lowerBetter: true,
      },
    ];
  };

  const stats = getComparisonStats();

  // Determine winner for a stat
  const getWinner = (statKey: string, lowerBetter: boolean) => {
    const values = players.map((p) => getValue(p, statKey));
    if (values.some((v) => v === null || v === undefined)) return -1;

    const numericValues = values.map((v) => (typeof v === 'number' ? v : Number(v)));
    if (numericValues.some((v) => Number.isNaN(v))) return -1;

    const best = lowerBetter ? Math.min(...numericValues) : Math.max(...numericValues);
    return numericValues.indexOf(best);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-warm-900">
          Comparing {players.length} Players
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onClear}
            className="
              px-3 py-1.5
              text-sm text-warm-600
              hover:text-warm-800
              transition-colors
            "
          >
            Clear
          </button>
          <button
            className="
            inline-flex items-center gap-1.5
            px-3 py-1.5
            text-sm font-medium
            bg-primary-600 text-white
            rounded-[8px]
            hover:bg-primary-700
            transition-colors
          "
          >
            <DownloadIcon className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Player Cards */}
      <div className="flex gap-6 justify-center overflow-x-auto pb-4">
        {players.map((player) => (
          <div key={player.id} className="relative flex-shrink-0">
            <button
              onClick={() => onRemove(player.id)}
              className="
                absolute -top-2 -right-2 z-10
                w-6 h-6 rounded-full
                bg-warm-100 border border-warm-200
                flex items-center justify-center
                text-warm-500 hover:text-warm-700 hover:bg-warm-200
                transition-colors
              "
            >
              <XIcon className="w-4 h-4" />
            </button>
            {sport === 'golf' ? (
              <GolfPlayerCard player={player as GolfPlayer} variant="full" showActions={false} />
            ) : (
              <BaseballPlayerCard player={player as BaseballPlayer} variant="full" showActions={false} />
            )}
          </div>
        ))}
      </div>

      {/* Stats Comparison Table */}
      <div className="bg-white rounded-[20px] border border-warm-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-warm-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-warm-500 uppercase">
                Stat
              </th>
              {players.map((player) => (
                <th
                  key={player.id}
                  className="px-4 py-3 text-center text-xs font-semibold text-warm-500 uppercase"
                >
                  {player.first_name} {player.last_name?.[0]}.
                </th>
              ))}
              <th className="px-4 py-3 text-center text-xs font-semibold text-warm-500 uppercase">
                Diff
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.map((stat, i) => {
              const winner = getWinner(stat.key, stat.lowerBetter);
              const values = players.map((p) => getValue(p, stat.key));
              const diff =
                values.length === 2 &&
                values[0] != null &&
                values[1] != null &&
                typeof values[0] === 'number' &&
                typeof values[1] === 'number'
                  ? values[0] - values[1]
                  : null;

              return (
                <tr
                  key={stat.key}
                  className={i % 2 === 0 ? 'bg-white' : 'bg-warm-50/50'}
                >
                  <td className="px-4 py-3 text-sm font-medium text-warm-700">
                    {stat.label}
                  </td>
                  {players.map((player, j) => (
                    <td
                      key={player.id}
                      className={cn(
                        'px-4 py-3 text-center text-sm',
                        winner === j
                          ? 'font-bold text-primary-600'
                          : 'text-warm-600'
                      )}
                    >
                      {stat.format(values[j])}
                      {winner === j && (
                        <span className="ml-1 text-primary-500">✓</span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-center text-sm text-warm-500">
                    {diff !== null
                      ? (diff > 0 ? '+' : '') + diff.toFixed(1)
                      : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
