import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveTeamUserIds } from '@/lib/admin/data/team-scope';

/**
 * Helm Bridge — The Thread: a single entity's whole story (USER or TEAM
 * only — the owner cut the CRM coach entity from this build) merged into
 * one day-grouped, severity-colored vertical timeline.
 *
 * SCOPE: `admin_events` (feature usage, errors, auth), `golf_rounds` /
 * `baseball_games` (product sessions), `helm_lifting_sessions` (Lift Lab),
 * and roster join/leave nodes (`golf_team_members` /
 * `golf_team_coach_staff` / baseball equivalents). CRM (`crm_coaches` etc.)
 * is deliberately out of scope per the owner's cut.
 *
 * MERGE PATTERN: same shape as `activity.ts`'s k-way merge — each source is
 * its OWN targeted, scoped, `.order(desc).limit(N)` query, fetched inside
 * its own try/catch so one broken source degrades to an empty contribution
 * (reported in `degradedSources`) instead of blanking the whole Thread. This
 * is a single-entity view (not a cursor-paginated platform feed), so each
 * source's cap is generous (a few hundred rows) rather than page-sized —
 * `truncated` on the result is set when ANY source hit its own cap, so the
 * UI can say "showing the most recent N" honestly instead of implying a
 * complete history.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

export type ThreadEntityKind = 'user' | 'team';
export type ThreadLane = 'account' | 'auth' | 'product' | 'error' | 'lift' | 'roster';
export type ThreadSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface ThreadEvent {
  id: string;
  ts: string;
  lane: ThreadLane;
  severity: ThreadSeverity | null;
  title: string;
  detail: string | null;
  feature: string | null;
  href: string | null;
}

export interface ThreadHeader {
  kind: ThreadEntityKind;
  id: string;
  name: string;
  subtitle: string;
  statusLabel: string;
  statusTone: 'success' | 'warning' | 'danger' | 'neutral';
  daysInSystem: number | null;
  totalEvents: number;
  lastEventAt: string | null;
}

export interface EntityThreadResult {
  header: ThreadHeader | null;
  events: ThreadEvent[];
  truncated: boolean;
  degradedSources: string[];
}

const SOURCE_LIMIT = 400;
const ROSTER_LIMIT = 100;

function daysBetween(fromIso: string | null, toIso: string): number | null {
  if (!fromIso) return null;
  return Math.max(0, Math.floor((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86400_000));
}

const EMPTY: EntityThreadResult = { header: null, events: [], truncated: false, degradedSources: [] };

type Runner = () => Promise<{ events: ThreadEvent[]; hitCap: boolean }>;

async function runSources(
  sources: Record<string, Runner>,
): Promise<{ events: ThreadEvent[]; truncated: boolean; degradedSources: string[] }> {
  const degraded: string[] = [];
  let truncated = false;
  const all: ThreadEvent[] = [];
  await Promise.all(
    Object.entries(sources).map(async ([name, run]) => {
      try {
        const { events, hitCap } = await run();
        all.push(...events);
        if (hitCap) truncated = true;
      } catch {
        degraded.push(name);
      }
    }),
  );
  all.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return { events: all, truncated, degradedSources: degraded };
}

type AdminEventRow = {
  id: string;
  created_at: string | null;
  event_type: string;
  severity: string | null;
  title: string;
  message: string | null;
  feature: string | null;
  fingerprint: string | null;
  source: string | null;
};

const EVENT_TYPE_LANE: Record<string, ThreadLane> = {
  login: 'auth',
  signup: 'auth',
  security: 'auth',
  error: 'error',
  round_submitted: 'product',
  ai_generation: 'product',
  feature_use: 'product',
  onboarding: 'product',
  system: 'product',
  subscription: 'product',
  api: 'product',
};

function mapAdminEvent(r: AdminEventRow): ThreadEvent | null {
  if (!r.created_at) return null;
  const lane = EVENT_TYPE_LANE[r.event_type] ?? 'product';
  const severity = (r.severity as ThreadSeverity | null) ?? null;
  return {
    id: `admin_event:${r.id}`,
    ts: r.created_at,
    lane,
    severity: lane === 'error' ? severity : lane === 'auth' && r.event_type === 'security' ? severity : null,
    title: r.title,
    detail: r.message,
    feature: r.feature,
    href: lane === 'error' ? `/admin/errors/${r.fingerprint ?? r.id}` : null,
  };
}

/** USER mode — one player/coach's whole story. */
async function fetchUserThread(admin: AdminClient, userId: string): Promise<EntityThreadResult> {
  const { data: userRow, error: userErr } = await admin
    .from('users')
    .select('id, email, role, created_at, last_seen')
    .eq('id', userId)
    .maybeSingle();
  if (userErr) throw new Error(`entity-thread user: ${userErr.message}`);
  if (!userRow) return EMPTY;
  const user = userRow as { id: string; email: string; role: string; created_at: string | null; last_seen: string | null };

  const [golfPlayerRes, golfCoachRes, baseballPlayerRes, baseballCoachRes] = await Promise.all([
    admin.from('golf_players').select('id').eq('user_id', userId).maybeSingle(),
    admin.from('golf_coaches').select('id').eq('user_id', userId).maybeSingle(),
    admin.from('baseball_players').select('id').eq('user_id', userId).maybeSingle(),
    admin.from('baseball_coaches').select('id').eq('user_id', userId).maybeSingle(),
  ]);
  const golfPlayerId = (golfPlayerRes.data as { id: string } | null)?.id ?? null;
  const golfCoachId = (golfCoachRes.data as { id: string } | null)?.id ?? null;
  const baseballPlayerId = (baseballPlayerRes.data as { id: string } | null)?.id ?? null;
  const baseballCoachId = (baseballCoachRes.data as { id: string } | null)?.id ?? null;

  const sources: Record<string, Runner> = {
    admin_events: async () => {
      const { data, error } = await admin
        .from('admin_events')
        .select('id, created_at, event_type, severity, title, message, feature, fingerprint, source')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(SOURCE_LIMIT);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as AdminEventRow[];
      return {
        events: rows.map(mapAdminEvent).filter((e): e is ThreadEvent => !!e),
        hitCap: rows.length >= SOURCE_LIMIT,
      };
    },
  };

  if (golfPlayerId) {
    sources.golf_rounds = async () => {
      const { data, error } = await admin
        .from('golf_rounds')
        .select('id, created_at, total_score, score_to_par, course_name, team_id, status')
        .eq('player_id', golfPlayerId)
        .order('created_at', { ascending: false })
        .limit(SOURCE_LIMIT);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as Array<{
        id: string; created_at: string | null; total_score: number | null; score_to_par: number | null; course_name: string | null; team_id: string | null; status: string | null;
      }>;
      return {
        events: rows
          .filter((r): r is typeof r & { created_at: string } => !!r.created_at)
          .map((r) => ({
            id: `golf_round:${r.id}`,
            ts: r.created_at,
            lane: 'product' as const,
            severity: null,
            title: r.status === 'completed' ? 'Logged a round' : 'Started a round',
            detail: [r.course_name, r.total_score != null ? `score ${r.total_score}` : null].filter(Boolean).join(' — ') || null,
            feature: 'round_tracking',
            href: r.team_id ? `/admin/teams/${r.team_id}` : null,
          })),
        hitCap: rows.length >= SOURCE_LIMIT,
      };
    };
  }

  if (baseballPlayerId) {
    sources.baseball_timeline = async () => {
      const { data, error } = await admin
        .from('baseball_player_timeline_events')
        .select('id, occurred_at, event_type, title, body, team_id')
        .eq('player_id', baseballPlayerId)
        .order('occurred_at', { ascending: false })
        .limit(SOURCE_LIMIT);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as Array<{
        id: string; occurred_at: string | null; event_type: string; title: string; body: string | null; team_id: string;
      }>;
      return {
        events: rows
          .filter((r): r is typeof r & { occurred_at: string } => !!r.occurred_at)
          .map((r) => ({
            id: `baseball_timeline:${r.id}`,
            ts: r.occurred_at,
            lane: 'product' as const,
            severity: null,
            title: r.title,
            detail: r.body,
            feature: r.event_type,
            href: `/admin/users?team=${r.team_id}`,
          })),
        hitCap: rows.length >= SOURCE_LIMIT,
      };
    };
  }

  sources.lift = async () => {
    const { data, error } = await admin
      .from('helm_lifting_sessions')
      .select('id, created_at, sport, status, title')
      .eq('athlete_id', userId)
      .order('created_at', { ascending: false })
      .limit(SOURCE_LIMIT);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Array<{ id: string; created_at: string; sport: string; status: string; title: string | null }>;
    return {
      events: rows.map((r) => ({
        id: `lift:${r.id}`,
        ts: r.created_at,
        lane: 'lift' as const,
        severity: null,
        title: r.title ?? 'Lift session',
        detail: `${r.sport} — ${r.status}`,
        feature: 'lift_lab',
        href: null,
      })),
      hitCap: rows.length >= SOURCE_LIMIT,
    };
  };

  if (golfPlayerId || golfCoachId) {
    sources.golf_roster = async () => {
      const events: ThreadEvent[] = [];
      if (golfPlayerId) {
        const { data, error } = await admin
          .from('golf_team_members')
          .select('id, team_id, joined_at, created_at, golf_teams(name)')
          .eq('player_id', golfPlayerId)
          .limit(ROSTER_LIMIT);
        if (error) throw new Error(error.message);
        for (const row of (data ?? []) as unknown as Array<{ id: string; team_id: string; joined_at: string | null; created_at: string | null; golf_teams: { name: string } | null }>) {
          const ts = row.joined_at ?? row.created_at;
          if (!ts) continue;
          events.push({
            id: `golf_roster:${row.id}`,
            ts,
            lane: 'roster',
            severity: null,
            title: `Joined ${row.golf_teams?.name ?? 'a golf team'}`,
            detail: null,
            feature: null,
            href: `/admin/teams/${row.team_id}`,
          });
        }
      }
      if (golfCoachId) {
        const { data, error } = await admin
          .from('golf_team_coach_staff')
          .select('id, team_id, created_at, is_primary, golf_teams(name)')
          .eq('coach_id', golfCoachId)
          .limit(ROSTER_LIMIT);
        if (error) throw new Error(error.message);
        for (const row of (data ?? []) as unknown as Array<{ id: string; team_id: string; created_at: string | null; is_primary: boolean | null; golf_teams: { name: string } | null }>) {
          if (!row.created_at) continue;
          events.push({
            id: `golf_coach_staff:${row.id}`,
            ts: row.created_at,
            lane: 'roster',
            severity: null,
            title: `Joined ${row.golf_teams?.name ?? 'a golf team'} staff${row.is_primary ? ' (primary)' : ''}`,
            detail: null,
            feature: null,
            href: `/admin/teams/${row.team_id}`,
          });
        }
      }
      return { events, hitCap: false };
    };
  }

  if (baseballPlayerId || baseballCoachId) {
    sources.baseball_roster = async () => {
      const events: ThreadEvent[] = [];
      if (baseballPlayerId) {
        const { data, error } = await admin
          .from('baseball_team_members')
          .select('id, team_id, joined_at, created_at, baseball_teams(name)')
          .eq('player_id', baseballPlayerId)
          .limit(ROSTER_LIMIT);
        if (error) throw new Error(error.message);
        for (const row of (data ?? []) as unknown as Array<{ id: string; team_id: string; joined_at: string | null; created_at: string | null; baseball_teams: { name: string } | null }>) {
          const ts = row.joined_at ?? row.created_at;
          if (!ts) continue;
          events.push({
            id: `baseball_roster:${row.id}`,
            ts,
            lane: 'roster',
            severity: null,
            title: `Joined ${row.baseball_teams?.name ?? 'a baseball team'}`,
            detail: null,
            feature: null,
            href: `/admin/users?team=${row.team_id}`,
          });
        }
      }
      if (baseballCoachId) {
        const { data, error } = await admin
          .from('baseball_team_coach_staff')
          .select('id, team_id, created_at, baseball_teams(name)')
          .eq('coach_id', baseballCoachId)
          .limit(ROSTER_LIMIT);
        if (error) throw new Error(error.message);
        for (const row of (data ?? []) as unknown as Array<{ id: string; team_id: string; created_at: string | null; baseball_teams: { name: string } | null }>) {
          if (!row.created_at) continue;
          events.push({
            id: `baseball_coach_staff:${row.id}`,
            ts: row.created_at,
            lane: 'roster',
            severity: null,
            title: `Joined ${row.baseball_teams?.name ?? 'a baseball team'} staff`,
            detail: null,
            feature: null,
            href: `/admin/users?team=${row.team_id}`,
          });
        }
      }
      return { events, hitCap: false };
    };
  }

  const { events: sourcedEvents, truncated, degradedSources } = await runSources(sources);

  const events: ThreadEvent[] = [
    ...sourcedEvents,
    {
      id: `account:${user.id}`,
      ts: user.created_at ?? new Date(0).toISOString(),
      lane: 'account',
      severity: null,
      title: 'Account created',
      detail: user.role,
      feature: null,
      href: null,
    },
  ];
  events.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));

  const now = new Date().toISOString();
  const lastEventAt = events[0]?.ts ?? user.last_seen ?? null;

  const header: ThreadHeader = {
    kind: 'user',
    id: user.id,
    name: user.email,
    subtitle: user.role,
    statusLabel: user.last_seen && daysBetween(user.last_seen, now) !== null && (daysBetween(user.last_seen, now) as number) <= 7 ? 'active' : 'cold',
    statusTone: user.last_seen && daysBetween(user.last_seen, now) !== null && (daysBetween(user.last_seen, now) as number) <= 7 ? 'success' : 'neutral',
    daysInSystem: daysBetween(user.created_at, now),
    totalEvents: events.length,
    lastEventAt,
  };

  return { header, events, truncated, degradedSources };
}

/** TEAM mode — a whole roster's story merged into one spine. */
async function fetchTeamThread(admin: AdminClient, teamId: string): Promise<EntityThreadResult> {
  const [golfTeamRes, baseballTeamRes] = await Promise.all([
    admin.from('golf_teams').select('id, name, created_at, season_active').eq('id', teamId).maybeSingle(),
    admin.from('baseball_teams').select('id, name, created_at').eq('id', teamId).maybeSingle(),
  ]);
  const golfTeam = golfTeamRes.data as { id: string; name: string; created_at: string | null; season_active: boolean | null } | null;
  const baseballTeam = baseballTeamRes.data as { id: string; name: string; created_at: string | null } | null;
  const team = golfTeam ?? baseballTeam;
  if (!team) return EMPTY;
  const sport: 'golf' | 'baseball' = golfTeam ? 'golf' : 'baseball';

  // `.catch(() => new Set())` was SILENT. An empty id set skips the
  // admin_events_users source entirely (see the length guard below), so a
  // failed roster resolution renders as "this team has no user-scoped
  // activity" rather than as unknown. Register the source in the failed case
  // so it reaches degradedSources instead of vanishing.
  let rosterResolutionFailed = false;
  const teamUserIds = await resolveTeamUserIds(teamId).catch(() => {
    rosterResolutionFailed = true;
    return new Set<string>();
  });
  const userIdList = Array.from(teamUserIds);

  const sources: Record<string, Runner> = {
    admin_events_team: async () => {
      const { data, error } = await admin
        .from('admin_events')
        .select('id, created_at, event_type, severity, title, message, feature, fingerprint, source')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
        .limit(SOURCE_LIMIT);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as AdminEventRow[];
      return { events: rows.map(mapAdminEvent).filter((e): e is ThreadEvent => !!e), hitCap: rows.length >= SOURCE_LIMIT };
    },
  };

  if (rosterResolutionFailed) {
    // Throws immediately — the runner's own error path files it under
    // degradedSources, which is exactly the "we could not look" signal.
    sources.admin_events_users = async () => {
      throw new Error('team roster could not be resolved — user-scoped activity is unknown, not empty');
    };
  } else if (userIdList.length > 0) {
    sources.admin_events_users = async () => {
      const { data, error } = await admin
        .from('admin_events')
        .select('id, created_at, event_type, severity, title, message, feature, fingerprint, source')
        .is('team_id', null)
        .in('user_id', userIdList)
        .order('created_at', { ascending: false })
        .limit(SOURCE_LIMIT);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as AdminEventRow[];
      return { events: rows.map(mapAdminEvent).filter((e): e is ThreadEvent => !!e), hitCap: rows.length >= SOURCE_LIMIT };
    };
  }

  if (sport === 'golf') {
    sources.golf_rounds = async () => {
      const { data, error } = await admin
        .from('golf_rounds')
        .select('id, created_at, total_score, course_name, player_id, status, golf_players(first_name, last_name)')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
        .limit(SOURCE_LIMIT);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as Array<{
        id: string; created_at: string | null; total_score: number | null; course_name: string | null; status: string | null;
        golf_players: { first_name: string | null; last_name: string | null } | null;
      }>;
      return {
        events: rows
          .filter((r): r is typeof r & { created_at: string } => !!r.created_at)
          .map((r) => {
            const name = `${r.golf_players?.first_name ?? ''} ${r.golf_players?.last_name ?? ''}`.trim() || 'A player';
            return {
              id: `golf_round:${r.id}`,
              ts: r.created_at,
              lane: 'product' as const,
              severity: null,
              title: `${name} ${r.status === 'completed' ? 'logged a round' : 'started a round'}`,
              detail: [r.course_name, r.total_score != null ? `score ${r.total_score}` : null].filter(Boolean).join(' — ') || null,
              feature: 'round_tracking',
              href: null,
            };
          }),
        hitCap: rows.length >= SOURCE_LIMIT,
      };
    };
  } else {
    sources.baseball_games = async () => {
      const { data, error } = await admin
        .from('baseball_games')
        .select('id, created_at, opponent_name, our_score, opponent_score, status, game_type')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
        .limit(SOURCE_LIMIT);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as Array<{
        id: string; created_at: string | null; opponent_name: string | null; our_score: number | null; opponent_score: number | null; status: string | null; game_type: string | null;
      }>;
      return {
        events: rows
          .filter((r): r is typeof r & { created_at: string } => !!r.created_at)
          .map((r) => ({
            id: `baseball_game:${r.id}`,
            ts: r.created_at,
            lane: 'product' as const,
            severity: null,
            title: r.opponent_name ? `Game vs ${r.opponent_name}` : 'Game logged',
            detail:
              r.our_score != null && r.opponent_score != null ? `${r.our_score}–${r.opponent_score} · ${r.status ?? ''}`.trim() : r.status,
            feature: 'baseball_games',
            href: null,
          })),
        hitCap: rows.length >= SOURCE_LIMIT,
      };
    };
  }

  sources.lift = async () => {
    const { data, error } = await admin
      .from('helm_lifting_sessions')
      .select('id, created_at, athlete_id, status, title')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(SOURCE_LIMIT);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Array<{ id: string; created_at: string; athlete_id: string; status: string; title: string | null }>;
    return {
      events: rows.map((r) => ({
        id: `lift:${r.id}`,
        ts: r.created_at,
        lane: 'lift' as const,
        severity: null,
        title: r.title ?? 'Lift session',
        detail: r.status,
        feature: 'lift_lab',
        href: null,
      })),
      hitCap: rows.length >= SOURCE_LIMIT,
    };
  };

  // Two explicit typed branches rather than a dynamic `.from(tableNameVar)` —
  // the generated Supabase client types `.from()` against literal table-name
  // keys, and a `string`-typed variable would only satisfy that with an
  // `as any` cast (banned house rule).
  type RosterRow = { id: string; joined_at: string | null; created_at: string | null; name: string | null };
  sources.roster = async () => {
    let rows: RosterRow[] = [];
    if (sport === 'golf') {
      const { data, error } = await admin
        .from('golf_team_members')
        .select('id, joined_at, created_at, golf_players(first_name, last_name)')
        .eq('team_id', teamId)
        .limit(ROSTER_LIMIT);
      if (error) throw new Error(error.message);
      rows = ((data ?? []) as unknown as Array<{
        id: string; joined_at: string | null; created_at: string | null;
        golf_players: { first_name: string | null; last_name: string | null } | null;
      }>).map((r) => ({
        id: r.id,
        joined_at: r.joined_at,
        created_at: r.created_at,
        name: `${r.golf_players?.first_name ?? ''} ${r.golf_players?.last_name ?? ''}`.trim() || null,
      }));
    } else {
      const { data, error } = await admin
        .from('baseball_team_members')
        .select('id, joined_at, created_at, baseball_players(first_name, last_name)')
        .eq('team_id', teamId)
        .limit(ROSTER_LIMIT);
      if (error) throw new Error(error.message);
      rows = ((data ?? []) as unknown as Array<{
        id: string; joined_at: string | null; created_at: string | null;
        baseball_players: { first_name: string | null; last_name: string | null } | null;
      }>).map((r) => ({
        id: r.id,
        joined_at: r.joined_at,
        created_at: r.created_at,
        name: `${r.baseball_players?.first_name ?? ''} ${r.baseball_players?.last_name ?? ''}`.trim() || null,
      }));
    }
    return {
      events: rows
        .map((r): ThreadEvent | null => {
          const ts = r.joined_at ?? r.created_at;
          if (!ts) return null;
          return {
            id: `roster:${r.id}`,
            ts,
            lane: 'roster',
            severity: null,
            title: `${r.name ?? 'A player'} joined the roster`,
            detail: null,
            feature: null,
            href: null,
          };
        })
        .filter((e): e is ThreadEvent => e !== null),
      hitCap: false,
    };
  };

  const { events: sourcedEvents, truncated, degradedSources } = await runSources(sources);

  const events: ThreadEvent[] = [
    ...sourcedEvents,
    {
      id: `account:${team.id}`,
      ts: team.created_at ?? new Date(0).toISOString(),
      lane: 'account',
      severity: null,
      title: 'Team created',
      detail: sport,
      feature: null,
      href: null,
    },
  ];
  events.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));

  const now = new Date().toISOString();
  const lastEventAt = events[0]?.ts ?? null;
  const recentDays = daysBetween(lastEventAt, now);

  const header: ThreadHeader = {
    kind: 'team',
    id: team.id,
    name: team.name,
    subtitle: `${sport} team · ${teamUserIds.size} roster/staff`,
    statusLabel: recentDays !== null && recentDays <= 7 ? 'active team' : recentDays !== null && recentDays <= 14 ? 'cooling' : 'quiet',
    statusTone: recentDays !== null && recentDays <= 7 ? 'success' : recentDays !== null && recentDays <= 14 ? 'warning' : 'neutral',
    daysInSystem: daysBetween(team.created_at, now),
    totalEvents: events.length,
    lastEventAt,
  };

  return { header, events, truncated, degradedSources };
}

/**
 * CALLER must have passed requireSuperAdmin() — every query above runs
 * against the service-role client (createAdminClient()).
 */
export async function fetchEntityThread(kind: ThreadEntityKind, id: string): Promise<EntityThreadResult> {
  const admin = createAdminClient();
  if (kind === 'user') return fetchUserThread(admin, id);
  return fetchTeamThread(admin, id);
}

/** Pure, exported for tests: groups already-sorted-desc events by calendar day. */
export function groupEventsByDay(events: readonly ThreadEvent[]): Array<{ day: string; events: ThreadEvent[] }> {
  const groups: Array<{ day: string; events: ThreadEvent[] }> = [];
  for (const event of events) {
    const day = event.ts.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.events.push(event);
    else groups.push({ day, events: [event] });
  }
  return groups;
}
