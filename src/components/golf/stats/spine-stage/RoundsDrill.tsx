'use client';

/**
 * ============================================================================
 * RoundsDrill — `?area=rounds` (spec §5.1, "trend home")
 * ----------------------------------------------------------------------------
 * The full score-by-round `Ribbon` trend (with the last-30-day scoring
 * average as a dashed benchmark), a `Personal bests` readout band, a
 * `Last 30 days vs previous 30` direction-aware comparison band, and the
 * last-10 logged rounds list, each linking out to its own Round Review.
 *
 * `scoreTrend`/`personalBests`/`periodComparison` all come from the SAME
 * `getTrendAnalysis` payload `rounds` already does — previously fetched into
 * `StatsSpineStage`'s `trendData` and dropped on the floor. Every field here
 * is honest-null-guarded: a starved figure renders `Readout`'s dim
 * "awaiting signal" state, never a fabricated zero.
 * ========================================================================== */

import Link from 'next/link';
import { DrillPanel, useStage } from '@/components/fairway/modules';
import { EmptyState, Eyebrow, InstrumentPanel, Readout, Ribbon } from '@/components/fairway';
import type { RibbonPoint } from '@/components/fairway';
import type { TrendAnalysisResponse } from '@/app/golf/actions/stats-data-types';

function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Signed integer to-par, e.g. "+3" / "−2" / "E" — the same convention the
 *  last-10 list already used inline, extracted so the personal-bests band
 *  reuses it verbatim instead of re-deriving the sign logic. */
function fmtToParInt(v: number | null): string {
  if (v === null) return '—';
  if (v === 0) return 'E';
  return v > 0 ? `+${v}` : `−${Math.abs(v)}`;
}

/** Putts can be a fractional 18-hole-normalized value for a 9-hole round
 *  (see `getTrendAnalysis`'s `normalizedPutts`) — only show the decimal
 *  when it's actually there. */
function fmtPuttsCount(v: number | null): string {
  if (v === null) return '—';
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function fmtSignedPct(delta: number): string {
  const rounded = Math.round(Math.abs(delta));
  if (rounded === 0) return '0%';
  return `${delta > 0 ? '+' : '−'}${rounded}%`;
}

function fmtSignedNum(delta: number, digits = 1): string {
  const magnitude = Math.abs(delta).toFixed(digits);
  if (Number(magnitude) === 0) return magnitude;
  return `${delta > 0 ? '+' : '−'}${magnitude}`;
}

/** Readout's `delta.direction` is a GOOD/BAD semantic (up=green/good,
 *  down=amber/bad), not the raw sign — same convention `Ribbon`'s
 *  `trendDirection` uses (bug #915: a lower-is-better metric falling must
 *  read as the green "up", not a false amber "down"). */
function deltaDirection(diff: number, higherIsBetter: boolean): 'up' | 'down' | 'flat' {
  if (diff === 0) return 'flat';
  const rawRising = diff > 0;
  const improving = higherIsBetter ? rawRising : !rawRising;
  return improving ? 'up' : 'down';
}

interface ComparisonMetric {
  key: string;
  label: string;
  last: number | null;
  previous: number | null;
  higherIsBetter: boolean;
  formatValue: (v: number) => string;
  formatDelta: (diff: number) => string;
}

const EMPTY_PERSONAL_BESTS: TrendAnalysisResponse['personalBests'] = {
  bestScore: null,
  bestToPar: null,
  bestGir: null,
  lowestPutts: null,
};

export interface RoundsDrillProps {
  rounds: TrendAnalysisResponse['rounds'];
  /** Full score-by-round series (`trendData.trends.score`) — the Ribbon
   *  plots ALL of it, not just the last 10. */
  scoreTrend?: TrendAnalysisResponse['trends']['score'];
  personalBests?: TrendAnalysisResponse['personalBests'];
  periodComparison?: TrendAnalysisResponse['periodComparison'];
}

export function RoundsDrill({
  rounds,
  scoreTrend = [],
  personalBests = EMPTY_PERSONAL_BESTS,
  periodComparison,
}: RoundsDrillProps) {
  const { home } = useStage();
  const recent = [...rounds].slice(-10).reverse();

  const ribbonPoints: RibbonPoint[] = scoreTrend.map((p) => ({ x: p.date, y: p.value }));
  const scoreBenchmark = finite(periodComparison?.last30Days.scoringAvg ?? null);

  const comparisonMetrics: ComparisonMetric[] = [
    {
      key: 'scoring',
      label: 'Scoring avg',
      last: finite(periodComparison?.last30Days.scoringAvg ?? null),
      previous: finite(periodComparison?.previous30Days.scoringAvg ?? null),
      higherIsBetter: false,
      formatValue: (v) => v.toFixed(1),
      formatDelta: (d) => fmtSignedNum(d, 1),
    },
    {
      key: 'gir',
      label: 'GIR',
      last: finite(periodComparison?.last30Days.girPct ?? null),
      previous: finite(periodComparison?.previous30Days.girPct ?? null),
      higherIsBetter: true,
      formatValue: (v) => `${Math.round(v)}%`,
      formatDelta: fmtSignedPct,
    },
    {
      key: 'fairways',
      label: 'Fairways',
      last: finite(periodComparison?.last30Days.fairwayPct ?? null),
      previous: finite(periodComparison?.previous30Days.fairwayPct ?? null),
      higherIsBetter: true,
      formatValue: (v) => `${Math.round(v)}%`,
      formatDelta: fmtSignedPct,
    },
    {
      key: 'putts',
      label: 'Putts / rd',
      last: finite(periodComparison?.last30Days.puttsPerRound ?? null),
      previous: finite(periodComparison?.previous30Days.puttsPerRound ?? null),
      higherIsBetter: false,
      formatValue: (v) => v.toFixed(1),
      formatDelta: (d) => fmtSignedNum(d, 1),
    },
  ];

  return (
    <DrillPanel title="Rounds" backLabel="All areas" onBack={home}>
      {recent.length === 0 ? (
        <EmptyState title="No rounds yet" description="Logged rounds will appear here." />
      ) : (
        <div className="flex flex-col gap-6">
          <Ribbon
            title="Score by round"
            overline="Trend"
            data={ribbonPoints}
            benchmark={scoreBenchmark !== null ? { value: scoreBenchmark, label: 'Last 30d avg' } : undefined}
            valueFormatter={(v) => String(Math.round(v))}
            seriesName="Score"
            goodDirection="down"
            height={220}
          />

          <div className="flex flex-col gap-3">
            <Eyebrow as="h4">Personal bests</Eyebrow>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <InstrumentPanel depth="base" padding="md">
                <Readout
                  value={personalBests.bestScore?.value}
                  label="Best score"
                  size="md"
                  state={personalBests.bestScore ? 'live' : 'awaiting'}
                  awaitingLabel="No rounds"
                />
                {personalBests.bestScore ? (
                  <p className="mt-1 truncate font-fw-sans text-caption text-text-tertiary">
                    {personalBests.bestScore.course} · {fmtShortDate(personalBests.bestScore.date)}
                  </p>
                ) : null}
              </InstrumentPanel>
              <InstrumentPanel depth="base" padding="md">
                <Readout
                  display={fmtToParInt(finite(personalBests.bestToPar?.value ?? null))}
                  label="Best vs par"
                  size="md"
                  state={personalBests.bestToPar ? 'live' : 'awaiting'}
                  awaitingLabel="No rounds"
                />
                {personalBests.bestToPar ? (
                  <p className="mt-1 truncate font-fw-sans text-caption text-text-tertiary">
                    {personalBests.bestToPar.course} · {fmtShortDate(personalBests.bestToPar.date)}
                  </p>
                ) : null}
              </InstrumentPanel>
              <InstrumentPanel depth="base" padding="md">
                <Readout
                  display={
                    personalBests.bestGir ? `${Math.round(personalBests.bestGir.value)}%` : undefined
                  }
                  label="Best GIR%"
                  size="md"
                  state={personalBests.bestGir ? 'live' : 'awaiting'}
                  awaitingLabel="No rounds"
                />
                {personalBests.bestGir ? (
                  <p className="mt-1 truncate font-fw-sans text-caption text-text-tertiary">
                    {personalBests.bestGir.course} · {fmtShortDate(personalBests.bestGir.date)}
                  </p>
                ) : null}
              </InstrumentPanel>
              <InstrumentPanel depth="base" padding="md">
                <Readout
                  display={fmtPuttsCount(finite(personalBests.lowestPutts?.value ?? null))}
                  label="Fewest putts"
                  size="md"
                  state={personalBests.lowestPutts ? 'live' : 'awaiting'}
                  awaitingLabel="No rounds"
                />
                {personalBests.lowestPutts ? (
                  <p className="mt-1 truncate font-fw-sans text-caption text-text-tertiary">
                    {personalBests.lowestPutts.course} · {fmtShortDate(personalBests.lowestPutts.date)}
                  </p>
                ) : null}
              </InstrumentPanel>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Eyebrow as="h4">Last 30 days vs previous 30</Eyebrow>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {comparisonMetrics.map((m) => {
                const diff = m.last !== null && m.previous !== null ? m.last - m.previous : null;
                return (
                  <InstrumentPanel key={m.key} depth="base" padding="md">
                    <Readout
                      display={m.last !== null ? m.formatValue(m.last) : undefined}
                      label={m.label}
                      size="md"
                      state={m.last !== null ? 'live' : 'awaiting'}
                      awaitingLabel="No rounds"
                      delta={
                        diff !== null
                          ? {
                              value: diff,
                              direction: deltaDirection(diff, m.higherIsBetter),
                              format: m.formatDelta,
                              caption: 'vs prior 30d',
                            }
                          : undefined
                      }
                    />
                  </InstrumentPanel>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Eyebrow as="h4">Last 10 rounds</Eyebrow>
            <div className="flex flex-col gap-2">
              {recent.map((round) => {
                const toPar = round.toPar ?? 0;
                const toneClass = toPar < 0 ? 'text-accent-600' : toPar > 0 ? 'text-fw-warning-ink' : 'text-text-secondary';
                const formattedDate = fmtShortDate(round.date);
                return (
                  <Link
                    key={round.id}
                    href={`/golf/dashboard/rounds/${round.id}`}
                    className="group flex items-center gap-4 rounded-card border border-border-subtle bg-surface px-4 py-3 outline-none transition-colors [transition-duration:180ms] hover:bg-surface-tint focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
                  >
                    <span className={`grid h-11 w-11 flex-shrink-0 place-items-center rounded-fw-md bg-inset font-fw-mono text-body font-medium tabular-nums ${toneClass}`}>
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
                      {fmtToParInt(toPar)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </DrillPanel>
  );
}
