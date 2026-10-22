/**
 * Insight angle 3 — "Three-Putt Autopsy" + "Second-Putt Exposure"
 * (2026-09-25, flag `coachhelm_insight_angles_v1`). Writes its own metric,
 * `three_putts_per_18` (`metric-sources.ts`, intentional-null for
 * attribution); `three_putt_chain` stays composite C6's percent metric.
 *
 * Population: every hole of the newest 40 COUNTABLE rounds with a recorded
 * first-putt distance (`putt_distance_feet`, else `distance_to_hole_before`
 * in its own unit). Holes with putts but no first-putt distance are excluded
 * and counted. Putts on the hole = `golf_holes.putts` when recorded, else the
 * number of putting shots.
 *
 * Headline: 3-putts per 18 vs ONE benchmark ({@link resolveThreePuttBenchmark},
 * owner rule Q-88: the Tour is the only external benchmark): the Tour
 * three-putt figure for the player's tour (`golf_pga_standards`) when one is
 * stored, else the teammates' median rate (`golf_round_stats_cache.three_putts`,
 * ≥ 5 teammates with 5+ rounds), else no comparison and NO read. No
 * GolfHelm-wide pool number is ever printed. Gate ≥ 5 rounds, ≥ 90 putted
 * holes, ≥ 6 three-putts, excess ≥ 0.3 per 18, one-sided binomial z ≥ 1.645.
 * Sizing: each 3-putt turned into a 2-putt is one stroke, so strokes/round =
 * (rate − benchmark rate) × putted holes per 18 (unrounded inputs).
 *
 * Known limit of the team fallback: the teammates' rate is 3-putts per hole
 * PLAYED (the round cache), the player's is per hole with a recorded first
 * putt; with first-putt distances on nearly every hole the two match.
 *
 * Autopsy: every 3-putt goes to exactly ONE pathway (non-overlapping):
 *   - `long_approach_leave`   first putt ≥ 35 ft (the 35+ band);
 *   - `poor_first_putt_leave` first putt < 35 ft and second putt ≥ 6 ft;
 *   - `short_followup_miss`   first putt < 35 ft and second putt < 6 ft.
 * A 3-putt from < 35 ft whose second-putt distance is not recorded is
 * SUPPRESSED from the autopsy and counted — a leave is never invented. The
 * second-putt distance is the second putt's own recorded start
 * (`putt_distance_feet` / `distance_to_hole_before`). A hole whose putting
 * rows are non-contiguous, or fewer than `golf_holes.putts`, is excluded
 * from everything and counted (production 2026-09-25: 1 of 880 3-putt
 * holes non-contiguous, 0 short of rows).
 *
 * Second-putt exposure: for each first-putt band, the distribution of
 * second-putt distances (< 3, 3–6, 6–10, 10+ ft) on holes where the first
 * putt missed, with the missing count shown next to it.
 *
 * Not reused: `metrics/sequence-attribution.ts` partitions a hole into SG
 * events; this angle counts 3-putts (a stroke each), so a pathway label per
 * 3-putt is the non-overlapping split and no SG is summed across events.
 *
 * Secondary split (own gate): `putt_slope` on lag first putts (20 ft+),
 * descriptive only. Fill is measured and stated (production 2026-09-25:
 * median 100% per player, not the 41% the brief assumed); `level` dominates
 * the column and may be a default.
 */

import type { ComposedContent, GeneratorAggregate, InsightCategory, MetricId } from '@/lib/coachhelm/v3/engine/types';
import {
  ANGLE_MIN_Z,
  PEER_MIN_PLAYERS,
  PEER_ROUND_LIMIT,
  median,
  primaryTeamId,
  type PeerRound,
  type TourThreePutt,
  angleReadFields,
  angleTest,
  attemptCounterfactual,
  familyDetail,
  newestFirstIds,
  meetsObservedFloors,
  type AngleEvidence,
  type AngleGapInput,
  type AngleSequence,
  feetOf,
  holeKey,
  impactOf,
  indexHoles,
  mean,
  round1,
  round2,
  shotsByHole,
  totalHoles,
  windowOf,
  pickExamples,
  type AngleData,
  type AngleReceipts,
  type AngleWindow,
  type ReceiptExample,
} from './angle-data';
import { AngleGenerator } from './angle-generator';
import { inBothVoices, type Voice } from '@/lib/coachhelm/v3/engine/coach-voice';
import { computeLagLeave, lagLinkLine, lagLinkOf, type LagLink } from './lag-leave';

export type PuttBand = 'lt10' | '10_20' | '20_35' | '35_plus';
export const PUTT_BANDS: readonly PuttBand[] = ['lt10', '10_20', '20_35', '35_plus'];
export const PUTT_BAND_LABEL: Record<PuttBand, string> = {
  lt10: 'inside 10 ft',
  '10_20': '10–20 ft',
  '20_35': '20–35 ft',
  '35_plus': '35+ ft',
};

/**
 * The one comparison a three-putt read makes (Q-88). `rate` is 3-putts per
 * hole (a fraction), the proportion test's benchmark.
 */
export interface ThreePuttBenchmark {
  source: 'tour' | 'team_pool';
  rate: number;
  label: string;
  /** Players behind a team median; null for the Tour figure. */
  n: number | null;
  citation: string;
}

/** Teammates' median 3-putts per hole (newest 40 countable rounds with a cached count, 5+ each), or null below 5 teammates. */
export function teamThreePuttRate(peers: readonly PeerRound[], playerId: string): { rate: number; n: number } | null {
  const byPlayer = new Map<string, PeerRound[]>();
  for (const r of peers) {
    if (r.player_id === playerId || r.three_putts === null) continue;
    const arr = byPlayer.get(r.player_id) ?? [];
    arr.push(r);
    byPlayer.set(r.player_id, arr);
  }
  const rates: number[] = [];
  for (const rows of byPlayer.values()) {
    const recent = [...rows].sort((a, b) => b.date.localeCompare(a.date)).slice(0, PEER_ROUND_LIMIT);
    if (recent.length < CHAIN_MIN_ROUNDS) continue;
    const holes = recent.reduce((a, r) => a + r.holes, 0);
    if (holes > 0) rates.push(recent.reduce((a, r) => a + (r.three_putts as number), 0) / holes);
  }
  if (rates.length < PEER_MIN_PLAYERS) return null;
  return { rate: median(rates)!, n: rates.length };
}

/**
 * Q-88: the Tour figure when one is stored for the player's tour, else the
 * teammates' median at {@link PEER_MIN_PLAYERS}+ players, else null (no
 * comparison, no read). Never a GolfHelm-wide pool number.
 */
export function resolveThreePuttBenchmark(
  tour: TourThreePutt | null,
  peers: readonly PeerRound[] | null,
  playerId: string,
): ThreePuttBenchmark | null {
  if (tour && tour.per_18 > 0) {
    return {
      source: 'tour',
      rate: tour.per_18 / 18,
      label: `${tour.tour === 'lpga' ? 'LPGA' : 'PGA'} Tour average`,
      n: null,
      citation: `golf_pga_standards ${tour.tour} ${tour.season}: ${tour.source}`,
    };
  }
  const team = peers ? teamThreePuttRate(peers, playerId) : null;
  if (team) {
    return {
      source: 'team_pool',
      rate: team.rate,
      label: `your teammates' median (${team.n} players)`,
      n: team.n,
      citation: 'golf_round_stats_cache.three_putts: teammates with 5+ countable rounds, newest 40 each',
    };
  }
  return null;
}

export const CHAIN_MIN_ROUNDS = 5;
export const CHAIN_MIN_HOLES = 90;
export const CHAIN_MIN_THREE_PUTTS = 6;
export const CHAIN_MIN_EXCESS_PER_18 = 0.3;
export const SLOPE_MIN_PER_SLOPE = 15;
export const SLOPE_MIN_FILL = 0.5;
export const LAG_MIN_FT = 20;

export function puttBandOf(ft: number): PuttBand {
  if (ft < 10) return 'lt10';
  if (ft < 20) return '10_20';
  if (ft < 35) return '20_35';
  return '35_plus';
}

export type ThreePuttPathway = 'long_approach_leave' | 'poor_first_putt_leave' | 'short_followup_miss';
export const PATHWAYS: readonly ThreePuttPathway[] = ['long_approach_leave', 'poor_first_putt_leave', 'short_followup_miss'];
export const PATHWAY_LABEL: Record<ThreePuttPathway, string> = {
  long_approach_leave: 'Long approach leave (first putt 35+ ft)',
  poor_first_putt_leave: 'First putt left 6+ ft (from inside 35 ft)',
  short_followup_miss: 'Missed the second putt from inside 6 ft',
};
/** First putts from this far are the "long approach leave" pathway. */
export const LONG_LEAVE_FT = 35;
/** A second putt from this far or more is a poor first-putt leave. */
export const POOR_LEAVE_FT = 6;

export type LeaveBucket = 'lt3' | '3_6' | '6_10' | '10_plus';
export const LEAVE_BUCKETS: readonly LeaveBucket[] = ['lt3', '3_6', '6_10', '10_plus'];
export const LEAVE_BUCKET_LABEL: Record<LeaveBucket, string> = {
  lt3: 'inside 3 ft',
  '3_6': '3–6 ft',
  '6_10': '6–10 ft',
  '10_plus': '10+ ft',
};
export function leaveBucketOf(ft: number): LeaveBucket {
  if (ft < 3) return 'lt3';
  if (ft < 6) return '3_6';
  if (ft < 10) return '6_10';
  return '10_plus';
}

export interface PuttBandRow {
  band: PuttBand;
  label: string;
  holes: number;
  three_putts: number;
  rate_pct: number | null;
}

/** Second-putt exposure for one first-putt band. */
export interface ExposureRow {
  band: PuttBand;
  label: string;
  /** Holes from this band where the first putt did not drop. */
  first_putt_missed: number;
  /** Of those, holes with a recorded second-putt distance (the denominator). */
  leave_recorded: number;
  /** Of those, holes with no recorded second-putt distance (not counted as 0). */
  leave_missing: number;
  buckets: Record<LeaveBucket, number>;
  /** Share of recorded leaves at 6 ft or more; null when none recorded. */
  six_plus_pct: number | null;
}

export interface PathwayRow {
  pathway: ThreePuttPathway;
  label: string;
  three_putts: number;
  per_18: number;
  /** Share of CLASSIFIED 3-putts; null when none classified. */
  share_pct: number | null;
}

export interface SlopeRow {
  slope: string;
  holes: number;
  three_putts: number;
  rate_pct: number;
}

export interface ThreePuttResult {
  window: AngleWindow;
  rounds: number;
  /** The countable rounds read, newest first. */
  round_ids: string[];
  /** The one comparison (Q-88); null = no benchmark, so no read. */
  benchmark: ThreePuttBenchmark | null;
  holes_putted: number;
  holes_per_18: number;
  three_putts: number;
  rate_pct: number;
  /** Unrounded 3-putts per putted hole (sizing reads this, never the rounded pct). */
  rate: number;
  /** Unrounded putted holes per 18 played. */
  holes_per_18_raw: number;
  three_putts_per_18: number;
  /** The benchmark rate at the player's putted holes per 18; null without a benchmark. */
  benchmark_per_18: number | null;
  z: number | null;
  bands: PuttBandRow[];
  exposure: ExposureRow[];
  pathways: PathwayRow[];
  /** 3-putts from < 35 ft with no recorded second-putt distance. */
  pathway_suppressed: number;
  classified: number;
  /** True when two pathways share the top count: no pathway leads. */
  pathway_tie: boolean;
  /**
   * Leading pathway; null when fewer than {@link CHAIN_MIN_THREE_PUTTS} are
   * classified or on a tie. Leading is not "most": see {@link leadShare}.
   */
  cause: ThreePuttPathway | null;
  /** The dominant pathway as a recorded putt sequence (for an observed_sequence claim). */
  sequence: {
    pathway: ThreePuttPathway;
    occurrences: number;
    of: number;
    distinct_rounds: number;
    examples: ReceiptExample[];
  } | null;
  /** Mean first-putt length (ft) on greens hit in regulation — the approach → putt link. */
  gir_first_putt_ft: number | null;
  gir_holes: number;
  avg_first_putt_ft: number | null;
  slope: { lag_first_putts: number; fill_pct: number; rows: SlopeRow[]; qualifies: boolean };
  excluded: { no_first_putt_distance: number; putt_rows_incomplete: number };
  examples: ReceiptExample[];
  qualifies: boolean;
}

interface HoleObs {
  round_id: string;
  hole_number: number;
  hole_id: string | null;
  date: string;
  ft: number;
  putts: number;
  /** Recorded second-putt distance (ft); null when not recorded or no second putt. */
  leave: number | null;
  slope: string | null;
  gir: boolean | null;
}

/** Pure compute. Null when no hole has a first putt. */
export function computeThreePuttChain(data: AngleData, benchmark: ThreePuttBenchmark | null): ThreePuttResult | null {
  const dateOf = new Map(data.rounds.map((r) => [r.id, r.date]));
  const { byKey } = indexHoles(data.holes);
  const byHole = shotsByHole(data.shots.filter((s) => dateOf.has(s.round_id) && s.shot_type === 'putting'));
  const obs: HoleObs[] = [];
  let noFirst = 0;
  let incomplete = 0;
  for (const [key, putts] of byHole) {
    const first = putts[0]!;
    const hole0 = byKey.get(key) ?? byKey.get(holeKey(first.round_id, first.hole_number));
    // Putting rows must be complete and contiguous, or the "first" and
    // "second" rows may not be the first and second putts. Such holes are
    // excluded and counted — never read with a guessed putt order.
    const contiguous = putts.every((p, i) => p.shot_number === first.shot_number + i);
    const recordedPutts = hole0?.putts != null && hole0.putts > 0 ? hole0.putts : null;
    if (!contiguous || (recordedPutts !== null && putts.length < recordedPutts)) {
      incomplete += 1;
      continue;
    }
    const ft = first.putt_distance_feet ?? feetOf(first.distance_to_hole_before, first.distance_unit_before);
    if (ft === null || !(ft > 0)) {
      noFirst += 1;
      continue;
    }
    const hole = hole0;
    const n = recordedPutts ?? putts.length;
    const second = putts[1];
    let leave: number | null = null;
    if (n >= 2 && second) {
      leave = second.putt_distance_feet ?? feetOf(second.distance_to_hole_before, second.distance_unit_before);
      if (leave !== null && !(leave > 0)) leave = null;
    }
    obs.push({
      round_id: first.round_id,
      hole_number: first.hole_number ?? -1,
      hole_id: hole?.id ?? null,
      date: dateOf.get(first.round_id) ?? '',
      ft,
      putts: n,
      leave,
      slope: first.putt_slope,
      gir: hole?.gir ?? null,
    });
  }
  if (obs.length === 0) return null;

  const bands: PuttBandRow[] = PUTT_BANDS.map((band) => {
    const rows = obs.filter((o) => puttBandOf(o.ft) === band);
    const three = rows.filter((o) => o.putts >= 3).length;
    return {
      band,
      label: PUTT_BAND_LABEL[band],
      holes: rows.length,
      three_putts: three,
      rate_pct: rows.length ? round1((100 * three) / rows.length) : null,
    };
  });

  const exposure: ExposureRow[] = PUTT_BANDS.map((band) => {
    const missed = obs.filter((o) => puttBandOf(o.ft) === band && o.putts >= 2);
    const rec = missed.filter((o) => o.leave !== null);
    const buckets: Record<LeaveBucket, number> = { lt3: 0, '3_6': 0, '6_10': 0, '10_plus': 0 };
    for (const o of rec) buckets[leaveBucketOf(o.leave!)] += 1;
    const six = rec.filter((o) => o.leave! >= POOR_LEAVE_FT).length;
    return {
      band,
      label: PUTT_BAND_LABEL[band],
      first_putt_missed: missed.length,
      leave_recorded: rec.length,
      leave_missing: missed.length - rec.length,
      buckets,
      six_plus_pct: rec.length ? round1((100 * six) / rec.length) : null,
    };
  });

  const holesPlayed = totalHoles(data.rounds);
  const n = obs.length;
  const holesPer18 = holesPlayed > 0 ? (n * 18) / holesPlayed : 0;
  const threes = obs.filter((o) => o.putts >= 3);
  const three = threes.length;
  const rate = three / n;
  const benchRate = benchmark ? benchmark.rate : null;
  const se = benchRate !== null && benchRate > 0 && benchRate < 1 ? Math.sqrt((benchRate * (1 - benchRate)) / n) : null;
  const z = se !== null && benchRate !== null ? (rate - benchRate) / se : null;
  const excess = benchRate === null ? 0 : (rate - benchRate) * holesPer18;

  // Autopsy: one pathway per 3-putt, or suppressed.
  const counts: Record<ThreePuttPathway, number> = { long_approach_leave: 0, poor_first_putt_leave: 0, short_followup_miss: 0 };
  const pathwayOf = new Map<HoleObs, ThreePuttPathway>();
  let suppressed = 0;
  for (const o of threes) {
    let p: ThreePuttPathway | null = null;
    if (o.ft >= LONG_LEAVE_FT) p = 'long_approach_leave';
    else if (o.leave === null) suppressed += 1;
    else p = o.leave >= POOR_LEAVE_FT ? 'poor_first_putt_leave' : 'short_followup_miss';
    if (p) {
      counts[p] += 1;
      pathwayOf.set(o, p);
    }
  }
  const classified = three - suppressed;
  const pathways: PathwayRow[] = PATHWAYS.map((p) => ({
    pathway: p,
    label: PATHWAY_LABEL[p],
    three_putts: counts[p],
    per_18: n > 0 ? round2((counts[p] / n) * holesPer18) : 0,
    share_pct: classified > 0 ? round1((100 * counts[p]) / classified) : null,
  }));
  const ranked = [...pathways].sort((a, b) => b.three_putts - a.three_putts);
  const tie = classified > 0 && ranked[1]!.three_putts === ranked[0]!.three_putts;
  const cause = classified >= CHAIN_MIN_THREE_PUTTS && !tie ? ranked[0]!.pathway : null;
  const causeHoles = cause ? threes.filter((o) => pathwayOf.get(o) === cause) : [];
  const sequence = cause
    ? {
        pathway: cause,
        occurrences: causeHoles.length,
        of: classified,
        distinct_rounds: new Set(causeHoles.map((o) => o.round_id)).size,
        examples: pickExamples(
          causeHoles.map((o) => ({
            round_id: o.round_id,
            hole_number: o.hole_number,
            hole_id: o.hole_id,
            date: o.date,
            note: `${o.putts} putts; first putt ${round1(o.ft)} ft, second putt ${o.leave === null ? 'not recorded' : `${round1(o.leave)} ft`}`,
          })),
        ),
      }
    : null;

  const examples = pickExamples(
    threes.map((o) => ({
      round_id: o.round_id,
      hole_number: o.hole_number,
      hole_id: o.hole_id,
      date: o.date,
      note: `${o.putts} putts; first putt ${round1(o.ft)} ft, second putt ${o.leave === null ? 'not recorded' : `${round1(o.leave)} ft`}${pathwayOf.has(o) ? ` (${PATHWAY_LABEL[pathwayOf.get(o)!]})` : ''}`,
    })),
  );

  const girObs = obs.filter((o) => o.gir === true);
  const lag = obs.filter((o) => o.ft >= LAG_MIN_FT);
  const lagSloped = lag.filter((o) => o.slope !== null && o.slope !== '');
  const slopeRows: SlopeRow[] = [];
  for (const slope of ['uphill', 'downhill', 'level', 'severe']) {
    const rows = lagSloped.filter((o) => o.slope === slope);
    if (rows.length === 0) continue;
    const t = rows.filter((o) => o.putts >= 3).length;
    slopeRows.push({ slope, holes: rows.length, three_putts: t, rate_pct: round1((100 * t) / rows.length) });
  }
  const fill = lag.length ? lagSloped.length / lag.length : 0;
  const slopeQualifies =
    fill >= SLOPE_MIN_FILL && slopeRows.filter((r) => r.holes >= SLOPE_MIN_PER_SLOPE).length >= 2;

  const qualifies =
    benchmark !== null &&
    data.rounds.length >= CHAIN_MIN_ROUNDS &&
    n >= CHAIN_MIN_HOLES &&
    three >= CHAIN_MIN_THREE_PUTTS &&
    excess >= CHAIN_MIN_EXCESS_PER_18 &&
    z !== null &&
    z >= ANGLE_MIN_Z;

  return {
    window: windowOf(data.rounds),
    rounds: data.rounds.length,
    round_ids: newestFirstIds(data.rounds),
    benchmark,
    holes_putted: n,
    holes_per_18: round2(holesPer18),
    three_putts: three,
    rate_pct: round1(rate * 100),
    rate,
    holes_per_18_raw: holesPer18,
    three_putts_per_18: round2(rate * holesPer18),
    benchmark_per_18: benchRate === null ? null : round2(benchRate * holesPer18),
    z: z === null ? null : round2(z),
    bands,
    exposure,
    pathways,
    pathway_suppressed: suppressed,
    classified,
    pathway_tie: tie,
    cause,
    sequence,
    gir_first_putt_ft: girObs.length ? round1(mean(girObs.map((o) => o.ft))!) : null,
    gir_holes: girObs.length,
    avg_first_putt_ft: round1(mean(obs.map((o) => o.ft))!),
    slope: {
      lag_first_putts: lag.length,
      fill_pct: round1(fill * 100),
      rows: slopeRows,
      qualifies: slopeQualifies,
    },
    excluded: { no_first_putt_distance: noFirst, putt_rows_incomplete: incomplete },
    examples,
    qualifies,
  };
}

export interface ThreePuttAggregate extends GeneratorAggregate {
  result: ThreePuttResult;
  baseline: number | null;
  /** The rounds behind `sampleN` (Slice 0b stamps the window from these once it lands). */
  windowRoundIds: readonly string[];
  /**
   * Slice 5b: the counted lag leave from 30+ ft (`lag-leave.ts`), the
   * three-putt's counted path and NEXT line (`04` example 1); null when the
   * player has no lag putt with a known leave.
   */
  lag?: LagLink | null;
}

/** Lag putts with a known leave before the three-putt row prints the lag line. */
export const LAG_LINK_MIN_PUTTS = 10;

export function toThreePuttAggregate(
  result: ThreePuttResult | null,
  baseline: number | null,
  lag: LagLink | null = null,
): ThreePuttAggregate | null {
  if (!result || !result.qualifies) return null;
  return {
    result,
    baseline,
    lag,
    sampleN: result.holes_putted,
    playerValue: result.three_putts_per_18,
    windowRoundIds: result.round_ids,
  };
}

export const THREE_PUTT_DEFINITION =
  '3-putts per 18 = holes with 3+ putts ÷ holes with a recorded first-putt distance × those holes per 18 played (9-hole rounds count as 9 holes). ' +
  `Pathways (one per 3-putt): first putt ${LONG_LEAVE_FT}+ ft; else second putt ${POOR_LEAVE_FT}+ ft; else second putt inside ${POOR_LEAVE_FT} ft. ` +
  'A 3-putt with no recorded second-putt distance is left out of the pathways and counted.';

/** Shot-by-shot path of each pathway, in recorded putt order. */
export const PATHWAY_PATTERN: Record<ThreePuttPathway, string> = {
  long_approach_leave: `first putt from ${LONG_LEAVE_FT}+ ft → 3+ putts on the hole`,
  poor_first_putt_leave: `first putt from inside ${LONG_LEAVE_FT} ft → second putt from ${POOR_LEAVE_FT}+ ft → 3+ putts on the hole`,
  short_followup_miss: `first putt from inside ${LONG_LEAVE_FT} ft → second putt from inside ${POOR_LEAVE_FT} ft missed → 3+ putts on the hole`,
};

/**
 * The dominant pathway as a counted putt sequence: counts over the classified
 * 3-putts, distinct rounds and example holes in recorded putt order. Stored
 * in `detail.sequence`; whether it clears the `02` §6 Observed floors is
 * recorded, and the row's cause stays an inferred hypothesis until the
 * root-cause slice lifts it.
 */
export function threePuttSequence(r: ThreePuttResult): AngleSequence | null {
  if (!r.sequence) return null;
  const q = r.sequence;
  return {
    pattern: PATHWAY_PATTERN[q.pathway],
    occurrences: q.occurrences,
    of: q.of,
    population: 'classified 3-putts',
    distinct_rounds: q.distinct_rounds,
    window: `${r.window.window_start} – ${r.window.window_end}`,
    examples: q.examples.map((e) => ({ round_id: e.round_id, hole_number: e.hole_number, hole_id: e.hole_id })),
    meets_observed_floors: meetsObservedFloors(q),
  };
}

/** The Slice 1 test input: 3-putt holes of putted holes against the one benchmark rate (null without one). */
export function threePuttGapInput(r: ThreePuttResult): AngleGapInput | null {
  if (!r.benchmark) return null;
  return { kind: 'proportion', k: r.three_putts, n: r.holes_putted, benchmark: r.benchmark.rate, polarity: 'lower_better' };
}

/** The leading pathway's share of classified 3-putts (0–1); null without a lead. */
export function leadShare(r: ThreePuttResult): number | null {
  if (!r.cause || r.classified <= 0) return null;
  return r.pathways.find((p) => p.pathway === r.cause)!.three_putts / r.classified;
}

export function composeThreePuttChain(agg: ThreePuttAggregate): ComposedContent & { category: InsightCategory } {
  const r = agg.result;
  // toThreePuttAggregate only passes a result that has a benchmark.
  const bench = r.benchmark as ThreePuttBenchmark;
  const benchPer18 = r.benchmark_per_18 as number;
  const sequence = threePuttSequence(r);
  const cf = attemptCounterfactual({
    strokesPerAttempt: r.rate - bench.rate,
    attemptsPerRound: r.holes_per_18_raw,
    baseline: agg.baseline,
    weeks: 6,
  });
  const lead = r.cause ? r.pathways.find((p) => p.pathway === r.cause)! : null;
  const share = leadShare(r);
  // "Most" only above half; a plurality is "the most common pattern".
  const majority = share !== null && share > 0.5;
  // A pathway-led title only when the counted path clears the Observed floors.
  const pathwayLed = r.cause !== null && sequence?.meets_observed_floors === true;
  const lengthLed = r.cause === 'long_approach_leave';
  const benchName = bench.source === 'tour' ? `the ${bench.label}` : bench.label;
  // The team benchmark's label is the player's ("your teammates' median"); the coach reads "their".
  const coachBenchName = (v: Voice) =>
    bench.source === 'tour' || !v.coach ? benchName : `their teammates' median (${bench.n} players)`;
  const worstExposure = [...r.exposure]
    .filter((e) => e.band !== '35_plus' && e.leave_recorded >= 10 && e.six_plus_pct !== null)
    .sort((a, b) => b.six_plus_pct! - a.six_plus_pct!)[0];
  const pathwayLine =
    r.classified > 0
      ? ` Of ${r.classified} classified 3-putts: ${r.pathways
          .map((p) => `${p.three_putts} ${p.pathway === 'long_approach_leave' ? `from first putts of ${LONG_LEAVE_FT}+ ft` : p.pathway === 'poor_first_putt_leave' ? `with the first putt leaving ${POOR_LEAVE_FT}+ ft` : `missing the second putt from inside ${POOR_LEAVE_FT} ft`}`)
          .join(', ')}${r.pathway_suppressed ? `; ${r.pathway_suppressed} more from inside ${LONG_LEAVE_FT} ft had no second-putt distance recorded and are left out` : ''}.`
      : ` No 3-putt could be classified (second-putt distances not recorded), so the pathways are not shown.`;
  const exposureLine = (v: Voice) => worstExposure
    ? ` From ${worstExposure.label}, ${worstExposure.six_plus_pct}% of ${v.your} second putts were ${POOR_LEAVE_FT}+ ft (${worstExposure.buckets['6_10'] + worstExposure.buckets['10_plus']} of ${worstExposure.leave_recorded} recorded${worstExposure.leave_missing ? `; ${worstExposure.leave_missing} not recorded` : ''}).`
    : '';
  const lagLink = agg.lag && agg.lag.n >= LAG_LINK_MIN_PUTTS ? agg.lag : null;
  const lagNote = lagLink ? ` ${lagLinkLine(lagLink)}` : '';
  const slopeNote = r.slope.qualifies
    ? ` Slope on lag putts (recorded on ${r.slope.fill_pct}% of them; "level" may be a default): ${r.slope.rows
        .filter((s) => s.holes >= SLOPE_MIN_PER_SLOPE)
        .map((s) => `${s.slope} ${s.rate_pct}% (n=${s.holes})`)
        .join(', ')}.`
    : '';

  const receipts: AngleReceipts = {
    window: r.window,
    definition: THREE_PUTT_DEFINITION,
    samples: {
      rounds: r.rounds,
      holes_putted: r.holes_putted,
      three_putts: r.three_putts,
      three_putts_classified: r.classified,
    },
    exclusions: {
      holes_without_first_putt_distance: r.excluded.no_first_putt_distance,
      holes_with_missing_or_out_of_order_putt_rows: r.excluded.putt_rows_incomplete,
      three_putts_without_second_putt_distance: r.pathway_suppressed,
    },
    examples: r.examples,
  };

  const comparisonLabel = bench.source === 'tour' ? bench.label : `Teammates' median (${bench.n} players)`;
  const evidence: AngleEvidence = {
    ...angleReadFields('three_putt_chain', r.round_ids, {
      source: bench.source,
      label: comparisonLabel,
      value: benchPer18,
      n: bench.n,
      citation: bench.citation,
    }),
    metric: 'three_putts_per_18',
    metric_label: '3-putts per 18 holes',
    unit: 'count',
    polarity: 'lower_better',
    your_value: r.three_putts_per_18,
    your_value_display: `${r.three_putts_per_18.toFixed(1)} per round`,
    comparison_value: benchPer18,
    comparison_label: comparisonLabel,
    // Measured sources tourOnlyEvidence keeps (Q-88): the Tour, or the team.
    comparison_source: bench.source === 'tour' ? 'pga_baseline' : 'team_avg',
    sample_n: r.holes_putted,
    window_days: r.window.window_days,
    window_start: r.window.window_start,
    window_end: r.window.window_end,
    strokes_impact: impactOf(cf),
    strokes_impact_method: 'peer_delta',
    confidence: 0,
    confidence_factors: { sample_adequacy: Math.min(r.holes_putted / 270, 1), recency: 1, variance: 0.5 },
    counterfactual: cf,
    detail: {
      ...familyDetail('three_putt_chain'),
      gap_input: threePuttGapInput(r),
      test: angleTest(r.z),
      sequence,
      angle: 'three_putt_autopsy',
      cause: r.cause,
      linked_area: lengthLed ? 'putting' : 'approach',
      chain: ['approach', 'putting'],
      pathways: r.pathways,
      pathway_suppressed: r.pathway_suppressed,
      classified: r.classified,
      pathway_tie: r.pathway_tie,
      lead_share: share === null ? null : round2(share),
      exposure: r.exposure,
      bands: r.bands,
      rate_pct: r.rate_pct,
      three_putts: r.three_putts,
      holes_putted: r.holes_putted,
      benchmark_per_18: benchPer18,
      avg_first_putt_ft: r.avg_first_putt_ft,
      gir_first_putt_ft: r.gir_first_putt_ft,
      gir_holes: r.gir_holes,
      z: r.z,
      slope: r.slope,
      // Slice 5b: the counted lag leave, linked to its own family.
      lag_leave: agg.lag ?? null,
      benchmark_source: bench.citation,
      rounds: r.rounds,
      receipts,
    },
    diagnosis: {
      symptom: `${r.three_putts_per_18.toFixed(1)} three-putts per round vs ${benchPer18.toFixed(1)} for ${benchName}`,
      root_cause: lead
        ? majority
          ? `Most classified 3-putts (${lead.three_putts} of ${r.classified}) follow one pattern: ${lead.label.toLowerCase()}.`
          : `The most common pattern (${lead.three_putts} of ${r.classified}): ${lead.label.toLowerCase()}.`
        : r.pathway_tie && r.classified >= CHAIN_MIN_THREE_PUTTS
          ? `No single pattern leads: ${r.pathways.map((p) => `${p.three_putts} ${p.label.toLowerCase()}`).join(', ')}.`
          : `Too few 3-putts could be classified (${r.classified}) to say which pattern leads.`,
      causality_level: 'inferred_hypothesis',
      drivers: [
        { metric: 'three_putts_per_18', label: '3-putts per 18', value: r.three_putts_per_18, unit: 'count', sample_n: r.holes_putted, source: 'golf_holes.putts / golf_shots (putting)' },
        ...(r.avg_first_putt_ft !== null
          ? [{ metric: 'first_putt_length_ft', label: 'Average first-putt length', value: r.avg_first_putt_ft, unit: 'feet' as const, sample_n: r.holes_putted, source: 'golf_shots.putt_distance_feet' }]
          : []),
      ],
      recommended_action:
        r.cause === 'long_approach_leave'
          ? `${majority ? 'Most 3-putts start' : 'The most common 3-putt starts'} from ${LONG_LEAVE_FT}+ ft: work on approach proximity as well as lag speed.`
          : r.cause === 'poor_first_putt_leave'
            ? `Lag drill from ${worstExposure?.label ?? '20–35 ft'}: score each putt on whether the second putt is inside ${POOR_LEAVE_FT} ft.${lagLink ? ` ${lagLinkLine(lagLink)}` : ''}`
            : r.cause === 'short_followup_miss'
              ? `Short-putt reps from 3–${POOR_LEAVE_FT} ft: the second putt is where these holes slip.`
              : r.pathway_tie && r.classified >= CHAIN_MIN_THREE_PUTTS
                ? 'No single 3-putt pattern leads: work on lag speed and short putts together.'
                : 'Record both putt distances on each hole so the 3-putts can be classified.',
      confidence_reason: '',
    },
  };
  const neutralTitle = (v: Voice) =>
    bench.source === 'tour' ? `3-putts above the ${bench.label}` : `3-putts above ${v.pick('your', 'the')} teammates' rate`;
  return {
    category: lengthLed ? 'approach' : 'putting',
    ...inBothVoices((v) => ({
      title: !pathwayLed
        ? neutralTitle(v)
        : r.cause === 'long_approach_leave'
          ? majority
            ? `Most 3-putts start from ${LONG_LEAVE_FT}+ ft`
            : `3-putts from ${LONG_LEAVE_FT}+ ft lead the count`
          : r.cause === 'poor_first_putt_leave'
            ? `First putts are leaving ${POOR_LEAVE_FT}+ ft second putts`
            : `Short second putts are turning into 3-putts`,
      content:
        `${v.Player} ${v.pick('3-putt', '3-putts')} ${r.three_putts_per_18.toFixed(1)} times a round (${r.three_putts} of ${r.holes_putted} holes) vs ${benchPer18.toFixed(1)} for ${coachBenchName(v)}.` +
        `${pathwayLine}${exposureLine(v)}${lagNote}${slopeNote}`,
    })),
    priority: r.three_putts_per_18 - benchPer18 >= 0.5 ? 'medium' : 'low',
    signature: 'three_putt_chain:all',
    evidence,
  };
}

export class ThreePuttChainGenerator extends AngleGenerator<ThreePuttAggregate> {
  readonly name = 'ThreePuttChainGenerator';
  readonly metricId: MetricId = 'sg_putting';
  readonly insightType = 'putting';
  readonly minSampleN = CHAIN_MIN_HOLES;
  protected override readonly requiresStanding = false;

  private composedCategory: InsightCategory = 'putting';
  get category(): InsightCategory {
    return this.composedCategory;
  }

  protected override signatureScope(): string {
    return 'three_putt_chain:';
  }

  async aggregate(): Promise<ThreePuttAggregate | null> {
    const data = await this.loaders.data();
    const tour = await this.loaders.tourThreePutt();
    const team = tour ? null : primaryTeamId(data.rounds);
    const peers = team ? await this.loaders.teamRounds(team) : null;
    const benchmark = resolveThreePuttBenchmark(tour, peers, data.playerId);
    const result = computeThreePuttChain(data, benchmark);
    if (!result || !result.qualifies) return null;
    // Slice 5b: the counted lag leave (its team line from the teammates' pooled putts).
    const lagTeam = primaryTeamId(data.rounds);
    const teamShots = lagTeam ? await this.loaders.teamShots(lagTeam) : null;
    return toThreePuttAggregate(result, data.scoringBaseline, lagLinkOf(computeLagLeave(data, teamShots)));
  }

  composeContent(agg: ThreePuttAggregate): ComposedContent {
    const { category, ...composed } = composeThreePuttChain(agg);
    this.composedCategory = category;
    return composed;
  }
}
