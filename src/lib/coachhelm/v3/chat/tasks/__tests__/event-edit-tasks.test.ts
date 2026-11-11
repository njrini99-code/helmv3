import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const actions = vi.hoisted(() => ({ updateGolfEvent: vi.fn(), deleteGolfEvent: vi.fn() }));
vi.mock('@/app/golf/actions/calendar-events', () => actions);
vi.mock('@/lib/calendar/availability', () => ({ resolveTeamTimeZone: async () => 'America/New_York' }));

import { AVERY, BLAKE, OTHER_TEAM, STRANGER, TEAM, coachWho, fakeSb, playerWho, toolCtx } from '../../context/__tests__/fake-sb';
import { cancelEvent, eventEditTools, updateEvent } from '../event-edit-tasks';
import type { StoredProposal } from '../kit';

const EVENT = '20000000-0000-4000-8000-000000000001';
const FOREIGN = '20000000-0000-4000-8000-000000000002';
const CASEY = '99999999-9999-4999-8999-999999999999';
const person = (id: string, name: string) => ({ id, name, first_name: name.split(' ')[0]!, last_name: name.split(' ')[1] ?? null, graduation_year: null });
const coach = () => ({ ...coachWho(), roster: [person(AVERY, 'Avery Lane'), person(BLAKE, 'Blake Ortiz'), person(CASEY, 'Casey Moss')] });

/** Thu 12 Nov 2026, 3:00 to 5:30 PM in New York, replies on, Avery and Blake invited. */
const db = (event: Record<string, unknown> = {}, attendance?: Array<Record<string, unknown>>) =>
  fakeSb({
    golf_events: {
      rows: [
        { id: EVENT, team_id: TEAM, title: 'Team practice', event_type: 'practice', start_time: '2026-11-12T20:00:00+00:00', end_time: '2026-11-12T22:30:00+00:00', all_day: false, location: 'Pine Hills GC', status: 'confirmed', requires_rsvp: true, parent_event_id: null, recurring: false, updated_at: '2026-11-01T00:00:00Z', ...event },
        { id: FOREIGN, team_id: OTHER_TEAM, title: 'Rival practice', event_type: 'practice', start_time: '2026-11-12T20:00:00+00:00', end_time: null, all_day: false, location: null, status: 'confirmed', requires_rsvp: true, parent_event_id: null, recurring: false, updated_at: null },
      ],
    },
    golf_event_attendance: { rows: attendance ?? [{ event_id: EVENT, player_id: AVERY, notified_at: null }, { event_id: EVENT, player_id: BLAKE, notified_at: null }] },
    golf_players: { rows: [{ id: AVERY, user_id: 'u-a' }, { id: BLAKE, user_id: 'u-b' }, { id: CASEY, user_id: null }] },
  });
const fact = (p: StoredProposal, label: string | RegExp) => p.facts.find((f) => (typeof label === 'string' ? f.label === label : label.test(f.label)))?.value;
const stored = (p: StoredProposal) => JSON.parse(JSON.stringify(p)) as StoredProposal;
const keep = { new_date: null, new_start: null, new_end: null, new_location: null, new_title: null };

beforeEach(() => {
  actions.updateGolfEvent.mockReset();
  actions.deleteGolfEvent.mockReset();
});

describe('update_event: the card', () => {
  it('writes nothing; shows before and after, keeps the length, names who is told and the words they see', async () => {
    const { sb, writes } = db();
    const p = await updateEvent.plan(toolCtx(sb, coach()), { event_id: EVENT, ...keep, new_start: '16:00' });
    expect(writes).toEqual([]);
    expect(actions.updateGolfEvent).not.toHaveBeenCalled();
    expect(fact(p, 'Now')).toBe('Thu, Nov 12 at 3:00 PM at Pine Hills GC, until 5:30 PM');
    expect(fact(p, 'After')).toBe('Thu, Nov 12 at 4:00 PM at Pine Hills GC, until 6:30 PM');
    expect(fact(p, 'Told (2)')).toBe('Avery Lane and Blake Ortiz');
    expect(fact(p, 'They see')).toBe('Event updated: Team practice\nThu, Nov 12 at 4:00 PM at Pine Hills GC');
    expect(p.notifications).toEqual(['2 invited players get an in-app notification: “Event updated: Team practice”, “Thu, Nov 12 at 4:00 PM at Pine Hills GC”.']);
    // What the action will be sent: the Calendar's own move shape, with the version the card read.
    expect((p.input as { payload: unknown }).payload).toEqual({ startDate: '2026-11-12', startTime: '16:00', endDate: '2026-11-12', endTime: '18:30', allDay: false, timezoneOffset: 300, endTimezoneOffset: 300, expectedUpdatedAt: '2026-11-01T00:00:00Z' });
    expect(stored(p)).toEqual(p);
  });

  it('a new day keeps the time; a new place or title sends no time fields at all', async () => {
    const day = await updateEvent.plan(toolCtx(db().sb, coach()), { event_id: EVENT, ...keep, new_date: '2026-11-13' });
    expect(fact(day, 'After')).toBe('Fri, Nov 13 at 3:00 PM at Pine Hills GC, until 5:30 PM');
    const place = await updateEvent.plan(toolCtx(db().sb, coach()), { event_id: EVENT, ...keep, new_location: 'The range', new_title: 'Range session' });
    expect((place.input as { payload: unknown }).payload).toEqual({ location: 'The range', title: 'Range session', expectedUpdatedAt: '2026-11-01T00:00:00Z' });
    expect(fact(place, 'They see')).toBe('Event updated: Range session\nThu, Nov 12 at 3:00 PM at The range');
  });

  it('says nobody is notified when the event does not ask for replies, and that only this date of a series moves', async () => {
    const p = await updateEvent.plan(toolCtx(db({ requires_rsvp: false, parent_event_id: 'root' }).sb, coach()), { event_id: EVENT, ...keep, new_start: '16:00' });
    expect(fact(p, 'Told')).toMatch(/^Nobody is notified: this event does not ask for replies/);
    expect(fact(p, 'Series')).toBe('Only this date changes. The other dates of the series stay as they are.');
    expect(p.notifications).toEqual([]);
  });

  it('an all-day event moves by day and refuses a time', async () => {
    const all = { all_day: true, start_time: '2026-11-12T00:00:00+00:00', end_time: '2026-11-13T00:00:00+00:00' };
    const p = await updateEvent.plan(toolCtx(db(all).sb, coach()), { event_id: EVENT, ...keep, new_date: '2026-11-19' });
    expect((p.input as { payload: unknown }).payload).toMatchObject({ startDate: '2026-11-19', endDate: '2026-11-20', allDay: true });
    expect(fact(p, 'After')).toBe('Thu, Nov 19 at Pine Hills GC');
    await expect(updateEvent.plan(toolCtx(db(all).sb, coach()), { event_id: EVENT, ...keep, new_start: '09:00' })).rejects.toThrow(/all-day event/);
  });

  it('refuses nothing to change, the same values, an end before the start and a cancelled event', async () => {
    await expect(updateEvent.plan(toolCtx(db().sb, coach()), { event_id: EVENT, ...keep })).rejects.toThrow(/Say what should change/);
    await expect(updateEvent.plan(toolCtx(db().sb, coach()), { event_id: EVENT, ...keep, new_start: '15:00', new_location: 'Pine Hills GC' })).rejects.toThrow(/already how the event is set/);
    await expect(updateEvent.plan(toolCtx(db().sb, coach()), { event_id: EVENT, ...keep, new_end: '14:00' })).rejects.toThrow('The end must be after the start on the same day.');
    await expect(updateEvent.plan(toolCtx(db({ status: 'cancelled' }).sb, coach()), { event_id: EVENT, ...keep, new_start: '16:00' })).rejects.toThrow(/was cancelled/);
  });

  it('a player and another team’s event are refused', async () => {
    const { sb, reads } = db();
    await expect(updateEvent.plan(toolCtx(sb, playerWho(), 'player'), { event_id: EVENT, ...keep, new_start: '16:00' })).rejects.toThrow('Only a coach can do that.');
    expect(reads).toEqual([]);
    await expect(updateEvent.plan(toolCtx(sb, coach()), { event_id: FOREIGN, ...keep, new_start: '16:00' })).rejects.toThrow(/not on your team’s calendar/);
  });
});

describe('update_event: the write', () => {
  /** The app's action, standing in: it writes the row only on the version it was given, as the real one does. */
  const moving = (tables: ReturnType<typeof fakeSb>['tables'], opts: { failAfterWrite?: boolean } = {}) =>
    actions.updateGolfEvent.mockImplementation(async (id: string, data: Record<string, string | number | undefined>) => {
      const row = tables.golf_events!.rows!.find((r) => r.id === id)!;
      if (data.expectedUpdatedAt && row.updated_at !== data.expectedUpdatedAt) return { success: false, error: 'This event changed since you opened it.', code: 'stale' };
      const at = (d: unknown, t: unknown, off: unknown) => new Date(Date.parse(`${d}T${t}:00Z`) + Number(off) * 60_000).toISOString();
      if (data.startDate) Object.assign(row, { start_time: at(data.startDate, data.startTime, data.timezoneOffset), end_time: data.endTime ? at(data.endDate, data.endTime, data.endTimezoneOffset) : null });
      if (data.location) row.location = data.location;
      if (data.title) row.title = data.title;
      row.updated_at = '2026-11-10T12:00:00Z';
      // From a route the action's cache refresh can throw after the row is saved: it then reports a failure for a write that landed.
      return opts.failAfterWrite ? { success: false, error: 'An unexpected error occurred' } : { success: true };
    });

  it('saves through the app’s action with the card’s payload, and writes nothing itself', async () => {
    const { sb, tables, writes } = db();
    moving(tables);
    const p = stored(await updateEvent.plan(toolCtx(sb, coach()), { event_id: EVENT, ...keep, new_start: '16:00' }));
    const r = await updateEvent.commit(toolCtx(sb, coach()), p);
    expect(actions.updateGolfEvent).toHaveBeenCalledExactlyOnceWith(EVENT, (p.input as { payload: unknown }).payload);
    expect(writes).toEqual([]);
    expect(r).toMatchObject({ status: 'completed', summary: 'Team practice is now Thu, Nov 12 at 4:00 PM at Pine Hills GC.', notifications: [{ channel: 'in-app', recipients: 2, status: 'queued' }] });
    expect(r.created[0]).toMatchObject({ kind: 'event', href: `/golf/dashboard/calendar?event=${EVENT}` });
  });

  it('a second commit of the same card finds the event already moved and does not call the action again', async () => {
    const { sb, tables } = db();
    moving(tables);
    const p = stored(await updateEvent.plan(toolCtx(sb, coach()), { event_id: EVENT, ...keep, new_start: '16:00' }));
    await updateEvent.commit(toolCtx(sb, coach()), p);
    const again = await updateEvent.commit(toolCtx(sb, coach()), p);
    expect(again.status).toBe('completed');
    expect(actions.updateGolfEvent).toHaveBeenCalledTimes(1);
  });

  it('a write that landed but reported a failure is read back and reported as done', async () => {
    const { sb, tables } = db();
    moving(tables, { failAfterWrite: true });
    const p = stored(await updateEvent.plan(toolCtx(sb, coach()), { event_id: EVENT, ...keep, new_start: '16:00' }));
    expect((await updateEvent.commit(toolCtx(sb, coach()), p)).status).toBe('completed');
  });

  it('an event someone else changed since the card is not overwritten', async () => {
    const { sb, tables } = db();
    moving(tables);
    const p = stored(await updateEvent.plan(toolCtx(sb, coach()), { event_id: EVENT, ...keep, new_start: '16:00' }));
    Object.assign(tables.golf_events!.rows![0]!, { location: 'Somewhere else', updated_at: '2026-11-09T00:00:00Z' });
    const r = await updateEvent.commit(toolCtx(sb, coach()), p);
    expect(r).toMatchObject({ status: 'failed', retryable: false, summary: 'The event was changed by someone else after this card was made. Ask for the change again. Nothing was changed.' });
    expect(tables.golf_events!.rows![0]!.start_time).toBe('2026-11-12T20:00:00+00:00');
  });

  it('when the action refuses the coach, the receipt says nothing was changed; when the look cannot be made, it says that', async () => {
    const { sb, tables } = db();
    const p = stored(await updateEvent.plan(toolCtx(sb, coach()), { event_id: EVENT, ...keep, new_start: '16:00' }));
    actions.updateGolfEvent.mockResolvedValue({ success: false, error: 'Access denied' });
    expect(await updateEvent.commit(toolCtx(sb, coach()), p)).toMatchObject({ status: 'failed', summary: 'Access denied. Nothing was changed.' });
    tables.golf_events = { error: { message: 'timeout' } };
    expect((await updateEvent.commit(toolCtx(sb, coach()), p)).summary).toBe('Access denied. I could not check whether it went through: look in the Calendar before trying again.');
    await expect(updateEvent.commit(toolCtx(sb, playerWho(), 'player'), p)).rejects.toThrow('Only a coach can do that.');
  });
});

describe('cancel_event', () => {
  const cancelling = (tables: ReturnType<typeof fakeSb>['tables']) =>
    actions.deleteGolfEvent.mockImplementation(async (id: string) => {
      tables.golf_events!.rows!.find((r) => r.id === id)!.status = 'cancelled';
      return { success: true };
    });

  it('the card writes nothing and shows who is told, in the app and by e-mail, word for word', async () => {
    const { sb, writes } = db();
    const p = await cancelEvent.plan(toolCtx(sb, coach()), { event_id: EVENT, reason: 'Course is closed for  frost' });
    expect(writes).toEqual([]);
    expect(actions.deleteGolfEvent).not.toHaveBeenCalled();
    // Replies on, no sent invite list, not a meeting: the app tells the whole active team.
    expect(fact(p, 'Told (2)')).toBe('The whole active team: Avery Lane and Blake Ortiz');
    expect(fact(p, 'Will not be told')).toBe('Casey Moss (no account yet)');
    expect(fact(p, 'In the app they see')).toBe('Cancelled: Team practice\nThu, Nov 12 at 3:00 PM at Pine Hills GC — Course is closed for frost');
    expect(fact(p, 'By e-mail they get')).toMatch(/^Event cancelled: Team practice\nThis event has been cancelled\. Thu, Nov 12 at 3:00 PM at Pine Hills GC — Course is closed for frost\n/);
    expect(fact(p, 'What happens')).toMatch(/stays on the calendar marked cancelled/);
    expect(fact(p, 'When')).toMatch(/cannot be un-told/);
    expect(stored(p)).toEqual(p);
  });

  it('a meeting, or an event whose invites went out, tells only the invited; an event without replies tells nobody', async () => {
    const meeting = await cancelEvent.plan(toolCtx(db({ event_type: 'meeting' }, [{ event_id: EVENT, player_id: AVERY, notified_at: null }]).sb, coach()), { event_id: EVENT, reason: null });
    expect(fact(meeting, 'Told (1)')).toBe('Avery Lane');
    const sent = await cancelEvent.plan(toolCtx(db({}, [{ event_id: EVENT, player_id: BLAKE, notified_at: '2026-11-01T00:00:00Z' }, { event_id: EVENT, player_id: STRANGER, notified_at: null }]).sb, coach()), { event_id: EVENT, reason: null });
    expect(fact(sent, 'Told (2)')).toBe('Blake Ortiz, and 1 invited player no longer on the active roster');
    expect(JSON.stringify(sent)).not.toContain(STRANGER);
    const quiet = await cancelEvent.plan(toolCtx(db({ requires_rsvp: false }).sb, coach()), { event_id: EVENT, reason: null });
    expect(fact(quiet, 'Told')).toMatch(/^Nobody is notified/);
    expect(quiet.notifications).toEqual([]);
  });

  it('cancels through the app’s action and never asks it for the permanent delete', async () => {
    const { sb, tables, writes } = db();
    cancelling(tables);
    const withReason = stored(await cancelEvent.plan(toolCtx(sb, coach()), { event_id: EVENT, reason: 'Frost' }));
    const r = await cancelEvent.commit(toolCtx(sb, coach()), withReason);
    expect(actions.deleteGolfEvent.mock.calls).toEqual([[EVENT, { reason: 'Frost' }]]);
    expect(writes).toEqual([]);
    expect(r).toMatchObject({ status: 'completed', summary: 'Team practice is cancelled. It stays on the calendar marked cancelled.' });
    // A second commit of the same card finds it cancelled and does not call the action again (nobody is told twice).
    expect((await cancelEvent.commit(toolCtx(sb, coach()), withReason)).status).toBe('completed');
    expect(actions.deleteGolfEvent).toHaveBeenCalledTimes(1);
    // No source line in the tool passes `hard`.
    expect(readFileSync(join(process.cwd(), 'src/lib/coachhelm/v3/chat/tasks/event-edit-tasks.ts'), 'utf8')).not.toMatch(/hard:\s*true/);
  });

  it('cancels nothing when the event moved after the card, when the action refuses, or for a player or another team', async () => {
    const { sb, tables } = db();
    cancelling(tables);
    const p = stored(await cancelEvent.plan(toolCtx(sb, coach()), { event_id: EVENT, reason: null }));
    tables.golf_events!.rows![0]!.start_time = '2026-11-12T21:00:00+00:00';
    expect((await cancelEvent.commit(toolCtx(sb, coach()), p)).summary).toMatch(/^The event changed after this card was made.*Nothing was cancelled/);
    expect(actions.deleteGolfEvent).not.toHaveBeenCalled();

    const other = db();
    const q = stored(await cancelEvent.plan(toolCtx(other.sb, coach()), { event_id: EVENT, reason: null }));
    actions.deleteGolfEvent.mockResolvedValue({ success: false, error: 'Only coaches can delete team events' });
    expect(await cancelEvent.commit(toolCtx(other.sb, coach()), q)).toMatchObject({ status: 'failed', summary: 'Only coaches can delete team events. Nothing was cancelled.' });
    await expect(cancelEvent.plan(toolCtx(other.sb, playerWho(), 'player'), { event_id: EVENT, reason: null })).rejects.toThrow('Only a coach can do that.');
    await expect(cancelEvent.plan(toolCtx(other.sb, coach()), { event_id: FOREIGN, reason: null })).rejects.toThrow(/not on your team’s calendar/);
    await expect(cancelEvent.plan(toolCtx(db({ status: 'cancelled' }).sb, coach()), { event_id: EVENT, reason: null })).rejects.toThrow('That event is already cancelled.');
  });
});

describe('the words on the cards are still the app’s', () => {
  it('the update notice and the cancellation notice are built as these tools build them', () => {
    const rsvp = readFileSync(join(process.cwd(), 'src/lib/calendar/rsvp.ts'), 'utf8');
    expect(rsvp).toContain('if (!event.requires_rsvp) return;');
    expect(rsvp).toContain('title: `Event updated: ${event.title}`,');
    expect(rsvp).toContain("message: changes || `${formatEventDate(event, timeZone)} ${event.location ? `at ${event.location}` : ''}`.trim(),");
    expect(rsvp).toMatch(/function formatEventDate\(event: EventDateInput, timeZone: string \| null\): string \{\s*return formatNoticeWhen\(event\.start_time, event\.all_day, timeZone\);/);
    const fan = readFileSync(join(process.cwd(), 'src/lib/calendar/fan-out.ts'), 'utf8');
    expect(fan).toContain('if (!p.notifies) return;');
    expect(fan).toContain("const inviteesOnly = (evRow as { event_type?: string } | null)?.event_type === 'meeting' || invitedList;");
    expect(fan).toContain("const detail = `${startLabel}${p.location ? ` at ${p.location}` : ''}${p.reason ? ` — ${p.reason}` : ''}`;");
    expect(fan).toContain('title: `Cancelled: ${p.title}`,');
    expect(fan).toContain('title: `Event cancelled: ${p.title}`,');
    expect(fan).toContain('content: `This event has been cancelled. ${detail}`,');
    const action = readFileSync(join(process.cwd(), 'src/app/golf/actions/calendar-events.ts'), 'utf8');
    expect(action).toContain('notifies: existingEvent.requires_rsvp === true,');
  });

  it('both are tasks in a fixed order', () => {
    expect(eventEditTools().map((t) => [t.name, t.kind])).toEqual([['update_event', 'task'], ['cancel_event', 'task']]);
  });
});
