'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

/**
 * Clubhouse typing on its own private channel (M4, docs/clubhouse/messages-v2/DATA.md): `golf-typing:<conversationId>`, joined with
 * `{ config: { private: true } }` after `realtime.setAuth()`, so only participants can send or listen. The old public topic
 * (`golf-conversation:<id>`, owned by `use-golf-messages.ts`) keeps carrying typing during the transition: Clubhouse listens to both and
 * sends to both, so a Fairway client still sees Clubhouse typing and Clubhouse still sees Fairway's. Fairway moves later.
 */
export const typingTopic = (conversationId: string) => `golf-typing:${conversationId}`;

export const TYPING_EXPIRY_MS = 5000;
/** The same typer's repeated "typing" events are sent at most this often. */
export const TYPING_THROTTLE_MS = 500;

export interface TypingEvent {
  userId: string;
  isTyping: boolean;
}

/**
 * Join the private typing channel of one conversation and call `onEvent` for each broadcast. Resolves after `setAuth`; the returned
 * cleanup works before and after the join. Pass the channel to `send` to broadcast.
 */
export function joinPrivateTyping(supabase: SupabaseClient, conversationId: string, onEvent: (e: TypingEvent) => void): { ready: Promise<RealtimeChannel | null>; leave: () => void } {
  let channel: RealtimeChannel | null = null;
  let left = false;
  const ready = (async () => {
    try {
      await supabase.realtime.setAuth();
    } catch {
      // No session token: the private join below is refused by the server and typing stays on the public topic.
    }
    if (left) return null;
    try {
      channel = supabase
        .channel(typingTopic(conversationId), { config: { private: true } })
        .on('broadcast', { event: 'typing' }, (payload) => {
          const { userId, isTyping } = (payload.payload ?? {}) as Partial<TypingEvent>;
          if (userId) onEvent({ userId, isTyping: !!isTyping });
        })
        .subscribe();
    } catch {
      return null;
    }
    return channel;
  })();
  return {
    ready,
    leave: () => {
      left = true;
      if (channel) void Promise.resolve(supabase.removeChannel(channel)).catch(() => undefined);
    },
  };
}

/**
 * The open conversation's private typing: who is typing now (each typer expires on their own clock) and a sender for the viewer's own
 * typing. Merge `typingUserIds` with the public hook's; send through both.
 */
export function usePrivateTyping(conversationId: string | null, viewerUserId: string, expiryMs: number = TYPING_EXPIRY_MS): { typingUserIds: string[]; send: (isTyping: boolean) => void } {
  const [ids, setIds] = useState<string[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const last = useRef(0);
  useEffect(() => {
    setIds([]);
    if (!conversationId || !viewerUserId) return;
    // The client needs the browser's Supabase env; without it (a test, a preview) typing simply stays on the public topic.
    let supabase: SupabaseClient;
    try {
      supabase = createClient();
    } catch {
      return;
    }
    const timers = new Map<string, number>();
    const drop = (id: string) => {
      window.clearTimeout(timers.get(id));
      timers.delete(id);
      setIds((now) => now.filter((x) => x !== id));
    };
    const joined = joinPrivateTyping(supabase, conversationId, ({ userId, isTyping }) => {
      if (userId === viewerUserId) return;
      if (!isTyping) return drop(userId);
      window.clearTimeout(timers.get(userId));
      timers.set(userId, window.setTimeout(() => drop(userId), expiryMs));
      setIds((now) => (now.includes(userId) ? now : [...now, userId]));
    });
    void joined.ready.then((c) => {
      channelRef.current = c;
    }).catch(() => undefined);
    return () => {
      for (const t of timers.values()) window.clearTimeout(t);
      channelRef.current = null;
      joined.leave();
    };
  }, [conversationId, viewerUserId, expiryMs]);
  const send = useCallback(
    (isTyping: boolean) => {
      const channel = channelRef.current;
      if (!channel || !viewerUserId) return;
      const now = Date.now();
      if (isTyping && now - last.current < TYPING_THROTTLE_MS) return;
      last.current = now;
      void channel.send({ type: 'broadcast', event: 'typing', payload: { userId: viewerUserId, isTyping } });
    },
    [viewerUserId],
  );
  return { typingUserIds: ids, send };
}
