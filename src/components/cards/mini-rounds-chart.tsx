'use client';

import { cn } from '@/lib/utils';
import type { GolfRound } from '@/lib/types/player-cards';

// ============================================
// TYPES
// ============================================

interface MiniRoundsChartProps {
  rounds: GolfRound[];
  height?: number;
  className?: string;
}

// ============================================
// COMPONENT
// ============================================

export function MiniRoundsChart({ rounds, height = 40, className }: MiniRoundsChartProps) {
  if (rounds.length === 0) return null;

  // Calculate scores relative to par
  const scores = rounds.map((r) => r.score - r.par);
  const max = Math.max(...scores.map(Math.abs), 5); // Min range of ±5

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-end justify-between gap-1" style={{ height }}>
        {scores.map((score, i) => {
          const barHeight = (Math.abs(score) / max) * (height - 8);
          const isPositive = score > 0;
          const isEven = score === 0;

          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center justify-end"
              style={{ height }}
            >
              <div
                className={cn(
                  'w-full max-w-[12px] rounded-sm',
                  isEven
                    ? 'bg-warm-300'
                    : isPositive
                    ? 'bg-red-400'
                    : 'bg-primary-500'
                )}
                style={{ height: Math.max(barHeight, 4) }}
                title={`Round ${i + 1}: ${rounds[i]?.score || 0} (${
                  score > 0 ? '+' : ''
                }${score})`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
