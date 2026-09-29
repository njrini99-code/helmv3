import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

export interface ChNextEvent {
  id: string;
  title: string;
  /** "Today", "Tomorrow", "In 3 days", resolved in the team's timezone. */
  whenLabel: string;
  /** "Thu, Oct 16 · 8:42 AM · Pinehurst No. 2" */
  metaLabel: string;
}

export interface ChShellData {
  nextEvent: ChNextEvent | null;
  /** Null when the read failed: the badge hides rather than claiming zero. */
  pendingJoinRequests: number | null;
}

/**
 * The shell's own reads: the sidebar's next-event card and the Roster badge.
 * Both degrade to "hidden" on failure; the shell must never take a page down.
 */
export async function loadClubhouseShell(teamId: string | undefined): Promise<ChShellData> {
  if (!teamId) return { nextEvent: null, pendingJoinRequests: null };
  const supabase = await createClient();
  const [eventRes, joinRes, tzRes] = await Promise.all([
    supabase
      .from('golf_events')
      .select('id, title, start_time, all_day, location')
      .eq('team_id', teamId)
      .gte('start_time', new Date().toISOString())
      .is('cancelled_at', null)
      .order('start_time', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('golf_team_join_requests')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('status', 'pending'),
    supabase.from('golf_team_settings').select('timezone').eq('team_id', teamId).maybeSingle(),
  ]);
  // A failed timezone read falls back to the product default, same as dashboard-data.
  const timezone = (!tzRes.error && tzRes.data?.timezone) || 'America/New_York';

  if (eventRes.error) {
    void logServerError(`[clubhouse shell] next event read failed: ${describeError(eventRes.error)}`, {
      action: 'clubhouse.shell.nextEvent',
      featureArea: 'calendar',
    });
  }
  if (joinRes.error) {
    void logServerError(`[clubhouse shell] join request count failed: ${describeError(joinRes.error)}`, {
      action: 'clubhouse.shell.joinRequests',
      featureArea: 'teams',
    });
  }

  const e = eventRes.error ? null : eventRes.data;
  return {
    nextEvent: e ? describeEvent(e, timezone) : null,
    pendingJoinRequests: joinRes.error ? null : (joinRes.count ?? 0),
  };
}

function dayNumber(d: Date, timezone: string): number {
  const [y, m, day] = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(d)
    .split('-')
    .map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, day ?? 1) / 86_400_000;
}

function describeEvent(
  e: { id: string; title: string; start_time: string; all_day: boolean | null; location: string | null },
  timezone: string,
): ChNextEvent {
  const start = new Date(e.start_time);
  const days = dayNumber(start, timezone) - dayNumber(new Date(), timezone);
  const whenLabel = days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
  const date = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', month: 'short', day: 'numeric' }).format(start);
  const time = e.all_day
    ? 'All day'
    : new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(start);
  const metaLabel = [date, time, e.location].filter(Boolean).join(' \u00b7 ');
  return { id: e.id, title: e.title, whenLabel, metaLabel };
}
