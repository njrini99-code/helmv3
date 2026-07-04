import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { excludeAuthNoise } from '@/lib/admin/data/triage';

/**
 * Activity tab — LOCAL, single-purpose reads owned by this route only (the
 * pinned data-lane contract at '@/lib/admin/data/activity' covers the feed
 * itself; the top stat strip and the team filter's option list are this
 * tab's own concern, so they live here rather than growing the shared
 * data-lane module with tab-specific aggregates).
 *
 * Every query is scoped + bounded: head:true counts (no row bodies ever
 * fetched for a number), a single `.limit()`ed team list. No N+1, no
 * fetch-everything-then-compute.
 */

/** UTC-midnight ISO boundary, `daysAgo` days back from `now`. Pure + tested
 *  so the today/yesterday windows below are verifiable without Supabase. */
export function isoStartOfUtcDay(now: Date, daysAgo = 0): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString();
}

export interface ActivityTodayStat {
  today: number;
  /** Signed delta vs the same count yesterday (today − yesterday). */
  delta: number;
}

export interface ActivityTodayStats {
  rounds: ActivityTodayStat;
  signIns: ActivityTodayStat;
  newUsers: ActivityTodayStat;
  errors: ActivityTodayStat;
}

function stat(today: number, yesterday: number): ActivityTodayStat {
  return { today, delta: today - yesterday };
}

/** CALLER must have passed requireSuperAdmin() — service-role reads. Eight
 *  independent head:true counts (today + yesterday × 4 metrics), run in
 *  parallel — never a row body fetched just to produce a number. */
export async function fetchActivityTodayStats(now: Date = new Date()): Promise<ActivityTodayStats> {
  const admin = createAdminClient();
  const todayStart = isoStartOfUtcDay(now, 0);
  const yesterdayStart = isoStartOfUtcDay(now, 1);

  const [
    roundsToday,
    roundsYesterday,
    baseballGamesToday,
    baseballGamesYesterday,
    signInsToday,
    signInsYesterday,
    newUsersToday,
    newUsersYesterday,
    errorsTodayQ,
    errorsYesterdayQ,
  ] = await Promise.all([
    admin.from('golf_rounds').select('id', { count: 'exact', head: true })
      .eq('status', 'completed').gte('created_at', todayStart),
    admin.from('golf_rounds').select('id', { count: 'exact', head: true })
      .eq('status', 'completed').gte('created_at', yesterdayStart).lt('created_at', todayStart),
    admin.from('baseball_games').select('id', { count: 'exact', head: true })
      .eq('status', 'completed').gte('created_at', todayStart),
    admin.from('baseball_games').select('id', { count: 'exact', head: true })
      .eq('status', 'completed').gte('created_at', yesterdayStart).lt('created_at', todayStart),
    admin.from('admin_events').select('id', { count: 'exact', head: true })
      .eq('event_type', 'login').gte('created_at', todayStart),
    admin.from('admin_events').select('id', { count: 'exact', head: true })
      .eq('event_type', 'login').gte('created_at', yesterdayStart).lt('created_at', todayStart),
    admin.from('users').select('id', { count: 'exact', head: true })
      .gte('created_at', todayStart),
    admin.from('users').select('id', { count: 'exact', head: true })
      .gte('created_at', yesterdayStart).lt('created_at', todayStart),
    excludeAuthNoise(
      admin.from('admin_events').select('id', { count: 'exact', head: true })
        .eq('event_type', 'error').in('severity', ['error', 'critical']).gte('created_at', todayStart),
    ),
    excludeAuthNoise(
      admin.from('admin_events').select('id', { count: 'exact', head: true })
        .eq('event_type', 'error').in('severity', ['error', 'critical'])
        .gte('created_at', yesterdayStart).lt('created_at', todayStart),
    ),
  ]);

  return {
    rounds: stat(
      (roundsToday.count ?? 0) + (baseballGamesToday.count ?? 0),
      (roundsYesterday.count ?? 0) + (baseballGamesYesterday.count ?? 0),
    ),
    signIns: stat(signInsToday.count ?? 0, signInsYesterday.count ?? 0),
    newUsers: stat(newUsersToday.count ?? 0, newUsersYesterday.count ?? 0),
    errors: stat(errorsTodayQ.count ?? 0, errorsYesterdayQ.count ?? 0),
  };
}

export interface TeamOption {
  id: string;
  name: string;
  sport: 'golf' | 'baseball';
}

/** Bounded to 500 — generous for the team-filter dropdown; never an
 *  unbounded `.select('*')`. CALLER must have passed requireSuperAdmin(). */
export async function fetchTeamOptions(): Promise<TeamOption[]> {
  const admin = createAdminClient();
  const [golfRes, baseballRes] = await Promise.all([
    admin
      .from('golf_teams')
      .select('id, name')
      .order('name', { ascending: true })
      .limit(500),
    admin
      .from('baseball_teams')
      .select('id, name')
      .order('name', { ascending: true })
      .limit(500),
  ]);
  if (golfRes.error) throw new Error(`fetchTeamOptions(golf): ${golfRes.error.message}`);
  if (baseballRes.error) throw new Error(`fetchTeamOptions(baseball): ${baseballRes.error.message}`);
  return [
    ...((golfRes.data ?? []) as unknown as Array<{ id: string; name: string }>).map((team) => ({ ...team, sport: 'golf' as const })),
    ...((baseballRes.data ?? []) as unknown as Array<{ id: string; name: string }>).map((team) => ({ ...team, sport: 'baseball' as const })),
  ].sort((a, b) => a.name.localeCompare(b.name));
}
