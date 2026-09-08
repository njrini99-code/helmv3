'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { logError } from '@/lib/error-logging';
import { describeError } from '@/lib/utils/describe-error';

export const MESSAGE_REACTIONS = [
  { emoji: '👍', label: 'Like' },
  { emoji: '❤️', label: 'Love' },
  { emoji: '😂', label: 'Laugh' },
  { emoji: '🎉', label: 'Celebrate' },
  { emoji: '😮', label: 'Surprised' },
  { emoji: '🙏', label: 'Thanks' },
] as const;

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
}

export function summarizeReactions(rows: readonly MessageReaction[], messageId: string, userId: string) {
  const groups = new Map<string, { emoji: string; count: number; active: boolean }>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.message_id !== messageId) continue;
    const key = `${row.user_id}:${row.emoji}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const group = groups.get(row.emoji) ?? { emoji: row.emoji, count: 0, active: false };
    group.count += 1;
    group.active ||= row.user_id === userId;
    groups.set(row.emoji, group);
  }
  return [...groups.values()].sort((a, b) => a.emoji.localeCompare(b.emoji));
}

/** Session-client reads and writes retain the database's participant RLS. */
export function useMessageReactions(conversationId: string, messageIds: string[], userId: string) {
  const client = useMemo(() => createClient(), []);
  const idsKey = JSON.stringify(messageIds);
  const ids = useMemo<string[]>(() => JSON.parse(idsKey), [idsKey]);
  const [rows, setRows] = useState<MessageReaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const scope = useRef(conversationId);
  scope.current = conversationId;
  const locked = useRef(false);
  const request = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++request.current;
    if (!conversationId || !ids.length) { setRows([]); setError(null); return; }
    try {
      // Bound the URL size as older messages accumulate in an open thread.
      const loaded: MessageReaction[] = [];
      for (let offset = 0; offset < ids.length; offset += 100) {
        const result = await fetchAllRowsResult<MessageReaction>(
          (from, to) => client.from('golf_message_reactions')
            .select('id,message_id,user_id,emoji').in('message_id', ids.slice(offset, offset + 100))
            .order('id').range(from, to),
        );
        if (result.error) throw result.error;
        loaded.push(...(result.data ?? []));
      }
      if (version !== request.current || scope.current !== conversationId) return;
      setRows(loaded);
      setError(null);
    } catch (cause) {
      if (version !== request.current || scope.current !== conversationId) return;
      setError('Reactions could not be loaded. Tap to retry.');
      logError(cause instanceof Error ? cause : new Error(describeError(cause)), { component: 'MessageReactions', action: 'load', sport: 'golf', conversationId });
    }
  }, [client, conversationId, ids]);

  useEffect(() => { setRows([]); setError(null); }, [conversationId]);

  useEffect(() => {
    void refresh();
    if (!conversationId) return;
    // DELETE payloads may contain only the primary key, so reload the visible
    // message set. The session's RLS filters realtime delivery and every read.
    const channel = client.channel(`golf-reactions:${conversationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'golf_message_reactions' }, () => { void refresh(); })
      .subscribe();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => {
      request.current += 1;
      window.removeEventListener('focus', onFocus);
      void client.removeChannel(channel);
    };
  }, [client, conversationId, refresh]);

  const setReaction = useCallback(async (messageId: string, emoji: string, active: boolean) => {
    if (scope.current !== conversationId || locked.current || !userId || !ids.includes(messageId) || !MESSAGE_REACTIONS.some((option) => option.emoji === emoji)) return false;
    locked.current = true;
    setPending(`${messageId}:${emoji}`);
    try {
      const result = active
        ? await client.from('golf_message_reactions').insert({ message_id: messageId, user_id: userId, emoji })
        : await client.from('golf_message_reactions').delete().eq('message_id', messageId).eq('user_id', userId).eq('emoji', emoji);
      if (result.error && !(active && result.error.code === '23505')) throw result.error;
      if (scope.current === conversationId) await refresh();
      return true;
    } catch (cause) {
      if (scope.current === conversationId) setError('Reaction was not saved. Try again.');
      logError(cause instanceof Error ? cause : new Error(describeError(cause)), { component: 'MessageReactions', action: 'save', sport: 'golf', conversationId, messageId });
      return false;
    } finally {
      locked.current = false;
      setPending(null);
    }
  }, [client, conversationId, ids, refresh, userId]);

  return { rows, error, pending, refresh, setReaction };
}

export type MessageReactionsState = ReturnType<typeof useMessageReactions>;
