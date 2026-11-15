/**
 * CoachHelm chat: a reminder on a task that already exists.
 *
 *   set_task_reminder   set or move the reminder on one task: `setTaskReminder` (`golf/actions/tasks.ts`).
 *
 * What is sent, traced through `golf/actions/task-reminders.ts`: the action queues an `in_app` reminder; the hourly
 * job (`processReminders`) sends a queued `in_app` reminder with `sendInAppNotification` and nothing else, which
 * writes one notification per recipient titled "Task Reminder" with the body built below. The push and e-mail
 * wordings in that file belong to the other reminder types, which this action never queues. Recipients are every
 * assignee with an account, whether or not they have finished, and the coach who assigned the task
 * (`resolveTaskRecipients`). A test pins those lines.
 *
 * The rest of what a coach might ask of a task has no action behind it (INVENTORY.md, "Asked for and not possible"):
 * the app cannot edit, reassign or re-date a task, and only a player can tick their own.
 */
import 'server-only';
import { z } from 'zod';
import { setTaskReminder } from '@/app/golf/actions/tasks';
import { resolveTeamTimeZone } from '@/lib/calendar/availability';
import { formatNoticeWhen } from '@/lib/calendar/timezone';
import { formatTaskDueDate } from '@/lib/golf/task-overdue';
import { offsetMinutesFor } from '@/lib/golf/timezone';
import { keyOf } from '../action-planners';
import type { ProposalFact } from '../action-types';
import type { ChatTool, TaskTool, ToolContext } from '../engine/tool';
import { asPlayers, coachOnly, done, editing, failed, list, now, plural, requireTeamStaff, settle, unreached, withAccounts, type StoredProposal } from './kit';

const ReminderInput = z.strictObject({
  task_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD, team timezone.'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).describe('24-hour HH:MM.'),
});
type ReminderInput = z.infer<typeof ReminderInput>;
/** What the coach can change on the card itself: when the reminder goes out. */
const reminderEdits = editing(ReminderInput, { date: 'Date', time: 'Time' }, { time: 'time' });
const ReminderStored = z.object({ task_id: z.string().uuid(), at: z.string(), title: z.string(), body: z.string(), when: z.string(), told: z.number().int().nonnegative() });

async function taskRow(ctx: ToolContext, teamId: string, id: string) {
  const { data, error } = await ctx.sb.from('golf_tasks').select('id, team_id, title, due_date, status, reminder_at, assigned_by').eq('id', id).eq('team_id', teamId).maybeSingle();
  if (error) throw new Error('The task could not be read just now. Try again in a moment.');
  return data && data.team_id === teamId ? data : null;
}

/** The reminder's body, as `sendInAppNotification` writes it. */
export const taskReminderBody = (title: string, dueDate: string | null): string => {
  const dueOn = formatTaskDueDate(dueDate);
  return `Reminder: "${title}" is due${dueOn ? ` on ${dueOn}` : ' soon'}`;
};

export const setTaskReminderTool: TaskTool<ReminderInput, StoredProposal> = {
  kind: 'task',
  name: 'set_task_reminder',
  description: 'Set or move the reminder on one existing task, when the coach asks to remind players about it at a day and time. The app sends its own in-app reminder to everyone the task is assigned to; the wording cannot be changed. A task’s title, assignees and due date cannot be changed here.',
  input: ReminderInput,
  progress: () => 'Preparing the reminder',
  plan: async (ctx, input) => {
    const who = coachOnly(ctx);
    const task = await taskRow(ctx, who.team_id, input.task_id);
    if (!task) throw new Error('That task is not one of your team’s. Read the open tasks first.');
    await requireTeamStaff(ctx, who);
    const zone = await resolveTeamTimeZone([who.team_id], ctx.sb as never, 'coachhelm.set_task_reminder');
    const offset = offsetMinutesFor(input.date, input.time, zone);
    if (offset === null) throw new Error('The team’s timezone could not be read, so the reminder time could not be worked out.');
    const at = new Date(Date.parse(`${input.date}T${input.time}:00Z`) + offset * 60_000).toISOString();
    if (Date.parse(at) <= Date.now()) throw new Error('That time has already passed. Ask the coach for a time still to come.');
    if (task.reminder_at && Date.parse(task.reminder_at) === Date.parse(at)) throw new Error('The reminder is already set for that time.');

    const { data: assigned, error } = await ctx.sb.from('golf_task_assignments').select('player_id').eq('task_id', task.id);
    if (error) throw new Error('Who the task is assigned to could not be read just now, so nothing was prepared. Try again in a moment.');
    const ids = [...new Set((assigned ?? []).map((a) => a.player_id))];
    const accounts = await withAccounts(ctx, ids);
    if (!accounts) throw new Error('Who can be reminded could not be confirmed just now, so nothing was prepared. Try again in a moment.');
    const on = who.roster.filter((p) => ids.includes(p.id));
    const to = on.filter((p) => accounts.has(p.id));
    const cannot = on.filter((p) => !accounts.has(p.id));
    const others = ids.length - on.length;
    const told = to.length + others;
    const body = taskReminderBody(task.title, task.due_date);
    const when = formatNoticeWhen(at, false, zone);
    const assigner = task.assigned_by === who.coach_id ? 'You get it too, as the coach who assigned the task.' : task.assigned_by ? 'The coach who assigned the task gets it too.' : null;
    const facts: ProposalFact[] = [
      { label: 'Task', value: task.title },
      { label: 'Reminder', value: `${when}, or within the hour after: reminders go out hourly.` },
      ...(task.reminder_at ? [{ label: 'Replaces', value: `The reminder now set for ${formatNoticeWhen(task.reminder_at, false, zone)}.` }] : []),
      { label: `To (${told})`, value: told === 0 ? 'Nobody the task is assigned to has an account yet.' : `${list(to.map((p) => p.name))}${others ? `${to.length ? ', and ' : ''}${plural(others, 'assigned player')} no longer on the active roster` : ''}` },
      ...(cannot.length ? [{ label: 'Will not get it', value: `${list(cannot.map((p) => p.name))} (no account yet)` }] : []),
      ...(assigner ? [{ label: 'Also', value: assigner }] : []),
      { label: 'They see', value: `Task Reminder\n${body}` },
      { label: 'Who gets it', value: 'Everyone the task is assigned to, including players who have already finished it.' },
    ];
    return {
      action: task.reminder_at ? 'Move a task reminder' : 'Set a task reminder',
      summary: `Remind ${plural(told, 'player')} about “${task.title}” on ${when}.`,
      facts,
      affects: to.map((p) => ({ kind: 'player' as const, id: p.id, label: p.name })),
      notifications: told > 0 ? [`${plural(told, 'player')} ${told === 1 ? 'gets' : 'get'} an in-app notification at that time: “Task Reminder”, “${body}”.`] : [],
      missing: [],
      recipients: asPlayers(to),
      not_reached: unreached(cannot),
      delivery: { channels: ['in_app'], title: 'Task Reminder', body, ...(assigner || others ? { note: [assigner, others ? `${plural(others, 'assigned player')} no longer on the active roster ${others === 1 ? 'gets' : 'get'} it too.` : null].filter(Boolean).join(' ') } : {}) },
      undo: { window: true, after: 'Change or clear the reminder on the task in Team Hub, any time before it goes out.' },
      idempotency_key: keyOf(['set_task_reminder', task.id, at]),
      editable: reminderEdits.fields(input),
      tool: 'set_task_reminder',
      input: { task_id: task.id, at, title: task.title, body, when, told, asked: input },
      planned_at: now(),
    };
  },
  revise: async (ctx, proposal, edits) => {
    coachOnly(ctx);
    return setTaskReminderTool.plan(ctx, reminderEdits.merge(proposal, edits));
  },
  commit: async (ctx, proposal) => {
    const name = 'set_task_reminder';
    const who = coachOnly(ctx);
    const parsed = ReminderStored.safeParse(proposal.input);
    if (!parsed.success) return failed(name, 'This card could not be read back, so it was not run. Nothing was changed.', false);
    const s = parsed.data;
    let task: Awaited<ReturnType<typeof taskRow>>;
    try {
      task = await taskRow(ctx, who.team_id, s.task_id);
    } catch {
      return failed(name, 'The task could not be read just now. Nothing was changed.', true);
    }
    if (!task) return failed(name, 'That task is no longer one of your team’s. Nothing was changed.', false);
    // What players would be sent must still be what the card showed (the title or the due date may have moved).
    if (taskReminderBody(task.title, task.due_date) !== s.body) return failed(name, 'The task changed after this card was made, so the reminder would no longer say what you approved. Nothing was changed. Ask again.', false);
    if (Date.parse(s.at) <= Date.now()) return failed(name, 'That time has passed since the card was made. Nothing was changed. Ask for a later time.', false);
    return settle({
      action: name,
      nothing: 'Nothing was changed.',
      where: 'the task in Team Hub',
      look: async () => {
        const t = await taskRow(ctx, who.team_id, s.task_id).catch(() => undefined);
        return t === undefined ? null : Boolean(t?.reminder_at) && Date.parse(t!.reminder_at as string) === Date.parse(s.at);
      },
      write: () => setTaskReminder(s.task_id, s.at),
      receipt: () => done(name, `The reminder for “${s.title}” is set for ${s.when}. It has not gone out yet.`, [{ kind: 'task_reminder', count: 1, id: s.task_id, href: `/golf/dashboard/team-hub?tab=tasks&task=${s.task_id}`, label: s.title }], s.told > 0 ? [{ channel: 'in-app', recipients: s.told, status: 'queued' }] : []),
    });
  },
};

/** In a fixed order. Coach surfaces only. */
export function taskTaskTools(): ChatTool[] {
  return [setTaskReminderTool] as ChatTool[];
}
