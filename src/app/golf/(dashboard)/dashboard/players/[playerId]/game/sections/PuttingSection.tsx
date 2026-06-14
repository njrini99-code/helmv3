'use client';

/**
 * PuttingSection — "Putting". PPR · 1-putt · 3-putt · SG:Putting.
 *
 * Chart slot is make-% by distance bucket — the same shape the coach sees on
 * a typical post-round report, but condensed. Coach scans this in one beat
 * to decide "we're working on 6-10ft today" or "we're working on lag".
 */
import type { InsightAction } from '@/components/golf/coachhelm/insight-card';
import type { SectionData } from '@/app/golf/actions/player-fingerprint';
import { cn } from '@/lib/utils';
import { SectionBand } from './FingerprintHero';

export interface PuttingSectionProps {
  section: SectionData;
  onAction?: (action: InsightAction, insightId: string) => void;
}

export function PuttingSection({ section, onAction }: PuttingSectionProps) {
  const chart =
    section.chart_data && section.chart_data.kind === 'bars' ? (
      <MakePercentBars bars={section.chart_data.bars} />
    ) : null;

  return (
    <SectionBand
      section={section}
      overline="04 · Putting"
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

function MakePercentBars({ bars }: { bars: Bar[] }) {
  return (
    <div
      className="rounded-xl bg-cream-100/75 border border-warm-200 p-4"
      data-testid="putting-make-chart"
    >
      <p className="text-eyebrow uppercase tracking-wide text-warm-500 font-medium mb-3">
        Make % by distance
      </p>
      <div className="space-y-1.5">
        {bars.map((bar) => {
          const max = bar.max ?? 100;
          const pct = max > 0 ? Math.min(100, (bar.value / max) * 100) : 0;
          const barColor =
            bar.value >= 50
              ? 'bg-primary-500'
              : bar.value >= 25
                ? 'bg-amber-400'
                : 'bg-red-400';
          return (
            <div key={bar.label} className="flex items-center gap-2">
              <span className="text-eyebrow text-warm-600 w-16 flex-shrink-0">
                {bar.label}
              </span>
              <div className="flex-1 h-2 bg-warm-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    barColor,
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-eyebrow font-medium text-warm-800 tabular-nums w-8 text-right">
                {Math.round(bar.value)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
