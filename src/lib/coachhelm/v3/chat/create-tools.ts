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
import { createTeamDrill } from '@/app/golf/actions/practice-library';
import { saveTextDocument } from '@/app/golf/actions/documents';
import { POLL_MAX_OPTIONS, POLL_MIN_OPTIONS, POLL_OPTION_MAX, POLL_QUESTION_MAX } from '@/lib/golf/message-polls';
import type { CoachChatContext } from './context';
import { requireRosterPlayer } from './context';
import { askTables } from './ask-db';
import { APPROVED_RUN_TTL_MS } from './action-runs';
import { ActionPlanError } from './action-planners';
import type { ActionProposal, ActionReceipt, CardDelivery, CardNotReached, CardPerson, CardUndo, CardVisibility, ProposalFact, ReceiptMissed } from './action-types';
import {
  affectsOf,
  availabilityNoteNow,
  eventInviteDelivery,
  goalDelivery,
  goalTitleOf,
  nameList,
  peopleChanged,
  plural,
  qualifierDelivery,
  reachOf,
  roundLine,
  seatLine,
  seatsKey,
  seenGoalBase,
  seenPlayers,
  seenRound,
  seenThread,
  seenTournament,
  sortSeats,
  threadKey,
  threadReach,
  tournamentDates,
  type SeatRole,
} from './card-truth';

type Sb = SupabaseClient<Database>;

/** One attempt at a flow's write. `requestId` is the same for every retry of the same card, so a retry finds the row instead of writing a second. */
export interface FlowAttempt {
  sb: Sb;
  requestId: string;
}

/** What a flow's receipt says once its row exists. */
export interface FlowDone {
  summary: string;
  kind: string;
  label?: string;
  href?: string;
  /** The row that was written, when the app's action says which (`ActionReceipt.created[].id`). */
  id?: string;
}

/**
 * What a flow's `plan` puts on the card. Everything here is resolved by the server: `recipients` from the roster and
 * the accounts table, `delivery` from the code that sends, `visible_to` from the table's own access rule.
 */
export interface FlowCard {
  visual?: ActionProposal['visual'];
  publish?: ActionProposal['publish'];
  facts: ProposalFact[];
  action: string;
  summary: string;
  notifications: string[];
  affects?: ActionProposal['affects'];
  key: Array<string | number>;
  recipients?: CardPerson[];
  not_reached?: CardNotReached[];
  delivery?: CardDelivery | null;
  visible_to?: CardVisibility;
  visible_note?: string;
  undo?: CardUndo;
  impact?: string;
}

/** What a flow's write answers with. `notifications` and `missed` say what really went out and who it did not reach. */
export interface FlowResult extends FlowDone {
  ok: boolean;
  error?: string;
  notifications?: ActionReceipt['notifications'];
  missed?: ReceiptMissed[];
  /** A write that landed but not in full: the receipt is `partial` and lists these. */
  partial?: string[];
}

/** A flow's finished row as the receipt lists it. */
export const createdOf = (d: FlowDone): ActionReceipt['created'] => [{ kind: d.kind, count: 1, ...(d.href ? { href: d.href } : {}), ...(d.label ? { label: d.label } : {}), ...(d.id ? { id: d.id, ids: [d.id] } : {}) }];

/**
 * Ask v2's create flows (TASK_FIELDS §5). One tool per flow, each on the same gate as today's four writes: `plan` runs before Confirm and writes nothing;
 * `run` runs after the 8 second hold. Every value written is on the card. A required field the coach didn't give is a question the model asks first, never a guess.
 */
export interface FlowDef<I> {
  name: string;
  description: string;
  input: z.ZodType<I>;
  plan: (ctx: CoachChatContext, input: I) => FlowCard;
  run: (ctx: CoachChatContext, input: I, attempt: FlowAttempt) => Promise<FlowResult>;
  /**
   * The keys of `input` a coach may change on the card before confirming (`ActionProposal.editable`). Each one's type
   * and limits come from `input` itself. Never the thing the card is about (a tournament, a round, a thread, a plan,
   * the player a goal or note belongs to). Left out: nothing is editable in place.
   */
  editable?: readonly string[];
  /** The card's own label for an editable key, where it is not the key in words. */
  editLabels?: Record<string, string>;
  /**
   * The stored input's schema, when `prepare` adds what the server read (`seen`). `commit` parses the stored input with
   * it, so what the coach was shown comes back with the card. Left out, `input` is used. The model never sees this one.
   */
  stored?: z.ZodType<I>;
  /**
   * At commit, before any write: is the card still true? Reads the world again with the session client and answers
   * null, or the sentence the coach reads (it must say that nothing was saved or sent). Nothing is written when it answers.
   * It throws when the check itself could not be made: that is not the same as stale, and the receipt says so.
   */
  stale?: (sb: Sb, ctx: CoachChatContext, input: I) => Promise<string | null>;
  /** Writes the moment the coach presses, with no hold and no Undo (02-PLAN §14.4, 08-ACCEPTANCE: Lock is its own card with no Undo). */
  immediate?: boolean;
  /** Reads what the card has to show before Confirm (a round's note). Nothing the model said stands in for it. */
  prepare?: (sb: Sb, ctx: CoachChatContext, input: I) => Promise<I>;
  /**
   * For a flow whose action takes no request id: is the row this card writes there, made since the card was planned? True: yes. False: looked, and no.
   * Null: could not look. Used before a write (a retry of the same card finds the first attempt's row) and after a failed one (so "nothing was saved" is checked, not assumed).
   */
  written?: (sb: Sb, ctx: CoachChatContext, input: I, at: { since: string; requestId: string }) => Promise<boolean | null>;
  /** What the receipt says when `written` finds the row. */
  done?: (ctx: CoachChatContext, input: I) => FlowDone;
  /** The table whose row id is `requestId`: an action that failed after that row exists is recorded as done, never offered again. */
  landed?: { table: 'golf_events' | 'golf_coach_blocked_time' | 'golf_recruits' | 'golf_team_drills' | 'golf_class_exceptions' | 'golf_team_terms'; done: (input: I) => FlowDone };
}

/** The same request id for every retry of one card: the coach's own scoped ledger key, hashed, so two cards that differ anywhere are two rows. Two coaches' same-looking events never collide. */
export function flowRequestId(coachId: string, teamId: string, key: string): string {
  // The team is in the id: the same card on a coach's second team is a second row, not a replay of the first.
  return stableUuid(`${coachId}:${teamId}:${key}`);
}

/** One flow's write on one input, as the gate, the release, Open and the sweep all run it. Nothing starts until `run` is called. */
export function flowCommit<I>(f: FlowDef<I>, sb: Sb, ctx: CoachChatContext, input: I, ledgerKey: string): { run: () => Promise<ActionReceipt>; readBack?: () => Promise<ActionReceipt | null> } {
  const requestId = () => flowRequestId(ctx.coach_id, ctx.team_id, ledgerKey);
  const completed = (r: FlowDone & { notifications?: ActionReceipt['notifications'] }): ActionReceipt => ({ status: 'completed', action: f.name, summary: r.summary, created: createdOf(r), notifications: r.notifications ?? [], partial_failures: [], retryable: false, at: new Date().toISOString() });
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


/** One row matching `match` made at or after `since`? Null when the look itself failed: that is not a no. */
export async function rowSince(sb: Sb, table: string, match: Record<string, string | number>, since: string | null, stamp = 'created_at'): Promise<boolean | null> {
  let q = askTables(sb).from(table).select('id').match(match);
  if (since) q = q.gte(stamp, since);
  const { data, error } = await q.limit(1);
  if (error) return null;
  return (data ?? []).length > 0;
}

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const TIME = z.string().regex(/^\d{2}:\d{2}$/);
const fact = (label: string, value: string | number | null | undefined, optional = true): ProposalFact => (value == null || value === '' ? { label, value: 'Not set', ...(optional ? {} : { missing: true }) } : { label, value: String(value) });
/** A stored card that does not hold what the server read for it: one made before cards carried that (11 Nov 2026). It cannot be checked, so it is not run. */
export class CardFromBefore extends ActionPlanError {}
/** What `prepare` stores beside the model's input: the roster players the card names, each with whether they can be told. */
const SeenPeople = z.array(z.object({ id: z.string(), name: z.string(), account: z.boolean() }));
type SeenPeople = z.infer<typeof SeenPeople>;
/** `prepare` always runs before `plan`; a stored card without what it read is not a card. */
function seenOf<T>(seen: T | undefined): T {
  if (seen === undefined) throw new CardFromBefore('That could not be prepared.');
  return seen;
}
const cannotLine = (out: readonly CardNotReached[]): ProposalFact[] => (out.length ? [{ label: 'Will not get it', value: `${nameList(out.map((p) => p.name))} (${out[0]!.reason})` }] : []);
/** What a send's receipt says went out: queued, because the app's actions hand notifications off after they answer. */
const queuedTo = (channels: readonly string[], to: readonly CardPerson[]): ActionReceipt['notifications'] => (to.length ? channels.map((channel) => ({ channel, recipients: to.length, status: 'queued' as const, to: to.map((p) => p.name) })) : []);
const missedOf = (out: readonly CardNotReached[]): ReceiptMissed[] => out.map((p) => ({ name: p.name, reason: p.reason }));
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
  end: TIME.optional().describe('Leave out for a practice with no end given.'),
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
type EventStored = z.infer<typeof eventInput> & { seen?: { people: SeenPeople } };
const eventDone = (i: z.infer<typeof eventInput>): FlowDone => ({ summary: `${i.title} is on the calendar.`, kind: 'event', label: i.title, href: `/golf/dashboard/calendar?date=${i.date}` });
const eventFlow: FlowDef<EventStored> = {
  name: 'create_event',
  editable: ['title', 'event_type', 'date', 'start', 'end', 'location', 'notes', 'invite_player_ids', 'requires_rsvp'],
  editLabels: { event_type: 'Type', date: 'When', start: 'Starts', end: 'Ends', location: 'Where', notes: 'Notes', invite_player_ids: 'Invited', requires_rsvp: 'Replies' },
  landed: { table: 'golf_events', done: eventDone },
  description: 'Add one event to the team calendar, including a single practice. Ask for the type if two fit, the start if timed, the end if timed and not a practice, and who is invited to a meeting. A practice needs only its start: the card shows the usual length.',
  input: eventInput,
  stored: eventInput.extend({ seen: z.object({ people: SeenPeople }).optional() }),
  prepare: async (sb, ctx, i) => ({ ...i, seen: { people: await seenPlayers(sb, ctx, i.invite_player_ids) } }),
  stale: (sb, ctx, i) => peopleChanged(sb, ctx, seenOf(i.seen).people, 'Nothing was saved.'),
  plan: (ctx, i) => {
    const end = eventEnd(i);
    if (!i.all_day && (!i.start || !end)) throw new ActionPlanError('A timed event needs a start and an end. Ask the coach.');
    if (!i.all_day && end! <= i.start!) throw new ActionPlanError('The end has to be after the start.');
    const people = seenOf(i.seen).people;
    // Only an event that asks for replies tells anyone (owner, 2026-10-08), and only invited players with an account.
    const { recipients, not_reached } = reachOf(people, i.requires_rsvp);
    const delivery = recipients.length ? eventInviteDelivery({ title: i.title, date: i.date, location: i.location ?? null }) : null;
    return {
      visual: { kind: 'cal', date: i.date, start: i.all_day ? null : (i.start ?? null), end: i.all_day ? null : end, title: i.title, where: i.location ?? null, who: people.length ? plural(people.length, 'player') : 'Not asked', rsvp: i.requires_rsvp },
      action: 'Add to calendar',
      summary: i.title,
      facts: [
        fact('When', i.all_day ? `${i.date}, all day` : `${i.date}, ${i.start} to ${end}`, false),
        ...(!i.all_day && !i.end ? [{ label: 'Length', value: `${USUAL_PRACTICE_MINUTES / 60} hours`, source: 'The usual practice. Tell me if it should end earlier or later.' }] : []),
        fact('Type', i.event_type, false),
        fact('Where', i.location),
        fact('Invited', people.length ? nameList(people.map((p) => p.name)) : null),
        fact('Replies', i.requires_rsvp ? 'Asked for' : 'Not asked for'),
        ...(i.notes ? [fact('Notes', i.notes)] : []),
        ...cannotLine(not_reached),
      ],
      notifications: delivery ? [`${plural(recipients.length, 'player')} ${recipients.length === 1 ? 'gets' : 'get'} a push, a bell row and an email once Undo closes: “${delivery.title}”, “${delivery.body}”.`] : ['Nobody is told.'],
      affects: affectsOf(people),
      recipients,
      not_reached,
      delivery,
      // golf_events_select_team: a player reads a meeting only when invited to it; every other kind of event is the whole team's.
      visible_to: i.event_type === 'meeting' ? 'recipients' : 'team',
      visible_note: i.event_type !== 'meeting' ? `On the team calendar: every player and coach on ${ctx.team_name} can see it.` : people.length ? 'A meeting is on the calendar only for the players invited to it and this team’s coaches.' : 'Nobody is invited, so only this team’s coaches see this meeting.',
      key: ['event', i.title, i.date, i.start ?? '', end ?? '', i.invite_player_ids.join(',')],
    };
  },
  run: async (ctx, i, { requestId }) => {
    const res = await createGolfEvent({ requestId, title: i.title, eventType: i.event_type, startDate: i.date, startTime: i.all_day ? undefined : i.start, endTime: i.all_day ? undefined : (eventEnd(i) ?? undefined), allDay: i.all_day, timezoneOffset: -offsetOn(i.date, i.start ?? '12:00', ctx.timezone), location: i.location, description: i.notes, requiresRsvp: i.requires_rsvp, attendeeIds: i.invite_player_ids });
    if (!res.success) return { ok: false, error: res.error, ...eventDone(i) };
    const { recipients, not_reached } = reachOf(i.seen?.people ?? [], i.requires_rsvp);
    // The event is saved either way; when the invitations failed nobody was invited or told, and the receipt says so by name.
    const invitesFailed = Boolean((res.data as { invitationsError?: string } | undefined)?.invitationsError);
    if (invitesFailed) return { ok: true, ...eventDone(i), summary: `${i.title} is on the calendar, but the invitations did not go out.`, partial: ['The invitations did not go out: nobody was invited or told. Invite them from the event in the Calendar.'], missed: [...recipients.map((p) => ({ name: p.name, reason: 'the invitation failed' })), ...missedOf(not_reached)] };
    return { ok: true, ...eventDone(i), notifications: queuedTo(['push', 'in_app', 'email'], recipients), missed: missedOf(not_reached) };
  },
};

const tripInput = z.object({ event_name: z.string().min(1).max(200), destination: z.string().min(1).max(200), transportation_type: z.enum(['bus', 'van', 'flight', 'carpool']), departure_date: DATE, departure_time: TIME.optional(), departure_location: z.string().max(500).optional(), return_date: DATE.optional(), return_time: TIME.optional(), flight_info: z.string().max(1000).optional(), hotel_name: z.string().max(200).optional(), hotel_address: z.string().max(500).optional(), hotel_phone: z.string().max(50).optional(), hotel_confirmation: z.string().max(100).optional(), room_assignments: z.string().max(2000).optional(), uniform_requirements: z.string().max(1000).optional(), gear_list: z.array(z.string().max(200).regex(/^[^,]*$/, 'One item, no comma')).max(50).optional(), notes: z.string().max(5000).optional() });
const tripFlow: FlowDef<z.infer<typeof tripInput>> = {
  name: 'create_trip',
  editable: ['event_name', 'destination', 'transportation_type', 'departure_date', 'departure_time', 'departure_location', 'return_date', 'return_time', 'flight_info', 'hotel_name', 'hotel_address', 'hotel_phone', 'hotel_confirmation', 'room_assignments', 'uniform_requirements', 'gear_list', 'notes'],
  editLabels: { event_name: 'Trip', transportation_type: 'How', departure_date: 'Leaves', departure_time: 'Leaves at', departure_location: 'From', return_date: 'Back', return_time: 'Back at', flight_info: 'Flight', hotel_name: 'Hotel', hotel_confirmation: 'Confirmation number', room_assignments: 'Rooms', uniform_requirements: 'Uniform', gear_list: 'Gear' },
  written: (sb, ctx, i, { since }) => rowSince(sb, 'golf_travel_itineraries', { team_id: ctx.team_id, event_name: i.event_name, destination: i.destination, departure_date: i.departure_date }, since),
  done: (_ctx, i) => ({ summary: `The trip to ${i.destination} is added.`, kind: 'trip', label: i.event_name, href: '/golf/dashboard/travel' }),
  description: 'Add a trip. Ask for transport and a firm leave date if not said.',
  input: tripInput,
  plan: (ctx, i) => {
    if (i.return_date && i.return_date < i.departure_date) throw new ActionPlanError('The return is before the leave date. Ask the coach.');
    return {
      visual: { kind: 'trip', from: i.departure_location ?? null, to: i.destination, how: i.transportation_type, leave: i.departure_date, back: i.return_date ?? null },
      action: 'Add the trip',
      summary: `${i.event_name} · ${i.destination}`,
      facts: [
        fact('Leaves', [i.departure_date, i.departure_time].filter(Boolean).join(' '), false),
        fact('How', i.transportation_type, false),
        fact('From', i.departure_location),
        fact('Back', [i.return_date, i.return_time].filter(Boolean).join(' ')),
        // Written only when given, so shown only when given: nothing goes into the trip that is not on this card.
        ...(i.flight_info ? [fact('Flight', i.flight_info)] : []),
        fact('Hotel', i.hotel_name),
        ...(i.hotel_address ? [fact('Hotel address', i.hotel_address)] : []),
        ...(i.hotel_phone ? [fact('Hotel phone', i.hotel_phone)] : []),
        ...(i.hotel_confirmation ? [fact('Confirmation number', i.hotel_confirmation)] : []),
        fact('Rooms', i.room_assignments),
        fact('Uniform', i.uniform_requirements),
        fact('Gear', i.gear_list?.join(', ')),
        ...(i.notes ? [fact('Notes', i.notes)] : []),
      ],
      notifications: [i.hotel_confirmation ? 'Nobody is told. Every team member can read the hotel confirmation number.' : 'Nobody is told. Players see it as new travel.'],
      recipients: [],
      delivery: null,
      visible_to: 'team',
      visible_note: `Every player and coach on ${ctx.team_name} can read the whole trip in Travel${i.hotel_confirmation ? ', the hotel confirmation number included' : ''}.`,
      key: ['trip', i.event_name, i.departure_date, i.destination],
    };
  },
  run: async (ctx, i, { requestId }) => {
    const res = (await createGolfTravelItinerary({ requestId, team_id: ctx.team_id, event_name: i.event_name, destination: i.destination, transportation_type: i.transportation_type, departure_date: i.departure_date, departure_time: i.departure_time, departure_location: i.departure_location, return_date: i.return_date, return_time: i.return_time, flight_info: i.flight_info, hotel_name: i.hotel_name, hotel_address: i.hotel_address, hotel_phone: i.hotel_phone, hotel_confirmation: i.hotel_confirmation, room_assignments: i.room_assignments, uniform_requirements: i.uniform_requirements, gear_list: i.gear_list?.join(', '), notes: i.notes })) as { success: boolean; error?: string; data?: { id?: string } | null };
    const id = res.success && typeof res.data?.id === 'string' ? res.data.id : undefined;
    return { ok: res.success, error: res.error, summary: `The trip to ${i.destination} is added.`, kind: 'trip', label: i.event_name, href: '/golf/dashboard/travel', ...(id ? { id } : {}) };
  },
};

const qualifierInput = z.object({ name: z.string().min(1).max(200), description: z.string().max(2000).optional(), start_date: DATE, end_date: DATE.optional(), num_rounds: z.number().int().min(1).max(50), selection_slots_total: z.number().int().min(1).max(12), selection_slots_coach_pick: z.number().int().min(0).max(12), player_ids: z.array(z.string().uuid()).min(1), rules: z.string().max(5000).optional(), entry_deadline: DATE.optional() });
type QualifierStored = z.infer<typeof qualifierInput> & { seen?: { people: SeenPeople } };
const qualifierFlow: FlowDef<QualifierStored> = {
  name: 'create_qualifier',
  editable: ['name', 'description', 'start_date', 'end_date', 'num_rounds', 'selection_slots_total', 'selection_slots_coach_pick', 'player_ids', 'rules', 'entry_deadline'],
  editLabels: { start_date: 'Starts', end_date: 'Ends', num_rounds: 'Rounds', selection_slots_total: 'Squad', selection_slots_coach_pick: 'Coach picks', player_ids: 'Players' },
  written: (sb, ctx, i, { since }) => rowSince(sb, 'golf_qualifiers', { team_id: ctx.team_id, name: i.name, start_date: i.start_date }, since),
  done: (_ctx, i) => ({ summary: `${i.name} is set.`, kind: 'qualifier', label: i.name, href: '/golf/dashboard/qualifiers' }),
  description: 'Set a qualifier. Ask for rounds, squad size and coach picks if not said.',
  input: qualifierInput,
  stored: qualifierInput.extend({ seen: z.object({ people: SeenPeople }).optional() }),
  prepare: async (sb, ctx, i) => ({ ...i, seen: { people: await seenPlayers(sb, ctx, i.player_ids) } }),
  stale: (sb, ctx, i) => peopleChanged(sb, ctx, seenOf(i.seen).people, 'Nothing was saved.'),
  plan: (_ctx, i) => {
    if (i.selection_slots_coach_pick > i.selection_slots_total) throw new ActionPlanError('Coach picks can’t be more than the squad.');
    if (i.end_date && i.end_date < i.start_date) throw new ActionPlanError('The end date is before the start. Ask the coach.');
    const people = seenOf(i.seen).people;
    const { recipients, not_reached } = reachOf(people, true);
    const delivery = recipients.length ? qualifierDelivery(i.name, i.start_date) : null;
    return {
      visual: { kind: 'qual', title: i.name, rounds: i.num_rounds, start: i.start_date, total: i.selection_slots_total, picks: i.selection_slots_coach_pick, field: people.length, deadline: i.entry_deadline ?? null },
      action: 'Set qualifier',
      summary: i.name,
      facts: [
        fact('Starts', i.start_date, false),
        ...(i.end_date ? [fact('Ends', i.end_date)] : []),
        fact('Rounds', i.num_rounds, false),
        fact('Squad', `${i.selection_slots_total}, coach picks ${i.selection_slots_coach_pick}`, false),
        fact('Players', nameList(people.map((p) => p.name)), false),
        ...(i.entry_deadline ? [fact('Entry deadline', i.entry_deadline)] : []),
        fact('Rules', i.rules),
        ...(i.description ? [fact('Description', i.description)] : []),
        ...cannotLine(not_reached),
      ],
      notifications: delivery ? [`${plural(recipients.length, 'player')} ${recipients.length === 1 ? 'gets' : 'get'} a push, a bell row and an email once Undo closes: “${delivery.title}”, “${delivery.body}”.`] : ['Nobody is told: none of these players has an account yet.'],
      affects: affectsOf(people),
      recipients,
      not_reached,
      delivery,
      // The read rule is the team's (`golf_qualifiers_select_team`: a coach or a player of the team), wider than the list a player is
      // shown (`getPlayerQualifiers` lists the qualifiers they are entered in). The card says both, and claims the wider one.
      visible_to: 'team',
      visible_note: 'It is listed in Qualifiers for the players in it and this team’s coaches. Any player on the team is allowed to see it.',
      key: ['qualifier', i.name, i.start_date, i.player_ids.join(',')],
    };
  },
  run: async (_ctx, i, { requestId }) => {
    const res = (await createGolfQualifier({ requestId, name: i.name, description: i.description, startDate: i.start_date, endDate: i.end_date, numRounds: i.num_rounds, selectionSlotsTotal: i.selection_slots_total, selectionSlotsCoachPick: i.selection_slots_coach_pick, playerIds: i.player_ids, rules: i.rules, entryDeadline: i.entry_deadline })) as { success: boolean; error?: string; data?: { qualifierId?: string } };
    const id = res.success ? res.data?.qualifierId : undefined;
    const { recipients, not_reached } = reachOf(i.seen?.people ?? [], true);
    return { ok: res.success, error: res.error, summary: `${i.name} is set.`, kind: 'qualifier', label: i.name, href: id ? `/golf/dashboard/qualifiers/${id}` : '/golf/dashboard/qualifiers', ...(id ? { id } : {}), ...(res.success ? { notifications: queuedTo(['push', 'in_app', 'email'], recipients), missed: missedOf(not_reached) } : {}) };
  },
};

const GOAL_STATS = ['sg_total', 'sg_ott', 'sg_approach', 'sg_around_green', 'sg_putting', 'gir_pct', 'scrambling_pct_sand', 'penalty_rate_per_round'] as const;
const goalInput = z.object({ player_id: z.string().uuid(), metric_id: z.enum(GOAL_STATS), label: z.string().max(60), window_days: z.number().int().min(7).max(365), target_value: z.number(), mode: z.enum(['mandatory', 'suggested']) });
const GoalSeen = z.object({ people: SeenPeople, base: z.object({ current: z.number().nullable(), unit: z.string(), better: z.enum(['up', 'down']) }) });
type GoalStored = z.infer<typeof goalInput> & { seen?: z.infer<typeof GoalSeen> };
const goalHref = (playerId: string) => `/golf/dashboard/roster?player=${playerId}`;
const withUnit = (value: number, unit: string): string => (unit === 'percent' || unit === '%' ? `${value}%` : unit ? `${value} ${unit}` : `${value}`);
const goalFlow: FlowDef<GoalStored> = {
  name: 'create_goal',
  editable: ['target_value', 'window_days', 'mode'],
  editLabels: { target_value: 'Target', window_days: 'By', mode: 'How' },
  written: (sb, _ctx, i, { since }) => rowSince(sb, 'golf_goals', { player_id: i.player_id, metric_id: i.metric_id, target_value: i.target_value }, since),
  done: (ctx, i) => ({ summary: `The goal is set for ${requireRosterPlayer(ctx, i.player_id).name}.`, kind: 'goal', href: goalHref(i.player_id) }),
  description: 'Give a player a goal on one of eight stats. Ask which stat if unclear, by when, and whether it is assigned or suggested.',
  input: goalInput,
  stored: goalInput.extend({ seen: GoalSeen.optional() }),
  // Where the player stands now is read the way the save will measure it; a target on the wrong side of it is refused here, before a card.
  prepare: async (sb, ctx, i) => ({ ...i, seen: { people: await seenPlayers(sb, ctx, [i.player_id]), base: await seenGoalBase(sb, i.player_id, i.metric_id, i.target_value) } }),
  stale: (sb, ctx, i) => peopleChanged(sb, ctx, seenOf(i.seen).people, 'Nothing was saved.'),
  plan: (ctx, i) => {
    const p = requireRosterPlayer(ctx, i.player_id);
    const seen = seenOf(i.seen);
    const title = goalTitleOf(i.label, i.window_days);
    const { recipients, not_reached } = reachOf(seen.people, true);
    const delivery = recipients.length ? goalDelivery(title) : null;
    return {
      visual: { kind: 'goal', player: p.name, stat: i.label, target: i.target_value, days: i.window_days, current: seen.base.current, unit: seen.base.unit, better: seen.base.better },
      action: 'Set goal',
      summary: `${title} for ${p.name}`,
      facts: [
        fact('Player', p.name, false),
        fact('Goal', title, false),
        fact('Target', withUnit(i.target_value, seen.base.unit), false),
        { label: 'Now', value: seen.base.current == null ? 'No rounds in the last 90 days to measure from' : withUnit(seen.base.current, seen.base.unit) },
        fact('Better is', seen.base.better === 'down' ? 'Lower' : 'Higher', false),
        fact('By', `${i.window_days} days from when it is saved`, false),
        fact('How', i.mode === 'mandatory' ? 'Assigned' : 'Suggested', false),
        ...cannotLine(not_reached),
      ],
      notifications: delivery ? [`${p.name} is told in the app once Undo closes: “${delivery.title}”, “${delivery.body}”.`] : [`Nobody is told: ${p.name} has no account yet.`],
      affects: affectsOf(seen.people),
      recipients,
      not_reached,
      delivery,
      visible_to: 'recipients',
      visible_note: `${p.name} and this team’s coaches see the goal.`,
      key: ['goal', p.id, i.metric_id, i.target_value, i.window_days],
    };
  },
  run: async (ctx, i, { requestId }) => {
    const res = (await createGoal({ requestId, team_id: ctx.team_id, player_id_if_coach_creating: i.player_id, metric_id: i.metric_id, title: goalTitleOf(i.label, i.window_days), category: 'manual', ends_at: new Date(Date.now() + i.window_days * 86_400_000).toISOString(), target_value: i.target_value, target_source: 'manual', baseline_value: null, coach_assignment_mode: i.mode })) as { ok?: boolean; success?: boolean; error?: string; goal_id?: string };
    const ok = !!(res.ok ?? res.success);
    const { recipients, not_reached } = reachOf(i.seen?.people ?? [], true);
    return { ok, error: res.error, summary: `The goal is set for ${requireRosterPlayer(ctx, i.player_id).name}.`, kind: 'goal', href: goalHref(i.player_id), ...(ok && res.goal_id ? { id: res.goal_id } : {}), ...(ok ? { notifications: queuedTo(['in_app'], recipients).map((n) => ({ ...n, status: 'sent' as const })), missed: missedOf(not_reached) } : {}) };
  },
};

const NOTE_MAX = 2000;
const noteInput = z.object({ round_id: z.string().uuid(), player_id: z.string().uuid(), note: z.string().min(1).max(NOTE_MAX) });
/** `existing` and `round` are what the card shows, read from the round before Confirm. The model never supplies them. */
type NoteInput = z.infer<typeof noteInput> & { existing?: string; round?: { course: string | null; date: string | null; score: number | null } };
const noteStored = noteInput.extend({ existing: z.string().optional(), round: z.object({ course: z.string().nullable(), date: z.string().nullable(), score: z.number().nullable() }).optional() });

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
const NOTE_MOVED = 'The note on this round changed after this card was made, so what you approved is no longer what would be saved. Nothing was changed. Ask to add the note again.';
const roundHref = (roundId: string) => `/golf/dashboard/rounds/${roundId}`;
const noteFlow: FlowDef<NoteInput> = {
  name: 'add_round_note',
  editable: ['note'],
  editLabels: { note: 'Adding' },
  description: 'Add a coach note to a round, under any earlier note, which stays. The player always sees it.',
  input: noteInput,
  stored: noteStored,
  prepare: async (sb, ctx, i) => {
    // The round is checked as that player's own before its note is read: a note never lands on somebody else's round.
    const round = await seenRound(sb, ctx, i.round_id, i.player_id);
    const existing = await roundNote(sb, i.round_id);
    if (existing === null) throw new ActionPlanError('Could not read the note already on this round.');
    return { ...i, existing, round };
  },
  stale: async (sb, _ctx, i) => {
    const current = await roundNote(sb, i.round_id);
    if (current === null) throw new ActionPlanError('The note on this round could not be read just now.');
    // A second run of the same card finds its own words already at the end: that is done, not stale.
    if (appendedNote(current, i.note).kind === 'already') return null;
    return current === (i.existing ?? '') ? null : NOTE_MOVED;
  },
  plan: (ctx, i) => {
    const p = requireRosterPlayer(ctx, i.player_id);
    const round = seenOf(i.round);
    if (i.existing && appendedNote(i.existing, i.note).kind === 'too_long') throw new ActionPlanError(NOTE_TOO_LONG);
    return {
      visual: { kind: 'note', player: p.name, note: i.note, round },
      action: 'Add note',
      summary: `A note on ${p.name}’s round`,
      facts: [fact('Round', roundLine(round), false), ...(i.existing ? [fact('Earlier note', i.existing)] : []), fact('Adding', i.note, false)],
      notifications: [`${p.name} will see this note on the round, once Undo closes. No notification is sent.`],
      affects: [{ kind: 'player', id: p.id, label: p.name }],
      recipients: [],
      delivery: null,
      visible_to: 'recipients',
      visible_note: `${p.name} and this team’s coaches see the note on the round.`,
      key: ['note', i.round_id, i.note],
    };
  },
  run: async (_ctx, i, { sb }) => {
    const done = { summary: 'The note is on the round.', kind: 'note', href: roundHref(i.round_id), id: i.round_id };
    const current = await roundNote(sb, i.round_id);
    if (current === null) return { ok: false, error: 'Could not read the note already on this round. Nothing was changed.', ...done };
    const next = appendedNote(current, i.note);
    if (next.kind === 'already') return { ok: true, ...done };
    if (next.kind === 'too_long') return { ok: false, error: NOTE_TOO_LONG, ...done };
    const res = await saveRoundCoachNote(i.round_id, next.text);
    return { ok: res.success, error: res.success ? undefined : res.error, ...done };
  },
};

const Role = z.enum(['lineup', 'alternate', 'individual']);
const lineupInput = z.object({ tournament_id: z.string().uuid(), entries: z.array(z.object({ player_id: z.string().uuid(), role: Role, slot: z.number().int().min(1).max(9).nullable(), reasoning: z.string().max(500).optional() })).min(1).max(20) });
const SeenSeats = z.array(z.object({ player_id: z.string(), name: z.string(), role: Role, slot: z.number().nullable() }));
/** The tournament as the card saw it: its name and dates, the version the write is checked against, and the lineup saved on it then. */
const SeenTour = z.object({ name: z.string(), start_date: z.string(), end_date: z.string(), version: z.number(), substitutions: z.boolean(), seats: SeenSeats });
type LineupStored = z.infer<typeof lineupInput> & { seen?: z.infer<typeof SeenTour> };
const tournamentHref = (id: string) => `/golf/dashboard/tournaments/${id}`;
const seatOf = (s: { player_id: string; name: string; role: SeatRole; slot: number | null }) => ({ slot: s.role === 'lineup' ? s.slot : null, name: s.name, alternate: s.role === 'alternate', id: s.player_id, role: s.role });
const LINEUP_MOVED = 'The lineup on that tournament changed after this card was made, so what you approved is no longer what is there.';
const lockedSince = (at: string) => `That lineup is already locked (since ${at.slice(0, 10)}). A locked lineup cannot be changed or unlocked; a substitution, where the tournament allows one, is made on the tournament’s page.`;

export const lineupFlow: FlowDef<LineupStored> = {
  name: 'set_lineup',
  description: 'Set a tournament lineup. A tie for the last spot always waits for the coach. Locking is a separate step.',
  input: lineupInput,
  stored: lineupInput.extend({ seen: SeenTour.optional() }),
  // The lineup on the tournament is already this card's (an earlier run of the same card set it): done, not stale.
  written: async (sb, ctx, i) => {
    const now = await seenTournament(sb, ctx, i.tournament_id).catch(() => null);
    return now ? seatsKey(now.seats) === seatsKey(i.entries.map((e) => ({ player_id: e.player_id, role: e.role, slot: e.role === 'lineup' ? e.slot : null }))) && now.version !== i.seen?.version : null;
  },
  done: (_ctx, i) => ({ summary: `The lineup for ${i.seen?.name ?? 'the tournament'} is set.`, kind: 'lineup', label: i.seen?.name, href: tournamentHref(i.tournament_id), id: i.tournament_id }),
  prepare: async (sb, ctx, i) => {
    for (const e of i.entries) requireRosterPlayer(ctx, e.player_id);
    const t = await seenTournament(sb, ctx, i.tournament_id);
    if (t.locked_at) throw new ActionPlanError(lockedSince(t.locked_at));
    return { ...i, seen: { name: t.name, start_date: t.start_date, end_date: t.end_date, version: t.version, substitutions: t.substitutions, seats: t.seats } };
  },
  stale: async (sb, ctx, i) => {
    const seen = seenOf(i.seen);
    const now = await seenTournament(sb, ctx, i.tournament_id);
    if (now.locked_at) return `${lockedSince(now.locked_at)} Nothing was changed.`;
    if (now.version !== seen.version || seatsKey(now.seats) !== seatsKey(seen.seats)) return `${LINEUP_MOVED} Nothing was changed. Ask to set the lineup again.`;
    return null;
  },
  plan: (ctx, i) => {
    const seen = seenOf(i.seen);
    const seats = sortSeats(i.entries.map((e) => ({ player_id: e.player_id, name: requireRosterPlayer(ctx, e.player_id).name, role: e.role, slot: e.role === 'lineup' ? e.slot : null, reasoning: e.reasoning })));
    const dupes = seats.filter((s, n) => seats.findIndex((x) => x.player_id === s.player_id) !== n);
    if (dupes.length) throw new ActionPlanError(`${dupes[0]!.name} is in the lineup twice. Put each player in one seat.`);
    const why = seats.filter((s) => s.reasoning?.trim());
    return {
      visual: { kind: 'lineup', seats: seats.map((s) => ({ ...seatOf(s), ...(s.reasoning?.trim() ? { reasoning: s.reasoning.trim() } : {}) })), tournament: { id: i.tournament_id, name: seen.name, date: seen.start_date, end: seen.end_date !== seen.start_date ? seen.end_date : null }, replaces: seen.seats.map(seatOf) },
      action: 'Set lineup',
      summary: `Lineup for ${seen.name}`,
      facts: [
        fact('Tournament', `${seen.name} · ${tournamentDates(seen)}`, false),
        fact('Lineup', seats.map(seatLine).join('\n'), false),
        { label: 'Replaces', value: seen.seats.length ? seen.seats.map(seatLine).join('\n') : 'No lineup was set yet.' },
        // Saved with the lineup, so shown with it.
        ...(why.length ? [{ label: 'Reasoning', value: why.map((s) => `${s.name}: ${s.reasoning!.trim()}`).join('\n') }] : []),
      ],
      notifications: ['Nobody is told.'],
      affects: seats.map((s) => ({ kind: 'player' as const, id: s.player_id, label: s.name })),
      recipients: [],
      delivery: null,
      visible_to: 'coaches',
      visible_note: 'Coaches only, until the lineup is published to players on the tournament’s page.',
      key: ['lineup', i.tournament_id, seen.version, seatsKey(seats)],
    };
  },
  run: async (_ctx, i) => {
    // The version is the one the card read: if the tournament moved since, the app's own action refuses with "stale".
    const res = (await setTournamentEntries(i.tournament_id, i.entries.map((e) => ({ playerId: e.player_id, role: e.role, slot: e.slot, reasoning: e.reasoning })), seenOf(i.seen).version)) as { ok?: boolean; success?: boolean; error?: string };
    return { ok: !!(res.ok ?? res.success), error: res.error, summary: `The lineup for ${seenOf(i.seen).name} is set.`, kind: 'lineup', label: seenOf(i.seen).name, href: tournamentHref(i.tournament_id), id: i.tournament_id };
  },
};
const lockInput = z.object({ tournament_id: z.string().uuid() });
type LockStored = z.infer<typeof lockInput> & { seen?: z.infer<typeof SeenTour> };

/** The coach's own `set_lineup` for this tournament still in its hold or running. Locking now would lock the old entries, and the new ones would then land on a locked lineup. */
async function lineupStillLanding(sb: Sb, ctx: CoachChatContext, tournamentId: string): Promise<boolean | null> {
  const fresh = new Date(Date.now() - APPROVED_RUN_TTL_MS).toISOString();
  const { data, error } = await askTables(sb).from('golf_coachhelm_action_runs').select('id').eq('coach_id', ctx.coach_id).eq('tool_name', 'set_lineup').or(`proposed_input->>tournament_id.eq.${tournamentId},proposed_input->proposal->input->>tournament_id.eq.${tournamentId}`).or(`status.eq.held,and(status.eq.approved,decided_at.gt.${fresh})`).limit(1);
  if (error) return null;
  return (data ?? []).length > 0;
}

const LOCK_DOES = 'These seats are copied to every round of the tournament, and the lineup can no longer be edited.';
/** There is no unlock anywhere in the app (no function clears the lock); the only change after it is a substitution, and only where the tournament allows them. */
const lockAfter = (substitutions: boolean): string =>
  substitutions
    ? 'A locked lineup cannot be unlocked, here or anywhere in the app. This tournament allows substitutions: on its page a player can be swapped for a round that has not started.'
    : 'A locked lineup cannot be unlocked, here or anywhere in the app, and this tournament does not allow substitutions.';

export const lockFlow: FlowDef<LockStored> = {
  name: 'lock_lineup',
  description: 'Lock a lineup that is set. It locks the moment the coach presses and cannot be undone.',
  input: lockInput,
  stored: lockInput.extend({ seen: SeenTour.optional() }),
  immediate: true,
  prepare: async (sb, ctx, i) => {
    const t = await seenTournament(sb, ctx, i.tournament_id);
    if (t.locked_at) throw new ActionPlanError(lockedSince(t.locked_at));
    if (t.seats.length === 0) throw new ActionPlanError(`No lineup is set on ${t.name} yet, so there is nothing to lock. Set the lineup first.`);
    const landing = await lineupStillLanding(sb, ctx, i.tournament_id);
    if (landing !== false) throw new ActionPlanError(landing === null ? 'Could not check whether a lineup change is still going through. Try again in a moment.' : 'A lineup change for this tournament is still going through. Lock it once that has saved, so the card shows the lineup that will be locked.');
    return { ...i, seen: { name: t.name, start_date: t.start_date, end_date: t.end_date, version: t.version, substitutions: t.substitutions, seats: t.seats } };
  },
  // The lock this card wrote: the tournament is locked, and was locked after the card was made.
  written: async (sb, ctx, i, { since }) => {
    const now = await seenTournament(sb, ctx, i.tournament_id).catch(() => null);
    return now ? Boolean(now.locked_at && now.locked_at >= since) : null;
  },
  done: (_ctx, i) => ({ summary: `The lineup for ${i.seen?.name ?? 'the tournament'} is locked.`, kind: 'lineup', label: i.seen?.name, href: tournamentHref(i.tournament_id), id: i.tournament_id }),
  stale: async (sb, ctx, i) => {
    const seen = seenOf(i.seen);
    const now = await seenTournament(sb, ctx, i.tournament_id);
    if (now.locked_at) return `${lockedSince(now.locked_at)} Nothing was changed by this card.`;
    if (now.version !== seen.version || seatsKey(now.seats) !== seatsKey(seen.seats)) return `${LINEUP_MOVED} Locking now would lock a lineup you have not seen, so it was not locked. Ask to lock it again.`;
    return null;
  },
  plan: (_ctx, i) => {
    const seen = seenOf(i.seen);
    const after = lockAfter(seen.substitutions);
    return {
      visual: { kind: 'lineup', seats: seen.seats.map(seatOf), tournament: { id: i.tournament_id, name: seen.name, date: seen.start_date, end: seen.end_date !== seen.start_date ? seen.end_date : null }, locking: true },
      action: 'Lock the lineup',
      summary: `Lock the lineup for ${seen.name}. This locks at once and can’t be undone.`,
      facts: [
        fact('Tournament', `${seen.name} · ${tournamentDates(seen)}`, false),
        fact('Lineup', seen.seats.map(seatLine).join('\n'), false),
        fact('What locking does', LOCK_DOES, false),
        fact('Undo', `None. It locks the moment you press. ${after}`, false),
      ],
      notifications: ['Nobody is told.'],
      affects: seen.seats.map((s) => ({ kind: 'player' as const, id: s.player_id, label: s.name })),
      recipients: [],
      delivery: null,
      visible_to: 'coaches',
      visible_note: 'Coaches only, until the lineup is published to players on the tournament’s page.',
      undo: { window: false, after },
      impact: `${LOCK_DOES} ${after}`,
      key: ['lock', i.tournament_id, seen.version],
    };
  },
  run: async (ctx, i, { sb }) => {
    const done = { summary: `The lineup for ${i.seen?.name ?? 'the tournament'} is locked.`, kind: 'lineup', label: i.seen?.name, href: tournamentHref(i.tournament_id), id: i.tournament_id };
    const landing = await lineupStillLanding(sb, ctx, i.tournament_id);
    if (landing !== false) return { ok: false, error: landing === null ? 'Could not check the lineup. It isn’t locked; try again.' : 'The lineup is still going through. It isn’t locked; lock it once it lands.', ...done };
    const res = (await lockTournamentLineup(i.tournament_id)) as { ok?: boolean; success?: boolean; error?: string };
    return { ok: !!(res.ok ?? res.success), error: res.error, ...done };
  },
};

/** The quiet flows: nobody is told. */
const blockInput = z.object({ title: z.string().min(1).max(200), date: DATE, end_date: DATE.optional(), start: TIME.optional(), end: TIME.optional() });
const blockDone = (i?: { date?: string }): FlowDone => ({ summary: 'That time is blocked.', kind: 'blocked_time', href: i?.date ? `/golf/dashboard/calendar?date=${i.date}` : '/golf/dashboard/calendar' });
const blockFlow: FlowDef<z.infer<typeof blockInput>> = {
  name: 'add_blocked_time',
  editable: ['title', 'date', 'end_date', 'start', 'end'],
  editLabels: { date: 'First day', end_date: 'Last day', start: 'From', end: 'To' },
  landed: { table: 'golf_coach_blocked_time', done: blockDone },
  description: 'Block off the coach’s own time. Players never see it.',
  input: blockInput,
  plan: (_c, i) => {
    if (i.end_date && i.end_date < i.date) throw new ActionPlanError('The end date is before the start.');
    if (i.start && i.end && i.end <= i.start) throw new ActionPlanError('The end has to be after the start.');
    // The last day is written, so it is on the card: a block that spans days says both ends.
    const days = i.end_date && i.end_date !== i.date ? `${i.date} to ${i.end_date}` : i.date;
    return { action: 'Block time', summary: i.title, facts: [fact('When', [days, i.start && i.end ? `${i.start} to ${i.end}` : 'all day'].join(', '), false)], notifications: ['Nobody is told. Only you see it.'], recipients: [], delivery: null, visible_to: 'only_you', visible_note: 'Only you see this. Players never see a coach’s blocked time.', key: ['block', i.title, i.date, i.end_date ?? '', i.start ?? ''] };
  },
  run: async (_c, i, { requestId }) => {
    const res = (await addCoachBlockedTime({ requestId, title: i.title, startDate: i.date, endDate: i.end_date ?? i.date, startTime: i.start, endTime: i.end, allDay: !i.start })) as { success: boolean; error?: string };
    return { ok: res.success, error: res.error, ...blockDone(i) };
  },
};
const breakInput = z.object({ first_day: DATE, last_day: DATE, label: z.string().max(60) });
const breakDone = (i: z.infer<typeof breakInput>): FlowDone => ({ summary: `${i.label} is on the calendar.`, kind: 'break', label: i.label, href: `/golf/dashboard/calendar?date=${i.first_day}` });
const breakFlow: FlowDef<z.infer<typeof breakInput>> = {
  name: 'add_team_break',
  editable: ['first_day', 'last_day', 'label'],
  editLabels: {},
  // The break's row id is this card's request id (the action keeps it), so a second run finds the first one's row.
  landed: { table: 'golf_class_exceptions', done: breakDone },
  description: 'A team break from class, 21 days at most.',
  input: breakInput,
  plan: (ctx, i) => {
    const days = (Date.parse(i.last_day) - Date.parse(i.first_day)) / 86_400_000;
    if (days < 0 || days > 20) throw new ActionPlanError('A break is one to 21 days. Ask the coach to split a longer one.');
    return {
      action: 'Add break',
      summary: i.label,
      facts: [fact('Dates', `${i.first_day} to ${i.last_day}`, false), fact('Days', days + 1, false), ...(i.label ? [fact('Label', i.label)] : [])],
      notifications: ['Nobody is told.'],
      recipients: [],
      delivery: null,
      // golf_class_exceptions_select: a team-wide break (no player on the row) is readable by every member of the team.
      visible_to: 'team',
      visible_note: `Every player and coach on ${ctx.team_name} can see a team break. Nobody is notified.`,
      key: ['break', i.first_day, i.last_day],
    };
  },
  run: async (ctx, i, { requestId }) => {
    const res = (await addTeamBreak({ teamId: ctx.team_id, startsOn: i.first_day, endsOn: i.last_day, label: i.label, requestId })) as { success?: boolean; ok?: boolean; error?: string };
    return { ok: !!(res.success ?? res.ok), error: res.error, ...breakDone(i) };
  },
};
const termInput = z.object({ name: z.string().min(1).max(40), classes_start: DATE, classes_end: DATE, exams_end: DATE });
type TermStored = z.infer<typeof termInput> & { seen?: { others: number } };
const termFlow: FlowDef<TermStored> = {
  name: 'save_team_term',
  editable: ['name', 'classes_start', 'classes_end', 'exams_end'],
  editLabels: { classes_start: 'Classes start', classes_end: 'Classes end', exams_end: 'Exams end' },
  // The term's row id is this card's request id (the action keeps it), so the look is exact.
  landed: { table: 'golf_team_terms', done: (i) => ({ summary: `${i.name} is saved.`, kind: 'term', label: i.name, href: '/golf/dashboard/settings?section=team' }) },
  description: 'Save a term. Ask for any date not given; never infer from a school calendar.',
  input: termInput,
  stored: termInput.extend({ seen: z.object({ others: z.number() }).optional() }),
  // This task only ever adds a term. One of the same name, or one whose dates it runs into, is refused here: changing a term is done in Settings.
  prepare: async (sb, ctx, i) => {
    const { data, error } = await askTables(sb).from('golf_team_terms').select('label, classes_start, exams_end').eq('team_id', ctx.team_id);
    if (error) throw new ActionPlanError('The terms already saved could not be read just now, so nothing was prepared. Try again in a moment.');
    const terms = (data ?? []) as Array<{ label: string | null; classes_start: string; exams_end: string }>;
    const same = terms.find((t) => (t.label ?? '').trim().toLowerCase() === i.name.trim().toLowerCase());
    if (same) throw new ActionPlanError(`A term called ${i.name} is already saved (${same.classes_start} to ${same.exams_end}). This would add a second one, not change it: change its dates in Settings.`);
    const clash = terms.find((t) => t.classes_start <= i.exams_end && i.classes_start <= t.exams_end);
    if (clash) throw new ActionPlanError(`Those dates run into ${clash.label ?? 'a term'} (${clash.classes_start} to ${clash.exams_end}), which is already saved. Ask the coach for dates that do not overlap, or change that term in Settings.`);
    return { ...i, seen: { others: terms.length } };
  },
  plan: (ctx, i) => {
    const others = seenOf(i.seen).others;
    return {
      action: 'Save term',
      summary: i.name,
      facts: [
        fact('Classes', `${i.classes_start} to ${i.classes_end}`, false),
        fact('Exams end', i.exams_end, false),
        fact('Time zone', ctx.timezone, false),
        { label: 'Replaces', value: others ? `Nothing. It is added beside the ${plural(others, 'term')} already saved.` : 'Nothing. It is the first term saved.' },
      ],
      notifications: ['Nobody is told.'],
      recipients: [],
      delivery: null,
      // golf_team_terms_select: readable by the team's coaches and members.
      visible_to: 'team',
      visible_note: `Every player and coach on ${ctx.team_name} can see the term’s dates. Nobody is notified.`,
      key: ['term', i.name, i.classes_start],
    };
  },
  run: async (ctx, i, { requestId }) => {
    const res = (await saveTeamTerm({ teamId: ctx.team_id, label: i.name, classesStart: i.classes_start, classesEnd: i.classes_end, examsEnd: i.exams_end, timeZone: ctx.timezone, requestId })) as { success?: boolean; ok?: boolean; error?: string };
    return { ok: !!(res.success ?? res.ok), error: res.error, summary: `${i.name} is saved.`, kind: 'term', label: i.name, href: '/golf/dashboard/settings?section=team' };
  },
};
const availInput = z.object({ player_id: z.string().uuid(), note: z.string().min(1).max(280) });
/** `existing` is the note saved now, read by the server before the card ('' when there is none). The model never supplies it. */
type AvailStored = z.infer<typeof availInput> & { existing?: string };
const AVAIL_MOVED = 'The note saved for this player changed after this card was made, so what it would replace is not what you saw. Nothing was changed. Ask to save the note again.';
const availFlow: FlowDef<AvailStored> = {
  name: 'set_availability_note',
  editable: ['note'],
  editLabels: { note: 'Note' },
  description: 'A coach-only note on a player’s availability; it replaces any earlier note.',
  input: availInput,
  stored: availInput.extend({ existing: z.string().optional() }),
  prepare: async (sb, ctx, i) => {
    requireRosterPlayer(ctx, i.player_id);
    return { ...i, existing: await availabilityNoteNow(sb, ctx, i.player_id) };
  },
  stale: async (sb, ctx, i) => {
    const now = await availabilityNoteNow(sb, ctx, i.player_id);
    // Already this card's words (a second run of the same card): nothing to refuse.
    return now === seenOf(i.existing) || now === i.note.trim() ? null : AVAIL_MOVED;
  },
  plan: (ctx, i) => {
    const p = requireRosterPlayer(ctx, i.player_id);
    const existing = seenOf(i.existing);
    return {
      action: 'Save note',
      summary: `Availability note for ${p.name}`,
      facts: [{ label: 'Replaces', value: existing || 'Nothing: no note is saved for this player yet.' }, fact('Note', i.note, false)],
      notifications: ['Nobody is told. Only coaches see it.'],
      affects: [{ kind: 'player', id: p.id, label: p.name }],
      recipients: [],
      delivery: null,
      visible_to: 'coaches',
      visible_note: `Coaches only. ${p.name} never sees this note.`,
      key: ['avail', p.id, i.note],
    };
  },
  run: async (_ctx, i) => {
    const res = (await setPlayerAvailabilityCoachNote({ playerId: i.player_id, note: i.note })) as { success?: boolean; ok?: boolean; error?: string };
    return { ok: !!(res.success ?? res.ok), error: res.error, summary: 'The note is saved.', kind: 'note', href: `/golf/dashboard/roster?player=${i.player_id}`, id: i.player_id };
  },
};
const recruitInput = z.object({ first_name: z.string().min(1).max(120), last_name: z.string().max(120).optional(), grad_year: z.number().int().min(2020).max(2040).optional(), email: z.string().email().max(254).optional(), phone: z.string().max(40).optional(), hometown: z.string().max(120).optional(), state: z.string().length(2).optional(), notes: z.string().max(5000).optional(), status: z.enum(['recruiting', 'watched', 'offered', 'committed']).default('recruiting') });
const recruitDone = (): FlowDone => ({ summary: 'The recruit is added.', kind: 'recruit', href: '/golf/dashboard/recruiting' });
const recruitFlow: FlowDef<z.infer<typeof recruitInput>> = {
  name: 'create_recruit',
  editable: ['first_name', 'last_name', 'grad_year', 'email', 'phone', 'hometown', 'state', 'notes', 'status'],
  editLabels: { grad_year: 'Grad year' },
  landed: { table: 'golf_recruits', done: recruitDone },
  description: 'Add a recruit. Ask for a grad year if a grade was given. Coach only.',
  input: recruitInput,
  plan: (_c, i) => ({
    action: 'Add recruit',
    summary: [i.first_name, i.last_name].filter(Boolean).join(' '),
    // Contact details and notes are saved with the recruit, so they are on the card.
    facts: [fact('Grad year', i.grad_year), fact('Status', i.status, false), fact('Hometown', [i.hometown, i.state].filter(Boolean).join(', ')), ...(i.email ? [fact('Email', i.email)] : []), ...(i.phone ? [fact('Phone', i.phone)] : []), ...(i.notes ? [fact('Notes', i.notes)] : [])],
    notifications: ['Nobody is told. Only coaches see it.'],
    recipients: [],
    delivery: null,
    visible_to: 'coaches',
    visible_note: 'Coaches only. Players never see recruits, and the recruit is not contacted.',
    key: ['recruit', i.first_name, i.last_name ?? '', i.grad_year ?? ''],
  }),
  run: async (_c, i, { requestId }) => {
    const res = (await createRecruit({ first_name: i.first_name, last_name: i.last_name, hs_class: i.grad_year, email: i.email, phone: i.phone, hometown: i.hometown, state: i.state, notes: i.notes, status: i.status }, { requestId })) as { success?: boolean; ok?: boolean; error?: string };
    return { ok: !!(res.success ?? res.ok), error: res.error, ...recruitDone() };
  },
};

const messageInput = z.object({
  conversation_id: z.string().uuid().describe('From find_thread, only when exactly one thread matched.'),
  content: z.string().min(1).max(2000),
});
const SeenThreadShape = z.object({ title: z.string(), members: z.array(z.object({ id: z.string(), name: z.string(), role: z.enum(['player', 'coach']) })), others: z.number(), last: z.string().nullable() });
type MessageStored = z.infer<typeof messageInput> & { seen?: z.infer<typeof SeenThreadShape> };
const messageHref = (conversationId: string) => `/golf/dashboard/messages?conversation=${conversationId}`;
const messageFlow: FlowDef<MessageStored> = {
  name: 'send_message',
  editable: ['content'],
  editLabels: { content: 'Message' },
  written: (sb, _ctx, _i, { requestId }) => rowSince(sb, 'golf_messages', { id: requestId }, null),
  done: (_ctx, i) => ({ summary: `Sent to ${i.seen?.title ?? 'the thread'}.`, kind: 'message', label: i.seen?.title, href: messageHref(i.conversation_id) }),
  description: 'Send a message to one thread the coach is in, found with find_thread. It sends after the coach presses Send and the Undo window.',
  input: messageInput,
  stored: messageInput.extend({ seen: SeenThreadShape.optional() }),
  // The thread's name, its members and its last message come from the thread itself, never from the model.
  prepare: async (sb, ctx, i) => {
    const t = await seenThread(sb, ctx, i.conversation_id);
    return { ...i, seen: { title: t.title, members: t.members, others: t.others, last: t.last } };
  },
  stale: async (sb, ctx, i) => {
    const seen = seenOf(i.seen);
    const now = await seenThread(sb, ctx, i.conversation_id);
    return threadKey(now) === threadKey(seen) ? null : `Who is in ${seen.title} changed after this card was made, so the message would reach different people than you approved. Nothing was sent. Ask to send it again.`;
  },
  plan: (_ctx, i) => {
    const seen = seenOf(i.seen);
    const reach = threadReach({ id: i.conversation_id, ...seen });
    return {
      visual: { kind: 'msg', conversationId: i.conversation_id, thread: seen.title, count: reach.count, last: seen.last, draft: i.content, members: reach.names },
      action: `Send to ${plural(reach.count, 'person', 'people')}`,
      summary: seen.title,
      facts: [fact('Thread', seen.title, false), fact(`To (${reach.count})`, nameList(reach.names), false), fact('Message', i.content, false)],
      notifications: [`Sends as you to ${reach.line}, after an 8 second Undo.`],
      affects: seen.members.filter((m) => m.role === 'player').map((m) => ({ kind: 'player' as const, id: m.id, label: m.name })),
      recipients: seen.members,
      delivery: { channels: ['message', 'push'], title: seen.title, body: i.content, note: 'It arrives as your own message in the thread. A member with message notifications on also gets a push that starts with its first 100 characters.' },
      visible_to: 'recipients',
      visible_note: `Everyone in ${seen.title} can read it.`,
      key: ['message', i.conversation_id, i.content],
    };
  },
  run: async (_ctx, i, { requestId }) => {
    // The message's id is this card's request id: a second release of the same card hits the 23505 path and returns the first message,
    // and the same words sent to the same thread on a later request are a new message (they used to be treated as already sent).
    const res = await sendGolfMessage(i.conversation_id, i.content, requestId);
    const seen = i.seen;
    const title = seen?.title ?? 'the thread';
    const names = seen ? threadReach({ id: i.conversation_id, ...seen }) : null;
    return { ok: !!res?.success, error: res?.success ? undefined : 'That didn’t send. Nothing was delivered.', summary: `Sent to ${title}.`, kind: 'message', label: title, href: messageHref(i.conversation_id), id: requestId, ...(res?.success && names ? { notifications: [{ channel: 'message', recipients: names.count, status: 'sent' as const, to: names.names }] } : {}) };
  },
};

/** A v4-shaped id from a seed: the same seed, the same id. */
function stableUuid(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const drillInput = z.object({
  name: z.string().min(1).max(80),
  area: z.enum(['putting', 'short_game', 'bunker', 'approach', 'tee', 'course', 'fitness', 'mental']),
  kind: z.enum(['skill', 'random', 'pressure']).default('skill'),
  minutes: z.number().int().min(1).max(180),
  setup: z.string().max(400).optional(),
  goal: z.string().max(200).optional(),
});
const AREA_WORDS: Record<z.infer<typeof drillInput>['area'], string> = { putting: 'Putting', short_game: 'Short game', bunker: 'Bunker', approach: 'Approach', tee: 'Tee', course: 'On course', fitness: 'Fitness', mental: 'Mental' };
const DRILLS_HREF = '/golf/dashboard/practice/drills';
const KIND_WORDS: Record<z.infer<typeof drillInput>['kind'], string> = { skill: 'Skill', random: 'Random', pressure: 'Pressure' };
/** TASK_FIELDS 5.14: one drill bank, N-00's `golf_team_drills`. Registered only with the practice plans flag, which waits on that held migration. */
export const drillFlow: FlowDef<z.infer<typeof drillInput>> = {
  name: 'create_drill',
  editable: ['name', 'area', 'kind', 'minutes', 'setup', 'goal'],
  editLabels: { minutes: 'Length' },
  // The drill's row id is this card's request id (the action keeps it), so the look is exact.
  landed: { table: 'golf_team_drills', done: (i) => ({ summary: `${i.name} is in the drill bank.`, kind: 'drill', label: i.name, href: DRILLS_HREF }) },
  description: 'Add a new drill to the team drill bank. Players see it only when a published plan uses it.',
  input: drillInput,
  plan: (_ctx, i) => ({
    action: 'Add drill',
    summary: i.name,
    facts: [fact('Area', AREA_WORDS[i.area], false), fact('Kind', KIND_WORDS[i.kind], false), fact('Length', `${i.minutes} min`, false), ...(i.setup ? [fact('Setup', i.setup, false)] : []), ...(i.goal ? [fact('Goal', i.goal, false)] : [])],
    notifications: ['Nobody is told. Players see it when a plan uses it.'],
    recipients: [],
    delivery: null,
    visible_to: 'coaches',
    visible_note: 'Coaches see it in the drill bank. Players see it only when a published plan uses it.',
    key: ['drill', i.name.trim().toLowerCase(), i.area, i.minutes],
  }),
  run: async (ctx, i, { requestId }) => {
    const res = await createTeamDrill({ teamId: ctx.team_id, name: i.name, area: i.area, kind: i.kind, minutes: i.minutes, setup: i.setup, goal: i.goal, requestId });
    return { ok: res.success, error: res.success ? undefined : res.error, summary: `${i.name} is in the drill bank.`, kind: 'drill', label: i.name, href: DRILLS_HREF };
  },
};

const ARTIFACT_MAX = 8000;
const publishArtifactInput = z.object({ title: z.string().min(1).max(120), body: z.string().min(1).max(ARTIFACT_MAX) });
/** How many players a team-wide document reaches, in words a coach reads on the card. */
const activePlayers = (n: number) => (n === 0 ? 'nobody is on the active roster yet' : n === 1 ? 'the 1 active player' : `all ${n} active players`);
const DOCUMENTS_HREF = '/golf/dashboard/team-hub?tab=docs';

/** Publish from the artifact pane (ask/06 E-FPICK): the same hold as every write. The document opens for players; nothing else is sent. */
const publishArtifactFlow: FlowDef<z.infer<typeof publishArtifactInput>> = {
  name: 'publish_artifact',
  editable: ['title', 'body'],
  editLabels: { body: 'Words' },
  written: (sb, ctx, i, { since }) => rowSince(sb, 'golf_documents', { team_id: ctx.team_id, title: i.title }, since),
  done: (_ctx, i) => ({ summary: `${i.title} is in Documents.`, kind: 'document', label: i.title, href: DOCUMENTS_HREF }),
  description: 'Publish a piece written with write_artifact to Documents, where every player on the team can open it. Use its latest words unchanged.',
  input: publishArtifactInput,
  plan: (ctx, i) => ({
    action: `Publish to ${ctx.roster.length} ${ctx.roster.length === 1 ? 'player' : 'players'}`,
    summary: i.title,
    // The coach confirms knowing who can read it: the card says so in plain words, with the count, before anything else.
    facts: [fact('Who can see it', `Players on ${ctx.team_name} will be able to see this: ${activePlayers(ctx.roster.length)}.`, false), fact('Goes to', 'Documents', false), fact('Words', i.body, false)],
    notifications: [`Players on ${ctx.team_name} will be able to see this in Documents (${activePlayers(ctx.roster.length)}), once the Undo window closes. Nobody gets a notification.`],
    // Who can open it, by id: the roster the server holds, never a count from the model.
    affects: ctx.roster.map((p) => ({ kind: 'player' as const, id: p.id, label: p.name })),
    recipients: [],
    delivery: null,
    visible_to: 'team',
    visible_note: `Every player and coach on ${ctx.team_name} can open it in Documents. Nobody gets a notification.`,
    key: ['publish_artifact', i.title, createHash('sha256').update(i.body).digest('hex')],
  }),
  run: async (ctx, i, { requestId }) => {
    const res = await saveTextDocument(ctx.team_id, i.title, i.body, { category: 'other', playerVisible: true, requestId });
    const id = (res.data as { id?: string } | null)?.id;
    return { ok: !!res.data, error: res.data ? undefined : (res.error ?? 'That didn’t publish. Nothing changed.'), summary: `${i.title} is in Documents.`, kind: 'document', label: i.title, href: DOCUMENTS_HREF, ...(id ? { id } : {}) };
  },
};

export const CREATE_FLOWS: ReadonlyArray<FlowDef<never>> = [publishArtifactFlow, messageFlow, eventFlow, tripFlow, qualifierFlow, goalFlow, noteFlow, blockFlow, breakFlow, termFlow, availFlow, recruitFlow] as unknown as ReadonlyArray<FlowDef<never>>;
export const LINEUP_FLOWS: ReadonlyArray<FlowDef<never>> = [lineupFlow, lockFlow] as unknown as ReadonlyArray<FlowDef<never>>;
export const CREATE_TOOL_NAMES: readonly string[] = [...CREATE_FLOWS, ...LINEUP_FLOWS, drillFlow as unknown as FlowDef<never>].map((f) => f.name);

/** Boards and polls never write: the coach presses Send in Messages. Their result is a hand-off the browser turns into a prefill. */
export const DraftBoardInput = z.object({ player_id: z.string().uuid(), note: z.string().max(2000).optional() });
/** One thread found with find_thread, or the players to write to. Either way the words land in the Messages composer. */
export const DraftMessageInput = z
  .object({
    conversation_id: z.string().uuid().optional().describe('From find_thread, only when exactly one thread matched.'),
    player_ids: z.array(z.string().uuid()).min(1).max(40).optional(),
    content: z.string().min(1).max(2000),
  })
  .refine((v) => !!v.conversation_id !== !!v.player_ids, { message: 'Name one thread or the players, not both.' });
/** TASK_FIELDS 5.5: a poll lands in a group's composer with these words, and the coach posts it. */
export const DraftPollInput = z.object({
  conversation_id: z.string().uuid().describe('From find_thread: a group thread, only when exactly one matched.'),
  question: z.string().min(1).max(POLL_QUESTION_MAX),
  options: z.array(z.string().min(1).max(POLL_OPTION_MAX)).min(POLL_MIN_OPTIONS).max(POLL_MAX_OPTIONS),
  multi: z.boolean().optional(),
  closes_at: z.string().optional().describe('ISO time in the future, at most 30 days out. Leave out to keep it open.'),
});
/** A long piece beside the chat (ask/06 E-ACARD, E-APANEL). Its words go through the same number audit as the answer. */
export const WriteArtifactInput = z.object({
  artifact_id: z.string().uuid().optional().describe('The id write_artifact returned, to add a version. Leave out for a new piece.'),
  kind: z.enum(['player_report', 'lineup', 'round_recap']),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(ARTIFACT_MAX),
});
