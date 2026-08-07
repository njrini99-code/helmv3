import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { classifyTeamHealth, type GolfTeamHealthRow } from '@/lib/admin/data/golf';
import type { Database } from '@/lib/types/database';
import { excludeAuthNoise } from '@/lib/admin/data/triage';
import { INCIDENT_SEVERITIES } from '@/lib/admin/severity';

type UserRole = Database['public']['Enums']['user_role'];
export const USER_ROLES: readonly UserRole[] = ['coach', 'player', 'admin'];

export interface DirectoryUser {
  id: string;
  email: string;
  role: string;
  createdAt: string | null;
  lastSeen: string | null;
  sports: Array<'golf' | 'baseball'>;
}

/**
 * Single source of truth for "which sport(s) does this user play/coach in",
 * shared by both fetchUsersTab (directory list) and fetchUserDetail (detail
 * page) so they can never disagree. Deliberately keyed on direct presence in
 * golf_players/golf_coaches/baseball_players/baseball_coaches — NOT on
 * current team membership. A player who has never joined a team (or was
 * removed from every team) still has a real sport-scoped account and must
 * show the same sport badge everywhere; deriving from team `memberships`
 * instead silently drops that badge for any such user (confirmed live: 9 of
 * 60 golf_players rows have zero golf_team_members rows).
 */
export function deriveUserSports(has: { golf: boolean; baseball: boolean }): Array<'golf' | 'baseball'> {
  const sports: Array<'golf' | 'baseball'> = [];
  if (has.golf) sports.push('golf');
  if (has.baseball) sports.push('baseball');
  return sports;
}

export function classifyAtRisk(
  user: { lastSeen: string | null; createdAt: string | null },
  now: Date,
): 'active' | 'at-risk' | 'never-seen' {
  if (!user.lastSeen) {
    const ageDays = user.createdAt
      ? (now.getTime() - new Date(user.createdAt).getTime()) / 86400_000
      : 0;
    return ageDays > 3 ? 'never-seen' : 'active';
  }
  const idleDays = (now.getTime() - new Date(user.lastSeen).getTime()) / 86400_000;
  return idleDays > 14 ? 'at-risk' : 'active';
}

/**
 * `usersRes.count` (the `{ q, role }`-filtered SQL count, pre-500-cap) is
 * only trustworthy when `filters.team` is absent — the team filter is
 * applied afterward in JS, against the already-fetched/capped `users`
 * array, and never reaches the SQL count query. Using the SQL count while a
 * team filter is active would show the platform-wide total (e.g. 850) on a
 * page scoped to one team's roster (e.g. 20), directly contradicting the
 * roster the user is looking at. So: with no team filter, prefer the real
 * pre-cap SQL count (falling back to `users.length` only if Postgres somehow
 * didn't return one); with a team filter, `users.length` IS the accurate
 * count already-scoped to every active filter (q + role + team) and is used
 * as-is.
 */
export function computeTotalUsersCount(
  filters: { team?: string },
  sqlCount: number | null,
  usersLength: number,
): number {
  if (filters.team) return usersLength;
  return sqlCount ?? usersLength;
}

type IdRow = { id: string; user_id: string | null };
type UserIdRow = { user_id: string | null };
type TeamRow = { id: string; name: string };
type MemberRow = {
  team_id: string | null;
  player_id: string;
  jersey_number?: number | null;
  position?: string | null;
  status?: string | null;
};
type ActivityRow = { team_id: string | null; player_id?: string | null; created_at: string | null };
type ErrorRow = { team_id: string | null; sport: string | null; user_id?: string | null };
type GolfPlayerRow = IdRow & {
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  graduation_year: number | null;
  handicap_index: number | null;
  onboarding_completed: boolean | null;
  profile_complete: boolean | null;
};
type BaseballPlayerRow = IdRow & {
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  grad_year: number | null;
  primary_position: string | null;
  secondary_position: string | null;
  onboarding_completed: boolean | null;
  profile_completion_percent: number | null;
  recruiting_activated: boolean | null;
};
type GolfRoundRow = ActivityRow & {
  player_id: string | null;
  total_score: number | null;
  score_to_par: number | null;
};
type BaseballSignalRow = {
  team_id: string | null;
  player_id: string | null;
  /** Pitcher-side FK on `baseball_pitch_events` (added separately from the
   *  pre-existing batter/plate-appearance `player_id` column — see
   *  `supabase/migrations/20260701013000_baseball_elite_event_tables_reconcile.sql`).
   *  Absent on `baseball_player_timeline_events` rows (never selected there). */
  pitcher_id?: string | null;
  created_at?: string | null;
  occurred_at?: string | null;
  event_type?: string | null;
};

export interface RosterPlayerInsight {
  sport: 'golf' | 'baseball';
  teamId: string;
  playerId: string;
  userId: string | null;
  href: string | null;
  name: string;
  email: string | null;
  jerseyNumber: number | null;
  position: string | null;
  status: string | null;
  lastSeen: string | null;
  activity30d: number;
  lastActivity: string | null;
  errors7d: number;
  profileQuality: 'complete' | 'partial' | 'missing';
  detail: string;
}

export interface TeamRosterInsight extends GolfTeamHealthRow {
  sport: 'golf' | 'baseball';
  players: RosterPlayerInsight[];
  activePlayers: number;
  attentionPlayers: number;
  profileGaps: number;
}

/**
 * CALLER must have passed requireSuperAdmin().
 *
 * DEVIATIONS from the wave doc (verified against src/lib/types/database.ts):
 *   - Baseball users are NOT identified via `baseball_team_members.user_id`
 *     (that column doesn't exist — `baseball_team_members.player_id` FKs to
 *     `baseball_players.id`, not `users.id`). Sport membership is resolved
 *     the same way golf does it: union of `golf_players`/`golf_coaches` (or
 *     `baseball_players`/`baseball_coaches`) `user_id` columns.
 *   - `teams` is NOT hard-coded to playerCount:0/lastActivity:null/
 *     health:'dormant' for every row (the doc's reference snippet did this
 *     "to keep the registry homogeneous," but that renders every single team
 *     as a false dormant alarm — the opposite of honest). This computes real
 *     roster counts (golf_team_members/baseball_team_members, status=active),
 *     real last-activity (golf_rounds.team_id / baseball_games.team_id, both
 *     of which carry a team-level created_at), and real 7d error counts
 *     (admin_events.team_id + sport) — all from bulk queries already cheap
 *     at this scale.
 *   - `filters.team` is honored (the doc's signature accepted it but never
 *     applied it — the Teams table links to `?team=<id>` so a no-op filter
 *     would look broken). Resolved via player_id → user_id backmap since
 *     team_members rows key on player_id, not user_id.
 */
export async function fetchUsersTab(filters: { q?: string; role?: string; team?: string; sport?: 'golf' | 'baseball' }): Promise<{
  users: DirectoryUser[];
  /**
   * Real count of users matching every active filter, BEFORE the 500-row
   * cap below. Lets the UI say "500 of 812" instead of silently presenting
   * the capped page size as if it were the whole directory. See
   * `computeTotalUsersCount` — when `filters.team` is set this is
   * `users.length` (the only value that's actually team-scoped); otherwise
   * it's the `{ q, role }`-filtered SQL `count: 'exact'` (which costs
   * nothing extra to fetch alongside the `.limit()`'d rows).
   */
  totalUsersCount: number;
  teams: TeamRosterInsight[];
  atRisk: DirectoryUser[];
}> {
  const admin = createAdminClient();
  const now = new Date();
  const ago30d = new Date(now.getTime() - 30 * 86400_000).toISOString();
  const ago7d = new Date(now.getTime() - 7 * 86400_000).toISOString();
  // classifyTeamHealth() only ever looks back 14d (beyond that a team is
  // 'dormant' regardless) — 90d is a generous window that keeps
  // `baseball_games` last-activity resolution correct while bounding the
  // query instead of scanning the platform's entire game history.
  const ago90d = new Date(now.getTime() - 90 * 86400_000).toISOString();

  let userQuery = admin
    .from('users')
    .select('id, email, role, created_at, last_seen', { count: 'exact' })
    .order('last_seen', { ascending: false, nullsFirst: false })
    .limit(500);
  if (filters.q) userQuery = userQuery.ilike('email', `%${filters.q}%`);
  // Narrow to the real `user_role` enum before filtering — an unrecognized
  // `?role=` value is silently ignored rather than sent to PostgREST (which
  // would 400 on an invalid enum literal).
  if (filters.role && (USER_ROLES as readonly string[]).includes(filters.role)) {
    userQuery = userQuery.eq('role', filters.role as UserRole);
  }

  // `filters.sport` lets a sport-scoped caller (e.g. /admin/golf,
  // /admin/baseball) skip the OTHER sport's roster/rounds/errors scans
  // entirely instead of paying for a platform-wide 14-query fan-out just to
  // filter most of it back out downstream (bridge-tab-audit-p0p1 golf
  // Finding 2 follow-up). Omitting `sport` preserves the original
  // platform-wide behavior every other caller (e.g. /admin/users) relies on.
  const includeGolf = filters.sport !== 'baseball';
  const includeBaseball = filters.sport !== 'golf';
  const emptyRows = Promise.resolve({ data: [] as never[], error: null });

  const [
    usersRes,
    golfPlayersRes,
    golfCoachesRes,
    baseballPlayersRes,
    baseballCoachesRes,
    golfTeamsRes,
    baseballTeamsRes,
    golfMembersRes,
    baseballMembersRes,
    golfRoundsRes,
    baseballGamesRes,
    baseballPitchEventsRes,
    baseballTimelineEventsRes,
    errorsRes,
  ] = await Promise.all([
    userQuery,
    // Every roster/player/team-membership query below is paginated past the
    // PostgREST 1000-row cap via `fetchAllRowsResult` — a `.limit(N)` call
    // does NOT raise the server-side `db-max-rows` (this repo's own
    // documented gotcha), so a bare `.limit(2000)` (or no limit at all, on
    // the two `*_team_members` queries) was silently truncating at 1000
    // regardless of the requested/actual size once platform-wide rows crossed
    // that line — corrupting roster counts, playerCount, and team health with
    // no operator-visible warning. `.order('id')` gives every page a stable
    // boundary.
    includeGolf
      ? fetchAllRowsResult((from, to) =>
          admin
            .from('golf_players')
            .select('id, user_id, email, first_name, last_name, graduation_year, handicap_index, onboarding_completed, profile_complete')
            .order('id', { ascending: true })
            .range(from, to),
        )
      : emptyRows,
    includeGolf
      ? fetchAllRowsResult((from, to) =>
          admin.from('golf_coaches').select('user_id').order('user_id', { ascending: true }).range(from, to),
        )
      : emptyRows,
    includeBaseball
      ? fetchAllRowsResult((from, to) =>
          admin
            .from('baseball_players')
            .select('id, user_id, email, first_name, last_name, grad_year, primary_position, secondary_position, onboarding_completed, profile_completion_percent, recruiting_activated')
            .order('id', { ascending: true })
            .range(from, to),
        )
      : emptyRows,
    includeBaseball
      ? fetchAllRowsResult((from, to) =>
          admin.from('baseball_coaches').select('user_id').order('user_id', { ascending: true }).range(from, to),
        )
      : emptyRows,
    includeGolf ? admin.from('golf_teams').select('id, name') : emptyRows,
    includeBaseball ? admin.from('baseball_teams').select('id, name') : emptyRows,
    includeGolf
      ? fetchAllRowsResult((from, to) =>
          admin
            .from('golf_team_members')
            .select('team_id, player_id, jersey_number, status')
            .eq('status', 'active')
            .order('id', { ascending: true })
            .range(from, to),
        )
      : emptyRows,
    includeBaseball
      ? fetchAllRowsResult((from, to) =>
          admin
            .from('baseball_team_members')
            .select('team_id, player_id, jersey_number, position, status')
            .eq('status', 'active')
            .order('id', { ascending: true })
            .range(from, to),
        )
      : emptyRows,
    // Platform-wide 30d activity — paginate past the PostgREST 1000-row cap
    // (a .limit(3000) still silently truncates at 1000 regardless of the
    // requested size); `.order('id')` gives stable page boundaries alongside
    // the primary `created_at`/`occurred_at` ordering the "first hit is max"
    // per-team last-activity maps below rely on.
    includeGolf
      ? fetchAllRowsResult((from, to) =>
          admin
            .from('golf_rounds')
            .select('team_id, player_id, created_at, total_score, score_to_par')
            .gte('created_at', ago30d)
            .order('created_at', { ascending: false })
            .order('id', { ascending: true })
            .range(from, to),
        )
      : emptyRows,
    // Windowed to 90d (see `ago90d` above) AND paginated — the prior
    // `.limit(1000)` (no window) silently under-dated any team whose most
    // recent game fell outside the newest-1000-rows-platform-wide slice,
    // exactly the bug class flagged for `golf_rounds` immediately above.
    includeBaseball
      ? fetchAllRowsResult((from, to) =>
          admin
            .from('baseball_games')
            .select('team_id, created_at')
            .gte('created_at', ago90d)
            .order('created_at', { ascending: false })
            .order('id', { ascending: true })
            .range(from, to),
        )
      : emptyRows,
    // Selects `pitcher_id` alongside the pre-existing batter-side `player_id`
    // (see BaseballSignalRow's doc comment) — a pitcher who never bats (common
    // under DH rules) otherwise accumulates zero rows here regardless of
    // innings thrown, forcing a false "quiet" watchlist flag.
    includeBaseball
      ? fetchAllRowsResult((from, to) =>
          admin
            .from('baseball_pitch_events')
            .select('team_id, player_id, pitcher_id, created_at')
            .gte('created_at', ago30d)
            .order('created_at', { ascending: false })
            .order('id', { ascending: true })
            .range(from, to),
        )
      : emptyRows,
    includeBaseball
      ? fetchAllRowsResult((from, to) =>
          admin
            .from('baseball_player_timeline_events')
            .select('team_id, player_id, occurred_at, event_type')
            .gte('occurred_at', ago30d)
            .order('occurred_at', { ascending: false })
            .order('id', { ascending: true })
            .range(from, to),
        )
      : emptyRows,
    fetchAllRowsResult((from, to) =>
      excludeAuthNoise(
        admin
          .from('admin_events')
          .select('team_id, sport, user_id, severity')
          .eq('event_type', 'error')
          // This counted EVERY event_type='error' row regardless of severity,
          // and `severity` was not even selected. Measured over 7 days: 593 of
          // 629 counted rows (94%) were severity='info' — routine soft-failure
          // narration like "no completed rounds yet". Of the users actually
          // rendered, 31 were painted danger-red where 11 had a real error: a
          // 65% false-positive rate on the console's primary attention column.
          .in('severity', INCIDENT_SEVERITIES),
      )
        .gte('created_at', ago7d)
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ]);

  // None of the 14 queries above ever THROW on a Supabase/RLS/schema error —
  // they resolve to `{ data: null, error }` — so without this check, the
  // `?? []` fallbacks throughout this function would quietly render "0 teams
  // / 0 players / no rosters" as if that were real data, and PanelBoundary
  // (wrapping every caller of this function) would never get the chance to
  // show its PanelStale fallback for a genuine backend failure. Mirrors the
  // fail-loud pattern already used in `fetchBaseballTab()`
  // (src/lib/admin/data/baseball.ts).
  const checks: Array<[string, { message: string; code?: string | null } | null | undefined]> = [
    ['users', usersRes.error],
    ['golf_players', golfPlayersRes.error],
    ['golf_coaches', golfCoachesRes.error],
    ['baseball_players', baseballPlayersRes.error],
    ['baseball_coaches', baseballCoachesRes.error],
    ['golf_teams', golfTeamsRes.error],
    ['baseball_teams', baseballTeamsRes.error],
    ['golf_team_members', golfMembersRes.error],
    ['baseball_team_members', baseballMembersRes.error],
    ['golf_rounds', golfRoundsRes.error],
    ['baseball_games', baseballGamesRes.error],
    ['baseball_pitch_events', baseballPitchEventsRes.error],
    ['baseball_player_timeline_events', baseballTimelineEventsRes.error],
    ['admin_events', errorsRes.error],
  ];
  for (const [table, error] of checks) {
    if (error) throw new Error(`fetchUsersTab: ${table} query failed: ${error.message}`);
  }

  const golfPlayerRows = (golfPlayersRes.data ?? []) as GolfPlayerRow[];
  const baseballPlayerRows = (baseballPlayersRes.data ?? []) as BaseballPlayerRow[];

  const golfUserIds = new Set(
    [
      ...golfPlayerRows.map((r) => r.user_id),
      ...((golfCoachesRes.data ?? []) as UserIdRow[]).map((r) => r.user_id),
    ].filter((v): v is string => Boolean(v)),
  );
  const baseballUserIds = new Set(
    [
      ...baseballPlayerRows.map((r) => r.user_id),
      ...((baseballCoachesRes.data ?? []) as UserIdRow[]).map((r) => r.user_id),
    ].filter((v): v is string => Boolean(v)),
  );

  // player.id -> user_id, so team-member rows (keyed by player_id) can
  // resolve back to a directory user for the `team` filter.
  const golfPlayerToUser = new Map(golfPlayerRows.map((r) => [r.id, r.user_id]));
  const baseballPlayerToUser = new Map(baseballPlayerRows.map((r) => [r.id, r.user_id]));

  const usersInTeam = new Set<string>();
  if (filters.team) {
    for (const m of (golfMembersRes.data ?? []) as MemberRow[]) {
      if (m.team_id === filters.team) {
        const uid = golfPlayerToUser.get(m.player_id);
        if (uid) usersInTeam.add(uid);
      }
    }
    for (const m of (baseballMembersRes.data ?? []) as MemberRow[]) {
      if (m.team_id === filters.team) {
        const uid = baseballPlayerToUser.get(m.player_id);
        if (uid) usersInTeam.add(uid);
      }
    }
  }

  // The platform-wide `userQuery` above is capped at 500 rows ordered by
  // recency (`last_seen desc`) — filtering that already-capped page down to
  // one team in JS silently drops any team member who hasn't been seen
  // recently enough to land in the top 500, even though `usersInTeam` (built
  // from the UNCAPPED team-membership queries above) knows their real user
  // id. `/admin/users` treats the team filter as the path to viewing the
  // FULL roster, so re-fetch directly by the resolved team-member ids
  // (bypassing the 500-cap entirely) instead of filtering the capped page.
  let teamUsersQuery = filters.team
    ? admin
        .from('users')
        .select('id, email, role, created_at, last_seen')
        .in('id', usersInTeam.size > 0 ? Array.from(usersInTeam) : [''])
    : null;
  if (teamUsersQuery && filters.q) teamUsersQuery = teamUsersQuery.ilike('email', `%${filters.q}%`);
  if (teamUsersQuery && filters.role && (USER_ROLES as readonly string[]).includes(filters.role)) {
    teamUsersQuery = teamUsersQuery.eq('role', filters.role as UserRole);
  }
  const teamUsersRes = teamUsersQuery ? await teamUsersQuery : null;
  if (teamUsersRes?.error) {
    throw new Error(`fetchUsersTab: team-scoped users query failed: ${teamUsersRes.error.message}`);
  }
  const userRows = filters.team ? (teamUsersRes?.data ?? []) : (usersRes.data ?? []);

  const users: DirectoryUser[] = userRows
    .map((u) => {
      const row = u as { id: string; email: string; role: string; created_at: string | null; last_seen: string | null };
      const sports = deriveUserSports({
        golf: golfUserIds.has(row.id),
        baseball: baseballUserIds.has(row.id),
      });
      return {
        id: row.id, email: row.email, role: row.role,
        createdAt: row.created_at, lastSeen: row.last_seen, sports,
      };
    })
    .filter((u) => !filters.team || usersInTeam.has(u.id));

  // Real per-team roster counts.
  const golfMemberCounts = new Map<string, number>();
  for (const m of (golfMembersRes.data ?? []) as MemberRow[]) {
    if (m.team_id) golfMemberCounts.set(m.team_id, (golfMemberCounts.get(m.team_id) ?? 0) + 1);
  }
  const baseballMemberCounts = new Map<string, number>();
  for (const m of (baseballMembersRes.data ?? []) as MemberRow[]) {
    if (m.team_id) baseballMemberCounts.set(m.team_id, (baseballMemberCounts.get(m.team_id) ?? 0) + 1);
  }

  // Real per-team last-activity — rows arrive newest-first (order desc), so
  // the first hit per team_id is the max.
  const lastGolfActivity = new Map<string, string>();
  for (const r of (golfRoundsRes.data ?? []) as ActivityRow[]) {
    if (r.team_id && r.created_at && !lastGolfActivity.has(r.team_id)) {
      lastGolfActivity.set(r.team_id, r.created_at);
    }
  }
  const lastBaseballActivity = new Map<string, string>();
  for (const r of (baseballGamesRes.data ?? []) as ActivityRow[]) {
    if (r.team_id && r.created_at && !lastBaseballActivity.has(r.team_id)) {
      lastBaseballActivity.set(r.team_id, r.created_at);
    }
  }

  const errorCounts = new Map<string, number>();
  for (const e of (errorsRes.data ?? []) as ErrorRow[]) {
    if (!e.team_id) continue;
    const key = `${e.sport ?? 'unknown'}:${e.team_id}`;
    errorCounts.set(key, (errorCounts.get(key) ?? 0) + 1);
  }

  const baseTeams: Array<GolfTeamHealthRow & { sport: 'golf' | 'baseball' }> = [
    ...((golfTeamsRes.data ?? []) as TeamRow[]).map((t) => {
      const lastActivity = lastGolfActivity.get(t.id) ?? null;
      return {
        teamId: t.id,
        name: t.name,
        playerCount: golfMemberCounts.get(t.id) ?? 0,
        lastActivity,
        health: classifyTeamHealth(lastActivity, now),
        errors7d: errorCounts.get(`golf:${t.id}`) ?? 0,
        sport: 'golf' as const,
      };
    }),
    ...((baseballTeamsRes.data ?? []) as TeamRow[]).map((t) => {
      const lastActivity = lastBaseballActivity.get(t.id) ?? null;
      return {
        teamId: t.id,
        name: t.name,
        playerCount: baseballMemberCounts.get(t.id) ?? 0,
        lastActivity,
        health: classifyTeamHealth(lastActivity, now),
        errors7d: errorCounts.get(`baseball:${t.id}`) ?? 0,
        sport: 'baseball' as const,
      };
    }),
  ];

  const userById = new Map(users.map((u) => [u.id, u]));
  const userErrorCounts = new Map<string, number>();
  for (const e of (errorsRes.data ?? []) as ErrorRow[]) {
    if (e.user_id) userErrorCounts.set(e.user_id, (userErrorCounts.get(e.user_id) ?? 0) + 1);
  }

  const golfPlayerById = new Map(golfPlayerRows.map((p) => [p.id, p]));
  const baseballPlayerById = new Map(baseballPlayerRows.map((p) => [p.id, p]));
  const golfActivityByPlayer = new Map<string, { count: number; last: string | null; score: number | null; toPar: number | null }>();
  for (const r of (golfRoundsRes.data ?? []) as GolfRoundRow[]) {
    if (!r.player_id) continue;
    const current = golfActivityByPlayer.get(r.player_id) ?? { count: 0, last: null, score: null, toPar: null };
    current.count += 1;
    if (r.created_at && (!current.last || r.created_at > current.last)) {
      current.last = r.created_at;
      current.score = r.total_score;
      current.toPar = r.score_to_par;
    }
    golfActivityByPlayer.set(r.player_id, current);
  }

  const baseballActivityByPlayer = new Map<string, { count: number; last: string | null }>();
  // `baseball_pitch_events.player_id` is the pre-existing batter/plate-
  // appearance column; `pitcher_id` was added separately for pitcher
  // attribution (see BaseballSignalRow's doc comment). A row can carry
  // BOTH ids at once — bump each side independently (mirrors the
  // `.or('batter_id.eq.X,pitcher_id.eq.X')` pattern already used correctly
  // in elite-stat-events.ts for the same table) so a pitcher who never bats
  // (common under DH rules) still accrues activity instead of reading as
  // permanently "quiet" on the watchlist.
  function bumpBaseballActivity(playerId: string | null | undefined, at: string | null) {
    if (!playerId) return;
    const current = baseballActivityByPlayer.get(playerId) ?? { count: 0, last: null };
    current.count += 1;
    if (at && (!current.last || at > current.last)) current.last = at;
    baseballActivityByPlayer.set(playerId, current);
  }
  for (const r of (baseballPitchEventsRes.data ?? []) as BaseballSignalRow[]) {
    const at = r.created_at ?? r.occurred_at ?? null;
    bumpBaseballActivity(r.player_id, at);
    bumpBaseballActivity(r.pitcher_id, at);
  }
  for (const r of (baseballTimelineEventsRes.data ?? []) as BaseballSignalRow[]) {
    bumpBaseballActivity(r.player_id, r.created_at ?? r.occurred_at ?? null);
  }

  function displayName(player: { first_name: string | null; last_name: string | null; email: string | null }): string {
    return `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || player.email || 'Unnamed player';
  }

  const playersByTeam = new Map<string, RosterPlayerInsight[]>();
  function addPlayer(teamId: string | null, player: RosterPlayerInsight) {
    if (!teamId) return;
    playersByTeam.set(teamId, [...(playersByTeam.get(teamId) ?? []), player]);
  }

  for (const m of (golfMembersRes.data ?? []) as MemberRow[]) {
    const p = golfPlayerById.get(m.player_id);
    if (!p) continue;
    const user = p.user_id ? userById.get(p.user_id) : undefined;
    const activity = golfActivityByPlayer.get(p.id) ?? { count: 0, last: null, score: null, toPar: null };
    const complete = p.onboarding_completed === true || p.profile_complete === true;
    addPlayer(m.team_id, {
      sport: 'golf',
      teamId: m.team_id ?? '',
      playerId: p.id,
      userId: p.user_id,
      href: p.user_id ? `/admin/users/${p.user_id}` : null,
      name: displayName(p),
      email: p.email,
      jerseyNumber: m.jersey_number ?? null,
      position: null,
      status: m.status ?? null,
      lastSeen: user?.lastSeen ?? null,
      activity30d: activity.count,
      lastActivity: activity.last,
      errors7d: p.user_id ? userErrorCounts.get(p.user_id) ?? 0 : 0,
      profileQuality: complete ? 'complete' : p.email || p.first_name || p.last_name ? 'partial' : 'missing',
      detail:
        activity.score !== null
          ? `Last round ${activity.score}${activity.toPar === null ? '' : activity.toPar > 0 ? ` (+${activity.toPar})` : activity.toPar === 0 ? ' (E)' : ` (${activity.toPar})`}`
          : p.handicap_index !== null
            ? `Handicap ${p.handicap_index}`
            : 'No recent rounds',
    });
  }

  for (const m of (baseballMembersRes.data ?? []) as MemberRow[]) {
    const p = baseballPlayerById.get(m.player_id);
    if (!p) continue;
    const user = p.user_id ? userById.get(p.user_id) : undefined;
    const activity = baseballActivityByPlayer.get(p.id) ?? { count: 0, last: null };
    const completion = p.profile_completion_percent ?? null;
    const profileQuality =
      completion !== null && completion >= 80
        ? 'complete'
        : p.onboarding_completed === true || completion !== null || p.email || p.first_name || p.last_name
          ? 'partial'
          : 'missing';
    addPlayer(m.team_id, {
      sport: 'baseball',
      teamId: m.team_id ?? '',
      playerId: p.id,
      userId: p.user_id,
      href: p.user_id ? `/admin/users/${p.user_id}` : null,
      name: displayName(p),
      email: p.email,
      jerseyNumber: m.jersey_number ?? null,
      position: m.position ?? p.primary_position ?? p.secondary_position,
      status: m.status ?? null,
      lastSeen: user?.lastSeen ?? null,
      activity30d: activity.count,
      lastActivity: activity.last,
      errors7d: p.user_id ? userErrorCounts.get(p.user_id) ?? 0 : 0,
      profileQuality,
      detail:
        completion !== null
          ? `${completion}% profile`
          : p.recruiting_activated
            ? 'Recruiting active'
            : 'Baseball profile present',
    });
  }

  const teams: TeamRosterInsight[] = baseTeams.map((team) => {
    const players = (playersByTeam.get(team.teamId) ?? []).sort((a, b) => {
      if (a.errors7d !== b.errors7d) return b.errors7d - a.errors7d;
      if (a.activity30d !== b.activity30d) return b.activity30d - a.activity30d;
      return a.name.localeCompare(b.name);
    });
    const profileGaps = players.filter((p) => p.profileQuality !== 'complete').length;
    const attentionPlayers = players.filter((p) => p.errors7d > 0 || p.activity30d === 0 || p.profileQuality === 'missing').length;
    return {
      ...team,
      players,
      activePlayers: players.filter((p) => p.activity30d > 0).length,
      attentionPlayers,
      profileGaps,
    };
  });

  return {
    users,
    totalUsersCount: computeTotalUsersCount(filters, usersRes.count, users.length),
    teams,
    atRisk: users.filter((u) => classifyAtRisk({ lastSeen: u.lastSeen, createdAt: u.createdAt }, now) !== 'active'),
  };
}

type TeamNameRow = {
  team_id: string | null;
  golf_teams?: { name: string } | null;
  baseball_teams?: { name: string } | null;
};

/**
 * CALLER must have passed requireSuperAdmin().
 *
 * DEVIATIONS from the wave doc (verified against src/lib/types/database.ts):
 *   - `golf_players` has NO `team_id` column — team membership is via
 *     `golf_team_members.player_id` (FK → `golf_players.id`), and coach
 *     staffing is via `golf_team_coach_staff.coach_id` (FK → `golf_coaches.
 *     id`). Same shape for baseball (`baseball_team_members`/
 *     `baseball_team_coach_staff`). Memberships below resolve BOTH player
 *     and coach roles for both sports, not just a naive `golf_players.
 *     team_id` join that doesn't exist.
 *   - `golf_rounds.player_id` references `golf_players.id`, not `users.id`
 *     — resolved via the golf_players row first.
 *   - `helm_lifting_sessions.athlete_id` references `helm_lifting_athletes.
 *     id`, not `users.id` directly — resolved via `helm_lifting_athletes.
 *     user_id` first. Lifting sessions are folded into `recentActivity`
 *     alongside golf rounds (cross-sport — Lift Lab serves both rosters).
 *   - `baseball_games` is a team-level row (no per-athlete attribution
 *     column) and is not filterable to one user, so it's not read here.
 */
export async function fetchUserDetail(userId: string): Promise<{
  user: DirectoryUser | null;
  memberships: Array<{ sport: 'golf' | 'baseball'; teamId: string; teamName: string }>;
  recentActivity: Array<{ kind: string; at: string; label: string }>;
  authEvents: Array<{ id: string; title: string; event_type: string; created_at: string }>;
  errorEvents: Array<{ id: string; title: string; severity: string; created_at: string; fingerprint: string | null }>;
}> {
  const admin = createAdminClient();

  const [
    userRes,
    golfPlayerRes,
    golfCoachRes,
    baseballPlayerRes,
    baseballCoachRes,
    liftAthleteRes,
    authEventsRes,
    errorEventsRes,
  ] = await Promise.all([
    admin.from('users').select('id, email, role, created_at, last_seen').eq('id', userId).maybeSingle(),
    admin.from('golf_players').select('id').eq('user_id', userId).maybeSingle(),
    admin.from('golf_coaches').select('id').eq('user_id', userId).maybeSingle(),
    admin.from('baseball_players').select('id').eq('user_id', userId).maybeSingle(),
    admin.from('baseball_coaches').select('id').eq('user_id', userId).maybeSingle(),
    admin.from('helm_lifting_athletes').select('id').eq('user_id', userId).maybeSingle(),
    admin
      .from('admin_events')
      .select('id, title, event_type, created_at')
      .eq('user_id', userId)
      .in('event_type', ['login', 'signup', 'security'])
      .order('created_at', { ascending: false })
      .limit(25),
    admin
      .from('admin_events')
      .select('id, title, severity, created_at, fingerprint')
      .eq('user_id', userId)
      .eq('event_type', 'error')
      .order('created_at', { ascending: false })
      .limit(25),
  ]);

  const authEvents = (authEventsRes.data ?? []) as Array<{
    id: string; title: string; event_type: string; created_at: string;
  }>;
  const errorEvents = (errorEventsRes.data ?? []) as Array<{
    id: string; title: string; severity: string; created_at: string; fingerprint: string | null;
  }>;

  const u = userRes.data as { id: string; email: string; role: string; created_at: string | null; last_seen: string | null } | null;
  if (!u) {
    return { user: null, memberships: [], recentActivity: [], authEvents, errorEvents };
  }

  const golfPlayerId = (golfPlayerRes.data as { id: string } | null)?.id ?? null;
  const golfCoachId = (golfCoachRes.data as { id: string } | null)?.id ?? null;
  const baseballPlayerId = (baseballPlayerRes.data as { id: string } | null)?.id ?? null;
  const baseballCoachId = (baseballCoachRes.data as { id: string } | null)?.id ?? null;
  const liftAthleteId = (liftAthleteRes.data as { id: string } | null)?.id ?? null;

  const [
    golfPlayerTeamsRes,
    golfCoachTeamsRes,
    baseballPlayerTeamsRes,
    baseballCoachTeamsRes,
    roundsRes,
    liftsRes,
  ] = await Promise.all([
    golfPlayerId
      ? admin.from('golf_team_members').select('team_id, golf_teams(name)').eq('player_id', golfPlayerId)
      : Promise.resolve({ data: [] as TeamNameRow[] }),
    golfCoachId
      ? admin.from('golf_team_coach_staff').select('team_id, golf_teams(name)').eq('coach_id', golfCoachId)
      : Promise.resolve({ data: [] as TeamNameRow[] }),
    baseballPlayerId
      ? admin.from('baseball_team_members').select('team_id, baseball_teams(name)').eq('player_id', baseballPlayerId)
      : Promise.resolve({ data: [] as TeamNameRow[] }),
    baseballCoachId
      ? admin.from('baseball_team_coach_staff').select('team_id, baseball_teams(name)').eq('coach_id', baseballCoachId)
      : Promise.resolve({ data: [] as TeamNameRow[] }),
    golfPlayerId
      ? admin
          .from('golf_rounds')
          .select('id, created_at, course_name')
          .eq('player_id', golfPlayerId)
          .order('created_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] as Array<{ id: string; created_at: string; course_name: string | null }> }),
    liftAthleteId
      ? admin
          .from('helm_lifting_sessions')
          .select('id, created_at, title')
          .eq('athlete_id', liftAthleteId)
          .order('created_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] as Array<{ id: string; created_at: string; title: string | null }> }),
  ]);

  const rawMemberships: Array<{ sport: 'golf' | 'baseball'; teamId: string; teamName: string }> = [
    ...((golfPlayerTeamsRes.data ?? []) as TeamNameRow[])
      .filter((m) => m.team_id)
      .map((m) => ({ sport: 'golf' as const, teamId: m.team_id as string, teamName: m.golf_teams?.name ?? 'unknown' })),
    ...((golfCoachTeamsRes.data ?? []) as TeamNameRow[])
      .filter((m) => m.team_id)
      .map((m) => ({ sport: 'golf' as const, teamId: m.team_id as string, teamName: m.golf_teams?.name ?? 'unknown' })),
    ...((baseballPlayerTeamsRes.data ?? []) as TeamNameRow[])
      .filter((m) => m.team_id)
      .map((m) => ({ sport: 'baseball' as const, teamId: m.team_id as string, teamName: m.baseball_teams?.name ?? 'unknown' })),
    ...((baseballCoachTeamsRes.data ?? []) as TeamNameRow[])
      .filter((m) => m.team_id)
      .map((m) => ({ sport: 'baseball' as const, teamId: m.team_id as string, teamName: m.baseball_teams?.name ?? 'unknown' })),
  ];

  // De-dupe: a head coach who also has a player row on the same team (rare,
  // but possible in test/demo orgs) would otherwise double-list the team.
  const seen = new Set<string>();
  const memberships = rawMemberships.filter((m) => {
    const key = `${m.sport}:${m.teamId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const recentActivity: Array<{ kind: string; at: string; label: string }> = [
    ...((roundsRes.data ?? []) as Array<{ id: string; created_at: string; course_name: string | null }>).map((r) => ({
      kind: 'round', at: r.created_at, label: r.course_name ? `Round at ${r.course_name}` : 'Round logged',
    })),
    ...((liftsRes.data ?? []) as Array<{ id: string; created_at: string; title: string | null }>).map((l) => ({
      kind: 'lift', at: l.created_at, label: l.title ?? 'Lifting session',
    })),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 15);

  return {
    user: {
      id: u.id, email: u.email, role: u.role, createdAt: u.created_at, lastSeen: u.last_seen,
      sports: deriveUserSports({
        golf: Boolean(golfPlayerId || golfCoachId),
        baseball: Boolean(baseballPlayerId || baseballCoachId),
      }),
    },
    memberships,
    recentActivity,
    authEvents,
    errorEvents,
  };
}
