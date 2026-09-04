'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  getGolfMessageReactions,
  toggleGolfMessageReaction,
} from '@/app/golf/actions/message-reactions';
import { fwHaptic } from '@/lib/fairway/haptics';

/** Reactions for one message, already collapsed for rendering. */
export interface ReactionSummary {
  emoji: string;
  count: number;
  /** Did the current user pick this one? Drives the selected chip state. */
  mine: boolean;
}

type ReactionRow = { message_id: string; emoji: string; user_id: string };

/** message_id -> summaries, in a stable emoji order. */
export type ReactionMap = ReadonlyMap<string, ReactionSummary[]>;

const EMPTY: ReactionSummary[] = [];

/**
 * Collapse raw rows into per-message summaries.
 *
 * Sorted by count then emoji, NOT by insertion: a chip strip that reorders
 * itself every time somebody reacts makes the tap target under the user's
 * thumb move between the press and the release.
 */
function summarize(rows: ReactionRow[], userId: string | null): Map<string, ReactionSummary[]> {
  const byMessage = new Map<string, Map<string, ReactionSummary>>();
  for (const row of rows) {
    let forMessage = byMessage.get(row.message_id);
    if (!forMessage) {
      forMessage = new Map();
      byMessage.set(row.message_id, forMessage);
    }
    const current = forMessage.get(row.emoji);
    if (current) {
      current.count += 1;
      current.mine = current.mine || row.user_id === userId;
    } else {
      forMessage.set(row.emoji, { emoji: row.emoji, count: 1, mine: row.user_id === userId });
    }
  }

  const out = new Map<string, ReactionSummary[]>();
  for (const [messageId, forMessage] of byMessage) {
    out.set(
      messageId,
      [...forMessage.values()].sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji)),
    );
  }
  return out;
}

/**
 * Reactions for an open thread: batched load, realtime updates, optimistic
 * toggle.
 *
 * The state of record is the raw row list, not the summaries. Summarizing on
 * read means an optimistic toggle and a realtime echo of that same toggle
 * converge on one answer instead of double-counting — the row is keyed by
 * (message, user, emoji), so re-applying it is a no-op rather than an
 * increment. That is the same invariant the DB's unique constraint holds,
 * expressed once more on the client so the two cannot disagree.
 */
export function useGolfMessageReactions(
  conversationId: string | null,
  messageIds: string[],
  currentUserId: string | null,
) {
  const [rows, setRows] = React.useState<ReactionRow[]>([]);

  // A stable key for the id set — `messageIds` is a fresh array on every
  // render, so depending on it directly would refetch on every keystroke in
  // the composer.
  const idKey = messageIds.join(',');

  React.useEffect(() => {
    if (!conversationId || !idKey) {
      setRows([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const loaded = await getGolfMessageReactions(idKey.split(','));
      // `null` means the authenticated read failed. Keep the last confirmed
      // rows rather than turning failure into an empty, permissive-looking
      // reaction state.
      if (!cancelled && loaded !== null) setRows(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, idKey]);

  // Realtime. Scoped to the open thread's message ids by filtering on arrival
  // rather than in the subscription, because PostgREST filters cannot express
  // "in this set" on a realtime channel.
  React.useEffect(() => {
    if (!conversationId) return;
    const supabase = createClient();
    const known = new Set(idKey ? idKey.split(',') : []);

    const channel = supabase
      .channel(`golf-message-reactions:${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'golf_message_reactions' },
        (payload) => {
          const next = (payload.new ?? payload.old) as ReactionRow | null;
          if (!next?.message_id || !known.has(next.message_id)) return;

          setRows((prev) => {
            const without = prev.filter(
              (r) =>
                !(
                  r.message_id === next.message_id &&
                  r.user_id === next.user_id &&
                  r.emoji === next.emoji
                ),
            );
            // DELETE removes; INSERT re-adds. Both start from `without`, so a
            // duplicate INSERT event cannot inflate the count.
            return payload.eventType === 'DELETE'
              ? without
              : [...without, { message_id: next.message_id, emoji: next.emoji, user_id: next.user_id }];
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, idKey]);

  const reactions: ReactionMap = React.useMemo(
    () => summarize(rows, currentUserId),
    [rows, currentUserId],
  );

  /**
   * Optimistic toggle. The chip must respond to the thumb, not to the network
   * — spec §42: "Do not wait for server/network/navigation."
   */
  const toggle = React.useCallback(
    async (messageId: string, emoji: string) => {
      if (!currentUserId) return;
      fwHaptic('selection');

      const mine = (r: ReactionRow) =>
        r.message_id === messageId && r.user_id === currentUserId && r.emoji === emoji;
      let had = false;
      setRows((prev) => {
        had = prev.some(mine);
        return had
          ? prev.filter((r) => !mine(r))
          : [...prev, { message_id: messageId, emoji, user_id: currentUserId }];
      });

      const result = await toggleGolfMessageReaction(messageId, emoji);
      // Roll back only on a real failure. A success whose `active` disagrees
      // with the guess is reconciled the same way — the server is the
      // authority on which way the toggle actually went.
      if (!result.success || result.active === had) {
        setRows((prev) => {
          const without = prev.filter((r) => !mine(r));
          const shouldExist = result.success ? result.active === true : had;
          return shouldExist ? [...without, { message_id: messageId, emoji, user_id: currentUserId }] : without;
        });
      }
    },
    [currentUserId],
  );

  const getFor = React.useCallback(
    (messageId: string): ReactionSummary[] => reactions.get(messageId) ?? EMPTY,
    [reactions],
  );

  return { reactions, getFor, toggle };
}
