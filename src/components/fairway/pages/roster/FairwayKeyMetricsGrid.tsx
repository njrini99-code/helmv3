'use client';

/**
 * ============================================================================
 * Fairway · Roster · FairwayKeyMetricsGrid (D3) — the 6-metric player KPI strip
 * ----------------------------------------------------------------------------
 * The warm-premium re-skin of the legacy player-profile KeyMetricsGrid
 * (src/components/golf/profile/KeyMetricsGrid.tsx). Same SIX metrics, same
 * calculators, same lower-is-better golf semantics — re-clad in the Fairway
 * MetricCard primitive (matte Surface tile, Number Flow value, tokenized
 * tones) and a shape-matched Skeleton loading state.
 *
 *   Handicap · Rounds · Avg Score · vs Par · GIR% · Fwy%
 *
 * PRESENTATION-ONLY: the GolfStats it reads is computed VERBATIM by the
 * existing stats engine (getPlayerProfileStats → calculateStatsFromShots). This
 * component never fetches, never recomputes — it formats whatever it is given.
 *
 * Tone policy (locked Helm green): GREEN = good (low scoring / high pct);
 * AMBER = caution; ROSE/RED = the genuinely bad band only. We express this via
 * MetricCard's footnote/value tokens — the big numeral stays text-primary and a
 * tone-tinted footnote chip carries the read, so the grid stays calm and never
 * paints an authoritative fake zero (em-dash when a metric is unavailable).
 *
 * ADDITIVE ONLY — new file under pages/roster; imported by FairwayStatsSection.
 * Renders inside a `.fairway-ds` scope on a `bg-canvas` page.
 * ========================================================================== */

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { MetricCard } from '@/components/fairway/cards-insight/MetricCard';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';

/* ---------------------------------------------------------------------------
 * Props
 * ------------------------------------------------------------------------- */

export interface FairwayKeyMetricsGridProps {
  /** Comprehensive stats from the engine (null until rounds exist / loaded). */
  stats: GolfStats | null;
  /** Player handicap from the profile row (engine-independent). */
  handicap: number | null;
  /** Loading → shape-matched Skeleton grid (never a spinner). */
  loading?: boolean;
  className?: string;
}

/* ---------------------------------------------------------------------------
 * Formatters (VERBATIM from legacy KeyMetricsGrid — semantics preserved)
 * ------------------------------------------------------------------------- */

function formatHandicap(handicap: number | null): string {
  if (handicap === null) return '—';
  // A leading "+" denotes a PLUS handicap (better than scratch, stored negative).
  if (handicap < 0) return `+${Math.abs(handicap).toFixed(1)}`;
  return handicap.toFixed(1);
}

function formatScoreToParStr(toPar: number | null): string {
  if (toPar === null) return '—';
  if (toPar === 0) return 'E';
  if (toPar > 0) return `+${toPar.toFixed(1)}`;
  return toPar.toFixed(1);
}

/* ---- tone classifiers (Helm-locked: green good · amber caution · rose bad)
   Mirrors the legacy getScoringColor / getPercentageColor thresholds, mapped
   to Fairway feedback tones for the footnote chip. ------------------------- */

type FwTone = 'good' | 'caution' | 'bad' | 'neutral';

function scoringTone(toPar: number | null): FwTone {
  if (toPar === null) return 'neutral';
  if (toPar < 0) return 'good';
  if (toPar === 0) return 'neutral';
  if (toPar <= 3) return 'caution';
  return 'bad';
}

function percentageTone(pct: number | null, goodThreshold: number): FwTone {
  if (pct === null) return 'neutral';
  if (pct >= goodThreshold) return 'good';
  if (pct >= goodThreshold - 15) return 'caution';
  return 'bad';
}

function handicapTone(handicap: number | null): FwTone {
  if (handicap === null) return 'neutral';
  return handicap <= 5 ? 'good' : 'neutral';
}

const TONE_CHIP: Record<FwTone, string> = {
  good: 'text-fw-success bg-fw-success-bg',
  caution: 'text-fw-warning bg-fw-warning-bg',
  bad: 'text-fw-danger bg-fw-danger-bg',
  neutral: 'text-text-tertiary bg-surface-sunken',
};

/* ---------------------------------------------------------------------------
 * One re-skinned KPI tile — a matte MetricCard with a tone-tinted footnote.
 * `value` is a preformatted string (engine semantics: signs, "E", "—", %), so
 * we render the numeral ourselves rather than feeding MetricCard a raw number
 * (its Number Flow can't show "E" / "+1.2" / "—"). We still get the matte
 * Surface chrome, the eyebrow, and the footnote slot from the primitive.
 * ------------------------------------------------------------------------- */

interface MetricSpec {
  label: string;
  value: string;
  /** small supporting line (e.g. "12/22") */
  footnote?: string;
  /** the read tone for the footnote chip + value emphasis */
  tone: FwTone;
}

function FairwayMetricTile({ label, value, footnote, tone }: MetricSpec) {
  return (
    <div
      data-slot="fw-key-metric"
      className={cn(
        // compact density for the dense 6-up grid (was cramped at p-6) + the
        // lit-edge card shadow so it matches the MetricCard premium recipe.
        'flex flex-col gap-1.5 rounded-card bg-surface p-4',
        'border border-border-subtle [box-shadow:var(--fw-shadow-card)]',
      )}
    >
      <span className="min-w-0 truncate font-fw-sans text-eyebrow uppercase text-text-tertiary">{label}</span>
      <span
        className="font-fw-mono text-h2 font-medium tabular-nums text-text-primary"
        style={{ fontFeatureSettings: '"tnum" 1, "lnum" 1' }}
      >
        {value}
      </span>
      {footnote || tone !== 'neutral' ? (
        <span
          className={cn(
            'inline-flex w-fit items-center rounded-full px-2 py-0.5',
            'font-fw-mono text-caption font-medium tabular-nums',
            TONE_CHIP[tone],
          )}
          style={{ fontFeatureSettings: '"tnum" 1, "lnum" 1' }}
        >
          {footnote ?? TONE_LABEL[tone]}
        </span>
      ) : null}
    </div>
  );
}

const TONE_LABEL: Record<FwTone, string> = {
  good: 'On target',
  caution: 'Watch',
  bad: 'Focus',
  neutral: '—',
};

/* ---------------------------------------------------------------------------
 * Skeleton — six shape-matched tiles (reserves the final 6-up grid layout)
 * ------------------------------------------------------------------------- */

export function FairwayKeyMetricsGridSkeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cn('grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6', className)}
    >
      <span className="sr-only">Loading key metrics…</span>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-1.5 rounded-card border border-border-subtle bg-surface p-4 [box-shadow:var(--fw-shadow-card)]"
        >
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-1 h-8 w-20" />
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * FairwayKeyMetricsGrid
 * ------------------------------------------------------------------------- */

export const FairwayKeyMetricsGrid = React.memo(function FairwayKeyMetricsGrid({
  stats,
  handicap,
  loading = false,
  className,
}: FairwayKeyMetricsGridProps) {
  if (loading) {
    return <FairwayKeyMetricsGridSkeleton className={className} />;
  }

  const avgToPar = stats?.avgScoreToPar ?? null;
  const gir = stats?.girPercentage ?? null;
  const fwy = stats?.fairwayPercentage ?? null;

  const metrics: MetricSpec[] = [
    {
      label: 'Handicap',
      value: formatHandicap(handicap),
      tone: handicapTone(handicap),
    },
    {
      label: 'Rounds',
      value: stats?.roundsPlayed != null ? String(stats.roundsPlayed) : '0',
      tone: 'neutral',
    },
    {
      label: 'Avg Score',
      value: stats?.scoringAverage != null ? stats.scoringAverage.toFixed(1) : '—',
      tone: scoringTone(avgToPar),
    },
    {
      label: 'vs Par',
      value: formatScoreToParStr(avgToPar),
      tone: scoringTone(avgToPar),
    },
    {
      label: 'GIR',
      value: gir != null ? `${gir.toFixed(0)}%` : '—',
      footnote:
        stats?.girTotal != null && stats.girTotal > 0
          ? `${stats.girTotal}/${stats.girOpportunities}`
          : undefined,
      tone: percentageTone(gir, 55),
    },
    {
      label: 'Fairway',
      value: fwy != null ? `${fwy.toFixed(0)}%` : '—',
      footnote:
        stats?.fairwaysHit != null && stats.fairwaysHit > 0
          ? `${stats.fairwaysHit}/${stats.fairwayOpportunities}`
          : undefined,
      tone: percentageTone(fwy, 55),
    },
  ];

  return (
    <div className={cn('grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6', className)}>
      {metrics.map((m) => (
        <FairwayMetricTile
          key={m.label}
          label={m.label}
          value={m.value}
          footnote={m.footnote}
          tone={m.tone}
        />
      ))}
    </div>
  );
});

// re-export so consumers can wire MetricCard directly if they prefer the
// primitive's Number Flow roll for numeric-only metrics.
export { MetricCard };
