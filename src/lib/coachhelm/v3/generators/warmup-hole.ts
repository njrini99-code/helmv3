/**
 * v3 WarmupHoleGenerator (W24, par-normalized in C7).
 *
 * Aggregates the player's avg (score - par) on hole 1 vs holes 2-18 over
 * the last 90 days. Positive delta = "warmup tax" — opening hole plays
 * harder than the round average.
 *
 * C7 sharpening (three fixes):
 *   1. PAR-NORMALIZE — hole 1 has a fixed par per course, so its raw
 *      (score − par) was being measured against a bag of par-3/4/5 holes.
 *      Compare hole 1 ONLY against holes 2-18 of the SAME par.
 *   2. POSITIVE-TAX GATE — only emit when hole 1 is genuinely HARDER. The
 *      negative-delta players (opener easier than same-par holes) get no
 *      card; a "warmup tax" insight for a player with no tax is noise.
 *   3. DECOMPOSE — name the cause (putting / tee-approach / penalty) of the
 *      opening loss so the card is actionable.
 * The evidence stamps `feed_exempt: true` so Phase A's leverage floor keeps
 * this descriptive standing card off the feed rank (like par_scoring).
 *
 * Standing populated by `refresh_player_standing_round_metrics` (W24-prep
 * companion RPC). PGA reference = 0.1 strokes per Research doc §9.
 *
 * DOUBLE-SURFACE NOTE (warmup-hole / front-9-starter): this generator
 * (metric `opening_hole_delta`, hole 1, category 'pressure') and the
 * `front-9-starter` composite (same `opening_hole_delta`, holes 1-3, category
 * 'scoring') describe the SAME opening-stretch leak in two themes. There is no
 * cross-metric dedup between them, so a slow-start player can see the leak twice.
 * CROSS-FILE DEPENDENCY (composites / assembler owner): the cross-theme
 * suppression (pick one home, or dedup cross-theme rows by metric_id) is owned
 * by the composite synthesis / themes assembler — not changeable from this
 * generator. Flagged here so the overlap is documented at the source.
 */

import { staleDataSuffix } from '@/lib/coachhelm/v3/engine/window-honesty';
import { BaseGenerator } from '@/lib/coachhelm/v3/engine/generator-base';
import { loadCompletedHoles, loadLastRoundDate } from '@/lib/coachhelm/v3/engine/hole-diagnosis';
import type {
  ComposedContent,
  GeneratorAggregate,
  InsightCategory,
  MetricId,
} from '@/lib/coachhelm/v3/engine/types';

interface WarmupHoleAggregate extends GeneratorAggregate {
  /** Newest cache round date — feeds the staleness disclosure. */
  last_round_date: string | null;
  hole1_avg: number;
  /** Avg (score − par) on holes 2-18 of the SAME par as the hole-1 plays. */
  rest_avg: number;
  rounds_with_hole1: number;
  /** Of the opening-hole strokes lost, the % traced to putting / tee / penalty. */
  cause_putt_pct: number;
  cause_tee_pct: number;
  cause_penalty_pct: number;
}

export class WarmupHoleGenerator extends BaseGenerator<WarmupHoleAggregate> {
  readonly name = 'WarmupHoleGenerator';
  readonly insightType = 'warmup_hole';
  readonly category: InsightCategory = 'pressure';
  readonly minSampleN = 5; // rounds with a hole-1 entry

  readonly metricId: MetricId = 'opening_hole_delta';

  protected override signatureScope(): string {
    return 'warmup_hole:hole_1';
  }

  async aggregate(): Promise<WarmupHoleAggregate | null> {
    const holes = await loadCompletedHoles(this.playerId);
    if (holes.length === 0) return null;

    // Par-normalize: hole 1 has a fixed par per course; compare it ONLY against
    // holes 2-18 of the SAME par, so a par-5 opener isn't measured against a
    // bag of par-3s (W7 fix). We accumulate per-par sums then weight hole-1's
    // delta by the matching-par baseline.
    const hole1ByPar = new Map<number, { sum: number; n: number; rounds: Set<string> }>();
    const restByPar = new Map<number, { sum: number; n: number }>();
    for (const h of holes) {
      const over = h.score - h.par;
      if (h.hole_number === 1) {
        const s = hole1ByPar.get(h.par) ?? { sum: 0, n: 0, rounds: new Set<string>() };
        s.sum += over; s.n += 1; s.rounds.add(h.round_id);
        hole1ByPar.set(h.par, s);
      } else if (h.hole_number >= 2 && h.hole_number <= 18) {
        const s = restByPar.get(h.par) ?? { sum: 0, n: 0 };
        s.sum += over; s.n += 1;
        restByPar.set(h.par, s);
      }
    }
    let hole1Sum = 0, hole1N = 0, restMatchedSum = 0, restMatchedN = 0;
    const hole1Rounds = new Set<string>();
    for (const [par, s] of hole1ByPar) {
      const rest = restByPar.get(par);
      if (!rest || rest.n === 0 || s.n === 0) continue; // need a same-par baseline
      hole1Sum += s.sum; hole1N += s.n;
      s.rounds.forEach((r) => hole1Rounds.add(r));
      // Weight the rest baseline by how many hole-1 plays this par contributed.
      restMatchedSum += (rest.sum / rest.n) * s.n;
      restMatchedN += s.n;
    }
    if (hole1N === 0 || restMatchedN === 0) return null;
    const hole1Avg = hole1Sum / hole1N;
    const restAvg = restMatchedSum / restMatchedN;
    const delta = hole1Avg - restAvg;

    // POSITIVE-TAX GATE: only emit when hole 1 is genuinely HARDER. The
    // negative-delta players (opener easier than same-par holes) get no card —
    // a "warmup tax" insight for a player with no tax is noise.
    if (delta <= 0) return null;

    // Cause split over the hole-1 plays: penalty (penalty_strokes>0), putting
    // (>=3 putts on the opener), else tee/approach execution (the remainder).
    const hole1Holes = holes.filter((h) => h.hole_number === 1);
    let pen = 0, putt = 0, exec = 0, lostN = 0;
    for (const h of hole1Holes) {
      if (h.score - h.par <= 0) continue; // only holes that lost strokes
      lostN += 1;
      if ((h.penalty_strokes ?? 0) > 0) pen += 1;
      else if ((h.putts ?? 0) >= 3) putt += 1;
      else exec += 1;
    }
    const cpct = (k: number) => (lostN > 0 ? (100 * k) / lostN : 0);
    const teePctBase = cpct(exec);

    const lastRoundDate = await loadLastRoundDate(this.playerId);

    return {
      sampleN: hole1Rounds.size,
      last_round_date: lastRoundDate,
      playerValue: delta,
      hole1_avg: hole1Avg,
      rest_avg: restAvg,
      rounds_with_hole1: hole1Rounds.size,
      cause_penalty_pct: cpct(pen),
      cause_putt_pct: cpct(putt),
      cause_tee_pct: teePctBase,
    };
  }

  composeContent(agg: WarmupHoleAggregate): ComposedContent {
    const deltaDisp =
      agg.playerValue > 0 ? `+${agg.playerValue.toFixed(2)}` : agg.playerValue.toFixed(2);
    const absDelta = Math.abs(agg.playerValue).toFixed(2);
    const direction = agg.playerValue > 0 ? 'harder' : 'easier';
    const hole1Disp = formatHoleDelta(agg.hole1_avg);
    const restDisp = formatHoleDelta(agg.rest_avg);

    const r0 = (x: number) => Math.round(x).toString();
    const causes: Array<{ label: string; pct: number; action: string }> = [
      { label: 'putting (3-putts on the opener)', pct: agg.cause_putt_pct, action: 'a few lag putts in warm-up will settle it' },
      { label: 'tee/approach execution', pct: agg.cause_tee_pct, action: 'hit balls before you tee off, not just chip-and-putt' },
      { label: 'opening-hole penalties', pct: agg.cause_penalty_pct, action: 'play the opener conservatively off the tee' },
    ].sort((a, b) => b.pct - a.pct);
    const lead = causes[0];
    const causeClause =
      agg.playerValue > 0 && lead && lead.pct > 0
        ? ` ${r0(lead.pct)}% of those lost strokes are ${lead.label} — ${lead.action}.`
        : '';

    const title = `Opening hole gap: ${deltaDisp} strokes vs round avg`;
    const content =
      `Across your last ${agg.rounds_with_hole1} rounds, hole 1 plays ` +
      `${absDelta} strokes ${direction} than same-par holes 2-18 ` +
      `(hole 1 = ${hole1Disp}/hole; matched rest of round = ${restDisp}/hole).` +
      causeClause +
      ` Tour avg is ~0.1 strokes (Research doc §9).` +
      staleDataSuffix(agg.last_round_date);

    return {
      title,
      content,
      // Opening-hole gap vs the ~0.1 PGA tax: at/under is fine; a large opener tax escalates.
      priority: agg.playerValue <= 0.1 ? 'low' : agg.playerValue <= 0.4 ? 'medium' : 'high',
      signature: `warmup_hole:hole_1`,
      evidence: {
        metric: this.metricId,
        metric_label: 'Opening Hole Delta',
        unit: 'strokes',
        your_value: agg.playerValue,
        your_value_display: deltaDisp,
        comparison_value: 0.1,
        comparison_label: 'PGA Tour opening-hole tax',
        comparison_source: 'pga_baseline',
        sample_n: agg.rounds_with_hole1,
        window_days: 90,
        window_start: '',
        window_end: '',
        strokes_impact: 0,
        strokes_impact_method: 'peer_delta',
        confidence: 0,
        confidence_factors: {
          sample_adequacy: Math.min(agg.rounds_with_hole1 / 20, 1),
          recency: 1.0,
          variance: 0.5,
        },
        feed_exempt: true,
      },
    };
  }
}

function formatHoleDelta(v: number): string {
  if (v > 0) return `+${v.toFixed(2)}`;
  if (v < 0) return v.toFixed(2);
  return 'E';
}
