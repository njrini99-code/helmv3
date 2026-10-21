'use server';

import { revalidatePath } from 'next/cache';

import { notifyCoachCommented } from '@/lib/coachhelm/v3/notifications/notify';
import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { verifyPlayerAccess } from '@/lib/auth/verify-player-access';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

/** The longest note a coach can leave on a round (the Fairway note's limit). */
const NOTE_MAX = 2000;

export interface SaveRoundCoachNoteResult {
  success: boolean;
  error?: string;
  /** The note as stored (trimmed). */
  data?: { note: string };
}

/**
 * A coach's note on one completed round, keyed by the round (Clubhouse round review).
 *
 * `annotateReview` writes the same column but needs a review id, and a round has a
 * `golf_round_reviews` row only once CoachHelm has generated a review for it (358 of 823 completed
 * rounds on 2026-10-21). The row is unique per round, so this upserts on `round_id` and writes only
 * `coach_notes` and `updated_at`: a generated review's content is never touched, and a note left on a
 * round with no review yet leaves a row with just the note.
 *
 * Only a coach of the player's team may write. A player, including a coach looking at their own round
 * as the player, is refused (`verifyPlayerAccess` answers `self` for them).
 */
async function saveRoundCoachNoteImpl(roundId: string, note: string): Promise<SaveRoundCoachNoteResult> {
  const trimmed = note.trim();
  if (!trimmed) return { success: false, error: 'Write the note first.' };
  if (trimmed.length > NOTE_MAX) return { success: false, error: `Keep the note under ${NOTE_MAX} characters.` };

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return { success: false, error: 'You need to be signed in to leave a note.' };

    const { data: round, error: roundError } = await supabase
      .from('golf_rounds')
      .select('id, player_id, status, is_test')
      .eq('id', roundId)
      .maybeSingle();
    if (roundError) return { success: false, error: 'Could not load the round. Please try again.' };
    // One answer for "no such round" and "not yours to see", so this cannot probe which rounds exist.
    if (!round || round.is_test) return { success: false, error: 'That round could not be found.' };
    if (round.status !== 'completed') return { success: false, error: 'A note can be left once the round is posted.' };

    const access = await verifyPlayerAccess(round.player_id, user.id, supabase);
    if (access.reason === 'unavailable') return { success: false, error: 'Could not verify your access. Please try again.' };
    if (!access.allowed || access.reason !== 'coach') return { success: false, error: 'Only a coach of this player’s team can leave a note.' };

    const updatedAt = new Date().toISOString();
    const { data: saved, error } = await supabase
      .from('golf_round_reviews')
      .upsert({ round_id: round.id, player_id: round.player_id, coach_notes: trimmed, updated_at: updatedAt }, { onConflict: 'round_id' })
      .select('id')
      .maybeSingle();
    if (error || !saved) {
      await logServerError(`saveRoundCoachNote upsert failed: ${error?.message ?? 'no row returned'}`, {
        action: 'saveRoundCoachNote',
        featureArea: 'round_reviews',
        extra: { roundId, errorCode: error?.code },
      });
      return { success: false, error: 'Could not save the note. Please try again.' };
    }

    await notifyCoachCommented({ player_id: round.player_id, round_id: round.id, review_id: saved.id });
    revalidatePath('/golf/dashboard/rounds/[id]', 'page');
    return { success: true, data: { note: trimmed } };
  } catch (error) {
    await logServerError(`saveRoundCoachNote failed: ${describeError(error)}`, {
      action: 'saveRoundCoachNote',
      featureArea: 'round_reviews',
      extra: { roundId },
    });
    return { success: false, error: 'An unexpected error occurred.' };
  }
}

const observedSaveRoundCoachNote = withAdminObserved('saveRoundCoachNote', { sport: 'golf', feature: 'round_review_ai' }, saveRoundCoachNoteImpl);

export async function saveRoundCoachNote(roundId: string, note: string): Promise<SaveRoundCoachNoteResult> {
  return observedSaveRoundCoachNote(roundId, note);
}
