/**
 * generateScramblingInsights — Group B2
 *
 * Design contract: docs/superpowers/plans/2026-04-22-insight-quality/00-design-contract.md
 *
 * Joins `golf_holes.up_and_down` to `approach_miss_details.lie_type` (the lie
 * the miss landed in == the lie the up-and-down attempt starts from) and
 * compares up-down percentage by lie against D2 baselines.
 *
 *   Baselines:  fairway 50% · rough 32% · bunker 38%
 *   Threshold:  |your_pct - baseline| >= 8pp
 *   Min sample: 6 attempts per lie
 *   Window:     60 days
 *
 * Category: short_game.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { upsertInsight, attachDrills } from '../insights/upsert';
import type { InsightEvidence } from '../insights/types';
import { calcConfidence } from '../insights/types';

type Supabase = SupabaseClient<Database>;

const WINDOW_DAYS = 60;
/**
 * P2 (2026-04-27): tightened from 6 → 15. With <15 up-and-down attempts the
 * Bernoulli proportion has a 95% CI roughly the width of the 8pp emit
 * threshold itself, so the insight was firing on noise (e.g. "Scrambling
 * from rough is 15%" on N=13). For sand specifically the bar is more
 * relaxed (6) — see SAND_MIN_ATTEMPTS — because tour-level sand-save
 * sample sizes are inherently small and the absolute success rate is
 * still meaningful at lower N.
 */
const MIN_ATTEMPTS = 15;
const SAND_MIN_ATTEMPTS = 6;
const GAP_THRESHOLD = 0.08; // 8 percentage points

type ScrambleLie = 'fairway' | 'rough' | 'bunker';
const LIE_ORDER: readonly ScrambleLie[] = ['fairway', 'rough', 'bunker'];

const BASELINE: Record<ScrambleLie, number> = {
  fairway: 0.5,
  rough: 0.32,
  bunker: 0.38,
};

const LIE_LABEL: Record<ScrambleLie, string> = {
  fairway: 'the fairway',
  rough: 'the rough',
  bunker: 'a bunker',
};

const DRILL_TAGS: Record<ScrambleLie, string[]> = {
  fairway: ['short_game', 'chip_proximity', 'pitch_control'],
  rough: ['short_game', 'pitch_control', 'flop_shot'],
  bunker: ['short_game', 'bunker_fundamentals'],
};

interface ScrambleAttempt {
  made: boolean;
  lie: ScrambleLie;
}

interface LieStats {
  lie: ScrambleLie;
  attempts: number;
  made: number;
  pct: number;
}

/**
 * Main entry — persists all emit-worthy scrambling insights via upsertInsight.
 */
export async function generateScramblingInsights(
  playerId: string,
): Promise<void> {
  const supabase = createAdminClient();
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd);
  windowStart.setDate(windowStart.getDate() - WINDOW_DAYS);

  try {
    const attempts = await fetchScrambleAttempts(supabase, playerId, windowStart);
    if (attempts.length === 0) return;

    const byLie = aggregateByLie(attempts);
    const windowStartIso = windowStart.toISOString().slice(0, 10);
    const windowEndIso = windowEnd.toISOString().slice(0, 10);

    for (const lie of LIE_ORDER) {
      const stats = byLie[lie];
      if (!stats) continue;
      const minForLie = lie === 'bunker' ? SAND_MIN_ATTEMPTS : MIN_ATTEMPTS;
      if (stats.attempts < minForLie) {
        if (stats.attempts > 0) {
          console.debug(
            `[insight-skip] reason=insufficient_sample type=scrambling_${lie} n=${stats.attempts} min=${minForLie}`,
          );
        }
        continue;
      }

      const baseline = BASELINE[lie];
      const gap = stats.pct - baseline; // signed — negative = worse than D2
      if (Math.abs(gap) < GAP_THRESHOLD) continue;

      await emitScrambleInsight(
        supabase,
        playerId,
        stats,
        gap,
        windowStartIso,
        windowEndIso,
      );
    }
  } catch (error) {
    await logServerError(
      'generateScramblingInsights failed',
      {
        action: 'generateScramblingInsights',
        featureArea: 'coachhelm/v2/mining/scrambling-analytics',
        source: 'background_job',
        playerId,
      },
      'error',
    ).catch(() => {
      /* never throw from the logger itself */
    });
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/* -------------------------------------------------------------------------- */
/*  Data access                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Internal shape of the miss-details-first join. We start at miss_details to
 * get the lie the up-down started from, hop through the approach shot into
 * golf_rounds (to filter by player + date), and pull the hole's up_and_down.
 */
interface JoinedRow {
  lie_type: string | null;
  golf_shots: {
    round_id: string;
    hole_number: number;
    golf_rounds: {
      player_id: string | null;
      round_date: string | null;
    } | null;
  } | null;
}

interface HoleRow {
  round_id: string;
  hole_number: number;
  up_and_down: boolean | null;
}

async function fetchScrambleAttempts(
  supabase: Supabase,
  playerId: string,
  windowStart: Date,
): Promise<ScrambleAttempt[]> {
  const windowStartIso = windowStart.toISOString().slice(0, 10);

  const { data: missRows, error: missErr } = await supabase
    .from('approach_miss_details')
    .select(
      `
      lie_type,
      golf_shots!inner (
        round_id,
        hole_number,
        golf_rounds!inner (
          player_id,
          round_date
        )
      )
    `,
    )
    .eq('golf_shots.golf_rounds.player_id', playerId)
    .gte('golf_shots.golf_rounds.round_date', windowStartIso);

  if (missErr) {
    throw new Error(
      `scrambling-analytics.fetch.misses failed: ${missErr.message}`,
    );
  }
  if (!missRows || missRows.length === 0) return [];

  const typedMisses = missRows as unknown as JoinedRow[];

  // Build a round-id set so we can pull the up_and_down flags in one query.
  const roundIds = Array.from(
    new Set(
      typedMisses
        .map((r) => r.golf_shots?.round_id)
        .filter((id): id is string => typeof id === 'string'),
    ),
  );
  if (roundIds.length === 0) return [];

  const { data: holeRows, error: holeErr } = await supabase
    .from('golf_holes')
    .select('round_id, hole_number, up_and_down')
    .in('round_id', roundIds);

  if (holeErr) {
    throw new Error(
      `scrambling-analytics.fetch.holes failed: ${holeErr.message}`,
    );
  }

  const holeIndex = new Map<string, boolean | null>();
  for (const row of (holeRows ?? []) as HoleRow[]) {
    holeIndex.set(`${row.round_id}:${row.hole_number}`, row.up_and_down);
  }

  const attempts: ScrambleAttempt[] = [];
  for (const row of typedMisses) {
    const shot = row.golf_shots;
    if (!shot) continue;
    const key = `${shot.round_id}:${shot.hole_number}`;
    const ud = holeIndex.get(key);
    if (ud === null || ud === undefined) continue;

    const lie = normalizeScrambleLie(row.lie_type);
    if (!lie) continue;

    attempts.push({ made: ud, lie });
  }

  return attempts;
}

/**
 * Collapse the raw lie_type strings ('fairway'/'rough'/'bunker'/'sand'/...)
 * into the three scramble-relevant buckets. Hazard-from-green lies aren't
 * scrambleable; drop them.
 */
export function normalizeScrambleLie(raw: string | null): ScrambleLie | null {
  if (!raw) return null;
  const value = raw.toLowerCase();
  if (value === 'fairway') return 'fairway';
  if (value === 'rough') return 'rough';
  if (value === 'bunker' || value === 'sand') return 'bunker';
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Aggregation                                                               */
/* -------------------------------------------------------------------------- */

function aggregateByLie(
  attempts: ScrambleAttempt[],
): Partial<Record<ScrambleLie, LieStats>> {
  const out: Partial<Record<ScrambleLie, LieStats>> = {};
  for (const a of attempts) {
    const stats = out[a.lie] ?? {
      lie: a.lie,
      attempts: 0,
      made: 0,
      pct: 0,
    };
    stats.attempts += 1;
    if (a.made) stats.made += 1;
    out[a.lie] = stats;
  }
  for (const lie of LIE_ORDER) {
    const stats = out[lie];
    if (stats && stats.attempts > 0) {
      stats.pct = stats.made / stats.attempts;
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Emission                                                                  */
/* -------------------------------------------------------------------------- */

async function emitScrambleInsight(
  supabase: Supabase,
  playerId: string,
  stats: LieStats,
  gap: number, // signed (your_pct - baseline)
  windowStart: string,
  windowEnd: string,
): Promise<void> {
  const baseline = BASELINE[stats.lie];
  const strokesImpact = Number((Math.abs(gap) * 2).toFixed(2));

  const evidence: InsightEvidence = {
    metric: `scrambling_${stats.lie}`,
    metric_label: `Up-and-down rate from ${LIE_LABEL[stats.lie]}`,
    unit: 'percent',
    your_value: Number(stats.pct.toFixed(3)),
    your_value_display: `${Math.round(stats.pct * 100)}%`,
    comparison_value: baseline,
    comparison_label: `D2 average from ${LIE_LABEL[stats.lie]}`,
    comparison_source: 'd2_avg',
    sample_n: stats.attempts,
    window_days: WINDOW_DAYS,
    window_start: windowStart,
    window_end: windowEnd,
    strokes_impact: strokesImpact,
    strokes_impact_method: 'peer_delta',
    confidence: 0,
    confidence_factors: {
      sample_adequacy: Math.min(stats.attempts / 15, 1),
      recency: 1,
      // Proportion stddev p(1-p); scale against baseline stddev for a ratio.
      variance: clamp01(
        1 - proportionStddev(stats.pct, stats.attempts) /
          Math.max(proportionStddev(baseline, 30), 0.01),
      ),
    },
    detail: {
      lie: stats.lie,
      attempts: stats.attempts,
      made: stats.made,
      gap_vs_baseline: Number(gap.toFixed(3)),
    },
  };
  evidence.confidence = calcConfidence(evidence);

  const polarity = gap >= 0 ? 'above' : 'below';
  const title =
    gap >= 0
      ? `Scrambling from ${LIE_LABEL[stats.lie]} is ${Math.round(stats.pct * 100)}% — above D2 average`
      : `Scrambling from ${LIE_LABEL[stats.lie]} is ${Math.round(stats.pct * 100)}% — below D2 average`;
  const content =
    `Of your ${stats.attempts} up-and-down attempts from ${LIE_LABEL[stats.lie]} ` +
    `in the last ${WINDOW_DAYS} days, you got up and down ${stats.made} times ` +
    `(${Math.round(stats.pct * 100)}%). D2 average from this lie is ` +
    `${Math.round(baseline * 100)}% — you're ${Math.abs(Math.round(gap * 100))} ` +
    `points ${polarity} peer. Closing this gap is worth roughly ` +
    `${strokesImpact} strokes per round.`;

  const drillTags = DRILL_TAGS[stats.lie];

  const insightId = await upsertInsight(supabase, {
    player_id: playerId,
    category: 'short_game',
    signature: `${playerId}:scrambling:${stats.lie}`,
    title,
    content,
    evidence,
    drill_tags: drillTags,
  });
  await attachDrills(supabase, insightId, 'short_game', drillTags);
}

function proportionStddev(p: number, n: number): number {
  if (n <= 0) return 1;
  return Math.sqrt((p * (1 - p)) / n);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
