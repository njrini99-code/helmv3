'use client';

/**
 * ============================================================================
 * Fairway · Roster · FairwayStatsSection (D2/D4) — player-profile stats HOST
 * ----------------------------------------------------------------------------
 * The warm-premium re-skin of the legacy PlayerStatsSection orchestrator
 * (src/components/golf/profile/PlayerStatsSection.tsx). It owns:
 *
 *   D2  · the round-selector header (Overall vs up to 15 individual rounds),
 *         re-clad in the Fairway Select.
 *   D4  · the composition: FairwayKeyMetricsGrid (D3) → Performance Trends
 *         (Scoring Trend line + Score Distribution bars, re-skinned over the
 *         matte ChartFrame vocabulary) → FairwayStatsTabs (D5).
 *
 * REUSED VERBATIM (presentation-only re-skin — the data engine is untouched):
 *   · getPlayerProfileStats  from '@/app/golf/actions/player-profile-stats'
 *     — the SAME two-phase fetch + the SAME GolfStats output.
 *   · the per-round stats CACHE (useRef<Map>), keyed `${playerId}-${roundId}`,
 *     loaded in an effect on [playerId, selectedRoundId] — byte-for-byte the
 *     legacy lifecycle (cache-hit short-circuit, error capture, rounds refresh).
 *
 * Charts stay dynamic ssr:false + wrapped in Suspense (perf + the legacy
 * contract). The re-skin only changes the FRAME (matte ChartFrame chrome +
 * tokenized colors); the recharts series/axes config is preserved in spirit.
 *
 * ADDITIVE ONLY — new file under pages/roster. Renders inside a `.fairway-ds`
 * scope on a `bg-canvas` page. Reuses fairwayToast only for the load-error path.
 * ========================================================================== */

import * as React from 'react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import {
  getPlayerProfileStats,
  type RoundOption,
} from '@/app/golf/actions/player-profile-stats';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { Surface } from '@/components/fairway/surfaces/surface';
import { Select } from '@/components/fairway/forms/Select';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { InlineNotice } from '@/components/fairway/feedback/InlineNotice';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { Target as LucideTarget } from 'lucide-react';
import {
  FairwayKeyMetricsGrid,
  FairwayKeyMetricsGridSkeleton,
} from './FairwayKeyMetricsGrid';
import { FairwayStatsTabs } from './FairwayStatsTabs';

/* ---------------------------------------------------------------------------
 * Dynamic chart imports — ssr:false + Suspense, preserved from the legacy
 * PlayerStatsSection contract (recharts is client-only / heavy).
 * ------------------------------------------------------------------------- */

const ScoringTrend = dynamic(
  () => import('@/components/fairway/charts/TrendChart').then((m) => m.TrendChart),
  { ssr: false, loading: () => <ChartLoading /> },
);
const ScoreDistribution = dynamic(
  () => import('@/components/fairway/charts/TrendChart').then((m) => m.BarCompare),
  { ssr: false, loading: () => <ChartLoading /> },
);

function ChartLoading() {
  return (
    <Surface elevation="border" padding="md" className="flex flex-col gap-4">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-[200px] w-full rounded-fw-md" />
    </Surface>
  );
}

/* ---------------------------------------------------------------------------
 * Props — mirror the legacy PlayerStatsSection signature
 * ------------------------------------------------------------------------- */

export interface FairwayStatsSectionProps {
  playerId: string;
  handicap: number | null;
  /** SSR-known rounds (optional warm start; the action refreshes them). */
  initialRounds?: RoundOption[];
  className?: string;
}

type SelectedRound = string | 'overall';

/* ---------------------------------------------------------------------------
 * Helpers (date / to-par formatting — preserved from legacy)
 * ------------------------------------------------------------------------- */

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatScoreToPar(score: number | null): string {
  if (score === null) return '—';
  if (score === 0) return 'E';
  if (score > 0) return `+${score}`;
  return String(score);
}

/* ---------------------------------------------------------------------------
 * FairwayStatsSection
 * ------------------------------------------------------------------------- */

export const FairwayStatsSection = React.memo(function FairwayStatsSection({
  playerId,
  handicap,
  initialRounds = [],
  className,
}: FairwayStatsSectionProps) {
  const [stats, setStats] = React.useState<GolfStats | null>(null);
  const [rounds, setRounds] = React.useState<RoundOption[]>(initialRounds);
  const [selectedRoundId, setSelectedRoundId] = React.useState<SelectedRound>('overall');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Per-round cache — VERBATIM from legacy PlayerStatsSection. Keyed by
  // `${playerId}-${selectedRoundId}`; a hit short-circuits the fetch.
  const statsCache = React.useRef<Map<string, GolfStats>>(new Map());

  // Load stats on mount + whenever the round selection changes (legacy effect).
  React.useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      const cacheKey = `${playerId}-${selectedRoundId}`;

      if (statsCache.current.has(cacheKey)) {
        if (!cancelled) {
          setStats(statsCache.current.get(cacheKey)!);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);

      const result = await getPlayerProfileStats(playerId, selectedRoundId);
      if (cancelled) return;

      if (!result.success) {
        setError(result.error || 'Failed to load stats');
        setLoading(false);
        return;
      }

      if (result.rounds.length > 0) {
        setRounds(result.rounds);
      }
      if (result.stats) {
        statsCache.current.set(cacheKey, result.stats);
      }
      setStats(result.stats);
      setLoading(false);
    }

    void loadStats();
    return () => {
      cancelled = true;
    };
  }, [playerId, selectedRoundId]);

  const selectedRound =
    selectedRoundId !== 'overall' ? rounds.find((r) => r.id === selectedRoundId) ?? null : null;

  // Round-selector options — Overall + up to 15 rounds (legacy slice(0,15)).
  const roundOptions = React.useMemo(
    () => [
      { value: 'overall', label: 'Overall (All Rounds)' },
      ...rounds.slice(0, 15).map((r) => ({
        value: r.id,
        label: `${r.course_name || 'Round'} · ${formatDate(r.round_date)} · ${
          r.total_score ?? '—'
        } (${formatScoreToPar(r.score_to_par)})`,
      })),
    ],
    [rounds],
  );

  const subtitle =
    selectedRoundId === 'overall'
      ? `Overall statistics from ${rounds.length} round${rounds.length === 1 ? '' : 's'}`
      : selectedRound
        ? `${selectedRound.course_name || 'Round'} · ${new Date(
            selectedRound.round_date,
          ).toLocaleDateString()}`
        : 'Select a round';

  // ---- Performance Trends data (overall-only, ≥2 rounds — legacy gate) ----

  const trendData = React.useMemo(() => {
    // oldest → newest, last 10 (legacy ScoringTrendMini slice(0,10).reverse())
    const ordered = [...rounds]
      .slice(0, 10)
      .reverse()
      .filter((r): r is RoundOption & { total_score: number } => r.total_score !== null);
    return ordered.map((r) => ({ x: formatDate(r.round_date), y: r.total_score }));
  }, [rounds]);

  const distributionData = React.useMemo(() => {
    if (!stats) return [];
    return [
      { label: 'Eagles', value: stats.totalEagles },
      { label: 'Birdies', value: stats.totalBirdies, highlight: true },
      { label: 'Pars', value: stats.totalPars },
      { label: 'Bogeys', value: stats.totalBogeys },
      { label: 'Doubles+', value: stats.totalDoublePlus },
    ].filter((d) => d.value > 0);
  }, [stats]);

  const showTrends =
    !loading &&
    !!stats &&
    stats.holesPlayed > 0 &&
    rounds.length >= 2 &&
    selectedRoundId === 'overall';

  const totalDistributionHoles = distributionData.reduce((sum, d) => sum + d.value, 0);

  return (
    <section className={cn('flex flex-col gap-6', className)} aria-label="Player performance stats">
      {/* ── D2 · HEADER + ROUND SELECTOR ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-fw-display text-h3 text-text-primary">Performance Stats</h2>
          <p className="mt-0.5 font-fw-sans text-caption text-text-tertiary">{subtitle}</p>
        </div>

        {rounds.length > 0 ? (
          <div className="w-full sm:w-72">
            <Select
              size="sm"
              options={roundOptions}
              value={selectedRoundId}
              onValueChange={(v) => setSelectedRoundId((v ?? 'overall') as SelectedRound)}
              placeholder="Select a round…"
              aria-label="Select round for stats"
            />
          </div>
        ) : null}
      </div>

      {/* ── ERROR (honest, distinct from empty) ── */}
      {error ? (
        <InlineNotice tone="danger" title="Couldn't load stats">
          {error}
        </InlineNotice>
      ) : null}

      {/* ── D3 · KEY METRICS GRID ── */}
      <FairwayKeyMetricsGrid stats={stats} handicap={handicap} loading={loading} />

      {/* ── EMPTY (no shot-tracked stats yet) ── */}
      {!loading && !stats ? (
        <Surface elevation="border" padding="lg">
          <EmptyState
            icon={LucideTarget}
            variant="subtle"
            title="No stats available"
            description="Complete rounds with shot-by-shot tracking to see detailed statistics and trends."
          />
        </Surface>
      ) : null}

      {/* ── D4 · PERFORMANCE TRENDS (overall + ≥2 rounds) ── */}
      {showTrends ? (
        <div className="flex flex-col gap-3">
          <h3 className="font-fw-display text-body-lg text-text-primary">Performance Trends</h3>
          <React.Suspense fallback={<ChartLoading />}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ScoringTrend
                title="Scoring Trend"
                overline={`Last ${trendData.length} rounds`}
                subtitle="Total score by round (lower is better)"
                takeaway="Recent scoring trajectory"
                data={trendData}
                variant="line"
                height={200}
                valueFormatter={(v) => String(Math.round(v))}
              />
              <ScoreDistribution
                title="Score Distribution"
                overline={`${totalDistributionHoles} holes played`}
                subtitle="Hole results across recorded rounds"
                takeaway="Distribution of hole outcomes"
                data={distributionData}
                height={200}
                valueFormatter={(v) => String(Math.round(v))}
              />
            </div>
          </React.Suspense>
        </div>
      ) : null}

      {/* ── D5 · DETAILED STATS TABS ── */}
      {!loading && stats && stats.holesPlayed > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="font-fw-display text-body-lg text-text-primary">Detailed Statistics</h3>
          <FairwayStatsTabs stats={stats} />
        </div>
      ) : null}

      {/* metrics-grid skeleton is owned by FairwayKeyMetricsGrid (loading prop);
          this guards the rare case where the section mounts with no metrics
          slot rendered yet — keeps the layout reserved (CLS). */}
      {loading && !stats ? (
        <div className="sr-only" aria-hidden>
          <FairwayKeyMetricsGridSkeleton />
        </div>
      ) : null}
    </section>
  );
});
