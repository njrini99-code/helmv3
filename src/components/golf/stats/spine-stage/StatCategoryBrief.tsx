'use client';

import { ArrowDownRight, ArrowRight, ArrowUpRight, Sparkles } from 'lucide-react';
import { Surface } from '@/components/fairway';
import { cn } from '@/lib/utils';

export interface StatCategoryPattern {
  description?: string;
  recommendation?: string;
  confidence?: number;
  sampleSize?: number;
}

export interface StatCategoryBriefProps {
  category: string;
  metricLabel: string;
  series: ReadonlyArray<number | null | undefined>;
  lowerIsBetter?: boolean;
  pattern?: StatCategoryPattern | null;
  fallbackInsight: string;
  fallbackAction: string;
}

type TrendState = 'improving' | 'steady' | 'watch';

function finiteSeries(series: ReadonlyArray<number | null | undefined>): number[] {
  return series.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)).slice(-10);
}

function resolveTrend(values: number[], lowerIsBetter: boolean): { state: TrendState; delta: number } {
  if (values.length < 2) return { state: 'steady', delta: 0 };
  const first = values[0] ?? 0;
  const last = values.at(-1) ?? first;
  const delta = last - first;
  const threshold = Math.max(Math.abs(first) * 0.025, 0.35);
  if (Math.abs(delta) < threshold) return { state: 'steady', delta };
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  return { state: improved ? 'improving' : 'watch', delta };
}

function sparklinePoints(values: number[]): string {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, 1);
  return values
    .map((value, index) => {
      const x = 4 + (index / Math.max(values.length - 1, 1)) * 132;
      const y = 42 - ((value - min) / spread) * 32;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

const STATE_COPY: Record<TrendState, { label: string; className: string }> = {
  improving: { label: 'Moving forward', className: 'bg-accent-50 text-accent-800' },
  steady: { label: 'Holding steady', className: 'bg-surface-sunken text-text-secondary' },
  watch: { label: 'Needs attention', className: 'bg-fw-warning/10 text-fw-warning' },
};

export function StatCategoryBrief({
  category,
  metricLabel,
  series,
  lowerIsBetter = false,
  pattern = null,
  fallbackInsight,
  fallbackAction,
}: StatCategoryBriefProps) {
  const values = finiteSeries(series);
  const trend = resolveTrend(values, lowerIsBetter);
  const state = STATE_COPY[trend.state];
  const Icon = trend.state === 'improving' ? ArrowUpRight : trend.state === 'watch' ? ArrowDownRight : ArrowRight;
  const lineColor = trend.state === 'watch' ? 'var(--fw-color-warning)' : 'var(--fw-color-accent-600)';
  const current = values.at(-1);

  return (
    <Surface
      elevation="shadow"
      padding="none"
      className={cn(
        'group overflow-clip border-accent-200/70',
        'transition-[transform,box-shadow,border-color] [transition-duration:var(--fw-dur-medium)] [transition-timing-function:var(--fw-ease-emph)]',
        'hover:-translate-y-0.5 hover:border-accent-300 hover:[box-shadow:var(--fw-shadow-soft)] motion-reduce:hover:translate-y-0',
      )}
    >
      <div className="grid min-w-0 grid-cols-1 md:grid-cols-[minmax(0,1fr)_190px]">
        <div className="min-w-0 border-b border-border-subtle px-5 py-5 md:border-b-0 md:border-r md:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.12em] text-accent-700">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> CoachHelm read
            </span>
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-eyebrow font-semibold', state.className)}>
              <Icon className="h-3.5 w-3.5" aria-hidden /> {state.label}
            </span>
          </div>
          <h3 className="mt-3 font-fw-display text-h3 font-semibold tracking-[-0.015em] text-text-primary">
            {pattern?.description || fallbackInsight}
          </h3>
          <p className="mt-2 max-w-3xl font-fw-sans text-caption leading-relaxed text-text-secondary">
            {pattern?.recommendation || fallbackAction}
          </p>
          {pattern?.sampleSize || pattern?.confidence ? (
            <p className="mt-3 font-fw-mono text-eyebrow tabular-nums text-text-tertiary">
              {pattern.sampleSize ? `${pattern.sampleSize} observations` : 'Multi-round signal'}
              {typeof pattern.confidence === 'number' ? ` · ${Math.round(pattern.confidence * 100)}% confidence` : ''}
            </p>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col justify-between bg-accent-50/45 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.1em] text-text-tertiary">{category} trend</p>
              <p className="mt-1 font-fw-sans text-caption text-text-secondary">{metricLabel}</p>
            </div>
            {typeof current === 'number' ? (
              <span className="font-fw-mono text-body-sm font-semibold tabular-nums text-text-primary">{current.toFixed(1)}</span>
            ) : null}
          </div>
          {values.length > 1 ? (
            <svg className="mt-3 h-12 w-full overflow-visible" viewBox="0 0 140 48" role="img" aria-label={`${category} ${metricLabel} trend across ${values.length} rounds`}>
              <path d="M4 42H136" stroke="var(--fw-color-border-subtle)" strokeWidth="1" />
              <polyline points={sparklinePoints(values)} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              <circle cx="136" cy={sparklinePoints(values).split(' ').at(-1)?.split(',')[1] ?? '24'} r="3.5" fill={lineColor} />
            </svg>
          ) : (
            <p className="mt-5 text-caption italic text-text-tertiary">Two rounds unlock the trend line.</p>
          )}
        </div>
      </div>
    </Surface>
  );
}

export function findCategoryPattern(
  patterns: ReadonlyArray<StatCategoryPattern & { conditions?: unknown; patternType?: unknown }>,
  keywords: ReadonlyArray<string>,
): StatCategoryPattern | null {
  const lowered = keywords.map((keyword) => keyword.toLowerCase());
  return patterns.find((pattern) => {
    const haystack = `${pattern.description ?? ''} ${pattern.recommendation ?? ''} ${JSON.stringify(pattern.conditions ?? '')} ${String(pattern.patternType ?? '')}`.toLowerCase();
    return lowered.some((keyword) => haystack.includes(keyword));
  }) ?? null;
}
