/**
 * Scoring-context insight generators — Group C1.
 *
 * generateParTypeInsights(playerId) — per par-type (3/4/5) score-to-par vs a
 * D2 baseline over the last 90 days. Emits one "scoring" insight per par-type
 * that shows a notable gap (>=0.20 strokes). For par 4s with enough volume,
 * also looks for a length sub-split (short/medium/long) and emits an extra
 * length-bucket insight when one bucket is >0.4 strokes worse than another.
 *
 * Source of truth:
 *   docs/superpowers/plans/2026-04-22-insight-quality/00-design-contract.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { upsertInsight, attachDrills } from '../insights/upsert';
import type { InsightEvidence } from '../insights/types';

type Supabase = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Constants — window, thresholds, D2 baselines, par-4 length buckets.
// ---------------------------------------------------------------------------

const WINDOW_DAYS = 90;
const MIN_HOLES_PER_PAR = 9;
const MIN_HOLES_FOR_PAR4_LENGTH_SPLIT = 18;
const NOTABLE_PAR_GAP_STROKES = 0.20;
const NOTABLE_PAR4_LENGTH_GAP_STROKES = 0.40;

/**
 * D2 baseline avg score-to-par per par-type. Mirrors the contract; these are
 * typical college-D2 averages. The baseline is no longer used to drive
 * insight generation — every emit now anchors against real benchmarks
 * (team average from golf_player_stats_cache + PGA Tour averages from
 * insights/benchmarks.ts). Constants kept for legacy test fixtures.
 */
const LEGACY_D2_BASELINE_BY_PAR: Record<3 | 4 | 5, number> = {
  3: 0.30,
  4: 0.40,
  5: 0.20,
};

/** Drill-tag sets keyed on which par-type is the weakest surface. */
const DRILL_TAGS_BY_PAR: Record<3 | 4 | 5, string[]> = {
  3: ['scoring', 'par_3_recovery', 'short_game'],
  4: ['scoring', 'short_par_4_strategy', 'tee_strategy'],
  5: ['scoring', 'par_5_strategy', 'course_management'],
};

type Par4LengthBucket = 'short' | 'medium' | 'long';
interface Par4LengthDef {
  label: Par4LengthBucket;
  rangeLabel: string;
  /** inclusive lower bound (yards) */
  minYards: number;
  /** exclusive upper bound (yards); Infinity for the tail bucket. */
  maxYards: number;
}
const PAR4_LENGTH_BUCKETS: readonly Par4LengthDef[] = [
  { label: 'short',  rangeLabel: '<350yd',     minYards: 0,    maxYards: 350 },
  { label: 'medium', rangeLabel: '350-430yd',  minYards: 350,  maxYards: 430 },
  { label: 'long',   rangeLabel: '>430yd',     minYards: 430,  maxYards: Number.POSITIVE_INFINITY },
];

// ---------------------------------------------------------------------------
// Data access — one SQL query, JS aggregation.
// ---------------------------------------------------------------------------

interface HoleRow {
  par: number;
  score: number;
  /** Optional course yardage on this hole. null when course_hole data missing. */
  yardage: number | null;
  course_id: string | null;
  hole_number: number;
}

interface RawHoleRow {
  par: number | null;
  score: number | null;
  hole_number: number | null;
  golf_rounds: {
    player_id: string | null;
    round_date: string | null;
    course_id: string | null;
  } | null;
}

interface CourseHoleYardRow {
  course_id: string;
  hole_number: number;
  yardage: number | null;
}

async function fetchScoredHoles(
  supabase: Supabase,
  playerId: string,
  windowStartIso: string,
): Promise<HoleRow[]> {
  const { data, error } = await supabase
    .from('golf_holes')
    .select(
      `
      par,
      score,
      hole_number,
      golf_rounds!inner (
        player_id,
        round_date,
        course_id
      )
    `,
    )
    .eq('golf_rounds.player_id', playerId)
    .gte('golf_rounds.round_date', windowStartIso)
    .not('score', 'is', null)
    .not('par', 'is', null);

  if (error) {
    throw new Error(`scoring-context.fetchScoredHoles failed: ${error.message}`);
  }
  const rows = (data ?? []) as unknown as RawHoleRow[];
  const filtered: HoleRow[] = rows
    .filter((r) => r.par != null && r.score != null && r.hole_number != null && r.golf_rounds)
    .map((r) => ({
      par: r.par as number,
      score: r.score as number,
      hole_number: r.hole_number as number,
      course_id: r.golf_rounds?.course_id ?? null,
      yardage: null,
    }));

  if (filtered.length === 0) return filtered;

  // Hydrate yardages from golf_course_holes for the distinct (course_id,
  // hole_number) pairs present in the window. Fold them back onto HoleRow.
  const distinctPairs = new Map<string, { course_id: string; hole_number: number }>();
  for (const r of filtered) {
    if (!r.course_id) continue;
    const key = `${r.course_id}:${r.hole_number}`;
    if (!distinctPairs.has(key)) {
      distinctPairs.set(key, { course_id: r.course_id, hole_number: r.hole_number });
    }
  }
  if (distinctPairs.size === 0) return filtered;

  const courseIds = Array.from(
    new Set(Array.from(distinctPairs.values()).map((p) => p.course_id)),
  );
  const { data: yardageRows, error: yardErr } = await supabase
    .from('golf_course_holes')
    .select('course_id, hole_number, yardage')
    .in('course_id', courseIds);
  if (yardErr) {
    // Yardage is optional for the main par-type insight — swallow, leaving
    // yardage=null so the par-4 length sub-split just won't fire.
    return filtered;
  }
  const yardByKey = new Map<string, number | null>();
  for (const row of (yardageRows ?? []) as CourseHoleYardRow[]) {
    yardByKey.set(`${row.course_id}:${row.hole_number}`, row.yardage ?? null);
  }
  for (const r of filtered) {
    if (!r.course_id) continue;
    const y = yardByKey.get(`${r.course_id}:${r.hole_number}`);
    if (typeof y === 'number') r.yardage = y;
  }
  return filtered;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export interface ParTypeAggregate {
  par: 3 | 4 | 5;
  holesPlayed: number;
  avgScoreToPar: number;
  stddev: number;
}

export function aggregateByPar(rows: HoleRow[]): ParTypeAggregate[] {
  const buckets: Record<3 | 4 | 5, number[]> = { 3: [], 4: [], 5: [] };
  for (const r of rows) {
    if (r.par !== 3 && r.par !== 4 && r.par !== 5) continue;
    buckets[r.par as 3 | 4 | 5].push(r.score - r.par);
  }
  const out: ParTypeAggregate[] = [];
  for (const par of [3, 4, 5] as const) {
    const xs = buckets[par];
    if (xs.length === 0) continue;
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const stddev = xs.length > 1
      ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1))
      : 0;
    out.push({ par, holesPlayed: xs.length, avgScoreToPar: mean, stddev });
  }
  return out;
}

export interface Par4LengthAggregate {
  bucket: Par4LengthBucket;
  rangeLabel: string;
  holesPlayed: number;
  avgScoreToPar: number;
}

export function aggregatePar4ByLength(rows: HoleRow[]): Par4LengthAggregate[] {
  const byBucket = new Map<Par4LengthBucket, number[]>();
  for (const def of PAR4_LENGTH_BUCKETS) byBucket.set(def.label, []);
  for (const r of rows) {
    if (r.par !== 4) continue;
    if (r.yardage == null) continue;
    const def = PAR4_LENGTH_BUCKETS.find(
      (d) => r.yardage! >= d.minYards && r.yardage! < d.maxYards,
    );
    if (!def) continue;
    byBucket.get(def.label)!.push(r.score - r.par);
  }
  return PAR4_LENGTH_BUCKETS.map((def) => {
    const xs = byBucket.get(def.label)!;
    const mean = xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    return {
      bucket: def.label,
      rangeLabel: def.rangeLabel,
      holesPlayed: xs.length,
      avgScoreToPar: mean,
    };
  });
}

// ---------------------------------------------------------------------------
// Content composition
// ---------------------------------------------------------------------------

function composeParContent(
  par: 3 | 4 | 5,
  agg: ParTypeAggregate,
  baseline: number,
  baselineLabel: string,
  strokesImpact: number,
): string {
  const yourDisplay = (agg.avgScoreToPar >= 0 ? '+' : '') + agg.avgScoreToPar.toFixed(2);
  const baseDisplay = (baseline >= 0 ? '+' : '') + baseline.toFixed(2);
  const direction = agg.avgScoreToPar > baseline ? 'above' : 'below';
  const gap = Math.abs(agg.avgScoreToPar - baseline).toFixed(2);
  const closing = agg.avgScoreToPar > baseline
    ? par === 3
      ? 'Tighten your par-3 approach routine and short-game recovery — the gap is almost entirely from bogey-or-worse holes.'
      : par === 4
        ? 'Most of the cost is bogey leakage on par 4s — a cleaner tee-strategy decision is usually the fastest fix.'
        : 'Par 5s are scoring holes; a conservative three-shot plan tends to erase most of the gap.'
    : 'Hold this advantage; drills below reinforce the habits producing it.';

  return (
    `Across your ${agg.holesPlayed} par-${par} holes in the last ${WINDOW_DAYS} days, ` +
    `you averaged ${yourDisplay} to par. ${baselineLabel} is ${baseDisplay} — ` +
    `you are ${gap} strokes ${direction}. Projected impact: ~${strokesImpact.toFixed(2)} strokes per round. ` +
    closing
  );
}

function composePar4LengthContent(
  worst: Par4LengthAggregate,
  best: Par4LengthAggregate,
  strokesImpact: number,
): string {
  const worstDisp = (worst.avgScoreToPar >= 0 ? '+' : '') + worst.avgScoreToPar.toFixed(2);
  const bestDisp = (best.avgScoreToPar >= 0 ? '+' : '') + best.avgScoreToPar.toFixed(2);
  const gap = Math.abs(worst.avgScoreToPar - best.avgScoreToPar).toFixed(2);
  return (
    `Your par 4s split sharply by length. ${worst.rangeLabel} par 4s average ${worstDisp} to par ` +
    `over ${worst.holesPlayed} holes, while ${best.rangeLabel} par 4s average ${bestDisp} over ${best.holesPlayed} holes — ` +
    `a ${gap}-stroke spread. Projected impact: ~${strokesImpact.toFixed(2)} strokes per round. ` +
    `Rebuild the tee-to-green plan specifically for ${worst.rangeLabel} par 4s; the length bucket is where bogeys concentrate.`
  );
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function isoDateDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

export async function generateParTypeInsights(playerId: string): Promise<void> {
  let supabase: Supabase;
  try {
    supabase = createAdminClient();
  } catch (err) {
    await logServerError('scoring-context.par_type.client_init', {
      action: 'generateParTypeInsights',
      featureArea: 'coachhelm/v2/mining/scoring-context',
      source: 'background_job',
      playerId,
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    return;
  }

  const windowStart = isoDateDaysAgo(WINDOW_DAYS);
  const windowEnd = todayIsoDate();

  let rows: HoleRow[];
  try {
    rows = await fetchScoredHoles(supabase, playerId, windowStart);
  } catch (err) {
    await logServerError('scoring-context.par_type.fetch_failed', {
      action: 'generateParTypeInsights',
      featureArea: 'coachhelm/v2/mining/scoring-context',
      source: 'background_job',
      playerId,
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    return;
  }
  if (rows.length === 0) return;

  const aggregates = aggregateByPar(rows);

  const { resolveTeamAverage, resolvePgaBenchmark } = await import(
    '@/lib/coachhelm/v2/insights/benchmarks'
  );

  for (const agg of aggregates) {
    if (agg.holesPlayed < MIN_HOLES_PER_PAR) continue;
    const metric = `par_scoring_par${agg.par}`;

    // Two real benchmarks: team average (live, from
    // golf_player_stats_cache) and PGA Tour average (constants in
    // benchmarks.ts). Team avg is the primary tick when the team has
    // peers; PGA falls into primary when the player has no team peers
    // yet so the panel always anchors against real data instead of a
    // synthetic D2 placeholder.
    const teamAvg = await resolveTeamAverage(playerId, metric, supabase);
    const pga = resolvePgaBenchmark(metric);

    let baseline: number;
    let baselineLabel: string;
    let baselineSource: 'team_avg' | 'pga_baseline';
    let secondary: { value: number; label: string; source: 'pga_baseline' } | null = null;

    if (teamAvg) {
      baseline = teamAvg.value;
      baselineLabel = `Team average (${teamAvg.sample_size} player${teamAvg.sample_size === 1 ? '' : 's'})`;
      baselineSource = 'team_avg';
      if (pga) secondary = { value: pga.value, label: pga.label, source: 'pga_baseline' };
    } else if (pga) {
      baseline = pga.value;
      baselineLabel = pga.label;
      baselineSource = 'pga_baseline';
    } else {
      // No real anchor available — skip the insight entirely rather than
      // emit a synthetic baseline. Generators must never fabricate data.
      continue;
    }

    const gap = agg.avgScoreToPar - baseline;
    if (Math.abs(gap) < NOTABLE_PAR_GAP_STROKES) continue;

    // Strokes impact per round. On a typical 18-hole round the player sees
    // ~4 par 3s, ~10 par 4s, ~4 par 5s. Scale the per-hole gap by that
    // frequency so the numbers read "strokes/round".
    const perRoundHoles: Record<3 | 4 | 5, number> = { 3: 4, 4: 10, 5: 4 };
    const strokesImpact = Number(
      (Math.abs(gap) * perRoundHoles[agg.par]).toFixed(2),
    );

    // Variance factor: bound player stddev against an expected ~1 stroke
    // score-to-par stddev (bogey-to-birdie swings). We tolerate noise by
    // compressing to [0,1].
    const expectedStd = 1.0;
    const varianceFactor = Math.max(
      0,
      Math.min(1, 1 - agg.stddev / expectedStd),
    );

    const yourDisp = (agg.avgScoreToPar >= 0 ? '+' : '') + agg.avgScoreToPar.toFixed(2);

    const evidence: InsightEvidence = {
      metric,
      metric_label: `Average score-to-par on par ${agg.par}s`,
      unit: 'strokes',
      your_value: Number(agg.avgScoreToPar.toFixed(3)),
      your_value_display: yourDisp,
      comparison_value: Number(baseline.toFixed(3)),
      comparison_label: baselineLabel,
      comparison_source: baselineSource,
      ...(secondary
        ? {
            secondary_value: Number(secondary.value.toFixed(3)),
            secondary_label: secondary.label,
            secondary_source: secondary.source,
          }
        : {}),
      sample_n: agg.holesPlayed,
      window_days: WINDOW_DAYS,
      window_start: windowStart,
      window_end: windowEnd,
      strokes_impact: strokesImpact,
      strokes_impact_method: 'peer_delta',
      confidence: 0,
      confidence_factors: {
        sample_adequacy: Math.min(agg.holesPlayed / 30, 1),
        recency: 1.0,
        variance: varianceFactor,
      },
      detail: {
        par_type: agg.par,
        gap_strokes: Number(gap.toFixed(3)),
        stddev: Number(agg.stddev.toFixed(3)),
        expected_holes_per_round: perRoundHoles[agg.par],
      },
    };

    const direction = gap > 0 ? '↑' : '↓';
    const titleAnchor = baselineSource === 'team_avg' ? 'team' : 'PGA';
    const title =
      `Par ${agg.par} scoring: ${yourDisp} (${direction} vs ${titleAnchor})`;
    const content = composeParContent(agg.par, agg, baseline, baselineLabel, strokesImpact);
    const drillTags = DRILL_TAGS_BY_PAR[agg.par];

    try {
      const insightId = await upsertInsight(supabase, {
        player_id: playerId,
        category: 'scoring',
        signature: `${playerId}:par_scoring:par${agg.par}`,
        title,
        content,
        evidence,
        drill_tags: drillTags,
      });
      await attachDrills(supabase, insightId, 'scoring', drillTags);
    } catch (err) {
      await logServerError('scoring-context.par_type.upsert_failed', {
        action: 'generateParTypeInsights',
        featureArea: 'coachhelm/v2/mining/scoring-context',
        source: 'background_job',
        playerId,
        metadata: {
          par: agg.par,
          error: err instanceof Error ? err.message : String(err),
        },
      });
      // Keep going — one par-type shouldn't kill the others.
    }
  }

  // -------------------------------------------------------------------------
  // Par-4 length sub-split. Runs only when we have enough par-4 volume, and
  // when at least two length buckets have reportable samples.
  // -------------------------------------------------------------------------
  const par4Agg = aggregates.find((a) => a.par === 4);
  if (!par4Agg || par4Agg.holesPlayed < MIN_HOLES_FOR_PAR4_LENGTH_SPLIT) return;

  const lengthAggs = aggregatePar4ByLength(rows);
  const eligible = lengthAggs.filter((a) => a.holesPlayed >= 5);
  if (eligible.length < 2) return;

  const sorted = [...eligible].sort((a, b) => a.avgScoreToPar - b.avgScoreToPar);
  const best = sorted[0]!;
  const worst = sorted[sorted.length - 1]!;
  const lengthGap = worst.avgScoreToPar - best.avgScoreToPar;
  if (lengthGap <= NOTABLE_PAR4_LENGTH_GAP_STROKES) return;

  // Roughly half of the 10 par 4s/round will fall in the worst length
  // bucket; scale the gap by that expected frequency.
  const strokesImpact = Number(
    (lengthGap * Math.max(2, Math.round(worst.holesPlayed / Math.max(1, par4Agg.holesPlayed) * 10))).toFixed(2),
  );

  // Variance factor: rough — we penalise small samples by the ratio of worst
  // bucket holes to 10 (per-round expected par-4 count).
  const varianceFactor = Math.max(
    0,
    Math.min(1, Math.min(worst.holesPlayed, best.holesPlayed) / 10),
  );

  const evidence: InsightEvidence = {
    metric: `par4_length_${worst.bucket}`,
    metric_label: `${worst.rangeLabel} par-4 average score-to-par`,
    unit: 'strokes',
    your_value: Number(worst.avgScoreToPar.toFixed(3)),
    your_value_display:
      (worst.avgScoreToPar >= 0 ? '+' : '') + worst.avgScoreToPar.toFixed(2),
    comparison_value: Number(best.avgScoreToPar.toFixed(3)),
    comparison_label: `your ${best.rangeLabel} par-4 baseline`,
    comparison_source: 'your_baseline',
    sample_n: worst.holesPlayed,
    window_days: WINDOW_DAYS,
    window_start: windowStart,
    window_end: windowEnd,
    strokes_impact: strokesImpact,
    strokes_impact_method: 'historical_correlation',
    confidence: 0,
    confidence_factors: {
      sample_adequacy: Math.min(worst.holesPlayed / 20, 1),
      recency: 1.0,
      variance: varianceFactor,
    },
    detail: {
      worst_bucket: worst.bucket,
      worst_range: worst.rangeLabel,
      worst_avg: Number(worst.avgScoreToPar.toFixed(3)),
      worst_holes: worst.holesPlayed,
      best_bucket: best.bucket,
      best_range: best.rangeLabel,
      best_avg: Number(best.avgScoreToPar.toFixed(3)),
      best_holes: best.holesPlayed,
      gap_strokes: Number(lengthGap.toFixed(3)),
    },
  };

  const title =
    `Par 4 ${worst.rangeLabel}: ${evidence.your_value_display} vs ${(
      best.avgScoreToPar >= 0 ? '+' : ''
    )}${best.avgScoreToPar.toFixed(2)} on ${best.rangeLabel}`;
  const content = composePar4LengthContent(worst, best, strokesImpact);
  const drillTags = ['scoring', 'short_par_4_strategy', 'tee_strategy'];

  try {
    const insightId = await upsertInsight(supabase, {
      player_id: playerId,
      category: 'scoring',
      signature: `${playerId}:par4_length:${worst.bucket}`,
      title,
      content,
      evidence,
      drill_tags: drillTags,
    });
    await attachDrills(supabase, insightId, 'scoring', drillTags);
  } catch (err) {
    await logServerError('scoring-context.par4_length.upsert_failed', {
      action: 'generateParTypeInsights',
      featureArea: 'coachhelm/v2/mining/scoring-context',
      source: 'background_job',
      playerId,
      metadata: {
        worst_bucket: worst.bucket,
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Test exports
// ---------------------------------------------------------------------------

export const __internal = {
  WINDOW_DAYS,
  MIN_HOLES_PER_PAR,
  MIN_HOLES_FOR_PAR4_LENGTH_SPLIT,
  NOTABLE_PAR_GAP_STROKES,
  NOTABLE_PAR4_LENGTH_GAP_STROKES,
  LEGACY_D2_BASELINE_BY_PAR,
  DRILL_TAGS_BY_PAR,
  PAR4_LENGTH_BUCKETS,
  aggregateByPar,
  aggregatePar4ByLength,
};
