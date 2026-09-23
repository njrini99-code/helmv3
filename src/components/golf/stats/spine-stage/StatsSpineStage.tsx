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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { RotateCw } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Surface, Button, Combobox, EmptyState, Eyebrow, InlineNotice, Skeleton, Select } from '@/components/fairway';
import { RoundStatReport } from '@/components/golf/stats/round-report/RoundStatReport';

// Same lazy-load treatment the sibling drills give it — the spray field pulls
// in the chart runtime, and the career stage must not pay for it.
const SprayField = dynamic(
  () => import('@/components/fairway/charts/SprayField').then((m) => m.SprayField),
  { ssr: false, loading: () => <Skeleton className="h-[260px] rounded-fw-lg" /> },
);
import { StageRouter } from '@/components/fairway/modules';
import type { StageView } from '@/components/fairway/modules';

import { getPlayerStatsDashboardBundle } from '@/app/golf/actions/stats-dashboard';
import { getPlayerRoundOptions } from '@/app/golf/actions/stats-data';
import { getPlayerLeakMaps } from '@/app/golf/actions/stats-leak-maps';
import type {
  TrendAnalysisResponse,
  SprayChartResponse,
  WorstHoleResponse,
  RoundOption,
  StatsRoundScope,
} from '@/app/golf/actions/stats-data-types';
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

/**
 * `round_date` is a plain YYYY-MM-DD calendar date. Parsing it with `new
 * Date()` resolves midnight UTC and then renders in the VIEWER's zone, which
 * shows the previous day for anyone west of Greenwich. Split it instead.
 *
 * Module scope, not inlined in the picker's `useMemo`: the scoped-round report
 * header needs the same formatting, and two copies of a date rule is how the
 * two of them end up disagreeing about which day a round was played.
 */
function formatRoundDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${Number(m)}/${Number(d)}/${y.slice(2)}` : iso;
}

const MAX_SELECTED_STATS_ROUNDS = 100;

function roundOptionLabel(round: RoundOption): string {
  return [
    formatRoundDate(round.date),
    round.courseName,
    round.totalScore !== null ? `(${round.totalScore})` : null,
    round.qualifierRoundNumber !== null ? `Qualifier ${round.qualifierRoundNumber}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
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
  // A02/A06: `loading` blanks the WHOLE spine+stage region. It may therefore
  // only be set when there is nothing on screen worth preserving — the first
  // load for a player. Two narrower flags cover the cases where usable content
  // is already rendered and must survive:
  //   scopeLoading — the round-scope picker changed. Only detailedStats and
  //     sprayData actually depend on roundId; standing, trends and patterns are
  //     cross-round and stay valid, so replacing the page with a skeleton
  //     discards seven still-good reads to refresh two.
  //   leakLoading  — the Approach/Putting leak maps are being retried ALONE.
  const [scopeLoading, setScopeLoading] = useState(false);
  const [leakLoading, setLeakLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Round scope. 'overall' is the career aggregate this page has always shown;
  // an explicit array is an owned, coach-adjustable round set. The server
  // verifies it against this player's completed rounds before reading shots.
  const [roundOptions, setRoundOptions] = useState<RoundOption[]>([]);
  // Distinguishes "this player has no rounds" (hide the picker — nothing to
  // pick) from "the round list failed to load" (say so). Same distinction
  // `leakError` makes for the leak maps.
  const [roundOptionsError, setRoundOptionsError] = useState(false);
  const [roundScope, setRoundScope] = useState<StatsRoundScope>('overall');
  const [qualifierPresetId, setQualifierPresetId] = useState('');

  const loadAll = useCallback(async (id: string, roundId: StatsRoundScope, opts?: { quiet?: boolean }) => {
    // `quiet` keeps the currently-rendered page mounted and marks only the
    // scope-dependent regions as refreshing. See the scopeLoading comment.
    if (opts?.quiet) setScopeLoading(true);
    else setLoading(true);
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
      setScopeLoading(false);
    }
  }, []);

  /**
   * Retry ONLY the leak maps.
   *
   * This used to be `() => void loadAll(...)` — the same all-eight-reads
   * loader used on mount — so retrying one failed optional section threw away
   * the entire visible page (spine, bento, every drill) and refetched seven
   * healthy reads behind a full-page skeleton, a worst case of roughly 15s of
   * server timeout budget to recover one 10s read. It now calls the one action
   * that failed and patches only `leakMaps`/`leakError`.
   */
  const retryLeakMaps = useCallback(async (id: string) => {
    setLeakLoading(true);
    try {
      const res = await getPlayerLeakMaps(id);
      if (res.success) {
        setLeakMaps(res.data ?? null);
        setLeakError(false);
      } else {
        setLeakError(true);
      }
    } catch {
      setLeakError(true);
    } finally {
      setLeakLoading(false);
    }
  }, []);

  // Which player the mounted content belongs to. A scope change re-reads for
  // the SAME player, so there is usable content to preserve and the reload is
  // quiet; a first mount (or a different player) has nothing on screen, so it
  // takes the full skeleton.
  const loadedForPlayerRef = useRef<string | null>(null);

  useEffect(() => {
    const quiet = loadedForPlayerRef.current === playerId;
    loadedForPlayerRef.current = playerId;
    void loadAll(playerId, roundScope, { quiet });
  }, [playerId, roundScope, loadAll]);

  // Round list for the scope picker. Loaded once per player and independent of
  // the stats bundle: a failure here costs the picker, never the page.
  useEffect(() => {
    let cancelled = false;
    setRoundScope('overall');
    setQualifierPresetId('');
    setRoundOptionsError(false);
    void (async () => {
      try {
        const rounds = await getPlayerRoundOptions(playerId);
        if (cancelled) return;
        // null means the read failed; [] means the player has no rounds.
        setRoundOptions(rounds ?? []);
        setRoundOptionsError(rounds === null);
      } catch {
        if (!cancelled) {
          setRoundOptions([]);
          setRoundOptionsError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const selectedRoundIds = useMemo(
    () => (Array.isArray(roundScope) ? roundScope : []),
    [roundScope],
  );
  const selectedRounds = useMemo(
    () => roundOptions.filter((round) => selectedRoundIds.includes(round.id)),
    [roundOptions, selectedRoundIds],
  );
  const roundScopeOptions = useMemo(
    () => roundOptions.map((round) => ({
      value: round.id,
      label: roundOptionLabel(round),
      disabled: selectedRoundIds.length >= MAX_SELECTED_STATS_ROUNDS && !selectedRoundIds.includes(round.id),
    })),
    [roundOptions, selectedRoundIds],
  );
  const qualifierOptions = useMemo(() => {
    const grouped = new Map<string, { label: string; roundIds: string[] }>();
    for (const round of roundOptions) {
      if (round.roundType !== 'qualifier' || !round.qualifierId) continue;
      const existing = grouped.get(round.qualifierId);
      if (existing) {
        existing.roundIds.push(round.id);
      } else {
        grouped.set(round.qualifierId, {
          label: round.qualifierName ?? 'Qualifier',
          roundIds: [round.id],
        });
      }
    }
    return Array.from(grouped, ([value, qualifier]) => ({
      value,
      label: `${qualifier.label} · ${qualifier.roundIds.length} round${qualifier.roundIds.length === 1 ? '' : 's'}`,
      roundIds: qualifier.roundIds,
    }));
  }, [roundOptions]);

  const handleRoundSelectionChange = useCallback((ids: string[]) => {
    setQualifierPresetId('');
    setRoundScope(Array.from(new Set(ids)).slice(0, MAX_SELECTED_STATS_ROUNDS));
  }, []);

  const handleQualifierPresetChange = useCallback((qualifierId: string | null) => {
    const preset = qualifierOptions.find((option) => option.value === qualifierId);
    if (!preset) {
      setQualifierPresetId('');
      return;
    }
    setQualifierPresetId(preset.value);
    setRoundScope(preset.roundIds.slice(0, MAX_SELECTED_STATS_ROUNDS));
  }, [qualifierOptions]);

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
    roundScope === 'overall' && !loading && !loadError && !hasStanding && roundsAnalyzed === 0 && !hasLeak;

  /**
   * The round-scope picker.
   *
   * Rendered ABOVE the loading branch on purpose. A qualifier is a preset for
   * that player's actual completed rounds, never a second statistical filter;
   * coaches can then remove or add any round in the same control.
   */
  const roundPicker = roundOptionsError ? (
    <InlineNotice tone="warning" title="Couldn't load this player's rounds">
      The stats below cover every round. Reload to try selecting a round set.
    </InlineNotice>
  ) : roundOptions.length > 0 ? (
      <div className="flex flex-col gap-2.5" data-slot="stats-round-scope">
        <div className="flex flex-wrap items-center gap-2">
          <span id="stats-round-scope-label" className="text-fw-sm text-text-secondary">
            Stats for
          </span>
          <Button
            variant={roundScope === 'overall' ? 'primary' : 'secondary'}
            size="sm"
            aria-pressed={roundScope === 'overall'}
            disabled={loading || scopeLoading}
            onClick={() => {
              setQualifierPresetId('');
              setRoundScope('overall');
            }}
          >
            All rounds
          </Button>
          {qualifierOptions.length > 0 ? (
            <Select
              aria-label="Load a qualifier's rounds"
              size="sm"
              className="min-w-0 w-full sm:w-[17rem]"
              placeholder="Load qualifier rounds…"
              value={qualifierPresetId}
              disabled={loading || scopeLoading}
              onValueChange={handleQualifierPresetChange}
              options={qualifierOptions}
            />
          ) : null}
          {scopeLoading ? (
            <span role="status" className="text-fw-sm text-text-tertiary">
              Updating…
            </span>
          ) : null}
        </div>
        <Combobox
          multiple
          aria-label="Select rounds for stats"
          size="sm"
          className="min-h-11"
          placeholder="Add or remove individual rounds…"
          emptyMessage="No matching rounds"
          options={roundScopeOptions}
          value={selectedRoundIds}
          disabled={loading || scopeLoading}
          onValueChange={handleRoundSelectionChange}
        />
        <p className="font-fw-sans text-caption text-text-tertiary">
          {roundScope === 'overall'
            ? 'Every completed round is included.'
            : selectedRounds.length === 0
              ? 'Choose one or more completed rounds to compare.'
              : `${selectedRounds.length} selected round${selectedRounds.length === 1 ? '' : 's'}.`}
        </p>
      </div>
    ) : null;

  if (loading) {
    return (
      <div className={cn('flex flex-col gap-4', className)} aria-busy="true">
        {roundPicker}
        <div className="flex flex-col gap-6 min-[940px]:grid min-[940px]:grid-cols-[300px_1fr] min-[940px]:items-start">
          <Skeleton className="h-[480px] rounded-fw-lg min-[940px]:sticky min-[940px]:top-20" />
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
            <Button variant="secondary" size="sm" busy={loading} leftIcon={<RotateCw className="h-4 w-4" aria-hidden />} onClick={() => void loadAll(playerId, roundScope)}>
              Try again
            </Button>
          }
        >
          {loadError}
        </InlineNotice>
      </Surface>
    );
  }

  /**
   * SCOPED TO A ROUND SET — the formal report replaces the career stage.
   * Team standing, trends, leak maps, and CoachHelm patterns remain career
   * evidence by construction; showing them beside an arbitrary selection
   * would mix two scopes in one visual hierarchy.
   */
  if (roundScope !== 'overall') {
    if (selectedRounds.length === 0) {
      return (
        <div className={cn('flex flex-col gap-4', className)}>
          {roundPicker}
          <Surface padding="lg">
            <InlineNotice tone="info" title="Choose rounds to view stats">
              Select one or more completed rounds above. A qualifier loads its rounds as a starting set,
              and you can adjust that set before reviewing it.
            </InlineNotice>
          </Surface>
        </div>
      );
    }

    const isSingleRound = selectedRounds.length === 1;
    const selectedRound = selectedRounds[0]!;
    const subtitle = isSingleRound
      ? [
          formatRoundDate(selectedRound.date),
          selectedRound.courseName,
          selectedRound.totalScore !== null ? `${selectedRound.totalScore} strokes` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : `${selectedRounds.length} selected completed rounds`;

    return (
      <div className={cn('flex flex-col gap-4', className)}>
        {roundPicker}
        {detailedStats ? (
          <RoundStatReport
            stats={detailedStats}
            title={isSingleRound ? 'Round stats' : 'Selected-round stats'}
            subtitle={subtitle}
            scope={isSingleRound ? 'single' : 'selection'}
          />
        ) : (
          <Surface padding="lg">
            <InlineNotice
              tone="danger"
              title={isSingleRound ? "Couldn't load this round's stats" : "Couldn't load these rounds' stats"}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  busy={loading}
                  leftIcon={<RotateCw className="h-4 w-4" aria-hidden />}
                  onClick={() => void loadAll(playerId, roundScope)}
                >
                  Try again
                </Button>
              }
            >
              Switch back to All rounds to keep working, or retry this selection.
            </InlineNotice>
          </Surface>
        )}
        {/* Gated on a shot actually being plottable, not merely on the read
            succeeding: a scorecard-only round returns a well-formed response
            with zero points, and an empty "Shot pattern" surface sitting under
            the report's own "no shot detail" notice says the same nothing
            twice. */}
        {sprayData && sprayData.driving.plottedShots + sprayData.approach.plottedShots > 0 ? (
          <Surface padding="lg">
            <div className="flex flex-col gap-4">
              <div>
                <Eyebrow as="h3" tone="accent">
                  Shot pattern
                </Eyebrow>
                <p className="mt-1 font-fw-sans text-caption text-text-tertiary">
                  Where {isSingleRound ? "this round's" : 'these rounds\''} tee shots and approaches finished.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <SprayField group={sprayData.driving} family="driving" compact />
                <SprayField group={sprayData.approach} family="approach" compact />
              </div>
            </div>
          </Surface>
        ) : null}
        <p className="font-fw-sans text-caption text-text-tertiary">
          Team standing, 30-day trends and the strokes-gained leak maps are not shown here — they are
          career measures, not measures of this selected round set.
          Switch back to <span className="text-text-secondary">All rounds</span> for those.
        </p>
      </div>
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
          onRetryLeak={() => void retryLeakMaps(playerId)}
          retryingLeak={leakLoading}
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
          onRetryLeak={() => void retryLeakMaps(playerId)}
          retryingLeak={leakLoading}
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
    <div className={cn('flex flex-col gap-4', className)} aria-busy={scopeLoading || undefined}>
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
          viewerContext={standingViewerContext}
          playerName={playerName}
        />
        <div className="flex min-w-0 flex-col gap-4">
          {/* A scoped selection never reaches this career branch. */}
          {detailedStats?.truncated ? (
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
