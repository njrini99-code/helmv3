'use client';

/**
 * useCoachChatSend — the ONE shared optimistic-send hook for the v3 chat
 * surface (Fairway redesign, BUILD phase 2 / "chat-send-hook" group).
 *
 * This is a THIN extraction (mirror) of ChatDrawer.handleSend
 * (src/components/golf/coachhelm/v3/Chat/ChatDrawer.tsx:65-102). The
 * behavior is byte-for-byte identical:
 *   - same endpoint  POST /api/coachhelm/v3/chat/send
 *   - same payload   { conversation_id?, user_message }
 *   - same optimistic user-bubble stub (id `pending-${Date.now()}`)
 *   - same response contract { conversation_id, messages: ChatMessage[] }
 *   - same `pending-` rollback filter on error
 *
 * It is NOT new chat plumbing — the send route + ToolLoopAgent are
 * preserved. It exists so AskWorkspace + ChatDrawer (re-pointed in the
 * surfaces workflow) stop drifting from one another.
 *
 * Role-agnostic by design: this hook never hard-assumes a coach so a
 * future player-scoped Ask-entry can reuse it verbatim. The coach gate
 * lives on the route + send endpoint, not here.
 *
 * Ownership model mirrors the source: this hook owns NO chat state of
 * its own. The consumer holds `conversationId` + `messages` (so the
 * same hook can drive a drawer, a workspace, or a player Ask-entry) and
 * passes setters in. The hook owns only the in-flight `pending` flag and
 * the last `error`.
 */

import { useCallback, useRef, useState } from 'react';
import type { ChatMessage } from '@/lib/coachhelm/v3/chat/types';

/**
 * Re-export so consumers can import the message shape from one place.
 * (The shape itself is owned by the preserved chat types module.)
 */
export type { ChatMessage } from '@/lib/coachhelm/v3/chat/types';

/** Shape returned by POST /api/coachhelm/v3/chat/send on success. */
export interface ChatSendResponse {
  conversation_id: string;
  messages: ChatMessage[];
}

export interface UseCoachChatSendOptions {
  /**
   * Current conversation id (null/undefined → a new conversation is
   * created server-side from the first message). Mirrors ChatDrawer's
   * `conversationId` state.
   */
  conversationId: string | null;
  /**
   * Commit the authoritative conversation id returned by the server.
   * Mirrors `setConversationId(json.conversation_id)`.
   */
  setConversationId: (id: string) => void;
  /**
   * Apply a messages update. Accepts the React updater signature so the
   * hook can append the optimistic stub functionally and roll it back on
   * error, exactly like the source.
   */
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  /**
   * Optional callback after a successful send (e.g. revalidate the
   * conversation rail). Not present in the source; additive only.
   */
  onSuccess?: (response: ChatSendResponse) => void;
}

export interface UseCoachChatSendResult {
  /** Optimistic send. Resolves true on success, false on failure. */
  send: (text: string) => Promise<boolean>;
  /** True while a send is in flight (mirrors ChatDrawer `pending`). */
  pending: boolean;
  /** Last send error message, or null (mirrors ChatDrawer `error`). */
  error: string | null;
  /** Clear the current error without sending. */
  clearError: () => void;
}

const SEND_ENDPOINT = '/api/coachhelm/v3/chat/send';
/** Prefix used for optimistic-stub ids; the rollback filter keys off it. */
const PENDING_PREFIX = 'pending-';

/**
 * The shared optimistic-send hook. Pass in the consumer's conversation +
 * messages state; get back the `send` fn plus pending/error.
 */
export function useCoachChatSend(
  options: UseCoachChatSendOptions,
): UseCoachChatSendResult {
  const { conversationId, setConversationId, setMessages, onSuccess } = options;

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the latest options/state in a ref so `send` stays referentially
  // stable for the consumer's lifetime without going stale — the hook
  // returns the same `send` across renders even as conversationId changes.
  const latest = useRef({ conversationId, setConversationId, setMessages, onSuccess });
  latest.current = { conversationId, setConversationId, setMessages, onSuccess };

  const clearError = useCallback(() => setError(null), []);

  const send = useCallback(async (text: string): Promise<boolean> => {
    const {
      conversationId: convId,
      setConversationId: commitConvId,
      setMessages: applyMessages,
      onSuccess: handleSuccess,
    } = latest.current;

    setPending(true);
    setError(null);
    // P1-11 — one stable idempotency key per exchange. If the send is retried
    // (flaky network / double-tap) the route dedupes on this id instead of
    // creating a duplicate turn. Generated once here so a retry reuses it.
    const clientTurnId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${PENDING_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // Optimistic: stub the user bubble so the UI feels immediate.
    applyMessages((prev) => [
      ...prev,
      {
        id: `${PENDING_PREFIX}${Date.now()}`,
        conversation_id: convId ?? '',
        role: 'user',
        content: text,
        tool_calls: null,
        tool_results: null,
        cost_usd: null,
        created_at: new Date().toISOString(),
        client_turn_id: clientTurnId,
        status: null,
      },
    ]);
    try {
      const res = await fetch(SEND_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: convId ?? undefined,
          user_message: text,
          client_turn_id: clientTurnId,
        }),
      });
      const json = (await res.json()) as ChatSendResponse & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      commitConvId(json.conversation_id);
      applyMessages(json.messages);
      handleSuccess?.(json);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // Roll back the optimistic stub.
      applyMessages((prev) => prev.filter((m) => !m.id.startsWith(PENDING_PREFIX)));
      return false;
    } finally {
      setPending(false);
    }
  }, []);

  return { send, pending, error, clearError };
}
