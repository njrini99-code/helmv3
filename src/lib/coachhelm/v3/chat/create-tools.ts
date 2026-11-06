import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { sendGolfMessage } from '@/app/actions/messages';
import { createGolfEvent } from '@/app/golf/actions/calendar-events';
import { createGolfTravelItinerary } from '@/app/golf/actions/travel';
import { createGolfQualifier } from '@/app/golf/actions/qualifier-actions';
import { createGoal } from '@/app/golf/actions/v3/goals';
import { saveRoundCoachNote } from '@/app/golf/actions/round-coach-note';
import { addCoachBlockedTime } from '@/app/golf/actions/calendar-blocked-time';
import { addTeamBreak, saveTeamTerm } from '@/app/golf/actions/class-status';
import { setPlayerAvailabilityCoachNote } from '@/app/golf/actions/team-management';
import { createRecruit } from '@/app/golf/actions/recruiting';
import { lockTournamentLineup, setTournamentEntries } from '@/app/golf/actions/tournaments';
import type { CoachChatContext } from './context';
import { requireRosterPlayer } from './context';
import { askTables } from './ask-db';
import { APPROVED_RUN_TTL_MS } from './action-runs';
import { ActionPlanError } from './action-planners';
import type { ActionProposal, ActionReceipt, ProposalFact } from './action-types';

type Sb = SupabaseClient<Database>;

/** One attempt at a flow's write. `requestId` is the same for every retry of the same card, so a retry finds the row instead of writing a second. */
export interface FlowAttempt {
  sb: Sb;
  requestId: string;
}

/** What a flow's receipt says once its row exists. */
interface FlowDone {
  summary: string;
  kind: string;
  label?: string;
  href?: string;
}

/**
 * Ask v2's create flows (TASK_FIELDS §5). One tool per flow, each on the same gate as today's four writes: `plan` runs before Confirm and writes nothing;
 * `run` runs after the 8 second hold. Every value written is on the card. A required field the coach didn't give is a question the model asks first, never a guess.
 */
export interface FlowDef<I> {
  name: string;
  description: string;
  input: z.ZodType<I>;
  plan: (ctx: CoachChatContext, input: I) => { visual?: ActionProposal['visual']; publish?: ActionProposal['publish']; facts: ProposalFact[]; action: string; summary: string; notifications: string[]; affects?: ActionProposal['affects']; key: Array<string | number> };
  run: (ctx: CoachChatContext, input: I, attempt: FlowAttempt) => Promise<{ ok: boolean; error?: string; summary: string; href?: string; kind: string; label?: string; notifications?: ActionReceipt['notifications'] }>;
  /** Writes the moment the coach presses, with no hold and no Undo (02-PLAN §14.4, 08-ACCEPTANCE: Lock is its own card with no Undo). */
  immediate?: boolean;
  /** Reads what the card has to show before Confirm (a round's note). Nothing the model said stands in for it. */
  prepare?: (sb: Sb, ctx: CoachChatContext, input: I) => Promise<I>;
  /** The table whose row id is `requestId`: an action that failed after that row exists is recorded as done, never offered again. */
  landed?: { table: 'golf_events' | 'golf_coach_blocked_time' | 'golf_recruits'; done: (input: I) => FlowDone };
}

/** The same request id for every retry of one card: the coach's own scoped ledger key, hashed, so two cards that differ anywhere are two rows. Two coaches' same-looking events never collide. */
export function flowRequestId(coachId: string, teamId: string, key: string): string {
  // The team is in the id: the same card on a coach's second team is a second row, not a replay of the first.
  return stableUuid(`${coachId}:${teamId}:${key}`);
}

/** One flow's write on one input, as the gate, the release, Open and the sweep all run it. Nothing starts until `run` is called. */
export function flowCommit<I>(f: FlowDef<I>, sb: Sb, ctx: CoachChatContext, input: I, ledgerKey: string): { run: () => Promise<ActionReceipt>; readBack?: () => Promise<ActionReceipt | null> } {
  const requestId = () => flowRequestId(ctx.coach_id, ctx.team_id, ledgerKey);
  const completed = (r: FlowDone & { notifications?: ActionReceipt['notifications'] }): ActionReceipt => ({ status: 'completed', action: f.name, summary: r.summary, created: [{ kind: r.kind, count: 1, ...(r.href ? { href: r.href } : {}), ...(r.label ? { label: r.label } : {}) }], notifications: r.notifications ?? [], partial_failures: [], retryable: false, at: new Date().toISOString() });
  const landed = f.landed;
  return {
    run: async () => {
      const r = await f.run(ctx, input, { sb, requestId: requestId() });
      if (!r.ok) return { status: 'failed', action: f.name, summary: r.error ?? 'That didn’t go through. Nothing was saved.', created: [], notifications: [], partial_failures: [], error: r.error, retryable: true, at: new Date().toISOString() };
      return completed(r);
    },
    ...(landed
      ? {
          readBack: async () => {
            const { data, error } = await askTables(sb).from(landed.table).select('id').eq('id', requestId()).maybeSingle();
            return !error && data ? completed(landed.done(input)) : null;
          },
        }
      : {}),
  };
}

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const TIME = z.string().regex(/^\d{2}:\d{2}$/);
const fact = (label: string, value: string | number | null | undefined, optional = true): ProposalFact => (value == null || value === '' ? { label, value: 'Not set', ...(optional ? {} : { missing: true }) } : { label, value: String(value) });
const names = (ctx: CoachChatContext, ids: readonly string[]) => ids.map((id) => requireRosterPlayer(ctx, id).name);
/** A team zone offset for a local wall time, as the calendar's own action wants it. */
function offsetOn(date: string, time: string, zone: string): number {
  const at = new Date(`${date}T${time}:00Z`);
  const local = new Date(at.toLocaleString('en-US', { timeZone: zone }));
  const utc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }));
  return Math.round((local.getTime() - utc.getTime()) / 60000);
}

const eventInput = z.object({
  title: z.string().min(1).max(200),
  event_type: z.enum(['practice', 'tournament', 'qualifier', 'meeting', 'travel', 'other']),
  date: DATE,
  start: TIME.optional().describe('Required unless all_day.'),
  end: TIME.optional().describe('Required for a timed event unless it is a practice. A practice with no end said: leave this out, and the card shows the usual length for the coach to change. Never guess a length yourself.'),
  all_day: z.boolean().default(false),
  location: z.string().max(500).optional(),
  notes: z.string().max(5000).optional(),
  invite_player_ids: z.array(z.string().uuid()).default([]),
  requires_rsvp: z.boolean().default(false),
});
/** Production's practices run 150 minutes at the mode, 165 at the median (78 events, 2026-11-05). On the card, marked as assumed; the coach confirms it or changes it. */
export const USUAL_PRACTICE_MINUTES = 150;
/** The end a timed event is written with: the coach's, or a practice's usual length when that stays on the same day. Null means ask. */
export function eventEnd(i: { event_type: string; start?: string; end?: string; all_day?: boolean }): string | null {
  if (i.end) return i.end;
  if (i.all_day || i.event_type !== 'practice' || !i.start) return null;
  const [h, m] = i.start.split(':').map(Number) as [number, number];
  const total = h * 60 + m + USUAL_PRACTICE_MINUTES;
  if (total >= 24 * 60) return null;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
const eventDone = (i: z.infer<typeof eventInput>): FlowDone => ({ summary: `${i.title} is on the calendar.`, kind: 'event', label: i.title, href: '/golf/dashboard/calendar' });
const eventFlow: FlowDef<z.infer<typeof eventInput>> = {
  name: 'create_event',
  landed: { table: 'golf_events', done: eventDone },
  description: 'Add one event to the team calendar, including a single practice. Ask first for the type if two fit, for the start if timed and not given, for the end if timed and not a practice, and who is invited to a meeting. A practice with a start needs nothing else: do not ask how long, call this and the card shows the usual length. REQUIRES the coach to confirm.',
  input: eventInput,
  plan: (ctx, i) => {
    const end = eventEnd(i);
    if (!i.all_day && (!i.start || !end)) throw new ActionPlanError('A timed event needs a start and an end. Ask the coach.');
    if (!i.all_day && end! <= i.start!) throw new ActionPlanError('The end has to be after the start.');
    const who = names(ctx, i.invite_player_ids);
    return {
      visual: { kind: 'cal', date: i.date, start: i.all_day ? null : (i.start ?? null), end: i.all_day ? null : end, title: i.title, where: i.location ?? null, who: who.length ? `${who.length} players` : 'Not asked', rsvp: i.requires_rsvp },
      action: 'Add to calendar',
      summary: i.title,
      facts: [fact('When', i.all_day ? `${i.date}, all day` : `${i.date}, ${i.start} to ${end}`, false), ...(!i.all_day && !i.end ? [{ label: 'Length', value: `${USUAL_PRACTICE_MINUTES / 60} hours`, source: 'The usual practice. Tell me if it should end earlier or later.' }] : []), fact('Type', i.event_type, false), fact('Where', i.location), fact('Invited', who.length ? who.join(', ') : null), fact('Replies', i.requires_rsvp ? 'Asked for' : 'Not asked for')],
      notifications: i.requires_rsvp && who.length ? [`${who.length} players get a bell, email and push once Undo closes.`] : ['Nobody is told.'],
      key: ['event', i.title, i.date, i.start ?? '', end ?? '', i.invite_player_ids.join(',')],
    };
  },
  run: async (ctx, i, { requestId }) => {
    const res = await createGolfEvent({ requestId, title: i.title, eventType: i.event_type, startDate: i.date, startTime: i.all_day ? undefined : i.start, endTime: i.all_day ? undefined : (eventEnd(i) ?? undefined), allDay: i.all_day, timezoneOffset: -offsetOn(i.date, i.start ?? '12:00', ctx.timezone), location: i.location, description: i.notes, requiresRsvp: i.requires_rsvp, attendeeIds: i.invite_player_ids });
    return { ok: res.success, error: res.success ? undefined : res.error, ...eventDone(i) };
  },
};

const tripInput = z.object({ event_name: z.string().min(1).max(200), destination: z.string().min(1).max(200), transportation_type: z.enum(['bus', 'van', 'flight', 'carpool']), departure_date: DATE, departure_time: TIME.optional(), departure_location: z.string().max(500).optional(), return_date: DATE.optional(), return_time: TIME.optional(), flight_info: z.string().max(1000).optional(), hotel_name: z.string().max(200).optional(), hotel_address: z.string().max(500).optional(), hotel_phone: z.string().max(50).optional(), hotel_confirmation: z.string().max(100).optional(), room_assignments: z.string().max(2000).optional(), uniform_requirements: z.string().max(1000).optional(), gear_list: z.array(z.string().max(200).regex(/^[^,]*$/, 'One item, no comma')).max(50).optional(), notes: z.string().max(5000).optional() });
const tripFlow: FlowDef<z.infer<typeof tripInput>> = {
  name: 'create_trip',
  description: 'Add a trip. Ask for transport and a firm leave date if not said. REQUIRES the coach to confirm.',
  input: tripInput,
  plan: (_ctx, i) => {
    if (i.return_date && i.return_date < i.departure_date) throw new ActionPlanError('The return is before the leave date. Ask the coach.');
    return {
      action: 'Add the trip',
      summary: `${i.event_name} · ${i.destination}`,
      facts: [fact('Leaves', [i.departure_date, i.departure_time].filter(Boolean).join(' '), false), fact('How', i.transportation_type, false), fact('From', i.departure_location), fact('Back', [i.return_date, i.return_time].filter(Boolean).join(' ')), fact('Hotel', i.hotel_name), fact('Rooms', i.room_assignments), fact('Uniform', i.uniform_requirements), fact('Gear', i.gear_list?.join(', '))],
      notifications: [i.hotel_confirmation ? 'Nobody is told. Every team member can read the hotel confirmation number.' : 'Nobody is told. Players see it as new travel.'],
      key: ['trip', i.event_name, i.departure_date, i.destination],
    };
  },
  run: async (ctx, i) => {
    const res = (await createGolfTravelItinerary({ team_id: ctx.team_id, event_name: i.event_name, destination: i.destination, transportation_type: i.transportation_type, departure_date: i.departure_date, departure_time: i.departure_time, departure_location: i.departure_location, return_date: i.return_date, return_time: i.return_time, flight_info: i.flight_info, hotel_name: i.hotel_name, hotel_address: i.hotel_address, hotel_phone: i.hotel_phone, hotel_confirmation: i.hotel_confirmation, room_assignments: i.room_assignments, uniform_requirements: i.uniform_requirements, gear_list: i.gear_list?.join(', '), notes: i.notes })) as { success: boolean; error?: string };
    return { ok: res.success, error: res.error, summary: `The trip to ${i.destination} is added.`, kind: 'trip', label: i.event_name, href: '/golf/dashboard/travel' };
  },
};

const qualifierInput = z.object({ name: z.string().min(1).max(200), description: z.string().max(2000).optional(), start_date: DATE, end_date: DATE.optional(), num_rounds: z.number().int().min(1).max(50).describe('Ask if not said; never default to 1.'), selection_slots_total: z.number().int().min(1).max(12).describe('Ask if not said.'), selection_slots_coach_pick: z.number().int().min(0).max(12).describe('Ask if not said.'), player_ids: z.array(z.string().uuid()).min(1), rules: z.string().max(5000).optional(), entry_deadline: DATE.optional() });
const qualifierFlow: FlowDef<z.infer<typeof qualifierInput>> = {
  name: 'create_qualifier',
  description: 'Set a qualifier. Ask for rounds, squad size and coach picks if not said; there is no exemption field or tie rule to ask about. REQUIRES the coach to confirm.',
  input: qualifierInput,
  plan: (ctx, i) => {
    if (i.selection_slots_coach_pick > i.selection_slots_total) throw new ActionPlanError('Coach picks can’t be more than the squad.');
    const who = names(ctx, i.player_ids);
    return {
      visual: { kind: 'qual', title: i.name, rounds: i.num_rounds, start: i.start_date, total: i.selection_slots_total, picks: i.selection_slots_coach_pick, field: who.length, deadline: null },
      action: 'Set qualifier',
      summary: i.name,
      facts: [fact('Starts', i.start_date, false), fact('Rounds', i.num_rounds, false), fact('Squad', `${i.selection_slots_total}, coach picks ${i.selection_slots_coach_pick}`, false), fact('Players', who.join(', '), false), fact('Rules', i.rules)],
      notifications: [`${who.length} players get a push and an email once Undo closes.`],
      key: ['qualifier', i.name, i.start_date, i.player_ids.join(',')],
    };
  },
  run: async (_ctx, i) => {
    const res = (await createGolfQualifier({ name: i.name, description: i.description, startDate: i.start_date, endDate: i.end_date, numRounds: i.num_rounds, selectionSlotsTotal: i.selection_slots_total, selectionSlotsCoachPick: i.selection_slots_coach_pick, playerIds: i.player_ids, rules: i.rules, entryDeadline: i.entry_deadline })) as { success: boolean; error?: string };
    return { ok: res.success, error: res.error, summary: `${i.name} is set.`, kind: 'qualifier', label: i.name, href: '/golf/dashboard/qualifiers' };
  },
};

const GOAL_STATS = ['sg_total', 'sg_ott', 'sg_approach', 'sg_around_green', 'sg_putting', 'gir_pct', 'scrambling_pct_sand', 'penalty_rate_per_round'] as const;
const goalInput = z.object({ player_id: z.string().uuid(), metric_id: z.enum(GOAL_STATS), label: z.string().max(60), window_days: z.number().int().min(7).max(365), target_value: z.number(), mode: z.enum(['mandatory', 'suggested']) });
const goalFlow: FlowDef<z.infer<typeof goalInput>> = {
  name: 'create_goal',
  description: 'Give a player a goal on one of eight stats. Ask if the stat is ambiguous, for by-when, and whether it is assigned or suggested. REQUIRES the coach to confirm.',
  input: goalInput,
  plan: (ctx, i) => {
    const p = requireRosterPlayer(ctx, i.player_id);
    return { action: 'Set goal', summary: `${i.label}, ${i.window_days}-day goal for ${p.name}`, facts: [fact('Player', p.name, false), fact('Target', i.target_value, false), fact('By', `${i.window_days} days`, false), fact('How', i.mode === 'mandatory' ? 'Assigned' : 'Suggested', false)], notifications: [`${p.name} gets a push once Undo closes.`], key: ['goal', p.id, i.metric_id, i.target_value, i.window_days] };
  },
  run: async (ctx, i) => {
    const res = (await createGoal({ team_id: ctx.team_id, player_id_if_coach_creating: i.player_id, metric_id: i.metric_id, title: `${i.label}, ${i.window_days}-day goal`, category: 'manual', ends_at: new Date(Date.now() + i.window_days * 86_400_000).toISOString(), target_value: i.target_value, target_source: 'manual', baseline_value: null, coach_assignment_mode: i.mode })) as { ok?: boolean; success?: boolean; error?: string };
    return { ok: !!(res.ok ?? res.success), error: res.error, summary: `The goal is set for ${requireRosterPlayer(ctx, i.player_id).name}.`, kind: 'goal' };
  },
};

const NOTE_MAX = 2000;
const noteInput = z.object({ round_id: z.string().uuid(), player_id: z.string().uuid(), note: z.string().min(1).max(NOTE_MAX) });
/** `existing` is what the card shows, read from the round before Confirm; the write reads it again. The model never supplies it. */
type NoteInput = z.infer<typeof noteInput> & { existing?: string };

/** The note already on the round. `saveRoundCoachNote` replaces the column, so nothing appends without this. */
async function roundNote(sb: Sb, roundId: string): Promise<string | null> {
  const { data, error } = await sb.from('golf_round_reviews').select('coach_notes').eq('round_id', roundId).maybeSingle();
  if (error) return null;
  return (data?.coach_notes ?? '').trim();
}

/** Below what was there, whole. A retry that finds its own words already at the end writes nothing; too long is refused, never cut. */
export function appendedNote(current: string, note: string): { kind: 'write'; text: string } | { kind: 'already' } | { kind: 'too_long' } {
  const words = note.trim();
  if (current && (current === words || current.endsWith(`\n\n${words}`))) return { kind: 'already' };
  const text = current ? `${current}\n\n${words}` : words;
  return text.length > NOTE_MAX ? { kind: 'too_long' } : { kind: 'write', text };
}

const NOTE_TOO_LONG = `With the earlier note this passes ${NOTE_MAX} characters. Nothing was changed; shorten the new note.`;
const noteFlow: FlowDef<NoteInput> = {
  name: 'add_round_note',
  description: 'Add a coach note to a round, under any earlier note, which stays. The player always sees it. REQUIRES the coach to confirm.',
  input: noteInput,
  prepare: async (sb, _ctx, i) => {
    const existing = await roundNote(sb, i.round_id);
    if (existing === null) throw new ActionPlanError('Could not read the note already on this round.');
    return { ...i, existing };
  },
  plan: (ctx, i) => {
    const p = requireRosterPlayer(ctx, i.player_id);
    if (i.existing && appendedNote(i.existing, i.note).kind === 'too_long') throw new ActionPlanError(NOTE_TOO_LONG);
    return { action: 'Add note', summary: `A note on ${p.name}’s round`, facts: [...(i.existing ? [fact('Earlier note', i.existing)] : []), fact('Adding', i.note, false)], notifications: [`${p.name} will see this note, once Undo closes.`], key: ['note', i.round_id, i.note] };
  },
  run: async (_ctx, i, { sb }) => {
    const done = { summary: 'The note is on the round.', kind: 'note' };
    const current = await roundNote(sb, i.round_id);
    if (current === null) return { ok: false, error: 'Could not read the note already on this round. Nothing was changed.', ...done };
    const next = appendedNote(current, i.note);
    if (next.kind === 'already') return { ok: true, ...done };
    if (next.kind === 'too_long') return { ok: false, error: NOTE_TOO_LONG, ...done };
    const res = await saveRoundCoachNote(i.round_id, next.text);
    return { ok: res.success, error: res.success ? undefined : res.error, ...done };
  },
};

const lineupInput = z.object({ tournament_id: z.string().uuid(), version: z.number().int(), entries: z.array(z.object({ player_id: z.string().uuid(), role: z.enum(['lineup', 'alternate', 'individual']), slot: z.number().int().min(1).max(9).nullable(), reasoning: z.string().max(500).optional() })).min(1).max(20) });
export const lineupFlow: FlowDef<z.infer<typeof lineupInput>> = {
  name: 'set_lineup',
  description: 'Set a tournament lineup. A tie for the last spot always waits for the coach. Locking is a separate step. REQUIRES the coach to confirm.',
  input: lineupInput,
  plan: (ctx, i) => {
    const rows = i.entries.map((e) => `${e.slot ?? '—'} ${requireRosterPlayer(ctx, e.player_id).name} (${e.role})`);
    return { action: 'Set lineup', summary: 'Tournament lineup', facts: [fact('Lineup', rows.join(', '), false)], notifications: ['Nobody is told.'], key: ['lineup', i.tournament_id, i.version, rows.join(',')] };
  },
  run: async (_ctx, i) => {
    const res = (await setTournamentEntries(i.tournament_id, i.entries.map((e) => ({ playerId: e.player_id, role: e.role, slot: e.slot, reasoning: e.reasoning })), i.version)) as { ok?: boolean; success?: boolean; error?: string };
    return { ok: !!(res.ok ?? res.success), error: res.error, summary: 'Lineup set.', kind: 'lineup', href: `/golf/dashboard/tournaments/${i.tournament_id}` };
  },
};
const lockInput = z.object({ tournament_id: z.string().uuid() });

/** The coach's own `set_lineup` for this tournament still in its hold or running. Locking now would lock the old entries, and the new ones would then land on a locked lineup. */
async function lineupStillLanding(sb: Sb, ctx: CoachChatContext, tournamentId: string): Promise<boolean | null> {
  const fresh = new Date(Date.now() - APPROVED_RUN_TTL_MS).toISOString();
  const { data, error } = await askTables(sb).from('golf_coachhelm_action_runs').select('id').eq('coach_id', ctx.coach_id).eq('tool_name', 'set_lineup').eq('proposed_input->>tournament_id', tournamentId).or(`status.eq.held,and(status.eq.approved,decided_at.gt.${fresh})`).limit(1);
  if (error) return null;
  return (data ?? []).length > 0;
}

export const lockFlow: FlowDef<z.infer<typeof lockInput>> = {
  name: 'lock_lineup',
  description: 'Lock a lineup that is set. It locks the moment the coach presses and cannot be undone. REQUIRES the coach to confirm.',
  input: lockInput,
  immediate: true,
  plan: (_ctx, i) => ({ action: 'Lock the lineup', summary: 'This locks at once and can’t be undone.', facts: [fact('Tournament', 'As set', false)], notifications: ['Substitutions only work if the event allows them.'], key: ['lock', i.tournament_id] }),
  run: async (ctx, i, { sb }) => {
    const landing = await lineupStillLanding(sb, ctx, i.tournament_id);
    if (landing !== false) return { ok: false, error: landing === null ? 'Could not check the lineup. It isn’t locked; try again.' : 'The lineup is still going through. It isn’t locked; lock it once it lands.', summary: 'Lineup locked.', kind: 'lineup' };
    const res = (await lockTournamentLineup(i.tournament_id)) as { ok?: boolean; success?: boolean; error?: string };
    return { ok: !!(res.ok ?? res.success), error: res.error, summary: 'Lineup locked.', kind: 'lineup' };
  },
};

/** The quiet flows: nobody is told. */
const blockInput = z.object({ title: z.string().min(1).max(200), date: DATE, end_date: DATE.optional(), start: TIME.optional(), end: TIME.optional() });
const blockDone = (): FlowDone => ({ summary: 'That time is blocked.', kind: 'blocked_time', href: '/golf/dashboard/calendar' });
const blockFlow: FlowDef<z.infer<typeof blockInput>> = {
  name: 'add_blocked_time',
  landed: { table: 'golf_coach_blocked_time', done: blockDone },
  description: 'Block off the coach’s own time. Players never see it. REQUIRES the coach to confirm.',
  input: blockInput,
  plan: (_c, i) => {
    if (i.end_date && i.end_date < i.date) throw new ActionPlanError('The end date is before the start.');
    if (i.start && i.end && i.end <= i.start) throw new ActionPlanError('The end has to be after the start.');
    return { action: 'Block time', summary: i.title, facts: [fact('When', [i.date, i.start && i.end ? `${i.start} to ${i.end}` : 'all day'].join(', '), false)], notifications: ['Nobody is told. Only you see it.'], key: ['block', i.title, i.date, i.start ?? ''] };
  },
  run: async (_c, i, { requestId }) => {
    const res = (await addCoachBlockedTime({ requestId, title: i.title, startDate: i.date, endDate: i.end_date ?? i.date, startTime: i.start, endTime: i.end, allDay: !i.start })) as { success: boolean; error?: string };
    return { ok: res.success, error: res.error, ...blockDone() };
  },
};
const breakInput = z.object({ first_day: DATE, last_day: DATE, label: z.string().max(60) });
const breakFlow: FlowDef<z.infer<typeof breakInput>> = {
  name: 'add_team_break',
  description: 'A team break from class, 21 days at most. REQUIRES the coach to confirm.',
  input: breakInput,
  plan: (_c, i) => {
    const days = (Date.parse(i.last_day) - Date.parse(i.first_day)) / 86_400_000;
    if (days < 0 || days > 20) throw new ActionPlanError('A break is one to 21 days. Ask the coach to split a longer one.');
    return { action: 'Add break', summary: i.label, facts: [fact('Dates', `${i.first_day} to ${i.last_day}`, false)], notifications: ['Nobody is told.'], key: ['break', i.first_day, i.last_day] };
  },
  run: async (ctx, i) => {
    const res = (await addTeamBreak({ teamId: ctx.team_id, startsOn: i.first_day, endsOn: i.last_day, label: i.label })) as { success?: boolean; ok?: boolean; error?: string };
    return { ok: !!(res.success ?? res.ok), error: res.error, summary: `${i.label} is on the calendar.`, kind: 'break' };
  },
};
const termInput = z.object({ name: z.string().min(1).max(40), classes_start: DATE, classes_end: DATE, exams_end: DATE });
const termFlow: FlowDef<z.infer<typeof termInput>> = {
  name: 'save_team_term',
  description: 'Save a term. Ask for any date not given; never infer from a school calendar. REQUIRES the coach to confirm.',
  input: termInput,
  plan: (_c, i) => ({ action: 'Save term', summary: i.name, facts: [fact('Classes', `${i.classes_start} to ${i.classes_end}`, false), fact('Exams end', i.exams_end, false)], notifications: ['Nobody is told.'], key: ['term', i.name, i.classes_start] }),
  run: async (ctx, i) => {
    const res = (await saveTeamTerm({ teamId: ctx.team_id, label: i.name, classesStart: i.classes_start, classesEnd: i.classes_end, examsEnd: i.exams_end, timeZone: ctx.timezone })) as { success?: boolean; ok?: boolean; error?: string };
    return { ok: !!(res.success ?? res.ok), error: res.error, summary: `${i.name} is saved.`, kind: 'term' };
  },
};
const availInput = z.object({ player_id: z.string().uuid(), note: z.string().min(1).max(280), existing: z.string().max(280).optional() });
const availFlow: FlowDef<z.infer<typeof availInput>> = {
  name: 'set_availability_note',
  description: 'A coach-only note on a player’s availability; it replaces any earlier note. REQUIRES the coach to confirm.',
  input: availInput,
  plan: (ctx, i) => {
    const p = requireRosterPlayer(ctx, i.player_id);
    return { action: 'Save note', summary: `Availability note for ${p.name}`, facts: [...(i.existing ? [fact('Replaces', i.existing)] : []), fact('Note', i.note, false)], notifications: ['Nobody is told. Only coaches see it.'], key: ['avail', p.id, i.note] };
  },
  run: async (_ctx, i) => {
    const res = (await setPlayerAvailabilityCoachNote({ playerId: i.player_id, note: i.note })) as { success?: boolean; ok?: boolean; error?: string };
    return { ok: !!(res.success ?? res.ok), error: res.error, summary: 'The note is saved.', kind: 'note' };
  },
};
const recruitInput = z.object({ first_name: z.string().min(1).max(120), last_name: z.string().max(120).optional(), grad_year: z.number().int().min(2020).max(2040).optional(), email: z.string().email().max(254).optional(), phone: z.string().max(40).optional(), hometown: z.string().max(120).optional(), state: z.string().length(2).optional(), notes: z.string().max(5000).optional(), status: z.enum(['recruiting', 'watched', 'offered', 'committed']).default('recruiting') });
const recruitDone = (): FlowDone => ({ summary: 'The recruit is added.', kind: 'recruit', href: '/golf/dashboard/recruiting' });
const recruitFlow: FlowDef<z.infer<typeof recruitInput>> = {
  name: 'create_recruit',
  landed: { table: 'golf_recruits', done: recruitDone },
  description: 'Add a recruit. Ask for a grad year if a grade was given. Coach only. REQUIRES the coach to confirm.',
  input: recruitInput,
  plan: (_c, i) => ({ action: 'Add recruit', summary: [i.first_name, i.last_name].filter(Boolean).join(' '), facts: [fact('Grad year', i.grad_year), fact('Status', i.status, false), fact('Hometown', [i.hometown, i.state].filter(Boolean).join(', '))], notifications: ['Nobody is told. Only coaches see it.'], key: ['recruit', i.first_name, i.last_name ?? '', i.grad_year ?? ''] }),
  run: async (_c, i, { requestId }) => {
    const res = (await createRecruit({ first_name: i.first_name, last_name: i.last_name, hs_class: i.grad_year, email: i.email, phone: i.phone, hometown: i.hometown, state: i.state, notes: i.notes, status: i.status }, { requestId })) as { success?: boolean; ok?: boolean; error?: string };
    return { ok: !!(res.success ?? res.ok), error: res.error, ...recruitDone() };
  },
};

const messageInput = z.object({
  conversation_id: z.string().uuid().describe('From find_thread, only when exactly one thread matched.'),
  thread: z.string().min(1).max(120),
  member_count: z.number().int().min(1),
  last_message: z.string().max(500).optional(),
  content: z.string().min(1).max(2000),
});
const messageFlow: FlowDef<z.infer<typeof messageInput>> = {
  name: 'send_message',
  description: 'Draft a message to one thread the coach is in, found with find_thread. It sends only after the coach presses Send and an 8 second Undo. REQUIRES the coach to confirm.',
  input: messageInput,
  plan: (_ctx, i) => ({
    visual: { kind: 'msg', conversationId: i.conversation_id, thread: i.thread, count: i.member_count, last: i.last_message ?? null, draft: i.content },
    action: `Send to ${i.member_count} ${i.member_count === 1 ? 'player' : 'players'}`,
    summary: i.thread,
    facts: [fact('Thread', i.thread, false), fact('Message', i.content, false)],
    notifications: [`Sends as you to ${i.member_count} ${i.member_count === 1 ? 'player' : 'players'} in ${i.thread}, after an 8 second Undo.`],
    key: ['message', i.conversation_id, i.content],
  }),
  run: async (_ctx, i) => {
    // The client id is the hash of what's being sent, so a second release hits the 23505 path and returns the first message.
    const res = await sendGolfMessage(i.conversation_id, i.content, stableMessageId(i.conversation_id, i.content));
    return { ok: !!res?.success, error: res?.success ? undefined : 'That didn’t send. Nothing was delivered.', summary: `Sent to ${i.thread}.`, kind: 'message', label: i.thread, href: `/golf/dashboard/messages?conversation=${i.conversation_id}` };
  },
};

function stableMessageId(conversationId: string, content: string): string {
  return stableUuid(`${conversationId}:${content}`);
}

/** A v4-shaped id from a seed: the same seed, the same id. */
function stableUuid(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const CREATE_FLOWS: ReadonlyArray<FlowDef<never>> = [messageFlow, eventFlow, tripFlow, qualifierFlow, goalFlow, noteFlow, blockFlow, breakFlow, termFlow, availFlow, recruitFlow] as unknown as ReadonlyArray<FlowDef<never>>;
export const LINEUP_FLOWS: ReadonlyArray<FlowDef<never>> = [lineupFlow, lockFlow] as unknown as ReadonlyArray<FlowDef<never>>;
export const CREATE_TOOL_NAMES: readonly string[] = [...CREATE_FLOWS, ...LINEUP_FLOWS].map((f) => f.name);

/** Boards and polls never write: the coach presses Send in Messages. Their result is a hand-off the browser turns into a prefill. */
export const DraftBoardInput = z.object({ player_id: z.string().uuid(), note: z.string().max(2000).optional() });
