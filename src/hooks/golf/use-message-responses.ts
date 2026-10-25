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
export type PollVoteResult = { ok: true } | { ok: false; reason: 'closed' | 'member' | 'session' | 'failed' };

/** Why a write was refused: the closed-poll guard (held OQ-68 trigger), RLS (not in the conversation), or anything else. */
function refusal(cause: unknown): 'closed' | 'member' | 'failed' {
  const e = cause as { code?: string; hint?: string; message?: string } | null;
  if (e && (`${e.hint ?? ''} ${e.message ?? ''}`.includes('golf_poll_closed'))) return 'closed';
  if (e?.code === '42501') return 'member';
  return 'failed';
}

/** Realtime bursts (a dozen votes in a second) re-read once, this long after the last one. */
export const RESPONSES_REFRESH_MS = 250;

export function useMessageResponses(conversationId: string, pollIds: string[], userId: string) {
  const client = useMemo(() => createClient(), []);
  const idsKey = JSON.stringify(pollIds);
  const ids = useMemo<string[]>(() => JSON.parse(idsKey), [idsKey]);
  const [rows, setRows] = useState<PollResponseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** The first read for this conversation's polls has answered, so a zero is a real zero and not "not loaded yet". */
  const [ready, setReady] = useState(false);
  /** The polls with a vote on its way. One poll saving never holds back a tap on another. */
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const scope = useRef(conversationId);
  scope.current = conversationId;
  const request = useRef(0);
  /** What the server last said, so a refused vote puts back only the viewer's own row and nobody else's. */
  const confirmed = useRef<PollResponseRow[]>([]);
  /** The answer the viewer last tapped on each poll, waiting to be written; the write in flight sends the latest. */
  const wanted = useRef(new Map<string, string | null>());
  const inFlight = useRef(new Set<string>());

  // The viewer's own optimistic rows, read by `refresh` while a write is in flight.
  const rowsMine = useRef<PollResponseRow[]>([]);
  rowsMine.current = rows.filter((r) => r.user_id === userId);

  const hasLiveSession = useCallback(async () => {
    const { data: { session }, error } = await client.auth.getSession();
    return !error && !!session?.access_token && (!userId || session.user?.id === userId);
  }, [client, userId]);

  const refresh = useCallback(async () => {
    const version = ++request.current;
    if (!conversationId || !ids.length) { setRows([]); setError(null); setReady(true); confirmed.current = []; return; }
    if (!(await hasLiveSession())) return;
    if (version !== request.current || scope.current !== conversationId) return;
    try {
      const loaded: PollResponseRow[] = [];
      for (let offset = 0; offset < ids.length; offset += 100) {
        const result = await fetchAllRowsResult<PollResponseRow>(
          (from, to) => client.from('golf_message_responses')
            .select('message_id,user_id,choice,updated_at').in('message_id', ids.slice(offset, offset + 100))
            // The unique pair, so pages never shift under a vote that lands between them.
            .order('message_id').order('user_id').range(from, to),
        );
        if (result.error) throw result.error;
        loaded.push(...(result.data ?? []));
      }
      if (version !== request.current || scope.current !== conversationId) return;
      confirmed.current = loaded;
      // A vote still being written keeps its tapped state until it lands.
      setRows(inFlight.current.size
        ? [...loaded.filter((r) => !(inFlight.current.has(r.message_id) && r.user_id === userId)), ...rowsMine.current.filter((r) => inFlight.current.has(r.message_id))]
        : loaded);
      setError(null);
      setReady(true);
    } catch (cause) {
      if (version !== request.current || scope.current !== conversationId) return;
      setError('Votes could not be loaded. Tap to retry.');
      if (isClientDeadlineAbort(cause)) return;
      console.error('Message poll votes failed to load:', describeError(cause));
    }
  }, [client, conversationId, hasLiveSession, ids, userId]);

  // Realtime re-reads, coalesced: one trailing read after the burst, never two at once.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);
  const again = useRef(false);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (running.current) { again.current = true; return; }
      running.current = true;
      void refreshRef.current().finally(() => {
        running.current = false;
        if (again.current) { again.current = false; scheduleRef.current(); }
      });
    }, RESPONSES_REFRESH_MS);
  }, []);
  const scheduleRef = useRef(schedule);
  scheduleRef.current = schedule;

  const idsRef = useRef(ids);
  idsRef.current = ids;

  useEffect(() => { setRows([]); setError(null); setReady(false); confirmed.current = []; }, [conversationId]);

  useEffect(() => {
    void refresh();
    if (!conversationId || !ids.length) return;
    const channel = observeRealtimeChannel(
      client.channel(`golf-responses:${conversationId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'golf_message_responses' }, (payload) => {
          // A vote on a poll outside this thread changes nothing here. DELETE events carry only the primary key, so
          // those still re-read.
          if (payload && payload.eventType !== 'DELETE') {
            const messageId = (payload.new as { message_id?: unknown } | null | undefined)?.message_id;
            if (typeof messageId === 'string' && !idsRef.current.includes(messageId)) return;
          }
          schedule();
        }),
      { feature: 'golf.messages', channelClass: 'golf_message_responses', subscriptionType: 'postgres_changes' },
    );
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    const { data: { subscription } } = client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') void refresh();
    });
    return () => {
      request.current += 1;
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      window.removeEventListener('focus', onFocus);
      subscription.unsubscribe();
      void client.removeChannel(channel);
    };
  }, [client, conversationId, ids.length, refresh, schedule]);

  /** Put the viewer's own row on one poll back to what the server last said; everyone else's stay as they are. */
  const restore = useCallback((messageId: string) => {
    const mine = (r: PollResponseRow) => r.message_id === messageId && r.user_id === userId;
    setRows((prev) => [...prev.filter((r) => !mine(r)), ...confirmed.current.filter(mine)]);
  }, [userId]);

  /**
   * `choice` null takes the viewer's vote back. The row changes on screen at once (the card's bar moves as the finger
   * lifts). Taps on one poll are written in order and the last one wins: a tap while that poll's write is in flight is
   * sent when it lands. A refused write puts back only the viewer's own row, then reads the poll again.
   */
  const vote = useCallback(async (messageId: string, choice: string | null): Promise<PollVoteResult> => {
    if (scope.current !== conversationId || !userId || !ids.includes(messageId)) return { ok: false, reason: 'failed' };
    wanted.current.set(messageId, choice);
    setRows((prev) => {
      const rest = prev.filter((r) => !(r.message_id === messageId && r.user_id === userId));
      return choice ? [...rest, { message_id: messageId, user_id: userId, choice, updated_at: new Date().toISOString() }] : rest;
    });
    if (inFlight.current.has(messageId)) return { ok: true };
    inFlight.current.add(messageId);
    setPending((p) => new Set(p).add(messageId));
    try {
      if (!(await hasLiveSession())) {
        wanted.current.delete(messageId);
        if (scope.current === conversationId) { restore(messageId); setError('Sign in again to vote.'); }
        return { ok: false, reason: 'session' };
      }
      while (wanted.current.has(messageId)) {
        const next = wanted.current.get(messageId) ?? null;
        wanted.current.delete(messageId);
        const result = next
          ? await client.from('golf_message_responses').upsert(
              { message_id: messageId, user_id: userId, choice: next, updated_at: new Date().toISOString() },
              { onConflict: 'message_id,user_id' },
            )
          : await client.from('golf_message_responses').delete().eq('message_id', messageId).eq('user_id', userId);
        if (result.error) throw result.error;
      }
      inFlight.current.delete(messageId);
      if (scope.current === conversationId) await refresh();
      return { ok: true };
    } catch (cause) {
      wanted.current.delete(messageId);
      inFlight.current.delete(messageId);
      const reason = refusal(cause);
      if (scope.current === conversationId) {
        restore(messageId);
        // Read the poll again first (it clears a read error), then say why the vote didn't save.
        await refresh();
        if (scope.current === conversationId) setError(reason === 'closed' ? 'Voting has ended.' : 'Your vote wasn’t saved. Try again.');
      }
      if (!isClientDeadlineAbort(cause)) console.error('Message poll vote failed to save:', describeError(cause));
      return { ok: false, reason };
    } finally {
      inFlight.current.delete(messageId);
      setPending((p) => {
        const n = new Set(p);
        n.delete(messageId);
        return n;
      });
    }
  }, [client, conversationId, hasLiveSession, ids, refresh, restore, userId]);

  return { rows, error, ready, pending, refresh, vote };
}

export type MessageResponsesState = ReturnType<typeof useMessageResponses>;
