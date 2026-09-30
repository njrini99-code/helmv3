import type { UIMessage } from 'ai';
import type { ActionProposal, ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';
import type { Measurement, MeasurementSeries, ToolEnvelope } from '@/lib/coachhelm/v3/chat/provenance';
import { MINUS, NO_DATA } from '../lib/format';

/**
 * Ask CoachHelm, the conversation (Clubhouse P013): what a thread of AI SDK message parts means on
 * screen. Pure and client-safe, so the thread, the evidence panel, the composer's "confirm first"
 * block and the tests all read the same code.
 *
 * The parts are the stream route's (`agent-tools.ts`): `data-progress`, `data-evidence`
 * `{ envelope }`, `data-action-proposal` `{ ...proposal, tool }`, `data-action-receipt`, the
 * verdict parts `data-grounding-flag` / `data-turn-incomplete`, `tool-*` parts whose
 * `approval.id` is what Confirm and Cancel answer, and `text`. Nothing here invents a figure:
 * every number drawn is a field of a tool envelope.
 */

type Part = { type: string; [key: string]: unknown };

const partsOf = (m: UIMessage): Part[] => ((m as unknown as { parts?: Part[] }).parts ?? []) as Part[];
const dataOf = <T>(p: Part): T | undefined => p.data as T | undefined;

// ── Small formatters ───────────────────────────────────────────────────────

/** A value in its unit: a true minus, an em dash for none, tabular numbers come from the CSS. */
export function formatValue(value: number | null, unit: Measurement['unit']): string {
  if (value === null || !Number.isFinite(value)) return NO_DATA;
  const sign = (v: number) => (v < 0 ? MINUS : '');
  switch (unit) {
    case 'percent':
      return `${sign(value)}${Math.abs(Math.round(value))}%`;
    case 'strokes':
      return `${value > 0 ? '+' : sign(value)}${Math.abs(value).toFixed(2)}`;
    case 'score':
    case 'count':
    case 'ratio':
      return `${sign(value)}${Number.isInteger(value) ? Math.abs(value) : Math.abs(value).toFixed(1)}`;
    case 'yards':
      return `${sign(value)}${Math.abs(Math.round(value))} yds`;
    case 'feet':
      return `${sign(value)}${Math.abs(Math.round(value))} ft`;
    default:
      return String(value);
  }
}

/** "Sep 29", read from the digits so no zone moves the day. */
export function fmtDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(d);
}

/** "126 attempts", "1 round". */
export function sampleWords(n: number, unit: Measurement['sample_unit']): string {
  const word = n === 1 ? unit.replace(/s$/, '') : unit;
  return `${n} ${word}`;
}

/** The provenance line under every block: the sample, the window and when it was computed. */
export function sourceLine(m: { sample_size: number; sample_unit: Measurement['sample_unit']; window_start: string | null; window_end: string | null; as_of: string }): string {
  const start = fmtDay(m.window_start);
  const end = fmtDay(m.window_end);
  const window = start && end && start !== end ? `${start} to ${end}` : (end ?? start);
  const computed = fmtDay(m.as_of);
  return [m.sample_size > 0 ? sampleWords(m.sample_size, m.sample_unit) : null, window, computed ? `computed ${computed}` : null].filter(Boolean).join(' · ');
}

// ── The turns ──────────────────────────────────────────────────────────────

export interface AskStep {
  id: string;
  label: string;
}

/** The pairing of one proposal card with the tool part that carries its approval. */
export type AskProposalStatus =
  /** Undecided, with a live approval: Confirm and Cancel answer it. */
  | 'live'
  /** The card arrived before its approval did (the turn is still streaming): the buttons wait. */
  | 'preparing'
  /** Confirmed: the coach approved it, or a receipt says it ran. */
  | 'confirmed'
  | 'cancelled'
  /** Nobody decided, and there is no approval left to answer: a reload, or the thread moved on. Nothing was created. */
  | 'abandoned';

export interface AskProposalView {
  /** The proposal's idempotency key: what ties it to its receipt. */
  key: string;
  tool: string;
  proposal: ActionProposal;
  approvalId: string | null;
  status: AskProposalStatus;
  receipt: ActionReceipt | null;
}

export type AskBlock =
  | { kind: 'text'; key: string; text: string; lead: boolean }
  | { kind: 'evidence'; key: string; envelope: ToolEnvelope }
  | { kind: 'proposal'; key: string; view: AskProposalView }
  | { kind: 'receipt'; key: string; receipt: ActionReceipt };

export interface AskUserTurn {
  role: 'user';
  id: string;
  text: string;
}

export interface AskAssistantTurn {
  role: 'assistant';
  id: string;
  steps: AskStep[];
  envelopes: ToolEnvelope[];
  blocks: AskBlock[];
  /** Set when the checks rejected the turn: its prose and evidence are not shown, only this note and any action cards. */
  note: string | null;
  /** The plain text of the answer, for Copy. */
  answerText: string;
  /** "Read 38 rounds across 8 players", without a duration (only the browser that watched it knows how long it took). */
  work: string | null;
  followUps: string[];
  /** The last turn, while it streams. */
  active: boolean;
}

export type AskTurn = AskUserTurn | AskAssistantTurn;

/** The coach's line, without the visible [Context: ...] prefix the hook puts in front of it. */
export function userText(message: UIMessage): string {
  return partsOf(message)
    .filter((p) => p.type === 'text')
    .map((p) => String(p.text ?? ''))
    .join('')
    .replace(/^\[Context:[^\]]*\]\n?/, '')
    .trim();
}

/** Raw tool names never reach the coach: a label that is one becomes "Working". */
export function stepLabel(raw: unknown): string {
  const label = typeof raw === 'string' ? raw.trim() : '';
  if (!label || /^[a-z]+(_[a-z]+)+$/.test(label)) return 'Working';
  return label;
}

const TOOL_ACTION: Record<string, string> = {
  create_focus_area: 'Create focus area',
  create_task: 'Assign task',
  create_team_announcement: 'Send team update',
  create_recurring_practice: 'Create recurring practice',
};

interface ToolPart extends Part {
  state?: string;
  toolCallId?: string;
  approval?: { id?: string; approved?: boolean };
}

const toolNameOf = (p: Part): string | null => (p.type.startsWith('tool-') ? p.type.slice('tool-'.length) : null);

/** A tool part still waiting on the coach: `approval-requested` with an approval id (the SDK moves it to `approval-responded` once answered). */
function isPendingToolPart(p: Part): p is ToolPart {
  const t = p as ToolPart;
  return toolNameOf(p) !== null && t.state === 'approval-requested' && typeof t.approval?.id === 'string';
}

/**
 * The action the coach still has to confirm or cancel, or null. Only the last assistant turn can
 * hold one: the SDK resubmits an approval only from the newest message, so an older card can no
 * longer be answered (it draws as "No decision was made"). The composer holds a new question back
 * while this is set, because the server does not yet treat an unanswered Confirm as a Cancel (PR #2105).
 * The approval id is `part.approval.id`, never the tool-call id.
 */
export function pendingApproval(messages: UIMessage[]): { approvalId: string; tool: string; action: string } | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return null;
  const parts = partsOf(last);
  const part = parts.find(isPendingToolPart);
  if (!part) return null;
  const tool = toolNameOf(part) as string;
  const proposal = proposalsOf(parts).find((p) => p.tool === tool);
  return { approvalId: part.approval?.id as string, tool, action: proposal?.proposal.action ?? TOOL_ACTION[tool] ?? 'this action' };
}

interface RawProposal {
  index: number;
  key: string;
  tool: string;
  proposal: ActionProposal;
}

function proposalsOf(parts: Part[]): RawProposal[] {
  const out: RawProposal[] = [];
  parts.forEach((p, index) => {
    if (p.type !== 'data-action-proposal') return;
    const data = dataOf<ActionProposal & { tool?: string }>(p);
    if (!data) return;
    const key = typeof data.idempotency_key === 'string' && data.idempotency_key ? data.idempotency_key : String(p.id ?? `proposal-${index}`);
    out.push({ index, key, tool: String(data.tool ?? ''), proposal: data });
  });
  return out;
}

/**
 * Which tool part answers which proposal card. The server writes a proposal's data part
 * (`proposal-{idempotency_key}`) when the tool's input is complete and the tool part itself
 * carries the approval, but nothing in either part names the other, and the key is derived from a
 * plan the client cannot rebuild. So they pair by order: the n-th proposal of a tool goes with the
 * n-th part of that tool in the message (both are written in call order). Two proposals of one tool
 * in a turn are therefore never crossed. A receipt pairs by its part id, `receipt-{key}`.
 */
export function pairProposals(parts: Part[], ctx: { isLast: boolean; busy: boolean }): Map<number, AskProposalView> {
  const proposals = proposalsOf(parts);
  const seen = new Map<string, number>();
  const toolParts = (tool: string) => parts.filter((p) => toolNameOf(p) === tool) as ToolPart[];
  const receiptByKey = new Map<string, ActionReceipt>();
  for (const p of parts) {
    if (p.type !== 'data-action-receipt') continue;
    const id = typeof p.id === 'string' ? p.id : '';
    const data = dataOf<ActionReceipt>(p);
    if (data && id.startsWith('receipt-')) receiptByKey.set(id.slice('receipt-'.length), data);
  }
  const out = new Map<number, AskProposalView>();
  for (const r of proposals) {
    const n = seen.get(r.tool) ?? 0;
    seen.set(r.tool, n + 1);
    const tp = toolParts(r.tool)[n];
    const approvalId = typeof tp?.approval?.id === 'string' ? tp.approval.id : null;
    const receipt = receiptByKey.get(r.key) ?? null;
    let status: AskProposalStatus;
    if (receipt || tp?.approval?.approved === true) status = 'confirmed';
    else if (tp?.approval?.approved === false || tp?.state === 'output-denied') status = 'cancelled';
    else if (ctx.isLast && approvalId && tp?.state === 'approval-requested') status = 'live';
    else if (ctx.isLast && ctx.busy && !approvalId) status = 'preparing';
    else status = 'abandoned';
    out.set(r.index, { key: r.key, tool: r.tool, proposal: r.proposal, approvalId, status, receipt });
  }
  return out;
}

/** "Read 38 rounds across 8 players": the largest sample per unit, never a sum of overlapping windows. */
export function describeWork(steps: AskStep[], envelopes: ToolEnvelope[]): string | null {
  if (steps.length === 0) return null;
  const ms = envelopes.flatMap((e) => e.measurements);
  const maxBy = (unit: string) => ms.filter((m) => m.sample_unit === unit).reduce((max, m) => Math.max(max, m.sample_size), 0);
  const rounds = maxBy('rounds');
  const players = new Set(ms.filter((m) => m.entity.kind === 'player').map((m) => m.entity.id)).size;
  const bits: string[] = [];
  if (rounds > 0) bits.push(`${rounds} round${rounds === 1 ? '' : 's'}`);
  if (players > 1) bits.push(`${players} players`);
  if (bits.length === 0) return `Worked through ${steps.length} step${steps.length === 1 ? '' : 's'}`;
  return `Read ${bits.join(' across ')}`;
}

/** At most three next steps, each one only when the evidence supports it: a row of always-there buttons teaches people to stop reading them. */
export function followUpsFor(envelopes: ToolEnvelope[]): string[] {
  const out: string[] = [];
  for (const envelope of envelopes) {
    if (envelope.coverage === 'unavailable') continue;
    const player = envelope.measurements[0]?.entity;
    const putting = envelope.measurements.some((m) => /putt/i.test(m.metric_id));
    if (player?.kind === 'player' && putting) {
      out.push(`Create a focus area for ${player.label} on putting`);
      out.push(`Build a putting practice for ${player.label}`);
    } else if (player?.kind === 'player') {
      out.push(`Compare ${player.label} with the rest of the team`);
    }
    const detail = envelope.detail as { events?: Array<{ rsvp_pending_count?: number }> } | undefined;
    if (detail?.events?.some((e) => (e.rsvp_pending_count ?? 0) > 0)) out.push('Send an RSVP reminder');
  }
  return [...new Set(out)].slice(0, 3);
}

export const REJECTED_TURN_NOTE = "This answer didn't finish coming through, so it isn't being shown. Please ask again.";

/** Bold markers and list markers out, for Copy. */
export function plainText(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '$1').trim();
}

/** One assistant message as the thread draws it. */
export function buildAssistantTurn(message: UIMessage, ctx: { isLast: boolean; busy: boolean }): AskAssistantTurn {
  const parts = partsOf(message);
  const steps: AskStep[] = parts
    .filter((p) => p.type === 'data-progress')
    .map((p, i) => ({ id: String(p.id ?? `step-${i}`), label: stepLabel(dataOf<{ label?: string }>(p)?.label) }));
  const envelopes = parts
    .filter((p) => p.type === 'data-evidence')
    .map((p) => dataOf<{ envelope?: ToolEnvelope }>(p)?.envelope)
    .filter((e): e is ToolEnvelope => Boolean(e));
  const paired = pairProposals(parts, ctx);
  const active = ctx.isLast && ctx.busy;

  const actionBlocks = (): AskBlock[] => {
    const out: AskBlock[] = [];
    parts.forEach((p, i) => {
      if (p.type === 'data-action-proposal') {
        const view = paired.get(i);
        if (view) out.push({ kind: 'proposal', key: `p-${view.key}`, view });
      } else if (p.type === 'data-action-receipt') {
        const receipt = dataOf<ActionReceipt>(p);
        if (receipt) out.push({ kind: 'receipt', key: `r-${String(p.id ?? i)}`, receipt });
      }
    });
    return out;
  };

  // The checks rejected this turn: one note, and the cards stay (a card is a fact about an action, not a claim the audit judges).
  const verdict = parts.find((p) => p.type === 'data-grounding-flag' || p.type === 'data-turn-incomplete');
  if (verdict) {
    const note = String(dataOf<{ note?: string }>(verdict)?.note ?? '').trim() || REJECTED_TURN_NOTE;
    return { role: 'assistant', id: message.id, steps: [], envelopes: [], blocks: actionBlocks(), note, answerText: note, work: null, followUps: [], active };
  }

  const blocks: AskBlock[] = [];
  let lead = true;
  const texts: string[] = [];
  parts.forEach((p, i) => {
    if (p.type === 'text') {
      const text = String(p.text ?? '');
      if (!text.trim()) return;
      blocks.push({ kind: 'text', key: `t-${i}`, text, lead });
      lead = false;
      texts.push(plainText(text));
    } else if (p.type === 'data-evidence') {
      const envelope = dataOf<{ envelope?: ToolEnvelope }>(p)?.envelope;
      if (envelope) blocks.push({ kind: 'evidence', key: `e-${String(p.id ?? i)}`, envelope });
    } else if (p.type === 'data-action-proposal') {
      const view = paired.get(i);
      if (view) blocks.push({ kind: 'proposal', key: `p-${view.key}`, view });
    } else if (p.type === 'data-action-receipt') {
      const receipt = dataOf<ActionReceipt>(p);
      if (receipt) blocks.push({ kind: 'receipt', key: `r-${String(p.id ?? i)}`, receipt });
    }
  });

  const hasAction = blocks.some((b) => b.kind === 'proposal' || b.kind === 'receipt');
  return {
    role: 'assistant',
    id: message.id,
    steps,
    envelopes,
    blocks,
    note: null,
    answerText: texts.join('\n\n'),
    work: describeWork(steps, envelopes),
    followUps: hasAction ? [] : followUpsFor(envelopes),
    active,
  };
}

/** The whole thread. A user turn with no text (an approval resubmit carries none) is not drawn. */
export function buildTurns(messages: UIMessage[], opts: { busy: boolean }): AskTurn[] {
  const out: AskTurn[] = [];
  messages.forEach((m, i) => {
    if (m.role === 'user') {
      const text = userText(m);
      if (text) out.push({ role: 'user', id: m.id, text });
    } else if (m.role === 'assistant') {
      out.push(buildAssistantTurn(m, { isLast: i === messages.length - 1, busy: opts.busy }));
    }
  });
  return out;
}

/**
 * Whether it is true to say a failed answer changed nothing. It is not when the last turn holds a
 * receipt, or an action the coach confirmed that has no receipt yet (the write may have run before
 * the stream died).
 */
export function failedAnswerChangedNothing(messages: UIMessage[]): { changedNothing: boolean; unconfirmedWrite: boolean } {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return { changedNothing: true, unconfirmedWrite: false };
  const turn = buildAssistantTurn(last, { isLast: true, busy: false });
  const receipts = turn.blocks.some((b) => b.kind === 'receipt');
  const unconfirmedWrite = turn.blocks.some((b) => b.kind === 'proposal' && b.view.status === 'confirmed' && !b.view.receipt);
  return { changedNothing: !receipts && !unconfirmedWrite, unconfirmedWrite };
}

// ── Prose ──────────────────────────────────────────────────────────────────

export type ProseBlock = { kind: 'paragraph'; text: string } | { kind: 'list'; items: string[] };

/**
 * Paragraphs and lists only. Headings are dropped to plain text (a heading marker is stripped, not
 * honoured: rewarding headings is how a two-sentence answer becomes a wall of sections), and a lone
 * asterisk stays a character.
 */
export function parseProse(text: string): ProseBlock[] {
  const blocks: ProseBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', text: paragraph.join(' ').trim() });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length > 0) blocks.push({ kind: 'list', items: list });
    list = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const bullet = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1] ?? '');
    } else if (line.trim() === '') {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line.replace(/^#{1,6}\s*/, ''));
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

export interface InlineSegment {
  text: string;
  bold: boolean;
  /** The roster name this segment is, when it is one. */
  mention?: string;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Bold, then roster names (longest first, on word boundaries: "Nicky" is not Nick; "Wake Forest" is not a player). */
export function splitInline(text: string, names: string[]): InlineSegment[] {
  const sorted = [...names].filter(Boolean).sort((a, b) => b.length - a.length);
  const bolds: Array<{ text: string; bold: boolean }> = [];
  let last = 0;
  for (const m of text.matchAll(/\*\*(.+?)\*\*/g)) {
    const start = m.index ?? 0;
    if (start > last) bolds.push({ text: text.slice(last, start), bold: false });
    bolds.push({ text: m[1] ?? '', bold: true });
    last = start + m[0].length;
  }
  if (last < text.length) bolds.push({ text: text.slice(last), bold: false });
  if (bolds.length === 0) bolds.push({ text, bold: false });
  if (sorted.length === 0) return bolds.filter((s) => s.text);
  const re = new RegExp(`\\b(${sorted.map(escapeRe).join('|')})\\b`, 'g');
  const out: InlineSegment[] = [];
  for (const seg of bolds) {
    let at = 0;
    for (const m of seg.text.matchAll(re)) {
      const start = m.index ?? 0;
      if (start > at) out.push({ text: seg.text.slice(at, start), bold: seg.bold });
      out.push({ text: m[0], bold: seg.bold, mention: m[0] });
      at = start + m[0].length;
    }
    if (at < seg.text.length) out.push({ text: seg.text.slice(at), bold: seg.bold });
  }
  return out.filter((s) => s.text);
}

/** "@Jonah Okafor" in the coach's own line: the composer's "@" picker wrote it, and the thread draws it as a mention. */
export function splitAtMentions(text: string, names: string[]): Array<{ text: string; mention?: string }> {
  const sorted = [...names].filter(Boolean).sort((a, b) => b.length - a.length);
  if (sorted.length === 0) return [{ text }];
  const re = new RegExp(`@(${sorted.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  const out: Array<{ text: string; mention?: string }> = [];
  let at = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > at) out.push({ text: text.slice(at, start) });
    out.push({ text: m[0], mention: m[1] });
    at = start + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out.length > 0 ? out : [{ text }];
}

// ── Evidence ───────────────────────────────────────────────────────────────

/** The same figures as a real table: every chart has one, for "View as table" and for a screen reader. */
export interface AskTable {
  caption: string;
  columns: string[];
  rows: string[][];
}

interface EvBase {
  title: string;
  /** "126 attempts · Sep 1 to Sep 29 · computed Sep 29". */
  source: string | null;
  /** The coverage note, when the read was partial. */
  note: string | null;
  /** A benchmark, only when a versioned one was retrieved and applies to this cohort. */
  bench: string | null;
  table: AskTable;
}

export type AskEvidence =
  | { kind: 'unavailable'; note: string }
  | { kind: 'empty'; note: string }
  | (EvBase & { kind: 'trend'; unit: Measurement['unit']; points: Array<{ label: string; value: number; n: number }>; reference: { label: string; value: number } | null; summary: string; goodDirection: 'up' | 'down' | null })
  | (EvBase & { kind: 'bars'; rows: Array<{ label: string; pct: number; display: string; of: string | null; tone: 'good' | 'loss' | 'neutral' }> })
  | (EvBase & { kind: 'ranking'; rows: Array<{ rank: number; id: string; label: string; display: string; of: string | null }> })
  | (EvBase & { kind: 'compare' })
  | (EvBase & { kind: 'legs'; rows: Array<{ label: string; value: number; display: string }>; takeaway: string })
  | (EvBase & { kind: 'tiles'; tiles: EvidenceTile[] })
  | (EvBase & { kind: 'table' });

export interface EvidenceTile {
  label: string;
  value: string;
  sub: string | null;
  /** A loss against what the read compared it to: drawn amber, never red. */
  tone: 'loss' | 'plain';
}

/** Fewer points than this is a change, not a trend: drawn as a table. */
export const MIN_TREND_POINTS = 3;

const benchOf = (b: Measurement['benchmark'] | MeasurementSeries['benchmark'], unit: Measurement['unit']): string | null =>
  b && !b.omitted_for_cohort ? `${b.source}, ${b.version}: ${formatValue(b.value, unit)}` : null;

const partialNote = (e: { coverage: string; coverage_note: string | null }): string | null =>
  e.coverage === 'partial' && e.coverage_note ? e.coverage_note : null;

/** "of 44", or the sample in words. */
function ofSample(m: Measurement): string | null {
  if (m.denominator !== null && m.denominator > 0) return `of ${m.denominator}`;
  return m.sample_size > 0 ? sampleWords(m.sample_size, m.sample_unit) : null;
}

/** "3 of 9": a rate's made count, when the read gave its denominator. */
function madeOf(m: Measurement): string | null {
  if (m.unit === 'percent' && m.value !== null && m.denominator !== null && m.denominator > 0) {
    return `${Math.round((m.value / 100) * m.denominator)} of ${m.denominator}`;
  }
  return m.sample_size > 0 ? sampleWords(m.sample_size, m.sample_unit) : null;
}

function strokesGainedLegs(ms: Measurement[]): Measurement[] | null {
  const sg = ms.filter((m) => m.unit === 'strokes' && m.metric_id.startsWith('sg_') && m.value !== null);
  return sg.length >= 2 ? sg : null;
}

/** A column heading from a key: "target_value" becomes "Target value". */
function heading(key: string): string {
  const s = key.replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const isPlain = (v: unknown): v is string | number | boolean => ['string', 'number', 'boolean'].includes(typeof v);

/**
 * A table from a tool's `detail` when it is a list of records (open signals, focus areas,
 * events...): the fallback for an evidence kind this screen has no chart for. Ids and raw
 * timestamps are left out; at most four columns and eight rows.
 */
export function detailTable(detail: unknown, caption: string): AskTable | null {
  if (!detail || typeof detail !== 'object') return null;
  const lists = Object.values(detail as Record<string, unknown>).filter((v): v is Array<Record<string, unknown>> => Array.isArray(v) && v.length > 0 && v.every((r) => r && typeof r === 'object' && !Array.isArray(r)));
  const rows = lists[0];
  if (!rows) return null;
  const keys = Object.keys(rows[0] ?? {})
    .filter((k) => !/(^id$|_id$|^type$|_at$|^timezone$)/.test(k) && rows.some((r) => isPlain(r[k]) && r[k] !== ''))
    .slice(0, 4);
  if (keys.length === 0) return null;
  return { caption, columns: keys.map(heading), rows: rows.slice(0, 8).map((r) => keys.map((k) => (isPlain(r[k]) && r[k] !== '' ? String(r[k]) : NO_DATA))) };
}

function seriesTable(s: MeasurementSeries): AskTable {
  return {
    caption: `${s.metric_label} for ${s.entity.label}`,
    columns: [s.points.some((p) => p.bucket) ? 'Range' : 'Round', s.metric_label, 'Sample'],
    rows: s.points.map((p) => [p.bucket ?? fmtDay(p.at) ?? p.at, formatValue(p.value, s.unit), p.sample_size > 0 ? String(p.sample_size) : NO_DATA]),
  };
}

function trendBlock(s: MeasurementSeries): AskEvidence {
  const values = s.points.map((p) => p.value);
  const mean = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  const bench = s.benchmark && !s.benchmark.omitted_for_cohort ? s.benchmark : null;
  const first = values[0] as number;
  const last = values[values.length - 1] as number;
  return {
    kind: 'trend',
    title: s.metric_label,
    unit: s.unit,
    points: s.points.map((p) => ({ label: fmtDay(p.at) ?? p.at, value: p.value, n: p.sample_size })),
    // A real benchmark beats the series' own average: "vs the Tour" is a standard, "vs your own average" is a tautology.
    reference: bench ? { label: 'Benchmark', value: bench.value } : { label: 'Average', value: mean },
    summary: `${s.metric_label} for ${s.entity.label}: ${formatValue(first, s.unit)} to ${formatValue(last, s.unit)} across ${s.points.length} rounds.`,
    goodDirection: s.direction === 'higher_better' ? 'up' : s.direction === 'lower_better' ? 'down' : null,
    source: sourceLine({ sample_size: s.points.length, sample_unit: 'rounds', window_start: s.window_start, window_end: s.window_end, as_of: s.as_of }),
    note: partialNote(s),
    bench: benchOf(s.benchmark, s.unit),
    table: seriesTable(s),
  };
}

function bucketBlock(s: MeasurementSeries): AskEvidence {
  const rows = s.points.map((p) => ({ label: p.bucket ?? fmtDay(p.at) ?? p.at, value: p.value, n: p.sample_size }));
  const max = s.unit === 'percent' ? 100 : Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  const values = rows.map((r) => r.value);
  // The weak side is the one the read says is worse: the lowest when higher is better, the highest when lower is.
  const weak = s.direction === 'higher_better' ? Math.min(...values) : s.direction === 'lower_better' ? Math.max(...values) : null;
  const flagged = weak !== null && rows.length >= 2 && new Set(values).size > 1;
  return {
    kind: 'bars',
    title: s.metric_label,
    rows: rows.map((r) => ({
      label: r.label,
      pct: Math.max(0, Math.min(100, (Math.abs(r.value) / max) * 100)),
      display: formatValue(r.value, s.unit),
      of: r.n > 0 ? `of ${r.n}` : null,
      tone: !flagged ? 'neutral' : r.value === weak ? 'loss' : 'good',
    })),
    source: sourceLine({ sample_size: rows.reduce((a, r) => a + r.n, 0), sample_unit: 'attempts', window_start: s.window_start, window_end: s.window_end, as_of: s.as_of }),
    note: partialNote(s),
    bench: benchOf(s.benchmark, s.unit),
    table: seriesTable(s),
  };
}

function measurementTable(ms: Measurement[], caption: string): AskTable {
  return {
    caption,
    columns: ['Player', 'Metric', 'Value', 'Sample'],
    rows: ms.map((m) => [m.entity.label, m.metric_label, formatValue(m.value, m.unit), m.sample_size > 0 ? sampleWords(m.sample_size, m.sample_unit) : NO_DATA]),
  };
}

/** One tool's output as the block this screen draws. The choice is made from the SHAPE of the evidence, never from what the model asked for. */
export function evidenceBlocks(envelope: ToolEnvelope): AskEvidence[] {
  // A failed read is never "no data": it is the honest "could not read this".
  if (envelope.coverage === 'unavailable') return [{ kind: 'unavailable', note: envelope.coverage_note?.trim() || envelope.summary || 'The read did not come back.' }];
  if (envelope.coverage === 'empty') return [{ kind: 'empty', note: envelope.coverage_note?.trim() || envelope.summary || 'Nothing is recorded for this yet.' }];

  const blocks: AskEvidence[] = [];
  const ms = envelope.measurements;
  const first = ms[0];
  const bucketSeries = envelope.series.filter((s) => s.points.some((p) => p.bucket !== null));
  const timeSeries = envelope.series.filter((s) => s.points.every((p) => p.bucket === null));
  for (const s of timeSeries) {
    if (s.points.length === 0) continue;
    // Rule: two points are a change, not a trend.
    blocks.push(s.points.length < MIN_TREND_POINTS ? { kind: 'table', title: s.metric_label, source: null, note: partialNote(s), bench: benchOf(s.benchmark, s.unit), table: seriesTable(s) } : trendBlock(s));
  }
  for (const s of bucketSeries) {
    if (s.points.length === 0) continue;
    blocks.push(s.points.length < 2 ? { kind: 'table', title: s.metric_label, source: null, note: partialNote(s), bench: benchOf(s.benchmark, s.unit), table: seriesTable(s) } : bucketBlock(s));
  }

  if (envelope.series.length === 0 && ms.length > 0 && first) {
    const players = new Set(ms.map((m) => m.entity.id));
    const metrics = new Set(ms.map((m) => m.metric_id));
    const isRanking = players.size >= 3 && metrics.size === 1;
    const isComparison = players.size >= 2 && metrics.size >= 1;
    const legs = strokesGainedLegs(ms);
    const base = { source: sourceLine(first), note: partialNote(envelope), bench: benchOf(first.benchmark, first.unit) };
    if (isRanking) {
      const ranked = ms.filter((m) => m.value !== null);
      const missing = ms.length - ranked.length;
      blocks.push({
        kind: 'ranking',
        title: first.metric_label,
        ...base,
        note: missing > 0 ? `${missing} player${missing === 1 ? ' has' : 's have'} no recorded data for this.` : base.note,
        rows: ranked.map((m, i) => ({ rank: i + 1, id: m.entity.id, label: m.entity.label, display: formatValue(m.value, m.unit), of: ofSample(m) })),
        table: { caption: first.metric_label, columns: ['Rank', 'Player', first.metric_label, 'Sample'], rows: ranked.map((m, i) => [String(i + 1), m.entity.label, formatValue(m.value, m.unit), m.sample_size > 0 ? sampleWords(m.sample_size, m.sample_unit) : NO_DATA]) },
      });
    } else if (isComparison) {
      const names = [...new Set(ms.map((m) => m.entity.label))];
      const metricIds = [...new Set(ms.map((m) => m.metric_id))];
      const find = (n: string, id: string) => ms.find((m) => m.entity.label === n && m.metric_id === id);
      blocks.push({
        kind: 'compare',
        title: `${names.join(' and ')}`,
        ...base,
        table: {
          caption: `Comparison of ${names.join(' and ')} across ${metricIds.length} metric${metricIds.length === 1 ? '' : 's'}, with sample sizes`,
          columns: ['Metric', ...names],
          rows: metricIds.map((id) => [ms.find((m) => m.metric_id === id)?.metric_label ?? id, ...names.map((n) => { const m = find(n, id); return m ? `${formatValue(m.value, m.unit)}${m.sample_size > 0 ? ` (${sampleWords(m.sample_size, m.sample_unit)})` : ''}` : NO_DATA; })]),
        },
      });
    } else if (legs) {
      const worst = [...legs].sort((a, b) => (a.value ?? 0) - (b.value ?? 0))[0] as Measurement;
      const entities = new Set(legs.map((m) => m.entity.label));
      blocks.push({
        kind: 'legs',
        title: entities.size === 1 ? `Strokes gained, ${legs[0]?.entity.label}` : 'Strokes gained',
        ...base,
        rows: legs.map((m) => ({ label: m.metric_label.replace(/^strokes gained[:\s-]*/i, '').trim() || m.metric_label, value: m.value as number, display: formatValue(m.value, m.unit) })),
        takeaway: (worst.value ?? 0) < 0 ? `Largest loss: ${worst.metric_label} at ${formatValue(worst.value, worst.unit)}.` : 'No leg is below zero.',
        table: measurementTable(legs, 'Strokes gained by leg'),
      });
    } else {
      const many = players.size > 1;
      blocks.push({
        kind: 'tiles',
        title: envelope.summary,
        ...base,
        tiles: ms.map((m) => ({ label: many ? `${m.entity.label}, ${m.metric_label}` : m.metric_label, value: formatValue(m.value, m.unit), sub: madeOf(m), tone: 'plain' })),
        table: measurementTable(ms, envelope.summary),
      });
    }
  }

  // Nothing above drew it (a tool whose output is a list of records, or a kind added later): its table, never nothing.
  if (blocks.length === 0) {
    const table = detailTable(envelope.detail, envelope.summary) ?? { caption: envelope.summary, columns: ['Read', 'Result'], rows: [[envelope.summary, envelope.coverage_note ?? 'Read']] };
    blocks.push({ kind: 'table', title: envelope.summary, source: null, note: partialNote(envelope), bench: null, table });
  }
  return blocks;
}

// ── The evidence panel ─────────────────────────────────────────────────────

/** What an action card hands the panel: which turn, which card, and who it is about. */
export type EvidenceFocus = { messageId: string; key: string; label: string; playerId?: string };

/** At or under this many observations the panel says so: a direction, not a verdict. */
export const SMALL_SAMPLE_MAX = 12;

export interface AskEvidencePanelModel {
  title: string;
  subtitle: string;
  tiles: EvidenceTile[];
  trend: Extract<AskEvidence, { kind: 'trend' }> | null;
  table: AskTable | null;
  smallSample: string | null;
  /** Nothing in this conversation speaks to this player. */
  empty: boolean;
}

function matchesPlayer(entity: { kind: string; id: string; label: string }, focus: EvidenceFocus): boolean {
  if (entity.kind !== 'player') return false;
  return focus.playerId ? entity.id === focus.playerId : focus.label.toLowerCase().includes(entity.label.toLowerCase());
}

/**
 * The figures behind an action card: the chosen player's measurements from the answers up to and
 * including the card's turn, the team figure beside them, a trend when there are rounds to draw,
 * and a rounds table. Later evidence for the same metric replaces earlier.
 */
export function buildEvidencePanel(messages: UIMessage[], focus: EvidenceFocus): AskEvidencePanelModel {
  const at = messages.findIndex((m) => m.id === focus.messageId);
  const upto = at === -1 ? messages : messages.slice(0, at + 1);
  const envelopes = upto.flatMap((m) => (m.role === 'assistant' ? partsOf(m).filter((p) => p.type === 'data-evidence').map((p) => dataOf<{ envelope?: ToolEnvelope }>(p)?.envelope).filter((e): e is ToolEnvelope => Boolean(e) && (e as ToolEnvelope).coverage !== 'unavailable') : []));

  // The evidence nearest the card is the most relevant: walk the answers newest first, and the first figure seen for a metric wins.
  const mine = new Map<string, Measurement>();
  const team = new Map<string, Measurement>();
  let series: MeasurementSeries | null = null;
  const drawable = (s: MeasurementSeries) => s.points.every((p) => p.bucket === null) && s.points.length >= MIN_TREND_POINTS;
  for (const e of [...envelopes].reverse()) {
    for (const m of e.measurements) {
      if (m.value === null) continue;
      if (matchesPlayer(m.entity, focus)) {
        if (!mine.has(m.metric_id)) mine.set(m.metric_id, m);
      } else if (m.entity.kind === 'team' && !team.has(m.metric_id)) team.set(m.metric_id, m);
    }
    for (const s of e.series) {
      if (!matchesPlayer(s.entity, focus) || s.points.length === 0) continue;
      if (!series || (drawable(s) && !drawable(series))) series = s;
    }
  }

  // Two of the player's figures, with the team's beside the first: the player, the team, the player again (the board's three tiles).
  const playerMs = [...mine.values()].slice(0, 2);
  const teamM = playerMs[0] ? team.get(playerMs[0].metric_id) : undefined;
  const tileOf = (m: Measurement, label: string): EvidenceTile => ({ label, value: formatValue(m.value, m.unit), sub: madeOf(m), tone: 'plain' });
  const tiles: EvidenceTile[] = [];
  playerMs.forEach((m, i) => {
    tiles.push(tileOf(m, m.metric_label));
    if (i === 0 && teamM) tiles.push(tileOf(teamM, `Team, ${teamM.metric_label}`));
  });

  const trendBlockOrNull = series && series.points.length >= MIN_TREND_POINTS ? (trendBlock(series) as Extract<AskEvidence, { kind: 'trend' }>) : null;
  // The team's figure on the same metric is the line the rounds are read against.
  const teamOnSeries = series ? team.get(series.metric_id) : undefined;
  if (trendBlockOrNull && teamOnSeries && teamOnSeries.value !== null) trendBlockOrNull.reference = { label: `Team ${formatValue(teamOnSeries.value, teamOnSeries.unit)}`, value: teamOnSeries.value };
  const primary = playerMs[0];
  const smallSample = primary && primary.sample_size > 0 && primary.sample_size <= SMALL_SAMPLE_MAX ? `Small sample: ${sampleWords(primary.sample_size, primary.sample_unit)}. Treat it as a direction, not a verdict.` : null;

  return {
    title: 'Evidence',
    subtitle: focus.label,
    tiles,
    trend: trendBlockOrNull,
    table: series ? seriesTable(series) : null,
    smallSample,
    empty: tiles.length === 0 && !series,
  };
}

/** Whether there is anything to show for a card: decides "Evidence" versus "See {name}'s stats". */
export function evidenceAvailable(messages: UIMessage[], focus: EvidenceFocus): boolean {
  return !buildEvidencePanel(messages, focus).empty;
}

/** The focus an action card hands the panel. */
export function focusForProposal(messageId: string, view: AskProposalView): EvidenceFocus | null {
  const player = view.proposal.affects.find((a) => a.kind === 'player');
  if (!player) return null;
  const what = view.proposal.facts.find((f) => /^(focus|what|title)$/i.test(f.label))?.value;
  return { messageId, key: view.key, label: what ? `${player.label}, ${what.charAt(0).toLowerCase()}${what.slice(1)}` : player.label, playerId: player.id };
}
