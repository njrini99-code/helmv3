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
  pendingDecisionKeys,
  applyChatEvent,
  createChatEventParser,
  suggestionsOf,
  type ChatEvent,
  type ChatMessageMetadata,
  type ChatSuggestion,
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

  /**
   * Ask. `about`: the coach tapped a thing in an earlier answer and is asking about it: the read it came from (the evidence part's
   * `ref`) and the element (`key`, in the forms `engine/about.ts` lists). The server resolves it against the conversation's stored
   * reads; the answering message's `metadata.about` says what it accepted (null: nothing).
   */
  send: (text: string, options?: { about?: { evidence_ref: string; key: string } }) => void;
  stop: () => void;
  retry: () => void;
  newConversation: () => void;

  /**
   * Answer a waiting card. The argument is the card's approval id
   * (`part.approval.id`), never the tool-call id.
   */
  approve: (approvalId: string) => void;
  deny: (approvalId: string) => void;
  /**
   * Change fields on a waiting card (`edits` by the keys its `editable` lists). The card comes back as it then stands, with a
   * `data-card-revision` part beside it saying whether the edit was made. Optional in the type only because a preview builds this
   * result by hand; the hook always returns it.
   */
  revise?: (approvalId: string, edits: Record<string, unknown>) => void;
  /**
   * Confirm several waiting cards at once (the keys given, or every card waiting in the thread). Written in the order proposed after
   * one shared Undo window; the first failure stops the batch and the cards after it wait again. Optional in the type as `revise` is.
   */
  approveAll?: (approvalIds?: string[]) => void;
  /**
   * What to ask next, for the last answer: two to four, or none. They arrive a moment AFTER the turn is over (`status` is already
   * `ready` and the coach can already type), and they are gone as soon as anything newer is in the thread. Tapping one is
   * `send(suggestion.prompt)`: nothing else. Optional in the type only because a preview builds this result by hand.
   */
  suggestions?: ChatSuggestion[];
}

/** A refused request, in the shape `describeChatError` reads (a status and the response body). */
/** The revision of a card's proposal as the thread holds it; nothing for a card never edited. */
function revisionSeen(messages: readonly ChatUIMessage[], key: string): { revision?: number } {
  for (const message of messages) {
    const part = message.parts.find((p) => p.type === 'data-action-proposal' && p.id === `proposal-${key}`);
    const revision = (part?.data as { revision?: unknown } | undefined)?.revision;
    if (typeof revision === 'number' && revision > 0) return { revision };
  }
  return {};
}

function refusal(status: number, body: string): Error {
  return Object.assign(new Error(body || `Request failed (${status})`), { statusCode: status, responseBody: body });
}

type Outgoing =
  | { kind: 'message'; text: string; key: string; about?: { evidence_ref: string; key: string } }
  | { kind: 'decision'; key: string; approved: boolean }
  | { kind: 'revise'; key: string; edits: Record<string, unknown> }
  | { kind: 'approve_all'; keys: string[] };
/** The card a card request is about (the first of a batch): its message is the one the response folds into. */
const cardKeyOf = (outgoing: Exclude<Outgoing, { kind: 'message' }>): string => (outgoing.kind === 'approve_all' ? (outgoing.keys[0] ?? '') : outgoing.key);

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
  // A response whose turn is over (`done` has arrived) but whose stream is still open: the server may send the answer's
  // suggestions after `done`. The coach is no longer waiting on it; anything they do next ends it.
  const tail = React.useRef<AbortController | null>(null);
  const flushTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // The last question and the key it was sent under, so a retry dedupes against the turn it is retrying.
  const lastQuestion = React.useRef<{ text: string; key: string; about?: { evidence_ref: string; key: string } } | null>(null);
  // The last decision sent, so a Confirm whose response was lost can be sent again: the server runs a key at most once.
  const lastDecision = React.useRef<{ key: string; approved: boolean } | null>(null);
  // A Confirm keeps its request open through the Undo window, so a coach with several cards presses the next one while the first
  // is still open. Those presses are kept and sent in the order pressed, one request at a time.
  const flight = React.useRef<Outgoing | null>(null);
  const cardQueue = React.useRef<Array<Exclude<Outgoing, { kind: 'message' }>>>([]);
  const beginCard = React.useRef<(outgoing: Exclude<Outgoing, { kind: 'message' }>) => void>(() => undefined);
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
        tail.current?.abort();
        if (flushTimer.current) clearTimeout(flushTimer.current);
      }, 0);
    };
  }, []);

  const run = React.useCallback(
    async (outgoing: Outgoing) => {
      inFlight.current?.abort();
      // The last answer's suggestions, if they have not arrived yet, no longer belong under the last answer.
      tail.current?.abort();
      tail.current = null;
      const abort = new AbortController();
      inFlight.current = abort;
      flight.current = outgoing;
      setError(undefined);
      setStatus('submitted');

      // The message the response's events fold into: a new assistant message, or the one holding the card being answered.
      let target: string | null = null;
      const fold = (event: ChatEvent) => {
        if (event.type === 'message_start') {
          adoptConversation(event.conversation_id);
          const cardKey = outgoing.kind !== 'message' ? cardKeyOf(outgoing) : null;
          const holder = cardKey ? thread.current.find((m) => m.role === 'assistant' && m.parts.some((p) => (p as { approval?: { id?: unknown } }).approval?.id === cardKey)) : undefined;
          if (event.resumed && holder) {
            target = holder.id;
          } else {
            target = event.message_id;
            // When the turn began and the screen the server resolved for it, kept on the message for the thread to draw.
            const metadata: ChatMessageMetadata = { ...(event.started_at ? { started_at: event.started_at } : {}), ...(event.context === undefined ? {} : { context: event.context }), ...(event.about === undefined ? {} : { about: event.about }) };
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
        // How a card in an earlier message ended (withdrawn because the coach asked something else, or settled by a Confirm whose
        // connection was lost): the event names that message, and it is not the start of this answer.
        const earlier = (event.type === 'decision' || event.type === 'receipt') && event.message_id ? event.message_id : null;
        // The first thing of the answer itself ends the wait.
        if (!earlier) setPhase(null);
        const id = earlier ?? target;
        thread.current = thread.current.map((m) => (m.id === id ? applyChatEvent(m, event) : m));
      };

      let failed = false;
      let finished = false;
      // The turn is over for the coach: the composer is theirs again and the next card they pressed is sent. Called when `done`
      // arrives (the stream may stay open a moment longer for the suggestions) and again, to no effect, when the stream ends.
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        if (inFlight.current !== abort) return;
        inFlight.current = null;
        flight.current = null;
        setPhase(null);
        flush();
        setStatus(failed ? 'error' : 'ready');
        // The next card the coach pressed meanwhile. After a failure they are dropped: the coach sees what failed and decides again.
        const next = failed ? undefined : cardQueue.current.shift();
        if (failed) cardQueue.current = [];
        if (next) beginCard.current(next);
      };
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: abort.signal,
          body: JSON.stringify({
            conversation_id: conversation.current,
            client_turn_id: outgoing.kind === 'message' ? outgoing.key : newKey(),
            ...(surface ? { surface } : {}),
            ...(outgoing.kind === 'message'
              ? { message: outgoing.text, ...(screen.current ? { screen: screen.current } : {}), ...(outgoing.about ? { about: outgoing.about } : {}) }
              : // The revision of the card as this browser holds it goes with every answer or edit, so the server never confirms or
                // edits a card other than the one on screen.
                outgoing.kind === 'approve_all'
                ? { approve_all: { cards: outgoing.keys.map((key) => ({ key, ...revisionSeen(thread.current, key) })) } }
                : { decision: { key: outgoing.key, ...(outgoing.kind === 'decision' ? { approved: outgoing.approved } : { edits: outgoing.edits }), ...revisionSeen(thread.current, outgoing.key) } }),
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
            // After `done` the only thing that may still come is the answer's suggestions; anything else is not this protocol's.
            if (finished) {
              if (event.type === 'suggestions' && !abort.signal.aborted) fold(event);
              continue;
            }
            if (event.type === 'error') failed = true;
            fold(event);
            if (event.type === 'done') {
              finished = true;
              // What is still to come is read without the coach waiting on it.
              tail.current = abort;
              release();
              continue;
            }
            if (event.type !== 'message_start' && event.type !== 'phase') setStatus((s) => (s === 'submitted' ? 'streaming' : s));
          }
          if (finished) flush();
          else scheduleFlush();
        }
        // A stream that ends without its last event was cut off: what arrived is a fragment, not an answer.
        if (!finished && !abort.signal.aborted) throw new Error('');
      } catch (err) {
        // A turn that is already over cannot fail: a connection lost while its suggestions were on the way costs only them.
        if (abort.signal.aborted || released) return;
        failed = true;
        const failure = err instanceof Error ? err : new Error('');
        // A refused request carries its kind (the server's, or the status's). Anything else here is a connection that dropped:
        // the device is offline, a Confirm's response was lost, or an answer was cut off.
        const kind: ChatFailureKind =
          typeof (failure as { statusCode?: unknown }).statusCode === 'number' ? chatErrorKind(failure) : typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : outgoing.kind !== 'message' ? 'card_retry' : 'lost';
        setError(Object.assign(failure, { kind }));
      } finally {
        if (tail.current === abort) tail.current = null;
        release();
      }
    },
    [adoptConversation, endpoint, flush, scheduleFlush, surface],
  );

  const send = React.useCallback(
    (text: string, options?: { about?: { evidence_ref: string; key: string } }) => {
      const trimmed = text.trim();
      if (!trimmed || inFlight.current) return;
      // Context is prefixed as visible text, so the transcript records exactly
      // what the model was told — no invisible side channel.
      const prefix = context.length > 0 ? `[Context: ${context.map((c) => `${c.kind.replace('_', ' ')} ${c.label}`).join('; ')}]\n` : '';
      // What was tapped goes with the question, and with a retry of it.
      const question = { text: prefix + trimmed, key: newKey(), ...(options?.about ? { about: options.about } : {}) };
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
    cardQueue.current = [];
    tail.current?.abort();
    tail.current = null;
    inFlight.current?.abort();
    inFlight.current = null;
    flight.current = null;
    setPhase(null);
    flush();
    setStatus('ready');
  }, [flush]);

  const newConversation = React.useCallback(() => {
    cardQueue.current = [];
    tail.current?.abort();
    tail.current = null;
    inFlight.current?.abort();
    inFlight.current = null;
    flight.current = null;
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

  /** Send a card request now, or keep it until the card request in flight has finished. Ignored while an answer is streaming. */
  const pressCard = React.useCallback(
    (outgoing: Exclude<Outgoing, { kind: 'message' }>) => {
      const same = (other: Outgoing | null) => Boolean(other) && JSON.stringify(other) === JSON.stringify(outgoing);
      if (inFlight.current) {
        if (flight.current?.kind !== 'message' && !same(flight.current) && !cardQueue.current.some(same)) cardQueue.current.push(outgoing);
        return;
      }
      beginCard.current(outgoing);
    },
    [],
  );
  React.useEffect(() => {
    beginCard.current = (outgoing) => {
      // Only a decision can be tried again as it was: an edit or a batch is pressed again by the coach.
      lastDecision.current = outgoing.kind === 'decision' ? { key: outgoing.key, approved: outgoing.approved } : null;
      void run(outgoing);
    };
  }, [run]);

  const decide = React.useCallback(
    (approvalId: string, approved: boolean) => {
      if (!approvalId) return;
      pressCard({ kind: 'decision', key: approvalId, approved });
    },
    [pressCard],
  );
  /** Change fields on a waiting card. The server plans it again and sends the card as it then stands, with a `data-card-revision` part saying whether the edit was made. */
  const revise = React.useCallback(
    (approvalId: string, edits: Record<string, unknown>) => {
      if (!approvalId) return;
      pressCard({ kind: 'revise', key: approvalId, edits });
    },
    [pressCard],
  );
  /**
   * Confirm several waiting cards at once: the ones given, or every card still waiting in the thread. The server writes them in
   * the order they were proposed after one shared Undo window, and stops at the first that fails (the rest wait again).
   */
  const approveAll = React.useCallback(
    (approvalIds?: string[]) => {
      const keys = approvalIds ?? thread.current.flatMap((m) => pendingDecisionKeys(m));
      if (keys.length === 0) return;
      pressCard({ kind: 'approve_all', keys: [...new Set(keys)] });
    },
    [pressCard],
  );
  const approve = React.useCallback((approvalId: string) => decide(approvalId, true), [decide]);
  const deny = React.useCallback((approvalId: string) => decide(approvalId, false), [decide]);

  const busy = status === 'submitted' || status === 'streaming';
  // The last answer's, and only while it is the last thing in the thread and nothing is being asked.
  const last = messages[messages.length - 1];
  const suggestions = React.useMemo(() => (status === 'ready' && last?.role === 'assistant' ? suggestionsOf(last.parts) : []), [status, last]);

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
    revise,
    approveAll,
    suggestions,
  };
}

function newKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `turn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
