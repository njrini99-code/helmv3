import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

/**
 * Baseball coach team resolution — mirrors the GolfHelm `resolve-team` helpers
 * but scoped to `baseball_*` tables and `baseball_team_coach_staff`.
 */
type TypedSupabaseClient = SupabaseClient<Database>;

export interface BaseballCoachTeamOption {
  id: string;
  name: string;
  team_type: string;
}

/**
 * Validate that `coachId` may act on `teamId`.
 *
 * Staff-strict when the coach has a staff row on the target team; otherwise any
 * team in the coach's organization is accessible (multi-team org cookie selection).
 */
export async function validateCoachTeamAccess(
  supabase: TypedSupabaseClient,
  coachId: string,
  teamId: string,
  organizationId: string | null | undefined,
): Promise<boolean> {
  const { data: staffRow } = await supabase
    .from('baseball_team_coach_staff')
    .select('id')
    .eq('coach_id', coachId)
    .eq('team_id', teamId)
    .maybeSingle();

  if (staffRow) return true;

  if (organizationId) {
    const { data: coach } = await supabase
      .from('baseball_coaches')
      .select('organization_id')
      .eq('id', coachId)
      .maybeSingle();

    if (coach?.organization_id === organizationId) {
      const { data: team } = await supabase
        .from('baseball_teams')
        .select('id')
        .eq('id', teamId)
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (team) return true;
    }
  }

  return false;
}

/**
 * Deterministically resolve a coach's team from their organization.
 *
 * Never uses `.single()` / `.maybeSingle()` on multi-row org lookups — ranks
 * teams by active member count, then `created_at` desc. Honors
 * `baseball_teams.default_team_id` when set on any org team.
 */
export async function resolveCoachTeamId(
  supabase: TypedSupabaseClient,
  organizationId: string | null | undefined,
  _coachId?: string | null,
): Promise<string | null> {
  if (!organizationId) return null;

  const { data: teams, error } = await supabase
    .from('baseball_teams')
    .select('id, created_at, default_team_id')
    .eq('organization_id', organizationId);

  if (error || !teams || teams.length === 0) return null;
  if (teams.length === 1) return teams[0]?.id ?? null;

  const programDefaultId =
    teams.find((t) => t.default_team_id)?.default_team_id ?? null;
  if (programDefaultId && teams.some((t) => t.id === programDefaultId)) {
    return programDefaultId;
  }

  const teamIds = teams.map((t) => t.id);
  const { data: members } = await supabase
    .from('baseball_team_members')
    .select('team_id')
    .in('team_id', teamIds)
    .eq('status', 'active');

  const activeCountByTeam = new Map<string, number>();
  for (const m of members ?? []) {
    if (!m.team_id) continue;
    activeCountByTeam.set(m.team_id, (activeCountByTeam.get(m.team_id) ?? 0) + 1);
  }

  const ranked = [...teams].sort((a, b) => {
    const memberDelta =
      (activeCountByTeam.get(b.id) ?? 0) - (activeCountByTeam.get(a.id) ?? 0);
    if (memberDelta !== 0) return memberDelta;
    const aCreated = a.created_at ? Date.parse(a.created_at) : 0;
    const bCreated = b.created_at ? Date.parse(b.created_at) : 0;
    return bCreated - aCreated;
  });

  return ranked[0]?.id ?? null;
}

/**
 * Cookie-aware active team resolver for baseball coaches.
 */
export async function resolveCoachActiveTeamId(
  supabase: TypedSupabaseClient,
  organizationId: string | null | undefined,
  coachId: string | null | undefined,
  cookieTeamId: string | null | undefined,
): Promise<string | null> {
  if (cookieTeamId && coachId) {
    const allowed = await validateCoachTeamAccess(
      supabase,
      coachId,
      cookieTeamId,
      organizationId,
    );
    if (allowed) return cookieTeamId;
  }

  if (coachId) {
    const { data: staffRows } = await supabase
      .from('baseball_team_coach_staff')
      .select('team_id, is_primary')
      .eq('coach_id', coachId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });
    const staffTeamId = staffRows?.[0]?.team_id;
    if (staffTeamId) return staffTeamId;
  }

  return resolveCoachTeamId(supabase, organizationId, coachId);
}

export async function getCoachTeams(
  supabase: TypedSupabaseClient,
  coachId: string | null | undefined,
  organizationId: string | null | undefined,
): Promise<BaseballCoachTeamOption[]> {
  if (!coachId) return [];

  const { data: staffRows } = await supabase
    .from('baseball_team_coach_staff')
    .select('team_id')
    .eq('coach_id', coachId);

  const staffTeamIds = [...new Set((staffRows ?? []).map((r) => r.team_id).filter(Boolean))];

  if (staffTeamIds.length > 0) {
    const { data: teams } = await supabase
      .from('baseball_teams')
      .select('id, name, team_type')
      .in('id', staffTeamIds)
      .order('name', { ascending: true });
    return (teams ?? []) as BaseballCoachTeamOption[];
  }

  if (!organizationId) return [];

  const { data: teams } = await supabase
    .from('baseball_teams')
    .select('id, name, team_type')
    .eq('organization_id', organizationId)
    .order('name', { ascending: true });

  return (teams ?? []) as BaseballCoachTeamOption[];
}

export interface CoachTeamManagementData {
  id: string;
  name: string;
  teamType: string;
  inviteCode: string | null;
  organizationId: string | null;
}



/**
 * Result of a baseball roster-containment check. Mirrors the golf
 * `RosterCheckResult` shape so the two products fail the same way.
 */
export interface BaseballRosterCheckResult {
  ok: boolean;
  reason: 'empty' | 'members' | 'not-members' | 'unavailable';
  offending?: string[];
}

const MAX_REPORTED_OFFENDERS = 5;

/**
 * Verify that every supplied player id is a member of `teamId`.
 *
 * `withBaseballAction` already resolves and enforces the TEAM (auth →
 * server-validated active context → capability). What it cannot know is
 * whether the ids inside the action's own payload belong to that team, so
 * every action taking `player_ids[]`, `attendeeIds[]` or lineup positions
 * needs this second gate. Without it a coach of team A could assign a task
 * to, or write a box-score line for, a player on team B.
 *
 * Same three rules as the golf twin in `@/lib/auth/verify-player-access`:
 * an empty list passes (callers branch on it themselves), a failed read fails
 * CLOSED and is reported as `'unavailable'` rather than as an authorization
 * denial, and membership — not lifecycle — is what is checked.
 */
export async function verifyPlayersOnBaseballTeam(
  supabase: TypedSupabaseClient,
  teamId: string,
  playerIds: readonly (string | null | undefined)[],
): Promise<BaseballRosterCheckResult> {
  const unique = [...new Set(playerIds.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return { ok: true, reason: 'empty' };
  if (!teamId) {
    return { ok: false, reason: 'not-members', offending: unique.slice(0, MAX_REPORTED_OFFENDERS) };
  }

  const { data, error } = await supabase
    .from('baseball_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .in('player_id', unique);

  // A read that failed never answered the question. Denying is correct;
  // calling it 'not-members' would be a claim the probe never established.
  if (error) return { ok: false, reason: 'unavailable' };

  const found = new Set((data ?? []).map((row) => row.player_id));
  const missing = unique.filter((id) => !found.has(id));
  if (missing.length > 0) {
    return { ok: false, reason: 'not-members', offending: missing.slice(0, MAX_REPORTED_OFFENDERS) };
  }
  return { ok: true, reason: 'members' };
}

/**
 * Throwing wrapper for use inside `withBaseballAction` bodies, where the
 * established idiom is to throw a `BaseballUnauthorizedError`-shaped error and
 * let the wrapper sanitize it (see `assertPlayerClassAccess`).
 *
 * The two messages are deliberately different: a coach whose roster read just
 * timed out must be told to retry, not told their own player is off the team.
 */
export async function assertPlayersOnBaseballTeam(
  supabase: TypedSupabaseClient,
  teamId: string,
  playerIds: readonly (string | null | undefined)[],
): Promise<void> {
  const result = await verifyPlayersOnBaseballTeam(supabase, teamId, playerIds);
  if (result.ok) return;
  if (result.reason === 'unavailable') {
    throw new Error("Couldn't confirm your roster just now. Please try again.");
  }
  throw new Error('Some selected players are not on this team.');
}
