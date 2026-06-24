'use client';

import { cn } from '@/lib/utils';
import { Surface } from '@/components/fairway';
import type { TrendAnalysisResponse } from '@/app/golf/actions/stats-data-types';
import { StatsStaggerGrid, StatsStaggerItem } from './StatsSection';
import { MotionSpan, useStatsMotion } from './fairway-stats-motion';

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const RECORD_STYLES = [
  { key: 'bestScore', label: 'Best score', accent: 'border-l-accent-600 bg-accent-600/8', value: 'text-accent-800' },
  { key: 'bestToPar', label: 'Best vs par', accent: 'border-l-emerald-600 bg-emerald-500/10', value: 'text-emerald-900' },
  { key: 'bestGir', label: 'Best GIR %', accent: 'border-l-lime-600 bg-lime-500/10', value: 'text-lime-900' },
  { key: 'lowestPutts', label: 'Fewest putts', accent: 'border-l-teal-600 bg-teal-500/10', value: 'text-teal-900' },
] as const;

export function FairwayPersonalRecords({ trendData }: { trendData: TrendAnalysisResponse | null }) {
  const motion = useStatsMotion();
  const bests = trendData?.personalBests;
  if (!bests) return null;

  const items = RECORD_STYLES.map((style) => {
    const rec = bests[style.key as keyof typeof bests];
    if (!rec) return null;
    const display =
      style.key === 'bestToPar'
        ? `${rec.value > 0 ? '+' : ''}${rec.value}`
        : style.key === 'bestGir'
          ? `${rec.value}%`
          : String(rec.value);
    return { ...style, rec, display };
  }).filter(Boolean) as Array<(typeof RECORD_STYLES)[number] & { rec: NonNullable<typeof bests.bestScore>; display: string }>;

  if (items.length === 0) return null;

  return (
    <StatsStaggerGrid className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item) => (
        <StatsStaggerItem key={item.key}>
          <Surface
            elevation="border"
            padding="md"
            className={cn('border-l-[3px] transition-shadow [transition-duration:200ms] hover:shadow-soft', item.accent)}
          >
            <p className="font-fw-sans text-caption font-medium text-text-secondary">{item.label}</p>
            <MotionSpan className={cn('mt-1 block font-fw-mono text-h2 font-semibold tabular-nums leading-none', item.value)} {...motion.valuePop}>
              {item.display}
            </MotionSpan>
            <p className="mt-2 font-fw-sans text-caption text-text-tertiary">{formatDate(item.rec.date)}</p>
            <p className="truncate font-fw-sans text-caption text-text-tertiary">{item.rec.course}</p>
          </Surface>
        </StatsStaggerItem>
      ))}
    </StatsStaggerGrid>
  );
}
