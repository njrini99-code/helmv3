/**
 * v3 ParTypeGenerator (W23).
 *
 * Reads cache.par{3,4,5}_average and emits a per-par scoring insight
 * with PGA standing. 3 generator instances cover all 3 par types.
 *
 * All three v3 metric_ids (scoring_par_3/4/5) have standing data
 * populated by W11 from cache columns; counterfactual lookup uses the
 * lookup table from W17 (stroke_impact_per_unit = 4/10/4 holes per round).
 *
 * C1 (2026-06-08): aggregate() now also reads golf_holes (via loadCompletedHoles)
 * to decompose this par type's holes into birdie/par/bogey/double+ rates.
 * composeContent() names the DRIVER of the over-par average (bad tail vs
 * birdie-conversion gap) so coaches see "6.5% doubles + 21% bogeys — not a
 * birdie problem" rather than a bare number restatement. feed_exempt is stamped
 * so Phase A's scoreInsight / leveragePriorityFloor skips the card.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { BaseGenerator } from '@/lib/coachhelm/v3/engine/generator-base';
import { loadCompletedHoles, LIFETIME_WINDOW_DAYS } from '@/lib/coachhelm/v3/engine/hole-diagnosis';
import { lifetimeSpanDays, staleDataSuffix } from '@/lib/coachhelm/v3/engine/window-honesty';
import type {
  ComposedContent,
  GeneratorAggregate,
  InsightCategory,
  MetricId,
} from '@/lib/coachhelm/v3/engine/types';

export type ParType = 3 | 4 | 5;

const PAR_TO_METRIC_ID: Record<ParType, MetricId> = {
  3: 'scoring_par_3',
  4: 'scoring_par_4',
  5: 'scoring_par_5',
};

const PAR_TO_CACHE_COL: Record<ParType, 'par3_average' | 'par4_average' | 'par5_average'> = {
  3: 'par3_average',
  4: 'par4_average',
  5: 'par5_average',
};

const PAR_HOLES_PER_ROUND: Record<ParType, number> = { 3: 4, 4: 10, 5: 4 };

interface ParTypeAggregate extends GeneratorAggregate {
  par: ParType;
  rounds_played: number;
  /** % of scored holes of this par that finished birdie-or-better. */
  birdie_rate: number;
  /** % that finished exactly par. */
  par_rate: number;
  /** % that finished exactly bogey. */
  bogey_rate: number;
  /** % that finished double-bogey-or-worse. */
  double_plus_rate: number;
  /** Holes of this par scored in the window (denominator of the rates). */
  holes_scored: number;
  /** Holes of this par per typical round (4 par-3s / 10 par-4s / 4 par-5s) — the attempt rate for CF sizing. */
  holes_per_round: number;
  /** True lifetime span in days (first→last round); null when unknown. */
  spanDays: number | null;
  last_round_date: string | null;
}

export class ParTypeGenerator extends BaseGenerator<ParTypeAggregate> {
  readonly name = 'ParTypeGenerator';
  readonly insightType = 'par_scoring';
  readonly category: InsightCategory = 'scoring';
  readonly minSampleN = 5;

  readonly metricId: MetricId;
  readonly par: ParType;

  constructor(playerId: string, par: ParType) {
    super(playerId);
    this.par = par;
    this.metricId = PAR_TO_METRIC_ID[par];
  }

  protected override signatureScope(): string {
    return `par_scoring:par${this.par}`;
  }

  async aggregate(): Promise<ParTypeAggregate | null> {
    const supabase = createAdminClient();
    const col = PAR_TO_CACHE_COL[this.par];
    const { data, error } = await supabase
      .from('golf_player_stats_cache')
      .select(`player_id, rounds_played, first_round_date, last_round_date, ${col}`)
      .eq('player_id', this.playerId)
      .maybeSingle();
    if (error) throw new Error(`par-type aggregate query failed: ${error.message}`);
    if (!data) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (data as any)[col];
    if (raw === null || raw === undefined) return null;
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;
    const roundsPlayed = data.rounds_played ?? 0;

    // Decompose this par type into outcome rates from golf_holes (C1). The cache
    // average stays playerValue so standing + counterfactual are unchanged; the
    // rate cut only feeds the prose that names the DRIVER of that average.
    // LIFETIME holes so the decomposition + counts share the cache value's
    // denominator (regrade VAL-P1 — no more lifetime average over a 90d count).
    const holes = (await loadCompletedHoles(this.playerId, LIFETIME_WINDOW_DAYS)).filter(
      (h) => h.par === this.par,
    );
    const n = holes.length;
    let birdie = 0, par = 0, bogey = 0, dbl = 0;
    for (const h of holes) {
      if (h.score === null) continue;
      const over = h.score - h.par;
      if (over <= -1) birdie += 1;
      else if (over === 0) par += 1;
      else if (over === 1) bogey += 1;
      else dbl += 1;
    }
    const pct = (k: number) => (n > 0 ? (100 * k) / n : 0);

    return {
      sampleN: roundsPlayed,
      playerValue: value,
      par: this.par,
      rounds_played: roundsPlayed,
      birdie_rate: pct(birdie),
      par_rate: pct(par),
      bogey_rate: pct(bogey),
      double_plus_rate: pct(dbl),
      holes_scored: n,
      holes_per_round: PAR_HOLES_PER_ROUND[this.par],
      last_round_date: (data as { last_round_date?: string | null }).last_round_date ?? null,
      spanDays: lifetimeSpanDays(
        (data as { first_round_date?: string | null }).first_round_date ?? null,
        (data as { last_round_date?: string | null }).last_round_date ?? null,
      ),
    };
  }

  /**
   * Per-par holes-per-round leverage cap (par-type-3). The counterfactual lookup
   * multiplies the per-par gap by 4/10/4 holes/round, which lets the par-4 family
   * (×10) project the whole-round scoring gap onto one descriptive decomposition
   * row and dominate the top-3. Per-par scoring is NOT an independent additive
   * leak — improving par-4 average IS improving overall scoring, already captured
   * by SG/overall. So the generator declares a strokes_impact CAPPED at the
   * per-par ceiling (lookup `max_strokes_saved_per_round`) and keeps the card
   * descriptive (priority never escalated past medium from this row).
   *
   * CROSS-FILE DEPENDENCY: the AUTHORITATIVE leverage cap belongs in
   * counterfactual/compute.ts (counterfactual owner) — it must apply each
   * metric's `max_strokes_saved_per_round` to `strokes_saved_per_round` so the
   * BaseGenerator's counterfactual backfill + leveragePriorityFloor stop reading
   * the uncapped ×10 value. This generator-side cap only bounds the value the
   * row itself OWNS; the base currently overwrites it with the uncapped
   * counterfactual until compute.ts lands the ceiling.
   *
   * C1 addition: composeContent now names the DRIVER of the over-par average
   * (bad-tail leaks vs birdie-conversion gap) and stamps feed_exempt:true so
   * Phase A's scoreInsight / leveragePriorityFloor treats it as a descriptive
   * standing card, never promoting it into the actionable feed.
   */
  composeContent(agg: ParTypeAggregate): ComposedContent {
    const vsPar = agg.playerValue - agg.par;
    const vsParDisp = vsPar > 0 ? `+${vsPar.toFixed(2)}` : vsPar.toFixed(2);
    const valueDisp = agg.playerValue.toFixed(2);
    const r1 = (x: number) => (Math.round(x * 10) / 10).toString();

    const title = `Par ${agg.par} scoring: ${valueDisp} (${vsParDisp} vs par)`;

    // Name the DRIVER of the over-par average. Bad-tail leaks (bogeys + doubles)
    // and birdie-conversion leaks read very differently to a coach. We classify
    // by which side contributes more strokes-over-par: tail cost vs the birdie
    // credit foregone vs a healthy ~PGA birdie rate.
    //
    // "Birdie credit foregone" = (healthy_rate - actual_rate) / 100, where
    // healthy_rate is the par-type-typical birdie rate at college/PGA grade.
    // Par 5s are scoring opportunities (~35% birdies at PGA level); par 3s and
    // par 4s have a much lower base rate (~10–12%). Measuring the shortfall
    // from these anchors prevents "the tail drove it" from firing on par 5s where
    // the primary leak is simply not converting the eagle/birdie opportunity.
    //
    // Interim men's/PGA-grade par-type birdie baselines for prose classification
    // only (never a standing/impact number). Phase D (D7) does not currently add
    // a per-gender par-type anchor; if it ever does, swap this to it.
    const EXPECTED_BIRDIE_RATE: Record<ParType, number> = { 3: 10, 4: 12, 5: 35 };
    const expectedBirdie = EXPECTED_BIRDIE_RATE[agg.par];
    const tailCost = agg.bogey_rate / 100 + (2 * agg.double_plus_rate) / 100; // strokes over par per hole from the bad tail
    const birdieShortfall = Math.max(0, expectedBirdie - agg.birdie_rate) / 100; // credit foregone vs healthy baseline
    let driverClause: string;
    if (agg.holes_scored < 5) {
      driverClause =
        `Too few par ${agg.par}s logged in the window to break down where the strokes go yet.`;
    } else if (vsPar > 0 && tailCost >= birdieShortfall) {
      // The over-par average is the bad tail, not a birdie shortfall.
      driverClause =
        `That's driven by ${r1(agg.double_plus_rate)}% doubles + ${r1(agg.bogey_rate)}% bogeys, ` +
        `not a birdie problem (you birdie ${r1(agg.birdie_rate)}% of these). ` +
        `Cutting the doubles is the fastest stroke back.`;
    } else if (vsPar > 0) {
      driverClause =
        `Your tail is reasonable (${r1(agg.double_plus_rate)}% doubles, ${r1(agg.bogey_rate)}% bogeys) — ` +
        `the over-par average is mostly a birdie-conversion gap (only ${r1(agg.birdie_rate)}% birdies here).`;
    } else {
      driverClause =
        `You're at or under par here: ${r1(agg.birdie_rate)}% birdies, ${r1(agg.par_rate)}% pars, ` +
        `${r1(agg.double_plus_rate)}% doubles.`;
    }

    const content =
      `Across your last ${agg.rounds_played} rounds${agg.spanDays && agg.spanDays > 0 ? ` (${agg.spanDays} days)` : ''} ` +
      `you average ${valueDisp} on ${agg.holes_scored} par ${agg.par}s (${vsParDisp} vs par). ${driverClause}` +
      staleDataSuffix(agg.last_round_date);

    return {
      title,
      content,
      priority: 'low',
      signature: `par_scoring:par${agg.par}`,
      evidence: {
        metric: this.metricId,
        metric_label: `Par ${agg.par} Scoring`,
        unit: 'strokes',
        your_value: agg.playerValue,
        your_value_display: valueDisp,
        comparison_value: agg.par,
        comparison_label: `Par ${agg.par}`,
        comparison_source: 'absolute_target',
        sample_n: agg.holes_scored,
        window_days: agg.spanDays ?? 0,
        window_start: '',
        window_end: '',
        // Seed 0: "impact" is a gap-to-COHORT quantity, so the BaseGenerator
        // backfills the real value from the counterfactual (capped) when there
        // is genuine cohort-relative leverage. A gap-to-PAR diagnostic must NOT
        // seed this — when the CF is suppressed (player at/better than cohort)
        // the base keeps the seed, and a non-zero gap-to-par would float a
        // non-weakness to the top of the feed (audit FID/par_scoring). 0 ranks
        // low when suppressed (correct); the StandingBar carries severity.
        strokes_impact: 0,
        strokes_impact_method: 'rough_estimate',
        confidence: 0,
        confidence_factors: {
          sample_adequacy: Math.min(agg.rounds_played / 30, 1),
          recency: 1.0,
          variance: 0.5,
        },
        // Phase A reads feed_exempt to keep par_scoring out of the actionable
        // feed / leverage floor — this is a descriptive standing card, not a
        // separately-actionable leak (improving par-4 avg = improving overall
        // scoring, already owned by SG/overall). Structured rates carried for
        // the collapsed "Scoring by par type" card (C2).
        feed_exempt: true,
        detail: {
          birdie_rate: agg.birdie_rate,
          par_rate: agg.par_rate,
          bogey_rate: agg.bogey_rate,
          double_plus_rate: agg.double_plus_rate,
          holes_scored: agg.holes_scored,
          rounds_played: agg.rounds_played,
          lifetime_span_days: agg.spanDays,
        },
      },
    };
  }
}
