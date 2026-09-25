/**
 * Insight angle 1 — lie-adjusted approach (2026-09-25, flag
 * `coachhelm_insight_angles_v1`).
 *
 * Question: does the ROUGH cost this player more than the lie itself should,
 * and if the rough is costly, is that because they get there too often (a
 * tee cause) or because they play badly from it (an approach cause)?
 *
 * Population: approach shots (`shot_type='approach'`, not penalties) from a
 * raw `lie_before` of fairway, rough or sand, bucketed into the context-
 * narrowing bands (50–125 / 125–175 / 175+ yd, `bucketApproachDistance` with
 * the row's own unit). Excluded, and counted in `detail.excluded`:
 *   - par-3 tee shots (recorded as approaches with `lie_before='tee'`) — a tee
 *     is neither fairway nor rough, so they are outside this comparison;
 *   - `lie_before='other'` (the SG port treats it as fairway; here it would
 *     pollute the fairway side);
 *   - 175+ yd approaches on par 5s (mostly lay-ups, the same exclusion the
 *     context narrowing applies).
 *
 * Measure: per-shot strokes gained (the `calculate_round_strokes_gained` port
 * with the player's SG scale). SG already prices in what the rough costs a
 * Tour player at that distance, so within a band a player who is equally good
 * from both lies shows the same SG from each. `rough_excess` = the rough-
 * weighted, band-held difference `SG(fairway) − SG(rough)` in strokes per
 * rough approach. Benchmark: 0 — the Tour baseline in
 * `STROKES_GAINED_BENCHMARKS` (documented Tour reference, not a peer number).
 * GIR % and proximity from each lie are carried for display only.
 *
 * Two causes, each with its own gate; the row names the costlier qualifying
 * one:
 *   - `rough_execution` (category `approach`): rough_excess ≥ 0.10 and
 *     one-sided z ≥ 1.645. Cost/round = rough approaches per 18 × excess.
 *   - `fairway_exposure` (category `tee`, links tee → approach): fairway %
 *     at least 8 points under the TEAMMATES' median (≥ 3 peers, source
 *     `team_avg`) with z ≥ 1.645. Cost/round = missed-fairway gap per 18 ×
 *     the Tour rough-vs-fairway penalty at the player's own rough-approach
 *     distances (estimated: a missed fairway is not always a rough lie).
 * Either cost must reach the 0.3 strokes/round projection floor.
 */

import { BaseGenerator } from '@/lib/coachhelm/v3/engine/generator-base';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import { bucketApproachDistance, type ApproachBucket } from '@/lib/coachhelm/v3/engine/shot-source';
import { NARROW_BAND_LABEL } from '@/lib/coachhelm/v3/engine/context-narrowing';
import { getExpectedStrokes } from '@/lib/utils/golf-stats-calculator-shots';
import type { CounterfactualProjection } from '@/lib/coachhelm/v3/counterfactual/types';
import type { ComposedContent, GeneratorAggregate, InsightCategory, MetricId } from '@/lib/coachhelm/v3/engine/types';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import {
  ANGLE_MIN_Z,
  INSIGHT_ANGLES_FLAG,
  attemptCounterfactual,
  feetOf,
  holeKey,
  impactOf,
  indexHoles,
  mean,
  median,
  primaryTeamId,
  round1,
  round2,
  shotSgById,
  totalHoles,
  variance,
  windowOf,
  yardsOf,
  pctText,
  pickExamples,
  type AngleData,
  type AngleReceipts,
  type AngleWindow,
  type PeerRound,
  type ReceiptExample,
} from './angle-data';
import { loadAngleData, loadTeamPeerRounds } from './load-angle-data';

export const LIE_BANDS: readonly ApproachBucket[] = ['50_125ft', '125_175ft', '175_plus_ft'];
export type LieKey = 'fairway' | 'rough' | 'sand';

/** Per band, per lie: shots needed on BOTH fairway and rough for the band to count. */
export const LIE_MIN_PER_SIDE = 8;
/** Rough approaches (in qualifying bands) needed at all. */
export const LIE_MIN_ROUGH_SHOTS = 20;
export const LIE_MIN_ROUNDS = 5;
/** Extra strokes per rough approach beyond the Tour lie penalty to call it a leak. */
export const LIE_MIN_EXCESS = 0.1;
/** Fairway-% shortfall vs teammates' median to call exposure a leak (points). */
export const FAIRWAY_MIN_GAP_PP = 8;
export const FAIRWAY_MIN_HOLES = 40;
export const PEER_MIN_PLAYERS = 3;
export const PEER_MIN_ROUNDS = 5;
export const PEER_ROUND_LIMIT = 40;
/** Displayed only when sand has at least this many shots in a band. */
export const SAND_MIN_SHOTS = 8;

export interface LieCell {
  n: number;
  gir_pct: number | null;
  /** Mean proximity (feet) over approaches that finished on the green (holed = 0). */
  proximity_ft: number | null;
  /** Mean per-shot SG (strokes), null without SG. */
  sg_per_shot: number | null;
}

export interface LieBandRow {
  band: ApproachBucket;
  label: string;
  qualifies: boolean;
  fairway: LieCell;
  rough: LieCell;
  sand: LieCell | null;
}

export type LieCause = 'rough_execution' | 'fairway_exposure';

export interface LieApproachResult {
  rounds: number;
  window: AngleWindow;
  bands: LieBandRow[];
  rough_shots: number;
  fairway_shots: number;
  rough_per_18: number;
  /** Every rough approach (any band) per 18 — the exposure a missed fairway creates. */
  rough_all_per_18: number;
  /** Band-held SG(fairway) − SG(rough), strokes per rough approach. */
  rough_excess: number | null;
  rough_excess_z: number | null;
  rough_cost_per_round: number;
  fairway_pct: number | null;
  fairway_holes: number;
  fairway_holes_per_18: number;
  peer_fairway_pct: number | null;
  peer_n: number;
  fairway_z: number | null;
  /** Tour rough-vs-fairway expected-strokes gap at the player's rough distances. */
  tour_rough_penalty: number | null;
  exposure_cost_per_round: number;
  cause: LieCause | null;
  excluded: { par3_tee: number; other_lie: number; par5_long: number; no_band: number };
  /** Fairway/rough approaches in the bands whose per-shot SG could not be computed (left out of the SG test, not zeroed). */
  sg_missing: number;
  examples: ReceiptExample[];
}

interface ShotObs {
  round_id: string;
  hole_number: number;
  date: string;
  finish: string;
  gir: boolean;
  prox: number | null;
  sg: number | null;
  yards: number;
}

function cell(obs: readonly ShotObs[]): LieCell {
  const prox = obs.map((o) => o.prox).filter((p): p is number => p !== null);
  const sg = obs.map((o) => o.sg).filter((s): s is number => s !== null);
  return {
    n: obs.length,
    gir_pct: obs.length ? round1((100 * obs.filter((o) => o.gir).length) / obs.length) : null,
    proximity_ft: prox.length ? round1(mean(prox)!) : null,
    sg_per_shot: sg.length ? round2(mean(sg)!) : null,
  };
}

function normLie(raw: string | null): LieKey | 'tee' | 'other' | null {
  switch ((raw ?? '').toLowerCase()) {
    case 'fairway':
      return 'fairway';
    case 'rough':
    case 'primary_rough':
      return 'rough';
    case 'sand':
    case 'bunker':
    case 'fairway_bunker':
    case 'greenside_bunker':
      return 'sand';
    case 'tee':
    case 'teebox':
      return 'tee';
    case '':
      return null;
    default:
      return 'other';
  }
}

const ON_GREEN = new Set(['green', 'hole', 'holed', 'gir']);

/** Median fairway % across teammates (≥ PEER_MIN_ROUNDS countable rounds, newest 40), excluding the player. */
export function peerFairwayMedian(
  peers: readonly PeerRound[],
  playerId: string,
): { median: number | null; n: number } {
  const byPlayer = new Map<string, PeerRound[]>();
  for (const r of peers) {
    if (r.player_id === playerId) continue;
    const arr = byPlayer.get(r.player_id) ?? [];
    arr.push(r);
    byPlayer.set(r.player_id, arr);
  }
  const pcts: number[] = [];
  for (const rows of byPlayer.values()) {
    const recent = [...rows].sort((a, b) => b.date.localeCompare(a.date)).slice(0, PEER_ROUND_LIMIT);
    if (recent.length < PEER_MIN_ROUNDS) continue;
    let hit = 0;
    let tot = 0;
    for (const r of recent) {
      if (r.fairways_hit === null || r.fairways_total === null || r.fairways_total <= 0) continue;
      hit += r.fairways_hit;
      tot += r.fairways_total;
    }
    if (tot >= FAIRWAY_MIN_HOLES) pcts.push((100 * hit) / tot);
  }
  if (pcts.length < PEER_MIN_PLAYERS) return { median: null, n: pcts.length };
  return { median: round1(median(pcts)!), n: pcts.length };
}

/** Pure compute (see file header). Returns null when there is nothing to read. */
export function computeLieApproach(data: AngleData, peers: readonly PeerRound[] | null): LieApproachResult | null {
  if (data.rounds.length === 0) return null;
  const roundIds = new Set(data.rounds.map((r) => r.id));
  const dateOf = new Map(data.rounds.map((r) => [r.id, r.date]));
  const { byKey, byId } = indexHoles(data.holes);
  const sgById = shotSgById(data);
  const excluded = { par3_tee: 0, other_lie: 0, par5_long: 0, no_band: 0 };
  const obs = new Map<string, ShotObs[]>(); // `${band}|${lie}`

  for (const s of data.shots) {
    if (!roundIds.has(s.round_id) || s.shot_type !== 'approach' || s.is_penalty === true) continue;
    const lie = normLie(s.lie_before);
    if (lie === 'tee') {
      excluded.par3_tee += 1;
      continue;
    }
    if (lie === 'other' || lie === null) {
      excluded.other_lie += 1;
      continue;
    }
    const raw = s.distance_to_hole_before;
    const band = raw === null ? null : bucketApproachDistance(Number(raw), s.distance_unit_before);
    if (!band) {
      excluded.no_band += 1;
      continue;
    }
    const hole = (s.hole_id ? byId.get(s.hole_id) : undefined) ?? byKey.get(holeKey(s.round_id, s.hole_number));
    if (band === '175_plus_ft' && hole?.par === 5) {
      excluded.par5_long += 1;
      continue;
    }
    const result = (s.result ?? '').toLowerCase();
    const holed = result === 'hole' || result === 'holed';
    const gir = holed || (s.lie_after ?? '').toLowerCase() === 'green' || ON_GREEN.has(result);
    const prox = holed ? 0 : gir ? feetOf(s.distance_to_hole_after, s.distance_unit_after) : null;
    const yards = yardsOf(raw, s.distance_unit_before) ?? 0;
    const key = `${band}|${lie}`;
    const arr = obs.get(key) ?? [];
    arr.push({
      round_id: s.round_id,
      hole_number: s.hole_number ?? -1,
      date: dateOf.get(s.round_id) ?? '',
      finish: holed ? 'holed' : gir ? `green${prox !== null ? `, ${Math.round(prox)} ft` : ''}` : ((s.lie_after ?? s.result ?? 'not recorded').toLowerCase()),
      gir,
      prox,
      sg: sgById.get(s.id) ?? null,
      yards,
    });
    obs.set(key, arr);
  }

  const bands: LieBandRow[] = [];
  let wSum = 0;
  let diffSum = 0;
  let varSum = 0;
  const qualifyingRough: ShotObs[] = [];
  for (const band of LIE_BANDS) {
    const fw = obs.get(`${band}|fairway`) ?? [];
    const ro = obs.get(`${band}|rough`) ?? [];
    const sa = obs.get(`${band}|sand`) ?? [];
    const fwSg = fw.map((o) => o.sg).filter((x): x is number => x !== null);
    const roSg = ro.map((o) => o.sg).filter((x): x is number => x !== null);
    const qualifies = fwSg.length >= LIE_MIN_PER_SIDE && roSg.length >= LIE_MIN_PER_SIDE;
    bands.push({
      band,
      label: NARROW_BAND_LABEL[band],
      qualifies,
      fairway: cell(fw),
      rough: cell(ro),
      sand: sa.length >= SAND_MIN_SHOTS ? cell(sa) : null,
    });
    if (!qualifies) continue;
    const w = roSg.length;
    wSum += w;
    diffSum += w * (mean(fwSg)! - mean(roSg)!);
    varSum += w * w * ((variance(fwSg) ?? 0) / fwSg.length + (variance(roSg) ?? 0) / roSg.length);
    qualifyingRough.push(...ro.filter((o) => o.sg !== null));
  }

  const holesPlayed = totalHoles(data.rounds);
  const roughShots = qualifyingRough.length;
  const fairwayShots = bands.filter((b) => b.qualifies).reduce((a, b) => a + b.fairway.n, 0);
  const roughExcess = wSum > 0 ? diffSum / wSum : null;
  const roughSe = wSum > 0 ? Math.sqrt(varSum) / wSum : null;
  const roughZ = roughExcess !== null && roughSe && roughSe > 0 ? roughExcess / roughSe : null;
  const roughPer18 = holesPlayed > 0 ? (roughShots * 18) / holesPlayed : 0;
  const roughCost = roughExcess !== null && roughExcess > 0 ? roughPer18 * roughExcess : 0;

  // Fairway exposure (par 4/5 holes with a recorded fairway result).
  const fwHoles = data.holes.filter(
    (h) => roundIds.has(h.round_id) && (h.par === 4 || h.par === 5) && h.fairway_hit !== null,
  );
  const fwHit = fwHoles.filter((h) => h.fairway_hit === true).length;
  const fairwayPct = fwHoles.length ? round1((100 * fwHit) / fwHoles.length) : null;
  const fwHolesPer18 = holesPlayed > 0 ? (fwHoles.length * 18) / holesPlayed : 0;
  const peer = peers ? peerFairwayMedian(peers, data.playerId) : { median: null, n: 0 };

  // Tour penalty for being in the rough at this player's own rough distances.
  const roughAll = LIE_BANDS.flatMap((b) => obs.get(`${b}|rough`) ?? []);
  const penalties = roughAll
    .filter((o) => o.yards > 0)
    .map((o) => (getExpectedStrokes('rough', o.yards, undefined, data.scale) - getExpectedStrokes('fairway', o.yards, undefined, data.scale)));
  const tourPenalty = penalties.length ? round2(mean(penalties)!) : null;

  let fairwayZ: number | null = null;
  let exposureCost = 0;
  if (fairwayPct !== null && peer.median !== null && fwHoles.length > 0) {
    const p = peer.median / 100;
    const se = Math.sqrt((p * (1 - p)) / fwHoles.length);
    fairwayZ = se > 0 ? (peer.median - fairwayPct) / 100 / se : null;
    const gap = (peer.median - fairwayPct) / 100;
    if (gap > 0 && tourPenalty !== null && tourPenalty > 0) exposureCost = gap * fwHolesPer18 * tourPenalty;
  }

  const rounds = data.rounds.length;
  const executionQualifies =
    rounds >= LIE_MIN_ROUNDS &&
    roughShots >= LIE_MIN_ROUGH_SHOTS &&
    roughExcess !== null &&
    roughExcess >= LIE_MIN_EXCESS &&
    roughZ !== null &&
    roughZ >= ANGLE_MIN_Z &&
    roughCost >= 0.3;
  const exposureQualifies =
    rounds >= LIE_MIN_ROUNDS &&
    fwHoles.length >= FAIRWAY_MIN_HOLES &&
    fairwayPct !== null &&
    peer.median !== null &&
    peer.median - fairwayPct >= FAIRWAY_MIN_GAP_PP &&
    fairwayZ !== null &&
    fairwayZ >= ANGLE_MIN_Z &&
    exposureCost >= 0.3;
  let cause: LieCause | null = null;
  if (executionQualifies && exposureQualifies) cause = roughCost >= exposureCost ? 'rough_execution' : 'fairway_exposure';
  else if (executionQualifies) cause = 'rough_execution';
  else if (exposureQualifies) cause = 'fairway_exposure';

  return {
    rounds,
    window: windowOf(data.rounds),
    bands,
    rough_shots: roughShots,
    fairway_shots: fairwayShots,
    rough_per_18: round2(roughPer18),
    rough_all_per_18: round2(holesPlayed > 0 ? (roughAll.length * 18) / holesPlayed : 0),
    rough_excess: roughExcess === null ? null : round2(roughExcess),
    rough_excess_z: roughZ === null ? null : round2(roughZ),
    rough_cost_per_round: round2(roughCost),
    fairway_pct: fairwayPct,
    fairway_holes: fwHoles.length,
    fairway_holes_per_18: round2(fwHolesPer18),
    peer_fairway_pct: peer.median,
    peer_n: peer.n,
    fairway_z: fairwayZ === null ? null : round2(fairwayZ),
    tour_rough_penalty: tourPenalty,
    exposure_cost_per_round: round2(exposureCost),
    cause,
    excluded,
    sg_missing: LIE_BANDS.reduce(
      (a, b) => a + [...(obs.get(`${b}|fairway`) ?? []), ...(obs.get(`${b}|rough`) ?? [])].filter((o) => o.sg === null).length,
      0,
    ),
    examples: pickExamples(
      (cause === 'rough_execution' ? qualifyingRough : roughAll).map((o) => ({
        round_id: o.round_id,
        hole_number: o.hole_number,
        date: o.date,
        note: `approach from the rough, ${Math.round(o.yards)} yd, finished ${o.finish}${o.sg !== null ? `, SG ${o.sg > 0 ? '+' : ''}${o.sg.toFixed(2)}` : ''}`,
      })),
    ),
  };
}

export interface LieApproachAggregate extends GeneratorAggregate {
  result: LieApproachResult & { cause: LieCause };
  baseline: number | null;
}

/** Aggregate for a computed result (null when no cause qualified). */
export function toLieAggregate(result: LieApproachResult | null, baseline: number | null): LieApproachAggregate | null {
  if (!result || !result.cause) return null;
  const r = result as LieApproachResult & { cause: LieCause };
  return {
    result: r,
    baseline,
    sampleN: r.cause === 'rough_execution' ? r.rough_shots : r.fairway_holes,
    playerValue: r.cause === 'rough_execution' ? (r.rough_excess ?? 0) : (r.fairway_pct ?? 0),
  };
}

function bandText(b: LieBandRow): string {
  const f = b.fairway;
  const r = b.rough;
  return `${b.label}: greens hit from the rough ${pctText(r.gir_pct, r.n)} vs from the fairway ${pctText(f.gir_pct, f.n)}`;
}

/** Compose title/content/evidence (pure, exported for tests and the dry run). */
export function composeLieApproach(agg: LieApproachAggregate): ComposedContent & { category: InsightCategory } {
  const r = agg.result;
  const qualifying = r.bands.filter((b) => b.qualifies);
  const excludedNote =
    `Par-3 tee shots (${r.excluded.par3_tee}, recorded as approaches from the tee) and approaches from other lies ` +
    `(${r.excluded.other_lie}) are left out; so are 175+ yd approaches on par 5s (${r.excluded.par5_long}, mostly lay-ups).`;
  const common = {
    sample_n: agg.sampleN,
    window_days: r.window.window_days,
    window_start: r.window.window_start,
    window_end: r.window.window_end,
    strokes_impact_method: 'sg_baseline' as const,
    confidence: 0,
  };
  const receipts: AngleReceipts = {
    window: r.window,
    definition:
      r.cause === 'rough_execution'
        ? 'Extra strokes per rough approach = rough-weighted, band-held mean per-shot SG from the fairway minus from the rough, in bands with 8+ fairway and 8+ rough approaches (50–125 / 125–175 / 175+ yd). SG already charges the Tour penalty for the lie; 0 = Tour-normal.'
        : 'Fairways hit % = fairway hits ÷ par-4/5 holes with a recorded fairway result, compared with the median of teammates (5+ countable rounds, 3+ teammates). Cost = fairway gap × fairway holes per 18 × the Tour rough-vs-fairway penalty at your rough-approach distances (estimated).',
    samples: {
      rounds: r.rounds,
      rough_approaches_in_tested_bands: r.rough_shots,
      fairway_approaches_in_tested_bands: r.fairway_shots,
      par45_holes_with_fairway_result: r.fairway_holes,
      teammates: r.peer_n,
    },
    exclusions: {
      par3_tee_shots: r.excluded.par3_tee,
      approaches_from_other_lies: r.excluded.other_lie,
      par5_approaches_175_plus: r.excluded.par5_long,
      approaches_without_distance_band: r.excluded.no_band,
      approaches_without_computable_sg: r.sg_missing,
    },
    examples: r.examples,
  };
  const detail = {
    angle: 'lie_adjusted_approach',
    receipts,
    cause: r.cause,
    linked_area: r.cause === 'fairway_exposure' ? 'approach' : 'tee',
    chain: ['tee', 'approach'],
    bands: r.bands,
    rough_shots: r.rough_shots,
    fairway_shots: r.fairway_shots,
    rough_per_18: r.rough_per_18,
    rough_all_per_18: r.rough_all_per_18,
    rough_excess: r.rough_excess,
    rough_excess_z: r.rough_excess_z,
    rough_cost_per_round: r.rough_cost_per_round,
    fairway_pct: r.fairway_pct,
    fairway_holes: r.fairway_holes,
    peer_fairway_pct: r.peer_fairway_pct,
    peer_n: r.peer_n,
    fairway_z: r.fairway_z,
    tour_rough_penalty: r.tour_rough_penalty,
    exposure_cost_per_round: r.exposure_cost_per_round,
    excluded: r.excluded,
    excluded_note: excludedNote,
    rounds: r.rounds,
    benchmark_note:
      'Rough cost is measured in strokes gained, which already charges the Tour penalty for a rough lie at that distance (STROKES_GAINED_BENCHMARKS); 0 extra strokes = Tour-normal. Fairway % is compared with the median of teammates with 5+ countable rounds.',
  };

  if (r.cause === 'rough_execution') {
    const excess = r.rough_excess ?? 0;
    const cf = attemptCounterfactual({
      strokesPerAttempt: excess,
      attemptsPerRound: r.rough_per_18,
      baseline: agg.baseline,
      weeks: 12,
    });
    const fwLine =
      r.fairway_pct !== null && r.peer_fairway_pct !== null
        ? ` You hit ${r.fairway_pct}% of fairways (teammates' median ${r.peer_fairway_pct}%), so the leak is the shot from the rough, not how often you get there.`
        : '';
    const evidence: InsightEvidence & { counterfactual: CounterfactualProjection } = {
      ...common,
      metric: 'approach_rough_lie_penalty',
      metric_label: 'Extra strokes lost per approach from the rough (beyond the Tour lie penalty)',
      unit: 'strokes',
      polarity: 'lower_better',
      your_value: excess,
      your_value_display: `${excess.toFixed(2)} strokes`,
      comparison_value: 0,
      comparison_label: 'Tour lie-adjusted baseline (rough penalty already priced in)',
      comparison_source: 'pga_baseline',
      strokes_impact: impactOf(cf),
      confidence_factors: { sample_adequacy: Math.min(r.rough_shots / 60, 1), recency: 1, variance: 0.5 },
      counterfactual: cf,
      detail,
      diagnosis: {
        symptom: `From the rough you lose ${excess.toFixed(2)} strokes per approach more than a Tour player would from the same lie and distance`,
        root_cause:
          `Band by band, strokes gained from the rough trail the fairway by more than the lie explains (z=${(r.rough_excess_z ?? 0).toFixed(1)} over ${r.rough_shots} rough and ${r.fairway_shots} fairway approaches). ` +
          `The record shows where the strokes are lost, not why.`,
        causality_level: 'inferred_hypothesis',
        drivers: [
          { metric: 'approach_rough_lie_penalty', label: 'Extra strokes per rough approach', value: excess, unit: 'strokes', sample_n: r.rough_shots, source: 'golf_shots (per-shot SG, lie-adjusted)' },
          { metric: 'rough_approaches_per_18', label: 'Rough approaches per 18', value: r.rough_per_18, unit: 'count', sample_n: r.rounds, source: 'golf_shots' },
        ],
        recommended_action: `Practice approaches from the rough at ${qualifying.map((b) => b.label).join(' and ')}, scored on greens hit and leave distance.`,
        confidence_reason: '',
      },
    };
    return {
      category: 'approach',
      title: `Rough approaches cost you more than the lie explains`,
      content:
        `${qualifying.map(bandText).join('; ')}. After charging what the rough costs a Tour player at those distances, you still lose an extra ${excess.toFixed(2)} strokes per rough approach, about ${r.rough_cost_per_round.toFixed(1)} strokes a round over your ${r.rough_per_18.toFixed(1)} rough approaches per 18.${fwLine} ${excludedNote}`,
      priority: r.rough_cost_per_round >= 0.5 ? 'medium' : 'low',
      framing: 'leak',
      signature: 'lie_approach:rough_execution',
      evidence,
    };
  }

  const cf = attemptCounterfactual({
    strokesPerAttempt: ((r.peer_fairway_pct ?? 0) - (r.fairway_pct ?? 0)) / 100 * (r.tour_rough_penalty ?? 0),
    attemptsPerRound: r.fairway_holes_per_18,
    baseline: agg.baseline,
    weeks: 24,
  });
  const evidence: InsightEvidence & { counterfactual: CounterfactualProjection } = {
    ...common,
    metric: 'tee_fairway_rough_exposure',
    metric_label: 'Fairways hit % (what sends approaches into the rough)',
    unit: 'percent',
    polarity: 'higher_better',
    your_value: r.fairway_pct ?? 0,
    your_value_display: `${Math.round(r.fairway_pct ?? 0)}%`,
    comparison_value: r.peer_fairway_pct ?? 0,
    comparison_label: `Teammates' median fairways hit % (${r.peer_n} players)`,
    comparison_source: 'team_avg',
    strokes_impact: impactOf(cf),
    estimated: true,
    confidence_factors: { sample_adequacy: Math.min(r.fairway_holes / 150, 1), recency: 1, variance: 0.5 },
    counterfactual: cf,
    detail,
    diagnosis: {
      symptom: `${r.fairway_pct}% fairways hit vs a teammates' median of ${r.peer_fairway_pct}%`,
      root_cause:
        `Missed fairways put ${r.rough_all_per_18.toFixed(1)} approaches a round in the rough, where a Tour player expects to lose about ${(r.tour_rough_penalty ?? 0).toFixed(2)} strokes per shot at your distances. ` +
        (r.rough_excess !== null
          ? `From the rough itself you are ${r.rough_excess > 0 ? `${r.rough_excess.toFixed(2)} strokes worse per shot than the lie explains, which is not a clear leak on its own` : 'no worse than the lie explains'}, so the cost starts at the tee.`
          : 'Too few rough and fairway approaches in the same band to test play from the rough itself.'),
      causality_level: 'inferred_hypothesis',
      drivers: [
        { metric: 'tee_fairway_rough_exposure', label: 'Fairways hit %', value: r.fairway_pct ?? 0, unit: 'percent', sample_n: r.fairway_holes, source: 'golf_holes.fairway_hit' },
        { metric: 'rough_approaches_per_18', label: 'Rough approaches per 18', value: r.rough_all_per_18, unit: 'count', sample_n: r.rounds, source: 'golf_shots' },
      ],
      recommended_action: 'Work on keeping tee shots in play on par 4s and 5s; judge it by fairways hit, not distance.',
      confidence_reason: '',
    },
  };
  return {
    category: 'tee',
    title: `Missed fairways are feeding rough approaches`,
    content:
      `You hit ${r.fairway_pct}% of fairways vs a teammates' median of ${r.peer_fairway_pct}% (${r.fairway_holes} par-4/5 holes), which leaves ${r.rough_all_per_18.toFixed(1)} approaches a round in the rough. ` +
      `At your distances the rough costs even a Tour player about ${(r.tour_rough_penalty ?? 0).toFixed(2)} strokes per shot, so closing the fairway gap is worth an estimated ${r.exposure_cost_per_round.toFixed(1)} strokes a round. ${excludedNote}`,
    priority: r.exposure_cost_per_round >= 0.5 ? 'medium' : 'low',
    framing: 'leak',
    signature: 'lie_approach:fairway_exposure',
    evidence,
  };
}

export class LieApproachGenerator extends BaseGenerator<LieApproachAggregate> {
  readonly name = 'LieApproachGenerator';
  /** Closest canonical id; the row's own metric is an alias (no standing, no lookup). */
  readonly metricId: MetricId = 'sg_approach';
  readonly insightType = 'approach';
  readonly minSampleN = LIE_MIN_PER_SIDE;
  protected override readonly requiresStanding = false;

  /** Set by composeContent (which runs before the write): `tee` for the
   *  fairway-exposure cause, `approach` for rough execution. */
  private composedCategory: InsightCategory = 'approach';
  get category(): InsightCategory {
    return this.composedCategory;
  }

  protected override async isEnabled(): Promise<boolean> {
    return isFlagEnabled(INSIGHT_ANGLES_FLAG);
  }

  protected override signatureScope(): string {
    return 'lie_approach:';
  }

  async aggregate(): Promise<LieApproachAggregate | null> {
    const data = await loadAngleData(this.playerId);
    const team = primaryTeamId(data.rounds);
    const peers = team ? await loadTeamPeerRounds(team) : null;
    return toLieAggregate(computeLieApproach(data, peers), data.scoringBaseline);
  }

  composeContent(agg: LieApproachAggregate): ComposedContent {
    const { category, ...composed } = composeLieApproach(agg);
    this.composedCategory = category;
    return composed;
  }
}
