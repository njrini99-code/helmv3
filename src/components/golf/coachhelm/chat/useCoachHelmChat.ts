'use client';

/**
 * ============================================================================
 * CoachHelm · chat · useCoachHelmChat — the ONE conversation store
 * ----------------------------------------------------------------------------
 * Ask, the quick chat, the practice helper and Fairway's chat all run on this
 * hook. Anything the surfaces differ on (width, a history rail, how the
 * composer docks) is a layout decision made by the caller, not a second store.
 *
 * The server owns the conversation. This hook sends ONE thing per request: the
 * coach's new message, or their decision on a waiting card. It never sends the
 * thread back. What comes down is the app's own event stream
 * (`engine/protocol.ts`); the same reducer the server stores `ui_parts` with
 * folds it into the message being drawn, so what is on screen is what a reload
 * restores.
 *
 * What the hook adds on top of the stream:
 *   · a stable idempotency key per question, reused on a retry, so a retry of
 *     an answered question is sent the stored answer instead of a second run;
 *   · visible page context (the player/event chip) sent as part of the message
 *     rather than smuggled in: the coach can always see and remove what is
 *     being sent on their behalf;
 *   · approve/deny helpers named for what they do. Their argument is the card's
 *     id as the thread gives it (`part.approval.id`), which is the action's
 *     ledger key.
 * ========================================================================== */

import * as React from 'react';
import {
  applyChatEvent,
  createChatEventParser,
  type ChatEvent,
  type ChatMessageMetadata,
  type ChatUIMessage,
} from '@/lib/coachhelm/v3/chat/engine/protocol';
import { chatErrorKind, type ChatFailureKind } from '@/lib/coachhelm/v3/chat/error-message';

const STREAM_ENDPOINT = '/api/coachhelm/v3/chat/stream';
/** Re-render the thread at most this often while an answer streams: per-token renders made long answers stutter on an iPhone. */
const RENDER_INTERVAL_MS = 50;

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
  /** Player Ask's route. Left out, today's. */
  endpoint?: string;
  /** Which surface is asking: it decides the tools the server offers. Left out, the Ask tab. */
  surface?: 'ask' | 'quick_chat' | 'practice_helper';
  conversationId?: string | null;
  /**
   * Where the chat was opened from and what is selected there (a screen id and the ids on it), sent with each new
   * message so "how is he putting" on a player's page needs no name. The server checks every id against the caller's
   * own team and drops what it cannot use. Left out, nothing is sent.
   */
  screen?: Record<string, unknown> | null;
  /** Messages restored from durable history, already in UI part form. */
  initialMessages?: ChatUIMessage[];
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
  messages: ChatUIMessage[];
  status: 'ready' | 'submitted' | 'streaming' | 'error';
  /** The failure, when there is one. Always carries `kind` (`ChatFailureKind`): pick the notice by it, not by the sentence. */
  error: (Error & { kind?: ChatFailureKind; action?: string }) | undefined;
  /**
   * `thinking` while the model has been called and nothing of the answer has arrived. The server's word, not a guess.
   * The hook always sets it; it is optional in the type only so a hand-built result (a preview, a test) need not.
   */
  phase?: 'thinking' | null;
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
   * Answer a waiting card. The argument is the card's approval id
   * (`part.approval.id`), never the tool-call id.
   */
  approve: (approvalId: string) => void;
  deny: (approvalId: string) => void;
}

/** A refused request, in the shape `describeChatError` reads (a status and the response body). */
function refusal(status: number, body: string): Error {
  return Object.assign(new Error(body || `Request failed (${status})`), { statusCode: status, responseBody: body });
}

type Outgoing = { kind: 'message'; text: string; key: string } | { kind: 'decision'; key: string; approved: boolean };

export function useCoachHelmChat(options: UseCoachHelmChatOptions = {}): UseCoachHelmChatResult {
  const [conversationId, setConversationId] = React.useState<string | null>(options.conversationId ?? null);
  const [context, setContext] = React.useState<ChatContextChip[]>(options.initialContext ?? []);
  const [messages, setMessages] = React.useState<ChatUIMessage[]>(options.initialMessages ?? []);
  const [status, setStatus] = React.useState<UseCoachHelmChatResult['status']>('ready');
  const [error, setError] = React.useState<Error | undefined>(undefined);
  const [phase, setPhase] = React.useState<'thinking' | null>(null);

  // The thread as of the last event, ahead of what React has drawn: events fold in here and are flushed on a timer.
  const thread = React.useRef<ChatUIMessage[]>(messages);
  const conversation = React.useRef<string | null>(conversationId);
  const inFlight = React.useRef<AbortController | null>(null);
  const flushTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // The last question and the key it was sent under, so a retry dedupes against the turn it is retrying.
  const lastQuestion = React.useRef<{ text: string; key: string } | null>(null);
  // The last decision sent, so a Confirm whose response was lost can be sent again: the server runs a key at most once.
  const lastDecision = React.useRef<{ key: string; approved: boolean } | null>(null);
  const endpoint = options.endpoint ?? STREAM_ENDPOINT;
  const surface = options.surface;
  // Read when a message is sent, so the screen is the one the coach is on at that moment.
  const screen = React.useRef(options.screen ?? null);
  screen.current = options.screen ?? null;

  const onConversationId = options.onConversationId;
  /**
   * Adopt the id the server minted for a brand-new thread. Without it the next
   * question would post `conversation_id: null` again and mint ANOTHER
   * conversation: a two-question thread would land in history as two stubs.
   */
  const adoptConversation = React.useCallback(
    (id: string) => {
      if (conversation.current === id) return;
      conversation.current = id;
      setConversationId(id);
      onConversationId?.(id);
    },
    [onConversationId],
  );

  const flush = React.useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = null;
    setMessages(thread.current);
  }, []);
  const scheduleFlush = React.useCallback(() => {
    if (flushTimer.current) return;
    flushTimer.current = setTimeout(flush, RENDER_INTERVAL_MS);
  }, [flush]);

  // Leaving the page stops the answer. The stop is deferred by a tick and called off if the component mounts again at once:
  // React's StrictMode unmounts and remounts every component in development, and that must not cancel a question just asked.
  const leaving = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    if (leaving.current) clearTimeout(leaving.current);
    leaving.current = null;
    return () => {
      leaving.current = setTimeout(() => {
        inFlight.current?.abort();
        if (flushTimer.current) clearTimeout(flushTimer.current);
      }, 0);
    };
  }, []);

  const run = React.useCallback(
    async (outgoing: Outgoing) => {
      inFlight.current?.abort();
      const abort = new AbortController();
      inFlight.current = abort;
      setError(undefined);
      setStatus('submitted');

      // The message the response's events fold into: a new assistant message, or the one holding the card being answered.
      let target: string | null = null;
      const fold = (event: ChatEvent) => {
        if (event.type === 'message_start') {
          adoptConversation(event.conversation_id);
          const holder = outgoing.kind === 'decision' ? thread.current.find((m) => m.role === 'assistant' && m.parts.some((p) => (p as { approval?: { id?: unknown } }).approval?.id === outgoing.key)) : undefined;
          if (event.resumed && holder) {
            target = holder.id;
          } else {
            target = event.message_id;
            // When the turn began and the screen the server resolved for it, kept on the message for the thread to draw.
            const metadata: ChatMessageMetadata = { ...(event.started_at ? { started_at: event.started_at } : {}), ...(event.context === undefined ? {} : { context: event.context }) };
            thread.current = [...thread.current, { id: event.message_id, role: 'assistant', parts: [], ...(Object.keys(metadata).length > 0 ? { metadata } : {}) }];
          }
          return;
        }
        if (event.type === 'phase') {
          setPhase(event.phase);
          return;
        }
        if (event.type === 'error') {
          setError(Object.assign(new Error(event.message), { action: event.action, kind: event.kind ?? 'model' }));
          return;
        }
        if (event.type === 'done' || event.type === 'usage' || !target) return;
        // The first thing of the answer itself ends the wait.
        setPhase(null);
        // A card withdrawn because the coach asked something else sits in an earlier message: the event names it.
        const id = event.type === 'decision' && event.message_id ? event.message_id : target;
        thread.current = thread.current.map((m) => (m.id === id ? applyChatEvent(m, event) : m));
      };

      let failed = false;
      let finished = false;
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: abort.signal,
          body: JSON.stringify({
            conversation_id: conversation.current,
            client_turn_id: outgoing.kind === 'message' ? outgoing.key : newKey(),
            ...(surface ? { surface } : {}),
            ...(outgoing.kind === 'message' ? { message: outgoing.text, ...(screen.current ? { screen: screen.current } : {}) } : { decision: { key: outgoing.key, approved: outgoing.approved } }),
          }),
        });
        const minted = response.headers.get('x-conversation-id');
        if (minted) adoptConversation(minted);
        if (!response.ok || !response.body) throw refusal(response.status, await response.text().catch(() => ''));

        const parse = createChatEventParser();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const event of parse(decoder.decode(value, { stream: true }))) {
            if (event.type === 'error') failed = true;
            if (event.type === 'done') finished = true;
            fold(event);
            if (event.type !== 'message_start' && event.type !== 'phase') setStatus((s) => (s === 'submitted' ? 'streaming' : s));
          }
          scheduleFlush();
        }
        // A stream that ends without its last event was cut off: what arrived is a fragment, not an answer.
        if (!finished && !abort.signal.aborted) throw new Error('');
      } catch (err) {
        if (abort.signal.aborted) return;
        failed = true;
        const failure = err instanceof Error ? err : new Error('');
        // A refused request carries its kind (the server's, or the status's). Anything else here is a connection that dropped:
        // the device is offline, a Confirm's response was lost, or an answer was cut off.
        const kind: ChatFailureKind =
          typeof (failure as { statusCode?: unknown }).statusCode === 'number' ? chatErrorKind(failure) : typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : outgoing.kind === 'decision' ? 'card_retry' : 'lost';
        setError(Object.assign(failure, { kind }));
      } finally {
        if (inFlight.current === abort) {
          inFlight.current = null;
          setPhase(null);
          flush();
          setStatus(failed ? 'error' : 'ready');
        }
      }
    },
    [adoptConversation, endpoint, flush, scheduleFlush, surface],
  );

  const send = React.useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || inFlight.current) return;
      // Context is prefixed as visible text, so the transcript records exactly
      // what the model was told — no invisible side channel.
      const prefix = context.length > 0 ? `[Context: ${context.map((c) => `${c.kind.replace('_', ' ')} ${c.label}`).join('; ')}]\n` : '';
      const question = { text: prefix + trimmed, key: newKey() };
      lastQuestion.current = question;
      lastDecision.current = null;
      thread.current = [...thread.current, { id: `user-${question.key}`, role: 'user', parts: [{ type: 'text', text: question.text }] }];
      setMessages(thread.current);
      void run({ kind: 'message', ...question });
    },
    [context, run],
  );

  /**
   * Try again. After a failed decision, the same decision is sent again.
   * Otherwise ask the last question again under ITS OWN key. The server answers a key
   * that already has an answer with that answer, and replaces a failed attempt
   * instead of adding a second question: a retry can never fork into a thread
   * of duplicates, however many times the coach presses it.
   */
  const retry = React.useCallback(() => {
    if (inFlight.current) return;
    // What failed last was a decision: send the same decision again. A key that already ran is answered with its stored outcome.
    const decision = lastDecision.current;
    if (decision) {
      void run({ kind: 'decision', ...decision });
      return;
    }
    const question = lastQuestion.current;
    if (!question) return;
    // Whatever the failed attempt drew after the question is replaced by the new answer.
    const at = thread.current.findIndex((m) => m.id === `user-${question.key}`);
    if (at !== -1) thread.current = thread.current.slice(0, at + 1);
    setMessages(thread.current);
    void run({ kind: 'message', ...question });
  }, [run]);

  const stop = React.useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    setPhase(null);
    flush();
    setStatus('ready');
  }, [flush]);

  const newConversation = React.useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    conversation.current = null;
    lastQuestion.current = null;
    lastDecision.current = null;
    thread.current = [];
    setConversationId(null);
    setContext([]);
    setMessages([]);
    // The old thread's failure must not follow the coach into the new one.
    setError(undefined);
    setPhase(null);
    setStatus('ready');
  }, []);

  const addContext = React.useCallback((chip: ChatContextChip) => {
    setContext((prev) => (prev.some((c) => c.id === chip.id) ? prev : [...prev, chip]));
  }, []);

  const removeContext = React.useCallback((id: string) => {
    setContext((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const decide = React.useCallback(
    (approvalId: string, approved: boolean) => {
      if (!approvalId || inFlight.current) return;
      lastDecision.current = { key: approvalId, approved };
      void run({ kind: 'decision', key: approvalId, approved });
    },
    [run],
  );
  const approve = React.useCallback((approvalId: string) => decide(approvalId, true), [decide]);
  const deny = React.useCallback((approvalId: string) => decide(approvalId, false), [decide]);

  const busy = status === 'submitted' || status === 'streaming';

  return {
    messages,
    status,
    error,
    phase,
    busy,
    conversationId,
    context,
    addContext,
    removeContext,
    send,
    stop,
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
