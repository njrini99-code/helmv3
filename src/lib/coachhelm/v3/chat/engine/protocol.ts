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

/** A `data-*` part on the wire. With an `id`, a later part of the same type and id replaces the earlier one in place. */
export interface WireDataPart {
  type: `data-${string}`;
  id?: string;
  data: unknown;
}

/** What the coach can do about a failed turn. */
export type ChatErrorAction = 'retry' | 'new-chat' | 'none';

export type ChatTurnStatus = 'complete' | 'awaiting_decision' | 'failed' | 'stopped';

export type ChatEvent =
  /** First event of every response. `resumed`: this response continues an assistant message the browser already holds (a decision on its card). */
  | { type: 'message_start'; conversation_id: string; message_id: string; resumed: boolean }
  /** The answer, as the model writes it. */
  | { type: 'text_delta'; delta: string }
  /** The words of the step in progress are withdrawn (the model declined mid-sentence). Rare. */
  | { type: 'text_discard' }
  /** A read or a draft has started: the progress row. `label` is for people; `tool` is kept for the stored part's shape and is never drawn. */
  | { type: 'read_started'; id: string; label: string; tool: string }
  | { type: 'read_finished'; id: string; label: string; tool: string; state: 'done' | 'failed'; detail?: string }
  /** A part of the answer that is not prose. The four named kinds are the ones the brief lists; `part` is every other stored data part. */
  | { type: 'evidence' | 'visual' | 'proposal' | 'receipt' | 'part'; part: WireDataPart }
  /** The turn is waiting on the coach: the card for `key` is live. */
  | { type: 'decision_needed'; key: string; tool: string; tool_use_id: string }
  /** The coach's answer to the card for `key`, as the server recorded it. */
  | { type: 'decision'; key: string; approved: boolean }
  | { type: 'usage'; input_tokens: number; output_tokens: number; cache_read_input_tokens: number }
  /** A sentence a coach can act on. Never provider text. */
  | { type: 'error'; message: string; action: ChatErrorAction }
  /** Last event of every response. */
  | { type: 'done'; status: ChatTurnStatus };

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

type DecisionPart = ChatUIPart & { toolCallId: string; state: string; approval?: { id: string; approved?: boolean } };

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
          data: { label: event.label, tool: event.tool, state: event.state, done: event.label, ...(event.detail ? { detail: event.detail } : {}) },
        }),
      };
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
            ? { ...p, state: event.approved ? 'approval-responded' : 'output-denied', approval: { id: event.key, approved: event.approved } }
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
      if (typeof card.approval?.approved === 'boolean') events.push({ type: 'decision', key, approved: card.approval.approved });
    }
  }
  return events;
}
