'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  getGolfMessageResponses,
  respondToGolfMessage,
} from '@/app/golf/actions/message-responses';
import { fwHaptic } from '@/lib/fairway/haptics';

/** Tallies for one structured message, already collapsed for rendering. */
export interface ResponseTally {
  /** choice -> how many people picked it. */
  counts: Readonly<Record<string, number>>;
  /** What YOU picked, or null. */
  mine: string | null;
  /** Everyone who answered, for "8 responded". */
  total: number;
}

type Row = { message_id: string; user_id: string; choice: string };

const EMPTY: ResponseTally = { counts: {}, mine: null, total: 0 };

/**
 * Answers to structured messages in an open thread — batched load, realtime,
 * optimistic voting.
 *
 * State of record is the raw rows, not the tallies. Summarising on read is what
 * makes an optimistic vote and its own realtime echo converge instead of
 * double-counting: the row is keyed by (message, user), so re-applying it
 * replaces rather than adds. That is the same invariant the unique constraint
 * holds in the database, expressed once more on the client so the two cannot
 * disagree.
 */
export function useGolfMessageResponses(
  conversationId: string | null,
  messageIds: string[],
  currentUserId: string | null,
) {
  const [rows, setRows] = React.useState<Row[]>([]);

  // Stable key — `messageIds` is a fresh array every render.
  const idKey = React.useMemo(() => [...messageIds].sort().join(','), [messageIds]);

  React.useEffect(() => {
    if (!conversationId || !idKey) {
      setRows([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const loaded = await getGolfMessageResponses(idKey.split(','));
      if (!cancelled) setRows(loaded);
    })();
    return () => { cancelled = true; };
  }, [conversationId, idKey]);

  React.useEffect(() => {
    if (!conversationId) return;
    const supabase = createClient();
    const known = new Set(idKey ? idKey.split(',') : []);

    const channel = supabase
      .channel(`golf-message-responses:${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'golf_message_responses' },
        (payload) => {
          const next = (payload.new ?? payload.old) as Row | null;
          if (!next?.message_id || !known.has(next.message_id)) return;
          setRows(prev => {
            // Drop any existing answer from this person on this message FIRST.
            // An UPDATE (somebody changing their vote) arrives as one event and
            // must replace, not accumulate.
            const without = prev.filter(
              r => !(r.message_id === next.message_id && r.user_id === next.user_id),
            );
            return payload.eventType === 'DELETE' ? without : [...without, next];
          });
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [conversationId, idKey]);

  const tallies = React.useMemo(() => {
    const map = new Map<string, { counts: Record<string, number>; mine: string | null; total: number }>();
    for (const row of rows) {
      let t = map.get(row.message_id);
      if (!t) {
        t = { counts: {}, mine: null, total: 0 };
        map.set(row.message_id, t);
      }
      t.counts[row.choice] = (t.counts[row.choice] ?? 0) + 1;
      t.total += 1;
      if (row.user_id === currentUserId) t.mine = row.choice;
    }
    return map;
  }, [rows, currentUserId]);

  const getFor = React.useCallback(
    (messageId: string): ResponseTally => tallies.get(messageId) ?? EMPTY,
    [tallies],
  );

  /**
   * Vote optimistically. Tapping your CURRENT answer withdraws it, which is the
   * behaviour every poll has and the reason `choice` can be null.
   */
  const respond = React.useCallback(
    async (messageId: string, choice: string) => {
      if (!currentUserId) return;
      fwHaptic('selection');

      const mineNow = rows.find(r => r.message_id === messageId && r.user_id === currentUserId);
      const next = mineNow?.choice === choice ? null : choice;
      const before = rows;

      setRows(prev => {
        const without = prev.filter(
          r => !(r.message_id === messageId && r.user_id === currentUserId),
        );
        return next === null ? without : [...without, { message_id: messageId, user_id: currentUserId, choice: next }];
      });

      const result = await respondToGolfMessage(messageId, next);
      // Roll the whole list back on failure rather than guessing at a repair —
      // the realtime echo will re-establish truth either way.
      if (!result.success) setRows(before);
    },
    [rows, currentUserId],
  );

  return { getFor, respond };
}
