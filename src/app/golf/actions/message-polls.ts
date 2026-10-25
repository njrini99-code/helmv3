'use server';

import { createClient } from '@/lib/supabase/server';
import type { Json, Tables } from '@/lib/types/database';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { notifyGolfMessageRecipients } from '@/lib/notifications/golf-message-fanout';
import { buildPollPayload, parsePollPayload, pollEndsPhraseServer, pollFallbackText, type PollDraft } from '@/lib/golf/message-polls';

/**
 * Polls in a thread (premium features P-2, handoff §4.34.2).
 *
 * A poll is an ordinary `golf_messages` row with `kind = 'poll'`, the question and options in `payload` and a plain
 * text copy in `content` (pollFallbackText) for everything that reads only `content`: the bell, pushes, the inbox
 * preview, search and the older Fairway app. Votes are `golf_message_responses` rows that the voter writes directly
 * under RLS (own row only, members of the conversation only), as reactions do; see use-message-responses.ts.
 *
 * No migration in production: `kind`, `payload`, `golf_message_responses`, its policies, unique constraint and
 * realtime publication are all live there (catalog read 2026-10-24). A fresh database replayed from migrations lacks
 * the response table's access contract until held 20261024090000_golf_message_responses_access.sql is applied.
 * Closing a poll is the sender's own UPDATE of `payload`, which `golf_messages_update_v2` allows (sender_id =
 * auth.uid()).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PollResult = { success: true; id: string } | { success: false; error: string };
/** A sent poll also carries its saved row, so the thread can draw it at once (D27) instead of waiting on realtime. */
type SendPollResult =
  | { success: true; id: string; row?: Tables<'golf_messages'> }
  | { success: false; error: string; earlierCopy?: true };

const PROBLEM_COPY = {
  question: 'Add a question of up to 140 characters.',
  options: 'Add 2 to 6 choices of up to 60 characters each.',
  duplicate: 'Two choices say the same thing.',
  closes: 'Pick an end time that hasn’t passed.',
  closes_far: 'Pick an end time within 30 days.',
} as const;

/**
 * `priorClientId` (D19): the id of a send that threw, passed only when the draft was edited after it. If that copy
 * landed, nothing is posted and the answer says so (`earlierCopy`), so the sheet can ask before a second copy goes out.
 * There is no payload compare anywhere: an unedited retry keeps its id and its 23505 is answered as the success it is.
 */
async function sendGolfPollImpl(conversationId: string, draft: PollDraft, clientMessageId?: string, priorClientId?: string): Promise<SendPollResult> {
  if (typeof conversationId !== 'string' || !UUID.test(conversationId)) return { success: false, error: 'Invalid conversation' };
  if (clientMessageId !== undefined && (typeof clientMessageId !== 'string' || !UUID.test(clientMessageId))) {
    return { success: false, error: 'Invalid message id' };
  }
  if (priorClientId !== undefined && (typeof priorClientId !== 'string' || !UUID.test(priorClientId) || priorClientId === clientMessageId)) {
    return { success: false, error: 'Invalid message id' };
  }
  if (!draft || typeof draft !== 'object' || !Array.isArray(draft.options)) return { success: false, error: PROBLEM_COPY.options };
  const built = buildPollPayload({
    question: String(draft.question ?? ''),
    options: draft.options.map((o) => String(o ?? '')),
    multi: draft.multi === true,
    closesAt: typeof draft.closesAt === 'string' ? draft.closesAt : null,
  });
  if (!built.ok) return { success: false, error: PROBLEM_COPY[built.problem] };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: participants, error: membersError } = await supabase
    .from('golf_conversation_participants')
    .select('user_id')
    .eq('conversation_id', conversationId);
  if (membersError) {
    await logServerError(`[sendGolfPoll] members read failed: ${describeError(membersError)}`, { action: 'golf.sendGolfPoll', featureArea: 'messaging' });
    return { success: false, error: 'Could not send the poll' };
  }
  if (!participants?.some((p) => p.user_id === user.id)) return { success: false, error: 'You are not in this conversation' };

  if (priorClientId) {
    const { data: prior, error: priorError } = await supabase
      .from('golf_messages')
      .select('id, sender_id, conversation_id, kind, is_deleted')
      .eq('id', priorClientId)
      .maybeSingle();
    if (priorError) {
      await logServerError(`[sendGolfPoll] earlier copy read failed: ${describeError(priorError)}`, { action: 'golf.sendGolfPoll', featureArea: 'messaging' });
      return { success: false, error: 'Could not send the poll' };
    }
    if (prior && prior.sender_id === user.id && prior.conversation_id === conversationId && prior.kind === 'poll' && !prior.is_deleted) {
      return { success: false, error: 'An earlier copy of this poll was already sent', earlierCopy: true };
    }
  }

  const content = pollFallbackText(built.payload);
  const { data, error } = await supabase
    .from('golf_messages')
    .insert({
      ...(clientMessageId ? { id: clientMessageId } : {}),
      conversation_id: conversationId,
      sender_id: user.id,
      content,
      read: false,
      kind: 'poll',
      payload: built.payload as unknown as Json,
    })
    .select('*')
    .single();

  if (error) {
    // A retry after a send that committed with only its answer lost: the same id, the same sender, a poll. Report it
    // as the success it is, as sendMessage does for text (23505 on the primary key).
    if (clientMessageId && error.code === '23505') {
      const { data: existing, error: existingError } = await supabase
        .from('golf_messages')
        .select('id, sender_id, conversation_id, kind')
        .eq('id', clientMessageId)
        .maybeSingle();
      if (existingError) {
        await logServerError(`[sendGolfPoll] retry lookup failed: ${describeError(existingError)}`, { action: 'golf.sendGolfPoll', featureArea: 'messaging' });
      }
      if (existing && existing.sender_id === user.id && existing.conversation_id === conversationId && existing.kind === 'poll') {
        return { success: true, id: existing.id };
      }
    }
    await logServerError(`[sendGolfPoll] insert failed: ${describeError(error)}`, { action: 'golf.sendGolfPoll', featureArea: 'messaging' });
    return { success: false, error: 'Could not send the poll' };
  }

  await supabase.from('golf_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
  // D22: email keeps "Poll: …"; push and the Bell say who asked and when voting ends.
  const ends = pollEndsPhraseServer(built.payload.closes_at, Date.now());
  await notifyGolfMessageRecipients(conversationId, user.id, `Poll: ${built.payload.question}`, {
    titleFor: (senderName) => `Poll from ${senderName}`,
    pushBody: ends ? `${built.payload.question} Voting ends ${ends}.` : built.payload.question,
  });
  return { success: true, id: data.id, row: data };
}

async function closeGolfPollImpl(messageId: string): Promise<PollResult> {
  if (typeof messageId !== 'string' || !UUID.test(messageId)) return { success: false, error: 'Invalid poll' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { data: row, error: readError } = await supabase
    .from('golf_messages')
    .select('id, sender_id, kind, payload, is_deleted')
    .eq('id', messageId)
    .maybeSingle();
  if (readError) {
    await logServerError(`[closeGolfPoll] read failed: ${describeError(readError)}`, { action: 'golf.closeGolfPoll', featureArea: 'messaging' });
    return { success: false, error: 'Could not close the poll' };
  }
  if (!row || row.kind !== 'poll' || row.is_deleted) return { success: false, error: 'This poll is gone' };
  if (row.sender_id !== user.id) return { success: false, error: 'Only the person who sent the poll can close it' };
  const poll = parsePollPayload(row.payload);
  if (!poll) return { success: false, error: 'This poll can’t be closed here' };
  if (poll.closedAt) return { success: true, id: row.id };

  const payload = { ...(row.payload as Record<string, Json>), closed_at: new Date().toISOString() } as Json;
  const { error } = await supabase.from('golf_messages').update({ payload }).eq('id', messageId).eq('sender_id', user.id);
  if (error) {
    await logServerError(`[closeGolfPoll] update failed: ${describeError(error)}`, { action: 'golf.closeGolfPoll', featureArea: 'messaging' });
    return { success: false, error: 'Could not close the poll' };
  }
  return { success: true, id: row.id };
}

const observedSendGolfPoll = withAdminObserved('sendGolfPoll', { sport: 'golf', feature: 'messaging' }, sendGolfPollImpl);
const observedCloseGolfPoll = withAdminObserved('closeGolfPoll', { sport: 'golf', feature: 'messaging' }, closeGolfPollImpl);

export async function sendGolfPoll(conversationId: string, draft: PollDraft, clientMessageId?: string, priorClientId?: string): Promise<SendPollResult> {
  return observedSendGolfPoll(conversationId, draft, clientMessageId, priorClientId);
}

export async function closeGolfPoll(messageId: string): Promise<PollResult> {
  return observedCloseGolfPoll(messageId);
}
