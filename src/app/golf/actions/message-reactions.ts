'use server';

import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { isGolfQuickReaction } from '@/lib/golf/message-reactions';
import { describeError } from '@/lib/utils/describe-error';

export interface GolfMessageReaction {
  message_id: string;
  emoji: string;
  user_id: string;
}

export interface ToggleReactionResult {
  success: boolean;
  /** True when the reaction now EXISTS, false when this call removed it. */
  active?: boolean;
  error?: string;
}

/**
 * Add or remove the caller's reaction. Idempotent by construction: the unique
 * constraint (message_id, user_id, emoji) means "react twice" can only ever be
 * "react then unreact", never two rows.
 *
 * RLS does the authorization — the INSERT policy requires both `user_id =
 * auth.uid()` and participation in the conversation carrying the message, so
 * this action never has to re-derive who may react to what. The auth call below
 * is still required (and enforced by the Review Gate): it is what supplies the
 * user id, and it fails closed if the session has expired.
 */
async function toggleGolfMessageReactionImpl(
  messageId: string,
  emoji: string,
): Promise<ToggleReactionResult> {
  if (!isGolfQuickReaction(emoji)) {
    return { success: false, error: 'Unsupported reaction.' };
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Not signed in.' };
  }

  // Does the caller's reaction already exist? Read first so the caller learns
  // which way the toggle went — the optimistic UI has already guessed, and a
  // wrong guess needs correcting rather than silently persisting.
  const { data: existing, error: readError } = await supabase
    .from('golf_message_reactions')
    .select('id')
    .eq('message_id', messageId)
    .eq('user_id', user.id)
    .eq('emoji', emoji)
    .maybeSingle();

  if (readError) {
    await logServerError(`[toggleGolfMessageReaction] read: ${describeError(readError)}`, {
      action: 'golf.messages.toggleReaction',
    });
    return { success: false, error: 'Could not update reaction.' };
  }

  if (existing) {
    const { error } = await supabase
      .from('golf_message_reactions')
      .delete()
      .eq('id', existing.id);
    if (error) {
      await logServerError(`[toggleGolfMessageReaction] delete: ${describeError(error)}`, {
        action: 'golf.messages.toggleReaction',
      });
      return { success: false, error: 'Could not remove reaction.' };
    }
    return { success: true, active: false };
  }

  const { error } = await supabase
    .from('golf_message_reactions')
    .insert({ message_id: messageId, user_id: user.id, emoji });

  if (error) {
    // A concurrent insert losing the unique-constraint race is the SAME end
    // state the caller asked for, not a failure to report at them.
    if (error.code === '23505') return { success: true, active: true };
    await logServerError(`[toggleGolfMessageReaction] insert: ${describeError(error)}`, {
      action: 'golf.messages.toggleReaction',
    });
    return { success: false, error: 'Could not add reaction.' };
  }

  return { success: true, active: true };
}

const observedToggleGolfMessageReaction = withAdminObserved(
  'toggleGolfMessageReaction',
  { sport: 'golf', feature: 'messaging' },
  toggleGolfMessageReactionImpl,
);

export async function toggleGolfMessageReaction(messageId: string, emoji: string) {
  return observedToggleGolfMessageReaction(messageId, emoji);
}

/**
 * Every reaction on an open thread's messages, in one round trip.
 *
 * Batched by message id rather than fetched per bubble: a 200-message thread
 * would otherwise open 200 requests to render a feature most messages do not
 * use. A failed read returns `null`, deliberately distinct from a genuinely
 * empty reaction set, so the client preserves its last known state instead of
 * silently presenting a failed read as no reactions.
 */
async function getGolfMessageReactionsImpl(messageIds: string[]): Promise<GolfMessageReaction[] | null> {
  if (!messageIds.length) return [];

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const { data, error } = await supabase
    .from('golf_message_reactions')
    .select('message_id, emoji, user_id')
    .in('message_id', messageIds);

  if (error) {
    await logServerError(`[getGolfMessageReactions] ${describeError(error)}`, {
      action: 'golf.messages.getReactions',
    });
    return null;
  }

  return data ?? [];
}

const observedGetGolfMessageReactions = withAdminObserved(
  'getGolfMessageReactions',
  { sport: 'golf', feature: 'messaging' },
  getGolfMessageReactionsImpl,
);

export async function getGolfMessageReactions(messageIds: string[]): Promise<GolfMessageReaction[] | null> {
  return observedGetGolfMessageReactions(messageIds);
}
