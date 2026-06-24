'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · FairwayStatsCockpit — the shared stats BODY
 * ----------------------------------------------------------------------------
 * Single strokes-gained stats surface used by:
 *   • Player own-stats     /golf/dashboard/stats
 *   • Coach player drill   /golf/dashboard/stats/players/[id]
 *
 * Owns data fetch (keyed by playerId), load/error/empty states, and the
 * 10-tab FairwayStatsDisplay. Page chrome comes from StatsPageShell on the
 * route — this component renders no masthead.
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
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Printer, ArrowRight, RotateCw, TrendingDown, TrendingUp } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  Surface,
  Button,
  EmptyState,
  Skeleton,
  InlineNotice,
} from '@/components/fairway';
import { StatsSection } from '@/components/fairway/pages/stats/StatsSection';
import { StatsHeroBand } from '@/components/fairway/pages/stats/StatsHeroBand';
import { FairwayStatsDisplay } from '@/components/fairway/pages/stats/FairwayStatsDisplay';
import { buildVitalsDeltas } from '@/components/fairway/pages/stats/FairwayStatsPanels';
import { coachHelmRoutes } from '@/lib/coachhelm/fairway-routes';
import { generateStatisticalStrengthsWeaknesses } from '@/lib/golf/strokes-gained';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';

// REUSED UNCHANGED loaders — the legacy detailed stats + trend analysis.
import {
  getDetailedStats,
  getTrendAnalysis,
  getSprayChartData,
  getCourseBreakdown,
  getWorstHoleAnalysis,
} from '@/app/golf/actions/stats-data';
import type {
  TrendAnalysisResponse,
  SprayChartResponse,
  CourseBreakdownResponse,
  WorstHoleResponse,
} from '@/app/golf/actions/stats-data-types';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';

// Batch-0 shared reads (gated by verifyPlayerAccess inside each export).
import {
  getPlayerLeakMaps,
  getPlayerStandingRows,
} from '@/app/golf/actions/stats-leak-maps';
import type {
  PlayerLeakMaps,
  PlayerStandingRow,
} from '@/app/golf/actions/stats-leak-maps-types';

// CoachHelm cause/effect — REUSED VERBATIM. Returns the player's mined patterns
// (cause = description, effect = strokeImpact, fix = recommendation), gated by
// verifyPlayerAccess + isCoachHelmEnabledForPlayer inside the action.
import { getPlayerPatterns } from '@/app/golf/actions/insights';
type CoachHelmPattern = NonNullable<
  Awaited<ReturnType<typeof getPlayerPatterns>>['patterns']
>[number];

import type { StatsCategory } from '@/components/golf/stats/GolfStatsDisplay';

const STATS_CATEGORIES = [
  'overview',
  'progress',
  'dispersion',
  'scoring',
  'driving',
  'approach',
  'putting',
  'scrambling',
  'strokes-gained',
  'analysis',
] as const satisfies readonly StatsCategory[];

const TAB_PARAM = 'tab';

function isStatsCategory(value: string | null | undefined): value is StatsCategory {
  return value != null && (STATS_CATEGORIES as readonly string[]).includes(value);
}

function resolveStatsTab(tabParam: string | null, defaultTab: StatsCategory): StatsCategory {
  if (!tabParam) return defaultTab;
  if (isStatsCategory(tabParam)) return tabParam;
  return defaultTab;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Props — the consumer hands a resolved playerId. (No useGolfUser here; the
 * shell/header that wraps the cockpit owns identity + role.)
 * ────────────────────────────────────────────────────────────────────────── */
export interface FairwayStatsCockpitProps {
  playerId: string;
  className?: string;
  /**
   * True when the viewer is the player whose stats these are (the own-stats
   * route). Drives the cold-start CTA — only the player can log a round, so a
   * coach drill-down (which omits this) gets no player-only action. Defaults
   * to false so the roster profile path stays CTA-free.
   */
  isOwnStats?: boolean;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────────────── */

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

export function FairwayStatsCockpit({ playerId, className, isOwnStats = false }: FairwayStatsCockpitProps) {
  const [detailedStats, setDetailedStats] = useState<GolfStats | null>(null);
  const [trendData, setTrendData] = useState<TrendAnalysisResponse | null>(null);
  const [standingRows, setStandingRows] = useState<PlayerStandingRow[] | null>(null);
  const [leakMaps, setLeakMaps] = useState<PlayerLeakMaps | null>(null);
  const [sprayData, setSprayData] = useState<SprayChartResponse | null>(null);
  const [courseBreakdown, setCourseBreakdown] = useState<CourseBreakdownResponse | null>(null);
  const [worstHoleData, setWorstHoleData] = useState<WorstHoleResponse | null>(null);
  const [patterns, setPatterns] = useState<CoachHelmPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const defaultTab: StatsCategory = isOwnStats ? 'scoring' : 'overview';

  // ── P355 · Tab persistence — sync the active tab to the `?tab=` search param ─
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get(TAB_PARAM);
  const activeTab = resolveStatsTab(tabParam, defaultTab);

  const handleTabChange = useCallback(
    (value: StatsCategory) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === defaultTab) params.delete(TAB_PARAM);
      else params.set(TAB_PARAM, value);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams, defaultTab],
  );

  const loadAll = useCallback(async (id: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const [detailedRes, trendRes, standingRes, leakRes, patternsRes, sprayRes, courseRes, worstRes] =
        await Promise.allSettled([
        getDetailedStats(id, 'overall'),
        getTrendAnalysis(id),
        getPlayerStandingRows(id),
        getPlayerLeakMaps(id),
        getPlayerPatterns(id),
        getSprayChartData(id, 'overall'),
        getCourseBreakdown(id),
        getWorstHoleAnalysis(id),
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
        // Leak fetch genuinely FAILED (rejected or success:false) — clear any
        // stale maps so the Approach/Putting bands render an honest "couldn't
        // load — retry" notice instead of masking the failure as the
        // insufficient-data empty state. (P354)
        setLeakMaps(null);
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
      if (courseRes.status === 'fulfilled') {
        setCourseBreakdown(courseRes.value);
      } else {
        setCourseBreakdown(null);
      }
      if (worstRes.status === 'fulfilled') {
        setWorstHoleData(worstRes.value);
      } else {
        setWorstHoleData(null);
      }

      // ── Real-failure detection (distinct from emptiness) ──────────────────
      // getDetailedStats / getTrendAnalysis swallow every error and RESOLVE with
      // empty data, so they can't tell "no rounds" from "backend down". The two
      // PRIMARY strokes-gained fetches DO report failure honestly: they reject,
      // or resolve `{ success:false }` on a caught error / access denial (an
      // empty player resolves `{ success:true, data:[] }`). Treat a failure of
      // BOTH primaries as a genuine backend failure → render the error surface
      // (explain + retry), never the "More rounds needed" empty.
      const standingFailed =
        standingRes.status === 'rejected' ||
        (standingRes.status === 'fulfilled' && !standingRes.value.success);
      const leakFailed =
        leakRes.status === 'rejected' ||
        (leakRes.status === 'fulfilled' && !leakRes.value.success);

      if (standingFailed && leakFailed) {
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

  const coachHelmReads = useMemo(() => {
    return [...patterns]
      .filter((p) => finite(p.strokeImpact) !== null && p.strokeImpact !== 0)
      .sort((a, b) => Math.abs(b.strokeImpact) - Math.abs(a.strokeImpact))
      .slice(0, 3);
  }, [patterns]);

  const { strengths: statisticalStrengths, weaknesses: statisticalWeaknesses } = useMemo(() => {
    if (!detailedStats) {
      return { strengths: undefined, weaknesses: undefined };
    }
    return generateStatisticalStrengthsWeaknesses(detailedStats);
  }, [detailedStats]);

  const standingByMetric = useMemo(() => {
    const map = new Map<string, PlayerStandingRow>();
    for (const row of standingRows ?? []) map.set(row.metric_id, row);
    return map;
  }, [standingRows]);

  const sgTotal = standingByMetric.get('sg_total') ?? null;

  const SG_CATEGORIES = ['sg_ott', 'sg_approach', 'sg_around_green', 'sg_putting'] as const;

  const gainLeak = useMemo(() => {
    const scored = SG_CATEGORIES.map((id) => {
      const row = standingByMetric.get(id);
      const cfg = getMetricRenderConfig(id);
      if (!row || !cfg) return null;
      const value = finite(row.player_value);
      return value === null ? null : { label: cfg.display_label, value };
    }).filter((x): x is { label: string; value: number } => x != null);
    if (scored.length < 2) return null;
    let best = scored[0]!;
    let worst = scored[0]!;
    for (const s of scored) {
      if (s.value > best.value) best = s;
      if (s.value < worst.value) worst = s;
    }
    if (best.label === worst.label) return null;
    return { best, worst };
  }, [standingByMetric]);

  const vitalsDeltas = useMemo(() => buildVitalsDeltas(trendData), [trendData]);

  // ── Honest cold-start: no standing rows AND no rounds AND no leak data ─────
  const roundsAnalyzed = detailedStats?.roundsPlayed ?? 0;
  const hasStanding = (standingRows?.length ?? 0) > 0;
  const hasLeak =
    !!leakMaps &&
    (leakMaps.putting.some((b) => b.sample_n > 0) ||
      leakMaps.approach.some((b) => b.sample_n > 0));
  // Cold-start only renders when the fetches genuinely SUCCEEDED with zero data —
  // never when a real backend failure left the (swallowed-to-empty) state bare.
  // The error surface owns that case (gated by loadError above).
  const isColdStart =
    !loading && !loadError && !hasStanding && roundsAnalyzed === 0 && !hasLeak;

  // ── States ─────────────────────────────────────────────────────────────────
  if (loading) return <StatsLoading className={className} />;

  if (loadError) {
    return (
      <Surface padding="lg" className={className}>
        <InlineNotice
          tone="danger"
          title="Couldn’t load stats"
          action={
            <Button
              variant="secondary"
              size="sm"
              busy={loading}
              leftIcon={<RotateCw className="h-4 w-4" aria-hidden />}
              onClick={() => void loadAll(playerId)}
            >
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

  return (
    <div className={cn('flex flex-col gap-8', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="font-fw-sans text-caption text-text-tertiary">
          Tour benchmarks · team context · leak maps update as rounds are logged.
        </p>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<Printer className="h-4 w-4" aria-hidden />}
          onClick={() => window.print()}
        >
          Print / PDF
        </Button>
      </div>

      {detailedStats?.truncated ? (
        <InlineNotice tone="warning" title="Showing the most recent rounds">
          Stats below reflect the most recent 100 rounds. Older rounds are not included.
        </InlineNotice>
      ) : null}

      {coachHelmReads.length > 0 ? (
        <StatsSection title="What CoachHelm sees" accent="accent">
          <div className="mb-3 flex justify-end">
            <Link
              href={coachHelmRoutes.playerBrief(playerId)}
              className="inline-flex items-center gap-1 rounded-fw-sm font-fw-sans text-label font-medium text-accent-600 outline-none transition-colors hover:text-accent-700 focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              Open player brief
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {coachHelmReads.map((p) => (
              <CauseEffectCard key={p.id} pattern={p} />
            ))}
          </div>
        </StatsSection>
      ) : null}

      <StatsHeroBand
        sgTotal={sgTotal}
        standingRows={standingRows}
        detailedStats={detailedStats}
        gainLeak={gainLeak}
        vitalsDeltas={vitalsDeltas}
      />

      {detailedStats ? (
        <FairwayStatsDisplay
          stats={detailedStats}
          playerId={playerId}
          isCoachView={!isOwnStats}
          activeCategory={activeTab}
          onCategoryChange={handleTabChange}
          trendData={trendData}
          sprayData={sprayData}
          leakMaps={leakMaps}
          standingRows={standingRows}
          courseBreakdown={courseBreakdown}
          worstHoleData={worstHoleData}
          statisticalStrengths={statisticalStrengths}
          statisticalWeaknesses={statisticalWeaknesses}
        />
      ) : null}
    </div>
  );
}

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
