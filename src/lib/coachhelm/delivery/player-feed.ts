import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { EvidenceInsight, InsightPlayerFeedback } from '@/app/golf/actions/insight-delivery';
import { collapseParScoring, dedupeBySubject, rankEvidenceInsightsScored } from '@/app/golf/actions/insight-delivery-ranking';
import { deliverReads, READS_V1_FLAG, type ReadsDeliveryPlan } from '@/app/golf/actions/insight-delivery-reads';
import { coachhelmTeamAllowlist, isCoachHelmFlagEnabled, loadCanaryTeamsForPlayers, runWithCoachHelmTeams } from '@/lib/coachhelm/canary';
import { loadPinnedReadIds } from '@/lib/coachhelm/delivery/pinned-reads';
import { isFlagEnabled } from '@/lib/flags';
import { loadActiveGoals } from '@/lib/coachhelm/v3/goals/loader';
import { loadCoachWeightsForPlayer } from '@/lib/coachhelm/v3/ranking/score';

/**
 * P1-09 — load the player's latest feedback per insight from
 * `golf_insight_player_feedback`, keyed by insight_id. The canonical read paths
 * write feedback (player-feedback.ts) but historically NEVER read it back, so a
 * player-dismissed insight reappeared on refresh and useful/not-useful state
 * never persisted. We apply the latest feedback per (player, insight) — most
 * recent `created_at` wins, since the upsert keeps one row but a service-role
 * caller could leave history.
 *
 * Returns a Map<insight_id, InsightPlayerFeedback>. Best-effort: a query error
 * yields an empty map (no overlay) rather than throwing — the feed still
 * renders, just without feedback state, which is the safe degradation.
 */
export async function loadPlayerFeedbackByInsight(
  supabase: SupabaseClient<Database>,
  playerId: string,
): Promise<Map<string, InsightPlayerFeedback>> {
  const out = new Map<string, InsightPlayerFeedback>();
  const { data, error } = await supabase
    .from('golf_insight_player_feedback')
    .select('insight_id, rating, created_at')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });

  if (error || !data) return out;

  for (const row of data) {
    // Newest-first order means the FIRST row we see per insight is the latest.
    if (out.has(row.insight_id)) continue;
    const rating = row.rating;
    if (
      rating === 'helpful' ||
      rating === 'not_helpful' ||
      rating === 'dismissed' ||
      rating === 'acknowledged'
    ) {
      out.set(row.insight_id, { rating, created_at: row.created_at });
    }
  }
  return out;
}

/**
 * P1-09 — overlay the player's feedback onto a ranked insight list: attach
 * `player_feedback` for the UI chips and DROP rows the player has dismissed, so
 * a dismissal actually sticks across refreshes. Coach reads never call this, so
 * a player-only dismissal never removes the insight from a coach's view.
 */
export function applyPlayerFeedbackOverlay(
  insights: EvidenceInsight[],
  feedbackByInsight: Map<string, InsightPlayerFeedback>,
): EvidenceInsight[] {
  if (feedbackByInsight.size === 0) return insights;
  const out: EvidenceInsight[] = [];
  for (const insight of insights) {
    const fb = feedbackByInsight.get(insight.id);
    if (fb?.rating === 'dismissed') continue; // hide player-dismissed rows
    out.push(fb ? { ...insight, player_feedback: fb } : insight);
  }
  return out;
}

/**
 * CoachHelm Slice 0 delivery (flag `coachhelm_reads_v1_copy`, off by
 * default): fold overlapping reads into one and hold each player to 3 open
 * reads + 1 strength (`insight-delivery-reads.ts`). Off: the lists are what
 * they were, and nothing extra is read. On: the reads a live focus area came
 * from are loaded for these players, so the fold never hides one. Read once
 * per call so one response never mixes the two. (`rank_factors` on exposure
 * rows belongs to Slice 1, flag `coachhelm_support_v1`.)
 */
export async function readsDeliveryPlan(
  supabase: SupabaseClient,
  playerIds: readonly string[],
  includeMore = false,
): Promise<ReadsDeliveryPlan> {
  const allow = coachhelmTeamAllowlist();
  if (allow) return canaryReadsDeliveryPlan(supabase, playerIds, includeMore, allow);
  if (!isCoachHelmFlagEnabled(READS_V1_FLAG)) return { fold: false, cap: false };
  // null: the focus-area read failed (logged by the loader). Fold without
  // pins rather than not at all; a read behind a focus could then fold, as it
  // did before the pin rule, and nothing else changes.
  const pinned = await loadPinnedReadIds(supabase, playerIds);
  return { fold: true, cap: !includeMore, pinned: pinned ?? undefined };
}

/**
 * HELM_COACHHELM_TEAMS canary: the plan is decided per player, each in that
 * player's canary teams' scope (one batched team read), so a coach's mixed
 * feed folds and caps the listed players' reads and leaves the rest as they
 * were. A failed team read leaves every player out (fail closed).
 */
export async function canaryReadsDeliveryPlan(
  supabase: SupabaseClient,
  playerIds: readonly string[],
  includeMore: boolean,
  allow: ReadonlySet<string>,
): Promise<ReadsDeliveryPlan> {
  if (!isFlagEnabled(READS_V1_FLAG)) return { fold: false, cap: false };
  // null: the team read failed (logged); no player gets the plan.
  const teamsByPlayer = await loadCanaryTeamsForPlayers(supabase, playerIds, allow);
  const players = new Set(
    playerIds.filter((id) =>
      runWithCoachHelmTeams(teamsByPlayer?.get(id) ?? [], () => isCoachHelmFlagEnabled(READS_V1_FLAG)),
    ),
  );
  if (players.size === 0) return { fold: false, cap: false };
  const pinned = await loadPinnedReadIds(supabase, [...players]);
  return { fold: true, cap: !includeMore, pinned: pinned ?? undefined, players };
}

/**
 * The player's feed, ranked, folded, overlaid with their own feedback, capped and sliced, in that order. It writes nothing: the caller
 * that really shows the list records the exposure (`getInsightsForPlayer`), and the coach's lens never does (coachhelm-lenses R1).
 */
export async function shapePlayerFeed(
  supabase: SupabaseClient<Database>,
  playerId: string,
  rows: EvidenceInsight[],
  opts: { limit: number; includeMore?: boolean },
): Promise<{ shown: EvidenceInsight[]; rankedScored: Awaited<ReturnType<typeof rankEvidenceInsightsScored>> }> {
  // RANK-1: the shared `scoreInsight` composite, the SAME contract every surface uses. Coach weights default to 1.0 until calibration
  // lands; active goals float goal-touching rows up.
  const weights = await loadCoachWeightsForPlayer(supabase, playerId).catch(() => ({}));
  const activeGoals = await loadActiveGoals(playerId).catch(() => []);
  const rankedScored = await rankEvidenceInsightsScored(rows, weights, activeGoals, supabase);
  const ranked = rankedScored.map((r) => r.insight);
  // Finding 29: the same dedupe the coach feed uses, after collapsing the 3 par_scoring rows into one card. AFTER ranking, so the
  // surviving row is the highest-ranked of a group.
  const deduped = dedupeBySubject(collapseParScoring(ranked));
  // P1-09: the player's own feedback, BEFORE the slice so a dismissed row doesn't take a slot.
  const feedbackByInsight = await loadPlayerFeedbackByInsight(supabase, playerId).catch(() => new Map<string, InsightPlayerFeedback>());
  // Slice 0 (flag off by default): fold, then 3 open reads + 1 strength, after their dismissals and BEFORE the limit slice.
  const plan = await readsDeliveryPlan(supabase, [playerId], opts.includeMore === true);
  const shown = deliverReads(applyPlayerFeedbackOverlay(deduped, feedbackByInsight), plan).slice(0, opts.limit);
  return { shown, rankedScored };
}
