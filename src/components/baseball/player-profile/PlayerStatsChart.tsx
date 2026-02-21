'use client';

import { useMemo } from 'react';
import type { BaseballPlayerStats } from '@/lib/types';

interface PlayerStatsChartProps {
  stats: BaseballPlayerStats[];
  fullSize?: boolean;
}

export function PlayerStatsChart({ stats, fullSize = false }: PlayerStatsChartProps) {
  const chartData = useMemo(() => {
    // Reverse to show oldest first (left to right)
    const reversed = [...stats].reverse();

    return reversed.map(stat => {
      const avg = stat.at_bats && stat.at_bats > 0
        ? (stat.hits || 0) / stat.at_bats
        : 0;
      return {
        date: new Date(stat.session_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        avg,
        type: stat.stat_type,
        atBats: stat.at_bats || 0,
        hits: stat.hits || 0,
        exitVelocity: stat.exit_velocity || null,
      };
    });
  }, [stats]);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-400">
        No stats data available
      </div>
    );
  }

  const maxAvg = Math.max(...chartData.map(d => d.avg), 0.400);
  const height = fullSize ? 300 : 200;

  // Calculate moving average (3-session)
  const movingAvgs = chartData.map((_, i) => {
    const start = Math.max(0, i - 2);
    const slice = chartData.slice(start, i + 1);
    const sum = slice.reduce((acc, d) => acc + d.avg, 0);
    return sum / slice.length;
  });

  return (
    <div className="space-y-4">
      {/* Chart */}
      <div className={`relative`} style={{ height }}>
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-6 w-10 flex flex-col justify-between text-xs text-slate-400">
          <span>.400</span>
          <span>.300</span>
          <span>.200</span>
          <span>.100</span>
          <span>.000</span>
        </div>

        {/* Chart area */}
        <div className="ml-12 h-full relative">
          {/* Grid lines */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="border-b border-slate-100" style={{ borderStyle: i === 4 ? 'solid' : 'dashed' }} />
            ))}
          </div>

          {/* Bars */}
          <div className="absolute inset-0 bottom-6 flex items-end gap-1 px-1">
            {chartData.map((d, i) => {
              const barHeight = (d.avg / maxAvg) * 100;
              const bgColor = d.type === 'game' ? 'bg-primary-500' : d.type === 'practice' ? 'bg-blue-400' : 'bg-slate-300';

              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center justify-end group relative"
                >
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                    <div className="bg-slate-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap">
                      <p className="font-medium">{d.date}</p>
                      <p>AVG: {d.avg.toFixed(3)}</p>
                      <p>{d.hits}/{d.atBats}</p>
                      {d.exitVelocity && <p>EV: {d.exitVelocity.toFixed(1)}</p>}
                    </div>
                  </div>

                  {/* Bar */}
                  <div
                    className={`w-full rounded-t transition-all duration-200 hover:opacity-80 ${bgColor}`}
                    style={{ height: `${barHeight}%`, minHeight: d.avg > 0 ? '4px' : '0' }}
                  />
                </div>
              );
            })}
          </div>

          {/* Moving average line */}
          <svg className="absolute inset-0 bottom-6 pointer-events-none" preserveAspectRatio="none">
            <polyline
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={movingAvgs.map((avg, i) => {
                const x = ((i + 0.5) / chartData.length) * 100;
                const y = 100 - (avg / maxAvg) * 100;
                return `${x}%,${y}%`;
              }).join(' ')}
            />
          </svg>

          {/* X-axis labels (show every few) */}
          <div className="absolute bottom-0 left-0 right-0 h-6 flex">
            {chartData.map((d, i) => {
              const showLabel = chartData.length <= 10 || i % Math.ceil(chartData.length / 8) === 0;
              return (
                <div key={i} className="flex-1 text-center">
                  {showLabel && (
                    <span className="text-micro text-slate-400">{d.date}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-primary-500" />
          <span className="text-slate-600">Game</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-blue-400" />
          <span className="text-slate-600">Practice</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-0.5 bg-amber-500 rounded" />
          <span className="text-slate-600">3-Session Avg</span>
        </div>
      </div>
    </div>
  );
}
