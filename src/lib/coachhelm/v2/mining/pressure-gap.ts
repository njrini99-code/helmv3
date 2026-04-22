/**
 * Pressure-gap insight generator — Group C4.
 *
 * generatePressureGapInsight(playerId) — compares the player's average round
 * score in "practice" rounds vs "tournament"/"qualifier" rounds over the last
 * 365 days. Emits ONE insight when the tournament-minus-practice gap is
 * >= 1.5 strokes and both samples clear their minimums.
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
// Constants
// ---------------------------------------------------------------------------

const WINDOW_DAYS = 365;
const MIN_PRACTICE_ROUNDS = 5;
const MIN_COMPETITIVE_ROUNDS = 4;
const MIN_GAP_STROKES = 1.5;
const SEPARATE_QUALIFIER_SAMPLE_FLOOR = 4;

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

interface RoundRow {
  round_type: string | null;
  total_score: number | null;
  round_date: string | null;
}

async function fetchRounds(
  supabase: Supabase,
  playerId: string,
  windowStartIso: string,
): Promise<RoundRow[]> {
  const { data, error } = await supabase
    .from('golf_rounds')
    .select('round_type, total_score, round_date')
    .eq('player_id', playerId)
    .eq('status', 'completed')
    .gte('round_date', windowStartIso)
    .not('total_score', 'is', null);
  if (error) {
    throw new Error(`pressure-gap.fetchRounds failed: ${error.message}`);
  }
  return (data ?? []) as unknown as RoundRow[];
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export interface PressureGapAggregate {
  practiceCount: number;
  practiceAvg: number;
  practiceStddev: number;
  tournamentCount: number;
  tournamentAvg: number;
  tournamentStddev: number;
  qualifierCount: number;
  qualifierAvg: number;
  qualifierStddev: number;
  /** Combined tournament + qualifier — the "competitive" bucket. */
  competitiveCount: number;
  competitiveAvg: number;
  competitiveStddev: number;
}

function stats(xs: number[]): { mean: number; stddev: number } {
  if (xs.length === 0) return { mean: 0, stddev: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const stddev = xs.length > 1
    ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1))
    : 0;
  return { mean, stddev };
}

export function aggregateByRoundType(rows: RoundRow[]): PressureGapAggregate {
  const practice: number[] = [];
  const tournament: number[] = [];
  const qualifier: number[] = [];
  for (const r of rows) {
    if (r.total_score == null) continue;
    const type = (r.round_type ?? '').toLowerCase();
    if (type === 'practice') practice.push(r.total_score);
    else if (type === 'tournament') tournament.push(r.total_score);
    else if (type === 'qualifier') qualifier.push(r.total_score);
  }
  const competitive = [...tournament, ...qualifier];
  const p = stats(practice);
  const t = stats(tournament);
  const q = stats(qualifier);
  const c = stats(competitive);
  return {
    practiceCount: practice.length,
    practiceAvg: p.mean,
    practiceStddev: p.stddev,
    tournamentCount: tournament.length,
    tournamentAvg: t.mean,
    tournamentStddev: t.stddev,
    qualifierCount: qualifier.length,
    qualifierAvg: q.mean,
    qualifierStddev: q.stddev,
    competitiveCount: competitive.length,
    competitiveAvg: c.mean,
    competitiveStddev: c.stddev,
  };
}

// ---------------------------------------------------------------------------
// Content composition
// ---------------------------------------------------------------------------

function composeContent(agg: PressureGapAggregate, gap: number): string {
  const practice = agg.practiceAvg.toFixed(1);
  const competitive = agg.competitiveAvg.toFixed(1);
  const gapDisplay = gap.toFixed(1);
  const qualifierBit =
    agg.qualifierCount >= SEPARATE_QUALIFIER_SAMPLE_FLOOR
      ? ` Qualifier average: ${agg.qualifierAvg.toFixed(1)} over ${agg.qualifierCount} rounds.`
      : '';
  return (
    `Over the last ${WINDOW_DAYS} days, you averaged ${practice} across ${agg.practiceCount} practice rounds, ` +
    `but ${competitive} across ${agg.competitiveCount} tournament + qualifier rounds — a ${gapDisplay}-stroke pressure gap. ` +
    `Projected impact: ~${gapDisplay} strokes per competitive round.${qualifierBit} ` +
    `Your practice IS your ceiling; close the gap with tournament simulation and a locked pre-shot routine under first-tee arousal.`
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
// Generator
// ---------------------------------------------------------------------------

export async function generatePressureGapInsight(playerId: string): Promise<void> {
  let supabase: Supabase;
  try {
    supabase = createAdminClient();
  } catch (err) {
    await logServerError('pressure-gap.client_init', {
      action: 'generatePressureGapInsight',
      featureArea: 'coachhelm/v2/mining/pressure-gap',
      source: 'background_job',
      playerId,
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    return;
  }

  const windowStart = isoDateDaysAgo(WINDOW_DAYS);
  const windowEnd = todayIsoDate();

  let rows: RoundRow[];
  try {
    rows = await fetchRounds(supabase, playerId, windowStart);
  } catch (err) {
    await logServerError('pressure-gap.fetch_failed', {
      action: 'generatePressureGapInsight',
      featureArea: 'coachhelm/v2/mining/pressure-gap',
      source: 'background_job',
      playerId,
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    return;
  }
  if (rows.length === 0) return;

  const agg = aggregateByRoundType(rows);
  if (agg.practiceCount < MIN_PRACTICE_ROUNDS) return;
  if (agg.competitiveCount < MIN_COMPETITIVE_ROUNDS) return;

  const gap = agg.competitiveAvg - agg.practiceAvg;
  if (gap < MIN_GAP_STROKES) return;

  // Per-round impact = the gap itself (already per round).
  const strokesImpact = Number(gap.toFixed(2));

  // Variance factor: compare the competitive bucket stddev to a reasonable
  // round-score stddev of ~3 strokes. Higher stddev → lower confidence.
  const expectedStd = 3.0;
  const varianceFactor = Math.max(
    0,
    Math.min(1, 1 - agg.competitiveStddev / expectedStd),
  );

  const evidence: InsightEvidence = {
    metric: 'pressure_gap_practice_vs_tournament',
    metric_label: 'Practice vs tournament/qualifier average score',
    unit: 'strokes',
    your_value: Number(agg.competitiveAvg.toFixed(2)),
    your_value_display: `${agg.competitiveAvg.toFixed(1)} (competitive)`,
    comparison_value: Number(agg.practiceAvg.toFixed(2)),
    comparison_label: `your practice baseline (${agg.practiceAvg.toFixed(1)})`,
    comparison_source: 'your_baseline',
    sample_n: agg.competitiveCount,
    window_days: WINDOW_DAYS,
    window_start: windowStart,
    window_end: windowEnd,
    strokes_impact: strokesImpact,
    strokes_impact_method: 'historical_correlation',
    confidence: 0,
    confidence_factors: {
      sample_adequacy: Math.min(
        Math.min(agg.practiceCount, agg.competitiveCount) / 10,
        1,
      ),
      recency: 1.0,
      variance: varianceFactor,
    },
    detail: {
      practice_count: agg.practiceCount,
      practice_avg: Number(agg.practiceAvg.toFixed(2)),
      practice_stddev: Number(agg.practiceStddev.toFixed(2)),
      tournament_count: agg.tournamentCount,
      tournament_avg: Number(agg.tournamentAvg.toFixed(2)),
      tournament_stddev: Number(agg.tournamentStddev.toFixed(2)),
      qualifier_count: agg.qualifierCount,
      qualifier_avg:
        agg.qualifierCount >= SEPARATE_QUALIFIER_SAMPLE_FLOOR
          ? Number(agg.qualifierAvg.toFixed(2))
          : null,
      qualifier_stddev:
        agg.qualifierCount >= SEPARATE_QUALIFIER_SAMPLE_FLOOR
          ? Number(agg.qualifierStddev.toFixed(2))
          : null,
      competitive_count: agg.competitiveCount,
      competitive_avg: Number(agg.competitiveAvg.toFixed(2)),
      competitive_stddev: Number(agg.competitiveStddev.toFixed(2)),
      gap_strokes: Number(gap.toFixed(2)),
    },
  };

  const title =
    `Pressure gap: +${gap.toFixed(1)} strokes in tournaments vs practice`;
  const content = composeContent(agg, gap);
  const drillTags = ['pressure', 'tournament_simulation', 'pre_shot_routine'];

  try {
    const insightId = await upsertInsight(supabase, {
      player_id: playerId,
      category: 'pressure',
      signature: `${playerId}:pressure_gap:practice_vs_tournament`,
      title,
      content,
      evidence,
      drill_tags: drillTags,
    });
    await attachDrills(supabase, insightId, 'pressure', drillTags);
  } catch (err) {
    await logServerError('pressure-gap.upsert_failed', {
      action: 'generatePressureGapInsight',
      featureArea: 'coachhelm/v2/mining/pressure-gap',
      source: 'background_job',
      playerId,
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
  }
}

// ---------------------------------------------------------------------------
// Test exports
// ---------------------------------------------------------------------------

export const __internal = {
  WINDOW_DAYS,
  MIN_PRACTICE_ROUNDS,
  MIN_COMPETITIVE_ROUNDS,
  MIN_GAP_STROKES,
  SEPARATE_QUALIFIER_SAMPLE_FLOOR,
  aggregateByRoundType,
};
