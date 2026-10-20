/**
 * v3 PressureGapGenerator (W24).
 *
 * Aggregates the player's avg score-to-par on tournament and qualifier
 * rounds (plus the legacy 'qualifying' spelling) vs practice rounds over the
 * last 90 days, countable rounds only, each on an 18-hole basis (the shared
 * rule in src/lib/golf/metrics/pressure-gap.ts). Positive delta = player
 * scores higher (worse) under competitive pressure.
 *
 * Standing populated by `refresh_player_standing_round_metrics` (W24-prep
 * companion RPC). PGA reference = 0.5 strokes per Research doc §9
 * (Hickman & Metz; college 2-5 typical).
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { fromUntyped } from '@/lib/supabase/untyped';
import { BaseGenerator } from '@/lib/coachhelm/v3/engine/generator-base';
import { loadCompletedHoles, classifyHole } from '@/lib/coachhelm/v3/engine/hole-diagnosis';
import { isCountableRound } from '@/lib/golf/round-countable';
import { loadPlayerCohort } from '@/lib/coachhelm/v3/counterfactual/player-cohort-loader';
import { TOUR_STANDARDS, tourFor } from '@/lib/golf/benchmarks/tour';
import { tCritical95, welchStandardError } from '@/lib/coachhelm/v3/stats/intervals';
import {
  computePressureGap,
  splitPressureRounds,
  PRACTICE_ROUND_TYPE,
  PRESSURE_ROUND_TYPES,
} from '@/lib/golf/metrics/pressure-gap';
import type {
  ComposedContent,
  GeneratorAggregate,
  InsightCategory,
  MetricId,
} from '@/lib/coachhelm/v3/engine/types';

interface PressureGapAggregate extends GeneratorAggregate {
  practice_avg: number;
  competitive_avg: number;
  practice_count: number;
  competitive_count: number;
  /**
   * Decomposition, every component on ONE scale: competitive − practice, per
   * 18 holes played. The old mix (pp of holes for doubles/3-putts, per round
   * for penalties/opening holes) sorted a "+11 pp" against a "+2.0 per round",
   * so penalties could never be named the driver (audit row 14). The
   * components overlap (a penalty hole can also be a double) and do not sum
   * to the gap.
   */
  /** Extra double-or-worse holes per 18. */
  doubles_per18_delta: number;
  /** Extra 3-putt-or-worse holes per 18. */
  three_putts_per18_delta: number;
  /** Extra penalty strokes per 18. */
  penalty_per18_delta: number;
  /** Extra strokes over par on holes 1-3 (one round's opening three holes). */
  opening3_strokes_delta: number;
  /** Welch standard error of the gap (18-hole to-par, both sides). */
  gap_se: number;
  /** Half-width of the 95% band around zero: t(df) × SE. */
  noise_band: number;
  /** Cohort average pressure gap (standing.level_avg), null at cold-start. */
  /** The team's Tour pressure gap (strokes) and its tour's name (Q-88). */
  tour_gap: number;
  tour_label: string;
  window_start: string | null;
  window_end: string | null;
  /** SV-1 duck-typed dispersion (DispersionSignals): per-round score-to-par stddev. */
  stddev?: number;
  /** SV-1 scale for the stddev → variance-confidence map. */
  stddev_scale?: number;
  /** SV-1 contributing competitive round dates — required (with stddev) for the
   *  base's computeMeasuredFactors to return factors_measured:true. */
  round_dates?: string[];
}

/**
 * Minimum rounds required in EACH bucket before a pressure gap is meaningful.
 * A delta off a single round (e.g. n=1 practice → a fake "+2.3 gap") is noise,
 * not a pressure signal — both the practice and competitive averages need a few
 * rounds to stabilise (Research doc §9; audit P2a). 3 is the floor.
 *
 * pg-2 (unify SQL ↔ TS gate): this is the CANONICAL per-bucket floor. The
 * standing RPC `refresh_player_standing_round_metrics` currently creates a
 * standing row at `>0` rounds per bucket (>=1 both sides), which is looser than
 * this gate. The generator already returns null below this floor (so it never
 * emits at 1+1 rounds), but the two gates should match.
 * CROSS-FILE DEPENDENCY (standing-cron owner): raise the RPC's HAVING from
 * `COUNT(...) > 0` to `COUNT(...) >= 3` in both buckets so a standing row only
 * exists once the pressure gap is itself meaningful.
 */
export const MIN_ROUNDS_PER_BUCKET = 3;


export class PressureGapGenerator extends BaseGenerator<PressureGapAggregate> {
  readonly name = 'PressureGapGenerator';
  readonly insightType = 'pressure_gap';
  readonly category: InsightCategory = 'pressure';
  readonly minSampleN = 5; // combined rounds total

  readonly metricId: MetricId = 'practice_tournament_delta';

  protected override signatureScope(): string {
    return 'pressure_gap:practice_vs_tournament';
  }

  async aggregate(): Promise<PressureGapAggregate | null> {
    const supabase = createAdminClient();
    // Pull last 90 days of completed rounds for this player; bucket in TS.
    const since = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
    const { data, error } = await fromUntyped(supabase, 'golf_rounds')
      .select('id, round_type, score_to_par, round_date, holes_played, total_score, front_nine, back_nine, total_putts')
      .eq('player_id', this.playerId)
      .eq('is_test', false)
      .eq('status', 'completed')
      .gte('round_date', since) as {
        data: Array<{
          id: string;
          round_type: string | null;
          score_to_par: number | null;
          round_date: string | null;
          holes_played: number | null;
          total_score: number | null;
          front_nine: number | null;
          back_nine: number | null;
          total_putts: number | null;
        }> | null;
        error: { message: string } | null;
      };
    if (error) throw new Error(`pressure-gap aggregate query failed: ${error.message}`);
    if (!data) return null;
    // NUM-24: countable rounds only, and the shared pressure-gap rule
    // (src/lib/golf/metrics/pressure-gap.ts): each round's to par on an
    // 18-hole basis, and the legacy 'qualifying' spelling counts as pressure.
    // Standing's SQL (refresh_player_standing_round_metrics) uses the same rule.
    const rounds = data.filter(isCountableRound);

    // Per-bucket sample gate (P2a) + requalification check (pg-1): BOTH buckets
    // need ≥ MIN_ROUNDS_PER_BUCKET rounds (the canonical floor above). Without
    // this, a single practice or tournament round produces a wild, meaningless
    // gap that ranks as a "pressure weakness". Returning null here is also the
    // REQUALIFICATION gate: if a player who previously qualified drops below the
    // floor in the 90-day window (e.g. recent rounds are all one type), the
    // generator emits nothing this run, so the row is not refreshed.
    // Returning null routes through BaseGenerator's stale-scope retraction
    // (signatureScope above, to-95 audit P2): a stale stored HIGH pressure row
    // from a player no longer meeting this gate is archived by the base class
    // on this exit — no longer an external lifecycle-cron dependency.
    const gap = computePressureGap(rounds, { minPerSide: MIN_ROUNDS_PER_BUCKET });
    if (!gap) return null;
    const practiceN = gap.practiceRounds;
    const competitiveN = gap.pressureRounds;
    const practiceAvg = gap.practiceAverage;
    const competitiveAvg = gap.pressureAverage;
    // score_to_par nets out par → the gap is course-difficulty-normalized to the
    // extent the course's par reflects difficulty.
    const delta = gap.gap;

    // Top defect 9 / audit row 14: a gap inside its own 95% noise band is not
    // a finding. 7 of 9 live gaps sat inside it (SE ≈ 2.25 strokes on 4-5
    // practice rounds). Welch SE of the difference of means, t critical at the
    // Welch df (the normal 1.96 would understate the band ~30% at n=4). The
    // null return routes through the base class's stale-scope retraction.
    const split = splitPressureRounds(rounds);
    const welch = welchStandardError(split.pressure, split.practice);
    if (!welch) return null;
    const noiseBand = tCritical95(welch.df) * welch.se;
    if (Math.abs(delta) <= noiseBand) return null;

    // C5: decompose the gap into WHICH sub-area breaks under pressure. Bucket
    // each round by competitive/practice, then compute per-bucket rates from
    // golf_holes. Component deltas are competitive − practice (higher = worse
    // under pressure); the largest positive one is what the prose names.
    const bucketOf = new Map<string, 'p' | 'c'>();
    for (const r of rounds) {
      if (r.round_type === PRACTICE_ROUND_TYPE) bucketOf.set(r.id, 'p');
      else if (r.round_type != null && PRESSURE_ROUND_TYPES.includes(r.round_type)) bucketOf.set(r.id, 'c');
    }
    const holes = (await loadCompletedHoles(this.playerId)).filter((h) => bucketOf.has(h.round_id));
    const acc = {
      p: { holes: 0, dbl: 0, tp: 0, pen: 0, op3sum: 0, op3n: 0, rounds: new Set<string>() },
      c: { holes: 0, dbl: 0, tp: 0, pen: 0, op3sum: 0, op3n: 0, rounds: new Set<string>() },
    };
    for (const h of holes) {
      const b = acc[bucketOf.get(h.round_id) as 'p' | 'c'];
      b.holes += 1;
      b.rounds.add(h.round_id);
      if (classifyHole(h) === 'double_plus') b.dbl += 1;
      if ((h.putts ?? 0) >= 3) b.tp += 1;
      if ((h.penalty_strokes ?? 0) > 0) b.pen += h.penalty_strokes ?? 0;
      if (h.score !== null && h.hole_number >= 1 && h.hole_number <= 3) {
        b.op3sum += h.score - h.par;
        b.op3n += 1;
      }
    }
    // Every component per 18 holes PLAYED (hole-weighted), so a 9-hole round
    // counts as half a round and all four components share one unit.
    const per18 = (k: number, holesN: number) => (holesN > 0 ? (18 * k) / holesN : 0);
    const doublesDelta = per18(acc.c.dbl, acc.c.holes) - per18(acc.p.dbl, acc.p.holes);
    const threePuttsDelta = per18(acc.c.tp, acc.c.holes) - per18(acc.p.tp, acc.p.holes);
    const penaltyDelta = per18(acc.c.pen, acc.c.holes) - per18(acc.p.pen, acc.p.holes);
    // Opening three holes: mean to-par per opening hole × 3 = strokes over par
    // across one round's holes 1-3.
    const opening3Delta =
      3 * ((acc.c.op3n > 0 ? acc.c.op3sum / acc.c.op3n : 0) -
        (acc.p.op3n > 0 ? acc.p.op3sum / acc.p.op3n : 0));

    // SV-1: per-round score-to-par dispersion + dates so the base computes a real
    // variance/recency instead of the placeholder 0.5/1.0 (no fabrication).
    // `computeMeasuredFactors` returns null (→ factors_measured:false) unless BOTH
    // a finite stddev AND ≥1 parseable round_date are present — so we MUST expose
    // round_dates too, or the real dispersion is never consumed.
    const compScores = split.pressure;
    const mean = compScores.reduce((a, v) => a + v, 0) / (compScores.length || 1);
    const variance =
      compScores.length > 1
        ? compScores.reduce((a, v) => a + (v - mean) ** 2, 0) / (compScores.length - 1)
        : 0;
    const stddev = Math.sqrt(variance);
    // The competitive bucket's round dates — the same rounds whose score_to_par
    // dispersion the stddev measures. Drop nulls so every entry is parseable.
    const roundDates = rounds
      .filter((r) => bucketOf.get(r.id) === 'c' && r.round_date !== null)
      .map((r) => r.round_date as string);
    const allDates = rounds
      .filter((r) => bucketOf.has(r.id) && r.round_date !== null)
      .map((r) => r.round_date as string)
      .sort();

    // The team's Tour pressure gap is the only reference (Q-88, 2026-09-30,
    // superseding the 2026-09-28 college-cohort anchor): LPGA for a women's
    // team, PGA otherwise. Both are the 0.5-stroke estimate in golf_pga_standards.
    const playerCohort = await loadPlayerCohort(this.playerId);
    const tour = TOUR_STANDARDS[tourFor(playerCohort.gender)];

    return {
      sampleN: practiceN + competitiveN,
      playerValue: delta,
      practice_avg: practiceAvg,
      competitive_avg: competitiveAvg,
      practice_count: practiceN,
      competitive_count: competitiveN,
      doubles_per18_delta: doublesDelta,
      three_putts_per18_delta: threePuttsDelta,
      penalty_per18_delta: penaltyDelta,
      opening3_strokes_delta: opening3Delta,
      gap_se: welch.se,
      noise_band: noiseBand,
      tour_gap: tour.practiceTournamentDelta,
      tour_label: tour.label,
      window_start: allDates[0] ?? null,
      window_end: allDates[allDates.length - 1] ?? null,
      // SV-1 duck-typed dispersion (DispersionSignals): stddev + scale + the
      // contributing round dates. All three are required for the base's
      // computeMeasuredFactors to return factors_measured:true.
      stddev,
      stddev_scale: 5, // ~5 strokes spread on score-to-par reads as "high variance"
      round_dates: roundDates,
    };
  }

  composeContent(agg: PressureGapAggregate): ComposedContent {
    const deltaDisp =
      agg.playerValue > 0 ? `+${agg.playerValue.toFixed(1)}` : agg.playerValue.toFixed(1);
    const direction = agg.playerValue > 0 ? 'worse' : 'better';
    const absDelta = Math.abs(agg.playerValue).toFixed(1);
    const practiceDisp = formatVsPar(agg.practice_avg);
    const competitiveDisp = formatVsPar(agg.competitive_avg);

    // One scale (per 18 holes), so the sort compares like with like. Stable
    // rank breaks ties deterministically.
    const components: Array<{ label: string; val: number; rank: number }> = [
      { label: 'double bogeys', val: agg.doubles_per18_delta, rank: 0 },
      { label: '3-putts', val: agg.three_putts_per18_delta, rank: 1 },
      { label: 'penalties', val: agg.penalty_per18_delta, rank: 2 },
      { label: 'your opening 3 holes', val: agg.opening3_strokes_delta, rank: 3 },
    ].sort((a, b) => b.val - a.val || a.rank - b.rank);
    const lead = components[0];
    const driverClause =
      agg.playerValue > 0 && lead && lead.val > 0
        ? lead.label === 'your opening 3 holes'
          ? ` Most of that gap is ${lead.label}: +${lead.val.toFixed(1)} strokes per round vs practice.`
          : ` Most of that gap is ${lead.label}: +${lead.val.toFixed(1)} per 18 holes vs practice.`
        : '';
    const anchorSentence = ` The ${agg.tour_label} gap is ~${agg.tour_gap} strokes.`;
    const noise = typeof agg.noise_band === 'number' && agg.noise_band > 0
      ? ` (95% noise band ±${agg.noise_band.toFixed(1)})`
      : '';

    const title = `Pressure gap: ${deltaDisp} strokes (tournament vs practice)`;
    const content =
      `Across the last 90 days you averaged ${competitiveDisp} in ` +
      `${agg.competitive_count} competitive rounds vs ${practiceDisp} in ` +
      `${agg.practice_count} practice rounds, a ${absDelta}-stroke gap${noise}. ` +
      `You play ${direction} when it counts.` + driverClause + anchorSentence;

    return {
      title,
      content,
      // Severity against the team's Tour gap (Q-88): over it is high, at or
      // under practice is low, in between medium. This is the rule before the
      // 2026-09-28 cohort anchor, which was adopted because it flagged most
      // college players HIGH; the thresholds are the owner's to retune.
      priority: agg.playerValue > agg.tour_gap ? 'high' : agg.playerValue <= 0 ? 'low' : 'medium',
      signature: `pressure_gap:practice_vs_tournament`,
      evidence: {
        metric: this.metricId,
        metric_label: 'Pressure gap',
        unit: 'strokes',
        your_value: agg.playerValue,
        your_value_display: deltaDisp,
        comparison_value: agg.tour_gap,
        comparison_label: `${agg.tour_label} pressure gap`,
        comparison_source: 'pga_baseline' as const,
        sample_n: agg.sampleN,
        window_basis: 'rolling',
        window_days: 90,
        window_start: agg.window_start ?? '',
        window_end: agg.window_end ?? '',
        detail: {
          practice_rounds: agg.practice_count,
          competitive_rounds: agg.competitive_count,
          gap_se: agg.gap_se,
          noise_band_95: agg.noise_band,
          doubles_per18_delta: agg.doubles_per18_delta,
          three_putts_per18_delta: agg.three_putts_per18_delta,
          penalty_per18_delta: agg.penalty_per18_delta,
          opening3_strokes_delta: agg.opening3_strokes_delta,
        },
        strokes_impact: 0,
        strokes_impact_method: 'peer_delta',
        confidence: 0,
        confidence_factors: {
          sample_adequacy: Math.min(agg.sampleN / 20, 1),
          recency: 1.0,
          variance: 0.5,
        },
      },
    };
  }
}

function formatVsPar(v: number): string {
  if (v > 0) return `+${v.toFixed(1)}`;
  if (v < 0) return v.toFixed(1);
  return 'E';
}
