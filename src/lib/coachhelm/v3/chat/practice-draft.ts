import 'server-only';
import { tool, type ToolSet, type UIMessageStreamWriter } from 'ai';
import { z } from 'zod';
import { autoGrid, stationsLen, type PlanBodyV2, type PlanBlock, type PlanWhy } from '../practice-plan/model';
import { auditNumericClaims, type ToolEnvelope } from './provenance';
import { ActionPlanError } from './action-planners';
import { requireRosterPlayer, type CoachChatContext } from './context';
import type { FlowDef } from './create-tools';
import { isPracticeTabEnabled } from '../practice-plan/flag';
import { publishPracticePlan } from '@/app/golf/actions/practice-publish';
import { sendMessage } from '@/app/actions/messages';
import { pluralize } from '@/lib/utils';
import { createClient } from '@/lib/supabase/server';

const Drill = z.string().describe('A ref from get_drill_bank detail.ids, like lib:<id>. Never invent one.').nullable().optional();
const BlockInput = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(['team', 'stations', 'course', 'own', 'break']),
  title: z.string().min(1).max(80),
  len: z.number().int().min(5).max(360),
  place: z.string().max(80).default(''),
  note: z.string().max(280).default(''),
  drill: Drill,
  aim: z.string().max(200).default(''),
  because: z.string().max(280).nullable().default(null),
  routine: z.boolean().default(false),
  sources: z.array(z.object({ evidence_ref: z.string().max(80), label: z.string().max(40) })).max(4).default([]).describe('The reads behind this Because, by the evidence_ref they returned.'),
  alternatives: z.array(z.object({ ref: z.string(), line: z.string().max(120) })).max(3).default([]).describe('Up to three swaps for this block\'s drill, from get_drill_bank.'),
  stations: z.array(z.object({ id: z.string(), place: z.string().max(80), drill: Drill, note: z.string().max(280).default(''), alternatives: z.array(z.object({ ref: z.string(), line: z.string().max(120) })).max(3).default([]) })).max(8).optional(),
  turn_min: z.number().int().min(5).max(60).optional(),
  move_min: z.number().int().min(0).max(10).optional(),
  hole_from: z.number().int().min(1).max(18).optional(),
  hole_to: z.number().int().min(1).max(18).optional(),
});
const Input = z.object({
  event_id: z.string().uuid().nullable().describe('The practice event for this plan, from the calendar. Null: the card says to add one first.'),
  title: z.string().min(1).max(80),
  focus: z.string().max(140).default(''),
  place: z.string().max(80).default(''),
  when: z.string().max(60).optional().describe('The practice in words: Thu, Nov 5 · 2:00 to 5:00 PM.'),
  start: z.string().regex(/^\d{2}:\d{2}$/).optional().describe('The practice start, 24 hour clock, team zone.'),
  minutes_asked: z.number().int().min(5).max(360).describe('The length the coach asked for. Blocks must add up to it.'),
  groups: z.array(z.object({ id: z.string(), name: z.string().max(20), players: z.array(z.string().uuid()) })).max(6).default([]),
  players: z.array(z.string().uuid()).max(60).default([]),
  bring: z.array(z.object({ item: z.string().min(1).max(40), qty: z.number().int().min(1).max(99) })).max(20).default([]),
  blocks: z.array(BlockInput).min(1).max(40),
});
type In = z.infer<typeof Input>;

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
      if (read) evidence[x.evidence_ref] = { label: x.label, line: read.summary, rows: read.measurements.slice(0, 8).map((m) => ({ label: m.metric_label, value: m.value == null ? '—' : String(m.value) })) };
    }
  }
  return { when: input.when, start: input.start, drills, alternatives, sources, evidence };
}

/** `draft_practice_plan` writes nothing. Each Because is audited against this turn's reads; one that fails keeps its Aim and shows "Lean read" (02 §5.2). */
export function practiceDraftTool({ ctx, writer, envelopes, evidenceByRef }: { ctx: CoachChatContext; writer: UIMessageStreamWriter; envelopes: () => readonly ToolEnvelope[]; evidenceByRef: ReadonlyMap<string, ToolEnvelope> }): ToolSet {
  let version = 0;
  return {
    draft_practice_plan: tool({
      description: 'Write a practice plan draft after get_drill_bank and the coach\'s answers. Saves nothing: Save and Publish are the coach\'s presses. Only use drills from get_drill_bank. A number in a Because must come from a read in this turn.',
      inputSchema: Input,
      execute: async (input) => {
        const known = new Set<string>(envelopes().flatMap((e) => ((e.detail as { ids?: string[] } | undefined)?.ids ?? [])));
        const refs = input.blocks.flatMap((b) => [b.drill, ...(b.stations ?? []).map((s) => s.drill)]).filter((r): r is string => !!r);
        const unknown = refs.filter((r) => !known.has(r));
        if (unknown.length) return { status: 'refused', message: 'Some drills are not in the bank. Use only ids from get_drill_bank.' };
        for (const p of input.players) requireRosterPlayer(ctx, p);
        const sum = input.blocks.reduce((s, b) => s + b.len, 0);
        if (sum !== input.minutes_asked) return { status: 'refused', message: `The blocks add up to ${sum} minutes; the coach asked for ${input.minutes_asked}. Fix the lengths.` };
        const groupIds = input.groups.map((g) => g.id);
        const measurements = envelopes().flatMap((e) => e.measurements);
        const series = envelopes().flatMap((e) => e.series);
        const details = envelopes().map((e) => e.detail);
        const why: Record<string, PlanWhy> = {};
        for (const b of input.blocks) {
          const routine = b.routine || b.kind === 'break';
          const claim = b.because ?? '';
          const bad = claim ? auditNumericClaims(claim, measurements, series, details as never) : [];
          const lean = !routine && (!claim || (Array.isArray(bad) ? bad.length > 0 : false));
          why[b.id] = { aim: b.aim, because: routine || lean ? null : claim, sources: [], lean, routine };
        }
        const body: PlanBodyV2 = { v: 2, focus: input.focus, notes: '', place: input.place, arrivalBufferMin: 15, bring: input.bring, players: input.players, groups: input.groups.map((g) => ({ ...g, savedGroupId: null })), variants: { main: { blocks: input.blocks.map((b) => toBlock(b, groupIds)) }, rain: null } };
        version += 1;
        writer.write({ type: 'data-practice-plan', id: `plan-${version}`, data: { version, eventId: input.event_id, title: input.title, draft: { body, why, version }, saveOn: isPracticeTabEnabled(), ...planCardMeta(input, envelopes(), evidenceByRef) } });
        return { status: 'shown', message: `A ${Math.round(sum / 60 * 10) / 10} hour plan in ${input.blocks.length} blocks is on the card. Nothing is saved yet.` };
      },
    }),
  };
}

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

/** One text message in the team channel, with no second push. False when it could not post (the publish still stands); the coach must be a participant. */
async function postPlanToTeamChat(ctx: CoachChatContext, content: string): Promise<boolean> {
  const sb = await createClient();
  const { data } = await sb.from('golf_conversations').select('id').eq('team_id', ctx.team_id).eq('is_team_channel', true).limit(1).maybeSingle();
  if (!data?.id) return false;
  const sent = await sendMessage({ conversationId: data.id, content, sport: 'golf', createNotifications: false });
  return sent.success;
}

const publishInput = z.object({ plan_id: z.string().uuid(), version: z.number().int().min(1), title: z.string().min(1).max(80), people: z.number().int().min(1).describe('Players and coaches on the plan.'), when: z.string().min(1).max(60), where: z.string().max(80).default(''), first_player_line: z.string().max(140).describe('The notification the first player gets.'), player_ids: z.array(z.string().uuid()).max(60).default([]).describe('Roster ids of the players on the plan, the first player first.'), team_chat: z.boolean().default(true).describe('Post the plan in Team chat too. False only if the coach said not to.') });

/** Publish goes on the Ask hold: nothing is written or told until Undo closes. */
export const publishFlow: FlowDef<z.infer<typeof publishInput>> = {
  name: 'publish_practice_plan',
  description: 'Publish a saved practice plan. Files it in Documents and tells the plan\'s people. REQUIRES the coach to confirm.',
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
      publish: { heading: `Publish ${i.title}?`, coins: players.slice(0, 9).map((p, n) => ({ initials: initialsOf(p.name), tone: n })), tellsLine, folder: 'Practice plans', teamChat: i.team_chat, ...(first ? { sample: { player: first.name.split(' ')[0] ?? first.name, title: i.title, body: i.first_player_line } } : {}) },
      facts: [{ label: 'When', value: i.when }, { label: 'Where', value: i.where || 'Not set' }, { label: 'Tells', value: tellsLine }, { label: 'What they get', value: i.first_player_line }],
      notifications: [`It files in Documents and ${i.people} people hear once Undo closes, 8 seconds later.${i.team_chat ? ' The plan posts in Team chat, with no second push.' : ''}`],
      key: ['publish_plan', i.plan_id, String(i.version), i.team_chat ? 'chat' : 'no-chat'],
    };
  },
  run: async (ctx, i) => {
    const res = await publishPracticePlan({ planId: i.plan_id, expectedVersion: i.version, notify: 'now' });
    const chat = res.success && i.team_chat ? await postPlanToTeamChat(ctx, `${i.title} is published. ${i.when}.`) : null;
    return res.success ? { ok: true, summary: `Published. ${res.recipients} people told.${chat === false ? ' The Team chat post didn’t send.' : ''}`, kind: 'practice_plan', label: i.title, href: `/golf/dashboard/practice/plan/${i.plan_id}` } : { ok: false, error: res.error, summary: res.error, kind: 'practice_plan' };
  },
};
