/**
 * Worker-safe deterministic round-review generation — CoachHelm repair plan
 * §5.5/§14.8 (Package 6, the 30-day missing-review pre-warm).
 *
 * `generateAndStoreRoundReview` (src/app/golf/actions/round-review-system.ts)
 * is a `'use server'` action: it authenticates the CALLER via cookie-based
 * `createClient()`, checks `verifyRoundBelongsToPlayer` against that caller,
 * single-flights by round_id, calls `revalidatePath`, and its upsert uses
 * `ignoreDuplicates: false` (a race with an existing review REPLACES its
 * generated fields — fine for the on-open "regenerate mine" path, exactly
 * what plan §5.5 item 3 forbids for a backfill: "current review upsert can
 * replace generated fields during a race even though uniqueness prevents
 * duplicate rows"). None of that fits a cron/script driven by a service-role
 * client with no request or session.
 *
 * This module is the plain (non-`'use server'`) deterministic core the two
 * share: given an explicit admin-authorized client and a round id, compute
 * the same review content `computeAndStoreRoundReview` would — including the
 * repair plan §5.4/N4 "as-played" comparison baseline (rounds strictly
 * before the reviewed round only) — without any auth, revalidation, or
 * caller-identity assumption. The caller (script or action) decides how to
 * write the result.
 *
 * Deliberately deterministic-only: it does NOT call
 * `coachHelmIntelligence.generateRoundReview` / `isCoachHelmEnabledForPlayer`
 * (the v2 CoachHelm enhancement branch in `computeAndStoreRoundReview`).
 * Those already use `createAdminClient()` internally (worker-safe), but
 * whether their OWN player-history comparisons respect an as-played time
 * bound was not verified as part of this package — that engine is Package 7
 * (evidence packets / v3) territory, not this one. A pre-warmed review is
 * therefore `engine_version: 'rule-based-v2-prewarm'`, one generation behind
 * a live CoachHelm-enhanced review; the existing on-open path is untouched
 * and will still enhance a review the first time its owner opens it, subject
 * to whatever the CoachHelm engine's own history bound turns out to be.
 */
import {
  generateReviewContent,
  buildHoleBreakdowns,
  calculateComparisonAverages,
  type HoleParRow,
  type ComparisonRoundRow,
} from '@/app/golf/actions/round-review-content';
import type { RoundData, ShotRow, RoundReviewContent } from '@/app/golf/actions/round-review-system';
import type { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/types/database';

export type AdminSupabaseClient = ReturnType<typeof createAdminClient>;

export type DeterministicReviewResult =
  | {
      ok: true;
      roundId: string;
      playerId: string;
      content: RoundReviewContent;
      roundScore: number | null;
      roundScoreToPar: number | null;
    }
  | {
      ok: false;
      roundId: string;
      reason: 'not_found' | 'not_completed' | 'query_failed';
      detail?: string;
    };

/**
 * Compute (but do not write) the deterministic review for one round. Pure
 * with respect to persistence — issues only SELECTs.
 */
export async function buildDeterministicRoundReview(
  supabase: AdminSupabaseClient,
  roundId: string,
): Promise<DeterministicReviewResult> {
  const { data: round, error: roundError } = await supabase
    .from('golf_rounds')
    .select('id, player_id, course_name, round_date, total_score, score_to_par, total_putts, total_fairways_hit, total_fairways, total_gir, total_gir_possible, holes_played, status')
    .eq('id', roundId)
    .single();

  if (roundError || !round) {
    return { ok: false, roundId, reason: 'not_found', detail: roundError?.message };
  }

  const roundData = round as unknown as RoundData;
  if (roundData.status !== 'completed') {
    return { ok: false, roundId, reason: 'not_completed' };
  }

  const { data: shots, error: shotsError } = await supabase
    .from('golf_shots')
    .select('hole_number, shot_number, shot_type, club_type, distance_to_hole_before, distance_unit_before, result, lie_before, lie_after, miss_direction, putt_distance_feet, shot_distance, is_penalty, putt_made')
    .eq('round_id', roundId)
    .order('hole_number', { ascending: true })
    .order('shot_number', { ascending: true });
  if (shotsError) {
    return { ok: false, roundId, reason: 'query_failed', detail: shotsError.message };
  }

  const { data: holeRows, error: holesError } = await supabase
    .from('golf_holes')
    .select('hole_number, par, score, putts, fairway_hit, gir')
    .eq('round_id', roundId)
    .order('hole_number', { ascending: true });
  if (holesError) {
    return { ok: false, roundId, reason: 'query_failed', detail: holesError.message };
  }

  const shotRows = (shots ?? []) as unknown as ShotRow[];
  const holeParRows = (holeRows ?? []) as HoleParRow[];
  const hasData = shotRows.length > 0 || holeParRows.length > 0;
  const holeBreakdowns = hasData
    ? buildHoleBreakdowns(shotRows, roundData, holeParRows.length > 0 ? holeParRows : undefined)
    : [];

  // Repair plan §5.4 R4 / N4: as-played baseline. Comparison evidence must
  // predate the reviewed round — `.lt` (strict) on a DATE column also
  // excludes same-day rounds, matching computeAndStoreRoundReview's fix.
  const { data: playerRounds, error: cmpError } = await supabase
    .from('golf_rounds')
    .select('id, created_at, total_score, score_to_par, total_putts, total_gir, total_gir_possible, total_fairways_hit, total_fairways, holes_played')
    .eq('player_id', roundData.player_id)
    .eq('status', 'completed')
    .not('total_score', 'is', null)
    .neq('id', roundId)
    .lt('round_date', roundData.round_date)
    .order('round_date', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(20);
  if (cmpError) {
    return { ok: false, roundId, reason: 'query_failed', detail: cmpError.message };
  }

  const playerAvgs = calculateComparisonAverages((playerRounds ?? []) as ComparisonRoundRow[]);
  const content = generateReviewContent(roundData, holeBreakdowns, playerAvgs, shotRows);

  return {
    ok: true,
    roundId,
    playerId: roundData.player_id,
    content,
    roundScore: roundData.total_score,
    roundScoreToPar: roundData.score_to_par,
  };
}

/**
 * The INSERT payload for a pre-warmed review. Mirrors
 * `computeAndStoreRoundReview`'s insert path field-for-field, minus the
 * CoachHelm-enhancement fields (`primary_takeaway`, `next_practice_priority`
 * stay null — this path never runs the v2 enhancement). `engine_version` is
 * a distinct marker so a pre-warmed row is identifiable in provenance
 * queries (plan §16.2) and distinguishable from a live-generated review.
 *
 * Deliberately has NO `status`, `patterns_detected`, `coach_notes`,
 * `published_at`, `shared_with_coach`, etc. — the writer must use an
 * insert-only upsert (`onConflict: 'round_id', ignoreDuplicates: true`) so a
 * pre-existing row (including one with coach-authored/published/shared
 * state) is never touched, only created when absent.
 */
export function toReviewInsertPayload(result: Extract<DeterministicReviewResult, { ok: true }>) {
  const { content } = result;
  const highlightsCount = Array.isArray(content.highlights) ? content.highlights.length : 0;
  const areasCount = Array.isArray(content.areasForImprovement) ? content.areasForImprovement.length : 0;
  const insightsCount = Array.isArray(content.deepInsights)
    ? content.deepInsights.length
    : Array.isArray(content.keyStats) ? content.keyStats.length : 0;

  return {
    round_id: result.roundId,
    player_id: result.playerId,
    round_stats: content as unknown as Json,
    summary: content.summary,
    primary_takeaway: null as string | null,
    next_practice_priority: null as string | null,
    highlights: content.highlights as unknown as Json,
    areas_to_review: content.areasForImprovement as unknown as Json,
    highlights_count: highlightsCount,
    areas_count: areasCount,
    insights_count: insightsCount,
    round_score: result.roundScore,
    round_score_to_par: result.roundScoreToPar,
    engine_version: 'rule-based-v2-prewarm',
    updated_at: new Date().toISOString(),
  };
}

export type ReviewInsertPayload = ReturnType<typeof toReviewInsertPayload>;

export type WriteReviewResult =
  | { outcome: 'created'; id: string }
  // ignoreDuplicates:true + zero rows returned = something else (on-open
  // generation, a concurrent prewarm run) won the race between the
  // preliminary existence check and this write. Not an error, and — because
  // this is INSERT-only — the winner's row, including any coach-authored
  // content, was never touched by us.
  | { outcome: 'skipped_existing' }
  | { outcome: 'failed'; detail: string };

/**
 * The ONE place this tool writes a review row. Insert-only by construction:
 * `ignoreDuplicates` is always `true` here, never a caller-supplied option,
 * so a pre-warm write can create a missing review but can never replace an
 * existing one's generated fields, coach notes, publication state, sharing
 * state, or focus-area links — satisfying plan §5.5 item 3.
 */
export async function writeReviewIfAbsent(
  supabase: AdminSupabaseClient,
  payload: ReviewInsertPayload,
): Promise<WriteReviewResult> {
  const { data, error } = await supabase
    .from('golf_round_reviews')
    .upsert(payload, { onConflict: 'round_id', ignoreDuplicates: true })
    .select('id');

  if (error) return { outcome: 'failed', detail: error.message };
  if (!data || data.length === 0) return { outcome: 'skipped_existing' };
  return { outcome: 'created', id: data[0]!.id };
}
