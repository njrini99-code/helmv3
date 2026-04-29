'use client';

/**
 * ApproachSection — "Approach". GIR · proximity · SG:Approach.
 *
 * Chart slot is the miss-direction breakdown (left / right / short / long).
 * Shows the coach where the player's approach shots miss, which is the
 * single most actionable teaching nugget — every miss direction has a
 * different fix.
 */
import type { InsightAction } from '@/components/golf/coachhelm/insight-card';
import type { SectionData } from '@/app/golf/actions/player-fingerprint';
import { SectionBand } from './FingerprintHero';

export interface ApproachSectionProps {
  section: SectionData;
  onAction?: (action: InsightAction, insightId: string) => void;
}

export function ApproachSection({ section, onAction }: ApproachSectionProps) {
  const chart =
    section.chart_data && section.chart_data.kind === 'pills' ? (
      <MissDirectionChart pills={section.chart_data.pills} />
    ) : null;

  return (
    <SectionBand
      section={section}
      overline="02 · Approach"
      chart={chart}
      onAction={onAction}
    />
  );
}

interface MissPill {
  label: string;
  value: string;
}

function MissDirectionChart({ pills }: { pills: MissPill[] }) {
  return (
    <div
      className="rounded-xl bg-cream-100/75 border border-warm-200 p-4"
      data-testid="approach-miss-chart"
    >
      <p className="text-[11px] uppercase tracking-wide text-warm-500 font-medium mb-3">
        Miss direction
      </p>
      <div className="grid grid-cols-2 gap-2">
        {pills.map((p) => (
          <div
            key={p.label}
            className="flex items-center justify-between rounded-lg bg-warm-50/80 border border-warm-100 px-3 py-2"
          >
            <span className="text-xs text-warm-600">{p.label}</span>
            <span className="text-sm font-medium text-warm-900 tabular-nums">
              {p.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
