import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';

/**
 * Helm Bridge — Pulse Grid: every team (golf + baseball) as one row with a
 * 30-day day-bucketed activity/error EKG, sorted worst-first so a quiet or
 * spiking team floats to the top without the operator having to know to go
 * looking for it.
 *
 * TEAM_ID COVERAGE IN admin_events — VERIFIED, NOT ASSUMED:
 *   - `logLogin()` / `logSignup()` (src/lib/admin-logger.ts) never accept or
 *     write a `teamId` at all — every login/signup row has `team_id = null`,
 *     forever (same finding `team-scope.ts` already documents and this file
 *     reuses the same `resolveTeamUserIds`-style user-id indirection for).
 *   - `logRoundSubmitted()` / `logAIGeneration()` / `logSecurityEvent()`
 *     likewise take no `teamId` parameter — never populated.
 *   - The ONE writer that does thread a real `teamId` through is
 *     `writeAdminTables()` in `src/lib/server-error-logger.ts`
 *     (`team_id: enriched.teamId ?? null`), and only when the calling site
 *     passed `context.teamId` — inconsistent across ~1,300 call sites of
 *     `logServerError`/`logServerException`. `team-detail.ts` already
 *     verified (and relies on) `team_id` being populated for a meaningful
 *     share of `event_type = 'error'` rows; it is NOT reliably populated for
 *     any other event_type.
 *
 * HONEST DEGRADE (per the above): the EKG's green "activity" baseline is
 * built from genuine team-scoped source-of-truth tables that carry a real
 * `team_id` column — `golf_rounds`, `baseball_games`, `helm_lifting_sessions`
 * — PLUS `admin_events` login rows resolved through a bulk roster/staff
 * membership map (the same indirection `resolveTeamUserIds` uses for one
 * team, done once for every team here to keep this a bounded, small query
 * set instead of N+1). The red "error" overlay unions `admin_events` rows
 * that already carry `team_id` with rows that don't but whose `user_id`
 * resolves to this team's roster/staff. What is deliberately NOT attempted:
 * a per-feature "which feature were they using" dash lane — `admin_events`
 * has no reliable team attribution outside error/login as verified above, so
 * fabricating a feature-use lane per team would be showing a signal that
 * isn't really there. `degradedNote` on the result surfaces this in the UI
 * rather than leaving it silent.
 *
 * COST BOUND: a fixed, small number of queries regardless of team count —
 * 2 team-list reads, 4 membership reads, 5 event/activity reads (each
 * paginated past the PostgREST 1000-row cap via `fetchAllRowsResult`) — never
 * one query per team.
 */

const WINDOW_DAYS = 30;
const HALO_FRESH_DAYS = 2;
const HALO_COOLING_MAX_DAYS = 14;

export type PulseHalo = 'fresh' | 'cooling' | 'silent';
export type PulseSort = 'attention' | 'last-seen' | 'most-active' | 'most-errors';

export const PULSE_SORTS: readonly PulseSort[] = ['attention', 'last-seen', 'most-active', 'most-errors'];

export interface PulseDayBucket {
  /** 'YYYY-MM-DD', oldest → newest. */
  date: string;
  /** Rounds + games + lift sessions + resolved logins that day. */
  activity: number;
  /** Error/critical admin_events rows attributed to this team that day. */
  errors: number;
  /** True if any of that day's error rows were severity='critical'. */
  critical: boolean;
}

export interface PulseTeamRow {
  teamId: string;
  name: string;
  sport: 'golf' | 'baseball';
  playerCount: number;
  buckets: PulseDayBucket[];
  lastActivityDate: string | null;
  daysSinceActivity: number;
  halo: PulseHalo;
  activity30d: number;
  errors30d: number;
  criticalErrors30d: number;
  attentionScore: number;
  href: string;
  threadHref: string;
}

export interface PulseGridResult {
  teams: PulseTeamRow[];
  windowDays: number;
  sort: PulseSort;
  degradedNote: string;
  generatedAt: string;
}

function isoDaysAgo(days: number, now: Date): string {
  return new Date(now.getTime() - days * 86400_000).toISOString();
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

interface MutableTeam {
  teamId: string;
  name: string;
  sport: 'golf' | 'baseball';
  playerCount: number;
  days: Map<string, PulseDayBucket>;
}

function emptyDays(windowDays: number, now: Date): Map<string, PulseDayBucket> {
  const days = new Map<string, PulseDayBucket>();
  for (let i = windowDays - 1; i >= 0; i -= 1) {
    const key = dayKey(new Date(now.getTime() - i * 86400_000).toISOString());
    days.set(key, { date: key, activity: 0, errors: 0, critical: false });
  }
  return days;
}

function bumpActivity(team: MutableTeam | undefined, iso: string | null): void {
  if (!team || !iso) return;
  const bucket = team.days.get(dayKey(iso));
  if (bucket) bucket.activity += 1;
}

function bumpError(team: MutableTeam | undefined, iso: string | null, severity: string | null): void {
  if (!team || !iso) return;
  const bucket = team.days.get(dayKey(iso));
  if (!bucket) return;
  bucket.errors += 1;
  if (severity === 'critical') bucket.critical = true;
}

function classifyHalo(daysSinceActivity: number | null): PulseHalo {
  if (daysSinceActivity === null) return 'silent';
  if (daysSinceActivity <= HALO_FRESH_DAYS) return 'fresh';
  if (daysSinceActivity <= HALO_COOLING_MAX_DAYS) return 'cooling';
  return 'silent';
}

type MembershipRow = { team_id: string | null; golf_players?: { user_id: string } | null; golf_coaches?: { user_id: string } | null; baseball_players?: { user_id: string } | null; baseball_coaches?: { user_id: string } | null };

export async function fetchPulseGrid(sort: PulseSort = 'attention'): Promise<PulseGridResult> {
  const admin = createAdminClient();
  const now = new Date();
  const ago30d = isoDaysAgo(WINDOW_DAYS, now);
  const generatedAt = now.toISOString();

  const [
    golfTeamsRes,
    baseballTeamsRes,
    golfMembersRes,
    golfStaffRes,
    baseballMembersRes,
    baseballStaffRes,
  ] = await Promise.all([
    fetchAllRowsResult((from, to) =>
      admin.from('golf_teams').select('id, name').order('id', { ascending: true }).range(from, to),
    ),
    fetchAllRowsResult((from, to) =>
      admin.from('baseball_teams').select('id, name').order('id', { ascending: true }).range(from, to),
    ),
    fetchAllRowsResult((from, to) =>
      admin
        .from('golf_team_members')
        .select('team_id, golf_players(user_id)')
        .eq('status', 'active')
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRowsResult((from, to) =>
      admin
        .from('golf_team_coach_staff')
        .select('team_id, golf_coaches(user_id)')
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRowsResult((from, to) =>
      admin
        .from('baseball_team_members')
        .select('team_id, baseball_players(user_id)')
        .eq('status', 'active')
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRowsResult((from, to) =>
      admin
        .from('baseball_team_coach_staff')
        .select('team_id, baseball_coaches(user_id)')
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ]);

  const teams = new Map<string, MutableTeam>();
  for (const t of (golfTeamsRes.data ?? []) as Array<{ id: string; name: string }>) {
    teams.set(t.id, { teamId: t.id, name: t.name, sport: 'golf', playerCount: 0, days: emptyDays(WINDOW_DAYS, now) });
  }
  for (const t of (baseballTeamsRes.data ?? []) as Array<{ id: string; name: string }>) {
    teams.set(t.id, { teamId: t.id, name: t.name, sport: 'baseball', playerCount: 0, days: emptyDays(WINDOW_DAYS, now) });
  }

  // Bulk roster+staff membership → team_id -> Set<userId> and its reverse,
  // userId -> Set<teamId>. Built once for every team instead of once per
  // team (the resolveTeamUserIds shape, done in bulk).
  const userTeamIds = new Map<string, Set<string>>();
  const allUserIds = new Set<string>();

  function ingestMembership(rows: MembershipRow[], embedKey: 'golf_players' | 'golf_coaches' | 'baseball_players' | 'baseball_coaches', isRoster: boolean): void {
    for (const row of rows) {
      const teamId = row.team_id;
      const uid = row[embedKey]?.user_id;
      if (!teamId || !uid) continue;
      const team = teams.get(teamId);
      if (team && isRoster) team.playerCount += 1;
      const set = userTeamIds.get(uid) ?? new Set<string>();
      set.add(teamId);
      userTeamIds.set(uid, set);
      allUserIds.add(uid);
    }
  }
  ingestMembership((golfMembersRes.data ?? []) as unknown as MembershipRow[], 'golf_players', true);
  ingestMembership((golfStaffRes.data ?? []) as unknown as MembershipRow[], 'golf_coaches', false);
  ingestMembership((baseballMembersRes.data ?? []) as unknown as MembershipRow[], 'baseball_players', true);
  ingestMembership((baseballStaffRes.data ?? []) as unknown as MembershipRow[], 'baseball_coaches', false);

  const userIdList = Array.from(allUserIds);

  const [loginsRes, teamErrorsRes, fallbackErrorsRes, roundsRes, gamesRes, liftRes] = await Promise.all([
    userIdList.length > 0
      ? fetchAllRowsResult((from, to) =>
          admin
            .from('admin_events')
            .select('user_id, created_at')
            .eq('event_type', 'login')
            .gte('created_at', ago30d)
            .in('user_id', userIdList)
            .order('id', { ascending: true })
            .range(from, to),
        )
      : Promise.resolve({ data: [] as Array<{ user_id: string | null; created_at: string | null }>, error: null }),
    fetchAllRowsResult((from, to) =>
      admin
        .from('admin_events')
        .select('team_id, created_at, severity')
        .eq('event_type', 'error')
        .not('team_id', 'is', null)
        .gte('created_at', ago30d)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    userIdList.length > 0
      ? fetchAllRowsResult((from, to) =>
          admin
            .from('admin_events')
            .select('user_id, created_at, severity')
            .eq('event_type', 'error')
            .is('team_id', null)
            .gte('created_at', ago30d)
            .in('user_id', userIdList)
            .order('id', { ascending: true })
            .range(from, to),
        )
      : Promise.resolve({ data: [] as Array<{ user_id: string | null; created_at: string | null; severity: string | null }>, error: null }),
    fetchAllRowsResult((from, to) =>
      admin
        .from('golf_rounds')
        .select('team_id, created_at')
        .gte('created_at', ago30d)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRowsResult((from, to) =>
      admin
        .from('baseball_games')
        .select('team_id, created_at')
        .gte('created_at', ago30d)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRowsResult((from, to) =>
      admin
        .from('helm_lifting_sessions')
        .select('team_id, created_at')
        .not('team_id', 'is', null)
        .gte('created_at', ago30d)
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ]);

  for (const r of (loginsRes.data ?? []) as Array<{ user_id: string | null; created_at: string | null }>) {
    if (!r.user_id || !r.created_at) continue;
    for (const teamId of userTeamIds.get(r.user_id) ?? []) {
      bumpActivity(teams.get(teamId), r.created_at);
    }
  }
  for (const r of (roundsRes.data ?? []) as Array<{ team_id: string | null; created_at: string | null }>) {
    if (!r.team_id) continue;
    bumpActivity(teams.get(r.team_id), r.created_at);
  }
  for (const r of (gamesRes.data ?? []) as Array<{ team_id: string | null; created_at: string | null }>) {
    if (!r.team_id) continue;
    bumpActivity(teams.get(r.team_id), r.created_at);
  }
  for (const r of (liftRes.data ?? []) as Array<{ team_id: string | null; created_at: string | null }>) {
    if (!r.team_id) continue;
    bumpActivity(teams.get(r.team_id), r.created_at);
  }
  for (const r of (teamErrorsRes.data ?? []) as Array<{ team_id: string | null; created_at: string | null; severity: string | null }>) {
    if (!r.team_id) continue;
    bumpError(teams.get(r.team_id), r.created_at, r.severity);
  }
  for (const r of (fallbackErrorsRes.data ?? []) as Array<{ user_id: string | null; created_at: string | null; severity: string | null }>) {
    if (!r.user_id) continue;
    for (const teamId of userTeamIds.get(r.user_id) ?? []) {
      bumpError(teams.get(teamId), r.created_at, r.severity);
    }
  }

  const rows: PulseTeamRow[] = Array.from(teams.values()).map((t) => {
    const buckets = Array.from(t.days.values());
    const activity30d = buckets.reduce((sum, b) => sum + b.activity, 0);
    const errors30d = buckets.reduce((sum, b) => sum + b.errors, 0);
    const criticalErrors30d = buckets.filter((b) => b.critical).length;

    let lastActivityDate: string | null = null;
    for (let i = buckets.length - 1; i >= 0; i -= 1) {
      const bucket = buckets[i];
      if (bucket && bucket.activity > 0) {
        lastActivityDate = bucket.date;
        break;
      }
    }
    const daysSinceActivity = lastActivityDate
      ? Math.floor((now.getTime() - new Date(`${lastActivityDate}T12:00:00Z`).getTime()) / 86400_000)
      : WINDOW_DAYS;
    const halo = classifyHalo(lastActivityDate ? daysSinceActivity : null);

    const half = Math.floor(buckets.length / 2);
    const earlierActivity = buckets.slice(0, half).reduce((sum, b) => sum + b.activity, 0);
    const laterActivity = buckets.slice(half).reduce((sum, b) => sum + b.activity, 0);
    const engagementDrop = Math.max(0, earlierActivity - laterActivity);

    const attentionScore =
      errors30d * 6 + criticalErrors30d * 6 + Math.min(daysSinceActivity, WINDOW_DAYS) * 2 + engagementDrop * 1.5;

    return {
      teamId: t.teamId,
      name: t.name,
      sport: t.sport,
      playerCount: t.playerCount,
      buckets,
      lastActivityDate,
      daysSinceActivity,
      halo,
      activity30d,
      errors30d,
      criticalErrors30d,
      attentionScore,
      href: `/admin/teams/${t.teamId}`,
      threadHref: `/admin/thread/team/${t.teamId}`,
    };
  });

  const sorted = [...rows].sort((a, b) => {
    switch (sort) {
      case 'last-seen': {
        if (a.lastActivityDate === b.lastActivityDate) return a.name.localeCompare(b.name);
        if (a.lastActivityDate === null) return 1;
        if (b.lastActivityDate === null) return -1;
        return b.lastActivityDate.localeCompare(a.lastActivityDate);
      }
      case 'most-active':
        return b.activity30d - a.activity30d;
      case 'most-errors':
        return b.errors30d - a.errors30d;
      case 'attention':
      default:
        return b.attentionScore - a.attentionScore;
    }
  });

  return {
    teams: sorted,
    windowDays: WINDOW_DAYS,
    sort,
    degradedNote:
      'Activity ticks combine rounds, games, lift sessions, and logins (roster/staff-resolved); errors combine team-tagged rows with user-resolved fallback. Per-feature usage detail is not reliably team-tagged in admin_events yet, so it is not shown here — see a team’s Thread for its full per-event history.',
    generatedAt,
  };
}
