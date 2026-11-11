/**
 * CoachHelm chat: the wire protocol between the stream route and the browser, and the one reducer both ends use.
 *
 * The server sends server-sent events, one JSON object per `data:` line. The browser folds them into the assistant
 * message it is drawing; the server folds the SAME events with the SAME reducer into the `ui_parts` it stores. So what a
 * coach sees live and what a reload restores cannot drift apart: they are one computation.
 *
 * The parts the reducer builds keep the shapes the thread view-models, cards, preview fixtures and stored conversations
 * already use (`text`, `data-progress`, `data-evidence`, `data-action-proposal`, `data-action-receipt`, the visual and
 * artifact parts, and a `tool-<name>` part carrying a card's decision state).
 *
 * This file is imported by the client hook: no server imports here.
 */

/** One part of a chat message, in the stored `ui_parts` shape. */
export type ChatUIPart = { type: string; [key: string]: unknown };

/** A chat message as the thread draws it. Structurally the `UIMessage` the UI files already type against. */
export interface ChatUIMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  parts: ChatUIPart[];
  metadata?: unknown;
}

/** What the hook keeps on an assistant message's `metadata`, from its `message_start`. */
export interface ChatMessageMetadata {
  /** When the server began work on the turn (ISO). */
  started_at?: string;
  /** The screen the server resolved for the turn, for the context chip. Null: none was sent, or none passed the checks. */
  context?: { screen: string; label: string } | null;
}

/** A `data-*` part on the wire. With an `id`, a later part of the same type and id replaces the earlier one in place. */
export interface WireDataPart {
  type: `data-${string}`;
  id?: string;
  data: unknown;
}

/** What the coach can do about a failed turn. */
export type ChatErrorAction = 'retry' | 'new-chat' | 'none';

export type ChatTurnStatus = 'complete' | 'awaiting_decision' | 'failed' | 'stopped';

/**
 * Why a turn or a request failed, as a closed set, so a screen picks its notice by kind and never by reading the
 * sentence or the HTTP status. The server sends `model`, `truncated`, `lost` (the answer could not be saved),
 * `card_retry` and `card_gone` on an `error` event, and `budget`, `off`, `rate`, `signed_out` and `gone` in a refused
 * request's JSON body (`{ error, kind }`). `offline` and `lost` (a dropped connection) are the browser's own, set by
 * the hook. `declined` is never an error: a turn the model declined is a complete turn whose `data-turn-meta` part
 * says `declined: true`.
 */
export const CHAT_ERROR_KINDS = ['offline', 'lost', 'model', 'declined', 'truncated', 'budget', 'off', 'rate', 'signed_out', 'gone', 'card_retry', 'card_gone'] as const;
export type ChatErrorKind = (typeof CHAT_ERROR_KINDS)[number];
export const isChatErrorKind = (value: unknown): value is ChatErrorKind => typeof value === 'string' && (CHAT_ERROR_KINDS as readonly string[]).includes(value);

/** Where the chat was opened from, as the server resolved it, for the context chip: a screen id and the words for it. */
export interface ChatScreenEcho {
  screen: string;
  label: string;
}

/**
 * Facts about a turn that are not part of the answer, stored with it as the part `data-turn-meta` (id `turn-meta`) so a
 * restored turn can say "3 reads · 2s" and a card "waiting since 3:42". Threads stored before 10 Nov 2026 have none.
 */
export const TURN_META_PART = 'data-turn-meta' as const;
export interface ChatTurnMeta {
  /** When the turn began (ISO). A decision on its card does not move it. */
  started_at: string;
  /** Time the server spent on the turn, over every request that worked on it (the Undo window included). */
  duration_ms: number;
  /** Reads the turn finished, failed ones included. */
  reads: number;
  /** The model declined to answer and the words are the app's sentence. */
  declined?: true;
}

export function turnMetaOf(parts: readonly ChatUIPart[]): ChatTurnMeta | null {
  const data = parts.find((p) => p.type === TURN_META_PART)?.data as Partial<ChatTurnMeta> | undefined;
  return data && typeof data.started_at === 'string' && typeof data.duration_ms === 'number' ? { started_at: data.started_at, duration_ms: data.duration_ms, reads: typeof data.reads === 'number' ? data.reads : 0, ...(data.declined ? { declined: true as const } : {}) } : null;
}

export type ChatEvent =
  /** First event of every response. `resumed`: this response continues an assistant message the browser already holds (a decision on its card).
   *  `started_at`: when this request began work (ISO). `context`: the screen the server resolved from the request's `screen`, or null. */
  | { type: 'message_start'; conversation_id: string; message_id: string; resumed: boolean; started_at?: string; context?: ChatScreenEcho | null }
  /** The model has been called and nothing has arrived from it yet. Sent before each model call; not stored. */
  | { type: 'phase'; phase: 'thinking' }
  /** The answer, as the model writes it. */
  | { type: 'text_delta'; delta: string }
  /** The words of the step in progress are withdrawn (the model declined mid-sentence). Rare. */
  | { type: 'text_discard' }
  /** A read or a draft has started: the progress row. `label` is for people; `tool` is kept for the stored part's shape and is never drawn. */
  | { type: 'read_started'; id: string; label: string; tool: string }
  /** `detail`: a few words on what was read ("38 rounds"). `picture`: a small drawing for the row, in the shape the thread's read pictures take. */
  | { type: 'read_finished'; id: string; label: string; tool: string; state: 'done' | 'failed'; detail?: string; picture?: unknown }
  /** A short progress note in the model's own words (never its reasoning). Drawn as a finished progress row. */
  | { type: 'note'; id: string; text: string }
  /** A part of the answer that is not prose. The four named kinds are the ones the brief lists; `part` is every other stored data part. */
  | { type: 'evidence' | 'visual' | 'proposal' | 'receipt' | 'part'; part: WireDataPart }
  /** The turn is waiting on the coach: the card for `key` is live. */
  | { type: 'decision_needed'; key: string; tool: string; tool_use_id: string }
  /**
   * The coach's answer to the card for `key`, as the server recorded it. `reason: 'superseded'`: nobody pressed Cancel; the coach
   * asked something else and the card was withdrawn. Such a card sits in an EARLIER message than the one this response is writing:
   * `message_id` names it.
   */
  | { type: 'decision'; key: string; approved: boolean; reason?: 'superseded'; message_id?: string }
  | { type: 'usage'; input_tokens: number; output_tokens: number; cache_read_input_tokens: number }
  /** A sentence a coach can act on. Never provider text. */
  | { type: 'error'; message: string; action: ChatErrorAction; kind?: ChatErrorKind }
  /** Last event of every response. `duration_ms`: what this request took. */
  | { type: 'done'; status: ChatTurnStatus; duration_ms?: number };

export const CHAT_STREAM_CONTENT_TYPE = 'text/event-stream; charset=utf-8';

export function encodeChatEvent(event: ChatEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** Feed it the response body as it arrives; it returns the events completed by each chunk. A torn last frame is never emitted. */
export function createChatEventParser(): (chunk: string) => ChatEvent[] {
  let buffer = '';
  return (chunk) => {
    buffer += chunk;
    const events: ChatEvent[] = [];
    for (;;) {
      const end = buffer.indexOf('\n\n');
      if (end === -1) break;
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (!data) continue;
      try {
        const parsed = JSON.parse(data) as ChatEvent;
        if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') events.push(parsed);
      } catch {
        // A frame that is not JSON is not one of ours (a proxy's comment line): skip it.
      }
    }
    return events;
  };
}

/** The part type of a card's decision state for a tool. */
export const toolPartType = (tool: string): string => `tool-${tool}`;

type DecisionPart = ChatUIPart & { toolCallId: string; state: string; approval?: { id: string; approved?: boolean; reason?: 'superseded' } };

const isDecisionPartFor = (part: ChatUIPart, key: string): part is DecisionPart =>
  part.type.startsWith('tool-') && (part as DecisionPart).approval?.id === key;

function upsertDataPart(parts: ChatUIPart[], part: WireDataPart): ChatUIPart[] {
  const next: ChatUIPart = { type: part.type, ...(part.id === undefined ? {} : { id: part.id }), data: part.data };
  if (part.id !== undefined) {
    const at = parts.findIndex((p) => p.type === part.type && p.id === part.id);
    if (at !== -1) return parts.map((p, i) => (i === at ? next : p));
  }
  return [...parts, next];
}

/**
 * Fold one event into the assistant message. Pure: returns a new message when something changed and the same one when
 * nothing did, so React can compare by identity.
 */
export function applyChatEvent(message: ChatUIMessage, event: ChatEvent): ChatUIMessage {
  const parts = message.parts;
  switch (event.type) {
    case 'text_delta': {
      if (!event.delta) return message;
      const last = parts[parts.length - 1];
      if (last && last.type === 'text') {
        return { ...message, parts: [...parts.slice(0, -1), { ...last, text: `${String(last.text ?? '')}${event.delta}` }] };
      }
      return { ...message, parts: [...parts, { type: 'text', text: event.delta }] };
    }
    case 'text_discard': {
      const last = parts[parts.length - 1];
      return last && last.type === 'text' ? { ...message, parts: parts.slice(0, -1) } : message;
    }
    case 'read_started':
      return { ...message, parts: upsertDataPart(parts, { type: 'data-progress', id: event.id, data: { label: event.label, tool: event.tool } }) };
    case 'read_finished':
      return {
        ...message,
        parts: upsertDataPart(parts, {
          type: 'data-progress',
          id: event.id,
          data: { label: event.label, tool: event.tool, state: event.state, done: event.label, ...(event.detail ? { detail: event.detail } : {}), ...(event.picture === undefined || event.picture === null ? {} : { picture: event.picture }) },
        }),
      };
    case 'note':
      return event.text.trim() ? { ...message, parts: upsertDataPart(parts, { type: 'data-progress', id: event.id, data: { label: event.text.trim(), tool: 'note', state: 'done', done: event.text.trim() } }) } : message;
    case 'evidence':
    case 'visual':
    case 'proposal':
    case 'receipt':
    case 'part':
      return { ...message, parts: upsertDataPart(parts, event.part) };
    case 'decision_needed': {
      if (parts.some((p) => isDecisionPartFor(p, event.key))) return message;
      const card: DecisionPart = { type: toolPartType(event.tool), toolCallId: event.tool_use_id, state: 'approval-requested', input: {}, approval: { id: event.key } };
      return { ...message, parts: [...parts, card] };
    }
    case 'decision': {
      if (!parts.some((p) => isDecisionPartFor(p, event.key))) return message;
      return {
        ...message,
        parts: parts.map((p) =>
          isDecisionPartFor(p, event.key)
            ? { ...p, state: event.approved ? 'approval-responded' : 'output-denied', approval: { id: event.key, approved: event.approved, ...(event.reason && !event.approved ? { reason: event.reason } : {}) } }
            : p,
        ),
      };
    }
    default:
      return message;
  }
}

/** The keys of the cards in a message that still wait for the coach. */
export function pendingDecisionKeys(message: ChatUIMessage | undefined): string[] {
  if (!message || message.role !== 'assistant') return [];
  return message.parts
    .filter((p): p is DecisionPart => p.type.startsWith('tool-') && p.state === 'approval-requested' && typeof (p as DecisionPart).approval?.id === 'string')
    .map((p) => p.approval!.id);
}

/** The visible words of a message: its text parts, in order. */
export function textOfParts(parts: readonly ChatUIPart[]): string {
  return parts
    .filter((p) => p.type === 'text')
    .map((p) => String(p.text ?? ''))
    .join('\n\n')
    .trim();
}

const NAMED_PART_EVENT: Record<string, 'evidence' | 'visual' | 'proposal' | 'receipt'> = {
  'data-evidence': 'evidence',
  'data-visual-artifact': 'visual',
  'data-visual-composition': 'visual',
  'data-action-proposal': 'proposal',
  'data-action-receipt': 'receipt',
};

/** The event that carries a stored data part. */
export function eventForPart(part: WireDataPart): ChatEvent {
  return { type: NAMED_PART_EVENT[part.type] ?? 'part', part };
}

/**
 * A stored message as the events that rebuild it: what an idempotent retry of an answered turn is sent instead of a
 * second (paid) run. Progress rows are history by then and are not replayed.
 */
export function eventsForStoredParts(parts: readonly ChatUIPart[]): ChatEvent[] {
  const events: ChatEvent[] = [];
  for (const part of parts) {
    if (part.type === 'text') {
      events.push({ type: 'text_delta', delta: String(part.text ?? '') });
      continue;
    }
    if (part.type.startsWith('data-') && part.type !== 'data-progress') {
      events.push(eventForPart({ type: part.type as WireDataPart['type'], ...(typeof part.id === 'string' ? { id: part.id } : {}), data: part.data }));
      continue;
    }
    if (part.type.startsWith('tool-')) {
      const card = part as DecisionPart;
      const key = card.approval?.id;
      if (typeof key !== 'string') continue;
      events.push({ type: 'decision_needed', key, tool: part.type.slice('tool-'.length), tool_use_id: String(card.toolCallId ?? '') });
      if (typeof card.approval?.approved === 'boolean') events.push({ type: 'decision', key, approved: card.approval.approved, ...(card.approval.reason === 'superseded' && !card.approval.approved ? { reason: 'superseded' as const } : {}) });
    }
  }
  return events;
}
