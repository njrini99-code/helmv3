'use client';

/**
 * ============================================================================
 * EffectivenessScoreboard — the Effectiveness view's compact scoreboard
 * (Triage Desk spec §4)
 * ----------------------------------------------------------------------------
 * Replaces the 1,800-line `FairwayEffectiveness` instrument cockpit on the
 * Triage Desk's `?view=effectiveness` tab: ONE screen, no tabs inside —
 * adoption `RingGauge`, effectiveness-trend `Ribbon`, "working / not working"
 * top-3 lists, and a calibration line. Reads the SAME SSR-fetched
 * `CoachHelmOverviewData` / `InsightEffectivenessData` /
 * `PredictionPerformanceData` shapes the retired cockpit consumed — no new
 * server action, no re-derived scoring (`buildEffectivenessScoreboard.ts`
 * only filters/ranks/formats what `coachhelm-analytics.ts` already produced).
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { Badge, EmptyState, Ribbon, Surface, formatPercent } from '@/components/fairway';
import type { FairwayEffectivenessProps } from '@/components/fairway';
import { RingGauge } from '@/components/fairway/modules';
import { formatCategoryLabel } from './buildTriageViewModel';
import {
  summarizeAdoption,
  summarizeCalibration,
  topInsightTypes,
  type RankedInsightType,
} from './buildEffectivenessScoreboard';

export type EffectivenessScoreboardProps = Pick<
  FairwayEffectivenessProps,
  'initialOverview' | 'initialEffectiveness' | 'initialPerformance'
>;

function RankedList({
  title,
  tone,
  items,
}: {
  title: string;
  tone: 'success' | 'danger';
  items: RankedInsightType[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-wide text-text-tertiary">{title}</p>
      {items.length === 0 ? (
        <p className="font-fw-sans text-body-sm text-text-tertiary">Not enough recorded outcomes yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {items.map((item, i) => (
            <li key={item.insightType} className="flex items-center gap-2.5">
              <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="min-w-0 flex-1 truncate font-fw-sans text-body-sm text-text-primary">
                {formatCategoryLabel(item.insightType)}
              </span>
              <Badge tone={tone} size="sm" numeric>
                {formatPercent(item.effectivenessScore)}
              </Badge>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function EffectivenessScoreboard({
  initialOverview,
  initialEffectiveness,
  initialPerformance,
}: EffectivenessScoreboardProps) {
  const hasAnyData = Boolean(initialOverview || initialEffectiveness || initialPerformance);
  if (!hasAnyData) {
    return (
      <Surface padding="lg">
        <EmptyState
          title="No effectiveness data yet"
          description="Once insights surface and predictions resolve, adoption, working patterns, and calibration will fill in here."
        />
      </Surface>
    );
  }

  const adoption = summarizeAdoption(initialEffectiveness);
  const working = topInsightTypes(initialEffectiveness?.byType, 'best');
  const notWorking = topInsightTypes(initialEffectiveness?.byType, 'worst');
  const calibration = summarizeCalibration(initialPerformance);
  const trendPoints = (initialPerformance?.accuracyOverTime ?? []).map((p) => ({ x: p.date, y: p.accuracyRate }));

  // The Working / Not-working / calibration line each independently render an
  // honest "no data yet" — fine when only one is starved (its siblings carry
  // real content), but when ALL THREE are starved at once (a fresh team with
  // no resolved outcomes) that's 3 boxes repeating the same non-finding.
  // Collapse to ONE clear state instead of the triple stack.
  const rankingsEmpty = working.length === 0 && notWorking.length === 0;
  const showConsolidatedEmptyState = rankingsEmpty && !calibration.live;

  return (
    // `items-start` — each card sizes to its OWN content (intrinsic height)
    // instead of CSS Grid's default row-stretch, which was forcing the
    // compact Adoption ring+caption to stretch to match its taller Ribbon
    // row-mate and center-float in the resulting empty middle.
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <Surface padding="md" className="flex flex-col gap-3">
        <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-wide text-text-tertiary">Adoption</p>
        <div className="flex items-center gap-3">
          <RingGauge value={adoption.pct} size={48} />
          <p className="font-fw-sans text-body-sm text-text-secondary">
            {adoption.live
              ? `${adoption.actedUpon} of ${adoption.generated} insights acted on`
              : 'No insights generated in this window yet.'}
          </p>
        </div>
      </Surface>

      <Surface padding="md">
        <Ribbon
          title="Prediction accuracy"
          overline="Trend"
          data={trendPoints}
          valueFormatter={(v) => formatPercent(v)}
          seriesName="Accuracy"
          goodDirection="up"
          height={140}
        />
      </Surface>

      {showConsolidatedEmptyState ? (
        <Surface padding="md" className="lg:col-span-2">
          <EmptyState
            variant="subtle"
            title="Not enough resolved outcomes yet"
            description="Working / not-working rankings and prediction calibration fill in together once insights get acted on and predictions resolve."
          />
        </Surface>
      ) : (
        <>
          <Surface padding="md">
            <RankedList title="Working" tone="success" items={working} />
          </Surface>
          <Surface padding="md">
            <RankedList title="Not working" tone="danger" items={notWorking} />
          </Surface>

          <Surface padding="md" className="lg:col-span-2">
            <p
              className={cn(
                'font-fw-sans text-body-sm',
                calibration.tone === 'positive' && 'text-fw-success',
                calibration.tone === 'warning' && 'text-fw-warning-ink',
                calibration.tone === 'neutral' && 'text-text-tertiary',
              )}
            >
              {calibration.label}
            </p>
          </Surface>
        </>
      )}
    </div>
  );
}
