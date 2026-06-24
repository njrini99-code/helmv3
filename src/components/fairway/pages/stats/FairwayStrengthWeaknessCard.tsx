'use client';

import { cn } from '@/lib/utils';
import { Surface } from '@/components/fairway';
import type { StatisticalStrengthWeakness } from '@/lib/golf/strokes-gained';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { useStatsMotion } from './fairway-stats-motion';

export function FairwayStrengthWeaknessCard({
  item,
  type,
}: {
  item: StatisticalStrengthWeakness;
  type: 'strength' | 'weakness';
}) {
  const motion = useStatsMotion();
  const isStrength = type === 'strength';
  const impact = Math.abs(item.strokeImpact).toFixed(1);

  return (
    <Surface
      elevation="border"
      padding="md"
      className={cn(
        'flex h-full flex-col gap-2 border-l-[3px] transition-shadow [transition-duration:200ms]',
        isStrength ? 'border-l-accent-600 bg-accent-600/5' : 'border-l-fw-warning bg-fw-warning-bg/40',
        !motion.reduced && 'hover:shadow-card-hover',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-fw-sans text-body-sm font-semibold text-text-primary">{item.label}</p>
          <p className="mt-0.5 font-fw-sans text-caption leading-snug text-text-secondary">{item.detail}</p>
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-fw-mono text-caption font-medium tabular-nums',
            isStrength ? 'bg-fw-success-bg text-fw-success' : 'bg-fw-warning-bg text-fw-warning',
          )}
        >
          {isStrength ? (
            <TrendingUp className="h-3 w-3" aria-hidden />
          ) : (
            <TrendingDown className="h-3 w-3" aria-hidden />
          )}
          {isStrength ? `+${impact}` : `−${impact}`}
        </span>
      </div>
      {!isStrength && item.recommendation ? (
        <p className="mt-auto border-t border-border-subtle/60 pt-2 font-fw-sans text-caption italic text-text-tertiary">
          {item.recommendation}
        </p>
      ) : null}
    </Surface>
  );
}
