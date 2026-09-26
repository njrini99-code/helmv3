'use client';

/**
 * ============================================================================
 * EffectivenessScoreboard — the Effectiveness view's compact scoreboard
 * (Triage Desk spec §4)
 * ----------------------------------------------------------------------------
 * Replaces the 1,800-line `FairwayEffectiveness` instrument cockpit on the
 * Triage Desk's `?view=effectiveness` tab: ONE screen, no tabs inside.
 * Summary first (owner direction 2026-09-25): one card with the adoption
 * number, a one-line verdict, the acted-on bar and the prediction-accuracy
 * readout; then the "working / not working" top-3 lists and the calibration
 * line; the accuracy trend sits in a closed disclosure. Reads the SAME SSR-fetched
 * `CoachHelmOverviewData` / `InsightEffectivenessData` /
 * `PredictionPerformanceData` shapes the retired cockpit consumed — no new
 * server action, no re-derived scoring (`buildEffectivenessScoreboard.ts`
 * only filters/ranks/formats what `coachhelm-analytics.ts` already produced).
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { Badge, EmptyState, Eyebrow, Ribbon, Surface, formatPercent } from '@/components/fairway';
import type { FairwayEffectivenessProps } from '@/components/fairway';
import { Disclosure } from '@/components/golf/coachhelm/root-map/Disclosure';
import { formatCategoryLabel } from './buildTriageViewModel';
import {
  accuracyTrendPoints,
  summarizeAccuracy,
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
    <div className="flex min-w-0 flex-col gap-3">
      <Eyebrow as="p">{title}</Eyebrow>
      {items.length === 0 ? (
        <p className="font-fw-sans text-body-sm text-text-tertiary">Not enough recorded outcomes yet.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border-subtle">
          {items.map((item, i) => (
            <li key={item.insightType} className="flex min-h-11 items-center gap-2.5 py-1.5">
              <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-fw-sans text-body-sm text-text-primary">
                  {formatCategoryLabel(item.insightType)}
                </span>
                <span className="block font-fw-mono text-caption tabular-nums text-text-tertiary">
                  {item.outcomesImproved} of {item.insightsWithOutcome} improved
                </span>
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
  const accuracy = summarizeAccuracy(initialPerformance);
  const working = topInsightTypes(initialEffectiveness?.byType, 'best');
  const notWorking = topInsightTypes(initialEffectiveness?.byType, 'worst');
  const calibration = summarizeCalibration(initialPerformance);
  const trendPoints = accuracyTrendPoints(initialPerformance);

  const rankingsEmpty = working.length === 0 && notWorking.length === 0;
  const showConsolidatedEmptyState = rankingsEmpty && !calibration.live;

  const verdict = adoption.live
    ? `${adoption.actedUpon} of ${adoption.generated} insights acted on in this window.`
    : 'No insights generated in this window yet.';

  return (
    // A single-column grid that never stretches its cards to a row-mate's
    // height (items-start), so each reads at its intrinsic size.
    <div className="grid grid-cols-1 items-start gap-6" data-slot="effectiveness-scoreboard">
      {/* ── Summary: the key number, one verdict, one bar ── */}
      <Surface padding="lg" className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <Eyebrow as="p">Adoption</Eyebrow>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="font-fw-mono text-display tabular-nums text-text-primary">
              {adoption.live ? `${adoption.pct}%` : '—'}
            </p>
            <p className="text-caption text-text-secondary">
              {accuracy.live ? (
                <>
                  prediction accuracy{' '}
                  <span className="font-fw-mono tabular-nums text-text-primary">{formatPercent(accuracy.rate)}</span>{' '}
                  of <span className="font-fw-mono tabular-nums">{accuracy.validated}</span> resolved
                </>
              ) : (
                <>
                  predictions resolved{' '}
                  <span className="font-fw-mono tabular-nums text-text-primary">
                    {accuracy.validated} of {accuracy.needed}
                  </span>{' '}
                  needed
                </>
              )}
            </p>
          </div>
          <p className="text-body text-text-secondary">{verdict}</p>
        </div>
        {adoption.live ? (
          <div
            role="img"
            aria-label={`${adoption.actedUpon} of ${adoption.generated} insights acted on.`}
            className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-surface-sunken"
          >
            <span
              className="h-full rounded-full bg-accent-500 motion-safe:transition-[width] motion-safe:duration-500"
              style={{ width: `${adoption.pct}%` }}
            />
          </div>
        ) : null}
      </Surface>

      {showConsolidatedEmptyState ? (
        <Surface padding="md">
          <EmptyState
            variant="subtle"
            title="Not enough resolved outcomes yet"
            description="Working / not-working rankings and prediction calibration fill in together once insights get acted on and predictions resolve."
          />
        </Surface>
      ) : (
        <Surface padding="md" className="flex flex-col gap-5">
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <RankedList title="Working" tone="success" items={working} />
            <RankedList title="Not working" tone="danger" items={notWorking} />
          </div>
          <p
            className={cn(
              'border-t border-border-subtle pt-4 font-fw-sans text-body-sm',
              calibration.tone === 'positive' && 'text-fw-success-ink',
              calibration.tone === 'warning' && 'text-fw-warning-ink',
              calibration.tone === 'neutral' && 'text-text-tertiary',
            )}
          >
            {calibration.label}
          </p>
        </Surface>
      )}

      <Disclosure title="Prediction accuracy trend" slot="effectiveness-trend">
        {trendPoints.length >= 2 ? (
          <Ribbon
            title="Prediction accuracy"
            overline="Resolved windows only"
            data={trendPoints}
            valueFormatter={(v) => formatPercent(v)}
            seriesName="Accuracy"
            goodDirection="up"
            height={140}
          />
        ) : (
          <p className="text-body-sm text-text-secondary">
            A trend needs at least two windows with resolved predictions.{' '}
            <span className="font-fw-mono tabular-nums">{trendPoints.length}</span> so far.
          </p>
        )}
      </Disclosure>
    </div>
  );
}
