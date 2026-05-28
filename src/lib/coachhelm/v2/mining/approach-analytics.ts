/**
 * generateApproachMissInsights — Group B1
 *
 * Design contract: docs/superpowers/plans/2026-04-22-insight-quality/00-design-contract.md
 *
 * Reads `approach_miss_details` joined to `golf_shots` + `golf_rounds` and
 * emits up to three families of approach insights per distance bucket:
 *
 *   1. "Where misses go" — dominant lie_type (fairway / rough / bunker /
 *      hazard) among the misses. Emits when any single lie captures >=40%.
 *   2. "Severity" — average distance_from_green on missed approaches vs the
 *      bucket's D2 baseline. Emits when severity is >1.5x the baseline.
 *   3. "Direction bias" — left vs right horizontal skew of the misses.
 *      Emits when one side captures >=60%.
 *
 * Window: last 60 days. Minimum bucket sample: 8 approaches.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { upsertInsight, attachDrills, GATED_OUT } from '../insights/upsert';
import type { InsightEvidence } from '../insights/types';
import { calcConfidence } from '../insights/types';
// W14: ready to inject evidence.standing once a clean v3 metric mapping
// lands. golf_player_stats_cache only has the aggregate
// approach_proximity_average column today — no per-bucket data — so v2's
// per-bucket insights don't have a matching v3 metric to read from. W22
// ApproachMissGenerator writes its own standing rows; this import is
// the hook for when those rows exist.
import { loadStandingForInsightEvidence as _loadStandingForApproach } from '../insights/standing-injection';

type Supabase = SupabaseClient<Database>;

const WINDOW_DAYS = 60;
const MIN_SAMPLES_PER_BUCKET = 8;
/**
 * P2 (2026-04-27): tighter thresholds for the two insights whose framing
 * was misleading at small N. The dominant-lie insight stays at 8 (it's a
 * categorical distribution, not a proportion). The other two are gated on
 * insight-specific minimums below.
 */
const MIN_SAMPLES_FOR_SEVERITY = 15;
const MIN_SAMPLES_FOR_DIRECTION = 12; // applies to directional misses, not total bucket
const DOMINANT_LIE_THRESHOLD = 0.4;
const DIRECTION_BIAS_THRESHOLD = 0.6;
const SEVERITY_MULTIPLIER = 1.5;
/**
 * P2: cap the severity ratio shown in the title at 3.0x. Past data showed
 * 5.9x ratios on N=15 misses — the headline framing implied catastrophe
 * when the actual issue was sample-driven variance. The body still carries
 * the absolute "47y from pin vs D2 8y" framing for full context.
 */
const SEVERITY_DISPLAY_CAP = 3.0;

type DistanceBucket = '<150' | '150_175' | '175_200' | '200+';
const BUCKET_ORDER: readonly DistanceBucket[] = [
  '<150',
  '150_175',
  '175_200',
  '200+',
];

const BUCKET_LABEL: Record<DistanceBucket, string> = {
  '<150': 'under 150 yards',
  '150_175': '150-175 yards',
  '175_200': '175-200 yards',
  '200+': '200+ yards',
};

/** D2 baseline severity (avg distance_from_green on a missed green) by bucket. */
const BASELINE_SEVERITY_YDS: Record<DistanceBucket, number> = {
  '<150': 8,
  '150_175': 12,
  '175_200': 18,
  '200+': 25,
};

/** Plain labels for the lie axis. Keep `hazard` out — we dedupe sand→bunker. */
type LieType = 'fairway' | 'rough' | 'bunker' | 'hazard';
const LIE_LABEL: Record<LieType, string> = {
  fairway: 'fairway',
  rough: 'rough',
  bunker: 'a bunker',
  hazard: 'a hazard',
};

interface MissRow {
  miss_direction: string | null;
  lie_type: string | null;
  distance_from_green_yards: number | null;
  shot_distance: number | null;
  /**
   * P3 (2026-04-27): the bug-fix fields. `approach_distance_yds` is the
   * approach's *starting* distance to the pin (the source of the bucket).
   * `lie_before` lets us reject tee-shots / unspecified rows. `distance_after_yds`
   * lets us reject malformed no-progress rows (OOB drops, topped shots).
   */
  approach_distance_yds: number | null;
  lie_before: string | null;
  distance_after_yds: number | null;
}

interface BucketStats {
  bucket: DistanceBucket;
  n: number;
  lieCounts: Record<LieType, number>;
  leftCount: number;
  rightCount: number;
  avgDistanceFromGreen: number;
  stddevDistanceFromGreen: number;
}

/**
 * Main entry — pulls recent approach misses for the player, computes stats
 * per distance bucket, and emits the three insight families.
 */
export async function generateApproachMissInsights(
  playerId: string,
): Promise<void> {
  const supabase = createAdminClient();
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd);
  windowStart.setDate(windowStart.getDate() - WINDOW_DAYS);

  try {
    const rows = await fetchApproachMisses(supabase, playerId, windowStart);
    if (rows.length === 0) return;

    const bucketed = bucketize(rows);
    const windowStartIso = windowStart.toISOString().slice(0, 10);
    const windowEndIso = windowEnd.toISOString().slice(0, 10);

    for (const bucket of BUCKET_ORDER) {
      const stats = bucketed[bucket];
      if (!stats || stats.n < MIN_SAMPLES_PER_BUCKET) continue;

      await emitDominantLieInsight(
        supabase,
        playerId,
        stats,
        windowStartIso,
        windowEndIso,
      );

      await emitSeverityInsight(
        supabase,
        playerId,
        stats,
        windowStartIso,
        windowEndIso,
      );

      await emitDirectionBiasInsight(
        supabase,
        playerId,
        stats,
        windowStartIso,
        windowEndIso,
      );
    }
  } catch (error) {
    await logServerError(
      'generateApproachMissInsights failed',
      {
        action: 'generateApproachMissInsights',
        featureArea: 'coachhelm/v2/mining/approach-analytics',
        source: 'background_job',
        playerId,
      },
      'error',
    ).catch(() => {
      /* never throw from the logger itself */
    });
    throw error instanceof Error
      ? error
      : new Error(String(error));
  }
}

/* -------------------------------------------------------------------------- */
/*  Data access                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Shape of the joined row returned from Supabase. The nested shape depends on
 * the PostgREST select — we pull miss_details and then hop through shot into
 * rounds so we can filter by round_date.
 */
interface JoinedRow {
  miss_direction: string | null;
  lie_type: string | null;
  distance_from_green_yards: number | null;
  golf_shots: {
    shot_distance: number | null;
    distance_to_hole_before: number | null;
    distance_to_hole_after: number | null;
    lie_before: string | null;
    golf_rounds: {
      player_id: string | null;
      round_date: string | null;
    } | null;
  } | null;
}

async function fetchApproachMisses(
  supabase: Supabase,
  playerId: string,
  windowStart: Date,
): Promise<MissRow[]> {
  const windowStartIso = windowStart.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('approach_miss_details')
    .select(
      `
      miss_direction,
      lie_type,
      distance_from_green_yards,
      golf_shots!inner (
        shot_distance,
        distance_to_hole_before,
        distance_to_hole_after,
        lie_before,
        golf_rounds!inner (
          player_id,
          round_date
        )
      )
    `,
    )
    .eq('golf_shots.golf_rounds.player_id', playerId)
    .gte('golf_shots.golf_rounds.round_date', windowStartIso);

  if (error) {
    throw new Error(
      `approach-analytics.fetchApproachMisses failed: ${error.message}`,
    );
  }
  if (!data) return [];

  const rows = data as unknown as JoinedRow[];
  return rows
    .filter((r) => r.golf_shots && r.golf_shots.golf_rounds)
    .map((r) => ({
      miss_direction: r.miss_direction,
      lie_type: r.lie_type,
      distance_from_green_yards: r.distance_from_green_yards,
      shot_distance: r.golf_shots?.shot_distance ?? null,
      approach_distance_yds: r.golf_shots?.distance_to_hole_before ?? null,
      lie_before: r.golf_shots?.lie_before ?? null,
      distance_after_yds: r.golf_shots?.distance_to_hole_after ?? null,
    }));
}

/* -------------------------------------------------------------------------- */
/*  Bucketization + aggregation                                               */
/* -------------------------------------------------------------------------- */

export function bucketFor(distance: number | null): DistanceBucket | null {
  if (distance === null || !Number.isFinite(distance)) return null;
  if (distance < 150) return '<150';
  if (distance < 175) return '150_175';
  if (distance < 200) return '175_200';
  return '200+';
}

/**
 * Collapse "sand" into "bunker"; map anything non-canonical to "hazard" so
 * the lie-distribution shape stays fixed.
 */
export function normalizeLie(raw: string | null): LieType | null {
  if (!raw) return null;
  const value = raw.toLowerCase();
  if (value === 'fairway') return 'fairway';
  if (value === 'rough') return 'rough';
  if (value === 'bunker' || value === 'sand') return 'bunker';
  if (value === 'hazard' || value === 'water') return 'hazard';
  return null;
}

/**
 * Parse miss_direction into a {left, right, center} axis. The enum values are
 *   left, right, long, short, long_left, long_right, short_left, short_right.
 * Only left/right carry horizontal information; long/short alone don't.
 */
export function horizontalAxis(
  raw: string | null,
): 'left' | 'right' | null {
  if (!raw) return null;
  const value = raw.toLowerCase();
  if (value.endsWith('left')) return 'left';
  if (value.endsWith('right')) return 'right';
  return null;
}

/**
 * P3 (2026-04-27): Lies that count as a real approach. Tee shots, putts,
 * green-side chips and unknown lies are excluded — those are not approaches.
 * `fringe` is included because a fairway-lie attempt that catches the fringe
 * is still effectively an approach into the green.
 */
const APPROACH_LIES: ReadonlySet<string> = new Set([
  'fairway',
  'rough',
  'sand',
  'bunker',
  'fringe',
]);

/**
 * P3 (2026-04-27): Filter to genuine approach-shot misses before bucketing.
 * The bug this fixes: `approach_miss_details` contains rows for tee shots on
 * par-5s (e.g. a 265y drive on a 485y par 5), layups, and malformed rows
 * where the ball didn't move. Bucketing those by traveled distance
 * (`shot_distance`) put them in absurd buckets and inflated severity.
 *
 *   - lie_before must be a real approach lie (fairway/rough/sand/fringe);
 *     teeing-ground rows and unspecified lies drop out.
 *   - approach_distance_yds <= 250: anything farther isn't an approach.
 *   - distance_after / distance_before < 0.5: the shot must make material
 *     progress toward the green (filters topped shots, OOB drops, errors).
 */
function isRealApproach(row: MissRow): boolean {
  const before = row.approach_distance_yds;
  if (typeof before !== 'number' || !Number.isFinite(before) || before <= 0) {
    return false;
  }
  if (before > 250) return false;

  const lieBefore = (row.lie_before ?? '').toLowerCase();
  if (!APPROACH_LIES.has(lieBefore)) return false;

  const after = row.distance_after_yds;
  if (typeof after === 'number' && Number.isFinite(after)) {
    if (after >= before * 0.5) return false;
  }

  return true;
}

function bucketize(rows: MissRow[]): Partial<Record<DistanceBucket, BucketStats>> {
  const out: Partial<Record<DistanceBucket, BucketStats>> = {};

  for (const row of rows) {
    if (!isRealApproach(row)) continue;

    const bucket = bucketFor(row.approach_distance_yds);
    if (!bucket) continue;

    const lie = normalizeLie(row.lie_type);
    if (!lie) continue;

    const stats = out[bucket] ?? {
      bucket,
      n: 0,
      lieCounts: { fairway: 0, rough: 0, bunker: 0, hazard: 0 },
      leftCount: 0,
      rightCount: 0,
      avgDistanceFromGreen: 0,
      stddevDistanceFromGreen: 0,
    };

    stats.n += 1;
    stats.lieCounts[lie] += 1;

    const axis = horizontalAxis(row.miss_direction);
    if (axis === 'left') stats.leftCount += 1;
    else if (axis === 'right') stats.rightCount += 1;

    out[bucket] = stats;
  }

  // Second pass — compute mean + stddev of distance_from_green_yards per bucket.
  for (const bucket of BUCKET_ORDER) {
    const stats = out[bucket];
    if (!stats) continue;
    const distances = rows
      .filter(
        (r) =>
          isRealApproach(r) &&
          bucketFor(r.approach_distance_yds) === bucket &&
          normalizeLie(r.lie_type) !== null &&
          typeof r.distance_from_green_yards === 'number',
      )
      .map((r) => r.distance_from_green_yards as number);

    if (distances.length === 0) continue;
    const mean =
      distances.reduce((a, b) => a + b, 0) / distances.length;
    const variance =
      distances.reduce((acc, d) => acc + (d - mean) ** 2, 0) / distances.length;
    stats.avgDistanceFromGreen = mean;
    stats.stddevDistanceFromGreen = Math.sqrt(variance);
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/*  Insight emission                                                          */
/* -------------------------------------------------------------------------- */

function buildConfidenceFactors(n: number, stddev: number) {
  // Target sample of 20 per bucket for a fully-confident read. Clamp to 1.
  return {
    sample_adequacy: Math.min(n / 20, 1),
    // Window is fully contained in the 60-day query window by construction.
    recency: 1,
    // Variance term: a misses-by-lie distribution has no natural stddev
    // target; approximate with "1 when distance_from_green stddev is small
    // relative to the mean" so noisy buckets discount confidence. 20yd of
    // spread is "loose"; 5yd is "tight".
    variance: clamp01(1 - stddev / 20),
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

async function emitDominantLieInsight(
  supabase: Supabase,
  playerId: string,
  stats: BucketStats,
  windowStart: string,
  windowEnd: string,
): Promise<void> {
  const entries = (Object.keys(stats.lieCounts) as LieType[])
    .map((lie) => ({ lie, pct: stats.lieCounts[lie] / stats.n }))
    .sort((a, b) => b.pct - a.pct);

  const dominant = entries[0];
  if (!dominant || dominant.pct < DOMINANT_LIE_THRESHOLD) return;

  const comparisonValue = 0.25; // 4-way uniform distribution
  const strokesImpact = estimateMissStrokesImpact(dominant.lie, dominant.pct);

  const evidence: InsightEvidence = {
    metric: `approach_miss_lie_${stats.bucket}_${dominant.lie}`,
    metric_label: `Share of ${BUCKET_LABEL[stats.bucket]} misses that land in ${LIE_LABEL[dominant.lie]}`,
    unit: 'percent',
    your_value: dominant.pct,
    your_value_display: `${Math.round(dominant.pct * 100)}%`,
    comparison_value: comparisonValue,
    comparison_label: 'Balanced distribution (25% each)',
    // 2026-05-17: was 'peer_percentile' — a uniform 4-way target is an
    // absolute reference, not a peer-percentile comparison. Audit Q-NEW-12.
    comparison_source: 'absolute_target',
    sample_n: stats.n,
    window_days: WINDOW_DAYS,
    window_start: windowStart,
    window_end: windowEnd,
    strokes_impact: strokesImpact,
    strokes_impact_method: 'rough_estimate',
    confidence: 0,
    confidence_factors: buildConfidenceFactors(stats.n, stats.stddevDistanceFromGreen),
    detail: {
      bucket: stats.bucket,
      dominant_lie: dominant.lie,
      distribution: Object.fromEntries(
        entries.map((e) => [e.lie, Number(e.pct.toFixed(3))]),
      ),
    },
  };
  evidence.confidence = calcConfidence(evidence);

  const title = `${BUCKET_LABEL[stats.bucket]} misses skew into ${LIE_LABEL[dominant.lie]}`;
  const content =
    `Of your ${stats.n} missed greens from ${BUCKET_LABEL[stats.bucket]} in the ` +
    `last ${WINDOW_DAYS} days, ${Math.round(dominant.pct * 100)}% ended up in ` +
    `${LIE_LABEL[dominant.lie]}. If the misses were distributed evenly across the ` +
    `four surfaces you'd expect ~25% in each. This is a direction-and-shape ` +
    `pattern, not a contact pattern — investigate alignment and shot shape from ` +
    `that range.`;

  const drillTags = ['approach', stats.bucket, dominant.lie, 'direction_bias'];

  const insightId = await upsertInsight(supabase, {
    player_id: playerId,
    category: 'approach',
    signature: `${playerId}:approach_miss_lie:${stats.bucket}_${dominant.lie}`,
    title,
    content,
    evidence,
    drill_tags: drillTags,
  });
  if (insightId === GATED_OUT) return;
  await attachDrills(supabase, insightId, 'approach', drillTags);
}

async function emitSeverityInsight(
  supabase: Supabase,
  playerId: string,
  stats: BucketStats,
  windowStart: string,
  windowEnd: string,
): Promise<void> {
  if (stats.avgDistanceFromGreen <= 0) return;
  // P2: severity comparisons need at least 15 missed approaches in the
  // bucket — a 5.9x ratio on N=8 is sample-driven variance, not signal.
  if (stats.n < MIN_SAMPLES_FOR_SEVERITY) {
    console.debug(
      `[insight-skip] reason=insufficient_sample type=approach_severity_${stats.bucket} n=${stats.n} min=${MIN_SAMPLES_FOR_SEVERITY}`,
    );
    return;
  }
  const baseline = BASELINE_SEVERITY_YDS[stats.bucket];
  const ratio = stats.avgDistanceFromGreen / baseline;
  if (ratio < SEVERITY_MULTIPLIER) return;

  const strokesImpact = Number(
    ((stats.avgDistanceFromGreen - baseline) / 20).toFixed(2),
  );

  const evidence: InsightEvidence = {
    metric: `approach_severity_${stats.bucket}`,
    metric_label: `Avg distance from the pin after a missed ${BUCKET_LABEL[stats.bucket]} approach`,
    unit: 'yards',
    your_value: Number(stats.avgDistanceFromGreen.toFixed(1)),
    your_value_display: `${Math.round(stats.avgDistanceFromGreen)} yd`,
    comparison_value: baseline,
    comparison_label: 'PGA Tour avg miss severity',
    comparison_source: 'pga_baseline',
    sample_n: stats.n,
    window_days: WINDOW_DAYS,
    window_start: windowStart,
    window_end: windowEnd,
    strokes_impact: strokesImpact,
    strokes_impact_method: 'peer_delta',
    confidence: 0,
    confidence_factors: buildConfidenceFactors(stats.n, stats.stddevDistanceFromGreen),
    detail: {
      bucket: stats.bucket,
      stddev_yards: Number(stats.stddevDistanceFromGreen.toFixed(1)),
      baseline_yards: baseline,
    },
  };
  evidence.confidence = calcConfidence(evidence);

  // P2: prefer absolute framing in the title (avg yardage delta) over a
  // hyperbolic ratio. When the ratio is genuinely large, cap the displayed
  // multiplier at SEVERITY_DISPLAY_CAP so we don't headline "5.9x worse"
  // — the body still carries the absolute numbers for proper context.
  const yourAvgYds = Math.round(stats.avgDistanceFromGreen);
  const title =
    `${BUCKET_LABEL[stats.bucket]} misses leak ~${yourAvgYds}y from pin (D2 ~${baseline}y)`;
  const cappedRatio = Math.min(ratio, SEVERITY_DISPLAY_CAP);
  const ratioPrefix = ratio > SEVERITY_DISPLAY_CAP ? '>=' : '~';
  const content =
    `On your ${stats.n} missed greens from ${BUCKET_LABEL[stats.bucket]} in the ` +
    `last ${WINDOW_DAYS} days, you finish an average of ${yourAvgYds} ` +
    `yards from the pin (${ratioPrefix}${cappedRatio.toFixed(1)}x the PGA Tour avg of ${baseline} yards). ` +
    `Oversized misses turn makeable up-and-downs into bogey saves.`;

  const drillTags = ['approach', stats.bucket, 'proximity', 'distance_control'];

  const insightId = await upsertInsight(supabase, {
    player_id: playerId,
    category: 'approach',
    signature: `${playerId}:approach_severity:${stats.bucket}`,
    title,
    content,
    evidence,
    drill_tags: drillTags,
  });
  if (insightId === GATED_OUT) return;
  await attachDrills(supabase, insightId, 'approach', drillTags);
}

async function emitDirectionBiasInsight(
  supabase: Supabase,
  playerId: string,
  stats: BucketStats,
  windowStart: string,
  windowEnd: string,
): Promise<void> {
  const directional = stats.leftCount + stats.rightCount;
  // P2: 60/40 splits at low directional N are within Bernoulli sampling
  // noise. Require 12 misses with miss_direction tagged before reporting
  // a side bias.
  if (directional < MIN_SAMPLES_FOR_DIRECTION) {
    if (directional > 0) {
      console.debug(
        `[insight-skip] reason=insufficient_sample type=approach_direction_${stats.bucket} n=${directional} min=${MIN_SAMPLES_FOR_DIRECTION}`,
      );
    }
    return;
  }

  const leftPct = stats.leftCount / directional;
  const rightPct = stats.rightCount / directional;
  const dominantSide: 'left' | 'right' | null =
    leftPct >= DIRECTION_BIAS_THRESHOLD
      ? 'left'
      : rightPct >= DIRECTION_BIAS_THRESHOLD
      ? 'right'
      : null;
  if (!dominantSide) return;

  const dominantPct = dominantSide === 'left' ? leftPct : rightPct;
  const strokesImpact = Number(((dominantPct - 0.5) * 1.5).toFixed(2));

  const evidence: InsightEvidence = {
    metric: `approach_direction_${stats.bucket}_${dominantSide}`,
    metric_label: `Share of ${BUCKET_LABEL[stats.bucket]} misses that leak ${dominantSide}`,
    unit: 'percent',
    your_value: dominantPct,
    your_value_display: `${Math.round(dominantPct * 100)}%`,
    comparison_value: 0.5,
    comparison_label: 'Balanced left/right (50/50)',
    // 2026-05-17: was 'peer_percentile' — see Q-NEW-12 audit finding.
    comparison_source: 'absolute_target',
    sample_n: directional,
    window_days: WINDOW_DAYS,
    window_start: windowStart,
    window_end: windowEnd,
    strokes_impact: strokesImpact,
    strokes_impact_method: 'rough_estimate',
    confidence: 0,
    confidence_factors: buildConfidenceFactors(directional, stats.stddevDistanceFromGreen),
    detail: {
      bucket: stats.bucket,
      left_count: stats.leftCount,
      right_count: stats.rightCount,
      left_pct: Number(leftPct.toFixed(3)),
      right_pct: Number(rightPct.toFixed(3)),
    },
  };
  evidence.confidence = calcConfidence(evidence);

  const title = `${BUCKET_LABEL[stats.bucket]} misses leak ${dominantSide}`;
  const content =
    `On the ${directional} directional misses you recorded from ` +
    `${BUCKET_LABEL[stats.bucket]} in the last ${WINDOW_DAYS} days, ` +
    `${Math.round(dominantPct * 100)}% went ${dominantSide}. A balanced player would ` +
    `land near 50% on either side. A persistent one-way pattern at this range ` +
    `points to face alignment or shot-shape bias, not mis-hits.`;

  const drillTags = [
    'approach',
    stats.bucket,
    'direction_bias',
    'face_alignment',
  ];

  const insightId = await upsertInsight(supabase, {
    player_id: playerId,
    category: 'approach',
    signature: `${playerId}:approach_direction:${stats.bucket}_${dominantSide}`,
    title,
    content,
    evidence,
    drill_tags: drillTags,
  });
  if (insightId === GATED_OUT) return;
  await attachDrills(supabase, insightId, 'approach', drillTags);
}

/**
 * Crude strokes-impact estimate for a dominant-lie miss pattern. A player who
 * sends 40%+ of misses into the same surface typically loses ~0.05 strokes per
 * miss relative to a balanced distribution; scale linearly with dominance.
 * Intent is to give the UI a sortable number, not to replace strokes-gained.
 */
function estimateMissStrokesImpact(lie: LieType, pct: number): number {
  const lieWeight: Record<LieType, number> = {
    fairway: 0.5, // recoverable
    rough: 1.0,
    bunker: 1.2,
    hazard: 1.8,
  };
  return Number(((pct - 0.25) * lieWeight[lie] * 2).toFixed(2));
}
