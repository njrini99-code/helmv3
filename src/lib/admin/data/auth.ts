import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { computeActivation } from '@/lib/admin/metrics';

export type AdminClient = ReturnType<typeof createAdminClient>;

export interface AuthFeedRow {
  id: string;
  event_type: string;
  title: string;
  severity: string;
  user_email: string | null;
  /** Nullable — some legacy/system rows never carried a user_id. Callers
   *  render a link to `/admin/users/[id]` only when present. */
  user_id: string | null;
  sport: string | null;
  created_at: string;
}
export interface LockoutRow {
  email: string;
  failed_attempts: number;
  locked_until: string | null;
  last_attempt: string | null;
  /** `login_attempts` is keyed by email only (no user_id column) — resolved
   *  via a secondary lookup against `users.email` so rows can still link to
   *  `/admin/users/[id]`. Null when the email doesn't match any account
   *  (e.g. a typo'd login that never had a real user behind it). */
  user_id: string | null;
}
export interface SessionRow {
  session_id: string;
  user_id: string;
  email: string;
  created_at: string;
  updated_at: string;
  last_sign_in_at: string | null;
}

/** Validated /admin/auth query-param filters — mirrors the parseErrorsFilters
 *  convention (src/lib/admin/data/errors.ts). */
export interface AuthTabFilters {
  sport?: 'golf' | 'baseball' | 'shared';
  eventType?: 'login' | 'signup' | 'security';
  /** Case-insensitive substring match against user_email / login_attempts.email. */
  q?: string;
}

const AUTH_SPORT_VALUES = new Set(['golf', 'baseball', 'shared']);
const AUTH_EVENT_TYPE_VALUES = new Set(['login', 'signup', 'security']);

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Parse /admin/auth's searchParams into a validated filter set. Unknown or
 *  invalid values are dropped rather than thrown — an operator with a stale
 *  bookmarked URL still gets the unfiltered tab, never an error page. */
export function parseAuthFilters(
  searchParams: Record<string, string | string[] | undefined>,
): AuthTabFilters {
  const filters: AuthTabFilters = {};
  const sport = firstParam(searchParams.sport);
  if (sport && AUTH_SPORT_VALUES.has(sport)) filters.sport = sport as AuthTabFilters['sport'];
  const eventType = firstParam(searchParams.eventType);
  if (eventType && AUTH_EVENT_TYPE_VALUES.has(eventType)) {
    filters.eventType = eventType as AuthTabFilters['eventType'];
  }
  const q = firstParam(searchParams.q)?.trim();
  if (q) filters.q = q;
  return filters;
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

/**
 * Every OTHER event_type='security' row (password resets, admin view-as,
 * session revokes — see golf auth.ts:455, baseball auth.ts:467, admin
 * view-as.ts:49/77, admin sessions.ts:31) uses a different title. Both
 * sports' failed-login logger calls (golf auth.ts:112-116, baseball
 * auth.ts:127-131) write this EXACT prefix, so filtering on it is what makes
 * the "N failed logins" burst banner's claim true instead of firing off
 * unrelated security-table noise.
 */
const FAILED_LOGIN_TITLE_PREFIX = 'Failed login attempt:';

/** One point in a daily trend series, oldest → newest. Shape matches
 *  Fairway's TrendChart `TrendPoint` ({ x, y }) so callers can pass it
 *  straight through without a remapping step. */
export interface DailyCount {
  x: string;
  y: number;
}

/**
 * UTC calendar-day boundaries for the trailing `days` days, oldest → newest.
 * The shared basis for every honest day-bucketed series in Bridge: callers
 * either run one COUNT query per `[startIso, endIso)` pair (cap-immune —
 * never fetches rows), or fetch a bounded row set and bucket it with
 * {@link bucketDailyCounts} against the same boundaries.
 */
export function trailingUtcDays(
  days: number,
  now: Date,
): Array<{ label: string; startIso: string; endIso: string }> {
  const todayUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: days }, (_, idx) => {
    const i = days - 1 - idx;
    const start = new Date(todayUtcMidnight - i * 86_400_000);
    const end = new Date(start.getTime() + 86_400_000);
    return { label: start.toISOString().slice(5, 10), startIso: start.toISOString(), endIso: end.toISOString() };
  });
}

/**
 * Bucket rows into `days` trailing UTC-calendar-day counts, oldest → newest.
 * Pure + honest: days with zero matching rows still get an explicit 0 bucket
 * (never silently dropped), so a genuinely quiet week renders as a flat-zero
 * series rather than a shorter one.
 *
 * Only safe to call against an UNTRUNCATED row set (i.e. one already fetched
 * past the PostgREST 1000-row cap via fetchAllRows/fetchAllRowsResult, or one
 * small enough by construction) — bucketing a capped array silently corrupts
 * the oldest buckets first. See `fetchSignInSeries` below for the COUNT-query
 * alternative used where feed volume can't be bounded this way.
 */
export function bucketDailyCounts(
  rows: ReadonlyArray<{ created_at: string }>,
  days: number,
  now: Date,
): DailyCount[] {
  const buckets = new Map<string, number>();
  for (const { label } of trailingUtcDays(days, now)) buckets.set(label, 0);
  for (const row of rows) {
    const key = new Date(row.created_at).toISOString().slice(5, 10);
    const current = buckets.get(key);
    if (current !== undefined) buckets.set(key, current + 1);
  }
  return Array.from(buckets.entries()).map(([x, y]) => ({ x, y }));
}

/**
 * Honest sign-in trend: one head:true COUNT query per trailing day, never a
 * slice of the (capped-at-200) combined feed array. Previously `signInSeries`
 * was derived by filtering `feed` (limit 200, mixing login+signup+security)
 * to event_type==='login' — once combined 7-day volume crossed 200 rows, the
 * ORDER BY DESC + LIMIT dropped the OLDEST rows first, silently zeroing out
 * the earliest days with no indication. COUNT queries can't be truncated by
 * a row cap because they never fetch rows.
 */
async function fetchSignInSeries(admin: AdminClient, now: Date): Promise<DailyCount[]> {
  const days = trailingUtcDays(7, now);
  const counts = await Promise.all(
    days.map(({ startIso, endIso }) =>
      admin
        .from('admin_events')
        .select('id', { count: 'exact', head: true })
        .eq('event_type', 'login')
        .gte('created_at', startIso)
        .lt('created_at', endIso),
    ),
  );
  return days.map((d, i) => ({ x: d.label, y: counts[i]?.count ?? 0 }));
}

/** CALLER must have passed requireSuperAdmin(). */
export async function fetchAuthTab(filters: AuthTabFilters = {}): Promise<{
  feed: AuthFeedRow[];
  /** Real count of matching feed rows before the .limit(200) cap below. */
  feedTotal: number;
  lockouts: LockoutRow[];
  /** Real count of matching lockout rows before the .limit(50) cap below. */
  lockoutsTotal: number;
  burst: boolean;
  funnel: { signups7d: number; activated7d: number; activationRate: number };
  signInSeries: DailyCount[];
  filters: AuthTabFilters;
}> {
  const admin = createAdminClient();
  const now = new Date();
  const ago7d = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const ago24h = new Date(now.getTime() - 86400_000).toISOString();

  const eventTypes = filters.eventType
    ? [filters.eventType]
    : (['login', 'signup', 'security'] as const);

  let feedQuery = admin
    .from('admin_events')
    .select('id, event_type, title, severity, user_email, user_id, sport, created_at', { count: 'exact' })
    .in('event_type', eventTypes)
    .gte('created_at', ago7d);
  if (filters.sport) feedQuery = feedQuery.eq('sport', filters.sport);
  if (filters.q) feedQuery = feedQuery.ilike('user_email', `%${filters.q}%`);
  feedQuery = feedQuery.order('created_at', { ascending: false }).limit(200);

  let lockoutQuery = admin
    .from('login_attempts')
    .select('email, failed_attempts, locked_until, last_attempt', { count: 'exact' })
    .gt('failed_attempts', 0);
  if (filters.q) lockoutQuery = lockoutQuery.ilike('email', `%${filters.q}%`);
  lockoutQuery = lockoutQuery.order('last_attempt', { ascending: false }).limit(50);

  const [feedRes, lockoutRes, failures24h, signupsRes, golfActive, baseballActive, liftActive, signInSeries] =
    await Promise.all([
      feedQuery,
      lockoutQuery,
      admin
        .from('admin_events')
        .select('created_at')
        .eq('event_type', 'security')
        .like('title', `${FAILED_LOGIN_TITLE_PREFIX}%`)
        .gte('created_at', ago24h),
      admin.from('users').select('id, created_at').gte('created_at', ago7d),
      admin.from('golf_rounds').select('player_id').gte('created_at', ago7d).limit(1000),
      admin.from('baseball_games').select('id').gte('created_at', ago7d).limit(1000),
      admin.from('helm_lifting_sessions').select('athlete_id').gte('created_at', ago7d).limit(1000),
      fetchSignInSeries(admin, now),
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

  // login_attempts has no user_id column — resolve emails → user ids in one
  // bounded lookup (<=50, matching the lockouts page cap) so every lockout
  // row can still link through to /admin/users/[id].
  const lockoutRows = (lockoutRes.data ?? []) as Array<Omit<LockoutRow, 'user_id'>>;
  const lockoutEmails = lockoutRows.map((l) => l.email);
  const userLookup =
    lockoutEmails.length > 0
      ? await admin.from('users').select('id, email').in('email', lockoutEmails)
      : { data: [] as Array<{ id: string; email: string }> };
  const emailToUserId = new Map((userLookup.data ?? []).map((u) => [u.email, u.id]));
  const lockouts: LockoutRow[] = lockoutRows.map((l) => ({
    ...l,
    user_id: emailToUserId.get(l.email) ?? null,
  }));

  return {
    feed,
    feedTotal: feedRes.count ?? feed.length,
    lockouts,
    lockoutsTotal: lockoutRes.count ?? lockouts.length,
    burst: detectFailureBurst(failureRows, 15, 4, now),
    funnel: {
      signups7d,
      activated7d,
      activationRate: computeActivation({ signups: signups7d, activated: activated7d }),
    },
    signInSeries,
    filters,
  };
}

/**
 * USER-SCOPED client — get_active_sessions() gates on auth.uid() via
 * is_super_admin() and Forbids under service_role (by design).
 *
 * Pass `userId` to filter server-side (SQL `WHERE ... AND s.user_id =
 * p_user_id`, applied BEFORE the function's internal `LIMIT 500`). Without
 * it, the platform-wide top-500-by-recency view is returned — the same
 * shape as before this param existed. A per-user caller that instead fetched
 * the platform-wide list and filtered client-side would silently show "no
 * active sessions" for any user outside that top-500 window; this param is
 * what lets `/admin/users/[id]` avoid that failure mode.
 */
export async function fetchActiveSessions(userId?: string): Promise<SessionRow[]> {
  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: 'get_active_sessions',
    args: { p_user_id: string | null },
  ) => Promise<{ data: SessionRow[] | null; error: { message: string } | null }>;
  const { data, error } = await rpc('get_active_sessions', { p_user_id: userId ?? null });
  if (error) throw new Error(`get_active_sessions failed: ${error.message}`);
  return data ?? [];
}
