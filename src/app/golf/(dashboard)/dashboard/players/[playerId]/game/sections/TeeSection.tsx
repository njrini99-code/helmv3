'use client';

/**
 * TeeSection — "From the tee". Avg distance · fairway % · SG:Tee.
 *
 * Chart slot shows a small ornamental driving-distance meter. The real
 * decision-making data lives in the MetricPills on the left rail; the chart
 * is there to give the coach's eye something to land on at a glance.
 */
import type { InsightAction } from '@/components/golf/coachhelm/insight-card';
import type { SectionData } from '@/app/golf/actions/player-fingerprint';
import { SectionBand } from './FingerprintHero';

export interface TeeSectionProps {
  section: SectionData;
  onAction?: (action: InsightAction, insightId: string) => void;
}

export function TeeSection({ section, onAction }: TeeSectionProps) {
  // Pull driving distance from the metrics (when present) for the meter.
  const distanceMetric = section.metrics.find((m) => m.label === 'Avg distance');
  const distanceNum = distanceMetric
    ? Number(distanceMetric.value.replace(/[^0-9.]/g, ''))
    : null;

  const chart =
    distanceNum && !Number.isNaN(distanceNum) ? <DistanceMeter distance={distanceNum} /> : null;

  return (
    <SectionBand
      section={section}
      overline="01 · Off the tee"
      chart={chart}
      onAction={onAction}
    />
  );
}

/**
 * Simple horizontal meter: 200yd baseline → 320yd ceiling. Visualizes where
 * the player sits in the distance spectrum without pretending to be a
 * precision chart.
 */
function DistanceMeter({ distance }: { distance: number }) {
  const min = 200;
  const max = 320;
  const pct = Math.min(100, Math.max(0, ((distance - min) / (max - min)) * 100));

  return (
    <div
      className="rounded-xl bg-cream-100/75 border border-warm-200 p-4"
      data-testid="tee-distance-meter"
    >
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wide text-warm-500 font-medium">
          Distance spectrum
        </span>
        <span className="text-sm font-semibold text-warm-900 tabular-nums">
          {Math.round(distance)} yd
        </span>
      </div>
      <div className="h-2.5 bg-warm-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary-300 to-primary-600 rounded-full transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-warm-400 tabular-nums mt-1.5">
        <span>{min}</span>
        <span>{max}+</span>
      </div>
    </div>
  );
}
