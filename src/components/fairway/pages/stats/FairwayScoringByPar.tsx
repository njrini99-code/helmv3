'use client';

import { cn } from '@/lib/utils';
import { Surface } from '@/components/fairway';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { finite } from './fairway-stats-utils';
import { MotionDiv, useStatsMotion } from './fairway-stats-motion';
import { StatsStaggerGrid, StatsStaggerItem } from './StatsSection';

function formatToPar(v: number | null): string {
  if (v === null) return '—';
  if (Math.abs(v) < 0.05) return 'E';
  return v > 0 ? `+${v.toFixed(2)}` : `−${Math.abs(v).toFixed(2)}`;
}

const OUTCOME_COLORS = {
  eagle: 'bg-accent-700',
  birdie: 'bg-accent-500',
  par: 'bg-stone-300',
  bogey: 'bg-amber-400',
  doublePlus: 'bg-fw-warning',
} as const;

function ParStack({
  label,
  dist,
}: {
  label: string;
  dist: GolfStats['scoringByPar']['par3'];
}) {
  const motion = useStatsMotion();
  if (dist.total === 0) return null;
  const segments = [
    { key: 'eagle', n: dist.eagle, cls: OUTCOME_COLORS.eagle, name: 'Eagle+' },
    { key: 'birdie', n: dist.birdie, cls: OUTCOME_COLORS.birdie, name: 'Birdie' },
    { key: 'par', n: dist.par, cls: OUTCOME_COLORS.par, name: 'Par' },
    { key: 'bogey', n: dist.bogey, cls: OUTCOME_COLORS.bogey, name: 'Bogey' },
    { key: 'doublePlus', n: dist.doublePlus, cls: OUTCOME_COLORS.doublePlus, name: 'Double+' },
  ].filter((s) => s.n > 0);

  return (
    <StatsStaggerItem>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-fw-sans text-body-sm font-semibold text-text-primary">{label}</span>
          <span className="font-fw-mono text-caption tabular-nums text-text-secondary">
            {formatToPar(finite(dist.avgToPar))} / hole · {dist.total} holes
          </span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-surface-sunken">
          {segments.map((s, i) => (
            <MotionDiv
              key={s.key}
              className={cn('h-full min-w-[4px]', s.cls)}
              initial={motion.reduced ? false : { width: 0, opacity: 0.6 }}
              animate={{ width: `${(s.n / dist.total) * 100}%`, opacity: 1 }}
              transition={{
                duration: 0.45,
                delay: motion.reduced ? 0 : i * 0.06,
                ease: [0.16, 1, 0.3, 1],
              }}
              title={`${s.name}: ${s.n}`}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {segments.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5 font-fw-sans text-caption text-text-tertiary">
              <span className={cn('h-2 w-2 rounded-full', s.cls)} aria-hidden />
              {s.name} {Math.round((s.n / dist.total) * 100)}%
            </span>
          ))}
        </div>
      </div>
    </StatsStaggerItem>
  );
}

export function FairwayScoringByPar({ stats }: { stats: GolfStats }) {
  const data = stats.scoringByPar;
  const hasData = data.par3.total + data.par4.total + data.par5.total > 0;
  if (!hasData) return null;

  return (
    <Surface elevation="shadow" padding="lg" className="border-l-[3px] border-l-accent-600">
      <div className="mb-4 flex flex-col gap-0.5">
        <h4 className="font-fw-display text-h3 font-medium text-text-primary">Scoring mix by par</h4>
        <p className="font-fw-sans text-body-sm text-text-tertiary">
          Green bands are under par; amber is where strokes leak.
        </p>
      </div>
      <div className="flex flex-col gap-6">
        <StatsStaggerGrid className="flex flex-col gap-6">
          <ParStack label="Par 3" dist={data.par3} />
          <ParStack label="Par 4" dist={data.par4} />
          <ParStack label="Par 5" dist={data.par5} />
        </StatsStaggerGrid>
      </div>
    </Surface>
  );
}
