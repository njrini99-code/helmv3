/**
 * Insight angle 4 — "Miss-Cost Compass" + "Driver vs Non-Driver: what
 * happened next" (2026-09-25, flag `coachhelm_insight_angles_v1`).
 *
 * Question: when this player misses a fairway, does one side cost clearly
 * more than the other — measured by what it costs to finish the hole, not by
 * how often it happens?
 *
 * Population: tee shots (`shot_type='tee'`, which only exist on par 4s and
 * 5s — par-3 tee shots are recorded as approaches) on the newest 40 COUNTABLE
 * rounds, with a scored hole row. Outcome per tee shot:
 *   - `fairway` — `lie_after='fairway'`;
 *   - `left` / `right` — `miss_direction`, recorded on about 99% of missed
 *     fairways in production (null means the fairway was hit). Coverage is
 *     measured per player ("side recorded on X of Y missed fairways");
 *   - anything else (green, unknown) is left out and counted.
 * A penalty on the hole (`golf_holes.penalty_strokes > 0`, or a penalty row
 * from the tee) is kept on its side and counted, so the costliest misses are
 * not dropped. Club is `driver` / `non_driver` only — no club is recorded.
 *
 * Cost of a miss = hole score to par minus the player's own FAIRWAY holes'
 * score to par in the same stratum (par × driver/non-driver), so hole length
 * and club choice do not masquerade as miss cost. Stratum needs ≥ 5 fairway
 * holes to be a reference.
 *
 * Gate: ≥ 5 rounds, ≥ 40 tee shots, ≥ 12 misses on each side, side coverage
 * ≥ 80%, the costlier side ≥ 0.25 strokes per miss worse than the other with
 * a one-sided Welch z ≥ 1.645, and ≥ 0.3 strokes per round.
 * Sizing: if the costlier side's misses cost what the other side's do —
 * (cost_worse − cost_better) × worse-side misses per 18. Converting misses to
 * fairways is not claimed.
 *
 * Compass (per outcome: left / fairway / right): hole cost vs the player's
 * fairway holes (cost to finish), next-shot strokes gained (the shot after
 * the tee, from the root map's SG port; holes where it cannot be computed
 * are counted, not zeroed), approach distance left, lie after, GIR, and
 * penalties. These are separate descriptive numbers — the next-shot SG is
 * part of the hole cost, never added to it.
 *
 * Driver vs non-driver chain (detail only, descriptive): per par (4, 5) ×
 * driver / non-driver: tee result mix → approach distance and lie → hole
 * score to par. Observational: the player picks the club per hole, so
 * selection bias is possible and the chain is never sized or ranked.
 *
 * Not built: an approach-miss compass. Approach `miss_direction` is recorded
 * on ~99% of missed greens in production but in 8 directions (short,
 * short_right, …); it needs its own gates and row, which is beyond this
 * angle's slice.
 *
 * Not reused: `metrics/sequence-attribution.ts` would need `ShotFact`s from
 * `load-player-context.ts`, which carries no shot ids for the SG port and no
 * countable-round filter; the hole-cost comparison here is one whole-hole
 * number per tee shot, so nothing is summed across sequence events.
 */

import { BaseGenerator, hasGeneratorSequenceEvidence } from '@/lib/coachhelm/v3/engine/generator-base';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import type { CounterfactualProjection } from '@/lib/coachhelm/v3/counterfactual/types';
import type { ComposedContent, GeneratorAggregate, InsightCategory, MetricId } from '@/lib/coachhelm/v3/engine/types';
import type { Diagnosis, DiagnosisBasis, InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import {
  ANGLE_MIN_Z,
  INSIGHT_ANGLES_FLAG,
  attemptCounterfactual,
  holeKey,
  impactOf,
  indexHoles,
  mean,
  round1,
  round2,
  shotsByHole,
  totalHoles,
  welchZ,
  windowOf,
  pickExamples,
  pctText,
  shotSgById,
  yardsOf,
  type AngleData,
  type AngleReceipts,
  type AngleWindow,
  type ReceiptExample,
} from './angle-data';
import { loadAngleData } from './load-angle-data';

export const TEE_MIN_ROUNDS = 5;
export const TEE_MIN_SHOTS = 40;
export const TEE_MIN_PER_SIDE = 12;
export const TEE_MIN_COVERAGE = 0.8;
export const TEE_MIN_SIDE_GAP = 0.25;
export const TEE_MIN_STRATUM_FAIRWAYS = 5;

export type TeeSide = 'left' | 'right';
export type TeeOutcome = 'fairway' | TeeSide;

export interface TeeSideRow {
  side: TeeOutcome;
  shots: number;
  /** Mean score to par on those holes. */
  to_par: number | null;
  /** Mean strokes vs the player's own fairway holes in the same par × club stratum. */
  cost_vs_fairway: number | null;
  /** Misses where the stratum had a fairway reference. */
  costed: number;
  penalties: number;
  lie_after: Record<string, number>;
  /** Green in regulation on the hole, % of shots with a recorded gir. */
  gir_pct: number | null;
  /** Shots with a recorded gir (the GIR denominator). */
  gir_n: number;
  driver_shots: number;
  /** Mean strokes gained of the shot after the tee shot; null when none computable. */
  next_shot_sg: number | null;
  next_shot_sg_n: number;
  /** Tee shots on this side with no computable next-shot SG (not counted as 0). */
  next_shot_sg_missing: number;
  /** Mean distance left after the tee shot, yards; null when none recorded. */
  approach_yards: number | null;
  approach_yards_n: number;
}

export type ClubClass = 'driver' | 'non_driver';

/** One cell of the driver vs non-driver chain (descriptive only). */
export interface ClubChainRow {
  par: 4 | 5;
  club: ClubClass;
  tee_shots: number;
  fairway_pct: number | null;
  left_pct: number | null;
  right_pct: number | null;
  approach_yards: number | null;
  approach_yards_n: number;
  lie_after: Record<string, number>;
  to_par: number | null;
}

export const SELECTION_BIAS_NOTE =
  'Observational: you choose driver or non-driver per hole, so the holes differ (length, width, trouble). The comparison describes what followed each choice; it does not show that switching would change the result.';

export interface TeeMissResult {
  window: AngleWindow;
  rounds: number;
  tee_shots: number;
  missed: number;
  side_recorded: number;
  coverage_pct: number;
  sides: Record<TeeOutcome, TeeSideRow>;
  worse: TeeSide | null;
  better: TeeSide | null;
  gap_per_miss: number | null;
  z: number | null;
  worse_per_18: number;
  cost_per_round: number;
  excluded: { other_outcome: number; no_hole: number };
  club_chain: ClubChainRow[];
  examples: ReceiptExample[];
  /**
   * The costlier side's most common recorded path — tee miss → lie the next
   * shot was played from → bogey or worse — counted over that side's misses
   * whose next shot is recorded in order.
   */
  sequence: {
    side: TeeSide;
    lie: string;
    occurrences: number;
    of: number;
    distinct_rounds: number;
    examples: ReceiptExample[];
  } | null;
  qualifies: boolean;
}

interface TeeObs {
  round_id: string;
  hole_number: number;
  hole_id: string;
  par: number;
  approachYards: number | null;
  nextSg: number | null;
  /** The next shot is recorded with no gap in shot numbers. */
  nextKnown: boolean;
  outcome: TeeOutcome;
  toPar: number;
  stratum: string;
  penalty: boolean;
  lieAfter: string;
  gir: boolean | null;
  driver: boolean;
}

function teeSequence(obs: readonly TeeObs[], side: TeeSide, dateOf: Map<string, string>): TeeMissResult['sequence'] {
  const pop = obs.filter((o) => o.outcome === side && o.nextKnown);
  // An unrecorded lie is not a path step; it never becomes the named lie.
  const bad = pop.filter((o) => o.toPar >= 1 && o.lieAfter !== 'unknown');
  if (bad.length === 0) return null;
  const byLie = new Map<string, TeeObs[]>();
  for (const o of bad) byLie.set(o.lieAfter, [...(byLie.get(o.lieAfter) ?? []), o]);
  const [lie, rows] = [...byLie.entries()].sort((a, b) => b[1].length - a[1].length)[0]!;
  return {
    side,
    lie,
    occurrences: rows.length,
    of: pop.length,
    distinct_rounds: new Set(rows.map((o) => o.round_id)).size,
    examples: pickExamples(
      rows.map((o) => ({
        round_id: o.round_id,
        hole_number: o.hole_number,
        hole_id: o.hole_id,
        date: dateOf.get(o.round_id) ?? '',
        note: `par ${o.par}, ${o.driver ? 'driver' : 'non-driver'}, ${side} miss → next shot from the ${lie} → hole +${o.toPar}`,
      })),
    ),
  };
}

/** Pure compute. Null when no tee shot can be read. */
export function computeTeeMiss(data: AngleData): TeeMissResult | null {
  const roundIds = new Set(data.rounds.map((r) => r.id));
  const dateOf = new Map(data.rounds.map((r) => [r.id, r.date]));
  const { byKey, byId } = indexHoles(data.holes);
  const penaltyFromTee = new Set<string>();
  for (const s of data.shots) {
    if (s.shot_type === 'penalty' && (s.lie_before ?? '').toLowerCase() === 'tee') {
      penaltyFromTee.add(holeKey(s.round_id, s.hole_number));
    }
  }
  const excluded = { other_outcome: 0, no_hole: 0 };
  const obs: TeeObs[] = [];
  let missed = 0;
  let sideRecorded = 0;
  const sgById = shotSgById(data);
  const allByHole = shotsByHole(data.shots.filter((s) => roundIds.has(s.round_id)));
  const holesWithShots = shotsByHole(data.shots.filter((s) => roundIds.has(s.round_id) && s.shot_type === 'tee'));
  for (const [key, list] of holesWithShots) {
    const tee = list[0]!;
    // The next shot is the first non-penalty row after the tee with no gap
    // in shot numbers; a gap means the next shot is not known (counted as
    // missing, never guessed).
    const holeShots = allByHole.get(key) ?? [];
    let next: (typeof holeShots)[number] | undefined;
    for (let n = tee.shot_number + 1; ; n++) {
      const row = holeShots.find((x) => x.shot_number === n);
      if (!row) break;
      if (row.shot_type === 'penalty' || row.is_penalty === true) continue;
      next = row;
      break;
    }
    const hole = (tee.hole_id ? byId.get(tee.hole_id) : undefined) ?? byKey.get(key);
    if (!hole || hole.score === null || (hole.par !== 4 && hole.par !== 5)) {
      excluded.no_hole += 1;
      continue;
    }
    const lie = (tee.lie_after ?? '').toLowerCase();
    const md = (tee.miss_direction ?? '').toLowerCase();
    let outcome: TeeOutcome | null = null;
    if (lie === 'fairway') outcome = 'fairway';
    else {
      if (lie !== 'green') missed += 1;
      if (md === 'left' || md === 'right') {
        outcome = md;
        sideRecorded += 1;
      }
    }
    if (!outcome) {
      excluded.other_outcome += 1;
      continue;
    }
    const driver = tee.club_type === 'driver';
    const nextSg = next?.id ? sgById.get(next.id) : undefined;
    obs.push({
      round_id: tee.round_id,
      hole_number: tee.hole_number ?? -1,
      hole_id: hole.id,
      par: hole.par,
      approachYards:
        yardsOf(tee.distance_to_hole_after, tee.distance_unit_after) ??
        (next ? yardsOf(next.distance_to_hole_before, next.distance_unit_before) : null),
      nextSg: nextSg === undefined || !Number.isFinite(nextSg) ? null : nextSg,
      nextKnown: next !== undefined,
      outcome,
      toPar: hole.score - hole.par,
      stratum: `${hole.par}|${driver ? 'driver' : 'non_driver'}`,
      penalty: (hole.penalty_strokes ?? 0) > 0 || tee.is_penalty === true || penaltyFromTee.has(key),
      lieAfter: lie || 'unknown',
      gir: hole.gir,
      driver,
    });
  }
  if (obs.length === 0) return null;

  const fairwayByStratum = new Map<string, number[]>();
  for (const o of obs) {
    if (o.outcome !== 'fairway') continue;
    const arr = fairwayByStratum.get(o.stratum) ?? [];
    arr.push(o.toPar);
    fairwayByStratum.set(o.stratum, arr);
  }
  const refOf = (stratum: string): number | null => {
    const arr = fairwayByStratum.get(stratum);
    return arr && arr.length >= TEE_MIN_STRATUM_FAIRWAYS ? mean(arr) : null;
  };

  const costs: Record<TeeOutcome, number[]> = { fairway: [], left: [], right: [] };
  const sides = {} as Record<TeeOutcome, TeeSideRow>;
  for (const side of ['fairway', 'left', 'right'] as const) {
    const rows = obs.filter((o) => o.outcome === side);
    for (const o of rows) {
      const ref = refOf(o.stratum);
      if (ref !== null) costs[side].push(o.toPar - ref);
    }
    const lieAfter: Record<string, number> = {};
    for (const o of rows) lieAfter[o.lieAfter] = (lieAfter[o.lieAfter] ?? 0) + 1;
    const girRows = rows.filter((o) => o.gir !== null);
    const sgRows = rows.filter((o) => o.nextSg !== null);
    const ydRows = rows.filter((o) => o.approachYards !== null && o.approachYards > 0);
    sides[side] = {
      side,
      shots: rows.length,
      to_par: rows.length ? round2(mean(rows.map((o) => o.toPar))!) : null,
      cost_vs_fairway: costs[side].length ? round2(mean(costs[side])!) : null,
      costed: costs[side].length,
      penalties: rows.filter((o) => o.penalty).length,
      lie_after: lieAfter,
      gir_pct: girRows.length ? round1((100 * girRows.filter((o) => o.gir).length) / girRows.length) : null,
      gir_n: girRows.length,
      driver_shots: rows.filter((o) => o.driver).length,
      next_shot_sg: sgRows.length ? round2(mean(sgRows.map((o) => o.nextSg as number))!) : null,
      next_shot_sg_n: sgRows.length,
      next_shot_sg_missing: rows.length - sgRows.length,
      approach_yards: ydRows.length ? Math.round(mean(ydRows.map((o) => o.approachYards as number))!) : null,
      approach_yards_n: ydRows.length,
    };
  }

  const clubChain: ClubChainRow[] = [];
  for (const par of [4, 5] as const) {
    for (const club of ['driver', 'non_driver'] as const) {
      const rows = obs.filter((o) => o.par === par && o.driver === (club === 'driver'));
      if (rows.length === 0) continue;
      const pct = (k: TeeOutcome) => round1((100 * rows.filter((o) => o.outcome === k).length) / rows.length);
      const yd = rows.filter((o) => o.approachYards !== null && o.approachYards > 0);
      const lieAfter: Record<string, number> = {};
      for (const o of rows) lieAfter[o.lieAfter] = (lieAfter[o.lieAfter] ?? 0) + 1;
      clubChain.push({
        par,
        club,
        tee_shots: rows.length,
        fairway_pct: pct('fairway'),
        left_pct: pct('left'),
        right_pct: pct('right'),
        approach_yards: yd.length ? Math.round(mean(yd.map((o) => o.approachYards as number))!) : null,
        approach_yards_n: yd.length,
        lie_after: lieAfter,
        to_par: round2(mean(rows.map((o) => o.toPar))!),
      });
    }
  }

  const holesPlayed = totalHoles(data.rounds);
  const l = sides.left.cost_vs_fairway;
  const r = sides.right.cost_vs_fairway;
  let worse: TeeSide | null = null;
  let better: TeeSide | null = null;
  if (l !== null && r !== null) {
    worse = l >= r ? 'left' : 'right';
    better = worse === 'left' ? 'right' : 'left';
  }
  const gap = worse && better ? (sides[worse].cost_vs_fairway ?? 0) - (sides[better].cost_vs_fairway ?? 0) : null;
  const z = worse && better ? welchZ(costs[worse], costs[better]) : null;
  const worsePer18 = worse && holesPlayed > 0 ? (sides[worse].shots * 18) / holesPlayed : 0;
  const cost = gap !== null && gap > 0 ? gap * worsePer18 : 0;
  const coverage = missed > 0 ? sideRecorded / missed : 0;

  const qualifies =
    data.rounds.length >= TEE_MIN_ROUNDS &&
    obs.length >= TEE_MIN_SHOTS &&
    costs.left.length >= TEE_MIN_PER_SIDE &&
    costs.right.length >= TEE_MIN_PER_SIDE &&
    coverage >= TEE_MIN_COVERAGE &&
    gap !== null &&
    gap >= TEE_MIN_SIDE_GAP &&
    z !== null &&
    z >= ANGLE_MIN_Z &&
    cost >= 0.3;

  return {
    window: windowOf(data.rounds),
    rounds: data.rounds.length,
    tee_shots: obs.length,
    missed,
    side_recorded: sideRecorded,
    coverage_pct: round1(coverage * 100),
    sides,
    worse,
    better,
    gap_per_miss: gap === null ? null : round2(gap),
    z: z === null ? null : round2(z),
    worse_per_18: round2(worsePer18),
    cost_per_round: round2(cost),
    excluded,
    club_chain: clubChain,
    sequence: worse ? teeSequence(obs, worse, dateOf) : null,
    examples: worse
      ? pickExamples(
          obs
            .filter((o) => o.outcome === worse)
            .map((o) => ({
              round_id: o.round_id,
              hole_number: o.hole_number,
              hole_id: o.hole_id,
              date: dateOf.get(o.round_id) ?? '',
              note: `par ${o.par}, ${o.driver ? 'driver' : 'non-driver'}, ${worse} miss into ${o.lieAfter}${o.approachYards !== null ? `, ${Math.round(o.approachYards)} yd left` : ''}, hole ${o.toPar > 0 ? '+' : ''}${o.toPar}${o.penalty ? ', penalty on the hole' : ''}`,
            })),
        )
      : [],
    qualifies,
  };
}

export interface TeeMissAggregate extends GeneratorAggregate {
  result: TeeMissResult & { worse: TeeSide; better: TeeSide };
  baseline: number | null;
}

export function toTeeMissAggregate(result: TeeMissResult | null, baseline: number | null): TeeMissAggregate | null {
  if (!result || !result.qualifies || !result.worse || !result.better) return null;
  const r = result as TeeMissResult & { worse: TeeSide; better: TeeSide };
  return {
    result: r,
    baseline,
    sampleN: r.sides[r.worse].costed + r.sides[r.better].costed,
    playerValue: r.sides[r.worse].cost_vs_fairway ?? 0,
  };
}

function lieSummary(row: TeeSideRow): string {
  const total = row.shots || 1;
  return Object.entries(row.lie_after)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([lie, n]) => `${Math.round((100 * n) / total)}% ${lie}`)
    .join(', ');
}

export const TEE_MISS_DEFINITION =
  'Miss cost = hole score to par after a tee miss minus the mean score to par on your fairway holes of the same par and driver/non-driver (≥ 5 fairway holes as reference). ' +
  'Next-shot SG = strokes gained of the shot after the tee shot. Tee shots exist only on par 4s and 5s; club is recorded only as driver / non-driver.';

function sgText(v: number | null, n: number): string {
  return v === null ? `n/a (n=${n})` : `${v > 0 ? '+' : ''}${v.toFixed(2)} (n=${n})`;
}

/** The costlier side's recorded path as a sequence basis (see {@link TeeMissResult.sequence}). */
export function teeSequenceBasis(r: TeeMissResult): DiagnosisBasis | null {
  if (!r.sequence) return null;
  const q = r.sequence;
  return {
    kind: 'shot_sequence',
    checked: [
      `${q.of} ${q.side} misses with the next shot recorded in order`,
      `miss side recorded on ${r.side_recorded} of ${r.missed} missed fairways`,
    ],
    sequence: {
      pattern: `${q.side} miss off the tee → next shot from the ${q.lie} → bogey or worse`,
      occurrences: q.occurrences,
      of: q.of,
      population: `${q.side} tee misses`,
      distinct_rounds: q.distinct_rounds,
      window: `${r.window.window_start} – ${r.window.window_end}`,
      examples: q.examples.map((e) => ({ round_id: e.round_id, hole_number: e.hole_number, hole_id: e.hole_id })),
    },
  };
}

export function composeTeeMiss(agg: TeeMissAggregate): ComposedContent {
  const r = agg.result;
  const seqBasis = teeSequenceBasis(r);
  const w = r.sides[r.worse];
  const b = r.sides[r.better];
  const wCost = w.cost_vs_fairway as number;
  const bCost = b.cost_vs_fairway as number;
  const unCosted = (['left', 'right'] as const).reduce((a, k) => a + r.sides[k].shots - r.sides[k].costed, 0);
  const receipts: AngleReceipts = {
    window: r.window,
    definition: TEE_MISS_DEFINITION,
    samples: {
      rounds: r.rounds,
      tee_shots: r.tee_shots,
      missed_fairways: r.missed,
      miss_side_recorded: r.side_recorded,
      [`${r.worse}_misses_costed`]: w.costed,
      [`${r.better}_misses_costed`]: b.costed,
    },
    exclusions: {
      tee_shots_other_outcome_or_no_side: r.excluded.other_outcome,
      tee_shots_without_scored_par4_or_5_hole: r.excluded.no_hole,
      misses_without_fairway_reference_in_stratum: unCosted,
      [`${r.worse}_misses_without_next_shot_sg`]: w.next_shot_sg_missing,
      [`${r.better}_misses_without_next_shot_sg`]: b.next_shot_sg_missing,
    },
    examples: r.examples,
  };
  const cf = attemptCounterfactual({
    strokesPerAttempt: r.gap_per_miss ?? 0,
    attemptsPerRound: r.worse_per_18,
    baseline: agg.baseline,
    weeks: 16,
  });
  const nextNotWorse = w.next_shot_sg !== null && b.next_shot_sg !== null && w.next_shot_sg >= b.next_shot_sg;
  const nextLine =
    `Strokes gained on the next shot: ${sgText(w.next_shot_sg, w.next_shot_sg_n)} after a ${r.worse} miss vs ${sgText(b.next_shot_sg, b.next_shot_sg_n)} after a ${r.better} miss` +
    `${nextNotWorse ? ', so the extra cost is not in the next shot' : ''}; a penalty was recorded on ${w.penalties} of ${w.shots} ${r.worse}-miss holes vs ${b.penalties} of ${b.shots}.`;
  const coverageNote = `Miss side recorded on ${r.side_recorded} of ${r.missed} missed fairways (${r.coverage_pct}%).`;
  const evidence: InsightEvidence & { counterfactual: CounterfactualProjection } = {
    metric: 'tee_miss_next_shot_cost',
    metric_label: `Strokes per ${r.worse} miss vs your fairway holes (same par and driver/non-driver)`,
    unit: 'strokes',
    polarity: 'lower_better',
    your_value: wCost,
    your_value_display: `+${wCost.toFixed(2)} per miss`,
    comparison_value: bCost,
    comparison_label: `Your ${r.better} misses (same comparison)`,
    comparison_source: 'your_baseline',
    sample_n: w.costed + b.costed,
    window_days: r.window.window_days,
    window_start: r.window.window_start,
    window_end: r.window.window_end,
    strokes_impact: impactOf(cf),
    strokes_impact_method: 'peer_delta',
    confidence: 0,
    confidence_factors: { sample_adequacy: Math.min((w.costed + b.costed) / 60, 1), recency: 1, variance: 0.5 },
    counterfactual: cf,
    detail: {
      angle: 'miss_cost_compass',
      compass: (['left', 'fairway', 'right'] as const).map((k) => r.sides[k]),
      club_chain: r.club_chain,
      selection_bias_note: SELECTION_BIAS_NOTE,
      receipts,
      worse_side: r.worse,
      better_side: r.better,
      sides: r.sides,
      gap_per_miss: r.gap_per_miss,
      z: r.z,
      worse_per_18: r.worse_per_18,
      tee_shots: r.tee_shots,
      coverage: { side_recorded: r.side_recorded, missed: r.missed, pct: r.coverage_pct },
      coverage_note: coverageNote,
      excluded: r.excluded,
      linked_area: 'approach',
      chain: ['tee', 'approach'],
      club_note: 'Club is recorded only as driver / non-driver; cost is compared within par × that split.',
      rounds: r.rounds,
    },
    diagnosis: {
      symptom: `A ${r.worse} miss costs ${wCost.toFixed(2)} strokes vs your fairway holes; a ${r.better} miss costs ${bCost.toFixed(2)}`,
      root_cause:
        `After a ${r.worse} miss the ball finishes ${lieSummary(w)}, greens in regulation ${pctText(w.gir_pct, w.gir_n)}, next-shot strokes gained ${sgText(w.next_shot_sg, w.next_shot_sg_n)}; ` +
        `after a ${r.better} miss ${lieSummary(b)}, ${pctText(b.gir_pct, b.gir_n)}, ${sgText(b.next_shot_sg, b.next_shot_sg_n)}. ` +
        `${w.penalties} of ${w.shots} ${r.worse} misses carried a penalty on the hole (vs ${b.penalties} of ${b.shots}). ` +
        `The record shows what follows the miss, not why the ball went ${r.worse}.`,
      causality_level: 'inferred_hypothesis',
      ...(seqBasis ? { basis: seqBasis } : {}),
      drivers: [
        { metric: 'tee_miss_next_shot_cost', label: `Strokes per ${r.worse} miss`, value: wCost, unit: 'strokes', sample_n: w.costed, source: 'golf_shots (tee) + golf_holes.score' },
        { metric: 'tee_miss_next_shot_cost', label: `Strokes per ${r.better} miss`, value: bCost, unit: 'strokes', sample_n: b.costed, source: 'golf_shots (tee) + golf_holes.score' },
      ],
      recommended_action: `Review the ${r.worse} misses in the examples: where the ball finished and what the next shot was. On the record, the ${r.worse} side is where the extra strokes show up.`,
      confidence_reason: '',
    },
  };
  const diag = evidence.diagnosis as Diagnosis;
  if (hasGeneratorSequenceEvidence({ ...diag, causality_level: 'observed_sequence' })) {
    const q = diag.basis!.sequence!;
    diag.causality_level = 'observed_sequence';
    // Lead with the recorded path and its counts, as root-cause.ts does.
    diag.root_cause = `${q.pattern}: ${q.occurrences} of ${q.of} ${q.population} over ${q.distinct_rounds} rounds. ${diag.root_cause}`;
  }
  return {
    title: `Your ${r.worse} tee misses cost more than your ${r.better} ones`,
    content:
      `A ${r.worse} miss costs you ${wCost.toFixed(2)} strokes on the hole compared with finding the fairway (same par and driver/non-driver), vs ${bCost.toFixed(2)} for a ${r.better} miss ` +
      `(${w.costed} ${r.worse} and ${b.costed} ${r.better} misses). ${nextLine} ` +
      `If your ${r.worse} misses cost what your ${r.better} ones do, that is about ${r.cost_per_round.toFixed(1)} strokes a round. ${coverageNote}`,
    priority: r.cost_per_round >= 0.5 ? 'medium' : 'low',
    framing: 'leak',
    signature: `tee_miss_cost:${r.worse}`,
    evidence,
  };
}

export class TeeMissCostGenerator extends BaseGenerator<TeeMissAggregate> {
  readonly name = 'TeeMissCostGenerator';
  readonly metricId: MetricId = 'sg_ott';
  readonly insightType = 'tee';
  readonly category: InsightCategory = 'tee';
  readonly minSampleN = TEE_MIN_PER_SIDE * 2;
  protected override readonly requiresStanding = false;

  protected override async isEnabled(): Promise<boolean> {
    return isFlagEnabled(INSIGHT_ANGLES_FLAG);
  }

  protected override signatureScope(): string {
    return 'tee_miss_cost:';
  }

  async aggregate(): Promise<TeeMissAggregate | null> {
    const data = await loadAngleData(this.playerId);
    return toTeeMissAggregate(computeTeeMiss(data), data.scoringBaseline);
  }

  composeContent(agg: TeeMissAggregate): ComposedContent {
    return composeTeeMiss(agg);
  }
}
