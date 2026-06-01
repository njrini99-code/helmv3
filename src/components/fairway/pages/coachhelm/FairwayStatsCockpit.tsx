'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · FairwayStatsCockpit — the shared stats BODY
 * ----------------------------------------------------------------------------
 * The single, re-architected strokes-gained stats surface, shared by BOTH:
 *   • the player's own  /golf/dashboard/stats   (wrapped in CoachHelmShell by
 *     FairwayPlayerStats), and
 *   • the coach's roster drill-down  /golf/dashboard/roster/[id]  (wrapped in a
 *     roster identity header by FairwayPlayerProfile).
 *
 * It owns the data fetch (keyed by the playerId it is handed) and the honest
 * load / error / cold-start / empty states. It renders NO page chrome of its
 * own — the consumer supplies the masthead — so the same beautiful body powers
 * both roles with no double-nav.
 *
 * ── DATA (all REUSED VERBATIM, gated per-export by verifyPlayerAccess) ───────
 *   getDetailedStats / getTrendAnalysis      → scoring avg, vitals, trend, rounds
 *   getPlayerStandingRows                     → SG hero + SG-by-category + matrix
 *   getPlayerLeakMaps                         → putt-make% / approach-proximity
 *
 * ── ORGANIZATION (Verdict → Vitals → Diagnosis → Detail → Trajectory →
 *    Depth → Source) ─────────────────────────────────────────────────────────
 *   1. VERDICT      SG: Total vs PGA + scoring avg + a synthesized plain-English
 *                   read (biggest strength / biggest leak, derived from the data).
 *   2. VITALS       Rounds · Fairways · GIR · Putts/round (clean 4-up).
 *   3. STROKES GAINED  the four SG categories as comparison cards, with derived
 *                   "biggest gain / biggest leak" callouts.
 *   4. LEAK MAPS    putt make % + approach proximity vs PGA Tour.
 *   5. TREND        score by round vs the 30-day average.
 *   6. DETAILED STANDINGS  the heavy 6-category matrix, collapsed by default.
 *   7. RECENT ROUNDS  links to each round review.
 *
 * ── HONESTY ──────────────────────────────────────────────────────────────────
 *   0 standing rows AND 0 rounds → ONE EmptyState (never a grid of fake zeros).
 *   missing standing row → that strip is omitted (never value 0).
 *   leak band with sample_n === 0 → only the PGA reference point is drawn.
 *   starved hero / vitals read `awaiting`.
 *
 * ADDITIVE — extracted from the former monolithic FairwayPlayerStats so the body
 * can be re-used by the coach roster route without the CoachHelm sub-nav.
 * ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Sparkles, ArrowRight, TrendingDown, TrendingUp } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
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
  BarCompare,
  StandingStrip,
  type LeakMapBucket,
} from '@/components/fairway';

// REUSED UNCHANGED loaders — the legacy detailed stats + trend analysis.
import { getDetailedStats, getTrendAnalysis } from '@/app/golf/actions/stats-data';
import type { TrendAnalysisResponse } from '@/app/golf/actions/stats-data-types';
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

// Standing render config — the SAME source the live /my-standing route uses.
import {
  getMetricRenderConfig,
  type MetricRenderConfig,
} from '@/lib/coachhelm/v3/standing/metric-config';
import { METRIC_IDS, type MetricId } from '@/lib/coachhelm/v3/metrics/registry';

// CoachHelm cause/effect — REUSED VERBATIM. Returns the player's mined patterns
// (cause = description, effect = strokeImpact, fix = recommendation), gated by
// verifyPlayerAccess + isCoachHelmEnabledForPlayer inside the action.
import { getPlayerPatterns } from '@/app/golf/actions/insights';
type CoachHelmPattern = NonNullable<
  Awaited<ReturnType<typeof getPlayerPatterns>>['patterns']
>[number];

/* ───────────────────────────────────────────────────────────────────────────
 * Category bucketing — mirrors /my-standing/page.tsx so the detailed matrix
 * groups exactly the same way as the live route.
 * ────────────────────────────────────────────────────────────────────────── */
const CATEGORY_ORDER: ReadonlyArray<{
  category: string;
  label: string;
  description: string;
}> = [
  { category: 'putting',     label: 'Putting',      description: 'Make % by distance and miss patterns.' },
  { category: 'approach',    label: 'Approach',     description: 'Proximity to hole + greens in regulation.' },
  { category: 'short_game',  label: 'Short Game',   description: 'Scrambling by lie type.' },
  { category: 'scoring',     label: 'Scoring',      description: 'Per-par scoring vs PGA + cohort.' },
  { category: 'course_mgmt', label: 'Course Mgmt',  description: 'Penalty avoidance + big-number rate.' },
  { category: 'pressure',    label: 'Pressure',     description: 'Tournament vs practice + opening-hole tax.' },
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

/** The four non-total SG categories, in cockpit display order. */
const SG_CATEGORIES = ['sg_ott', 'sg_approach', 'sg_around_green', 'sg_putting'] as const;
const SG_SET = new Set<string>(['sg_total', ...SG_CATEGORIES]);

/* ───────────────────────────────────────────────────────────────────────────
 * Props — the consumer hands a resolved playerId. (No useGolfUser here; the
 * shell/header that wraps the cockpit owns identity + role.)
 * ────────────────────────────────────────────────────────────────────────── */
export interface FairwayStatsCockpitProps {
  playerId: string;
  className?: string;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────────────── */

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function toChartBuckets(buckets: LeakBucket[]): LeakMapBucket[] {
  return buckets.map((b) => ({
    label: b.label,
    teamValue: b.team_value,
    pgaValue: b.pga_value,
    sampleN: b.sample_n,
  }));
}

/** Signed strokes-gained, e.g. "+0.42" / "−0.31" / "E". */
function formatSg(value: number | null): string {
  if (value === null) return '—';
  if (value === 0) return 'E';
  const fixed = Math.abs(value).toFixed(2);
  return value > 0 ? `+${fixed}` : `−${fixed}`;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

export function FairwayStatsCockpit({ playerId, className }: FairwayStatsCockpitProps) {
  const [detailedStats, setDetailedStats] = useState<GolfStats | null>(null);
  const [trendData, setTrendData] = useState<TrendAnalysisResponse | null>(null);
  const [standingRows, setStandingRows] = useState<PlayerStandingRow[] | null>(null);
  const [leakMaps, setLeakMaps] = useState<PlayerLeakMaps | null>(null);
  const [patterns, setPatterns] = useState<CoachHelmPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showDetailed, setShowDetailed] = useState(false);

  const loadAll = useCallback(async (id: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const [detailedRes, trendRes, standingRes, leakRes, patternsRes] = await Promise.allSettled([
        getDetailedStats(id, 'overall'),
        getTrendAnalysis(id),
        getPlayerStandingRows(id),
        getPlayerLeakMaps(id),
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
      }
      // CoachHelm patterns are a non-blocking enrichment — a failure (or a
      // CoachHelm-disabled player) just hides the section, never errors the page.
      if (patternsRes.status === 'fulfilled' && patternsRes.value.success) {
        setPatterns(patternsRes.value.patterns ?? []);
      } else {
        setPatterns([]);
      }

      if (
        detailedRes.status === 'rejected' &&
        trendRes.status === 'rejected' &&
        standingRes.status === 'rejected' &&
        leakRes.status === 'rejected'
      ) {
        setLoadError('Failed to load stats. Please try again.');
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

  // ── Derived: standing rows keyed by metric_id ──────────────────────────────
  const standingByMetric = useMemo(() => {
    const map = new Map<string, PlayerStandingRow>();
    for (const row of standingRows ?? []) map.set(row.metric_id, row);
    return map;
  }, [standingRows]);

  const sgTotal = standingByMetric.get('sg_total') ?? null;

  // The four SG categories, resolved + labelled (for the diagnosis section).
  const sgCategoryItems = useMemo(
    () =>
      SG_CATEGORIES.map((id) => {
        const row = standingByMetric.get(id);
        const cfg = getMetricRenderConfig(id);
        return row && cfg ? { id, row, cfg } : null;
      }).filter((x): x is NonNullable<typeof x> => x !== null),
    [standingByMetric],
  );

  // Biggest gain / biggest leak across the four SG categories (SG is
  // higher-better, so max value = strength, min = leak). Needs ≥2 to compare.
  const gainLeak = useMemo(() => {
    const scored = sgCategoryItems
      .map((it) => ({ label: it.cfg.display_label, value: finite(it.row.player_value) }))
      .filter((x): x is { label: string; value: number } => x.value !== null);
    if (scored.length < 2) return null;
    let best = scored[0]!;
    let worst = scored[0]!;
    for (const s of scored) {
      if (s.value > best.value) best = s;
      if (s.value < worst.value) worst = s;
    }
    if (best.label === worst.label) return null;
    return { best, worst };
  }, [sgCategoryItems]);

  // CoachHelm cause/effect — the patterns moving scoring the most (by absolute
  // stroke impact), top 3. Each carries a cause (description), an effect
  // (strokeImpact) and, when available, a fix (recommendation).
  const coachHelmReads = useMemo(() => {
    return [...patterns]
      .filter((p) => finite(p.strokeImpact) !== null && p.strokeImpact !== 0)
      .sort((a, b) => Math.abs(b.strokeImpact) - Math.abs(a.strokeImpact))
      .slice(0, 3);
  }, [patterns]);

  // The detailed (non-SG) standing matrix, bucketed by category.
  const matrixByCategory = useMemo(() => {
    const byCat = new Map<
      string,
      Array<{ id: MetricId; row: PlayerStandingRow; cfg: MetricRenderConfig }>
    >();
    for (const id of METRIC_IDS) {
      if (SG_SET.has(id)) continue;
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

  const detailedGroups = useMemo(
    () => CATEGORY_ORDER.filter((g) => (matrixByCategory.get(g.category) ?? []).length > 0),
    [matrixByCategory],
  );

  // ── Honest cold-start: no standing rows AND no rounds AND no leak data ─────
  const roundsAnalyzed = detailedStats?.roundsPlayed ?? 0;
  const hasStanding = (standingRows?.length ?? 0) > 0;
  const hasLeak =
    !!leakMaps &&
    (leakMaps.putting.some((b) => b.sample_n > 0) ||
      leakMaps.approach.some((b) => b.sample_n > 0));
  const isColdStart = !loading && !hasStanding && roundsAnalyzed === 0 && !hasLeak;

  // Scoring-trend ribbon points off the REUSED getTrendAnalysis score series.
  const trendPoints = useMemo<RibbonPoint[]>(() => {
    const series = trendData?.trends.score ?? [];
    return series
      .filter((p) => finite(p.value) !== null)
      .map((p) => ({ x: p.date, y: p.value }));
  }, [trendData]);
  const trendBenchmark = finite(trendData?.periodComparison.last30Days.scoringAvg);

  // Scoring distribution by par (3/4/5) — from the extended GolfStats engine.
  const scoringByPar = detailedStats?.scoringByPar ?? null;
  const hasParData =
    !!scoringByPar &&
    scoringByPar.par3.total + scoringByPar.par4.total + scoringByPar.par5.total > 0;

  // ── States ─────────────────────────────────────────────────────────────────
  if (loading) return <StatsLoading className={className} />;

  if (loadError) {
    return (
      <Surface padding="lg" className={className}>
        <InlineNotice tone="danger" title="Couldn’t load stats">
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
        />
      </Surface>
    );
  }

  return (
    <div className={cn('flex flex-col gap-10', className)}>
      {/* ════════════════ 1 · VERDICT — SG hero + synthesized read ════════════ */}
      <SgVerdict sgTotal={sgTotal} detailedStats={detailedStats} gainLeak={gainLeak} />

      {detailedStats?.truncated ? (
        <InlineNotice tone="warning" title="Showing the most recent rounds">
          Stats below reflect the most recent 100 rounds. Older rounds are not
          included in this view.
        </InlineNotice>
      ) : null}

      {/* ════════════════ 2 · VITALS — clean 4-up ═════════════════════════════ */}
      <section className="flex flex-col gap-3">
        <SectionHeading>The fundamentals</SectionHeading>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <RoundsReadout detailedStats={detailedStats} />
          <FairwaysReadout detailedStats={detailedStats} />
          <GirReadout detailedStats={detailedStats} />
          <PuttsReadout detailedStats={detailedStats} />
        </div>
      </section>

      {/* ════════════════ 3 · STROKES GAINED — the diagnosis ══════════════════ */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 px-1">
          <SectionHeading as="div">Where you win &amp; lose strokes</SectionHeading>
          {gainLeak ? (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
              <span className="inline-flex items-center gap-1.5 font-fw-sans text-caption text-text-secondary">
                <span aria-hidden className="text-fw-success">▲</span>
                Biggest gain:{' '}
                <span className="font-medium text-text-primary">{gainLeak.best.label}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 font-fw-sans text-caption text-text-secondary">
                <span aria-hidden className="text-fw-warning">▼</span>
                Biggest leak:{' '}
                <span className="font-medium text-text-primary">{gainLeak.worst.label}</span>
              </span>
            </div>
          ) : null}
        </div>

        {sgCategoryItems.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {sgCategoryItems.map(({ id, row, cfg }) => (
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
        ) : (
          <Surface padding="lg">
            <InsufficientData
              compact
              title="SG breakdown warming up"
              description="Off-the-tee, approach, around-green, and putting standings appear as rounds are logged."
              unit="rounds"
            />
          </Surface>
        )}
      </section>

      {/* ════════════════ 3b · SCORING BY PAR — distribution ══════════════════ */}
      {hasParData ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5 px-1">
            <SectionHeading as="div">Scoring by par</SectionHeading>
            <span className="font-fw-sans text-caption text-text-tertiary">
              Outcome mix on par 3s, 4s, and 5s — where the easy and hard pars are.
            </span>
          </div>
          <ScoringByPar data={scoringByPar!} />
        </section>
      ) : null}

      {/* ════════════════ 4 · WHERE THE STROKES LEAK ══════════════════════════ */}
      <section className="flex flex-col gap-3">
        <SectionHeading>Where the strokes leak</SectionHeading>
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

      {/* ════════════════ 4b · COACHHELM — cause & effect (integration) ═══════ */}
      {coachHelmReads.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 px-1">
            <span className="inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent-600" aria-hidden />
              <SectionHeading as="div">What CoachHelm sees</SectionHeading>
            </span>
            <Link
              href={`/golf/dashboard/players/${playerId}`}
              className="inline-flex items-center gap-1 rounded-fw-sm font-fw-sans text-label font-medium text-accent-600 outline-none transition-colors [transition-duration:180ms] hover:text-accent-700 focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
            >
              Open CoachHelm
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {coachHelmReads.map((p) => (
              <CauseEffectCard key={p.id} pattern={p} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ════════════════ 5 · SCORING TREND ═══════════════════════════════════ */}
      <section className="flex flex-col gap-3">
        <SectionHeading>Scoring trend</SectionHeading>
        <Ribbon
          title="Score by round"
          overline="Trend"
          takeaway="Scoring trace across logged rounds, with the 30-day average as the benchmark."
          data={trendPoints}
          benchmark={
            trendBenchmark != null ? { value: trendBenchmark, label: '30-day avg' } : undefined
          }
          seriesName="Score"
          valueFormatter={(v) => v.toFixed(1)}
        />
      </section>

      {/* ════════════════ 6 · DETAILED STANDINGS — collapsed disclosure ═══════ */}
      {detailedGroups.length > 0 ? (
        <section className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setShowDetailed((v) => !v)}
            aria-expanded={showDetailed}
            className="group flex w-full items-center justify-between rounded-card border border-border-subtle bg-surface px-5 py-4 text-left outline-none transition-colors [transition-duration:180ms] hover:bg-surface-tint focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
          >
            <span className="flex flex-col gap-0.5">
              <span className="font-fw-display text-body font-medium text-text-primary">
                Detailed standings
              </span>
              <span className="font-fw-sans text-caption text-text-tertiary">
                {detailedGroups.length} categories · putting bands, scrambling, scoring, course management{detailedGroups.some((g) => g.category === 'pressure') ? ', pressure' : ''}
              </span>
            </span>
            <ChevronDown
              className={cn(
                'h-5 w-5 flex-shrink-0 text-text-tertiary transition-transform [transition-duration:180ms] motion-reduce:transition-none',
                showDetailed && 'rotate-180',
              )}
            />
          </button>

          {showDetailed ? (
            <div className="flex flex-col gap-6 pt-1">
              {detailedGroups.map((group) => {
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
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ════════════════ 7 · RECENT ROUNDS ═══════════════════════════════════ */}
      {trendData && trendData.rounds.length > 0 ? (
        <RecentRounds rounds={trendData.rounds} />
      ) : null}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * Section heading — the shared eyebrow used across the cockpit sections.
 * ══════════════════════════════════════════════════════════════════════════ */
function SectionHeading({
  children,
  as: As = 'h3',
}: {
  children: React.ReactNode;
  as?: 'h3' | 'div';
}) {
  return (
    <As className="px-1 font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
      {children}
    </As>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * 1 · VERDICT — the SG-vs-PGA hero + the synthesized plain-English read.
 * ══════════════════════════════════════════════════════════════════════════ */
function SgVerdict({
  sgTotal,
  detailedStats,
  gainLeak,
}: {
  sgTotal: PlayerStandingRow | null;
  detailedStats: GolfStats | null;
  gainLeak: { best: { label: string }; worst: { label: string } } | null;
}) {
  const sgCfg = getMetricRenderConfig('sg_total');
  const scoringAvg = finite(detailedStats?.scoringAverage);
  const sgValue = finite(sgTotal?.player_value);

  // Synthesized read: signed SG vs PGA Tour + the biggest strength / leak.
  const verdict: string | null = (() => {
    if (sgValue === null) return null;
    const head =
      sgValue >= 0
        ? `Gaining ${formatSg(sgValue)} strokes per round on the field`
        : `${formatSg(sgValue)} strokes per round vs PGA Tour`;
    if (gainLeak) {
      return `${head}. Strongest in ${gainLeak.best.label.toLowerCase()}; leaking most in ${gainLeak.worst.label.toLowerCase()}.`;
    }
    return `${head}.`;
  })();

  return (
    <InstrumentPanel
      depth="raised"
      tone="accent"
      padding="lg"
      eyebrow="Strokes Gained"
      header="SG: Total vs PGA Tour"
      as="section"
      className="flex flex-col gap-6"
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-stretch">
        {/* SG: Total comparison bar (or honest awaiting). */}
        <div className="flex flex-col justify-center">
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
              description="The strokes-gained standing fills in after 5+ rounds with shot detail."
              unit="rounds"
            />
          )}
        </div>

        {/* Scoring average readout. */}
        <InstrumentPanel depth="inset" padding="md" className="flex items-center">
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
      </div>

      {verdict ? (
        <p className="border-t border-border-subtle pt-4 font-fw-sans text-body-sm text-text-secondary">
          {verdict}
        </p>
      ) : null}
    </InstrumentPanel>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * 2 · VITALS — micro-readouts off the REUSED getDetailedStats GolfStats.
 * ══════════════════════════════════════════════════════════════════════════ */
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

/* ════════════════════════════════════════════════════════════════════════════
 * 3b · SCORING BY PAR — the outcome mix on par 3s / 4s / 5s as a stacked
 * distribution bar (birdie+ · par · bogey · double+) plus the avg-to-par/hole.
 * Honest: only par types with holes played are shown.
 * ══════════════════════════════════════════════════════════════════════════ */
function formatToParPerHole(v: number | null): string {
  if (v === null) return '—';
  if (Math.abs(v) < 0.05) return 'E';
  return v > 0 ? `+${v.toFixed(2)}` : `−${Math.abs(v).toFixed(2)}`;
}

function pctOf(n: number, total: number): number {
  return total > 0 ? (n / total) * 100 : 0;
}

const PAR_KEYS = [
  { key: 'par3', label: 'Par 3' },
  { key: 'par4', label: 'Par 4' },
  { key: 'par5', label: 'Par 5' },
] as const;

/**
 * One small-multiple distribution chart per par type. Each is a horizontal
 * BarCompare of the outcome mix (% of holes) — Birdie+ · Par · Bogey · Double+ —
 * with the modal outcome highlighted, and the avg-to-par/hole in the subtitle.
 * Length-encoded bars read as a real distribution (not a sliver stacked bar).
 */
function ScoringByPar({ data }: { data: GolfStats['scoringByPar'] }) {
  const cards = PAR_KEYS.map(({ key, label }) => ({ label, d: data[key] })).filter(
    (c) => c.d.total > 0,
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {cards.map(({ label, d }) => {
        const bars = [
          { label: 'Birdie+', value: pctOf(d.eagle + d.birdie, d.total) },
          { label: 'Par', value: pctOf(d.par, d.total) },
          { label: 'Bogey', value: pctOf(d.bogey, d.total) },
          { label: 'Double+', value: pctOf(d.doublePlus, d.total) },
        ];
        let maxIdx = 0;
        for (let i = 1; i < bars.length; i++) {
          if ((bars[i]?.value ?? 0) > (bars[maxIdx]?.value ?? 0)) maxIdx = i;
        }
        const barData = bars.map((b, i) => ({ ...b, highlight: i === maxIdx }));
        return (
          <BarCompare
            key={label}
            title={label}
            overline="Scoring"
            subtitle={`${formatToParPerHole(d.avgToPar)} / hole · ${d.total} ${d.total === 1 ? 'hole' : 'holes'}`}
            takeaway={`Score distribution on ${label.toLowerCase()}s — share of holes by outcome.`}
            data={barData}
            height={176}
            valueFormatter={(v) => `${Math.round(v)}%`}
          />
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * 4b · COACHHELM CAUSE/EFFECT — one mined pattern as cause → quantified stroke
 * effect → fix. Honest sign: negative strokeImpact = a leak (cost), positive =
 * a strength (gain). The data + framing come straight from getPlayerPatterns.
 * ══════════════════════════════════════════════════════════════════════════ */
function prettyPatternType(t: string | null | undefined): string {
  if (!t) return 'Pattern';
  if (t === 'contextual') return 'Shot pattern';
  if (t === 'conditional') return 'Conditional';
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function CauseEffectCard({ pattern }: { pattern: CoachHelmPattern }) {
  const isLeak = pattern.strokeImpact < 0;
  const magnitude = Math.abs(pattern.strokeImpact).toFixed(1);
  const cause = pattern.description?.trim() || prettyPatternType(pattern.patternType);
  const fix = pattern.recommendation?.trim() || null;
  const rounds = finite(pattern.occurrenceCount);

  return (
    <Surface elevation="border" padding="md" className="flex h-full flex-col gap-3">
      <span className="font-fw-sans text-eyebrow font-medium uppercase tracking-[0.1em] text-text-tertiary">
        {prettyPatternType(pattern.patternType)}
      </span>

      {/* Effect — the quantified stroke cost / gain. */}
      <span
        className={cn(
          'inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 font-fw-mono text-caption font-medium tabular-nums',
          isLeak ? 'bg-fw-warning-bg text-fw-warning' : 'bg-fw-success-bg text-fw-success',
        )}
      >
        {isLeak ? (
          <TrendingDown className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <TrendingUp className="h-3.5 w-3.5" aria-hidden />
        )}
        {isLeak ? `≈ ${magnitude} strokes / round` : `+${magnitude} strokes / round`}
      </span>

      {/* Cause */}
      <p className="font-fw-sans text-body-sm leading-snug text-text-primary">{cause}</p>

      {/* Fix (the actionable handoff) */}
      {fix ? (
        <p className="mt-auto font-fw-sans text-caption leading-snug text-text-tertiary">
          <span className="font-medium text-text-secondary">Fix · </span>
          {fix}
        </p>
      ) : null}

      {rounds != null && rounds > 0 ? (
        <p className={cn('font-fw-sans text-caption text-text-tertiary', fix ? '' : 'mt-auto')}>
          Seen across {rounds} {rounds === 1 ? 'round' : 'rounds'}
        </p>
      ) : null}
    </Surface>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * 7 · RECENT ROUNDS — restyled off the reused getTrendAnalysis rounds.
 * ══════════════════════════════════════════════════════════════════════════ */
function RecentRounds({ rounds }: { rounds: TrendAnalysisResponse['rounds'] }) {
  const recent = useMemo(() => [...rounds].slice(-10).reverse(), [rounds]);

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>Recent rounds</SectionHeading>
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
              className="group flex items-center gap-4 rounded-card border border-border-subtle bg-surface px-4 py-3 outline-none transition-colors [transition-duration:180ms] hover:bg-surface-tint focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
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

/* ════════════════════════════════════════════════════════════════════════════
 * Loading — matte skeleton mirroring the new section shape.
 * ══════════════════════════════════════════════════════════════════════════ */
function StatsLoading({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-10', className)} aria-busy="true">
      <Skeleton className="h-56 rounded-card" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Skeleton className="h-28 rounded-card" />
        <Skeleton className="h-28 rounded-card" />
        <Skeleton className="h-28 rounded-card" />
        <Skeleton className="h-28 rounded-card" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-card" />
        <Skeleton className="h-72 rounded-card" />
      </div>
    </div>
  );
}

export default FairwayStatsCockpit;
