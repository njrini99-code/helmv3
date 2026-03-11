'use client';

import { cn } from '@/lib/utils';
import type { PlayerQualityScore } from './tracer-types';

interface PlayerQualityScoreCardProps {
  score: PlayerQualityScore;
  onFilterPlayer?: (playerId: string) => void;
}

function getScoreColor(score: number): string {
  if (score >= 90) return 'text-green-600 bg-green-50 border-green-200';
  if (score >= 70) return 'text-amber-600 bg-amber-50 border-amber-200';
  return 'text-red-600 bg-red-50 border-red-200';
}

function getBarColor(score: number): string {
  if (score >= 90) return 'bg-green-500';
  if (score >= 70) return 'bg-amber-500';
  return 'bg-red-500';
}

export function PlayerQualityScoreCard({ score, onFilterPlayer }: PlayerQualityScoreCardProps) {
  return (
    <button
      type="button"
      onClick={() => onFilterPlayer?.(score.player_id)}
      className={cn(
        'flex items-center gap-4 w-full px-4 py-3 rounded-xl transition-all text-left',
        'bg-white/40 hover:bg-white/60 border border-white/20'
      )}
    >
      {/* Score circle */}
      <div className={cn(
        'flex items-center justify-center w-10 h-10 rounded-full border text-sm font-bold tabular-nums flex-shrink-0',
        getScoreColor(score.overall_score)
      )}>
        {score.overall_score}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-warm-900 truncate">{score.player_name}</span>
          {score.total_issues === 0 && (
            <span className="text-[10px] font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">Clean</span>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-1.5 w-full h-1.5 rounded-full bg-warm-100 overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', getBarColor(score.overall_score))}
            style={{ width: `${score.overall_score}%` }}
          />
        </div>

        {/* Issue counts */}
        {score.total_issues > 0 && (
          <div className="mt-1 flex items-center gap-2 text-[10px]">
            {score.critical_count > 0 && (
              <span className="text-red-600 font-semibold">{score.critical_count} critical</span>
            )}
            {score.warning_count > 0 && (
              <span className="text-amber-600 font-semibold">{score.warning_count} warning</span>
            )}
            {score.info_count > 0 && (
              <span className="text-blue-600">{score.info_count} info</span>
            )}
            {score.fixable_count > 0 && (
              <span className="text-warm-400">· {score.fixable_count} fixable</span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
