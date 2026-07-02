import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { computeActivation } from '@/lib/admin/metrics';

export interface AuthFeedRow {
  id: string;
  event_type: string;
  title: string;
  severity: string;
  user_email: string | null;
  sport: string | null;
  created_at: string;
}
export interface LockoutRow {
  email: string;
  failed_attempts: number;
  locked_until: string | null;
  last_attempt: string | null;
}
export interface SessionRow {
  session_id: string;
  user_id: string;
  email: string;
  created_at: string;
  updated_at: string;
  last_sign_in_at: string | null;
}

/** SQL-free burst heuristic: N failures inside the trailing window. */
export function detectFailureBurst(
  rows: Array<{ created_at: string }>,
  windowMinutes: number,
  threshold: number,
  now: Date,
): boolean {
  const cutoff = now.getTime() - windowMinutes * 60_000;
  const inWindow = rows.filter((r) => new Date(r.created_at).getTime() >= cutoff);
  return inWindow.length >= threshold;
}

/** One point in a daily trend series, oldest → newest. Shape matches
 *  Fairway's TrendChart `TrendPoint` ({ x, y }) so callers can pass it
 *  straight through without a remapping step. */
export interface DailyCount {
  x: string;
  y: number;
}

/**
 * Bucket rows into `days` trailing UTC-calendar-day counts, oldest → newest.
 * Pure + honest: days with zero matching rows still get an explicit 0 bucket
 * (never silently dropped), so a genuinely quiet week renders as a flat-zero
 * series rather than a shorter one.
 */
export function bucketDailyCounts(
  rows: ReadonlyArray<{ created_at: string }>,
  days: number,
  now: Date,
): DailyCount[] {
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    buckets.set(key, 0);
  }
  for (const row of rows) {
    const key = new Date(row.created_at).toISOString().slice(0, 10);
    const current = buckets.get(key);
    if (current !== undefined) buckets.set(key, current + 1);
  }
  // MM-DD label — compact enough for an inline sparkline x-axis.
  return Array.from(buckets.entries()).map(([iso, y]) => ({ x: iso.slice(5), y }));
}

/** CALLER must have passed requireSuperAdmin(). */
export async function fetchAuthTab(): Promise<{
  feed: AuthFeedRow[];
  lockouts: LockoutRow[];
  burst: boolean;
  funnel: { signups7d: number; activated7d: number; activationRate: number };
  signInSeries: DailyCount[];
}> {
  const admin = createAdminClient();
  const ago7d = new Date(Date.now() - 7 * 86400_000).toISOString();
  const ago24h = new Date(Date.now() - 86400_000).toISOString();

  const [feedRes, lockoutRes, failures24h, signupsRes, golfActive, baseballActive, liftActive] =
    await Promise.all([
      admin.from('admin_events')
        .select('id, event_type, title, severity, user_email, sport, created_at')
        .in('event_type', ['login', 'signup', 'security'])
        .gte('created_at', ago7d)
        .order('created_at', { ascending: false })
        .limit(200),
      admin.from('login_attempts')
        .select('email, failed_attempts, locked_until, last_attempt')
        .gt('failed_attempts', 0)
        .order('last_attempt', { ascending: false })
        .limit(50),
      admin.from('admin_events')
        .select('created_at')
        .eq('event_type', 'security')
        .gte('created_at', ago24h),
      admin.from('users')
        .select('id, created_at')
        .gte('created_at', ago7d),
      admin.from('golf_rounds').select('player_id').gte('created_at', ago7d).limit(1000),
      admin.from('baseball_games').select('id').gte('created_at', ago7d).limit(1000),
      admin.from('helm_lifting_sessions').select('athlete_id').gte('created_at', ago7d).limit(1000),
    ]);

  const signups7d = signupsRes.data?.length ?? 0;
  // Activation proxy: any first-week activity row in any sport. Exact
  // per-user join lives in the Users tab; the funnel tile is a rate.
  const activity7d =
    (golfActive.data?.length ?? 0) + (baseballActive.data?.length ?? 0) + (liftActive.data?.length ?? 0);
  const activated7d = Math.min(signups7d, activity7d);

  const feed = (feedRes.data ?? []) as AuthFeedRow[];
  // Rows with a null created_at can't participate in a time-window burst
  // check — drop them rather than coercing null → a fabricated timestamp.
  const failureRows = (failures24h.data ?? []).filter(
    (r): r is { created_at: string } => r.created_at !== null,
  );

  return {
    feed,
    lockouts: (lockoutRes.data ?? []) as LockoutRow[],
    burst: detectFailureBurst(failureRows, 15, 4, new Date()),
    funnel: {
      signups7d,
      activated7d,
      activationRate: computeActivation({ signups: signups7d, activated: activated7d }),
    },
    // Sign-in trend for the "at a glance" chart — logins only, 7 trailing days.
    signInSeries: bucketDailyCounts(
      feed.filter((row) => row.event_type === 'login'),
      7,
      new Date(),
    ),
  };
}

/** USER-SCOPED client — get_active_sessions() gates on auth.uid() via
 *  is_super_admin() and Forbids under service_role (by design). */
export async function fetchActiveSessions(): Promise<SessionRow[]> {
  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: 'get_active_sessions',
  ) => Promise<{ data: SessionRow[] | null; error: { message: string } | null }>;
  const { data, error } = await rpc('get_active_sessions');
  if (error) throw new Error(`get_active_sessions failed: ${error.message}`);
  return data ?? [];
}
