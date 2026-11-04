'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export const TYPING_EXPIRY_MS = 5000;
export const TYPING_CHANNEL_CAP = 30;

type Entries = Map<string, Map<string, number>>;

/** A row's or pin's typers: who is still inside their 5 seconds. Pure, so the expiry can be tested. */
export function typersAt(entries: Entries, now: number): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [conv, users] of entries) {
    const live = [...users].filter(([, until]) => until > now).map(([id]) => id);
    if (live.length) out.set(conv, live);
  }
  return out;
}

/**
 * Typing on rows and pins (owner, 31 Oct: "typing should be tracked"). Every composer already broadcasts `typing` on
 * `golf-conversation:<id>`; only the open thread listens today. This joins that channel for the conversations on screen, listens for
 * `typing` only, ignores the viewer's own id, and expires each typer 5 seconds after their last event. The open conversation is
 * skipped: its thread hook holds that channel, and joining one topic twice from one client breaks the first subscription. Capped at
 * 30 channels; rows past that show their preview. With `enabled` false nothing is joined.
 */
export function useTypingByConversation(viewerUserId: string, conversationIds: readonly string[], openId: string | null, enabled: boolean, seed?: ReadonlyMap<string, string[]>): ReadonlyMap<string, string[]> {
  const [typing, setTyping] = useState<ReadonlyMap<string, string[]>>(seed ?? new Map());
  const watched = useMemo(() => (enabled && !seed ? conversationIds.filter((id) => id !== openId).slice(0, TYPING_CHANNEL_CAP) : []), [conversationIds, enabled, openId, seed]);
  const key = watched.join('\u0000');
  useEffect(() => {
    if (!key) return;
    const supabase = createClient();
    const entries: Entries = new Map();
    let timer = 0;
    const publish = () => {
      const now = Date.now();
      setTyping(typersAt(entries, now));
      window.clearTimeout(timer);
      const next = Math.min(...[...entries.values()].flatMap((m) => [...m.values()]).filter((t) => t > now));
      if (Number.isFinite(next)) timer = window.setTimeout(publish, next - now + 1);
    };
    const channels = key.split('\u0000').map((id) =>
      supabase
        .channel(`golf-conversation:${id}`)
        .on('broadcast', { event: 'typing' }, (payload) => {
          const { userId, isTyping } = (payload.payload ?? {}) as { userId?: string; isTyping?: boolean };
          if (!userId || userId === viewerUserId) return;
          const users = entries.get(id) ?? new Map<string, number>();
          if (isTyping) users.set(userId, Date.now() + TYPING_EXPIRY_MS);
          else users.delete(userId);
          entries.set(id, users);
          publish();
        })
        .subscribe(),
    );
    return () => {
      window.clearTimeout(timer);
      for (const c of channels) void supabase.removeChannel(c);
      setTyping(new Map());
    };
  }, [key, viewerUserId]);
  return typing;
}
