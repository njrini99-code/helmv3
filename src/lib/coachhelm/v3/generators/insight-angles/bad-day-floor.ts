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
 * - Area split (descriptive only): the same bad-vs-middle difference in
 *   stored per-round SG (per 18) by area, from as few as 2 + 2 rounds. It is
 *   kept in `detail` (`driver_area`) and never files the row: the category
 *   is always `scoring`, so these strokes stay out of every area total.
 * - Benchmark: the MEDIAN floor gap of teammates (other players on the
 *   player's team, 10+ countable rounds each, newest 40, from
 *   `golf_rounds.score_to_par` per 18; ≥ 5 teammates, the `07` §6 privacy
 *   floor; the player never counts as their own peer). Below 5 there is no
 *   comparison and no read. Production check 2026-09-25: hole sums equal
 *   `score_to_par` on 642 of 657 completed rounds.
 * - Gate: ≥ 10 rounds, ≥ 5 teammates, extra gap (player − teammates) ≥ 1.5,
 *   and z = extra gap ÷ the floor gap's bootstrap SE ≥ 1.645.
 * - Sizing: a bad round (≥ P80) is one round in five, so strokes/round =
 *   extra gap × 0.2. That share is an assumption, so the size is a ROUGH
 *   ESTIMATE (`estimated: true`, no projection attached).
 *
 * Not reused: `metrics/sequence-attribution.ts` works per shot sequence
 * against the SG baseline; this angle splits recorded hole scores, which
 * need no shot data and cover every scored hole.
 */

import type { ComposedContent, GeneratorAggregate, InsightCategory, MetricId } from '@/lib/coachhelm/v3/engine/types';
import {
  ANGLE_MIN_Z,
  PEER_MIN_PLAYERS,
  PEER_ROUND_LIMIT,
  angleReadFields,
  angleTest,
  roughEstimateStrokes,
  familyDetail,
  newestFirstIds,
  floorGapBootstrapSe,
  type AngleEvidence,
  type AngleGapInput,
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
import { AngleGenerator } from './angle-generator';
import {
  FIELD_DAY_LABEL,
  buildFieldDayContext,
  summariseFieldSide,
  type FieldDayContext,
  type FieldRoundInput,
} from '@/lib/coachhelm/v3/field-day/field';
import { teamPatternEnabled } from '@/lib/coachhelm/v3/team-pattern/flag';

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

/**
 * The same-day field context of the bad and middle rounds (Slice 7b, `03`
 * §5.2), present only with `coachhelm_team_pattern_v1` on. A bad round is
 * "shared with the field" when it sat in a field of 3 or more teammates and
 * the player scored at or better than the team's mean that day: a hard day
 * for everyone, not the player's bad day.
 */
export interface FloorFieldDay {
  label: typeof FIELD_DAY_LABEL;
  bad_rounds_in_field: number;
  /** Mean score relative to the team on the day over those bad rounds. */
  bad_mean_relative: number | null;
  middle_rounds_in_field: number;
  middle_mean_relative: number | null;
  /** Bad rounds that sat in a field and were at or better than the team's mean that day. */
  bad_shared_with_field: number;
  /** More than half the bad rounds were hard days for the whole field: the read is not the player's (no read). */
  explained_by_field: boolean;
}

/** Bad rounds in a field needed before the field can explain the floor away. */
export const FIELD_EXPLAIN_MIN_ROUNDS = 2;

/** The field summary of the bad and middle rounds. */
export function floorFieldDay(badIds: readonly string[], middleIds: readonly string[], ctx: FieldDayContext): FloorFieldDay {
  const bad = summariseFieldSide(badIds, ctx);
  const middle = summariseFieldSide(middleIds, ctx);
  const shared = badIds.filter((id) => {
    const e = ctx.get(id);
    return e !== undefined && e.relative <= 0;
  }).length;
  return {
    label: FIELD_DAY_LABEL,
    bad_rounds_in_field: bad.n,
    bad_mean_relative: bad.mean_relative,
    middle_rounds_in_field: middle.n,
    middle_mean_relative: middle.mean_relative,
    bad_shared_with_field: shared,
    explained_by_field: shared >= FIELD_EXPLAIN_MIN_ROUNDS && shared * 2 > badIds.length,
  };
}

/** The field rounds of one team from its peer rounds (rounds without an id cannot join). */
export function fieldRoundsOf(peers: readonly PeerRound[], teamId: string): FieldRoundInput[] {
  const out: FieldRoundInput[] = [];
  for (const p of peers) {
    if (!p.round_id) continue;
    out.push({
      round_id: p.round_id,
      player_id: p.player_id,
      team_id: teamId,
      date: p.date,
      course_id: p.course_id ?? null,
      score_to_par: p.score_to_par,
      holes: p.holes,
    });
  }
  return out;
}

export interface FloorResult {
  window: AngleWindow;
  rounds: FloorRound[];
  /** Standard error of `floor_gap` (deterministic bootstrap); null below 3 rounds. */
  floor_gap_se: number | null;
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
  /** (floor gap − teammates' gap) ÷ the floor gap's bootstrap SE; null without both. */
  z: number | null;
  excluded: { incomplete_hole_scores: number };
  examples: ReceiptExample[];
  /** Slice 7b same-day field context; absent with the flag off or no field data. */
  field_day?: FloorFieldDay;
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

/**
 * Pure compute. Null with fewer than 2 usable rounds. With a field context
 * (Slice 7b), a floor whose bad rounds were mostly hard days for the whole
 * field does not qualify.
 */
export function computeBadDayFloor(
  data: AngleData,
  peers: readonly PeerRound[] | null,
  field: FieldDayContext | null = null,
): FloorResult | null {
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

  const se = floorGapBootstrapSe(vals);
  const z = peerGap !== null && se !== null && se > 0 ? (floorGap - peerGap) / se : null;
  const fieldDay =
    field && field.size > 0
      ? floorFieldDay(
          bad.map((r) => r.id),
          middle.map((r) => r.id),
          field,
        )
      : null;
  const qualifies =
    rows.length >= FLOOR_MIN_ROUNDS &&
    peerGap !== null &&
    extra >= FLOOR_MIN_EXTRA &&
    z !== null &&
    z >= ANGLE_MIN_Z &&
    !(fieldDay?.explained_by_field ?? false);

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
    floor_gap_se: se === null ? null : round2(se),
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
    z: z === null ? null : round2(z),
    excluded: { incomplete_hole_scores: incomplete },
    examples,
    ...(fieldDay ? { field_day: fieldDay } : {}),
    qualifies,
  };
}

export interface FloorAggregate extends GeneratorAggregate {
  result: FloorResult;
  baseline: number | null;
  /** The rounds behind `sampleN` (Slice 0b stamps the window from these once it lands). */
  windowRoundIds: readonly string[];
}

export function toFloorAggregate(result: FloorResult | null, baseline: number | null): FloorAggregate | null {
  if (!result || !result.qualifies) return null;
  return {
    result,
    baseline,
    sampleN: result.rounds.length,
    playerValue: result.floor_gap,
    windowRoundIds: newestFirstIds(result.rounds),
  };
}

/**
 * The Slice 1 test input: the floor gap with its bootstrap SE against the
 * teammates' median gap. Null without a peer benchmark or an SE.
 */
export function floorGapInput(r: FloorResult): AngleGapInput | null {
  if (r.peer_gap === null || r.floor_gap_se === null || !(r.floor_gap_se > 0)) return null;
  return {
    kind: 'mean',
    value: r.floor_gap,
    se: r.floor_gap_se,
    df: Math.max(1, r.rounds.length - 1),
    benchmark: r.peer_gap,
    polarity: 'lower_better',
  };
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
  // Rough estimate (the one-in-five share is assumed): no projection attached.
  const roughStrokes = roughEstimateStrokes(r.extra_gap, BAD_DAY_SHARE);
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
  const evidence: AngleEvidence = {
    ...angleReadFields(
      'bad_day_floor',
      newestFirstIds(r.rounds),
      {
        source: 'team_pool',
        label: `Teammates' median bad-day gap (${r.peer_n} players, 10+ rounds each)`,
        value: peerGap,
        n: r.peer_n,
      },
    ),
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
    strokes_impact: roughStrokes,
    strokes_impact_method: 'rough_estimate',
    estimated: true,
    confidence: 0,
    confidence_factors: { sample_adequacy: Math.min(r.rounds.length / 20, 1), recency: 1, variance: 0.5 },
    detail: {
      ...familyDetail('bad_day_floor'),
      gap_input: floorGapInput(r),
      test: angleTest(r.z),
      floor_gap_se: r.floor_gap_se,
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
      sizing_note: 'Rough estimate: extra gap vs teammates × 0.2 (a P80 round is one round in five), not a measured saving.',
      ...(r.field_day ? { field_day: r.field_day } : {}),
      area_note: 'The area split is descriptive (as few as 2 bad and 2 middle rounds with SG stored); the row is filed under scoring and its strokes stay out of area totals.',
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
    category: 'scoring',
    title: 'Your bad rounds sit further from your typical round than your teammates\'',
    content:
      `Over ${r.rounds.length} rounds your median is ${fmtToPar(r.median)} per 18 and your P80 round is ${fmtToPar(r.p80)}, a gap of ${r.floor_gap.toFixed(1)} strokes vs ${peerGap.toFixed(1)} for a typical teammate (${r.peer_n} teammates). ` +
      `On the ${r.bad_rounds} bad rounds vs the ${r.middle_rounds} middle rounds, the extra ${diff.toFixed(1)} strokes (bad-round average minus middle-round average) split into ${r.split.penalties.toFixed(1)} penalty strokes, ${r.split.double_or_worse.toFixed(1)} beyond bogey on double-or-worse holes and ${r.split.everything_else.toFixed(1)} everything else.` +
      `${areaLine}${nineNote}`,
    priority: roughStrokes >= 0.5 ? 'medium' : 'low',
    signature: 'bad_day_floor:score_to_par',
    evidence,
  };
}

export class BadDayFloorGenerator extends AngleGenerator<FloorAggregate> {
  readonly name = 'BadDayFloorGenerator';
  readonly metricId: MetricId = 'sg_total';
  readonly insightType = 'scoring';
  /** Always scoring: the area split is descriptive and never files the row. */
  readonly category: InsightCategory = 'scoring';
  readonly minSampleN = FLOOR_MIN_ROUNDS;
  protected override readonly requiresStanding = false;

  protected override signatureScope(): string {
    return 'bad_day_floor:';
  }

  async aggregate(): Promise<FloorAggregate | null> {
    const data = await this.loaders.data();
    const team = primaryTeamId(data.rounds);
    const peers = team ? await this.loaders.teamRounds(team) : null;
    // Slice 7b: the same-day field, from the team rounds already read (no new query).
    const field = team && peers && teamPatternEnabled() ? buildFieldDayContext(fieldRoundsOf(peers, team)) : null;
    return toFloorAggregate(computeBadDayFloor(data, peers, field), data.scoringBaseline);
  }

  composeContent(agg: FloorAggregate): ComposedContent {
    const { category: _category, ...composed } = composeBadDayFloor(agg);
    return composed;
  }
}
