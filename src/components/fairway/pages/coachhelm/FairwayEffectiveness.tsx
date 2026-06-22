'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · FairwayEffectiveness — the INSTRUMENT COCKPIT
 * ----------------------------------------------------------------------------
 * The flagship effectiveness surface, mounted over /golf/dashboard/analytics/
 * coachhelm inside `CoachHelmShell active="effectiveness"`. It answers "is
 * CoachHelm actually helping" — but reads as a premium performance COCKPIT, not
 * a dashboard of equal cards. The data visualization IS the hero art.
 *
 * ── THE COCKPIT (organized, clearly-ranked, live) ───────────────────────────
 * The first screenful is one instrument cluster, ranked focal → secondary →
 * tertiary, on layered frosted-glass instrument panels that float above the
 * canvas wash:
 *
 *   PRIMARY (focal, raised glass) — a flat, clean hero of overall prediction
 *     ACCURACY (climbing toward ~70%) rendered as the huge mono Readout (size
 *     "hero") with a Climbing/Holding delta chip, PAIRED below with the accuracy
 *     RIBBON (the bold filled rising trend, with its own coin-flip benchmark
 *     tick) inside the same raised panel. The cockpit centerpiece.
 *   SECONDARY rail — the OUTCOMES instrument (a chunky SegmentBar of improved /
 *     no-change / worsened with the improvement-rate called out big — the now-
 *     REAL "is CoachHelm helping" payoff), and a small calibration Readout
 *     paired with a resolved-count Readout.
 *   TERTIARY foot row — micro Readouts: insights surfaced, mean abs error,
 *     patterns resolved.
 *
 *   BELOW the cockpit — pattern impact as the diverging StrokesGainedTornado on
 *   a matte Surface, then a compact error-mix read. Then a QUIET secondary
 *   Segmented drill-down (Predictions / Insights / Patterns) for the deeper data.
 *
 * ── PRESERVED LOGIC (imported + called UNCHANGED) ───────────────────────────
 * The interaction core hits the SAME four server actions with the SAME shapes:
 *   • handleRefresh — re-fetches all four over the active range
 *   • handleRange   — re-fetches all four over the newly-selected range
 * No data fetching, score weighting, or label maps change — those live in
 * coachhelm-analytics.ts and are consumed as-is. This is a PRESENTATION rebuild.
 *
 * ── HONESTY (DESIGN-SYSTEM §0 #8, §5.4, §7.4) ───────────────────────────────
 * A starved figure becomes a DIM instrument that reads "awaiting signal — N of
 * M" (a calibrating gauge / readout), never an authoritative 0% or a fake line.
 * Untrusted strings in data are rendered as text, never interpreted.
 *
 * ADDITIVE ONLY — consumed only behind the isRedesignEnabled() route fork.
 * Renders inside a `.fairway-ds` scope on a `bg-canvas` page.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Shell (the route mounts THIS body inside it). ────────────────────────────
import { CoachHelmShell } from './CoachHelmShell';

// ── PRESERVED LOGIC — the four effectiveness loaders + their data contracts,
//    imported UNCHANGED. We only re-architect how their output is presented. ──
import {
  getCoachHelmOverview,
  getInsightEffectiveness,
  getPredictionPerformance,
  getPatternImpact,
  // P1-12 — unified effectiveness LEDGER rollup. Real exposure/action/outcome
  // counts per insight id, gated by team access. Returns a plain record map.
  getInsightTrustSignals,
  type CoachHelmOverviewData,
  type InsightEffectivenessData,
  type PredictionPerformanceData,
  type PatternImpactData,
  type ConfidenceBucket,
} from '@/app/golf/actions/coachhelm-analytics';
// The ledger's shared trust-signal shape (status ladder + recent trend).
import type { TrustSignal, TrustStatus } from '@/lib/coachhelm/v3/effectiveness/event-ledger';
// Recent insights (id + title + type) to feed the per-insight trust table — the
// ledger rollup is keyed by REAL insight id, so we resolve a short window here.
import { searchInsights } from '@/app/golf/actions/insight-management';
import type { InsightWithPlayer } from '@/lib/coachhelm/insight-types';

// ── Fairway kit — the INSTRUMENT cockpit pieces + the supporting primitives. ──
import {
  // Cockpit surfaces + layout + readout.
  InstrumentPanel,
  InstrumentCluster,
  Readout,
  // The flat chart instruments still in use.
  Ribbon,
  SegmentBar,
  StrokesGainedTornado,
  // Supporting primitives (drill-downs + matte reads + states).
  Segmented,
  Button,
  StatTile,
  ChartCard,
  BarCompare,
  InsufficientData,
  EmptyState,
  InlineNotice,
  SkeletonCard,
  SkeletonText,
  Surface,
  Badge,
  fairwayToast,
  formatPercent,
  type RibbonPoint,
  type SegmentBarPart,
  type BarCompareDatum,
  type SGCategory,
} from '@/components/fairway';

/* ────────────────────────────────────────────────────────────────────────────
 * Honesty thresholds (resolved decisions — deterministic product rule)
 *  • per-bucket InsufficientData when a ConfidenceBucket has < 5 resolved
 *  • a global low-confidence caption while total resolved < 50
 *  • the gauge/ribbon need ≥ 2 validated points before they read a value
 * ─────────────────────────────────────────────────────────────────────────── */
const BUCKET_MIN_RESOLVED = 5;
const GLOBAL_LOW_CONFIDENCE_RESOLVED = 50;
const GAUGE_MIN_RESOLVED = 2;

/* ════════════════════════════════════════════════════════════════════════════
 * P1-12 — INSIGHT TRUST LAYER (unified event-ledger rollup)
 * ----------------------------------------------------------------------------
 * Everything below reads ONLY from the ledger rollup (getInsightTrustSignals →
 * getInsightEffectivenessSignals). A signal is shown/acted/worked/measured by
 * COUNT of real rows; absence of evidence reads as `new_hypothesis`, never as a
 * fake success. The chip, the KPI band, and the per-insight table all derive
 * from the SAME TrustSignal shape — one accent (helm green) for positive, amber
 * for caution, fw-danger for regression.
 * ══════════════════════════════════════════════════════════════════════════ */

/** Maximum number of recent insights we resolve for the per-insight trust table. */
const TRUST_TABLE_LIMIT = 24;

/** A premium, restrained presentation contract per trust status. */
interface TrustChipSpec {
  /** Fairway status family the Badge primitive maps to its token fill. */
  tone: 'accent' | 'success' | 'warning' | 'neutral' | 'danger';
  /** The tiny leading dot color (token class, never hex). */
  dot: string;
  /** Short editorial label used when no per-signal count is available. */
  shortLabel: string;
  /** Human-readable status name for tooltips + a11y. */
  fullLabel: string;
}

const TRUST_SPECS: Record<TrustStatus, TrustChipSpec> = {
  proven: {
    tone: 'accent',
    dot: 'bg-accent-600',
    shortLabel: 'Worked',
    fullLabel: 'Proven',
  },
  promising: {
    tone: 'success',
    dot: 'bg-accent-500',
    shortLabel: 'Working',
    fullLabel: 'Promising',
  },
  needs_validation: {
    tone: 'warning',
    dot: 'bg-warm-500',
    shortLabel: 'Needs validation',
    fullLabel: 'Needs validation',
  },
  new_hypothesis: {
    tone: 'neutral',
    dot: 'bg-text-tertiary',
    shortLabel: 'New hypothesis',
    fullLabel: 'New hypothesis',
  },
  underperforming: {
    tone: 'danger',
    dot: 'bg-fw-danger',
    shortLabel: 'Last 3 worsened',
    fullLabel: 'Underperforming',
  },
};

/**
 * The chip COPY is honesty-first. Proven/promising read as a worked/measured
 * ratio ("Worked 7/11"); the thin states read as their status word; the
 * underperforming state names the regression. Always returns a short, scannable
 * string under ~16 chars where possible.
 */
function trustChipLabel(signal: TrustSignal): string {
  const spec = TRUST_SPECS[signal.status];
  if ((signal.status === 'proven' || signal.status === 'promising') && signal.measured > 0) {
    return `${spec.shortLabel} ${signal.worked}/${signal.measured}`;
  }
  return spec.shortLabel;
}

/** A descriptive title/aria string — the full story for tooltip + screen reader. */
function trustChipTitle(signal: TrustSignal): string {
  const spec = TRUST_SPECS[signal.status];
  const parts = [`${spec.fullLabel}.`];
  if (signal.measured > 0) {
    parts.push(`Worked ${signal.worked} of ${signal.measured} measured outcome${signal.measured === 1 ? '' : 's'}.`);
  } else {
    parts.push('No outcomes measured yet.');
  }
  parts.push(`Shown ${signal.shown} · Acted ${signal.acted}.`);
  if (signal.recentTrend) {
    parts.push(
      signal.recentTrend === 'up'
        ? 'Recent outcomes trending up.'
        : signal.recentTrend === 'down'
          ? 'Recent outcomes trending down.'
          : 'Recent outcomes flat.',
    );
  }
  return parts.join(' ');
}

/**
 * The TRUST CHIP — a small rounded pill (Badge primitive, tone-mapped) with a
 * tiny status dot, plus a muted `Shown N · Acted M` micro-stat. Wraps
 * gracefully, never overflows, carries a title tooltip + aria-label.
 */
function InsightTrustChip({ signal }: { signal: TrustSignal }) {
  const spec = TRUST_SPECS[signal.status];
  const label = trustChipLabel(signal);
  const title = trustChipTitle(signal);
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1" title={title}>
      <Badge
        tone={spec.tone}
        size="sm"
        aria-label={title}
        leadingIcon={
          <span className={cn('inline-block h-1.5 w-1.5 rounded-full', spec.dot)} aria-hidden />
        }
        // Badge size="sm" already sets the 11px mono-ish chip type; we only add
        // the mono face + tight tracking + tabular figures on top.
        className="font-fw-mono tracking-tight tabular-nums"
      >
        {label}
      </Badge>
      <span className="font-fw-mono text-caption font-normal tabular-nums text-text-tertiary whitespace-nowrap">
        Shown {signal.shown} · Acted {signal.acted}
      </span>
    </span>
  );
}

/** A compact, single-glyph recent-trend marker for the table (token color). */
function TrustTrendGlyph({ trend }: { trend: TrustSignal['recentTrend'] }) {
  if (trend === 'up') {
    return (
      <span className="inline-flex items-center gap-1 text-accent-700" title="Recent outcomes trending up">
        <TrendingUp className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">Trending up</span>
      </span>
    );
  }
  if (trend === 'down') {
    return (
      <span className="inline-flex items-center gap-1 text-fw-danger" title="Recent outcomes trending down">
        <TrendingDown className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">Trending down</span>
      </span>
    );
  }
  if (trend === 'flat') {
    return (
      <span className="inline-flex items-center gap-1 text-text-tertiary" title="Recent outcomes flat">
        <Minus className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">Flat</span>
      </span>
    );
  }
  return (
    <span className="text-text-tertiary" title="No measured trend yet" aria-label="No measured trend yet">
      —
    </span>
  );
}

/** The page LEADS with the cockpit; the rest are quiet secondary drill-downs. */
type ViewType = 'cockpit' | 'predictions' | 'insights' | 'patterns';
type DateRangeType = '7d' | '14d' | '30d' | '60d' | '90d';

const VIEWS: ReadonlyArray<{ id: ViewType; label: string }> = [
  { id: 'cockpit', label: 'Overview' },
  { id: 'predictions', label: 'Predictions' },
  { id: 'insights', label: 'Insights' },
  { id: 'patterns', label: 'Patterns' },
];

const DATE_RANGES: ReadonlyArray<{ id: DateRangeType; label: string; days: number }> = [
  { id: '7d', label: '7d', days: 7 },
  { id: '14d', label: '14d', days: 14 },
  { id: '30d', label: '30d', days: 30 },
  { id: '60d', label: '60d', days: 60 },
  { id: '90d', label: '90d', days: 90 },
];

const rangeDays = (id: DateRangeType): number =>
  DATE_RANGES.find((r) => r.id === id)?.days ?? 30;

/** Compact "just now / Nm ago / Nh ago" for the refresh freshness line. */
const RELATIVE_TIME = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' });
function formatFreshness(at: Date | null): string {
  if (!at) return '';
  const seconds = Math.round((Date.now() - at.getTime()) / 1000);
  if (seconds < 45) return 'Updated just now';
  if (seconds < 3600) return `Updated ${RELATIVE_TIME.format(-Math.round(seconds / 60), 'minute')}`;
  if (seconds < 86400) return `Updated ${RELATIVE_TIME.format(-Math.round(seconds / 3600), 'hour')}`;
  return `Updated ${RELATIVE_TIME.format(-Math.round(seconds / 86400), 'day')}`;
}

export interface FairwayEffectivenessProps {
  /** Team scope for the four re-fetches (the SAME teamId the SSR fetch used). */
  teamId: string;
  /** Carried for parity with the legacy props; unused presentationally. */
  coachId?: string;
  /** SSR Promise.all results passed UNCHANGED from the route (may be undefined). */
  initialOverview?: CoachHelmOverviewData;
  initialEffectiveness?: InsightEffectivenessData;
  initialPerformance?: PredictionPerformanceData;
  initialPatternImpact?: PatternImpactData;
  /** Urgent+high open signal count for the shell's Signals badge. */
  signalCount?: number | null;
  /**
   * Default view + range from the route. The default is now the COCKPIT
   * (not the predictions-detail drill-down).
   */
  initialView?: ViewType;
  initialRange?: DateRangeType;
}

export function FairwayEffectiveness({
  teamId,
  // coachId now feeds the P1-12 trust layer (resolves this coach's recent
  // insights for the per-insight ledger rollup). Underscore-prefixed for parity
  // with the legacy prop name; it is consumed by useInsightTrust below.
  coachId: _coachId,
  initialOverview,
  initialEffectiveness,
  initialPerformance,
  initialPatternImpact,
  signalCount,
  initialView = 'cockpit',
  initialRange = '30d',
}: FairwayEffectivenessProps) {
  const [activeView, setActiveView] = React.useState<ViewType>(initialView);
  const [selectedRange, setSelectedRange] = React.useState<DateRangeType>(initialRange);
  // React 19 transition keeps the skeleton-then-cross-fade pending treatment.
  const [isPending, startTransition] = React.useTransition();

  const [overview, setOverview] = React.useState(initialOverview);
  const [effectiveness, setEffectiveness] = React.useState(initialEffectiveness);
  const [performance, setPerformance] = React.useState(initialPerformance);
  const [patternImpact, setPatternImpact] = React.useState(initialPatternImpact);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  // Refresh freshness — when the instruments last took on new data. Seeded from
  // the SSR overview snapshot, advanced on every successful re-fetch so the
  // "Updated …" line gives visible completion feedback even when numbers match.
  const [lastRefreshedAt, setLastRefreshedAt] = React.useState<Date | null>(() =>
    initialOverview?.lastUpdated ? new Date(initialOverview.lastUpdated) : null,
  );
  // Tick once a minute so the relative "Updated …" label stays honest.
  const [, forceFreshnessTick] = React.useState(0);
  React.useEffect(() => {
    const id = window.setInterval(() => forceFreshnessTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // ── PRESERVED interaction core — same calls as CoachHelmAnalyticsDashboard ──
  // handleRefresh re-fetches ALL four over the active range.
  const handleRefresh = React.useCallback(() => {
    setLoadError(null);
    startTransition(async () => {
      const days = rangeDays(selectedRange);
      const end = new Date();
      const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

      const [overviewResult, effectivenessResult, performanceResult, patternResult] =
        await Promise.all([
          getCoachHelmOverview(teamId, { start, end }),
          getInsightEffectiveness(teamId, { start, end }),
          getPredictionPerformance(teamId, { start, end }),
          getPatternImpact(teamId, { start, end }),
        ]);

      if (overviewResult.success) setOverview(overviewResult.data);
      if (effectivenessResult.success) setEffectiveness(effectivenessResult.data);
      if (performanceResult.success) setPerformance(performanceResult.data);
      if (patternResult.success) setPatternImpact(patternResult.data);

      const firstError =
        (!overviewResult.success && overviewResult.error) ||
        (!effectivenessResult.success && effectivenessResult.error) ||
        (!performanceResult.success && performanceResult.error) ||
        (!patternResult.success && patternResult.error) ||
        null;
      if (firstError) {
        setLoadError(firstError);
      } else {
        // Visible completion feedback — confirms the refresh landed even when
        // the figures are identical (Nielsen #1 visibility of system status).
        setLastRefreshedAt(new Date());
        fairwayToast.success('Instruments refreshed', {
          description: `Latest accuracy and outcomes over the last ${rangeDays(selectedRange)} days.`,
        });
      }
    });
  }, [selectedRange, teamId]);

  // handleRange re-fetches the range-scoped reads (overview included, so the
  // "Insights surfaced" tertiary readout always matches the active window).
  const handleRange = React.useCallback(
    (range: DateRangeType) => {
      setSelectedRange(range);
      setLoadError(null);
      startTransition(async () => {
        const days = rangeDays(range);
        const end = new Date();
        const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

        const [overviewResult, effectivenessResult, performanceResult, patternResult] =
          await Promise.all([
            getCoachHelmOverview(teamId, { start, end }),
            getInsightEffectiveness(teamId, { start, end }),
            getPredictionPerformance(teamId, { start, end }),
            getPatternImpact(teamId, { start, end }),
          ]);

        if (overviewResult.success) setOverview(overviewResult.data);
        if (effectivenessResult.success) setEffectiveness(effectivenessResult.data);
        if (performanceResult.success) setPerformance(performanceResult.data);
        if (patternResult.success) setPatternImpact(patternResult.data);

        const firstError =
          (!overviewResult.success && overviewResult.error) ||
          (!effectivenessResult.success && effectivenessResult.error) ||
          (!performanceResult.success && performanceResult.error) ||
          (!patternResult.success && patternResult.error) ||
          null;
        if (firstError) {
          setLoadError(firstError);
        } else {
          setLastRefreshedAt(new Date());
        }
      });
    },
    [teamId],
  );

  const days = rangeDays(selectedRange);

  // ── P1-12 trust layer — resolve recent insights for this coach, then roll up
  //    their ledger trust signals (shown/acted/worked/measured). Failure-soft:
  //    any error degrades to an honest "couldn't load trust" notice, never a
  //    fabricated signal. Loaded lazily when the Insights drill-down is opened
  //    (and on first mount if it's the initial view) so the cockpit stays fast.
  const trust = useInsightTrust(_coachId, activeView === 'insights');

  // ── Shell action cluster: range Segmented + Refresh (NO infinite spinner) ──
  const freshness = formatFreshness(lastRefreshedAt);
  const actions = (
    <div className="flex items-center gap-3">
      {freshness ? (
        <span
          className="hidden font-fw-sans text-caption text-text-tertiary sm:inline"
          aria-live="polite"
        >
          {freshness}
        </span>
      ) : null}
      <Segmented<DateRangeType>
        options={DATE_RANGES.map((r) => ({ value: r.id, label: r.label }))}
        value={selectedRange}
        onValueChange={handleRange}
        size="sm"
        aria-label="Analytics date range"
      />
      <Button variant="secondary" size="sm" onClick={handleRefresh} disabled={isPending}>
        {isPending ? 'Refreshing…' : 'Refresh'}
      </Button>
    </div>
  );

  return (
    <CoachHelmShell
      active="effectiveness"
      // eslint-disable-next-line jsx-a11y/aria-role
      role="coach"
      signalCount={signalCount}
      title="Is CoachHelm helping?"
      description={`Last ${days} days of accuracy and outcomes`}
      actions={actions}
    >
      <div className="flex flex-col gap-6">
        {loadError ? (
          <InlineNotice
            tone="warning"
            title="Couldn’t refresh some instruments"
            dismissible
            onDismiss={() => setLoadError(null)}
            action={
              <Button variant="secondary" size="sm" onClick={handleRefresh}>
                Try again
              </Button>
            }
          >
            {loadError}. Showing the most recent data that loaded.
          </InlineNotice>
        ) : null}

        {isPending ? (
          <CockpitSkeleton />
        ) : activeView === 'cockpit' ? (
          <CockpitView
            overview={overview}
            effectiveness={effectiveness}
            performance={performance}
            patternImpact={patternImpact}
            days={days}
            onDrillIn={setActiveView}
          />
        ) : activeView === 'predictions' ? (
          <PredictionsSection data={performance} />
        ) : activeView === 'insights' ? (
          <InsightEffectivenessSection data={effectiveness} trust={trust} />
        ) : (
          <PatternsSection data={patternImpact} />
        )}

        {/* ── Quiet secondary drill-down switch — BELOW the cockpit. The deeper
              reads are calm sibling views, never the first screenful. ── */}
        <nav
          aria-label="Effectiveness detail views"
          className="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-5"
        >
          <span className="font-fw-display text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
            Go deeper
          </span>
          <Segmented<ViewType>
            options={VIEWS.map((v) => ({ value: v.id, label: v.label }))}
            value={activeView}
            onValueChange={(v) => setActiveView(v)}
            size="sm"
            aria-label="Effectiveness view"
          />
        </nav>
      </div>
    </CoachHelmShell>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * THE COCKPIT — the focal instrument cluster (default view)
 * ══════════════════════════════════════════════════════════════════════════ */
function CockpitView({
  overview,
  effectiveness,
  performance,
  patternImpact,
  days,
  onDrillIn,
}: {
  overview?: CoachHelmOverviewData;
  effectiveness?: InsightEffectivenessData;
  performance?: PredictionPerformanceData;
  patternImpact?: PatternImpactData;
  days: number;
  onDrillIn: (v: ViewType) => void;
}) {
  // Genuinely-empty first-run: the loaders return success with ZEROED objects
  // (not undefined) for a brand-new team, so derive emptiness from the real
  // aggregates rather than prop presence — otherwise this branch is dead and a
  // first-run coach sees a grid of dim "awaiting" gauges instead of a clear
  // "no signal yet, here's how to start" moment.
  const insightsSurfaced =
    effectiveness?.overall.totalGenerated ?? overview?.totalInsights ?? 0;
  const predictionsResolved = performance?.summary.validatedPredictions ?? 0;
  const patternsDetected = patternImpact?.patternsDetected ?? 0;
  const noSignalYet =
    insightsSurfaced === 0 && predictionsResolved === 0 && patternsDetected === 0;

  if (noSignalYet) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No effectiveness signal yet"
        description="As CoachHelm surfaces insights and predictions resolve, these instruments power up. Until outcomes are recorded, effectiveness reads as ‘awaiting signal,’ never 0%."
        action={
          <Button asChild rightIcon={<ArrowRight className="h-4 w-4" />}>
            <Link href="/golf/dashboard/development">Set up player focus areas</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* The cockpit cluster: focal hero+ribbon, flanking outcomes + calibration
          rail, foot row of micro-readouts. */}
      <InstrumentCluster
        ariaLabel="CoachHelm effectiveness instrument cluster"
        balance="focal"
        tertiaryColumns={3}
        primary={<PrimaryInstrument data={performance} days={days} />}
        secondary={[
          <OutcomesInstrument
            key="outcomes"
            data={effectiveness}
            onSeeBreakdown={() => onDrillIn('insights')}
          />,
          <CalibrationInstrument key="calibration" data={performance} />,
        ]}
        tertiary={[
          <InsightsSurfacedReadout key="surfaced" effectiveness={effectiveness} overview={overview} />,
          <MeanErrorReadout key="mae" data={performance} />,
          <PatternsResolvedReadout key="resolved" data={patternImpact} />,
        ]}
      />

      {/* Below the cockpit — the diverging pattern-impact tornado on a matte
          Surface (dense, signed, legible), then a compact error-mix read. */}
      <PatternImpactDeck data={patternImpact} onSeePatterns={() => onDrillIn('patterns')} />
      <ErrorMixDeck data={performance} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * PRIMARY INSTRUMENT — the cockpit centerpiece. A flat, clean hero of overall
 * prediction ACCURACY rendered as the huge mono Readout (size "hero"), with a
 * Climbing/Holding delta chip, on a RAISED glass panel — PAIRED below with the
 * accuracy RIBBON (the bold filled rising trend, with its coin-flip benchmark
 * tick) inset into the same panel's lower band. Live from getPredictionPerformance.
 * ─────────────────────────────────────────────────────────────────────────── */
function PrimaryInstrument({ data, days }: { data?: PredictionPerformanceData; days: number }) {
  const resolved = data?.summary.validatedPredictions ?? 0;
  const accuracy = data?.summary.overallAccuracy ?? 0;

  // The validated-only accuracy series — the only trustworthy trend.
  const series = (data?.accuracyOverTime ?? []).filter((p) => p.predictionsValidated > 0);
  const ribbonPoints: RibbonPoint[] = series.map((p) => ({ x: p.date, y: p.accuracyRate }));

  // Is accuracy climbing? Honest delta from the validated-only series.
  const firstPoint = series[0];
  const lastPoint = series[series.length - 1];
  const climbing =
    series.length >= 2 &&
    firstPoint !== undefined &&
    lastPoint !== undefined &&
    lastPoint.accuracyRate >= firstPoint.accuracyRate;

  const climbDelta =
    series.length >= 2 && firstPoint && lastPoint
      ? lastPoint.accuracyRate - firstPoint.accuracyRate
      : undefined;

  const lowConfidence = resolved > 0 && resolved < GLOBAL_LOW_CONFIDENCE_RESOLVED;

  const live = resolved >= GAUGE_MIN_RESOLVED;

  return (
    <InstrumentPanel depth="raised" padding="lg" header="Prediction accuracy" as="section" className="flex flex-col gap-6">
      {/* Flat, clean hero — the focal mono readout via the design-system
          primitive (size="hero" = 72px, on-scale), with its own live/awaiting
          honesty contract instead of a bespoke `live ? … : —`. */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <Readout
            label={`Validated predictions · last ${days} days`}
            value={accuracy}
            display={formatPercent(accuracy, 0)}
            size="hero"
            state={live ? 'live' : 'awaiting'}
            samples={live ? undefined : { have: resolved, need: GAUGE_MIN_RESOLVED }}
            awaitingLabel="Awaiting predictions"
          />
          {live && typeof climbDelta === 'number' ? (
            <span
              className={cn(
                'mb-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-fw-sans text-caption font-semibold',
                climbing ? 'bg-fw-success-bg text-fw-success' : 'bg-surface-sunken text-text-tertiary',
              )}
            >
              <span aria-hidden>{climbing ? '↗' : '→'}</span>
              {climbing ? 'Climbing' : 'Holding'} {climbDelta >= 0 ? '+' : '−'}
              {formatPercent(Math.abs(climbDelta), 0)}
            </span>
          ) : null}
        </div>
        {live ? (
          <span className="font-fw-sans text-body-sm text-text-secondary">
            of {resolved} resolved predictions proved accurate — well above a 50% coin flip.
          </span>
        ) : null}
      </div>

      {/* Accuracy over time — a clean flat line (no bezel, no nested card). */}
      <Ribbon
        title="Accuracy over time"
        data={ribbonPoints}
        benchmark={{ value: 0.5, label: 'coin flip' }}
        valueFormatter={(v) => formatPercent(v, 0)}
        seriesName="Accuracy"
        height={176}
        minPoints={GAUGE_MIN_RESOLVED}
        className="border-0 bg-transparent p-0 shadow-none backdrop-blur-none"
      />

      {lowConfidence ? (
        <p className="font-fw-sans text-caption text-text-tertiary">
          Based on {resolved} resolved prediction{resolved === 1 ? '' : 's'} — directional
          while the sample firms up toward {GLOBAL_LOW_CONFIDENCE_RESOLVED}.
        </p>
      ) : null}
    </InstrumentPanel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * OUTCOMES INSTRUMENT (secondary) — the payoff. A chunky SegmentBar of insight
 * outcomes (improved / no change / worsened) with the improvement-rate called
 * out BIG. NOW REAL from getInsightEffectiveness. Length-encoded; honest awaiting
 * when no outcome has been recorded yet.
 * ─────────────────────────────────────────────────────────────────────────── */
function OutcomesInstrument({
  data,
  onSeeBreakdown,
}: {
  data?: InsightEffectivenessData;
  onSeeBreakdown: () => void;
}) {
  const measured = data?.overall.totalWithOutcome ?? 0;
  const generated = data?.overall.totalGenerated ?? 0;

  // Sum the per-type outcome tallies into the three honest buckets.
  const tally = (data?.byType ?? []).reduce(
    (acc, t) => ({
      improved: acc.improved + t.outcomesImproved,
      noChange: acc.noChange + t.outcomesNoChange,
      worsened: acc.worsened + t.outcomesWorsened,
    }),
    { improved: 0, noChange: 0, worsened: 0 },
  );
  const totalOutcomes = tally.improved + tally.noChange + tally.worsened;

  // Honest starved state — no captured outcomes upstream means no result yet.
  if (measured === 0 || totalOutcomes === 0) {
    return (
      <InstrumentPanel
        depth="base"
        header="Did the coaching land?"
        className="flex h-full flex-col gap-4"
      >
        <InsufficientData
          title="No focus-area outcomes recorded yet"
          description={
            generated > 0
              ? `${generated} insights have surfaced, but none has a recorded outcome yet. This becomes a real result once coaches mark focus areas improved / no change / worsened.`
              : 'No insights have surfaced in this window yet.'
          }
          unit="recorded outcomes"
          current={0}
          required={1}
        />
        <div>
          <Button
            variant="secondary"
            size="sm"
            asChild
            rightIcon={<ArrowRight className="h-4 w-4" />}
          >
            <Link href="/golf/dashboard/development">Record focus-area outcomes</Link>
          </Button>
        </div>
      </InstrumentPanel>
    );
  }

  const parts: SegmentBarPart[] = [
    { label: 'Improved', value: tally.improved, tone: 'good' },
    { label: 'No change', value: tally.noChange, tone: 'neutral' },
    { label: 'Worsened', value: tally.worsened, tone: 'caution' },
  ];

  return (
    <div className="flex h-full flex-col gap-3">
      <SegmentBar
        title="Did the coaching land?"
        takeaway={`${totalOutcomes} focus-area outcome${totalOutcomes === 1 ? '' : 's'} recorded${generated > 0 ? ` of ${generated} insights surfaced` : ''}.`}
        parts={parts}
        primary="good"
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={onSeeBreakdown}
        rightIcon={<ArrowRight className="h-4 w-4" />}
        className="self-start"
      >
        By insight type
      </Button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * CALIBRATION INSTRUMENT (secondary) — a small calibration Readout paired with a
 * resolved-count Readout, on a base glass panel. The Readout reads "does a 70%
 * call land 70% of the time" (the summary calibrationScore); it dims to
 * calibrating while no confidence band has enough resolved predictions.
 * ─────────────────────────────────────────────────────────────────────────── */
function CalibrationInstrument({ data }: { data?: PredictionPerformanceData }) {
  const resolved = data?.summary.validatedPredictions ?? 0;
  const calibration = data?.summary.calibrationScore ?? 0;
  const anyBucketReady =
    (data?.calibration ?? []).filter((b) => b.predictionsCount >= BUCKET_MIN_RESOLVED).length > 0;

  // Calibration is only trustworthy once a band has enough resolved predictions.
  const dialSamples = anyBucketReady ? resolved : 0;

  return (
    <InstrumentPanel
      depth="base"
      header="Do the odds hold up?"
      className="flex h-full flex-col gap-4"
    >
      <Readout
        value={calibration}
        display={dialSamples >= BUCKET_MIN_RESOLVED ? formatPercent(calibration, 0) : undefined}
        label="Does a 70% call land 70%?"
        size="lg"
        state={dialSamples >= BUCKET_MIN_RESOLVED ? 'live' : 'awaiting'}
        samples={dialSamples >= BUCKET_MIN_RESOLVED ? undefined : { have: resolved, need: BUCKET_MIN_RESOLVED }}
        awaitingLabel="Calibrating"
      />
      {/* The recessed resolved-count sub-readout. */}
      <InstrumentPanel depth="inset" padding="sm" className="w-full">
        <Readout
          value={resolved}
          format={{ maximumFractionDigits: 0 }}
          unit="resolved"
          label="Predictions resolved"
          size="md"
          state={resolved > 0 ? 'live' : 'awaiting'}
          samples={resolved === 0 ? { have: 0, need: GAUGE_MIN_RESOLVED } : undefined}
          awaitingLabel="Awaiting predictions"
        />
      </InstrumentPanel>
      {!anyBucketReady ? (
        <p className="font-fw-sans text-caption text-text-tertiary">
          Still calibrating — needs {BUCKET_MIN_RESOLVED} resolved predictions in a confidence
          band before it can say whether a 70% call lands 70% of the time.
        </p>
      ) : null}
    </InstrumentPanel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * TERTIARY MICRO-READOUTS — small cockpit readouts along the cluster foot.
 * Each is a base inset panel with a single honest Readout.
 * ─────────────────────────────────────────────────────────────────────────── */
function InsightsSurfacedReadout({
  effectiveness,
  overview,
}: {
  effectiveness?: InsightEffectivenessData;
  overview?: CoachHelmOverviewData;
}) {
  const surfaced = effectiveness?.overall.totalGenerated ?? overview?.totalInsights ?? 0;
  return (
    <InstrumentPanel depth="base" padding="md" className="h-full">
      <Readout
        value={surfaced}
        format={{ maximumFractionDigits: 0 }}
        label="Insights surfaced"
        size="md"
        state={surfaced > 0 ? 'live' : 'awaiting'}
        samples={surfaced === 0 ? { have: 0, need: 1 } : undefined}
        awaitingLabel="None yet"
      />
    </InstrumentPanel>
  );
}

function MeanErrorReadout({ data }: { data?: PredictionPerformanceData }) {
  const resolved = data?.summary.validatedPredictions ?? 0;
  const mae = data?.summary.meanAbsoluteError ?? 0;
  return (
    <InstrumentPanel depth="base" padding="md" className="h-full">
      <Readout
        value={mae}
        format={{ maximumFractionDigits: 2 }}
        label="Mean abs. error"
        size="md"
        state={resolved > 0 ? 'live' : 'awaiting'}
        samples={resolved === 0 ? { have: 0, need: GAUGE_MIN_RESOLVED } : undefined}
        awaitingLabel="Awaiting resolved"
      />
    </InstrumentPanel>
  );
}

function PatternsResolvedReadout({ data }: { data?: PatternImpactData }) {
  const resolved = data?.patternsResolved ?? 0;
  const detected = data?.patternsDetected ?? 0;
  return (
    <InstrumentPanel depth="base" padding="md" className="h-full">
      <Readout
        value={resolved}
        format={{ maximumFractionDigits: 0 }}
        label="Patterns resolved"
        size="md"
        state={detected > 0 ? 'live' : 'awaiting'}
        samples={detected === 0 ? { have: 0, need: 1 } : undefined}
        awaitingLabel="None detected"
      />
    </InstrumentPanel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * BELOW THE COCKPIT — pattern impact as the diverging StrokesGainedTornado on a
 * MATTE Surface (dense, signed, legible). Honest empty/insufficient states.
 * ─────────────────────────────────────────────────────────────────────────── */
function PatternImpactDeck({
  data,
  onSeePatterns,
}: {
  data?: PatternImpactData;
  onSeePatterns: () => void;
}) {
  if (!data || data.patternsDetected === 0) {
    return (
      <InstrumentPanel depth="base" padding="lg" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-fw-display text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
            Impact ledger
          </span>
          <h3 className="font-fw-display text-h3 text-text-primary">Pattern impact</h3>
        </div>
        <InsufficientData
          title="Nothing to credit yet"
          description="When CoachHelm detects and resolves performance patterns, their signed strokes-saved impact lands here as a diverging tornado."
          unit="detected patterns"
          current={0}
          required={1}
        />
      </InstrumentPanel>
    );
  }

  const cats: SGCategory[] = (data.topPatterns ?? [])
    .slice(0, 8)
    .map((p) => ({ label: p.playerName, value: p.strokesImpact }));

  if (cats.length === 0) {
    return (
      <InstrumentPanel depth="base" padding="lg" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-fw-display text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
            Impact ledger
          </span>
          <h3 className="font-fw-display text-h3 text-text-primary">Pattern impact</h3>
          <p className="font-fw-sans text-caption text-text-tertiary">
            {data.patternsDetected} detected · {data.patternsResolved} resolved
          </p>
        </div>
        <ChartCard
          title="Most impactful patterns"
          subtitle="Signed strokes impact per pattern"
          state="empty"
          stateMessage="No pattern has crossed the impact threshold yet."
          height={200}
        />
      </InstrumentPanel>
    );
  }

  return (
    <InstrumentPanel depth="base" padding="lg" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-fw-display text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
            Impact ledger
          </span>
          <h3 className="font-fw-display text-h3 text-text-primary">Pattern impact</h3>
          <p className="font-fw-sans text-caption text-text-tertiary">
            {data.patternsDetected} detected · {data.patternsResolved} resolved ·{' '}
            <span className="font-fw-mono text-text-secondary">
              {data.totalStrokesSaved.toFixed(1)}
            </span>{' '}
            strokes saved
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSeePatterns}
          rightIcon={<ArrowRight className="h-4 w-4" />}
        >
          All patterns
        </Button>
      </div>
      {/* Render the tornado BARE (no second frame) — it lives inside the warm
          glass instrument, not on its own white card. Height is tight to the
          number of bars so it never sprawls into empty space. */}
      <StrokesGainedTornado
        title="Most impactful patterns"
        subtitle="Signed strokes impact per pattern (green gained · amber lost)"
        takeaway="The patterns moving the most strokes for the team."
        data={cats}
        height={Math.max(132, cats.length * 46 + 56)}
        className="border-0 bg-transparent p-0 shadow-none backdrop-blur-none"
      />
    </InstrumentPanel>
  );
}

/** Error mix — a compact matte read; a one-line chip when uncategorized. */
function ErrorMixDeck({ data }: { data?: PredictionPerformanceData }) {
  const bars: BarCompareDatum[] = (data?.errorDistribution ?? []).map((e) => ({
    label: e.category,
    value: e.count,
  }));

  if (bars.length === 0) {
    return (
      <InstrumentPanel depth="base" padding="md" className="flex flex-col gap-1">
        <h4 className="font-fw-display text-h3 text-text-primary">Error mix</h4>
        <p className="font-fw-sans text-caption text-text-tertiary">
          No categorized prediction misses in this window yet — nothing to break down.
        </p>
      </InstrumentPanel>
    );
  }

  return (
    <BarCompare
      title="Error mix"
      subtitle="Categorized prediction misses"
      takeaway="The most common kinds of miss in this window."
      data={bars}
      valueFormatter={(v) => String(Math.round(v))}
      height={Math.max(160, bars.length * 38)}
    />
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * SECONDARY DRILL-DOWNS — Predictions / Insights / Patterns. Quiet sibling
 * views reached from the Segmented control BELOW the cockpit; NOT the first
 * screenful. Presentation preserved from the prior drill-downs.
 * ══════════════════════════════════════════════════════════════════════════ */

/* PREDICTIONS — the detailed prediction read (low-N honest). */
function PredictionsSection({ data }: { data?: PredictionPerformanceData }) {
  if (!data) {
    return (
      <EmptyState
        title="No prediction data yet"
        description="Predictions appear here once CoachHelm has scored upcoming rounds and they begin to resolve."
      />
    );
  }

  const resolved = data.summary.validatedPredictions;
  const total = data.summary.totalPredictions;
  const lowConfidence = resolved < GLOBAL_LOW_CONFIDENCE_RESOLVED;

  const ribbonPoints: RibbonPoint[] = (data.accuracyOverTime ?? [])
    .filter((p) => p.predictionsValidated > 0)
    .map((p) => ({ x: p.date, y: p.accuracyRate }));

  return (
    <div className="flex flex-col gap-6">
      {lowConfidence ? (
        <InlineNotice tone="info" title="Low-confidence read" icon={Sparkles}>
          Based on {resolved} resolved prediction{resolved === 1 ? '' : 's'}
          {total > 0 ? ` of ${total} made` : ''}. These figures will firm up as more
          predictions resolve — treat them as directional, not authoritative.
        </InlineNotice>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Overall accuracy"
          value={data.summary.overallAccuracy}
          format={{ style: 'percent', maximumFractionDigits: 0 }}
          goodDirection="up"
          starved={resolved === 0}
          current={resolved}
          required={GLOBAL_LOW_CONFIDENCE_RESOLVED}
          unit="resolved predictions"
        />
        <StatTile
          label="Resolved"
          value={resolved}
          format={{ maximumFractionDigits: 0 }}
          mono
          hideTrend
          starved={total === 0}
          unit="predictions"
        />
        <StatTile
          label="Mean abs. error"
          value={data.summary.meanAbsoluteError}
          format={{ maximumFractionDigits: 2 }}
          mono
          goodDirection="down"
          hideTrend
          starved={resolved === 0}
          current={resolved}
          required={BUCKET_MIN_RESOLVED}
          unit="resolved predictions"
        />
        <StatTile
          label="Calibration"
          value={data.summary.calibrationScore}
          format={{ style: 'percent', maximumFractionDigits: 0 }}
          goodDirection="up"
          hideTrend
          starved={resolved === 0}
          current={resolved}
          required={GLOBAL_LOW_CONFIDENCE_RESOLVED}
          unit="resolved predictions"
        />
      </div>

      <Ribbon
        title="Prediction accuracy over time"
        overline="Validated predictions only"
        takeaway="Share of validated predictions that proved accurate per snapshot, vs a coin-flip baseline."
        data={ribbonPoints}
        benchmark={{ value: 0.5, label: 'coin flip' }}
        valueFormatter={(v) => formatPercent(v, 0)}
        seriesName="Accuracy"
        height={300}
        minPoints={GAUGE_MIN_RESOLVED}
      />
      <PredictionsCalibrationFull buckets={data.calibration} totalResolved={resolved} />
      <ErrorMixDeck data={data} />
    </div>
  );
}

/* Full calibration card for the drill-down (per-bucket low-N honesty). */
function PredictionsCalibrationFull({
  buckets,
  totalResolved,
}: {
  buckets: ConfidenceBucket[];
  totalResolved: number;
}) {
  const ready = buckets.filter((b) => b.predictionsCount >= BUCKET_MIN_RESOLVED);
  const thin = buckets.filter(
    (b) => b.predictionsCount > 0 && b.predictionsCount < BUCKET_MIN_RESOLVED,
  );

  if (ready.length === 0) {
    return (
      <ChartCard
        title="Confidence calibration"
        subtitle="Does a 70% prediction land 70% of the time?"
        state="insufficient-data"
        stateMessage={`Every confidence bucket has fewer than ${BUCKET_MIN_RESOLVED} resolved predictions — not enough to calibrate yet.`}
        height={220}
      />
    );
  }

  const bars: BarCompareDatum[] = ready.map((b) => ({ label: b.range, value: b.actualAccuracy }));

  return (
    <div className="flex flex-col gap-3">
      <BarCompare
        title="Confidence calibration"
        subtitle="Actual accuracy within each predicted-confidence band"
        takeaway="Well-calibrated bars sit near their own confidence band."
        data={bars}
        valueFormatter={(v) => formatPercent(v, 0)}
        height={Math.max(220, bars.length * 44)}
      />
      {thin.length > 0 ? (
        <p className="px-1 font-fw-sans text-caption text-text-tertiary">
          {thin.map((b) => b.range).join(', ')} hidden — fewer than {BUCKET_MIN_RESOLVED}{' '}
          resolved predictions each. {totalResolved} resolved in total.
        </p>
      ) : null}
    </div>
  );
}

/* INSIGHTS — the TRUST drill-down. Leads with the ledger-backed trust band +
   per-insight table (P1-12), then the by-type effectiveness chart. */
function InsightEffectivenessSection({
  data,
  trust,
}: {
  data?: InsightEffectivenessData;
  trust: InsightTrustState;
}) {
  const outcomesMeasured = data?.overall.totalWithOutcome ?? 0;
  const generated = data?.overall.totalGenerated ?? 0;

  const bars: BarCompareDatum[] = (data?.byType ?? []).map((m) => ({
    label: m.insightType,
    value: m.effectivenessScore,
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* ── The ledger-backed trust layer — KPI band + per-insight table. ── */}
      <InsightTrustBand trust={trust} />
      <InsightTrustTable trust={trust} />

      {/* ── By-type effectiveness — honest until outcomes exist. ── */}
      {outcomesMeasured === 0 ? (
        <div className="flex flex-col gap-6">
          <ChartCard
            title="Insight effectiveness"
            subtitle="How well insights translate into recorded outcomes"
            state="insufficient-data"
            stateMessage="Outcome tracking not yet enabled — record focus-area outcomes to measure effectiveness."
            height={200}
          />
          <Surface padding="md">
            <div className="flex flex-col gap-3">
              <InsufficientData
                title="Effectiveness is not measured yet"
                description={
                  generated > 0
                    ? `${generated} insights have surfaced, but none has a recorded outcome yet. Effectiveness becomes meaningful once coaches mark focus areas improved / no change / worsened.`
                    : 'No insights have surfaced in this window yet.'
                }
                unit="recorded outcomes"
                current={0}
                required={1}
              />
              <div className="flex justify-center">
                <Button
                  variant="secondary"
                  size="sm"
                  asChild
                  rightIcon={<ArrowRight className="h-4 w-4" />}
                >
                  <Link href="/golf/dashboard/development">Go to Players to record outcomes</Link>
                </Button>
              </div>
            </div>
          </Surface>
        </div>
      ) : (
        <BarCompare
          title="Effectiveness by insight type"
          subtitle="Effectiveness score = action rate × 0.3 + improvement rate × 0.7"
          takeaway="Higher bars are insight types that translate into recorded improvement."
          data={bars}
          valueFormatter={(v) => formatPercent(v, 0)}
          height={Math.max(220, bars.length * 44)}
        />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * P1-12 — TRUST DATA HOOK + the band + the per-insight table
 * ══════════════════════════════════════════════════════════════════════════ */

/** A resolved insight row paired with its ledger trust signal. */
interface InsightTrustRow {
  id: string;
  title: string;
  typeLabel: string;
  playerName: string | null;
  signal: TrustSignal;
}

interface InsightTrustState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  rows: InsightTrustRow[];
  error: string | null;
}

/** Title-case a snake_cased insight type for display ("scoring_decline" → "Scoring decline"). */
function humanizeInsightType(type: string): string {
  if (!type) return 'Insight';
  const spaced = type.replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Resolve a short window of this coach's recent insights, then roll up their
 * trust signals from the unified ledger. Both fetches are failure-soft; the map
 * always covers every requested id (zero-evidence → new_hypothesis), so rows
 * never go signal-less. Runs only once `enabled` flips true (lazy — keeps the
 * cockpit's first paint fast), and once per coach.
 */
function useInsightTrust(coachId: string | undefined, enabled: boolean): InsightTrustState {
  const [state, setState] = React.useState<InsightTrustState>({
    status: 'idle',
    rows: [],
    error: null,
  });
  // Guard against re-fetching the same coach on every Insights re-open.
  const loadedForRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!enabled || !coachId) return;
    if (loadedForRef.current === coachId) return;
    loadedForRef.current = coachId;

    let cancelled = false;
    setState({ status: 'loading', rows: [], error: null });

    (async () => {
      try {
        const search = await searchInsights({
          coachId,
          page: 1,
          pageSize: TRUST_TABLE_LIMIT,
          sortBy: 'created_at',
          sortOrder: 'desc',
        });
        if (cancelled) return;
        if (!search.success) {
          setState({ status: 'error', rows: [], error: search.error ?? 'Failed to load insights' });
          return;
        }

        const insights: InsightWithPlayer[] = search.insights ?? [];
        const ids = insights.map((i) => i.id).filter((id): id is string => !!id);
        if (ids.length === 0) {
          setState({ status: 'ready', rows: [], error: null });
          return;
        }

        const trustRes = await getInsightTrustSignals(ids);
        if (cancelled) return;
        if (!trustRes.success) {
          setState({ status: 'error', rows: [], error: trustRes.error ?? 'Failed to load trust signals' });
          return;
        }

        const rows: InsightTrustRow[] = insights
          .map((i) => {
            const signal = trustRes.signals[i.id];
            if (!signal) return null;
            const playerName = i.player
              ? `${i.player.first_name ?? ''} ${i.player.last_name ?? ''}`.trim() || null
              : null;
            return {
              id: i.id,
              title: i.title || 'Untitled insight',
              typeLabel: humanizeInsightType(i.insight_type),
              playerName,
              signal,
            } satisfies InsightTrustRow;
          })
          .filter((r): r is InsightTrustRow => r !== null);

        setState({ status: 'ready', rows, error: null });
      } catch (err) {
        if (cancelled) return;
        setState({
          status: 'error',
          rows: [],
          error: err instanceof Error ? err.message : 'Failed to load insight trust',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [coachId, enabled]);

  return state;
}

/** Roll the per-row signals into the four headline KPIs for the band. */
function summarizeTrust(rows: InsightTrustRow[]) {
  let shown = 0;
  let acted = 0;
  let proven = 0;
  let needsValidation = 0;
  for (const r of rows) {
    shown += r.signal.shown;
    acted += r.signal.acted;
    if (r.signal.status === 'proven') proven += 1;
    if (r.signal.status === 'needs_validation') needsValidation += 1;
  }
  return { shown, acted, proven, needsValidation, tracked: rows.length };
}

/* ────────────────────────────────────────────────────────────────────────────
 * TRUST BAND — a clean KPI row (Shown · Acted · Proven · Needs validation).
 * One accent, restrained, editorial. Honest loading / error / empty states.
 * ─────────────────────────────────────────────────────────────────────────── */
function InsightTrustBand({ trust }: { trust: InsightTrustState }) {
  if (trust.status === 'loading' || trust.status === 'idle') {
    return (
      <Surface padding="md" aria-busy="true">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <SkeletonText lines={1} className="w-24" />
              <SkeletonText lines={1} className="w-16" />
            </div>
          ))}
        </div>
      </Surface>
    );
  }

  if (trust.status === 'error') {
    return (
      <InlineNotice tone="warning" title="Couldn’t load insight trust">
        {trust.error ?? 'The trust ledger didn’t respond.'} The effectiveness chart below still
        reflects recorded outcomes.
      </InlineNotice>
    );
  }

  if (trust.rows.length === 0) {
    return (
      <Surface padding="md">
        <InsufficientData
          title="No tracked insights yet"
          description="Once CoachHelm surfaces insights, their trust signals — how often each was shown, acted on, and actually worked — roll up here from the unified ledger."
          unit="surfaced insights"
          current={0}
          required={1}
        />
      </Surface>
    );
  }

  const k = summarizeTrust(trust.rows);
  const kpis: ReadonlyArray<{ label: string; value: number; hint: string; accent?: boolean }> = [
    { label: 'Insights shown', value: k.shown, hint: `across ${k.tracked} tracked` },
    { label: 'Acted on', value: k.acted, hint: 'coach or player taps' },
    { label: 'Proven', value: k.proven, hint: 'worked ≥60% of ≥3 measured', accent: true },
    { label: 'Needs validation', value: k.needsValidation, hint: 'too few outcomes yet' },
  ];

  return (
    <Surface padding="md">
      <div className="mb-4 flex flex-col gap-0.5">
        <span className="font-fw-display text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
          Trust ledger
        </span>
        <h3 className="font-fw-display text-h3 text-text-primary">Are these insights earning trust?</h3>
        <p className="font-fw-sans text-caption text-text-tertiary">
          Counts come only from real exposure, action, and outcome rows — absence reads as a new
          hypothesis, never as success.
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="flex flex-col gap-1">
            <dt className="font-fw-sans text-eyebrow uppercase tracking-[0.08em] text-text-tertiary">
              {kpi.label}
            </dt>
            <dd
              className={cn(
                'font-fw-mono text-h2 tabular-nums leading-none',
                kpi.accent ? 'text-accent-700' : 'text-text-primary',
              )}
            >
              {kpi.value}
            </dd>
            <span className="font-fw-sans text-caption text-text-tertiary">{kpi.hint}</span>
          </div>
        ))}
      </dl>
    </Surface>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * TRUST TABLE — one row per recent insight, each carrying its trust chip.
 * Token-only, wraps gracefully, keyboard-friendly, honest empty/loading/error.
 * ─────────────────────────────────────────────────────────────────────────── */
function InsightTrustTable({ trust }: { trust: InsightTrustState }) {
  if (trust.status === 'loading' || trust.status === 'idle') {
    return (
      <Surface padding="md" aria-busy="true">
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <SkeletonText lines={1} className="w-1/2" />
              <SkeletonText lines={1} className="w-28" />
            </div>
          ))}
        </div>
      </Surface>
    );
  }

  // Error + empty are already messaged by the band above; stay quiet here to
  // avoid double notices.
  if (trust.status === 'error' || trust.rows.length === 0) {
    return null;
  }

  return (
    <Surface padding="none">
      <div className="border-b border-border-subtle px-5 py-4">
        <h3 className="font-fw-display text-h3 text-text-primary">Insight by insight</h3>
        <p className="font-fw-sans text-caption text-text-tertiary">
          Each insight’s standing in the trust ledger — what it claimed, and whether it has held up.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            Recent insights with their trust status, recent outcome trend, and exposure counts.
          </caption>
          <thead>
            <tr className="border-b border-border-subtle">
              <th
                scope="col"
                className="px-5 py-3 font-fw-sans text-eyebrow uppercase tracking-[0.08em] text-text-tertiary"
              >
                Insight
              </th>
              <th
                scope="col"
                className="px-5 py-3 text-center font-fw-sans text-eyebrow uppercase tracking-[0.08em] text-text-tertiary"
              >
                Trend
              </th>
              <th
                scope="col"
                className="px-5 py-3 text-right font-fw-sans text-eyebrow uppercase tracking-[0.08em] text-text-tertiary"
              >
                Trust
              </th>
            </tr>
          </thead>
          <tbody>
            {trust.rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border-subtle/70 align-top last:border-b-0 hover:bg-surface-sunken/40"
              >
                <td className="px-5 py-3.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-fw-sans text-body-sm font-medium text-text-primary">
                      {row.title}
                    </span>
                    <span className="font-fw-sans text-caption text-text-tertiary">
                      {row.typeLabel}
                      {row.playerName ? <> · {row.playerName}</> : null}
                    </span>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-center align-middle">
                  <TrustTrendGlyph trend={row.signal.recentTrend} />
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex justify-end">
                    <InsightTrustChip signal={row.signal} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Surface>
  );
}

/* PATTERNS — the full pattern lifecycle + impact drill-down. */
function PatternsSection({ data }: { data?: PatternImpactData }) {
  if (!data || data.patternsDetected === 0) {
    return (
      <EmptyState
        title="No patterns detected yet"
        description="When CoachHelm detects performance patterns across the team, their lifecycle and strokes-saved impact appear here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Surface padding="md">
        <div className="flex flex-col gap-1 pb-4">
          <h3 className="font-fw-display text-h3 text-text-primary">Pattern impact</h3>
          <p className="font-fw-sans text-caption text-text-tertiary">
            {data.patternsDetected} detected · {data.patternsResolved} resolved in the last window
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            label="Strokes saved"
            value={data.totalStrokesSaved}
            format={{ maximumFractionDigits: 1 }}
            mono
            goodDirection="up"
            hideTrend
            starved={data.patternsResolved === 0}
            current={data.patternsResolved}
            required={1}
            unit="resolved patterns"
            starvedTitle="Not measured yet"
            starvedDescription="No resolved patterns to credit strokes to yet."
          />
          <StatTile
            label="Detected"
            value={data.patternsDetected}
            format={{ maximumFractionDigits: 0 }}
            mono
            hideTrend
            unit="patterns"
          />
          <StatTile
            label="Addressed"
            value={data.patternsAddressed}
            format={{ maximumFractionDigits: 0 }}
            mono
            hideTrend
            unit="patterns"
          />
          <StatTile
            label="Conversion rate"
            value={data.conversionRate}
            format={{ style: 'percent', maximumFractionDigits: 0 }}
            goodDirection="up"
            hideTrend
            starved={data.patternsDetected === 0}
            current={data.patternsResolved}
            required={1}
            unit="resolved patterns"
          />
        </div>
      </Surface>

      <PatternLifecycleFull data={data} />
      <TopPatternsCard data={data} />
    </div>
  );
}

/* Lifecycle funnel (full) — length-encoded horizontal comparison. */
function PatternLifecycleFull({ data }: { data: PatternImpactData }) {
  const lc = data.lifecycle;
  const bars: BarCompareDatum[] = [
    { label: 'Detected', value: lc.detected },
    { label: 'Confirmed', value: lc.confirmed },
    { label: 'Addressed', value: lc.addressed, highlight: true },
    { label: 'Resolved', value: lc.resolved, highlight: true },
    { label: 'Dismissed', value: lc.dismissed },
  ];
  const state = bars.every((b) => b.value === 0) ? 'empty' : 'ready';

  return (
    <BarCompare
      title="Pattern lifecycle"
      subtitle="Detected → confirmed → addressed → resolved"
      takeaway="Where detected patterns sit in their resolution journey."
      data={bars}
      valueFormatter={(v) => String(Math.round(v))}
      height={232}
      state={state}
    />
  );
}

/* Top impactful patterns — signed strokes-impact tornado. */
function TopPatternsCard({ data }: { data: PatternImpactData }) {
  const cats: SGCategory[] = (data.topPatterns ?? []).slice(0, 8).map((p) => ({
    label: p.playerName,
    value: p.strokesImpact,
  }));

  if (cats.length === 0) {
    return (
      <ChartCard
        title="Most impactful patterns"
        subtitle="Signed strokes impact per pattern (gained / lost)"
        state="empty"
        stateMessage="No high-impact patterns in this window yet."
        height={220}
      />
    );
  }

  return (
    <StrokesGainedTornado
      title="Most impactful patterns"
      subtitle="Signed strokes impact per pattern (green gained · amber lost)"
      takeaway="The patterns moving the most strokes for the team."
      data={cats}
      height={Math.max(220, cats.length * 36)}
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Skeleton — shape-matched reserved layout for the cockpit (CLS-safe).
 * ─────────────────────────────────────────────────────────────────────────── */
function CockpitSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_minmax(15rem,1fr)]">
        <SkeletonCard className="h-[520px]" />
        <div className="flex flex-col gap-6">
          <SkeletonCard className="h-60" />
          <SkeletonCard className="h-60" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SkeletonCard className="h-28" />
        <SkeletonCard className="h-28" />
        <SkeletonCard className="h-28" />
      </div>
      <SkeletonCard className="h-72" />
    </div>
  );
}
