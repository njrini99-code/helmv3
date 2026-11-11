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
  /** The thing in an earlier answer this turn was asked about, as the server resolved it. Null: one was sent and it named nothing stored. */
  about?: ChatAboutEcho | null;
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

/** What kind of work a step is: it chooses the step's mark in the thread. */
export type ChatStepKind = 'read' | 'find' | 'compare' | 'calculate' | 'visual' | 'draft' | 'check';
/** Someone or something a step is about. Only ever a player from the caller's own roster, the caller's team, or a round the caller's own read returned. */
export interface ChatStepSubject {
  kind: 'player' | 'team' | 'round' | 'event' | 'qualifier' | 'tournament' | 'plan' | 'document';
  id: string;
  label: string;
}
/**
 * A step of work: the data of a `data-progress` part (part id = the step's id, stable for the step's life). Every field but
 * `label` and `tool` is optional, so a row stored before a field existed still draws. Nothing in it is estimated.
 */
export interface ChatStep {
  /** The step in people's words while it runs ("Reading Eli's last 8 rounds"). */
  label: string;
  /** The tool's name, or `code_execution` for the model's code, or `note` for a progress note. Never drawn. */
  tool: string;
  /** `waiting`: really queued, not yet started. `active`: running. Absent on a row stored before states were sent while running. */
  state?: 'waiting' | 'active' | 'done' | 'failed';
  /** (older name of `done_label`, kept on the part for screens that read it) */
  done?: string;
  /** The label once finished, when it differs. */
  done_label?: string;
  /** A few words on what it found ("38 rounds"). */
  detail?: string;
  picture?: unknown;
  kind?: ChatStepKind;
  /** The step this one ran under: a read the model's code called names the code's step. */
  parent_id?: string;
  /** Who it is about, in the order they became known. Re-sent whole when it grows. */
  subjects?: readonly ChatStepSubject[];
  /** What it has counted. `more: true` while it is still counting. */
  count?: { n: number; unit: string; more: boolean };
  /** How much of a known whole it has covered ("9 of 12 players"). */
  covers?: { n: number; of: number; unit: string };
  /** The read it produced, openable from the moment the step is done. */
  evidence_ref?: string;
  /** Clock readings (ISO). */
  started_at?: string;
  ended_at?: string;
  /** The turn's sequence number of the last event that changed this step. Rises by one with every step event of the turn. */
  seq?: number;
}

/**
 * `data-draft`: a draft while the model writes it, in the live thread (part id `draft-<id>`). It is removed when the draft is
 * accepted (what it became takes its place) and kept as `failed` when it is not. Never replayed on reload.
 */
export const DRAFT_PART = 'data-draft' as const;
export interface ChatDraft {
  tool: string;
  /** Each field shown so far, with its whole value so far. */
  fields: Record<string, unknown>;
  /** The field being written now, if any. */
  open: string | null;
  state: 'writing' | 'failed';
}

/** The element of an earlier read a message was asked about (`engine/about.ts`): the reference the server accepted, as it was sent. */
export interface ChatAboutEcho {
  evidence_ref: string;
  key: string;
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
  /** Steps of work the turn had (reads, calculations, drafts), over every request that worked on it. Absent on a turn stored before steps were counted. */
  steps?: number;
  /** For how long at least one step was running. Not the turn's duration: the model's own time and any wait on the coach are not in it. */
  working_ms?: number;
  /** The model declined to answer and the words are the app's sentence. */
  declined?: true;
}

/**
 * `data-computed`: the model worked a figure out in code. One part per run of its code, sent when the run ends and stored with the
 * turn. Figures in such an answer carry no read markers (a read the code calls cannot be cited), so this is how the answer shows
 * its work: the reads the code called are the evidence parts named in `refs` (each also says `via: 'code'`).
 */
export const COMPUTED_PART = 'data-computed' as const;
export interface ChatComputed {
  /** Evidence refs of the reads the code called, in the order it asked for them. Empty when it only did arithmetic on figures already read. */
  refs: string[];
  /** How many reads that is. */
  reads: number;
  /** How many different players those reads measured. */
  players: number;
  /** The window the reads share, in the reads' own words ("Last 8 rounds"); null when they differ or give none. */
  window: string | null;
  /** One sentence on how it was worked out, in the model's own plain words, when its code began with one (`# Method: ...`). */
  method?: string;
}

/**
 * `data-card-revision`: the answer to an edit of a waiting card (or to a Confirm of a card that had changed), sent beside the
 * card's `proposal` part as it now stands. Part id `revision-<key>`. It is for the live thread only: it is not stored, so a reload
 * shows the card and no stale notice.
 */
export const CARD_REVISION_PART = 'data-card-revision' as const;
export interface ChatCardRevision {
  key: string;
  /** True: the edit was made and the card beside this is the new one. False: the card beside this is unchanged. */
  accepted: boolean;
  /** Why not. `invalid`: the edit itself (`reason` says what); `changed`: the card was edited somewhere else; `decided`: it is no
   *  longer waiting; `fixed`: nothing on it can be edited; `gone`: there is no such card. */
  kind?: 'invalid' | 'changed' | 'decided' | 'fixed' | 'gone';
  /** A sentence the coach can read. */
  reason?: string;
}

export function turnMetaOf(parts: readonly ChatUIPart[]): ChatTurnMeta | null {
  const data = parts.find((p) => p.type === TURN_META_PART)?.data as Partial<ChatTurnMeta> | undefined;
  return data && typeof data.started_at === 'string' && typeof data.duration_ms === 'number' ? { started_at: data.started_at, duration_ms: data.duration_ms, reads: typeof data.reads === 'number' ? data.reads : 0, ...(typeof data.steps === 'number' ? { steps: data.steps } : {}), ...(typeof data.working_ms === 'number' ? { working_ms: data.working_ms } : {}), ...(data.declined ? { declined: true as const } : {}) } : null;
}

export type ChatEvent =
  /** First event of every response. `resumed`: this response continues an assistant message the browser already holds (a decision on its card).
   *  `started_at`: when this request began work (ISO). `context`: the screen the server resolved from the request's `screen`, or null.
   *  `about`: sent only when the request carried one: the reference the server resolved against this conversation's reads, or null. */
  | { type: 'message_start'; conversation_id: string; message_id: string; resumed: boolean; started_at?: string; context?: ChatScreenEcho | null; about?: ChatAboutEcho | null }
  /** The model has been called and nothing has arrived from it yet. Sent before each model call; not stored. */
  | { type: 'phase'; phase: 'thinking' }
  /** The answer, as the model writes it. */
  | { type: 'text_delta'; delta: string }
  /** The words of the step in progress are withdrawn (the model declined mid-sentence). Rare. */
  | { type: 'text_discard' }
  /**
   * A step has started (or, with `state: 'waiting'`, is really queued): the progress row. `label` is for people; `tool` is kept for
   * the stored part's shape and is never drawn. The step fields are those of `ChatStep`. `seq` is the turn's sequence number: it
   * rises by one with every step event (`read_started`, `step_update`, `read_finished`, `note`), so a screen can tell their order and
   * that it has missed none; each change of a step's state is sent exactly once.
   */
  | ({ type: 'read_started'; id: string; label: string; tool: string; state?: 'waiting' | 'active' } & StepFields)
  /** A running step has learned something: who it is about, how much it has counted or covered, or a truer label. Only the fields that changed; `subjects` whole. */
  | ({ type: 'step_update'; id: string; label?: string } & StepFields)
  /** `detail`: a few words on what was read ("38 rounds"). `picture`: a small drawing for the row, in the shape the thread's read pictures take. */
  | ({ type: 'read_finished'; id: string; label: string; tool: string; state: 'done' | 'failed'; detail?: string; picture?: unknown; done_label?: string } & StepFields)
  /** A short progress note in the model's own words (never its reasoning). Drawn as a finished progress row. */
  | { type: 'note'; id: string; text: string; seq?: number }
  /**
   * A draft as the model writes it (a tool whose input is a draft: `ToolBase.draft`). `id` is the same for every event of one
   * draft. `fields`: the fields that changed since the last event, each with its WHOLE value so far (a list: its finished items;
   * words: up to the last whole word). `open`: the field being written now. Sent at most a few times a second.
   */
  | { type: 'draft_delta'; id: string; tool: string; fields: Record<string, unknown>; open?: string | null }
  /** The draft is over. `done`: its input was accepted and what it produced follows (the card, the read). `failed`: it was not. */
  | { type: 'draft_done'; id: string; state: 'done' | 'failed' }
  /** A part of the answer that is not prose. The four named kinds are the ones the brief lists; `part` is every other stored data part.
   *  `message_id`: the part belongs to an EARLIER message, not the one this response is writing (how an earlier card ended). */
  | { type: 'evidence' | 'visual' | 'proposal' | 'receipt' | 'part'; part: WireDataPart; message_id?: string }
  /** The turn is waiting on the coach: the card for `key` is live. */
  | { type: 'decision_needed'; key: string; tool: string; tool_use_id: string }
  /**
   * The coach's answer to the card for `key`, as the server recorded it. `reason: 'superseded'`: nobody pressed Cancel; the coach
   * asked something else and the card was withdrawn. Such a card sits in an EARLIER message than the one this response is writing:
   * `message_id` names it.
   */
  | { type: 'decision'; key: string; approved: boolean; reason?: 'superseded'; message_id?: string }
  /**
   * The card for `key` waits for the coach again. It was confirmed as part of an "approve all", an earlier card of that batch
   * failed, and so this one was not run: nothing was written for it. Its held receipt is withdrawn with it.
   */
  | { type: 'decision_reopened'; key: string; reason: 'batch_stopped' }
  /**
   * `features_dropped`: sent only when the turn could not run as configured: the request feature groups the API rejected and the
   * turn went on without (`engine/model.ts`, `FEATURE_GROUPS`). For the eval and the log, never drawn.
   */
  /** `input_tokens` is every prompt token of the turn's calls; `cache_read_input_tokens` and `cache_creation_input_tokens` are the parts of it read from and written to the cache. */
  | { type: 'usage'; input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens?: number; features_dropped?: string[] }
  /** A sentence a coach can act on. Never provider text. */
  | { type: 'error'; message: string; action: ChatErrorAction; kind?: ChatErrorKind }
  /** Last event of every response. `duration_ms`: what this request took. */
  /** `work`: the turn's steps and for how long at least one was running (`duration_ms` is the whole turn, the model's own time included). */
  | { type: 'done'; status: ChatTurnStatus; duration_ms?: number; work?: { steps: number; working_ms: number } };

/** The facts a step event may carry beyond its label. All optional. */
type StepFields = Pick<ChatStep, 'kind' | 'parent_id' | 'subjects' | 'count' | 'covers' | 'evidence_ref' | 'started_at' | 'ended_at' | 'seq'>;
const STEP_FIELDS = ['kind', 'parent_id', 'subjects', 'count', 'covers', 'evidence_ref', 'started_at', 'ended_at', 'seq'] as const;
/** The step facts an event carries, and nothing else of it. */
const stepFieldsOf = (event: StepFields): StepFields => Object.fromEntries(STEP_FIELDS.flatMap((k) => (event[k] === undefined ? [] : [[k, event[k]]]))) as StepFields;

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
    case 'read_started': {
      const data: ChatStep = { label: event.label, tool: event.tool, ...(event.state ? { state: event.state } : {}), ...stepFieldsOf(event) };
      return { ...message, parts: upsertDataPart(parts, { type: 'data-progress', id: event.id, data }) };
    }
    case 'step_update': {
      const row = parts.find((p) => p.type === 'data-progress' && p.id === event.id);
      if (!row) return message;
      const data: ChatStep = { ...(row.data as ChatStep), ...(event.label ? { label: event.label } : {}), ...stepFieldsOf(event) };
      return { ...message, parts: upsertDataPart(parts, { type: 'data-progress', id: event.id, data }) };
    }
    case 'read_finished': {
      // What the step said about itself while it ran (who it is about, when it began) stays on the finished row.
      const earlier = parts.find((p) => p.type === 'data-progress' && p.id === event.id)?.data as ChatStep | undefined;
      const data: ChatStep = {
        ...(earlier ? stepFieldsOf(earlier) : {}),
        label: event.label,
        tool: event.tool,
        state: event.state,
        done: event.done_label ?? event.label,
        ...(event.done_label ? { done_label: event.done_label } : {}),
        ...(event.detail ? { detail: event.detail } : {}),
        ...(event.picture === undefined || event.picture === null ? {} : { picture: event.picture }),
        ...stepFieldsOf(event),
      };
      return { ...message, parts: upsertDataPart(parts, { type: 'data-progress', id: event.id, data }) };
    }
    case 'note': {
      const words = event.text.trim();
      if (!words) return message;
      const data: ChatStep = { label: words, tool: 'note', state: 'done', done: words, ...(event.seq === undefined ? {} : { seq: event.seq }) };
      return { ...message, parts: upsertDataPart(parts, { type: 'data-progress', id: event.id, data }) };
    }
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
    case 'draft_delta': {
      const id = `draft-${event.id}`;
      const earlier = parts.find((p) => p.type === DRAFT_PART && p.id === id)?.data as ChatDraft | undefined;
      const data: ChatDraft = { tool: event.tool, fields: { ...(earlier?.fields ?? {}), ...event.fields }, open: event.open ?? null, state: 'writing' };
      return { ...message, parts: upsertDataPart(parts, { type: DRAFT_PART, id, data }) };
    }
    case 'draft_done': {
      const id = `draft-${event.id}`;
      const at = parts.findIndex((p) => p.type === DRAFT_PART && p.id === id);
      if (at === -1) return message;
      // A finished draft gives way to what it became (the card, the read). A failed one stays, saying so.
      if (event.state === 'done') return { ...message, parts: parts.filter((_, i) => i !== at) };
      return { ...message, parts: parts.map((p, i) => (i === at ? { ...p, data: { ...(p.data as ChatDraft), open: null, state: 'failed' } } : p)) };
    }
    case 'decision_reopened': {
      if (!parts.some((p) => isDecisionPartFor(p, event.key))) return message;
      return {
        ...message,
        parts: parts
          .filter((p) => !(p.type === 'data-action-receipt' && p.id === `receipt-${event.key}`))
          .map((p) => (isDecisionPartFor(p, event.key) ? { ...p, state: 'approval-requested', approval: { id: event.key } } : p)),
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
