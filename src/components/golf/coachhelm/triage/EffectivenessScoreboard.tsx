'use client';

/**
 * ============================================================================
 * EffectivenessScoreboard — the Effectiveness view's compact scoreboard
 * (Triage Desk spec §4)
 * ----------------------------------------------------------------------------
 * Replaces the 1,800-line `FairwayEffectiveness` instrument cockpit on the
 * Triage Desk's `?view=effectiveness` tab: ONE `InstrumentCluster` — adoption
 * `RingGauge` as the focal primary (the always-populated answer to "did the
 * coaching land"), the accuracy `Ribbon` + a Working/Not-working comparison
 * panel flanking it in the secondary rail, and the calibration line as the
 * tertiary foot readout. Reads the SAME SSR-fetched `CoachHelmOverviewData` /
 * `InsightEffectivenessData` / `PredictionPerformanceData` shapes the retired
 * cockpit consumed — no new server action, no re-derived scoring
 * (`buildEffectivenessScoreboard.ts` only filters/ranks/formats what
 * `coachhelm-analytics.ts` already produced).
 *
 * Primary is Adoption, NOT the accuracy Ribbon: `accuracyOverTime` is empty
 * on both a fresh team and most real ones (a longitudinal series needs a run
 * of resolved predictions), so a focal Ribbon would render blank far more
 * often than not. Adoption always has a number (even "0 of 0" reads as an
 * honest awaiting-state, never blank).
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { Badge, EmptyState, Ribbon, Surface, formatPercent } from '@/components/fairway';
import type { FairwayEffectivenessProps } from '@/components/fairway';
import { RingGauge } from '@/components/fairway/modules';
import { InstrumentCluster } from '@/components/fairway/instrument/InstrumentCluster';
import { InstrumentPanel } from '@/components/fairway/instrument/InstrumentPanel';
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
    <InstrumentCluster
      ariaLabel="Effectiveness scoreboard"
      // Primitive API gap: `cluster-deck` (the primary+secondary CSS grid)
      // has no row-stretch override and no prop threads a className onto it
      // — only the outer `flex-col` wrapper takes `className`. Reaching the
      // grid needs the same descendant-selector escape hatch the primitive
      // already uses on itself for the tertiary phone group (see
      // `TERTIARY_PHONE_GROUP` in InstrumentCluster.tsx), rather than a
      // primitive edit: without it the short Adoption panel stretches to
      // match its taller secondary-rail neighbor and centers inside the
      // extra height (the exact dead-space bug this file was already fixed
      // for once, under the old grid).
      className="[&_[data-slot=cluster-deck]]:items-start"
      primary={
        <InstrumentPanel depth="raised" eyebrow="Effectiveness" header="Adoption">
          <div className="flex items-center gap-3">
            <RingGauge value={adoption.pct} size={48} />
            <p className="font-fw-sans text-body-sm text-text-secondary">
              {adoption.live
                ? `${adoption.actedUpon} of ${adoption.generated} insights acted on`
                : 'No insights generated in this window yet.'}
            </p>
          </div>
        </InstrumentPanel>
      }
      secondary={[
        <InstrumentPanel key="trend" depth="base" eyebrow="Trend" header="Prediction accuracy">
          <Ribbon
            title="Prediction accuracy"
            overline="Trend"
            data={trendPoints}
            valueFormatter={(v) => formatPercent(v)}
            seriesName="Accuracy"
            goodDirection="up"
            height={140}
          />
        </InstrumentPanel>,
        showConsolidatedEmptyState ? (
          <InstrumentPanel key="comparison" depth="base">
            <EmptyState
              variant="subtle"
              title="Not enough resolved outcomes yet"
              description="Working / not-working rankings and prediction calibration fill in together once insights get acted on and predictions resolve."
            />
          </InstrumentPanel>
        ) : (
          <InstrumentPanel key="comparison" depth="base" eyebrow="Comparison" header="Working vs. not working">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:divide-x sm:divide-border-subtle">
              <div className="min-w-0">
                <RankedList title="Working" tone="success" items={working} />
              </div>
              <div className="min-w-0 sm:pl-4">
                <RankedList title="Not working" tone="danger" items={notWorking} />
              </div>
            </div>
          </InstrumentPanel>
        ),
      ]}
      tertiary={
        showConsolidatedEmptyState
          ? undefined
          : [
              // `depth="inset"` — a recessed sub-readout, not a floating card;
              // its chrome is deliberately what `InstrumentCluster`'s
              // `TERTIARY_PHONE_GROUP` strips below `sm` (see the primitive's
              // `[&_[data-slot=instrument-panel]]` overrides), collapsing
              // this single foot-row cell into the shared grouped ledger.
              <InstrumentPanel key="calibration" depth="inset" eyebrow="Calibration">
                <p
                  className={cn(
                    'font-fw-sans text-body-sm',
                    calibration.tone === 'positive' && 'text-fw-success-ink',
                    calibration.tone === 'warning' && 'text-fw-warning-ink',
                    calibration.tone === 'neutral' && 'text-text-tertiary',
                  )}
                >
                  {calibration.label}
                </p>
              </InstrumentPanel>,
            ]
      }
    />
  );
}
