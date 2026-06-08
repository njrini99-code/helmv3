/**
 * v3 PressureGapGenerator (W24).
 *
 * Aggregates the player's avg score-to-par on tournament+qualifier rounds
 * vs practice rounds over the last 90 days. Positive delta = player
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
  /** competitive − practice, in pp of holes, for double-or-worse holes. */
  double_rate_delta: number;
  /** competitive − practice, in pp of holes that were 3-putt-or-worse. */
  three_putt_delta: number;
  /** competitive − practice, penalty strokes per round. */
  penalty_delta: number;
  /** competitive − practice, avg score-to-par across holes 1-3. */
  opening3_delta: number;
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

  async aggregate(): Promise<PressureGapAggregate | null> {
    const supabase = createAdminClient();
    // Pull last 90 days of completed rounds for this player; bucket in TS.
    const since = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
    const { data, error } = await fromUntyped(supabase, 'golf_rounds')
      .select('id, round_type, score_to_par, round_date')
      .eq('player_id', this.playerId)
      .eq('status', 'completed')
      .gte('round_date', since) as {
        data: Array<{
          id: string;
          round_type: string | null;
          score_to_par: number | null;
          round_date: string | null;
        }> | null;
        error: { message: string } | null;
      };
    if (error || !data) return null;

    let practiceSum = 0;
    let practiceN = 0;
    let competitiveSum = 0;
    let competitiveN = 0;
    for (const r of data) {
      if (r.score_to_par === null || r.score_to_par === undefined) continue;
      const v = Number(r.score_to_par);
      if (!Number.isFinite(v)) continue;
      if (r.round_type === 'practice') {
        practiceSum += v;
        practiceN += 1;
      } else if (r.round_type === 'tournament' || r.round_type === 'qualifier') {
        competitiveSum += v;
        competitiveN += 1;
      }
    }
    // Per-bucket sample gate (P2a) + requalification check (pg-1): BOTH buckets
    // need ≥ MIN_ROUNDS_PER_BUCKET rounds (the canonical floor above). Without
    // this, a single practice or tournament round produces a wild, meaningless
    // gap that ranks as a "pressure weakness". Returning null here is also the
    // REQUALIFICATION gate: if a player who previously qualified drops below the
    // floor in the 90-day window (e.g. recent rounds are all one type), the
    // generator emits nothing this run, so the row is not refreshed.
    // CROSS-FILE DEPENDENCY (lifecycle-cron / data owner): a stale stored HIGH
    // pressure row from a player no longer meeting this gate is RETRACTED by the
    // lifecycle resolve/archive sweep + the one-time stale-row cleanup — the
    // generator cannot archive an existing row from here (upsert-only boundary).
    if (practiceN < MIN_ROUNDS_PER_BUCKET || competitiveN < MIN_ROUNDS_PER_BUCKET) return null;
    const practiceAvg = practiceSum / practiceN;
    const competitiveAvg = competitiveSum / competitiveN;
    // score_to_par nets out par → the gap is course-difficulty-normalized to the
    // extent the course's par reflects difficulty.
    const delta = competitiveAvg - practiceAvg;

    // C5: decompose the gap into WHICH sub-area breaks under pressure. Bucket
    // each round by competitive/practice, then compute per-bucket rates from
    // golf_holes. Component deltas are competitive − practice (higher = worse
    // under pressure); the largest positive one is what the prose names.
    const bucketOf = new Map<string, 'p' | 'c'>();
    for (const r of data) {
      if (r.round_type === 'practice') bucketOf.set(r.id, 'p');
      else if (r.round_type === 'tournament' || r.round_type === 'qualifier') bucketOf.set(r.id, 'c');
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
    const rate = (k: number, n: number) => (n > 0 ? (100 * k) / n : 0);
    const perRound = (k: number, rounds: number) => (rounds > 0 ? k / rounds : 0);
    const doubleRateDelta = rate(acc.c.dbl, acc.c.holes) - rate(acc.p.dbl, acc.p.holes);
    const threePuttDelta = rate(acc.c.tp, acc.c.holes) - rate(acc.p.tp, acc.p.holes);
    // NOTE (latent denominator divergence): penaltyDelta is per-round over the
    // HOLE-SET round count (acc.*.rounds.size) — the rounds loadCompletedHoles
    // actually returned (total_score IS NOT NULL filtered, inherited from C0's
    // loader). The prose competitive_count comes from the unfiltered round query.
    // These can diverge when a 'completed' round has a null total_score; zero such
    // rounds in current data. Using the hole-set count here is the CORRECT
    // denominator for these penalties (they were summed over exactly those rounds).
    const penaltyDelta =
      perRound(acc.c.pen, acc.c.rounds.size) - perRound(acc.p.pen, acc.p.rounds.size);
    const opening3Delta =
      (acc.c.op3n > 0 ? acc.c.op3sum / acc.c.op3n : 0) -
      (acc.p.op3n > 0 ? acc.p.op3sum / acc.p.op3n : 0);

    // SV-1: per-round score-to-par dispersion + dates so the base computes a real
    // variance/recency instead of the placeholder 0.5/1.0 (no fabrication).
    // `computeMeasuredFactors` returns null (→ factors_measured:false) unless BOTH
    // a finite stddev AND ≥1 parseable round_date are present — so we MUST expose
    // round_dates too, or the real dispersion is never consumed.
    const compScores = data
      .filter((r) => bucketOf.get(r.id) === 'c' && r.score_to_par !== null)
      .map((r) => Number(r.score_to_par));
    const mean = compScores.reduce((a, v) => a + v, 0) / (compScores.length || 1);
    const variance =
      compScores.length > 1
        ? compScores.reduce((a, v) => a + (v - mean) ** 2, 0) / (compScores.length - 1)
        : 0;
    const stddev = Math.sqrt(variance);
    // The competitive bucket's round dates — the same rounds whose score_to_par
    // dispersion the stddev measures. Drop nulls so every entry is parseable.
    const roundDates = data
      .filter((r) => bucketOf.get(r.id) === 'c' && r.round_date !== null)
      .map((r) => r.round_date as string);

    return {
      sampleN: practiceN + competitiveN,
      playerValue: delta,
      practice_avg: practiceAvg,
      competitive_avg: competitiveAvg,
      practice_count: practiceN,
      competitive_count: competitiveN,
      double_rate_delta: doubleRateDelta,
      three_putt_delta: threePuttDelta,
      penalty_delta: penaltyDelta,
      opening3_delta: opening3Delta,
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

    const components: Array<{ label: string; val: number; unit: 'pp' | 'pr' }> = [
      { label: 'double bogeys', val: agg.double_rate_delta, unit: 'pp' as const },
      { label: '3-putts', val: agg.three_putt_delta, unit: 'pp' as const },
      { label: 'penalties', val: agg.penalty_delta, unit: 'pr' as const },
      { label: 'your opening 3 holes', val: agg.opening3_delta, unit: 'pr' as const },
    ].sort((a, b) => b.val - a.val);
    const lead = components[0];
    const driverClause =
      agg.playerValue > 0 && lead && lead.val > 0
        ? lead.unit === 'pp'
          ? ` Most of that gap is ${lead.label}: +${lead.val.toFixed(0)}% of holes vs your practice rate.`
          : ` Most of that gap is ${lead.label}: +${lead.val.toFixed(1)} per round vs practice.`
        : '';

    const title = `Pressure gap: ${deltaDisp} strokes (tournament vs practice)`;
    const content =
      `Across the last 90 days you averaged ${competitiveDisp} in ` +
      `${agg.competitive_count} competitive rounds vs ${practiceDisp} in ` +
      `${agg.practice_count} practice rounds — a ${absDelta}-stroke gap. ` +
      `You play ${direction} when it counts.` + driverClause +
      ` PGA Tour gap is ~0.5 strokes; college typical is 2-5 (Research doc §9).`;

    return {
      title,
      content,
      // Severity from the gap itself (competitive − practice): >0.5 over the PGA
      // reference is a real pressure weakness; at/under practice is fine.
      // pg-3 (Tour-anchor caveat): the 0.5 reference + the counterfactual the base
      // injects both anchor to PGA Tour until the cohort RPC populates
      // `practice_tournament_delta.level_avg` (migration 20260606120000 adds the
      // college-population level_avg → once deployed, the base prefers the cohort
      // target, so this Tour anchor becomes the ceiling fallback only). College
      // typical is 2-5 strokes (Research doc §9) — far above Tour 0.5.
      priority: agg.playerValue > 0.5 ? 'high' : agg.playerValue <= 0 ? 'low' : 'medium',
      signature: `pressure_gap:practice_vs_tournament`,
      evidence: {
        metric: this.metricId,
        metric_label: 'Practice vs Tournament Delta',
        unit: 'strokes',
        your_value: agg.playerValue,
        your_value_display: deltaDisp,
        comparison_value: 0.5,
        comparison_label: 'PGA Tour pressure gap',
        comparison_source: 'pga_baseline',
        sample_n: agg.sampleN,
        window_days: 90,
        window_start: '',
        window_end: '',
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
