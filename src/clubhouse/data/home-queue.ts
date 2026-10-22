import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { CLASS_EVENT_TYPE } from '@/lib/calendar/class-events';
import { eventDaySpan } from '@/lib/calendar/timezone';
import { getAnnouncementsWithMeta } from '@/app/golf/actions/announcements';
import { chLogServer } from '../lib/track-server';
import { assignmentsFor, attendanceFor, HUB_TASK_CAP, notAckedFor, overdueTaskCount, replyIsClosed, rsvpCounts, rsvpQueue, taskStatus, unackedPostCount } from './hub';
import { ymd } from './home-clock';

/**
 * Coach Home's "Waiting on you" (P002, spec B §2): what is waiting on the coach, each part counted by the read and the
 * rule the screen that holds it uses, so Home and that screen show one number. Join requests are the sidebar badge's
 * count (Roster); replies, tasks and posts are Team Hub's reads with its pure counts (`rsvpQueue`, `overdueTaskCount`,
 * `unackedPostCount` in data/hub.ts). Each part reads on its own (Promise.allSettled): a part that fails is null and
 * logged, never 0, and the rest still count.
 */
export interface ChCoachQueue {
  /** Pending requests to join the team; null when the read failed. */
  joinRequests: number | null;
  /** Players who haven't replied to this week's events that still take a reply, and on which events; null when it failed. */
  replies: { missing: number; events: Array<{ id: string; date: string; missing: number }> } | null;
  /** Tasks past their due day that not everyone has done; null when it failed. */
  overdueTasks: number | null;
  /** Posts asking for an acknowledgement someone hasn't given; null when it failed. */
  unackedPosts: number | null;
}

type Client = Awaited<ReturnType<typeof createClient>>;

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const calendarDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function loadCoachQueue(
  supabase: Client,
  input: { teamId: string; userId: string; now: Date; tz: Promise<string>; names: Promise<Map<string, string> | null> },
): Promise<ChCoachQueue> {
  const { teamId, now } = input;
  const fail = (part: string) => (err: unknown) => {
    chLogServer('home', `queue ${part}`, err);
    return null;
  };

  // The sidebar's Roster badge read (shell.ts), so Home and the badge agree.
  const joins = (async () => {
    const res = await supabase.from('golf_team_join_requests').select('id', { count: 'exact', head: true }).eq('team_id', teamId).eq('status', 'pending');
    if (res.error) throw res.error;
    return res.count ?? 0;
  })();

  // Team Hub's RSVPs section (loadTeamHub, coach): this week's events that ask for replies, from now to a week on in the
  // team's day; plus the reply rules (replyIsClosed), so an event past its deadline or under way asks nothing more.
  const replies = (async () => {
    // Asked for before the team's zone is known, to a bound that holds a week on in any zone (a zone's date is at most a
    // day from the UTC date), then cut to the Hub's own bound below, so the replies' read isn't a round trip later.
    const wideEnd = addDays(ymd(now, 'UTC'), 8);
    const read = supabase
      .from('golf_events')
      .select('id, start_time, end_time, all_day, status, cancelled_at, rsvp_deadline, requires_rsvp')
      .eq('team_id', teamId)
      .neq('event_type', CLASS_EVENT_TYPE)
      .eq('requires_rsvp', true)
      .is('cancelled_at', null)
      .gte('start_time', now.toISOString())
      .lt('start_time', `${wideEnd}T23:59:59Z`)
      .order('start_time', { ascending: true })
      .limit(50);
    const [res, tz] = await Promise.all([read, input.tz]);
    if (res.error) throw res.error;
    const weekEnd = `${addDays(ymd(now, tz), 7)}T23:59:59Z`;
    const events = (res.data ?? []).filter((e) => Date.parse(e.start_time) < Date.parse(weekEnd));
    const attendance = await attendanceFor(supabase, events.map((e) => e.id));
    if (attendance.error) throw new Error('attendance did not load');
    const nowMs = now.getTime();
    const queue = rsvpQueue(events.map((e) => ({ eventId: e.id, counts: rsvpCounts(attendance.byEvent.get(e.id) ?? []), open: !replyIsClosed(e, nowMs) })));
    if (!queue) throw new Error('replies did not load');
    const byId = new Map(events.map((e) => [e.id, e]));
    return {
      missing: queue.missing,
      events: queue.events.map((q) => {
        const e = byId.get(q.eventId)!;
        const span = eventDaySpan(e, tz);
        return { id: q.eventId, date: span ? calendarDate(span.first) : ymd(new Date(e.start_time), tz), missing: q.missing };
      }),
    };
  })();

  // Team Hub's task read (capped as the Hub's is) and its status rule (taskStatus), with completion from the assignments.
  const tasks = (async () => {
    const res = await supabase
      .from('golf_tasks')
      .select('id, due_date')
      .eq('team_id', teamId)
      .is('parent_task_id', null)
      .order('due_date', { ascending: false, nullsFirst: true })
      .limit(HUB_TASK_CAP);
    if (res.error) throw res.error;
    const rows = res.data ?? [];
    const [assignments, tz] = await Promise.all([assignmentsFor(supabase, rows.map((t) => t.id)), input.tz]);
    if (assignments.error) throw new Error('assignments did not load');
    return overdueTaskCount(rows.map((t) => ({ status: taskStatus(t.due_date, assignments.byTask.get(t.id), tz) })));
  })();

  // Team Hub's announcements read and who is left on each post asking for an acknowledgement (an all-team post's
  // audience is the roster: without it, who is left is unknown).
  const posts = (async () => {
    const res = await getAnnouncementsWithMeta(teamId, input.userId, true);
    if (!res.success) throw new Error('error' in res ? String(res.error) : 'announcements did not load');
    const anns = res.data ?? [];
    const names = await input.names;
    if (!names) throw new Error('roster did not load');
    const asking = anns.filter((a) => a.requires_acknowledgement);
    const waiting = await notAckedFor(supabase, asking.map((a) => a.id), names);
    if (!waiting) throw new Error('acknowledgements did not load');
    return unackedPostCount(asking.map((a) => ({ needAck: true, notAcked: waiting.get(a.id) ?? [] })));
  })();

  const [j, r, t, p] = await Promise.allSettled([joins, replies, tasks, posts]);
  const value = <T,>(s: PromiseSettledResult<T>, part: string): T | null => (s.status === 'fulfilled' ? s.value : fail(part)(s.reason));
  return { joinRequests: value(j, 'joinRequests'), replies: value(r, 'replies'), overdueTasks: value(t, 'tasks'), unackedPosts: value(p, 'posts') };
}
