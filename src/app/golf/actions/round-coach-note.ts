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
 * rounds on 2026-10-21). The row is unique per round, so a round with a row has only `coach_notes` and
 * `updated_at` changed (a generated review's content is never touched), and a round without one gets a row
 * with just the note, marked `status: 'pending'` so no reader takes it for a generated review.
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
    // A round with a review row gets only its note changed. A round with none gets a row that says it holds no
    // review yet (`status: 'pending'`, the state `generateRoundReview` treats as "still to generate"); the column's
    // default would read as a finished "draft" and make that action answer "Review already exists" with no content.
    const writeNote = () =>
      supabase.from('golf_round_reviews').update({ coach_notes: trimmed, updated_at: updatedAt }).eq('round_id', round.id).select('id').maybeSingle();
    let { data: saved, error } = await writeNote();
    if (!error && !saved) {
      ({ data: saved, error } = await supabase
        .from('golf_round_reviews')
        .insert({ round_id: round.id, player_id: round.player_id, coach_notes: trimmed, updated_at: updatedAt, patterns_detected: { status: 'pending' } })
        .select('id')
        .maybeSingle());
      // A review was generated between the two writes (the row is unique per round): the note goes on it.
      if (error?.code === '23505') ({ data: saved, error } = await writeNote());
    }
    if (error || !saved) {
      await logServerError(`saveRoundCoachNote write failed: ${error?.message ?? 'no row returned'}`, {
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
