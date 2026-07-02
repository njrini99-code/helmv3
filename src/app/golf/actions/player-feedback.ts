'use server';

/**
 * Player Feedback Loop — Team D.
 *
 * Server action invoked when a player rates / acknowledges / dismisses a
 * CoachHelm insight from the player-facing dashboard. Writes to the
 * `golf_insight_player_feedback` table (created by Team A) and records a
 * behavior-learner interaction so the engine can adapt to player preferences.
 *
 * Revalidates the player's CoachHelm and My Development screens so the UI
 * picks up feedback-driven changes without a hard reload.
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { BehaviorLearner } from '@/lib/coachhelm/v2/learning/behavior-learner';
import type { InteractionType } from '@/lib/coachhelm/v2/types';
import { logServerError } from '@/lib/server-error-logger';
import { withAdminObserved } from '@/lib/admin/observed-action';

const ratingSchema = z.object({
  insightId: z.string().uuid(),
  rating: z.enum(['helpful', 'not_helpful', 'dismissed', 'acknowledged']),
  note: z.string().max(500).optional(),
});

export type RatingInput = z.infer<typeof ratingSchema>;

/** Maps a player rating to the behavior-learner interaction_type label we
 *  persist for the engine's learning loop. */
const ratingToInteraction: Record<RatingInput['rating'], string> = {
  helpful: 'insight_rated_helpful',
  not_helpful: 'insight_rated_not_helpful',
  dismissed: 'insight_dismissed',
  acknowledged: 'insight_acknowledged',
};

/** Maps a player rating to the closest existing `InteractionType` used by
 *  the legacy `BehaviorLearner.learnFromInteraction` API so we stay compatible
 *  with the existing engine while Team B's refactor is in flight. */
const ratingToLegacyInteractionType: Record<RatingInput['rating'], InteractionType> = {
  helpful: 'action',
  not_helpful: 'dismiss',
  dismissed: 'dismiss',
  acknowledged: 'click',
};

/**
 * Flat, snake_case interaction payload used by the feedback loop. The shape
 * matches the event-log row we want to persist (and matches the contract in
 * `04-team-d-player-feedback-loop.md`). An internal adapter forwards the
 * payload to the legacy `BehaviorLearner.learnFromInteraction` API so we
 * don't need Team B's refactor to land first.
 */
export interface InsightInteractionEvent {
  interaction_type: string;
  target_type: 'insight';
  target_id: string;
  metadata: Record<string, unknown>;
}

interface InteractionRecorder {
  recordInteraction: (event: InsightInteractionEvent) => Promise<void>;
}

/**
 * Build a default recorder backed by `BehaviorLearner`. Tests inject their
 * own recorder via the third argument so they don't touch the DB.
 */
function buildDefaultRecorder(playerId: string, rating: RatingInput['rating']): InteractionRecorder {
  return {
    async recordInteraction(event: InsightInteractionEvent) {
      const learner = new BehaviorLearner(playerId, 'player');
      // Adapt the flat, snake_case event payload to the legacy
      // `UserInteraction` shape expected by `learnFromInteraction`.
      await learner.learnFromInteraction({
        entityId: playerId,
        entityType: 'player',
        interactionType: ratingToLegacyInteractionType[rating],
        targetType: event.target_type,
        targetId: event.target_id,
        metadata: event.metadata,
        timestamp: new Date().toISOString(),
      });
    },
  };
}

/**
 * Persists a player's rating for a coach insight.
 *
 * @param input          Validated feedback payload
 * @param supabaseOverride  Optional client (for tests / service-role callers)
 * @param recorderOverride  Optional behavior-learner recorder (for tests)
 */
async function rateInsightAsPlayerImpl(
  input: RatingInput,
  supabaseOverride?: SupabaseClient,
  recorderOverride?: InteractionRecorder
): Promise<{ success: true }> {
  const parsed = ratingSchema.parse(input);
  const supabase = supabaseOverride ?? (await createClient());

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Resolve the caller's golf_players row. We intentionally do NOT trust a
  // player_id sent from the client — we always derive it from auth.
  const { data: player, error: playerErr } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (playerErr) {
    // W15: inline logServerError removed here — withAdminObserved now
    // captures this throw at the export boundary (no more double-log).
    throw new Error('Player lookup failed');
  }
  if (!player) throw new Error('Player not found');

  // Confirm the insight exists and belongs to this player. We intentionally
  // read the raw row (no generic filter by player_id) so we can log a
  // meaningful "Forbidden" when the insight belongs to someone else.
  const { data: insight, error: insightErr } = await supabase
    .from('golf_coach_insights')
    .select('player_id, metadata')
    .eq('id', parsed.insightId)
    .maybeSingle();

  if (insightErr) {
    // W15: inline logServerError removed here — withAdminObserved now
    // captures this throw at the export boundary (no more double-log).
    throw new Error('Insight lookup failed');
  }
  if (!insight || insight.player_id !== (player as { id: string }).id) {
    throw new Error('Forbidden');
  }

  // Upsert the feedback row. `onConflict` requires the composite unique index
  // added in Team A migration 20260421100000.
  const feedbackPayload = {
    insight_id: parsed.insightId,
    player_id: (player as { id: string }).id,
    rating: parsed.rating,
    note: parsed.note ?? null,
  };

  // The generated `Database` types don't include the new table yet — Team A
  // applied the migration via execute_sql rather than apply_migration, so
  // types regen hasn't run. Cast the builder, not `supabase` itself, to keep
  // the rest of the function strictly typed.
  const feedbackTable = supabase.from('golf_insight_player_feedback') as unknown as {
    upsert: (
      row: typeof feedbackPayload,
      opts?: { onConflict: string }
    ) => Promise<{ error: { message: string } | null }>;
  };

  const { error: upsertErr } = await feedbackTable.upsert(feedbackPayload, {
    onConflict: 'insight_id,player_id',
  });

  if (upsertErr) {
    // W15: inline logServerError removed here — withAdminObserved now
    // captures this throw at the export boundary (no more double-log).
    throw new Error('Failed to save feedback');
  }

  // Fan the interaction into the behavior-learner event log so the engine's
  // personalization reflects the rating. Swallow & log recorder failures —
  // the primary write (the feedback row) already succeeded.
  const recorder = recorderOverride ?? buildDefaultRecorder((player as { id: string }).id, parsed.rating);
  const insightMetadata = (insight as { metadata: Record<string, unknown> | null }).metadata ?? {};

  try {
    await recorder.recordInteraction({
      interaction_type: ratingToInteraction[parsed.rating],
      target_type: 'insight',
      target_id: parsed.insightId,
      metadata: {
        insight_type: (insightMetadata as Record<string, unknown>).insight_type ?? 'unknown',
        rating: parsed.rating,
      },
    });
  } catch (learnerErr) {
    await logServerError(
      `rateInsightAsPlayer.recorder failed: ${learnerErr instanceof Error ? learnerErr.message : String(learnerErr)}`,
      {
        action: 'rateInsightAsPlayer.recorder',
        featureArea: 'player_feedback',
        extra: { insightId: parsed.insightId, rating: parsed.rating },
      },
      'warning'
    );
  }

  revalidatePath('/golf/dashboard/coachhelm');
  revalidatePath('/golf/dashboard/my-development');

  return { success: true };
}

const observedRateInsightAsPlayer = withAdminObserved(
  'rateInsightAsPlayer',
  { sport: 'golf', feature: 'player_coachhelm_dashboard' },
  rateInsightAsPlayerImpl,
);

export async function rateInsightAsPlayer(input: RatingInput, supabaseOverride?: SupabaseClient, recorderOverride?: InteractionRecorder): Promise<{ success: true }> {
  return observedRateInsightAsPlayer(input, supabaseOverride, recorderOverride);
}
