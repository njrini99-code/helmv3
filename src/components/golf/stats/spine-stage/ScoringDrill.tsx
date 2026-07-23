'use client';

/**
 * ============================================================================
 * ScoringDrill — `?area=scoring` (spec §5.1)
 * ----------------------------------------------------------------------------
 * HERO — a single full-width `SegmentBar` of the season's score mix (eagle-
 * or-better / birdie / par / bogey / double+ shares, best → worst left to
 * right, semantic ramp: birdie-or-better in accent ink, par neutral, bogey
 * warning-tinted, double+ danger-tinted) with an integrated "label pct%"
 * legend, plus a per-round mono caption line underneath. Zero rounds → the
 * bar's own honest empty state, never a fabricated segment.
 *
 * Below the hero: par-split outcome mix (reused `BarCompare`), the detailed
 * per-round scoring rates + scoring-by-round-type Readout bands, streak/best
 * headline readouts, and the worst holes from `getWorstHoleAnalysis` as a
 * ranked list (rank IS the leak-severity order).
 * ========================================================================== */

import { DrillPanel, RankCell, useStage } from '@/components/fairway/modules';
import {
  InstrumentPanel,
  Readout,
  BarCompare,
  InlineNotice,
  Eyebrow,
  SegmentBar,
  type SegmentBarPart,
  type ReadoutDelta,
} from '@/components/fairway';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import type { TrendAnalysisResponse, WorstHoleResponse } from '@/app/golf/actions/stats-data-types';
import { DEFAULT_MIN_PLAYS } from '@/lib/golf/worst-hole-ranking';
import { CategoryInsightStrip } from './CategoryInsightStrip';
import { buildCategoryInsights, buildCategoryTrends } from './buildStatsViewModel';
import type { CategorizablePatternWithImpact } from './buildStatsViewModel';

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
/** Signed avg-strokes delta display, e.g. "+0.4" / "−0.4" / "0.0" — mirrors
 *  `RoundsDrill`'s `fmtSignedNum` verbatim (kept as a small local duplicate
 *  rather than a cross-drill import, same spirit as this file's other
 *  formatters). */
function fmtSignedAvg(diff: number): string {
  const magnitude = Math.abs(diff).toFixed(1);
  if (Number(magnitude) === 0) return magnitude;
  return `${diff > 0 ? '+' : '−'}${magnitude}`;
}
/** A period-comparison Readout delta (last-30d vs previous-30d), direction-
 *  aware so a falling (lower-is-better) scoring average still renders the
 *  GOOD green ▲ rather than a false amber ▼ — same `good`-vs-raw-direction
 *  split `RoundsDrill`'s `deltaDirection` applies to the identical data. */
function readoutDeltaFromPeriod(
  last: number | null | undefined,
  previous: number | null | undefined,
  higherIsBetter: boolean,
  caption: string,
): ReadoutDelta | undefined {
  const l = finite(last);
  const p = finite(previous);
  if (l === null || p === null) return undefined;
  const diff = l - p;
  const good = higherIsBetter ? diff > 0 : diff < 0;
  return {
    value: diff,
    direction: diff === 0 ? 'flat' : good ? 'up' : 'down',
    format: () => fmtSignedAvg(diff),
    caption,
  };
}
function fmtToPar(v: number | null): string {
  if (v === null) return '—';
  if (Math.abs(v) < 0.05) return 'E';
  return v > 0 ? `+${v.toFixed(2)}` : `−${Math.abs(v).toFixed(2)}`;
}
function pctOf(n: number, total: number): number {
  return total > 0 ? (n / total) * 100 : 0;
}
/** Per-round rate for the mono caption line — 2 decimals, honest em-dash. */
function fmtRate(n: number | null): string {
  return n === null ? '—' : n.toFixed(2);
}

const PAR_KEYS = [
  { key: 'par3', label: 'Par 3' },
  { key: 'par4', label: 'Par 4' },
  { key: 'par5', label: 'Par 5' },
] as const;

export interface ScoringDrillProps {
  detailedStats: GolfStats | null;
  worstHoles: WorstHoleResponse | null;
  /** CoachHelm's mined patterns (`getPlayerPatterns`) — feeds the "What
   *  CoachHelm sees" scoring-category insights via `buildCategoryInsights`. */
  patterns?: ReadonlyArray<CategorizablePatternWithImpact>;
  /** `getTrendAnalysis`'s round-level trend series — the `score` series
   *  feeds the CategoryInsightStrip's inline trend via `buildCategoryTrends`. */
  trends?: TrendAnalysisResponse['trends'] | null;
  /** Last-30-days vs previous-30-days comparison — SAME source `RoundsDrill`'s
   *  comparison band uses — feeds the Scoring-average Readout's delta. */
  periodComparison?: TrendAnalysisResponse['periodComparison'];
  /** Personal bests — SAME source `RoundsDrill`'s personal-bests band uses —
   *  feeds the Best-round Readout's course/date caption. */
  personalBests?: TrendAnalysisResponse['personalBests'];
}

export function ScoringDrill({
  detailedStats,
  worstHoles,
  patterns = [],
  trends = null,
  periodComparison,
  personalBests,
}: ScoringDrillProps) {
  const { home } = useStage();
  const s = detailedStats;

  const categoryInsights = buildCategoryInsights(patterns);
  const categoryTrends = buildCategoryTrends(trends);
  const scoringInsights = categoryInsights.scoring;
  const scoringTrend = categoryTrends.scoring;

  const parCards = PAR_KEYS.map(({ key, label }) => ({ label, d: s?.scoringByPar[key] }))
    .filter((c) => (c.d?.total ?? 0) > 0)
    .map((c) => ({ label: c.label, d: c.d! }));

  // Season totals + per-round rates for each scoring outcome — shared by the
  // hero SegmentBar (counts → shares) and the detailed per-round band below
  // (rate + season total per outcome).
  const totalEagles = s?.totalEagles ?? 0;
  const totalBirdies = s?.totalBirdies ?? 0;
  const totalPars = s?.totalPars ?? 0;
  const totalBogeys = s?.totalBogeys ?? 0;
  const totalDoublePlus = s?.totalDoublePlus ?? 0;

  const eaglesPerRound = finite(s?.eaglesPerRound);
  const birdiesPerRound = finite(s?.birdiesPerRound);
  const parsPerRound = finite(s?.parsPerRound);
  const bogeysPerRound = finite(s?.bogeysPerRound);
  const doublePlusPerRound = finite(s?.doublePlusPerRound);

  // Per-round scoring rates, each with its season total as a mono caption.
  // Hidden entirely when there are no rounds (rate + total would both be 0,
  // an honest but useless band).
  const scoringRates: Array<{ label: string; rate: number | null; total: number }> = [
    { label: 'Eagles / round', rate: eaglesPerRound, total: totalEagles },
    { label: 'Birdies / round', rate: birdiesPerRound, total: totalBirdies },
    { label: 'Pars / round', rate: parsPerRound, total: totalPars },
    { label: 'Bogeys / round', rate: bogeysPerRound, total: totalBogeys },
    { label: 'Double+ / round', rate: doublePlusPerRound, total: totalDoublePlus },
  ];
  const hasScoringRates = (s?.roundsPlayed ?? 0) > 0;

  // HERO — the score-mix SegmentBar, best → worst left to right. Color ramp
  // per the design spec: birdie-or-better in the accent ("good") ink, par
  // neutral, bogey the warning ("caution") tint, double+ an explicit muted
  // danger-token override (SegmentBar's built-in tones stop at "caution").
  const scoreMixParts: SegmentBarPart[] = [
    { label: 'Eagle or better', value: totalEagles, tone: 'good' },
    { label: 'Birdie', value: totalBirdies, tone: 'good' },
    { label: 'Par', value: totalPars, tone: 'neutral' },
    { label: 'Bogey', value: totalBogeys, tone: 'caution' },
    { label: 'Double+', value: totalDoublePlus, color: 'var(--fw-color-danger)' },
  ];
  const perRoundLine = `per round: E ${fmtRate(eaglesPerRound)} · B ${fmtRate(birdiesPerRound)} · P ${fmtRate(parsPerRound)} · Bo ${fmtRate(bogeysPerRound)} · D+ ${fmtRate(doublePlusPerRound)}`;

  // Scoring average + round count by round type. A type with zero rounds
  // played stays an honest awaiting readout rather than a fabricated 0 avg.
  const roundTypeRows: Array<{ label: string; avg: number | null; rounds: number }> = [
    { label: 'Practice', avg: finite(s?.practiceScoringAvg), rounds: s?.practiceRounds ?? 0 },
    { label: 'Qualifying', avg: finite(s?.qualifyingScoringAvg), rounds: s?.qualifyingRounds ?? 0 },
    { label: 'Tournament', avg: finite(s?.tournamentScoringAvg), rounds: s?.tournamentRounds ?? 0 },
  ];
  const hasRoundTypeData = roundTypeRows.some((r) => r.rounds > 0);

  const worstItems = (worstHoles?.worstHoles ?? []).slice(0, 5).map((h, i) => ({
    rank: i + 1,
    title: `Hole ${h.holeNumber} · Par ${h.par}`,
    value: fmtToPar(h.averageToPar),
  }));
  // Data exists (holes were played) but nothing clears the per-hole sample
  // floor — an honest "not enough plays yet" note, not a bare empty state.
  const belowSampleFloor = worstItems.length === 0 && (worstHoles?.holes.length ?? 0) > 0;

  return (
    <DrillPanel title="Scoring" backLabel="All areas" onBack={home}>
      <div className="flex flex-col gap-6">
        <CategoryInsightStrip
          insights={scoringInsights}
          series={scoringTrend?.series}
          delta={scoringTrend?.delta}
          trendLabel={scoringTrend?.label}
          goodDirection="down"
        />
        {/* HERO — score mix */}
        <div className="flex flex-col gap-2">
          <SegmentBar
            title="Score mix"
            overline="Scoring"
            takeaway="Share of holes by scoring outcome, best to worst."
            parts={scoreMixParts}
            primary={1}
          />
          {hasScoringRates ? (
            <p className="font-fw-mono text-caption tabular-nums text-text-tertiary">
              {perRoundLine}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          <InstrumentPanel tone="accent" depth="raised" padding="md" className="flex min-h-[138px] items-center transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-raise motion-reduce:transform-none">
            <Readout
              value={finite(s?.scoringAverage) ?? undefined}
              label="Scoring average"
              size="md"
              state={s?.scoringAverage != null ? 'live' : 'awaiting'}
              awaitingLabel="No rounds"
              delta={readoutDeltaFromPeriod(
                periodComparison?.last30Days.scoringAvg,
                periodComparison?.previous30Days.scoringAvg,
                false,
                'vs prior 30d',
              )}
            />
          </InstrumentPanel>
          <InstrumentPanel depth="base" padding="md" className="flex min-h-[138px] items-center transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-raise motion-reduce:transform-none">
            <Readout display={fmtToPar(finite(s?.avgScoreToPar))} label="Avg to par" size="md" state={s?.avgScoreToPar != null ? 'live' : 'awaiting'} awaitingLabel="No rounds" />
          </InstrumentPanel>
          <InstrumentPanel depth="base" padding="md" className="flex min-h-[138px] items-center transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-raise motion-reduce:transform-none">
            <div className="flex w-full flex-col gap-1">
              <Readout value={finite(s?.bestRound) ?? undefined} label="Best round" size="md" state={s?.bestRound != null ? 'live' : 'awaiting'} awaitingLabel="No rounds" />
              {personalBests?.bestScore ? (
                <p className="truncate font-fw-sans text-caption text-text-tertiary">
                  {personalBests.bestScore.course} · {fmtShortDate(personalBests.bestScore.date)}
                </p>
              ) : null}
            </div>
          </InstrumentPanel>
          <InstrumentPanel depth="raised" padding="md" className="flex min-h-[138px] items-center transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-raise motion-reduce:transform-none">
            <Readout value={finite(s?.worstRound) ?? undefined} label="Worst round" size="md" state={s?.worstRound != null ? 'live' : 'awaiting'} awaitingLabel="No rounds" />
          </InstrumentPanel>
        </div>

        {hasScoringRates ? (
          <div className="flex flex-col gap-2">
            <Eyebrow as="h4">Per round</Eyebrow>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-5">
              {scoringRates.map((r) => (
                <InstrumentPanel key={r.label} depth="base" padding="md" className="flex min-h-[132px] flex-col justify-between transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-raise motion-reduce:transform-none">
                  <Readout
                    value={r.rate ?? undefined}
                    format={{ maximumFractionDigits: 2 }}
                    label={r.label}
                    size="sm"
                    state={r.rate != null ? 'live' : 'awaiting'}
                    awaitingLabel="—"
                  />
                  <p className="mt-1 font-fw-mono text-caption tabular-nums text-text-tertiary">
                    {r.total} total
                  </p>
                </InstrumentPanel>
              ))}
            </div>
          </div>
        ) : null}

        {parCards.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {parCards.map(({ label, d }) => {
              const bars = [
                { label: 'Birdie+', value: pctOf(d.eagle + d.birdie, d.total) },
                { label: 'Par', value: pctOf(d.par, d.total) },
                { label: 'Bogey', value: pctOf(d.bogey, d.total) },
                { label: 'Double+', value: pctOf(d.doublePlus, d.total) },
              ];
              let maxIdx = 0;
              for (let i = 1; i < bars.length; i++) if ((bars[i]?.value ?? 0) > (bars[maxIdx]?.value ?? 0)) maxIdx = i;
              return (
                <BarCompare
                  key={label}
                  title={label}
                  overline="Scoring"
                  subtitle={`${fmtToPar(d.avgToPar)} / hole · ${d.total} holes`}
                  takeaway={`Score distribution on ${label.toLowerCase()}s.`}
                  data={bars.map((b, i) => ({ ...b, highlight: i === maxIdx }))}
                  height={160}
                  valueFormatter={(v) => `${Math.round(v)}%`}
                />
              );
            })}
          </div>
        ) : null}

        {hasRoundTypeData ? (
          <div className="flex flex-col gap-2">
            <Eyebrow as="h4">Scoring by round type</Eyebrow>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {roundTypeRows.map((r) => (
                <InstrumentPanel key={r.label} depth="base" padding="md">
                  <Readout
                    value={r.avg ?? undefined}
                    format={{ maximumFractionDigits: 1 }}
                    label={r.label}
                    size="sm"
                    state={r.rounds > 0 ? 'live' : 'awaiting'}
                    awaitingLabel="No rounds"
                  />
                  <p className="mt-1 font-fw-mono text-caption tabular-nums text-text-tertiary">
                    {r.rounds > 0 ? `${r.rounds} round${r.rounds === 1 ? '' : 's'}` : '—'}
                  </p>
                </InstrumentPanel>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Eyebrow as="h4">Streaks &amp; records</Eyebrow>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <InstrumentPanel depth="base" padding="md">
              <Readout value={finite(s?.mostBirdiesRound) ?? undefined} label="Most birdies / round" size="sm" state={s?.mostBirdiesRound != null ? 'live' : 'awaiting'} awaitingLabel="—" />
            </InstrumentPanel>
            <InstrumentPanel depth="base" padding="md">
              <Readout value={finite(s?.mostBirdiesRow) ?? undefined} label="Most birdies in a row" size="sm" state={s?.mostBirdiesRow != null ? 'live' : 'awaiting'} awaitingLabel="—" />
            </InstrumentPanel>
            <InstrumentPanel depth="base" padding="md">
              <Readout value={finite(s?.mostParsRow) ?? undefined} label="Most pars in a row" size="sm" state={s?.mostParsRow != null ? 'live' : 'awaiting'} awaitingLabel="—" />
            </InstrumentPanel>
            <InstrumentPanel depth="base" padding="md">
              <Readout value={finite(s?.longestNo3PuttStreak) ?? undefined} unit="holes" label="Longest no-3-putt streak" size="sm" state={s?.longestNo3PuttStreak != null ? 'live' : 'awaiting'} awaitingLabel="—" />
            </InstrumentPanel>
            <InstrumentPanel depth="base" padding="md">
              <Readout value={finite(s?.longestHoleOut) ?? undefined} unit="yds" label="Longest hole-out" size="sm" state={s?.longestHoleOut != null ? 'live' : 'awaiting'} awaitingLabel="—" />
            </InstrumentPanel>
          </div>
        </div>

        {worstItems.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h4 className="font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
              Toughest holes
            </h4>
            <ol className="grid gap-2.5 rounded-card border border-border-subtle bg-surface p-4">
              {worstItems.map((item) => (
                <li key={item.rank} className="grid grid-cols-[38px_1fr_auto] items-center gap-2.5">
                  <RankCell rank={item.rank} of={worstItems.length} />
                  <span className="min-w-0 truncate font-fw-sans text-body-sm font-semibold text-text-primary">
                    {item.title}
                  </span>
                  <span className="font-fw-mono text-caption tabular-nums text-fw-warning">
                    {item.value}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ) : belowSampleFloor ? (
          <InlineNotice tone="info" title="Toughest holes">
            {`Need ${DEFAULT_MIN_PLAYS}+ plays of a hole before it can be ranked.`}
          </InlineNotice>
        ) : null}
      </div>
    </DrillPanel>
  );
}
