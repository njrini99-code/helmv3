import 'server-only';
import { z } from 'zod';
import { autoGrid, stationsLen, type PlanBodyV2, type PlanBlock, type PlanWhy } from '../practice-plan/model';
import { checkGrounding } from './grounding';
import type { ToolEnvelope } from './provenance';
import { ActionPlanError } from './action-planners';
import { requireRosterPlayer, type CoachChatContext } from './context';
import type { FlowDef } from './create-tools';
import { publishPracticePlan } from '@/app/golf/actions/practice-publish';
import { sendMessage } from '@/app/actions/messages';
import { pluralize } from '@/lib/utils';
import { createClient } from '@/lib/supabase/server';
import { getAppBaseUrl } from '@/lib/app-base-url';

const Drill = z.string().describe('A ref from the drill bank read, like lib:<id>.').nullable().optional();
const BlockInput = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(['team', 'stations', 'course', 'own', 'break']),
  title: z.string().min(1).max(80),
  len: z.number().int().min(5).max(360).multipleOf(5),
  place: z.string().max(40).default(''),
  note: z.string().max(280).default(''),
  drill: Drill,
  aim: z.string().max(200).default(''),
  because: z.string().max(280).nullable().default(null),
  routine: z.boolean().default(false),
  sources: z.array(z.object({ evidence_ref: z.string().max(80), label: z.string().max(40) })).max(4).default([]).describe('The reads behind this Because.'),
  alternatives: z.array(z.object({ ref: z.string(), line: z.string().max(120) })).max(3).default([]).describe('Swaps for this drill, from the drill bank.'),
  stations: z.array(z.object({ id: z.string(), place: z.string().min(1).max(40), drill: Drill, note: z.string().max(280).default(''), alternatives: z.array(z.object({ ref: z.string(), line: z.string().max(120) })).max(3).default([]) })).max(8).optional(),
  turn_min: z.number().int().min(5).max(60).multipleOf(5).optional(),
  move_min: z.number().int().min(0).max(10).optional(),
  hole_from: z.number().int().min(1).max(18).optional(),
  hole_to: z.number().int().min(1).max(18).optional(),
});
export const PracticeDraftInput = z.object({
  event_id: z.string().uuid().nullable().describe('The practice event, from the calendar; null if there is none yet.'),
  title: z.string().min(1).max(80),
  focus: z.string().max(140).default(''),
  place: z.string().max(80).default(''),
  when: z.string().max(60).optional().describe('In words: Thu, Nov 5 · 2:00 to 5:00 PM.'),
  start: z.string().regex(/^\d{2}:\d{2}$/).optional().describe('Start, 24 hour clock, team time.'),
  minutes_asked: z.number().int().min(5).max(360).describe('The length asked for; blocks must add up to it.'),
  groups: z.array(z.object({ id: z.string(), name: z.string().max(20), players: z.array(z.string().uuid()) })).max(6).default([]),
  players: z.array(z.string().uuid()).max(60).default([]),
  bring: z.array(z.object({ item: z.string().min(1).max(40), qty: z.number().int().min(1).max(99) })).max(20).default([]),
  blocks: z.array(BlockInput).min(1).max(40),
});
type In = z.infer<typeof PracticeDraftInput>;

const refOf = (r: string | null | undefined): { src: 'team' | 'lib'; id: string } | null => {
  const [src, id] = (r ?? '').split(':');
  return (src === 'team' || src === 'lib') && id ? { src, id } : null;
};

function toBlock(b: In['blocks'][number], groupIds: string[]): PlanBlock {
  const base = { id: b.id, title: b.title, len: b.len, coach: null, note: b.note };
  if (b.kind === 'stations') {
    const stations = (b.stations ?? []).map((s) => ({ id: s.id, place: s.place, coach: null, drill: refOf(s.drill), note: s.note }));
    const turnMin = b.turn_min ?? 20;
    const moveMin = b.move_min ?? 0;
    const turns = Math.max(1, stations.length);
    const block = { ...base, kind: 'stations' as const, stations, groupIds, turnMin, moveMin, turns, grid: null };
    return { ...block, len: stationsLen(block), grid: autoGrid(block) };
  }
  if (b.kind === 'course') return { ...base, kind: 'course', holeFrom: b.hole_from ?? 1, holeTo: b.hole_to ?? 9, format: 'stroke', pairings: [], qualifierId: null };
  if (b.kind === 'own') return { ...base, kind: 'own', place: b.place, lines: {} };
  if (b.kind === 'break') return { ...base, kind: 'break', place: b.place };
  return { ...base, kind: 'team', place: b.place, drill: refOf(b.drill) };
}

/** What the card draws beyond the plan: drill names, swaps, and the figures behind each source chip, all from this turn's reads. */
/**
 * What the full plan prints, from the team row, the event and the roster the draft already grouped. Measurements print in house
 * style here too: U+2212 minus, — for none.
 */
async function planSheetFor(ctx: CoachChatContext, eventId: string | null) {
  const sb = await createClient();
  const [{ data: event }, { data: team }] = await Promise.all([
    eventId ? sb.from('golf_events').select('start_time, end_time').eq('id', eventId).eq('team_id', ctx.team_id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from('golf_teams').select('organization_id').eq('id', ctx.team_id).maybeSingle(),
  ]);
  const { data: coaches } = team?.organization_id ? await sb.from('golf_coaches').select('full_name').eq('organization_id', team.organization_id) : { data: [] };
  return {
    team: ctx.team_name,
    start: event?.start_time ?? null,
    end: event?.end_time ?? null,
    zone: ctx.timezone,
    coaches: (coaches ?? []).map((c) => c.full_name).filter((n): n is string => !!n),
    names: Object.fromEntries(ctx.roster.map((p) => [p.id, p.name])),
  };
}

/** A read's figure as the card prints it: at most two places, U+2212 minus, — for no data. Text comes through as it is. */
export function evidenceValue(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value).replace(/^-(?=\d)/, '\u2212');
  const shown = String(Math.round(Math.abs(value) * 100) / 100);
  return `${value < 0 && shown !== '0' ? '\u2212' : ''}${shown}`;
}

function planCardMeta(input: In, reads: readonly ToolEnvelope[], byRef: ReadonlyMap<string, ToolEnvelope>) {
  const bank = reads.flatMap((e) => ((e.detail as { drills?: Array<{ ref: string; title: string; minutes?: number | null; kind?: string | null }> } | undefined)?.drills ?? []));
  const kindOf = (k: string | null | undefined): 'skill' | 'random' | 'pressure' => (k === 'random' || k === 'pressure' ? k : 'skill');
  const drills = Object.fromEntries(bank.map((d) => [d.ref, { name: d.title, kind: kindOf(d.kind) }]));
  const alts = (list: Array<{ ref: string; line: string }>) =>
    list.flatMap((a) => {
      const d = bank.find((x) => x.ref === a.ref);
      return d ? [{ ref: a.ref, name: d.title, kind: kindOf(d.kind), min: d.minutes ?? 0, line: a.line }] : [];
    });
  const alternatives: Record<string, ReturnType<typeof alts>> = {};
  const sources: Record<string, Array<{ ref: string; label: string }>> = {};
  const evidence: Record<string, { label: string; line: string; rows: Array<{ label: string; value: string }> }> = {};
  for (const b of input.blocks) {
    if (b.alternatives.length) alternatives[b.id] = alts(b.alternatives);
    for (const st of b.stations ?? []) if (st.alternatives.length) alternatives[st.id] = alts(st.alternatives);
    if (b.sources.length) sources[b.id] = b.sources.map((x) => ({ ref: x.evidence_ref, label: x.label }));
    for (const x of b.sources) {
      const read = byRef.get(x.evidence_ref);
      if (read) evidence[x.evidence_ref] = { label: x.label, line: read.summary, rows: read.measurements.slice(0, 8).map((m) => ({ label: m.metric_label, value: evidenceValue(m.value) })) };
    }
  }
  return { when: input.when, start: input.start, drills, alternatives, sources, evidence };
}

/** The questions a practice brief asks: up to four, each a short list of choices. */
export const BriefInput = z.object({
  title: z.string().min(1).max(120),
  questions: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        title: z.string().min(1).max(160),
        why: z.string().max(200).optional(),
        multi: z.boolean().optional(),
        options: z.array(z.object({ id: z.string().min(1).max(40), label: z.string().min(1).max(80), hint: z.string().max(120).optional() })).min(2).max(6),
        pick: z.array(z.string()).max(6).optional(),
      }),
    )
    .min(1)
    .max(4),
});

/** A conversation's drafts are numbered in the order they were made; the card keeps the newest. */
const versions = new WeakMap<object, number>();

/**
 * `draft_practice_plan` writes nothing: it builds the card. `reads` is the conversation's reads by evidence_ref. A Because whose numbers
 * no read returned keeps its Aim and shows "Lean read" (02 §5.2); that is the grounding check used on one sentence, and it only
 * changes the label on the card.
 */
export async function practiceDraft(ctx: CoachChatContext, input: In, reads: ReadonlyMap<string, ToolEnvelope>): Promise<{ ok: true; message: string; card: Record<string, unknown> } | { ok: false; message: string }> {
  const envelopes = [...reads.values()];
  // A merged practice read keeps the drill bank's ids one level down (`detail['drill bank'].ids`).
  const bankOf = (e: ToolEnvelope) => {
    const d = e.detail as { ids?: string[]; 'drill bank'?: { ids?: string[] } } | undefined;
    return d?.ids ?? d?.['drill bank']?.ids ?? [];
  };
  const known = new Set<string>(envelopes.flatMap(bankOf));
  const refs = input.blocks.flatMap((b) => [b.drill, ...(b.stations ?? []).map((s) => s.drill)]).filter((r): r is string => !!r);
  if (refs.some((r) => !known.has(r))) return { ok: false, message: 'Some drills are not in the bank. Use only refs from the drill bank read.' };
  for (const p of input.players) requireRosterPlayer(ctx, p);
  const sum = input.blocks.reduce((s, b) => s + b.len, 0);
  if (sum !== input.minutes_asked) return { ok: false, message: `The blocks add up to ${sum} minutes; the coach asked for ${input.minutes_asked}. Fix the lengths.` };
  const groupIds = input.groups.map((g) => g.id);
  const blocks = input.blocks.map((b) => toBlock(b, groupIds));
  // What the save would refuse (golf_practice_plan_check_body), said while the model can still fix it.
  if (blocks.some((b) => b.kind === 'stations' && !b.stations.length)) return { ok: false, message: 'A stations block needs at least one station.' };
  if (blocks.some((b) => b.len % 5 !== 0)) return { ok: false, message: 'A stations block must come to a length in 5 minute steps. Change its turn or move minutes.' };
  const why: Record<string, PlanWhy> = {};
  for (const b of input.blocks) {
    const routine = b.routine || b.kind === 'break';
    const claim = b.because ?? '';
    const lean = !routine && (!claim || !checkGrounding(claim, envelopes).grounded);
    why[b.id] = { aim: b.aim, because: routine || lean ? null : claim, sources: [], lean, routine };
  }
  const body: PlanBodyV2 = { v: 2, focus: input.focus, notes: '', place: input.place, arrivalBufferMin: 15, bring: input.bring, players: input.players, groups: input.groups.map((g) => ({ ...g, savedGroupId: null })), variants: { main: { blocks }, rain: null } };
  const version = (versions.get(reads) ?? 0) + 1;
  versions.set(reads, version);
  const flat = envelopes.map((e) => {
    const d = e.detail as { drills?: unknown; 'drill bank'?: { drills?: unknown } } | undefined;
    return d && !d.drills && d['drill bank']?.drills ? { ...e, detail: { ...d, drills: d['drill bank'].drills } } : e;
  });
  return { ok: true, message: `A ${Math.round((sum / 60) * 10) / 10} hour plan in ${input.blocks.length} blocks is on the card. Nothing is saved yet.`, card: { version, eventId: input.event_id, title: input.title, draft: { body, why, version }, saveOn: true, sheet: await planSheetFor(ctx, input.event_id), ...planCardMeta(input, flat, reads) } };
}

/** One text message in the team channel, with no second push. False when it could not post (the publish still stands); the coach must be a participant. */
async function postPlanToTeamChat(ctx: CoachChatContext, content: string): Promise<boolean> {
  const sb = await createClient();
  const { data, error } = await sb.from('golf_conversations').select('id').eq('team_id', ctx.team_id).eq('is_team_channel', true).limit(1).maybeSingle();
  if (error || !data?.id) return false;
  const sent = await sendMessage({ conversationId: data.id, content, sport: 'golf', createNotifications: false });
  return sent.success;
}

const publishInput = z.object({ plan_id: z.string().uuid().describe('From the coach\'s Publish message. Without one, ask the coach to press Publish on the plan.'), version: z.number().int().min(1).describe('From the coach\'s Publish message.'), title: z.string().min(1).max(80), people: z.number().int().min(1).describe('Players and coaches on the plan.'), when: z.string().min(1).max(60), where: z.string().max(80).default(''), first_player_line: z.string().max(140).describe('The notification a player gets.'), player_ids: z.array(z.string().uuid()).max(60).default([]).describe('The plan\'s players, the first player first.'), team_chat: z.boolean().default(true).describe('Also post in Team chat, unless the coach said not to.') });

/** Publish goes on the Ask hold: nothing is written or told until Undo closes. */
export const publishFlow: FlowDef<z.infer<typeof publishInput>> = {
  name: 'publish_practice_plan',
  description: 'Publish a saved practice plan. Files it in Documents and tells the plan\'s people.',
  input: publishInput,
  plan: (ctx, i) => {
    if (i.people < 1) throw new ActionPlanError('A plan needs people to publish to.');
    const players = i.player_ids.map((id) => requireRosterPlayer(ctx, id));
    const coaches = Math.max(0, i.people - players.length);
    const who = players.length ? `${pluralize(players.length, 'player')}${coaches ? ` and ${pluralize(coaches, 'coach', 'coaches')}` : ''}` : `${i.people} people`;
    const tellsLine = `${who}, push and bell`;
    const first = players[0];
    return {
      action: `Publish to ${i.people} people`,
      summary: i.title,
      publish: { heading: `Publish ${i.title}?`, coins: players.slice(0, 6).map((p) => ({ name: p.name })), coinsMore: Math.max(0, players.length - 6), tellsLine, folder: 'Practice plans', teamChat: i.team_chat, ...(first ? { sample: { player: first.name.split(' ')[0] ?? first.name, title: i.title, body: i.first_player_line } } : {}) },
      facts: [{ label: 'When', value: i.when }, { label: 'Where', value: i.where || 'Not set' }, { label: 'Tells', value: tellsLine }, { label: 'What they get', value: i.first_player_line }],
      notifications: [`It files in Documents and ${i.people} people hear once Undo closes, 8 seconds later.${i.team_chat ? ' The plan posts in Team chat, with no second push.' : ''}`],
      key: ['publish_plan', i.plan_id, String(i.version), i.team_chat ? 'chat' : 'no-chat'],
    };
  },
  run: async (ctx, i) => {
    const res = await publishPracticePlan({ planId: i.plan_id, expectedVersion: i.version, notify: 'now' });
    const chat = res.success && i.team_chat ? await postPlanToTeamChat(ctx, `${i.title} is published. ${i.when}. ${getAppBaseUrl()}/golf/dashboard/practice/plan/${i.plan_id}`) : null;
    return res.success ? { ok: true, summary: `Published. ${res.recipients} people told.${chat === false ? ' The Team chat post didn’t send.' : ''}`, kind: 'practice_plan', label: i.title, href: `/golf/dashboard/practice/plan/${i.plan_id}`, notifications: [{ channel: 'push and bell', recipients: res.recipients, status: 'sent' as const }] } : { ok: false, error: res.error, summary: res.error, kind: 'practice_plan' };
  },
};
