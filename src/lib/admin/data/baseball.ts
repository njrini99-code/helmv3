import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';

/**
 * Baseball engine rollup — the BaseballHelm parity counterpart to
 * fetchGolfTab()'s rounds/CoachHelm slices (bridge-baseball-rollup-parity
 * Finding 1: `/admin/baseball` had no sport-specific engine rollup at all,
 * only the generic cross-sport `fetchUsersTab`/`fetchErrorsTab` filtered
 * client-side).
 *
 * Unlike fetchGolfTab(), nothing here goes through fetchAdminRollupA()'s
 * SECURITY DEFINER RPC — `baseball_games` and `helm_lifting_sessions` are
 * plain tables with no auth.uid()-gated wrapper, so the SERVICE-ROLE admin
 * client is sufficient for every read below (509-storm rule: only the
 * get_admin_*_rollup / get_feature_health-style RPCs need the user-scoped
 * request-context client).
 *
 * Team-level roster/health (name, playerCount, lastActivity, health,
 * errors7d) is deliberately NOT duplicated here — `fetchUsersTab()`
 * (src/lib/admin/data/users.ts:324-348) already builds that per-team via
 * `classifyTeamHealth()`/game-based `lastActivity`, and `/admin/baseball`
 * already renders it (TeamCommandCard, TeamHealthTable). A second
 * competing team table here would just be UI noise.
 */

export interface BaseballGamesWeekBucket {
  week: string;
  count: number;
}

export interface BaseballGamesRollup {
  gamesThisWeek: number;
  gamesLastWeek: number;
  gamesToday: number;
  /** Games with status='completed' whose game_date falls in the trailing 30d. */
  completedGames30d: number;
  lastGameAt: string | null;
  /** Monday-bucketed count of ALL games (any status) over the trailing 12
   *  weeks — mirrors golf rollup-a.ts's `roundsByWeek` bucketing exactly
   *  (`date_trunc('week', ...)`, 'YYYY-MM-DD' week-start labels) so the two
   *  sports' trend charts read consistently. */
  gamesByWeek: BaseballGamesWeekBucket[];
}

export interface BaseballLiftLab {
  sessions30d: number;
  /** Distinct athletes with >=1 lift session in the trailing 30d. */
  activeAthletes30d: number;
}

/** Monday-start ISO week bucket for a date-only ('YYYY-MM-DD') or timestamp
 *  string — the JS-side equivalent of Postgres's `date_trunc('week', ...)`,
 *  which golf's rollup-a.ts RPC uses for `roundsByWeek`. Computed in UTC so
 *  a `date`-typed column (baseball_games.game_date has no time/zone
 *  component) buckets identically regardless of server timezone. */
export function weekStart(dateStr: string): string {
  const iso = dateStr.length <= 10 ? `${dateStr}T00:00:00Z` : dateStr;
  const d = new Date(iso);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return d.toISOString().slice(0, 10);
}

export async function fetchBaseballTab(): Promise<{
  games: BaseballGamesRollup;
  liftLab: BaseballLiftLab;
}> {
  const admin = createAdminClient();
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const ago7dIso = new Date(now.getTime() - 7 * 86400_000).toISOString().slice(0, 10);
  const ago14dIso = new Date(now.getTime() - 14 * 86400_000).toISOString().slice(0, 10);
  const ago30dIso = new Date(now.getTime() - 30 * 86400_000).toISOString().slice(0, 10);
  const ago84dIso = new Date(now.getTime() - 84 * 86400_000).toISOString().slice(0, 10); // 12 weeks
  const ago30dTs = new Date(now.getTime() - 30 * 86400_000).toISOString();

  const [gamesRes, liftCountRes, liftAthletesRes] = await Promise.all([
    // Paginate past the 1000-row PostgREST cap — an unpaginated `.select()`
    // would silently under-count/misdate every Activity-pulse number below
    // (gamesThisWeek, gamesToday, completedGames30d, lastGameAt, gamesByWeek)
    // once trailing-84d baseball_games volume passes 1000. `.order('game_date',
    // 'id')` gives a stable total order so page boundaries never drift on a
    // tied game_date, matching the helm_lifting_sessions pagination below.
    fetchAllRowsResult((from, to) =>
      admin
        .from('baseball_games')
        .select('game_date, status')
        .gte('game_date', ago84dIso)
        .order('game_date', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    // Pure count — head:true never triggers the PostgREST 1000-row cap.
    admin
      .from('helm_lifting_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('sport', 'baseball')
      .gte('created_at', ago30dTs),
    // Need every row's athlete_id to dedupe — paginate past the 1000-row
    // cap rather than `.limit(1000)`, which would silently under-count
    // activeAthletes30d once trailing-30d baseball lift sessions pass 1000.
    fetchAllRowsResult((from, to) =>
      admin
        .from('helm_lifting_sessions')
        .select('athlete_id')
        .eq('sport', 'baseball')
        .gte('created_at', ago30dTs)
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ]);

  const games = (gamesRes.data ?? []) as Array<{ game_date: string; status: string | null }>;

  const weekBuckets = new Map<string, number>();
  let gamesThisWeek = 0;
  let gamesLastWeek = 0;
  let gamesToday = 0;
  let completedGames30d = 0;
  let lastGameAt: string | null = null;

  for (const g of games) {
    const bucket = weekStart(g.game_date);
    weekBuckets.set(bucket, (weekBuckets.get(bucket) ?? 0) + 1);

    if (g.game_date >= ago7dIso) gamesThisWeek += 1;
    else if (g.game_date >= ago14dIso) gamesLastWeek += 1;

    if (g.game_date === todayIso) gamesToday += 1;
    if (g.status === 'completed' && g.game_date >= ago30dIso) completedGames30d += 1;
    if (!lastGameAt || g.game_date > lastGameAt) lastGameAt = g.game_date;
  }

  const gamesByWeek: BaseballGamesWeekBucket[] = [...weekBuckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([week, count]) => ({ week, count }));

  const athleteIds = new Set(
    (liftAthletesRes.data ?? [])
      .map((r) => (r as { athlete_id: string | null }).athlete_id)
      .filter((id): id is string => Boolean(id)),
  );

  return {
    games: {
      gamesThisWeek,
      gamesLastWeek,
      gamesToday,
      completedGames30d,
      lastGameAt,
      gamesByWeek,
    },
    liftLab: {
      sessions30d: liftCountRes.count ?? 0,
      activeAthletes30d: athleteIds.size,
    },
  };
}
