'use client';

/**
 * ============================================================================
 * CoachHelm · chat · useCoachHelmChat — the ONE conversation store
 * ----------------------------------------------------------------------------
 * The full page and the side drawer run on this hook. Not two hooks that agree
 * today; one hook, so they cannot drift.
 *
 * That mattered concretely: the previous build had a drawer with its own
 * optimistic-send logic and a workspace with a near-copy, and they had already
 * diverged on error handling and retry. Anything the two surfaces genuinely
 * differ on — width, whether a history rail exists, how the composer docks —
 * is a layout decision made by the caller, not a second implementation.
 *
 * Wraps AI SDK 7's `useChat`, which owns the streaming transport, the message
 * part list, tool-call state and approval responses. What is added here:
 *
 *   · a stable idempotency key per user turn, so a retry cannot double-charge
 *     the model or create two turns;
 *   · visible page context (the player/event chip) sent as part of the message
 *     rather than smuggled in — the coach can always see and remove what is
 *     being sent on their behalf;
 *   · approve/deny helpers named for what they do, so an action card does not
 *     have to know about the SDK's approval protocol.
 * ========================================================================== */

import * as React from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import type { UIMessage } from 'ai';

const STREAM_ENDPOINT = '/api/coachhelm/v3/chat/stream';

/**
 * Context the current page contributes to a question.
 *
 * Always rendered as a removable chip. The product rule is that nothing is sent
 * on the coach's behalf that they cannot see: hidden page context makes an
 * assistant's answers feel arbitrary, because the coach cannot tell why the same
 * question produced a different answer on a different screen.
 */
export interface ChatContextChip {
  kind: 'player' | 'signal' | 'event' | 'focus_area' | 'goal';
  id: string;
  label: string;
}

export interface UseCoachHelmChatOptions {
  conversationId?: string | null;
  /** Messages restored from durable history, already in UI part form. */
  initialMessages?: UIMessage[];
  /** Chips the host page suggests. The coach may remove any of them. */
  initialContext?: ChatContextChip[];
  /**
   * Called once the server has minted the conversation for a brand-new thread.
   *
   * The page surface uses this to put the id in the address bar so a reload
   * resumes; the drawer deliberately does not, because it floats over whatever
   * page the coach is actually on and must not rewrite that URL.
   */
  onConversationId?: (id: string) => void;
}

export interface UseCoachHelmChatResult {
  messages: UIMessage[];
  status: 'ready' | 'submitted' | 'streaming' | 'error';
  error: Error | undefined;
  /** True while a turn is in flight — drives the composer's stop affordance. */
  busy: boolean;
  conversationId: string | null;

  context: ChatContextChip[];
  addContext: (chip: ChatContextChip) => void;
  removeContext: (id: string) => void;

  send: (text: string) => void;
  stop: () => void;
  retry: () => void;
  newConversation: () => void;

  /**
   * Answer a pending approval. The argument is the APPROVAL id
   * (`part.approval.id`), not the tool-call id — see `approve` below.
   */
  approve: (approvalId: string) => void;
  deny: (approvalId: string) => void;
}

export function useCoachHelmChat(options: UseCoachHelmChatOptions = {}): UseCoachHelmChatResult {
  const [conversationId, setConversationId] = React.useState<string | null>(
    options.conversationId ?? null,
  );
  const [context, setContext] = React.useState<ChatContextChip[]>(options.initialContext ?? []);

  // One key per user turn. Regenerated on a NEW question, reused on a retry —
  // that asymmetry is the whole point: a retry must dedupe against the turn it
  // is retrying, and a new question must not.
  const turnKey = React.useRef<string>(newKey());
  // The key the last QUESTION was sent under, so a retry can go back to it.
  // `turnKey` itself has already moved on by then — `onFinish` rotates it, and
  // it must keep doing so for the approval resubmit's sake (that request has to
  // carry a key the server has no stored answer for, or it is short-circuited
  // as an already-answered turn and the approved action never runs).
  const lastQuestionKey = React.useRef<string>(turnKey.current);

  const onConversationId = options.onConversationId;
  /**
   * Adopt the id the server minted for a brand-new thread.
   *
   * Without this the next question posts `conversation_id: null` again and the
   * server mints ANOTHER conversation — a two-question thread lands in the
   * history pane as two stubs, and reloading either one shows an empty page.
   * The id arrives on the response header, so the transport's `fetch` is the
   * one place that sees it.
   */
  const adoptConversation = React.useCallback(
    (id: string) => {
      setConversationId((prev) => {
        if (prev === id) return prev;
        onConversationId?.(id);
        return id;
      });
    },
    [onConversationId],
  );

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: STREAM_ENDPOINT,
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          const response = await fetch(input, init);
          const minted = response.headers.get('x-conversation-id');
          if (minted) adoptConversation(minted);
          return response;
        },
        prepareSendMessagesRequest: ({ messages }: { messages: UIMessage[] }) => ({
          body: {
            messages,
            conversation_id: conversationId,
            client_turn_id: turnKey.current,
          },
        }),
      }),
    [conversationId, adoptConversation],
  );

  const chat = useChat({
    transport,
    messages: options.initialMessages,
    // Recording an approval is a LOCAL state change: `addToolApprovalResponse`
    // writes the coach's answer into the message parts and stops there. Nothing
    // goes back to the server, so the suspended tool call is never resumed.
    //
    // Without this line, pressing Confirm was silent and total: no request, no
    // error, no toast. The action-run ledger showed it exactly — rows sitting at
    // `status='proposed'` with `decided_at` NULL and `error_message` NULL, which
    // is the signature of a decision that was taken but never delivered.
    //
    // This is the resubmit trigger. It fires once every approval in the last
    // assistant step has an answer, which is why it is the approval-specific
    // predicate and not `lastAssistantMessageIsCompleteWithToolCalls`: a card
    // with two pending confirmations must not post after the first click.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: () => {
      // A finished turn must not dedupe against the next question.
      turnKey.current = newKey();
    },
  });

  const send = React.useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      turnKey.current = newKey();
      lastQuestionKey.current = turnKey.current;
      // Context is prefixed as visible text, so the transcript records exactly
      // what the model was told — no invisible side channel.
      const prefix =
        context.length > 0
          ? `[Context: ${context.map((c) => `${c.kind.replace('_', ' ')} ${c.label}`).join('; ')}]\n`
          : '';
      void chat.sendMessage({ text: prefix + trimmed });
    },
    [chat, context],
  );

  const retry = React.useCallback(() => {
    // `regenerate()`, not `sendMessage()`.
    //
    // Retry used to re-SEND the question, on the theory that the server would
    // dedupe it by `client_turn_id`. It does not, for two reasons that compound:
    // `onFinish` fires on a failed turn and rotates `turnKey`, so the retry
    // already carries a NEW key by the time it is clicked; and the failed turn
    // had been persisted as an assistant row, so the dedupe it was relying on
    // would have replayed that failure anyway.
    //
    // The result in production was six identical copies of one question, each
    // written to the database with its own key, none of them answered. This is
    // the SDK's own retry primitive: it re-runs the last assistant turn and
    // appends no user message, so a failed question cannot fork into a thread
    // of duplicates however many times the coach presses the button.
    //
    // The key has to go back too. `regenerate()` re-posts the thread, whose
    // last entry is the user's question, so the server WILL upsert that turn —
    // and `upsertUserTurn` conflicts on (conversation_id, role, client_turn_id).
    // Under the rotated key that conflict target does not match and the upsert
    // inserts, which is the duplicate all over again. Restoring the question's
    // own key makes it an UPDATE of the row already there.
    turnKey.current = lastQuestionKey.current;
    void chat.regenerate();
  }, [chat]);

  const newConversation = React.useCallback(() => {
    setConversationId(null);
    setContext([]);
    turnKey.current = newKey();
    chat.setMessages([]);
  }, [chat]);

  const addContext = React.useCallback((chip: ChatContextChip) => {
    setContext((prev) => (prev.some((c) => c.id === chip.id) ? prev : [...prev, chip]));
  }, []);

  const removeContext = React.useCallback((id: string) => {
    setContext((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // `addToolApprovalResponse` keys on `id` — the APPROVAL id carried by the tool
  // part (`part.approval.id`) — NOT the tool-call id.
  //
  // This was previously called with `{ toolCallId }`. The SDK read `id` as
  // undefined, matched no pending approval, and did nothing. It should have been
  // a type error; it was not, because `src/types/ai-shim.d.ts` shadows the real
  // `ai` types and `@ai-sdk/react` resolves `AbstractChat` through that shim, so
  // the whole `chat` object degrades to a loosely-typed surface. Anything passed
  // here type-checks. Treat this call as unchecked and keep it matched to
  // `ChatAddToolApproveResponseFunction` in `node_modules/ai/dist/index.d.ts`.
  const approve = React.useCallback(
    (approvalId: string) => {
      void chat.addToolApprovalResponse({ id: approvalId, approved: true });
    },
    [chat],
  );

  const deny = React.useCallback(
    (approvalId: string) => {
      void chat.addToolApprovalResponse({ id: approvalId, approved: false });
    },
    [chat],
  );

  const busy = chat.status === 'submitted' || chat.status === 'streaming';

  return {
    messages: chat.messages as UIMessage[],
    status: chat.status,
    error: chat.error,
    busy,
    conversationId,
    context,
    addContext,
    removeContext,
    send,
    stop: chat.stop,
    retry,
    newConversation,
    approve,
    deny,
  };
}

function newKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `turn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
