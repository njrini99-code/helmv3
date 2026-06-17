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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  type LeakMapBucket,
  ShotDispersion,
  type ShotPoint,
  PuttingHeatmap,
  type HeatCell,
} from '@/components/fairway';

// REUSED UNCHANGED loaders — the legacy detailed stats + trend analysis.
import { getDetailedStats, getTrendAnalysis, getSprayChartData } from '@/app/golf/actions/stats-data';
import type { TrendAnalysisResponse, SprayChartResponse } from '@/app/golf/actions/stats-data-types';
import { FairwayDrivingSpray } from './FairwayDrivingSpray';
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

const STATS_TABS = [
  { id: 'scoring', label: 'Scoring' },
  { id: 'driving', label: 'Driving' },
  { id: 'approach', label: 'Approach' },
  { id: 'putting', label: 'Putting' },
  { id: 'scrambling', label: 'Scrambling' },
  { id: 'strokes-gained', label: 'Strokes Gained' },
  { id: 'analysis', label: 'Analysis' },
] as const;

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

/* ── Honest display formatters (em-dash for null, never a fabricated 0) ─────── */

/** Percent to 0 dp, e.g. "62%". Null/non-finite → em-dash. */
function fmtPct(value: number | null | undefined): string {
  const n = finite(value);
  return n === null ? '—' : `${Math.round(n)}%`;
}

/** Feet to 0 dp with a prime mark, e.g. "23′". Null → em-dash. */
function fmtFeet(value: number | null | undefined): string {
  const n = finite(value);
  return n === null ? '—' : `${Math.round(n)}′`;
}

/** Yards to 0 dp, e.g. "248 yds". Null → em-dash. */
function fmtYds(value: number | null | undefined): string {
  const n = finite(value);
  return n === null ? '—' : `${Math.round(n)} yds`;
}

/** Decimal to N dp, e.g. "71.4". Null → em-dash. */
function fmtNum(value: number | null | undefined, digits = 2): string {
  const n = finite(value);
  return n === null ? '—' : n.toFixed(digits);
}

/** Plain integer, e.g. "42". Null → em-dash. */
function fmtInt(value: number | null | undefined): string {
  const n = finite(value);
  return n === null ? '—' : String(Math.round(n));
}

/** A single label → honest value row inside a detail grid. */
interface DetailRow {
  label: string;
  /** Preformatted, already null-guarded display string ("—" when no data). */
  value: string;
}

/** True when every row in a detail block is the honest em-dash (no real data). */
function allDash(rows: DetailRow[]): boolean {
  return rows.every((r) => r.value === '—');
}

/**
 * Compact honest readout grid on a sunken Surface — the Fairway-native
 * replacement for the legacy StatRow list. Each row is a label + tabular value;
 * a row with no data reads em-dash, never a fabricated 0. The whole block is
 * only rendered by callers when at least one row has data (allDash guard).
 */
function DetailGrid({
  title,
  hint,
  rows,
  columns = 2,
}: {
  title: string;
  hint?: string;
  rows: DetailRow[];
  columns?: 2 | 3 | 4;
}) {
  const colClass =
    columns === 4
      ? 'sm:grid-cols-2 lg:grid-cols-4'
      : columns === 3
        ? 'sm:grid-cols-3'
        : 'sm:grid-cols-2';
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5 px-1">
        <h4 className="font-fw-sans text-body-sm font-medium text-text-primary">{title}</h4>
        {hint ? (
          <span className="font-fw-sans text-caption text-text-tertiary">{hint}</span>
        ) : null}
      </div>
      <Surface elevation="border" padding="md">
        <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-2.5', colClass)}>
          {rows.map((r) => (
            <div
              key={r.label}
              className="flex items-baseline justify-between gap-3 border-b border-border-subtle/60 pb-2 last:border-0 last:pb-0"
            >
              <dt className="font-fw-sans text-caption text-text-secondary">{r.label}</dt>
              <dd
                className={cn(
                  'font-fw-mono text-body-sm font-medium tabular-nums',
                  r.value === '—' ? 'text-text-tertiary' : 'text-text-primary',
                )}
              >
                {r.value}
              </dd>
            </div>
          ))}
        </dl>
      </Surface>
    </div>
  );
}

/** Headline micro-readout (mirrors the Vitals readouts' exact guard pattern). */
function HeadlineReadout({
  value,
  format,
  unit,
  label,
  hasSample,
  awaitingLabel,
  haveSamples,
}: {
  value: number | null;
  format?: { maximumFractionDigits?: number; minimumFractionDigits?: number };
  unit?: string;
  label: string;
  hasSample: boolean;
  awaitingLabel: string;
  haveSamples?: number;
}) {
  const live = value != null && hasSample;
  return (
    <InstrumentPanel depth="base" padding="md" className="h-full">
      <Readout
        value={live ? value : undefined}
        format={format}
        unit={unit}
        label={label}
        size="md"
        state={live ? 'live' : 'awaiting'}
        samples={live ? undefined : { have: haveSamples ?? 0, need: 1 }}
        awaitingLabel={awaitingLabel}
      />
    </InstrumentPanel>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

export function FairwayStatsCockpit({ playerId, className }: FairwayStatsCockpitProps) {
  const [detailedStats, setDetailedStats] = useState<GolfStats | null>(null);
  const [trendData, setTrendData] = useState<TrendAnalysisResponse | null>(null);
  const [standingRows, setStandingRows] = useState<PlayerStandingRow[] | null>(null);
  const [leakMaps, setLeakMaps] = useState<PlayerLeakMaps | null>(null);
  const [sprayData, setSprayData] = useState<SprayChartResponse | null>(null);
  const [patterns, setPatterns] = useState<CoachHelmPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showDetailed, setShowDetailed] = useState(false);
  const [showComprehensive, setShowComprehensive] = useState(false);

  const loadAll = useCallback(async (id: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const [detailedRes, trendRes, standingRes, leakRes, patternsRes, sprayRes] = await Promise.allSettled([
        getDetailedStats(id, 'overall'),
        getTrendAnalysis(id),
        getPlayerStandingRows(id),
        getPlayerLeakMaps(id),
        getPlayerPatterns(id),
        getSprayChartData(id, 'overall'),
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
      // Spray chart data is a non-blocking enrichment — a failed fetch just hides
      // the shot-patterns section, never errors the page (mirrors patterns above).
      if (sprayRes.status === 'fulfilled') {
        setSprayData(sprayRes.value);
      } else {
        setSprayData(null);
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

      <Surface padding="none" elevation="border" className="overflow-hidden">
        <Tabs defaultValue="scoring" className="gap-0">
          <TabsList className="px-4">
            {STATS_TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="scoring" className="px-4 py-5 sm:px-5">
            <div className="flex flex-col gap-6">
              {hasParData ? (
                <section className="flex flex-col gap-3">
                  <div className="flex flex-col gap-0.5 px-1">
                    <SectionHeading as="div">Scoring by par</SectionHeading>
                    <span className="font-fw-sans text-caption text-text-tertiary">
                      Outcome mix on par 3s, 4s, and 5s.
                    </span>
                  </div>
                  <ScoringByPar data={scoringByPar!} />
                </section>
              ) : null}
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
            </div>
          </TabsContent>

          <TabsContent value="driving" className="px-4 py-5 sm:px-5">
            <div className="flex flex-col gap-6">
              <DrivingSection detailedStats={detailedStats} />
              <FairwayDrivingSpray group={sprayData?.driving ?? null} />
            </div>
          </TabsContent>

          <TabsContent value="approach" className="px-4 py-5 sm:px-5">
            <div className="flex flex-col gap-6">
              <ApproachHeadlineSection detailedStats={detailedStats} />
              <ApproachLegacyDetail detailedStats={detailedStats} />
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
          </TabsContent>

          <TabsContent value="putting" className="px-4 py-5 sm:px-5">
            <div className="flex flex-col gap-6">
              <PuttingLegacyDetail detailedStats={detailedStats} />
              <LeakMap
                title="Putt make %"
                overline="Putting"
                subtitle="Make rate by distance vs PGA Tour"
                takeaway="Bands below the dashed Tour line are where putts are leaking."
                direction="higher_better"
                unit="percent"
                data={leakMaps ? toChartBuckets(leakMaps.putting) : []}
              />
            </div>
          </TabsContent>

          <TabsContent value="scrambling" className="px-4 py-5 sm:px-5">
            <ShortGameSection detailedStats={detailedStats} />
          </TabsContent>

          <TabsContent value="strokes-gained" className="px-4 py-5 sm:px-5">
            <div className="flex flex-col gap-6">
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
                        is_womens={row.is_womens}
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
            </div>
          </TabsContent>

          <TabsContent value="analysis" className="px-4 py-5 sm:px-5">
            <div className="flex flex-col gap-6">
              <DetailedStandingsSection
                detailedGroups={detailedGroups}
                matrixByCategory={matrixByCategory}
                open={showDetailed}
                onToggle={() => setShowDetailed((v) => !v)}
              />
              <ShotPatterns spray={sprayData} putting={detailedStats?.puttingByBreak ?? null} />
              <ComprehensiveDetail
                detailedStats={detailedStats}
                trendData={trendData}
                open={showComprehensive}
                onToggle={() => setShowComprehensive((v) => !v)}
              />
            </div>
          </TabsContent>
        </Tabs>
      </Surface>

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
      // Strip the "SG: " metric-id prefix so the prose reads "around the green",
      // not "sg: around the green".
      const cleanLabel = (l: string) => l.toLowerCase().replace(/^sg:\s*/, '');
      return `${head}. Strongest in ${cleanLabel(gainLeak.best.label)}; leaking most in ${cleanLabel(gainLeak.worst.label)}.`;
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
              is_womens={sgTotal.is_womens}
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
 * Putt-distance band keys (from getPuttDistanceBucket) → display labels, in
 * ascending order. The SAME label set/order the file already uses for putt
 * make-% bands — reused for the first-putt (approach putt) distance distribution.
 */
const PUTT_BAND_LABELS: ReadonlyArray<{ key: string; label: string }> = [
  { key: '0_3', label: '0-3 ft' },
  { key: '3_5', label: '3-5 ft' },
  { key: '5_10', label: '5-10 ft' },
  { key: '10_15', label: '10-15 ft' },
  { key: '15_20', label: '15-20 ft' },
  { key: '20_25', label: '20-25 ft' },
  { key: '25_30', label: '25-30 ft' },
  { key: '30_35', label: '30-35 ft' },
  { key: '35_plus', label: '35+ ft' },
];

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
 * 3c · SHORT GAME — scrambling %, sand-save %, penalties/round headline readouts.
 * Reads: scramblingPercentage, scrambleAttempts, sandSavePercentage,
 * sandSavesMade/sandSaveAttempts, penaltiesPerRound, totalPenalties. Honest:
 * each readout reads `awaiting` when its sample is 0; the whole section hides
 * when there is no short-game data at all (never a grid of zeros).
 * ══════════════════════════════════════════════════════════════════════════ */
type ScrambleCut = 'lie' | 'distance';

function ShortGameSection({ detailedStats }: { detailedStats: GolfStats | null }) {
  const [scrambleCut, setScrambleCut] = useState<ScrambleCut>('lie');
  if (!detailedStats) return null;
  const scramblePct = finite(detailedStats.scramblingPercentage);
  const scrambleAtt = detailedStats.scrambleAttempts ?? 0;
  const sandPct = finite(detailedStats.sandSavePercentage);
  const sandAtt = detailedStats.sandSaveAttempts ?? 0;
  const penPerRound = finite(detailedStats.penaltiesPerRound);
  const rounds = detailedStats.roundsPlayed ?? 0;

  // By-lie + by-distance scrambling drill-in (only rows with data shown honest).
  const byLie: DetailRow[] = [
    { label: 'From fairway', value: fmtPct(detailedStats.scramblingPctFairway) },
    { label: 'From rough', value: fmtPct(detailedStats.scramblingPctRough) },
    { label: 'From sand', value: fmtPct(detailedStats.scramblingPctSand) },
  ];
  const byDistance: DetailRow[] = [
    { label: '0–10 yds', value: fmtPct(detailedStats.scramblingPct0_10) },
    { label: '10–20 yds', value: fmtPct(detailedStats.scramblingPct10_20) },
    { label: '20–30 yds', value: fmtPct(detailedStats.scramblingPct20_30) },
  ];

  const hasHeadline = scrambleAtt > 0 || sandAtt > 0 || (penPerRound != null && rounds > 0);
  const hasDrill = !allDash(byLie) || !allDash(byDistance);
  if (!hasHeadline && !hasDrill) return null;

  // One breakdown, switched by the cut toggle (reuses the cockpit ToggleChip).
  const activeRows = scrambleCut === 'lie' ? byLie : byDistance;
  const activeTitle = scrambleCut === 'lie' ? 'Scrambling by lie' : 'Scrambling by distance';

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5 px-1">
        <SectionHeading as="div">Short game &amp; scrambling</SectionHeading>
        <span className="font-fw-sans text-caption text-text-tertiary">
          Up-and-down conversion, bunker recovery, and the penalty tax per round.
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <HeadlineReadout
          value={scramblePct}
          format={{ maximumFractionDigits: 0 }}
          unit="%"
          label="Scrambling"
          hasSample={scrambleAtt > 0}
          awaitingLabel="No misses yet"
        />
        <HeadlineReadout
          value={sandPct}
          format={{ maximumFractionDigits: 0 }}
          unit="%"
          label="Sand saves"
          hasSample={sandAtt > 0}
          awaitingLabel="No bunkers"
        />
        <InstrumentPanel depth="base" padding="md" className="h-full">
          <Readout
            display={sandAtt > 0 ? `${detailedStats.sandSavesMade}/${sandAtt}` : undefined}
            label="Saves / bunkers"
            size="md"
            state={sandAtt > 0 ? 'live' : 'awaiting'}
            samples={sandAtt > 0 ? undefined : { have: 0, need: 1 }}
            awaitingLabel="No bunkers"
          />
        </InstrumentPanel>
        <HeadlineReadout
          value={penPerRound}
          format={{ maximumFractionDigits: 2 }}
          label="Penalties / round"
          hasSample={rounds > 0}
          awaitingLabel="No rounds"
          haveSamples={rounds}
        />
      </div>
      {hasDrill ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2 px-1" aria-label="Scrambling cut filter">
            <ToggleChip active={scrambleCut === 'lie'} value="lie" label="By lie" onSelect={setScrambleCut} />
            <ToggleChip
              active={scrambleCut === 'distance'}
              value="distance"
              label="By distance"
              onSelect={setScrambleCut}
            />
          </div>
          {!allDash(activeRows) ? (
            <DetailGrid title={activeTitle} rows={activeRows} columns={3} />
          ) : (
            <Surface elevation="border" padding="md">
              <p className="font-fw-sans text-caption text-text-tertiary">
                No {scrambleCut === 'lie' ? 'lie' : 'distance'} data yet.
              </p>
            </Surface>
          )}
        </div>
      ) : null}
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * 3d · OFF THE TEE — driving distance (all + driver-only), fairway accuracy,
 * and the left/right miss bias. Reads: drivingDistanceAvg,
 * drivingDistanceDriverOnly, fairwayPercentage, fairwayPctPar4/5,
 * fairwayPctDriver/NonDriver, missLeftPct/missRightPct + missLeftCount/Right.
 * Honest: distance reads awaiting until a tee shot has a measured distance.
 * ══════════════════════════════════════════════════════════════════════════ */
function DrivingSection({ detailedStats }: { detailedStats: GolfStats | null }) {
  if (!detailedStats) return null;
  const distAvg = finite(detailedStats.drivingDistanceAvg);
  const distDriver = finite(detailedStats.drivingDistanceDriverOnly);
  const distNonDriver = finite(detailedStats.drivingDistanceNonDriverOnly);
  const fwPct = finite(detailedStats.fairwayPercentage);
  const fwOpps = detailedStats.fairwayOpportunities ?? 0;
  const missLeft = finite(detailedStats.missLeftPct);
  const missRight = finite(detailedStats.missRightPct);
  const missTotal = (detailedStats.missLeftCount ?? 0) + (detailedStats.missRightCount ?? 0);

  const byHoleType: DetailRow[] = [
    { label: 'Par 4s', value: fmtPct(detailedStats.fairwayPctPar4) },
    { label: 'Par 5s', value: fmtPct(detailedStats.fairwayPctPar5) },
  ];
  const byClub: DetailRow[] = [
    { label: 'With driver', value: fmtPct(detailedStats.fairwayPctDriver) },
    { label: 'Without driver', value: fmtPct(detailedStats.fairwayPctNonDriver) },
  ];
  // Distance rows beside the headline driving readouts — all + driver-only +
  // (new) non-driver-only carry distance, honest em-dash when no measured shots.
  const distanceRows: DetailRow[] = [
    { label: 'All tee shots', value: fmtYds(distAvg) },
    { label: 'Driver only', value: fmtYds(distDriver) },
    { label: 'Non-driver', value: fmtYds(distNonDriver) },
  ];
  const missRows: DetailRow[] = [
    {
      label: 'Miss left',
      value:
        missLeft != null
          ? `${fmtPct(missLeft)} · ${detailedStats.missLeftCount}`
          : '—',
    },
    {
      label: 'Miss right',
      value:
        missRight != null
          ? `${fmtPct(missRight)} · ${detailedStats.missRightCount}`
          : '—',
    },
  ];

  // Tee-miss L/R split by club — rows Driver / Non-driver, columns Left % /
  // Right %. Each cell em-dashes independently when that club's split is null.
  const missByClub: Array<{
    club: string;
    left: number | null;
    right: number | null;
  }> = [
    {
      club: 'Driver',
      left: finite(detailedStats.missLeftPctDriver),
      right: finite(detailedStats.missRightPctDriver),
    },
    {
      club: 'Non-driver',
      left: finite(detailedStats.missLeftPctNonDriver),
      right: finite(detailedStats.missRightPctNonDriver),
    },
  ];
  const hasMissByClub = missByClub.some((r) => r.left != null || r.right != null);

  const hasHeadline = distAvg != null || (fwPct != null && fwOpps > 0);
  const hasDrill =
    !allDash(byHoleType) || !allDash(byClub) || !allDash(distanceRows) || missTotal > 0;
  if (!hasHeadline && !hasDrill) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5 px-1">
        <SectionHeading as="div">Off the tee</SectionHeading>
        <span className="font-fw-sans text-caption text-text-tertiary">
          Carry distance and fairway accuracy — plus where the misses leak.
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <HeadlineReadout
          value={distAvg}
          format={{ maximumFractionDigits: 0 }}
          unit="yds"
          label="Driving distance"
          hasSample={distAvg != null}
          awaitingLabel="No tracked tee shots"
        />
        <HeadlineReadout
          value={distDriver}
          format={{ maximumFractionDigits: 0 }}
          unit="yds"
          label="Driver only"
          hasSample={distDriver != null}
          awaitingLabel="No driver shots"
        />
        <HeadlineReadout
          value={fwPct}
          format={{ maximumFractionDigits: 0 }}
          unit="%"
          label="Fairways hit"
          hasSample={fwPct != null && fwOpps > 0}
          awaitingLabel="No tee shots"
        />
        <HeadlineReadout
          value={missTotal > 0 ? missLeft : null}
          format={{ maximumFractionDigits: 0 }}
          unit="%"
          label="Miss bias · left"
          hasSample={missTotal > 0 && missLeft != null}
          awaitingLabel="No misses"
        />
      </div>
      {hasDrill ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {!allDash(distanceRows) ? (
            <DetailGrid
              title="Distance by club"
              hint="Average measured carry"
              rows={distanceRows}
            />
          ) : null}
          {!allDash(byHoleType) ? (
            <DetailGrid title="Fairways by hole type" rows={byHoleType} />
          ) : null}
          {!allDash(byClub) ? (
            <DetailGrid title="Fairways by club" rows={byClub} />
          ) : null}
          {missTotal > 0 ? (
            <DetailGrid
              title="Tee miss direction"
              hint={`${detailedStats.missLeftCount} left · ${detailedStats.missRightCount} right`}
              rows={missRows}
            />
          ) : null}
        </div>
      ) : null}
      {hasMissByClub ? <TeeMissByClub rows={missByClub} /> : null}
    </section>
  );
}

/* ── Tee-miss L/R split, by club — a small 2×2 matrix (Driver / Non-driver ×
 * Miss left % / Miss right %). Sits beside the overall miss-direction grid so
 * the per-club bias reads at a glance. Each cell em-dashes independently. ──── */
function TeeMissByClub({
  rows,
}: {
  rows: Array<{ club: string; left: number | null; right: number | null }>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5 px-1">
        <h4 className="font-fw-sans text-body-sm font-medium text-text-primary">
          Tee miss by club
        </h4>
        <span className="font-fw-sans text-caption text-text-tertiary">
          Left / right miss split among missed fairways, by club.
        </span>
      </div>
      <Surface elevation="border" padding="md">
        <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-6 gap-y-2.5">
          <span aria-hidden />
          <span className="text-right font-fw-sans text-eyebrow font-medium uppercase tracking-[0.1em] text-text-tertiary">
            Miss left
          </span>
          <span className="text-right font-fw-sans text-eyebrow font-medium uppercase tracking-[0.1em] text-text-tertiary">
            Miss right
          </span>
          {rows.map((r, i) => {
            const edge = i < rows.length - 1 ? 'border-b border-border-subtle/60 pb-2' : '';
            return (
              <div key={r.club} className="contents">
                <span className={cn('font-fw-sans text-caption text-text-secondary', edge)}>
                  {r.club}
                </span>
                <span
                  className={cn(
                    'text-right font-fw-mono text-body-sm font-medium tabular-nums',
                    edge,
                    r.left == null ? 'text-text-tertiary' : 'text-text-primary',
                  )}
                >
                  {fmtPct(r.left)}
                </span>
                <span
                  className={cn(
                    'text-right font-fw-mono text-body-sm font-medium tabular-nums',
                    edge,
                    r.right == null ? 'text-text-tertiary' : 'text-text-primary',
                  )}
                >
                  {fmtPct(r.right)}
                </span>
              </div>
            );
          })}
        </div>
      </Surface>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * 3e · APPROACH & GIR — headline GIR % + the three proximity readouts (all /
 * when-hit-green / when-missed-green). Reads: girPercentage, girOpportunities,
 * approachProximityAvg / WhenHitGreen / WhenMissedGreen. Deep by-distance /
 * by-lie / by-par breakdowns live in the Full shot detail disclosure below.
 * Honest: each readout reads awaiting on a 0 sample.
 * ══════════════════════════════════════════════════════════════════════════ */
function ApproachHeadlineSection({ detailedStats }: { detailedStats: GolfStats | null }) {
  if (!detailedStats) return null;
  const girPct = finite(detailedStats.girPercentage);
  const girOpps = detailedStats.girOpportunities ?? 0;
  // Proximity is ON-GREEN ONLY now (a missed approach finishes off-green and has no
  // green proximity). WhenHitGreen is the canonical dial-in number; Avg equals it since
  // both populations are on-green. The old "all" / "when missed green" tiles were the
  // unit-blend artifact (off-green yards ×3'd into feet) and are gone — green-hit rate
  // (GIR) is the reach signal, proximity is the dial-in once on the green.
  // Bound to the on-green field ONLY (no Avg fallback) so this tile can never show a
  // non-on-green value labeled "Proximity on green" — it shows "No greens hit" instead.
  const proxOnGreen = finite(detailedStats.approachProximityWhenHitGreen);

  const hasHeadline = (girPct != null && girOpps > 0) || proxOnGreen != null;
  if (!hasHeadline) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5 px-1">
        <SectionHeading as="div">Approach &amp; greens</SectionHeading>
        <span className="font-fw-sans text-caption text-text-tertiary">
          How often approaches find the green, and how close they finish once there.
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <HeadlineReadout
          value={girPct}
          format={{ maximumFractionDigits: 0 }}
          unit="%"
          label="Greens hit (GIR)"
          hasSample={girPct != null && girOpps > 0}
          awaitingLabel="No approaches"
        />
        <HeadlineReadout
          value={proxOnGreen}
          format={{ maximumFractionDigits: 0 }}
          unit="ft"
          label="Proximity on green"
          hasSample={proxOnGreen != null}
          awaitingLabel="No greens hit"
        />
      </div>
    </section>
  );
}

type ApproachLie = 'fairway' | 'rough' | 'sand';
type PuttBreak = keyof GolfStats['puttingByBreak'];

function ToggleChip<T extends string>({
  active,
  value,
  label,
  onSelect,
}: {
  active: boolean;
  value: T;
  label: string;
  onSelect: (value: T) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        'min-h-9 rounded-full border px-3.5 py-1.5 font-fw-sans text-label font-medium outline-none transition-colors [transition-duration:180ms]',
        'focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none',
        active
          ? 'border-accent-500 bg-accent-50 text-accent-700'
          : 'border-border-subtle bg-surface text-text-secondary hover:bg-surface-tint hover:text-text-primary',
      )}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * GIR BY DISTANCE + MISS TENDENCY — the premium approach board. Per distance
 * band: a GIR% conversion bar (helm-green accent fill) plus the DOMINANT miss
 * direction among that band's missed greens ("miss: Short 60%"). The miss tag
 * is honest — it only appears when approachMissByBand has data for that band;
 * a band with GIR but no miss data shows the GIR conversion alone.
 * ══════════════════════════════════════════════════════════════════════════ */
type GirBand = { label: string; gir: number | null; missKey: string };

type ApproachMissDir = { short: number | null; long: number | null; left: number | null; right: number | null };

const MISS_DIR_LABELS: ReadonlyArray<{ key: keyof ApproachMissDir; label: string }> = [
  { key: 'short', label: 'Short' },
  { key: 'long', label: 'Long' },
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' },
];

/** The single largest miss direction for a band, or null when no miss data. */
function dominantMiss(dir: ApproachMissDir | undefined): { label: string; pct: number } | null {
  if (!dir) return null;
  let best: { label: string; pct: number } | null = null;
  for (const { key, label } of MISS_DIR_LABELS) {
    const v = finite(dir[key]);
    if (v === null) continue;
    if (best === null || v > best.pct) best = { label, pct: v };
  }
  return best;
}

function GirByDistanceBoard({
  bands,
  missByBand,
}: {
  bands: GirBand[];
  missByBand: GolfStats['approachMissByBand'];
}) {
  const rows = bands.filter((b) => b.gir != null);
  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5 px-1">
        <h4 className="font-fw-sans text-body-sm font-medium text-text-primary">
          GIR by approach distance
        </h4>
        <span className="font-fw-sans text-caption text-text-tertiary">
          Greens hit by distance, with where the misses tend to leak.
        </span>
      </div>
      <Surface elevation="border" padding="md">
        <ul className="flex flex-col gap-3.5">
          {rows.map((b) => {
            const pct = b.gir ?? 0;
            const miss = dominantMiss(missByBand[b.missKey]);
            return (
              <li key={b.label} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-fw-sans text-caption text-text-secondary">{b.label}</span>
                  <span className="flex items-baseline gap-2.5">
                    {miss ? (
                      <span className="font-fw-sans text-caption text-text-tertiary">
                        miss: {miss.label} {Math.round(miss.pct)}%
                      </span>
                    ) : null}
                    <span className="font-fw-mono text-body-sm font-medium tabular-nums text-text-primary">
                      {fmtPct(b.gir)}
                    </span>
                  </span>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
                  role="presentation"
                >
                  <div
                    className="h-full rounded-full bg-accent-500"
                    style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </Surface>
    </div>
  );
}

function ApproachLegacyDetail({ detailedStats }: { detailedStats: GolfStats | null }) {
  const [selectedLie, setSelectedLie] = useState<ApproachLie>('fairway');
  if (!detailedStats) return null;
  const s = detailedStats;

  // GIR-by-distance, enriched with each band's dominant miss tendency from
  // approachMissByBand. Each row ties the GIR% (conversion) to its miss-band key
  // (bucket from getApproachDistanceBucket) so the premium board can show
  // "from 150–175 yds you miss short 60%" alongside the conversion bar.
  const girBands: GirBand[] = [
    { label: '50-75 yds', gir: finite(s.girPct50_75), missKey: '30_75' },
    { label: '75-100 yds', gir: finite(s.girPct75_100), missKey: '75_100' },
    { label: '100-125 yds', gir: finite(s.girPct100_125), missKey: '100_125' },
    { label: '125-150 yds', gir: finite(s.girPct125_150), missKey: '125_150' },
    { label: '150-175 yds', gir: finite(s.girPct150_175), missKey: '150_175' },
    { label: '175-200 yds', gir: finite(s.girPct175_200), missKey: '175_200' },
    { label: '200-225 yds', gir: finite(s.girPct200_225), missKey: '200_225' },
    { label: '225+ yds', gir: finite(s.girPct225Plus), missKey: '225_plus' },
  ];
  const hasGirBands = girBands.some((b) => b.gir != null);
  const girByPar: DetailRow[] = [
    { label: 'Par 3s', value: fmtPct(s.girPctPar3) },
    { label: 'Par 4s', value: fmtPct(s.girPctPar4) },
    { label: 'Par 5s', value: fmtPct(s.girPctPar5) },
  ];
  const lieRows: Record<ApproachLie, DetailRow[]> = {
    fairway: [
      { label: 'GIR from fairway', value: fmtPct(s.girPctFromFairway) },
      { label: 'Proximity from fairway', value: fmtFeet(s.approachProximityFairway) },
    ],
    rough: [
      { label: 'GIR from rough', value: fmtPct(s.girPctFromRough) },
      { label: 'Proximity from rough', value: fmtFeet(s.approachProximityRough) },
    ],
    sand: [
      { label: 'GIR from sand', value: fmtPct(s.girPctFromSand) },
      { label: 'Proximity from sand', value: fmtFeet(s.approachProximitySand) },
    ],
  };
  const approachEfficiencyRows: DetailRow[] = [
    { label: '30-75 yds', value: fmtNum(s.approachEff30_75[selectedLie], 2) },
    { label: '75-100 yds', value: fmtNum(s.approachEff75_100[selectedLie], 2) },
    { label: '100-125 yds', value: fmtNum(s.approachEff100_125[selectedLie], 2) },
    { label: '125-150 yds', value: fmtNum(s.approachEff125_150[selectedLie], 2) },
    { label: '150-175 yds', value: fmtNum(s.approachEff150_175[selectedLie], 2) },
    { label: '175-200 yds', value: fmtNum(s.approachEff175_200[selectedLie], 2) },
    { label: '200-225 yds', value: fmtNum(s.approachEff200_225[selectedLie], 2) },
    { label: '225+ yds', value: fmtNum(s.approachEff225Plus[selectedLie], 2) },
  ];

  // The lie pills govern ONLY the by-lie block below. There is no per-lie GIR
  // by distance in GolfStats (girPct{band} is overall; only approachEff{band} is
  // keyed by lie), so the GIR-by-distance + GIR-by-hole-type boards are overall
  // across every lie and must NOT sit under the lie filter.
  const lieLabel = `${selectedLie.charAt(0).toUpperCase()}${selectedLie.slice(1)}`;
  const lieHasData = !allDash(lieRows[selectedLie]) || !allDash(approachEfficiencyRows);
  const hasAny = hasGirBands || !allDash(girByPar) || lieHasData;
  if (!hasAny) return null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5 px-1">
        <SectionHeading as="div">Approach breakdowns</SectionHeading>
        <span className="font-fw-sans text-caption text-text-tertiary">
          Greens hit, proximity, and efficiency by distance, hole type, and the lie you played from.
        </span>
      </div>

      {/* Lie-AGNOSTIC boards — overall across every lie, so they sit ABOVE the
          lie filter. The lie pills below do not change these. */}
      {hasGirBands ? (
        <GirByDistanceBoard
          bands={girBands}
          missByBand={detailedStats.approachMissByBand}
        />
      ) : null}

      {!allDash(girByPar) ? (
        <DetailGrid title="GIR by hole type" rows={girByPar} columns={3} />
      ) : null}

      {/* BY LIE — the lie pills govern ONLY this block (GIR + proximity from the
          selected lie, and efficiency by distance from it). Always renders a
          response to the pill: the data, or an honest empty state — so the
          filter is never a dead control even when a lie has no shots yet. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5 px-1">
          <h4 className="font-fw-sans text-body-sm font-medium text-text-primary">By lie</h4>
          <span className="font-fw-sans text-caption text-text-tertiary">
            Greens hit, proximity, and efficiency from the lie you played from.
          </span>
        </div>

        <div className="flex flex-wrap gap-2 px-1" aria-label="Approach lie filter">
          <ToggleChip active={selectedLie === 'fairway'} value="fairway" label="Fairway" onSelect={setSelectedLie} />
          <ToggleChip active={selectedLie === 'rough'} value="rough" label="Rough" onSelect={setSelectedLie} />
          <ToggleChip active={selectedLie === 'sand'} value="sand" label="Sand" onSelect={setSelectedLie} />
        </div>

        {lieHasData ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {!allDash(lieRows[selectedLie]) ? (
              <DetailGrid title={`${lieLabel} lie`} rows={lieRows[selectedLie]} />
            ) : null}
            {!allDash(approachEfficiencyRows) ? (
              <DetailGrid
                title={`Efficiency from ${selectedLie}`}
                hint="Average strokes to hole out"
                rows={approachEfficiencyRows}
                columns={4}
              />
            ) : null}
          </div>
        ) : (
          <Surface elevation="border" padding="md">
            <p className="font-fw-sans text-caption text-text-tertiary">
              No approach data from the {selectedLie} yet.
            </p>
          </Surface>
        )}
      </div>
    </section>
  );
}

function PuttingLegacyDetail({ detailedStats }: { detailedStats: GolfStats | null }) {
  const [selectedBreak, setSelectedBreak] = useState<PuttBreak>('left_to_right');
  if (!detailedStats) return null;
  const s = detailedStats;
  const breakStats = s.puttingByBreak[selectedBreak];
  const breakLabel =
    selectedBreak === 'left_to_right'
      ? 'Left to right'
      : selectedBreak === 'right_to_left'
        ? 'Right to left'
        : selectedBreak === 'straight'
          ? 'Straight'
          : 'Multiple breaks';

  const headline: DetailRow[] = [
    { label: 'Putts / round', value: fmtNum(s.puttsPerRound, 1) },
    { label: 'Putts / hole', value: fmtNum(s.puttsPerHole, 2) },
    { label: 'Putts / GIR', value: fmtNum(s.puttsPerGir, 2) },
    { label: '3-putts / round', value: fmtNum(s.threePuttsPerRound, 2) },
    { label: '1-putts total', value: s.totalPutts > 0 ? fmtInt(s.onePuttsTotal) : '—' },
    // Avg distance left after every putt (0 for makes) — the "approach putting" stat.
    { label: 'Approach putting avg', value: s.approachPuttAvgLeave !== null ? `${s.approachPuttAvgLeave.toFixed(1)} ft avg` : '—' },
  ];
  const makeBands: DetailRow[] = [
    { label: '0-3 ft', value: fmtPct(s.puttMakePct0_3) },
    { label: '3-5 ft', value: fmtPct(s.puttMakePct3_5) },
    { label: '5-10 ft', value: fmtPct(s.puttMakePct5_10) },
    { label: '10-15 ft', value: fmtPct(s.puttMakePct10_15) },
    { label: '15-20 ft', value: fmtPct(s.puttMakePct15_20) },
    { label: '20-25 ft', value: fmtPct(s.puttMakePct20_25) },
    { label: '25-30 ft', value: fmtPct(s.puttMakePct25_30) },
    { label: '30-35 ft', value: fmtPct(s.puttMakePct30_35) },
    { label: '35+ ft', value: fmtPct(s.puttMakePct35Plus) },
  ];
  // Approach putting: avg distance left after putts that STARTED in each band.
  // 0 for made putts; missed putts with unknown leave are excluded (null-honest).
  // Replaces the old "% of first putts per band" (percentage) display.
  const approachPuttBands: DetailRow[] = PUTT_BAND_LABELS.map(({ key, label }) => {
    // A band with no qualifying putts is omitted from the record (undefined),
    // shown null-honestly as an em dash. Present keys are always real numbers.
    const v = s.approachPuttAvgLeaveByBand[key];
    return { label, value: v !== undefined ? `${v.toFixed(1)} ft avg` : '—' };
  });
  const breakMakeBands: DetailRow[] = [
    { label: '0-3 ft', value: fmtPct(breakStats.makePct0_3) },
    { label: '3-5 ft', value: fmtPct(breakStats.makePct3_5) },
    { label: '5-10 ft', value: fmtPct(breakStats.makePct5_10) },
    { label: '10-15 ft', value: fmtPct(breakStats.makePct10_15) },
    { label: '15-20 ft', value: fmtPct(breakStats.makePct15_20) },
    { label: '20-25 ft', value: fmtPct(breakStats.makePct20_25) },
    { label: '25-30 ft', value: fmtPct(breakStats.makePct25_30) },
    { label: '30-35 ft', value: fmtPct(breakStats.makePct30_35) },
    { label: '35+ ft', value: fmtPct(breakStats.makePct35Plus) },
    { label: 'Overall make %', value: fmtPct(breakStats.overallMakePct) },
  ];
  const breakMissRows: DetailRow[] = [
    { label: 'Miss short', value: fmtPct(breakStats.missShortPct) },
    { label: 'Low side', value: fmtPct(breakStats.missLowPct) },
    { label: 'High side', value: fmtPct(breakStats.missHighPct) },
  ];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5 px-1">
        <SectionHeading as="div">Putting breakdowns</SectionHeading>
        <span className="font-fw-sans text-caption text-text-tertiary">
          Make rate and putt distances by band — filter by the break you faced.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {!allDash(headline) ? <DetailGrid title="Putting efficiency" rows={headline} columns={4} /> : null}
        {!allDash(makeBands) ? <DetailGrid title="Make % by distance" rows={makeBands} columns={3} /> : null}
        {!allDash(approachPuttBands) ? (
          <DetailGrid
            title="Approach putting by distance"
            hint="Avg feet left after a putt from each starting band (0 ft = made)"
            rows={approachPuttBands}
            columns={3}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 px-1" aria-label="Putt break filter">
        <ToggleChip active={selectedBreak === 'left_to_right'} value="left_to_right" label="L -> R" onSelect={setSelectedBreak} />
        <ToggleChip active={selectedBreak === 'right_to_left'} value="right_to_left" label="R -> L" onSelect={setSelectedBreak} />
        <ToggleChip active={selectedBreak === 'straight'} value="straight" label="Straight" onSelect={setSelectedBreak} />
        <ToggleChip active={selectedBreak === 'multiple'} value="multiple" label="Multiple" onSelect={setSelectedBreak} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {!allDash(breakMakeBands) ? (
          <DetailGrid
            title={`Make % by distance - ${breakLabel}`}
            hint={`${breakStats.totalPutts} putts with this break`}
            rows={breakMakeBands}
            columns={3}
          />
        ) : null}
        {!allDash(breakMissRows) ? (
          <DetailGrid title={`Miss direction - ${breakLabel}`} rows={breakMissRows} columns={3} />
        ) : null}
      </div>
    </section>
  );
}

function DetailedStandingsSection({
  detailedGroups,
  matrixByCategory,
  open,
  onToggle,
}: {
  detailedGroups: ReadonlyArray<(typeof CATEGORY_ORDER)[number]>;
  matrixByCategory: Map<string, Array<{ id: MetricId; row: PlayerStandingRow; cfg: MetricRenderConfig }>>;
  open: boolean;
  onToggle: () => void;
}) {
  if (detailedGroups.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
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
            open && 'rotate-180',
          )}
        />
      </button>

      {open ? (
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
                      is_womens={row.is_womens}
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
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * 6b · FULL SHOT DETAIL — one collapsed disclosure holding the heavy drill-in
 * grids that don't belong in the always-on flow: GIR by par / distance / lie,
 * approach proximity by par / lie / distance, putting make-% bands + miss
 * direction + by-break, scoring per-round / career / by-type + streaks, and the
 * personal-bests + 30-day comparison analysis readouts. Mirrors the existing
 * "Detailed standings" disclosure chrome exactly. Every grid is null-honest and
 * self-hides when its block has no data (allDash); the whole disclosure hides
 * when there is nothing to show.
 * ══════════════════════════════════════════════════════════════════════════ */
function ComprehensiveDetail({
  detailedStats,
  trendData,
  open,
  onToggle,
}: {
  detailedStats: GolfStats | null;
  trendData: TrendAnalysisResponse | null;
  open: boolean;
  onToggle: () => void;
}) {
  if (!detailedStats) return null;
  const s = detailedStats;

  // ── GIR detail ─────────────────────────────────────────────────────────────
  const girByPar: DetailRow[] = [
    { label: 'Par 3s', value: fmtPct(s.girPctPar3) },
    { label: 'Par 4s', value: fmtPct(s.girPctPar4) },
    { label: 'Par 5s', value: fmtPct(s.girPctPar5) },
  ];
  const girByDistance: DetailRow[] = [
    { label: '50–75 yds', value: fmtPct(s.girPct50_75) },
    { label: '75–100 yds', value: fmtPct(s.girPct75_100) },
    { label: '100–125 yds', value: fmtPct(s.girPct100_125) },
    { label: '125–150 yds', value: fmtPct(s.girPct125_150) },
    { label: '150–175 yds', value: fmtPct(s.girPct150_175) },
    { label: '175–200 yds', value: fmtPct(s.girPct175_200) },
    { label: '200–225 yds', value: fmtPct(s.girPct200_225) },
    { label: '225+ yds', value: fmtPct(s.girPct225Plus) },
  ];
  const girByLie: DetailRow[] = [
    { label: 'From fairway', value: fmtPct(s.girPctFromFairway) },
    { label: 'From rough', value: fmtPct(s.girPctFromRough) },
    { label: 'From sand', value: fmtPct(s.girPctFromSand) },
  ];

  // ── Approach proximity detail (feet) ─────────────────────────────────────--
  const approachByPar: DetailRow[] = [
    { label: 'Par 3s', value: fmtFeet(s.approachProximityPar3) },
    { label: 'Par 4s', value: fmtFeet(s.approachProximityPar4) },
    { label: 'Par 5s', value: fmtFeet(s.approachProximityPar5) },
  ];
  const approachByLie: DetailRow[] = [
    { label: 'From fairway', value: fmtFeet(s.approachProximityFairway) },
    { label: 'From rough', value: fmtFeet(s.approachProximityRough) },
    { label: 'From sand', value: fmtFeet(s.approachProximitySand) },
  ];
  const approachByDistance: DetailRow[] = [
    { label: '30–75 yds', value: fmtFeet(s.approachProx30_75) },
    { label: '75–100 yds', value: fmtFeet(s.approachProx75_100) },
    { label: '100–125 yds', value: fmtFeet(s.approachProx100_125) },
    { label: '125–150 yds', value: fmtFeet(s.approachProx125_150) },
    { label: '150–175 yds', value: fmtFeet(s.approachProx150_175) },
    { label: '175–200 yds', value: fmtFeet(s.approachProx175_200) },
    { label: '200–225 yds', value: fmtFeet(s.approachProx200_225) },
    { label: '225+ yds', value: fmtFeet(s.approachProx225Plus) },
  ];

  // ── Putting detail ─────────────────────────────────────────────────────────
  const puttHeadline: DetailRow[] = [
    { label: 'Putts / round', value: fmtNum(s.puttsPerRound, 1) },
    { label: 'Putts / hole', value: fmtNum(s.puttsPerHole, 2) },
    { label: 'Putts / GIR', value: fmtNum(s.puttsPerGir, 2) },
    { label: '3-putts / round', value: fmtNum(s.threePuttsPerRound, 2) },
    { label: '1-putts (total)', value: s.totalPutts > 0 ? fmtInt(s.onePuttsTotal) : '—' },
  ];
  const puttMakeBands: DetailRow[] = [
    { label: '0–3 ft', value: fmtPct(s.puttMakePct0_3) },
    { label: '3–5 ft', value: fmtPct(s.puttMakePct3_5) },
    { label: '5–10 ft', value: fmtPct(s.puttMakePct5_10) },
    { label: '10–15 ft', value: fmtPct(s.puttMakePct10_15) },
    { label: '15–20 ft', value: fmtPct(s.puttMakePct15_20) },
    { label: '20–25 ft', value: fmtPct(s.puttMakePct20_25) },
    { label: '25–30 ft', value: fmtPct(s.puttMakePct25_30) },
    { label: '30–35 ft', value: fmtPct(s.puttMakePct30_35) },
    { label: '35+ ft', value: fmtPct(s.puttMakePct35Plus) },
  ];
  const puttMissDir: DetailRow[] = [
    { label: 'Miss left', value: fmtPct(s.puttMissLeftPct) },
    { label: 'Miss right', value: fmtPct(s.puttMissRightPct) },
    { label: 'Miss short', value: fmtPct(s.puttMissShortPct) },
    { label: 'Miss long', value: fmtPct(s.puttMissLongPct) },
    { label: 'Under-read (low)', value: fmtPct(s.puttMissLowPct) },
    { label: 'Over-read (high)', value: fmtPct(s.puttMissHighPct) },
  ];
  const breakMakeRows = (label: string, b: GolfStats['puttingByBreak'][keyof GolfStats['puttingByBreak']]): DetailRow => ({
    label,
    value: fmtPct(b.overallMakePct),
  });
  const puttByBreak: DetailRow[] = [
    breakMakeRows('Left-to-right', s.puttingByBreak.left_to_right),
    breakMakeRows('Straight', s.puttingByBreak.straight),
    breakMakeRows('Right-to-left', s.puttingByBreak.right_to_left),
    breakMakeRows('Multiple breaks', s.puttingByBreak.multiple),
  ];

  // ── Scoring detail ─────────────────────────────────────────────────────────
  const scoringBestWorst: DetailRow[] = [
    { label: 'Best round', value: fmtInt(s.bestRound) },
    { label: 'Worst round', value: fmtInt(s.worstRound) },
    { label: 'Scoring average', value: fmtNum(s.scoringAverage, 1) },
    { label: 'Avg to par', value: s.avgScoreToPar != null ? formatToParPerHole(s.avgScoreToPar) : '—' },
  ];
  const perRound: DetailRow[] = [
    { label: 'Eagles / round', value: fmtNum(s.eaglesPerRound, 2) },
    { label: 'Birdies / round', value: fmtNum(s.birdiesPerRound, 2) },
    { label: 'Pars / round', value: fmtNum(s.parsPerRound, 2) },
    { label: 'Bogeys / round', value: fmtNum(s.bogeysPerRound, 2) },
    { label: 'Double+ / round', value: fmtNum(s.doublePlusPerRound, 2) },
  ];
  const careerTotals: DetailRow[] = [
    { label: 'Total eagles', value: s.roundsPlayed > 0 ? fmtInt(s.totalEagles) : '—' },
    { label: 'Total birdies', value: s.roundsPlayed > 0 ? fmtInt(s.totalBirdies) : '—' },
    { label: 'Total pars', value: s.roundsPlayed > 0 ? fmtInt(s.totalPars) : '—' },
    { label: 'Total bogeys', value: s.roundsPlayed > 0 ? fmtInt(s.totalBogeys) : '—' },
    { label: 'Total double+', value: s.roundsPlayed > 0 ? fmtInt(s.totalDoublePlus) : '—' },
  ];
  const byRoundType: DetailRow[] = [
    {
      label: 'Practice',
      value: s.practiceRounds > 0 ? `${fmtNum(s.practiceScoringAvg, 1)} · ${s.practiceRounds}` : '—',
    },
    {
      label: 'Qualifying',
      value: s.qualifyingRounds > 0 ? `${fmtNum(s.qualifyingScoringAvg, 1)} · ${s.qualifyingRounds}` : '—',
    },
    {
      label: 'Tournament',
      value: s.tournamentRounds > 0 ? `${fmtNum(s.tournamentScoringAvg, 1)} · ${s.tournamentRounds}` : '—',
    },
  ];
  const streaks: DetailRow[] = [
    { label: 'Most birdies / round', value: s.roundsPlayed > 0 ? fmtInt(s.mostBirdiesRound) : '—' },
    { label: 'Most birdies in a row', value: s.roundsPlayed > 0 ? fmtInt(s.mostBirdiesRow) : '—' },
    { label: 'Most pars in a row', value: s.roundsPlayed > 0 ? fmtInt(s.mostParsRow) : '—' },
    {
      label: 'Longest no-3-putt streak',
      value: s.roundsPlayed > 0 ? `${fmtInt(s.longestNo3PuttStreak)} holes` : '—',
    },
    { label: 'Longest hole-out', value: s.longestHoleOut != null ? fmtYds(s.longestHoleOut) : '—' },
  ];

  // ── Analysis (from the already-fetched trendData) ────────────────────────--
  const pb = trendData?.personalBests ?? null;
  const personalBests: DetailRow[] = [
    { label: 'Best score', value: pb?.bestScore ? fmtInt(pb.bestScore.value) : '—' },
    {
      label: 'Best vs par',
      value: pb?.bestToPar ? formatToParPerHole(pb.bestToPar.value) : '—',
    },
    { label: 'Best GIR', value: pb?.bestGir ? fmtPct(pb.bestGir.value) : '—' },
    { label: 'Fewest putts', value: pb?.lowestPutts ? fmtInt(pb.lowestPutts.value) : '—' },
  ];
  const cmp = trendData?.periodComparison ?? null;
  const periodCompare: DetailRow[] = cmp
    ? [
        {
          label: 'Scoring avg (30d / prev)',
          value:
            cmp.last30Days.roundCount > 0
              ? `${fmtNum(cmp.last30Days.scoringAvg, 1)} / ${cmp.previous30Days.roundCount > 0 ? fmtNum(cmp.previous30Days.scoringAvg, 1) : '—'}`
              : '—',
        },
        {
          label: 'GIR % (30d / prev)',
          value:
            cmp.last30Days.roundCount > 0
              ? `${fmtPct(cmp.last30Days.girPct)} / ${cmp.previous30Days.roundCount > 0 ? fmtPct(cmp.previous30Days.girPct) : '—'}`
              : '—',
        },
        {
          label: 'Fairway % (30d / prev)',
          value:
            cmp.last30Days.roundCount > 0
              ? `${fmtPct(cmp.last30Days.fairwayPct)} / ${cmp.previous30Days.roundCount > 0 ? fmtPct(cmp.previous30Days.fairwayPct) : '—'}`
              : '—',
        },
        {
          label: 'Putts / rd (30d / prev)',
          value:
            cmp.last30Days.roundCount > 0
              ? `${fmtNum(cmp.last30Days.puttsPerRound, 1)} / ${cmp.previous30Days.roundCount > 0 ? fmtNum(cmp.previous30Days.puttsPerRound, 1) : '—'}`
              : '—',
        },
      ]
    : [];

  // Assemble the blocks that actually carry data (allDash → omit).
  const blocks: Array<{ heading: string; grids: React.ReactNode[] }> = [];

  const girGrids: React.ReactNode[] = [];
  if (!allDash(girByPar)) girGrids.push(<DetailGrid key="gir-par" title="GIR by hole type" rows={girByPar} columns={3} />);
  if (!allDash(girByLie)) girGrids.push(<DetailGrid key="gir-lie" title="GIR by lie" rows={girByLie} columns={3} />);
  if (!allDash(girByDistance)) girGrids.push(<DetailGrid key="gir-dist" title="GIR by approach distance" rows={girByDistance} columns={4} />);
  if (girGrids.length) blocks.push({ heading: 'Greens in regulation', grids: girGrids });

  const approachGrids: React.ReactNode[] = [];
  if (!allDash(approachByPar)) approachGrids.push(<DetailGrid key="ap-par" title="Proximity by hole type" rows={approachByPar} columns={3} />);
  if (!allDash(approachByLie)) approachGrids.push(<DetailGrid key="ap-lie" title="Proximity by lie" rows={approachByLie} columns={3} />);
  if (!allDash(approachByDistance)) approachGrids.push(<DetailGrid key="ap-dist" title="Proximity by approach distance" rows={approachByDistance} columns={4} />);
  if (approachGrids.length) blocks.push({ heading: 'Approach proximity', grids: approachGrids });

  const puttGrids: React.ReactNode[] = [];
  if (!allDash(puttHeadline)) puttGrids.push(<DetailGrid key="pt-head" title="Putting efficiency" rows={puttHeadline} columns={4} />);
  if (!allDash(puttMakeBands)) puttGrids.push(<DetailGrid key="pt-make" title="Make % by distance" rows={puttMakeBands} columns={3} />);
  if (!allDash(puttMissDir)) puttGrids.push(<DetailGrid key="pt-miss" title="Miss direction" rows={puttMissDir} columns={3} />);
  if (!allDash(puttByBreak)) puttGrids.push(<DetailGrid key="pt-break" title="Make % by break" rows={puttByBreak} columns={4} />);
  if (puttGrids.length) blocks.push({ heading: 'Putting', grids: puttGrids });

  const scoringGrids: React.ReactNode[] = [];
  if (!allDash(scoringBestWorst)) scoringGrids.push(<DetailGrid key="sc-bw" title="Round scoring" rows={scoringBestWorst} columns={4} />);
  if (!allDash(perRound)) scoringGrids.push(<DetailGrid key="sc-pr" title="Per round" rows={perRound} columns={3} />);
  if (!allDash(careerTotals)) scoringGrids.push(<DetailGrid key="sc-ct" title="Career totals" rows={careerTotals} columns={3} />);
  if (!allDash(byRoundType)) scoringGrids.push(<DetailGrid key="sc-rt" title="Scoring by round type" hint="Average · rounds" rows={byRoundType} columns={3} />);
  if (!allDash(streaks)) scoringGrids.push(<DetailGrid key="sc-st" title="Streaks & records" rows={streaks} columns={3} />);
  if (scoringGrids.length) blocks.push({ heading: 'Scoring', grids: scoringGrids });

  const analysisGrids: React.ReactNode[] = [];
  if (!allDash(personalBests)) analysisGrids.push(<DetailGrid key="an-pb" title="Personal bests" rows={personalBests} columns={4} />);
  if (periodCompare.length && !allDash(periodCompare)) analysisGrids.push(<DetailGrid key="an-cmp" title="Last 30 days vs previous 30" rows={periodCompare} columns={2} />);
  if (analysisGrids.length) blocks.push({ heading: 'Trends & bests', grids: analysisGrids });

  if (blocks.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group flex w-full items-center justify-between rounded-card border border-border-subtle bg-surface px-5 py-4 text-left outline-none transition-colors [transition-duration:180ms] hover:bg-surface-tint focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
      >
        <span className="flex flex-col gap-0.5">
          <span className="font-fw-display text-body font-medium text-text-primary">
            Full shot detail
          </span>
          <span className="font-fw-sans text-caption text-text-tertiary">
            {blocks.length} {blocks.length === 1 ? 'category' : 'categories'} · GIR &amp;
            approach by distance/lie, putting bands, scoring &amp; trends
          </span>
        </span>
        <ChevronDown
          className={cn(
            'h-5 w-5 flex-shrink-0 text-text-tertiary transition-transform [transition-duration:180ms] motion-reduce:transition-none',
            open && 'rotate-180',
          )}
        />
      </button>

      {open ? (
        <div className="flex flex-col gap-6 pt-1">
          {blocks.map((block) => (
            <div key={block.heading} className="flex flex-col gap-3">
              <h4 className="px-1 font-fw-sans text-body font-medium text-text-primary">
                {block.heading}
              </h4>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{block.grids}</div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * 6c · SHOT PATTERNS — the premium visual board: an approach miss map
 * (ShotDispersion) and the putting make-rate heatmap by break type. (Driving
 * spray moved to the Driving tab as the premium FairwayDrivingSpray glass
 * chart.) ADDITIVE, reuses the Fairway chart primitives verbatim. Honest:
 * a chart with no points renders state="insufficient-data" with empty data; the
 * heatmap omits any (band × break) cell whose make-% is null/non-finite; the
 * whole section is skipped when there is literally no spray data AND no putting
 * cell to paint (a starved player never sees empty boxes).
 * ══════════════════════════════════════════════════════════════════════════ */

/** Humanize a spray dominant sector into an honest "Misses tend …" takeaway. */
const SPRAY_SECTOR_TAKEAWAY: Record<string, string> = {
  center: 'Tends to find the center',
  left: 'Misses tend left',
  right: 'Misses tend right',
  short: 'Misses tend short',
  long: 'Misses tend long',
  short_left: 'Misses tend short-left',
  short_right: 'Misses tend short-right',
  long_left: 'Misses tend long-left',
  long_right: 'Misses tend long-right',
};

/** Putting heatmap distance bands → the matching PuttingBreakStats make-% field. */
const PUTT_HEATMAP_BANDS: ReadonlyArray<{
  bandLabel: string;
  field: keyof Pick<
    GolfStats['puttingByBreak']['straight'],
    | 'makePct0_3'
    | 'makePct3_5'
    | 'makePct5_10'
    | 'makePct10_15'
    | 'makePct15_20'
    | 'makePct20_25'
    | 'makePct25_30'
    | 'makePct30_35'
    | 'makePct35Plus'
  >;
}> = [
  { bandLabel: '0–3 ft', field: 'makePct0_3' },
  { bandLabel: '3–5 ft', field: 'makePct3_5' },
  { bandLabel: '5–10 ft', field: 'makePct5_10' },
  { bandLabel: '10–15 ft', field: 'makePct10_15' },
  { bandLabel: '15–20 ft', field: 'makePct15_20' },
  { bandLabel: '20–25 ft', field: 'makePct20_25' },
  { bandLabel: '25–30 ft', field: 'makePct25_30' },
  { bandLabel: '30–35 ft', field: 'makePct30_35' },
  { bandLabel: '35+ ft', field: 'makePct35Plus' },
];

/** Putting heatmap columns → the matching puttingByBreak record key. */
const PUTT_HEATMAP_COLS: ReadonlyArray<{
  colLabel: string;
  breakKey: keyof GolfStats['puttingByBreak'];
}> = [
  { colLabel: 'L → R', breakKey: 'left_to_right' },
  { colLabel: 'Straight', breakKey: 'straight' },
  { colLabel: 'R → L', breakKey: 'right_to_left' },
  { colLabel: 'Multiple', breakKey: 'multiple' },
];

function ShotPatterns({
  spray,
  putting,
}: {
  spray: SprayChartResponse | null;
  putting: GolfStats['puttingByBreak'] | null;
}) {
  // Driving spray now lives in the Driving tab (FairwayDrivingSpray, the premium
  // glass chart); this board keeps the approach miss map + the putting heatmap.
  const approachPoints: ShotPoint[] = (spray?.approach.points ?? []).map((p) => ({ x: p.x, y: p.y }));

  const approachSector = spray?.approach.dominantSector ?? null;
  const approachTakeaway =
    approachPoints.length > 0 && approachSector ? SPRAY_SECTOR_TAKEAWAY[approachSector] : undefined;

  // Putting heatmap cells — one per (band × break) with a finite make-%. A null
  // make-% paints nothing (honest gap); n carries that break's total putts.
  const heatCells: HeatCell[] = [];
  let anyBreakHasPutts = false;
  if (putting) {
    for (const { colLabel, breakKey } of PUTT_HEATMAP_COLS) {
      const breakStats = putting[breakKey];
      if (breakStats.totalPutts > 0) anyBreakHasPutts = true;
      for (const { bandLabel, field } of PUTT_HEATMAP_BANDS) {
        const pct = finite(breakStats[field]);
        if (pct === null) continue;
        heatCells.push({
          row: bandLabel,
          col: colLabel,
          value: pct / 100,
          n: breakStats.totalPutts,
          display: `${Math.round(pct)}%`,
        });
      }
    }
  }

  const heatRows = PUTT_HEATMAP_BANDS.map((b) => b.bandLabel);
  const heatCols = PUTT_HEATMAP_COLS.map((c) => c.colLabel);
  const puttingState =
    anyBreakHasPutts && heatCells.length > 0 ? undefined : ('insufficient-data' as const);

  // Skip the whole section when there is literally nothing to show — no spray
  // points in either family AND no putting cell to paint.
  const hasAnyShotData =
    approachPoints.length > 0 || (anyBreakHasPutts && heatCells.length > 0);
  if (!hasAnyShotData) return null;

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>Shot patterns</SectionHeading>
      <ShotDispersion
        overline="Approach"
        title="Approach miss map"
        subtitle="Proximity & direction vs target"
        takeaway={approachTakeaway}
        data={approachPoints}
        state={approachPoints.length > 0 ? undefined : 'insufficient-data'}
      />
      <PuttingHeatmap
        overline="Putting"
        title="Make rate by break & distance"
        subtitle="Make % by distance band and break type"
        rows={heatRows}
        cols={heatCols}
        cells={heatCells}
        state={puttingState}
      />
    </section>
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
