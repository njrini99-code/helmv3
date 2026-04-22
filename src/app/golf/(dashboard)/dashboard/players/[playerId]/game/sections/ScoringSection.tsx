'use client';

/**
 * ScoringSection — "Scoring". Avg score · par-type splits.
 *
 * Chart slot renders par-3/4/5 averages relative to par as a small set of
 * bars. Par-5 is almost always the birdie/eagle opportunity — seeing that
 * bar at or below par tells you something different about a player than a
 * bloated par-3 bar does.
 */
import type { InsightAction } from '@/components/golf/coachhelm/insight-card';
import type { SectionData } from '@/app/golf/actions/player-fingerprint';
import { cn } from '@/lib/utils';
import { SectionBand } from './FingerprintHero';

export interface ScoringSectionProps {
  section: SectionData;
  onAction?: (action: InsightAction, insightId: string) => void;
}

export function ScoringSection({ section, onAction }: ScoringSectionProps) {
  const chart =
    section.chart_data && section.chart_data.kind === 'bars' ? (
      <ParTypeBars bars={section.chart_data.bars} />
    ) : null;

  return (
    <SectionBand
      section={section}
      overline="05 · Scoring"
      chart={chart}
      onAction={onAction}
    />
  );
}

interface Bar {
  label: string;
  value: number;
  max?: number;
}

function ParTypeBars({ bars }: { bars: Bar[] }) {
  return (
    <div
      className="rounded-xl bg-white/70 border border-warm-200 p-4"
      data-testid="scoring-par-chart"
    >
      <p className="text-[11px] uppercase tracking-wide text-warm-500 font-medium mb-3">
        Avg by par type
      </p>
      <div className="grid grid-cols-3 gap-3">
        {bars.map((bar) => {
          const par = parseInt(bar.label.replace(/\D/g, ''), 10);
          const diff = Number.isFinite(par) ? bar.value - par : 0;
          const tone =
            diff <= 0.15
              ? 'text-emerald-600 bg-emerald-50'
              : diff <= 0.4
                ? 'text-amber-600 bg-amber-50'
                : 'text-red-600 bg-red-50';
          return (
            <div
              key={bar.label}
              className={cn(
                'flex flex-col items-center justify-center rounded-lg border border-warm-200 p-3',
                tone,
              )}
            >
              <span className="text-[10px] uppercase tracking-wide font-medium opacity-70">
                {bar.label}
              </span>
              <span className="text-xl font-semibold tabular-nums mt-0.5">
                {bar.value.toFixed(2)}
              </span>
              <span className="text-[10px] tabular-nums mt-0.5 opacity-80">
                {diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
