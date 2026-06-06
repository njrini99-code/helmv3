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
const MIN_ROUNDS_PER_BUCKET = 3;

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
      .select('round_type, score_to_par')
      .eq('player_id', this.playerId)
      .eq('status', 'completed')
      .gte('round_date', since) as {
        data: Array<{ round_type: string | null; score_to_par: number | null }> | null;
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
    const delta = competitiveAvg - practiceAvg;

    return {
      sampleN: practiceN + competitiveN,
      playerValue: delta,
      practice_avg: practiceAvg,
      competitive_avg: competitiveAvg,
      practice_count: practiceN,
      competitive_count: competitiveN,
    };
  }

  composeContent(agg: PressureGapAggregate): ComposedContent {
    const deltaDisp =
      agg.playerValue > 0 ? `+${agg.playerValue.toFixed(1)}` : agg.playerValue.toFixed(1);
    const direction = agg.playerValue > 0 ? 'worse' : 'better';
    const absDelta = Math.abs(agg.playerValue).toFixed(1);
    const practiceDisp = formatVsPar(agg.practice_avg);
    const competitiveDisp = formatVsPar(agg.competitive_avg);

    const title = `Pressure gap: ${deltaDisp} strokes (tournament vs practice)`;
    const content =
      `Across the last 90 days you averaged ${competitiveDisp} in ` +
      `${agg.competitive_count} competitive rounds vs ${practiceDisp} in ` +
      `${agg.practice_count} practice rounds — a ${absDelta}-stroke gap. ` +
      `You play ${direction} when it counts. PGA Tour gap is ~0.5 strokes; ` +
      `college typical is 2-5 (Research doc §9). The standing card below ` +
      `shows where you sit vs PGA + your team.`;

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
