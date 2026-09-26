/**
 * Insight angle 5 — approach-miss compass (2026-09-25, flag
 * `coachhelm_insight_angles_v1`).
 *
 * Question: when this player misses a green, does one side of the green cost
 * clearly more to finish from than the opposite side?
 *
 * Population: approach shots (`shot_type='approach'`, not penalties) on the
 * newest 40 COUNTABLE rounds that missed the green (`result` not
 * green/hole/holed/gir and `lie_after` not green). Par-3 tee shots are
 * recorded as approaches (`lie_before='tee'`) and are INCLUDED — they are
 * the green attempt on a par 3; their count is in the receipts. 175+ yd
 * approaches on par 5s are EXCLUDED (mostly lay-ups, the context
 * narrowing's rule) and counted.
 *
 * Axes: `golf_shots.miss_direction` is recorded in 8 directions (short,
 * short_left, short_right, left, right, long, long_left, long_right; ~99% of
 * missed greens in production). They collapse onto two axes — short/long and
 * left/right — and a diagonal counts on BOTH (short_left is short on one
 * axis and left on the other). The two sides of one axis never overlap, and
 * only one axis is ever sized, so no miss is counted twice in a claim.
 *
 * Recovery cost of a miss = −Σ per-shot strokes gained of every shot after
 * the approach on that hole (the `calculate_round_strokes_gained` port in
 * `root-map/approach-context.ts`, with the player's SG scale; a penalty
 * stroke counts −1). That sum telescopes to "strokes taken to finish from
 * where the ball finished − the canonical expected strokes from that lie and
 * distance". It is used only when the rows after the approach are contiguous
 * in shot number, every one has SG and the last one holes out; any other
 * miss is excluded and counted (missing is never 0). Only the LAST approach
 * on a hole is costed; an earlier missed approach on the same hole is
 * excluded and counted, so two misses never share recovery strokes.
 *
 * Gate: ≥ 5 rounds, miss-side coverage ≥ 80%, ≥ 12 costed misses on each
 * side of the axis, the costlier side ≥ 0.2 strokes per miss worse with a
 * one-sided Welch z ≥ 1.645, and ≥ 0.3 strokes per round.
 * Sizing: if the costlier side's recoveries cost what the other side's do —
 * gap × costlier-side misses per 18.
 *
 * Diagnosis stays `inferred_hypothesis`: the cost is an average over
 * recovery sequences, not one repeated recorded path.
 */

import { BaseGenerator } from '@/lib/coachhelm/v3/engine/generator-base';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import type { CounterfactualProjection } from '@/lib/coachhelm/v3/counterfactual/types';
import type { ComposedContent, GeneratorAggregate, InsightCategory, MetricId } from '@/lib/coachhelm/v3/engine/types';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import {
  ANGLE_MIN_Z,
  INSIGHT_ANGLES_FLAG,
  attemptCounterfactual,
  holeKey,
  impactOf,
  indexHoles,
  mean,
  pickExamples,
  round1,
  round2,
  shotSgById,
  shotsByHole,
  totalHoles,
  welchZ,
  windowOf,
  yardsOf,
  type AngleData,
  type AngleReceipts,
  type AngleWindow,
  type ReceiptExample,
} from './angle-data';
import { loadAngleData } from './load-angle-data';

export const COMPASS_MIN_ROUNDS = 5;
export const COMPASS_MIN_PER_SIDE = 12;
export const COMPASS_MIN_COVERAGE = 0.8;
export const COMPASS_MIN_GAP = 0.2;

export type CompassAxis = 'depth' | 'line';
export type CompassSide = 'short' | 'long' | 'left' | 'right';
export const AXIS_SIDES: Record<CompassAxis, readonly [CompassSide, CompassSide]> = {
  depth: ['short', 'long'],
  line: ['left', 'right'],
};

/** The axis sides one recorded direction belongs to (diagonals → both axes). */
export function sidesOf(direction: string | null): CompassSide[] {
  switch ((direction ?? '').toLowerCase()) {
    case 'short':
      return ['short'];
    case 'long':
      return ['long'];
    case 'left':
      return ['left'];
    case 'right':
      return ['right'];
    case 'short_left':
      return ['short', 'left'];
    case 'short_right':
      return ['short', 'right'];
    case 'long_left':
      return ['long', 'left'];
    case 'long_right':
      return ['long', 'right'];
    default:
      return [];
  }
}

const ON_GREEN = new Set(['green', 'hole', 'holed', 'gir']);

export interface CompassSideRow {
  side: CompassSide;
  /** Missed greens on this side (recorded direction). */
  misses: number;
  /** Of those, misses with a complete recovery record. */
  costed: number;
  /** Mean strokes lost finishing the hole vs the canonical expectation; null when none costed. */
  recovery_cost: number | null;
  /** Share of costed recoveries that got down in 2 or fewer strokes. */
  up_and_down_pct: number | null;
}

export interface CompassAxisRow {
  axis: CompassAxis;
  worse: CompassSide | null;
  better: CompassSide | null;
  gap_per_miss: number | null;
  z: number | null;
  worse_per_18: number;
  cost_per_round: number;
  qualifies: boolean;
}

export interface CompassResult {
  window: AngleWindow;
  rounds: number;
  approaches: number;
  /** Missed greens on the LAST approach of a hole (the coverage population):
   *  = direction_recorded + excluded.no_direction. */
  missed_greens: number;
  direction_recorded: number;
  coverage_pct: number;
  par3_tee_included: number;
  sides: Record<CompassSide, CompassSideRow>;
  axes: Record<CompassAxis, CompassAxisRow>;
  /** The qualifying axis with the larger cost; null when neither qualifies. */
  lead: CompassAxis | null;
  excluded: { par5_long: number; no_direction: number; recovery_incomplete: number; earlier_miss_on_hole: number };
  examples: ReceiptExample[];
  qualifies: boolean;
}

interface MissObs {
  round_id: string;
  hole_number: number;
  hole_id: string | null;
  date: string;
  direction: string;
  sides: CompassSide[];
  cost: number | null;
  strokesAfter: number | null;
  yards: number | null;
  lieAfter: string;
}

/** Pure compute. Null when the player has no approach shot. */
export function computeApproachCompass(data: AngleData): CompassResult | null {
  const dateOf = new Map(data.rounds.map((r) => [r.id, r.date]));
  const { byKey, byId } = indexHoles(data.holes);
  const sgById = shotSgById(data);
  const byHole = shotsByHole(data.shots.filter((s) => dateOf.has(s.round_id)));
  const excluded = { par5_long: 0, no_direction: 0, recovery_incomplete: 0, earlier_miss_on_hole: 0 };
  const obs: MissObs[] = [];
  let approaches = 0;
  let missed = 0;
  let par3Tee = 0;

  for (const list of byHole.values()) {
    for (const s of list) {
      if (s.shot_type !== 'approach' || s.is_penalty === true) continue;
      const hole = (s.hole_id ? byId.get(s.hole_id) : undefined) ?? byKey.get(holeKey(s.round_id, s.hole_number));
      const yards = yardsOf(s.distance_to_hole_before, s.distance_unit_before);
      if (hole?.par === 5 && yards !== null && yards >= 175) {
        excluded.par5_long += 1;
        continue;
      }
      approaches += 1;
      if ((s.lie_before ?? '').toLowerCase() === 'tee') par3Tee += 1;
      const result = (s.result ?? '').toLowerCase();
      const lieAfter = (s.lie_after ?? '').toLowerCase();
      if (ON_GREEN.has(result) || lieAfter === 'green' || s.putt_made === true) continue;
      // One miss per hole: only the LAST approach on the hole is costed, so
      // two misses on one hole never share recovery strokes. Earlier misses
      // are their own exclusion and are NOT in the coverage population.
      if (list.some((x) => x.shot_type === 'approach' && x.is_penalty !== true && x.shot_number > s.shot_number)) {
        excluded.earlier_miss_on_hole += 1;
        continue;
      }
      missed += 1;
      const sides = sidesOf(s.miss_direction);
      if (sides.length === 0) {
        excluded.no_direction += 1;
        continue;
      }
      // Recovery: every row after the approach, contiguous, SG known, last holes out.
      const after = list.filter((x) => x.shot_number > s.shot_number);
      const contiguous = after.every((x, i) => x.shot_number === s.shot_number + 1 + i);
      const last = after[after.length - 1];
      const holedOut =
        last !== undefined && (last.putt_made === true || ['hole', 'holed'].includes((last.result ?? '').toLowerCase()));
      const sgs = after.map((x) => sgById.get(x.id));
      const complete = after.length > 0 && contiguous && holedOut && sgs.every((v) => v !== undefined && Number.isFinite(v));
      if (!complete) excluded.recovery_incomplete += 1;
      obs.push({
        round_id: s.round_id,
        hole_number: s.hole_number ?? -1,
        hole_id: hole?.id ?? s.hole_id ?? null,
        date: dateOf.get(s.round_id) ?? '',
        direction: (s.miss_direction ?? '').toLowerCase(),
        sides,
        cost: complete ? -sgs.reduce((a: number, v) => a + (v as number), 0) : null,
        strokesAfter: complete ? after.length : null,
        yards,
        lieAfter: lieAfter || 'not recorded',
      });
    }
  }
  if (approaches === 0) return null;

  const costs = {} as Record<CompassSide, number[]>;
  const sides = {} as Record<CompassSide, CompassSideRow>;
  for (const side of ['short', 'long', 'left', 'right'] as const) {
    const rows = obs.filter((o) => o.sides.includes(side));
    const costed = rows.filter((o) => o.cost !== null);
    costs[side] = costed.map((o) => o.cost as number);
    sides[side] = {
      side,
      misses: rows.length,
      costed: costed.length,
      recovery_cost: costed.length ? round2(mean(costs[side])!) : null,
      up_and_down_pct: costed.length ? round1((100 * costed.filter((o) => (o.strokesAfter as number) <= 2).length) / costed.length) : null,
    };
  }

  const holesPlayed = totalHoles(data.rounds);
  const directionRecorded = obs.length;
  const coverage = missed > 0 ? directionRecorded / missed : 0;
  const axes = {} as Record<CompassAxis, CompassAxisRow>;
  for (const axis of ['depth', 'line'] as const) {
    const [a, b] = AXIS_SIDES[axis];
    const ca = sides[a].recovery_cost;
    const cb = sides[b].recovery_cost;
    let worse: CompassSide | null = null;
    let better: CompassSide | null = null;
    if (ca !== null && cb !== null) {
      worse = ca >= cb ? a : b;
      better = worse === a ? b : a;
    }
    const gap = worse && better ? mean(costs[worse])! - mean(costs[better])! : null;
    const z = worse && better ? welchZ(costs[worse], costs[better]) : null;
    const worsePer18 = worse && holesPlayed > 0 ? (sides[worse].misses * 18) / holesPlayed : 0;
    const cost = gap !== null && gap > 0 ? gap * worsePer18 : 0;
    axes[axis] = {
      axis,
      worse,
      better,
      gap_per_miss: gap === null ? null : round2(gap),
      z: z === null ? null : round2(z),
      worse_per_18: round2(worsePer18),
      cost_per_round: round2(cost),
      qualifies:
        data.rounds.length >= COMPASS_MIN_ROUNDS &&
        coverage >= COMPASS_MIN_COVERAGE &&
        costs[a].length >= COMPASS_MIN_PER_SIDE &&
        costs[b].length >= COMPASS_MIN_PER_SIDE &&
        gap !== null &&
        gap >= COMPASS_MIN_GAP &&
        z !== null &&
        z >= ANGLE_MIN_Z &&
        cost >= 0.3,
    };
  }
  const qualifying = (['depth', 'line'] as const).filter((x) => axes[x].qualifies);
  const lead = qualifying.sort((x, y) => axes[y].cost_per_round - axes[x].cost_per_round)[0] ?? null;
  const leadSide = lead ? axes[lead].worse : null;

  return {
    window: windowOf(data.rounds),
    rounds: data.rounds.length,
    approaches,
    missed_greens: missed,
    direction_recorded: directionRecorded,
    coverage_pct: round1(coverage * 100),
    par3_tee_included: par3Tee,
    sides,
    axes,
    lead,
    excluded,
    examples: leadSide
      ? pickExamples(
          obs
            .filter((o) => o.sides.includes(leadSide) && o.cost !== null)
            .map((o) => ({
              round_id: o.round_id,
              hole_number: o.hole_number,
              hole_id: o.hole_id,
              date: o.date,
              note: `missed ${o.direction.replace('_', '-')}${o.yards !== null ? ` from ${Math.round(o.yards)} yd` : ''} into the ${o.lieAfter}, ${o.strokesAfter} more strokes to hole out (${(o.cost as number) > 0 ? '+' : ''}${(o.cost as number).toFixed(2)} vs expected)`,
            })),
        )
      : [],
    qualifies: lead !== null,
  };
}

export interface CompassAggregate extends GeneratorAggregate {
  result: CompassResult & { lead: CompassAxis };
  baseline: number | null;
}

export function toCompassAggregate(result: CompassResult | null, baseline: number | null): CompassAggregate | null {
  if (!result || !result.lead) return null;
  const r = result as CompassResult & { lead: CompassAxis };
  const ax = r.axes[r.lead];
  return {
    result: r,
    baseline,
    sampleN: r.sides[ax.worse!].costed + r.sides[ax.better!].costed,
    playerValue: r.sides[ax.worse!].recovery_cost as number,
  };
}

export const COMPASS_DEFINITION =
  'Recovery cost = strokes taken to hole out after a missed green minus the canonical expected strokes from where the ball finished (the strokes-gained table, your SG scale). ' +
  'Misses are grouped short vs long and left vs right from the recorded miss direction; a diagonal (e.g. short-left) counts on both axes. Par-3 tee shots count as approaches; 175+ yd approaches on par 5s are left out.';

const SIDE_TEXT: Record<CompassSide, string> = { short: 'short', long: 'long', left: 'left', right: 'right' };

export function composeApproachCompass(agg: CompassAggregate): ComposedContent & { category: InsightCategory } {
  const r = agg.result;
  const ax = r.axes[r.lead];
  const worse = ax.worse as CompassSide;
  const better = ax.better as CompassSide;
  const w = r.sides[worse];
  const b = r.sides[better];
  const wCost = w.recovery_cost as number;
  const bCost = b.recovery_cost as number;
  const cf = attemptCounterfactual({
    strokesPerAttempt: ax.gap_per_miss ?? 0,
    attemptsPerRound: ax.worse_per_18,
    baseline: agg.baseline,
    weeks: 10,
  });
  const receipts: AngleReceipts = {
    window: r.window,
    definition: COMPASS_DEFINITION,
    samples: {
      rounds: r.rounds,
      approaches: r.approaches,
      missed_greens: r.missed_greens,
      miss_direction_recorded: r.direction_recorded,
      par3_tee_shots_included: r.par3_tee_included,
      [`${worse}_misses_costed`]: w.costed,
      [`${better}_misses_costed`]: b.costed,
    },
    exclusions: {
      par5_approaches_175_plus: r.excluded.par5_long,
      missed_greens_without_direction: r.excluded.no_direction,
      misses_without_complete_recovery_record: r.excluded.recovery_incomplete,
      earlier_missed_approach_on_same_hole: r.excluded.earlier_miss_on_hole,
    },
    examples: r.examples,
  };
  const coverageNote = `Miss direction recorded on ${r.direction_recorded} of ${r.missed_greens} missed greens (${r.coverage_pct}%).`;
  const udText = (row: CompassSideRow) =>
    row.up_and_down_pct === null ? `n/a (n=0)` : `${row.up_and_down_pct}% (n=${row.costed})`;
  const evidence: InsightEvidence & { counterfactual: CounterfactualProjection } = {
    metric: 'approach_miss_recovery_cost',
    metric_label: `Extra strokes to finish a hole after missing the green ${SIDE_TEXT[worse]}`,
    unit: 'strokes',
    polarity: 'lower_better',
    your_value: wCost,
    your_value_display: `${wCost > 0 ? '+' : ''}${wCost.toFixed(2)} per miss`,
    comparison_value: bCost,
    comparison_label: `Your ${SIDE_TEXT[better]} misses (same measure)`,
    comparison_source: 'your_baseline',
    sample_n: w.costed + b.costed,
    window_days: r.window.window_days,
    window_start: r.window.window_start,
    window_end: r.window.window_end,
    strokes_impact: impactOf(cf),
    strokes_impact_method: 'sg_baseline',
    confidence: 0,
    confidence_factors: { sample_adequacy: Math.min((w.costed + b.costed) / 60, 1), recency: 1, variance: 0.5 },
    counterfactual: cf,
    detail: {
      angle: 'approach_miss_compass',
      axis: r.lead,
      worse_side: worse,
      better_side: better,
      sides: r.sides,
      axes: r.axes,
      coverage: { recorded: r.direction_recorded, missed: r.missed_greens, pct: r.coverage_pct },
      linked_area: 'approach',
      chain: ['approach', 'short_game'],
      diagonal_note: 'A diagonal miss (e.g. short-left) counts on both axes; the two sides of one axis never overlap.',
      receipts,
    },
    diagnosis: {
      symptom: `Finishing the hole after a ${worse} miss costs ${wCost.toFixed(2)} strokes vs expected; after a ${better} miss ${bCost.toFixed(2)}`,
      root_cause:
        `Up and down in 2 or fewer: ${udText(w)} after a ${worse} miss vs ${udText(b)} after a ${better} miss. ` +
        `The cost is measured from where the ball finished, so it is about the recovery from that side, not how far the miss went. The record shows where the strokes go, not why.`,
      causality_level: 'inferred_hypothesis',
      drivers: [
        { metric: 'approach_miss_recovery_cost', label: `Recovery cost after a ${worse} miss`, value: wCost, unit: 'strokes', sample_n: w.costed, source: 'golf_shots (per-shot SG after the approach)' },
        { metric: 'approach_miss_recovery_cost', label: `Recovery cost after a ${better} miss`, value: bCost, unit: 'strokes', sample_n: b.costed, source: 'golf_shots (per-shot SG after the approach)' },
      ],
      recommended_action: `Short-game reps from the lies a ${worse} miss leaves (see the example holes), scored on getting down in two.`,
      confidence_reason: '',
    },
  };
  return {
    category: 'short_game',
    title: `Recovering from ${worse} misses costs you more than from ${better} ones`,
    content:
      `When you miss the green ${worse}, finishing the hole costs ${wCost.toFixed(2)} strokes more than expected from where the ball finished, vs ${bCost.toFixed(2)} after a ${better} miss ` +
      `(${w.costed} ${worse} and ${b.costed} ${better} misses; a diagonal miss counts on both axes). Up and down in 2 or fewer: ${udText(w)} vs ${udText(b)}. ` +
      `If ${worse} misses cost what ${better} ones do, that is about ${ax.cost_per_round.toFixed(1)} strokes a round. ${coverageNote}`,
    priority: ax.cost_per_round >= 0.5 ? 'medium' : 'low',
    framing: 'leak',
    signature: `approach_miss_compass:${r.lead}:${worse}`,
    evidence,
  };
}

export class ApproachMissCompassGenerator extends BaseGenerator<CompassAggregate> {
  readonly name = 'ApproachMissCompassGenerator';
  readonly metricId: MetricId = 'sg_around_green';
  readonly insightType = 'short_game';
  readonly category: InsightCategory = 'short_game';
  readonly minSampleN = COMPASS_MIN_PER_SIDE * 2;
  protected override readonly requiresStanding = false;

  protected override async isEnabled(): Promise<boolean> {
    return isFlagEnabled(INSIGHT_ANGLES_FLAG);
  }

  protected override signatureScope(): string {
    return 'approach_miss_compass:';
  }

  async aggregate(): Promise<CompassAggregate | null> {
    const data = await loadAngleData(this.playerId);
    return toCompassAggregate(computeApproachCompass(data), data.scoringBaseline);
  }

  composeContent(agg: CompassAggregate): ComposedContent {
    const { category: _category, ...composed } = composeApproachCompass(agg);
    return composed;
  }
}
