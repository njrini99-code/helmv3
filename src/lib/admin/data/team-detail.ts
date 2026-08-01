import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { classifyTeamHealth, type TeamHealth } from '@/lib/admin/data/golf';
import { excludeAuthNoise } from '@/lib/admin/data/triage';
import { resolveTeamUserIds } from '@/lib/admin/data/team-scope';

/**
 * Helm Bridge V2 — one team's whole story: roster health, staff, 30d
 * activity, its own errors, and its CoachHelm spend. Every query below is
 * scoped to a single `teamId` (never platform-wide) and bounded with
 * `.limit()`.
 *
 * FAIL-SOFT BY SECTION (per the pinned contract): `team` is fetched first —
 * if it comes back null the whole result short-circuits (a real "team not
 * found," not a degraded page). Every OTHER section is independently
 * try/caught; a broken query degrades that one section to its empty value
 * (`[]` or `null`) instead of taking down the whole team page. This mirrors
 * `activity.ts`'s per-source isolation, at section granularity instead of
 * per-activity-kind.
 *
 * SCHEMA-DRIFT FINDINGS (verified against src/lib/types/database.ts):
 *   - `golf_players` / `golf_coaches` have NO `team_id` column — roster is
 *     `golf_team_members.player_id` (status='active'), staff is
 *     `golf_team_coach_staff.coach_id`. Same shape `users.ts` already
 *     depends on for the platform directory.
 *   - `golf_coachhelm_llm_calls`/`golf_coachhelm_llm_budget` key on
 *     `coach_id`, not `team_id` — team-scoped CoachHelm usage first resolves
 *     this team's coach ids (already fetched for the staff section, reused,
 *     not re-queried) then filters both tables by `.in('coach_id', ...)`.
 *   - `golf_rounds` ordering trick: ONE query
 *     (`team_id` + `status=completed`, ordered `created_at desc`, capped at
 *     1000) answers BOTH "true last round per player" (first hit per
 *     player_id in the desc-ordered rows — accurate even if the round is
 *     months old) AND "rounds in the last 30 days" (rows within the window)
 *     AND the 30-day daily rounds trend — without a second query or an
 *     unbounded fetch. 1000 completed rounds for one team is a generous cap
 *     (a college team logging more than that in its most recent history
 *     before this query would need refreshing is not a realistic scale).
 *   - `admin_events.team_id` IS populated for `event_type = 'error'` (unlike
 *     login/signup — see `team-scope.ts`) — team errors filter directly by
 *     `.eq('team_id', teamId)`, no user-id indirection needed.
 *   - Daily "logins" in `activityDaily` reuse `resolveTeamUserIds` (shared
 *     with `activity.ts`) since `admin_events` login rows never carry
 *     `team_id`.
 */

export interface TeamDetailTeam {
  id: string;
  name: string;
  gender: string;
  season: string | null;
  seasonActive: boolean;
  organizationId: string | null;
  joinCode: string;
  createdAt: string | null;
}

export interface TeamDetailCoach {
  id: string;
  userId: string;
  fullName: string | null;
  email: string | null;
  title: string | null;
  isPrimary: boolean;
  onboardingCompleted: boolean | null;
  lastSeen: string | null;
  href: string;
}

export interface TeamDetailRosterRow {
  playerId: string;
  userId: string;
  fullName: string | null;
  email: string | null;
  jerseyNumber: number | null;
  lastRoundAt: string | null;
  rounds30d: number;
  activityStatus: TeamHealth;
  href: string;
}

export interface TeamDetailDailyActivity {
  date: string;
  rounds: number;
  logins: number;
}

export interface TeamDetailErrorCluster {
  fingerprint: string;
  title: string;
  severity: string;
  occurrences: number;
  lastSeen: string;
  href: string;
}

export interface TeamDetailCoachHelmUsage {
  calls30d: number;
  cost30d: number;
  budgetToday: { budgetUsd: number; spentUsd: number } | null;
}

export interface TeamDetailResult {
  team: TeamDetailTeam | null;
  coaches: TeamDetailCoach[];
  roster: TeamDetailRosterRow[];
  activityDaily: TeamDetailDailyActivity[];
  errors: TeamDetailErrorCluster[];
  coachhelm: TeamDetailCoachHelmUsage | null;
  /** Header health-badge input — MUST match /admin/golf's classifyTeamHealth
   *  input exactly: MAX(golf_rounds.created_at) for this team_id, NO status
   *  filter, NO roster filter (mirrors get_admin_rounds_rollup's
   *  all_rounds_minimal CTE). Deliberately NOT derived from `roster` — an
   *  in-progress round or a round logged by a since-removed player still
   *  counts for "is this team active," even though neither surfaces as a
   *  completed round on any current roster row. */
  teamLastActivity: string | null;
}

const ROSTER_LIMIT = 300;
const TEAM_ROUNDS_LIMIT = 1000;
const TEAM_LOGINS_LIMIT = 2000;
const TEAM_ERRORS_LIMIT = 300;
const DAILY_WINDOW_DAYS = 30;

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString();
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Pure, unit-tested: pre-fills every day in the window (so a quiet day
 *  shows 0, not a hole in the chart), then folds two already-fetched,
 *  already-scoped timestamp arrays into it. */
export function buildDailyActivity(
  roundTimestamps: readonly string[],
  loginTimestamps: readonly string[],
  windowDays: number,
  now: Date,
): TeamDetailDailyActivity[] {
  const days = new Map<string, TeamDetailDailyActivity>();
  for (let i = windowDays - 1; i >= 0; i--) {
    const key = dayKey(new Date(now.getTime() - i * 86400_000).toISOString());
    days.set(key, { date: key, rounds: 0, logins: 0 });
  }
  for (const ts of roundTimestamps) {
    const bucket = days.get(dayKey(ts));
    if (bucket) bucket.rounds += 1;
  }
  for (const ts of loginTimestamps) {
    const bucket = days.get(dayKey(ts));
    if (bucket) bucket.logins += 1;
  }
  return Array.from(days.values());
}

interface TeamErrorRow {
  id: string;
  created_at: string;
  title: string;
  severity: string;
  fingerprint: string | null;
}

/** Pure, unit-tested: group a team's already-fetched, already-scoped error
 *  rows by fingerprint (a row with no fingerprint is its own singleton
 *  cluster, keyed by its own id — never silently merged with unrelated
 *  fingerprint-less rows). Sorted most-recent-cluster-first. */
export function groupTeamErrorsByFingerprint(rows: readonly TeamErrorRow[]): TeamDetailErrorCluster[] {
  const buckets = new Map<string, { title: string; severity: string; occurrences: number; lastSeen: string }>();
  for (const r of rows) {
    const fp = r.fingerprint ?? `row:${r.id}`;
    const existing = buckets.get(fp);
    if (!existing) {
      buckets.set(fp, { title: r.title, severity: r.severity, occurrences: 1, lastSeen: r.created_at });
    } else {
      existing.occurrences += 1;
      if (r.created_at > existing.lastSeen) {
        existing.lastSeen = r.created_at;
        existing.title = r.title;
        existing.severity = r.severity;
      }
    }
  }
  return Array.from(buckets.entries())
    .map(([fingerprint, b]) => ({ fingerprint, href: `/admin/errors/${fingerprint}`, ...b }))
    .sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : a.lastSeen > b.lastSeen ? -1 : 0));
}

type TeamRow = {
  id: string;
  name: string;
  gender: string;
  season: string | null;
  season_active: boolean;
  organization_id: string | null;
  join_code: string;
  created_at: string | null;
};

type CoachStaffRow = {
  coach_id: string;
  is_primary: boolean | null;
  golf_coaches: {
    id: string;
    user_id: string;
    full_name: string | null;
    email: string | null;
    title: string | null;
    onboarding_completed: boolean | null;
    users: { last_seen: string | null } | null;
  } | null;
};

type RosterMemberRow = {
  player_id: string;
  jersey_number: number | null;
  golf_players: {
    id: string;
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
};

type RoundForTeamRow = { player_id: string; created_at: string | null };

/**
 * CALLER must have passed requireSuperAdmin() — every query below runs
 * against the service-role client (createAdminClient()).
 */
export async function fetchTeamDetail(teamId: string): Promise<TeamDetailResult> {
  const admin = createAdminClient();
  const now = new Date();
  const ago30d = isoDaysAgo(DAILY_WINDOW_DAYS);
  const todayDate = now.toISOString().slice(0, 10);

  const { data: teamRow, error: teamError } = await admin
    .from('golf_teams')
    .select('id, name, gender, season, season_active, organization_id, join_code, created_at')
    .eq('id', teamId)
    .maybeSingle();
  if (teamError) throw new Error(`team-detail team: ${teamError.message}`);

  const team: TeamDetailTeam | null = teamRow
    ? (() => {
        const t = teamRow as TeamRow;
        return {
          id: t.id,
          name: t.name,
          gender: t.gender,
          season: t.season,
          seasonActive: t.season_active,
          organizationId: t.organization_id,
          joinCode: t.join_code,
          createdAt: t.created_at,
        };
      })()
    : null;

  if (!team) {
    return { team: null, coaches: [], roster: [], activityDaily: [], errors: [], coachhelm: null, teamLastActivity: null };
  }

  let coaches: TeamDetailCoach[] = [];
  let coachIds: string[] = [];
  try {
    const { data, error } = await admin
      .from('golf_team_coach_staff')
      .select(
        'coach_id, is_primary, golf_coaches(id, user_id, full_name, email, title, onboarding_completed, users(last_seen))',
      )
      .eq('team_id', teamId)
      .limit(50);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as CoachStaffRow[];
    coaches = rows
      .filter((r): r is CoachStaffRow & { golf_coaches: NonNullable<CoachStaffRow['golf_coaches']> } => !!r.golf_coaches)
      .map((r) => ({
        id: r.golf_coaches.id,
        userId: r.golf_coaches.user_id,
        fullName: r.golf_coaches.full_name,
        email: r.golf_coaches.email,
        title: r.golf_coaches.title,
        isPrimary: r.is_primary ?? false,
        onboardingCompleted: r.golf_coaches.onboarding_completed,
        lastSeen: r.golf_coaches.users?.last_seen ?? null,
        href: `/admin/users/${r.golf_coaches.user_id}`,
      }));
    coachIds = coaches.map((c) => c.id);
  } catch {
    coaches = [];
  }

  // Roster + last-round + rounds-30d + daily rounds trend all come from ONE
  // scoped, bounded query (see module doc) — never per-player N+1.
  let roundsForTeam: RoundForTeamRow[] = [];
  try {
    const { data, error } = await admin
      .from('golf_rounds')
      .select('player_id, created_at')
      .eq('team_id', teamId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(TEAM_ROUNDS_LIMIT);
    if (error) throw new Error(error.message);
    roundsForTeam = (data ?? []) as unknown as RoundForTeamRow[];
  } catch {
    roundsForTeam = [];
  }

  // Separate ONE-row query for the header health badge — see
  // `teamLastActivity` doc on TeamDetailResult for why this can't reuse
  // `roundsForTeam` above (that's status=completed + implicitly
  // active-roster-only once joined into `roster`; this is neither).
  let teamLastActivity: string | null = null;
  try {
    const { data, error } = await admin
      .from('golf_rounds')
      .select('created_at')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    teamLastActivity = (data as { created_at: string | null } | null)?.created_at ?? null;
  } catch {
    teamLastActivity = null;
  }

  const lastRoundByPlayer = new Map<string, string>();
  const rounds30dByPlayer = new Map<string, number>();
  for (const r of roundsForTeam) {
    if (!r.created_at) continue;
    if (!lastRoundByPlayer.has(r.player_id)) lastRoundByPlayer.set(r.player_id, r.created_at);
    if (r.created_at >= ago30d) {
      rounds30dByPlayer.set(r.player_id, (rounds30dByPlayer.get(r.player_id) ?? 0) + 1);
    }
  }

  let roster: TeamDetailRosterRow[] = [];
  try {
    const { data, error } = await admin
      .from('golf_team_members')
      .select('player_id, jersey_number, golf_players(id, user_id, first_name, last_name, email)')
      .eq('team_id', teamId)
      .eq('status', 'active')
      .limit(ROSTER_LIMIT);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as RosterMemberRow[];
    roster = rows
      .filter((r): r is RosterMemberRow & { golf_players: NonNullable<RosterMemberRow['golf_players']> } => !!r.golf_players)
      .map((r) => {
        const lastRoundAt = lastRoundByPlayer.get(r.player_id) ?? null;
        const first = r.golf_players.first_name;
        const last = r.golf_players.last_name;
        const fullName = `${first ?? ''} ${last ?? ''}`.trim();
        return {
          playerId: r.player_id,
          userId: r.golf_players.user_id,
          fullName: fullName.length > 0 ? fullName : null,
          email: r.golf_players.email,
          jerseyNumber: r.jersey_number,
          lastRoundAt,
          rounds30d: rounds30dByPlayer.get(r.player_id) ?? 0,
          activityStatus: classifyTeamHealth(lastRoundAt, now),
          href: `/admin/users/${r.golf_players.user_id}`,
        };
      });
  } catch {
    roster = [];
  }

  // Daily activity: rounds come from the already-fetched team-rounds window;
  // logins need the team's user-id set (shared resolver with activity.ts —
  // admin_events.team_id is never set on login rows).
  let activityDaily: TeamDetailDailyActivity[] = [];
  try {
    const teamUserIds = await resolveTeamUserIds(teamId);
    let loginTimestamps: string[] = [];
    if (teamUserIds.size > 0) {
      // Paginated past the PostgREST 1000-row cap; TEAM_LOGINS_LIMIT is enforced
      // by stopping page accumulation. `.limit(TEAM_LOGINS_LIMIT)` silently
      // returned at most 1000, undercounting team login activity with no error.
      // `.order('id')` gives pagination a stable unique sort.
      const { data, error } = await fetchAllRowsResult<{ created_at: string | null }>(
        (from, to) => {
          if (from >= TEAM_LOGINS_LIMIT) return Promise.resolve({ data: [], error: null });
          return admin
            .from('admin_events')
            .select('created_at')
            .eq('event_type', 'login')
            .gte('created_at', ago30d)
            .in('user_id', Array.from(teamUserIds))
            .order('id', { ascending: true })
            .range(from, Math.min(to, TEAM_LOGINS_LIMIT - 1));
        },
      );
      if (error) throw new Error(error.message);
      loginTimestamps = ((data ?? []) as unknown as Array<{ created_at: string | null }>)
        .map((r) => r.created_at)
        .filter((v): v is string => !!v);
    }
    const roundTimestamps = roundsForTeam
      .filter((r) => r.created_at && r.created_at >= ago30d)
      .map((r) => r.created_at as string);
    activityDaily = buildDailyActivity(roundTimestamps, loginTimestamps, DAILY_WINDOW_DAYS, now);
  } catch {
    activityDaily = [];
  }

  let errors: TeamDetailErrorCluster[] = [];
  try {
    let q = admin
      .from('admin_events')
      .select('id, created_at, title, severity, fingerprint')
      .eq('team_id', teamId)
      .eq('event_type', 'error')
      .order('created_at', { ascending: false })
      .limit(TEAM_ERRORS_LIMIT);
    q = excludeAuthNoise(q);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = ((data ?? []) as unknown as Array<{
      id: string; created_at: string | null; title: string; severity: string; fingerprint: string | null;
    }>).filter((r): r is TeamErrorRow => !!r.created_at);
    errors = groupTeamErrorsByFingerprint(rows);
  } catch {
    errors = [];
  }

  // CoachHelm usage keys on coach_id, not team_id — reuse the coach ids
  // already resolved for the staff section (no re-query). No coaches on
  // this team means no CoachHelm spend is even possible: an honest null,
  // not a misleading all-zero usage block.
  let coachhelm: TeamDetailCoachHelmUsage | null = null;
  if (coachIds.length > 0) {
    try {
      const [callsCountRes, costRes, budgetRes] = await Promise.all([
        // Pure count — head:true never triggers the PostgREST 1000-row cap,
        // unlike deriving calls30d from calls.length on a capped fetch.
        admin
          .from('golf_coachhelm_llm_calls')
          .select('id', { count: 'exact', head: true })
          .in('coach_id', coachIds)
          .gte('created_at', ago30d),
        // Cost needs every row's cost_usd to sum — paginate past the cap
        // instead of the prior .limit(2000), which silently under-summed
        // cost30d for any coach staff whose combined 30d call volume passed
        // 2000 rows.
        fetchAllRowsResult((from, to) =>
          admin
            .from('golf_coachhelm_llm_calls')
            .select('cost_usd')
            .in('coach_id', coachIds)
            .gte('created_at', ago30d)
            .order('id', { ascending: true })
            .range(from, to),
        ),
        admin
          .from('golf_coachhelm_llm_budget')
          .select('budget_usd, spent_usd')
          .in('coach_id', coachIds)
          .eq('date', todayDate),
      ]);
      if (callsCountRes.error) throw new Error(callsCountRes.error.message);
      if (costRes.error) throw new Error(costRes.error.message);
      if (budgetRes.error) throw new Error(budgetRes.error.message);
      const calls = (costRes.data ?? []) as Array<{ cost_usd: number | null }>;
      const budgetRows = (budgetRes.data ?? []) as Array<{ budget_usd: number; spent_usd: number }>;
      const budgetToday = budgetRows.length > 0
        ? {
            budgetUsd: budgetRows.reduce((sum, r) => sum + r.budget_usd, 0),
            spentUsd: budgetRows.reduce((sum, r) => sum + r.spent_usd, 0),
          }
        : null;
      coachhelm = {
        calls30d: callsCountRes.count ?? 0,
        cost30d: calls.reduce((sum, c) => sum + (c.cost_usd ?? 0), 0),
        budgetToday,
      };
    } catch {
      coachhelm = null;
    }
  }

  return { team, coaches, roster, activityDaily, errors, coachhelm, teamLastActivity };
}
