'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * P-10 class awareness: which team a conversation belongs to (`golf_conversations.team_id`, nullable, ON DELETE SET NULL).
 * A 1:1 thread shows a player's class status only when it belongs to the coach's own team: a conversation with no team,
 * or with another team's, shows nothing (Must 3). The conversation list RPC doesn't return the column, so the open
 * thread reads it, once, and the answer is kept for the session.
 *
 * `undefined` while unknown (loading, a failed read, off): the line stays hidden, the safe direction. `null` is a
 * conversation with no team. Nothing is read unless `enabled`, so with class awareness off this makes no request.
 */
const known = new Map<string, string | null>();

export function useConversationTeam(conversationId: string | null, enabled: boolean): string | null | undefined {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!enabled || !conversationId || known.has(conversationId)) return;
    let live = true;
    void (async () => {
      try {
        const { data, error } = await createClient().from('golf_conversations').select('team_id').eq('id', conversationId).maybeSingle();
        if (!live || error || !data) return;
        known.set(conversationId, data.team_id ?? null);
        bump((n) => n + 1);
      } catch {
        /* unknown stays unknown: no line */
      }
    })();
    return () => {
      live = false;
    };
  }, [conversationId, enabled]);
  return enabled && conversationId ? known.get(conversationId) : undefined;
}

/** Test-only: forget what was read. */
export function __resetConversationTeamsForTests(): void {
  known.clear();
}
