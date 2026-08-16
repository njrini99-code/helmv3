/**
 * v3 PuttSlopeBiasGenerator — downhill short-putt penalty (2026-08-16).
 *
 * Diagnostic — emits ONE insight about a player's downhill-vs-level putting
 * penalty INSIDE 6 FT. Modeled directly on `PuttBiasGenerator` (break-
 * direction bias): same shot-level read, same distance-band discipline, same
 * two-proportion z-test gate. No PGA standing exists for this comparison
 * (per-player slope tendency, not a tour benchmark), so requiresStanding=false.
 *
 * WHY THIS EXISTS — the confound this generator must never reproduce:
 * a naive squad-wide "level 81.9% vs downhill 25.3%" comparison is a pure
 * DISTANCE artifact — level putts average 4.3 ft (74% of them are 0-3 ft
 * tap-ins) while downhill putts average 16.1 ft. That ~51-point "gap" is
 * entirely putt length, not slope. Re-measuring WITHIN a single narrow
 * distance band (holding distance fixed) surfaces the real, much smaller
 * signal: a genuine downhill penalty inside 6 ft that VANISHES by 7-10 ft.
 * The "why focus on short putts at all" framing traces to the domain
 * research doc's Short Putt (3-8 ft) Performance → Round Variance section:
 * "Short putts have highest leverage per attempt because make-vs-miss is 1
 * full stroke and frequency is ~6-10/round" (docs/v3-research-golf-domain.md).
 * The pace-control MECHANISM for why downhill specifically underperforms
 * inside 6 ft is this generator's own inference from the measured pattern
 * (vanishes by 7-10 ft, where line/read — not pace — dominates per the same
 * doc's 3-putt section) — not a claim lifted from the doc, and it is worded
 * as a hypothesis everywhere it's surfaced (composeContent, and the
 * `causality_level: 'inferred_hypothesis'` BaseGenerator pins on every
 * single-metric row for exactly this reason).
 * So this generator:
 *   1. Buckets putts by (distance band × slope) — 'downhill' vs 'level' only.
 *   2. Compares make-% within each cut (distance held constant → the gap
 *      reflects pace control on that slope, not putt length).
 *   3. Gates the claim with a two-proportion z-test + effect-size floor,
 *      at a LOWER per-side sample floor (n>=8) than PuttBiasGenerator's
 *      break-direction test (n>=15) — production data showed the within-band
 *      slope gap is reliable at n>=8/side; see
 *      `src/lib/coachhelm/v3/stats/proportion-test.ts`'s `ProportionTestOptions`.
 *   4. Only considers the 0-3 ft and 4-6 ft bands — the two bands production
 *      data showed a real, material penalty. 7-10 ft+ is deliberately
 *      excluded: the measured penalty there is noise (a few points, wrong
 *      sign as often as right), so claiming a gap there would be fabrication.
 *   5. Only emits when DOWNHILL is the weaker side — a "significant" gap
 *      where downhill is actually the stronger side is never surfaced as a
 *      "downhill penalty" (that would be a backwards claim).
 *
 * `golf_shots.putt_slope` values used: 'downhill' | 'level'. 'uphill' and
 * 'severe' are excluded from both the comparison and the denominator — this
 * generator answers one question only (is downhill worse than level at this
 * distance?), not a full slope breakdown.
 *
 * insight_type reuses 'putt_bias' (same DB CHECK-constraint-allowed value as
 * PuttBiasGenerator — see `golf_coach_insights_insight_type_check`; adding a
 * new value requires a migration this generator doesn't need). The signature
 * SCOPE is 'putt_slope_bias:', a non-overlapping prefix from PuttBiasGenerator's
 * 'putt_bias:' scope, so the two generators' stale-row sweeps never retract
 * each other's rows (see BaseGenerator.signatureScope doc — sibling scopes
 * must not prefix-overlap). `bunker-miss-side-amplifier.ts`'s `isPuttBias()`
 * additionally requires ':left'/':right' in the signature, which this
 * generator's signatures never contain, so it cannot be mistaken for a
 * break-direction row by that composite rule.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { fromUntyped } from '@/lib/supabase/untyped';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { BaseGenerator } from '@/lib/coachhelm/v3/engine/generator-base';
import type {
  ComposedContent,
  GeneratorAggregate,
  InsightCategory,
  MetricId,
} from '@/lib/coachhelm/v3/engine/types';
import { twoProportionZTest } from '@/lib/coachhelm/v3/stats/proportion-test';

/** Window for the shot-level putt-slope read (days), completed rounds only. */
const WINDOW_DAYS = 90;

/**
 * Per-side sample floor for the slope comparison. Lower than PuttBiasGenerator's
 * break-direction floor (15) — production data (13/42 - 13/40 qualifying
 * players across the two bands) showed the within-band downhill-vs-level gap
 * is a reliable signal at n>=8/side. MIN_EFFECT_PP is NOT overridden — the
 * module default (12pp) still applies, so a technically-significant but
 * coaching-trivial gap at larger n is still rejected.
 */
const MIN_PUTTS_PER_SIDE = 8;

/** The only two bands with a measured, material downhill penalty. 7-10 ft+
 *  is deliberately excluded — see file header. */
export type SlopeBand = '0-3 ft' | '4-6 ft';

interface Band {
  label: SlopeBand;
  minFt: number;
  /** Exclusive upper bound. */
  maxFt: number;
}

const SLOPE_BANDS: readonly Band[] = [
  { label: '0-3 ft', minFt: 0, maxFt: 4 },
  { label: '4-6 ft', minFt: 4, maxFt: 7 },
] as const;

/** Map a putt distance (feet) to its comparison band, or null outside 0-7 ft
 *  (7 ft+ is excluded by design — no measured signal there, see file header). */
export function bandForSlopePenalty(distFt: number): SlopeBand | null {
  if (!Number.isFinite(distFt) || distFt < 0) return null;
  for (const b of SLOPE_BANDS) {
    if (distFt >= b.minFt && distFt < b.maxFt) return b.label;
  }
  return null;
}

/**
 * Only constructed when a qualifying downhill-vs-level cut exists — unlike
 * PuttBiasGenerator, this generator does NOT emit a "balanced, no penalty"
 * row when nothing qualifies (deliberate choice, see aggregate() below):
 * every field here is a real, significant measurement, never a placeholder.
 */
export interface PuttSlopeBiasAggregate extends GeneratorAggregate {
  /** Distance band of the winning cut (e.g. '0-3 ft'). */
  band: SlopeBand;
  /** Make-% on downhill putts within the winning band. */
  downhill_pct: number;
  /** Make-% on level putts within the winning band (the comparison line). */
  level_pct: number;
  /** level_pct - downhill_pct, percentage points (always positive). */
  gap_pp: number;
  downhill_n: number;
  level_n: number;
  rounds_played: number;
}

/** One scored putt with a recorded slope and distance (feet). */
export interface PuttSlopeRow {
  putt_slope: string;
  dist_ft: number;
  made: boolean;
}

interface WinningCut {
  band: SlopeBand;
  downhill_pct: number;
  level_pct: number;
  gap_pp: number;
  downhill_n: number;
  level_n: number;
}

/**
 * Pure cut-selection: across the two eligible (distance band) cuts, compare
 * downhill vs level make-% WITHIN the same band. Return the band with the
 * largest downhill penalty that passes the effect-size + z-test gate, or
 * null. Distance is held constant within a band, so a real gap reflects pace
 * control on that slope — never putt length (the confound this generator
 * exists to avoid; see file header).
 */
export function selectDownhillPenaltyCut(rows: PuttSlopeRow[]): WinningCut | null {
  type Tally = { downhillMade: number; downhillN: number; levelMade: number; levelN: number };
  const cuts = new Map<SlopeBand, Tally>();

  for (const r of rows) {
    const band = bandForSlopePenalty(r.dist_ft);
    if (!band) continue;
    if (r.putt_slope !== 'downhill' && r.putt_slope !== 'level') continue;
    let t = cuts.get(band);
    if (!t) {
      t = { downhillMade: 0, downhillN: 0, levelMade: 0, levelN: 0 };
      cuts.set(band, t);
    }
    if (r.putt_slope === 'downhill') {
      t.downhillN += 1;
      if (r.made) t.downhillMade += 1;
    } else {
      t.levelN += 1;
      if (r.made) t.levelMade += 1;
    }
  }

  let best: WinningCut | null = null;
  for (const [band, t] of cuts) {
    // level is side A, downhill is side B — gapPp = level% - downhill%,
    // positive means downhill is the weaker side (the only claim this
    // generator is allowed to make).
    const test = twoProportionZTest(t.levelMade, t.levelN, t.downhillMade, t.downhillN, {
      minPerSide: MIN_PUTTS_PER_SIDE,
    });
    if (!test.significant) continue;
    if (test.gapPp <= 0) continue; // downhill was NOT the weaker side — never claim a penalty backwards
    const levelPct = (t.levelMade / t.levelN) * 100;
    const downhillPct = (t.downhillMade / t.downhillN) * 100;
    const cut: WinningCut = {
      band,
      downhill_pct: downhillPct,
      level_pct: levelPct,
      gap_pp: test.gapPp,
      downhill_n: t.downhillN,
      level_n: t.levelN,
    };
    if (!best || cut.gap_pp > best.gap_pp) best = cut;
  }
  return best;
}

export class PuttSlopeBiasGenerator extends BaseGenerator<PuttSlopeBiasAggregate> {
  readonly name = 'PuttSlopeBiasGenerator';
  // Reuses PuttBiasGenerator's DB-allowed insight_type — see file header.
  readonly insightType = 'putt_bias';
  readonly category: InsightCategory = 'putting';
  readonly minSampleN = 5;
  protected override readonly requiresStanding = false; // no PGA benchmark exists

  // Closest canonical MetricId (short-putt make-rate family). Inert here —
  // requiresStanding=false means the base class never looks up a standing row
  // or counterfactual for it (mirrors PuttBiasGenerator's constructor-param
  // mapping, which is similarly a "closest available" placeholder).
  readonly metricId: MetricId = 'putts_made_3_5ft_pct';

  /** Single instance owns the whole putt_slope_bias scope. Non-overlapping
   * with PuttBiasGenerator's 'putt_bias:' scope — see file header. */
  protected override signatureScope(): string {
    return 'putt_slope_bias:';
  }

  async aggregate(): Promise<PuttSlopeBiasAggregate | null> {
    const supabase = createAdminClient();
    const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString().slice(0, 10);

    const { data: rounds, error: rErr } = await fromUntyped(supabase, 'golf_rounds')
      .select('id')
      .eq('player_id', this.playerId)
      .eq('status', 'completed')
      .gte('round_date', since) as {
        data: Array<{ id: string }> | null;
        error: { message: string } | null;
      };
    if (rErr) throw new Error(`putt-slope-bias rounds query failed: ${rErr.message}`);
    if (!rounds || rounds.length === 0) return null;
    const roundIds = rounds.map((r) => r.id);

    interface PuttShotRow {
      putt_slope: string | null;
      putt_made: boolean | null;
      distance_to_hole_before: number | null;
      distance_unit_before: string | null;
    }

    // Paginated: a single player's completed-round putts can exceed the
    // PostgREST 1000-row cap over a long enough window; `.order('id')` keeps
    // page boundaries stable (mirrors PuttBiasGenerator — LOAD-BEARING, do
    // not swap for created_at desc).
    const { data: putts, error: pErr } = await fetchAllRowsResult<PuttShotRow>((from, to) =>
      fromUntyped(supabase, 'golf_shots')
        .select('putt_slope, putt_made, distance_to_hole_before, distance_unit_before')
        .eq('shot_type', 'putting')
        .in('round_id', roundIds)
        .order('id', { ascending: true })
        .range(from, to));
    if (pErr) throw new Error(`putt-slope-bias putts query failed: ${pErr.message}`);
    if (!putts) return null;

    const rows: PuttSlopeRow[] = [];
    for (const p of putts) {
      if (p.putt_made === null || p.putt_made === undefined) continue;
      if (p.putt_slope !== 'downhill' && p.putt_slope !== 'level') continue;
      const raw = p.distance_to_hole_before;
      if (raw === null || raw === undefined) continue;
      // distance_unit_before is the correct unit column for putts ('feet' for
      // putts, 'yards' otherwise) — distance_unit is legacy and always 'yards'.
      const distFt = p.distance_unit_before === 'yards' ? raw * 3 : raw;
      rows.push({ putt_slope: p.putt_slope, dist_ft: distFt, made: p.putt_made === true });
    }

    const cut = selectDownhillPenaltyCut(rows);
    // Deliberate design choice (differs from PuttBiasGenerator): no
    // qualifying cut means NO insight — return null rather than composing a
    // "balanced" placeholder row. Rationale:
    //  1. The spec this generator was built against is explicit — "no
    //     insight" for below-threshold / wrong-band / artifact cases, not
    //     "an insight that says nothing happened."
    //  2. PuttBiasGenerator already ships a low-priority "balanced" putting
    //     row under this same insight_type when no break-direction bias
    //     qualifies; stacking a second always-on "nothing to report" row
    //     under the identical insight_type for the (majority-case) player
    //     with no downhill penalty would double low-value feed rows without
    //     adding information the coach can act on.
    //  3. Returning null still heals correctly: BaseGenerator.run() calls
    //     retractStaleInScope(null) on the null-aggregate ('no_data') path,
    //     which archives any previously-emitted significant row in the
    //     'putt_slope_bias:' scope the moment the penalty stops qualifying —
    //     same lifecycle guarantee as putt-bias's "balanced heals the stale
    //     directional row," just without a placeholder row standing in for it.
    if (!cut) return null;

    // sampleN gates on ROUNDS so the base-class minSampleN(=5) still applies.
    const base: PuttSlopeBiasAggregate = {
      sampleN: roundIds.length,
      playerValue: cut.downhill_pct,
      rounds_played: roundIds.length,
      band: cut.band,
      downhill_pct: cut.downhill_pct,
      level_pct: cut.level_pct,
      gap_pp: cut.gap_pp,
      downhill_n: cut.downhill_n,
      level_n: cut.level_n,
    };
    return base;
  }

  composeContent(agg: PuttSlopeBiasAggregate): ComposedContent {
    const downhillDisp = `${Math.round(agg.downhill_pct)}%`;
    const levelDisp = `${Math.round(agg.level_pct)}%`;
    const gap = Math.round(agg.gap_pp);

    return {
      title: `Downhill putts inside ${agg.band}: a real penalty`,
      content: `Inside ${agg.band} you're making ${downhillDisp} of downhill putts vs ${levelDisp} of level putts at the same distance — a ${gap}-point gap (n=${agg.downhill_n} downhill / ${agg.level_n} level). Short putts carry the highest leverage per attempt in your bag (a miss costs a full stroke), so this gap is worth closing. It's consistent with a pace-control pattern rather than a green-reading one — the gap shows up inside 6 ft and not beyond it, where line matters more than speed. Rehearse a downhill-only ladder drill: start 2 ft below the hole and add a foot at a time, focused on dying the ball into the front of the cup rather than a firm strike.`,
      priority: 'medium',
      signature: `putt_slope_bias:${agg.band}`,
      evidence: {
        metric: 'putt_slope_downhill_penalty_pct',
        metric_label: 'Downhill vs level putt make % (distance-controlled)',
        unit: 'percent',
        your_value: agg.downhill_pct,
        your_value_display: downhillDisp,
        comparison_value: agg.level_pct,
        comparison_label: `Your level-putt make % (same band)`,
        comparison_source: 'your_baseline',
        sample_n: agg.downhill_n + agg.level_n,
        window_days: WINDOW_DAYS,
        window_start: '',
        window_end: '',
        strokes_impact: 0,
        strokes_impact_method: 'peer_delta',
        confidence: Math.min(1, (agg.downhill_n + agg.level_n) / 60),
        confidence_factors: {
          sample_adequacy: Math.min((agg.downhill_n + agg.level_n) / 60, 1),
          recency: 1.0,
          variance: 0.5,
        },
      },
    };
  }
}
