/**
 * ============================================================================
 * Coach player dossier · pure logic
 * (docs/design/fairway-facelift/screens/roster-player.v3.md)
 * ----------------------------------------------------------------------------
 * Every derivation the player field sheet needs, with no JSX and no React, so
 * the arithmetic is unit-testable without a DOM.
 *
 * Nothing here reads a clock. `today` arrives as a bare `YYYY-MM-DD` string
 * resolved once in the route loader, which is what keeps the server render and
 * the client's first paint identical. Date-only columns are parsed at LOCAL
 * midnight — never through `new Date(str)`, which reads a bare date as UTC and
 * renders the previous calendar day for every zone behind Greenwich.
 *
 * The page has three consumers of ONE round fetch (the strip, the scoring
 * trend, the table), so the windowing decisions live here rather than in three
 * components that could drift apart.
 * ========================================================================== */

import { computeScoringTrendFromRounds } from '@/lib/golf/scoring-trend';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
// Imported from the pure helper module rather than the `StandingBar` barrel:
// the barrel is `index.tsx` and re-exports React components, which a JSX-free
// logic module has no business pulling into its import graph.
import {
  neutralizeForCoach,
  teamCohortText,
  teamRelativeText,
} from '@/components/golf/coachhelm/v3/StandingBar/utils';
import { formatSgSigned } from '@/components/golf/stats/spine-stage/buildStatsViewModel';
import { shortDay, titleCase, type VerdictPart } from '@/components/fairway/pages/dashboard/coach-home-logic';
import type { ReadoutItem } from '@/components/fairway/pages/dashboard/coach-home-parts';
import type { ScoreFieldRound, ScoreFieldRow } from '@/components/fairway/modules/types';
import type { PlayerStandingRow } from '@/app/golf/actions/stats-leak-maps-types';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';

/** Rows the loader fetches: enough for the strip's shape, the 5-vs-5 trend
 *  window and a table worth calling a table, in one query. */
export const DOSSIER_ROUND_LIMIT = 12;

/** The one glyph a missing number renders as anywhere on this page. The
 *  shared readouts column uses `value ?? '–'` (EN dash, U+2013); every local
 *  formatter below agrees with it rather than emitting the EM dash that
 *  `formatSgSigned`/`formatToPar` fall back to, which LANGUAGE.md bans. */
export const MISSING = '–';

/* ── Round shape ──────────────────────────────────────────────────────────── */

export interface DossierRound {
  id: string;
  round_date: string | null;
  course_name: string | null;
  round_type: string | null;
  total_score: number | null;
  score_to_par: number | null;
  holes_played: number | null;
  total_putts: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
}

/* ── Dates ────────────────────────────────────────────────────────────────── */

const DAY_MS = 86_400_000;
const YEAR_MS = 365 * DAY_MS;

/** A date-only column as a LOCAL-midnight timestamp (same rule
 *  `qualifiers-field-logic.ts:33` follows). */
export function localMidnight(dateStr: string): number {
  const [y, m, d] = (dateStr.split('T')[0] ?? dateStr).split('-').map(Number);
  if (!y || !m || !d) return Number.NaN;
  return new Date(y, m - 1, d).getTime();
}

/**
 * How far from today a round may sit and still be drawn on an axis.
 *
 * Not defensive decoration: production golf rows carry dates like
 * "60824-02-02" (the same load-test junk that stretched the qualifiers axis
 * across fifty-eight thousand years and drove its monthly tick loop through
 * ~700k iterations — see `qualifiers-field-logic.ts:51`). One bad row must not
 * be able to destroy the instrument for every good one. The row still belongs
 * in the table, which has no axis to wreck; it is only excluded from the plot.
 */
export const DOMAIN_LIMIT_YEARS = 5;

export function isPlottable(dateStr: string | null | undefined, today: string): boolean {
  if (!dateStr) return false;
  const t = localMidnight(dateStr);
  const now = localMidnight(today);
  if (!Number.isFinite(t) || !Number.isFinite(now)) return false;
  return Math.abs(t - now) <= DOMAIN_LIMIT_YEARS * YEAR_MS;
}

/* ── Formatters (string only, never a fabricated number) ──────────────────── */

export function formatOne(value: number | null | undefined): string {
  return value != null && Number.isFinite(value) ? value.toFixed(1) : MISSING;
}

export function formatPct(value: number | null | undefined): string {
  return value != null && Number.isFinite(value) ? `${Math.round(value)}%` : MISSING;
}

/** "E" at level par, signed otherwise, with the Unicode minus — the shared
 *  `formatToPar` convention, minus its EM-dash null fallback. */
export function formatToParCell(stp: number | null | undefined): string {
  if (stp == null || !Number.isFinite(stp)) return MISSING;
  if (stp === 0) return 'E';
  return stp > 0 ? `+${stp}` : `−${Math.abs(stp)}`;
}

/** Signed strokes gained, with `MISSING` rather than `formatSgSigned`'s em dash. */
export function formatSg(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return MISSING;
  return formatSgSigned(value);
}

const ROUND_TYPE_LABEL: Record<string, string> = {
  qualifier: 'Qualifier',
  tournament: 'Tournament',
  practice: 'Practice',
  casual: 'Casual',
};

export function roundTypeLabel(type: string | null | undefined): string {
  if (!type) return '';
  return ROUND_TYPE_LABEL[type.toLowerCase()] ?? titleCase(type.replace(/_/g, ' '));
}

export function roundDateLabel(date: string | null | undefined): string {
  return date ? shortDay(date) : MISSING;
}

export function courseLabel(name: string | null | undefined): string {
  return name ? titleCase(name) : MISSING;
}

export function girCell(hit: number | null | undefined, possible: number | null | undefined): string {
  return hit != null && possible ? `${hit}/${possible}` : MISSING;
}

export function roundHref(id: string): string {
  return `/golf/dashboard/rounds/${id}`;
}

/* ── The stage: which rounds can be plotted, and on what axis ─────────────── */

/** Newest-first is the order the loader returns and the order the trend
 *  classifier expects; the strip wants oldest-first. Both come off one fetch. */
export function plottableRounds(
  rounds: ReadonlyArray<DossierRound>,
  today: string,
): ScoreFieldRound[] {
  return rounds
    .filter((r) => r.round_date != null && r.total_score != null && r.score_to_par != null)
    .filter((r) => isPlottable(r.round_date, today))
    .map((r) => {
      const date = r.round_date!.slice(0, 10);
      const toPar = r.score_to_par!;
      return {
        id: r.id,
        date,
        score: r.total_score!,
        toPar,
        label: `${shortDay(date)}, ${courseLabel(r.course_name)}, ${r.total_score} (${formatToParCell(toPar)})`,
        href: roundHref(r.id),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The one-row case of the shared `fieldDomain` pattern: oldest plotted round
 *  through today, with no window override (this page has no range picker). */
export function stripDomain(
  plotted: ReadonlyArray<ScoreFieldRound>,
  today: string,
): { start: string; end: string } {
  return { start: plotted[0]?.date ?? today, end: today };
}

/** A one-row `ScoreFieldRow`, so the shared `scoreFieldCap` can be called with
 *  this player alone — the cap is their own largest swing, not a roster's. */
export function stripRow(playerId: string, name: string, plotted: ScoreFieldRound[]): ScoreFieldRow {
  return { id: playerId, name, rounds: plotted, avg: null, trend: null };
}

/* ── The scoring trend (one computation, two readers) ─────────────────────── */

export interface ScoringTrend {
  hasSignal: boolean;
  /** recentAvg − previousAvg in strokes. Negative is better for scoring. */
  delta: number;
  direction: 'improving' | 'declining' | 'stable';
}

/**
 * The canonical 5-vs-5-with-3-previous scoring classifier, fed the widened
 * round fetch newest-first. NOT the split-half `computeSeriesTrend` sparkline
 * readout the coach home uses for its own scoring delta: a different
 * algorithm, not interchangeable, and this route has no series to feed it.
 * The masthead's trend clause and the Scoring avg readout's caption both read
 * this one result, so they can never disagree.
 */
export function scoringTrend(roundsNewestFirst: ReadonlyArray<DossierRound>): ScoringTrend {
  const result = computeScoringTrendFromRounds(
    roundsNewestFirst.map((r) => ({ total_score: r.total_score, holes_played: r.holes_played })),
  );
  return { hasSignal: result.hasSignal, delta: result.delta, direction: result.trend };
}

/* ── Strokes-gained standing ──────────────────────────────────────────────── */

/** The Game Fingerprint report walks these four in this order. */
export const SG_SUB_METRICS = ['sg_ott', 'sg_approach', 'sg_around_green', 'sg_putting'] as const;
export type SgSubMetric = (typeof SG_SUB_METRICS)[number];

export function gameHref(playerId: string): string {
  return `/golf/dashboard/players/${playerId}/game`;
}

export function genomeHref(playerId: string): string {
  return `/golf/dashboard/players/${playerId}/genome`;
}

export function findStandingRow(
  rows: ReadonlyArray<PlayerStandingRow>,
  metricId: string,
): PlayerStandingRow | null {
  return rows.find((r) => r.metric_id === metricId) ?? null;
}

/** The worst of the four SG sub-metrics by team percentile — the same
 *  "worst by team_pct" shape `pickBestWorstStandingIds` uses, narrowed to the
 *  sub-metric set. Null when not one of the four carries a percentile, which
 *  is honest silence rather than a forced claim. */
export function worstSubMetric(rows: ReadonlyArray<PlayerStandingRow>): PlayerStandingRow | null {
  const ranked = rows
    .filter((r) => (SG_SUB_METRICS as readonly string[]).includes(r.metric_id) && r.team_pct != null)
    .sort((a, b) => a.team_pct! - b.team_pct!);
  return ranked[0] ?? null;
}

export interface SgLedgerRow {
  metricId: string;
  /** Row label with the redundant "SG: " prefix dropped — the column heading
   *  already says Strokes gained. The full `display_label` stays on the
   *  spoken label so assistive tech still hears "SG: Approach". */
  label: string;
  fullLabel: string;
  /** Signed strokes per round, formatted. */
  value: string;
  /** Raw value for the bar geometry; null when the row is absent. */
  raw: number | null;
  /** Where this sits on the team, in the coach's voice. Empty when unknown. */
  cohort: string;
  href: string;
}

export function standingLedgerRows(
  rows: ReadonlyArray<PlayerStandingRow>,
  playerId: string,
): SgLedgerRow[] {
  return SG_SUB_METRICS.map((metricId) => {
    const cfg = getMetricRenderConfig(metricId);
    const row = findStandingRow(rows, metricId);
    const fullLabel = cfg?.display_label ?? metricId;
    return {
      metricId,
      label: fullLabel.replace(/^SG:\s*/, ''),
      fullLabel,
      value: formatSg(row?.player_value ?? null),
      raw: row?.player_value ?? null,
      // `teamCohortText` speaks in the player's own voice ("your team"); this
      // page is read by the coach, so it goes through the same neutralizer
      // every other coach-facing standing surface uses. A row that is absent
      // says so rather than sitting blank: an empty line beside a dash reads
      // as "nothing to see", when the truth is "this category has no
      // shot-tracked sample yet".
      cohort: row == null
        ? 'no shot detail yet'
        : neutralizeForCoach(teamCohortText(row.team_pct, row.team_n), 'coach'),
      href: gameHref(playerId),
    };
  });
}

/** Half-domain for the zero-ruled standing bars: the widest of the four
 *  values or the metric's own default scale, so no bar is drawn clipped. */
export function standingHalfSpan(rows: ReadonlyArray<SgLedgerRow>): number {
  let max = 0;
  for (const r of rows) if (r.raw != null && Number.isFinite(r.raw)) max = Math.max(max, Math.abs(r.raw));
  return Math.max(1.5, max);
}

/* ── The masthead verdict ─────────────────────────────────────────────────── */

export interface DossierVerdictInput {
  playerId: string;
  standingRows: ReadonlyArray<PlayerStandingRow>;
  standingUnavailable: boolean;
  trend: ScoringTrend;
}

/**
 * The masthead sentence, built only from fields that exist today.
 *
 * Three branches for the SG headline, checked in order, and only the third
 * lets the sentence continue: a failed fetch is not the same story as a real
 * player who does not have five shot-tracked rounds yet, and neither is the
 * same story as a number that exists.
 *
 * Deliberately number-free after the headline: the readouts column owns the
 * trend magnitude, so the sentence points at where to find it instead of
 * restating it. No glyphs, no dashes, no arrows — this is prose.
 */
export function buildDossierVerdict(input: DossierVerdictInput): VerdictPart[] {
  const { playerId, standingRows, standingUnavailable, trend } = input;
  const parts: VerdictPart[] = [];

  if (standingUnavailable) {
    return [{ text: "Strokes-gained standing couldn't load." }];
  }

  const sgTotal = findStandingRow(standingRows, 'sg_total');
  const total = sgTotal?.player_value;
  if (total == null || !Number.isFinite(total)) {
    return [{ text: 'Strokes-gained standing fills in after 5+ rounds with shot detail.' }];
  }

  parts.push({
    text: total >= 0
      ? `Gaining ${formatSgSigned(total)} strokes per round on the field.`
      : `${formatSgSigned(total)} strokes per round vs the field.`,
  });

  const worst = worstSubMetric(standingRows);
  if (worst) {
    // `display_label.toLowerCase()` alone renders "sg: putting" mid-sentence,
    // which reads as a broken string rather than a category. The redundant
    // prefix comes off first — the sentence already said strokes per round.
    const label = (getMetricRenderConfig(worst.metric_id)?.display_label ?? worst.metric_id)
      .replace(/^SG:\s*/, '')
      .toLowerCase();
    parts.push({ text: ' Leaking most in ' });
    parts.push({ text: label, href: gameHref(playerId) });
    parts.push({ text: '.' });
  }

  if (trend.hasSignal && trend.direction !== 'stable') {
    parts.push({ text: trend.direction === 'improving' ? ' Trending better over ' : ' Trending worse over ' });
    parts.push({ text: 'the last 5 rounds', href: '#rounds' });
    parts.push({ text: '.' });
  }

  return parts;
}

/* ── The readouts column ──────────────────────────────────────────────────── */

export interface DossierReadoutInput {
  detailedStats: GolfStats | null;
  standingRows: ReadonlyArray<PlayerStandingRow>;
  standingUnavailable: boolean;
  roundsUnavailable: boolean;
  trend: ScoringTrend;
  /** How many rounds the strip actually drew. */
  plottedCount: number;
}

const COULD_NOT_LOAD = "couldn't load";

/**
 * Four numbers a coach checks before a 1:1, as hairline rows in one divided
 * column — never four tiles.
 *
 * Every null, failed or not-yet-available number is passed through as
 * `value: null` so the shared readouts column renders its own EN dash. A
 * failed request is never displayed as a real zero, and the caption says
 * which of the two it was.
 */
export function buildDossierReadouts(input: DossierReadoutInput): ReadoutItem[] {
  const { detailedStats, standingRows, standingUnavailable, roundsUnavailable, trend, plottedCount } = input;

  // Scoring average is career-wide; its delta is a five-round window. The
  // label carries "career", the caption carries "last 5 vs prior 5", so the
  // two spans can never be read as one number.
  const scoring: ReadoutItem = {
    key: 'scoring',
    label: 'Scoring avg · career',
    value: detailedStats?.scoringAverage != null ? formatOne(detailedStats.scoringAverage) : null,
    goodDirection: 'down',
  };
  if (roundsUnavailable) {
    scoring.note = COULD_NOT_LOAD;
  } else if (trend.hasSignal) {
    // `SeriesTrend.direction` calls a no-move reading 'flat'; the scoring
    // classifier calls the same thing 'stable'. One vocabulary reaches the
    // shared readouts column.
    scoring.delta = {
      value: trend.delta,
      direction: trend.direction === 'stable' ? 'flat' : trend.direction,
      points: 10,
    };
    scoring.spanLabel = 'last 5 vs prior 5';
  } else {
    scoring.note = 'not enough rounds yet';
  }

  // Value AND comparison come from the SAME standing row. Pairing
  // `detailedStats.girPercentage` (a different calculator) with a
  // standingRows team average would glue two pipelines that were never
  // verified to agree, so the missing-row path shows a dash instead.
  const girRow = findStandingRow(standingRows, 'gir_pct');
  const gir: ReadoutItem = {
    key: 'gir',
    label: 'GIR %',
    value: standingUnavailable || girRow == null ? null : formatPct(girRow.player_value),
    note: standingUnavailable
      ? COULD_NOT_LOAD
      : girRow == null
        ? ''
        : neutralizeForCoach(
            // `unit` is not optional in practice: without it, a player on 64.6%
            // and a team on 65.3% both render "65%" and get narrated as one
            // being below the other.
            teamRelativeText(girRow.player_value, girRow.team_avg, 'higher_better', 'percent'),
            'coach',
          ),
  };

  // No canonical `putts_per_round` metric id exists in the 28-id registry, so
  // there is no team comparison to draw honestly. The caption stays blank
  // rather than fabricating one.
  const putts: ReadoutItem = {
    key: 'putts',
    label: 'Putts/rd · career',
    value: detailedStats?.puttsPerRound != null ? formatOne(detailedStats.puttsPerRound) : null,
    note: '',
  };

  // The one readout that intentionally shows a number the stage does not:
  // every round on file, against the bounded window the strip drew.
  const rounds: ReadoutItem = {
    key: 'rounds',
    label: 'Rounds · career',
    value: detailedStats?.roundsPlayed != null ? String(detailedStats.roundsPlayed) : null,
    note: detailedStats == null
      ? COULD_NOT_LOAD
      : plottedCount > 0
        ? `strip shows the last ${plottedCount}`
        : 'nothing to plot yet',
  };

  return [scoring, gir, putts, rounds];
}

/* ── The table ────────────────────────────────────────────────────────────── */

/** Tone for a score-to-par cell: green under par is ink, amber over par is the
 *  page's only other hue. */
export function toParTone(stp: number | null | undefined): 'under' | 'over' | 'even' {
  if (stp == null || !Number.isFinite(stp)) return 'even';
  if (stp < 0) return 'under';
  if (stp > 0) return 'over';
  return 'even';
}

export function allRoundsHref(playerName: string): string {
  return `/golf/dashboard/rounds?player=${encodeURIComponent(playerName)}`;
}
