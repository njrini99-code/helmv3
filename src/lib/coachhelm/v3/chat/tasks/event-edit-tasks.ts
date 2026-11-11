/**
 * CoachHelm chat: move or edit one event, and cancel one.
 *
 *   update_event   a new day, time, place or title for one event, through `updateGolfEvent`.
 *   cancel_event   a cancellation players are told about, through `deleteGolfEvent` with no options.
 *
 * Both act on one date. That is what the Calendar itself does for "this date only" of a repeating series
 * (`src/clubhouse/screens/calendar/move-write.ts` and `editor.tsx`): `updateGolfEvent` for a move, `deleteGolfEvent`
 * for a cancel. The series scopes ("this and following", "all") are a different action, and the delete ones remove
 * rows; no tool here calls them.
 *
 * Cancel is not a delete. `deleteGolfEvent` without options sets the event's status to cancelled, keeps the row and
 * every reply, and tells people. Its `hard` option is the row delete; this file never passes it, and a test holds that.
 *
 * Who is told and in which words is built here from the same rules and the same formatter the app's notices use
 * (`notifyEventUpdate` in `lib/calendar/rsvp.ts`, `fanOutEventCancelled` in `lib/calendar/fan-out.ts`,
 * `formatNoticeWhen`). Those builders are not exported as words, so the templates are repeated and a test pins the
 * app's lines: if the app's wording moves, the test fails and names this file.
 *
 * Every read is the signed-in session client. No admin client here.
 */
import 'server-only';
import { z } from 'zod';
import { deleteGolfEvent, updateGolfEvent, type GolfEventUpdateInput } from '@/app/golf/actions/calendar-events';
import { resolveTeamTimeZone } from '@/lib/calendar/availability';
import { formatNoticeWhen } from '@/lib/calendar/timezone';
import { offsetMinutesFor } from '@/lib/golf/timezone';
import { keyOf } from '../action-planners';
import type { ProposalFact } from '../action-types';
import type { CoachChatContext } from '../context';
import type { ChatTool, TaskTool, ToolContext } from '../engine/tool';
import type { CardPerson } from '../card-types';
import { asPlayers, coachOnly, done, editing, failed, list, now, plural, settle, unreached, wallClock, withAccounts, type StoredProposal } from './kit';

interface EventRow {
  id: string;
  team_id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time: string | null;
  all_day: boolean | null;
  location: string | null;
  status: string | null;
  requires_rsvp: boolean | null;
  parent_event_id: string | null;
  recurring: boolean | null;
  updated_at: string | null;
}
const EVENT_COLUMNS = 'id, team_id, title, event_type, start_time, end_time, all_day, location, status, requires_rsvp, parent_event_id, recurring, updated_at';

/** The event, only on the coach's own team. Null when it is not there; a throw when it could not be read. */
async function readEvent(ctx: ToolContext, who: CoachChatContext, eventId: string): Promise<EventRow | null> {
  const { data, error } = await ctx.sb.from('golf_events').select(EVENT_COLUMNS).eq('id', eventId).eq('team_id', who.team_id).maybeSingle();
  if (error) throw new Error('The event could not be read just now. Try again in a moment.');
  return data && data.team_id === who.team_id ? (data as EventRow) : null;
}

async function ownEvent(ctx: ToolContext, who: CoachChatContext, eventId: string): Promise<EventRow> {
  const event = await readEvent(ctx, who, eventId);
  if (!event) throw new Error('That event is not on your team’s calendar. Find it with the schedule reader first.');
  return event;
}

const zoneOf = (ctx: ToolContext, who: CoachChatContext) => resolveTeamTimeZone([who.team_id], ctx.sb as never, 'coachhelm.event_tasks');
const inSeries = (e: EventRow) => Boolean(e.parent_event_id) || e.recurring === true;
const whenWords = (startIso: string, allDay: boolean | null, zone: string, location: string | null) => `${formatNoticeWhen(startIso, allDay, zone)}${location ? ` at ${location}` : ''}`;
const sameInstant = (a: string | null, b: string | null) => (a === null || b === null ? a === b : Date.parse(a) === Date.parse(b));

/** Who is on the event's list: roster players by name, and a count of anyone else on it (a player no longer on the active roster). */
async function invitedTo(ctx: ToolContext, who: CoachChatContext, eventId: string): Promise<{ roster: string[]; others: number; anyNotified: boolean }> {
  const { data, error } = await ctx.sb.from('golf_event_attendance').select('player_id, notified_at').eq('event_id', eventId);
  if (error) throw new Error('Who is invited could not be read just now, so nothing was prepared. Try again in a moment.');
  const ids = [...new Set((data ?? []).map((r) => r.player_id))];
  const roster = ids.filter((id) => who.roster.some((p) => p.id === id));
  return { roster, others: ids.length - roster.length, anyNotified: (data ?? []).some((r) => r.notified_at != null) };
}

/** The names on the card, in roster order, and those with no account, who cannot be reached. */
async function reachable(ctx: ToolContext, who: CoachChatContext, ids: readonly string[]): Promise<{ to: string[]; cannot: string[]; people: CardPerson[]; missed: ReturnType<typeof unreached> }> {
  const accounts = await withAccounts(ctx, ids);
  if (!accounts) throw new Error('Who can be told could not be confirmed just now, so nothing was prepared. Try again in a moment.');
  const on = who.roster.filter((p) => ids.includes(p.id));
  const yes = on.filter((p) => accounts.has(p.id));
  const no = on.filter((p) => !accounts.has(p.id));
  return { to: yes.map((p) => p.name), cannot: no.map((p) => p.name), people: asPlayers(yes), missed: unreached(no) };
}

// ---------------------------------------------------------------------------------------------------------------------
// update_event
// ---------------------------------------------------------------------------------------------------------------------

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const UpdateInput = z.strictObject({
  event_id: z.string().uuid(),
  new_date: z.string().regex(DAY).nullable().describe('YYYY-MM-DD, team timezone.'),
  new_start: z.string().regex(TIME).nullable().describe('24-hour HH:MM.'),
  new_end: z.string().regex(TIME).nullable().describe('24-hour HH:MM.'),
  new_location: z.string().min(1).max(500).nullable(),
  new_title: z.string().min(1).max(200).nullable(),
});
type UpdateInput = z.infer<typeof UpdateInput>;
/** What the coach can change on the card itself. A blank leaves that part of the event as it is. */
const updateEdits = editing(UpdateInput, { new_date: 'Date', new_start: 'Start', new_end: 'End', new_location: 'Place', new_title: 'Title' }, { new_start: 'time', new_end: 'time', new_location: 'text' });

const UpdateStored = z.object({
  event_id: z.string().uuid(),
  payload: z.record(z.string(), z.unknown()),
  expect: z.object({ start: z.string(), end: z.string().nullable(), location: z.string().nullable(), title: z.string() }),
  summary: z.string(),
  told: z.number().int().nonnegative(),
  day: z.string().optional(),
});

const addDays = (day: string, n: number): string => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayGap = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
/** A wall-clock reading in the team's zone as an instant, with the offset the Calendar's own move uses (`offsetMinutesFor`). */
function instantOf(day: string, time: string, zone: string): { iso: string; offset: number } {
  const offset = offsetMinutesFor(day, time, zone);
  if (offset === null) throw new Error('The team’s timezone could not be read, so the new time could not be worked out.');
  return { iso: new Date(Date.parse(`${day}T${time}:00Z`) + offset * 60_000).toISOString(), offset };
}

export const updateEvent: TaskTool<UpdateInput, StoredProposal> = {
  kind: 'task',
  name: 'update_event',
  description:
    'Move or edit one event on the calendar: day, start, end, place or title. Pass only what changes and null for the rest; the length is kept unless you give a new end. A repeating practice changes on that one date only.',
  input: UpdateInput,
  progress: () => 'Preparing the change',
  plan: async (ctx, input) => {
    const who = coachOnly(ctx);
    const event = await ownEvent(ctx, who, input.event_id);
    if (event.status === 'cancelled') throw new Error('That event was cancelled. Restore it on the Calendar before changing it.');
    if (input.new_date === null && input.new_start === null && input.new_end === null && input.new_location === null && input.new_title === null) throw new Error('Say what should change: the day, the time, the place or the title.');
    const zone = await zoneOf(ctx, who);
    const allDay = event.all_day === true;
    const title = input.new_title?.trim() || event.title;
    const location = input.new_location?.trim() || event.location;

    let startIso = event.start_time;
    let endIso = event.end_time;
    const payload: GolfEventUpdateInput = {};
    if (allDay) {
      if (input.new_start || input.new_end) throw new Error('That is an all-day event. Giving it a time is done on the Calendar.');
      const day = event.start_time.slice(0, 10);
      if (input.new_date && input.new_date !== day) {
        startIso = `${input.new_date}T00:00:00+00:00`;
        endIso = event.end_time ? `${addDays(event.end_time.slice(0, 10), dayGap(day, input.new_date))}T00:00:00+00:00` : null;
        Object.assign(payload, { startDate: input.new_date, ...(endIso ? { endDate: endIso.slice(0, 10) } : {}), allDay: true });
      }
    } else if (input.new_date || input.new_start || input.new_end) {
      const cur = wallClock(event.start_time, zone);
      const day = input.new_date ?? cur.date;
      const start = input.new_start ?? cur.time;
      const begins = instantOf(day, start, zone);
      let endDay: string | null = null;
      let endTime: string | null = null;
      if (input.new_end) {
        if (input.new_end <= start) throw new Error('The end must be after the start on the same day.');
        endDay = day;
        endTime = input.new_end;
      } else if (event.end_time) {
        // The length is kept: a practice moved an hour later ends an hour later.
        const end = wallClock(new Date(Date.parse(begins.iso) + (Date.parse(event.end_time) - Date.parse(event.start_time))).toISOString(), zone);
        endDay = end.date;
        endTime = end.time;
      }
      const ends = endDay && endTime ? instantOf(endDay, endTime, zone) : null;
      startIso = begins.iso;
      endIso = ends ? ends.iso : null;
      Object.assign(payload, { startDate: day, startTime: start, allDay: false, timezoneOffset: begins.offset, ...(ends && endDay && endTime ? { endDate: endDay, endTime, endTimezoneOffset: ends.offset } : {}) });
    }
    if (input.new_location !== null && location !== event.location) payload.location = location ?? undefined;
    if (input.new_title !== null && title !== event.title) payload.title = title;
    const moved = !sameInstant(startIso, event.start_time) || !sameInstant(endIso, event.end_time);
    if (!moved && location === event.location && title === event.title) throw new Error('That is already how the event is set. Nothing to change.');
    if (!moved) {
      // Nothing about the time changed: send no time fields, so the action cannot touch them.
      for (const k of ['startDate', 'startTime', 'endDate', 'endTime', 'allDay', 'timezoneOffset', 'endTimezoneOffset'] as const) delete payload[k];
    }
    // The version the card read: the action refuses the write if the event has changed since.
    if (event.updated_at) payload.expectedUpdatedAt = event.updated_at;

    // Who hears: the app tells an event's invited players of a change only when the event asks for replies.
    const invited = event.requires_rsvp === true ? await invitedTo(ctx, who, event.id) : { roster: [], others: 0, anyNotified: false };
    const { to, cannot, people, missed } = await reachable(ctx, who, invited.roster);
    const told = event.requires_rsvp === true ? to.length + invited.others : 0;
    const day = allDay ? startIso.slice(0, 10) : wallClock(startIso, zone).date;
    const words = { title: `Event updated: ${title}`, message: whenWords(startIso, event.all_day, zone, location) };
    const endWords = (iso: string | null) => (iso && !allDay ? `, until ${new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso))}` : '');
    const facts: ProposalFact[] = [
      { label: 'Event', value: event.title },
      { label: 'Now', value: `${whenWords(event.start_time, event.all_day, zone, event.location)}${endWords(event.end_time)}` },
      { label: 'After', value: `${whenWords(startIso, event.all_day, zone, location)}${endWords(endIso)}` },
      ...(title !== event.title ? [{ label: 'New title', value: title }] : []),
      ...(inSeries(event) ? [{ label: 'Series', value: 'Only this date changes. The other dates of the series stay as they are.' }] : []),
      ...(told > 0
        ? [
            { label: `Told (${told})`, value: `${list(to)}${invited.others ? `${to.length ? ', and ' : ''}${plural(invited.others, 'invited player')} no longer on the active roster` : ''}` },
            ...(cannot.length ? [{ label: 'Will not be told', value: `${list(cannot)} (no account yet)` }] : []),
            { label: 'They see', value: `${words.title}\n${words.message}` },
            { label: 'How', value: 'A notification in the app that opens the event.' },
          ]
        : [{ label: 'Told', value: event.requires_rsvp === true ? 'Nobody: no invited player has an account yet. It changes on the calendar.' : 'Nobody is notified: this event does not ask for replies. Players see the change on their calendar.' }]),
      { label: 'When', value: 'When the Undo window closes, a few seconds after you confirm.' },
    ];
    const summary = `${title} is now ${whenWords(startIso, event.all_day, zone, location)}.`;
    return {
      action: 'Change an event',
      summary: `Change ${event.title} to ${whenWords(startIso, event.all_day, zone, location)}.`,
      facts,
      affects: [{ kind: 'event', id: event.id, label: title }],
      notifications: told > 0 ? [`${plural(told, 'invited player')} ${told === 1 ? 'gets' : 'get'} an in-app notification: “${words.title}”, “${words.message}”.`] : [],
      missing: [],
      idempotency_key: keyOf(['update_event', event.id, startIso, endIso ?? '', location ?? '', title]),
      recipients: told > 0 ? people : [],
      not_reached: told > 0 ? missed : [],
      delivery: told > 0 ? { channels: ['in_app'], title: words.title, body: words.message, ...(invited.others ? { note: `${plural(invited.others, 'invited player')} no longer on the active roster ${invited.others === 1 ? 'is' : 'are'} told too.` } : {}) } : null,
      undo: { window: true, after: 'Move it back on the Calendar. A notice that has gone out stays sent.' },
      lands: { kind: 'event', home: '/golf/dashboard/calendar', day },
      // The fields show the event as it will be, so the coach edits what they read on the card.
      editable: updateEdits.fields(input, { new_date: day, new_start: allDay ? null : wallClock(startIso, zone).time, new_end: endIso && !allDay ? wallClock(endIso, zone).time : null, new_location: location ?? null, new_title: title }),
      tool: 'update_event',
      input: { event_id: event.id, payload, expect: { start: startIso, end: endIso, location: location ?? null, title }, summary, told, day, asked: input },
      planned_at: now(),
    };
  },
  revise: async (ctx, proposal, edits) => {
    coachOnly(ctx);
    return updateEvent.plan(ctx, updateEdits.merge(proposal, edits));
  },
  commit: async (ctx, proposal) => {
    const name = 'update_event';
    const who = coachOnly(ctx);
    const parsed = UpdateStored.safeParse(proposal.input);
    if (!parsed.success) return failed(name, 'This card could not be read back, so it was not run. Nothing was changed.', false);
    const s = parsed.data;
    const href = `/golf/dashboard/calendar?${s.day ? `date=${s.day}&` : ''}event=${s.event_id}`;
    return settle({
      action: name,
      nothing: 'Nothing was changed.',
      where: 'the Calendar',
      look: async () => {
        const e = await readEvent(ctx, who, s.event_id).catch(() => undefined);
        if (e === undefined) return null;
        return Boolean(e) && e!.status !== 'cancelled' && sameInstant(e!.start_time, s.expect.start) && sameInstant(e!.end_time, s.expect.end) && (e!.location ?? null) === s.expect.location && e!.title === s.expect.title;
      },
      write: () => updateGolfEvent(s.event_id, s.payload as GolfEventUpdateInput),
      refusal: (a) => (a.code === 'stale' ? 'The event was changed by someone else after this card was made. Ask for the change again' : a.code === 'gone' ? 'The event was cancelled or deleted after this card was made' : null),
      receipt: () => done(name, s.summary, [{ kind: 'event', count: 1, id: s.event_id, href, label: s.expect.title }], s.told > 0 ? [{ channel: 'in-app', recipients: s.told, status: 'queued' }] : []),
    });
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// cancel_event
// ---------------------------------------------------------------------------------------------------------------------

const CancelInput = z.strictObject({
  event_id: z.string().uuid(),
  reason: z.string().min(1).max(200).nullable(),
});
type CancelInput = z.infer<typeof CancelInput>;
/** What the coach can change on the card itself: the reason players are given. A blank is no reason. */
const cancelEdits = editing(CancelInput, { reason: 'Reason' });
const CancelStored = z.object({ event_id: z.string().uuid(), title: z.string(), reason: z.string().nullable(), detail: z.string(), told: z.number().int().nonnegative() });

/** The cancellation notice's one line, as `fanOutEventCancelled` writes it. */
const cancelDetail = (e: EventRow, zone: string, reason: string | null) => `${formatNoticeWhen(e.start_time, e.all_day, zone)}${e.location ? ` at ${e.location}` : ''}${reason ? ` — ${reason}` : ''}`;

export const cancelEvent: TaskTool<CancelInput, StoredProposal> = {
  kind: 'task',
  name: 'cancel_event',
  description:
    'Cancel one event on the calendar when the coach says it is off. It is marked cancelled, not deleted, and can be restored on the Calendar; a repeating practice is cancelled on that date only. reason: the coach’s, shown to players, else null.',
  input: CancelInput,
  progress: () => 'Preparing the cancellation',
  plan: async (ctx, input) => {
    const who = coachOnly(ctx);
    const event = await ownEvent(ctx, who, input.event_id);
    if (event.status === 'cancelled') throw new Error('That event is already cancelled.');
    const zone = await zoneOf(ctx, who);
    const reason = input.reason?.replace(/\s+/g, ' ').trim() || null;
    const detail = cancelDetail(event, zone, reason);

    // The app's rule (`fanOutEventCancelled`): nobody unless the event asks for replies; then the invited players, and
    // the whole active team too unless it is a meeting or an event with a sent invite list.
    let to: string[] = [];
    let cannot: string[] = [];
    let people: CardPerson[] = [];
    let missed: ReturnType<typeof unreached> = [];
    let others = 0;
    let wholeTeam = false;
    if (event.requires_rsvp === true) {
      const invited = await invitedTo(ctx, who, event.id);
      wholeTeam = !(event.event_type === 'meeting' || invited.anyNotified);
      const ids = wholeTeam ? who.roster.map((p) => p.id) : invited.roster;
      ({ to, cannot, people, missed } = await reachable(ctx, who, ids));
      others = invited.others;
    }
    const told = to.length + others;
    const facts: ProposalFact[] = [
      { label: 'Event', value: `${event.title} · ${whenWords(event.start_time, event.all_day, zone, event.location)}` },
      { label: 'Reason', value: reason ?? 'Not set' },
      { label: 'What happens', value: 'It stays on the calendar marked cancelled, and every reply is kept. It can be restored on the Calendar.' },
      ...(inSeries(event) ? [{ label: 'Series', value: 'Only this date is cancelled. The other dates of the series stay on.' }] : []),
      ...(told > 0
        ? [
            { label: `Told (${told})`, value: `${wholeTeam ? 'The whole active team: ' : ''}${list(to)}${others ? `${to.length ? ', and ' : ''}${plural(others, 'invited player')} no longer on the active roster` : ''}` },
            ...(cannot.length ? [{ label: 'Will not be told', value: `${list(cannot)} (no account yet)` }] : []),
            { label: 'In the app they see', value: `Cancelled: ${event.title}\n${detail}` },
            { label: 'By e-mail they get', value: `Event cancelled: ${event.title}\nThis event has been cancelled. ${detail}\nSent to each of them who has an e-mail address on their account.` },
          ]
        : [{ label: 'Told', value: event.requires_rsvp === true ? 'Nobody: no player on the list has an account yet.' : 'Nobody is notified: this event does not ask for replies. Players see it marked cancelled on their calendar.' }]),
      { label: 'When', value: 'When the Undo window closes, a few seconds after you confirm. After that, the people told cannot be un-told.' },
    ];
    return {
      action: 'Cancel an event',
      summary: `Cancel ${event.title} on ${formatNoticeWhen(event.start_time, event.all_day, zone)}.`,
      facts,
      affects: [{ kind: 'event', id: event.id, label: event.title }],
      notifications: told > 0 ? [`${plural(told, 'player')} ${told === 1 ? 'is' : 'are'} told in the app (“Cancelled: ${event.title}”, “${detail}”) and by e-mail (“Event cancelled: ${event.title}”, “This event has been cancelled. ${detail}”).`] : [],
      missing: [],
      impact: told > 0 ? `${plural(told, 'player')} will be told it is off.` : undefined,
      idempotency_key: keyOf(['cancel_event', event.id, reason ?? '']),
      recipients: people,
      not_reached: missed,
      delivery:
        told > 0
          ? {
              channels: ['in_app', 'email'],
              title: `Cancelled: ${event.title}`,
              body: detail,
              variants: [{ channel: 'email', title: `Event cancelled: ${event.title}`, body: `This event has been cancelled. ${detail}` }],
              note: `The e-mail goes to each of them who has an address on their account.${others ? ` ${plural(others, 'invited player')} no longer on the active roster ${others === 1 ? 'is' : 'are'} told too.` : ''}`,
            }
          : null,
      undo: { window: true, after: 'Restore it on the Calendar. People already told stay told.' },
      lands: { kind: 'event', home: '/golf/dashboard/calendar', day: event.all_day ? event.start_time.slice(0, 10) : wallClock(event.start_time, zone).date },
      editable: cancelEdits.fields(input, { reason }),
      tool: 'cancel_event',
      input: { event_id: event.id, title: event.title, reason, detail, told, asked: input },
      planned_at: now(),
    };
  },
  revise: async (ctx, proposal, edits) => {
    coachOnly(ctx);
    return cancelEvent.plan(ctx, cancelEdits.merge(proposal, edits));
  },
  commit: async (ctx, proposal) => {
    const name = 'cancel_event';
    const who = coachOnly(ctx);
    const parsed = CancelStored.safeParse(proposal.input);
    if (!parsed.success) return failed(name, 'This card could not be read back, so it was not run. Nothing was cancelled.', false);
    const s = parsed.data;
    let current: EventRow | null;
    try {
      current = await readEvent(ctx, who, s.event_id);
    } catch {
      return failed(name, 'The event could not be read just now. Nothing was cancelled.', true);
    }
    if (!current) return failed(name, 'That event is no longer on your team’s calendar. Nothing was cancelled.', false);
    const receipt = () => done(name, `${s.title} is cancelled. It stays on the calendar marked cancelled.`, [{ kind: 'event', count: 1, id: s.event_id, href: `/golf/dashboard/calendar?event=${s.event_id}`, label: s.title }], s.told > 0 ? [{ channel: 'in-app', recipients: s.told, status: 'queued' }, { channel: 'email', recipients: s.told, status: 'queued' }] : []);
    if (current.status !== 'cancelled') {
      // What players would now be told must still be what the card showed.
      const zone = await zoneOf(ctx, who);
      if (cancelDetail(current, zone, s.reason) !== s.detail || current.title !== s.title) return failed(name, 'The event changed after this card was made, so the notice would no longer say what you approved. Nothing was cancelled. Ask again.', false);
    }
    return settle({
      action: name,
      nothing: 'Nothing was cancelled.',
      where: 'the Calendar',
      look: async () => {
        const e = await readEvent(ctx, who, s.event_id).catch(() => undefined);
        return e === undefined ? null : e?.status === 'cancelled';
      },
      // No options but the reason: without `hard` the action cancels and keeps the row.
      write: () => (s.reason ? deleteGolfEvent(s.event_id, { reason: s.reason }) : deleteGolfEvent(s.event_id)),
      receipt,
    });
  },
};

/** In a fixed order (the order is part of the cached prefix). Coach surfaces only. */
export function eventEditTools(): ChatTool[] {
  return [updateEvent, cancelEvent] as ChatTool[];
}
