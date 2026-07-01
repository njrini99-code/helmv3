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
 * Load the coach's management team using active-team/default-team resolution.
 */
export async function loadCoachTeamForManagement(
  supabase: TypedSupabaseClient,
  coachId: string,
  organizationId: string,
  cookieTeamId: string | null | undefined,
): Promise<CoachTeamManagementData | null> {
  const teamId = await resolveCoachActiveTeamId(
    supabase,
    organizationId,
    coachId,
    cookieTeamId,
  );
  if (!teamId) return null;

  type TeamRow = {
    id: string;
    name: string;
    team_type: string;
    join_code: string | null;
    organization_id: string | null;
  };

  const { data: team, error } = await supabase
    .from('baseball_teams')
    .select('id, name, team_type, join_code, organization_id')
    .eq('id', teamId)
    .maybeSingle() as { data: TeamRow | null; error: unknown };

  if (error || !team) return null;
  if (team.organization_id !== organizationId) return null;

  return {
    id: team.id,
    name: team.name,
    teamType: team.team_type,
    inviteCode: team.join_code,
    organizationId: team.organization_id,
  };
}
