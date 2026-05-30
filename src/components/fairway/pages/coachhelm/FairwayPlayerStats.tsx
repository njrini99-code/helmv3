'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · FairwayPlayerStats — the PLAYER stats cockpit (Batch 1b)
 * ----------------------------------------------------------------------------
 * The flag-on, single-player personal stats surface for /golf/dashboard/stats.
 * It answers the player's two questions — "where do I stand?" and "where am I
 * losing strokes?" — by JOINing + RENDERing three already-populated v3 sources
 * the legacy StatsClient never touches:
 *
 *   1. golf_player_standing  → the SG-vs-PGA hero + the standing matrix
 *      (via getPlayerStandingRows, Batch 0 / Item 0a)
 *   2. raw golf_shots putt-make% + approach-proximity leak maps
 *      (via getPuttMakeLeakMap / getApproachProximityLeakMap, Batch 0)
 *      rendered through the shared Fairway `LeakMap` dot-and-curve chart.
 *   3. getDetailedStats / getTrendAnalysis (REUSED UNCHANGED) → the cockpit
 *      tertiary readouts (rounds / fairways / GIR / putts), the scoring-average
 *      hero readout, the scoring-trend Ribbon, and the recent-rounds list.
 *
 * ── PLAYER RESOLUTION (mirrors the legacy StatsClient verbatim) ─────────────
 *   resolvedPlayerId = initialPlayerId (coach ?player= / row click) ??
 *                      golfUser.playerId (player-self).
 *   A coach viewing a teammate keeps a back link to the team roster
 *   (/golf/dashboard/stats); flag-off coach roster-grid behavior is UNCHANGED —
 *   this surface is the single-player view ONLY (V1 scope).
 *
 * ── HONESTY ─────────────────────────────────────────────────────────────────
 *   • 0 standing rows AND 0 rounds → ONE honest EmptyState (never a grid of
 *     fake zeros).
 *   • a missing standing row → that StandingStrip is omitted (never value 0).
 *   • a leak-map band with sample_n === 0 → the chart draws only the PGA
 *     reference point (no fabricated player value).
 *   • the SG hero / cockpit readouts read `awaiting` when starved.
 *
 * ADDITIVE + GATED — imported only behind the isRedesignEnabled() fork in
 * stats/page.tsx. Renders inside the `.fairway-ds` scope on a `bg-canvas` page.
 * Imports getDetailedStats / getTrendAnalysis UNCHANGED and reuses the Fairway
 * primitives + the shared LeakMap chart + the legacy StandingBar render config.
 * ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { fairwayScope } from '@/lib/redesign/flag';
import {
  InstrumentCluster,
  InstrumentPanel,
  Readout,
  Ribbon,
  type RibbonPoint,
  Surface,
  EmptyState,
  InsufficientData,
  Skeleton,
  InlineNotice,
  LeakMap,
  StandingStrip,
  type LeakMapBucket,
} from '@/components/fairway';
import { CoachHelmShell } from './CoachHelmShell';

// REUSED UNCHANGED loaders — the legacy detailed stats + trend analysis.
import { getDetailedStats, getTrendAnalysis } from '@/app/golf/actions/stats-data';
import type {
  TrendAnalysisResponse,
} from '@/app/golf/actions/stats-data-types';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';

// Batch-0 shared reads (gated by verifyPlayerAccess inside each export).
import {
  getPlayerLeakMaps,
  getPlayerStandingRows,
} from '@/app/golf/actions/stats-leak-maps';
import type {
  LeakBucket,
  PlayerLeakMaps,
  PlayerStandingRow,
} from '@/app/golf/actions/stats-leak-maps-types';

// Standing render config (direction / unit / scale / label) — the SAME source
// the live /my-standing route uses, so labels + scales stay consistent.
import {
  getMetricRenderConfig,
  type MetricRenderConfig,
} from '@/lib/coachhelm/v3/standing/metric-config';
import {
  METRIC_IDS,
  type MetricId,
} from '@/lib/coachhelm/v3/metrics/registry';

import { useGolfUser } from '@/contexts/golf-user-context';

/* ───────────────────────────────────────────────────────────────────────────
 * Category bucketing — copied from /my-standing/page.tsx:48-74 so the standing
 * matrix groups exactly the same way as the live route. (The helper is not
 * exported there; mirrored verbatim to avoid coupling a server page into a
 * client component.)
 * ────────────────────────────────────────────────────────────────────────── */
const CATEGORY_ORDER: ReadonlyArray<{
  category: string;
  label: string;
  description: string;
}> = [
  { category: 'sg',          label: 'Strokes Gained', description: 'Per-round vs field — Mark Broadie’s SG framework.' },
  { category: 'putting',     label: 'Putting',         description: 'Make % by distance and miss patterns.' },
  { category: 'approach',    label: 'Approach',        description: 'Proximity to hole + greens in regulation.' },
  { category: 'short_game',  label: 'Short Game',      description: 'Scrambling by lie type.' },
  { category: 'scoring',     label: 'Scoring',         description: 'Per-par scoring vs PGA + cohort.' },
  { category: 'course_mgmt', label: 'Course Mgmt',     description: 'Penalty avoidance + big-number rate.' },
  { category: 'pressure',    label: 'Pressure',        description: 'Tournament vs practice + opening-hole tax.' },
];

function metricCategory(metricId: string): string {
  if (metricId.startsWith('sg_')) return 'sg';
  if (metricId.startsWith('putts_made_') || metricId.startsWith('putt_miss_bias_')) return 'putting';
  if (metricId.startsWith('approach_') || metricId === 'gir_pct') return 'approach';
  if (metricId.startsWith('scrambling_')) return 'short_game';
  if (metricId.startsWith('scoring_par_')) return 'scoring';
  if (metricId === 'penalty_rate_per_round' || metricId === 'big_number_rate') return 'course_mgmt';
  if (metricId === 'practice_tournament_delta' || metricId === 'opening_hole_delta') return 'pressure';
  return 'sg';
}

/** The 5 SG headline metrics, in cockpit display order. */
const SG_METRICS = ['sg_total', 'sg_ott', 'sg_approach', 'sg_around_green', 'sg_putting'] as const;
const SG_SET = new Set<string>(SG_METRICS);

/* ───────────────────────────────────────────────────────────────────────────
 * Props — the page resolves the requested player id (coach ?player= or null for
 * player-self) and passes it through, exactly like the legacy StatsClient.
 * ────────────────────────────────────────────────────────────────────────── */
export interface FairwayPlayerStatsProps {
  initialPlayerId?: string | null;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────────────── */

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** Map a leak-map LeakBucket[] onto the shared chart's LeakMapBucket[]. */
function toChartBuckets(buckets: LeakBucket[]): LeakMapBucket[] {
  return buckets.map((b) => ({
    label: b.label,
    teamValue: b.team_value,
    pgaValue: b.pga_value,
    sampleN: b.sample_n,
  }));
}

/* ───────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

export function FairwayPlayerStats({ initialPlayerId = null }: FairwayPlayerStatsProps) {
  const golfUser = useGolfUser();

  // Player id resolution — mirrors stats-client.tsx:695-696. A coach viewing a
  // teammate passes the id via `initialPlayerId`; a player-self view falls back
  // to their own context id.
  const resolvedPlayerId = initialPlayerId || golfUser.playerId || null;
  const isCoachView = golfUser.role === 'coach';
  const playerName = isCoachView ? '' : golfUser.name;

  // ── State (client subtree; data fetched via server actions) ────────────────
  const [detailedStats, setDetailedStats] = useState<GolfStats | null>(null);
  const [trendData, setTrendData] = useState<TrendAnalysisResponse | null>(null);
  const [standingRows, setStandingRows] = useState<PlayerStandingRow[] | null>(null);
  const [leakMaps, setLeakMaps] = useState<PlayerLeakMaps | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadAll = useCallback(async (playerId: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const [detailedRes, trendRes, standingRes, leakRes] = await Promise.allSettled([
        getDetailedStats(playerId, 'overall'),
        getTrendAnalysis(playerId),
        getPlayerStandingRows(playerId),
        getPlayerLeakMaps(playerId),
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
      }

      // If every read failed, surface an honest error rather than a blank shell.
      if (
        detailedRes.status === 'rejected' &&
        trendRes.status === 'rejected' &&
        standingRes.status === 'rejected' &&
        leakRes.status === 'rejected'
      ) {
        setLoadError('Failed to load your stats. Please try again.');
      }
    } catch {
      setLoadError('Failed to load your stats. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!resolvedPlayerId) {
      setLoading(false);
      return;
    }
    void loadAll(resolvedPlayerId);
  }, [resolvedPlayerId, loadAll]);

  // ── Derived: standing rows keyed by metric_id ──────────────────────────────
  const standingByMetric = useMemo(() => {
    const map = new Map<string, PlayerStandingRow>();
    for (const row of standingRows ?? []) map.set(row.metric_id, row);
    return map;
  }, [standingRows]);

  const sgTotal = standingByMetric.get('sg_total') ?? null;

  // The non-SG standing matrix, bucketed by category (mirrors /my-standing).
  const matrixByCategory = useMemo(() => {
    const byCat = new Map<
      string,
      Array<{ id: MetricId; row: PlayerStandingRow; cfg: MetricRenderConfig }>
    >();
    for (const id of METRIC_IDS) {
      if (SG_SET.has(id)) continue; // SG metrics live in the cockpit, not the matrix
      const row = standingByMetric.get(id);
      if (!row) continue;
      const cfg = getMetricRenderConfig(id);
      if (!cfg) continue;
      const cat = metricCategory(id);
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push({ id, row, cfg });
    }
    return byCat;
  }, [standingByMetric]);

  // ── Honest cold-start: no standing rows AND no rounds analyzed ─────────────
  const roundsAnalyzed = detailedStats?.roundsPlayed ?? 0;
  const hasStanding = (standingRows?.length ?? 0) > 0;
  const hasLeak =
    !!leakMaps &&
    (leakMaps.putting.some((b) => b.sample_n > 0) ||
      leakMaps.approach.some((b) => b.sample_n > 0));
  const isColdStart =
    !loading && !hasStanding && roundsAnalyzed === 0 && !hasLeak;

  // Scoring-trend ribbon points off the REUSED getTrendAnalysis score series.
  const trendPoints = useMemo<RibbonPoint[]>(() => {
    const series = trendData?.trends.score ?? [];
    return series
      .filter((p) => finite(p.value) !== null)
      .map((p) => ({ x: p.date, y: p.value }));
  }, [trendData]);
  // A contextual benchmark line — the player's own recent 30-day scoring avg.
  const trendBenchmark = finite(trendData?.periodComparison.last30Days.scoringAvg);

  const title = isCoachView
    ? playerName
      ? `${playerName}'s stats`
      : 'Player stats'
    : 'Your stats';

  const backAction = isCoachView ? (
    <Link
      href="/golf/dashboard/stats"
      className="rounded-fw-sm font-fw-sans text-label font-medium text-text-secondary outline-none transition-colors duration-[180ms] hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
    >
      ← Team stats
    </Link>
  ) : undefined;

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-2 md:px-6">
        <CoachHelmShell
          active="players"
          role="player"
          eyebrow="Stats"
          title={title}
          description="Where you stand vs PGA Tour and your team — and where the strokes are leaking."
          actions={backAction}
        >
          {!resolvedPlayerId ? (
            <Surface padding="lg">
              <EmptyState
                title="No player selected"
                description="Pick a player from the team stats roster to see their personal stats."
                action={
                  <Link
                    href="/golf/dashboard/stats"
                    className="font-fw-sans text-label font-medium text-accent-600 hover:text-accent-700"
                  >
                    Back to team stats
                  </Link>
                }
              />
            </Surface>
          ) : loading ? (
            <StatsLoading />
          ) : loadError ? (
            <Surface padding="lg">
              <InlineNotice tone="danger" title="Couldn’t load stats">
                {loadError}
              </InlineNotice>
            </Surface>
          ) : isColdStart ? (
            <Surface padding="lg">
              <EmptyState
                title="More rounds needed"
                description="Log 5+ rounds and you’ll see your strokes-gained standing vs PGA Tour and your team, plus your putting and approach leak maps."
                action={
                  !isCoachView ? (
                    <Link
                      href="/golf/dashboard/rounds/new"
                      className="font-fw-sans text-label font-medium text-accent-600 hover:text-accent-700"
                    >
                      Start a round
                    </Link>
                  ) : undefined
                }
              />
            </Surface>
          ) : (
            <div className="flex flex-col gap-10">
              {/* ════════════════ THE COCKPIT — SG + the four key readouts ════ */}
              <InstrumentCluster
                ariaLabel="Your stats cockpit"
                balance="focal"
                tertiaryColumns={4}
                primary={<SgHeroInstrument sgTotal={sgTotal} detailedStats={detailedStats} />}
                secondary={[
                  <SgGridInstrument key="sg-grid" standingByMetric={standingByMetric} />,
                ]}
                tertiary={[
                  <RoundsReadout key="rounds" detailedStats={detailedStats} />,
                  <FairwaysReadout key="fairways" detailedStats={detailedStats} />,
                  <GirReadout key="gir" detailedStats={detailedStats} />,
                  <PuttsReadout key="putts" detailedStats={detailedStats} />,
                ]}
              />

              {/* Truncation notice — getDetailedStats hit the recent-rounds cap. */}
              {detailedStats?.truncated ? (
                <InlineNotice tone="warning" title="Showing your most recent rounds">
                  Stats below reflect the most recent 100 rounds. Older rounds are
                  not included in this view.
                </InlineNotice>
              ) : null}

              {/* ════════════════ LEAK MAPS — the analytical core ═════════════ */}
              <section className="flex flex-col gap-3">
                <h3 className="px-1 font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
                  Where the strokes leak
                </h3>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <LeakMap
                    title="Putt make %"
                    overline="Putting"
                    subtitle="Make rate by distance vs PGA Tour"
                    takeaway="Bands below the dashed Tour line are where putts are leaking."
                    direction="higher_better"
                    unit="percent"
                    data={leakMaps ? toChartBuckets(leakMaps.putting) : []}
                  />
                  <LeakMap
                    title="Approach proximity"
                    overline="Approach"
                    subtitle="Average proximity to the hole by approach distance vs PGA Tour"
                    takeaway="Bands above the dashed Tour line leave you farther from the hole than Tour."
                    direction="lower_better"
                    unit="feet"
                    data={leakMaps ? toChartBuckets(leakMaps.approach) : []}
                  />
                </div>
              </section>

              {/* ════════════════ SCORING TREND — reused getTrendAnalysis ═════ */}
              <section className="flex flex-col gap-3">
                <h3 className="px-1 font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
                  Scoring trend
                </h3>
                <Ribbon
                  title="Score by round"
                  overline="Trend"
                  takeaway="Your scoring trace across logged rounds, with your 30-day average as the benchmark."
                  data={trendPoints}
                  benchmark={
                    trendBenchmark != null
                      ? { value: trendBenchmark, label: '30-day avg' }
                      : undefined
                  }
                  seriesName="Score"
                  valueFormatter={(v) => v.toFixed(1)}
                />
              </section>

              {/* ════════════════ STANDING MATRIX — non-SG metrics ═══════════ */}
              {hasStanding ? (
                <section className="flex flex-col gap-6">
                  <h3 className="px-1 font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
                    How you stack up
                  </h3>
                  {CATEGORY_ORDER.filter(
                    (g) => (matrixByCategory.get(g.category) ?? []).length > 0,
                  ).map((group) => {
                    const rows = matrixByCategory.get(group.category) ?? [];
                    return (
                      <div key={group.category} className="flex flex-col gap-3">
                        <div className="px-1">
                          <h4 className="font-fw-sans text-body font-medium text-text-primary">
                            {group.label}
                          </h4>
                          <p className="font-fw-sans text-caption text-text-tertiary">
                            {group.description}
                          </p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          {rows.map(({ id, row, cfg }) => (
                            <StandingStrip
                              key={id}
                              metric_id={id}
                              metric_label={cfg.display_label}
                              player_value={row.player_value}
                              team_avg={row.team_avg}
                              team_n={row.team_n}
                              team_pct={row.team_pct}
                              pga_value={row.pga_value}
                              direction={cfg.direction}
                              unit={cfg.unit}
                              scale={cfg.default_scale}
                              size="card"
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </section>
              ) : null}

              {/* ════════════════ RECENT ROUNDS — reused trend rounds list ════ */}
              {trendData && trendData.rounds.length > 0 ? (
                <RecentRounds rounds={trendData.rounds} />
              ) : null}
            </div>
          )}
        </CoachHelmShell>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * PRIMARY — the SG-vs-PGA hero. A StandingStrip read of SG: Total when the
 * standing row exists (You vs team vs PGA on a matte track), paired with a big
 * Fragment-Mono scoring-average readout from the reused getDetailedStats. Honest
 * awaiting when there is no sg_total standing row yet.
 * ══════════════════════════════════════════════════════════════════════════ */
function SgHeroInstrument({
  sgTotal,
  detailedStats,
}: {
  sgTotal: PlayerStandingRow | null;
  detailedStats: GolfStats | null;
}) {
  const sgCfg = getMetricRenderConfig('sg_total');
  const scoringAvg = finite(detailedStats?.scoringAverage);

  return (
    <InstrumentPanel
      depth="raised"
      tone="accent"
      padding="lg"
      eyebrow="Strokes Gained"
      header="SG: Total vs PGA Tour"
      as="section"
      className="flex h-full flex-col gap-6"
    >
      {sgTotal && sgCfg ? (
        <StandingStrip
          metric_id="sg_total"
          metric_label={sgCfg.display_label}
          player_value={sgTotal.player_value}
          team_avg={sgTotal.team_avg}
          team_n={sgTotal.team_n}
          team_pct={sgTotal.team_pct}
          pga_value={sgTotal.pga_value}
          direction={sgCfg.direction}
          unit={sgCfg.unit}
          scale={sgCfg.default_scale}
          size="card"
        />
      ) : (
        <InsufficientData
          compact
          title="SG standing warming up"
          description="Your strokes-gained standing fills in once you’ve logged 5+ rounds with shot detail."
          unit="rounds"
        />
      )}

      {/* Scoring-average read — straight off the reused getDetailedStats. */}
      <InstrumentPanel depth="inset" padding="sm">
        <Readout
          value={scoringAvg ?? undefined}
          format={{ maximumFractionDigits: 1 }}
          label="Scoring average"
          size="lg"
          state={scoringAvg != null ? 'live' : 'awaiting'}
          samples={scoringAvg != null ? undefined : { have: detailedStats?.roundsPlayed ?? 0, need: 1 }}
          awaitingLabel="No completed rounds"
        />
      </InstrumentPanel>
    </InstrumentPanel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * SECONDARY — the four non-total SG categories as a 2×2 StandingStrip grid.
 * Each strip is omitted when its standing row is missing (never a fake 0). When
 * none exist, the panel reads an honest awaiting state.
 * ─────────────────────────────────────────────────────────────────────────── */
function SgGridInstrument({
  standingByMetric,
}: {
  standingByMetric: Map<string, PlayerStandingRow>;
}) {
  const items = useMemo(
    () =>
      (['sg_ott', 'sg_approach', 'sg_around_green', 'sg_putting'] as const)
        .map((id) => {
          const row = standingByMetric.get(id);
          const cfg = getMetricRenderConfig(id);
          return row && cfg ? { id, row, cfg } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    [standingByMetric],
  );

  return (
    <InstrumentPanel depth="base" header="SG by category" className="flex h-full flex-col gap-3">
      {items.length > 0 ? (
        <div className="grid grid-cols-1 gap-3">
          {items.map(({ id, row, cfg }) => (
            <StandingStrip
              key={id}
              metric_id={id}
              metric_label={cfg.display_label}
              player_value={row.player_value}
              team_avg={row.team_avg}
              team_n={row.team_n}
              team_pct={row.team_pct}
              pga_value={row.pga_value}
              direction={cfg.direction}
              unit={cfg.unit}
              scale={cfg.default_scale}
              size="inline"
              show_cohort_text={false}
            />
          ))}
        </div>
      ) : (
        <InsufficientData
          compact
          title="SG breakdown warming up"
          description="Off-the-tee, approach, around-green, and putting standings appear as you log rounds."
          unit="rounds"
        />
      )}
    </InstrumentPanel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * TERTIARY MICRO-READOUTS — sourced from the REUSED getDetailedStats GolfStats.
 * Each reads honest live/awaiting (never a fabricated 0).
 * ─────────────────────────────────────────────────────────────────────────── */
function RoundsReadout({ detailedStats }: { detailedStats: GolfStats | null }) {
  const rounds = detailedStats?.roundsPlayed ?? 0;
  return (
    <InstrumentPanel depth="base" padding="md" className="h-full">
      <Readout
        value={rounds}
        format={{ maximumFractionDigits: 0 }}
        label="Rounds analyzed"
        size="md"
        state={rounds > 0 ? 'live' : 'awaiting'}
        samples={rounds === 0 ? { have: 0, need: 1 } : undefined}
        awaitingLabel="None yet"
      />
    </InstrumentPanel>
  );
}

function FairwaysReadout({ detailedStats }: { detailedStats: GolfStats | null }) {
  const pct = finite(detailedStats?.fairwayPercentage);
  const opps = detailedStats?.fairwayOpportunities ?? 0;
  return (
    <InstrumentPanel depth="base" padding="md" className="h-full">
      <Readout
        value={pct ?? undefined}
        format={{ maximumFractionDigits: 0 }}
        unit="%"
        label="Fairways"
        size="md"
        state={pct != null && opps > 0 ? 'live' : 'awaiting'}
        samples={pct != null && opps > 0 ? undefined : { have: 0, need: 1 }}
        awaitingLabel="No tee shots"
      />
    </InstrumentPanel>
  );
}

function GirReadout({ detailedStats }: { detailedStats: GolfStats | null }) {
  const pct = finite(detailedStats?.girPercentage);
  const opps = detailedStats?.girOpportunities ?? 0;
  return (
    <InstrumentPanel depth="base" padding="md" className="h-full">
      <Readout
        value={pct ?? undefined}
        format={{ maximumFractionDigits: 0 }}
        unit="%"
        label="GIR"
        size="md"
        state={pct != null && opps > 0 ? 'live' : 'awaiting'}
        samples={pct != null && opps > 0 ? undefined : { have: 0, need: 1 }}
        awaitingLabel="No approaches"
      />
    </InstrumentPanel>
  );
}

function PuttsReadout({ detailedStats }: { detailedStats: GolfStats | null }) {
  const perRound = finite(detailedStats?.puttsPerRound);
  const putts = detailedStats?.totalPutts ?? 0;
  return (
    <InstrumentPanel depth="base" padding="md" className="h-full">
      <Readout
        value={perRound ?? undefined}
        format={{ maximumFractionDigits: 1 }}
        label="Putts / round"
        size="md"
        state={perRound != null && putts > 0 ? 'live' : 'awaiting'}
        samples={perRound != null && putts > 0 ? undefined : { have: 0, need: 1 }}
        awaitingLabel="No putts"
      />
    </InstrumentPanel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * RECENT ROUNDS — restyled in Fairway tokens off the reused getTrendAnalysis
 * rounds (RoundTrendData[]). Links to each round detail.
 * ─────────────────────────────────────────────────────────────────────────── */
function RecentRounds({
  rounds,
}: {
  rounds: TrendAnalysisResponse['rounds'];
}) {
  // getTrendAnalysis returns rounds oldest→newest; show the most recent first.
  const recent = useMemo(() => [...rounds].slice(-10).reverse(), [rounds]);

  return (
    <section className="flex flex-col gap-3">
      <h3 className="px-1 font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
        Recent rounds
      </h3>
      <div className="flex flex-col gap-2">
        {recent.map((round) => {
          const toPar = round.toPar ?? 0;
          const toneClass =
            toPar < 0 ? 'text-accent-600' : toPar > 0 ? 'text-danger' : 'text-text-secondary';
          const formattedDate = new Date(round.date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          });
          return (
            <Link
              key={round.id}
              href={`/golf/dashboard/rounds/${round.id}`}
              className="group flex items-center gap-4 rounded-card border border-border-subtle bg-surface px-4 py-3 outline-none transition-colors duration-[180ms] hover:bg-surface-tint focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
            >
              <span
                className={`grid h-11 w-11 flex-shrink-0 place-items-center rounded-fw-md bg-inset font-fw-mono text-body font-medium tabular-nums ${toneClass}`}
              >
                {round.score ?? '--'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
                    {round.courseName || 'Unknown course'}
                  </span>
                  {round.roundType ? (
                    <span className="rounded-full bg-inset px-1.5 py-0.5 font-fw-sans text-eyebrow font-medium capitalize text-text-tertiary">
                      {round.roundType.replace(/_/g, ' ')}
                    </span>
                  ) : null}
                </span>
                <span className="block font-fw-sans text-caption text-text-tertiary">{formattedDate}</span>
              </span>
              <span className={`font-fw-mono text-body-sm font-medium tabular-nums ${toneClass}`}>
                {toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : toPar}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Loading — matte skeleton that mirrors the cockpit + leak-map shape.
 * ─────────────────────────────────────────────────────────────────────────── */
function StatsLoading() {
  return (
    <div className="flex flex-col gap-10" aria-busy="true">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_minmax(15rem,1fr)]">
        <Skeleton className="h-64 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-card" />
        <Skeleton className="h-72 rounded-card" />
      </div>
    </div>
  );
}

export default FairwayPlayerStats;
