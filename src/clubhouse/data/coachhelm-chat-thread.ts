import { MODEL_FACING_NOTE, rowsCaption } from '@/lib/coachhelm/v3/chat/rows-caption';
import { artifactsOf, type AskArtifact } from '../screens/coachhelm/chat/parts/artifacts';
import type { UIMessage } from 'ai';
import type { ReadPictureData } from '../screens/coachhelm/plan/ReadPicture';
import type { ActionProposal, ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';
import { turnMetaOf } from '@/lib/coachhelm/v3/chat/engine/protocol';
import type { Measurement, MeasurementSeries, ToolEnvelope } from '@/lib/coachhelm/v3/chat/provenance';
import { WIDE_READ_CHIPS } from '@/lib/coachhelm/v3/chat/wide-read-names';
import { salvageComposition, type ValidatedComposition } from '@/lib/coachhelm/v3/chat/visuals/composition';
import { ValidatedVisualArtifact } from '@/lib/coachhelm/v3/chat/visuals/schema';
import { changeTone, formatFixed, formatSG, formatToPar, MINUS, NO_DATA } from '../lib/format';
import { formatWallClock, zoneWallParts } from '../lib/dates';
import { plural } from '../lib/plural';
import { METRIC_RENDER_CONFIG } from '@/lib/coachhelm/v3/standing/metric-config';
import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';

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

/** A score relative to par ("Scoring average to par", `scoring_average_vs_par`): golf writes it signed, with E for even. */
export function isToPar(metric?: { metric_id: string; metric_label: string } | null): boolean {
  return Boolean(metric && (/(^|_)(to|vs)_par(_|$)/.test(metric.metric_id) || /\bto par\b/i.test(metric.metric_label)));
}

/**
 * A value in its unit: a true minus, an em dash for none, tabular numbers come from the CSS. Given its metric, a to-par
 * score is signed ("+3.1", "E", "−0.4"); a change between two figures is not a score, so its caller leaves the metric out.
 */
export function formatValue(value: number | null, unit: Measurement['unit'], metric?: { metric_id: string; metric_label: string } | null): string {
  if (value === null || !Number.isFinite(value)) return NO_DATA;
  if (isToPar(metric)) return formatToPar(value, Number.isInteger(value) ? 0 : 1);
  const sign = (v: number) => (v < 0 ? MINUS : '');
  switch (unit) {
    case 'percent':
      return `${sign(value)}${Math.abs(Math.round(value))}%`;
    case 'strokes':
      // Strokes gained at one decimal, as every screen prints it (owner decision 11).
      return formatSG(value);
    case 'score':
    case 'count':
    case 'ratio':
      return `${sign(value)}${Number.isInteger(value) ? Math.abs(value) : formatFixed(Math.abs(value), 1)}`;
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
  /** Ask v2's replaced progress part; old parts lack them and draw as today. */
  state?: 'active' | 'done' | 'failed' | 'next';
  /** The past-tense label. */
  done?: string;
  /** One fact the read returned. */
  detail?: string;
  /** A practice read's picture, drawn under the finished step. */
  picture?: ReadPictureData;
  /** Chat v3, the activity island (the engine's step shape; every field optional, so an older stored step still draws). */
  kind?: 'read' | 'find' | 'compare' | 'calculate' | 'visual' | 'draft' | 'check';
  /** The step this one runs under (a read the model's code calls). */
  parentId?: string;
  /** What the step is touching, as far as is known: faces and rounds join as they are found. */
  subjects?: AskStepSubject[];
  /** A running tally; `more` while it can still grow. */
  count?: { n: number; unit: string; more: boolean };
  /** A calculation: what it covered. */
  covers?: { n: number; of: number; unit: string };
  /** The read it produced: a finished step opens it. */
  ref?: string;
  startedAt?: string;
  endedAt?: string;
}

export interface AskStepSubject {
  kind: 'player' | 'team' | 'round' | 'event' | 'qualifier' | 'tournament' | 'plan' | 'document';
  id: string;
  label: string;
}

/** One read of a turn, by the ref the model cites (Ask v2). */
export interface AskTurnRead {
  ref: string;
  tool: string;
  /** "Putts per round". */
  name: string;
  /** "Putts · 30 days". */
  chip: string;
  envelope: ToolEnvelope;
  /** The model's code made this read (programmatic reads): the answer's figures carry no markers and are worked out from it. */
  via?: 'code';
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

import type { PlanPartData } from '../screens/coachhelm/plan/PlanCard';

export interface AskBriefData {
  title: string;
  /** A practice plan's one card: every group at once, with its line under the head. */
  intake?: { line: string; format?: string | null };
  questions: Array<{ id: string; title: string; why?: string; multi?: boolean; options: Array<{ id: string; label: string; hint?: string }>; pick?: string[] }>;
}

/** A draft that opens Messages; the tool writes nothing and the coach sends. */
export interface AskHandoffData {
  kind: 'board' | 'message' | 'poll';
  /** Empty when the draft names one thread. */
  players: string[];
  /** One thread the coach is in, found by find_thread. */
  conversationId?: string;
  title: string;
  /** The thread's name, on a poll. */
  thread?: string;
  draft: string;
  poll?: { question: string; options: string[]; multi?: boolean; closes?: string };
}

export type AskBlock =
  | { kind: 'text'; key: string; text: string; lead: boolean }
  | { kind: 'evidence'; key: string; envelope: ToolEnvelope; ref?: string }
  | { kind: 'proposal'; key: string; view: AskProposalView }
  | { kind: 'receipt'; key: string; receipt: ActionReceipt }
  | { kind: 'visual'; key: string; artifact: ValidatedVisualArtifact }
  | { kind: 'composition'; key: string; composition: ValidatedComposition }
  | { kind: 'plan'; key: string; plan: PlanPartData }
  | { kind: 'brief'; key: string; brief: AskBriefData }
  | { kind: 'handoff'; key: string; handoff: AskHandoffData };

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
  /** Ask v2: the artifacts this turn wrote. */
  artifacts?: AskArtifact[];
  /** Ask v2: every read of the turn, in order. */
  reads?: AskTurnRead[];
  /** Ask v2: the block types of a `show_visual` still on its way; null with none. */
  pendingVisual?: string[] | null;
  /** Chat v3: how long the server worked on the turn, from its stored meta (`data-turn-meta`). A turn stored before it has none. */
  durationMs?: number | null;
  /** Blocks of a stored visual that could not be drawn ("block 1 (season_compare): this_season…"): the answer reports them. */
  visualFaults?: string[];
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
    // A new question withdrew the card (engine E15): nobody pressed Cancel, so it reads as set aside, not cancelled.
    else if ((tp?.approval as { reason?: string } | undefined)?.reason === 'superseded') status = 'abandoned';
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
  if (rounds > 0) bits.push(plural(rounds, 'round'));
  if (players > 1) bits.push(`${players} players`);
  if (bits.length === 0) return `Worked through ${plural(steps.length, 'step')}`;
  return `Read ${bits.join(' across ')}`;
}

/**
 * A player's own next steps: read-only and about their own game, never a write (focus areas, practices, reminders) and never
 * a teammate comparison, which the player Ask can't do (01-BRIEF decision 1: stats and visuals only, Tour and team averages).
 */
export function playerFollowUps(followUps: readonly string[], envelopes: ToolEnvelope[]): string[] {
  if (followUps.length === 0) return [];
  const putting = envelopes.some((e) => e.coverage !== 'unavailable' && e.measurements.some((m) => /putt/i.test(m.metric_id)));
  const out = putting ? ['Break my putting down by distance', 'How does my putting compare with the Tour?'] : ['How does this compare with the Tour?', 'How has this changed over my last 10 rounds?'];
  return out.slice(0, 3);
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

/** The server's own sentence for a rejected turn (`STREAM_INCOMPLETE_NOTE`, src/lib/coachhelm/v3/chat/verdict.ts), for a
 * verdict that arrives without it: word for word, straight apostrophes included, as what the server sends is shown as sent. */
export const REJECTED_TURN_NOTE = "This answer didn't finish coming through, so it isn't being shown. Please ask again.";

/**
 * Whether the last turn ended with nothing to show: the question is there and no answer followed (the stream died, a timeout or a reload cut it
 * before any text was stored), or the answer holds only progress steps. The thread then says so and offers Retry, never just the question.
 */
export function answerNeverCame(messages: readonly UIMessage[]): boolean {
  const last = messages[messages.length - 1];
  if (!last) return false;
  if (last.role === 'user') return Boolean(userText(last));
  if (last.role !== 'assistant') return false;
  return partsOf(last).every((p) => p.type === 'data-progress' || p.type === 'step-start');
}

/** Bold markers and list markers out, for Copy. */
export function plainText(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '$1').trim();
}

/** "4 steps · 3s": the folded line of a finished turn. A reloaded thread has no honest duration, so it says only the steps. */
export function stepsReceipt(steps: readonly AskStep[], seconds: number | null): string {
  const n = plural(steps.length, 'step');
  return seconds === null ? n : `${n} · ${Math.max(1, Math.round(seconds))}s`;
}

const READ_NAME: Record<string, string> = {
  get_team_overview: 'Roster',
  get_player_metrics: 'Statistics',
  get_player_trend: 'Trend',
  get_putting_distance_profile: 'Putts',
  compare_players: 'By player',
  get_team_metric_ranking: 'By player',
  get_player_weakest_areas: 'Largest gaps',
  get_recent_rounds: 'Recent rounds',
  get_team_rounds: 'Team rounds',
  get_qualifiers: 'Qualifiers',
  get_tournaments: 'Tournaments',
  get_player_insights: 'Open reads',
  get_focus_areas: 'Focus areas',
  get_upcoming_events: 'Schedule',
  get_open_tasks: 'Tasks',
  get_team_travel: 'Travel',
  get_season_scoring: 'Season scoring',
  get_shot_pattern: 'Shots',
  get_proximity_by_band: 'Proximity',
  get_round_detail: 'Round',
  get_root_causes: 'Causes',
  get_calendar: 'Calendar',
  get_course: 'Course',
  compare_seasons: 'Seasons',
  get_team_patterns: 'Team patterns',
  get_practice: 'Practice',
  get_documents: 'Documents',
  get_class_times: 'Classes',
  get_drill_bank: 'Drills',
  get_plan_format: 'Plan format',
  get_team_strokes_gained: 'Strokes gained',
  get_team_putting_profile: 'Team putts',
  get_my_reads: 'Your reads',
  summarise_data: 'Worked out the figures',
  ...WIDE_READ_CHIPS,
};

/** What a read's figures rest on: its first measurement, or its first series (a trend's envelope carries only that). */
export function readBasis(envelope: ToolEnvelope): (Pick<Measurement, 'entity' | 'window_start' | 'window_end' | 'as_of' | 'sample_size' | 'sample_unit'>) | undefined {
  const m = envelope.measurements[0];
  if (m) return m;
  const s = envelope.series?.[0];
  // A series' points may be rounds or buckets, so it claims no sample of its own: its window and date are what it knows.
  return s ? { entity: s.entity, window_start: s.window_start, window_end: s.window_end, as_of: s.as_of, sample_size: 0, sample_unit: 'rounds' } : undefined;
}

function windowWords(m: Pick<Measurement, 'window_start' | 'window_end' | 'sample_unit' | 'sample_size'> | undefined): string | null {
  if (!m?.window_start || !m.window_end) return m?.sample_unit === 'rounds' && m.sample_size > 0 ? `${m.sample_size} rounds` : null;
  const days = Math.round((Date.parse(m.window_end) - Date.parse(m.window_start)) / 86_400_000);
  return Number.isFinite(days) && days > 0 ? `${days} days` : null;
}

/** "Jun 9–Sep 26": the dates a read covers, with the year when the window crosses one. Null when the read names no window. */
export function windowDates(m: Pick<Measurement, 'window_start' | 'window_end'> | undefined): string | null {
  const a = fmtDay(m?.window_start);
  const b = fmtDay(m?.window_end);
  if (!a || !b) return null;
  const yearA = m?.window_start?.slice(0, 4);
  const yearB = m?.window_end?.slice(0, 4);
  if (a === b) return a;
  return yearA !== yearB ? `${a}, ${yearA}–${b}, ${yearB}` : `${a}–${b}`;
}

function turnReadsOf(parts: ReadonlyArray<Record<string, unknown> & { type: string }>): AskTurnRead[] {
  const out: AskTurnRead[] = [];
  for (const p of parts) {
    if (p.type !== 'data-evidence') continue;
    const d = dataOf<{ tool?: string; envelope?: ToolEnvelope; ref?: string; via?: string }>(p);
    if (!d?.envelope || !d.ref) continue;
    const tool = d.tool ?? '';
    const name = READ_NAME[tool] ?? 'Read';
    // The dates the read covers, never a count of days ("By player · 111 days" said nothing a coach could check); no window, just the read's name.
    const win = windowDates(readBasis(d.envelope));
    out.push({ ref: d.ref, tool, name, chip: win ? `${name} · ${win}` : name, envelope: d.envelope, ...(d.via === 'code' ? { via: 'code' as const } : {}) });
  }
  return out;
}

/** What a read chip's popover says: only what the envelope holds (AK2). */
export function readRows(read: AskTurnRead): Array<{ label: string; value: string }> {
  const m = readBasis(read.envelope);
  if (!m) return [{ label: 'Read', value: read.name }];
  const line = sourceLine(m);
  return [
    ...(m.sample_size > 0 ? [{ label: 'Sample', value: sampleWords(m.sample_size, m.sample_unit) }] : []),
    ...(windowDates(m) ? [{ label: 'Window', value: windowDates(m) as string }] : windowWords(m) ? [{ label: 'Window', value: windowWords(m) as string }] : []),
    ...(line && !m.sample_size && !windowWords(m) ? [{ label: 'Source', value: line }] : []),
    ...(fmtDay(m.as_of) ? [{ label: 'Computed', value: fmtDay(m.as_of) as string }] : []),
  ];
}

function pendingVisualOf(parts: ReadonlyArray<Record<string, unknown> & { type: string }>): string[] | null {
  const tool = [...parts].reverse().find((p) => p.type === 'tool-show_visual');
  if (!tool || (tool.state !== 'input-streaming' && tool.state !== 'input-available')) return null;
  const blocks = (tool.input as { blocks?: Array<{ type?: unknown }> } | undefined)?.blocks;
  return Array.isArray(blocks) ? blocks.map((b) => String(b?.type ?? '')).filter(Boolean) : [];
}

/** The rounds a read lists, as "player|day": a recent-rounds list, or rows of a records read that carry a round date and a player. */
function roundKeys(envelope: ToolEnvelope): Set<string> {
  const d = envelope.detail as { kind?: unknown; player?: { player_id?: unknown }; rounds?: unknown; rows?: unknown } | undefined;
  const keys = new Set<string>();
  if (Array.isArray(d?.rounds) && typeof d?.player?.player_id === 'string') {
    for (const r of d.rounds as Array<{ date?: unknown }>) if (typeof r?.date === 'string') keys.add(`${d.player.player_id}|${r.date.slice(0, 10)}`);
  } else if (d?.kind === 'team_data' && Array.isArray(d.rows)) {
    for (const r of d.rows as Array<{ round_date?: unknown; player_id?: unknown }>) if (typeof r?.round_date === 'string' && typeof r.player_id === 'string') keys.add(`${r.player_id}|${r.round_date.slice(0, 10)}`);
  }
  return keys;
}

/** How much of what a coach asks a rounds list for it holds: three-putts, then putts, then the other columns. */
function roundsListScore(envelope: ToolEnvelope): number {
  const d = envelope.detail as { rounds?: unknown; rows?: unknown } | undefined;
  const rows = (Array.isArray(d?.rounds) ? d.rounds : Array.isArray(d?.rows) ? d.rows : []) as Array<Record<string, unknown>>;
  const has = (k: string) => rows.some((r) => typeof r[k] === 'number' && (r[k] as number) > 0);
  return (has('three_putts') ? 100 : 0) + (has('total_putts') || has('putts') ? 10 : 0) + new Set(rows.flatMap((r) => Object.keys(r))).size / 100;
}

/** One assistant message as the thread draws it. */
export function buildAssistantTurn(message: UIMessage, ctx: { isLast: boolean; busy: boolean }): AskAssistantTurn {
  const parts = partsOf(message);
  // A read that failed and was made again with success is the model's own recovery: the coach is not shown the failure (its field names mean
  // nothing to them). It stays in the steps, worded plainly. A failure nothing recovered from is still shown, as a plain sentence.
  const evidence = parts.flatMap((p, i) => {
    if (p.type !== 'data-evidence') return [];
    const d = dataOf<{ tool?: string; envelope?: ToolEnvelope; ref?: string }>(p);
    return d?.envelope ? [{ i, tool: d.tool ?? '', envelope: d.envelope, ref: d.ref ?? null }] : [];
  });
  const failed = (e: ToolEnvelope) => e.coverage === 'unavailable';
  const recovered = new Set<number>();
  const retriedTools = new Map<string, number>();
  for (const ev of evidence) {
    if (failed(ev.envelope) && evidence.some((later) => later.i > ev.i && later.tool === ev.tool && !failed(later.envelope))) {
      recovered.add(ev.i);
      retriedTools.set(ev.tool, (retriedTools.get(ev.tool) ?? 0) + 1);
    }
  }
  // Once the worked-out result exists, the raw reads it was built from are reads, not tables above the answer. A summary names the reads it took
  // figures from (`detail.sources`, by evidence ref): exactly those fold, and any other read stays drawn. One that names none (an older turn)
  // folds every record list read before it.
  const collapsed = new Set<number>();
  for (const sum of evidence.filter((ev) => ev.tool === 'summarise_data' && !failed(ev.envelope))) {
    const named = (sum.envelope.detail as { sources?: unknown } | undefined)?.sources;
    const refs = Array.isArray(named) ? new Set(named.filter((r): r is string => typeof r === 'string')) : null;
    for (const ev of evidence) {
      if (ev.i >= sum.i || failed(ev.envelope)) continue;
      if (refs ? ev.ref != null && refs.has(ev.ref) : (ev.envelope.detail as { kind?: unknown } | undefined)?.kind === 'team_data') collapsed.add(ev.i);
    }
  }
  // A record list longer than the table can draw is the model's working set, not the answer: the table would show the first few of them while the
  // answer is about some others (staging, 2026-11-08: 8 of 26 rounds drawn under an answer about 2). It stays a read in the disclosure.
  for (const ev of evidence) {
    const d = ev.envelope.detail as { kind?: unknown; rows?: unknown } | undefined;
    if (!failed(ev.envelope) && d?.kind === 'team_data' && Array.isArray(d.rows) && d.rows.length > TABLE_ROWS) collapsed.add(ev.i);
  }
  // Two reads that list the same player's same rounds are one table: the one with the most of the figures a coach asks for (three-putts, then putts).
  const shadowed = new Set<number>();
  const lists = evidence.filter((ev) => !failed(ev.envelope) && !recovered.has(ev.i) && !collapsed.has(ev.i)).map((ev) => ({ ev, keys: roundKeys(ev.envelope), score: roundsListScore(ev.envelope) })).filter((l) => l.keys.size > 0);
  for (const [n, a] of lists.entries()) {
    for (const b of lists.slice(n + 1)) {
      if (shadowed.has(a.ev.i) || shadowed.has(b.ev.i)) continue;
      const shared = [...a.keys].filter((k) => b.keys.has(k)).length;
      if (shared * 2 < Math.min(a.keys.size, b.keys.size)) continue;
      shadowed.add((a.score > b.score ? b : a).ev.i);
    }
  }
  const retriedWords = (tool: string) => (tool === 'summarise_data' ? 'One calculation was retried' : 'One read was retried');
  const steps: AskStep[] = parts
    .filter((p) => p.type === 'data-progress')
    .map((p, i) => {
      const d = dataOf<{ label?: string; tool?: string; state?: AskStep['state'] | 'waiting'; done?: string; done_label?: string; detail?: string; picture?: ReadPictureData; kind?: AskStep['kind']; parent_id?: string; subjects?: AskStepSubject[]; count?: AskStep['count']; covers?: AskStep['covers']; evidence_ref?: string; started_at?: string; ended_at?: string }>(p);
      // The island's fields (chat v3), passed through as sent. A step the server knows is coming and has not started is `waiting`.
      const island = {
        ...(d?.kind ? { kind: d.kind } : d?.tool === 'code_execution' ? { kind: 'calculate' as const } : {}),
        ...(d?.parent_id ? { parentId: d.parent_id } : {}),
        ...(Array.isArray(d?.subjects) ? { subjects: d.subjects } : {}),
        ...(d?.count ? { count: d.count } : {}),
        ...(d?.covers ? { covers: d.covers } : {}),
        ...(d?.evidence_ref ? { ref: d.evidence_ref } : {}),
        ...(d?.started_at ? { startedAt: d.started_at } : {}),
        ...(d?.ended_at ? { endedAt: d.ended_at } : {}),
      };
      const left = d?.tool ? (retriedTools.get(d.tool) ?? 0) : 0;
      if (d?.state === 'failed' && d.tool && left > 0) {
        retriedTools.set(d.tool, left - 1);
        return { id: String(p.id ?? `step-${i}`), label: stepLabel(d.label), state: 'done' as const, done: retriedWords(d.tool) };
      }
      const state = d?.state === 'waiting' ? ('next' as const) : d?.state;
      return { id: String(p.id ?? `step-${i}`), label: stepLabel(d?.label), ...(state ? { state } : {}), ...(d?.done_label ? { done: stepLabel(d.done_label) } : d?.done ? { done: stepLabel(d.done) } : {}), ...(d?.picture ? { picture: d.picture } : {}), ...(d?.detail ? { detail: d.detail } : {}), ...island };
    });
  const envelopes = parts
    .filter((p) => p.type === 'data-evidence')
    .map((p) => dataOf<{ envelope?: ToolEnvelope }>(p)?.envelope)
    .filter((e): e is ToolEnvelope => Boolean(e));
  const paired = pairProposals(parts, ctx);
  const emptySeen = new Set<string>();
  const active = ctx.isLast && ctx.busy;
  // A validated visual stands in for the generic blocks of the reads it was built from: the same figures drawn twice is noise.
  const artifacts = new Map<string, ValidatedVisualArtifact>();
  parts.forEach((p, i) => {
    if (p.type !== 'data-visual-artifact') return;
    const parsed = ValidatedVisualArtifact.safeParse(dataOf<unknown>(p));
    if (parsed.success) artifacts.set(String(p.id ?? `v-${i}`), parsed.data);
  });
  // A model-designed composition (visuals/composition.ts) does the same for the reads it draws in full, and only those.
  const compositions = new Map<string, ValidatedComposition>();
  // What could not be drawn, by name: a stored composition that fails the whole parse keeps the blocks that pass, and the rest are
  // reported by the answer (it used to vanish whole and say nothing; preview, 12 Nov).
  const visualFaults: string[] = [];
  parts.forEach((p, i) => {
    if (p.type !== 'data-visual-composition') return;
    const { composition, dropped } = salvageComposition(dataOf<unknown>(p));
    visualFaults.push(...dropped);
    if (composition) compositions.set(String(p.id ?? `c-${i}`), composition);
  });
  // A model's visual that plots the same metric for the same subjects as a read's own chart stands in for it (the title and the point are the
  // visual's; the same bars twice are noise). A figure the read could not give (no value) is not a subject the visual could plot.
  const plotted = new Set<string>();
  for (const c of compositions.values()) {
    for (const b of c.blocks as Array<{ measurement?: Measurement; measurements?: Measurement[] }>) {
      for (const m of [...(b.measurement ? [b.measurement] : []), ...(b.measurements ?? [])]) plotted.add(`${m.entity.id}|${m.metric_id}`);
    }
  }
  const drawnByVisual = (e: ToolEnvelope) => {
    const valued = e.measurements.filter((m) => m.value !== null);
    return plotted.size > 0 && e.series.length === 0 && valued.length > 0 && valued.every((m) => plotted.has(`${m.entity.id}|${m.metric_id}`));
  };
  const coveredRefs = new Set([...[...artifacts.values()].flatMap((a) => a.evidenceRefs), ...[...compositions.values()].flatMap((c) => c.evidenceRefs)]);
  for (const p of parts) {
    if (p.type !== 'data-evidence') continue;
    const d = dataOf<{ ref?: string; envelope?: ToolEnvelope }>(p);
    if (d?.ref && d.envelope && drawnByVisual(d.envelope)) coveredRefs.add(d.ref);
  }

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
  // The steps stay too: they say what was read, not what was claimed, and they fold to "N steps · Ns" above the note (design:
  // staging, 2026-11-07, dropped the whole list when the note replaced the answer).
  const verdict = parts.find((p) => p.type === 'data-grounding-flag' || p.type === 'data-turn-incomplete');
  if (verdict) {
    const note = String(dataOf<{ note?: string }>(verdict)?.note ?? '').trim() || REJECTED_TURN_NOTE;
    return { role: 'assistant', id: message.id, steps, envelopes: [], blocks: actionBlocks(), note, answerText: note, work: null, followUps: [], active };
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
      const data = dataOf<{ tool?: string; envelope?: ToolEnvelope; ref?: string }>(p);
      if (recovered.has(i) || collapsed.has(i) || shadowed.has(i)) return;
      if (data?.envelope && data.tool === 'summarise_data' && failed(data.envelope)) {
        // No field names or row counts for a coach: the calculation did not finish.
        blocks.push({ kind: 'evidence', key: `e-${String(p.id ?? i)}`, envelope: { ...data.envelope, summary: 'Could not work out the figures.', coverage_note: 'That calculation could not be completed.', detail: undefined } });
        return;
      }
      if (data?.envelope && !(data.ref && coveredRefs.has(data.ref))) {
        // An empty read says so once: a second one with the same words (the same read made twice) adds a card and no information.
        const note = data.envelope.coverage === 'empty' ? emptyNote(data.envelope) : null;
        if (note !== null) {
          if (!note || emptySeen.has(note)) return;
          emptySeen.add(note);
        }
        // `ref`: the engine's name for this read (chat v3). The thread draws such a read's table under the answer's prose, once the turn
        // has finished, because a card arriving above text that is being written moves the words under the coach's eye.
        blocks.push({ kind: 'evidence', key: `e-${String(p.id ?? i)}`, envelope: withWindowFigures(data.envelope, envelopes), ...(data.ref ? { ref: data.ref } : {}) });
      }
    } else if (p.type === 'data-visual-artifact') {
      const artifact = artifacts.get(String(p.id ?? `v-${i}`));
      if (artifact) blocks.push({ kind: 'visual', key: `v-${artifact.artifactId}`, artifact });
    } else if (p.type === 'data-practice-plan') {
      blocks.push({ kind: 'plan', key: `plan-${String(p.id ?? i)}`, plan: p.data as PlanPartData });
    } else if (p.type === 'data-brief') {
      blocks.push({ kind: 'brief', key: `brief-${i}`, brief: p.data as AskBriefData });
    } else if (p.type === 'data-handoff') {
      blocks.push({ kind: 'handoff', key: `handoff-${i}`, handoff: p.data as AskHandoffData });
    } else if (p.type === 'data-visual-composition') {
      const composition = compositions.get(String(p.id ?? `c-${i}`));
      if (composition) blocks.push({ kind: 'composition', key: `c-${composition.artifactId}`, composition });
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
    reads: turnReadsOf(parts),
    durationMs: turnMetaOf(parts as never)?.duration_ms ?? null,
    artifacts: artifactsOf(parts as never),
    pendingVisual: pendingVisualOf(parts),
    ...(visualFaults.length ? { visualFaults } : {}),
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

export type ProseBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'list'; items: string[]; ordered?: boolean }
  /** A GitHub pipe table. The model is told not to write them; older answers have them, and raw pipes read as broken. */
  | { kind: 'table'; header: string[]; rows: string[][]; numeric: boolean[] };

/** `| a | b |` is ['a', 'b']. */
const pipeCells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
const isPipeRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isPipeDivider = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
/** A cell that is a figure: "+0.3", "−1.1", "58%", "E", "—". Such a column is set right, on tabular figures. */
const isFigureCell = (c: string) => /^[−+-]?[\d.,]+%?$|^—$|^E$/.test(c.replace(/\*\*/g, '').trim());

/**
 * Paragraphs, lists and pipe tables. Headings are dropped to plain text (a heading marker is stripped, not
 * honoured: rewarding headings is how a two-sentence answer becomes a wall of sections), and a lone
 * asterisk stays a character.
 */
export function parseProse(text: string): ProseBlock[] {
  const blocks: ProseBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let ordered = false;
  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', text: paragraph.join(' ').trim() });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length > 0) blocks.push({ kind: 'list', items: list, ...(ordered ? { ordered } : {}) });
    list = [];
    ordered = false;
  };
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trimEnd();
    if (isPipeRow(line) && i + 1 < lines.length && isPipeDivider(lines[i + 1]!)) {
      flushParagraph();
      flushList();
      const header = pipeCells(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && isPipeRow(lines[i]!); i++) {
        const r = pipeCells(lines[i]!);
        rows.push(header.map((_, c) => r[c] ?? ''));
      }
      i -= 1;
      const numeric = header.map((_, c) => rows.length > 0 && rows.every((r) => isFigureCell(r[c] ?? '')));
      blocks.push({ kind: 'table', header, rows, numeric });
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const bullet = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'heading', text: heading[1] ?? '' });
    } else if (bullet) {
      flushParagraph();
      if (list.length === 0) ordered = /^\s*\d/.test(line);
      list.push(bullet[1] ?? '');
    } else if (line.trim() === '') {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line);
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
  // What a model writes and the page doesn't draw: code ticks, single-star italics and links read as their words (ASK-7).
  text = text.replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1$2');
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
  // Not \\b, which is ASCII only and misses "Chloé" and "Élodie". The edge is captured: iOS before 16.4 has no lookbehind.
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${sorted.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  const out: InlineSegment[] = [];
  for (const seg of bolds) {
    let at = 0;
    for (const m of seg.text.matchAll(re)) {
      const name = m[2] ?? '';
      const start = (m.index ?? 0) + (m[1]?.length ?? 0);
      if (start > at) out.push({ text: seg.text.slice(at, start), bold: seg.bold });
      out.push({ text: name, bold: seg.bold, mention: name });
      at = start + name.length;
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
  | (EvBase & { kind: 'trend'; unit: Measurement['unit']; points: Array<{ label: string; value: number; n: number }>; reference: { label: string; value: number } | null; summary: string; goodDirection: 'up' | 'down' | null; toPar?: boolean })
  | (EvBase & { kind: 'bars'; rows: Array<{ label: string; pct: number; /** Where zero sits on the track (percent from the left); a fill runs from it to `pct`. Absent: the fill starts at the left edge. */ zero?: number; display: string; of: string | null; tone: 'good' | 'loss' | 'neutral'; highlight?: boolean; /** Marks on the track: the level's average, and the Tour where it was asked for. */ ticks?: Array<{ at: number; kind: 'level' | 'team' | 'tour'; text: string; /** The tag and value printed under the track: "D1 50%", "Team 33%", "Tour 66%". */ short?: string }> }> })
  | (EvBase & { kind: 'ranking'; rows: AskRankRow[]; signed: boolean })
  | (EvBase & { kind: 'compare'; team: AskTeamTable })
  | (EvBase & { kind: 'legs'; rows: Array<{ label: string; value: number; display: string }>; takeaway: string })
  | (EvBase & { kind: 'tiles'; tiles: EvidenceTile[] })
  | (EvBase & { kind: 'reads'; playerId: string; rows: AskRead[] })
  | (EvBase & { kind: 'table' });

/**
 * One player in a ranking (playbook: rank, name, the sample in words, the value, a bar on a fitted axis). `pct` is the bar's
 * length as a share of the largest magnitude; with `signed`, bars run either side of zero.
 */
export interface AskRankRow {
  rank: number;
  id: string;
  label: string;
  display: string;
  /** "4 rounds", "of 9". */
  of: string | null;
  value: number;
  pct: number;
  /** Strokes gained by its sign; otherwise the best of the list by the metric's own direction. */
  tone: 'good' | 'loss' | 'best' | 'plain';
}

/**
 * Players across the same metrics. With more players than metrics the players are rows (a team table); otherwise the metrics
 * are rows and the players columns. `best` is, per metric, the player whose value is best by that metric's direction (none
 * when it has no direction or there is a tie).
 */
export interface AskTeamTable {
  players: Array<{ id: string; label: string; sample: string | null }>;
  metrics: Array<{ id: string; label: string; short: string; unit: Measurement['unit']; strokes: boolean }>;
  /** cells[player][metric]: the figure as printed, and its tone (strokes gained by sign). */
  cells: Array<Array<{ display: string; tone: 'good' | 'loss' | 'plain' } | null>>;
  best: Array<string | null>;
  playersAsRows: boolean;
}

/** One read an answer names (the open-signals tool's list): its id, which the coach's Deep dive opens on, and what the row says. */
export interface AskRead {
  id: string;
  title: string;
  /** The area, as the engine stores it ("putting"). */
  category: string | null;
  /** The read's own value ("28%"), when it has one. */
  value: string | null;
}

export interface EvidenceTile {
  label: string;
  value: string;
  sub: string | null;
  /** A loss against what the read compared it to: drawn amber, never red. A strokes gained gain is green. */
  tone: 'loss' | 'gain' | 'plain';
}

/** Fewer points than this is a change, not a trend: drawn as a table. */
export const MIN_TREND_POINTS = 3;

/** "PGA Tour (2024)": a source that already names its year (the standards' "PGA Tour 2024") is not given the version again. */
export function benchName(source: string, version: string): string {
  const src = source.trim();
  const v = version.trim();
  if (!v) return src;
  if (!src.includes(v)) return `${src} (${v})`;
  const bare = src.replace(v, '').replace(/\s+/g, ' ').replace(/[\s,(-]+$/, '').trim();
  return bare ? `${bare} (${v})` : src;
}

const benchOf = (b: Measurement['benchmark'] | MeasurementSeries['benchmark'], unit: Measurement['unit']): string | null =>
  b && !b.omitted_for_cohort ? `${benchName(b.source, b.version)}: ${formatValue(b.value, unit)}` : null;

/**
 * The line under a card when its read was cut short. A coach reads a caption, never the model's note: a note written for the model (it names
 * columns, says "say so" and "narrow the filters") is replaced by the caption the read's detail yields, and with none it is not drawn.
 */
const partialNote = (e: { coverage: string; coverage_note: string | null; detail?: unknown }): string | null => {
  if (e.coverage !== 'partial') return null;
  const d = e.detail as { caption?: unknown } | undefined;
  const caption = rowsCaption(e.detail) ?? (typeof d?.caption === 'string' && d.caption ? d.caption : null);
  if (caption) return caption;
  return e.coverage_note && !MODEL_FACING_NOTE.test(e.coverage_note) ? e.coverage_note : null;
};

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

const isPlain = (v: unknown): v is string | number | boolean => ['string', 'number', 'boolean'].includes(typeof v);

/** Words a tool's keys spell that are not sentence case: "rsvp" is RSVP. */
const ACRONYMS: Record<string, string> = { rsvp: 'RSVP', sg: 'SG', id: 'ID', gir: 'GIR', ott: 'OTT' };
/** Keys whose plain heading would read as machinery. */
const HEADINGS: Record<string, string> = {
  requires_rsvp: 'RSVP required',
  starts_at: 'Starts',
  ends_at: 'Ends',
  start_date: 'Starts',
  end_date: 'Ends',
  due_date: 'Due',
  event_type: 'Type',
  task_type: 'Type',
  event_kind: 'Type',
  kind: 'Type',
  field_size: 'Field',
  rsvp_deadline: 'RSVP by',
  rsvp_pending_count: 'No reply',
  rsvp_accepted: 'Going',
  rsvp_declined: 'Not going',
  // A round's columns, short enough for five on a phone.
  round_date: 'Date',
  course_name: 'Course',
  total_score: 'Score',
  score_to_par: 'To par',
  total_putts: 'Putts',
  three_putts: '3-putts',
  total_gir: 'GIR',
  total_penalties: 'Penalties',
};

/** A column heading from a key: "target_value" is "Target value", "requires_rsvp" is "RSVP required". */
export function headingOf(key: string): string {
  if (HEADINGS[key]) return HEADINGS[key];
  const words = key.replace(/_/g, ' ').trim().split(/\s+/).map((w) => ACRONYMS[w.toLowerCase()] ?? w.toLowerCase());
  const s = words.join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const DAY_TIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/;

/**
 * A tool's raw cell as words: an ISO date is "Oct 29", a timestamp "Oct 30, 3 PM" in the team's zone, an enum
 * ("in_progress") "In progress", a boolean Yes or No. Titles, names and places are drawn as written.
 */
export function humanCell(v: string | number | boolean, timezone?: string | null): string {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return String(v);
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return fmtDay(t) ?? t;
  if (DAY_TIME.test(t)) {
    const d = new Date(t);
    if (!Number.isNaN(d.getTime())) {
      // The team's wall clock, through lib/dates (one clock: "3 PM", "3:30 PM"), so the server's text matches the browser's.
      const w = zoneWallParts(d.getTime(), timezone || 'UTC');
      if (w) {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${fmtDay(`${w.year}-${pad(w.month)}-${pad(w.day)}`)}, ${formatWallClock(`${w.hour}:${pad(w.minute)}`)}`;
      }
      return fmtDay(t) ?? t;
    }
  }
  if (/^[a-z]+(?:_[a-z]+)*$/.test(t)) return headingOf(t);
  return t;
}

/**
 * A table from a tool's `detail` when it is a list of records (open signals, focus areas,
 * events...): the fallback for an evidence kind this screen has no chart for. Ids and raw
 * timestamps are left out; at most four columns and eight rows.
 */
/**
 * A table drawn without being asked for has to fit a phone (393 px, less the page gutters) without a sideways scroll or a clipped column:
 * columns are dropped from the right until they fit, and a column that cannot is not drawn. A column is estimated at its longest cell (a long
 * cell wraps, so it counts at most 18 characters) at 6 px a character plus 12 px of padding.
 */
export const PHONE_TABLE_PX = 361;
export function fitToPhone(table: AskTable | null): AskTable | null {
  if (!table) return null;
  const wide = (i: number) => Math.min(18, Math.max(table.columns[i]?.length ?? 0, ...table.rows.map((r) => (r[i] ?? '').length))) * 6 + 12;
  let n = table.columns.length;
  while (n > 0 && Array.from({ length: n }, (_, i) => wide(i)).reduce((a, b) => a + b, 0) > PHONE_TABLE_PX) n -= 1;
  return n < 1 ? null : { ...table, columns: table.columns.slice(0, n), rows: table.rows.map((r) => r.slice(0, n)) };
}

/**
 * Fields the tool keeps for itself: who set a goal, where a figure came from, which metric a row is about. They are not for a coach to read.
 */
/** The rows a record table draws. */
const TABLE_ROWS = 8;
/** A recent-rounds table draws every round the read lists (the read's own cap). */
const ROUNDS_TABLE_ROWS = 20;
const INTERNAL_COLUMN = /^(?:set_by|source|origin|method|metric|metric_id|record_type|visibility|version)$/;

/**
 * The order a generic record table lists its fields in. A stored turn comes back from a jsonb column, which hands an object's keys back
 * shortest first (not in the order the tool wrote them), so the live table and the reloaded one disagreed. Fields are read by a fixed
 * priority instead, so both paths draw the same columns in the same order:
 *   1. who or what the row is, and when (player, title, date),
 *   2. the figure the question asked for: any field that is not one of the generic ones (three-putts, putts, a make rate),
 *   3. where and how it went (course, location, score),
 *   4. the plain labels last (status, round type, hole count): never what a table is picked for.
 * Within a step, jsonb's own order breaks ties.
 */
const COLUMNS_WHO_WHEN = ['player', 'name', 'title', 'category', 'event_type', 'kind', 'state', 'round_date', 'date', 'day', 'starts_at', 'start_time', 'start_date', 'ends_at', 'end_time', 'end_date', 'due_date', 'target_date'];
const COLUMNS_WHERE_HOW = ['course_name', 'location', 'total_score', 'score_to_par'];
const COLUMNS_LABELS = ['status', 'priority', 'round_type', 'holes_played', 'type'];
const jsonbOrder = (a: string, b: string) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
function columnRank(k: string): [number, number] {
  let i = COLUMNS_WHO_WHEN.indexOf(k);
  if (i !== -1) return [0, i];
  i = COLUMNS_WHERE_HOW.indexOf(k);
  if (i !== -1) return [2, i];
  i = COLUMNS_LABELS.indexOf(k);
  return i !== -1 ? [3, i] : [1, 0];
}
const columnOrder = (a: string, b: string) => {
  const [ca, ia] = columnRank(a);
  const [cb, ib] = columnRank(b);
  return ca - cb || ia - ib || jsonbOrder(a, b);
};
/** How many columns a generic record table starts from; `fitToPhone` then drops the rightmost until it fits 393 px. */
const TABLE_COLUMNS = 5;

export function detailTable(detail: unknown, caption: string): AskTable | null {
  if (!detail || typeof detail !== 'object') return null;
  const lists = Object.values(detail as Record<string, unknown>).filter((v): v is Array<Record<string, unknown>> => Array.isArray(v) && v.length > 0 && v.every((r) => r && typeof r === 'object' && !Array.isArray(r)));
  const rows = lists[0];
  if (!rows) return null;
  const timezone = textOf((detail as Record<string, unknown>).timezone);
  // A start and end time say when; ids, record stamps and a flag that is the same on every row say nothing.
  const keys = Object.keys(rows[0] ?? {})
    .filter((k) => !/(^id$|_id$|^type$|^created_at$|^updated_at$|^timezone$)/.test(k) && !INTERNAL_COLUMN.test(k) && rows.some((r) => isPlain(r[k]) && r[k] !== ''))
    .filter((k) => !(rows.every((r) => typeof r[k] === 'boolean') && rows.every((r) => r[k] === false)))
    .sort(columnOrder)
    .slice(0, TABLE_COLUMNS);
  if (keys.length === 0) return null;
  // A read that carries the unit of its columns (query_team_data) puts it in the heading: "Approach proximity (ft)", never a bare 15.3.
  const units = (detail as { units?: Record<string, string> }).units ?? {};
  const unitWord: Record<string, string> = { feet: 'ft', yards: 'yd', percent: '%' };
  const heading = (k: string) => (unitWord[units[k] ?? ''] ? `${headingOf(k)} (${unitWord[units[k] as string]})` : headingOf(k));
  return fitToPhone({
    caption,
    columns: keys.map(heading),
    rows: rows.slice(0, TABLE_ROWS).map((r) => keys.map((k) => puttCell(r, k) ?? (isPlain(r[k]) && r[k] !== '' ? humanCell(r[k] as string | number | boolean, timezone) : NO_DATA))),
  });
}

/**
 * Putts and three-putts of a round that has none recorded. A round still being played has no putt count yet, and a stat line with no putts holds
 * 0, which is "not recorded" and never a round holed in no putts (`cachedPutts`): the cell says "In progress", or is empty, never "0".
 * Undefined for any other column, or a figure that is a real count.
 */
function puttCell(r: Record<string, unknown>, k: string): string | undefined {
  if (k !== 'total_putts' && k !== 'three_putts' && k !== 'putts') return undefined;
  if (/^in[ _-]?progress$/i.test(String(r.status ?? ''))) return 'In progress';
  const none = k === 'three_putts' ? r.total_putts === 0 : r[k] === 0;
  return none ? formatValue(null, 'count') : undefined;
}

/**
 * The team's goals (`get_goals`: `detail.goals`) as Player, Title, Category, State, in that order whether the turn is live or read back from
 * storage. A column no goal has a value for is left out; the tool's internal fields (who set it, the metric id) are never columns.
 */
export function goalsTable(detail: unknown, caption: string): AskTable | null {
  const goals = (detail as { goals?: unknown } | null | undefined)?.goals;
  if (!Array.isArray(goals) || goals.length === 0) return null;
  const list = goals.filter((g): g is Record<string, unknown> => !!g && typeof g === 'object');
  const columns: Array<[string, string]> = [['Player', 'player'], ['Title', 'title'], ['Category', 'category'], ['State', 'state']];
  const shown = columns.filter(([, k]) => list.some((g) => isPlain(g[k]) && g[k] !== ''));
  if (shown.length === 0) return null;
  return fitToPhone({ caption, columns: shown.map(([name]) => name), rows: list.slice(0, 8).map((g) => shown.map(([, k]) => (isPlain(g[k]) && g[k] !== '' ? humanCell(g[k] as string | number | boolean, null) : formatValue(null, 'count')))) });
}

/**
 * A list of rounds (`get_recent_rounds`: `detail.rounds`) as a table with the figures the question is about: score, to par, putts and
 * strokes gained, each straight from the round's own row. The generic record table keeps the first four fields it meets, which for a
 * round are the date, the course, the type and the holes, and left the score out (staging, 2026-11-08: "What did I shoot in my last
 * round?"). A column no round has a value for is left out.
 */
export function roundsTable(detail: unknown, caption: string): AskTable | null {
  const rounds = (detail as { rounds?: unknown } | null | undefined)?.rounds;
  if (!Array.isArray(rounds) || rounds.length === 0) return null;
  type R = { date?: unknown; course?: unknown; total_score?: unknown; to_par?: unknown; putts?: unknown; three_putts?: unknown; sg_total?: unknown };
  const list = rounds.filter((r): r is R => !!r && typeof r === 'object');
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  if (!list.some((r) => num(r.total_score) !== null)) return null;
  const columns: Array<[string, (r: R) => string | null]> = [
    ['Date', (r) => (typeof r.date === 'string' ? fmtDay(r.date) : null)],
    ['Course', (r) => textOf(r.course)],
    ['Score', (r) => (num(r.total_score) === null ? null : formatValue(num(r.total_score), 'score'))],
    ['To par', (r) => (num(r.to_par) === null ? null : formatToPar(num(r.to_par) as number, 0))],
    // A 0 is a round with no putts recorded (a round still being played), never a round holed in none.
    ['Putts', (r) => (num(r.putts) === null || num(r.putts) === 0 ? null : formatValue(num(r.putts), 'count'))],
    ['3-putts', (r) => (num(r.three_putts) === null ? null : formatValue(num(r.three_putts), 'count'))],
    ['Strokes gained', (r) => (num(r.sg_total) === null ? null : formatValue(num(r.sg_total), 'strokes'))],
  ];
  const shown = columns.filter(([, cell]) => list.some((r) => cell(r) !== null));
  // Every round the read lists (at most 20): the title says how many, so the table shows that many.
  return fitToPhone({ caption, columns: shown.map(([name]) => name), rows: list.slice(0, ROUNDS_TABLE_ROWS).map((r) => shown.map(([, cell]) => cell(r) ?? formatValue(null, 'count'))) });
}

function seriesTable(s: MeasurementSeries): AskTable {
  return {
    caption: `${s.metric_label} for ${s.entity.label}`,
    // The caption already names the metric; a rate's column says what its figures are rather than repeating it.
    columns: [s.points.some((p) => p.bucket) ? 'Range' : 'Round', s.unit === 'percent' ? 'Rate' : s.metric_label, 'Sample'],
    rows: s.points.map((p) => [p.bucket ?? fmtDay(p.at) ?? p.at, formatValue(p.value, s.unit, s), p.sample_size > 0 ? String(p.sample_size) : NO_DATA]),
  };
}

export function trendBlock(s: MeasurementSeries): Extract<AskEvidence, { kind: 'trend' }> {
  const values = s.points.map((p) => p.value);
  // A rate's average is its made count over its attempts (3 of 9 is 33%), so each round counts by its sample; without samples, plainly.
  const weight = s.points.reduce((a, p) => a + p.sample_size, 0);
  const mean =
    s.unit === 'percent' && weight > 0
      ? s.points.reduce((a, p) => a + p.value * p.sample_size, 0) / weight
      : values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  const bench = s.benchmark && !s.benchmark.omitted_for_cohort ? s.benchmark : null;
  const first = values[0] as number;
  const last = values[values.length - 1] as number;
  return {
    kind: 'trend',
    // Whose numbers they are, as the strokes-gained chart names its player.
    title: s.entity.kind === 'player' ? `${s.metric_label}, ${s.entity.label}` : s.metric_label,
    unit: s.unit,
    points: s.points.map((p) => ({ label: fmtDay(p.at) ?? p.at, value: p.value, n: p.sample_size })),
    // A real benchmark beats the series' own average: "vs the Tour" is a standard, "vs your own average" is a tautology.
    reference: bench ? { label: 'Benchmark', value: bench.value } : { label: 'Average', value: mean },
    summary: `${s.metric_label} for ${s.entity.label}: ${formatValue(first, s.unit, s)} to ${formatValue(last, s.unit, s)} across ${s.points.length} rounds.`,
    goodDirection: s.direction === 'higher_better' ? 'up' : s.direction === 'lower_better' ? 'down' : null,
    toPar: isToPar(s),
    source: sourceLine({ sample_size: s.points.length, sample_unit: 'rounds', window_start: s.window_start, window_end: s.window_end, as_of: s.as_of }),
    note: partialNote(s),
    bench: benchOf(s.benchmark, s.unit),
    table: seriesTable(s),
  };
}

export function bucketBlock(s: MeasurementSeries, highlight: string | null = null): Extract<AskEvidence, { kind: 'bars' }> {
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
      display: formatValue(r.value, s.unit, s),
      of: r.n > 0 ? `of ${r.n}` : null,
      tone: !flagged ? 'neutral' : r.value === weak ? 'loss' : 'good',
      ...(highlight && r.label === highlight ? { highlight: true } : {}),
    })),
    source: sourceLine({ sample_size: rows.reduce((a, r) => a + r.n, 0), sample_unit: 'attempts', window_start: s.window_start, window_end: s.window_end, as_of: s.as_of }),
    note: partialNote(s),
    bench: benchOf(s.benchmark, s.unit),
    table: seriesTable(s),
  };
}

/** Players are ranked against each other; a team's own figure is the line they read against, not one more player (QA-3). */
export function playersOnly<T extends { entity: { kind: string } }>(ms: T[]): T[] {
  const players = ms.filter((m) => m.entity.kind === 'player');
  return players.length ? players : ms;
}

export function measurementTable(all: Measurement[], caption: string): AskTable {
  const ms = playersOnly(all);
  const team = all.find((m) => m.entity.kind === 'team' && ms !== all && ms.length > 0);
  return {
    caption: team ? `${caption} (${team.entity.label}: ${formatValue(team.value, team.unit, team)})` : caption,
    columns: ['Player', 'Metric', 'Value', 'Sample'],
    rows: ms.map((m) => [m.entity.label, m.metric_label, formatValue(m.value, m.unit, m), m.sample_size > 0 ? sampleWords(m.sample_size, m.sample_unit) : NO_DATA]),
  };
}

const textOf = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * The reads a tool names for one player (`get_player_insights`: `detail.player.player_id` and `detail.insights[].insight_id`), or
 * null when the detail is not that shape. A row with no id or no title is left out: it could not be opened, or said.
 */
export function readsOf(detail: unknown): { playerId: string; rows: AskRead[] } | null {
  if (!detail || typeof detail !== 'object') return null;
  const d = detail as { player?: unknown; insights?: unknown };
  const playerId = d.player && typeof d.player === 'object' ? textOf((d.player as { player_id?: unknown }).player_id) : null;
  if (!playerId || !Array.isArray(d.insights)) return null;
  const rows: AskRead[] = [];
  for (const r of d.insights as unknown[]) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const id = textOf(o.insight_id);
    const title = textOf(o.title);
    if (id && title) rows.push({ id, title, category: textOf(o.category), value: textOf(o.value_display) });
  }
  return rows.length ? { playerId, rows } : null;
}

/** A read's area in words: "short_game" is "Short game". */
export const readAreaWord = (c: string | null): string | null => (c ? (c.charAt(0).toUpperCase() + c.slice(1)).replace(/_/g, ' ') : null);

/** "Strokes gained: total" is "SG total" in a column heading, where room is short. */
export const shortMetric = (label: string) => label.replace(/^strokes gained[:\s-]*/i, 'SG ').trim();

const lowerIsBetter = (m: { direction: Measurement['direction'] }) => m.direction === 'lower_better';

/** Players on one metric, ranked as the read gave them, each with its bar on one fitted axis (`AskRankRow`). */
export function rankRows(all: Measurement[], order: 'best_first' | 'as_read' = 'as_read', highlight: string | null = null): { rows: AskRankRow[]; signed: boolean } {
  const ranked = playersOnly(all).filter((m): m is Measurement & { value: number } => m.value !== null);
  const dir = ranked[0]?.direction ?? null;
  const sorted = order === 'best_first' && dir ? [...ranked].sort((a, b) => (dir === 'lower_better' ? a.value - b.value : b.value - a.value)) : ranked;
  const strokes = sorted.every((m) => m.unit === 'strokes');
  const signed = sorted.some((m) => m.value < 0);
  const max = Math.max(1e-9, ...sorted.map((m) => Math.abs(m.value)));
  const bestValue = dir && sorted.length > 1 ? (dir === 'lower_better' ? Math.min(...sorted.map((m) => m.value)) : Math.max(...sorted.map((m) => m.value))) : null;
  const bestCount = bestValue === null ? 0 : sorted.filter((m) => m.value === bestValue).length;
  return {
    signed,
    rows: sorted.map((m, i) => {
      const t = strokes ? changeTone(m.value, false, 1) : '';
      const tone: AskRankRow['tone'] = strokes ? (t === 'is-gain' ? 'good' : t === 'is-loss' ? 'loss' : 'plain') : (bestCount === 1 && m.value === bestValue) || (highlight !== null && m.entity.id === highlight) ? 'best' : 'plain';
      return { rank: i + 1, id: m.entity.id, label: m.entity.label, display: formatValue(m.value, m.unit, m), of: ofSample(m), value: m.value, pct: (Math.abs(m.value) / max) * 100, tone };
    }),
  };
}

/** Players across the same metrics, as one table (`AskTeamTable`): the best per metric marked by that metric's direction. */
export function teamTable(all: Measurement[]): AskTeamTable {
  const ms = playersOnly(all);
  const players: AskTeamTable['players'] = [];
  const metrics: AskTeamTable['metrics'] = [];
  for (const m of ms) {
    if (!players.some((p) => p.id === m.entity.id)) players.push({ id: m.entity.id, label: m.entity.label, sample: null });
    if (!metrics.some((x) => x.id === m.metric_id)) metrics.push({ id: m.metric_id, label: m.metric_label, short: shortMetric(m.metric_label), unit: m.unit, strokes: m.unit === 'strokes' });
  }
  const find = (pid: string, mid: string) => ms.find((m) => m.entity.id === pid && m.metric_id === mid);
  // A player's sample, once beside their name, when every one of their figures rests on the same sample.
  for (const p of players) {
    const mine = ms.filter((m) => m.entity.id === p.id && m.sample_size > 0);
    const one = mine[0];
    if (one && mine.every((m) => m.sample_size === one.sample_size && m.sample_unit === one.sample_unit)) p.sample = sampleWords(one.sample_size, one.sample_unit);
  }
  const cells = players.map((p) =>
    metrics.map((x) => {
      const m = find(p.id, x.id);
      if (!m) return null;
      const t = x.strokes ? changeTone(m.value, false, 1) : '';
      return { display: formatValue(m.value, m.unit, m), tone: (t === 'is-gain' ? 'good' : t === 'is-loss' ? 'loss' : 'plain') as 'good' | 'loss' | 'plain' };
    }),
  );
  const best = metrics.map((x) => {
    const row = players.map((p) => find(p.id, x.id)).filter((m): m is Measurement & { value: number } => Boolean(m && m.value !== null));
    const dir = row[0]?.direction;
    if (!dir || row.length < 2) return null;
    const top = lowerIsBetter(row[0]!) ? Math.min(...row.map((m) => m.value)) : Math.max(...row.map((m) => m.value));
    const at = row.filter((m) => m.value === top);
    return at.length === 1 ? at[0]!.entity.id : null;
  });
  return { players, metrics, cells, best, playersAsRows: players.length > metrics.length };
}

const BENCH_UNIT: Record<string, Measurement['unit']> = { strokes: 'strokes', percent: 'percent', feet: 'feet', count: 'count' };

type RefKind = 'level' | 'team' | 'tour';
const REF_WORD: Record<RefKind, string> = { level: 'Level', team: 'Team', tour: 'Tour' };

/**
 * The three references of a figure in words, level first, team second, Tour third, each with where the player sits among them and a missing
 * one stated: "Level 62% · ahead of 30% of 71 players", "Team: no average yet", "Tour 66%". What the headline chip shows under its verdict.
 */
const ordinal = (n: number): string => {
  const v = n % 100;
  return `${n}${v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
};

export function comparisonWords(comparisons: ReadonlyArray<{ kind: RefKind; value: number | null; your_value?: number | null; place_percent?: number | null; place?: number | null; place_of?: number | null; note?: string | null; missing_reason?: string | null }>, unit: Measurement['unit']): string[] {
  const ordered = (['level', 'team', 'tour'] as const).flatMap((k) => comparisons.filter((c) => c.kind === k));
  return ordered.map((c) => {
    if (c.value === null) return `${REF_WORD[c.kind]}: ${c.missing_reason ?? 'not available'}${c.kind === 'team' && c.place != null && c.place_of != null ? ` · ${ordinal(c.place)} of ${c.place_of}` : c.kind === 'level' && c.place_percent != null ? ` · ahead of ${c.place_percent}% of ${c.place_of ?? ''} college players on Helm (all rounds)`.replace(/ {2}/g, ' ') : ''}`;
    // The team: the rank among the players with a figure over the same window ("6th of 7"). The level: the share of the college players on Helm the
    // player is ahead of, over all recorded rounds (said so). A team rank never becomes a percent.
    const place =
      c.kind === 'team' && c.place != null && c.place_of != null
        ? ` · ${ordinal(c.place)} of ${c.place_of}`
        : c.place_percent == null
          ? ''
          : c.kind === 'team'
            ? ` · ahead of ${c.place_percent}% of the team (all rounds)`
            : ` · ahead of ${c.place_percent}% of ${c.place_of ?? ''} college players on Helm (all rounds)`.replace(/ {2}/g, ' ');
    // The level is over all recorded rounds: beside it is the player's own all-rounds figure, never the window's.
    const yours = c.kind === 'level' && typeof c.your_value === 'number' ? ` (you ${formatValue(c.your_value, unit)}, all rounds)` : '';
    return `${REF_WORD[c.kind]} ${formatValue(c.value, unit)}${yours}${place}`;
  });
}

/**
 * The track's domain: a fill starts at zero, never at a truncated baseline. Rates, distances and counts run 0 to the largest value rounded up
 * (a rate to at most 100); strokes gained and other signed figures run either side of zero, with the zero rule in the middle.
 */
export function zeroBasedDomain(unit: string, values: ReadonlyArray<number | null>, signed: boolean): { min: number; max: number } {
  const v = values.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  const biggest = Math.max(0, ...v.map(Math.abs));
  const nice = (x: number): number => {
    if (x <= 0) return 1;
    const p = 10 ** Math.floor(Math.log10(x));
    const n = [1, 1.5, 2, 3, 4, 5, 6, 8, 10].find((c) => c * p >= x - 1e-9) ?? 10;
    return n * p;
  };
  if (signed || v.some((x) => x < 0)) return { min: -nice(biggest), max: nice(biggest) };
  const max = nice(biggest);
  return { min: 0, max: unit === 'percent' ? Math.min(100, max) : max };
}
const domainPct = (v: number, d: { min: number; max: number }) => Math.max(0, Math.min(100, ((v - d.min) / (d.max - d.min)) * 100));

/** The row label on a phone: a putt band is "5–10 ft makes", not the standards' "Putts Made 5-10 ft". */
function benchLabel(metricId: string, label: string): string {
  const m = metricId.match(/^putts_made_(\d+)_(?:(\d+)ft|plus_ft)_pct$/);
  return m ? (m[2] ? `${m[1]}–${m[2]} ft makes` : `${m[1]}+ ft makes`) : label;
}

/** The tag printed with a reference's value: "D1", "Team", "Tour". */
function refTag(kind: RefKind, label?: string): string {
  if (kind === 'team') return 'Team';
  if (kind === 'tour') return 'Tour';
  const d = label?.match(/Division (I{1,3})\b/)?.[1];
  return d ? `D${d.length}` : 'Level';
}

/** The standards name a putt band `putts_made_5_10ft_pct`; the putting read names it `putt_make_pct_5-10 ft` (`25+ ft` for the last). Both reduce to `putt510`. */
function normMetric(id: string): string {
  const std = id.match(/^putts_made_(\d+)_(?:(\d+)ft|plus_ft)_pct$/);
  if (std) return `putt${std[1]}${std[2] ?? 'plus'}`;
  const read = id.match(/^putt_make_pct_(\d+)(?:-(\d+)| ?\+) ?ft$/);
  if (read) return `putt${read[1]}${read[2] ?? 'plus'}`;
  return id.toLowerCase().replace(/[^a-z0-9]/g, '');
}
const METRIC_ALIAS: Record<string, string> = { sgtee: 'sgott', sandsavepct: 'scramblingpctsand', penaltiesperround: 'penaltyrateperround' };
const sameMetric = (a: string, b: string) => { const x = normMetric(a); const y = normMetric(b); return (METRIC_ALIAS[x] ?? x) === (METRIC_ALIAS[y] ?? y); };

/**
 * A benchmark read's "you" is the answer's own window when another read in the same turn measured that metric for that player (the standing is
 * over all recorded rounds, nightly): the row takes the window figure, keeps the standing figure as `standing_value`, and names the window.
 * Places in the level and the team stay the standing's.
 */
export function withWindowFigures(envelope: ToolEnvelope, all: readonly ToolEnvelope[]): ToolEnvelope {
  const d = envelope.detail as { kind?: string; standing?: { player_id?: string; player?: string; rows?: Array<Record<string, unknown>> } } | undefined;
  const rows = d?.standing?.rows;
  if (d?.kind !== 'benchmark_read' || !rows?.length) return envelope;
  const mine = d.standing?.player === 'You';
  const next = rows.map((r) => {
    const id = String(r.metric_id ?? '');
    // A row the server already read over a window says so itself; another read's figure never replaces it.
    if (typeof r.window_label === 'string') return r;
    for (const e of all) {
      if (e === envelope) continue;
      const m = e.measurements.find((x) => x.entity.kind === 'player' && (mine || x.entity.id === d.standing?.player_id) && x.value !== null && sameMetric(x.metric_id, id));
      if (m && m.value !== null) return { ...r, standing_value: r.player_value, player_value: m.value, window_label: (e as { window_label?: string }).window_label ?? null };
    }
    return r;
  });
  return next.every((r, i) => r === rows[i]) ? envelope : { ...envelope, detail: { ...d, standing: { ...d.standing, rows: next } } };
}

/**
 * A benchmark read for one player as a compact figure: a track per metric with the player's value, a tick for the level average, one for the
 * team average (a player sees the team's, never a teammate) and one for the Tour; a reference with no value is said so under the figure. Nothing
 * without a standing (a bare table of benchmark values is not a picture of anyone), and at most six metrics.
 */
export function benchmarkBlock(envelope: ToolEnvelope): Extract<AskEvidence, { kind: 'bars' }> | null {
  type Ref = { kind: RefKind; label?: string; value: number | null; your_value?: number | null; place_percent?: number | null; place_of?: number | null; note?: string | null; missing_reason?: string | null };
  type Row = { metric_id?: string; metric_label?: string; player_value?: number; comparisons?: Ref[]; standing_value?: number; window_label?: string };
  const d = envelope.detail as { standing?: { player?: string; rows?: Row[] } } | undefined;
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const rows = (d?.standing?.rows ?? []).filter((r) => num(r.player_value) && r.metric_id && r.metric_id in METRIC_RENDER_CONFIG).slice(0, 6);
  if (rows.length === 0) return null;
  const tableRows: string[][] = [];
  const missing: string[] = [];
  const windowed: string[] = [];
  const who0 = d?.standing?.player === 'You' ? 'You' : (d?.standing?.player ?? 'The player');
  const levelSentences: string[] = [];
  const out = rows.map((r) => {
    const cfg = METRIC_RENDER_CONFIG[r.metric_id as MetricId];
    const unit = BENCH_UNIT[cfg.unit] ?? 'count';
    const refs = r.comparisons ?? [];
    const val = (k: RefKind) => refs.find((c) => c.kind === k)?.value ?? null;
    const you = r.player_value as number;
    const level = val('level');
    const scale = zeroBasedDomain(cfg.unit, [you, level, val('team'), val('tour')], cfg.default_scale.min < 0);
    const fmt = (v: number) => formatValue(v, unit);
    // The level is over all recorded rounds, so the player's side of it is their all-rounds figure (the standing's), not the window's.
    const levelRef = refs.find((c) => c.kind === 'level');
    const youLevel = typeof levelRef?.your_value === 'number' ? levelRef.your_value : you;
    const better = level === null ? null : cfg.direction === 'higher_better' ? youLevel > level : youLevel < level;
    const label = benchLabel(r.metric_id as string, (r.metric_label ?? cfg.display_label).replace(/^SG:\s*/, 'SG '));
    // The standing is over all recorded rounds; when the figure shown is the answer's window, the places still come from the standing.
    if (num(r.standing_value) && fmt(r.standing_value) !== fmt(you)) windowed.push(r.window_label ?? 'the window');
    // Plain sentences, one per missing reference: "No college figure for SG Putting." / "No team figure for GIR % (fewer than 5 teammates)."
    if (levelRef && levelRef.value !== null && typeof levelRef.your_value === 'number') {
      const ahead = levelRef.place_percent == null ? '' : ` (${who0 === 'You' ? 'you’re ' : ''}ahead of ${levelRef.place_percent}% of ${levelRef.place_of ?? ''} college players on Helm)`.replace(/ {2}/g, ' ');
      levelSentences.push(`${label}: over all recorded rounds ${who0 === 'You' ? 'you’re' : 'they’re'} at ${fmt(levelRef.your_value)} against ${fmt(levelRef.value)} for ${levelRef.label ?? 'the level'}${ahead}.`);
    }
    for (const k of ['level', 'team', 'tour'] as const) {
      if (val(k) !== null) continue;
      const reason = (refs.find((c) => c.kind === k)?.missing_reason ?? 'not available').replace(/\.$/, '');
      const sentence = k === 'level' && reason === 'no college figure' ? `No college figure for ${label}.` : k === 'level' && reason === 'not set' ? 'The team’s level is not set.' : `No ${REF_WORD[k].toLowerCase()} figure for ${label} (${reason}).`;
      if (!missing.includes(sentence)) missing.push(sentence);
    }
    tableRows.push([label, fmt(you), ...(['level', 'team', 'tour'] as const).map((k) => { const v = val(k); return v === null ? formatValue(null, unit) : fmt(v); })]);
    return {
      label,
      pct: domainPct(you, scale),
      zero: domainPct(0, scale),
      display: fmt(you),
      of: null,
      tone: better === null || youLevel === level ? ('neutral' as const) : better ? ('good' as const) : ('loss' as const),
      ticks: (['level', 'team', 'tour'] as const).flatMap((k) => { const v = val(k); return v === null ? [] : [{ at: domainPct(v, scale), kind: k, text: `${REF_WORD[k]} ${fmt(v)}`, short: `${refTag(k, refs.find((c) => c.kind === k)?.label)} ${fmt(v)}` }]; }),
    };
  });
  const who = d?.standing?.player === 'You' ? 'You' : (d?.standing?.player ?? 'The player');
  return {
    kind: 'bars',
    title: `${who} against the level, the team and the Tour`,
    rows: out,
    source: null,
    note: [windowed.length ? `${who === 'You' ? 'Your' : 'The'} figure is over ${windowed[0]!.replace(/^(last )/, 'the $1')}. The level’s figure and place are over all recorded rounds.` : '', ...levelSentences.slice(0, 2), ...missing.slice(0, 3)].filter(Boolean).join(' ') || null,
    bench: null,
    table: { caption: `${who} against the level, the team and the Tour`, columns: ['Metric', who === 'You' ? 'You' : 'Value', 'Level', 'Team', 'Tour'], rows: tableRows },
  };
}

/** What an empty read says, in its own words (trimmed); the empty string when it says nothing. */
/** A note a coach can read: the model's own words (column names, instructions) are replaced by `fallback`. */
const coachWords = (text: string | null | undefined, fallback: string): string => {
  const t = (text ?? '').trim();
  return t && !MODEL_FACING_NOTE.test(t) ? t : fallback;
};

export const emptyNote = (envelope: ToolEnvelope): string => {
  const note = (envelope.coverage_note?.trim() || envelope.summary?.trim() || '').replace(/\s+/g, ' ');
  return MODEL_FACING_NOTE.test(note) ? (envelope.summary?.trim() && !MODEL_FACING_NOTE.test(envelope.summary) ? envelope.summary.trim() : '') : note;
};

/**
 * A `summarise_data` result. Its `detail` holds the operations' results and, for a list, the rows: the rows are the table (columns picked as any
 * record table's), and the figures that are not the list's own count go to the same figure card any read gets. Nothing is drawn twice.
 */
function summaryBlocks(envelope: ToolEnvelope): AskEvidence[] {
  const d = envelope.detail as { rows?: unknown; matching_rows?: unknown; row_count?: unknown; timezone?: unknown } | undefined;
  const blocks: AskEvidence[] = [];
  const rows = Array.isArray(d?.rows) ? (d?.rows as unknown[]).filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r)) : [];
  const total = typeof d?.matching_rows === 'number' ? d.matching_rows : rows.length;
  if (rows.length > 0) {
    const table = detailTable({ rows, ...(typeof d?.timezone === 'string' ? { timezone: d.timezone } : {}) }, total > rows.length ? `${rows.length} of ${total} rows` : plural(rows.length, 'row'));
    if (table) blocks.push({ kind: 'table', title: table.caption, source: null, note: total > rows.length ? `Showing the first ${rows.length} of ${total} rows.` : partialNote(envelope), bench: null, table });
  }
  // The "Rows listed" count is the table's own: it is not a figure to draw again.
  const titles = (envelope.detail as { titles?: Record<string, unknown> } | undefined)?.titles;
  // Each figure's card title as the summary states it ("Owen Carter vs team (pooled), strokes gained approach"), not the label the model reads.
  const figures = envelope.measurements
    .filter((m) => m.method !== 'summary_list')
    .map((m) => (typeof titles?.[m.metric_id] === 'string' ? { ...m, metric_label: titles[m.metric_id] as string } : m));
  if (figures.length > 0) {
    const caption = (envelope.detail as { caption?: unknown } | undefined)?.caption;
    const rest = evidenceBlocks({ ...envelope, detail: typeof caption === 'string' ? { caption } : undefined, measurements: figures });
    blocks.push(...rest.filter((b) => b.kind !== 'empty'));
  }
  if (blocks.length === 0) return envelope.coverage === 'empty' ? [{ kind: 'empty', note: coachWords(envelope.coverage_note, 'No rows matched.') }] : [];
  return blocks;
}

/** One tool's output as the block this screen draws. The choice is made from the SHAPE of the evidence, never from what the model asked for. */
export function evidenceBlocks(envelope: ToolEnvelope): AskEvidence[] {
  // A failed read is never "no data": it is the honest "could not read this".
  if (envelope.coverage === 'unavailable') return [{ kind: 'unavailable', note: coachWords(envelope.coverage_note, coachWords(envelope.summary, 'The read did not come back.')) }];
  // Golf knowledge and metric definitions are words, not figures: they show as the step that read them and as chips in the answer's prose, never as a card.
  const kind = (envelope.detail as { kind?: unknown } | undefined)?.kind;
  if (kind === 'reference' || kind === 'definition') return [];
  // A worked-out result (summarise_data) is the answer's own figures: a list of rows is the table, a count, rank or difference is one compact figure card.
  if (kind === 'summary') return summaryBlocks(envelope);
  // A benchmark read draws only as a picture of where one player stands, or not at all.
  if (kind === 'benchmark_read') {
    const b = benchmarkBlock(envelope);
    return b ? [b] : [];
  }
  if (envelope.coverage === 'empty') return [{ kind: 'empty', note: emptyNote(envelope) || 'Nothing is recorded for this yet.' }];

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
      // The footer counts what the rows list: each player's sample is their own, so the rows add up (P013 D7). Mixed units keep the first's.
      const oneUnit = ranked.every((m) => m.sample_unit === first.sample_unit);
      blocks.push({
        kind: 'ranking',
        title: first.metric_label,
        ...base,
        source: oneUnit ? sourceLine({ ...first, sample_size: ranked.reduce((sum, m) => sum + m.sample_size, 0) }) : base.source,
        note: missing > 0 ? `${missing} player${missing === 1 ? ' has' : 's have'} no recorded data for this.` : base.note,
        ...rankRows(ranked),
        table: { caption: first.metric_label, columns: ['Rank', 'Player', first.metric_label, 'Sample'], rows: ranked.map((m, i) => [String(i + 1), m.entity.label, formatValue(m.value, m.unit, m), m.sample_size > 0 ? sampleWords(m.sample_size, m.sample_unit) : NO_DATA]) },
      });
    } else if (isComparison) {
      const names = [...new Set(ms.map((m) => m.entity.label))];
      const metricIds = [...new Set(ms.map((m) => m.metric_id))];
      const find = (n: string, id: string) => ms.find((m) => m.entity.label === n && m.metric_id === id);
      const team = teamTable(ms);
      blocks.push({
        kind: 'compare',
        // Two names read as a pair; a team is "5 players", never five names strung on "and".
        title: names.length <= 3 ? names.join(' and ') : envelope.summary || `${names.length} players`,
        ...base,
        team,
        table: {
          caption: `Comparison of ${names.join(' and ')} across ${plural(metricIds.length, 'metric')}, with sample sizes`,
          columns: ['Metric', ...names],
          rows: metricIds.map((id) => [ms.find((m) => m.metric_id === id)?.metric_label ?? id, ...names.map((n) => { const m = find(n, id); return m ? `${formatValue(m.value, m.unit, m)}${m.sample_size > 0 ? ` (${sampleWords(m.sample_size, m.sample_unit)})` : ''}` : NO_DATA; })]),
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
        // A loss that prints as 0.0 is no loss (A2).
        takeaway: changeTone(worst.value, false, 1) === 'is-loss' ? `Largest loss: ${worst.metric_label} at ${formatValue(worst.value, worst.unit)}.` : 'No leg is below zero.',
        table: measurementTable(legs, 'Strokes gained by leg'),
      });
    } else {
      const many = players.size > 1;
      // A count whose sample is itself ("Active roster 5", sampled over 5 players) says its figure once: no "5 players" under
      // it, and none in the source line.
      const restates = (m: Measurement) => m.unit === 'count' && m.value !== null && m.sample_size === m.value && m.denominator === null;
      const allRestate = ms.every(restates);
      blocks.push({
        kind: 'tiles',
        title: envelope.summary,
        ...base,
        source: allRestate ? sourceLine({ ...first, sample_size: 0 }) || null : base.source,
        tiles: ms.map((m) => {
          const t = m.unit === 'strokes' ? changeTone(m.value, false, 1) : '';
          return {
            label: many && !m.metric_label.startsWith(m.entity.label) ? `${m.entity.label}, ${m.metric_label}` : m.metric_label,
            value: formatValue(m.value, m.unit, m),
            sub: restates(m) ? null : madeOf(m),
            tone: t === 'is-loss' ? 'loss' : t === 'is-gain' ? 'gain' : 'plain',
          };
        }),
        table: measurementTable(ms, envelope.summary),
      });
    }
  }

  // The reads an answer names for one player: each opens that player's Deep dive on it, for a coach whose team the player is on.
  const reads = blocks.length === 0 ? readsOf(envelope.detail) : null;
  if (reads) {
    blocks.push({
      kind: 'reads',
      title: envelope.summary,
      source: null,
      note: partialNote(envelope),
      bench: null,
      playerId: reads.playerId,
      rows: reads.rows,
      table: { caption: envelope.summary, columns: ['Read', 'Area', 'Value'], rows: reads.rows.map((r) => [r.title, readAreaWord(r.category) ?? NO_DATA, r.value ?? NO_DATA]) },
    });
  }

  // Nothing above drew it (a tool whose output is a list of records, or a kind added later): its real table, or no block at all. A
  // placeholder table read as a broken chart, one row saying "Read" under the headings Read and Result (QA-2).
  if (blocks.length === 0) {
    const table = roundsTable(envelope.detail, envelope.summary) ?? goalsTable(envelope.detail, envelope.summary) ?? detailTable(envelope.detail, envelope.summary);
    if (table) blocks.push({ kind: 'table', title: envelope.summary, source: null, note: partialNote(envelope), bench: null, table });
  }
  return blocks;
}

// ── The evidence panel ─────────────────────────────────────────────────────

/** What an action card hands the panel: which turn, which card, and who it is about. */
/** With `ref`, the panel shows that one read of that turn (a chip was tapped) instead of a player's figures. */
export type EvidenceFocus = { messageId: string; key: string; label: string; playerId?: string; ref?: string };

/** One read of a turn, by its ref: what a chip opens (chat v3, SPEC Moment 6). */
export function readForFocus(messages: UIMessage[], focus: EvidenceFocus): { tool: string; envelope: ToolEnvelope } | null {
  if (!focus.ref) return null;
  const message = messages.find((m) => m.id === focus.messageId);
  for (const p of message ? partsOf(message) : []) {
    if (p.type !== 'data-evidence') continue;
    const d = dataOf<{ tool?: string; envelope?: ToolEnvelope; ref?: string }>(p);
    if (d?.ref === focus.ref && d.envelope) return { tool: d.tool ?? '', envelope: d.envelope };
  }
  return null;
}

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
