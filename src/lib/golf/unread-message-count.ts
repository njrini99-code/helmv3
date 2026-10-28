/**
 * The Messages badge's unread count, shared by the coach and player badge actions (coach-notifications.ts,
 * player-notifications.ts). Not a server action: a plain module the two actions call with their own client.
 *
 * Unread: messages someone else sent after the viewer's `last_read_at` and has not deleted, summed over the viewer's
 * conversations.
 *
 * A conversation the viewer deleted is skipped (wiring review 2026-10-27, item 3). Delete is a per-person hide: it sets
 * the viewer's `hidden_at` and nothing else (conversation-hide.ts), so before this the deleted conversation's unread
 * messages stayed on the badge for good, with no row in the inbox to open and clear them. The rule is the inbox's own
 * (get_golf_conversations_with_details, migration 20261008160000): a hidden conversation is out of the inbox until a
 * message arrives after `hidden_at`, and from then on it is back and counts as any other conversation does, from
 * `last_read_at`, so the badge and the row it opens agree. Delete does not move `last_read_at`: other members read it
 * as "Seen by", and a delete is not a read.
 *
 * `null` means UNKNOWN (a read failed), never "no unread messages"; see the note in coach-notifications.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

type Sb = SupabaseClient<Database>;

/** One of the viewer's own participant rows. `hidden_at` is absent on a database without the hide migration. */
export interface ViewerParticipantRow {
  conversation_id: string;
  last_read_at: string | null;
  hidden_at?: string | null;
}

/** Postgres undefined_column; PostgREST also words it "column … does not exist". */
const NO_COLUMN = '42703';
const missingHiddenAt = (error: { code?: string | null; message?: string | null }) =>
  error.code === NO_COLUMN || /hidden_at/.test(error.message ?? '');

/**
 * The viewer's participant rows with their read and hide marks. On a database without `hidden_at` (the column came
 * with a migration that was held until 2026-10-21) the rows are read again without it: nothing can be hidden there.
 */
export async function readViewerParticipants(
  supabase: Sb,
  viewerId: string,
): Promise<{ data: ViewerParticipantRow[] | null; error: unknown }> {
  const { data, error } = await supabase
    .from('golf_conversation_participants')
    .select('conversation_id, last_read_at, hidden_at')
    .eq('user_id', viewerId);
  if (!error || !missingHiddenAt(error)) return { data, error };
  const { data: plain, error: plainError } = await supabase
    .from('golf_conversation_participants')
    .select('conversation_id, last_read_at')
    .eq('user_id', viewerId);
  return { data: plain, error: plainError };
}

/** Whether a conversation the viewer hid is back in their inbox: a message (from anyone) arrived after the hide. */
async function backInInbox(supabase: Sb, conversationId: string, hiddenAt: string): Promise<boolean | null> {
  const { count, error } = await supabase
    .from('golf_messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('is_deleted', false)
    .gt('created_at', hiddenAt);
  if (error) return null;
  return (count ?? 0) > 0;
}

/**
 * The total unread for the badge over `participants` (the viewer's rows from `readViewerParticipants`). One unreadable
 * conversation makes the total unknown: a partial sum shown as complete is the same lie as a false zero, just smaller.
 */
export async function countUnreadMessages(
  supabase: Sb,
  viewerId: string,
  participants: ViewerParticipantRow[],
): Promise<number | null> {
  if (participants.length === 0) return 0;
  const counts = await Promise.all(
    participants.map(async (p) => {
      if (p.hidden_at) {
        const back = await backInInbox(supabase, p.conversation_id, p.hidden_at);
        if (back === null) return null;
        if (!back) return 0;
      }
      const { count, error } = await supabase
        .from('golf_messages')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', p.conversation_id)
        .neq('sender_id', viewerId)
        .eq('is_deleted', false)
        .gt('created_at', p.last_read_at || '1970-01-01');
      return error ? null : (count ?? 0);
    }),
  );
  return counts.some((c) => c === null) ? null : counts.reduce((sum: number, c) => sum + (c ?? 0), 0);
}
