import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const a = vi.hoisted(() => ({ setTaskReminder: vi.fn() }));
vi.mock('@/app/golf/actions/tasks', () => ({ setTaskReminder: a.setTaskReminder }));
vi.mock('@/lib/calendar/availability', () => ({ resolveTeamTimeZone: async () => 'America/New_York' }));

import { AVERY, BLAKE, COACH_ID, OTHER_TEAM, STRANGER, TEAM, coachWho, fakeSb, playerWho, toolCtx } from '../../context/__tests__/fake-sb';
import type { StoredProposal } from '../kit';
import { setTaskReminderTool, taskReminderBody, taskTaskTools } from '../task-tasks';

const TASK = '90000000-0000-4000-8000-000000000001';
const FOREIGN = '90000000-0000-4000-8000-000000000002';
const CASEY = '99999999-9999-4999-8999-999999999999';
const person = (id: string, name: string) => ({ id, name, first_name: name.split(' ')[0]!, last_name: name.split(' ')[1] ?? null, graduation_year: null });
const coach = () => ({ ...coachWho(), roster: [person(AVERY, 'Avery Lane'), person(BLAKE, 'Blake Ortiz'), person(CASEY, 'Casey Moss')] });
const db = (over: { staff?: boolean; task?: Record<string, unknown> } = {}) =>
  fakeSb({
    golf_tasks: { rows: [{ id: TASK, team_id: TEAM, title: 'Hand in travel forms', due_date: '2026-11-14', status: 'pending', reminder_at: null, assigned_by: COACH_ID, ...over.task }, { id: FOREIGN, team_id: OTHER_TEAM, title: 'Rival task', due_date: null, status: 'pending', reminder_at: null, assigned_by: null }] },
    golf_team_coach_staff: { rows: over.staff === false ? [] : [{ id: 's1', team_id: TEAM, coach_id: COACH_ID }] },
    golf_task_assignments: { rows: [{ task_id: TASK, player_id: AVERY, status: 'completed' }, { task_id: TASK, player_id: BLAKE, status: 'pending' }, { task_id: TASK, player_id: CASEY, status: 'pending' }, { task_id: TASK, player_id: STRANGER, status: 'pending' }] },
    golf_players: { rows: [{ id: AVERY, user_id: 'u-a' }, { id: BLAKE, user_id: 'u-b' }, { id: CASEY, user_id: null }] },
  });
const fact = (p: StoredProposal, label: string | RegExp) => p.facts.find((f) => (typeof label === 'string' ? f.label === label : label.test(f.label)))?.value;
const stored = (p: StoredProposal) => JSON.parse(JSON.stringify(p)) as StoredProposal;
const input = { task_id: TASK, date: '2026-11-12', time: '19:00' };
const BODY = 'Reminder: "Hand in travel forms" is due on 11/14/2026';

beforeEach(() => {
  a.setTaskReminder.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-10T15:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('set_task_reminder', () => {
  it('the card writes nothing; names everyone who gets it, the exact words, and when', async () => {
    const { sb, writes } = db();
    const p = await setTaskReminderTool.plan(toolCtx(sb, coach()), input);
    expect(writes).toEqual([]);
    expect(a.setTaskReminder).not.toHaveBeenCalled();
    expect(p.summary).toBe('Remind 3 players about “Hand in travel forms” on Thu, Nov 12 at 7:00 PM.');
    expect(fact(p, 'Reminder')).toBe('Thu, Nov 12 at 7:00 PM, or within the hour after: reminders go out hourly.');
    // Avery has finished and still gets it (the app does not skip her); one assignee is off the roster and is counted, not named.
    expect(fact(p, 'To (3)')).toBe('Avery Lane and Blake Ortiz, and 1 assigned player no longer on the active roster');
    expect(fact(p, 'Will not get it')).toBe('Casey Moss (no account yet)');
    expect(fact(p, 'Also')).toBe('You get it too, as the coach who assigned the task.');
    expect(fact(p, 'They see')).toBe(`Task Reminder\n${BODY}`);
    expect(p.delivery).toMatchObject({ channels: ['in_app'], title: 'Task Reminder', body: BODY });
    expect(p.recipients?.map((r) => r.name)).toEqual(['Avery Lane', 'Blake Ortiz']);
    expect((p.input as { at: string }).at).toBe('2026-11-13T00:00:00.000Z');
    expect(JSON.stringify(p)).not.toContain(STRANGER);
    expect(stored(p)).toEqual(p);
  });

  it('those words and that audience are still what the app sends for the reminder this action queues', () => {
    const tasks = readFileSync(join(process.cwd(), 'src/app/golf/actions/tasks.ts'), 'utf8');
    expect(tasks).toContain(".update({ scheduled_for: reminderAt, reminder_type: 'in_app' })");
    expect(tasks).toMatch(/scheduled_for: reminderAt,\s*reminder_type: 'in_app',\s*sent: false,/);
    const rem = readFileSync(join(process.cwd(), 'src/app/golf/actions/task-reminders.ts'), 'utf8');
    expect(rem).toMatch(/if \(reminderType === 'in_app' \|\| reminderType === 'all'\) \{\s*await sendInAppNotification\(task, client\);/);
    expect(rem).toContain("const body = `Reminder: \"${task.title}\" is due${dueOn ? ` on ${dueOn}` : ' soon'}`;");
    expect(rem).toContain("title: 'Task Reminder',");
    expect(rem).toMatch(/\.from\('golf_task_assignments'\)\s*\.select\('player_id'\)\s*\.eq\('task_id', task\.id\);/);
    expect(taskReminderBody('Stretch', null)).toBe('Reminder: "Stretch" is due soon');
  });

  it('sets it through the app’s action once; a second commit finds it set', async () => {
    const { sb, tables, writes } = db();
    a.setTaskReminder.mockImplementation(async (id: string, at: string) => ((tables.golf_tasks!.rows!.find((r) => r.id === id)!.reminder_at = at), { success: true }));
    const p = stored(await setTaskReminderTool.plan(toolCtx(sb, coach()), input));
    expect(await setTaskReminderTool.commit(toolCtx(sb, coach()), p)).toMatchObject({ status: 'completed', summary: 'The reminder for “Hand in travel forms” is set for Thu, Nov 12 at 7:00 PM. It has not gone out yet.', notifications: [{ channel: 'in-app', recipients: 3, status: 'queued' }] });
    expect((await setTaskReminderTool.commit(toolCtx(sb, coach()), p)).status).toBe('completed');
    expect(a.setTaskReminder).toHaveBeenCalledExactlyOnceWith(TASK, '2026-11-13T00:00:00.000Z');
    expect(writes).toEqual([]);
    // Moving it says what it replaces.
    const moved = await setTaskReminderTool.plan(toolCtx(sb, coach()), { ...input, time: '20:00' });
    expect(fact(moved, 'Replaces')).toBe('The reminder now set for Thu, Nov 12 at 7:00 PM.');
  });

  it('draws no card for a time that has passed, a task of another team, a coach off the staff or a player', async () => {
    await expect(setTaskReminderTool.plan(toolCtx(db().sb, coach()), { ...input, date: '2026-11-09' })).rejects.toThrow(/already passed/);
    await expect(setTaskReminderTool.plan(toolCtx(db().sb, coach()), { ...input, task_id: FOREIGN })).rejects.toThrow(/not one of your team’s/);
    await expect(setTaskReminderTool.plan(toolCtx(db({ staff: false }).sb, coach()), input)).rejects.toThrow('Only this team’s coaches can do that.');
    const { sb, reads } = db();
    await expect(setTaskReminderTool.plan(toolCtx(sb, playerWho(), 'player'), input)).rejects.toThrow('Only a coach can do that.');
    expect(reads).toEqual([]);
  });

  it('changes nothing when the task changed after the card, when the time has passed, or when the action refuses', async () => {
    const { sb, tables } = db();
    const p = stored(await setTaskReminderTool.plan(toolCtx(sb, coach()), input));
    a.setTaskReminder.mockResolvedValue({ success: false, error: 'Not authorized for this team' });
    expect(await setTaskReminderTool.commit(toolCtx(sb, coach()), p)).toMatchObject({ status: 'failed', summary: 'Not authorized for this team. Nothing was changed.' });
    tables.golf_tasks!.rows![0]!.title = 'Hand in travel forms TODAY';
    expect((await setTaskReminderTool.commit(toolCtx(sb, coach()), p)).summary).toMatch(/^The task changed after this card was made.*Nothing was changed/);
    tables.golf_tasks!.rows![0]!.title = 'Hand in travel forms';
    vi.setSystemTime(new Date('2026-11-13T01:00:00Z'));
    expect((await setTaskReminderTool.commit(toolCtx(sb, coach()), p)).summary).toMatch(/^That time has passed since the card was made/);
    expect(a.setTaskReminder).toHaveBeenCalledTimes(1);
    await expect(setTaskReminderTool.commit(toolCtx(sb, playerWho(), 'player'), p)).rejects.toThrow('Only a coach can do that.');
    expect(taskTaskTools().map((t) => [t.name, t.kind])).toEqual([['set_task_reminder', 'task']]);
  });
});
