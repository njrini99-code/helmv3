'use client';

import * as React from 'react';

/**
 * Runs `run(value)` once per deep link. The caller strips the param when it is
 * done, so a refetch can't re-apply it. "Once" is per link, not per mount: a
 * boolean latch ignored every link after the first while Messages stayed open.
 * The handled value clears when the param does, so the next link (even the
 * same one again) runs too. It is marked before `run` starts, so an async
 * handler isn't started twice while it awaits.
 */
export function useOncePerLink(
  value: string | null,
  ready: boolean,
  run: (value: string) => void,
) {
  const handled = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!value) {
      handled.current = null;
      return;
    }
    if (!ready || handled.current === value) return;
    handled.current = value;
    run(value);
  }, [value, ready, run]);
}

/**
 * `?conversation=<id>` deep link (P260): notifications set it so "New message
 * from X" opens the thread that fired. Each link is applied once, then
 * consumed (`onHandled` strips the param) whether or not it matched.
 */
export function useConversationDeepLink({
  conversationId,
  conversations,
  loading,
  onOpen,
  onHandled,
}: {
  conversationId: string | null;
  conversations: ReadonlyArray<{ id: string }>;
  loading: boolean;
  /** Select the linked thread; called only when the viewer is a participant. */
  onOpen: (id: string) => void;
  /** Consume the link (strip the param), whether or not it matched. */
  onHandled: () => void;
}) {
  const run = React.useCallback(
    (id: string) => {
      const target = conversations.find((c) => c.id === id);
      if (target) onOpen(target.id);
      onHandled();
    },
    [conversations, onOpen, onHandled],
  );
  useOncePerLink(conversationId, !loading, run);
}
