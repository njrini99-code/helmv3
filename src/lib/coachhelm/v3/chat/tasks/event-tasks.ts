/**
 * CoachHelm chat: two tasks on an event that already exists. INVENTORY.md beside this file says why these two.
 *
 *   send_event_reminder   an in-app reminder to chosen players, through `sendEventReminderToPlayers`.
 *   record_attendance     present, late or no-show for players at one event, through `markAttendance`.
 *
 * Both are on the engine's contract (`engine/tool.ts`): `plan` reads what the card must show and writes nothing; after
 * Confirm and the Undo window the engine calls `commit` with the stored proposal. Neither adds a write path: every
 * write is the app's own server action, with that action's validation and its own check that the caller coaches the
 * event's team. `plan` makes the same check first, so a card is never shown to someone the action would refuse.
 *
 * Every read here uses the signed-in session client. This file has no admin client.
 *
 * What the coach is shown before a reminder goes out is exactly who gets it, by name, and exactly what they get, word
 * for word. The words are built here with the two functions the action itself uses (`resolveTeamTimeZone`,
 * `formatNoticeWhen`), and `commit` builds them again from the event as it then stands: if the event moved after the
 * card was made, nothing is sent and the coach is told, because what would go out is no longer what they approved.
 *
 * Retries. The engine's ledger lets one card commit once. Should a commit run twice anyway, both actions land on the
 * same rows: the reminder is an upsert on (event, player, kind) and attendance an upsert on (event, player).
 */
import 'server-only';
import { z } from 'zod';
import { markAttendance } from '@/app/golf/actions/attendance';
import { sendEventReminderToPlayers } from '@/app/golf/actions/calendar-events';
import { resolveTeamTimeZone } from '@/lib/calendar/availability';
import { formatNoticeWhen } from '@/lib/calendar/timezone';
import { keyOf } from '../action-planners';
import type { ActionProposal, ActionReceipt, ProposalFact } from '../action-types';
import { CoachContextError, type CoachChatContext } from '../context';
import { isPlayerContext, type ChatTool, type TaskTool, type ToolContext } from '../engine/tool';

/** What every task here returns from `plan`, in the shape TOOLS's tasks use: the card, the tool, the input the write will use, and when it was planned. JSON-safe. */
export type EventTaskProposal = ActionProposal & { tool: string; input: unknown; planned_at: string };

const now = () => new Date().toISOString();
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (names: readonly string[]): string => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

function coachOnly(ctx: ToolContext): CoachChatContext {
  if (isPlayerContext(ctx.who)) throw new CoachContextError('Only a coach can do that.', 403);
  return ctx.who;
}

interface EventRow {
  id: string;
  team_id: string;
  title: string;
  start_time: string;
  all_day: boolean | null;
  location: string | null;
  status: string | null;
}

/** The event, only if it is on the coach's own team. The team is compared here as well as filtered in the query. */
async function ownEvent(ctx: ToolContext, who: CoachChatContext, eventId: string): Promise<EventRow> {
  const { data, error } = await ctx.sb.from('golf_events').select('id, team_id, title, start_time, all_day, location, status').eq('id', eventId).eq('team_id', who.team_id).maybeSingle();
  if (error) throw new Error('The event could not be read just now. Try again in a moment.');
  if (!data || data.team_id !== who.team_id) throw new Error('That event is not on your team’s calendar. Find it with the schedule reader first.');
  if (data.status === 'cancelled') throw new Error('That event was cancelled.');
  return data as EventRow;
}

/**
 * The permission both actions require: the caller is on the staff of the event's team. A read that fails denies (a
 * check that could not run must not pass) and says so as a failed read, not as "you are not a coach".
 */
async function requireStaff(ctx: ToolContext, who: CoachChatContext): Promise<void> {
  const { data, error } = await ctx.sb.from('golf_team_coach_staff').select('id').eq('team_id', who.team_id).eq('coach_id', who.coach_id).maybeSingle();
  if (error) throw new Error('Your access to this event could not be checked just now. Try again in a moment.');
  if (!data) throw new CoachContextError('Only this team’s coaches can do that.', 403);
}

const failed = (action: string, summary: string, retryable: boolean, error?: string): ActionReceipt => ({ status: 'failed', action, summary, created: [], notifications: [], partial_failures: [], ...(error ? { error } : {}), retryable, at: now() });

// ---------------------------------------------------------------------------------------------------------------------
// send_event_reminder
// ---------------------------------------------------------------------------------------------------------------------

const ReminderInput = z.strictObject({
  event_id: z.string().uuid().describe('The event’s id, from the schedule reader.'),
  recipients: z.enum(['not_replied', 'invited', 'named']).describe('not_replied: invited players who have not answered. invited: everyone invited. named: only the players in player_ids.'),
  player_ids: z.array(z.string().uuid()).max(80).describe('Roster player ids when recipients is named; otherwise an empty list.'),
});
type ReminderInput = z.infer<typeof ReminderInput>;

const ReminderStored = z.object({ event_id: z.string().uuid(), player_ids: z.array(z.string().uuid()).min(1), title: z.string(), message: z.string() });
type ReminderStored = z.infer<typeof ReminderStored>;

/**
 * The reminder as a player receives it. The same construction as `sendEventReminderToPlayersImpl`
 * (`calendar-events.ts`): that file is `'use server'` and can export only actions, so the two lines are repeated here
 * with the same two helpers, and `commit` refuses to send if they no longer give what the card showed.
 */
export async function reminderWords(ctx: ToolContext, event: EventRow): Promise<{ title: string; message: string }> {
  const timeZone = await resolveTeamTimeZone([event.team_id], ctx.sb as never, 'coachhelm.send_event_reminder');
  const when = formatNoticeWhen(event.start_time, event.all_day, timeZone);
  return { title: `Reminder: ${event.title}`, message: event.location ? `${when} at ${event.location}` : when };
}

const PRE_SEND_ERRORS = /not found|only this team|couldn.t confirm who|not authenticated|at least one player/i;

export const sendEventReminder: TaskTool<ReminderInput, EventTaskProposal> = {
  kind: 'task',
  name: 'send_event_reminder',
  description:
    'Send players an in-app reminder about one event already on the calendar. Use it when the coach asks to remind or nudge players about a practice, qualifier, meeting or trip day. Choose who: the invited players who have not replied, everyone invited, or named players. It shows the coach a card with every recipient by name and the reminder’s exact words, and sends only after they confirm. It cannot change the wording or the event.',
  input: ReminderInput,
  progress: () => 'Preparing the reminder',
  plan: async (ctx, input) => {
    const who = coachOnly(ctx);
    const event = await ownEvent(ctx, who, input.event_id);
    await requireStaff(ctx, who);

    let ids: string[];
    if (input.recipients === 'named') {
      if (input.player_ids.length === 0) throw new Error('Name at least one player to remind.');
      ids = [...new Set(input.player_ids)];
      const off = ids.filter((id) => !who.roster.some((p) => p.id === id));
      if (off.length) throw new CoachContextError('One of those players is not on your active roster.', 403);
    } else {
      const { data, error } = await ctx.sb.from('golf_event_attendance').select('player_id, status').eq('event_id', event.id);
      if (error) throw new Error('Who is invited could not be read just now, so nothing was prepared. Try again in a moment.');
      const invited = (data ?? []).filter((r) => who.roster.some((p) => p.id === r.player_id));
      if (invited.length === 0) throw new Error('Nobody is invited to that event, so there is nobody to remind. Name the players to remind instead.');
      const waiting = invited.filter((r) => !r.status || r.status === 'pending');
      if (input.recipients === 'not_replied' && waiting.length === 0) throw new Error(`All ${invited.length} invited players have replied. There is nobody to remind.`);
      ids = (input.recipients === 'not_replied' ? waiting : invited).map((r) => r.player_id);
    }

    // Who can actually receive it: a player with no account yet has nowhere for a notification to go. The action drops them; the card says so first.
    const { data: accounts, error: accountsError } = await ctx.sb.from('golf_players').select('id, user_id').in('id', ids);
    if (accountsError) throw new Error('Who can receive it could not be confirmed just now, so nothing was prepared. Try again in a moment.');
    const reachable = new Set((accounts ?? []).filter((p) => Boolean(p.user_id)).map((p) => p.id));
    const nameOf = (id: string) => who.roster.find((p) => p.id === id)?.name ?? 'A player';
    const to = who.roster.filter((p) => ids.includes(p.id) && reachable.has(p.id));
    const cannot = ids.filter((id) => !reachable.has(id)).map(nameOf);
    if (to.length === 0) throw new Error('None of those players has an account yet, so a reminder would reach nobody.');

    const words = await reminderWords(ctx, event);
    const facts: ProposalFact[] = [
      { label: 'Event', value: `${event.title} · ${words.message}` },
      { label: `To (${to.length})`, value: list(to.map((p) => p.name)) },
      ...(cannot.length ? [{ label: 'Will not get it', value: `${list(cannot)} (no account yet)` }] : []),
      { label: 'They see', value: `${words.title}\n${words.message}` },
      { label: 'How', value: 'A notification in the app that opens the event.' },
      { label: 'When', value: 'When the Undo window closes, a few seconds after you confirm.' },
    ];
    const stored: ReminderStored = { event_id: event.id, player_ids: to.map((p) => p.id), ...words };
    return {
      action: 'Send an event reminder',
      summary: `Remind ${plural(to.length, 'player')} about ${event.title}.`,
      facts,
      affects: [{ kind: 'event', id: event.id, label: event.title }, ...to.map((p) => ({ kind: 'player' as const, id: p.id, label: p.name }))],
      notifications: [`${plural(to.length, 'player')} ${to.length === 1 ? 'gets' : 'get'} an in-app notification: “${words.title}”, “${words.message}”.`],
      missing: [],
      idempotency_key: keyOf(['send_event_reminder', event.id, input.recipients, to.map((p) => p.id.slice(0, 8)).sort().join('')]),
      tool: 'send_event_reminder',
      input: stored,
      planned_at: now(),
    };
  },
  commit: async (ctx, proposal) => {
    const name = 'send_event_reminder';
    const who = coachOnly(ctx);
    const parsed = ReminderStored.safeParse(proposal.input);
    if (!parsed.success) return failed(name, 'This card could not be read back, so it was not sent. Nothing was sent.', false);
    const stored = parsed.data;
    // Only players still on the roster: someone removed since the card was made gets nothing.
    const ids = stored.player_ids.filter((id) => who.roster.some((p) => p.id === id));
    if (ids.length === 0) return failed(name, 'None of those players is on your roster any more. Nothing was sent.', false);
    let event: EventRow;
    try {
      event = await ownEvent(ctx, who, stored.event_id);
      const words = await reminderWords(ctx, event);
      if (words.title !== stored.title || words.message !== stored.message) return failed(name, 'The event changed after this card was made, so the reminder would no longer say what you approved. Nothing was sent. Ask for the reminder again.', false);
    } catch (err) {
      return failed(name, `${err instanceof Error ? err.message : 'The event could not be read.'} Nothing was sent.`, true);
    }

    const result = await sendEventReminderToPlayers(event.id, ids).catch((err: unknown) => ({ success: false as const, error: err instanceof Error ? err.message : 'Failed to send reminders', data: undefined }));
    if (!result.success) {
      const reason = result.error?.trim() || 'The reminder did not go through.';
      // The action's checks all run before its one write; an error from the write itself leaves it unknown, and a second send lands on the same rows.
      return PRE_SEND_ERRORS.test(reason)
        ? failed(name, /nothing was sent/i.test(reason) ? reason : `${reason.replace(/[.\s]*$/, '.')} Nothing was sent.`, true, reason)
        : failed(name, 'The reminder may or may not have gone out: the send did not confirm. Sending it again is safe, nobody gets it twice.', true, reason);
    }
    const sent = result.data?.sent ?? 0;
    const short = ids.length - sent;
    return {
      status: sent === 0 ? 'failed' : short > 0 ? 'partial' : 'completed',
      action: name,
      summary: sent === 0 ? 'The reminder reached nobody: none of those players could be sent a notification. Nothing was sent.' : `The reminder about ${event.title} went to ${plural(sent, 'player')}.`,
      created: sent > 0 ? [{ kind: 'reminder', count: sent, href: `/golf/dashboard/calendar?event=${event.id}`, label: event.title }] : [],
      notifications: sent > 0 ? [{ channel: 'in-app', recipients: sent, status: 'sent' }] : [],
      partial_failures: short > 0 && sent > 0 ? [`${plural(short, 'player')} of the ${ids.length} on the card did not get it.`] : [],
      retryable: sent === 0,
      at: now(),
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// record_attendance
// ---------------------------------------------------------------------------------------------------------------------

const MARKS = ['present', 'late', 'no_show'] as const;
type Mark = (typeof MARKS)[number];
const MARK_WORDS: Record<Mark, string> = { present: 'Present', late: 'Late', no_show: 'No-show' };

const Ids = z.array(z.string().uuid()).max(80);
const AttendanceInput = z.strictObject({
  event_id: z.string().uuid().describe('The event’s id, from the schedule reader.'),
  present_player_ids: Ids.describe('Roster players who were there. An empty list if none.'),
  late_player_ids: Ids.describe('Roster players who came late. An empty list if none.'),
  no_show_player_ids: Ids.describe('Roster players who did not come. An empty list if none.'),
});
type AttendanceInput = z.infer<typeof AttendanceInput>;

const AttendanceStored = z.object({ event_id: z.string().uuid(), title: z.string(), marks: z.array(z.object({ player_id: z.string().uuid(), name: z.string(), mark: z.enum(MARKS) })).min(1) });
type AttendanceStored = z.infer<typeof AttendanceStored>;

/** Each player's mark at the event as it stands, or null when it could not be read. */
async function marksNow(ctx: ToolContext, eventId: string): Promise<Map<string, string | null> | null> {
  const { data, error } = await ctx.sb.from('golf_event_attendance').select('player_id, attendance_status').eq('event_id', eventId);
  if (error) return null;
  return new Map((data ?? []).map((r) => [r.player_id, r.attendance_status]));
}

export const recordAttendance: TaskTool<AttendanceInput, EventTaskProposal> = {
  kind: 'task',
  name: 'record_attendance',
  description:
    'Record who was present, late or a no-show at one event on the calendar. Use it when the coach tells you who was or was not at a practice or meeting. Put each player in exactly one list; "everyone except" means the rest of the roster goes in present. It shows the coach a card with every player and the mark they will get, and saves after they confirm. Nothing is sent to players.',
  input: AttendanceInput,
  progress: () => 'Preparing attendance',
  plan: async (ctx, input) => {
    const who = coachOnly(ctx);
    const event = await ownEvent(ctx, who, input.event_id);
    await requireStaff(ctx, who);

    const asked: Array<[Mark, string[]]> = [['present', input.present_player_ids], ['late', input.late_player_ids], ['no_show', input.no_show_player_ids]];
    const seen = new Map<string, Mark>();
    for (const [mark, ids] of asked) {
      for (const id of ids) {
        const player = who.roster.find((p) => p.id === id);
        if (!player) throw new CoachContextError('One of those players is not on your active roster.', 403);
        const already = seen.get(id);
        if (already && already !== mark) throw new Error(`${player.name} is in two lists. Put each player in one.`);
        seen.set(id, mark);
      }
    }
    if (seen.size === 0) throw new Error('Say who was present, late or missing.');

    const current = await marksNow(ctx, event.id);
    if (!current) throw new Error('The attendance already recorded could not be read just now, so nothing was prepared. Try again in a moment.');
    // In roster order, so the card reads the same whatever order the names were said in.
    const marks = who.roster.filter((p) => seen.has(p.id)).map((p) => ({ player_id: p.id, name: p.name, mark: seen.get(p.id) as Mark }));
    const by = (mark: Mark) => marks.filter((m) => m.mark === mark).map((m) => m.name);
    const changes = marks.filter((m) => current.get(m.player_id) && current.get(m.player_id) !== m.mark).map((m) => `${m.name}: ${MARK_WORDS[current.get(m.player_id) as Mark] ?? current.get(m.player_id)} now, ${MARK_WORDS[m.mark]} after`);
    const when = formatNoticeWhen(event.start_time, event.all_day, who.timezone);
    const facts: ProposalFact[] = [
      { label: 'Event', value: `${event.title} · ${when}` },
      ...MARKS.filter((mark) => by(mark).length > 0).map((mark) => ({ label: `${MARK_WORDS[mark]} (${by(mark).length})`, value: list(by(mark)) })),
      ...(changes.length ? [{ label: 'Changes a mark already recorded', value: changes.join('; ') }] : []),
      { label: 'Not marked', value: who.roster.length - marks.length === 0 ? 'Nobody: the whole roster is on this card.' : `${plural(who.roster.length - marks.length, 'player')} on the roster ${who.roster.length - marks.length === 1 ? 'is' : 'are'} left as they are.` },
      { label: 'Players are told', value: 'Nothing is sent to players.' },
    ];
    const stored: AttendanceStored = { event_id: event.id, title: event.title, marks };
    return {
      action: 'Record attendance',
      summary: `Record attendance for ${plural(marks.length, 'player')} at ${event.title}.`,
      facts,
      affects: [{ kind: 'event', id: event.id, label: event.title }, ...marks.map((m) => ({ kind: 'player' as const, id: m.player_id, label: m.name }))],
      notifications: [],
      missing: [],
      idempotency_key: keyOf(['record_attendance', event.id, marks.map((m) => `${m.player_id.slice(0, 8)}${m.mark[0]}`).join('')]),
      tool: 'record_attendance',
      input: stored,
      planned_at: now(),
    };
  },
  commit: async (ctx, proposal) => {
    const name = 'record_attendance';
    const who = coachOnly(ctx);
    const parsed = AttendanceStored.safeParse(proposal.input);
    if (!parsed.success) return failed(name, 'This card could not be read back, so it was not saved. Nothing was saved.', false);
    const stored = parsed.data;
    const marks = stored.marks.filter((m) => who.roster.some((p) => p.id === m.player_id));
    if (marks.length === 0) return failed(name, 'None of those players is on your roster any more. Nothing was saved.', false);

    const errors = new Map<string, string>();
    // One at a time: the action authorises each call, and a burst of a whole roster would only race itself.
    for (const m of marks) {
      const r = await markAttendance(stored.event_id, m.player_id, m.mark).catch((err: unknown) => ({ success: false as const, error: err instanceof Error ? err.message : 'Failed to save attendance.' }));
      if (!r.success) errors.set(m.player_id, r.error ?? 'Failed to save attendance.');
    }

    // A write can land and still report failure (a cache refresh that throws after the row is saved), so what failed is read back before anything is called unsaved.
    let unknown = false;
    if (errors.size > 0) {
      const current = await marksNow(ctx, stored.event_id);
      if (!current) unknown = true;
      else for (const m of marks) if (errors.has(m.player_id) && current.get(m.player_id) === m.mark) errors.delete(m.player_id);
    }
    const lost = marks.filter((m) => errors.has(m.player_id));
    const saved = marks.length - lost.length;
    const created = saved > 0 ? [{ kind: 'attendance', count: saved, href: `/golf/dashboard/calendar?event=${stored.event_id}`, label: stored.title }] : [];
    if (lost.length === 0) return { status: 'completed', action: name, summary: `Attendance is saved for ${plural(marks.length, 'player')} at ${stored.title}. Nothing was sent to players.`, created, notifications: [], partial_failures: [], retryable: false, at: now() };
    const reason = [...new Set(lost.map((m) => errors.get(m.player_id) as string))][0] ?? 'Failed to save attendance.';
    if (unknown) return failed(name, `${reason.replace(/[.\s]*$/, '.')} I could not check which marks were saved: look at the event in the Calendar. Saving again is safe, it writes the same marks.`, true, reason);
    if (saved === 0) return failed(name, `${reason.replace(/[.\s]*$/, '.')} Nothing was saved.`, true, reason);
    return { status: 'partial', action: name, summary: `Attendance is saved for ${plural(saved, 'player')} at ${stored.title}, and not for ${list(lost.map((m) => m.name))}.`, created, notifications: [], partial_failures: lost.map((m) => `${m.name}: ${errors.get(m.player_id)}`), error: reason, retryable: true, at: now() };
  },
};

/** The task tools this folder adds, in a fixed order (the order is part of the cached prefix). Coach surfaces only. */
export function eventTaskTools(): ChatTool[] {
  return [sendEventReminder, recordAttendance] as ChatTool[];
}
