'use client';

/**
 * ============================================================================
 * Fairway · Rounds · rounds-instruments — the PLAYER branch's stage + visuals
 * ----------------------------------------------------------------------------
 * player-rounds.v2.md. The coach branch of FairwayRoundsLibrary keeps its
 * Cockpit / Spread / Leaders composition (rounds-library.v2.md); everything
 * in this file mounts only for `userRole === 'player'`.
 *
 *   • RoundsStage         — "Avg score" and "To par" readouts, the verdict
 *                           sentence, and the score trajectory as a Ribbon
 *                           with the last round marked and named (the same
 *                           series rule, marker and benchmark rule as the
 *                           player home stage, so a player reads the same
 *                           line in both places)
 *   • ScoreBandHistogram  — where score_to_par lands, five bands
 *   • RoundTypeSegment    — practice · qualifier · tournament as ONE bar,
 *                           the averages by type as its caption
 *   • MonthDeviationBars  — each month's average against the season average
 *                           (md+ only; the phone keeps the seam-header
 *                           sparklines as its by-month visual)
 *   • SeamSpark           — a captioned seam-header Sparkline
 *
 * Pure helpers are exported for the colocated tests. Dates go through the
 * UTC-pinned date-only helpers; nothing here reads a clock.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Eyebrow } from '@/components/fairway/controls/eyebrow';
import { fwFocusRing, fwTransition } from '@/components/fairway/controls/_internal';
import { Readout } from '@/components/fairway/instrument';
import { Ribbon, type RibbonPoint } from '@/components/fairway/charts/Ribbon';
import { BandHistogram, type BandHistogramBand } from '@/components/fairway/charts/BandHistogram';
import { SegmentBar, type SegmentBarPart } from '@/components/fairway/charts/SegmentBar';
import { Sparkline } from '@/components/fairway/charts/Sparkline';
import type { GoodDirection } from '@/components/fairway/charts/TrendChip';
import { DivergingBars } from '@/components/fairway/modules/DivergingBars';
import type { DivergingRow } from '@/components/fairway/modules/types';
import { cleanCourseName } from '@/lib/golf/course-name';
import { formatToPar } from '@/lib/golf/format-to-par';
import { parseDateOnly, dateOnlyToUtcDate, formatDateOnlyShort } from '@/lib/golf/date-only';
import type { RoundLibraryRound, RoundStats } from './FairwayRoundsLibrary';

// ── Pure helpers ────────────────────────────────────────────────────────────

/** Normalize a round's score to its 18-hole equivalent (for every chart). */
export function normalizedScore(
  round: Pick<RoundLibraryRound, 'total_score' | 'holes_played'>,
): number | null {
  if (round.total_score === null || round.total_score <= 0) return null;
  const hp = round.holes_played ?? 18;
  return Math.round((round.total_score * 18) / Math.max(1, hp));
}

/** "+2.4" / "-1.2" / "0.0" — one decimal, explicit sign above zero. */
export function formatSignedOne(value: number): string {
  return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

export const SCORE_BAND_LABELS = ['Under par', 'Even', '+1 to +3', '+4 to +7', '+8 or more'] as const;

/** Which of the five score-to-par bands a round lands in. */
export function scoreBandIndex(scoreToPar: number): 0 | 1 | 2 | 3 | 4 {
  if (scoreToPar < 0) return 0;
  if (scoreToPar === 0) return 1;
  if (scoreToPar <= 3) return 2;
  if (scoreToPar <= 7) return 3;
  return 4;
}

/**
 * The five bands with a real count and share each (a band nobody landed in
 * is an honest 0, not a missing reading). Empty when no round has a to-par.
 */
export function scoreBands(rounds: ReadonlyArray<RoundLibraryRound>): BandHistogramBand[] {
  const counts: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  let total = 0;
  for (const r of rounds) {
    if (r.score_to_par === null) continue;
    const idx = scoreBandIndex(r.score_to_par);
    counts[idx] = counts[idx] + 1;
    total += 1;
  }
  if (total === 0) return [];
  return SCORE_BAND_LABELS.map((label, i) => ({
    label,
    n: counts[i]!,
    pct: Math.round((counts[i]! / total) * 100),
  }));
}

export type RoundTypeKey = 'practice' | 'qualifier' | 'tournament' | 'other';

const TYPE_ORDER: RoundTypeKey[] = ['practice', 'qualifier', 'tournament', 'other'];
const TYPE_LABEL: Record<RoundTypeKey, string> = {
  practice: 'Practice',
  qualifier: 'Qualifier',
  tournament: 'Tournament',
  other: 'Other',
};
// Locked viz tokens only: the accent is spent on the rounds that count, the
// warm neutrals carry practice and the untyped remainder.
const TYPE_COLOR: Record<RoundTypeKey, string> = {
  practice: 'var(--fw-color-warm-300)',
  qualifier: 'var(--fw-color-accent-300)',
  tournament: 'var(--fw-color-accent-500)',
  other: 'var(--fw-color-warm-200)',
};

/** The same type folding the library's filter pills use; unknown → other. */
export function roundTypeKey(type: string | null | undefined): RoundTypeKey {
  const t = (type || '').toLowerCase();
  if (t === 'practice') return 'practice';
  if (t === 'qualifier' || t === 'qualifying') return 'qualifier';
  if (t === 'tournament') return 'tournament';
  return 'other';
}

export interface RoundTypeSummary {
  key: RoundTypeKey;
  label: string;
  count: number;
  /** 18-hole-equivalent scoring average over the type's scored rounds. */
  avgScore: number | null;
}

/**
 * Counts and averages by round type, in a fixed order. A type with no rounds
 * is absent; "Other" appears only when untyped rounds exist. Unscored rounds
 * count toward the type but never toward its average.
 */
export function roundTypeSummary(rounds: ReadonlyArray<RoundLibraryRound>): RoundTypeSummary[] {
  const agg = new Map<RoundTypeKey, { count: number; sum: number; scored: number }>();
  for (const r of rounds) {
    const key = roundTypeKey(r.round_type);
    const entry = agg.get(key) ?? { count: 0, sum: 0, scored: 0 };
    entry.count += 1;
    const ns = normalizedScore(r);
    if (ns !== null) {
      entry.sum += ns;
      entry.scored += 1;
    }
    agg.set(key, entry);
  }
  return TYPE_ORDER.filter((k) => (agg.get(k)?.count ?? 0) > 0).map((k) => {
    const e = agg.get(k)!;
    return {
      key: k,
      label: TYPE_LABEL[k],
      count: e.count,
      avgScore: e.scored > 0 ? e.sum / e.scored : null,
    };
  });
}

/** "Tournament avg 76.1 · Practice avg 73.8", most-played type first. */
export function typeAveragesLine(summary: ReadonlyArray<RoundTypeSummary>): string {
  return summary
    .filter((s) => s.avgScore !== null)
    .slice()
    .sort((a, b) => b.count - a.count)
    .map((s) => `${s.label} avg ${s.avgScore!.toFixed(1)}`)
    .join(' · ');
}

/**
 * Each month's scoring average against the season average, oldest first,
 * for months with at least two scored rounds. Month labels stay short
 * ("Aug", or "Aug 25" once the rounds span more than one year) because the
 * DivergingBars label gutter is 40px.
 */
export function monthDeviations(
  rounds: ReadonlyArray<RoundLibraryRound>,
  seasonAvg: number,
): DivergingRow[] {
  const months = new Map<string, { date: Date; sum: number; count: number }>();
  for (const r of rounds) {
    const ns = normalizedScore(r);
    if (ns === null) continue;
    const parts = parseDateOnly(r.round_date);
    if (!parts) continue;
    const key = `${parts.year}-${String(parts.month).padStart(2, '0')}`;
    const entry = months.get(key) ?? {
      date: dateOnlyToUtcDate({ ...parts, day: 1 }),
      sum: 0,
      count: 0,
    };
    entry.sum += ns;
    entry.count += 1;
    months.set(key, entry);
  }
  const qualifying = Array.from(months.entries())
    .filter(([, m]) => m.count >= 2)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const years = new Set(qualifying.map(([, m]) => m.date.getUTCFullYear()));
  return qualifying.map(([, m]) => {
    const delta = m.sum / m.count - seasonAvg;
    const label = m.date.toLocaleDateString('en-US', {
      month: 'short',
      ...(years.size > 1 ? { year: '2-digit' } : {}),
      timeZone: 'UTC',
    });
    return { label, delta, display: formatSignedOne(delta) };
  });
}

/**
 * The newest five rounds' average minus the five before, over a chronological
 * (oldest → newest) series — the same split `rounds/page.tsx` classifies
 * `stats.trend` from, so the verdict's word and its number come from one
 * computation. `null` under six scored rounds, the trend's own gate.
 */
export function recentShift(series: ReadonlyArray<number>): number | null {
  const n = series.length;
  if (n < 6) return null;
  const recent = series.slice(n - 5);
  const prior = series.slice(Math.max(0, n - 10), n - 5);
  const mean = (xs: ReadonlyArray<number>) => xs.reduce((s, v) => s + v, 0) / xs.length;
  return mean(recent) - mean(prior);
}

/** The stage's verdict sentence, from the server trend and the same-split shift. */
export function scoringVerdict(
  trend: RoundStats['trend'],
  shift: number | null,
  avg: number,
  scoredCount: number,
): string {
  if (trend === 'improving') {
    return shift !== null
      ? `Trending down ${Math.abs(shift).toFixed(1)} over your last five rounds.`
      : 'Trending down over your last five rounds.';
  }
  if (trend === 'declining') {
    return shift !== null
      ? `Trending up ${Math.abs(shift).toFixed(1)} over your last five rounds.`
      : 'Trending up over your last five rounds.';
  }
  if (trend === 'stable') return `Holding around ${avg.toFixed(1)}.`;
  if (scoredCount < 3) {
    const need = 3 - scoredCount;
    return need === 1 ? 'One more round and the line draws.' : 'Two more rounds and the line draws.';
  }
  return 'Six scored rounds unlock the trend.';
}

// ── Stage ───────────────────────────────────────────────────────────────────

export interface RoundsStageProps {
  stats: RoundStats;
  /** Chronological normalized scores, oldest to newest. */
  points: ReadonlyArray<RibbonPoint>;
  /** The newest scored round, named in the Ribbon's readout (a link). */
  lastRound: RoundLibraryRound | null;
  /** `recentShift` over the same series. */
  shift: number | null;
  className?: string;
}

/**
 * The first object on the player page: two readouts, the verdict, the line.
 * A seam section on the canvas (eyebrow, no bezel); the Ribbon brings its own
 * depth-base panel. "New round" stays the ViewHeader primary — no button here.
 */
export function RoundsStage({ stats, points, lastRound, shift, className }: RoundsStageProps) {
  const hasTrend = stats.trend !== null && shift !== null;
  const verdict = scoringVerdict(stats.trend, shift, stats.avg, points.length);
  const avgLabel = `Avg ${stats.avg.toFixed(1)}`;
  const lastCourse = lastRound ? cleanCourseName(lastRound.course_name) || 'Last round' : null;
  const lastToPar =
    lastRound && lastRound.score_to_par !== null ? formatToPar(lastRound.score_to_par) : null;

  return (
    <section aria-label="Scoring" className={cn('flex flex-col gap-4', className)}>
      <Eyebrow>Scoring</Eyebrow>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <Readout
          size="lg"
          label="Avg score"
          display={stats.avg.toFixed(1)}
          delta={
            hasTrend
              ? {
                  value: shift!,
                  // Scores are lower-is-better: a falling average is the good
                  // (green) direction.
                  direction: shift! < 0 ? 'up' : shift! > 0 ? 'down' : 'flat',
                  // Signed, like the Ribbon readout under it: the glyph
                  // carries goodness, the number carries the direction.
                  format: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`,
                  caption: 'last 5 vs prior 5',
                }
              : undefined
          }
        />
        {stats.avgToPar !== null ? (
          <Readout size="lg" label="To par" display={formatSignedOne(stats.avgToPar)} />
        ) : (
          <Readout size="lg" label="To par" state="awaiting" awaitingLabel="No to-par yet" />
        )}
      </div>
      <p className="font-fw-sans text-body text-text-secondary">{verdict}</p>
      <Ribbon
        title={null}
        data={points}
        seriesName="Score"
        goodDirection="down"
        valueFormatter={(v) => String(Math.round(v))}
        benchmark={{ value: stats.avg, label: avgLabel }}
        minPoints={3}
        markLast
        height={160}
        readoutPlacement="below"
        readoutLabels={(first) => ({
          value: lastRound ? (
            <Link
              href={`/golf/dashboard/rounds/${lastRound.id}`}
              data-slot="last-round-link"
              className={cn(
                // 44px target on a one-line label: the negative block margin
                // keeps the readout's visual height while the hit area grows.
                '-my-2.5 inline-flex min-h-[44px] items-center gap-1 rounded-fw-sm',
                'font-fw-sans text-caption text-text-secondary hover:text-text-primary',
                fwFocusRing,
                fwTransition,
              )}
            >
              <span>
                Last{lastToPar ? ` (${lastToPar})` : ''} · {lastCourse} ·{' '}
                {formatDateOnlyShort(lastRound.round_date)}
              </span>
              <ChevronRight aria-hidden className="h-3.5 w-3.5 flex-shrink-0 text-text-tertiary" />
            </Link>
          ) : (
            'Last round'
          ),
          delta: `vs ${String(first.x)}`,
        })}
        takeaway="Your scores by round, newest last; the dashed line is your average."
      />
    </section>
  );
}

// ── Instruments ─────────────────────────────────────────────────────────────

export interface ScoreBandHistogramProps {
  rounds: ReadonlyArray<RoundLibraryRound>;
  underParPct: number;
  className?: string;
}

/** Where the scores land. Hidden under three rounds with a to-par. */
export function ScoreBandHistogram({ rounds, underParPct, className }: ScoreBandHistogramProps) {
  const bands = React.useMemo(() => scoreBands(rounds), [rounds]);
  const scored = bands.reduce((s, b) => s + (b.n ?? 0), 0);
  if (scored < 3) return null;
  const takeaway = `Under par in ${underParPct}% of rounds.`;
  return (
    <section aria-label="Where your scores land" className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-col gap-1">
        <Eyebrow>Where your scores land</Eyebrow>
        <p className="font-fw-sans text-body-sm text-text-secondary">{takeaway}</p>
      </div>
      {/* No `unit` suffix: "n=10 rounds" wraps inside the primitive's
          fixed-height caption slot at phone width; the aria-label carries it. */}
      <BandHistogram
        bands={bands}
        ariaLabel={`Where your scores land: under par in ${underParPct}% of ${scored} rounds`}
      />
    </section>
  );
}

export interface RoundTypeSegmentProps {
  rounds: ReadonlyArray<RoundLibraryRound>;
  className?: string;
}

/** Practice · qualifier · tournament as one bar. Hidden under two types. */
export function RoundTypeSegment({ rounds, className }: RoundTypeSegmentProps) {
  const summary = React.useMemo(() => roundTypeSummary(rounds), [rounds]);
  if (summary.length < 2) return null;
  const parts: SegmentBarPart[] = summary.map((s) => ({
    label: s.label,
    value: s.count,
    tone: 'neutral',
    color: TYPE_COLOR[s.key],
  }));
  let primary = 0;
  summary.forEach((s, i) => {
    if (s.count > summary[primary]!.count) primary = i;
  });
  const averages = typeAveragesLine(summary);
  return (
    <section aria-label="When it counts" className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-col gap-1">
        <Eyebrow>When it counts</Eyebrow>
        {averages ? (
          <p className="font-fw-sans text-body-sm tabular-nums text-text-secondary">{averages}</p>
        ) : null}
      </div>
      <SegmentBar
        title="Rounds by type"
        parts={parts}
        primary={primary}
        thickness={20}
        takeaway={averages || undefined}
      />
    </section>
  );
}

export interface MonthDeviationBarsProps {
  rows: ReadonlyArray<DivergingRow>;
  seasonAvg: number;
  className?: string;
}

/**
 * Month average against the season average. A zero-based bar of 72 vs 78
 * reads as equal, so the by-month visual is the signed deviation: green
 * left of the line is a better month, amber right of it a worse one.
 */
export function MonthDeviationBars({ rows, seasonAvg, className }: MonthDeviationBarsProps) {
  if (rows.length < 2) return null;
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.delta)));
  return (
    <section aria-label="By month" className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-col gap-1">
        <Eyebrow>By month</Eyebrow>
        <p className="font-fw-sans text-body-sm text-text-secondary">
          Each month&apos;s average against your season average of {seasonAvg.toFixed(1)}. Months
          with two or more scored rounds.
        </p>
      </div>
      <DivergingBars rows={rows as DivergingRow[]} max={max} />
    </section>
  );
}

// ── Seam-header sparkline with a caption ────────────────────────────────────

export interface SeamSparkProps {
  data: ReadonlyArray<number>;
  goodDirection: GoodDirection;
  flatThreshold: number;
  /** Visible caption under the line ("Score", "Putts", "GIR"). */
  caption: string;
  /** Accessible name for the figure. */
  label: string;
  captionClassName?: string;
  className?: string;
}

export function SeamSpark({
  data,
  goodDirection,
  flatThreshold,
  caption,
  label,
  captionClassName,
  className,
}: SeamSparkProps) {
  return (
    <span className={cn('flex flex-shrink-0 flex-col items-end gap-0.5', className)}>
      <Sparkline
        data={data}
        goodDirection={goodDirection}
        flatThreshold={flatThreshold}
        width={96}
        height={24}
        label={label}
      />
      <span
        className={cn(
          'font-fw-sans text-microbadge uppercase tracking-[0.06em] text-text-tertiary',
          captionClassName,
        )}
      >
        {caption}
      </span>
    </span>
  );
}
