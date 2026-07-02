import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { classifyTeamHealth, type GolfTeamHealthRow } from '@/lib/admin/data/golf';

export interface DirectoryUser {
  id: string;
  email: string;
  role: string;
  createdAt: string | null;
  lastSeen: string | null;
  sports: Array<'golf' | 'baseball'>;
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

type IdRow = { id: string; user_id: string | null };
type UserIdRow = { user_id: string | null };
type TeamRow = { id: string; name: string };
type MemberRow = { team_id: string | null; player_id: string };
type ActivityRow = { team_id: string | null; created_at: string | null };
type ErrorRow = { team_id: string | null; sport: string | null };

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
export async function fetchUsersTab(filters: { q?: string; role?: string; team?: string }): Promise<{
  users: DirectoryUser[];
  teams: Array<GolfTeamHealthRow & { sport: 'golf' | 'baseball' }>;
  atRisk: DirectoryUser[];
}> {
  const admin = createAdminClient();
  const now = new Date();
  const ago7d = new Date(now.getTime() - 7 * 86400_000).toISOString();

  let userQuery = admin
    .from('users')
    .select('id, email, role, created_at, last_seen')
    .order('last_seen', { ascending: false, nullsFirst: false })
    .limit(500);
  if (filters.q) userQuery = userQuery.ilike('email', `%${filters.q}%`);
  if (filters.role) userQuery = userQuery.eq('role', filters.role);

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
    errorsRes,
  ] = await Promise.all([
    userQuery,
    admin.from('golf_players').select('id, user_id').limit(2000),
    admin.from('golf_coaches').select('user_id').limit(2000),
    admin.from('baseball_players').select('id, user_id').limit(2000),
    admin.from('baseball_coaches').select('user_id').limit(2000),
    admin.from('golf_teams').select('id, name'),
    admin.from('baseball_teams').select('id, name'),
    admin.from('golf_team_members').select('team_id, player_id').eq('status', 'active'),
    admin.from('baseball_team_members').select('team_id, player_id').eq('status', 'active'),
    admin.from('golf_rounds').select('team_id, created_at').order('created_at', { ascending: false }).limit(2000),
    admin.from('baseball_games').select('team_id, created_at').order('created_at', { ascending: false }).limit(1000),
    admin
      .from('admin_events')
      .select('team_id, sport')
      .eq('event_type', 'error')
      .gte('created_at', ago7d)
      .limit(1000),
  ]);

  const golfPlayerRows = (golfPlayersRes.data ?? []) as IdRow[];
  const baseballPlayerRows = (baseballPlayersRes.data ?? []) as IdRow[];

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

  const users: DirectoryUser[] = (usersRes.data ?? [])
    .map((u) => {
      const row = u as { id: string; email: string; role: string; created_at: string | null; last_seen: string | null };
      const sports: Array<'golf' | 'baseball'> = [];
      if (golfUserIds.has(row.id)) sports.push('golf');
      if (baseballUserIds.has(row.id)) sports.push('baseball');
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

  const teams: Array<GolfTeamHealthRow & { sport: 'golf' | 'baseball' }> = [
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

  return {
    users,
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
      sports: Array.from(new Set(memberships.map((m) => m.sport))),
    },
    memberships,
    recentActivity,
    authEvents,
    errorEvents,
  };
}
