'use client';

/**
 * ============================================================================
 * StatsSpineStage — Player Stats on the Spine & Stage chassis (spec §5.1)
 * ----------------------------------------------------------------------------
 * The Task 6 composition root: fetches the SAME six reads
 * `FairwayStatsCockpit` fetches (`getDetailedStats`, `getTrendAnalysis`,
 * `getPlayerStandingRows`, `getPlayerLeakMaps`, `getPlayerPatterns`,
 * `getSprayChartData`) PLUS the two currently-unused `stats-data.ts` exports
 * the plan calls for (`getPlayerStrengthsWeaknesses`, `getWorstHoleAnalysis`),
 * runs the raw payloads through `buildStatsViewModel`'s pure helpers, and
 * renders `StatsSpine` beside a `StageRouter` whose home view is `StatsBento`
 * and whose seven drill views are the per-area components.
 *
 * Layout: `300px 1fr` grid, spine sticky at `top-20` — both collapse to a
 * single stacked column under 940px (spine un-stickies on mobile, per plan).
 * `FairwayStatsCockpit.tsx` has been retired (Task 10 cleanup) now that every
 * consumer — the player stats route and the roster coach drill-down — has
 * migrated to this component.
 * ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RotateCw } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Surface, Button, EmptyState, InlineNotice, Skeleton, Select } from '@/components/fairway';
import { StageRouter } from '@/components/fairway/modules';
import type { StageView } from '@/components/fairway/modules';

import { getPlayerStatsDashboardBundle } from '@/app/golf/actions/stats-dashboard';
import { getPlayerRoundOptions } from '@/app/golf/actions/stats-data';
import type { TrendAnalysisResponse, SprayChartResponse, WorstHoleResponse, RoundOption } from '@/app/golf/actions/stats-data-types';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { PlayerLeakMaps, PlayerStandingRow } from '@/app/golf/actions/stats-leak-maps-types';
import type { StatisticalStrengthWeakness } from '@/lib/golf/strokes-gained';

// CoachHelm cause/effect — REUSED VERBATIM from FairwayStatsCockpit. Returns
// the player's mined patterns (cause = description, effect = strokeImpact,
// fix = recommendation), gated by verifyPlayerAccess + isCoachHelmEnabledForPlayer
// inside the action.
import { getPlayerPatterns } from '@/app/golf/actions/insights';
export type CoachHelmPattern = NonNullable<
  Awaited<ReturnType<typeof getPlayerPatterns>>['patterns']
>[number];

import { biggestLeakArea, buildLedger, buildPriorities, buildStandingTrack, buildVerdict } from './buildStatsViewModel';
import { StatsSpine } from './StatsSpine';
import { StatsBento } from './StatsBento';
import { PuttingDrill } from './PuttingDrill';
import { DrivingDrill } from './DrivingDrill';
import { ApproachDrill } from './ApproachDrill';
import { ShortGameDrill } from './ShortGameDrill';
import { ScoringDrill } from './ScoringDrill';
import { StandingDrill } from './StandingDrill';
import { RoundsDrill } from './RoundsDrill';

export interface StatsSpineStageProps {
  playerId: string;
  isOwnStats?: boolean;
  playerName?: string;
  className?: string;
}

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

export function StatsSpineStage({ playerId, isOwnStats = false, playerName, className }: StatsSpineStageProps) {
  const standingViewerContext = isOwnStats ? 'self' : 'coach';

  const [detailedStats, setDetailedStats] = useState<GolfStats | null>(null);
  const [trendData, setTrendData] = useState<TrendAnalysisResponse | null>(null);
  const [standingRows, setStandingRows] = useState<PlayerStandingRow[] | null>(null);
  const [leakMaps, setLeakMaps] = useState<PlayerLeakMaps | null>(null);
  // Distinguish a leak-maps FETCH FAILURE from genuine no-data, so the
  // Approach/Putting drills render an honest "couldn't load — retry" notice
  // instead of masking a backend error as the insufficient-data empty state.
  // Mirrors FairwayStatsCockpit's P354 `leakError` pattern.
  const [leakError, setLeakError] = useState(false);
  const [sprayData, setSprayData] = useState<SprayChartResponse | null>(null);
  const [strengths, setStrengths] = useState<StatisticalStrengthWeakness[]>([]);
  const [weaknesses, setWeaknesses] = useState<StatisticalStrengthWeakness[]>([]);
  const [worstHoles, setWorstHoles] = useState<WorstHoleResponse | null>(null);
  const [patterns, setPatterns] = useState<CoachHelmPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Round scope. 'overall' is the career aggregate this page has always shown;
  // a round id narrows the detailed-stat block and the spray chart to that one
  // round. See getPlayerStatsDashboardBundle for why only those two move.
  const [roundOptions, setRoundOptions] = useState<RoundOption[]>([]);
  const [scopeRoundId, setScopeRoundId] = useState<string>('overall');

  const loadAll = useCallback(async (id: string, roundId: string) => {
    setLoading(true);
    setLoadError(null);
    setLeakError(false);
    try {
      const bundle = await getPlayerStatsDashboardBundle(id, roundId);

      if (bundle.detailed.ok) setDetailedStats(bundle.detailed.value);
      else setDetailedStats(null);
      if (bundle.trend.ok) setTrendData(bundle.trend.value);
      else setTrendData(null);
      if (bundle.standing.ok && bundle.standing.value.success) {
        setStandingRows(bundle.standing.value.data ?? []);
      } else {
        setStandingRows([]);
      }
      if (bundle.leak.ok && bundle.leak.value.success) {
        setLeakMaps(bundle.leak.value.data ?? null);
      } else {
        setLeakMaps(null);
      }
      if (bundle.spray.ok) setSprayData(bundle.spray.value);
      else setSprayData(null);
      if (bundle.strengthsWeaknesses.ok && bundle.strengthsWeaknesses.value) {
        setStrengths(bundle.strengthsWeaknesses.value.strengths ?? []);
        setWeaknesses(bundle.strengthsWeaknesses.value.weaknesses ?? []);
      } else {
        setStrengths([]);
        setWeaknesses([]);
      }
      if (bundle.worstHoles.ok) setWorstHoles(bundle.worstHoles.value);
      else setWorstHoles(null);
      // CoachHelm patterns are a non-blocking enrichment — a failure (or a
      // CoachHelm-disabled player) just hides the section, never errors the page.
      if (bundle.patterns.ok && bundle.patterns.value.success) {
        setPatterns(bundle.patterns.value.patterns ?? []);
      } else {
        setPatterns([]);
      }

      const standingFailed =
        !bundle.standing.ok || !bundle.standing.value.success;
      const leakFailed = !bundle.leak.ok || !bundle.leak.value.success;
      if (standingFailed && leakFailed) {
        setLoadError('Failed to load stats. Please try again.');
      } else if (leakFailed) {
        // The page is otherwise healthy, but the leak-map enrichment failed on
        // its own — surface a scoped, retryable notice in the Approach/Putting
        // drills rather than letting them read as "not enough data". (P354)
        setLeakError(true);
      }
    } catch {
      setLoadError('Failed to load stats. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll(playerId, scopeRoundId);
  }, [playerId, scopeRoundId, loadAll]);

  // Round list for the scope picker. Loaded once per player and independent of
  // the stats bundle: a failure here costs the picker, never the page.
  useEffect(() => {
    let cancelled = false;
    setScopeRoundId('overall');
    void (async () => {
      try {
        const rounds = await getPlayerRoundOptions(playerId);
        if (!cancelled) setRoundOptions(rounds);
      } catch {
        if (!cancelled) setRoundOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const roundSelectOptions = useMemo(() => {
    const fmt = (iso: string) => {
      // round_date is a plain YYYY-MM-DD calendar date. Parsing it with `new
      // Date()` resolves midnight UTC and then renders in the VIEWER's zone,
      // which shows the previous day for anyone west of Greenwich. Split it.
      const [y, m, d] = iso.slice(0, 10).split('-');
      return y && m && d ? `${Number(m)}/${Number(d)}/${y.slice(2)}` : iso;
    };
    return [
      { label: 'All rounds', value: 'overall' },
      ...roundOptions.map((r) => ({
        value: r.id,
        label: [fmt(r.date), r.courseName, r.totalScore !== null ? `(${r.totalScore})` : null]
          .filter(Boolean)
          .join(' · '),
      })),
    ];
  }, [roundOptions]);

  const scopedRound = useMemo(
    () => (scopeRoundId === 'overall' ? null : roundOptions.find((r) => r.id === scopeRoundId) ?? null),
    [scopeRoundId, roundOptions],
  );

  const standingByMetric = useMemo(() => {
    const map = new Map<string, PlayerStandingRow>();
    for (const row of standingRows ?? []) map.set(row.metric_id, row);
    return map;
  }, [standingRows]);

  const sgTotal = finite(standingByMetric.get('sg_total')?.player_value ?? null);
  const sgTeamAvg = finite(standingByMetric.get('sg_total')?.team_avg ?? null);

  const sgRows = useMemo(
    () =>
      (['sg_ott', 'sg_approach', 'sg_around_green', 'sg_putting'] as const).map((id) => ({
        metricId: id,
        value: finite(standingByMetric.get(id)?.player_value ?? null),
      })),
    [standingByMetric],
  );
  const leakArea = useMemo(() => biggestLeakArea(sgRows), [sgRows]);
  const leakLabel = useMemo(() => {
    const worst = sgRows.reduce<{ metricId: string; value: number } | null>((acc, r) => {
      if (r.value === null) return acc;
      if (acc === null || r.value < acc.value) return { metricId: r.metricId, value: r.value };
      return acc;
    }, null);
    if (!worst) return null;
    const LABELS: Record<string, string> = {
      sg_ott: 'off the tee',
      sg_approach: 'approach',
      sg_around_green: 'the short game',
      sg_putting: 'putting',
    };
    return LABELS[worst.metricId] ?? null;
  }, [sgRows]);

  const ledger = useMemo(
    () =>
      buildLedger({
        roundsPlayed: detailedStats?.roundsPlayed,
        fairwayPct: detailedStats?.fairwayPercentage,
        girPct: detailedStats?.girPercentage,
        puttsPerRound: detailedStats?.puttsPerRound,
        last30: trendData?.periodComparison.last30Days,
        previous30: trendData?.periodComparison.previous30Days,
      }),
    [detailedStats, trendData],
  );

  const priorities = useMemo(
    () =>
      buildPriorities(
        weaknesses.map((w) => ({ label: w.label, strokeImpact: w.strokeImpact })),
      ),
    [weaknesses],
  );

  const track = useMemo(
    () => buildStandingTrack(sgTotal, sgTeamAvg, standingViewerContext, playerName),
    [sgTotal, sgTeamAvg, standingViewerContext, playerName],
  );
  const verdict = useMemo(() => buildVerdict(sgTotal, leakLabel), [sgTotal, leakLabel]);

  const roundsAnalyzed = detailedStats?.roundsPlayed ?? 0;
  const hasStanding = (standingRows?.length ?? 0) > 0;
  const hasLeak =
    !!leakMaps && (leakMaps.putting.some((b) => b.sample_n > 0) || leakMaps.approach.some((b) => b.sample_n > 0));
  // Scoped to ONE round, the cold-start screen would be a trap: it replaces the
  // whole page — round picker included — so a round with no shot detail would
  // leave no way back to "All rounds" but a browser reload. Cold start is a
  // statement about the player's career, so only the career view may show it.
  const isColdStart =
    scopeRoundId === 'overall' && !loading && !loadError && !hasStanding && roundsAnalyzed === 0 && !hasLeak;

  /**
   * The round-scope picker.
   *
   * Rendered ABOVE the loading branch on purpose. Switching rounds re-fetches,
   * and if the picker lived only in the loaded view it would vanish under the
   * skeleton for the duration of its own interaction — the control disappearing
   * the moment you use it. It stays mounted and disabled instead.
   *
   * Hidden entirely when the player has no completed rounds: a picker whose
   * only entry is "All rounds" offers no choice.
   */
  const roundPicker =
    roundOptions.length > 0 ? (
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="stats-round-scope" className="text-fw-sm text-text-secondary">
          Showing
        </label>
        <Select
          id="stats-round-scope"
          aria-label="Scope stats to a single round"
          size="sm"
          className="min-w-[16rem]"
          value={scopeRoundId}
          disabled={loading}
          onValueChange={(v) => setScopeRoundId(v ?? 'overall')}
          options={roundSelectOptions}
        />
      </div>
    ) : null;

  if (loading) {
    return (
      <div className={cn('flex flex-col gap-4', className)} aria-busy="true">
        {roundPicker}
        <div className="flex flex-col gap-6 min-[940px]:grid min-[940px]:grid-cols-[300px_1fr]">
          <Skeleton className="h-[480px] rounded-fw-lg" />
          <Skeleton className="h-[480px] rounded-fw-lg" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <Surface padding="lg" className={className}>
        <InlineNotice
          tone="danger"
          title="Couldn't load stats"
          action={
            <Button variant="secondary" size="sm" busy={loading} leftIcon={<RotateCw className="h-4 w-4" aria-hidden />} onClick={() => void loadAll(playerId, scopeRoundId)}>
              Try again
            </Button>
          }
        >
          {loadError}
        </InlineNotice>
      </Surface>
    );
  }

  if (isColdStart) {
    return (
      <Surface padding="lg" className={className}>
        <EmptyState
          title="More rounds needed"
          description="Log 5+ rounds and the strokes-gained standing vs PGA Tour and the team fills in — plus the putting and approach leak maps."
          action={
            isOwnStats ? (
              <Button asChild variant="primary">
                <Link href="/golf/dashboard/rounds/new">Log a round</Link>
              </Button>
            ) : undefined
          }
        />
      </Surface>
    );
  }

  const views: StageView[] = [
    {
      key: 'home',
      node: (
        <StatsBento
          detailedStats={detailedStats}
          standingByMetric={standingByMetric}
          trendData={trendData}
          strengths={strengths}
          weaknesses={weaknesses}
          leakArea={leakArea}
        />
      ),
    },
    {
      key: 'putting',
      node: (
        <PuttingDrill
          detailedStats={detailedStats}
          leakMaps={leakMaps}
          standingByMetric={standingByMetric}
          weaknesses={weaknesses}
          leakError={leakError}
          onRetryLeak={() => void loadAll(playerId, scopeRoundId)}
          retryingLeak={loading}
          patterns={patterns}
          trends={trendData?.trends}
        />
      ),
    },
    {
      key: 'driving',
      node: (
        <DrivingDrill
          detailedStats={detailedStats}
          sprayData={sprayData}
          patterns={patterns}
          trends={trendData?.trends}
        />
      ),
    },
    {
      key: 'approach',
      node: (
        <ApproachDrill
          detailedStats={detailedStats}
          leakMaps={leakMaps}
          sprayData={sprayData}
          leakError={leakError}
          onRetryLeak={() => void loadAll(playerId, scopeRoundId)}
          retryingLeak={loading}
          patterns={patterns}
          trends={trendData?.trends}
        />
      ),
    },
    { key: 'short-game', node: <ShortGameDrill detailedStats={detailedStats} patterns={patterns} /> },
    {
      key: 'scoring',
      node: (
        <ScoringDrill
          detailedStats={detailedStats}
          worstHoles={worstHoles}
          patterns={patterns}
          trends={trendData?.trends}
          periodComparison={trendData?.periodComparison}
          personalBests={trendData?.personalBests}
        />
      ),
    },
    {
      key: 'standing',
      node: (
        <StandingDrill
          standingRows={standingRows}
          standingViewerContext={standingViewerContext}
          playerName={playerName}
          playerId={playerId}
          patterns={patterns}
        />
      ),
    },
    {
      key: 'rounds',
      node: (
        <RoundsDrill
          rounds={trendData?.rounds ?? []}
          scoreTrend={trendData?.trends.score}
          personalBests={trendData?.personalBests}
          periodComparison={trendData?.periodComparison}
        />
      ),
    },
  ];

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {roundPicker}
      <div className="flex flex-col gap-6 min-[940px]:grid min-[940px]:grid-cols-[300px_1fr] min-[940px]:items-start">
        <StatsSpine
          className="min-[940px]:sticky min-[940px]:top-20"
          sgTotal={sgTotal}
          scoringAverage={finite(detailedStats?.scoringAverage)}
          verdict={verdict}
          track={track}
          priorities={priorities}
          ledger={ledger}
        />
        <div className="flex min-w-0 flex-col gap-4">
          {/* Say plainly what the scope does and does not move. The spine's
              standing, the trend windows and the leak maps are all cross-round
              by construction and keep showing the career picture — without this
              line a coach would read a team-relative rank as this round's. */}
          {scopedRound ? (
            <InlineNotice tone="info" title="Scoped to one round">
              Every stat below is from this round alone
              {scopedRound.courseName ? ` at ${scopedRound.courseName}` : ''}. Team standing, 30-day
              trends and the leak maps still cover all rounds — one round is too small a sample to
              rank or trend.
            </InlineNotice>
          ) : null}
          {detailedStats?.truncated && !scopedRound ? (
            <InlineNotice tone="info" title="Stats cover your most recent 100 rounds">
              Older rounds aren&apos;t included in the totals below.
            </InlineNotice>
          ) : null}
          <StageRouter param="area" homeKey="home" views={views} />
        </div>
      </div>
    </div>
  );
}
