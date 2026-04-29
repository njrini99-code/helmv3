'use client';

/**
 * GameVsPracticeChart
 * 
 * Bar chart comparing practice vs game batting averages
 * using Recharts for visualization.
 */

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts';
import { cn } from '@/lib/utils';
import type { BaseballPlayerStats } from '@/lib/types';

interface GameVsPracticeChartProps {
  stats: BaseballPlayerStats[];
  className?: string;
}

interface TooltipPayload {
  name?: string;
  value?: number;
  color?: string;
  payload?: {
    date: string;
    practiceAvg: number;
    gameAvg: number;
    practiceAB: number;
    gameAB: number;
  };
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="bg-cream-50/92 backdrop-blur-xl border border-warm-200/45 rounded-xl shadow-lg px-4 py-3 min-w-[180px]">
      <p className="text-sm font-medium text-warm-900 mb-2">{label}</p>
      <div className="space-y-1.5">
        {data.practiceAB > 0 && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span className="text-xs text-warm-600">Practice</span>
            </div>
            <span className="text-sm font-semibold text-warm-900">
              {data.practiceAvg.toFixed(3)}
            </span>
          </div>
        )}
        {data.gameAB > 0 && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-primary-500" />
              <span className="text-xs text-warm-600">Game</span>
            </div>
            <span className="text-sm font-semibold text-warm-900">
              {data.gameAvg.toFixed(3)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function GameVsPracticeChart({ stats, className }: GameVsPracticeChartProps) {
  const chartData = useMemo(() => {
    // Group stats by week
    const weeklyData = new Map<string, {
      practiceHits: number;
      practiceAB: number;
      gameHits: number;
      gameAB: number;
    }>();

    stats.forEach(stat => {
      const date = new Date(stat.session_date);
      // Get the start of the week (Sunday)
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekKey = weekStart.toISOString().split('T')[0] ?? '';

      const existing = weeklyData.get(weekKey) || {
        practiceHits: 0,
        practiceAB: 0,
        gameHits: 0,
        gameAB: 0,
      };

      if (stat.stat_type === 'practice') {
        existing.practiceHits += stat.hits;
        existing.practiceAB += stat.at_bats;
      } else if (stat.stat_type === 'game') {
        existing.gameHits += stat.hits;
        existing.gameAB += stat.at_bats;
      }

      weeklyData.set(weekKey, existing);
    });

    // Convert to chart format, sorted by date
    return Array.from(weeklyData.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8) // Last 8 weeks
      .map(([weekKey, data]) => {
        const date = new Date(weekKey);
        return {
          date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          practiceAvg: data.practiceAB > 0 ? data.practiceHits / data.practiceAB : 0,
          gameAvg: data.gameAB > 0 ? data.gameHits / data.gameAB : 0,
          practiceAB: data.practiceAB,
          gameAB: data.gameAB,
        };
      });
  }, [stats]);

  if (chartData.length === 0) {
    return (
      <div className={cn('glass-standard rounded-2xl p-8 text-center', className)}>
        <p className="text-warm-500">No comparison data available yet.</p>
        <p className="text-sm text-warm-400 mt-1">
          Log both practice and game sessions to see the comparison.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('glass-standard rounded-2xl p-6', className)}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-warm-900">Game vs Practice</h3>
          <p className="text-sm text-warm-500">Weekly batting average comparison</p>
        </div>
      </div>

      <div className="h-64" role="img" aria-label="Game vs practice batting average chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
            barCategoryGap="20%"
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e7e5e4"
              strokeOpacity={0.6}
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#78716c' }}
              axisLine={{ stroke: '#d6d3d1' }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 0.5]}
              tick={{ fontSize: 11, fill: '#78716c' }}
              axisLine={{ stroke: '#d6d3d1' }}
              tickLine={false}
              tickFormatter={(v) => v.toFixed(3)}
              width={50}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: '16px' }}
              iconType="circle"
              iconSize={8}
              formatter={(value: string) => (
                <span className="text-xs text-warm-600">{value}</span>
              )}
            />
            <Bar
              dataKey="practiceAvg"
              name="Practice"
              fill="#3b82f6"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`practice-${index}`}
                  fillOpacity={entry.practiceAB > 0 ? 1 : 0.3}
                />
              ))}
            </Bar>
            <Bar
              dataKey="gameAvg"
              name="Game"
              fill="#22c55e"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`game-${index}`}
                  fillOpacity={entry.gameAB > 0 ? 1 : 0.3}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
