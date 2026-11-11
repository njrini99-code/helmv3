import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const actions = vi.hoisted(() => ({ sendEventReminderToPlayers: vi.fn(), markAttendance: vi.fn() }));
vi.mock('@/app/golf/actions/calendar-events', () => ({ sendEventReminderToPlayers: actions.sendEventReminderToPlayers }));
vi.mock('@/app/golf/actions/attendance', () => ({ markAttendance: actions.markAttendance }));
// The team's zone as the action resolves it; the formatter is the real one.
vi.mock('@/lib/calendar/availability', () => ({ resolveTeamTimeZone: async () => 'America/New_York' }));

import { modelToolFor } from '../../engine/model';
import { AVERY, BLAKE, COACH_ID, OTHER_TEAM, STRANGER, TEAM, coachWho, fakeSb, playerWho, toolCtx } from '../../context/__tests__/fake-sb';
import { eventTaskTools, recordAttendance, sendEventReminder, type EventTaskProposal } from '../event-tasks';

const EVENT = '20000000-0000-4000-8000-000000000001';
const FOREIGN_EVENT = '20000000-0000-4000-8000-000000000002';
const CASEY = '99999999-9999-4999-8999-999999999999';

const person = (id: string, name: string) => ({ id, name, first_name: name.split(' ')[0]!, last_name: name.split(' ')[1] ?? null, graduation_year: null });
/** Three on the roster: Avery and Blake have accounts, Casey has none yet. */
const coach = () => ({ ...coachWho(), roster: [person(AVERY, 'Avery Lane'), person(BLAKE, 'Blake Ortiz'), person(CASEY, 'Casey Moss')] });

const db = (over: { staff?: boolean; attendance?: Array<Record<string, unknown>>; event?: Record<string, unknown> } = {}) =>
  fakeSb({
    golf_events: {
      rows: [
        { id: EVENT, team_id: TEAM, title: 'Team practice', start_time: '2026-11-12T20:00:00Z', all_day: false, location: 'Pine Hills GC', status: 'confirmed', ...over.event },
        { id: FOREIGN_EVENT, team_id: OTHER_TEAM, title: 'Rival practice', start_time: '2026-11-12T20:00:00Z', all_day: false, location: null, status: 'confirmed' },
      ],
    },
    golf_team_coach_staff: { rows: over.staff === false ? [] : [{ id: 's1', team_id: TEAM, coach_id: COACH_ID }] },
    golf_event_attendance: {
      rows: over.attendance ?? [
        { event_id: EVENT, player_id: AVERY, status: 'pending', attendance_status: null },
        { event_id: EVENT, player_id: BLAKE, status: 'accepted', attendance_status: 'no_show' },
        { event_id: EVENT, player_id: CASEY, status: null, attendance_status: null },
        // Somebody from another team on the event's list must never be named or reminded.
        { event_id: EVENT, player_id: STRANGER, status: 'pending', attendance_status: null },
      ],
    },
    golf_players: { rows: [{ id: AVERY, user_id: 'u-avery' }, { id: BLAKE, user_id: 'u-blake' }, { id: CASEY, user_id: null }, { id: STRANGER, user_id: 'u-stranger' }] },
  });

const fact = (p: EventTaskProposal, label: string | RegExp) => p.facts.find((f) => (typeof label === 'string' ? f.label === label : label.test(f.label)))?.value;
const WORDS = { title: 'Reminder: Team practice', message: 'Thu, Nov 12 at 3:00 PM at Pine Hills GC' };

beforeEach(() => {
  actions.sendEventReminderToPlayers.mockReset();
  actions.markAttendance.mockReset();
});

describe('send_event_reminder: the card', () => {
  it('writes nothing, and shows exactly who gets it and exactly what they get', async () => {
    const { sb, writes } = db();
    const p = await sendEventReminder.plan(toolCtx(sb, coach()), { event_id: EVENT, recipients: 'invited', player_ids: [] });
    expect(writes).toEqual([]);
    expect(actions.sendEventReminderToPlayers).not.toHaveBeenCalled();
    expect(p.summary).toBe('Remind 2 players about Team practice.');
    expect(fact(p, 'To (2)')).toBe('Avery Lane and Blake Ortiz');
    expect(fact(p, 'Will not get it')).toBe('Casey Moss (no account yet)');
    expect(fact(p, 'They see')).toBe(`${WORDS.title}\n${WORDS.message}`);
    expect(fact(p, 'When')).toMatch(/Undo window/);
    expect(p.notifications).toEqual([`2 players get an in-app notification: “${WORDS.title}”, “${WORDS.message}”.`]);
    expect(p.affects.filter((a) => a.kind === 'player').map((a) => a.label)).toEqual(['Avery Lane', 'Blake Ortiz']);
    expect(p.input).toEqual({ event_id: EVENT, player_ids: [AVERY, BLAKE], ...WORDS });
    // The card survives storage unchanged: the engine hands commit the stored copy.
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
    // Nobody from outside the roster is on it, by name or by id.
    expect(JSON.stringify(p)).not.toContain(STRANGER);
  });

  it('"who hasn’t replied" is the invited roster players with no answer', async () => {
    const { sb } = db();
    const p = await sendEventReminder.plan(toolCtx(sb, coach()), { event_id: EVENT, recipients: 'not_replied', player_ids: [] });
    expect(fact(p, 'To (1)')).toBe('Avery Lane');
    expect(fact(p, 'Will not get it')).toBe('Casey Moss (no account yet)');
    expect((p.input as { player_ids: string[] }).player_ids).toEqual([AVERY]);
  });

  it('says so instead of drawing a card when there is nobody to remind', async () => {
    const replied = [{ event_id: EVENT, player_id: AVERY, status: 'accepted' }, { event_id: EVENT, player_id: BLAKE, status: 'declined' }];
    await expect(sendEventReminder.plan(toolCtx(db({ attendance: replied }).sb, coach()), { event_id: EVENT, recipients: 'not_replied', player_ids: [] })).rejects.toThrow('All 2 invited players have replied. There is nobody to remind.');
    await expect(sendEventReminder.plan(toolCtx(db({ attendance: [] }).sb, coach()), { event_id: EVENT, recipients: 'invited', player_ids: [] })).rejects.toThrow(/Nobody is invited/);
    await expect(sendEventReminder.plan(toolCtx(db().sb, coach()), { event_id: EVENT, recipients: 'named', player_ids: [CASEY] })).rejects.toThrow(/has an account yet/);
    await expect(sendEventReminder.plan(toolCtx(db({ event: { status: 'cancelled' } }).sb, coach()), { event_id: EVENT, recipients: 'invited', player_ids: [] })).rejects.toThrow('That event was cancelled.');
  });

  it('the words on the card are still the words the app’s action sends', () => {
    // The action file can export only actions, so its two lines are repeated in reminderWords. If the action's wording moves, this fails and names the place.
    const src = readFileSync(join(process.cwd(), 'src/app/golf/actions/calendar-events.ts'), 'utf8');
    expect(src).toContain('const timeStr = formatNoticeWhen(event.start_time, event.all_day, timeZone);');
    expect(src).toMatch(/const message = event\.location\s*\?\s*`\$\{timeStr\} at \$\{event\.location\}`\s*:\s*timeStr;/);
    expect(src).toContain('title: `Reminder: ${event.title}`,');
    expect(src).toContain("notification_type: 'event_reminder_manual' as const,");
  });
});

describe('send_event_reminder: who may', () => {
  const input = { event_id: EVENT, recipients: 'invited' as const, player_ids: [] };

  it('a player is refused before anything is read', async () => {
    const { sb, reads } = db();
    await expect(sendEventReminder.plan(toolCtx(sb, playerWho(), 'player'), input)).rejects.toThrow('Only a coach can do that.');
    await expect(sendEventReminder.commit(toolCtx(sb, playerWho(), 'player'), { input: { event_id: EVENT, player_ids: [AVERY], ...WORDS } } as never)).rejects.toThrow('Only a coach can do that.');
    expect(reads).toEqual([]);
    expect(actions.sendEventReminderToPlayers).not.toHaveBeenCalled();
  });

  it('a coach who is not on this team’s staff gets no card: the permission the action itself requires', async () => {
    await expect(sendEventReminder.plan(toolCtx(db({ staff: false }).sb, coach()), input)).rejects.toThrow('Only this team’s coaches can do that.');
  });

  it('a staff check that could not run denies, and says it was the check that failed', async () => {
    const { sb, tables } = db();
    tables.golf_team_coach_staff = { error: { message: 'timeout' } };
    await expect(sendEventReminder.plan(toolCtx(sb, coach()), input)).rejects.toThrow(/could not be checked just now/);
  });

  it('another team’s event and a player off the roster are refused', async () => {
    await expect(sendEventReminder.plan(toolCtx(db().sb, coach()), { ...input, event_id: FOREIGN_EVENT })).rejects.toThrow(/not on your team’s calendar/);
    await expect(sendEventReminder.plan(toolCtx(db().sb, coach()), { event_id: EVENT, recipients: 'named', player_ids: [AVERY, STRANGER] })).rejects.toThrow('One of those players is not on your active roster.');
  });

  it('when the action refuses at commit, the receipt says nothing was sent and repeats its reason', async () => {
    const { sb } = db();
    const p = await sendEventReminder.plan(toolCtx(sb, coach()), input);
    actions.sendEventReminderToPlayers.mockResolvedValue({ success: false, error: "Only this team's coaches can send reminders" });
    const r = await sendEventReminder.commit(toolCtx(sb, coach()), JSON.parse(JSON.stringify(p)));
    expect(r).toMatchObject({ status: 'failed', summary: "Only this team's coaches can send reminders. Nothing was sent.", notifications: [], created: [] });
  });
});

describe('send_event_reminder: the send', () => {
  /** The action's own write, standing in: an upsert keyed on event, player and kind, as `golf_calendar_notifications` is. */
  const outbox = () => {
    const rows = new Map<string, { event: string; player: string }>();
    actions.sendEventReminderToPlayers.mockImplementation(async (event: string, players: string[]) => {
      for (const player of players) rows.set(`${event}|${player}|event_reminder_manual`, { event, player });
      return { success: true, data: { sent: players.length } };
    });
    return rows;
  };

  it('sends to exactly the players on the card, through the app’s action, and writes nothing itself', async () => {
    const { sb, writes } = db();
    const rows = outbox();
    const p = await sendEventReminder.plan(toolCtx(sb, coach()), { event_id: EVENT, recipients: 'invited', player_ids: [] });
    const r = await sendEventReminder.commit(toolCtx(sb, coach()), JSON.parse(JSON.stringify(p)));
    expect(actions.sendEventReminderToPlayers).toHaveBeenCalledExactlyOnceWith(EVENT, [AVERY, BLAKE]);
    expect(writes).toEqual([]);
    expect(r).toMatchObject({ status: 'completed', summary: 'The reminder about Team practice went to 2 players.', notifications: [{ channel: 'in-app', recipients: 2, status: 'sent' }], retryable: false });
    expect(rows.size).toBe(2);
  });

  it('a second commit of the same card lands on the same rows: nobody is reminded twice', async () => {
    const { sb } = db();
    const rows = outbox();
    const p = JSON.parse(JSON.stringify(await sendEventReminder.plan(toolCtx(sb, coach()), { event_id: EVENT, recipients: 'invited', player_ids: [] })));
    const first = await sendEventReminder.commit(toolCtx(sb, coach()), p);
    const second = await sendEventReminder.commit(toolCtx(sb, coach()), p);
    expect(actions.sendEventReminderToPlayers.mock.calls[1]).toEqual(actions.sendEventReminderToPlayers.mock.calls[0]);
    expect(rows.size).toBe(2);
    expect(second.status).toBe(first.status);
  });

  it('sends nothing when the event moved after the card was made', async () => {
    const { sb, tables } = db();
    outbox();
    const p = JSON.parse(JSON.stringify(await sendEventReminder.plan(toolCtx(sb, coach()), { event_id: EVENT, recipients: 'invited', player_ids: [] })));
    tables.golf_events!.rows![0]!.start_time = '2026-11-12T21:30:00Z';
    const r = await sendEventReminder.commit(toolCtx(sb, coach()), p);
    expect(r.status).toBe('failed');
    expect(r.summary).toMatch(/^The event changed after this card was made.*Nothing was sent\./);
    expect(actions.sendEventReminderToPlayers).not.toHaveBeenCalled();
  });

  it('says how many it reached when that is fewer than the card, and never claims a send that did not confirm', async () => {
    const { sb } = db();
    const p = JSON.parse(JSON.stringify(await sendEventReminder.plan(toolCtx(sb, coach()), { event_id: EVENT, recipients: 'invited', player_ids: [] })));
    actions.sendEventReminderToPlayers.mockResolvedValueOnce({ success: true, data: { sent: 1 } });
    expect(await sendEventReminder.commit(toolCtx(sb, coach()), p)).toMatchObject({ status: 'partial', summary: 'The reminder about Team practice went to 1 player.', partial_failures: ['1 player of the 2 on the card did not get it.'] });
    actions.sendEventReminderToPlayers.mockResolvedValueOnce({ success: true, data: { sent: 0 } });
    expect(await sendEventReminder.commit(toolCtx(sb, coach()), p)).toMatchObject({ status: 'failed', notifications: [] });
    actions.sendEventReminderToPlayers.mockResolvedValueOnce({ success: false, error: 'Failed to send reminders' });
    expect((await sendEventReminder.commit(toolCtx(sb, coach()), p)).summary).toBe('The reminder may or may not have gone out: the send did not confirm. Sending it again is safe, nobody gets it twice.');
    actions.sendEventReminderToPlayers.mockRejectedValueOnce(new Error('socket hang up'));
    expect((await sendEventReminder.commit(toolCtx(sb, coach()), p)).status).toBe('failed');
    actions.sendEventReminderToPlayers.mockResolvedValueOnce({ success: false, error: "Couldn't confirm who to notify, so nothing was sent. Please try again." });
    expect((await sendEventReminder.commit(toolCtx(sb, coach()), p)).summary).toBe("Couldn't confirm who to notify, so nothing was sent. Please try again.");
  });

  it('a card that does not read back, or names nobody still on the roster, is not sent', async () => {
    const { sb } = db();
    expect((await sendEventReminder.commit(toolCtx(sb, coach()), { input: { nonsense: true } } as never)).summary).toMatch(/could not be read back.*Nothing was sent/);
    expect((await sendEventReminder.commit(toolCtx(sb, coach()), { input: { event_id: EVENT, player_ids: [STRANGER], ...WORDS } } as never)).summary).toMatch(/Nothing was sent/);
    expect(actions.sendEventReminderToPlayers).not.toHaveBeenCalled();
  });
});

describe('record_attendance', () => {
  const input = { event_id: EVENT, present: [AVERY, BLAKE], late: [], no_show: [CASEY] };
  /** The action's own write, standing in: an upsert on (event, player) into the table the read-back reads. */
  const saving = (tables: ReturnType<typeof fakeSb>['tables'], fail: Record<string, { landed: boolean }> = {}) => {
    actions.markAttendance.mockImplementation(async (event: string, player: string, mark: string) => {
      const rows = tables.golf_event_attendance!.rows!;
      const f = fail[player];
      if (!f || f.landed) {
        const row = rows.find((r) => r.event_id === event && r.player_id === player);
        if (row) row.attendance_status = mark;
        else rows.push({ event_id: event, player_id: player, status: null, attendance_status: mark });
      }
      return f ? { success: false, error: 'Failed to save attendance. Please try again.' } : { success: true };
    });
  };

  it('the card writes nothing and shows every player with the mark they will get, the mark that changes, and that nobody is told', async () => {
    const { sb, writes } = db();
    const p = await recordAttendance.plan(toolCtx(sb, coach()), input);
    expect(writes).toEqual([]);
    expect(actions.markAttendance).not.toHaveBeenCalled();
    expect(p.summary).toBe('Record attendance for 3 players at Team practice.');
    expect(fact(p, 'Event')).toBe('Team practice · Thu, Nov 12 at 3:00 PM');
    expect(fact(p, 'Present (2)')).toBe('Avery Lane and Blake Ortiz');
    expect(fact(p, 'No-show (1)')).toBe('Casey Moss');
    expect(fact(p, /^Late/)).toBeUndefined();
    expect(fact(p, 'Changes a mark already recorded')).toBe('Blake Ortiz: No-show now, Present after');
    expect(fact(p, 'Not marked')).toBe('Nobody: the whole roster is on this card.');
    expect(fact(p, 'Players are told')).toBe('Nothing is sent to players.');
    expect(p.notifications).toEqual([]);
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });

  it('saves each mark through the app’s action, and a second commit writes the same rows', async () => {
    const { sb, tables, writes } = db();
    saving(tables);
    const p = JSON.parse(JSON.stringify(await recordAttendance.plan(toolCtx(sb, coach()), input)));
    const r = await recordAttendance.commit(toolCtx(sb, coach()), p);
    expect(actions.markAttendance.mock.calls).toEqual([[EVENT, AVERY, 'present'], [EVENT, BLAKE, 'present'], [EVENT, CASEY, 'no_show']]);
    expect(writes).toEqual([]);
    expect(r).toMatchObject({ status: 'completed', summary: 'Attendance is saved for 3 players at Team practice. Nothing was sent to players.', notifications: [] });
    const after = JSON.stringify(tables.golf_event_attendance!.rows);
    const again = await recordAttendance.commit(toolCtx(sb, coach()), p);
    expect(again.status).toBe('completed');
    expect(JSON.stringify(tables.golf_event_attendance!.rows)).toBe(after);
  });

  it('reads back before saying a mark was not saved', async () => {
    // The action reported a failure for Blake, but his row is there: it is saved.
    const landed = db();
    saving(landed.tables, { [BLAKE]: { landed: true } });
    const p = JSON.parse(JSON.stringify(await recordAttendance.plan(toolCtx(landed.sb, coach()), input)));
    expect((await recordAttendance.commit(toolCtx(landed.sb, coach()), p)).status).toBe('completed');

    // It failed and the row is not there: the receipt names him and only him.
    const lost = db();
    saving(lost.tables, { [BLAKE]: { landed: false } });
    const r = await recordAttendance.commit(toolCtx(lost.sb, coach()), p);
    expect(r).toMatchObject({ status: 'partial', summary: 'Attendance is saved for 2 players at Team practice, and not for Blake Ortiz.', partial_failures: ['Blake Ortiz: Failed to save attendance. Please try again.'] });

    // Everything failed and nothing is there.
    const none = db();
    saving(none.tables, { [AVERY]: { landed: false }, [BLAKE]: { landed: false }, [CASEY]: { landed: false } });
    expect(await recordAttendance.commit(toolCtx(none.sb, coach()), p)).toMatchObject({ status: 'failed', summary: 'Failed to save attendance. Please try again. Nothing was saved.' });

    // It failed and the look could not be made: it does not claim either way.
    const blind = db();
    saving(blind.tables, { [BLAKE]: { landed: true } });
    const q = JSON.parse(JSON.stringify(await recordAttendance.plan(toolCtx(blind.sb, coach()), input)));
    blind.tables.golf_event_attendance = { error: { message: 'timeout' } };
    expect((await recordAttendance.commit(toolCtx(blind.sb, coach()), q)).summary).toMatch(/I could not check which marks were saved/);
  });

  it('refuses a player, a coach off the staff, a player off the roster, a name in two lists and an empty request', async () => {
    await expect(recordAttendance.plan(toolCtx(db().sb, playerWho(), 'player'), input)).rejects.toThrow('Only a coach can do that.');
    await expect(recordAttendance.commit(toolCtx(db().sb, playerWho(), 'player'), { input: {} } as never)).rejects.toThrow('Only a coach can do that.');
    await expect(recordAttendance.plan(toolCtx(db({ staff: false }).sb, coach()), input)).rejects.toThrow('Only this team’s coaches can do that.');
    await expect(recordAttendance.plan(toolCtx(db().sb, coach()), { ...input, event_id: FOREIGN_EVENT })).rejects.toThrow(/not on your team’s calendar/);
    await expect(recordAttendance.plan(toolCtx(db().sb, coach()), { ...input, late: [STRANGER] })).rejects.toThrow('One of those players is not on your active roster.');
    await expect(recordAttendance.plan(toolCtx(db().sb, coach()), { ...input, late: [AVERY] })).rejects.toThrow('Avery Lane is in two lists. Put each player in one.');
    await expect(recordAttendance.plan(toolCtx(db().sb, coach()), { event_id: EVENT, present: [], late: [], no_show: [] })).rejects.toThrow('Say who was present, late or missing.');
    expect(actions.markAttendance).not.toHaveBeenCalled();
  });

  it('when the action refuses the coach at commit, nothing is claimed', async () => {
    const { sb } = db();
    const p = JSON.parse(JSON.stringify(await recordAttendance.plan(toolCtx(sb, coach()), input)));
    actions.markAttendance.mockResolvedValue({ success: false, error: 'Only coaches of this team can manage attendance' });
    // Nothing landed: the rows read back as they were (Blake still a no-show, the others unmarked).
    const r = await recordAttendance.commit(toolCtx(sb, coach()), p);
    expect(r.status).not.toBe('completed');
    expect(r.summary).toMatch(/Only coaches of this team can manage attendance/);
  });
});

describe('the two tools as the model is given them', () => {
  it('are tasks, in a fixed order', () => {
    expect(eventTaskTools().map((t) => [t.name, t.kind])).toEqual([['send_event_reminder', 'task'], ['record_attendance', 'task']]);
    expect(eventTaskTools().map((t) => t.name)).toEqual(eventTaskTools().map((t) => t.name));
  });

  it.each(eventTaskTools().map((t) => [t.name, t] as const))('%s: a flat strict object, every property required, enums for choices, nothing that changes in the description', (_name, tool) => {
    const def = modelToolFor(tool);
    const schema = def.input_schema as { additionalProperties?: boolean; required?: string[]; properties: Record<string, unknown> };
    expect(schema.additionalProperties).toBe(false);
    expect([...(schema.required ?? [])].sort()).toEqual(Object.keys(schema.properties).sort());
    expect(JSON.stringify(schema.properties)).not.toMatch(/"type":"object"/);
    expect(def.description).not.toMatch(/\d{4}/);
    expect(tool.progress({} as never)).toMatch(/^Preparing/);
  });
});
