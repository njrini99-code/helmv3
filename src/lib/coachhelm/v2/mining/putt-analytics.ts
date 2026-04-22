/**
 * Putt Analytics — Group A Tier-1 insight generators for the Insight Quality
 * phase. Produces evidence-backed putting insights that go through the
 * canonical `upsertInsight` helper so dedup + lifecycle + drill attachment
 * behave identically to every other Tier-1 surface.
 *
 * Generators exported from this file:
 *   - generatePuttDistanceInsights(playerId) — per distance-bucket make-rate
 *     vs D2 average over the last 30 days.
 *   - generatePuttMissBiasInsights(playerId) — read-bias (low/high) and
 *     speed-bias (short/long) over the last 90 days based on `miss_tags`.
 *
 * Source of truth: docs/superpowers/plans/2026-04-22-insight-quality/00-design-contract.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { upsertInsight, attachDrills } from '@/lib/coachhelm/v2/insights/upsert';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';

// ---------------------------------------------------------------------------
// Constants — bucket definitions, baselines, windows.
// ---------------------------------------------------------------------------

export type PuttBucketLabel =
  | '0_3ft'
  | '3_6ft'
  | '6_10ft'
  | '10_15ft'
  | '15_20ft'
  | '20+ft';

interface BucketDef {
  label: PuttBucketLabel;
  rangeLabel: string;
  minFeet: number;
  /** Upper bound (exclusive). `Number.POSITIVE_INFINITY` for the open-ended bucket. */
  maxFeet: number;
}

const BUCKETS: readonly BucketDef[] = [
  { label: '0_3ft',   rangeLabel: '0-3ft',   minFeet: 0,  maxFeet: 3 },
  { label: '3_6ft',   rangeLabel: '3-6ft',   minFeet: 3,  maxFeet: 6 },
  { label: '6_10ft',  rangeLabel: '6-10ft',  minFeet: 6,  maxFeet: 10 },
  { label: '10_15ft', rangeLabel: '10-15ft', minFeet: 10, maxFeet: 15 },
  { label: '15_20ft', rangeLabel: '15-20ft', minFeet: 15, maxFeet: 20 },
  { label: '20+ft',   rangeLabel: '20+ft',   minFeet: 20, maxFeet: Number.POSITIVE_INFINITY },
];

/**
 * D2 baseline make rates per distance bucket. Used as the comparison anchor
 * for every putt-distance insight. Values are reasonable D2 averages — the
 * UI surfaces the source label ("D2 average") so players see it explicitly.
 */
const D2_BASELINE: Record<PuttBucketLabel, number> = {
  '0_3ft':   0.95,
  '3_6ft':   0.75,
  '6_10ft':  0.48,
  '10_15ft': 0.28,
  '15_20ft': 0.18,
  '20+ft':   0.08,
};

/**
 * Rough per-round frequency of putts at each distance bucket — used as the
 * "average putts at this distance per round" multiplier in the strokes-impact
 * estimate. These are typical D2 distributions for a ~30-putt round.
 */
const BUCKET_PUTTS_PER_ROUND: Record<PuttBucketLabel, number> = {
  '0_3ft':   12,
  '3_6ft':   4,
  '6_10ft':  3,
  '10_15ft': 2,
  '15_20ft': 1.5,
  '20+ft':   2.5,
};

const DISTANCE_WINDOW_DAYS = 30;
const MISS_BIAS_WINDOW_DAYS = 90;

const MIN_BUCKET_ATTEMPTS = 5;
const MIN_GAP_FRACTION = 0.05;             // |make_pct - baseline| must be >= 5pt
const MIN_CONFIDENCE = 0.4;                // contract floor
const MISS_BIAS_MIN_TAGGED_MISSES = 15;
const MISS_BIAS_THRESHOLD = 0.6;           // 60% of misses to trigger
const MISS_BIAS_NEUTRAL_TARGET = 0.5;      // 50% would be neutral

type MissTag = 'low' | 'high' | 'short' | 'long';

// ---------------------------------------------------------------------------
// SQL layer — one query per generator.
// ---------------------------------------------------------------------------

interface RawPuttRow {
  distance_feet: number | null;
  made: boolean | null;
  miss_tags: string[] | null;
  round_id: string | null;
  round_date: string | null;
}

/**
 * Fetches every putt attempt in a rolling window for a player. Returned rows
 * are the raw join (one row per putt) — aggregation happens in JS so we only
 * pay one DB round-trip regardless of how many buckets we end up evaluating.
 */
async function fetchPuttRows(
  supabase: SupabaseClient,
  playerId: string,
  windowDays: number,
): Promise<RawPuttRow[]> {
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10); // YYYY-MM-DD for comparing against round_date

  // Step 1: get the player's round IDs in the window. Two-step pattern is more
  // reliable than PostgREST 2-level nested filters (golf_shots.golf_rounds.x),
  // which silently return empty results in some Supabase versions.
  const { data: rounds, error: roundsError } = await supabase
    .from('golf_rounds')
    .select('id, round_date')
    .eq('player_id', playerId)
    .gte('round_date', windowStart);
  if (roundsError) {
    throw new Error(`fetchPuttRows.rounds failed: ${roundsError.message}`);
  }
  if (!rounds || rounds.length === 0) return [];
  const roundIds = rounds.map((r) => r.id);
  const roundDateById = new Map(rounds.map((r) => [r.id, r.round_date]));

  // Step 2: get the shot IDs for those rounds. Same rationale.
  const { data: shots, error: shotsError } = await supabase
    .from('golf_shots')
    .select('id, round_id')
    .in('round_id', roundIds);
  if (shotsError) {
    throw new Error(`fetchPuttRows.shots failed: ${shotsError.message}`);
  }
  if (!shots || shots.length === 0) return [];
  const shotIds = shots.map((s) => s.id);
  const roundIdByShotId = new Map(shots.map((s) => [s.id, s.round_id]));

  // Step 3: pull the putt detail rows for those shots in chunks (Supabase
  // limits IN clauses to ~1000).
  const CHUNK = 500;
  const allPutts: Array<{
    distance_feet: number | null;
    made: boolean | null;
    miss_tags: string[] | null;
    shot_id: string;
  }> = [];
  for (let i = 0; i < shotIds.length; i += CHUNK) {
    const chunk = shotIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('putt_details')
      .select('distance_feet, made, miss_tags, shot_id')
      .in('shot_id', chunk);
    if (error) {
      throw new Error(`fetchPuttRows.putts failed: ${error.message}`);
    }
    if (data) allPutts.push(...data);
  }

  return allPutts.map((row) => {
    const round_id = roundIdByShotId.get(row.shot_id) ?? null;
    return {
      distance_feet: row.distance_feet,
      made: row.made,
      miss_tags: row.miss_tags,
      round_id,
      round_date: round_id ? roundDateById.get(round_id) ?? null : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Distance-bucket aggregation
// ---------------------------------------------------------------------------

export interface PuttBucketAggregate {
  label: PuttBucketLabel;
  rangeLabel: string;
  attempts: number;
  made: number;
  makePct: number;
  /** Sample standard deviation of the 0/1 made indicator. */
  stddev: number;
}

function bucketFor(distanceFeet: number): BucketDef | null {
  for (const b of BUCKETS) {
    if (distanceFeet >= b.minFeet && distanceFeet < b.maxFeet) return b;
  }
  return null;
}

export function aggregatePuttBuckets(rows: RawPuttRow[]): PuttBucketAggregate[] {
  const byBucket = new Map<PuttBucketLabel, { attempts: number; made: number; outcomes: number[] }>();
  for (const b of BUCKETS) {
    byBucket.set(b.label, { attempts: 0, made: 0, outcomes: [] });
  }

  for (const row of rows) {
    if (row.distance_feet == null || row.made == null) continue;
    const bucket = bucketFor(Number(row.distance_feet));
    if (!bucket) continue;
    const cell = byBucket.get(bucket.label)!;
    cell.attempts += 1;
    cell.outcomes.push(row.made ? 1 : 0);
    if (row.made) cell.made += 1;
  }

  return BUCKETS.map((b) => {
    const cell = byBucket.get(b.label)!;
    const makePct = cell.attempts > 0 ? cell.made / cell.attempts : 0;
    // Std-dev of Bernoulli outcomes; safe because we only report when attempts >= MIN_BUCKET_ATTEMPTS.
    const stddev = cell.attempts > 1
      ? Math.sqrt(
          cell.outcomes.reduce((acc, x) => acc + (x - makePct) ** 2, 0) /
            (cell.attempts - 1),
        )
      : 0;
    return {
      label: b.label,
      rangeLabel: b.rangeLabel,
      attempts: cell.attempts,
      made: cell.made,
      makePct,
      stddev,
    };
  });
}

// ---------------------------------------------------------------------------
// Content composition — rule-based, derived from evidence fields only.
// ---------------------------------------------------------------------------

function composeDistanceContent(
  agg: PuttBucketAggregate,
  baseline: number,
  strokesImpact: number,
  windowDays: number,
): string {
  const yourPct = Math.round(agg.makePct * 100);
  const basePct = Math.round(baseline * 100);
  const gapPts = Math.round((baseline - agg.makePct) * 100);
  const direction = agg.makePct < baseline ? 'below' : 'above';
  const angle = agg.makePct < baseline
    ? 'Converting even half of the gap would save strokes fastest.'
    : 'Hold the stroke pattern that is producing this; drills below reinforce it.';

  return (
    `Of your ${agg.attempts} putts from ${agg.rangeLabel} in the last ${windowDays} days, ` +
    `you made ${agg.made} (${yourPct}%). D2 average for this distance is ${basePct}% — ` +
    `you are ${Math.abs(gapPts)}pt ${direction}. Projected impact: ~${strokesImpact.toFixed(1)} strokes per round. ` +
    angle
  );
}

function composeMissBiasContent(
  kind: 'read' | 'speed',
  dominantTag: MissTag,
  dominantPct: number,
  totalTaggedMisses: number,
  strokesImpact: number,
  windowDays: number,
): string {
  const pct = Math.round(dominantPct * 100);
  if (kind === 'read') {
    const readType = dominantTag === 'low' ? 'under-reading' : 'over-reading';
    const sideLabel = dominantTag === 'low' ? 'LOW of the hole' : 'HIGH of the hole';
    return (
      `Of your ${totalTaggedMisses} tagged putt misses in the last ${windowDays} days, ${pct}% leaked ${sideLabel} — ` +
      `you are ${readType} the break. Projected impact: ~${strokesImpact.toFixed(1)} strokes per round. ` +
      `This is a green-reading pattern, not stroke mechanics: re-calibrate break by reading from both sides on practice greens.`
    );
  }
  const speedBias = dominantTag === 'short' ? 'leave-short' : 'blow-by';
  const angle = dominantTag === 'short'
    ? 'Work pace drills that finish the ball 12-18 inches past the cup on missed reads.'
    : 'Dial back entry speed — missed long putts roll out too far and leave difficult comebackers.';
  return (
    `Of your ${totalTaggedMisses} tagged putt misses in the last ${windowDays} days, ${pct}% were ${dominantTag} of the hole — ` +
    `a ${speedBias} speed bias. Projected impact: ~${strokesImpact.toFixed(1)} strokes per round. ` + angle
  );
}

// ---------------------------------------------------------------------------
// Shared evidence-window helpers.
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
// Generator A1 — putt distance make-rate vs D2 baseline
// ---------------------------------------------------------------------------

export async function generatePuttDistanceInsights(
  playerId: string,
): Promise<void> {
  let supabase: SupabaseClient;
  try {
    supabase = createAdminClient() as unknown as SupabaseClient;
  } catch (err) {
    await logServerError('putt-analytics.distance.client_init', {
      action: 'generatePuttDistanceInsights',
      featureArea: 'coachhelm.mining',
      playerId,
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    return;
  }

  let rows: RawPuttRow[];
  try {
    rows = await fetchPuttRows(supabase, playerId, DISTANCE_WINDOW_DAYS);
  } catch (err) {
    await logServerError('putt-analytics.distance.fetch_failed', {
      action: 'generatePuttDistanceInsights',
      featureArea: 'coachhelm.mining',
      playerId,
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    return;
  }

  if (rows.length === 0) return;

  const windowStart = isoDateDaysAgo(DISTANCE_WINDOW_DAYS);
  const windowEnd = todayIsoDate();
  // Rounds touched in the window — used to scale per-round strokes impact.
  const roundsInWindow = new Set(rows.map((r) => r.round_id).filter(Boolean)).size || 1;

  const buckets = aggregatePuttBuckets(rows);

  for (const agg of buckets) {
    if (agg.attempts < MIN_BUCKET_ATTEMPTS) continue;

    const baseline = D2_BASELINE[agg.label];
    const gap = baseline - agg.makePct;
    if (Math.abs(gap) < MIN_GAP_FRACTION) continue;

    // Strokes impact = gap * expected putts per round at this distance * 1.0
    // (one stroke = one made/missed putt).
    const perRoundPutts = BUCKET_PUTTS_PER_ROUND[agg.label];
    const strokesImpactRaw = gap * perRoundPutts; // positive when player is below baseline
    const strokesImpact = Number(strokesImpactRaw.toFixed(2));

    // Determine drill flavor. If the player is below baseline and has a
    // matching miss bias available, use directional tag; otherwise default
    // to speed_control for short-range, green_reading for longer.
    const leaveShortBias = hasLeaveShortBias(rows, agg.label);
    const directionalFlavor = leaveShortBias ? 'speed_control' : 'green_reading';

    // Variance factor: compare putter std-dev to the Bernoulli-at-baseline
    // std-dev (sqrt(p*(1-p))); clamp so we don't produce negatives.
    const baselineStd = Math.sqrt(baseline * (1 - baseline));
    const varianceFactor = baselineStd > 0
      ? Math.max(0, Math.min(1, 1 - (agg.stddev / baselineStd)))
      : 0;

    const evidence: InsightEvidence = {
      metric: `putt_make_rate_${agg.label}`,
      metric_label: `Make rate from ${agg.rangeLabel}`,
      unit: 'percent',
      your_value: agg.makePct,
      your_value_display: `${Math.round(agg.makePct * 100)}%`,
      comparison_value: baseline,
      comparison_label: 'D2 average',
      comparison_source: 'd2_avg',
      sample_n: agg.attempts,
      window_days: DISTANCE_WINDOW_DAYS,
      window_start: windowStart,
      window_end: windowEnd,
      strokes_impact: strokesImpact,
      strokes_impact_method: 'peer_delta',
      confidence: 0, // upsertInsight recomputes from factors
      confidence_factors: {
        sample_adequacy: Math.min(agg.attempts / 30, 1),
        recency: 1.0,
        variance: varianceFactor,
      },
      detail: {
        made: agg.made,
        bucket: agg.label,
        range_label: agg.rangeLabel,
        rounds_in_window: roundsInWindow,
        gap_points: Number((gap * 100).toFixed(1)),
      },
    };

    // Contract floor; upsertInsight will tag below-floor as 'tentative'.
    // We still try to emit so the lifecycle cron can see it.
    // But skip if nothing reasonable can be derived.
    if (
      0.4 * evidence.confidence_factors.sample_adequacy +
        0.3 * evidence.confidence_factors.recency +
        0.3 * evidence.confidence_factors.variance <
      MIN_CONFIDENCE
    ) {
      continue;
    }

    const directionArrow = agg.makePct < baseline ? '↓' : '↑';
    const title =
      `${agg.rangeLabel} putts: ${evidence.your_value_display} (${directionArrow} vs D2)`;

    const content = composeDistanceContent(agg, baseline, strokesImpact, DISTANCE_WINDOW_DAYS);

    const drillTags: string[] = ['putting', agg.label, directionalFlavor];

    try {
      const insightId = await upsertInsight(supabase, {
        player_id: playerId,
        category: 'putting',
        signature: `${playerId}:putt_make_rate:${agg.label}`,
        title,
        content,
        evidence,
        drill_tags: drillTags,
      });

      await attachDrills(supabase, insightId, 'putting', drillTags);
    } catch (err) {
      await logServerError('putt-analytics.distance.upsert_failed', {
        action: 'generatePuttDistanceInsights',
        featureArea: 'coachhelm.mining',
        playerId,
        metadata: {
          bucket: agg.label,
          error: err instanceof Error ? err.message : String(err),
        },
      });
      // Keep going — one bad bucket shouldn't kill the rest.
    }
  }
}

/**
 * Heuristic: does the player tend to leave putts short at this distance?
 * Used to pick drill flavor. Returns true if the 'short' tag dominates the
 * miss tags at this bucket (among tagged misses).
 */
function hasLeaveShortBias(rows: RawPuttRow[], bucket: PuttBucketLabel): boolean {
  const cell = BUCKETS.find((b) => b.label === bucket);
  if (!cell) return false;

  let shortHits = 0;
  let totalTagged = 0;
  for (const row of rows) {
    if (row.made !== false) continue;
    if (row.distance_feet == null) continue;
    const d = Number(row.distance_feet);
    if (!(d >= cell.minFeet && d < cell.maxFeet)) continue;
    const tags = (row.miss_tags ?? []) as MissTag[];
    if (tags.length === 0) continue;
    totalTagged += 1;
    if (tags.includes('short')) shortHits += 1;
  }
  if (totalTagged === 0) return false;
  return shortHits / totalTagged >= 0.5;
}

// ---------------------------------------------------------------------------
// Generator A2 — putt miss-tag bias (read bias + speed bias)
// ---------------------------------------------------------------------------

export interface MissBiasAggregate {
  totalTaggedMisses: number;
  totalRounds: number;
  lowPct: number;
  highPct: number;
  shortPct: number;
  longPct: number;
  perRoundMisses: number;
}

export function aggregateMissBias(rows: RawPuttRow[]): MissBiasAggregate {
  let totalTagged = 0;
  let low = 0, high = 0, short = 0, long = 0;
  const rounds = new Set<string>();

  for (const row of rows) {
    if (row.round_id) rounds.add(row.round_id);
    if (row.made !== false) continue;
    const tags = (row.miss_tags ?? []) as MissTag[];
    if (tags.length === 0) continue;
    totalTagged += 1;
    if (tags.includes('low')) low += 1;
    if (tags.includes('high')) high += 1;
    if (tags.includes('short')) short += 1;
    if (tags.includes('long')) long += 1;
  }

  const totalRounds = Math.max(rounds.size, 1);
  return {
    totalTaggedMisses: totalTagged,
    totalRounds,
    lowPct: totalTagged > 0 ? low / totalTagged : 0,
    highPct: totalTagged > 0 ? high / totalTagged : 0,
    shortPct: totalTagged > 0 ? short / totalTagged : 0,
    longPct: totalTagged > 0 ? long / totalTagged : 0,
    perRoundMisses: totalTagged / totalRounds,
  };
}

export async function generatePuttMissBiasInsights(
  playerId: string,
): Promise<void> {
  let supabase: SupabaseClient;
  try {
    supabase = createAdminClient() as unknown as SupabaseClient;
  } catch (err) {
    await logServerError('putt-analytics.miss_bias.client_init', {
      action: 'generatePuttMissBiasInsights',
      featureArea: 'coachhelm.mining',
      playerId,
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    return;
  }

  let rows: RawPuttRow[];
  try {
    rows = await fetchPuttRows(supabase, playerId, MISS_BIAS_WINDOW_DAYS);
  } catch (err) {
    await logServerError('putt-analytics.miss_bias.fetch_failed', {
      action: 'generatePuttMissBiasInsights',
      featureArea: 'coachhelm.mining',
      playerId,
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    return;
  }

  const agg = aggregateMissBias(rows);

  // Require a real sample of *tagged* misses — untagged misses can't tell us
  // direction. Data observation: roughly 1 in 5 misses are tagged today.
  if (agg.totalTaggedMisses < MISS_BIAS_MIN_TAGGED_MISSES) return;

  const windowStart = isoDateDaysAgo(MISS_BIAS_WINDOW_DAYS);
  const windowEnd = todayIsoDate();

  // ---- Read bias (low vs high) ----
  const readCandidates: Array<{ tag: MissTag; pct: number }> = [
    { tag: 'low', pct: agg.lowPct },
    { tag: 'high', pct: agg.highPct },
  ];
  const dominantRead = readCandidates.sort((a, b) => b.pct - a.pct)[0];

  if (dominantRead && dominantRead.pct >= MISS_BIAS_THRESHOLD) {
    const strokesImpact = Number(
      ((dominantRead.pct - MISS_BIAS_NEUTRAL_TARGET) * agg.perRoundMisses * 0.7).toFixed(2),
    );

    const evidence: InsightEvidence = {
      metric: 'putt_miss_bias_read',
      metric_label: 'Miss-read bias (low vs high)',
      unit: 'percent',
      your_value: dominantRead.pct,
      your_value_display: `${Math.round(dominantRead.pct * 100)}% ${dominantRead.tag}`,
      comparison_value: MISS_BIAS_NEUTRAL_TARGET,
      comparison_label: 'Neutral (50/50 split)',
      comparison_source: 'absolute_target',
      sample_n: agg.totalTaggedMisses,
      window_days: MISS_BIAS_WINDOW_DAYS,
      window_start: windowStart,
      window_end: windowEnd,
      strokes_impact: strokesImpact,
      strokes_impact_method: 'rough_estimate',
      confidence: 0,
      confidence_factors: {
        sample_adequacy: Math.min(agg.totalTaggedMisses / 40, 1),
        recency: 1.0,
        variance: Math.min(1, Math.max(0, dominantRead.pct - MISS_BIAS_NEUTRAL_TARGET) / 0.5),
      },
      detail: {
        low_pct: Number(agg.lowPct.toFixed(3)),
        high_pct: Number(agg.highPct.toFixed(3)),
        short_pct: Number(agg.shortPct.toFixed(3)),
        long_pct: Number(agg.longPct.toFixed(3)),
        dominant_tag: dominantRead.tag,
        rounds_in_window: agg.totalRounds,
      },
    };

    const bias = dominantRead.tag === 'low' ? 'under_read' : 'over_read';
    const title = `Putt misses leak ${dominantRead.tag.toUpperCase()} — ${Math.round(dominantRead.pct * 100)}%`;
    const content = composeMissBiasContent(
      'read',
      dominantRead.tag,
      dominantRead.pct,
      agg.totalTaggedMisses,
      strokesImpact,
      MISS_BIAS_WINDOW_DAYS,
    );
    const drillTags = ['putting', 'green_reading', bias];

    try {
      const insightId = await upsertInsight(supabase, {
        player_id: playerId,
        category: 'putting',
        signature: `${playerId}:putt_miss_bias:read`,
        title,
        content,
        evidence,
        drill_tags: drillTags,
      });
      await attachDrills(supabase, insightId, 'putting', drillTags);
    } catch (err) {
      await logServerError('putt-analytics.miss_bias.read.upsert_failed', {
        action: 'generatePuttMissBiasInsights',
        featureArea: 'coachhelm.mining',
        playerId,
        metadata: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  // ---- Speed bias (short vs long) ----
  const speedCandidates: Array<{ tag: MissTag; pct: number }> = [
    { tag: 'short', pct: agg.shortPct },
    { tag: 'long', pct: agg.longPct },
  ];
  const dominantSpeed = speedCandidates.sort((a, b) => b.pct - a.pct)[0];

  if (dominantSpeed && dominantSpeed.pct >= MISS_BIAS_THRESHOLD) {
    const strokesImpact = Number(
      ((dominantSpeed.pct - MISS_BIAS_NEUTRAL_TARGET) * agg.perRoundMisses * 0.7).toFixed(2),
    );

    const evidence: InsightEvidence = {
      metric: 'putt_miss_bias_speed',
      metric_label: 'Miss-speed bias (short vs long)',
      unit: 'percent',
      your_value: dominantSpeed.pct,
      your_value_display: `${Math.round(dominantSpeed.pct * 100)}% ${dominantSpeed.tag}`,
      comparison_value: MISS_BIAS_NEUTRAL_TARGET,
      comparison_label: 'Neutral (50/50 split)',
      comparison_source: 'absolute_target',
      sample_n: agg.totalTaggedMisses,
      window_days: MISS_BIAS_WINDOW_DAYS,
      window_start: windowStart,
      window_end: windowEnd,
      strokes_impact: strokesImpact,
      strokes_impact_method: 'rough_estimate',
      confidence: 0,
      confidence_factors: {
        sample_adequacy: Math.min(agg.totalTaggedMisses / 40, 1),
        recency: 1.0,
        variance: Math.min(1, Math.max(0, dominantSpeed.pct - MISS_BIAS_NEUTRAL_TARGET) / 0.5),
      },
      detail: {
        low_pct: Number(agg.lowPct.toFixed(3)),
        high_pct: Number(agg.highPct.toFixed(3)),
        short_pct: Number(agg.shortPct.toFixed(3)),
        long_pct: Number(agg.longPct.toFixed(3)),
        dominant_tag: dominantSpeed.tag,
        rounds_in_window: agg.totalRounds,
      },
    };

    const bias = dominantSpeed.tag === 'short' ? 'leave_short' : 'leave_long';
    const title = `Putt misses leak ${dominantSpeed.tag.toUpperCase()} — ${Math.round(dominantSpeed.pct * 100)}%`;
    const content = composeMissBiasContent(
      'speed',
      dominantSpeed.tag,
      dominantSpeed.pct,
      agg.totalTaggedMisses,
      strokesImpact,
      MISS_BIAS_WINDOW_DAYS,
    );
    const drillTags = ['putting', 'speed_control', bias];

    try {
      const insightId = await upsertInsight(supabase, {
        player_id: playerId,
        category: 'putting',
        signature: `${playerId}:putt_miss_bias:speed`,
        title,
        content,
        evidence,
        drill_tags: drillTags,
      });
      await attachDrills(supabase, insightId, 'putting', drillTags);
    } catch (err) {
      await logServerError('putt-analytics.miss_bias.speed.upsert_failed', {
        action: 'generatePuttMissBiasInsights',
        featureArea: 'coachhelm.mining',
        playerId,
        metadata: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Re-exports for tests / orchestrator.
// ---------------------------------------------------------------------------

export const __internal = {
  BUCKETS,
  D2_BASELINE,
  BUCKET_PUTTS_PER_ROUND,
  DISTANCE_WINDOW_DAYS,
  MISS_BIAS_WINDOW_DAYS,
  MIN_BUCKET_ATTEMPTS,
  MIN_GAP_FRACTION,
  MISS_BIAS_MIN_TAGGED_MISSES,
  MISS_BIAS_THRESHOLD,
  aggregatePuttBuckets,
  aggregateMissBias,
  fetchPuttRows,
};
