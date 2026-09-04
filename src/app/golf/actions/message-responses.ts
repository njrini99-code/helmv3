'use server';

import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { describeError } from '@/lib/utils/describe-error';

/**
 * Answers to a structured message — an RSVP, a poll vote, a travel
 * acknowledgement. One row per person per message; the unique constraint on
 * (message_id, user_id) is what makes changing your mind an UPDATE rather than
 * a second vote, held by the DATABASE rather than by client discipline.
 */

export interface MessageResponse {
  message_id: string;
  user_id: string;
  choice: string;
}

export interface RespondResult {
  success: boolean;
  error?: string;
}

/** Longest choice we will store — the column caps at 64, this fails earlier. */
const MAX_CHOICE = 64;

async function respondToGolfMessageImpl(
  messageId: string,
  choice: string | null,
): Promise<RespondResult> {
  if (choice !== null && (!choice || choice.length > MAX_CHOICE)) {
    return { success: false, error: 'Invalid choice.' };
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: 'Not signed in.' };

  // `null` means "withdraw my answer" — tapping your current choice again.
  if (choice === null) {
    const { error } = await supabase
      .from('golf_message_responses')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', user.id);
    if (error) {
      await logServerError(`[respondToGolfMessage] delete: ${describeError(error)}`, {
        action: 'golf.messages.respond',
      });
      return { success: false, error: 'Could not update your answer.' };
    }
    return { success: true };
  }

  // Upsert on the unique constraint: changing an answer must not create a
  // second row, and racing two taps must not fail the second one.
  const { error } = await supabase
    .from('golf_message_responses')
    .upsert(
      { message_id: messageId, user_id: user.id, choice, updated_at: new Date().toISOString() },
      { onConflict: 'message_id,user_id' },
    );

  if (error) {
    await logServerError(`[respondToGolfMessage] upsert: ${describeError(error)}`, {
      action: 'golf.messages.respond',
    });
    return { success: false, error: 'Could not record your answer.' };
  }
  return { success: true };
}

const observedRespond = withAdminObserved(
  'respondToGolfMessage',
  { sport: 'golf', feature: 'messaging' },
  respondToGolfMessageImpl,
);

export async function respondToGolfMessage(messageId: string, choice: string | null) {
  return observedRespond(messageId, choice);
}

/**
 * Every answer on an open thread's structured messages, in one round trip.
 *
 * Batched for the same reason reactions are: a per-card fetch would open one
 * request per RSVP in a thread. Returns [] on failure — a card that cannot load
 * its counts shows no counts, it does not fail the conversation.
 */
async function getGolfMessageResponsesImpl(messageIds: string[]): Promise<MessageResponse[]> {
  if (!messageIds.length) return [];

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return [];

  const { data, error } = await supabase
    .from('golf_message_responses')
    .select('message_id, user_id, choice')
    .in('message_id', messageIds);

  if (error) {
    await logServerError(`[getGolfMessageResponses] ${describeError(error)}`, {
      action: 'golf.messages.getResponses',
    });
    return [];
  }
  return data ?? [];
}

const observedGetResponses = withAdminObserved(
  'getGolfMessageResponses',
  { sport: 'golf', feature: 'messaging' },
  getGolfMessageResponsesImpl,
);

export async function getGolfMessageResponses(messageIds: string[]) {
  return observedGetResponses(messageIds);
}
