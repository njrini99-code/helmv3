'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { observeRealtimeChannel } from '@/lib/observability/supabase/realtime';
import { isClientDeadlineAbort } from '@/lib/client-deadline-abort';
import { describeError } from '@/lib/utils/describe-error';
import type { PollResponseRow } from '@/lib/golf/message-polls';

/**
 * Votes on the polls in one conversation (premium features P-2): `golf_message_responses`, one row per person per
 * message (unique on message_id + user_id). Built as useMessageReactions is: one read for the thread's poll ids, a
 * realtime channel that re-reads on any change (DELETE payloads carry only the primary key under the table's default
 * replica identity, so re-reading is simpler and exact), a re-read on focus and on a refreshed session.
 *
 * A vote is the voter's own row, written straight to the table under RLS: insert and update only `user_id =
 * auth.uid()`, and insert only in a conversation the voter is in (`golf_message_responses_insert`). Changing a vote is
 * an upsert on the unique pair; taking it back is a delete.
 */
export function useMessageResponses(conversationId: string, pollIds: string[], userId: string) {
  const client = useMemo(() => createClient(), []);
  const idsKey = JSON.stringify(pollIds);
  const ids = useMemo<string[]>(() => JSON.parse(idsKey), [idsKey]);
  const [rows, setRows] = useState<PollResponseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** The first read for this conversation's polls has answered, so a zero is a real zero and not "not loaded yet". */
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const scope = useRef(conversationId);
  scope.current = conversationId;
  const request = useRef(0);

  const hasLiveSession = useCallback(async () => {
    const { data: { session }, error } = await client.auth.getSession();
    return !error && !!session?.access_token && (!userId || session.user?.id === userId);
  }, [client, userId]);

  const refresh = useCallback(async () => {
    const version = ++request.current;
    if (!conversationId || !ids.length) { setRows([]); setError(null); setReady(true); return; }
    if (!(await hasLiveSession())) return;
    if (version !== request.current || scope.current !== conversationId) return;
    try {
      const loaded: PollResponseRow[] = [];
      for (let offset = 0; offset < ids.length; offset += 100) {
        const result = await fetchAllRowsResult<PollResponseRow>(
          (from, to) => client.from('golf_message_responses')
            .select('message_id,user_id,choice,updated_at').in('message_id', ids.slice(offset, offset + 100))
            .order('id').range(from, to),
        );
        if (result.error) throw result.error;
        loaded.push(...(result.data ?? []));
      }
      if (version !== request.current || scope.current !== conversationId) return;
      setRows(loaded);
      setError(null);
      setReady(true);
    } catch (cause) {
      if (version !== request.current || scope.current !== conversationId) return;
      setError('Votes could not be loaded. Tap to retry.');
      if (isClientDeadlineAbort(cause)) return;
      console.error('Message poll votes failed to load:', describeError(cause));
    }
  }, [client, conversationId, hasLiveSession, ids]);

  useEffect(() => { setRows([]); setError(null); setReady(false); }, [conversationId]);

  useEffect(() => {
    void refresh();
    if (!conversationId || !ids.length) return;
    const channel = observeRealtimeChannel(
      client.channel(`golf-responses:${conversationId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'golf_message_responses' }, () => { void refresh(); }),
      { feature: 'golf.messages', channelClass: 'golf_message_responses', subscriptionType: 'postgres_changes' },
    );
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    const { data: { subscription } } = client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') void refresh();
    });
    return () => {
      request.current += 1;
      window.removeEventListener('focus', onFocus);
      subscription.unsubscribe();
      void client.removeChannel(channel);
    };
  }, [client, conversationId, ids.length, refresh]);

  /**
   * `choice` null takes the viewer's vote back. The row changes on screen at once (the card's bar moves as the finger
   * lifts) and goes back to what the server holds if the write is refused.
   */
  const vote = useCallback(async (messageId: string, choice: string | null) => {
    if (scope.current !== conversationId || !userId || !ids.includes(messageId) || pending) return false;
    const before = rows;
    setPending(messageId);
    setRows((prev) => {
      const rest = prev.filter((r) => !(r.message_id === messageId && r.user_id === userId));
      return choice ? [...rest, { message_id: messageId, user_id: userId, choice, updated_at: new Date().toISOString() }] : rest;
    });
    try {
      if (!(await hasLiveSession())) {
        if (scope.current === conversationId) { setRows(before); setError('Sign in again to vote.'); }
        return false;
      }
      const result = choice
        ? await client.from('golf_message_responses').upsert(
            { message_id: messageId, user_id: userId, choice, updated_at: new Date().toISOString() },
            { onConflict: 'message_id,user_id' },
          )
        : await client.from('golf_message_responses').delete().eq('message_id', messageId).eq('user_id', userId);
      if (result.error) throw result.error;
      if (scope.current === conversationId) await refresh();
      return true;
    } catch (cause) {
      if (scope.current === conversationId) { setRows(before); setError('Your vote wasn’t saved. Try again.'); }
      if (isClientDeadlineAbort(cause)) return false;
      console.error('Message poll vote failed to save:', describeError(cause));
      return false;
    } finally {
      setPending(null);
    }
  }, [client, conversationId, hasLiveSession, ids, pending, refresh, rows, userId]);

  return { rows, error, ready, pending, refresh, vote };
}

export type MessageResponsesState = ReturnType<typeof useMessageResponses>;
