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
 * `FairwayStatsCockpit.tsx` is intentionally left untouched (Task 10 cleanup
 * retires it once every consumer has migrated).
 * ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RotateCw } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Surface, Button, EmptyState, InlineNotice, Skeleton } from '@/components/fairway';
import { StageRouter } from '@/components/fairway/modules';
import type { StageView } from '@/components/fairway/modules';

import { getDetailedStats, getTrendAnalysis, getSprayChartData, getPlayerStrengthsWeaknesses, getWorstHoleAnalysis } from '@/app/golf/actions/stats-data';
import type { TrendAnalysisResponse, SprayChartResponse, WorstHoleResponse } from '@/app/golf/actions/stats-data-types';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { getPlayerLeakMaps, getPlayerStandingRows } from '@/app/golf/actions/stats-leak-maps';
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

  const loadAll = useCallback(async (id: string) => {
    setLoading(true);
    setLoadError(null);
    setLeakError(false);
    try {
      const [detailedRes, trendRes, standingRes, leakRes, sprayRes, swRes, worstRes, patternsRes] =
        await Promise.allSettled([
          getDetailedStats(id, 'overall'),
          getTrendAnalysis(id),
          getPlayerStandingRows(id),
          getPlayerLeakMaps(id),
          getSprayChartData(id, 'overall'),
          getPlayerStrengthsWeaknesses(id),
          getWorstHoleAnalysis(id),
          getPlayerPatterns(id),
        ]);

      if (detailedRes.status === 'fulfilled') setDetailedStats(detailedRes.value);
      if (trendRes.status === 'fulfilled') setTrendData(trendRes.value);
      if (standingRes.status === 'fulfilled' && standingRes.value.success) {
        setStandingRows(standingRes.value.data ?? []);
      } else {
        setStandingRows([]);
      }
      if (leakRes.status === 'fulfilled' && leakRes.value.success) {
        setLeakMaps(leakRes.value.data ?? null);
      } else {
        setLeakMaps(null);
      }
      if (sprayRes.status === 'fulfilled') setSprayData(sprayRes.value);
      else setSprayData(null);
      if (swRes.status === 'fulfilled' && swRes.value) {
        setStrengths(swRes.value.strengths ?? []);
        setWeaknesses(swRes.value.weaknesses ?? []);
      } else {
        setStrengths([]);
        setWeaknesses([]);
      }
      if (worstRes.status === 'fulfilled') setWorstHoles(worstRes.value);
      else setWorstHoles(null);
      // CoachHelm patterns are a non-blocking enrichment — a failure (or a
      // CoachHelm-disabled player) just hides the section, never errors the page.
      if (patternsRes.status === 'fulfilled' && patternsRes.value.success) {
        setPatterns(patternsRes.value.patterns ?? []);
      } else {
        setPatterns([]);
      }

      const standingFailed =
        standingRes.status === 'rejected' || (standingRes.status === 'fulfilled' && !standingRes.value.success);
      const leakFailed = leakRes.status === 'rejected' || (leakRes.status === 'fulfilled' && !leakRes.value.success);
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
    void loadAll(playerId);
  }, [playerId, loadAll]);

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
      }),
    [detailedStats],
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
  const isColdStart = !loading && !loadError && !hasStanding && roundsAnalyzed === 0 && !hasLeak;

  if (loading) {
    return (
      <div className={cn('flex flex-col gap-6 min-[940px]:grid min-[940px]:grid-cols-[300px_1fr]', className)} aria-busy="true">
        <Skeleton className="h-[480px] rounded-fw-lg" />
        <Skeleton className="h-[480px] rounded-fw-lg" />
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
            <Button variant="secondary" size="sm" busy={loading} leftIcon={<RotateCw className="h-4 w-4" aria-hidden />} onClick={() => void loadAll(playerId)}>
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
          onRetryLeak={() => void loadAll(playerId)}
          retryingLeak={loading}
        />
      ),
    },
    { key: 'driving', node: <DrivingDrill detailedStats={detailedStats} sprayData={sprayData} /> },
    {
      key: 'approach',
      node: (
        <ApproachDrill
          detailedStats={detailedStats}
          leakMaps={leakMaps}
          leakError={leakError}
          onRetryLeak={() => void loadAll(playerId)}
          retryingLeak={loading}
        />
      ),
    },
    { key: 'short-game', node: <ShortGameDrill detailedStats={detailedStats} /> },
    { key: 'scoring', node: <ScoringDrill detailedStats={detailedStats} worstHoles={worstHoles} /> },
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
    { key: 'rounds', node: <RoundsDrill rounds={trendData?.rounds ?? []} /> },
  ];

  return (
    <div className={cn('flex flex-col gap-6 min-[940px]:grid min-[940px]:grid-cols-[300px_1fr] min-[940px]:items-start', className)}>
      <StatsSpine
        className="min-[940px]:sticky min-[940px]:top-20"
        sgTotal={sgTotal}
        scoringAverage={finite(detailedStats?.scoringAverage)}
        verdict={verdict}
        track={track}
        priorities={priorities}
        ledger={ledger}
      />
      <StageRouter param="area" homeKey="home" views={views} />
    </div>
  );
}
