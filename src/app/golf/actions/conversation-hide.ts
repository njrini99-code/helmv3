'use server';

import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { withAdminObserved } from '@/lib/admin/observed-action';

/**
 * "Delete conversation" for the signed-in participant: a per-person hide. It writes the caller's own
 * golf_conversation_participants row only (RLS `golf_participants_update`: user_id = auth.uid()); the conversation and
 * its messages are untouched, and the other participants keep theirs. A message that arrives after the hide brings the
 * conversation back (the inbox function skips a hidden one only until then). A team channel cannot be hidden.
 *
 * `hidden_at` is added by supabase/migrations/20261008160000_golf_conversation_hidden_at.sql, held until the owner
 * applies it (supabase/migrations/HELD.md). Until then the column does not exist, `database.ts` does not name it, and
 * both actions say so instead of failing: `canHideGolfConversations` is false and `hideGolfConversation` answers
 * "not available yet". After the apply and `npm run db:types`, the casts below go.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Postgres: undefined_column. PostgREST also words it "column … does not exist". */
const NO_COLUMN = '42703';

type HideResult = { success: true } | { success: false; error: string; unavailable?: boolean };

const missingColumn = (error: { code?: string | null; message?: string | null }) => error.code === NO_COLUMN || /hidden_at/.test(error.message ?? '');

/**
 * While the migration is held, every Messages load ran the probe below and it failed (42703 in the database log;
 * Sentry JAVASCRIPT-NEXTJS-1A0, ignored but still sent). A missing column is a fact about the database, not the caller,
 * so this server instance remembers it for a few minutes and answers false without a read; the first probe after that
 * picks the column up once the migration is applied. Only the missing-column answer is kept: any other failure, and
 * every yes, is asked again.
 */
const MISSING_COLUMN_TTL_MS = 5 * 60_000;
let columnMissingUntil = 0;
const rememberColumnMissing = () => {
  columnMissingUntil = Date.now() + MISSING_COLUMN_TTL_MS;
};

async function canHideGolfConversationsImpl(): Promise<boolean> {
  if (Date.now() < columnMissingUntil) return false;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  // A read of the column on the caller's own rows: it succeeds (with any number of rows) only once the column exists.
  const { error } = await supabase
    .from('golf_conversation_participants')
    .select('hidden_at' as '*')
    .eq('user_id', user.id)
    .limit(1);
  if (error && missingColumn(error)) rememberColumnMissing();
  return !error;
}

async function hideGolfConversationImpl(conversationId: string): Promise<HideResult> {
  if (typeof conversationId !== 'string' || !UUID.test(conversationId)) return { success: false, error: 'Invalid conversation' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: conversation, error: readError } = await supabase.from('golf_conversations').select('id, is_team_channel').eq('id', conversationId).maybeSingle();
  if (readError) {
    await logServerError(`[hideGolfConversation] read failed: ${describeError(readError)}`, { action: 'golf.hideGolfConversation', featureArea: 'messaging' });
    return { success: false, error: 'Could not delete the conversation' };
  }
  if (!conversation) return { success: false, error: 'You are not in this conversation' };
  if (conversation.is_team_channel) return { success: false, error: 'A team channel can’t be deleted' };

  const { data, error } = await supabase
    .from('golf_conversation_participants')
    .update({ hidden_at: new Date().toISOString() } as never)
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id)
    .select('id');
  if (error) {
    if (missingColumn(error)) {
      rememberColumnMissing();
      return { success: false, error: 'Deleting a conversation isn’t available yet', unavailable: true };
    }
    await logServerError(`[hideGolfConversation] update failed: ${describeError(error)}`, { action: 'golf.hideGolfConversation', featureArea: 'messaging' });
    return { success: false, error: 'Could not delete the conversation' };
  }
  if (!data || data.length === 0) return { success: false, error: 'You are not in this conversation' };
  return { success: true };
}

const observedCanHide = withAdminObserved('canHideGolfConversations', { sport: 'golf', feature: 'messaging' }, canHideGolfConversationsImpl);
const observedHide = withAdminObserved('hideGolfConversation', { sport: 'golf', feature: 'messaging' }, hideGolfConversationImpl);

/** Whether this database has the per-person hide (false until the migration is applied). */
export async function canHideGolfConversations(): Promise<boolean> {
  return observedCanHide();
}

export async function hideGolfConversation(conversationId: string): Promise<HideResult> {
  return observedHide(conversationId);
}
