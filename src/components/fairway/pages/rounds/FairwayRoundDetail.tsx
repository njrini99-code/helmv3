'use client';

/**
 * ============================================================================
 * Fairway · rounds · FairwayRoundDetail — the post-round RECAP surface
 * ----------------------------------------------------------------------------
 * The flag-on redesign of /golf/dashboard/rounds/[id] — the round DETAIL/recap
 * page (NOT the deep /review engine, which keeps living at [id]/review). It
 * re-skins the SAME data the legacy page already resolves on the server:
 *
 *   • golf_rounds (select *)            → the score hero + the tertiary readouts
 *   • golf_holes (per-hole, honest)     → the matte scorecard spine + the
 *                                          ScoringDistribution segmented bar
 *   • golf_rounds.ai_recap (persisted)  → the editorial lede under the hero
 *   • golf_round_reviews.round_stats    → the rolling-score Pulse + "areas to
 *     (persisted RoundReviewContent)      work on" (real, never fabricated)
 *
 * This component receives ALL of that as already-resolved, serializable props
 * from the server page (the page owns auth + the legacy fetch). It performs no
 * fetching and no writes.
 *
 * ── HONESTY (the load-bearing rule) ────────────────────────────────────────
 *   • golf_shots for these rounds is populated-but-DEGENERATE (shot_distance=0,
 *     no putt distance, one club, no distance-to-hole). So this surface renders
 *     NO ShotDispersion / driving-distance / shot-path chart and fabricates NO
 *     average distance. The scorecard + readouts come ONLY from golf_rounds +
 *     golf_holes, which ARE honest, fully-populated layers.
 *   • golf_holes.yardage is NULL → the yardage column is omitted entirely (not
 *     shown as 0).
 *   • A round with no review row yet → the readouts still render from
 *     golf_rounds and the scorecard from golf_holes; only the "areas to work on"
 *     block degrades to an EmptyState with the "Open full review" CTA. We never
 *     invent highlights or recommendations.
 *
 * Coach vs player: identical surface. A coach viewing a teammate's round sees a
 * subtle "Viewing {PlayerName}'s round" attribution line; there are no coach-
 * only or player-only sections.
 *
 * ADDITIVE + GATED — imported only behind the isRedesignEnabled() fork in
 * rounds/[id]/page.tsx. Renders inside the `.fairway-ds` scope on a bg-canvas
 * page. Built with Fairway tokens + primitives only (no bg-white / serif /
 * skeuomorphic gauges).
 * ========================================================================== */

import { useMemo, useState } from 'react';
import { cleanCourseName } from '@/lib/golf/course-name';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';

import {
  ViewHeader,
  InstrumentCluster,
  InstrumentPanel,
  Readout,
  Surface,
  Inset,
  EmptyState,
  Button,
  VIZ_COLOR,
  VIZ_EASE,
  VIZ_REVEAL_MS,
  TABULAR_NUMS,
  formatPercent,
  chartAriaLabel,
  type ChartTableData,
} from '@/components/fairway';
import { InstrumentTable } from '@/components/fairway/charts/InstrumentTable';
import { classifyTrend, TREND_COLOR } from '@/components/fairway/charts/TrendChip';
import { cn } from '@/lib/utils';
import { formatDateOnlyWeekdayLong, formatDateOnlyFull } from '@/lib/golf/date-only';

/* ───────────────────────────────────────────────────────────────────────────
 * Props — fully-resolved, serializable data from the server page.
 * ────────────────────────────────────────────────────────────────────────── */

/** One per-hole row off golf_holes (the honest, fully-populated layer). */
export interface RoundHoleRow {
  hole_number: number;
  par: number | null;
  score: number | null;
  putts: number | null;
  fairway_hit: boolean | null;
  gir: boolean | null;
  penalty_strokes: number | null;
  /** NULL on these rounds → the yardage column is omitted entirely. */
  yardage: number | null;
}

/** The slice of golf_rounds the recap surface reads (mirrors the legacy page). */
export interface RoundDetailRound {
  id: string;
  course_name: string | null;
  round_date: string;
  round_type: string | null;
  total_score: number | null;
  score_to_par: number | null;
  total_putts: number | null;
  total_fairways: number | null;
  total_fairways_hit: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  front_nine: number | null;
  back_nine: number | null;
  holes_played: number | null;
}

/** The persisted RoundReviewContent fields the recap surface reads. Optional —
 *  a round with no review row yet passes `null`. */
export interface RoundReviewStats {
  areasForImprovement?: Array<{ area: string; recommendation: string }> | null;
  recommendations?: string[] | null;
  momentumData?: Array<{ hole: number; rollingScoreToPar: number }> | null;
}

export interface FairwayRoundDetailProps {
  round: RoundDetailRound;
  holes: RoundHoleRow[];
  /** Persisted golf_rounds.ai_recap — the editorial lede. Quote verbatim. */
  aiRecap: string | null;
  /** Persisted golf_round_reviews.round_stats (subset). Null when no review. */
  reviewStats: RoundReviewStats | null;
  /** Player display name (always shown in the context line). */
  playerName: string;
  /** Whether the viewer is a coach (drives the subtle attribution line). */
  isCoach: boolean;
  /** Whether the viewer owns this round. */
  viewerIsOwner: boolean;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────────────── */

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** Signed, honest score-to-par chip ("E", "+3", "−2"). */
function formatToPar(stp: number | null): string {
  if (stp == null) return '—';
  if (stp === 0) return 'E';
  return stp > 0 ? `+${stp}` : `−${Math.abs(stp)}`;
}

/** Round type → human label (mirrors the legacy page's vocabulary). */
function roundTypeLabel(roundType: string | null): string {
  switch (roundType) {
    case 'tournament':
      return 'Tournament';
    case 'qualifier':
    case 'qualifying':
      return 'Qualifier';
    case 'practice':
      return 'Practice';
    case 'casual':
      return 'Casual';
    default:
      return 'Round';
  }
}

/** Strip trailing club/course suffixes for a tighter masthead title. */
function shortCourse(name: string | null): string {
  return (
    cleanCourseName(name)
      .replace(/\s+(Golf\s+(Course|Club)|Country\s+Club|GC|CC)$/i, '')
      .trim() || 'Round'
  );
}

/** A scored hole vs its par → a scoring-distribution bucket. */
type ScoreBucket = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double';
function bucketForHole(score: number, par: number): ScoreBucket {
  const d = score - par;
  if (d <= -2) return 'eagle';
  if (d === -1) return 'birdie';
  if (d === 0) return 'par';
  if (d === 1) return 'bogey';
  return 'double';
}

/* ───────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

export function FairwayRoundDetail({
  round,
  holes,
  aiRecap,
  reviewStats,
  playerName,
  isCoach,
  viewerIsOwner,
}: FairwayRoundDetailProps) {
  const reviewHref = `/golf/dashboard/rounds/${round.id}/review`;

  // ── Masthead copy ──────────────────────────────────────────────────────────
  // round_date is a DATE column ('YYYY-MM-DD'). Parsed + formatted through the
  // shared date-only helper (pinned to UTC) so SSR (server TZ) and hydration
  // (client TZ) agree, AND this header can never disagree with the rounds-list
  // row on the calendar day (#916: a sibling surface's un-pinned formatter
  // read the previous day west of UTC).
  const dayOfWeek = formatDateOnlyWeekdayLong(round.round_date);
  const dateLabel = formatDateOnlyFull(round.round_date);
  const heroTitle = `${dayOfWeek} at ${shortCourse(round.course_name)}`;
  const holesPlayed = round.holes_played ?? 18;
  const contextLine = `${roundTypeLabel(round.round_type)} · ${holesPlayed} holes · ${playerName}`;

  // ── Hero readouts (all off golf_rounds — honest) ────────────────────────────
  const totalScore = finite(round.total_score);
  const scoreToPar = finite(round.score_to_par);

  const gir = finite(round.total_gir);
  const girPoss = finite(round.total_gir_possible);
  const girPct = gir != null && girPoss && girPoss > 0 ? Math.round((gir / girPoss) * 100) : null;

  const fwHit = finite(round.total_fairways_hit);
  const fwPoss = finite(round.total_fairways);
  const fwPct = fwHit != null && fwPoss && fwPoss > 0 ? Math.round((fwHit / fwPoss) * 100) : null;

  const putts = finite(round.total_putts);
  const puttsPerHole =
    putts != null && holesPlayed > 0 ? +(putts / holesPlayed).toFixed(2) : null;

  // ── Scorecard rows (the honest spine, from golf_holes) ──────────────────────
  const orderedHoles = useMemo(
    () => [...holes].sort((a, b) => a.hole_number - b.hole_number),
    [holes],
  );
  const front = useMemo(() => orderedHoles.filter((h) => h.hole_number <= 9), [orderedHoles]);
  const back = useMemo(() => orderedHoles.filter((h) => h.hole_number >= 10), [orderedHoles]);
  const hasHoles = orderedHoles.length > 0;

  // ── Scoring distribution (recomputed honestly from golf_holes) ──────────────
  const distribution = useMemo(() => {
    const counts: Record<ScoreBucket, number> = {
      eagle: 0,
      birdie: 0,
      par: 0,
      bogey: 0,
      double: 0,
    };
    for (const h of orderedHoles) {
      const s = finite(h.score);
      const p = finite(h.par);
      if (s == null || p == null) continue;
      counts[bucketForHole(s, p)] += 1;
    }
    return counts;
  }, [orderedHoles]);

  // Bug #134/#149: SegmentBar's `primary="good"` auto-pick grabs the FIRST
  // good-tone part (Eagles), so a typical round with zero eagles led with
  // "0% eagles" as its single biggest, boldest number — the least
  // informative figure available. Pick the most informative NON-ZERO bucket
  // instead, in descending order of how notable it is: an actual eagle is
  // rare and worth calling out; failing that, birdies; failing that, pars
  // (the bulk of an ordinary round, still a real positive figure); only a
  // rough round with neither falls back to bogeys/double+.
  const heroSegmentIndex = useMemo(() => {
    if (distribution.eagle > 0) return 0;
    if (distribution.birdie > 0) return 1;
    if (distribution.par > 0) return 2;
    if (distribution.bogey > 0) return 3;
    return 4;
  }, [distribution]);

  // ── Pulse: rolling score-to-par across the round ────────────────────────────
  // Prefer the persisted momentumData; otherwise recompute the cumulative
  // score-to-par hole-by-hole from the honest golf_holes layer.
  const pulseSeries = useMemo<number[]>(() => {
    const persisted = reviewStats?.momentumData;
    if (Array.isArray(persisted) && persisted.length > 1) {
      return persisted
        .slice()
        .sort((a, b) => a.hole - b.hole)
        .map((p) => p.rollingScoreToPar)
        .filter((v): v is number => Number.isFinite(v));
    }
    let cumulative = 0;
    const out: number[] = [];
    for (const h of orderedHoles) {
      const s = finite(h.score);
      const p = finite(h.par);
      if (s == null || p == null) continue;
      cumulative += s - p;
      out.push(cumulative);
    }
    return out;
  }, [reviewStats, orderedHoles]);

  // ── What's-next: persisted areas / recommendations (real, never fabricated) ─
  const areas = useMemo(() => {
    const list = reviewStats?.areasForImprovement;
    return Array.isArray(list)
      ? list.filter((a) => a && typeof a.area === 'string').slice(0, 2)
      : [];
  }, [reviewStats]);
  const recommendations = useMemo(() => {
    const list = reviewStats?.recommendations;
    return Array.isArray(list)
      ? list.filter((r): r is string => typeof r === 'string' && r.trim().length > 0).slice(0, 2)
      : [];
  }, [reviewStats]);
  const hasReview = reviewStats != null;
  const hasNextWork = areas.length > 0 || recommendations.length > 0;

  // ── Primary action: the deep engine lives at /review — link there, don't dup ─
  const openReviewButton = (
    <Button asChild variant="primary">
      <Link href={reviewHref}>Open full review</Link>
    </Button>
  );

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-6">
      <div className="flex flex-col gap-10">
        {/* ════════════════ 1 · MASTHEAD (the ONE masthead) ═════════════════ */}
        <ViewHeader
          eyebrow={`Round Review · ${dateLabel}`}
          title={heroTitle}
          description={contextLine}
          meta={
            isCoach && !viewerIsOwner ? (
              <span className="font-fw-sans text-caption text-text-tertiary">
                Viewing {playerName}&rsquo;s round
              </span>
            ) : undefined
          }
          primaryAction={openReviewButton}
          secondaryActions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/golf/dashboard/stats">All stats</Link>
            </Button>
          }
        />

        {/* ════════════════ 2 · HERO — the SCORE (one focal instrument) ═════ */}
        <InstrumentCluster
          ariaLabel="Round score"
          balance="focal"
          tertiaryColumns={3}
          primary={
            <InstrumentPanel
              depth="raised"
              tone="accent"
              padding="lg"
              eyebrow="Final score"
              as="section"
              className="flex h-full flex-col gap-6"
            >
              <Readout
                size="hero"
                display={totalScore != null ? String(totalScore) : undefined}
                value={totalScore ?? undefined}
                state={totalScore != null ? 'live' : 'awaiting'}
                samples={totalScore != null ? undefined : { have: 0, need: 1 }}
                awaitingLabel="No score logged"
                label="Strokes"
                delta={
                  scoreToPar != null
                    ? {
                        value: scoreToPar,
                        // Bug #915: Readout's `direction` is the VERDICT
                        // ('up' = green/good, 'down' = amber/bad), not the raw
                        // numeric sign — golf is lower-is-better, so under par
                        // (scoreToPar < 0) is the GOOD ('up') direction. The
                        // previous `scoreToPar < 0 ? 'down' : ...` inverted
                        // this: a great under-par round rendered amber ▼.
                        direction: scoreToPar < 0 ? 'up' : scoreToPar > 0 ? 'down' : 'flat',
                        format: () => `${formatToPar(scoreToPar)} vs par`,
                      }
                    : undefined
                }
              />

              {/* ai_recap — the editorial lede. A real persisted string, quoted
                  verbatim. NOT serif, NOT a skeuomorphic blockquote — a quiet
                  display-type lede on a recessed inset. */}
              {aiRecap ? (
                <Inset padding="md">
                  <p className="max-w-[58ch] font-fw-display text-body-lg leading-[1.6] text-text-secondary">
                    {aiRecap}
                  </p>
                </Inset>
              ) : null}
            </InstrumentPanel>
          }
          secondary={[
            <InstrumentPanel
              key="splits"
              depth="base"
              header="Front / Back"
              className="flex h-full flex-col gap-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <Readout
                  size="md"
                  display={finite(round.front_nine) != null ? String(round.front_nine) : undefined}
                  value={finite(round.front_nine) ?? undefined}
                  state={finite(round.front_nine) != null ? 'live' : 'awaiting'}
                  awaitingLabel="—"
                  label="Front 9"
                />
                <Readout
                  size="md"
                  display={finite(round.back_nine) != null ? String(round.back_nine) : undefined}
                  value={finite(round.back_nine) ?? undefined}
                  state={finite(round.back_nine) != null ? 'live' : 'awaiting'}
                  awaitingLabel="—"
                  label="Back 9"
                />
              </div>
            </InstrumentPanel>,
          ]}
          tertiary={[
            <InstrumentPanel key="gir" depth="base" padding="md" className="h-full">
              <Readout
                value={girPct ?? undefined}
                unit="%"
                format={{ maximumFractionDigits: 0 }}
                label={gir != null && girPoss ? `GIR · ${gir}/${girPoss}` : 'GIR'}
                size="md"
                state={girPct != null ? 'live' : 'awaiting'}
                samples={girPct != null ? undefined : { have: 0, need: 1 }}
                awaitingLabel="No data"
              />
            </InstrumentPanel>,
            <InstrumentPanel key="fw" depth="base" padding="md" className="h-full">
              <Readout
                value={fwPct ?? undefined}
                unit="%"
                format={{ maximumFractionDigits: 0 }}
                label={fwHit != null && fwPoss ? `Fairways · ${fwHit}/${fwPoss}` : 'Fairways'}
                size="md"
                state={fwPct != null ? 'live' : 'awaiting'}
                samples={fwPct != null ? undefined : { have: 0, need: 1 }}
                awaitingLabel="No data"
              />
            </InstrumentPanel>,
            <InstrumentPanel key="putts" depth="base" padding="md" className="h-full">
              <Readout
                value={putts ?? undefined}
                format={{ maximumFractionDigits: 0 }}
                label={
                  puttsPerHole != null ? `Putts · ${puttsPerHole.toFixed(2)}/hole` : 'Putts'
                }
                size="md"
                state={putts != null ? 'live' : 'awaiting'}
                samples={putts != null ? undefined : { have: 0, need: 1 }}
                awaitingLabel="No data"
              />
            </InstrumentPanel>,
          ]}
        />

        {/* ════════════════ 3 · SCORECARD — the real spine (golf_holes) ═════ */}
        {hasHoles ? (
          <section className="flex flex-col gap-3">
            <h2 className="px-1 font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
              Scorecard
            </h2>
            <Surface padding="none" elevation="border" className="overflow-hidden">
              <Scorecard
                front={front}
                back={back}
                frontTotal={finite(round.front_nine)}
                backTotal={finite(round.back_nine)}
                grandTotal={totalScore}
              />
            </Surface>
          </section>
        ) : null}

        {/* ════════════════ 3b · SCORING DISTRIBUTION (chunky matte bar) ════ */}
        {hasHoles ? (
          <ScoringDistribution
            title="Scoring distribution"
            overline="By hole"
            takeaway="How the round broke down by score relative to par."
            primaryIndex={heroSegmentIndex}
            parts={[
              { label: 'Eagles', value: distribution.eagle, tone: 'good' },
              { label: 'Birdies', value: distribution.birdie, tone: 'good' },
              { label: 'Pars', value: distribution.par, tone: 'neutral' },
              // Bug #133: Bogeys and Double+ both carried `tone: 'caution'`,
              // which resolves to the SAME warning color for both — the
              // legend listed them as distinct entries but the bar itself
              // rendered them as one undifferentiated amber block. Double+ is
              // strictly worse than a single bogey, so it gets a deeper,
              // still-amber (never red/danger — that hue is reserved for true
              // errors) shade via an explicit color override, keeping both
              // segments visually distinct while staying in the warm family.
              { label: 'Bogeys', value: distribution.bogey, tone: 'caution' },
              {
                label: 'Double+',
                value: distribution.double,
                color: 'color-mix(in oklch, var(--fw-color-warning) 55%, var(--fw-color-warm-800))',
              },
            ]}
          />
        ) : null}

        {/* ════════════════ 4 · PULSE — rolling score-to-par (matte) ════════ */}
        {pulseSeries.length > 1 ? (
          <InstrumentPanel
            depth="base"
            eyebrow="Pulse"
            header="Score to par through the round"
            as="section"
          >
            <div className="flex items-center justify-between gap-5">
              <div className="min-w-0 flex-1 overflow-x-auto">
                <PulseTrace series={pulseSeries} />
              </div>
              <div className="shrink-0">
                <Readout
                  size="md"
                  display={formatToPar(scoreToPar)}
                  state="live"
                  label="Finished"
                />
              </div>
            </div>
          </InstrumentPanel>
        ) : null}

        {/* ════════════════ 5 · WHAT'S-NEXT — areas to work on ══════════════ */}
        <section className="flex flex-col gap-3">
          <h2 className="px-1 font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
            Areas to work on
          </h2>
          <Surface padding={hasReview && hasNextWork ? 'md' : 'none'} elevation="border">
            {hasReview && hasNextWork ? (
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  {areas.map((a, i) => (
                    <Inset key={`area-${i}`} padding="md">
                      <p className="font-fw-sans text-body-sm font-semibold text-text-primary">
                        {a.area}
                      </p>
                      {a.recommendation ? (
                        <p className="mt-1 font-fw-sans text-caption leading-5 text-text-secondary">
                          {a.recommendation}
                        </p>
                      ) : null}
                    </Inset>
                  ))}
                  {areas.length === 0 &&
                    recommendations.map((r, i) => (
                      <Inset key={`rec-${i}`} padding="md">
                        <p className="font-fw-sans text-caption leading-5 text-text-secondary">
                          {r}
                        </p>
                      </Inset>
                    ))}
                </div>
                <div className="flex justify-start">{openReviewButton}</div>
              </div>
            ) : (
              <EmptyState
                variant="subtle"
                title={hasReview ? 'No focus areas flagged' : 'Review not generated yet'}
                description={
                  hasReview
                    ? 'CoachHelm did not flag specific areas to work on for this round.'
                    : 'Generate the full CoachHelm review to see what to work on next.'
                }
                action={openReviewButton}
              />
            )}
          </Surface>
        </section>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * ScoringDistribution — the "By hole" chunky segmented bar, WITH an
 * unambiguous chart/table toggle (bug #130).
 * ----------------------------------------------------------------------------
 * The shared `SegmentBar` (charts/SegmentBar.tsx) mounts a bezel-corner
 * `InstrumentTableToggle` that hard-codes its own label from `show` (whether
 * the TABLE is currently visible) with no override hook: `show ? 'View
 * instrument' : 'View as table'`. "View instrument" is jargon-y and reads as
 * a THIRD state to a user staring at a table, not "click here to go back to
 * the chart" — the toggle never actually shows the wrong state, it's just
 * unclear about what it means, and `SegmentBar`/`InstrumentTable` are shared
 * chart primitives outside this package's ownership (no per-instance label
 * prop to fix it upstream without touching every other SegmentBar/Ribbon/
 * RadialGauge/Dial consumer). So the scoring-distribution instrument is
 * ported locally here — same math, same bar/legend markup, same VIZ_* tokens
 * — with its own toggle that says exactly what clicking it does: "View as
 * table" while the chart shows, "View chart" while the table shows. Never
 * "View instrument".
 * ══════════════════════════════════════════════════════════════════════════ */

type ScoringDistributionTone = 'good' | 'caution' | 'neutral';

interface ScoringDistributionPart {
  label: string;
  value: number;
  /** Semantic tone (drives the default color). Default `neutral`. */
  tone?: ScoringDistributionTone;
  /** Explicit color override (must be a VIZ_* token / CSS var, not raw hex). */
  color?: string;
}

const SCORING_TONE_COLOR: Record<ScoringDistributionTone, string> = {
  good: VIZ_COLOR.accent,
  caution: VIZ_COLOR.warning,
  neutral: 'var(--fw-color-warm-300)',
};

function ScoringDistribution({
  title,
  overline,
  takeaway,
  parts,
  primaryIndex,
}: {
  title: string;
  overline?: string;
  takeaway?: string;
  parts: ReadonlyArray<ScoringDistributionPart>;
  primaryIndex: number;
}) {
  const reduced = useReducedMotion() ?? false;
  const [showTable, setShowTable] = useState(false);

  const total = useMemo(
    () => parts.reduce((s, p) => s + (Number.isFinite(p.value) ? Math.max(0, p.value) : 0), 0),
    [parts],
  );
  const isAwaiting = parts.length === 0 || total === 0;

  const resolved = useMemo(
    () =>
      parts.map((p) => {
        const v = Number.isFinite(p.value) ? Math.max(0, p.value) : 0;
        const pct = total > 0 ? v / total : 0;
        const tone: ScoringDistributionTone = p.tone ?? 'neutral';
        return { label: p.label, value: v, pct, color: p.color ?? SCORING_TONE_COLOR[tone] };
      }),
    [parts, total],
  );

  const primaryPart = resolved[primaryIndex] ?? resolved[0];

  const tableData: ChartTableData = {
    caption: title,
    columns: [
      { key: 'label', label: 'Outcome' },
      { key: 'count', label: 'Count', numeric: true },
      { key: 'pct', label: 'Share', numeric: true },
    ],
    rows: resolved.map((p) => ({
      label: p.label,
      count: String(p.value),
      pct: formatPercent(p.pct),
    })),
  };
  const hasTable = tableData.rows.length > 0 && !isAwaiting;

  const ariaLabel = chartAriaLabel(
    title,
    takeaway ??
      (primaryPart && !isAwaiting
        ? `${formatPercent(primaryPart.pct)} ${primaryPart.label.toLowerCase()}, ${total} total`
        : 'no outcomes yet'),
  );

  return (
    <InstrumentPanel
      depth="base"
      eyebrow={overline}
      header={title}
      data-slot="scoring-distribution"
      readout={
        hasTable ? (
          // eslint-disable-next-line helm/no-raw-button
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-pressed={showTable}
            data-slot="scoring-distribution-view-toggle"
            className={cn(
              'inline-flex h-7 min-w-[24px] items-center gap-1.5 rounded-fw-sm px-2.5',
              'font-fw-sans text-caption font-medium text-text-secondary',
              'transition-colors [transition-duration:180ms] [transition-timing-function:cubic-bezier(0.22,0.61,0.36,1)]',
              'hover:bg-surface hover:text-text-primary',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
              'active:translate-y-[0.5px]',
              showTable && 'bg-surface text-text-primary',
            )}
          >
            {/* #130: the label always names the CURRENT view + the click
                target unambiguously — never the shared toggle's "View
                instrument" jargon. */}
            {showTable ? 'View chart' : 'View as table'}
          </button>
        ) : undefined
      }
    >
      {showTable && hasTable ? (
        <InstrumentTable data={tableData} />
      ) : isAwaiting ? (
        <div role="img" aria-label={ariaLabel}>
          <Readout
            state="awaiting"
            size="md"
            samples={{ have: total, need: 1 }}
            awaitingLabel="No outcomes yet"
            label={title}
          />
        </div>
      ) : (
        <div role="img" aria-label={ariaLabel} className="flex flex-col gap-4">
          {/* big called-out primary readout — the instrument display */}
          {primaryPart ? (
            <div className="flex items-baseline gap-2">
              <Readout
                value={primaryPart.pct}
                format={{ style: 'percent', maximumFractionDigits: 0 }}
                size="md"
                align="start"
              />
              <span className="font-fw-sans text-body-sm font-medium text-text-secondary">
                {primaryPart.label.toLowerCase()}
                <span
                  style={TABULAR_NUMS}
                  className="ml-1.5 font-fw-mono text-caption text-text-tertiary"
                >
                  ({primaryPart.value} of {total})
                </span>
              </span>
            </div>
          ) : null}

          {/* the chunky segmented bar */}
          <div
            className="flex w-full overflow-hidden rounded-fw-sm bg-surface-sunken"
            style={{ height: 28 }}
          >
            {resolved.map((p, i) =>
              p.pct > 0 ? (
                <motion.div
                  key={p.label}
                  className="h-full first:rounded-l-fw-sm last:rounded-r-fw-sm"
                  style={{ background: p.color }}
                  initial={reduced ? false : { width: 0 }}
                  animate={{ width: `${p.pct * 100}%` }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { duration: VIZ_REVEAL_MS / 1000, ease: VIZ_EASE, delay: i * 0.08 }
                  }
                />
              ) : null,
            )}
          </div>

          {/* inline legend — swatch SHAPE + label + count + % (never color-only) */}
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
            {resolved.map((p) => (
              <li key={p.label} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: p.color }}
                />
                <span className="font-fw-sans text-caption font-medium text-text-secondary">
                  {p.label}
                </span>
                <span
                  style={TABULAR_NUMS}
                  className="font-fw-mono text-caption font-semibold text-text-primary"
                >
                  {p.value}
                </span>
                <span
                  style={TABULAR_NUMS}
                  className="font-fw-mono text-caption text-text-tertiary"
                >
                  {formatPercent(p.pct)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </InstrumentPanel>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * PulseTrace — the rolling score-to-par line, drawn PLAINLY (bug #28).
 * ----------------------------------------------------------------------------
 * The shared `Sparkline` primitive (charts/Sparkline.tsx) gates its stroke
 * reveal behind framer-motion's `useInView` — a scroll-triggered
 * strokeDasharray animation from `pathLength: 0`. For a chart that renders
 * ALREADY inside the viewport at first paint (the Pulse panel sits directly
 * under the full 18-hole scorecard, not scrolled far below the fold), that
 * once-only intersection check can settle before layout/hydration finishes
 * measuring the real position, leaving the line frozen at `pathLength: 0` —
 * invisible — while its end-dot (gated on the exact same `inView` flag)
 * still manages to paint once mounted, i.e. exactly the reported "empty
 * chart, tiny dot" symptom. A post-round recap's headline chart should never
 * depend on scroll-timing to become visible, so this draws the trace once,
 * plainly, with no viewport gating at all — same math as Sparkline's
 * `toPoints`, same shared trend color vocabulary (TrendChip's
 * `classifyTrend`/`TREND_COLOR`), just no reveal to get stuck.
 * ══════════════════════════════════════════════════════════════════════════ */

function PulseTrace({
  series,
  width = 520,
  height = 64,
  strokeWidth = 2,
}: {
  series: number[];
  width?: number;
  height?: number;
  strokeWidth?: number;
}) {
  const values = series.filter((v): v is number => Number.isFinite(v));
  if (values.length < 2) return null;

  const pad = Math.max(2, strokeWidth);
  const innerW = Math.max(1, width - pad * 2);
  const innerH = Math.max(1, height - pad * 2);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const stepX = innerW / (values.length - 1);

  const coords = values.map((v, i) => {
    const x = pad + i * stepX;
    // flat series → center vertically (avoids a divide-by-zero baseline)
    const norm = span === 0 ? 0.5 : (v - min) / span;
    // SVG y grows downward; a higher (worse, less-negative) to-par sits lower
    const y = pad + (1 - norm) * innerH;
    return { x, y };
  });
  const points = coords.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const last = coords[coords.length - 1]!;

  const first = values[0] as number;
  const latest = values[values.length - 1] as number;
  // Golf is lower-is-better: a falling rolling score-to-par is `improving`.
  const verdict = classifyTrend(latest - first, { goodDirection: 'down' });
  const color = TREND_COLOR[verdict];
  const summary = `Rolling score to par: ${verdict} over ${values.length} holes, from ${formatToPar(first)} to ${formatToPar(latest)}.`;

  return (
    <span
      data-slot="pulse-trace"
      role="img"
      aria-label={summary}
      className="inline-block align-middle"
      style={{ width, height }}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        fill="none"
        aria-hidden="true"
        className="overflow-visible"
      >
        <polyline
          points={points}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={last.x} cy={last.y} r={strokeWidth + 1.5} fill={color} />
      </svg>
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * Scorecard — a flat matte Fairway scorecard from golf_holes. Two nine-hole
 * grids (front / back) with par/score/putts/FW/GIR per hole + nine totals and a
 * grand total. No yardage column (golf_holes.yardage is NULL → omitted, never
 * shown as 0). Tabular-nums everywhere; matte, no gauges, no glass.
 * ══════════════════════════════════════════════════════════════════════════ */

function Scorecard({
  front,
  back,
  frontTotal,
  backTotal,
  grandTotal,
}: {
  front: RoundHoleRow[];
  back: RoundHoleRow[];
  frontTotal: number | null;
  backTotal: number | null;
  grandTotal: number | null;
}) {
  return (
    <div className="flex flex-col">
      <ScorecardNine label="Front" holes={front} total={frontTotal} />
      {back.length > 0 ? (
        <>
          <div aria-hidden className="h-px w-full bg-border-subtle" />
          <ScorecardNine label="Back" holes={back} total={backTotal} />
        </>
      ) : null}
      {grandTotal != null ? (
        <div className="flex items-center justify-between gap-4 bg-surface-tint px-5 py-3.5">
          <span className="font-fw-display text-body-sm font-medium uppercase tracking-[0.12em] text-text-tertiary">
            Total
          </span>
          <span className="font-fw-mono text-h3 font-semibold tabular-nums text-text-primary">
            {grandTotal}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** A single nine-hole block: a hole-number header row + par/score/putts/FW/GIR
 *  rows, then a nine total.
 *
 *  Below `md` this renders as a real phone scorecard — per-hole row strips
 *  (hole · par · score-vs-par pill · putts · FW/GIR marks), the shape a
 *  golfer actually recognizes — NOT the desktop table squeezed into a
 *  scroll box (Rule 8). The `md+` table is byte-identical to before. */
function ScorecardNine({
  label,
  holes,
  total,
}: {
  label: string;
  holes: RoundHoleRow[];
  total: number | null;
}) {
  if (holes.length === 0) return null;

  const parTotal = holes.reduce((s, h) => s + (finite(h.par) ?? 0), 0);
  const scoreTotal =
    total ?? holes.reduce((s, h) => s + (finite(h.score) ?? 0), 0);
  const puttTotal = holes.reduce((s, h) => s + (finite(h.putts) ?? 0), 0);
  // Golf convention: the front nine's total column reads "Out", the back
  // nine's reads "In" — both nines were previously hard-coded to "Out".
  const totalColumnLabel = label === 'Front' ? 'Out' : 'In';

  return (
    <div className="flex flex-col">
      {/* Phone — per-hole row strips (Rule 8: never a squeezed table) */}
      <div className="flex flex-col gap-2 px-3 py-3 md:hidden">
        <div className="flex items-center justify-between px-1">
          <span className="font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
            {label} nine
          </span>
          {parTotal ? (
            <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
              Par {parTotal}
            </span>
          ) : null}
        </div>
        <ul className="divide-y divide-border-subtle">
          {holes.map((h) => (
            <ScorecardHoleRow key={h.hole_number} hole={h} />
          ))}
        </ul>
        <div className="mt-1 flex items-center justify-between rounded-fw-md bg-surface-tint px-3 py-2.5">
          <span className="font-fw-display text-caption font-medium uppercase tracking-[0.1em] text-text-tertiary">
            {label} total
          </span>
          <div className="flex items-baseline gap-3">
            <span className="font-fw-mono text-caption tabular-nums text-text-secondary">
              {puttTotal || '—'} putts
            </span>
            <span className="font-fw-mono text-h3 font-semibold tabular-nums text-text-primary">
              {scoreTotal || '—'}
            </span>
          </div>
        </div>
      </div>

      {/* md+ — the original matte table, unchanged */}
      <div className="hidden overflow-x-auto px-2 py-3 md:block">
        <table className="w-full min-w-[560px] border-collapse text-center">
          <caption className="sr-only">{label} nine scorecard</caption>
          <thead>
            <tr>
              <Th className="text-left">{label}</Th>
              {holes.map((h) => (
                <Th key={h.hole_number}>{h.hole_number}</Th>
              ))}
              <Th className="bg-surface-tint">{totalColumnLabel}</Th>
            </tr>
          </thead>
          <tbody>
            {/* Par */}
            <tr>
              <RowLabel>Par</RowLabel>
              {holes.map((h) => (
                <Td key={h.hole_number} className="text-text-tertiary">
                  {finite(h.par) ?? '—'}
                </Td>
              ))}
              <Td className="bg-surface-tint font-semibold text-text-secondary">{parTotal || '—'}</Td>
            </tr>
            {/* Score — tone-coded vs par (never color-only: glyph-free but the
                number itself is the primary channel; tone is a quiet reinforcement) */}
            <tr>
              <RowLabel>Score</RowLabel>
              {holes.map((h) => {
                const s = finite(h.score);
                const p = finite(h.par);
                const tone =
                  s != null && p != null
                    ? s < p
                      ? 'text-fw-success'
                      : s > p
                        ? 'text-fw-warning'
                        : 'text-text-primary'
                    : 'text-text-tertiary';
                return (
                  <Td key={h.hole_number} className={`font-semibold ${tone}`}>
                    {s ?? '—'}
                  </Td>
                );
              })}
              <Td className="bg-surface-tint font-semibold text-text-primary">
                {scoreTotal || '—'}
              </Td>
            </tr>
            {/* Putts */}
            <tr>
              <RowLabel>Putts</RowLabel>
              {holes.map((h) => (
                <Td key={h.hole_number} className="text-text-secondary">
                  {finite(h.putts) ?? '—'}
                </Td>
              ))}
              <Td className="bg-surface-tint text-text-secondary">{puttTotal || '—'}</Td>
            </tr>
            {/* Fairway hit — par-3s have no fairway (fairway_hit NULL → blank dot) */}
            <tr>
              <RowLabel>FW</RowLabel>
              {holes.map((h) => (
                <Td key={h.hole_number}>
                  <HitMark value={h.fairway_hit} />
                </Td>
              ))}
              <Td className="bg-surface-tint" />
            </tr>
            {/* GIR */}
            <tr>
              <RowLabel>GIR</RowLabel>
              {holes.map((h) => (
                <Td key={h.hole_number}>
                  <HitMark value={h.gir} />
                </Td>
              ))}
              <Td className="bg-surface-tint" />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Phone-only per-hole row: hole · par · score-vs-par pill · putts · FW/GIR
 *  marks. Same underlying data + tone rules as the md+ table's Score row
 *  (glyph-free color reinforcement backed by the explicit to-par pill text —
 *  never color-only). */
function ScorecardHoleRow({ hole }: { hole: RoundHoleRow }) {
  const s = finite(hole.score);
  const p = finite(hole.par);
  const toPar = s != null && p != null ? s - p : null;

  const scoreTone =
    toPar == null
      ? 'text-text-tertiary'
      : toPar < 0
        ? 'text-fw-success'
        : toPar > 0
          ? 'text-fw-warning'
          : 'text-text-primary';

  const pillTone =
    toPar == null
      ? 'bg-surface-sunken text-text-tertiary'
      : toPar < 0
        ? 'bg-fw-success-bg text-fw-success'
        : toPar > 0
          ? 'bg-fw-warning-bg text-fw-warning'
          : 'bg-surface-sunken text-text-secondary';

  return (
    <li className="flex items-center gap-2.5 py-2.5 first:pt-0 last:pb-0">
      <span
        aria-hidden="true"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-sunken font-fw-mono text-body-sm font-semibold tabular-nums text-text-secondary"
      >
        {hole.hole_number}
      </span>
      <div className="w-8 shrink-0 leading-tight">
        <p className="font-fw-display text-eyebrow font-medium uppercase tracking-[0.06em] text-text-tertiary">
          Par
        </p>
        <p className="font-fw-mono text-body-sm font-medium tabular-nums text-text-secondary">
          {p ?? '—'}
        </p>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className={cn('font-fw-mono text-h3 font-semibold tabular-nums', scoreTone)}>
          {s ?? '—'}
        </span>
        <span
          className={cn(
            'shrink-0 rounded-full px-1.5 py-0.5 font-fw-mono text-caption font-medium tabular-nums',
            pillTone,
          )}
        >
          {formatToPar(toPar)}
        </span>
      </div>
      {/* Label-over-value, mirroring the Par block — one micro-pattern
          across the row's small data blocks. */}
      <div className="w-10 shrink-0 text-right leading-tight">
        <p className="font-fw-display text-eyebrow font-medium uppercase tracking-[0.06em] text-text-tertiary">
          Putts
        </p>
        <p className="font-fw-mono text-body-sm tabular-nums text-text-secondary">
          {finite(hole.putts) ?? '—'}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 pl-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="font-fw-display text-eyebrow font-medium uppercase tracking-[0.06em] text-text-tertiary">
            FW
          </span>
          <HitMark value={hole.fairway_hit} />
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="font-fw-display text-eyebrow font-medium uppercase tracking-[0.06em] text-text-tertiary">
            GIR
          </span>
          <HitMark value={hole.gir} />
        </span>
      </div>
    </li>
  );
}

function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`px-1.5 py-1.5 font-fw-display text-eyebrow font-medium uppercase tracking-[0.1em] text-text-tertiary ${className}`}
    >
      {children}
    </th>
  );
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="row"
      className="whitespace-nowrap px-1.5 py-1.5 text-left font-fw-sans text-caption font-medium text-text-tertiary"
    >
      {children}
    </th>
  );
}

function Td({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <td className={`px-1.5 py-1.5 font-fw-mono text-body-sm tabular-nums ${className}`}>
      {children}
    </td>
  );
}

/** A quiet hit indicator: filled dot = hit, hollow ring = miss, blank = N/A
 *  (par-3 fairways). Shape carries the meaning, not color alone. */
function HitMark({ value }: { value: boolean | null }) {
  if (value == null) {
    return (
      <span aria-label="not applicable" className="text-text-tertiary/50">
        ·
      </span>
    );
  }
  return value ? (
    <span
      aria-label="hit"
      className="inline-block h-2.5 w-2.5 rounded-full bg-fw-success align-middle"
    />
  ) : (
    <span
      aria-label="miss"
      className="inline-block h-2.5 w-2.5 rounded-full border border-border-strong align-middle"
    />
  );
}

export default FairwayRoundDetail;
