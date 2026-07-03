'use client';

import { cn } from '@/lib/utils';
import type { PlayerCompleteness, CompletenessCategory } from './tracer-types';

// ============================================================================
// DATA COMPLETENESS GRID (Heatmap)
// ============================================================================

interface DataCompletenessGridProps {
  data: PlayerCompleteness[];
}

const CATEGORIES: CompletenessCategory[] = ['Putts', 'FW', 'GIR', 'Details', 'SG', 'Cache'];

function getCellColors(pct: number): string {
  if (pct === 100) return 'bg-primary-100 text-primary-700';
  if (pct >= 70) return 'bg-primary-50 text-primary-600';
  if (pct >= 30) return 'bg-amber-50 text-amber-700';
  if (pct >= 1) return 'bg-red-50 text-red-600';
  return 'bg-warm-100 text-warm-400';
}

export function DataCompletenessGrid({ data }: DataCompletenessGridProps) {
  if (data.length === 0) {
    return (
      <div className="glass-standard rounded-2xl p-8">
        <h3 className="text-sm font-semibold text-warm-900 mb-6">Data Completeness</h3>
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <p className="text-sm text-warm-500">No player data available</p>
          <p className="text-xs text-warm-400 mt-1">Completeness data will appear once rounds are tracked</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-standard rounded-2xl overflow-clip">
      {/* Header */}
      <div className="px-5 py-4 border-b border-warm-100/50">
        <h3 className="text-sm font-semibold text-warm-900">Data Completeness</h3>
      </div>

      {/* Grid table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-warm-100/80">
              <th className="px-4 py-3 text-left text-eyebrow font-medium text-warm-400 uppercase tracking-wider w-40">
                Player
              </th>
              {CATEGORIES.map((cat) => (
                <th
                  key={cat}
                  className="px-3 py-3 text-center text-eyebrow font-medium text-warm-400 uppercase tracking-wider"
                >
                  {cat}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((player) => (
              <tr
                key={player.player_id}
                className="border-b border-warm-50/80 hover:bg-cream-100 transition-colors"
              >
                <td className="px-4 py-2.5">
                  <span className="font-medium text-warm-900 text-sm truncate block max-w-[160px]">
                    {player.player_name}
                  </span>
                </td>
                {CATEGORIES.map((cat) => {
                  const pct = player.categories[cat];
                  return (
                    <td key={cat} className="px-3 py-2.5 text-center">
                      <span
                        className={cn(
                          'inline-flex items-center justify-center min-w-[42px] px-2 py-1 rounded-md text-eyebrow font-semibold tabular-nums',
                          getCellColors(pct)
                        )}
                      >
                        {pct}%
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="px-5 py-3 border-t border-warm-100/50 flex items-center gap-3 text-eyebrow text-warm-400 flex-wrap">
        <span className="font-medium text-warm-500">Legend:</span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-primary-100" />
          100%
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-primary-50 border border-primary-100" />
          70-99%
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-amber-50 border border-amber-100" />
          30-69%
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-red-50 border border-red-100" />
          1-29%
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-warm-100" />
          0%
        </span>
      </div>
    </div>
  );
}
