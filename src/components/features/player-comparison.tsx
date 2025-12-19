'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconX, IconCheck, IconArrowRight } from '@/components/icons';
import { getFullName, formatHeight, cn } from '@/lib/utils';
import type { Player } from '@/types/database';

interface PlayerComparisonProps {
  players: Player[];
  onRemovePlayer?: (playerId: string) => void;
  onClose?: () => void;
  className?: string;
}

interface StatComparison {
  label: string;
  getValue: (player: Player) => string | number | null;
  format?: (value: any) => string;
  higherIsBetter?: boolean;
}

const statComparisons: StatComparison[] = [
  {
    label: 'Height',
    getValue: (p) => p.height_feet && p.height_inches ? `${p.height_feet}-${p.height_inches}` : null,
    format: (v) => {
      if (!v) return '—';
      const [feet, inches] = v.split('-');
      return formatHeight(parseInt(feet), parseInt(inches));
    },
  },
  {
    label: 'Weight',
    getValue: (p) => p.weight_lbs,
    format: (v) => v ? `${v} lbs` : '—',
    higherIsBetter: true,
  },
  {
    label: 'Grad Year',
    getValue: (p) => p.grad_year,
    format: (v) => v || '—',
  },
  {
    label: 'Position',
    getValue: (p) => p.primary_position,
    format: (v) => v || '—',
  },
  {
    label: 'Bats',
    getValue: (p) => p.bats,
    format: (v) => v || '—',
  },
  {
    label: 'Throws',
    getValue: (p) => p.throws,
    format: (v) => v || '—',
  },
  {
    label: 'Pitch Velo',
    getValue: (p) => p.pitch_velo,
    format: (v) => v ? `${v} mph` : '—',
    higherIsBetter: true,
  },
  {
    label: 'Exit Velo',
    getValue: (p) => p.exit_velo,
    format: (v) => v ? `${v} mph` : '—',
    higherIsBetter: true,
  },
  {
    label: '60 Time',
    getValue: (p) => p.sixty_time,
    format: (v) => v ? `${v}s` : '—',
    higherIsBetter: false,
  },
  {
    label: 'GPA',
    getValue: (p) => p.gpa,
    format: (v) => v ? v.toFixed(2) : '—',
    higherIsBetter: true,
  },
  {
    label: 'SAT',
    getValue: (p) => p.sat_score,
    format: (v) => v || '—',
    higherIsBetter: true,
  },
  {
    label: 'ACT',
    getValue: (p) => p.act_score,
    format: (v) => v || '—',
    higherIsBetter: true,
  },
];

export function PlayerComparison({
  players,
  onRemovePlayer,
  onClose,
  className
}: PlayerComparisonProps) {
  const [selectedStats, setSelectedStats] = useState<Set<string>>(
    new Set(statComparisons.map(s => s.label))
  );

  const getBestValue = (stat: StatComparison) => {
    const values = players
      .map(p => stat.getValue(p))
      .filter(v => v !== null && v !== undefined);

    if (values.length === 0) return null;

    if (stat.higherIsBetter === undefined) return null;

    const numericValues = values
      .map(v => typeof v === 'string' ? parseFloat(v) : v)
      .filter(v => !isNaN(v as number));

    if (numericValues.length === 0) return null;

    return stat.higherIsBetter
      ? Math.max(...(numericValues as number[]))
      : Math.min(...(numericValues as number[]));
  };

  const isValueBest = (stat: StatComparison, value: any, formattedValue: string) => {
    if (formattedValue === '—') return false;
    if (stat.higherIsBetter === undefined) return false;

    const bestValue = getBestValue(stat);
    if (bestValue === null) return false;

    const numericValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numericValue as number)) return false;

    return numericValue === bestValue;
  };

  return (
    <Card className={cn('overflow-hidden', className)}>
      {onClose && (
        <CardHeader className="flex flex-row items-center justify-between border-b border-border-light">
          <h2 className="text-lg font-semibold text-gray-900">Player Comparison</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <IconX size={18} />
          </Button>
        </CardHeader>
      )}

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            {/* Player Headers */}
            <thead className="bg-cream-50 border-b border-border-light">
              <tr>
                <th className="sticky left-0 bg-cream-50 z-10 px-4 py-3 text-left text-sm font-medium text-gray-600 min-w-[140px]">
                  Metric
                </th>
                {players.map(player => {
                  const name = getFullName(player.first_name, player.last_name);
                  return (
                    <th key={player.id} className="px-4 py-3 text-center min-w-[200px]">
                      <div className="flex flex-col items-center gap-2">
                        <div className="relative">
                          <Avatar
                            name={name}
                            src={player.avatar_url}
                            size="lg"
                            ring
                          />
                          {onRemovePlayer && players.length > 1 && (
                            <button
                              onClick={() => onRemovePlayer(player.id)}
                              className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white rounded-full flex items-center justify-center hover:bg-red-700 transition-colors shadow-elevation-2"
                            >
                              <IconX size={12} />
                            </button>
                          )}
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-gray-900 text-sm">{name}</p>
                          <p className="text-xs text-gray-500">
                            {player.high_school_name}
                          </p>
                          <div className="flex items-center gap-1 justify-center mt-1">
                            <Badge variant="primary" className="text-2xs">
                              {player.primary_position}
                            </Badge>
                            <Badge variant="success" className="text-2xs">
                              {player.grad_year}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* Stats Rows */}
            <tbody>
              {statComparisons
                .filter(stat => selectedStats.has(stat.label))
                .map((stat, index) => (
                  <tr
                    key={stat.label}
                    className={cn(
                      'border-b border-border-light hover:bg-cream-50 transition-colors',
                      index % 2 === 0 && 'bg-white'
                    )}
                  >
                    <td className="sticky left-0 bg-inherit z-10 px-4 py-3 text-sm font-medium text-gray-700">
                      {stat.label}
                    </td>
                    {players.map(player => {
                      const value = stat.getValue(player);
                      const formattedValue = stat.format
                        ? stat.format(value)
                        : value?.toString() || '—';
                      const isBest = isValueBest(stat, value, formattedValue);

                      return (
                        <td
                          key={player.id}
                          className={cn(
                            'px-4 py-3 text-center text-sm transition-colors',
                            isBest && 'bg-green-50 font-semibold text-green-900'
                          )}
                        >
                          <div className="flex items-center justify-center gap-1">
                            {isBest && (
                              <IconCheck size={14} className="text-green-600" />
                            )}
                            {formattedValue}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Footer with action buttons */}
        <div className="p-4 bg-cream-50 border-t border-border-light flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Comparing {players.length} player{players.length > 1 ? 's' : ''}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm">
              Export Comparison
            </Button>
            <Button variant="primary" size="sm">
              Save Comparison
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Simplified inline comparison for 2 players
export function InlinePlayerComparison({ playerA, playerB }: { playerA: Player; playerB: Player }) {
  const nameA = getFullName(playerA.first_name, playerA.last_name);
  const nameB = getFullName(playerB.first_name, playerB.last_name);

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
      {/* Player A */}
      <div className="flex items-center gap-3">
        <Avatar name={nameA} src={playerA.avatar_url} size="lg" ring />
        <div>
          <p className="font-semibold text-gray-900">{nameA}</p>
          <p className="text-sm text-gray-500">{playerA.primary_position}</p>
        </div>
      </div>

      {/* VS */}
      <div className="flex items-center justify-center">
        <div className="px-4 py-2 bg-gray-100 rounded-lg">
          <span className="text-sm font-semibold text-gray-600">VS</span>
        </div>
      </div>

      {/* Player B */}
      <div className="flex items-center gap-3 flex-row-reverse">
        <Avatar name={nameB} src={playerB.avatar_url} size="lg" ring />
        <div className="text-right">
          <p className="font-semibold text-gray-900">{nameB}</p>
          <p className="text-sm text-gray-500">{playerB.primary_position}</p>
        </div>
      </div>
    </div>
  );
}
