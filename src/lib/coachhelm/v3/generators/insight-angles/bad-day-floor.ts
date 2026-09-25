/**
 * Insight angle 2 — "Bad-Day Floor" (2026-09-25, flag
 * `coachhelm_insight_angles_v1`).
 *
 * Question: how far above this player's typical round does a bad round sit,
 * is that further than for their teammates, and what are the extra strokes
 * made of?
 *
 * Population: the newest 40 COUNTABLE rounds where every hole played has a
 * recorded score, par and penalty count (others are excluded and counted).
 *
 * 9-hole normalization (explicit): a round's score to par and each of its
 * components is scaled to 18 holes by × 18 / holes played, so a 9-hole round
 * counts double. That is the root map's convention; it is stated in the
 * receipts next to the number of 9-hole rounds.
 *
 * - Median and P80 (linear-interpolated) of per-18 score to par. Floor gap =
 *   P80 − median: how much worse a 1-in-5 bad round is than a typical one.
 * - Split, per hole, into three NON-OVERLAPPING parts that sum to the hole's
 *   score to par:
 *     penalties      = recorded penalty strokes;
 *     double_or_worse = strokes beyond bogey that are not penalty strokes, on
 *                       holes of double bogey or worse: max(0, to_par − 1 − penalties);
 *     everything_else = to_par − penalties − double_or_worse.
 *   The bad-day split compares the mean of the BAD rounds (per-18 score to
 *   par ≥ P80) with the mean of the MIDDLE rounds (P30–P70), component by
 *   component, so the three parts add up to the bad-vs-middle difference.
 * - Root area (category): the same bad-vs-middle difference in stored
 *   per-round SG (per 18) by area; the area that loses the most on bad days
 *   files the row. `scoring` when SG is not stored on enough rounds.
 * - Benchmark: the MEDIAN floor gap of teammates (other players on the
 *   player's team, 10+ countable rounds each, newest 40, from
 *   `golf_rounds.score_to_par` per 18; ≥ 3 peers; the player never counts as
 *   their own peer). Production check 2026-09-25: hole sums equal
 *   `score_to_par` on 642 of 657 completed rounds.
 * - Gate: ≥ 10 rounds, ≥ 3 peers, extra gap (player − teammates) ≥ 1.5.
 * - Sizing: a bad round (≥ P80) is one round in five, so strokes/round =
 *   extra gap × 0.2. Suppressed below 0.3 like every counterfactual, which
 *   the 1.5 gate already implies.
 *
 * Not reused: `metrics/sequence-attribution.ts` works per shot sequence
 * against the SG baseline; this angle splits recorded hole scores, which
 * need no shot data and cover every scored hole.
 */

import { BaseGenerator } from '@/lib/coachhelm/v3/engine/generator-base';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import type { CounterfactualProjection } from '@/lib/coachhelm/v3/counterfactual/types';
import type { ComposedContent, GeneratorAggregate, InsightCategory, MetricId } from '@/lib/coachhelm/v3/engine/types';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import {
  INSIGHT_ANGLES_FLAG,
  attemptCounterfactual,
  impactOf,
  mean,
  median,
  percentile,
  pickExamples,
  primaryTeamId,
  round2,
  windowOf,
  type AngleData,
  type AngleHole,
  type AngleReceipts,
  type AngleRound,
  type AngleWindow,
  type PeerRound,
  type ReceiptExample,
} from './angle-data';
import { loadAngleData, loadTeamPeerRounds } from './load-angle-data';
import { PEER_MIN_PLAYERS, PEER_ROUND_LIMIT } from './lie-approach';

export const FLOOR_MIN_ROUNDS = 10;
export const FLOOR_MIN_EXTRA = 1.5;
/** A round at or above P80 is one round in five. */
export const BAD_DAY_SHARE = 0.2;
export const FLOOR_PERCENTILE = 0.8;
export const MIDDLE_LOW = 0.3;
export const MIDDLE_HIGH = 0.7;
/** Rounds with full stored SG needed on each side for the area split. */
export const AREA_SPLIT_MIN_ROUNDS = 2;

export type FloorPart = 'penalties' | 'double_or_worse' | 'everything_else';
export const FLOOR_PARTS: readonly FloorPart[] = ['penalties', 'double_or_worse', 'everything_else'];
export const FLOOR_PART_LABEL: Record<FloorPart, string> = {
  penalties: 'penalty strokes',
  double_or_worse: 'strokes beyond bogey on double-or-worse holes',
  everything_else: 'everything else',
};

export type FloorArea = 'tee' | 'approach' | 'short_game' | 'putting';
export const FLOOR_AREAS: readonly FloorArea[] = ['tee', 'approach', 'short_game', 'putting'];
const AREA_LABEL: Record<FloorArea, string> = {
  tee: 'off the tee',
  approach: 'approach',
  short_game: 'short game',
  putting: 'putting',
};

/** Split one hole's score to par into the three parts (they sum to to_par). */
export function splitHole(toPar: number, penalties: number): Record<FloorPart, number> {
  const pen = Math.max(0, penalties);
  const dbl = toPar >= 2 ? Math.max(0, toPar - 1 - pen) : 0;
  return { penalties: pen, double_or_worse: dbl, everything_else: toPar - pen - dbl };
}

export interface FloorRound {
  id: string;
  date: string;
  holes: number;
  /** Per-18 score to par. */
  to_par: number;
  /** Per-18 parts; sum to `to_par`. */
  parts: Record<FloorPart, number>;
  /** Per-18 stored SG by area; null when any area is not stored. */
  sg: Record<FloorArea, number> | null;
}

export interface FloorResult {
  window: AngleWindow;
  rounds: FloorRound[];
  nine_hole_rounds: number;
  median: number;
  p80: number;
  floor_gap: number;
  bad_rounds: number;
  middle_rounds: number;
  bad_mean: number;
  middle_mean: number;
  /** Bad-minus-middle mean per part; sums to bad_mean − middle_mean. */
  split: Record<FloorPart, number>;
  /** Middle-minus-bad mean SG per area (positive = lost on bad days); null without enough SG rounds. */
  area_split: Record<FloorArea, number> | null;
  area_split_rounds: { bad: number; middle: number };
  driver: FloorArea | null;
  peer_gap: number | null;
  peer_n: number;
  extra_gap: number;
  excluded: { incomplete_hole_scores: number };
  examples: ReceiptExample[];
  qualifies: boolean;
}

/** Per-teammate floor gaps (P80 − median of per-18 score to par; 10+ rounds, newest 40). */
export function peerFloorGaps(peers: readonly PeerRound[], playerId: string): number[] {
  const byPlayer = new Map<string, PeerRound[]>();
  for (const r of peers) {
    if (r.player_id === playerId || r.score_to_par === null) continue;
    const arr = byPlayer.get(r.player_id) ?? [];
    arr.push(r);
    byPlayer.set(r.player_id, arr);
  }
  const out: number[] = [];
  for (const rows of byPlayer.values()) {
    const recent = [...rows].sort((a, b) => b.date.localeCompare(a.date)).slice(0, PEER_ROUND_LIMIT);
    if (recent.length < FLOOR_MIN_ROUNDS) continue;
    const vals = recent.map((r) => ((r.score_to_par as number) * 18) / (r.holes || 18));
    out.push(percentile(vals, FLOOR_PERCENTILE)! - median(vals)!);
  }
  return out;
}

function floorRound(r: AngleRound, holes: readonly AngleHole[]): FloorRound | null {
  const scored = holes.filter((h) => h.score !== null && h.par > 0 && h.penalty_strokes !== null);
  if (scored.length !== r.holes || holes.length !== r.holes) return null;
  const scale = 18 / r.holes;
  const parts: Record<FloorPart, number> = { penalties: 0, double_or_worse: 0, everything_else: 0 };
  let toPar = 0;
  for (const h of scored) {
    const tp = (h.score as number) - h.par;
    toPar += tp;
    const s = splitHole(tp, h.penalty_strokes as number);
    for (const p of FLOOR_PARTS) parts[p] += s[p];
  }
  const { tee, approach, short_game, putting } = r.sg;
  const sg =
    tee === null || approach === null || short_game === null || putting === null
      ? null
      : { tee: tee * scale, approach: approach * scale, short_game: short_game * scale, putting: putting * scale };
  return {
    id: r.id,
    date: r.date,
    holes: r.holes,
    to_par: toPar * scale,
    parts: {
      penalties: parts.penalties * scale,
      double_or_worse: parts.double_or_worse * scale,
      everything_else: parts.everything_else * scale,
    },
    sg,
  };
}

/** Pure compute. Null with fewer than 2 usable rounds. */
export function computeBadDayFloor(data: AngleData, peers: readonly PeerRound[] | null): FloorResult | null {
  const holesByRound = new Map<string, AngleHole[]>();
  for (const h of data.holes) {
    const arr = holesByRound.get(h.round_id) ?? [];
    arr.push(h);
    holesByRound.set(h.round_id, arr);
  }
  const rows: FloorRound[] = [];
  let incomplete = 0;
  for (const r of data.rounds) {
    const fr = floorRound(r, holesByRound.get(r.id) ?? []);
    if (fr) rows.push(fr);
    else incomplete += 1;
  }
  if (rows.length < 2) return null;

  const vals = rows.map((r) => r.to_par);
  const med = median(vals)!;
  const p80 = percentile(vals, FLOOR_PERCENTILE)!;
  const lo = percentile(vals, MIDDLE_LOW)!;
  const hi = percentile(vals, MIDDLE_HIGH)!;
  const bad = rows.filter((r) => r.to_par >= p80);
  const middle = rows.filter((r) => r.to_par >= lo && r.to_par <= hi);
  const badMean = mean(bad.map((r) => r.to_par))!;
  const midMean = mean(middle.map((r) => r.to_par))!;
  const split = {} as Record<FloorPart, number>;
  for (const p of FLOOR_PARTS) {
    split[p] = round2(mean(bad.map((r) => r.parts[p]))! - mean(middle.map((r) => r.parts[p]))!);
  }

  const badSg = bad.filter((r) => r.sg !== null);
  const midSg = middle.filter((r) => r.sg !== null);
  let areaSplit: Record<FloorArea, number> | null = null;
  let driver: FloorArea | null = null;
  if (badSg.length >= AREA_SPLIT_MIN_ROUNDS && midSg.length >= AREA_SPLIT_MIN_ROUNDS) {
    areaSplit = {} as Record<FloorArea, number>;
    for (const a of FLOOR_AREAS) {
      areaSplit[a] = round2(mean(midSg.map((r) => r.sg![a]))! - mean(badSg.map((r) => r.sg![a]))!);
    }
    driver = [...FLOOR_AREAS].sort((a, b) => areaSplit![b] - areaSplit![a])[0]!;
  }

  const gaps = peers ? peerFloorGaps(peers, data.playerId) : [];
  const peerGap = gaps.length >= PEER_MIN_PLAYERS ? median(gaps) : null;
  const floorGap = p80 - med;
  const extra = peerGap === null ? 0 : floorGap - peerGap;

  const badIds = new Set(bad.map((r) => r.id));
  const dateOf = new Map(rows.map((r) => [r.id, r.date]));
  const examples = pickExamples(
    data.holes
      .filter((h) => badIds.has(h.round_id) && h.score !== null && h.score - h.par >= 2)
      .map((h) => {
        const tp = (h.score as number) - h.par;
        const pen = h.penalty_strokes ?? 0;
        return {
          round_id: h.round_id,
          hole_number: h.hole_number,
          hole_id: h.id,
          date: dateOf.get(h.round_id) ?? '',
          note: `par ${h.par}, scored ${h.score} (+${tp})${pen > 0 ? `, ${pen} penalty stroke${pen === 1 ? '' : 's'}` : ''}`,
        };
      }),
  );

  const qualifies =
    rows.length >= FLOOR_MIN_ROUNDS && peerGap !== null && extra >= FLOOR_MIN_EXTRA;

  return {
    window: windowOf(rows),
    rounds: rows.map((r) => ({
      ...r,
      to_par: round2(r.to_par),
      parts: {
        penalties: round2(r.parts.penalties),
        double_or_worse: round2(r.parts.double_or_worse),
        everything_else: round2(r.parts.everything_else),
      },
      sg: r.sg
        ? { tee: round2(r.sg.tee), approach: round2(r.sg.approach), short_game: round2(r.sg.short_game), putting: round2(r.sg.putting) }
        : null,
    })),
    nine_hole_rounds: rows.filter((r) => r.holes === 9).length,
    median: round2(med),
    p80: round2(p80),
    floor_gap: round2(floorGap),
    bad_rounds: bad.length,
    middle_rounds: middle.length,
    bad_mean: round2(badMean),
    middle_mean: round2(midMean),
    split,
    area_split: areaSplit,
    area_split_rounds: { bad: badSg.length, middle: midSg.length },
    driver,
    peer_gap: peerGap === null ? null : round2(peerGap),
    peer_n: gaps.length,
    extra_gap: round2(extra),
    excluded: { incomplete_hole_scores: incomplete },
    examples,
    qualifies,
  };
}

export interface FloorAggregate extends GeneratorAggregate {
  result: FloorResult;
  baseline: number | null;
}

export function toFloorAggregate(result: FloorResult | null, baseline: number | null): FloorAggregate | null {
  if (!result || !result.qualifies) return null;
  return { result, baseline, sampleN: result.rounds.length, playerValue: result.floor_gap };
}

export const FLOOR_DEFINITION =
  'Floor gap = P80 minus median of score to par per 18 holes (a 9-hole round is scaled × 2). ' +
  'Bad rounds are at or above P80; middle rounds are P30–P70. The split breaks down the bad-round average minus the middle-round average (a wider comparison than P80 minus median, so its total is larger). Each hole splits into penalty strokes, strokes beyond bogey on double-or-worse holes (not penalties), and everything else; the three add up to the hole\'s score to par.';

function fmtToPar(v: number): string {
  const r = Math.round(v * 10) / 10;
  return r > 0 ? `+${r.toFixed(1)}` : r.toFixed(1);
}

export function composeBadDayFloor(agg: FloorAggregate): ComposedContent & { category: InsightCategory } {
  const r = agg.result;
  const peerGap = r.peer_gap as number;
  const cf = attemptCounterfactual({
    strokesPerAttempt: r.extra_gap,
    attemptsPerRound: BAD_DAY_SHARE,
    baseline: agg.baseline,
    weeks: 12,
  });
  const diff = r.bad_mean - r.middle_mean;
  const lead = [...FLOOR_PARTS].sort((a, b) => r.split[b] - r.split[a])[0]!;
  const nineNote = r.nine_hole_rounds
    ? ` ${r.nine_hole_rounds} of the ${r.rounds.length} rounds are 9-hole rounds, scaled × 2 to 18 holes.`
    : '';
  const areaLine =
    r.driver && r.area_split
      ? ` In strokes gained, bad rounds lose the most ${AREA_LABEL[r.driver]} (${r.area_split[r.driver].toFixed(1)} strokes vs a middle round, ${r.area_split_rounds.bad} bad and ${r.area_split_rounds.middle} middle rounds with SG stored).`
      : '';
  const receipts: AngleReceipts = {
    window: r.window,
    definition: FLOOR_DEFINITION,
    samples: {
      rounds: r.rounds.length,
      nine_hole_rounds: r.nine_hole_rounds,
      bad_rounds: r.bad_rounds,
      middle_rounds: r.middle_rounds,
      peers: r.peer_n,
    },
    exclusions: { rounds_with_incomplete_hole_scores: r.excluded.incomplete_hole_scores },
    examples: r.examples,
  };
  const evidence: InsightEvidence & { counterfactual: CounterfactualProjection } = {
    metric: 'round_bad_day_floor',
    metric_label: 'Bad-day gap: P80 round minus median round (score to par per 18)',
    unit: 'strokes',
    polarity: 'lower_better',
    your_value: r.floor_gap,
    your_value_display: `${r.floor_gap.toFixed(1)} strokes`,
    comparison_value: peerGap,
    comparison_label: `Teammates' median bad-day gap (${r.peer_n} players, 10+ rounds each)`,
    comparison_source: 'team_avg',
    sample_n: r.rounds.length,
    window_days: r.window.window_days,
    window_start: r.window.window_start,
    window_end: r.window.window_end,
    strokes_impact: impactOf(cf),
    strokes_impact_method: 'peer_delta',
    confidence: 0,
    confidence_factors: { sample_adequacy: Math.min(r.rounds.length / 20, 1), recency: 1, variance: 0.5 },
    counterfactual: cf,
    detail: {
      angle: 'bad_day_floor',
      median: r.median,
      p80: r.p80,
      floor_gap: r.floor_gap,
      peer_gap: r.peer_gap,
      peer_n: r.peer_n,
      extra_gap: r.extra_gap,
      bad_mean: r.bad_mean,
      middle_mean: r.middle_mean,
      split: r.split,
      area_split: r.area_split,
      area_split_rounds: r.area_split_rounds,
      driver_area: r.driver,
      nine_hole_rounds: r.nine_hole_rounds,
      rounds: r.rounds,
      sizing_note: 'Extra gap vs teammates × 0.2 (a P80 round is one round in five).',
      receipts,
    },
    diagnosis: {
      symptom: `Your P80 round is ${r.floor_gap.toFixed(1)} strokes above your median round vs ${peerGap.toFixed(1)} for a typical teammate`,
      root_cause:
        `Bad rounds average ${fmtToPar(r.bad_mean)} per 18 vs ${fmtToPar(r.middle_mean)} for middle rounds (${diff.toFixed(1)} strokes): ` +
        `${r.split.penalties.toFixed(1)} from penalty strokes, ${r.split.double_or_worse.toFixed(1)} from strokes beyond bogey on double-or-worse holes, ${r.split.everything_else.toFixed(1)} from everything else. ` +
        'This describes where the strokes were recorded, not why.',
      causality_level: 'inferred_hypothesis',
      drivers: [
        { metric: 'round_bad_day_floor', label: 'Bad-day gap (P80 − median)', value: r.floor_gap, unit: 'strokes', sample_n: r.rounds.length, source: 'golf_holes.score / par / penalty_strokes' },
        { metric: `round_bad_day_floor_${lead}`, label: `Bad-day strokes from ${FLOOR_PART_LABEL[lead]}`, value: r.split[lead], unit: 'strokes', sample_n: r.bad_rounds, source: 'golf_holes.score / par / penalty_strokes' },
      ],
      recommended_action:
        lead === 'penalties'
          ? 'Review the penalty holes on the bad rounds: where the ball went and what the next shot was.'
          : lead === 'double_or_worse'
            ? 'Review the double-or-worse holes on the bad rounds: what happened after the first mistake.'
            : r.driver
              ? `Bad rounds are spread across many holes; compare the ${AREA_LABEL[r.driver]} numbers on bad and middle rounds.`
              : 'Bad rounds are spread across many holes rather than a few big ones.',
      confidence_reason: '',
    },
  };
  return {
    category: r.driver ?? 'scoring',
    title: 'Your bad rounds sit further from your typical round than your teammates\'',
    content:
      `Over ${r.rounds.length} rounds your median is ${fmtToPar(r.median)} per 18 and your P80 round is ${fmtToPar(r.p80)}, a gap of ${r.floor_gap.toFixed(1)} strokes vs ${peerGap.toFixed(1)} for a typical teammate (${r.peer_n} teammates). ` +
      `On the ${r.bad_rounds} bad rounds vs the ${r.middle_rounds} middle rounds, the extra ${diff.toFixed(1)} strokes (bad-round average minus middle-round average) split into ${r.split.penalties.toFixed(1)} penalty strokes, ${r.split.double_or_worse.toFixed(1)} beyond bogey on double-or-worse holes and ${r.split.everything_else.toFixed(1)} everything else.` +
      `${areaLine}${nineNote}`,
    priority: cf.strokes_saved_per_round >= 0.5 ? 'medium' : 'low',
    framing: 'leak',
    signature: 'bad_day_floor:score_to_par',
    evidence,
  };
}

export class BadDayFloorGenerator extends BaseGenerator<FloorAggregate> {
  readonly name = 'BadDayFloorGenerator';
  readonly metricId: MetricId = 'sg_total';
  readonly insightType = 'scoring';
  readonly minSampleN = FLOOR_MIN_ROUNDS;
  protected override readonly requiresStanding = false;

  /** The area bad rounds lose most in, set by composeContent before the write. */
  private composedCategory: InsightCategory = 'scoring';
  get category(): InsightCategory {
    return this.composedCategory;
  }

  protected override async isEnabled(): Promise<boolean> {
    return isFlagEnabled(INSIGHT_ANGLES_FLAG);
  }

  protected override signatureScope(): string {
    return 'bad_day_floor:';
  }

  async aggregate(): Promise<FloorAggregate | null> {
    const data = await loadAngleData(this.playerId);
    const team = primaryTeamId(data.rounds);
    const peers = team ? await loadTeamPeerRounds(team) : null;
    return toFloorAggregate(computeBadDayFloor(data, peers), data.scoringBaseline);
  }

  composeContent(agg: FloorAggregate): ComposedContent {
    const { category, ...composed } = composeBadDayFloor(agg);
    this.composedCategory = category;
    return composed;
  }
}
